#!/usr/bin/env python3
"""
english_text — Capability Registry

text「tasktext → english_text」text executor text if/elif english_text：
  - english_textagentenglish_text，english_text（text LLM english_text
    text Web UI english_text）
  - english_text register() english_text，noneenglish_text

english_text:
    handler(task: dict, params: dict, progress_callback, cancel_check) -> dict(data)
"""

from __future__ import annotations

from typing import Callable, Optional


class CapabilityRegistry:
    """taskenglish_text"""

    def __init__(self):
        self._handlers: dict = {}

    def register(self, task_type: str, handler: Callable, *,
                 description: str = "", agent: str = "executor",
                 aliases: tuple = ()) -> None:
        entry = {
            "task_type": task_type,
            "handler": handler,
            "description": description,
            "agent": agent,
        }
        self._handlers[task_type] = entry
        for alias in aliases:
            self._handlers[alias] = {**entry, "task_type": alias}

    def resolve(self, task_type: str) -> Optional[Callable]:
        entry = self._handlers.get(task_type)
        return entry["handler"] if entry else None

    def has(self, task_type: str) -> bool:
        return task_type in self._handlers

    def capabilities(self) -> list:
        """english_text（english_text，text UI / LLM english_text）"""
        seen = set()
        out = []
        for key, entry in self._handlers.items():
            hid = id(entry["handler"])
            if hid in seen:
                continue
            seen.add(hid)
            out.append({
                "task_type": entry["task_type"],
                "description": entry["description"],
                "agent": entry["agent"],
            })
        return out
