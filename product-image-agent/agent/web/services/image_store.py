"""Helpers for locating generated images on disk."""

from __future__ import annotations

import os

from web.services.path_security import (
    resolve_within_root,
    safe_join,
    validate_session_id,
)


IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def session_output_dir(session_id: str, sessions: dict, sessions_dir: str, output_dir: str) -> str:
    """Resolve a session output directory from memory, blackboard metadata, or convention."""
    validate_session_id(session_id)
    engine = sessions.get(session_id)
    if engine:
        out = engine.context.get("output_dir", "")
        if out:
            try:
                return resolve_within_root(output_dir, out)
            except ValueError:
                pass

    bb_path = safe_join(sessions_dir, session_id, "blackboard.json")
    if os.path.isfile(bb_path):
        try:
            import json

            with open(bb_path, "r", encoding="utf-8") as f:
                out = json.load(f).get("output_dir", "")
            if out:
                try:
                    return resolve_within_root(output_dir, out)
                except ValueError:
                    pass
        except (json.JSONDecodeError, OSError, ValueError):
            pass
    return safe_join(output_dir, session_id)


def scan_raw_scene_files(session_id: str, sessions: dict, sessions_dir: str, output_dir: str) -> dict[str, str]:
    """Map scene_id to relative raw/ filename for images already on disk."""
    raw_dir = safe_join(
        session_output_dir(session_id, sessions, sessions_dir, output_dir), "raw",
    )
    if not os.path.isdir(raw_dir):
        return {}

    found: dict[str, str] = {}
    for name in os.listdir(raw_dir):
        lower = name.lower()
        if not lower.endswith(IMAGE_EXTENSIONS) or name.startswith("_"):
            continue
        scene_id = os.path.splitext(name)[0]
        found[scene_id] = f"raw/{name}"
    return found


def merge_scenes_with_disk(session_id: str, scenes: list, sessions: dict, sessions_dir: str, output_dir: str) -> list:
    """Mark scene slots done when matching files exist under raw/."""
    if not scenes:
        return scenes

    on_disk = scan_raw_scene_files(session_id, sessions, sessions_dir, output_dir)
    if not on_disk:
        return scenes

    resolved_output_dir = session_output_dir(session_id, sessions, sessions_dir, output_dir)
    merged = []
    for scene in scenes:
        item = dict(scene)
        sid = item.get("scene_id", "")
        if sid in on_disk and item.get("status") not in ("done", "failed"):
            item["status"] = "done"
            item["filename"] = on_disk[sid]
        elif item.get("status") == "done" and item.get("filename") and "/" not in str(item["filename"]):
            fname = str(item["filename"])
            if not find_image_path(resolved_output_dir, fname):
                rel = on_disk.get(sid)
                if rel:
                    item["filename"] = rel
        merged.append(item)
    return merged


def images_to_scene_states(images: list) -> list:
    """Convert blackboard/API image metadata to gen-studio scene states."""
    scenes = []
    for index, img in enumerate(images or []):
        fname = img.get("filename", "")
        subdir = img.get("subdir", "")
        rel = f"{subdir}/{fname}".lstrip("/") if subdir and fname else fname
        scenes.append({
            "scene_id": img.get("scene_id") or os.path.splitext(fname)[0],
            "scene_name": img.get("scene_name") or img.get("scene_name_cn") or fname,
            "status": "done",
            "filename": rel,
            "engine": img.get("engine", ""),
            "index": index,
        })
    return scenes


def safe_image_subpath(subpath: str) -> str | None:
    """Normalize an image subpath and reject parent traversal."""
    safe = subpath.replace("\\", "/").lstrip("/")
    if ".." in safe.split("/"):
        return None
    return safe


def find_image_path(output_dir: str, subpath: str) -> str | None:
    """Find an image under known generated-output directories."""
    safe_subpath = safe_image_subpath(subpath)
    if not safe_subpath:
        return None
    parts = [part for part in safe_subpath.split("/") if part]
    direct = safe_join(output_dir, *parts)
    if os.path.exists(direct):
        return direct

    filename = os.path.basename(safe_subpath)
    search_paths = [direct]
    for subdir in ["layout", "final", "raw", "ab_test", "research", ""]:
        search_paths.append(safe_join(output_dir, subdir, filename) if subdir else safe_join(output_dir, filename))

    platforms_root = safe_join(output_dir, "platforms")
    if os.path.isdir(platforms_root):
        for platform in os.listdir(platforms_root):
            search_paths.append(safe_join(platforms_root, platform, filename))

    for candidate in search_paths:
        if os.path.exists(candidate):
            return candidate
    return None
