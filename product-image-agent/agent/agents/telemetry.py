#!/usr/bin/env python3
"""
english_text — Telemetry

english_texttaskenglish_text span text（task → english_text → textagenttext），
text Web UI english_text、failedenglish_text。

text：
    tele = Telemetry(session_id="s1", trace_id="abc")
    with tele.span("task:generate", agent="executor"):
        with tele.span("step:qa", agent="qa"):
            ...
    tele.summary()  # -> {"trace_id":..., "spans":[...], "total_ms":...}
"""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager
from typing import Optional

from .protocol import new_trace_id

MAX_SPANS = 200


class Telemetry:
    """texttasktext span english_text（english_text）"""

    def __init__(self, session_id: str = "", trace_id: str = "",
                 sink=None):
        self.session_id = session_id
        self.trace_id = trace_id or new_trace_id()
        self.spans: list = []
        self._stack: list = []  # english_text span id text
        self._sink = sink  # text：text span english_text（english_text）

    @contextmanager
    def span(self, name: str, agent: str = "", **attrs):
        """english_text span；english_text status=error english_text"""
        entry = {
            "span_id": uuid.uuid4().hex[:12],
            "parent_id": self._stack[-1] if self._stack else "",
            "trace_id": self.trace_id,
            "name": name,
            "agent": agent,
            "start": time.time(),
            "duration_ms": 0,
            "status": "ok",
            "error": "",
        }
        if attrs:
            entry["attrs"] = attrs
        self._stack.append(entry["span_id"])
        try:
            yield entry
        except Exception as e:
            entry["status"] = "error"
            entry["error"] = str(e)[:300]
            raise
        finally:
            entry["duration_ms"] = round((time.time() - entry["start"]) * 1000, 1)
            self._stack.pop()
            if len(self.spans) < MAX_SPANS:
                self.spans.append(entry)
            if self._sink:
                try:
                    self._sink(entry)
                except Exception:
                    pass

    def event(self, name: str, agent: str = "", **attrs) -> None:
        """english_text"""
        if len(self.spans) >= MAX_SPANS:
            return
        self.spans.append({
            "span_id": uuid.uuid4().hex[:12],
            "parent_id": self._stack[-1] if self._stack else "",
            "trace_id": self.trace_id,
            "name": name,
            "agent": agent,
            "start": time.time(),
            "duration_ms": 0,
            "status": "event",
            "error": "",
            "attrs": attrs or {},
        })

    def summary(self, max_spans: int = 60) -> dict:
        """english_text（english_textreport / text）"""
        spans = self.spans[-max_spans:]
        total_ms = 0.0
        errors = []
        for s in spans:
            if not s.get("parent_id"):
                total_ms += s.get("duration_ms", 0)
            if s.get("status") == "error":
                errors.append({"name": s["name"], "error": s.get("error", "")})
        return {
            "trace_id": self.trace_id,
            "session_id": self.session_id,
            "span_count": len(self.spans),
            "total_ms": round(total_ms, 1),
            "errors": errors,
            "spans": spans,
        }


class NullTelemetry(Telemetry):
    """english_text：english_textnoneenglish_text"""

    @contextmanager
    def span(self, name: str, agent: str = "", **attrs):
        yield {}

    def event(self, name: str, agent: str = "", **attrs) -> None:
        pass

    def summary(self, max_spans: int = 60) -> dict:
        return {"trace_id": self.trace_id, "span_count": 0, "spans": [],
                "total_ms": 0, "errors": [], "session_id": self.session_id}
