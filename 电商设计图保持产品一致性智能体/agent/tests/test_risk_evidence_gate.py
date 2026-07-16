import json

import mcp_server
from web.services import risk_check


TEST_PROVIDER = "synthetic-risk-provider-for-tests"
TEST_EVIDENCE = {
    "provider": TEST_PROVIDER,
    "ruleset": "synthetic-risk-rules/v1",
    "evidenceRef": "test-risk-evidence:sha256:abc123",
    "fetchedAt": "2026-07-16T06:00:00Z",
    "passed": True,
}


def test_clean_rule_screen_fails_closed_without_external_clearance(monkeypatch):
    monkeypatch.delenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", raising=False)

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        use_llm=False,
    )

    assert result["screeningStatus"] == "RULE_SCREENED"
    assert result["evidenceStatus"] == "MISSING"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == ["RISK_EVIDENCE_MISSING"]
    assert "可以上架" not in result["verdict"]
    assert "安全" not in result["verdict"]


def test_authorized_auditable_clearance_allows_only_a_clean_listing(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["screeningStatus"] == "CLEARED"
    assert result["evidenceStatus"] == "ATTESTED"
    assert result["decision"] == "PASS"
    assert result["publishable"] is True
    assert result["hardGateReasons"] == []
    assert result["clearanceEvidence"] == TEST_EVIDENCE


def test_detected_high_risk_is_not_overridden_by_clearance(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)

    result = risk_check.check_listing(
        title="Disney Mickey Mouse pet ornament",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["riskLevel"] == "高"
    assert "disney" in result["trademarkHits"]
    assert result["evidenceStatus"] == "ATTESTED"
    assert result["screeningStatus"] == "HIGH_RISK_DETECTED"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert "RISK_HIGH:TRADEMARK" in result["hardGateReasons"]


def test_unauthorized_clearance_is_auditable_but_invalid(monkeypatch):
    monkeypatch.setenv(
        "RISK_CLEARANCE_AUTHORIZED_PROVIDERS",
        "different-authorized-provider",
    )

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "INVALID"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == ["RISK_CLEARANCE_INVALID"]
    assert result["clearanceEvidence"] == TEST_EVIDENCE


def test_negative_clearance_result_remains_blocked(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    evidence = {**TEST_EVIDENCE, "passed": False}

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=evidence,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "REJECTED"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == ["RISK_CLEARANCE_REJECTED"]


def test_clearance_cannot_publish_an_empty_listing(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)

    result = risk_check.check_listing(
        title="",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["screeningStatus"] == "INPUT_INSUFFICIENT"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert "RISK_INPUT_INSUFFICIENT" in result["hardGateReasons"]


def test_mcp_schema_and_dispatch_expose_the_evidence_gate(monkeypatch):
    tool = next(item for item in mcp_server.TOOLS if item["name"] == "check_risk")
    evidence_schema = tool["inputSchema"]["properties"]["clearanceEvidence"]
    assert evidence_schema["required"] == [
        "provider",
        "ruleset",
        "evidenceRef",
        "fetchedAt",
        "passed",
    ]

    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    response = mcp_server.handle(
        {
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": {
                "name": "check_risk",
                "arguments": {
                    "title": "Handmade linen table runner",
                    "clearanceEvidence": TEST_EVIDENCE,
                },
            },
        }
    )
    result = json.loads(response["result"]["content"][0]["text"])

    assert result["decision"] == "PASS"
    assert result["publishable"] is True
    assert result["evidenceStatus"] == "ATTESTED"
