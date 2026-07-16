from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from common.agent_lifecycle import (
    AgentLifecycleEvent,
    AgentLifecycleStatus,
    load_contract,
    resolve_transition,
)
from web.services import platform_webhook
from web.services.trace_context import bind_trace_context


def test_python_enums_match_shared_contract_exactly():
    contract = load_contract()

    assert set(contract["statuses"]) == {item.value for item in AgentLifecycleStatus}
    assert set(contract["events"]) == {item.value for item in AgentLifecycleEvent}
    assert set(contract["terminalStatuses"]) == {
        AgentLifecycleStatus.COMPLETED.value,
        AgentLifecycleStatus.FAILED.value,
        AgentLifecycleStatus.CANCELLED.value,
    }


@pytest.mark.parametrize("from_status,event,to_status", load_contract()["transitions"])
def test_python_resolver_matches_every_declared_transition(
    from_status: str,
    event: str,
    to_status: str,
):
    assert resolve_transition(
        AgentLifecycleStatus(from_status), AgentLifecycleEvent(event)
    ) == AgentLifecycleStatus(to_status)


def test_terminal_state_is_immutable():
    with pytest.raises(ValueError, match="terminal"):
        resolve_transition(
            AgentLifecycleStatus.COMPLETED,
            AgentLifecycleEvent.CANCELLED_BY_USER,
        )


def test_signed_lifecycle_callback_uses_stable_contract(monkeypatch):
    captured: dict = {}

    def fake_post(url, *, data, headers, timeout):
        captured.update(
            url=url,
            data=data,
            headers=headers,
            timeout=timeout,
        )
        return SimpleNamespace(status_code=200, text="ok")

    monkeypatch.setenv("PLATFORM_CALLBACK_URL", "http://backend:3000")
    monkeypatch.setenv("AGENT_WEBHOOK_SECRET", "test-secret")
    monkeypatch.setitem(sys.modules, "requests", SimpleNamespace(post=fake_post))

    with bind_trace_context(
        {
            "requestId": "run-1:attempt:1",
            "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
            "traceparent": (
                "00-4bf92f3577b34da6a3ce929d0e0e4736-"
                "00f067aa0ba902b7-01"
            ),
        }
    ):
        assert platform_webhook.notify_lifecycle_event(
            "run-1",
            "org-1",
            AgentLifecycleEvent.TOOL_RESULT_RECEIVED.value,
            "agent-run:run-1:attempt:1:TOOL_RESULT_RECEIVED",
            attempt=1,
            payload={"tool": "ozon.read"},
        )
    assert captured["url"].endswith("/api/v1/agent-runs/run-1/lifecycle-events")
    assert captured["headers"]["X-Agent-Signature"]
    assert captured["headers"]["X-Request-Id"] == "run-1:attempt:1"
    assert captured["headers"]["X-Trace-Id"] == (
        "4bf92f3577b34da6a3ce929d0e0e4736"
    )
    assert captured["headers"]["traceparent"].startswith(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-"
    )
    assert b'"event":"TOOL_RESULT_RECEIVED"' in captured["data"]


def test_unknown_lifecycle_callback_event_is_rejected(monkeypatch):
    monkeypatch.setenv("PLATFORM_CALLBACK_URL", "http://backend:3000")
    monkeypatch.setenv("AGENT_WEBHOOK_SECRET", "test-secret")

    assert not platform_webhook.notify_lifecycle_event(
        "run-1",
        "org-1",
        "NOT_A_REAL_EVENT",
        "invalid-event-key",
    )
