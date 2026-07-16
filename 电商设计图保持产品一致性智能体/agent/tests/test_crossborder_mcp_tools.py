import csv
import json
import os

import mcp_server
from web.services.biz_tools import (
    amazon_title_optimizer,
    export_listing_csv_data,
    generate_image_prompts,
    listing_quality_score,
    temu_pricing_engine,
)


def test_temu_pricing_engine_reproduces_business_formula():
    result = temu_pricing_engine({
        "mode": "quote_simulation",
        "blank_cost": 10,
        "logistics_fee": 7,
        "platform_fee_rate": 0.12,
        "withdrawal_fee_rate": 0.01,
        "target_margin_rate": 0.35,
        "expected_approval_rate": 0.5,
    })
    assert result["result"]["breakEvenApprovedPrice"] == 19.54
    assert result["result"]["targetMarginApprovedPrice"] == 32.69
    assert result["result"]["recommendedDeclaredPrice"] == 65.38
    assert "不代表 TEMU 官方统一费率" in result["assumptionNotice"]


def test_image_prompt_plan_preserves_fixed_product_rules():
    result = generate_image_prompts({
        "product_name": "Personalized wooden pen",
        "material": "wood",
        "image_count": 3,
        "product_fixed_rules": ["do not print on cap"],
    })
    assert result["source"] == "deterministic_template"
    assert len(result["images"]) == 3
    assert all("do not print on cap" in item["negativePrompt"] for item in result["images"])


def test_amazon_title_optimizer_enforces_requested_character_limit():
    result = amazon_title_optimizer({
        "product_name": "Personalized Wooden Pen",
        "attributes": ["Custom Name", "Graduation Gift"],
        "keywords": ["Teacher Appreciation Gift"],
        "max_chars": 75,
    })
    assert result["withinLimit"] is True
    assert result["characterCount"] <= 75
    assert result["optimizedTitle"].startswith("Personalized Wooden Pen")


def test_listing_quality_gate_blocks_missing_evidence():
    result = listing_quality_score({
        "title": "Personalized Wooden Pen",
        "description": "A detailed product description based on the real item. " * 10,
        "keywords": ["wood pen"] * 10,
        "image_prompts": [{}] * 8,
        "margin_pct": 35,
        "evidence_count": 0,
    })
    assert result["decision"] == "BLOCK"
    assert "缺少来源证据" in result["hardBlockers"]


def test_csv_export_uses_utf8_bom_and_roundtrips_special_characters():
    result = export_listing_csv_data({
        "platform": "etsy",
        "rows": [{"sku": "PEN-1", "title": 'Wooden pen, "custom"', "description": "line 1\nline 2"}],
    })
    with open(result["filePath"], "rb") as handle:
        assert handle.read(3) == b"\xef\xbb\xbf"
    with open(result["filePath"], encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert rows[0]["title"] == 'Wooden pen, "custom"'
    assert rows[0]["description"] == "line 1\nline 2"
    os.remove(result["filePath"])


def test_mcp_registry_exposes_all_crossborder_tools():
    response = mcp_server.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    names = {item["name"] for item in response["result"]["tools"]}
    assert {
        "calc_profit", "suggest_keywords", "generate_image_prompts",
        "export_listing_csv", "temu_pricing_engine", "check_risk",
        "amazon_title_optimizer", "listing_quality_score",
    }.issubset(names)


def test_new_tools_are_callable_over_json_rpc():
    response = mcp_server.handle({
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {
            "name": "temu_pricing_engine",
            "arguments": {"blank_cost": 10, "target_margin_rate": 0.35, "expected_approval_rate": 0.5},
        },
    })
    data = json.loads(response["result"]["content"][0]["text"])
    assert data["result"]["recommendedDeclaredPrice"] == 65.38
