#!/usr/bin/env python3
"""textlistingtext MCP Server — english_text：profit / keywords / image / CSV。

text MCP stdio text（JSON-RPC 2.0），text Cursor / Claude text MCP customerenglish_text：

    {"mcpServers": {"commerce-agent": {
        "command": "python",
        "args": ["G:/path/to/agent/mcp_server.py"]}}}

text：
- calc_profit          textprofittext（price/cost/text/platformcommission/text）
- suggest_keywords     platformsearchkeywordstext（LLM，templatetext）
- export_image_pack    english_text zip
- export_listing_csv   generationenglish_text listing text CSV（title/text/keywords）
"""

from __future__ import annotations

import json
import hashlib
import os
import sys

AGENT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from common.runtime_migration import migrate_legacy_runtime_state
from common.runtime_paths import ensure_runtime_paths
from web.services.path_security import safe_join, validate_session_id

RUNTIME_PATHS = ensure_runtime_paths()
migrate_legacy_runtime_state(AGENT_ROOT, RUNTIME_PATHS)
RUNTIME_ROOT = RUNTIME_PATHS.root
os.environ["AGENT_RUNTIME_DIR"] = RUNTIME_ROOT
os.environ["AGENT_LOG_DIR"] = RUNTIME_PATHS.logs

SERVER_INFO = {"name": "commerce-agent-tools", "version": "1.0.0"}
PROTOCOL_VERSION = "2024-11-05"

