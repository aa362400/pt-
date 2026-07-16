#!/usr/bin/env python3
"""跨境上架闭环 MCP Server — 四个工具：利润 / 关键词 / 图片 / CSV。

标准 MCP stdio 协议（JSON-RPC 2.0），供 Cursor / Claude 等 MCP 客户端接入：

    {"mcpServers": {"commerce-agent": {
        "command": "python",
        "args": ["G:/path/to/agent/mcp_server.py"]}}}

工具：
- calc_profit          单件利润测算（售价/成本/头程/平台佣金/广告）
- suggest_keywords     平台搜索关键词建议（LLM，模板兜底）
- export_image_pack    把某会话的成图统一放大到指定分辨率档并打包 zip
- export_listing_csv   生成某会话的 listing 文案 CSV（标题/五点/关键词）
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
        "description": "跨境单件利润测算：售价-成本-包装-头程-平台佣金-支付-广告-退款预留，返回毛利/利润率/保本价/建议售价/结论。支持三模式：conservative 保守(新店) / normal 正常 / aggressive 冲量(测品)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "price": {"type": "number", "description": "售价"},
                "cost": {"type": "number", "description": "采购/生产成本"},
                "freight": {"type": "number", "description": "单件头程运费，默认 0"},
                "packaging": {"type": "number", "description": "包装成本，默认 0"},
                "platform": {"type": "string",
                             "description": "amazon|etsy|ebay|walmart|temu|tiktok|shopify"},
                "fee_pct": {"type": "number", "description": "自定义平台佣金百分比（可选）"},
                "ad_pct": {"type": "number", "description": "广告费占售价百分比（可选，mode 有默认值）"},
                "refund_pct": {"type": "number", "description": "退款率预留百分比（可选，mode 有默认值）"},
                "mode": {"type": "string",
                         "description": "conservative|normal|aggressive，指定后广告/退款/支付费按模式取默认"},
                "target_margin_pct": {"type": "number",
                                      "description": "目标利润率（用于反推建议售价），默认 30"},
            },
            "required": ["price", "cost"],
        },
    },
    {
        "name": "temu_price_check",
        "description": "TEMU 影子核价 MCP：按本地 TEMU 核价知识库评估申报价、预测核价保留率、毛利空间、风险原因和下一轮黑盒实验变量；只做分析，不写入店铺。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "productName": {"type": "string", "description": "商品名称/标题"},
                "declaredPrice": {"type": "number", "description": "向 TEMU 申报的价格"},
                "cost": {"type": "number", "description": "商品总基础成本"},
                "shippingCost": {"type": "number", "description": "物流/头程/单件运费"},
                "packagingCost": {"type": "number", "description": "包装成本"},
                "addedCost": {"type": "number", "description": "为了差异化新增的真实可交付成本"},
                "weightGram": {"type": "number", "description": "包装后重量，克"},
                "packageLengthCm": {"type": "number", "description": "包装长，厘米"},
                "packageWidthCm": {"type": "number", "description": "包装宽，厘米"},
                "packageHeightCm": {"type": "number", "description": "包装高，厘米"},
                "blankSimilarityScore": {"type": "number", "description": "白胚/同款相似度，0-5，越高越危险"},
                "lowPriceCompetitorDensity": {"type": "number", "description": "低价同款密度，0-5，越高越危险"},
                "titleIndependenceScore": {"type": "number", "description": "标题语义独立度，0-5"},
                "imageIndependenceScore": {"type": "number", "description": "主图视觉独立度，0-5"},
                "productIdentityScore": {"type": "number", "description": "商品身份独立度，0-5"},
                "customizationFields": {"type": "number", "description": "真实定制字段数量"},
                "deliveryComponents": {"type": "array", "items": {"type": "string"}, "description": "真实发货包含物"},
                "giftReady": {"type": "boolean", "description": "是否礼品化交付"},
                "realDeliveryEvidence": {"type": "boolean", "description": "是否已有实拍/包装/流程等真实证据"},
                "baselineCheckedPrice": {"type": "number", "description": "基准组已核价结果，用于计算核价杠杆"},
            },
            "required": ["declaredPrice", "cost"],
        },
    },
    {
        "name": "temu_pricing_engine",
        "description": "TEMU 核价反推引擎：支持实际毛利、保本价、目标利润、目标毛利率和核价率反推申报价。默认费率是调用方业务配置，不代表官方统一费率。",
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
        "description": "Ozon 核价引擎：依据售价表260604.xlsx的80个类目佣金、ZTO物流分档、15卢布最低收单费、广告费和固定成本计算目标售价或评估现价。返回规则版本、计算轨迹和包裹合规门禁。",
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
        "description": "按产品信息生成平台搜索关键词（头部词+长尾+礼物场景+人群词）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string"},
                "category": {"type": "string"},
                "material": {"type": "string"},
                "style": {"type": "string"},
                "target_audience": {"type": "string"},
                "platform": {"type": "string", "description": "默认 amazon"},
                "count": {"type": "number", "description": "关键词数量，默认 15"},
            },
            "required": ["product_name"],
        },
    },
    {
        "name": "export_image_pack",
        "description": "把某个 Web 会话的全部成图统一放大到指定分辨率档（1k/2k/3k/4k/8k/18k）并打包 zip，返回 zip 路径",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Web 会话 ID"},
                "tier": {"type": "string", "description": "分辨率档，默认 2k"},
            },
            "required": ["session_id"],
        },
    },
    {
        "name": "generate_image_prompts",
        "description": "基于真实商品资料生成 1-9 张上架图计划，每张包含用途、场景、文字、Prompt、Negative Prompt 和产品锁定规则。",
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
        "description": "为某个 Web 会话生成 listing 铺货包（标题/五点/关键词 CSV + 全部成图 zip），返回 zip 路径",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Web 会话 ID；与 rows 二选一"},
                "platform": {"type": "string", "description": "目标平台，默认 Etsy"},
                "rows": {"type": "array", "items": {"type": "object"}, "description": "直接导出的结构化 Listing 行"},
            },
        },
    },
    {
        "name": "amazon_title_optimizer",
        "description": "根据调用方商品事实压缩 Amazon 标题，输出字符数、Item Highlights、保留词和被移除词。默认 75 字符限制可配置。",
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
        "description": "基于调用方提供的标题、描述、关键词、图片计划、利润、风险词和证据数量做可复算质量评分；风险、亏损或无证据会硬阻断。",
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
        "description": "上架风险体检：商标/版权/名人侵权词、平台敏感词、夸大宣传、物流风险，返回风险等级/命中词/修改建议/是否建议上架",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "listing 标题"},
                "description": {"type": "string", "description": "listing 描述（可选）"},
                "tags": {"type": "array", "items": {"type": "string"},
                         "description": "标签列表（可选）"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "analyze_opportunity",
        "description": "选品雷达：评估一个产品想法，返回机会评分卡（评分/竞争/利润空间/平台/人群/礼物场景/可定制元素/改款建议/风险提醒）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "idea": {"type": "string",
                         "description": "产品想法，如「宠物出生花亚克力挂件，适合 Etsy」"},
                "add_to_pool": {"type": "boolean",
                                "description": "评估后是否直接加入新品池，默认否"},
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
            raise ValueError(f"未知分辨率档 {tier}")
        out_dir = _session_out_dir(sid)
        raw_dir = os.path.join(out_dir, "raw")
        files = sorted(f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
                       if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        if not files:
            raise ValueError(f"会话 {sid} 没有生成图")
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

    raise ValueError(f"未知工具: {name}")


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
        except Exception as e:  # noqa: BLE001 — 工具错误按 MCP 规范回传
            result = {"content": [{"type": "text", "text": f"错误：{e}"}],
                      "isError": True}
    elif method in ("notifications/initialized", "notifications/cancelled"):
        return None  # 通知无需应答
    elif req_id is None:
        return None
    else:
        return {"jsonrpc": "2.0", "id": req_id,
                "error": {"code": -32601, "message": f"未知方法 {method}"}}

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
