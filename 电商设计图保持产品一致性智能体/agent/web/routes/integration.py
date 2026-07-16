"""平台对接 API（机器对机器）。

供 ShopMate 平台后端（NestJS）调用的异步任务接口：

    POST /api/v1/agent/runs          创建任务（generate_images / analyze_product /
                                     product_research / assistant_chat / listing_generation /
                                     keyword_analysis / trend_analysis / image_prompt /
                                     automation_step）
    GET  /api/v1/agent/runs/<id>     查询任务状态与结果
    GET  /api/v1/agent/health        健康检查（校验 API Key 是否有效）

鉴权：请求头 `X-Api-Key: <key>` 或 `Authorization: Bearer <key>`，
与环境变量 AGENT_API_KEY 匹配。未配置 AGENT_API_KEY 时接口整体禁用（503）。

任务通过 services.job_queue 在有界线程池中执行，状态落盘可查。
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import logging
import os
import re
import secrets
import uuid
from urllib.parse import urlparse

from flask import jsonify, request

from web.services import commerce_llm, commerce_strategy
from web.services.chat_flow import ensure_session
from web.services.supplier_image_search_client import (
    SupplierImageSearchClient,
    SupplierImageSearchError,
)
from web.services.supplier_quote_config import ImageSearchOutcome
from web.services.job_queue import IdempotencyConflictError
from web.services.trace_context import normalize_request_id, resolve_trace_context

_DATA_URL_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,", re.I)
_MAX_IMAGE_BYTES = 15 * 1024 * 1024
_MAX_SCENES = 9
_SUPPLIER_IMAGE_EVIDENCE_FIELDS = (
    "canonicalizationVersion",
    "sourceOriginalSha256",
    "sourceCanonicalSha256",
    "decodedSizeBytes",
    "payloadMimeType",
    "width",
    "height",
    "retrievalHashAlgorithm",
    "retrievalHash",
    "retrievalOnly",
)


class _SupplierImageSearchTaskError(RuntimeError):
    """Safe async failure with machine-readable diagnostics."""

    def __init__(self, code: str, outcome: ImageSearchOutcome):
        self.code = code
        self.outcome = outcome
        message = (
            "supplier image search is not configured"
            if code == "SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED"
            else "supplier image search failed"
        )
        super().__init__(message)

    def to_diagnostics(self) -> dict[str, str]:
        return {"code": self.code, "outcome": self.outcome.value}


def _generation_report_accepted(report: dict, supervision: dict) -> bool:
    """Only supervised successful generation may enter downstream workflows."""
    return (
        isinstance(report, dict)
        and report.get("status") in ("success", "partial")
        and isinstance(supervision, dict)
        and supervision.get("approved") is True
    )


def _merge_text_task_input(
    task_type: str,
    input_data: dict,
    identity_context: dict | None,
) -> dict:
    """Merge planner business context with trusted platform identity context."""
    merged = dict(input_data)
    trusted_context = dict(identity_context or {})
    if task_type == "plan_and_execute":
        raw_business_context = input_data.get("context")
        business_context = (
            dict(raw_business_context)
            if isinstance(raw_business_context, dict)
            else {}
        )
        merged["context"] = {**business_context, **trusted_context}
    else:
        merged["context"] = trusted_context
    return merged


def _configured_key() -> str:
    return os.environ.get("AGENT_API_KEY", "").strip()


def _request_key() -> str:
    header = request.headers.get("X-Api-Key", "").strip()
    if header:
        return header
    auth = request.headers.get("Authorization", "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _stable_json_sha256(value: object) -> str:
    digest = hashlib.sha256()
    encoder = json.JSONEncoder(
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    for chunk in encoder.iterencode(value):
        digest.update(chunk.encode("utf-8"))
    return digest.hexdigest()


_EMPTY_WORKSPACE_SCOPE = "workspace:empty"


def _normalized_workspace_scope(value: object) -> str:
    workspace_id = str(value or "").strip()
    if not workspace_id:
        return _EMPTY_WORKSPACE_SCOPE
    return f"workspace:id:{workspace_id}"


def _scoped_idempotency_key(
    org_id: str,
    workspace_id: object,
    task_type: str,
    request_id: str,
) -> str:
    scope_sha256 = _stable_json_sha256(
        {
            "orgId": org_id,
            "requestId": request_id,
            "taskType": task_type,
            "workspaceId": _normalized_workspace_scope(workspace_id),
        }
    )
    return f"agent-run-idempotency/v3:{scope_sha256}"


def _validated_supplier_source_url(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("supplier imageUrl must be an HTTPS URL")
    candidate = value.strip()
    if not candidate or len(candidate) > 4096:
        raise ValueError("supplier imageUrl must be an HTTPS URL")
    try:
        parsed = urlparse(candidate)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("supplier imageUrl must be an HTTPS URL") from exc
    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port is not None
        and not (1 <= port <= 65535)
    ):
        raise ValueError("supplier imageUrl must be an HTTPS URL")
    return candidate


def _auth_error():
    configured = _configured_key()
    if not configured:
        return jsonify({"error": "平台对接未启用：请在 agent/.env 配置 AGENT_API_KEY"}), 503
    supplied = _request_key()
    if not supplied or not secrets.compare_digest(supplied, configured):
        return jsonify({"error": "API Key 无效"}), 401
    return None


def _decode_image(
    input_data: dict,
    dest_dir: str,
    *,
    require_https: bool = False,
) -> str:
    """把 imageBase64 / imageUrl 落成本地文件，返回路径。失败抛 ValueError。"""
    os.makedirs(dest_dir, exist_ok=True)

    image_b64 = str(input_data.get("imageBase64", "") or "")
    if image_b64:
        ext = ".jpg"
        m = _DATA_URL_RE.match(image_b64)
        if m:
            ext = ".png" if m.group(1).lower() == "png" else ".jpg"
            image_b64 = image_b64[m.end():]
        try:
            raw = base64.b64decode(image_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError(f"imageBase64 解码失败: {exc}") from exc
        if len(raw) > _MAX_IMAGE_BYTES:
            raise ValueError("图片过大（>15MB）")
        if len(raw) < 512:
            raise ValueError("imageBase64 内容不是有效图片")
        path = os.path.join(dest_dir, f"platform_{uuid.uuid4().hex[:8]}{ext}")
        with open(path, "wb") as f:
            f.write(raw)
        return path

    image_url = str(input_data.get("imageUrl", "") or "").strip()
    if image_url:
        from common.fetch_url import fetch_product_image

        if require_https:
            image_url = _validated_supplier_source_url(
                input_data.get("imageUrl")
            )
            result = fetch_product_image(
                image_url,
                dest_dir,
                require_https=True,
            )
        else:
            result = fetch_product_image(image_url, dest_dir)
        if not result.get("success"):
            raise ValueError(f"imageUrl 抓取失败: {result.get('error', '未知错误')}")
        return result["local_path"]

    raise ValueError("input 缺少 imageBase64 或 imageUrl")


def _ensure_explicit_input_profile(engine, input_data: dict, image_path: str) -> bool:
    """Persist a minimal, source-labelled profile from explicit platform facts.

    This is not visual analysis. It only prevents an unavailable text/vision model
    from blocking a real image provider when the platform supplied a product name.
    """
    if engine.context.get("profile") and engine.context.get("profile_path"):
        return False
    product_name = str(input_data.get("productName", "") or "").strip()
    if not product_name:
        return False

    profile = {
        "product_name": product_name,
        "product_name_cn": product_name,
        "category": "general",
        "description": product_name,
        "reference_image": os.path.basename(image_path),
        "evidence": {
            "source": "explicit_input",
            "analysisStatus": "degraded",
            "reasonCode": "VISUAL_ANALYSIS_PROVIDER_UNAVAILABLE",
        },
    }
    profile_path = os.path.join(
        engine.context["output_dir"], "product_profile_explicit_input.json"
    )
    with open(profile_path, "w", encoding="utf-8") as profile_file:
        json.dump(profile, profile_file, ensure_ascii=False, indent=2)
    engine.blackboard.update(
        {
            "profile": profile,
            "profile_path": profile_path,
            "product_name": product_name,
        },
        agent_id=engine.observer.agent_id,
    )
    engine.blackboard.save()
    engine._sync_observer_from_blackboard()
    return True


def register_integration_routes(
    app,
    sessions: dict,
    output_dir: str,
    sessions_dir: str,
    dual_agent_engine_cls,
    job_queue,
    get_image_api_key,
    resolve_image_engine,
    autonomy_runtime=None,
):
    def _mock_mode() -> bool:
        forced = os.environ.get("COMMERCE_AGENT_MOCK", "").strip() in ("1", "true", "on")
        has_key = bool(get_image_api_key(resolve_image_engine(None)))
        return forced or not has_key

    def _scene_urls(sid: str, scenes: list[dict] | None = None) -> list[dict]:
        """扫描会话 raw/ 目录，把已生成图转成带 URL 的结果列表。"""
        import hashlib
        import mimetypes
        from PIL import Image

        from web.services import image_store

        found = image_store.scan_raw_scene_files(sid, sessions, sessions_dir, output_dir)
        scene_map = {
            str(scene.get("scene_id") or scene.get("sceneId") or ""): scene
            for scene in (scenes or [])
            if isinstance(scene, dict)
        }
        images = []
        session_dir = image_store.session_output_dir(sid, sessions, sessions_dir, output_dir)
        for scene_id, rel in sorted(found.items()):
            scene = scene_map.get(scene_id, {})
            image_path = image_store.find_image_path(session_dir, rel)
            if not image_path:
                continue
            with open(image_path, "rb") as image_file:
                image_bytes = image_file.read()
            with Image.open(image_path) as image:
                width, height = image.size
                detected_format = str(image.format or "").lower()
            mime_type = mimetypes.guess_type(image_path)[0] or (
                f"image/{detected_format}" if detected_format else "application/octet-stream"
            )
            images.append({
                "sceneId": scene_id,
                "filename": rel,
                "url": f"/api/image/{sid}/{rel}",
                "background": str(
                    scene.get("background")
                    or scene.get("setting")
                    or scene.get("scene_name")
                    or ""
                ),
                "props": scene.get("props") if isinstance(scene.get("props"), list) else [],
                "lighting": str(scene.get("lighting") or ""),
                "emotion": str(scene.get("emotion") or scene.get("purpose") or ""),
                "composition": str(
                    scene.get("composition")
                    or scene.get("camera")
                    or scene.get("prompt")
                    or ""
                )[:240],
                "prompt": str(scene.get("prompt") or ""),
                "width": width,
                "height": height,
                "mimeType": mime_type,
                "sha256": hashlib.sha256(image_bytes).hexdigest(),
                "byteSize": len(image_bytes),
            })
        return images

    def _build_plan_scenes(engine, message: str, count: int) -> list[dict]:
        """解析需求 → 套图规划 → 执行引擎场景格式。"""
        from web.routes.commerce import _scene_from_image

        parsed = commerce_strategy.parse_request(message)
        if count:
            parsed["imageCount"] = max(1, min(int(count), _MAX_SCENES))
            parsed["countSource"] = "explicit"
        plan = commerce_strategy.build_plan(parsed)
        profile = engine.context.get("profile") or {}
        if profile and not _mock_mode():
            try:
                commerce_llm.enrich_plan_with_llm(plan, parsed, profile)
            except Exception:  # noqa: BLE001 — LLM 增强失败回退模板规划
                pass
        images = plan.get("images", [])[:parsed["imageCount"]]
        return [_scene_from_image(i) for i in images if i.get("prompt")]

    # ── 任务执行体 ──

    def _run_generate(job_id: str, payload: dict, progress) -> dict:
        sid = payload["session_id"]
        input_data = payload["input"]
        engine = ensure_session(sessions, sid, dual_agent_engine_cls, output_dir, sessions_dir)

        progress("import", "导入产品图")
        originals = os.path.join(engine.context["output_dir"], "originals")
        image_path = _decode_image(input_data, originals)
        engine.add_images([image_path])

        count = int(input_data.get("sceneCount", 5) or 5)
        message = str(input_data.get("message", "") or "").strip() or f"生成 {count} 张上架套图"
        platforms = input_data.get("platforms")
        if isinstance(platforms, list) and platforms:
            engine.observer.state.setdefault("user_preferences", {})["platforms"] = platforms

        mock = _mock_mode()

        if not mock:
            # 真实模式先跑产品分析（写入 profile / scene_plan，供 LLM 定制提示词）
            progress("analyze", "分析产品特征")
            try:
                engine.process_user_message("分析这个产品，输出产品档案", has_images=True)
            except Exception:  # noqa: BLE001 — 分析失败回退模板规划，不阻断生成
                pass
            if _ensure_explicit_input_profile(engine, input_data, image_path):
                progress(
                    "analyze_fallback",
                    "视觉分析供应商不可用，已使用平台明确商品信息继续真实出图",
                )

        progress("plan", "规划上架套图")
        scenes = _build_plan_scenes(engine, message, count)
        if not scenes:
            raise ValueError("套图规划为空，请检查输入")

        report_data = {}
        if mock:
            # 无生图 Key：占位模式——复制原图充当每个场景，保证平台联调闭环
            progress("generate", f"占位生成 {len(scenes)} 张（未配置生图 API Key）")
            import shutil

            raw_dir = os.path.join(engine.context["output_dir"], "raw")
            os.makedirs(raw_dir, exist_ok=True)
            ext = os.path.splitext(image_path)[1] or ".jpg"
            for scene in scenes:
                shutil.copy2(image_path, os.path.join(raw_dir, f"{scene['scene_id']}{ext}"))
        else:
            progress("generate", f"真实生成 {len(scenes)} 张")
            intent = {
                "intent": "confirm_generate",
                "dispatch_intent": "confirm_generate",
                "target_agent": "executor",
                "needs_clarification": False,
                "task_plan": [],
                "extracted": {
                    "selected_scenes": scenes,
                    "generation_count": len(scenes),
                },
            }
            engine.apply_options_from_intent(intent)
            task = engine.step_observer_dispatch(intent)
            if not task:
                raise RuntimeError("任务派发失败（Observer 未生成任务）")

            def cb(agent, stage, msg, **_extra):
                progress(stage or "generate", f"[{agent}] {msg}")

            report = engine.step_executor_execute(task, cb)
            if not report:
                raise RuntimeError("执行者返回空报告")
            supervision = engine.step_observer_supervise(report)
            engine._sync_execution_results(report)
            report_data = report.get("data", {}) if isinstance(report.get("data"), dict) else {}
            if not _generation_report_accepted(report, supervision):
                raise RuntimeError(
                    report.get("error")
                    or supervision.get("feedback")
                    or "生成失败（监督未通过）"
                )

        images = _scene_urls(sid, scenes)
        if not images:
            raise RuntimeError("生成结束但未找到任何图片")
        bb = engine.blackboard
        profile = engine.context.get("profile") or {}
        if isinstance(profile, dict):
            profile = {**profile, "scenePlan": scenes}
        else:
            profile = {"scenePlan": scenes}
        return {
            "sessionId": sid,
            "mockMode": mock,
            "supervisionApproved": not mock,
            "publishable": not mock,
            "images": images,
            "consistencyScore": getattr(bb, "consistency_score", None),
            "consistencyPassed": report_data.get("consistency_passed"),
            "compliancePassed": report_data.get("compliance_passed"),
            "externalConsistencyStatus": report_data.get("external_consistency_status"),
            "externalConsistencyScore": report_data.get("external_consistency_score"),
            "externalConsistencyIssues": report_data.get("external_consistency_issues", []),
            "profile": profile,
            "scenePlan": scenes,
            "downloadUrl": f"/api/download/{sid}",
        }

    def _run_analyze(job_id: str, payload: dict, progress) -> dict:
        sid = payload["session_id"]
        input_data = payload["input"]
        engine = ensure_session(sessions, sid, dual_agent_engine_cls, output_dir, sessions_dir)

        progress("import", "导入产品图")
        originals = os.path.join(engine.context["output_dir"], "originals")
        image_path = _decode_image(input_data, originals)
        engine.add_images([image_path])

        progress("analyze", "分析产品特征")
        engine.process_user_message("分析这个产品，输出产品档案", has_images=True)

        return {
            "sessionId": sid,
            "profile": engine.context.get("profile") or {},
            "scenePlan": engine.context.get("scene_plan") or [],
        }

    def _run_supplier_image_search(job_id: str, payload: dict, progress) -> dict:
        sid = payload["session_id"]
        input_data = payload["input"]
        config = app.config.get("SUPPLIER_QUOTE_CONFIG")
        try:
            image_configured = bool(
                config and config.public_status().get("imageSearchConfigured")
            )
        except Exception:  # noqa: BLE001 - config failure must remain secret-safe
            image_configured = False
        if not image_configured:
            raise _SupplierImageSearchTaskError(
                "SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED",
                ImageSearchOutcome.PROVIDER_ERROR,
            )

        progress("import", "preparing supplier image search source")
        supplier_root = os.path.join(output_dir, sid, "supplier_image_search")
        originals = os.path.join(supplier_root, "originals")
        source_input = dict(input_data)
        if str(source_input.get("imageUrl") or "").strip():
            source_input.pop("imageBase64", None)
        try:
            image_path = _decode_image(
                source_input,
                originals,
                require_https=True,
            )
        except Exception:  # noqa: BLE001 - fetched errors are untrusted
            raise _SupplierImageSearchTaskError(
                "SUPPLIER_IMAGE_SEARCH_FAILED",
                ImageSearchOutcome.UNSUPPORTED,
            ) from None

        progress("search", "searching documented 1688 image endpoint")
        try:
            execution = SupplierImageSearchClient(config).search_file(
                image_path,
                os.path.join(supplier_root, "canonical"),
                request_id=str((payload.get("context") or {}).get("requestId") or ""),
                image_keywords=input_data.get("imageKeywords"),
            )
        except SupplierImageSearchError as exc:
            raise _SupplierImageSearchTaskError(
                "SUPPLIER_IMAGE_SEARCH_FAILED",
                exc.outcome,
            ) from None
        except Exception:  # noqa: BLE001 - never persist upstream body or secret
            raise _SupplierImageSearchTaskError(
                "SUPPLIER_IMAGE_SEARCH_FAILED",
                ImageSearchOutcome.PROVIDER_ERROR,
            ) from None

        offers = [
            {
                "offerId": offer.offer_id,
                "subject": offer.subject,
                "detailUrl": offer.detail_url,
                "imageUrl": offer.image_url,
                "distributionFreePostage": offer.distribution_free_postage,
                "displayPriceEvidence": offer.display_price_evidence,
            }
            for offer in execution.result.offers
        ]
        evidence = {
            key: execution.image_evidence[key]
            for key in _SUPPLIER_IMAGE_EVIDENCE_FIELDS
            if key in execution.image_evidence
        }
        provenance = execution.result.provenance
        return {
            "outcome": execution.result.outcome.value,
            "providerResultCount": execution.result.provider_result_count,
            "offers": offers,
            "imageEvidence": evidence,
            "provenance": {
                "adapterVersion": provenance.adapter_version,
                "provider": provenance.provider,
                "requestId": provenance.request_id,
                "fetchedAt": provenance.fetched_at,
                "rawSnapshotSha256": provenance.raw_snapshot_sha256,
            },
        }

    def _make_text_runner(task_type: str):
        def _run_text(job_id: str, payload: dict, progress) -> dict:
            from web.services import platform_tasks

            result = platform_tasks.run_text_task(
                task_type,
                _merge_text_task_input(
                    task_type,
                    payload["input"],
                    payload.get("context") or {},
                ),
                progress,
            )
            result.setdefault("sessionId", payload["session_id"])
            return result

        return _run_text

    def _run_assistant_chat(job_id: str, payload: dict, progress) -> dict:
        """Route platform chat through the product agent's Observer/Executor core."""
        sid = payload["session_id"]
        input_data = payload["input"]
        prompt = str(input_data.get("prompt", "") or "").strip()
        if not prompt:
            raise ValueError("assistant_chat 需要 input.prompt")

        engine = ensure_session(sessions, sid, dual_agent_engine_cls, output_dir, sessions_dir)
        if input_data.get("workspaceId"):
            engine.observer.state["workspace_id"] = str(input_data.get("workspaceId"))
        if input_data.get("assistantId"):
            engine.observer.state["assistant_id"] = str(input_data.get("assistantId"))
        if input_data.get("threadId"):
            engine.observer.state["thread_id"] = str(input_data.get("threadId"))

        def cb(agent, stage, msg, **_extra):
            progress(stage or agent or "agent", str(msg or ""))

        progress("agent", "正在调用双智能体核心")
        result = engine.process_user_message(prompt, has_images=False, progress_callback=cb)
        return {
            "sessionId": sid,
            "response": str(result.get("final_reply") or result.get("observer_first_reply") or ""),
            "intent": result.get("intent"),
            "task": result.get("task"),
            "proactiveQuestions": result.get("proactive_questions") or [],
            "quickReplies": result.get("quick_replies") or [],
            "mockMode": False,
            "agentCore": "DualAgentEngine",
        }

    from web.services.platform_tasks import supported_text_tasks

    _RUNNERS = {
        "generate_images": _run_generate,
        "analyze_product": _run_analyze,
        "supplier_image_search": _run_supplier_image_search,
    }
    for _text_task in supported_text_tasks():
        if _text_task == "assistant_chat":
            _RUNNERS[_text_task] = _run_assistant_chat
            continue
        _RUNNERS[_text_task] = _make_text_runner(_text_task)

    # 只有图像类任务必须携带产品图；文本类任务不需要
    _IMAGE_TASKS = {
        "generate_images",
        "analyze_product",
        "supplier_image_search",
    }

    # ── 路由 ──

    @app.route("/api/v1/agent/health")
    def api_integration_health():
        err = _auth_error()
        if err:
            return err
        from web.services.llm_runtime import probe_if_stale

        return jsonify({"status": "ok", "integration": "enabled",
                        "mockMode": _mock_mode(),
                        "llm": probe_if_stale(),
                        "autonomy": autonomy_runtime.status() if autonomy_runtime else None})

    @app.route("/api/v1/agent/autonomy/status")
    def api_autonomy_status():
        err = _auth_error()
        if err:
            return err
        if autonomy_runtime is None:
            return jsonify({"error": "autonomy runtime unavailable"}), 503
        return jsonify(autonomy_runtime.status())

    @app.route("/api/v1/agent/autonomy/scan", methods=["POST"])
    def api_autonomy_scan():
        err = _auth_error()
        if err:
            return err
        if autonomy_runtime is None:
            return jsonify({"error": "autonomy runtime unavailable"}), 503
        return jsonify(autonomy_runtime.run_once())

    @app.route("/api/v1/agent/runs", methods=["POST"])
    def api_integration_create_run():
        err = _auth_error()
        if err:
            return err
        body = request.get_json(silent=True) or {}
        task_type = str(body.get("taskType", "") or "").strip()
        input_data = body.get("input")
        # 身份上下文（阶段4）：orgId/userId/workspaceId/requestId/agentRunId
        context = (
            dict(body.get("context"))
            if isinstance(body.get("context"), dict)
            else {}
        )
        header_request_id = request.headers.get("X-Request-Id")
        context_has_request_id = "requestId" in context
        context_request_id = (
            normalize_request_id(context.get("requestId"))
            if context_has_request_id
            else None
        )
        if context_has_request_id and context_request_id is None:
            return jsonify({
                "error": "context.requestId is invalid",
                "code": "INVALID_REQUEST_ID",
            }), 400
        header_request_id_normalized = (
            normalize_request_id(header_request_id)
            if header_request_id is not None
            else None
        )
        if header_request_id is not None and header_request_id_normalized is None:
            return jsonify({
                "error": "X-Request-Id is invalid",
                "code": "INVALID_REQUEST_ID",
            }), 400
        request_id = (
            header_request_id_normalized
            or context_request_id
            or uuid.uuid4().hex
        )

        header_traceparent = request.headers.get("traceparent")
        header_trace_id = request.headers.get("X-Trace-Id")
        trace_context = resolve_trace_context(
            header_traceparent
            if header_traceparent is not None
            else context.get("traceparent"),
            header_trace_id if header_trace_id is not None else context.get("traceId"),
        )
        context.update(trace_context)
        context["requestId"] = request_id

        app.logger.info(
            "Agent run created: taskType=%s orgId=%s userId=%s requestId=%s traceId=%s locale=%s",
            task_type,
            context.get("orgId", "?"),
            context.get("userId", "?"),
            context.get("requestId", "?"),
            context.get("traceId", "?"),
            context.get("locale", "?"),
        )

        if task_type not in _RUNNERS:
            return jsonify({
                "error": f"不支持的 taskType: {task_type}",
                "supported": sorted(_RUNNERS),
            }), 400
        if not isinstance(input_data, dict):
            return jsonify({"error": "缺少 input 对象"}), 400
        if (task_type in _IMAGE_TASKS
                and not input_data.get("imageBase64")
                and not input_data.get("imageUrl")):
            return jsonify({"error": "input 需要 imageBase64 或 imageUrl"}), 400

        if task_type == "supplier_image_search":
            supplier_url = input_data.get("imageUrl")
            if isinstance(supplier_url, str) and supplier_url.strip():
                try:
                    validated_url = _validated_supplier_source_url(supplier_url)
                except ValueError:
                    return jsonify({
                        "error": "supplier imageUrl must be an HTTPS URL",
                        "code": "INVALID_SUPPLIER_IMAGE_URL",
                    }), 400
                input_data = dict(input_data)
                input_data["imageUrl"] = validated_url
                input_data.pop("imageBase64", None)
            elif supplier_url:
                return jsonify({
                    "error": "supplier imageUrl must be an HTTPS URL",
                    "code": "INVALID_SUPPLIER_IMAGE_URL",
                }), 400

        try:
            input_sha256 = _stable_json_sha256(input_data)
        except (TypeError, ValueError):
            return jsonify({
                "error": "input contains unsupported JSON values",
                "code": "INVALID_INPUT",
            }), 400

        # 会话按组织隔离（阶段4）：同 org 的任务共享命名空间，跨 org 不可见
        raw_org_id = str(context.get("orgId", "") or "").strip()
        org_prefix = (
            f"org-{hashlib.sha256(raw_org_id.encode('utf-8')).hexdigest()[:12]}"
            if raw_org_id else ""
        )
        session_id = f"{org_prefix}-{uuid.uuid4()}" if org_prefix else str(uuid.uuid4())
        idempotency_key = _scoped_idempotency_key(
            raw_org_id,
            context.get("workspaceId"),
            task_type,
            request_id,
        )
        try:
            job = job_queue.submit(
                task_type,
                {
                    "session_id": session_id,
                    "input": input_data,
                    "input_sha256": input_sha256,
                    "context": context,
                },
                _RUNNERS[task_type],
                idempotency_key=idempotency_key,
            )
        except IdempotencyConflictError:
            return jsonify({
                "error": "requestId was already used with different input",
                "code": "AGENT_IDEMPOTENCY_CONFLICT",
            }), 409
        except OSError as exc:
            app.logger.exception("Agent job store is unavailable")
            return jsonify({
                "error": "智能体任务存储不可用，未创建任务。",
                "code": "AGENT_JOB_STORE_UNAVAILABLE",
                "details": str(exc),
            }), 503
        response = jsonify({
            "runId": job["job_id"],
            "sessionId": str(job.get("session_id") or session_id),
            "status": job["status"],
            "traceId": context["traceId"],
        })
        response.status_code = 202
        response.headers["X-Request-Id"] = context["requestId"]
        response.headers["X-Trace-Id"] = context["traceId"]
        response.headers["traceparent"] = context["traceparent"]
        return response

    @app.route("/api/v1/agent/runs/<run_id>")
    def api_integration_get_run(run_id):
        err = _auth_error()
        if err:
            return err
        job = job_queue.get(run_id)
        if not job:
            return jsonify({"error": "任务不存在"}), 404
        return jsonify({
            "runId": job["job_id"],
            "taskType": job["task_type"],
            "status": job["status"],
            "progress": job.get("progress") or {},
            "result": job.get("result"),
            "error": job.get("error", ""),
            "diagnostics": job.get("diagnostics"),
            "context": job.get("context") or {},
        })