TOOLS = [
    {
        "name": "calc_profit",
        "description": "english_textprofittext：price-cost-packaging-text-platformcommission-text-text-english_text，textgross profit/profittext/english_text/textprice/text。english_text：conservative text(text) / normal text / aggressive text(text)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "price": {"type": "number", "description": "price"},
                "cost": {"type": "number", "description": "text/textcost"},
                "freight": {"type": "number", "description": "english_text，text 0"},
                "packaging": {"type": "number", "description": "packagingcost，text 0"},
                "platform": {"type": "string",
                             "description": "amazon|etsy|ebay|walmart|temu|tiktok|shopify"},
                "fee_pct": {"type": "number", "description": "english_textplatformcommissionenglish_text（text）"},
                "ad_pct": {"type": "number", "description": "english_textpriceenglish_text（text，mode yesenglish_text）"},
                "refund_pct": {"type": "number", "description": "english_text（text，mode yesenglish_text）"},
                "mode": {"type": "string",
                         "description": "conservative|normal|aggressive，english_text/text/english_text"},
                "target_margin_pct": {"type": "number",
                                      "description": "textprofittext（english_textprice），text 30"},
            },
            "required": ["price", "cost"],
        },
    },
    {
        "name": "temu_price_check",
        "description": "TEMU textpricing MCP：textlocal TEMU pricingenglish_text、textpricingenglish_text、gross profittext、riskenglish_text；english_text，textwritestore。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "productName": {"type": "string", "description": "producttext/title"},
                "declaredPrice": {"type": "number", "description": "text TEMU english_text"},
                "cost": {"type": "number", "description": "productenglish_textcost"},
                "shippingCost": {"type": "number", "description": "text/text/english_text"},
                "packagingCost": {"type": "number", "description": "packagingcost"},
                "addedCost": {"type": "number", "description": "english_textrealenglish_textcost"},
                "weightGram": {"type": "number", "description": "packagingenglish_text，text"},
                "packageLengthCm": {"type": "number", "description": "packagingtext，text"},
                "packageWidthCm": {"type": "number", "description": "packagingtext，text"},
                "packageHeightCm": {"type": "number", "description": "packagingtext，text"},
                "blankSimilarityScore": {"type": "number", "description": "text/english_text，0-5，english_text"},
                "lowPriceCompetitorDensity": {"type": "number", "description": "english_text，0-5，english_text"},
                "titleIndependenceScore": {"type": "number", "description": "titleenglish_text，0-5"},
                "imageIndependenceScore": {"type": "number", "description": "textvisualenglish_text，0-5"},
                "productIdentityScore": {"type": "number", "description": "productenglish_text，0-5"},
                "customizationFields": {"type": "number", "description": "realtextfieldstext"},
                "deliveryComponents": {"type": "array", "items": {"type": "string"}, "description": "realenglish_text"},
                "giftReady": {"type": "boolean", "description": "yesnoenglish_text"},
                "realDeliveryEvidence": {"type": "boolean", "description": "yesnotextyestext/packaging/flowtextrealevidence"},
                "baselineCheckedPrice": {"type": "number", "description": "english_textpricingtext，english_textpricingtext"},
            },
            "required": ["declaredPrice", "cost"],
        },
    },
    {
        "name": "temu_pricing_engine",
        "description": "TEMU pricingenglish_text：english_textgross profit、english_text、textprofit、textgross margintextpricingenglish_text。english_textyesenglish_textconfiguration，english_text。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "mode": {"type": "string", "enum": ["evaluate", "break_even", "target_profit", "target_margin", "quote_simulation"]},
                "blank_cost": {"type": "number", "minimum": 0},
                "approved_price": {"type": "number", "minimum": 0},
                "declared_price": {"type": "number", "minimum": 0},
                "logistics_fee": {"type": "number", "minimum": 0, "default": 7},
                "platform_fee_rate": {"type": "number", "minimum": 0, "default": 0.12},
                "withdrawal_fee_rate": {"type": "number", "minimum": 0, "default": 0.01},
                "withdrawal_fee_base": {"type": "string", "enum": ["approved_price", "post_platform_settlement"]},
                "target_profit_amount": {"type": "number", "minimum": 0},
                "target_margin_rate": {"type": "number", "minimum": 0},
                "expected_approval_rate": {"type": "number", "exclusiveMinimum": 0},
                "currency": {"type": "string", "default": "CNY"},
            },
            "required": ["blank_cost"],
        },
    },
    {
        "name": "ozon_pricing_engine",
        "description": "Ozon pricingtext：textpricetext260604.xlsxtext80textcategorycommission、ZTOenglish_text、15english_text、english_textcostenglish_textpriceenglish_text。textrule version、english_textparcel compliancetext。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "mode": {"type": "string", "enum": ["categories", "calculate", "evaluate", "batch"]},
                "category": {"type": "string"},
                "logistics": {"type": "string", "enum": ["express", "standard", "economy"]},
                "purchase_cost": {"type": "number", "minimum": 0},
                "other_cost": {"type": "number", "minimum": 0},
                "weight_gram": {"type": "number", "exclusiveMinimum": 0},
                "target_margin_rate": {"type": "number", "minimum": 0},
                "advertising_rate": {"type": "number", "minimum": 0},
                "fixed_cost_rate": {"type": "number", "minimum": 0},
                "observed_sale_price_cny": {"type": "number", "exclusiveMinimum": 0},
                "exchange_rate": {"type": "number", "exclusiveMinimum": 0},
                "listing_multiplier": {"type": "number", "exclusiveMinimum": 0},
                "length_cm": {"type": "number", "exclusiveMinimum": 0},
                "width_cm": {"type": "number", "exclusiveMinimum": 0},
                "height_cm": {"type": "number", "exclusiveMinimum": 0},
                "has_battery": {"type": "boolean"},
                "has_msds": {"type": "boolean"},
                "item_id": {"type": "string"},
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 100,
                    "items": {"type": "object"}
                }
            }
        },
    },
    {
        "name": "suggest_keywords",
        "description": "english_textgenerationplatformsearchkeywords（english_text+text+textscene+english_text）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string"},
                "category": {"type": "string"},
                "material": {"type": "string"},
                "style": {"type": "string"},
                "target_audience": {"type": "string"},
                "platform": {"type": "string", "description": "text amazon"},
                "count": {"type": "number", "description": "keywordstext，text 15"},
            },
            "required": ["product_name"],
        },
    },
    {
        "name": "export_image_pack",
        "description": "english_text Web english_textallenglish_text（1k/2k/3k/4k/8k/18k）english_text zip，text zip text",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Web text ID"},
                "tier": {"type": "string", "description": "english_text，text 2k"},
            },
            "required": ["session_id"],
        },
    },
    {
        "name": "generate_image_prompts",
        "description": "textrealproducttextgeneration 1-9 textlistingenglish_text，english_text、scene、text、Prompt、Negative Prompt english_text。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string"},
                "platform": {"type": "string"},
                "material": {"type": "string"},
                "style": {"type": "string"},
                "image_count": {"type": "integer", "minimum": 1, "maximum": 9},
                "aspect_ratio": {"type": "string"},
                "product_fixed_rules": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["product_name"],
        },
    },
    {
        "name": "export_listing_csv",
        "description": "english_text Web textgeneration listing english_text（title/text/keywords CSV + alltext zip），text zip text",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Web text ID；text rows english_text"},
                "platform": {"type": "string", "description": "textplatform，text Etsy"},
                "rows": {"type": "array", "items": {"type": "object"}, "description": "english_text Listing text"},
            },
        },
    },
    {
        "name": "amazon_title_optimizer",
        "description": "english_textproductenglish_text Amazon title，outputenglish_text、Item Highlights、english_text。text 75 english_textconfiguration。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string"},
                "title": {"type": "string"},
                "attributes": {"type": "array", "items": {"type": "string"}},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "max_chars": {"type": "integer", "minimum": 30, "maximum": 200},
            },
            "required": ["product_name"],
        },
    },
    {
        "name": "listing_quality_score",
        "description": "english_texttitle、text、keywords、imagetext、profit、risktextevidenceenglish_text；risk、english_textnoneevidenceenglish_text。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "image_prompts": {"type": "array", "items": {"type": "object"}},
                "margin_pct": {"type": "number"},
                "risk_hits": {"type": "array", "items": {"type": "string"}},
                "evidence_count": {"type": "integer", "minimum": 0},
            },
            "required": ["title"],
        },
    },
    {
        "name": "check_risk",
        "description": "listingrisktext：text/text/english_text、platformenglish_text、english_text、textrisk，textrisktext/english_text/english_text/yesnotextlisting",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "listing title"},
                "description": {"type": "string", "description": "listing text（text）"},
                "tags": {"type": "array", "items": {"type": "string"},
                         "description": "english_text（text）"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "analyze_opportunity",
        "description": "product researchtext：english_text，english_text（text/text/profittext/platform/text/textscene/english_text/english_text/risktext）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea": {"type": "string",
                         "description": "english_text，text「english_text，text Etsy」"},
                "add_to_pool": {"type": "boolean",
                                "description": "english_textyesnoenglish_text，textno"},
            },
            "required": ["idea"],
        },
    },
]

