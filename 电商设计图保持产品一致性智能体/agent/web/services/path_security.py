"""Shared validation for session identifiers and runtime filesystem paths."""

from __future__ import annotations

import os
import re


SESSION_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


def validate_session_id(value: object) -> str:
    if not isinstance(value, str) or not SESSION_ID_RE.fullmatch(value):
        raise ValueError("invalid session identifier")
    return value


def safe_join(root: str, *parts: str) -> str:
    """Resolve a path and ensure it remains inside the runtime root."""
    root_path = os.path.realpath(os.path.abspath(root))
    candidate = os.path.realpath(os.path.abspath(os.path.join(root_path, *parts)))
    try:
        if os.path.commonpath([root_path, candidate]) != root_path:
            raise ValueError("path escapes the configured runtime root")
    except ValueError as exc:
        raise ValueError("path escapes the configured runtime root") from exc
    return candidate


def resolve_within_root(root: str, value: object) -> str:
    """Accept an absolute persisted path only when it is within ``root``."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("runtime path is empty")
    root_path = os.path.realpath(os.path.abspath(root))
    candidate = os.path.realpath(os.path.abspath(value))
    try:
        if os.path.commonpath([root_path, candidate]) != root_path:
            raise ValueError("runtime path escapes the configured root")
    except ValueError as exc:
        raise ValueError("runtime path escapes the configured root") from exc
    return candidate
