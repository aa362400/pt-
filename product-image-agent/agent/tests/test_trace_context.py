from __future__ import annotations

from web.services.trace_context import (
    bind_trace_context,
    current_trace_headers,
    parse_traceparent,
    resolve_trace_context,
)


TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
TRACEPARENT = f"00-{TRACE_ID}-00f067aa0ba902b7-01"


def test_valid_traceparent_continues_trace_with_new_span_id():
    context = resolve_trace_context(TRACEPARENT)

    assert context["traceId"] == TRACE_ID
    assert context["traceparent"].startswith(f"00-{TRACE_ID}-")
    assert context["traceparent"] != TRACEPARENT
    assert parse_traceparent(context["traceparent"])["traceId"] == TRACE_ID


def test_invalid_and_all_zero_traceparents_are_replaced():
    invalid = "00-00000000000000000000000000000000-0000000000000000-01"
    assert parse_traceparent(invalid) is None

    context = resolve_trace_context(invalid)
    assert len(context["traceId"]) == 32
    assert context["traceId"] != "0" * 32


def test_contextvars_isolate_trace_headers_for_worker_and_callback():
    with bind_trace_context(
        {
            "requestId": "run-1:attempt:1",
            "traceId": TRACE_ID,
            "traceparent": TRACEPARENT,
        }
    ):
        assert current_trace_headers() == {
            "X-Request-Id": "run-1:attempt:1",
            "X-Trace-Id": TRACE_ID,
            "traceparent": TRACEPARENT,
        }

    assert current_trace_headers() == {}
