#!/usr/bin/env python3
"""Shared session memory for the multi-agent runtime.

Mutable state is stored below ``AGENT_RUNTIME_DIR`` when configured. This keeps
source checkouts read-only and lets container deployments mount one durable
runtime volume.
"""

from __future__ import annotations

import json
import os
import time
from copy import deepcopy
from typing import Any, Optional

from common.runtime_paths import get_runtime_paths
from web.services.shared_state import get_shared_redis_client, state_namespace

EVENT_LOG_LIMIT = 200

# Keys managed by the blackboard (excluding nested preference fields)
_SCALAR_KEYS = frozenset({
    "profile", "profile_path", "scene_plan", "plan_path", "confirmed_scenes",
    "raw_images", "layout_images", "platform_outputs",
    "consistency_score", "consistency_report",
    "external_consistency_score", "external_consistency_status",
    "external_consistency_issues", "external_consistency_recommendations",
    "session_id", "image_paths", "output_dir", "revision", "event_log",
    "product_name", "watermark_path",
    "research_report", "reference_urls",
})

_PREFERENCE_KEYS = frozenset({
    "liked_scenes", "disliked_scenes", "brand_name", "platforms",
    "quality", "auto_engine", "watermark_path",
    "markets", "region", "festival",
})

def _default_platforms():
    from common.utils import CROSS_BORDER_PLATFORMS
    return list(CROSS_BORDER_PLATFORMS)


def _sessions_root(base_dir: Optional[str] = None) -> str:
    if base_dir:
        return base_dir
    return get_runtime_paths().sessions


def _blackboard_path(session_id: str, base_dir: Optional[str] = None) -> str:
    return os.path.join(_sessions_root(base_dir), session_id, "blackboard.json")


def _blackboard_redis_key(session_id: str) -> str:
    return f"{state_namespace()}:blackboard:{session_id}"


