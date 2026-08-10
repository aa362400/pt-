from __future__ import annotations

import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("omitted", "expected_missing"),
    [
        ("price", "salePriceCny"),
        ("cost", "purchaseCostCny"),
        ("category", "ozonCategory"),
        ("logistics", "logistics"),
        ("length_cm", "lengthCm"),
    ],
)
def test_ozon_profit_calculation_blocks_when_verifiable_inputs_are_missing(
    omitted, expected_missing
):
    from agents import tools_registry

    inputs = {
        "price": 100,
        "cost": 20,
        "platform": "ozon",
        "category": "english_text",
        "logistics": "standard",
        "weight_gram": 300,
        "length_cm": 20,
        "width_cm": 10,
        "height_cm": 5,
    }
    inputs.pop(omitted)

    result = tools_registry._tool_profit_calculation(**inputs)

    assert result["status"] == "BLOCKED"
    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert expected_missing in result["missingFields"]
    assert result["result"] is None


def test_ozon_profit_calculation_uses_category_rules_and_package_inputs(monkeypatch):
    from agents import tools_registry

    monkeypatch.setattr(tools_registry, "_write_audit_event", lambda _event: None)

    result = tools_registry.call_tool(
        "profit_calculation",
        price=100,
        cost=20,
        platform="ozon",
        category="english_text",
        logistics="standard",
        weight_gram=300,
        length_cm=20,
        width_cm=10,
        height_cm=5,
    )

    assert result["status"] == "VERIFIED"
    assert result["decision"] in {"PASS", "CAUTION", "REJECT", "BLOCKED"}
    assert result["publishable"] is (result["decision"] == "PASS")
    assert result["result"]["commissionRate"] in {0.12, 0.17}
    assert result["result"]["freightCny"] > 0
    assert result["source"]["workbookSha256"]


def test_proxy_registration_exposes_only_static_read_only_allowlist(monkeypatch):
    from agents import tools_registry
    from common import proxy_client

    registered: dict[str, dict] = {}

    def fake_register(name, description, schema, handler, **metadata):
        registered[name] = {
            "handler": handler,
            "metadata": metadata,
        }

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
            {
                "name": "product.update",
                "description": "Modify",
                "permissionLevel": 3,
            },
            {
                "name": "listing.publish",
                "description": "Publish mislabeled as read only",
                "permissionLevel": 1,
            },
            {
                "name": "unknown.read",
                "description": "Unknown capability",
                "permissionLevel": 1,
            },
        ],
    )
    monkeypatch.setattr(tools_registry, "register", fake_register)

    proxy_client.register_proxy_tools()

    assert set(registered) == {"platform.product.research"}
    assert registered["platform.product.research"]["metadata"] == {
        "planner_enabled": True,
        "side_effect": False,
        "retry_safe": True,
        "max_attempts": 2,
        "trusted_context_keys": ("orgId",),
    }


def test_proxy_tool_fails_closed_when_backend_does_not_execute(monkeypatch):
    from agents import tools_registry
    from common import proxy_client

    registered: dict[str, object] = {}

    monkeypatch.setattr(
        proxy_client,
        "list_capabilities",
        lambda: [
            {
                "name": "product.research",
                "description": "Research",
                "permissionLevel": 1,
            }
        ],
    )
    monkeypatch.setattr(
        tools_registry,
        "register",
        lambda name, description, schema, handler, **metadata: registered.update(
            {name: handler}
        ),
    )
    monkeypatch.setattr(
        proxy_client,
        "proxy_call",
        lambda org_id, action, params=None: {
            "status": "error",
            "error": "sensitive provider response",
        },
    )

    proxy_client.register_proxy_tools()
    handler = registered["platform.product.research"]

    with pytest.raises(proxy_client.PlatformProxyExecutionError, match="status=error"):
        handler("org-1", {"query": "car fan"})

    monkeypatch.setattr(
        proxy_client,
        "proxy_call",
        lambda org_id, action, params=None: {
            "status": "executed",
            "result": {"items": 2},
        },
    )
    assert handler("org-1", {"query": "car fan"}) == {
        "status": "executed",
        "result": {"items": 2},
    }


def test_tool_input_schema_rejects_unknown_missing_wrong_and_oversized_values():
    from agents import tools_registry

    calls = []
    tool_name = "test.input_policy"
    tools_registry.register(
        tool_name,
        "Test input policy",
        {
            "query": "string",
            "count": "number?",
            "tags": ["string?"],
            "mode": "safe|strict",
            "enabled": "boolean?",
            "metadata": "object?",
        },
        lambda **kwargs: calls.append(kwargs) or {"ok": True},
    )
    try:
        with pytest.raises(tools_registry.ToolInputValidationError):
            tools_registry.call_tool(tool_name, query="ok", mode="safe", injected=True)
        with pytest.raises(tools_registry.ToolInputValidationError):
            tools_registry.call_tool(tool_name, mode="safe")
        with pytest.raises(tools_registry.ToolInputValidationError):
            tools_registry.call_tool(tool_name, query="ok", mode="safe", count=True)
        with pytest.raises(tools_registry.ToolInputValidationError):
            tools_registry.call_tool(tool_name, query="x" * 20_001, mode="safe")
        with pytest.raises(tools_registry.ToolInputValidationError):
            tools_registry.call_tool(tool_name, query="ok", mode="unsafe")
        assert calls == []

        result = tools_registry.call_tool(
            tool_name,
            query="portable fan",
            count=2,
            tags=["car", "fan"],
            mode="strict",
            enabled=True,
            metadata={"source": "user"},
        )
        assert result == {"ok": True}
        assert calls[0]["query"] == "portable fan"
    finally:
        tools_registry._tools.pop(tool_name, None)


