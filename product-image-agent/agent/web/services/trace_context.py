"""Validated W3C trace context shared by Agent worker threads and callbacks."""

from __future__ import annotations

import contextvars
import hashlib
import re
import secrets
from contextlib import contextmanager


_TRACEPARENT_RE = re.compile(
    r"^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$",
    re.IGNORECASE,
)
_TRACE_ID_RE = re.compile(r"^[0-9a-f]{32}$", re.IGNORECASE)
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_TRACE_HEADERS: contextvars.ContextVar[dict[str, str] | None] = (
    contextvars.ContextVar("agent_trace_headers", default=None)
)


def _non_zero(value: str) -> bool:
    return value != "0" * len(value)


def normalize_trace_id(value) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if not _TRACE_ID_RE.fullmatch(normalized) or not _non_zero(normalized):
        return None
    return normalized


def normalize_request_id(value) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if _REQUEST_ID_RE.fullmatch(normalized) else None


def parse_traceparent(value) -> dict[str, str] | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    match = _TRACEPARENT_RE.fullmatch(normalized)
    if not match or match.group(1).lower() == "ff":
        return None
    trace_id = normalize_trace_id(match.group(2))
    span_id = match.group(3).lower()
    if trace_id is None or not _non_zero(span_id):
        return None
    return {
        "version": match.group(1).lower(),
        "traceId": trace_id,
        "parentSpanId": span_id,
        "traceFlags": match.group(4).lower(),
        "traceparent": normalized,
    }


def ensure_trace_id(value=None) -> str:
    normalized = normalize_trace_id(value)
    if normalized:
        return normalized
    if isinstance(value, str) and value.strip():
        return hashlib.sha256(value.strip().encode("utf-8")).hexdigest()[:32]
    return secrets.token_hex(16)


def resolve_trace_context(traceparent=None, trace_id=None) -> dict[str, str]:
    parsed = parse_traceparent(traceparent)
    resolved_trace_id = (
        parsed["traceId"] if parsed else normalize_trace_id(trace_id)
    ) or ensure_trace_id()
    flags = parsed["traceFlags"] if parsed else "01"
    return {
        "traceId": resolved_trace_id,
        "traceparent": f"00-{resolved_trace_id}-{secrets.token_hex(8)}-{flags}",
    }


@contextmanager
def bind_trace_context(context: dict | None):
    source = dict(context or {})
    parsed = parse_traceparent(source.get("traceparent"))
    trace_id = normalize_trace_id(source.get("traceId"))
    if parsed and (trace_id is None or trace_id == parsed["traceId"]):
        resolved = {
            "traceId": parsed["traceId"],
            "traceparent": parsed["traceparent"],
        }
    else:
        resolved = resolve_trace_context(
            source.get("traceparent"), source.get("traceId")
        )

    headers = {
        "X-Trace-Id": resolved["traceId"],
        "traceparent": resolved["traceparent"],
    }
    request_id = normalize_request_id(source.get("requestId"))
    if request_id:
        headers["X-Request-Id"] = request_id
    token = _TRACE_HEADERS.set(headers)
    try:
        yield resolved
    finally:
        _TRACE_HEADERS.reset(token)


def current_trace_headers() -> dict[str, str]:
    return dict(_TRACE_HEADERS.get() or {})
