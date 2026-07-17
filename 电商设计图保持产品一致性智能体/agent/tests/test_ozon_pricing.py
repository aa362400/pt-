from copy import deepcopy
from datetime import datetime, timezone

from web.services.ozon_pricing import load_rules, ozon_pricing_engine
from flask import Flask
from web.routes.mcp import register_mcp_routes
import pytest


PRICING_NOW = datetime(2026, 7, 16, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def synthetic_verified_rules():
    """A deliberately synthetic, test-only source with auditable validity metadata."""

    rules = deepcopy(load_rules())
    rules["source"].update(
        {
            "authority": "SYNTHETIC TEST AUTHORITY - NOT FOR PRODUCTION",
            "reference": "test://synthetic-ozon-pricing-rules/v1",
            "effectiveAt": "2026-01-01T00:00:00Z",
            "importedAt": "2026-01-02T00:00:00Z",
            "expiresAt": "2027-01-01T00:00:00Z",
            "fieldProvenance": {
                "currency.rubPerCny": {
                    "authority": "SYNTHETIC TEST AUTHORITY - NOT FOR PRODUCTION",
                    "reference": "test://synthetic-ozon-pricing-rules/v1#rubPerCny",
                },
                "defaults.advertisingRate": {
                    "authority": "SYNTHETIC TEST AUTHORITY - NOT FOR PRODUCTION",
                    "reference": "test://synthetic-ozon-pricing-rules/v1#advertisingRate",
                },
                "defaults.fixedCostRate": {
                    "authority": "SYNTHETIC TEST AUTHORITY - NOT FOR PRODUCTION",
                    "reference": "test://synthetic-ozon-pricing-rules/v1#fixedCostRate",
                },
                "defaults.listingMultiplier": {
                    "authority": "SYNTHETIC TEST AUTHORITY - NOT FOR PRODUCTION",
                    "reference": "test://synthetic-ozon-pricing-rules/v1#listingMultiplier",
                },
            },
        }
    )
    return rules


def base_args(**overrides):
    payload = {
        "category": "汽车用品",
        "logistics": "standard",
        "purchase_cost": 20,
        "other_cost": 2,
        "weight_gram": 300,
        "target_margin_rate": 0.2,
        "advertising_rate": 0.2,
        "fixed_cost_rate": 0.085,
        "exchange_rate": 11.2793,
        "listing_multiplier": 1.98,
        "length_cm": 20,
        "width_cm": 10,
        "height_cm": 5,
    }
    payload.update(overrides)
    return payload


def run_pricing(args, synthetic_verified_rules):
    return ozon_pricing_engine(
        args,
        rules=synthetic_verified_rules,
        now=PRICING_NOW,
    )


def test_production_rules_fail_closed_without_auditable_source_metadata():
    result = ozon_pricing_engine(base_args())

    assert result["status"] == "BLOCKED"
    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert result["result"] is None
    assert set(result["ruleSourceBlockers"]) >= {
        "RULE_SOURCE_AUTHORITY_MISSING",
        "RULE_SOURCE_REFERENCE_MISSING",
        "RULE_SOURCE_EFFECTIVE_AT_MISSING",
        "RULE_SOURCE_EXPIRES_AT_MISSING",
    }
    assert result["source"]["authority"] is None
    assert result["source"]["reference"] is None
    assert result["source"]["effectiveAt"] is None
    assert result["source"]["expiresAt"] is None
    assert result["source"]["usableForPricing"] is False


def test_expired_verified_rules_fail_closed(synthetic_verified_rules):
    synthetic_verified_rules["source"]["expiresAt"] = "2026-07-15T23:59:59Z"

    result = run_pricing(base_args(), synthetic_verified_rules)

    assert result["status"] == "BLOCKED"
    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert result["result"] is None
    assert result["ruleSourceBlockers"] == ["RULE_SOURCE_EXPIRED"]


def test_rules_without_import_timestamp_fail_closed(synthetic_verified_rules):
    synthetic_verified_rules["source"].pop("importedAt")

    result = run_pricing(base_args(), synthetic_verified_rules)

    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert result["result"] is None
    assert result["ruleSourceBlockers"] == ["RULE_SOURCE_IMPORTED_AT_MISSING"]


def test_categories_expose_catalog_but_mark_current_rules_unusable_for_pricing():
    result = ozon_pricing_engine({"mode": "categories"})

    assert len(result["categories"]) == 80
    assert result["usableForPricing"] is False
    assert result["ruleSourceBlockers"]
    assert result["source"]["usableForPricing"] is False


def test_batch_fails_closed_when_rule_source_is_not_verified():
    result = ozon_pricing_engine({"mode": "batch", "items": [base_args()]})

    assert result["status"] == "BLOCKED"
    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert result["result"] is None
    assert result["summary"]["blocked"] == 1
    assert result["summary"]["passed"] == 0
    assert len(result["items"]) == 1
    assert result["items"][0]["result"]["decision"] == "DATA_INSUFFICIENT"
    assert result["items"][0]["result"]["result"] is None


@pytest.mark.parametrize(
    ("omitted", "expected_missing"),
    [
        ("other_cost", "otherCostCny"),
        ("target_margin_rate", "targetMarginRate"),
        ("advertising_rate", "advertisingRate"),
        ("fixed_cost_rate", "fixedCostRate"),
        ("exchange_rate", "exchangeRateRubPerCny"),
        ("listing_multiplier", "listingMultiplier"),
    ],
)
def test_calculate_blocks_when_business_input_has_no_explicit_or_provenanced_value(
    omitted, expected_missing, synthetic_verified_rules
):
    inputs = base_args()
    inputs.pop(omitted)
    rule_path = {
        "advertising_rate": "defaults.advertisingRate",
        "fixed_cost_rate": "defaults.fixedCostRate",
        "exchange_rate": "currency.rubPerCny",
        "listing_multiplier": "defaults.listingMultiplier",
    }.get(omitted)
    if rule_path:
        synthetic_verified_rules["source"]["fieldProvenance"].pop(rule_path)

    result = run_pricing(inputs, synthetic_verified_rules)

    assert result["status"] == "BLOCKED"
    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert expected_missing in result["missingFields"]
    assert result["result"] is None


def test_verified_rule_default_has_field_level_provenance(synthetic_verified_rules):
    inputs = base_args()
    inputs.pop("exchange_rate")

    result = run_pricing(inputs, synthetic_verified_rules)

    assert result["decision"] == "PASS"
    assert result["inputProvenance"]["exchangeRateRubPerCny"] == {
        "source": "pricingRule",
        "rulePath": "currency.rubPerCny",
        "authority": "SYNTHETIC TEST AUTHORITY - NOT FOR PRODUCTION",
        "reference": "test://synthetic-ozon-pricing-rules/v1#rubPerCny",
    }


@pytest.mark.parametrize(
    ("omitted", "expected_missing"),
    [
        ("observed_sale_price_cny", "salePriceCny"),
        ("purchase_cost", "purchaseCostCny"),
        ("category", "ozonCategory"),
        ("logistics", "logistics"),
        ("length_cm", "lengthCm"),
    ],
)
def test_evaluate_blocks_when_verifiable_profit_inputs_are_missing(
    omitted, expected_missing, synthetic_verified_rules
):
    inputs = base_args(mode="evaluate", observed_sale_price_cny=100)
    inputs.pop(omitted)

    result = run_pricing(inputs, synthetic_verified_rules)

    assert result["status"] == "BLOCKED"
    assert result["decision"] == "DATA_INSUFFICIENT"
    assert result["publishable"] is False
    assert expected_missing in result["missingFields"]
    assert result["result"] is None


def test_workbook_import_contains_all_categories_and_defaults():
    rules = load_rules()
    assert len(rules["categories"]) == 80
    assert len({item["category"] for item in rules["categories"]}) == 80
    assert rules["currency"]["rubPerCny"] == 11.2793
    assert rules["defaults"]["fixedCostRate"] == 0.085
    assert rules["source"]["workbookSha256"] == (
        "a27ba46d5ff5332b23bbde3cda359da90007c4aaf4b73b351acbe4d164b39ff7"
    )
    assert all(len(service["tiers"]) == 6 for service in rules["logistics"].values())


def test_calculate_applies_commission_shipping_fixed_cost_and_trace(
    synthetic_verified_rules,
):
    result = run_pricing(base_args(), synthetic_verified_rules)
    assert result["decision"] == "PASS"
    assert result["result"]["commissionRate"] in {0.12, 0.17}
    assert result["result"]["serviceTier"] in {"Extra Small", "Small"}
    assert result["inputs"]["fixedCostRate"] == 0.085
    assert result["result"]["marginRate"] == 0.2
    assert len(result["formulaTrace"]) == 4


def test_evaluate_uses_minimum_15_rub_acquiring_fee(synthetic_verified_rules):
    result = run_pricing(
        base_args(mode="evaluate", observed_sale_price_cny=30),
        synthetic_verified_rules,
    )
    assert result["result"]["acquiringFeeBranch"] == "minimum_15_rub"
    assert result["result"]["acquiringFeeCny"] == 1.33


def test_high_price_uses_two_percent_acquiring_fee(synthetic_verified_rules):
    result = run_pricing(
        base_args(mode="evaluate", observed_sale_price_cny=100),
        synthetic_verified_rules,
    )
    assert result["result"]["acquiringFeeBranch"] == "two_percent"
    assert result["result"]["acquiringFeeCny"] == 2.0


def test_evaluate_reports_margin_guardrail_and_all_fee_components(
    synthetic_verified_rules,
):
    result = run_pricing(
        base_args(mode="evaluate", observed_sale_price_cny=100),
        synthetic_verified_rules,
    )
    assert result["decision"] in {"PASS", "CAUTION"}
    assert result["result"]["commissionFeeCny"] > 0
    assert result["result"]["advertisingFeeCny"] > 0
    assert result["result"]["fixedCostFeeCny"] > 0
    assert set(result["result"]["minimumPricesCny"]) == {
        "margin20",
        "margin15",
        "margin10",
    }


def test_batch_isolates_invalid_rows_and_summarizes_decisions(
    synthetic_verified_rules,
):
    result = run_pricing(
        {
            "mode": "batch",
            "items": [
                {"item_id": "SKU-1", **base_args()},
                {"item_id": "SKU-2", **base_args(category="不存在类目")},
            ],
        },
        synthetic_verified_rules,
    )
    assert result["summary"]["total"] == 2
    assert result["summary"]["failed"] == 1
    assert result["items"][0]["ok"] is True
    assert result["items"][1]["error"]["code"] == "OZON_PRICING_ROW_INVALID"


def test_dimensions_and_battery_block_incompatible_express_package(
    synthetic_verified_rules,
):
    result = run_pricing(
        base_args(
            logistics="express",
            length_cm=80,
            width_cm=20,
            height_cm=10,
            has_battery=True,
            has_msds=False,
        ),
        synthetic_verified_rules,
    )
    assert result["decision"] == "BLOCKED"
    assert "PACKAGE_DIMENSION_SUM_EXCEEDED" in result["packageCompliance"]["blockers"]
    assert "BATTERY_MSDS_REQUIRED" in result["packageCompliance"]["blockers"]


def test_categories_mode_returns_ui_options_without_pricing_input():
    result = ozon_pricing_engine({"mode": "categories"})
    assert len(result["categories"]) == 80
    assert result["currency"]["rubPerCny"] == 11.2793
    assert result["currency"]["acquiringMinimumRub"] == 15
    assert {item["value"] for item in result["logistics"]} == {
        "express",
        "standard",
        "economy",
    }


def test_http_mcp_transport_requires_key_and_calls_ozon_tool(monkeypatch):
    monkeypatch.setenv("AGENT_API_KEY", "mcp-test-key")
    app = Flask(__name__)
    register_mcp_routes(app)
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "ozon_pricing_engine",
            "arguments": {"mode": "categories"},
        },
    }
    with app.test_client() as client:
        assert client.post("/api/mcp/jsonrpc", json=request).status_code == 401
        response = client.post(
            "/api/mcp/jsonrpc",
            json=request,
            headers={"X-Api-Key": "mcp-test-key"},
        )
    assert response.status_code == 200
    payload = response.get_json()
    text = payload["result"]["content"][0]["text"]
    assert len(__import__("json").loads(text)["categories"]) == 80
