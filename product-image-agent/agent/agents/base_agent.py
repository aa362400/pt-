#!/usr/bin/env python3
"""
子智能体基类 — receive_task → execute → self_check → report
"""

import time
from typing import Optional, Callable


class BaseSubAgent:
    """子智能体基类，统一生命周期接口"""

    AGENT_LABEL = "sub_agent"

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.current_task = None
        self.current_task_id = None
        self.status = "idle"  # idle | busy | error
        self.last_report = None
        self.execution_log = []

    def receive_task(self, task: dict) -> str:
        """接收编排器派发的子任务"""
        task_id = task.get("task_id", "unknown")
        task_type = task.get("type", "unknown")

        self.current_task = task
        self.current_task_id = task_id
        self.status = "busy"

        print(
            f"[{self.AGENT_LABEL}] 收到任务 {task_id}（类型: {task_type}）"
        )

        self.execution_log.append({
            "time": time.time(),
            "event": "receive",
            "task_id": task_id,
            "task_type": task_type,
        })

        return f"{self.AGENT_LABEL} 已接收任务 {task_id}，开始执行..."

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """子类实现具体执行逻辑"""
        raise NotImplementedError

    def self_check(self, report: dict) -> dict:
        """子类实现自检逻辑"""
        raise NotImplementedError

    def _wrap_report(self, task: dict, data: dict, status: str = "success",
                     error: str = "", start: float = None) -> dict:
        """构建标准汇报格式"""
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
