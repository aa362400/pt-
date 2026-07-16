"""跨境电商 AI 出图 Agent — /api/commerce-agent/* 接口。

parse      解析一句自然语言需求（平台/数量/人群/礼物场景/图型/风险提示）
plan       生成上架套图规划（策略 + 每张图的用途与英文提示词）
generate   派发图片生成任务（有生图 Key + 产品图时走真实引擎，否则 mock 占位图）
tasks      查询生成状态（逐张图状态 + 图片 URL）
regenerate 只重做某一张图（可带自然语言修改指令）
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time

from flask import jsonify, request

from web.services import commerce_llm, commerce_strategy
from web.services.chat_flow import add_session_event, ensure_session


def _scene_from_image(img: dict) -> dict:
    """把 plan 接口的 image 定义转换成执行引擎的场景格式。"""
    scene_id = img.get("scene_id") or img.get("sceneId") or img.get("id", "")
    scene = {
        "scene_id": scene_id,
        "scene_name": img.get("title", ""),
        "scene_name_cn": img.get("title", ""),
        "emotion": img.get("purpose", ""),
        "purpose": img.get("purpose", ""),
        "ecommerce_use": img.get("titleEn") or img.get("title", ""),
        "prompt": img.get("prompt", ""),
        "negative_prompt": img.get("negativePrompt") or img.get("negative_prompt", ""),
        "style": img.get("style", ""),
        "lighting": img.get("lighting", ""),
        "aspect_ratio": img.get("ratio") or img.get("aspect_ratio", "1:1"),
    }
    # 主图是点击率生命线：一次生成多张候选，语义 QA 自动选产品最像的一张
    try:
        best_of = int(os.getenv("BEST_OF_HERO", "2") or 2)
    except ValueError:
        best_of = 2
    if best_of > 1 and "hero" in scene_id.lower():
        scene["candidates"] = min(best_of, 3)
    return scene


def _image_payload(sid: str, scene: dict, state: dict) -> dict:
    filename = state.get("filename", "")
    return {
        "id": scene.get("id") or scene.get("scene_id", ""),
        "sceneId": scene.get("scene_id", ""),
        "title": scene.get("title") or scene.get("scene_name_cn", ""),
        "purpose": scene.get("purpose", ""),
        "status": state.get("status", "pending"),
        "url": f"/api/image/{sid}/{filename}" if filename else "",
    }


def register_commerce_routes(
    app,
    sessions: dict,
    tasks,
    output_dir: str,
    sessions_dir: str,
    dual_agent_engine_cls,
    merge_scenes_with_disk,
    issue_csrf_token,
    validate_csrf,
    get_image_api_key,
    resolve_image_engine,
    append_chat_message,
    load_session_record,
    save_session_record,
):
    # 每会话最近一次套图计划（内存缓存；服务重启后从会话记录恢复）
    last_plans: dict[str, list] = {}

    def _plan_for(sid: str) -> list:
        plan = last_plans.get(sid)
        if plan:
            return plan
        plan = load_session_record(sid).get("listing_plan") or []
        if plan:
            last_plans[sid] = plan
        return plan

    def _persist_plan(sid: str, images: list, strategy=None):
        last_plans[sid] = [dict(i) for i in images]
        record = load_session_record(sid)
        record["listing_plan"] = last_plans[sid]
        if isinstance(strategy, dict):
            record["commerce_strategy"] = strategy
        save_session_record(sid, record)

    def _persist_thumb(sid: str, scene_states: list):
        """记录第一张已完成图作为会话缩略图（历史栏展示）。"""
        first = next(
            (s for s in scene_states if s.get("status") == "done" and s.get("filename")),
            None)
        if not first:
            return
        record = load_session_record(sid)
        record["thumb"] = f"/api/image/{sid}/{first['filename']}"
        save_session_record(sid, record)

    def _json(field: str, default=None):
        body = request.get_json(silent=True) or {}
        return body.get(field, default)

    def _session_out_dir(sid: str) -> str:
        engine = sessions.get(sid)
        return (engine.context.get("output_dir", "") if engine
                else os.path.join(output_dir, sid))

    def _find_source_image(sid: str, image_id: str):
        """按 imageId（plan 的 img_N 或磁盘 scene_id）定位生成图的磁盘路径。"""
        from web.services import image_store

        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")

        stems = [image_id]
        plan_entry = next(
            (p for p in _plan_for(sid)
             if image_id in (p.get("id"), p.get("scene_id"))), None)
        if plan_entry and plan_entry.get("scene_id"):
            stems.insert(0, plan_entry["scene_id"])

        for cand_dir in (raw_dir, os.path.join(out_dir, "layout"), out_dir):
            if not os.path.isdir(cand_dir):
                continue
            for stem in stems:
                for ext in (".jpg", ".jpeg", ".png", ".webp"):
                    cand = os.path.join(cand_dir, stem + ext)
                    if os.path.exists(cand):
                        return cand, out_dir
        safe = image_store.safe_image_subpath(image_id)
        if safe:
            found = image_store.find_image_path(out_dir, safe)
            if found:
                return found, out_dir
        return None, out_dir

    def _mock_available() -> bool:
        forced = os.environ.get("COMMERCE_AGENT_MOCK", "").strip() in ("1", "true", "on")
        has_key = bool(get_image_api_key(resolve_image_engine(None)))
        return forced or not has_key

    # ── 1. 解析自然语言需求 ──
    @app.route("/api/commerce-agent/parse", methods=["POST"])
    def api_commerce_parse():
        message = str(_json("message", "") or "").strip()
        if not message:
            return jsonify({"error": "message 不能为空"}), 400
        sid = str(_json("sessionId", "") or "").strip()
        product_hint = ""
        engine = sessions.get(sid)
        if engine:
            profile = engine.context.get("profile") or {}
            product_hint = profile.get("product_name_cn") or profile.get("product_name", "")
        return jsonify(commerce_strategy.parse_request(message, product_hint))

    # ── 2. 生成上架套图规划（LLM 按真实产品定制，模板引擎兜底）──
    @app.route("/api/commerce-agent/plan", methods=["POST"])
    def api_commerce_plan():
        parsed = _json("parsed")
        if not isinstance(parsed, dict):
            message = str(_json("message", "") or "").strip()
            if not message:
                return jsonify({"error": "需要 message 或 parsed 字段"}), 400
            parsed = commerce_strategy.parse_request(message)
        plan = commerce_strategy.build_plan(parsed)

        # 有产品档案时用 LLM 逐张定制提示词；失败静默回退模板规划
        sid = str(_json("sessionId", "") or "").strip()
        engine = sessions.get(sid) if sid else None
        profile = (engine.context.get("profile") or {}) if engine else {}
        plan["strategy"]["llmPlanned"] = False
        if profile:
            commerce_llm.enrich_plan_with_llm(
                plan, parsed, profile,
                preferences=_feedback_preferences(sid) if sid else {},
                think_mode=bool(_json("thinkMode", False)))

        plan["parsed"] = parsed

        # 风险体检（规则层，零延迟）：侵权词/敏感词/物流风险随规划一起给
        try:
            from web.services import risk_check
            plan["riskReport"] = risk_check.check_listing(
                title=str(parsed.get("productType", "") or ""),
                description=str(_json("message", "") or ""),
                profile=profile, use_llm=False)
        except Exception:  # noqa: BLE001 — 风险体检失败不阻断规划
            pass
        return jsonify(plan)

    # ── 3. 派发生成任务 ──
    @app.route("/api/commerce-agent/generate", methods=["POST"])
    def api_commerce_generate():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        sid = str(_json("sessionId", "") or "").strip()
        images = _json("images") or []
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        scenes = [_scene_from_image(i) for i in images if isinstance(i, dict) and i.get("prompt")]
        scenes = scenes[:9]
        if not scenes:
            return jsonify({"error": "images 为空或缺少 prompt"}), 400

        engine = ensure_session(sessions, sid, dual_agent_engine_cls, output_dir, sessions_dir)
        _persist_plan(sid, images, _json("strategy"))
        user_message = str(_json("message", "") or "").strip()
        if user_message:
            append_chat_message(sid, "user", user_message, {"commerce": True})

        if tasks.results.get(sid, {}).get("status") == "running":
            return jsonify({"error": "上一个任务还在进行中，请稍候",
                            "taskId": sid, "status": "processing",
                            "csrf_token": issue_csrf_token()}), 409

        quality = str(_json("quality", "") or "").strip()
        if quality in ("premium", "standard", "draft"):
            engine.observer.state.setdefault("user_preferences", {})["quality"] = quality

        has_product = bool(engine.context.get("image_paths"))
        use_mock = _mock_available() or not has_product

        tasks.clear_cancel(sid)
        tasks.progress[sid] = {
            "stage": "starting",
            "message": "任务已派发，正在逐张生成…",
            "task_type": "generate",
            "scenes": [{"scene_id": s["scene_id"], "scene_name": s["scene_name"],
                        "status": "pending"} for s in scenes],
            "total": len(scenes),
            "completed": 0,
        }
        tasks.results[sid] = {"status": "running"}

        # 事务安全层：生成属 medium 风险，自动执行 + 完整日志
        try:
            from web.services import safety
            safety.log_action("generate_images",
                              {"count": len(scenes), "mock": use_mock}, sid=sid)
        except Exception:  # noqa: BLE001 — 日志失败不阻断生成
            pass

        if use_mock:
            thread = threading.Thread(
                target=_run_mock_generation, args=(engine, sid, scenes), daemon=True)
        else:
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
                tasks.results[sid] = {"status": "error", "error": "任务派发失败"}
                return jsonify({"error": "任务派发失败", "csrf_token": issue_csrf_token()}), 500
            add_session_event(engine, engine.observer.agent_id, "commerce_generate", {
                "sid": sid, "count": len(scenes), "task_id": task.get("task_id"),
            })
            thread = threading.Thread(
                target=_run_real_generation, args=(engine, task, sid, scenes), daemon=True)
        thread.start()

        return jsonify({
            "taskId": sid,
            "status": "processing",
            "mockMode": use_mock,
            "images": [],
            "csrf_token": issue_csrf_token(),
        })

    # ── 4. 查询生成状态 ──
    def _task_payload(sid: str, with_csrf: bool = True) -> dict:
        result = tasks.results.get(sid, {})
        progress = tasks.progress.get(sid, {})
        plan_images = _plan_for(sid)
        identity_scores = (load_session_record(sid).get("identity_scores") or {})

        def _states(source_scenes):
            merged = merge_scenes_with_disk(sid, source_scenes or [])
            out = []
            for st in merged:
                plan_img = next(
                    (p for p in plan_images
                     if (p.get("scene_id") or p.get("id")) == st.get("scene_id")), {})
                payload = _image_payload(sid, {**plan_img,
                                               "scene_id": st.get("scene_id", ""),
                                               "scene_name_cn": st.get("scene_name", "")}, st)
                stem = os.path.splitext(os.path.basename(
                    st.get("filename", "")))[0] or st.get("scene_id", "")
                score = identity_scores.get(stem) or identity_scores.get(
                    st.get("scene_id", ""))
                if score is not None:
                    payload["identityScore"] = score
                out.append(payload)
            return out

        status = result.get("status", "")
        if status in ("completed", "supervision_failed", "cancelled", "mock_preview"):
            scenes = result.get("scenes") or progress.get("scenes") or []
            mock_mode = status == "mock_preview" or bool(result.get("mock"))
            supervision_approved = (
                result.get("supervision_approved") is True and not mock_mode
            )
            payload = {
                "taskId": sid,
                "status": status,
                "message": result.get("final_reply", ""),
                "images": _states(scenes),
                "downloadUrl": result.get("download_url", ""),
                "mockMode": mock_mode,
                "supervisionApproved": supervision_approved,
                "publishable": (
                    status == "completed"
                    and supervision_approved
                    and not mock_mode
                ),
            }
            if result.get("elapsed") is not None:
                payload["elapsed"] = result["elapsed"]
            if with_csrf:
                payload["csrf_token"] = issue_csrf_token()
            return payload
        if status == "error":
            return {
                "taskId": sid,
                "status": "failed",
                "error": result.get("error", "未知错误"),
                "images": _states(progress.get("scenes") or []),
            }
        if status == "running":
            return {
                "taskId": sid,
                "status": "processing",
                "message": progress.get("message", "正在逐张生成图片…"),
                "stage": progress.get("stage", "generate"),
                "images": _states(progress.get("scenes") or []),
            }
        # 无进行中任务：按持久化计划 + 磁盘文件恢复图片状态（服务重启后仍可查）
        idle_states = _states([
            {"scene_id": p.get("scene_id") or p.get("id", ""),
             "scene_name": p.get("title", ""), "status": "pending"}
            for p in plan_images
        ]) if plan_images else []
        return {"taskId": sid, "status": "idle", "images": idle_states}

    @app.route("/api/commerce-agent/tasks/<task_id>")
    def api_commerce_task(task_id):
        return jsonify(_task_payload(task_id))

    # ── 4b. SSE 实时进度流（前端优先用它逐张点亮，轮询作兜底）──
    @app.route("/api/commerce-agent/stream/<task_id>")
    def api_commerce_stream(task_id):
        import json as _json_mod

        from flask import Response, stream_with_context

        sid = task_id

        def _gen():
            last = None
            deadline = time.time() + 15 * 60
            while time.time() < deadline:
                payload = _task_payload(sid, with_csrf=False)
                data = _json_mod.dumps(payload, ensure_ascii=False)
                if data != last:
                    yield f"data: {data}\n\n"
                    last = data
                if payload.get("status") != "processing":
                    return
                time.sleep(0.8)
            yield ('data: {"taskId": "%s", "status": "failed", '
                   '"error": "生成超时"}\n\n' % sid)

        return Response(
            stream_with_context(_gen()),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── 5. 单张图重做 ──
    @app.route("/api/commerce-agent/regenerate", methods=["POST"])
    def api_commerce_regenerate():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        instruction = str(_json("instruction", "") or "").strip()
        prompt_override = str(_json("prompt", "") or "").strip()
        provided = _json("image")
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400

        source = None
        if isinstance(provided, dict) and provided.get("prompt"):
            source = provided
        else:
            source = next(
                (p for p in _plan_for(sid)
                 if image_id in (p.get("id"), p.get("scene_id"))), None)
        if not source:
            return jsonify({"error": f"没有找到图片 {image_id}，请先生成套图",
                            "csrf_token": issue_csrf_token()}), 404

        if prompt_override:
            # 用户直接编辑了英文提示词：以用户版本为准，再叠加可选修改指令
            source = {**source, "prompt": prompt_override}
        updated = commerce_strategy.apply_instruction(source, instruction)
        # 更新计划里的这张图，其他图不受影响
        plan = _plan_for(sid) or []
        replaced = False
        for i, p in enumerate(plan):
            if (p.get("id"), p.get("scene_id")) == (source.get("id"), source.get("scene_id")):
                plan[i] = updated
                replaced = True
                break
        if not replaced:
            plan.append(updated)
        _persist_plan(sid, plan)
        if instruction:
            append_chat_message(
                sid, "user",
                f"重做 {updated.get('title') or image_id}：{instruction}",
                {"commerce": True, "regenerate": True},
            )

        # 复用 generate 的执行通道，只派这一张
        engine = ensure_session(sessions, sid, dual_agent_engine_cls, output_dir, sessions_dir)
        scene = _scene_from_image(updated)
        if tasks.results.get(sid, {}).get("status") == "running":
            return jsonify({"error": "上一个任务还在进行中，请稍候",
                            "csrf_token": issue_csrf_token()}), 409

        has_product = bool(engine.context.get("image_paths"))
        use_mock = _mock_available() or not has_product
        tasks.clear_cancel(sid)
        tasks.progress[sid] = {
            "stage": "starting", "message": "正在重做这张图…", "task_type": "generate",
            "scenes": [{"scene_id": scene["scene_id"], "scene_name": scene["scene_name"],
                        "status": "pending"}],
            "total": 1, "completed": 0,
        }
        tasks.results[sid] = {"status": "running"}

        if use_mock:
            thread = threading.Thread(
                target=_run_mock_generation, args=(engine, sid, [scene]), daemon=True)
        else:
            intent = {
                "intent": "regenerate", "dispatch_intent": "regenerate",
                "target_agent": "executor", "needs_clarification": False, "task_plan": [],
                "extracted": {"selected_scenes": [scene], "generation_count": 1},
            }
            engine.apply_options_from_intent(intent)
            task = engine.step_observer_dispatch(intent)
            if not task:
                tasks.results[sid] = {"status": "error", "error": "任务派发失败"}
                return jsonify({"error": "任务派发失败", "csrf_token": issue_csrf_token()}), 500
            thread = threading.Thread(
                target=_run_real_generation, args=(engine, task, sid, [scene]), daemon=True)
        thread.start()

        return jsonify({
            "taskId": sid,
            "status": "processing",
            "mockMode": use_mock,
            "image": {"id": updated.get("id", image_id), "prompt": updated.get("prompt", "")},
            "csrf_token": issue_csrf_token(),
        })

    # ── 6. 高清导出（1K/2K/3K/4K/8K/18K 分档）──
    @app.route("/api/commerce-agent/export-hd", methods=["POST"])
    def api_commerce_export_hd():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import hd_export

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        tier = str(_json("tier", "") or "").strip().lower()
        target = hd_export.tier_target(tier)
        if target is None:
            tier = ""
            try:
                target = int(_json("target", hd_export.DEFAULT_TARGET))
            except (TypeError, ValueError):
                target = hd_export.DEFAULT_TARGET
        if not sid or not image_id:
            return jsonify({"error": "sessionId 与 imageId 不能为空"}), 400

        src, out_dir_ = _find_source_image(sid, image_id)
        if not src:
            return jsonify({"error": f"没有找到图片 {image_id}，请先生成",
                            "csrf_token": issue_csrf_token()}), 404
        out_dir = out_dir_

        stem = os.path.splitext(os.path.basename(src))[0]
        suffix = tier or f"{target}px"
        dst = os.path.join(out_dir, "hd", f"{stem}_{suffix}.jpg")
        try:
            info = hd_export.export_hd(src, dst, target)
        except Exception as e:  # noqa: BLE001 — 超分失败要给用户明确原因
            return jsonify({"error": f"高清导出失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        return jsonify({
            "url": f"/api/image/{sid}/hd/{os.path.basename(dst)}",
            "width": info["width"],
            "height": info["height"],
            "bytes": info["bytes"],
            "tier": tier or None,
            "upscaler": info.get("upscaler", "lanczos"),
            "csrf_token": issue_csrf_token(),
        })

    # ── 6b. 整批分辨率打包（全部生成图统一放大到指定档位 + zip）──
    @app.route("/api/commerce-agent/export-resolution-pack", methods=["POST"])
    def api_commerce_export_resolution_pack():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        import zipfile

        from web.services import hd_export

        sid = str(_json("sessionId", "") or "").strip()
        tier = str(_json("tier", "") or "").strip().lower()
        target = hd_export.tier_target(tier)
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        if target is None:
            return jsonify({"error": f"未知分辨率档位 {tier}（可选：{'/'.join(hd_export.RESOLUTION_TIERS)}）",
                            "csrf_token": issue_csrf_token()}), 400

        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")
        image_files = sorted(
            f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        if not image_files:
            return jsonify({"error": "本会话还没有生成图，请先出图",
                            "csrf_token": issue_csrf_token()}), 404

        exported, failed = [], []
        upscaler = "lanczos"
        for fname in image_files:
            stem = os.path.splitext(fname)[0]
            dst = os.path.join(out_dir, "hd", f"{stem}_{tier}.jpg")
            try:
                info = hd_export.export_hd(os.path.join(raw_dir, fname), dst, target)
                exported.append(dst)
                upscaler = info.get("upscaler", upscaler)
            except Exception as e:  # noqa: BLE001 — 单图失败不拖垮整包
                failed.append({"image": stem, "error": str(e)})

        if not exported:
            return jsonify({"error": "没有成功导出的图片",
                            "csrf_token": issue_csrf_token()}), 500

        zip_path = os.path.join(out_dir, f"resolution_pack_{tier}.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fpath in exported:
                zf.write(fpath, os.path.basename(fpath))

        return jsonify({
            "url": f"/api/commerce-agent/resolution-pack/{sid}/{tier}",
            "tier": tier,
            "targetEdge": target,
            "fileCount": len(exported),
            "failed": failed,
            "upscaler": upscaler,
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/resolution-pack/<sid>/<tier>")
    def api_commerce_resolution_pack_download(sid, tier):
        from flask import send_file

        from web.services import hd_export

        tier = str(tier or "").strip().lower()
        if hd_export.tier_target(tier) is None:
            return jsonify({"error": "未知分辨率档位"}), 400
        zip_path = os.path.join(_session_out_dir(sid), f"resolution_pack_{tier}.zip")
        if not os.path.exists(zip_path):
            return jsonify({"error": "还没有生成该档位的高清包"}), 404
        return send_file(zip_path, mimetype="application/zip",
                         as_attachment=True,
                         download_name=f"resolution_pack_{tier}_{sid}.zip")

    # ── 7. 一键平台尺寸包导出（各平台上架尺寸 + zip 打包）──

    # commerce 策略里的平台 key → platform_adapter 规格 key
    _PLATFORM_SPEC_MAP = {
        "etsy": ["etsy"],
        "temu": ["temu"],
        "amazon": ["amazon_main"],
        "tiktok": ["tiktok_shop"],
        "ebay": ["ebay"],
        "shopify": ["shopify"],
    }
    _DEFAULT_PACK_PLATFORMS = ["etsy", "temu", "amazon_main"]

    def _pack_platforms_for(sid: str, requested: list) -> list:
        from scripts.platform_adapter import PLATFORM_SPECS

        if requested:
            return [p for p in requested if p in PLATFORM_SPECS]
        strategy = load_session_record(sid).get("commerce_strategy") or {}
        keys = []
        for plat in strategy.get("platforms") or []:
            keys.extend(_PLATFORM_SPEC_MAP.get(plat, []))
        return keys or list(_DEFAULT_PACK_PLATFORMS)

    @app.route("/api/commerce-agent/export-platforms", methods=["POST"])
    def api_commerce_export_platforms():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        import zipfile

        from scripts.platform_adapter import export_to_platforms

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")
        if not os.path.isdir(raw_dir) or not any(
                f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
                for f in os.listdir(raw_dir)):
            return jsonify({"error": "本会话还没有生成图，请先出图",
                            "csrf_token": issue_csrf_token()}), 404

        platforms = _pack_platforms_for(sid, _json("platforms") or [])
        plat_dir = os.path.join(out_dir, "platforms")
        try:
            results = export_to_platforms(raw_dir, plat_dir, platforms)
        except Exception as e:  # noqa: BLE001 — 导出失败要给用户明确原因
            return jsonify({"error": f"平台尺寸导出失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        zip_path = os.path.join(out_dir, "platform_pack.zip")
        file_count = 0
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for plat, res in results.items():
                for item in res.get("results", []):
                    if not item.get("success"):
                        continue
                    fpath = item["output_path"]
                    zf.write(fpath, os.path.join(plat, os.path.basename(fpath)))
                    file_count += 1
        if not file_count:
            return jsonify({"error": "没有成功导出的图片",
                            "csrf_token": issue_csrf_token()}), 500

        return jsonify({
            "url": f"/api/commerce-agent/platform-pack/{sid}",
            "fileCount": file_count,
            "platforms": [{"key": k,
                           "name": v.get("display_name", k),
                           "size": v.get("size", ""),
                           "count": v.get("success_count", 0)}
                          for k, v in results.items()],
            "csrf_token": issue_csrf_token(),
        })

    # ── 10. 上架前合规体检（白底/占比/分辨率/宽高比/体积）──
    @app.route("/api/commerce-agent/compliance", methods=["POST"])
    def api_commerce_compliance():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from scripts.compliance_checker import COMPLIANCE_RULES, check_image_compliance

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")
        image_files = sorted(
            f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        if not image_files:
            return jsonify({"error": "本会话还没有生成图，请先出图",
                            "csrf_token": issue_csrf_token()}), 404

        requested = [p for p in (_json("platforms") or []) if p in COMPLIANCE_RULES]
        platforms = (requested
                     or [p for p in _pack_platforms_for(sid, []) if p in COMPLIANCE_RULES]
                     or ["amazon_main"])

        images = []
        total_checks = passed_checks = 0
        for fname in image_files:
            fpath = os.path.join(raw_dir, fname)
            checks = []
            for plat in platforms:
                r = check_image_compliance(fpath, plat)
                total_checks += 1
                passed_checks += 1 if r["passed"] else 0
                checks.append({
                    "platform": plat,
                    "platformName": r.get("platform_name", plat),
                    "passed": r["passed"],
                    "issues": r.get("issues", []),
                    "metrics": r.get("metrics", {}),
                })
            images.append({
                "imageId": os.path.splitext(fname)[0],
                "filename": f"raw/{fname}",
                "passed": all(c["passed"] for c in checks),
                "checks": checks,
            })

        return jsonify({
            "sessionId": sid,
            "platforms": platforms,
            "totalChecks": total_checks,
            "passed": passed_checks,
            "failed": total_checks - passed_checks,
            "images": images,
            "csrf_token": issue_csrf_token(),
        })

    # ── 14. A/B 测试（同一张图多风格变体 → 并排对比 → 选优替换）──
    _AB_STYLE_HINTS = [
        ("A", "原创意方向", ""),
        ("B", "暖调氛围", " Slightly warmer tones, more dramatic cozy lighting."),
        ("C", "明快清新", " Brighter, airier composition with vibrant colors."),
    ]

    @app.route("/api/commerce-agent/ab-test", methods=["POST"])
    def api_commerce_ab_test():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        try:
            variants = max(2, min(3, int(_json("variants", 3))))
        except (TypeError, ValueError):
            variants = 3
        if not sid or not image_id:
            return jsonify({"error": "sessionId 与 imageId 不能为空"}), 400

        source = next(
            (p for p in _plan_for(sid)
             if image_id in (p.get("id"), p.get("scene_id"))), None)
        if not source:
            return jsonify({"error": f"没有找到图片 {image_id}，请先生成套图",
                            "csrf_token": issue_csrf_token()}), 404
        if tasks.results.get(sid, {}).get("status") == "running":
            return jsonify({"error": "上一个任务还在进行中，请稍候",
                            "csrf_token": issue_csrf_token()}), 409

        base_scene = _scene_from_image(source)
        base_scene.pop("candidates", None)  # A/B 变体本身就是多版本，不再叠加候选
        main_id = base_scene["scene_id"]
        scenes, variant_meta = [], []
        for k, (label, label_cn, hint) in enumerate(_AB_STYLE_HINTS[:variants]):
            scene = dict(base_scene)
            scene["scene_id"] = f"{main_id}__ab{k + 1}"
            scene["scene_name"] = f"{base_scene.get('scene_name', '')} · 方案{label}"
            scene["prompt"] = base_scene.get("prompt", "") + hint
            scenes.append(scene)
            variant_meta.append({
                "sceneId": scene["scene_id"],
                "label": label,
                "labelCn": label_cn,
            })

        engine = ensure_session(sessions, sid, dual_agent_engine_cls,
                                output_dir, sessions_dir)
        has_product = bool(engine.context.get("image_paths"))
        use_mock = _mock_available() or not has_product
        tasks.clear_cancel(sid)
        tasks.progress[sid] = {
            "stage": "starting", "message": "正在生成 A/B 风格变体…",
            "task_type": "generate",
            "scenes": [{"scene_id": s["scene_id"], "scene_name": s["scene_name"],
                        "status": "pending"} for s in scenes],
            "total": len(scenes), "completed": 0,
        }
        tasks.results[sid] = {"status": "running"}

        if use_mock:
            thread = threading.Thread(
                target=_run_mock_generation, args=(engine, sid, scenes), daemon=True)
        else:
            intent = {
                "intent": "regenerate", "dispatch_intent": "regenerate",
                "target_agent": "executor", "needs_clarification": False,
                "task_plan": [],
                "extracted": {"selected_scenes": scenes,
                              "generation_count": len(scenes)},
            }
            engine.apply_options_from_intent(intent)
            task = engine.step_observer_dispatch(intent)
            if not task:
                tasks.results[sid] = {"status": "error", "error": "任务派发失败"}
                return jsonify({"error": "任务派发失败",
                                "csrf_token": issue_csrf_token()}), 500
            thread = threading.Thread(
                target=_run_real_generation, args=(engine, task, sid, scenes),
                daemon=True)
        thread.start()

        return jsonify({
            "taskId": sid,
            "status": "processing",
            "mockMode": use_mock,
            "imageId": image_id,
            "mainSceneId": main_id,
            "variants": variant_meta,
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/ab-pick", methods=["POST"])
    def api_commerce_ab_pick():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        import shutil

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        winner_scene = str(_json("winnerSceneId", "") or "").strip()
        if not sid or not image_id or not winner_scene:
            return jsonify({"error": "sessionId / imageId / winnerSceneId 不能为空"}), 400

        winner_src, out_dir = _find_source_image(sid, winner_scene)
        if not winner_src:
            return jsonify({"error": "没有找到该变体图",
                            "csrf_token": issue_csrf_token()}), 404

        main_src, _ = _find_source_image(sid, image_id)
        raw_dir = os.path.join(out_dir, "raw")
        main_id = winner_scene.split("__ab")[0]
        dst = main_src or os.path.join(raw_dir, f"{main_id}.jpg")
        try:
            if os.path.abspath(winner_src) != os.path.abspath(dst):
                shutil.copy2(winner_src, dst)
        except OSError as e:
            return jsonify({"error": f"替换失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        # 胜出方向记入偏好，下一轮规划自动沿用
        entry = next(
            (p for p in _plan_for(sid)
             if image_id in (p.get("id"), p.get("scene_id"))), {}) or {}
        record = load_session_record(sid)
        feedback = record.get("feedback") or {}
        feedback[image_id] = {
            "verdict": "like",
            "title": entry.get("title", ""),
            "titleEn": entry.get("titleEn", ""),
            "purpose": entry.get("purpose", ""),
            "prompt": f"A/B winner {winner_scene}: "
                      + (entry.get("prompt", "") or "")[:240],
        }
        record["feedback"] = feedback
        save_session_record(sid, record)

        rel = os.path.relpath(dst, out_dir).replace("\\", "/")
        return jsonify({
            "url": f"/api/image/{sid}/{rel}?v={int(time.time())}",
            "imageId": image_id,
            "winnerSceneId": winner_scene,
            "csrf_token": issue_csrf_token(),
        })

    # ── 13. 产品档案库（跨会话复用：免重复上传/分析）──
    @app.route("/api/commerce-agent/profiles")
    def api_commerce_profiles():
        items = []
        for name in os.listdir(sessions_dir):
            if not name.endswith(".json"):
                continue
            rec_sid = name[:-5]
            rec = load_session_record(rec_sid)
            profile = rec.get("product_profile")
            if not isinstance(profile, dict) or not profile:
                continue
            items.append({
                "sessionId": rec_sid,
                "productName": (profile.get("product_name_cn")
                                or profile.get("product_name", "")),
                "category": (profile.get("category_cn")
                             or profile.get("category", "")),
                "thumb": rec.get("thumb", ""),
                "updatedAt": rec.get("updated_at", 0),
            })
        items.sort(key=lambda x: x["updatedAt"], reverse=True)
        return jsonify({"profiles": items[:20]})

    @app.route("/api/commerce-agent/inspiration")
    def api_commerce_inspiration():
        """今日灵感：老产品 × 没试过的高分场景，开屏即给可一键开工的建议。"""
        from scripts.scene_matcher import select_top_scenes

        prefs = {}
        try:
            fb_path = os.path.join(os.path.dirname(__file__), "..", "..",
                                   "profiles", "feedback_history.json")
            if os.path.exists(fb_path):
                with open(fb_path, encoding="utf-8") as f:
                    prefs = (json.load(f) or {}).get("preferences", {})
        except Exception:  # noqa: BLE001 — 偏好缺失不影响推荐
            prefs = {}

        records = []
        for name in os.listdir(sessions_dir):
            if not name.endswith(".json"):
                continue
            rec_sid = name[:-5]
            rec = load_session_record(rec_sid)
            profile = rec.get("product_profile")
            if isinstance(profile, dict) and profile:
                records.append((rec_sid, rec, profile))
        records.sort(key=lambda x: x[1].get("updated_at", 0), reverse=True)

        suggestions = []
        for rec_sid, rec, profile in records[:6]:
            raw_dir = os.path.join(_session_out_dir(rec_sid), "raw")
            done_stems = {os.path.splitext(f)[0]
                          for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])}
            try:
                scored = select_top_scenes(profile, count=11,
                                           user_preferences=prefs)
            except Exception:  # noqa: BLE001 — 单个档案评分失败跳过
                continue
            fresh = next(
                (s for s in scored
                 if not any(stem.startswith(s["scene_id"]) for stem in done_stems)),
                None)
            if not fresh:
                continue
            suggestions.append({
                "sessionId": rec_sid,
                "productName": (profile.get("product_name_cn")
                                or profile.get("product_name", "")),
                "thumb": rec.get("thumb", ""),
                "sceneId": fresh["scene_id"],
                "sceneName": fresh["scene_name"],
                "emotion": fresh.get("emotion", ""),
                "use": fresh.get("ecommerce_use", ""),
            })
            if len(suggestions) >= 3:
                break
        return jsonify({"suggestions": suggestions})

    @app.route("/api/commerce-agent/adopt-profile", methods=["POST"])
    def api_commerce_adopt_profile():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        import shutil

        sid = str(_json("sessionId", "") or "").strip()
        source_sid = str(_json("sourceSessionId", "") or "").strip()
        if not sid or not source_sid:
            return jsonify({"error": "sessionId 与 sourceSessionId 不能为空"}), 400

        source_rec = load_session_record(source_sid)
        profile = source_rec.get("product_profile")
        if not isinstance(profile, dict) or not profile:
            return jsonify({"error": "来源会话没有产品档案",
                            "csrf_token": issue_csrf_token()}), 404

        engine = ensure_session(sessions, sid, dual_agent_engine_cls,
                                output_dir, sessions_dir)
        # engine.context 是黑板的只读视图，必须写回黑板才会生效/持久化
        engine.blackboard.set("profile", dict(profile),
                              agent_id=engine.observer.agent_id)
        engine.blackboard.save()

        # 把来源会话的产品原图复制过来作为参考图（生图一致性依赖它）
        src_originals = os.path.join(_session_out_dir(source_sid), "originals")
        dst_originals = os.path.join(engine.context["output_dir"], "originals")
        copied = []
        if os.path.isdir(src_originals):
            os.makedirs(dst_originals, exist_ok=True)
            for fname in sorted(os.listdir(src_originals)):
                if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    continue
                dst = os.path.join(dst_originals, fname)
                try:
                    shutil.copy2(os.path.join(src_originals, fname), dst)
                    copied.append(dst)
                except OSError:
                    continue
        if copied:
            engine.add_images(copied)

        record = load_session_record(sid)
        record["product_profile"] = dict(profile)
        save_session_record(sid, record)

        pname = (profile.get("product_name_cn")
                 or profile.get("product_name", "该产品"))
        append_chat_message(
            sid, "observer",
            f"已复用产品档案「{pname}」（含 {len(copied)} 张产品参考图），"
            "直接说要出什么图就行。",
            {"adopted_from": source_sid})

        return jsonify({
            "sessionId": sid,
            "productName": pname,
            "referenceImageCount": len(copied),
            "profile": profile,
            "csrf_token": issue_csrf_token(),
        })

    # ── 12. 多语言一键出海包（本地化文案 + 多语种主图 + zip）──
    @app.route("/api/commerce-agent/localized-pack", methods=["POST"])
    def api_commerce_localized_pack():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        import zipfile

        from scripts.localization import (
            MARKETS, generate_localized_copy, get_font_for_text)
        from web.services import caption_overlay

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        markets = [str(m).strip().lower() for m in (_json("markets") or [])
                   if str(m).strip().lower() in MARKETS] or ["us"]

        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")
        image_files = sorted(
            f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        if not image_files:
            return jsonify({"error": "本会话还没有生成图，请先出图",
                            "csrf_token": issue_csrf_token()}), 404

        engine = sessions.get(sid)
        profile = (engine.context.get("profile") or {}) if engine else {}
        copy = generate_localized_copy(profile, markets)
        if not copy.get("markets"):
            return jsonify({"error": "本地化文案生成失败",
                            "csrf_token": issue_csrf_token()}), 500

        hero = os.path.join(raw_dir, image_files[0])
        loc_dir = os.path.join(out_dir, "localized")
        summary = []
        zip_path = os.path.join(out_dir, "localized_pack.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for code, entry in copy["markets"].items():
                mdir = os.path.join(loc_dir, code)
                headline = str(entry.get("headline", ""))[:60]
                subtext = str(entry.get("subtext", ""))[:80]
                hero_dst = os.path.join(mdir, "hero_caption.jpg")
                try:
                    caption_overlay.render_caption(
                        hero, hero_dst, headline, subtext,
                        font_path=get_font_for_text(headline + subtext) or "")
                    zf.write(hero_dst, os.path.join(code, "hero_caption.jpg"))
                except Exception as e:  # noqa: BLE001 — 单市场渲染失败不拖垮整包
                    entry["render_error"] = str(e)
                copy_json = json.dumps(entry, ensure_ascii=False, indent=2)
                zf.writestr(os.path.join(code, "copy.json"), copy_json)
                summary.append({
                    "market": code,
                    "marketName": entry.get("market_name", code),
                    "language": entry.get("language", ""),
                    "headline": headline,
                    "cta": entry.get("cta", ""),
                    "rtl": bool(entry.get("rtl")),
                    "platforms": entry.get("recommended_platforms", []),
                })

        return jsonify({
            "url": f"/api/commerce-agent/localized-pack/{sid}",
            "source": copy.get("source", ""),
            "markets": summary,
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/localized-pack/<sid>")
    def api_commerce_localized_pack_download(sid):
        from flask import send_file

        zip_path = os.path.join(_session_out_dir(sid), "localized_pack.zip")
        if not os.path.exists(zip_path):
            return jsonify({"error": "还没有生成出海包"}), 404
        return send_file(zip_path, mimetype="application/zip",
                         as_attachment=True,
                         download_name=f"localized_pack_{sid}.zip")

    # ── 11. 图片反馈（喜欢/不喜欢 → 下一轮规划注入偏好）──
    @app.route("/api/commerce-agent/feedback", methods=["POST"])
    def api_commerce_feedback():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        verdict = str(_json("verdict", "") or "").strip()
        if not sid or not image_id:
            return jsonify({"error": "sessionId 与 imageId 不能为空"}), 400
        if verdict not in ("like", "dislike", "clear"):
            return jsonify({"error": "verdict 只能是 like / dislike / clear"}), 400

        record = load_session_record(sid)
        feedback = record.get("feedback") or {}
        if verdict == "clear":
            feedback.pop(image_id, None)
        else:
            entry = next(
                (p for p in _plan_for(sid)
                 if image_id in (p.get("id"), p.get("scene_id"))), {}) or {}
            feedback[image_id] = {
                "verdict": verdict,
                "title": entry.get("title", ""),
                "titleEn": entry.get("titleEn", ""),
                "purpose": entry.get("purpose", ""),
                "prompt": (entry.get("prompt", "") or "")[:300],
            }
        record["feedback"] = feedback
        save_session_record(sid, record)

        return jsonify({
            "sessionId": sid,
            "imageId": image_id,
            "verdict": verdict,
            "likes": sum(1 for f in feedback.values() if f.get("verdict") == "like"),
            "dislikes": sum(1 for f in feedback.values() if f.get("verdict") == "dislike"),
            "csrf_token": issue_csrf_token(),
        })

    def _feedback_preferences(sid: str) -> dict:
        """把历史喜欢/不喜欢整理成 LLM 可用的偏好摘要。"""
        feedback = load_session_record(sid).get("feedback") or {}
        liked, disliked = [], []
        for f in feedback.values():
            desc = (f.get("titleEn") or f.get("title") or "").strip()
            snippet = (f.get("prompt", "") or "")[:160]
            item = {"slot": desc, "prompt_excerpt": snippet}
            (liked if f.get("verdict") == "like" else disliked).append(item)
        return {"liked": liked, "disliked": disliked} if (liked or disliked) else {}

    # ── 9. 会话生成用量统计（轮数/张数/耗时）──
    @app.route("/api/commerce-agent/usage/<sid>")
    def api_commerce_usage(sid):
        usage = load_session_record(sid).get("usage") or {}
        return jsonify({
            "sessionId": sid,
            "rounds": int(usage.get("rounds", 0)),
            "images": int(usage.get("images", 0)),
            "seconds": float(usage.get("seconds", 0)),
            "mockRounds": int(usage.get("mock_rounds", 0)),
        })

    @app.route("/api/commerce-agent/platform-pack/<sid>")
    def api_commerce_platform_pack(sid):
        from flask import send_file

        zip_path = os.path.join(_session_out_dir(sid), "platform_pack.zip")
        if not os.path.exists(zip_path):
            return jsonify({"error": "还没有导出平台尺寸包"}), 404
        return send_file(zip_path, mimetype="application/zip",
                         as_attachment=True,
                         download_name=f"platform_pack_{sid}.zip")

    # ── 22. 新品池（20 位候选池 + FBA 上新计划 + CSV 导出）──
    @app.route("/api/commerce-agent/product-pool", methods=["GET", "POST"])
    def api_commerce_product_pool():
        from web.services import product_pool

        if request.method == "GET":
            return jsonify({"items": product_pool.list_pool(),
                            **product_pool.summary()})

        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403
        action = str(_json("action", "add") or "add")
        try:
            if action == "add":
                item = product_pool.add_item(
                    str(_json("name", "") or ""),
                    str(_json("category", "") or ""),
                    _json("targetPrice", 0) or 0,
                    _json("cost", 0) or 0,
                    str(_json("notes", "") or ""))
                return jsonify({"item": item, **product_pool.summary(),
                                "csrf_token": issue_csrf_token()})
            if action == "update":
                item = product_pool.update_item(
                    str(_json("id", "") or ""), _json("patch") or {})
                return jsonify({"item": item, "csrf_token": issue_csrf_token()})
            if action == "remove":
                result = product_pool.remove_item(str(_json("id", "") or ""))
                return jsonify({**result, "csrf_token": issue_csrf_token()})
        except ValueError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 400
        return jsonify({"error": f"未知操作 {action}"}), 400

    # ── 20b. 选品雷达：一句话产品想法 → 机会评分卡（可一键入新品池）──
    @app.route("/api/commerce-agent/opportunity", methods=["POST"])
    def api_commerce_opportunity():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import opportunity

        idea = str(_json("idea", "") or _json("message", "") or "").strip()
        raw_idea = str(
            _json("raw_idea", "") or _json("rawIdea", "") or _json("raw_message", "") or idea
        ).strip()
        if not idea:
            return jsonify({"error": "请告诉我产品想法，比如「宠物出生花亚克力挂件，适合 Etsy」",
                            "csrf_token": issue_csrf_token()}), 400

        sid = str(_json("sessionId", "") or "").strip()
        engine = sessions.get(sid) if sid else None
        profile = (engine.context.get("profile") or {}) if engine else {}

        try:
            card = opportunity.analyze_idea(raw_idea or idea, profile)
        except ValueError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 400

        added = None
        if _json("addToPool"):
            from web.services import product_pool
            item = opportunity.card_to_pool_item(card)
            try:
                added = product_pool.add_item(
                    item["name"], item["category"], item["target_price"],
                    notes=item["notes"], extra=item["extra"])
            except ValueError as e:
                card["poolError"] = str(e)

        # 机会卡结论沉淀进产品记忆（下次同品类对话自动召回）
        try:
            from common.memory_store import remember
            remember(
                f"选品评估「{idea[:60]}」：评分 {card['opportunity_score']}，"
                f"竞争{card['competition_level']}，{card.get('verdict', '')[:100]}",
                category="product", skip_review=True)
        except Exception:  # noqa: BLE001
            pass

        if sid:
            append_chat_message(sid, "user", idea, {"commerce": True,
                                                    "opportunity": True})
        return jsonify({"card": card, "poolItem": added,
                        "csrf_token": issue_csrf_token()})

    @app.route("/api/commerce-agent/product-pool/csv")
    def api_commerce_product_pool_csv():
        from flask import send_file

        from web.services import product_pool

        dst = os.path.join(output_dir, "product_pool.csv")
        product_pool.export_csv(dst)
        return send_file(dst, mimetype="text/csv", as_attachment=True,
                         download_name="new_product_pool.csv")

    # ── 21. 经营工具：利润测算 / 关键词建议（与 MCP Server 共用实现）──
    @app.route("/api/commerce-agent/profit", methods=["POST"])
    def api_commerce_profit():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services.biz_tools import calc_profit

        try:
            result = calc_profit(
                price=float(_json("price", 0) or 0),
                cost=float(_json("cost", 0) or 0),
                freight=float(_json("freight", 0) or 0),
                platform=str(_json("platform", "amazon") or "amazon"),
                fee_pct=_json("feePct"),
                ad_pct=_json("adPct"),
                packaging=float(_json("packaging", 0) or 0),
                payment_pct=_json("paymentPct"),
                refund_pct=_json("refundPct"),
                mode=str(_json("mode", "") or ""),
                target_margin_pct=float(_json("targetMarginPct", 30) or 30))
        except (TypeError, ValueError) as e:
            return jsonify({"error": f"参数不对：{e}",
                            "csrf_token": issue_csrf_token()}), 400
        return jsonify({**result, "csrf_token": issue_csrf_token()})

    @app.route("/api/commerce-agent/keywords", methods=["POST"])
    def api_commerce_keywords():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services.biz_tools import suggest_keywords

        sid = str(_json("sessionId", "") or "").strip()
        engine = sessions.get(sid) if sid else None
        profile = (engine.context.get("profile") or {}) if engine else {}
        if _json("productName"):
            profile = {**profile, "product_name": str(_json("productName"))}
        if not profile.get("product_name"):
            return jsonify({"error": "请先分析产品或提供 productName",
                            "csrf_token": issue_csrf_token()}), 400
        result = suggest_keywords(
            profile, str(_json("platform", "amazon") or "amazon"),
            int(_json("count", 15) or 15))
        if _json("etsyTags"):
            from web.services.biz_tools import etsy_tags
            result["etsyTags"] = etsy_tags(profile, result["keywords"])
        return jsonify({**result, "csrf_token": issue_csrf_token()})

    # ── 21b. 风险检测：上架前给标题/描述/标签做一次全面体检 ──
    @app.route("/api/commerce-agent/risk-check", methods=["POST"])
    def api_commerce_risk_check():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import risk_check

        sid = str(_json("sessionId", "") or "").strip()
        engine = sessions.get(sid) if sid else None
        profile = (engine.context.get("profile") or {}) if engine else {}

        title = str(_json("title", "") or "").strip()
        description = str(_json("description", "") or "").strip()
        tags = [str(t) for t in (_json("tags") or [])]
        if not (title or description or tags or profile):
            return jsonify({"error": "请提供 title/description/tags，或先分析产品",
                            "csrf_token": issue_csrf_token()}), 400

        report = risk_check.check_listing(
            title=title, description=description, tags=tags, profile=profile,
            competition_level=str(_json("competitionLevel", "") or ""),
            use_llm=bool(_json("useLlm", True)),
            clearance_evidence=_json("clearanceEvidence"))

        # 高风险结论沉淀进风险记忆（下次规划自动提醒）
        if report["trademarkHits"]:
            try:
                from common.memory_store import remember
                remember(f"侵权词命中记录：{', '.join(report['trademarkHits'][:5])}"
                         f"（来自「{(title or description)[:40]}」）",
                         category="risk", skip_review=True)
            except Exception:  # noqa: BLE001
                pass
        return jsonify({**report, "csrf_token": issue_csrf_token()})

    # ── 20. 全平台标题规则优化器（≤75 字符移动端友好 + 规则体检）──
    @app.route("/api/commerce-agent/optimize-title", methods=["POST"])
    def api_commerce_optimize_title():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import listing_rules

        sid = str(_json("sessionId", "") or "").strip()
        title = str(_json("title", "") or "").strip()
        platforms = [str(p) for p in (_json("platforms") or [])]

        engine = sessions.get(sid) if sid else None
        profile = (engine.context.get("profile") or {}) if engine else {}
        if not title:
            # 未给标题时用铺货包/档案兜底生成一条
            title = (profile.get("product_name") or "").strip()
        if not title:
            return jsonify({"error": "请提供标题，或先分析产品建立档案",
                            "csrf_token": issue_csrf_token()}), 400
        if not platforms:
            platforms = ["amazon", "etsy", "ebay", "walmart", "temu", "tiktok"]

        results = listing_rules.optimize_for_platforms(title, platforms, profile)
        return jsonify({
            "original": title,
            "results": results,
            "csrf_token": issue_csrf_token(),
        })

    # ── 19. 精准局部改图（圈哪改哪 / 说哪改哪，其余像素不动）──
    def _record_last_edit(sid: str, image_id: str, backup: str):
        """记住最近一次改图（多轮指代「这张/再改」与「恢复上一版」都靠它）。"""
        record = load_session_record(sid)
        record["last_edit"] = {"image_id": image_id, "backup": backup,
                               "ts": int(time.time())}
        save_session_record(sid, record)

    def _execute_precise_edit(sid: str, image_id: str, instruction: str,
                              mask_data_url: str = "", rect_tuple=None,
                              target_desc: str = "") -> dict:
        """定位 → 局部重绘 → 自动验收（不达标重试一次）。

        返回响应 dict；失败抛异常（HTTP 层转成明确错误信息）。
        """
        from web.services import inpaint, visual_locate

        src, _out_dir = _find_source_image(sid, image_id)
        if not src:
            raise LookupError(f"没有找到图片 {image_id}，请先生成")

        # 无人工圈选时：视觉模型物体级定位 → 方位词 → 整图（inpaint 内兜底）
        located = False
        if not mask_data_url and not rect_tuple and target_desc:
            box = visual_locate.locate_object(src, target_desc)
            if box:
                rect_tuple = box
                located = True

        api_key = get_image_api_key(resolve_image_engine(None))
        result = inpaint.inpaint_image(
            src, instruction, mask_data_url, rect_tuple, api_key=api_key)

        # 自动验收：改动生效？其余没动？产品还在？不达标加强指令重试一次
        verify = None
        if not result["mocked"]:
            original_backup = result["backup"]
            verify = visual_locate.verify_edit(original_backup, src, instruction)
            if verify and not verify.get("passed"):
                if not verify.get("change_applied"):
                    retry_instruction = (
                        f"{instruction}. IMPORTANT: the previous attempt failed "
                        "to apply this change — make the requested change "
                        "clearly visible this time.")
                else:
                    retry_instruction = (
                        f"{instruction}. IMPORTANT: change ONLY what was asked. "
                        "The product and everything else must stay EXACTLY "
                        "identical to the original — same shape, colors, "
                        "materials, proportions and position.")
                # 重试必须从改前原图出发，绝不在坏图上二次叠加
                shutil.copy2(original_backup, src)
                result = inpaint.inpaint_image(
                    src, retry_instruction, mask_data_url, rect_tuple,
                    api_key=api_key)
                # 重试自身又备份了一次（内容=改前原图），去重避免回退层级虚增
                if result["backup"] != original_backup:
                    try:
                        os.remove(result["backup"])
                    except OSError:
                        pass
                result["backup"] = original_backup
                verify = visual_locate.verify_edit(
                    original_backup, src, instruction)

        _record_last_edit(sid, image_id, result["backup"])
        # 事务安全层日志：改图动作 + 回滚备份路径关联
        try:
            from web.services import safety
            safety.log_action(
                "inpaint_edit",
                {"imageId": image_id, "instruction": instruction[:100]},
                sid=sid, backup=result["backup"])
        except Exception:  # noqa: BLE001
            pass
        rel = os.path.relpath(src, _session_out_dir(sid)).replace("\\", "/")
        return {
            "url": f"/api/image/{sid}/{rel}?t={int(time.time())}",
            "imageId": image_id,
            "mocked": result["mocked"],
            "region": result["region"],
            "located": located,
            "verify": verify,
        }

    @app.route("/api/commerce-agent/inpaint", methods=["POST"])
    def api_commerce_inpaint():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        instruction = str(_json("instruction", "") or "").strip()
        mask_data_url = str(_json("mask", "") or "")
        rect = _json("rect")  # [x, y, w, h] 归一化坐标
        target_desc = str(_json("locate", "") or "").strip()
        if not sid or not image_id:
            return jsonify({"error": "sessionId 与 imageId 不能为空"}), 400
        if not instruction:
            return jsonify({"error": "请告诉我这块区域要改成什么样",
                            "csrf_token": issue_csrf_token()}), 400

        rect_tuple = None
        if isinstance(rect, (list, tuple)) and len(rect) == 4:
            try:
                rect_tuple = tuple(max(0.0, min(1.0, float(v))) for v in rect)
            except (TypeError, ValueError):
                rect_tuple = None

        try:
            payload = _execute_precise_edit(
                sid, image_id, instruction, mask_data_url, rect_tuple,
                target_desc)
        except LookupError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 404
        except Exception as e:  # noqa: BLE001 — 编辑失败要给用户明确原因
            return jsonify({"error": f"局部改图失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500
        return jsonify({**payload, "csrf_token": issue_csrf_token()})

    # ── 19b. 对话直达改图：一句话 → 定位哪张图哪个物体 → 局部重绘 → 验收 ──
    @app.route("/api/commerce-agent/chat-edit", methods=["POST"])
    def api_commerce_chat_edit():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import edit_resolver

        sid = str(_json("sessionId", "") or "").strip()
        message = str(_json("message", "") or "").strip()
        if not sid or not message:
            return jsonify({"error": "sessionId 与 message 不能为空"}), 400

        parsed = edit_resolver.parse_edit_message(message)
        if not parsed:
            return jsonify({"error": "这句话我没识别出改图指令",
                            "notEdit": True,
                            "csrf_token": issue_csrf_token()}), 422

        record = load_session_record(sid)
        last_edit = record.get("last_edit") or {}

        # 「恢复上一版 / 撤销修改」
        if parsed["is_restore"]:
            image_id = str(_json("imageId", "") or "").strip() or last_edit.get("image_id", "")
            if not image_id:
                return jsonify({"error": "这个会话还没有改过图，没有可恢复的版本",
                                "csrf_token": issue_csrf_token()}), 404
            return _restore_version_impl(sid, image_id)

        resolved = edit_resolver.resolve_image(
            parsed, _plan_for(sid), last_edit.get("image_id", ""))
        if resolved.get("notFound"):
            return jsonify({"error": resolved.get("reason", "本会话还没有生成图，请先出图"),
                            "csrf_token": issue_csrf_token()}), 404
        if resolved.get("ambiguous"):
            return jsonify({
                "needClarify": True,
                "candidates": resolved["ambiguous"],
                "csrf_token": issue_csrf_token(),
            })

        try:
            payload = _execute_precise_edit(
                sid, resolved["imageId"], parsed["instruction"],
                target_desc=parsed["target_desc"])
        except LookupError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 404
        except Exception as e:  # noqa: BLE001
            return jsonify({"error": f"局部改图失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        append_chat_message(
            sid, "user", message, {"commerce": True, "chat_edit": True})
        return jsonify({
            **payload,
            "sceneId": resolved["sceneId"],
            "title": resolved["title"],
            "targetDesc": parsed["target_desc"],
            "csrf_token": issue_csrf_token(),
        })

    # ── 19c. 恢复上一版（改图不满意随时回退，alts/ 里的备份永远在）──
    def _restore_version_impl(sid: str, image_id: str):
        src, out_dir = _find_source_image(sid, image_id)
        if not src:
            return jsonify({"error": f"没有找到图片 {image_id}",
                            "csrf_token": issue_csrf_token()}), 404
        stem = os.path.splitext(os.path.basename(src))[0]
        backup_dir = os.path.join(os.path.dirname(os.path.dirname(src)), "alts")
        backups = sorted(
            (f for f in (os.listdir(backup_dir) if os.path.isdir(backup_dir) else [])
             if f.startswith(f"{stem}_pre_edit_")),
        )
        if not backups:
            return jsonify({"error": "这张图没有历史版本可恢复",
                            "csrf_token": issue_csrf_token()}), 404
        latest = os.path.join(backup_dir, backups[-1])
        shutil.copy2(latest, src)
        os.remove(latest)  # 该版本已消费；上上版仍在列表里，可继续回退
        rel = os.path.relpath(src, _session_out_dir(sid)).replace("\\", "/")
        return jsonify({
            "restored": True,
            "imageId": image_id,
            "url": f"/api/image/{sid}/{rel}?t={int(time.time())}",
            "remainingVersions": len(backups) - 1,
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/restore-version", methods=["POST"])
    def api_commerce_restore_version():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403
        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        if not sid or not image_id:
            return jsonify({"error": "sessionId 与 imageId 不能为空"}), 400
        return _restore_version_impl(sid, image_id)

    # ── 16. 主图点击率预估（本地视觉特征启发式）──
    @app.route("/api/commerce-agent/ctr-score", methods=["POST"])
    def api_commerce_ctr_score():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import ctr_estimator

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        raw_dir = os.path.join(_session_out_dir(sid), "raw")
        results = ctr_estimator.score_directory(raw_dir)
        if not results:
            return jsonify({"error": "本会话还没有生成图，请先出图",
                            "csrf_token": issue_csrf_token()}), 404
        return jsonify({
            "sessionId": sid,
            "images": results,
            "csrf_token": issue_csrf_token(),
        })

    # ── 18. 竞品监控（清单管理 + 按需周报）──
    @app.route("/api/commerce-agent/competitor-watch", methods=["GET", "POST"])
    def api_commerce_competitor_watch():
        from web.services import competitor_watch

        if request.method == "GET":
            return jsonify({"watches": [
                {"url": w.get("url", ""), "name": w.get("name", ""),
                 "lastCheckedAt": (w.get("last") or {}).get("checked_at", 0)}
                for w in competitor_watch.list_watches()
            ]})

        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403
        action = str(_json("action", "add") or "add")
        url = str(_json("url", "") or "").strip()
        try:
            if action == "remove":
                result = competitor_watch.remove_watch(url)
            else:
                result = competitor_watch.add_watch(url, str(_json("name", "") or ""))
        except ValueError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 400
        return jsonify({**result, "csrf_token": issue_csrf_token()})

    @app.route("/api/commerce-agent/competitor-report", methods=["POST"])
    def api_commerce_competitor_report():
        from web.services import competitor_watch

        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403
        if not competitor_watch.list_watches():
            return jsonify({"error": "监控清单是空的，先添加竞品链接",
                            "csrf_token": issue_csrf_token()}), 404
        report = competitor_watch.run_report()
        return jsonify({**report, "csrf_token": issue_csrf_token()})

    # ── 17. 一键铺货包（listing 文案 + 全部成图 zip）──
    @app.route("/api/commerce-agent/listing-pack", methods=["POST"])
    def api_commerce_listing_pack():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import listing_pack

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        engine = sessions.get(sid)
        profile = (engine.context.get("profile") or {}) if engine else {}
        strategy = load_session_record(sid).get("commerce_strategy") or {}
        platform = str(_json("platform", "") or strategy.get("platform", "") or "")

        try:
            result = listing_pack.build_listing_pack(
                sid, _session_out_dir(sid), profile, platform)
        except ValueError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 404
        except Exception as e:  # noqa: BLE001 — 打包失败要给用户明确原因
            return jsonify({"error": f"铺货包生成失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        return jsonify({
            "url": f"/api/commerce-agent/listing-pack/{sid}",
            "title": result["copy"].get("title", ""),
            "platformTitles": result["copy"].get("platformTitles", []),
            "bullets": result["copy"].get("bullets", []),
            "keywords": result["copy"].get("keywords", []),
            "source": result["source"],
            "imageCount": result["imageCount"],
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/listing-pack/<sid>")
    def api_commerce_listing_pack_download(sid):
        from flask import send_file

        zip_path = os.path.join(_session_out_dir(sid), "listing_pack.zip")
        if not os.path.exists(zip_path):
            return jsonify({"error": "还没有生成铺货包"}), 404
        return send_file(zip_path, mimetype="application/zip",
                         as_attachment=True,
                         download_name=f"listing_pack_{sid}.zip")

    # ── 17b. 一键完整资料包（文案MD+CSV+图Prompt+风险报告+利润+成图 合一 zip）──
    @app.route("/api/commerce-agent/export-bundle", methods=["POST"])
    def api_commerce_export_bundle():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import listing_bundle, safety

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        engine = sessions.get(sid)
        profile = (engine.context.get("profile") or {}) if engine else {}
        record = load_session_record(sid)
        strategy = record.get("commerce_strategy") or {}
        platform = str(_json("platform", "") or strategy.get("platform", "")
                       or "Etsy")

        # 事务安全层：提案 → 校验 → 提交（medium 自动执行+日志）
        decision = safety.propose("export_bundle", {"platform": platform},
                                  sid=sid)
        if decision["decision"] != "execute":
            return jsonify({**decision, "csrf_token": issue_csrf_token()}), 409

        profit = None
        if isinstance(_json("profit"), dict):
            from web.services.biz_tools import calc_profit
            p = _json("profit")
            try:
                profit = calc_profit(
                    price=float(p.get("price", 0) or 0),
                    cost=float(p.get("cost", 0) or 0),
                    freight=float(p.get("freight", 0) or 0),
                    platform=str(p.get("platform", "etsy")),
                    mode=str(p.get("mode", "normal")))
            except (TypeError, ValueError):
                profit = None

        try:
            result = listing_bundle.build_bundle(
                sid, _session_out_dir(sid), profile,
                plan_images=_plan_for(sid), platform=platform, profit=profit,
                clearance_evidence=_json("clearanceEvidence"))
        except ValueError as e:
            safety.log_action("export_bundle", {"platform": platform},
                              sid=sid, status="failed", error=str(e))
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 404
        except Exception as e:  # noqa: BLE001
            safety.log_action("export_bundle", {"platform": platform},
                              sid=sid, status="failed", error=str(e))
            return jsonify({"error": f"资料包生成失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        return jsonify({
            "url": f"/api/commerce-agent/export-bundle/{sid}",
            "files": result["files"],
            "imageCount": result["imageCount"],
            "riskLevel": result["riskLevel"],
            "screeningStatus": result["screeningStatus"],
            "evidenceStatus": result["evidenceStatus"],
            "decision": result["decision"],
            "publishable": result["publishable"],
            "hardGateReasons": result["hardGateReasons"],
            "title": result["title"],
            "tags": result["tags"],
            "source": result["source"],
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/export-bundle/<sid>")
    def api_commerce_export_bundle_download(sid):
        from flask import send_file

        zip_path = os.path.join(_session_out_dir(sid), "listing_bundle.zip")
        if not os.path.exists(zip_path):
            return jsonify({"error": "还没有生成资料包"}), 404
        return send_file(zip_path, mimetype="application/zip",
                         as_attachment=True,
                         download_name=f"listing_bundle_{sid}.zip")

    # ── 17c. 操作日志（append-only 审计，事务安全层）──
    @app.route("/api/commerce-agent/action-log")
    def api_commerce_action_log():
        from web.services import safety

        sid = str(request.args.get("sessionId", "") or "").strip()
        limit = min(200, int(request.args.get("limit", 50) or 50))
        return jsonify({"logs": safety.recent_logs(limit, sid)})

    # ── 15. 品牌画册（整套成图拼成杂志级分享页）──
    @app.route("/api/commerce-agent/album", methods=["POST"])
    def api_commerce_album():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import album

        sid = str(_json("sessionId", "") or "").strip()
        if not sid:
            return jsonify({"error": "sessionId 不能为空"}), 400
        out_dir = _session_out_dir(sid)
        engine = sessions.get(sid)
        profile = (engine.context.get("profile") or {}) if engine else None
        try:
            album.build_album(sid, out_dir, profile)
        except ValueError as e:
            return jsonify({"error": str(e), "csrf_token": issue_csrf_token()}), 404
        except Exception as e:  # noqa: BLE001 — 画册失败要给用户明确原因
            return jsonify({"error": f"画册生成失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        return jsonify({
            "url": f"/api/commerce-agent/album/{sid}",
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/commerce-agent/album/<sid>")
    def api_commerce_album_view(sid):
        from flask import send_file

        path = os.path.join(_session_out_dir(sid), "album.html")
        if not os.path.exists(path):
            return jsonify({"error": "还没有生成画册"}), 404
        return send_file(path, mimetype="text/html")

    # ── 8. 主图卖点文案叠加（LLM 文案 + 排版渲染成品图）──
    @app.route("/api/commerce-agent/caption", methods=["POST"])
    def api_commerce_caption():
        if not validate_csrf(str(_json("csrf_token", "") or "")):
            return jsonify({"error": "CSRF 验证失败，请刷新页面后重试",
                            "csrf_token": issue_csrf_token()}), 403

        from web.services import caption_overlay

        sid = str(_json("sessionId", "") or "").strip()
        image_id = str(_json("imageId", "") or "").strip()
        custom_text = str(_json("text", "") or "").strip()
        layout = str(_json("layout", "") or "").strip().lower()
        if not sid or not image_id:
            return jsonify({"error": "sessionId 与 imageId 不能为空"}), 400

        src, out_dir = _find_source_image(sid, image_id)
        if not src:
            return jsonify({"error": f"没有找到图片 {image_id}，请先生成",
                            "csrf_token": issue_csrf_token()}), 404

        plan_entry = next(
            (p for p in _plan_for(sid)
             if image_id in (p.get("id"), p.get("scene_id"))), {}) or {}
        engine = sessions.get(sid)
        profile = (engine.context.get("profile") or {}) if engine else {}

        # 宣传海报走左侧文案位排版；scene_11 自动识别
        is_poster = layout == "poster" or image_id.startswith("scene_11")
        stem = os.path.splitext(os.path.basename(src))[0]
        try:
            if is_poster:
                headline, subline, cta = caption_overlay.build_poster_copy(
                    custom_text, plan_entry, profile)
                dst = os.path.join(out_dir, "layout", f"{stem}_poster.jpg")
                caption_overlay.render_poster(src, dst, headline, subline, cta)
            else:
                headline, subline = caption_overlay.build_copy(
                    custom_text, plan_entry, profile)
                cta = ""
                dst = os.path.join(out_dir, "layout", f"{stem}_caption.jpg")
                caption_overlay.render_caption(src, dst, headline, subline)
        except Exception as e:  # noqa: BLE001 — 排版失败要给用户明确原因
            return jsonify({"error": f"文案叠加失败：{e}",
                            "csrf_token": issue_csrf_token()}), 500

        return jsonify({
            "url": f"/api/image/{sid}/layout/{os.path.basename(dst)}",
            "headline": headline,
            "subline": subline,
            "cta": cta,
            "layout": "poster" if is_poster else "caption",
            "csrf_token": issue_csrf_token(),
        })

    # ── 后台执行 ──

    def _record_usage(sid: str, done_count: int, seconds: float, mock: bool):
        """累计会话生成用量（轮数/张数/耗时），供成本观测。"""
        try:
            record = load_session_record(sid)
            usage = record.get("usage") or {}
            usage["rounds"] = int(usage.get("rounds", 0)) + 1
            usage["images"] = int(usage.get("images", 0)) + int(done_count)
            usage["seconds"] = round(float(usage.get("seconds", 0)) + seconds, 1)
            if mock:
                usage["mock_rounds"] = int(usage.get("mock_rounds", 0)) + 1
            record["usage"] = usage
            save_session_record(sid, record)
        except Exception:  # noqa: BLE001 — 统计失败不影响主流程
            pass

    def _run_real_generation(engine, task, sid, scenes):
        t0 = time.time()
        try:
            def progress_callback(agent, stage, msg, **extra):
                prev = tasks.progress.get(sid, {})
                payload = {"stage": stage, "message": msg, "agent": agent,
                           "task_type": task.get("type", "")}
                if "scenes" not in extra and prev.get("scenes"):
                    extra = {**extra, "scenes": prev["scenes"]}
                payload.update(extra)
                if payload.get("scenes"):
                    payload["scenes"] = merge_scenes_with_disk(sid, payload["scenes"])
                tasks.progress[sid] = payload

            report = engine.step_executor_execute(
                task, progress_callback, cancel_check=tasks.make_cancel_check(sid))
            if not report:
                tasks.results[sid] = {"status": "error", "error": "执行者返回空报告",
                                      "error_type": "empty_executor_report"}
                return
            supervision = engine.step_observer_supervise(report)
            engine._sync_execution_results(report)
            images = (engine.context.get("generated_images", [])
                      or report.get("data", {}).get("images", []))
            identity_scores = report.get("data", {}).get("identity_scores") or {}
            if identity_scores:
                record = load_session_record(sid)
                merged_scores = {**(record.get("identity_scores") or {}),
                                 **identity_scores}
                record["identity_scores"] = merged_scores
                save_session_record(sid, record)
            cancelled = report.get("status") == "cancelled"
            scene_states = merge_scenes_with_disk(
                sid,
                [{"scene_id": s["scene_id"], "scene_name": s["scene_name"],
                  "status": "pending"} for s in scenes],
            )
            final_reply = supervision.get("user_message", "")
            if final_reply:
                append_chat_message(sid, "observer", final_reply,
                                    {"commerce": True, "final": True})
            _persist_thumb(sid, scene_states)
            elapsed = round(time.time() - t0, 1)
            done_count = sum(1 for s in scene_states if s.get("status") == "done")
            _record_usage(sid, done_count, elapsed, mock=False)
            tasks.results[sid] = {
                "status": ("cancelled" if cancelled
                           else "completed" if supervision.get("approved")
                           else "supervision_failed"),
                "supervision_approved": supervision.get("approved", False),
                "task_type": task.get("type", ""),
                "final_reply": supervision.get("user_message", ""),
                "images": images,
                "scenes": scene_states,
                "session_id": sid,
                "download_url": f"/api/download/{sid}" if images else "",
                "trace": report.get("trace", {}),
                "elapsed": elapsed,
            }
        except Exception as e:  # noqa: BLE001 — 后台线程必须自兜底
            tasks.results[sid] = {"status": "error", "error": str(e),
                                  "error_type": "executor_exception"}

    def _run_mock_generation(engine, sid, scenes):
        """生成本地概念预览；结果只供查看，不能作为真实成片发布。"""
        t0 = time.time()
        try:
            raw_dir = os.path.join(engine.context.get("output_dir", ""), "raw")
            os.makedirs(raw_dir, exist_ok=True)
            states = [{"scene_id": s["scene_id"], "scene_name": s["scene_name"],
                       "status": "pending"} for s in scenes]
            for i, scene in enumerate(scenes):
                states[i]["status"] = "generating"
                tasks.progress[sid] = {
                    "stage": "generate",
                    "message": f"正在生成第 {i + 1}/{len(scenes)} 张（演示模式，未配置生图 Key）…",
                    "task_type": "generate",
                    "scenes": list(states), "total": len(scenes), "completed": i,
                }
                time.sleep(0.6)
                filename = f"{scene['scene_id']}.jpg"
                _draw_mock_image(os.path.join(raw_dir, filename), scene, i + 1, len(scenes))
                states[i]["status"] = "done"
                states[i]["filename"] = f"raw/{filename}"
            append_chat_message(
                sid, "observer",
                f"演示模式已生成 {len(scenes)} 张情绪概念预览图（未配置生图 API Key，非真实成片）。",
                {"commerce": True, "final": True, "mock": True},
            )
            _persist_thumb(sid, states)
            elapsed = round(time.time() - t0, 1)
            _record_usage(sid, len(scenes), elapsed, mock=True)
            tasks.results[sid] = {
                "status": "mock_preview",
                "supervision_approved": False,
                "task_type": "generate",
                "final_reply": ("演示模式已生成情绪概念预览图（非真实商品成片）。"
                                "在 agent/.env 配置 OPENAI_IMAGE_API_KEY 后即可生成真实图片。"),
                "images": [],
                "scenes": states,
                "session_id": sid,
                "download_url": f"/api/download/{sid}",
                "mock": True,
                "elapsed": elapsed,
            }
        except Exception as e:  # noqa: BLE001
            tasks.results[sid] = {"status": "error", "error": str(e),
                                  "error_type": "mock_generation_exception"}

    def _draw_mock_image(path, scene, index, total):
        from PIL import Image, ImageDraw, ImageFont

        ratio = scene.get("aspect_ratio", "1:1")
        w = 768
        h = {"1:1": 768, "4:3": 576, "3:4": 1024, "16:9": 432}.get(ratio, 768)
        title = scene.get("scene_name_cn") or scene.get("scene_name") or "情绪场景图"
        purpose = scene.get("purpose") or scene.get("emotion") or "上架概念预览"
        use = scene.get("ecommerce_use") or "跨境电商上架图"

        def font(size: int, bold: bool = False):
            candidates = [
                r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
                r"C:\Windows\Fonts\simhei.ttf",
                r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
            ]
            for item in candidates:
                try:
                    return ImageFont.truetype(item, size)
                except OSError:
                    continue
            return ImageFont.load_default()

        def wrap(text: str, fnt, max_width: int, max_lines: int = 2) -> list[str]:
            text = str(text or "").strip()
            if not text:
                return []
            lines: list[str] = []
            cur = ""
            for ch in text:
                trial = cur + ch
                box = d.textbbox((0, 0), trial, font=fnt)
                if box[2] - box[0] <= max_width or not cur:
                    cur = trial
                    continue
                lines.append(cur)
                cur = ch
                if len(lines) >= max_lines:
                    break
            if cur and len(lines) < max_lines:
                lines.append(cur)
            if len(lines) == max_lines and len("".join(lines)) < len(text):
                lines[-1] = lines[-1].rstrip("，。,. ") + "..."
            return lines

        img = Image.new("RGB", (w, h), "#FFF6EA")
        d = ImageDraw.Draw(img)
        for y in range(h):
            t = y / max(h - 1, 1)
            top = (255, 247, 232)
            mid = (246, 229, 255)
            bot = (220, 214, 255)
            if t < 0.55:
                p = t / 0.55
                color = tuple(int(top[i] * (1 - p) + mid[i] * p) for i in range(3))
            else:
                p = (t - 0.55) / 0.45
                color = tuple(int(mid[i] * (1 - p) + bot[i] * p) for i in range(3))
            d.line([(0, y), (w, y)], fill=color)

        floor_y = int(h * 0.68)
        d.rectangle([0, floor_y, w, h], fill=(236, 224, 255))
        for i in range(18):
            y = floor_y + i * max(1, (h - floor_y) // 18)
            t = i / 18
            d.line([(0, y), (w, y)],
                   fill=(int(236 - 30 * t), int(224 - 28 * t), int(255 - 20 * t)))

        margin = int(w * 0.08)
        card = [margin, int(h * 0.13), w - margin, int(h * 0.86)]
        d.rounded_rectangle(card, radius=36, fill=(255, 252, 247),
                            outline=(255, 255, 255), width=3)
        d.rounded_rectangle([card[0] + 10, card[1] + 10,
                             card[2] - 10, card[3] - 10],
                            radius=30, outline=(236, 222, 255), width=2)

        badge_font = font(max(18, w // 38), True)
        small_font = font(max(18, w // 42))
        body_font = font(max(22, w // 34))
        title_font = font(max(32, min(w // 18, h // 13)), True)
        d.rounded_rectangle([card[0] + 28, card[1] + 26,
                             card[0] + 190, card[1] + 66],
                            radius=20, fill=(122, 103, 255))
        d.text((card[0] + 48, card[1] + 35), f"概念稿 {index}/{total}",
               fill="#FFFFFF", font=badge_font)
        d.rounded_rectangle([card[2] - 236, card[1] + 26,
                             card[2] - 28, card[1] + 66],
                            radius=20, fill=(255, 236, 214))
        d.text((card[2] - 216, card[1] + 35), "演示模式 · 非最终图",
               fill="#9A4B22", font=small_font)

        cx, cy = w // 2, int(h * 0.59)
        box_w, box_h = int(w * 0.34), int(h * 0.24)
        d.ellipse([cx - box_w // 2 - 34, cy + box_h // 2 - 8,
                   cx + box_w // 2 + 34, cy + box_h // 2 + 26],
                  fill=(196, 181, 231))
        gift = [cx - box_w // 2, cy - box_h // 2, cx + box_w // 2, cy + box_h // 2]
        d.rounded_rectangle(gift, radius=28, fill=(255, 255, 255),
                            outline=(122, 103, 255), width=4)
        d.rounded_rectangle([cx - int(box_w * 0.08), gift[1],
                             cx + int(box_w * 0.08), gift[3]],
                            radius=10, fill=(255, 145, 155))
        d.rounded_rectangle([gift[0], cy - int(box_h * 0.08),
                             gift[2], cy + int(box_h * 0.08)],
                            radius=10, fill=(255, 145, 155))
        d.polygon([(cx - 22, gift[1] - 4), (cx - 92, gift[1] - 38),
                   (cx - 54, gift[1] + 12)], fill=(255, 174, 92))
        d.polygon([(cx + 22, gift[1] - 4), (cx + 92, gift[1] - 38),
                   (cx + 54, gift[1] + 12)], fill=(255, 174, 92))
        d.rounded_rectangle([cx - 54, cy - 22, cx + 54, cy + 22],
                            radius=16, fill=(255, 248, 233),
                            outline=(255, 210, 126), width=2)
        d.text((cx, cy), "产品位", fill="#7A67FF", font=body_font, anchor="mm")

        y0 = max(int(h * 0.28), card[1] + 96)
        for line in wrap(title, title_font, int(w * 0.72), 2):
            d.text((cx, y0), line, fill="#1F1F2A", font=title_font, anchor="mm")
            y0 += int(title_font.size * 1.25)
        for line in wrap(purpose, body_font, int(w * 0.68), 2):
            d.text((cx, y0 + 4), line, fill="#6D617F", font=body_font, anchor="mm")
            y0 += int(body_font.size * 1.25)

        chips = ["送礼感", "温暖光线", "平台可用"]
        scene_id = str(scene.get("scene_id", "")).lower()
        if "主图" in title or "hero" in scene_id:
            chips = ["主体突出", "点击感", "干净高级"]
        elif "场景" in title or "gift" in title.lower() or "礼" in title:
            chips = ["送礼情绪", "生活场景", "开箱期待"]
        chip_y = int(h * 0.77)
        chip_font = font(max(18, w // 42), True)
        widths = [d.textbbox((0, 0), c, font=chip_font)[2] + 44 for c in chips]
        x = cx - (sum(widths) + 14 * (len(chips) - 1)) // 2
        for label, chip_w in zip(chips, widths):
            d.rounded_rectangle([x, chip_y, x + chip_w, chip_y + 42],
                                radius=21, fill=(245, 239, 255),
                                outline=(226, 215, 255), width=1)
            d.text((x + chip_w / 2, chip_y + 10), label, fill="#6250E8",
                   font=chip_font, anchor="ma")
            x += chip_w + 14

        footer_font = font(max(16, w // 46))
        footer = f"{use} · 配置 OPENAI_IMAGE_API_KEY 后生成真实成品"
        d.text((cx, h - 38), footer, fill="#8B8B9A", font=footer_font, anchor="mm")
        img.save(path, "JPEG", quality=92)
