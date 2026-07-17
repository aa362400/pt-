import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import mcp_server
from web.services import risk_check


TEST_PROVIDER = "synthetic-risk-provider-for-tests"
TEST_SECRET = "synthetic-test-attestation-secret-32-bytes-minimum"
DEFAULT_TITLE = "Handmade linen table runner"


def _subject_hash(
        title=DEFAULT_TITLE, description="", tags=None, profile=None,
        competition_level="", platform="", scope_id="", bullets=None,
        keywords=None, attributes=None, image_hashes=None):
    profile = profile or {}
    normalized_tags = sorted({
        str(tag).strip() for tag in (tags or []) if str(tag).strip()
    })
    payload = {
        "attributes": attributes or {},
        "bullets": [
            str(value).strip() for value in (bullets or [])
            if str(value).strip()
        ],
        "competitionLevel": str(competition_level or "").strip(),
        "description": str(description or "").strip(),
        "imageHashes": sorted({
            str(value).strip() for value in (image_hashes or [])
            if str(value).strip()
        }),
        "keywords": [
            str(value).strip() for value in (keywords or [])
            if str(value).strip()
        ],
        "platform": str(platform or "").strip().casefold(),
        "profile": {
            "category": str(profile.get("category") or "").strip(),
            "materials": str(profile.get("materials") or "").strip(),
            "productName": str(profile.get("product_name") or "").strip(),
        },
        "scopeId": str(scope_id or "").strip(),
        "tags": normalized_tags,
        "title": str(title or "").strip(),
    }
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _signed_evidence(**overrides):
    now = datetime.now(timezone.utc)
    evidence = {
        "provider": TEST_PROVIDER,
        "ruleset": "synthetic-risk-rules/v1",
        "evidenceRef": "test-risk-evidence:sha256:abc123",
        "fetchedAt": now.isoformat().replace("+00:00", "Z"),
        "expiresAt": (now + timedelta(hours=1)).isoformat().replace(
            "+00:00", "Z"
        ),
        "subjectHash": _subject_hash(),
        "passed": True,
        **overrides,
    }
    payload = json.dumps(
        evidence,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    signature = hmac.new(
        TEST_SECRET.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()
    return {**evidence, "signature": f"hmac-sha256:{signature}"}


TEST_EVIDENCE = _signed_evidence()


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
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)

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


def test_provider_name_alone_cannot_self_attest_clearance(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.delenv("RISK_CLEARANCE_ATTESTATION_SECRET", raising=False)

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "INVALID"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == ["RISK_CLEARANCE_INVALID"]


def test_detected_high_risk_is_not_overridden_by_clearance(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)

    result = risk_check.check_listing(
        title="Disney Mickey Mouse pet ornament",
        clearance_evidence=_signed_evidence(
            subjectHash=_subject_hash(title="Disney Mickey Mouse pet ornament")
        ),
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
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)

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
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    evidence = _signed_evidence(passed=False)

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=evidence,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "REJECTED"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == ["RISK_CLEARANCE_REJECTED"]


def test_signed_clearance_cannot_be_replayed_for_another_listing(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)

    result = risk_check.check_listing(
        title="Generic cotton storage pouch",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "SUBJECT_MISMATCH"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == [
        "RISK_CLEARANCE_SUBJECT_MISMATCH"
    ]


def test_expired_or_stale_clearance_cannot_publish(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    now = datetime.now(timezone.utc)
    evidence = _signed_evidence(
        fetchedAt=(now - timedelta(days=2)).isoformat().replace("+00:00", "Z"),
        expiresAt=(now - timedelta(days=1)).isoformat().replace("+00:00", "Z"),
    )

    result = risk_check.check_listing(
        title=DEFAULT_TITLE,
        clearance_evidence=evidence,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "STALE"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert result["hardGateReasons"] == ["RISK_CLEARANCE_STALE"]


def test_tampering_with_a_signed_attestation_invalidates_it(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    evidence = {**TEST_EVIDENCE, "passed": False}

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=evidence,
        use_llm=False,
    )

    assert result["evidenceStatus"] == "INVALID"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False


def test_incomplete_local_trademark_rules_fail_closed_even_with_clearance(
        monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    monkeypatch.setattr(risk_check, "_words_cache", [])

    result = risk_check.check_listing(
        title="Handmade linen table runner",
        clearance_evidence=TEST_EVIDENCE,
        use_llm=False,
    )

    assert result["screeningStatus"] == "SCREENING_UNAVAILABLE"
    assert result["screeningComponents"]["trademarkWordBank"] == "UNAVAILABLE"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert "RISK_SCREENING_UNAVAILABLE" in result["hardGateReasons"]


def test_duplicate_placeholder_word_bank_cannot_claim_screening_available(
        monkeypatch):
    title = "Disney Mickey Mouse ornament"
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    monkeypatch.setattr(risk_check, "_words_cache", ["placeholder"] * 100)
    evidence = _signed_evidence(
        subjectHash=risk_check.listing_subject_hash(title=title)
    )

    result = risk_check.check_listing(
        title=title,
        clearance_evidence=evidence,
        use_llm=False,
    )

    assert result["screeningStatus"] == "SCREENING_UNAVAILABLE"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False


def test_scalar_tags_are_rejected_instead_of_split_into_characters(monkeypatch):
    title = "Handmade linen table runner"
    scalar_tags = "Disney"
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    evidence = _signed_evidence(
        subjectHash=risk_check.listing_subject_hash(
            title=title, tags=scalar_tags
        )
    )

    result = risk_check.check_listing(
        title=title,
        tags=scalar_tags,
        clearance_evidence=evidence,
        use_llm=False,
    )

    assert result["screeningStatus"] == "INPUT_INVALID"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False
    assert "RISK_INPUT_INVALID" in result["hardGateReasons"]


def test_all_generated_listing_text_is_screened_before_clearance(monkeypatch):
    title = "Handmade linen table runner"
    platform = "etsy"
    scope_id = "test-store:etsy"
    bullets = ["Official Disney licensed character gift"]
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)

    subject_hash = risk_check.listing_subject_hash(
        title=title,
        platform=platform,
        scope_id=scope_id,
        bullets=bullets,
    )
    result = risk_check.check_listing(
        title=title,
        platform=platform,
        scope_id=scope_id,
        bullets=bullets,
        clearance_evidence=_signed_evidence(subjectHash=subject_hash),
        use_llm=False,
    )

    assert result["riskLevel"] == "高"
    assert "disney" in result["trademarkHits"]
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False


def test_signed_clearance_cannot_cross_marketplace_scope(monkeypatch):
    title = "Handmade linen table runner"
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
    etsy_hash = risk_check.listing_subject_hash(
        title=title,
        platform="etsy",
        scope_id="test-store:etsy",
    )

    result = risk_check.check_listing(
        title=title,
        platform="ozon",
        scope_id="test-store:ozon",
        clearance_evidence=_signed_evidence(subjectHash=etsy_hash),
        use_llm=False,
    )

    assert result["evidenceStatus"] == "SUBJECT_MISMATCH"
    assert result["decision"] == "BLOCK"
    assert result["publishable"] is False


def test_clearance_cannot_publish_an_empty_listing(monkeypatch):
    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)

    result = risk_check.check_listing(
        title="",
        clearance_evidence=_signed_evidence(
            subjectHash=_subject_hash(title="")
        ),
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
        "expiresAt",
        "subjectHash",
        "passed",
        "signature",
    ]

    monkeypatch.setenv("RISK_CLEARANCE_AUTHORIZED_PROVIDERS", TEST_PROVIDER)
    monkeypatch.setenv("RISK_CLEARANCE_ATTESTATION_SECRET", TEST_SECRET)
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
