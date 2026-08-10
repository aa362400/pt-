"""Thin helpers for chat route orchestration."""

from __future__ import annotations

from typing import Any


def ensure_session(sessions: dict, sid: str, engine_cls, output_dir: str, sessions_dir: str):
    if sid not in sessions:
        sessions[sid] = engine_cls(sid, output_dir, sessions_dir)
    return sessions[sid]


def apply_form_preferences(engine, normalize_platforms, form_brand: str, form_platforms: str, form_quality: str, form_auto_engine: bool):
    if form_brand:
        engine.context["brand_name"] = form_brand
        engine.observer.state.setdefault("user_preferences", {})["brand_name"] = form_brand
    if form_platforms:
        plats = normalize_platforms(form_platforms)
        if plats:
            engine.context["platforms"] = plats
            engine.observer.state.setdefault("user_preferences", {})["platforms"] = plats
    if form_quality in ("premium", "standard", "draft"):
        engine.context["quality"] = form_quality
        engine.observer.state.setdefault("user_preferences", {})["quality"] = form_quality
    if form_auto_engine:
        engine.context["auto_engine"] = True
        engine.observer.state.setdefault("user_preferences", {})["auto_engine"] = True


def build_user_display(user_message: str, has_images: bool, local_import_note: str, url_fetch_note: str, saved_images: list) -> str:
    user_display = user_message or ("📸 english_textimage" if has_images else "")
    if local_import_note:
        user_display = f"{user_display}\n📁 {local_import_note}".strip()
    if url_fetch_note and saved_images:
        user_display = f"{user_display}\n🔗 {url_fetch_note}".strip()
    return user_display


def add_session_event(engine, agent_id: str, action: str, detail: dict[str, Any]):
    engine.blackboard.append_event(agent_id, action, detail)
    engine.blackboard.save()
