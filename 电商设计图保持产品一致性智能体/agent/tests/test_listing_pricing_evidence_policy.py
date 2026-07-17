from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def valid_listing(price: float = 29.99) -> dict:
    return {
        "title": "Portable desk organizer for everyday home office use",
        "description": "A practical organizer for keeping small desk items together.",
        "bulletPoints": [
            "Keeps small accessories organized",
            "Compact footprint for small desks",
            "Simple shape for everyday use",
            "Easy to wipe clean",
            "Neutral design for home offices",
        ],
        "keywords": ["desk organizer", "office storage", "small item holder"],
        "price": price,
    }


def run_listing_task(monkeypatch, *, result: dict, input_data: dict) -> dict:
    platform_tasks = load_module(
        f"platform_tasks_listing_price_{id(result)}",
        "web/services/platform_tasks.py",
    )
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)
    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: dict(result),
    )
    monkeypatch.setattr(platform_tasks, "_judge_quality", lambda *_args, **_kwargs: {})

    fake_verifier = types.ModuleType("agents.verifier")
    fake_verifier.verify = lambda _task_type, _output: {
        "passed": True,
        "issues": [],
        "suggestions": [],
    }
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.verifier", fake_verifier)

    return platform_tasks.run_text_task("listing_generation", input_data)


def test_listing_prompt_forbids_model_generated_price():
    platform_tasks = load_module(
        "platform_tasks_listing_price_prompt",
        "web/services/platform_tasks.py",
    )

    prompt = platform_tasks._TASK_SPECS["listing_generation"]["system"]

    assert "suggested USD number" not in prompt
    assert "price must be null" in prompt
    assert "pricingEvidence" in prompt


def test_listing_without_trusted_economics_strips_model_price(monkeypatch):
    result = run_listing_task(
        monkeypatch,
        result={
            **valid_listing(),
            "pricingEvidence": {
                "id": "model-invented-evaluation",
                "decision": "PASS",
            },
        },
        input_data={"productName": "Desk organizer", "platform": "ozon"},
    )

    assert result["price"] is None
    assert result["priceCurrency"] is None
    assert result["pricingStatus"] == "DATA_INSUFFICIENT"
    assert result["pricingEvidence"] is None
    assert result["pricingMissingFields"] == ["pricingEvidence"]
    assert result["publishable"] is False
    assert result["requiresHumanReview"] is True


def test_listing_verifier_rejects_a_price_without_economics_evidence():
    verifier = load_module(
        "listing_price_verifier_policy",
        "agents/verifier.py",
    )

    verification = verifier.verify_listing(valid_listing())

    assert verification["passed"] is False
    assert any("pricing evidence" in issue.lower() for issue in verification["issues"])


def test_listing_uses_price_only_from_valid_input_economics_evidence(monkeypatch):
    evidence = {
        "evaluationId": "economics-evaluation-1",
        "status": "VERIFIED",
        "decision": "PASS",
        "candidateId": "candidate-1",
        "researchRunId": "run-1",
        "salePrice": "1299.0000",
        "currency": "RUB",
        "validUntil": "2099-07-17T00:00:00+00:00",
        "calculatorVersion": "candidate-economics-calculator/v1",
        "inputSetHash": "a" * 64,
        "contentHash": "b" * 64,
    }

    result = run_listing_task(
        monkeypatch,
        result=valid_listing(price=29.99),
        input_data={
            "productName": "Desk organizer",
            "platform": "ozon",
            "candidateId": "candidate-1",
            "researchRunId": "run-1",
            "pricingEvidence": evidence,
        },
    )

    assert result["price"] == 1299.0
    assert result["priceCurrency"] == "RUB"
    assert result["pricingStatus"] == "EVIDENCE_BACKED"
    assert result["pricingEvidence"] == evidence
    assert result["pricingMissingFields"] == []
    # Listing copy alone never satisfies risk, snapshot, inventory, and publish gates.
    assert result["publishable"] is False
    assert result["requiresHumanReview"] is True


def test_expired_economics_evidence_does_not_authorize_a_listing_price(monkeypatch):
    result = run_listing_task(
        monkeypatch,
        result=valid_listing(),
        input_data={
            "productName": "Desk organizer",
            "platform": "ozon",
            "candidateId": "candidate-1",
            "researchRunId": "run-1",
            "pricingEvidence": {
                "evaluationId": "economics-evaluation-expired",
                "status": "VERIFIED",
                "decision": "PASS",
                "candidateId": "candidate-1",
                "researchRunId": "run-1",
                "salePrice": "1299.0000",
                "currency": "RUB",
                "validUntil": "2020-07-17T00:00:00+00:00",
                "calculatorVersion": "candidate-economics-calculator/v1",
                "inputSetHash": "a" * 64,
                "contentHash": "b" * 64,
            },
        },
    )

    assert result["price"] is None
    assert result["pricingStatus"] == "DATA_INSUFFICIENT"
    assert "validUntil" in result["pricingMissingFields"]


def test_economics_evidence_for_another_candidate_cannot_price_the_listing(monkeypatch):
    result = run_listing_task(
        monkeypatch,
        result=valid_listing(),
        input_data={
            "productName": "Desk organizer",
            "platform": "ozon",
            "candidateId": "candidate-listing",
            "researchRunId": "run-listing",
            "pricingEvidence": {
                "evaluationId": "economics-evaluation-other",
                "status": "VERIFIED",
                "decision": "PASS",
                "candidateId": "candidate-other",
                "researchRunId": "run-other",
                "salePrice": "1299.0000",
                "currency": "RUB",
                "validUntil": "2099-07-17T00:00:00+00:00",
                "calculatorVersion": "candidate-economics-calculator/v1",
                "inputSetHash": "a" * 64,
                "contentHash": "b" * 64,
            },
        },
    )

    assert result["price"] is None
    assert result["pricingStatus"] == "DATA_INSUFFICIENT"
    assert "candidateId" in result["pricingMissingFields"]
    assert "researchRunId" in result["pricingMissingFields"]


def test_opportunity_and_product_pool_keep_unknown_price_null(tmp_path, monkeypatch):
    opportunity = load_module(
        "opportunity_listing_price_policy",
        "web/services/opportunity.py",
    )
    product_pool = load_module(
        "product_pool_listing_price_policy",
        "web/services/product_pool.py",
    )
    product_pool.POOL_PATH = str(tmp_path / "pool.json")

    card = opportunity._normalize(
        {
            "product_name": "Desk organizer",
            "opportunity_score": 70,
            "platforms": ["Ozon"],
            "suggested_price": 29.99,
        }
    )
    pool_input = opportunity.card_to_pool_item(card)
    stored = product_pool.add_item(
        pool_input["name"],
        pool_input["category"],
        pool_input["target_price"],
        notes=pool_input["notes"],
        extra=pool_input["extra"],
    )

    assert card["suggested_price"] is None
    assert card["pricing_status"] == "DATA_INSUFFICIENT"
    assert card["publishable"] is False
    assert pool_input["target_price"] is None
    assert stored["targetPrice"] is None
