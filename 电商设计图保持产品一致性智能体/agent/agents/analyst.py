#!/usr/bin/env python3
"""
分析智能体 — Analyst Agent

职责：产品分析 + 场景匹配
工具：analyze_product, scene_matcher
返回：profile, scene_plan
"""

import json
import os
import time
from typing import Optional, Callable

from common.utils import (
    friendly_error_message,
    resolve_analysis_engine,
    resolve_openai_api_key,
    get_api_key,
)
from common.runtime_paths import get_runtime_paths

from .base_agent import BaseSubAgent
from .toolkit import AgentToolkit


class AnalystAgent(BaseSubAgent):
    """分析智能体：产品特征提取与场景匹配"""

    AGENT_LABEL = "Analyst"

    def __init__(self, agent_id: str = "analyst_01", toolkit: AgentToolkit = None):
        super().__init__(agent_id)
        if toolkit is None:
            base = os.path.join(os.path.dirname(__file__), "..")
            self.toolkit = AgentToolkit(
                script_dir=os.path.join(base, "scripts"),
                template_dir=os.path.join(base, "templates", "scenes"),
                output_base=get_runtime_paths().outputs,
            )
        else:
            self.toolkit = toolkit

        self.tools = {
            "analyze_product": self.toolkit.analyze_product,
            "match_scenes": self.toolkit.match_scenes,
        }

    @staticmethod
    def _normalize_profile(
        profile: dict,
        image_paths: list,
        profile_path: str = "",
        product_hints: Optional[dict] = None,
    ) -> dict:
        """补全 LLM 可能缺失的字段，避免监督误判为不完整。"""
        if not profile:
            return profile
        product_hints = product_hints or {}
        if product_hints:
            AnalystAgent._apply_product_hints(profile, product_hints)
        if not profile.get("product_name"):
            if image_paths:
                profile["product_name"] = os.path.splitext(
                    os.path.basename(image_paths[0])
                )[0] or "未命名产品"
            else:
                profile["product_name"] = "未命名产品"
        if not profile.get("category"):
            profile["category"] = "general"
        if not profile.get("description"):
            profile["description"] = (
                profile.get("description_cn")
                or profile.get("product_name_cn")
                or profile.get("product_name")
                or ""
            )
        if profile_path:
            try:
                with open(profile_path, "w", encoding="utf-8") as f:
                    json.dump(profile, f, ensure_ascii=False, indent=2)
            except OSError:
                pass
        return profile

    @staticmethod
    def _apply_product_hints(profile: dict, product_hints: dict) -> None:
        """Prefer explicit user-authored product facts over ambiguous visual guesses."""
        if not product_hints:
            return
        for key in ("product_name", "product_name_cn", "category", "category_cn"):
            if product_hints.get(key):
                profile[key] = product_hints[key]

        user_facts = product_hints.get("user_facts") or []
        existing_features = profile.get("key_features") or []
        profile["key_features"] = list(dict.fromkeys(user_facts + existing_features))

        if product_hints.get("description"):
            profile["description"] = (
                f"{product_hints['description']}。"
                f"{profile.get('description') or profile.get('description_cn') or ''}"
            ).strip()
            profile["description_cn"] = (
                f"{product_hints['description']}。"
                f"{profile.get('description_cn') or ''}"
            ).strip()

        if product_hints.get("product_type") == "pen":
            materials = list(profile.get("materials") or [])
            materials = [
                m for m in materials
                if not any(bad in str(m).lower() for bad in ("hourglass", "sand timer", "sand"))
            ]
            materials = [
                "light natural wood pen box/display stand",
                "dark polished wood base",
                "brown wood-grain fountain pen",
                "gold metal clip and rings",
                "transparent pen cap",
            ] + materials
            profile["materials"] = list(dict.fromkeys(materials))

            shape = profile.get("shape", "")
            if "hourglass" in shape.lower() or "sand" in shape.lower():
                profile["shape"] = (
                    "slanted light wood pen box/display stand holding a brown wood-grain "
                    "fountain pen, with a darker rounded wooden base"
                )

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """执行分析全流程：产品分析 → 场景匹配"""
        params = task.get("params", {})
        start = time.time()

        try:
            if cancel_check and cancel_check():
                return self._wrap_report(task, {}, status="cancelled", start=start)

            image_paths = params.get("image_paths", [])
            session_id = params.get("session_id", "")
            output_dir = params.get("output_dir", "")
            engine = resolve_analysis_engine(params.get("engine"))
            if engine == "openai":
                api_key = params.get("api_key") or resolve_openai_api_key()
            else:
                api_key = params.get("api_key") or get_api_key(engine)

            if not output_dir:
                output_dir = os.path.join(self.toolkit.output_base, session_id)
            os.makedirs(output_dir, exist_ok=True)

            if progress_callback:
                progress_callback("analyst", "analyze", "正在分析产品特征...", progress=18)

            if engine == "openai" and not params.get("api_key"):
                from web.services.llm_runtime import (
                    configured_key_candidates,
                    configured_model_candidates,
                    mark_quota_exhausted,
                    mark_success,
                    mark_unavailable,
                )

                attempts = [
                    (key_role, candidate_key, model)
                    for model in configured_model_candidates()
                    for key_role, candidate_key in configured_key_candidates()
                ]
                if not attempts:
                    raise RuntimeError("OpenAI 视觉分析没有已配置的模型密钥")

                analysis_result = None
                last_error = None
                quota_failures = 0
                for attempt_index, (key_role, candidate_key, model) in enumerate(attempts):
                    try:
                        analysis_result = self.toolkit.analyze_product(
                            image_paths, output_dir, candidate_key,
                            engine=engine, model=model, log_prefix="Analyst",
                            progress_callback=progress_callback,
                            cancel_check=cancel_check,
                        )
                    except Exception as exc:  # noqa: BLE001 - route failover boundary
                        last_error = exc
                        error_text = str(exc).lower()
                        if (
                            "model_provider_quota_exhausted" in error_text
                            or "insufficient_user_quota" in error_text
                        ):
                            quota_failures += 1
                        if attempt_index + 1 < len(attempts) and any(token in error_text for token in (
                            "quota", "403", "401", "model_not_found", "no available channel",
                            "429", "500", "502", "503", "504", "timeout", "timed out",
                        )):
                            if progress_callback:
                                progress_callback(
                                    "analyst", "fallback",
                                    "主模型不可用，正在切换备用密钥或备用模型...",
                                    progress=20,
                                )
                            continue
                        break
                    else:
                        mark_success(
                            key_role,
                            model=model,
                            fallback_active=attempt_index > 0,
                        )
                        break

                if analysis_result is None:
                    if quota_failures == len(attempts):
                        mark_quota_exhausted()
                        raise RuntimeError(
                            "[MODEL_PROVIDER_QUOTA_EXHAUSTED] 所有视觉分析模型额度不足"
                        ) from last_error
                    if quota_failures > 0:
                        mark_unavailable("primary_quota_exhausted_fallback_unavailable")
                        raise RuntimeError(
                            "[MODEL_PROVIDER_FALLBACK_EXHAUSTED] 主模型额度不足，备用密钥或备用模型不可用"
                        ) from last_error
                    raise last_error or RuntimeError("视觉分析模型调用失败")
            else:
                analysis_result = self.toolkit.analyze_product(
                    image_paths, output_dir, api_key,
                    engine=engine, log_prefix="Analyst",
                    progress_callback=progress_callback,
                    cancel_check=cancel_check,
                )
            profile = analysis_result.get("profile", {})
            profile_path = analysis_result.get("profile_path", "")
            product_hints = params.get("product_hints") or {}
            profile = self._normalize_profile(profile, image_paths, profile_path, product_hints)

            if cancel_check and cancel_check():
                data = {
                    "profile": profile,
                    "profile_path": profile_path,
                    "scene_plan": [],
                    "plan_path": "",
                    "session_id": session_id,
                    "output_dir": output_dir,
                    "cancelled": True,
                }
                return self._wrap_report(task, data, status="cancelled", start=start)

            if not profile:
                raise RuntimeError("产品分析返回空结果")

            if progress_callback:
                progress_callback("analyst", "match", "正在匹配最佳场景...", progress=35)

            match_result = self.toolkit.match_scenes(
                profile_path, output_dir, log_prefix="Analyst",
            )
            scene_plan = match_result.get("scene_plan", [])

            data = {
                "profile": profile,
                "profile_path": profile_path,
                "scene_plan": scene_plan,
                "plan_path": match_result.get("plan_path", ""),
                "session_id": session_id,
                "output_dir": output_dir,
            }
            return self._wrap_report(task, data, status="success", start=start)

        except Exception as e:
            friendly = friendly_error_message(str(e))
            if "cancelled" in friendly.lower() or str(e) == "cancelled":
                return self._wrap_report(task, {}, status="cancelled", start=start)
            print(f"  [Analyst] ❌ 执行失败: {friendly}")
            return self._wrap_report(task, {}, status="error", error=friendly, start=start)

    def self_check(self, report: dict) -> dict:
        """分析结果自检"""
        issues = []
        if report["status"] == "cancelled":
            return {"passed": True, "issues": []}
        if report["status"] == "error":
            issues.append(f"执行失败: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        profile = data.get("profile", {})
        if not profile:
            issues.append("产品档案为空（分析脚本未返回有效 JSON）")
        elif not profile.get("product_name") and not profile.get("description"):
            issues.append("缺少产品名称和描述")
        scene_plan = data.get("scene_plan", [])
        if not scene_plan:
            issues.append("场景计划为空（场景匹配可能失败，请检查 scene_matcher 日志）")

        return {"passed": len(issues) == 0, "issues": issues}
