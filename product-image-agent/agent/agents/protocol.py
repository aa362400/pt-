#!/usr/bin/env python3
"""
多智能体通信协议 — Agent Protocol

统一 Observer / Executor / 专家子智能体之间流转的消息与报告契约：
  - AgentMessage：带 trace_id 的标准消息封装（task / report / event）
  - make_task / make_report：生成协议兼容的任务与报告 dict
  - validate_report：报告字段校验，供监督与测试使用

设计约束：所有结构保持普通 dict 兼容（历史代码大量以 dict 传递），
协议层只做「规范化 + 校验」，不强制引入新对象类型。
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# 消息类型
MSG_TASK = "task"
MSG_REPORT = "report"
MSG_EVENT = "event"

# 报告必备字段（executor / 子智能体 _wrap_report 的公共契约）
REQUIRED_REPORT_FIELDS = ("task_id", "type", "status", "data", "self_check")
VALID_REPORT_STATUS = ("success", "error", "cancelled")


def new_trace_id() -> str:
    """生成一次任务链路的 trace id（跨 Observer→Executor→子智能体传递）"""
    return uuid.uuid4().hex[:16]


@dataclass
class AgentMessage:
    """标准智能体间消息"""
    sender: str
    recipient: str
    msg_type: str  # task | report | event
    payload: dict = field(default_factory=dict)
    trace_id: str = field(default_factory=new_trace_id)
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def task(cls, sender: str, recipient: str, task: dict,
             trace_id: Optional[str] = None) -> "AgentMessage":
        return cls(sender, recipient, MSG_TASK, dict(task or {}),
                   trace_id or task.get("trace_id") or new_trace_id())

    @classmethod
    def report(cls, sender: str, recipient: str, report: dict,
               trace_id: Optional[str] = None) -> "AgentMessage":
        return cls(sender, recipient, MSG_REPORT, dict(report or {}),
                   trace_id or report.get("trace_id") or new_trace_id())


def make_task(task_type: str, params: dict = None, *,
              task_id: str = "", observer_says: str = "",
              target_agent: str = "executor",
              trace_id: str = "") -> dict:
    """构建协议兼容的任务 dict（与 Observer.dispatch 产出同构）"""
    return {
        "task_id": task_id or f"task_{int(time.time())}_{uuid.uuid4().hex[:4]}",
        "type": task_type,
        "params": dict(params or {}),
        "observer_says": observer_says,
        "target_agent": target_agent,
        "trace_id": trace_id or new_trace_id(),
    }


def make_report(task: dict, data: dict, status: str = "success", *,
                agent: str = "", error: str = "",
                self_check: dict = None) -> dict:
    """构建协议兼容的执行报告 dict（与 BaseSubAgent._wrap_report 同构）"""
    return {
        "task_id": (task or {}).get("task_id", ""),
        "type": (task or {}).get("type", ""),
        "agent": agent,
        "status": status,
        "data": dict(data or {}),
        "self_check": self_check or {"passed": status == "success", "issues": []},
        "error": error,
        "trace_id": (task or {}).get("trace_id", ""),
    }


def validate_report(report: Any) -> list:
    """校验执行报告，返回问题列表（空列表 = 合规）"""
    issues = []
    if not isinstance(report, dict):
        return ["报告不是 dict"]
    for f in REQUIRED_REPORT_FIELDS:
        if f not in report:
            issues.append(f"缺少字段: {f}")
    status = report.get("status")
    if status is not None and status not in VALID_REPORT_STATUS:
        issues.append(f"非法 status: {status}")
    if "data" in report and not isinstance(report["data"], dict):
        issues.append("data 必须是 dict")
    sc = report.get("self_check")
    if sc is not None and not isinstance(sc, dict):
        issues.append("self_check 必须是 dict")
    return issues