ALLOWED_TOOL_NAMES = frozenset(tool["name"] for tool in TOOLS)
BLOCKED_PLATFORM_WRITE_TOOLS = frozenset({
    "publish_listing",
    "change_price",
    "change_inventory",
    "buy_ads",
    "refund_order",
    "payment",
    "delete_store_data",
})


def enforce_tool_policy(name: str, args: dict) -> None:
    """Fail closed before dispatching any MCP tool implementation."""
    if not isinstance(args, dict):
        raise TypeError("tool arguments must be an object")
    if name in BLOCKED_PLATFORM_WRITE_TOOLS:
        raise PermissionError(
            f"platform write tool is not available through local MCP: {name}"
        )
    if name not in ALLOWED_TOOL_NAMES:
        raise ValueError(f"unregistered tool: {name}")


def _session_out_dir(session_id: str) -> str:
    return safe_join(
        RUNTIME_PATHS.outputs,
        validate_session_id(session_id),
    )


def _load_profile(session_id: str) -> dict:
    path = safe_join(_session_out_dir(session_id), "product_profile.json")
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def call_tool(name: str, args: dict) -> dict:
    enforce_tool_policy(name, args)
    if name == "calc_profit":
        from web.services.biz_tools import calc_profit
        return calc_profit(
            price=args["price"], cost=args["cost"],
            freight=args.get("freight", 0.0),
            platform=args.get("platform", "amazon"),
            fee_pct=args.get("fee_pct"),
            ad_pct=args.get("ad_pct"),
            packaging=args.get("packaging", 0.0),
            refund_pct=args.get("refund_pct"),
            mode=args.get("mode", ""),
            target_margin_pct=args.get("target_margin_pct", 30.0))

    if name == "temu_price_check":
        from web.services.biz_tools import temu_price_check
        return temu_price_check(args)

    if name == "temu_pricing_engine":
        from web.services.biz_tools import temu_pricing_engine
        return temu_pricing_engine(args)

    if name == "ozon_pricing_engine":
        from web.services.ozon_pricing import ozon_pricing_engine
        return ozon_pricing_engine(args)

    if name == "suggest_keywords":
        from web.services.biz_tools import suggest_keywords
        profile = {k: args.get(k, "") for k in
                   ("product_name", "category", "material", "style",
                    "target_audience")}
        return suggest_keywords(profile, args.get("platform", "amazon"),
                                int(args.get("count", 15)))

    if name == "export_image_pack":
        import zipfile
        from web.services import hd_export
        sid = args["session_id"]
        tier = str(args.get("tier", "2k")).lower()
        target = hd_export.tier_target(tier)
        if target is None:
            raise ValueError(f"english_text {tier}")
        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")
        files = sorted(f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
                       if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        if not files:
            raise ValueError(f"text {sid} textyesgenerationtext")
        exported = []
        for fname in files:
            stem = os.path.splitext(fname)[0]
            dst = os.path.join(out_dir, "hd", f"{stem}_{tier}.jpg")
            hd_export.export_hd(os.path.join(raw_dir, fname), dst, target)
            exported.append(dst)
        zip_path = os.path.join(out_dir, f"resolution_pack_{tier}.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fpath in exported:
                zf.write(fpath, os.path.basename(fpath))
        return {"zipPath": zip_path, "tier": tier, "fileCount": len(exported)}

    if name == "generate_image_prompts":
        from web.services.biz_tools import generate_image_prompts
        return generate_image_prompts(args)

    if name == "export_listing_csv":
        if args.get("rows"):
            from web.services.biz_tools import export_listing_csv_data
            return export_listing_csv_data(args)
        from web.services.listing_pack import build_listing_pack
        sid = args.get("session_id")
        if not sid:
            raise ValueError("session_id or rows is required")
        result = build_listing_pack(sid, _session_out_dir(sid),
                                    _load_profile(sid),
                                    args.get("platform", "Etsy"))
        return {"zipPath": result["zip_path"], "title": result["copy"]["title"],
                "imageCount": result["imageCount"], "source": result["source"]}

    if name == "amazon_title_optimizer":
        from web.services.biz_tools import amazon_title_optimizer
        return amazon_title_optimizer(args)

    if name == "listing_quality_score":
        from web.services.biz_tools import listing_quality_score
        return listing_quality_score(args)

    if name == "check_risk":
        from web.services import risk_check
        return risk_check.check_listing(
            title=str(args.get("title", "")),
            description=str(args.get("description", "")),
            tags=args.get("tags") or [])

    if name == "analyze_opportunity":
        from web.services import opportunity
        card = opportunity.analyze_idea(str(args.get("idea", "")))
        result = {"card": card}
        if args.get("add_to_pool"):
            from web.services import product_pool
            item = opportunity.card_to_pool_item(card)
            result["poolItem"] = product_pool.add_item(
                item["name"], item["category"], item["target_price"],
                notes=item["notes"], extra=item["extra"])
        return result

    raise ValueError(f"english_text: {name}")


def handle(request: dict) -> dict | None:
    method = request.get("method", "")
    req_id = request.get("id")
    params = request.get("params") or {}

    if method == "initialize":
        result = {"protocolVersion": PROTOCOL_VERSION,
                  "capabilities": {"tools": {}},
                  "serverInfo": SERVER_INFO,
                  "executableHash": hashlib.sha256(
                      open(__file__, "rb").read()
                  ).hexdigest()}
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "tools/call":
        try:
            data = call_tool(params.get("name", ""),
                             params.get("arguments") or {})
            result = {"content": [{"type": "text",
                                   "text": json.dumps(data, ensure_ascii=False,
                                                      indent=2)}]}
        except Exception as e:  # noqa: BLE001 — texterrortext MCP english_text
            result = {"content": [{"type": "text", "text": f"error：{e}"}],
                      "isError": True}
    elif method in ("notifications/initialized", "notifications/cancelled"):
        return None  # notificationnoneenglish_text
    elif req_id is None:
        return None
    else:
        return {"jsonrpc": "2.0", "id": req_id,
                "error": {"code": -32601, "message": f"english_text {method}"}}

    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle(request)
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