def test_tool_audit_log_contains_hashes_and_context_but_not_raw_payload(
    monkeypatch, tmp_path
):
    from agents import tools_registry

    monkeypatch.setenv("AGENT_RUNTIME_DIR", str(tmp_path))
    tool_name = "test.audit_policy"
    secret_payload = "private-image-payload-that-must-not-be-logged"
    tools_registry.register(
        tool_name,
        "Test audit policy",
        {"imageBase64": "string"},
        lambda image_base64: {"accepted": bool(image_base64)},
    )
    try:
        tools_registry.call_tool(
            tool_name,
            image_base64=secret_payload,
            _audit_context={
                "traceId": "trace-1",
                "runId": "run-1",
                "tenantId": "org-1",
                "workspaceId": "workspace-1",
            },
        )

        audit_files = list((tmp_path / "logs").glob("tool-calls-*.jsonl"))
        assert len(audit_files) == 1
        raw = audit_files[0].read_text(encoding="utf-8")
        assert secret_payload not in raw
        events = [json.loads(line) for line in raw.splitlines()]
        assert [event["status"] for event in events] == ["started", "completed"]
        completed = events[-1]
        assert completed["toolName"] == tool_name
        assert completed["inputHash"].startswith("sha256:")
        assert completed["outputHash"].startswith("sha256:")
        assert completed["traceId"] == "trace-1"
        assert completed["runId"] == "run-1"
        assert completed["tenantId"] == "org-1"
        assert completed["workspaceId"] == "workspace-1"
    finally:
        tools_registry._tools.pop(tool_name, None)


def test_execute_plan_rejects_more_than_six_steps_before_calling_tools(monkeypatch):
    planner = load_module("planner_step_limit_test", "agents/planner.py")
    calls = []
    fake_registry = types.ModuleType("agents.tools_registry")
    fake_registry.list_tools = lambda: [
        {"name": "research", "description": "", "input_schema": {}}
    ]
    fake_registry.call_tool = lambda name, **kwargs: calls.append((name, kwargs))
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.tools_registry", fake_registry)

    with pytest.raises(ValueError, match="at most 6"):
        planner.execute_plan(
            [
                {"id": f"step-{index}", "tool": "research", "input": {}}
                for index in range(7)
            ]
        )

    assert calls == []


def test_execute_plan_does_not_forward_unlisted_global_context(monkeypatch):
    planner = load_module("planner_context_boundary_test", "agents/planner.py")
    calls = []
    fake_registry = types.ModuleType("agents.tools_registry")
    fake_registry.list_tools = lambda: [
        {
            "name": "research",
            "description": "",
            "input_schema": {"productName": "string"},
            "context_keys": [],
            "trusted_context_keys": ["orgId"],
            "retry_safe": True,
            "max_attempts": 2,
        }
    ]

    def fake_call_tool(name, **kwargs):
        calls.append((name, kwargs))
        return {"ok": True}

    fake_registry.call_tool = fake_call_tool
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.tools_registry", fake_registry)

    result = planner.execute_plan(
        [
            {
                "id": "research",
                "tool": "research",
                "input": {"orgId": "spoofed-org"},
            }
        ],
        {
            "productName": "car fan",
            "apiKey": "must-not-cross-tool-boundary",
            "authorization": "Bearer secret",
            "maliciousInstruction": "publish now",
            "traceId": "trace-1",
            "agentRunId": "run-1",
            "orgId": "org-1",
        },
    )

    assert result["status"] == "completed"
    kwargs = calls[0][1]
    assert kwargs["product_name"] == "car fan"
    assert kwargs["org_id"] == "org-1"
    assert "api_key" not in kwargs
    assert "authorization" not in kwargs
    assert "malicious_instruction" not in kwargs
    assert kwargs["_audit_context"] == {
        "traceId": "trace-1",
        "runId": "run-1",
        "tenantId": "org-1",
    }
    assert "apiKey" not in result["final_context"]
    assert "authorization" not in result["final_context"]


def test_execute_plan_honors_single_attempt_budget(monkeypatch):
    planner = load_module("planner_retry_budget_test", "agents/planner.py")
    calls = []
    fake_registry = types.ModuleType("agents.tools_registry")
    fake_registry.list_tools = lambda: [
        {
            "name": "external_read",
            "description": "",
            "input_schema": {},
            "context_keys": [],
            "retry_safe": False,
            "max_attempts": 1,
        }
    ]

    def fail(name, **kwargs):
        calls.append((name, kwargs))
        raise RuntimeError("provider unavailable")

    fake_registry.call_tool = fail
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.tools_registry", fake_registry)

    result = planner.execute_plan(
        [{"id": "one", "tool": "external_read", "input": {}}]
    )

    assert len(calls) == 1
    assert result["status"] == "failed"
    assert result["results"][0]["attempts"] == 1
    assert result["results"][0]["retried"] is False


def test_plan_runner_preserves_business_context_and_trusts_identity_context():
    from web.routes.integration import _merge_text_task_input

    merged = _merge_text_task_input(
        "plan_and_execute",
        {
            "goal": "research a car fan",
            "context": {
                "productName": "car fan",
                "marketplace": "ozon",
                "orgId": "spoofed-org",
                "agentRunId": "spoofed-run",
            },
        },
        {
            "orgId": "trusted-org",
            "agentRunId": "trusted-run",
            "requestId": "trace-1",
            "workspaceId": "workspace-1",
        },
    )

    assert merged["goal"] == "research a car fan"
    assert merged["context"] == {
        "productName": "car fan",
        "marketplace": "ozon",
        "orgId": "trusted-org",
        "agentRunId": "trusted-run",
        "requestId": "trace-1",
        "workspaceId": "workspace-1",
    }