class SharedBlackboard:
    """Session-scoped shared memory for all agents."""

    def __init__(self, session_id: str, output_dir: str = "", base_dir: Optional[str] = None):
        self.session_id = session_id
        self.base_dir = base_dir
        self.profile: dict | None = None
        self.profile_path: str = ""
        self.scene_plan: list = []
        self.plan_path: str = ""
        self.confirmed_scenes: list | None = None

        self.preferences: dict = {
            "liked_scenes": {},
            "disliked_scenes": {},
            "brand_name": "",
            "platforms": _default_platforms(),
            "quality": "standard",
            "auto_engine": False,
            "watermark_path": "",
        }

        self.raw_images: list = []
        self.layout_images: list = []
        self.platform_outputs: dict = {}
        self.consistency_score: float | None = None
        self.consistency_report: dict | None = None
        self.external_consistency_score: float | None = None
        self.external_consistency_status: str = ""
        self.external_consistency_issues: list = []
        self.external_consistency_recommendations: list = []

        self.image_paths: list = []
        self.output_dir = output_dir or ""
        self.product_name: str = ""
        self.research_report: dict | None = None
        self.reference_urls: list = []
        self.memory_profile: dict = {
            "user_preferences": {},
            "project_memory": {},
            "success_patterns": [],
            "failure_patterns": [],
        }
        self.revision: int = 0
        self.plan_version: int = 0
        self.plan_history: list = []
        self.event_log: list = []

    # ── persistence ──

    @classmethod
    def load(cls, session_id: str, base_dir: Optional[str] = None,
             output_dir: str = "") -> SharedBlackboard:
        path = _blackboard_path(session_id, base_dir)
        bb = cls(session_id, output_dir=output_dir, base_dir=base_dir)
        client = get_shared_redis_client()
        if client is not None:
            raw = client.get(_blackboard_redis_key(session_id))
            if raw:
                try:
                    bb._apply_snapshot(json.loads(raw))
                    if output_dir and not bb.output_dir:
                        bb.output_dir = output_dir
                    return bb
                except (json.JSONDecodeError, TypeError):
                    pass
        if not os.path.exists(path):
            return bb
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            bb._apply_snapshot(data)
        except (json.JSONDecodeError, OSError, TypeError):
            pass
        if output_dir and not bb.output_dir:
            bb.output_dir = output_dir
        return bb

    def save(self) -> str:
        """Persist the current snapshot in the configured runtime directory."""
        path = _blackboard_path(self.session_id, self.base_dir)
        snapshot = self.to_dict()
        client = get_shared_redis_client()
        if client is not None:
            client.set(
                _blackboard_redis_key(self.session_id),
                json.dumps(snapshot, ensure_ascii=False, default=str),
                ex=7 * 24 * 60 * 60,
            )
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        return path

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "profile": self.profile,
            "profile_path": self.profile_path,
            "scene_plan": self.scene_plan,
            "plan_path": self.plan_path,
            "confirmed_scenes": self.confirmed_scenes,
            "preferences": deepcopy(self.preferences),
            "raw_images": self.raw_images,
            "layout_images": self.layout_images,
            "platform_outputs": self.platform_outputs,
            "consistency_score": self.consistency_score,
            "consistency_report": self.consistency_report,
            "external_consistency_score": self.external_consistency_score,
            "external_consistency_status": self.external_consistency_status,
            "external_consistency_issues": self.external_consistency_issues,
            "external_consistency_recommendations": self.external_consistency_recommendations,
            "image_paths": self.image_paths,
            "output_dir": self.output_dir,
            "product_name": self.product_name,
            "research_report": self.research_report,
            "reference_urls": self.reference_urls,
            "memory_profile": deepcopy(self.memory_profile),
            "revision": self.revision,
            "plan_version": self.plan_version,
            "plan_history": self.plan_history[-50:],
            "event_log": self.event_log[-200:],
        }

    def _apply_snapshot(self, data: dict):
        for key in _SCALAR_KEYS:
            if key in data:
                setattr(self, key, data[key])
        if "preferences" in data and isinstance(data["preferences"], dict):
            self.preferences.update(data["preferences"])
        if "product_name" in data:
            self.product_name = data["product_name"]
        if "memory_profile" in data and isinstance(data["memory_profile"], dict):
            self.memory_profile.update(data["memory_profile"])
        if "plan_version" in data:
            self.plan_version = data["plan_version"]
        if "plan_history" in data and isinstance(data["plan_history"], list):
            self.plan_history = data["plan_history"]

    # ── access ──

    def get(self, key: str, default: Any = None) -> Any:
        if key == "preferences":
            return self.preferences
        if key in _PREFERENCE_KEYS:
            return self.preferences.get(key, default)
        if hasattr(self, key):
            val = getattr(self, key)
            return val if val is not None else default
        return default

    def set(self, key: str, value: Any, agent_id: str = "system") -> None:
        if key in _PREFERENCE_KEYS:
            self.preferences[key] = value
        elif key == "generated_images":
            self.layout_images = value
        elif hasattr(self, key) or key in _SCALAR_KEYS:
            setattr(self, key, value)
        else:
            raise KeyError(f"Unknown blackboard key: {key}")
        self.revision += 1
        self.append_event(agent_id, "set", {"key": key})

    def update(self, partial: dict, agent_id: str = "system") -> None:
        for key, value in partial.items():
            if key in _PREFERENCE_KEYS:
                self.preferences[key] = value
            elif key == "generated_images":
                self.layout_images = value
            elif hasattr(self, key):
                setattr(self, key, value)
        self.revision += 1
        self.append_event(agent_id, "update", {"keys": list(partial.keys())})

    def append_event(self, agent_id: str, action: str, detail: Any = None) -> None:
        entry = {
            "event_type": action,
            "agent_id": agent_id,
            # english_textfieldstext（english_text action/agent read）
            "action": action,
            "agent": agent_id,
            "session_id": self.session_id,
            "detail": detail,
            "timestamp": time.time(),
            "revision": self.revision,
        }
        if isinstance(detail, dict):
            task_id = detail.get("task_id")
            if task_id:
                entry["task_id"] = task_id
            if "key" in detail:
                entry["key"] = detail["key"]
            if "status" in detail:
                entry["status"] = detail["status"]
        self.event_log.append(entry)
        if len(self.event_log) > EVENT_LOG_LIMIT:
            self.event_log = self.event_log[-EVENT_LOG_LIMIT:]

    # ── feedback ──

    def merge_feedback(self, liked: list | None = None, disliked: list | None = None,
                       agent_id: str = "observer") -> dict:
        """Update preference counters from liked/disliked filenames or scene ids."""
        liked = liked or []
        disliked = disliked or []
        liked_map = dict(self.preferences.get("liked_scenes", {}))
        disliked_map = dict(self.preferences.get("disliked_scenes", {}))

        def _scene_id(name: str) -> str:
            base = os.path.basename(str(name))
            stem = os.path.splitext(base)[0]
            if stem.startswith("scene_"):
                return stem
            for part in stem.split("_"):
                if part.startswith("scene"):
                    return stem
            return stem

        for item in liked:
            sid = _scene_id(item)
            liked_map[sid] = liked_map.get(sid, 0) + 1
            disliked_map.pop(sid, None)

        for item in disliked:
            sid = _scene_id(item)
            disliked_map[sid] = disliked_map.get(sid, 0) + 1
            liked_map.pop(sid, None)

        self.preferences["liked_scenes"] = liked_map
        self.preferences["disliked_scenes"] = disliked_map
        self.memory_profile.setdefault("user_preferences", {})["liked_scenes"] = liked_map
        self.memory_profile.setdefault("user_preferences", {})["disliked_scenes"] = disliked_map
        self.revision += 1
        self.append_event(agent_id, "merge_feedback", {
            "liked": len(liked),
            "disliked": len(disliked),
        })
        return {
            "liked_scenes": liked_map,
            "disliked_scenes": disliked_map,
        }

    def user_preferences_for_matcher(self) -> dict:
        """Format preferences for scene_matcher.score_scenes / select_top_scenes."""
        return {
            "liked_scenes": dict(self.preferences.get("liked_scenes", {})),
            "disliked_scenes": dict(self.preferences.get("disliked_scenes", {})),
        }

    def get_reflection_history(self, task_type: str | None = None, status: str | None = None, approved: bool | None = None, limit: int = 10) -> list:
        """Return recent reflection entries filtered by task type/status/approval."""
        entries = []
        for bucket in (self.memory_profile.get("success_patterns", []), self.memory_profile.get("failure_patterns", [])):
            entries.extend(bucket or [])
        if task_type:
            entries = [e for e in entries if e.get("task_type") == task_type]
        if status:
            entries = [e for e in entries if e.get("status") == status]
        if approved is not None:
            entries = [e for e in entries if bool(e.get("approved")) == approved]
        return entries[-limit:]

    def get_reflection_summary(self, task_type: str | None = None, limit: int = 5) -> list:
        """Compress reflections into planning-friendly experience hints."""
        reflections = self.get_reflection_history(limit=50)
        scored = []
        now = time.time()
        for item in reflections:
            task = item.get("task_type", "")
            if task_type and task != task_type:
                continue
            ts = float(item.get("timestamp", now))
            age_days = max(0.0, (now - ts) / 86400.0)
            recency = max(0.2, 1.0 - min(age_days, 30.0) / 30.0)
            approved = bool(item.get("approved"))
            status = item.get("status", "")
            risk_boost = 1.0
            if not approved or status in ("error", "supervision_failed", "replanned"):
                risk_boost = 1.35
            elif status == "completed":
                risk_boost = 1.1
            score = recency * risk_boost
            scored.append((score, item))

        scored.sort(key=lambda x: x[0], reverse=True)
        hints = []
        seen = set()
        for _, item in scored:
            key = (item.get("task_type", ""), item.get("approved", False), item.get("status", ""), item.get("reason", "")[:60])
            if key in seen:
                continue
            seen.add(key)
            task = item.get("task_type", "task")
            if item.get("approved"):
                hint = f"{task}: successtext - {item.get('reason', 'english_text')}"
            else:
                hint = f"{task}: risktext - {item.get('reason', 'english_textfailed')}"
            hints.append(hint)
            if len(hints) >= limit:
                break
        return hints

    # ── LLM / UI views ──

    def to_context_dict(self) -> dict:
        """Compact snapshot for LLM orchestrator prompts."""
        profile = self.profile or {}
        prefs = self.preferences
        plat_files = sum(len(v) for v in self.platform_outputs.values())
        return {
            "session_id": self.session_id,
            "revision": self.revision,
            "event_count": len(self.event_log),
            "plan_version": self.plan_version,
            "product_name": self.product_name or profile.get("product_name", ""),
            "profile_summary": {
                "product_name": profile.get("product_name"),
                "category": profile.get("category_cn", profile.get("category")),
                "style": profile.get("style_cn", profile.get("style")),
            } if profile else None,
            "scene_count": len(self.scene_plan or []),
            "confirmed_scene_count": len(self.confirmed_scenes or []) if self.confirmed_scenes else None,
            "image_count": len(self.image_paths),
            "preferences": {
                "brand_name": prefs.get("brand_name", ""),
                "platforms": prefs.get("platforms", _default_platforms()),
                "quality": prefs.get("quality", "standard"),
                "auto_engine": prefs.get("auto_engine", False),
                "liked_scenes": list(prefs.get("liked_scenes", {}).keys())[:10],
                "disliked_scenes": list(prefs.get("disliked_scenes", {}).keys())[:10],
            },
            "generation": {
                "raw_count": len(self.raw_images),
                "layout_count": len(self.layout_images),
                "platform_file_count": plat_files,
                "platform_count": len(self.platform_outputs),
                "consistency_score": self.consistency_score,
                "external_consistency_score": self.external_consistency_score,
                "external_consistency_status": self.external_consistency_status,
            },
            "paths": {
                "profile_path": self.profile_path,
                "plan_path": self.plan_path,
                "output_dir": self.output_dir,
            },
            "recent_events": self.event_log[-8:],
            "memory_profile": {
                "user_preferences": {
                    "brand_name": prefs.get("brand_name", ""),
                    "platforms": prefs.get("platforms", _default_platforms()),
                    "quality": prefs.get("quality", "standard"),
                    "auto_engine": prefs.get("auto_engine", False),
                    "liked_scenes": list(prefs.get("liked_scenes", {}).keys())[:10],
                    "disliked_scenes": list(prefs.get("disliked_scenes", {}).keys())[:10],
                },
                "project_memory": self.memory_profile.get("project_memory", {}),
                "success_patterns": self.memory_profile.get("success_patterns", [])[-10:],
                "failure_patterns": self.memory_profile.get("failure_patterns", [])[-10:],
            },
            "research_summary": (self.research_report or {}).get("summary"),
            "reference_url_count": len(self.reference_urls or []),
        }

    def to_summary(self) -> dict:
        """Sanitized summary for Web UI debug panel."""
        prefs = self.preferences
        profile = self.profile or {}
        liked = prefs.get("liked_scenes", {})
        disliked = prefs.get("disliked_scenes", {})
        pref_parts = []
        if liked:
            pref_parts.append(f"👍 {len(liked)} scenetext")
        if disliked:
            pref_parts.append(f"👎 {len(disliked)} scenetext")
        if prefs.get("brand_name"):
            pref_parts.append(f"text: {prefs['brand_name']}")
        if self.memory_profile.get("success_patterns"):
            pref_parts.append(f"successtext: {len(self.memory_profile['success_patterns'])}")
        if self.memory_profile.get("failure_patterns"):
            pref_parts.append(f"failedtext: {len(self.memory_profile['failure_patterns'])}")
        return {
            "session_id": self.session_id,
            "revision": self.revision,
            "event_count": len(self.event_log),
            "plan_version": self.plan_version,
            "profile_name": profile.get("product_name") or self.product_name or "—",
            "scene_count": len(self.scene_plan or []),
            "platforms": prefs.get("platforms", _default_platforms()),
            "consistency_score": self.consistency_score,
            "external_consistency_score": self.external_consistency_score,
            "external_consistency_status": self.external_consistency_status,
            "preference_summary": " · ".join(pref_parts) if pref_parts else "textnoneenglish_text",
            "raw_images": len(self.raw_images),
            "layout_images": len(self.layout_images),
            "platform_outputs": {
                k: len(v) for k, v in self.platform_outputs.items()
            },
        }

    def to_legacy_context(self) -> dict:
        """Backward-compatible context dict for DualAgentEngine.context."""
        prefs = self.preferences
        plat_files = sum(len(v) for v in self.platform_outputs.values())
        return {
            "session_id": self.session_id,
            "image_paths": list(self.image_paths),
            "profile": self.profile,
            "profile_path": self.profile_path,
            "scene_plan": self.scene_plan,
            "plan_path": self.plan_path,
            "output_dir": self.output_dir,
            "generated_images": list(self.layout_images),
            "consistency_score": self.consistency_score or 0,
            "platform_file_count": plat_files,
            "platform_count": len(self.platform_outputs),
            "platforms": prefs.get("platforms", _default_platforms()),
            "brand_name": prefs.get("brand_name", ""),
            "watermark_path": prefs.get("watermark_path", ""),
            "quality": prefs.get("quality", "standard"),
            "auto_engine": prefs.get("auto_engine", False),
            "product_name": self.product_name,
            "confirmed_scenes": self.confirmed_scenes,
            "observer_state": {},
            "executor_state": {},
        }

    def sync_from_execution_report(self, report: dict, agent_id: str = "executor") -> None:
        """Apply executor report data to blackboard fields."""
        data = report.get("data", {})
        rtype = report.get("type", "")
        status = report.get("status", "")

        # failedreportenglish_textfailedtext（dataenglish_text，textfieldssync）
        if rtype == "error" or status == "error":
            self.memory_profile.setdefault("failure_patterns", []).append({
                "type": report.get("error_type", "error"),
                "task_type": data.get("task_type", rtype or ""),
                "status": "error",
                "approved": False,
                "reason": report.get("error", ""),
                "error": report.get("error", ""),
                "timestamp": time.time(),
            })
            self.memory_profile["failure_patterns"] = self.memory_profile["failure_patterns"][-50:]
            self.save()
            return

        if rtype == "analyze":
            self.update({
                "profile": data.get("profile"),
                "profile_path": data.get("profile_path", ""),
                "scene_plan": data.get("scene_plan") or [],
                "plan_path": data.get("plan_path", ""),
            }, agent_id=agent_id)
            product_name = (data.get("profile") or {}).get("product_name", "")
            if product_name:
                self.product_name = product_name
            self.memory_profile.setdefault("project_memory", {})["last_profile"] = data.get("profile")

        elif rtype == "generate":
            images = data.get("images", [])
            raw_dir = data.get("raw_dir", "")
            raw_images = self._collect_dir_images(raw_dir) if raw_dir else []
            if not raw_images and data.get("results"):
                raw_images = [
                    {"filename": os.path.basename(r.get("output_path", "")),
                     "scene_id": r.get("scene_id", "")}
                    for r in data["results"] if r.get("success")
                ]
            platform_outputs = self._collect_platform_outputs(data.get("platforms_dir", ""))
            report_data = None
            report_path = data.get("consistency_report") or data.get("report_path")
            if isinstance(report_path, str) and os.path.exists(report_path):
                try:
                    with open(report_path, "r", encoding="utf-8") as f:
                        report_data = json.load(f)
                except (json.JSONDecodeError, OSError):
                    pass
            if report_data is None and data.get("check_result"):
                report_data = data["check_result"]

            self.update({
                "layout_images": images,
                "raw_images": raw_images or images,
                "platform_outputs": platform_outputs,
                "consistency_score": data.get("consistency_score"),
                "consistency_report": report_data,
                "external_consistency_score": data.get("external_consistency_score"),
                "external_consistency_status": data.get("external_consistency_status", ""),
                "external_consistency_issues": data.get("external_consistency_issues", []),
                "external_consistency_recommendations": data.get("external_consistency_recommendations", []),
            }, agent_id=agent_id)
            if data.get("consistency_score") is not None:
                self.memory_profile.setdefault("success_patterns", []).append({
                    "type": "generate",
                    "task_type": "generate",
                    "status": status or "completed",
                    "approved": True,
                    "reason": f"generation {len(images)} text，consistency {data.get('consistency_score')}",
                    "score": data.get("consistency_score"),
                    "scene_count": len(images),
                    "platform_count": len(platform_outputs),
                    "timestamp": time.time(),
                })
                self.memory_profile["success_patterns"] = self.memory_profile["success_patterns"][-50:]
            if data.get("platforms"):
                self.preferences["platforms"] = data["platforms"]

        elif rtype == "adjust":
            adjusted = data.get("adjusted_plan")
            if adjusted:
                self.update({
                    "scene_plan": adjusted,
                    "confirmed_scenes": adjusted,
                }, agent_id=agent_id)
        elif rtype == "plan":
            self.plan_version += 1
            self.plan_history.append({
                "plan_version": self.plan_version,
                "intent": data.get("intent", ""),
                "goal": data.get("goal", ""),
                "risk_level": data.get("risk_level", "medium"),
                "needs_clarification": data.get("needs_clarification", False),
                "next_action": data.get("next_action", ""),
                "plan": data.get("plan", []),
                "timestamp": time.time(),
            })
            self.plan_history = self.plan_history[-50:]
            self.append_event(agent_id, "plan", {
                "plan_version": self.plan_version,
                "risk_level": data.get("risk_level", "medium"),
                "needs_clarification": data.get("needs_clarification", False),
            })

        elif rtype == "feedback":
            liked = data.get("liked") or []
            disliked = data.get("disliked") or []
            if liked or disliked:
                self.merge_feedback(liked, disliked, agent_id=agent_id)
            self.memory_profile.setdefault("project_memory", {})["last_feedback"] = {
                "liked": liked,
                "disliked": disliked,
                "timestamp": time.time(),
            }

        elif rtype in ("research", "web_search", "browse"):
            self.update({
                "research_report": {
                    "query": data.get("query", ""),
                    "summary": data.get("summary", ""),
                    "search_results": data.get("search_results", []),
                    "competitors": data.get("competitors", []),
                    "reference_images": data.get("reference_images", []),
                },
                "reference_urls": data.get("reference_urls") or [
                    r.get("url") for r in (data.get("search_results") or []) if r.get("url")
                ],
            }, agent_id=agent_id)

        self.save()

    def _collect_dir_images(self, directory: str) -> list:
        if not directory or not os.path.isdir(directory):
            return []
        exts = (".jpg", ".jpeg", ".png", ".webp")
        out = []
        for name in sorted(os.listdir(directory)):
            if name.lower().endswith(exts) and not name.startswith("_"):
                out.append({"filename": name, "scene_id": os.path.splitext(name)[0]})
        return out

    def _collect_platform_outputs(self, platforms_dir: str) -> dict:
        result = {}
        if not platforms_dir or not os.path.isdir(platforms_dir):
            return result
        exts = (".jpg", ".jpeg", ".png", ".webp")
        for plat in os.listdir(platforms_dir):
            plat_path = os.path.join(platforms_dir, plat)
            if not os.path.isdir(plat_path):
                continue
            files = [
                f for f in os.listdir(plat_path)
                if f.lower().endswith(exts)
            ]
            if files:
                result[plat] = sorted(files)
        return result
