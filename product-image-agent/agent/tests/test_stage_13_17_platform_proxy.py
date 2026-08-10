from common import proxy_client
from services import scheduler, suggestion_engine


class _Response:
    def __init__(self, status_code=201, body=None):
        self.status_code = status_code
        self._body = body or {"ok": True}
        self.text = "ok"

    def json(self):
        return self._body


def _reset_suggestion_rate_limit():
    if hasattr(suggestion_engine._rate_limited, "_counters"):
        suggestion_engine._rate_limited._counters.clear()


def test_push_suggestion_uses_agent_proxy(monkeypatch):
    _reset_suggestion_rate_limit()
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response()

    import requests

    monkeypatch.setattr(suggestion_engine, "AGENT_API_KEY", "agent-secret")
    monkeypatch.setattr(requests, "post", fake_post)

    ok = suggestion_engine.push_suggestion(
        "org-1",
        {
            "title": "Prepare listing",
            "description": "Generate launch assets.",
            "priority": "high",
            "score": 85,
            "action": {
                "label": "english_text",
                "action": "operator.prepare_listing_batch",
                "params": {"productIds": ["product-1"]},
            },
        },
    )

    assert ok is True
    assert calls[0]["url"].endswith("/agent-proxy")
    assert calls[0]["json"]["orgId"] == "org-1"
    assert calls[0]["json"]["action"] == "notification.suggest"
    assert "type" not in calls[0]["json"]


def test_scheduler_auto_accept_uses_agent_proxy(monkeypatch):
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response()

    import requests

    monkeypatch.setattr(scheduler, "AGENT_API_KEY", "agent-secret")
    monkeypatch.setattr(scheduler, "_next_available_slot", lambda: "2026-07-08T08:30:00")
    monkeypatch.setattr(requests, "post", fake_post)

    result = scheduler.schedule(
        "org-1",
        {
            "title": "Prepare listing",
            "description": "Generate launch assets.",
            "priority": "high",
            "score": 85,
            "action": {
                "action": "operator.prepare_listing_batch",
                "params": {"productIds": ["product-1"]},
            },
        },
        auto_accept=True,
    )

    assert result["scheduled"] is True
    assert result["flowCreated"] is True
    assert calls[0]["url"].endswith("/agent-proxy")
    assert calls[0]["json"]["action"] == "task.schedule"
    assert calls[0]["json"]["params"]["dueAt"] == "2026-07-08T08:30:00"


def test_register_proxy_tools_binds_only_verified_read_only_actions(monkeypatch):
    registered = {}

    def fake_register(name, description, schema, handler, **metadata):
        registered[name] = handler

    from agents import tools_registry

    monkeypatch.setattr(
        proxy_client,
        "list_capabilities",
        lambda: [
            {
                "name": "product.research",
                "description": "Research",
                "permissionLevel": 1,
            },
            {
                "name": "listing.draft",
                "description": "Draft",
                "permissionLevel": 2,
            },
        ],
    )
    monkeypatch.setattr(
        proxy_client,
        "proxy_call",
        lambda org_id, action, params=None: {
            "status": "executed",
            "orgId": org_id,
            "action": action,
        },
    )
    monkeypatch.setattr(tools_registry, "register", fake_register)

    proxy_client.register_proxy_tools()

    assert registered["platform.product.research"]("org-1")["action"] == "product.research"
    assert "platform.listing.draft" not in registered
