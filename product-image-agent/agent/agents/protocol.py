#!/usr/bin/env python3
"""
textagentenglish_text — Agent Protocol

text Observer / Executor / english_textagentenglish_textmessagetextreporttext：
  - AgentMessage：text trace_id english_textmessagetext（task / report / event）
  - make_task / make_report：generationenglish_texttasktextreport dict
  - validate_report：reportfieldstext，english_text

english_text：textyesenglish_text dict text（english_text dict text），
english_text「english_text + text」，english_text。
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# messagetext
MSG_TASK = "task"
MSG_REPORT = "report"
MSG_EVENT = "event"

# reporttextfields（executor / textagent _wrap_report english_text）
REQUIRED_REPORT_FIELDS = ("task_id", "type", "status", "data", "self_check")
VALID_REPORT_STATUS = ("success", "error", "cancelled")


def new_trace_id() -> str:
    """generationtexttaskenglish_text trace id（text Observer→Executor→textagenttext）"""
    return uuid.uuid4().hex[:16]


@dataclass
class AgentMessage:
    """textagenttextmessage"""
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
    """english_texttask dict（text Observer.dispatch english_text）"""
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
    """english_textreport dict（text BaseSubAgent._wrap_report text）"""
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
    """english_textreport，english_text（english_text = text）"""
    issues = []
    if not isinstance(report, dict):
        return ["reporttextyes dict"]
    for f in REQUIRED_REPORT_FIELDS:
        if f not in report:
            issues.append(f"textfields: {f}")
    status = report.get("status")
    if status is not None and status not in VALID_REPORT_STATUS:
        issues.append(f"text status: {status}")
    if "data" in report and not isinstance(report["data"], dict):
        issues.append("data textyes dict")
    sc = report.get("self_check")
    if sc is not None and not isinstance(sc, dict):
        issues.append("self_check textyes dict")
    return issues
