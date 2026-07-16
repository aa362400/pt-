#!/usr/bin/env python3
"""
能力注册表 — Capability Registry

把「任务类型 → 处理器」从 executor 的 if/elif 硬编码中解耦：
  - 每个能力带描述与目标智能体元信息，支持运行时枚举（供 LLM 编排器
    与 Web UI 展示系统能力清单）
  - 新能力只需 register() 一行接入，无需改执行器路由代码

处理器签名统一为:
    handler(task: dict, params: dict, progress_callback, cancel_check) -> dict(data)
"""

from __future__ import annotations

from typing import Callable, Optional


class CapabilityRegistry:
    """任务类型到处理器的路由表"""

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
        """能力清单（去重别名，供 UI / LLM 编排器枚举）"""
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
