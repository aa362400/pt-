#!/usr/bin/env python3
"""
textagenttext — receive_task → execute → self_check → report
"""

import time
from typing import Optional, Callable


class BaseSubAgent:
    """textagenttext，english_textAPI"""

    AGENT_LABEL = "sub_agent"

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.current_task = None
        self.current_task_id = None
        self.status = "idle"  # idle | busy | error
        self.last_report = None
        self.execution_log = []

    def receive_task(self, task: dict) -> str:
        """english_texttask"""
        task_id = task.get("task_id", "unknown")
        task_type = task.get("type", "unknown")

        self.current_task = task
        self.current_task_id = task_id
        self.status = "busy"

        print(
            f"[{self.AGENT_LABEL}] texttask {task_id}（text: {task_type}）"
        )

        self.execution_log.append({
            "time": time.time(),
            "event": "receive",
            "task_id": task_id,
            "task_type": task_type,
        })

        return f"{self.AGENT_LABEL} english_texttask {task_id}，english_text..."

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """english_text"""
        raise NotImplementedError

    def self_check(self, report: dict) -> dict:
        """english_text"""
        raise NotImplementedError

    def _wrap_report(self, task: dict, data: dict, status: str = "success",
                     error: str = "", start: float = None) -> dict:
        """english_text"""
        report = {
            "task_id": task.get("task_id", ""),
            "type": task.get("type", ""),
            "agent": self.AGENT_LABEL,
            "status": status,
            "data": data,
            "self_check": {"passed": False, "issues": []},
            "error": error,
            "execution_time": round(time.time() - start, 2) if start else 0,
        }
        report["self_check"] = self.self_check(report)
        self.last_report = report
        self.status = "idle" if status in ("success", "cancelled") else "error"
        self.current_task = None
        self.execution_log.append({
            "time": time.time(),
            "event": "complete",
            "task_id": task.get("task_id"),
            "status": status,
            "duration": report["execution_time"],
        })
        return report
