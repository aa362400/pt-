"""english_text — profittext / keywordstext（MCP text HTTP english_text）。"""

from __future__ import annotations

import json
import os
import re
import csv
import tempfile
import uuid
from typing import Any

# platformcommissiontext（english_text，english_text）
PLATFORM_FEE_PCT = {
    "amazon": 15.0, "etsy": 9.5, "ebay": 13.25, "walmart": 15.0,
    "temu": 5.0, "tiktok": 8.0, "shopify": 2.9,
}


# english_text（P3）：english_text
#   conservative text：text，text/english_text，text「english_text」
#   normal       text：textstoretext
#   aggressive   text：text/english_text，textprofittext
PROFIT_MODES = {
    "conservative": {"ad_pct": 12.0, "refund_pct": 8.0, "label": "text（text）"},
    "normal": {"ad_pct": 8.0, "refund_pct": 4.0, "label": "text（textstore）"},
    "aggressive": {"ad_pct": 15.0, "refund_pct": 5.0, "label": "text（text/text）"},
}
PAYMENT_FEE_PCT_DEFAULT = 2.9  # english_text


def temu_pricing_engine(data: dict | None = None, **kwargs) -> dict:
    """Deterministic TEMU quote engine based on caller-provided business rates.

    The defaults (7 CNY logistics, 12% platform fee, 1% withdrawal fee) are
    business assumptions, not represented as official TEMU universal rates.
    """
    payload = dict(data or {})
    payload.update(kwargs)
    mode = str(_pick(payload, "mode", default="quote_simulation")).strip().lower()
    allowed_modes = {"evaluate", "break_even", "target_profit", "target_margin", "quote_simulation"}
    if mode not in allowed_modes:
        raise ValueError(f"mode must be one of {sorted(allowed_modes)}")

    blank_cost = _number(payload, "blank_cost", "blankCost", "cost", required=True) or 0.0
    logistics = _number(payload, "logistics_fee", "logisticsFee", "shippingCost", default=7.0) or 0.0
    platform_rate = _number(payload, "platform_fee_rate", "platformFeeRate", default=0.12) or 0.0
    withdrawal_rate = _number(payload, "withdrawal_fee_rate", "withdrawalFeeRate", default=0.01) or 0.0
    if platform_rate > 1:
        platform_rate /= 100
    if withdrawal_rate > 1:
        withdrawal_rate /= 100
    if platform_rate + withdrawal_rate >= 1:
        raise ValueError("platform fee plus withdrawal fee must be less than 100%")
    withdrawal_base = str(_pick(payload, "withdrawal_fee_base", "withdrawalFeeBase", default="approved_price"))
    if withdrawal_base not in ("approved_price", "post_platform_settlement"):
        raise ValueError("withdrawal_fee_base must be approved_price or post_platform_settlement")

    withdrawal_effective_rate = (
        withdrawal_rate if withdrawal_base == "approved_price"
        else (1 - platform_rate) * withdrawal_rate
    )
    variable_rate = platform_rate + withdrawal_effective_rate
    net_rate = 1 - variable_rate
    fixed_cost = blank_cost + logistics
    break_even = fixed_cost / net_rate
    target_profit = _number(payload, "target_profit_amount", "targetProfitAmount", default=0.0) or 0.0
    target_margin = _number(payload, "target_margin_rate", "targetMarginRate", default=0.0) or 0.0
    if target_margin > 1:
        target_margin /= 100
    if target_margin < 0 or target_margin >= net_rate:
        raise ValueError("target margin must be non-negative and below the net settlement rate")

    target_profit_price = (fixed_cost + target_profit) / net_rate
    target_margin_price = fixed_cost / (net_rate - target_margin) if target_margin else break_even
    target_approved_price = max(break_even, target_profit_price, target_margin_price)
    expected_approval_rate = _number(payload, "expected_approval_rate", "expectedApprovalRate", default=1.0) or 1.0
    if expected_approval_rate > 1:
        expected_approval_rate /= 100
    if not 0 < expected_approval_rate <= 1:
        raise ValueError("expected approval rate must be within (0, 1]")
    recommended_declared = target_approved_price / expected_approval_rate

    approved_price = _number(payload, "approved_price", "approvedPrice")
    declared_price = _number(payload, "declared_price", "declaredPrice")
    evaluated_price = approved_price
    if evaluated_price is None and declared_price is not None:
        evaluated_price = declared_price * expected_approval_rate
    if evaluated_price is None:
        evaluated_price = target_approved_price

    platform_fee = evaluated_price * platform_rate
    withdrawal_base_amount = evaluated_price if withdrawal_base == "approved_price" else evaluated_price - platform_fee
    withdrawal_fee = withdrawal_base_amount * withdrawal_rate
    gross_profit = evaluated_price - fixed_cost - platform_fee - withdrawal_fee
    gross_margin = gross_profit / evaluated_price if evaluated_price > 0 else 0.0
    if gross_profit <= 0:
        decision = "REJECT"
        risk = "HIGH"
    elif target_margin and gross_margin < target_margin:
        decision = "CAUTION"
        risk = "MEDIUM"
    else:
        decision = "PASS"
        risk = "LOW"

    return {
        "tool": "temu_pricing_engine",
        "mode": mode,
        "assumptionNotice": "english_textconfiguration，english_text TEMU english_text",
        "currency": str(_pick(payload, "currency", default="CNY")),
        "input": {
            "blankCost": round(blank_cost, 2),
            "logisticsFee": round(logistics, 2),
            "platformFeeRate": round(platform_rate, 6),
            "withdrawalFeeRate": round(withdrawal_rate, 6),
            "withdrawalFeeBase": withdrawal_base,
            "targetProfitAmount": round(target_profit, 2),
            "targetMarginRate": round(target_margin, 6),
            "expectedApprovalRate": round(expected_approval_rate, 6),
        },
        "result": {
            "breakEvenApprovedPrice": round(break_even, 2),
            "targetProfitApprovedPrice": round(target_profit_price, 2),
            "targetMarginApprovedPrice": round(target_margin_price, 2),
            "targetApprovedPrice": round(target_approved_price, 2),
            "recommendedDeclaredPrice": round(recommended_declared, 2),
            "evaluatedApprovedPrice": round(evaluated_price, 2),
            "platformFee": round(platform_fee, 2),
            "withdrawalFee": round(withdrawal_fee, 2),
            "grossProfit": round(gross_profit, 2),
            "grossMarginRate": round(gross_margin, 6),
            "grossMarginPercent": f"{gross_margin * 100:.2f}%",
        },
        "decision": {"status": decision, "riskLevel": risk},
        "formulaTrace": [
            f"textcost = {blank_cost:.2f} + {logistics:.2f} = {fixed_cost:.2f}",
            f"english_text = 1 - {platform_rate:.4f} - {withdrawal_effective_rate:.4f} = {net_rate:.4f}",
            f"textpricing = {fixed_cost:.2f} / {net_rate:.4f} = {break_even:.2f}",
            f"english_text = {target_approved_price:.2f} / {expected_approval_rate:.4f} = {recommended_declared:.2f}",
        ],
    }


def generate_image_prompts(data: dict | None = None, **kwargs) -> dict:
    payload = dict(data or {})
    payload.update(kwargs)
    product_name = str(_pick(payload, "product_name", "productName", default="")).strip()
    if not product_name:
        raise ValueError("product_name is required")
    platform = str(_pick(payload, "platform", default="etsy")).lower()
    image_count = int(_number(payload, "image_count", "imageCount", default=9.0) or 9)
    if image_count < 1 or image_count > 9:
        raise ValueError("image_count must be between 1 and 9")
    ratio = str(_pick(payload, "aspect_ratio", "aspectRatio", default="1:1"))
    material = str(_pick(payload, "material", default="unspecified material"))
    style = str(_pick(payload, "style", default="clean premium ecommerce"))
    fixed_rules = _string_list(_pick(payload, "product_fixed_rules", "productFixedRules"))
    negative_rules = [
        "do not alter product shape", "do not invent accessories", "no third-party logos",
        "no unreadable text", *fixed_rules,
    ]
    templates = [
        ("text", "clean hero composition showing the real product clearly"),
        ("english_text", "close view of the truthful customization area and ordering steps"),
        ("english_text", "accurate size reference with neutral measurement layout"),
        ("textscene", "gift-ready lifestyle scene appropriate to the target customer"),
        ("english_text", "macro detail showing authentic material texture"),
        ("packagingtext", "actual package contents arranged clearly"),
        ("textscene", "realistic use scene without changing the product"),
        ("english_text", "factual feature comparison without unsupported claims"),
        ("textflow", "clear how-to-order and FAQ information layout"),
    ]
    images = []
    for index, (purpose, scene) in enumerate(templates[:image_count], 1):
        images.append({
            "imageNo": index,
            "purpose": purpose,
            "ratio": ratio,
            "scene": scene,
            "textOverlay": "" if index == 1 else purpose,
            "prompt": f"{product_name}, {material}, {scene}, {style}, platform-ready for {platform}, preserve exact product identity",
            "negativePrompt": ", ".join(negative_rules),
        })
    return {
        "tool": "generate_image_prompts",
        "source": "deterministic_template",
        "platform": platform,
        "productName": product_name,
        "images": images,
        "productFixedRules": fixed_rules,
    }


def amazon_title_optimizer(data: dict | None = None, **kwargs) -> dict:
    payload = dict(data or {})
    payload.update(kwargs)
    product_name = str(_pick(payload, "product_name", "productName", default="")).strip()
    if not product_name:
        raise ValueError("product_name is required")
    max_chars = int(_number(payload, "max_chars", "maxChars", default=75.0) or 75)
    if max_chars < 30 or max_chars > 200:
        raise ValueError("max_chars must be between 30 and 200")
    attributes = _string_list(_pick(payload, "attributes", "itemHighlights"))
    keywords = _string_list(_pick(payload, "keywords", "coreKeywords"))
    original = str(_pick(payload, "title", default=product_name)).strip()
    parts = []
    for item in [product_name, *attributes, *keywords]:
        value = re.sub(r"\s+", " ", item).strip(" ,-|/")
        if value and value.lower() not in {part.lower() for part in parts}:
            parts.append(value)
    title = " - ".join(parts)
    if len(title) > max_chars:
        title = title[:max_chars].rstrip(" ,-|/")
    highlights = []
    for item in [*attributes, *keywords]:
        if item and item.lower() not in {value.lower() for value in highlights}:
            highlights.append(item[:125])
    return {
        "tool": "amazon_title_optimizer",
        "source": "caller_product_data",
        "originalTitle": original,
        "optimizedTitle": title,
        "characterCount": len(title),
        "maxCharacters": max_chars,
        "withinLimit": len(title) <= max_chars,
        "itemHighlights": highlights[:5],
        "preservedKeywords": [item for item in keywords if item.lower() in title.lower()],
        "droppedKeywords": [item for item in keywords if item.lower() not in title.lower()],
    }


def listing_quality_score(data: dict | None = None, **kwargs) -> dict:
    payload = dict(data or {})
    payload.update(kwargs)
    title = str(_pick(payload, "title", default="")).strip()
    description = str(_pick(payload, "description", default="")).strip()
    keywords = _string_list(_pick(payload, "keywords", "tags"))
    image_prompts = _pick(payload, "image_prompts", "imagePrompts", default=[])
    margin = _number(payload, "margin_pct", "marginPct", default=0.0) or 0.0
    risk_hits = _string_list(_pick(payload, "risk_hits", "riskHits"))
    evidence_count = int(_number(payload, "evidence_count", "evidenceCount", default=0.0) or 0)
    title_score = min(100, len(title) * 2) if title else 0
    description_score = min(100, len(description) / 5) if description else 0
    keyword_score = min(100, len(keywords) * 10)
    image_score = min(100, len(image_prompts) * 12.5) if isinstance(image_prompts, list) else 0
    profit_score = max(0, min(100, margin * 2.5))
    risk_score = max(0, 100 - len(risk_hits) * 25)
    evidence_score = min(100, evidence_count * 20)
    weights = {
        "title": 0.15, "description": 0.15, "keywords": 0.15,
        "images": 0.15, "profit": 0.15, "risk": 0.15, "evidence": 0.10,
    }
    scores = {
        "title": round(title_score, 1), "description": round(description_score, 1),
        "keywords": round(keyword_score, 1), "images": round(image_score, 1),
        "profit": round(profit_score, 1), "risk": round(risk_score, 1),
        "evidence": round(evidence_score, 1),
    }
    total = round(sum(scores[key] * weights[key] for key in weights), 1)
    hard_blockers = []
    if risk_hits:
        hard_blockers.append("textriskenglish_text")
    if margin <= 0:
        hard_blockers.append("profitenglish_text")
    if evidence_count <= 0:
        hard_blockers.append("textsourceevidence")
    decision = "BLOCK" if hard_blockers else ("PASS" if total >= 70 else "REVIEW")
    return {
        "tool": "listing_quality_score",
        "score": total,
        "decision": decision,
        "dimensions": scores,
        "weights": weights,
        "hardBlockers": hard_blockers,
        "inputEvidence": {"evidenceCount": evidence_count, "riskHitCount": len(risk_hits)},
    }


def export_listing_csv_data(data: dict | None = None, **kwargs) -> dict:
    payload = dict(data or {})
    payload.update(kwargs)
    rows = _pick(payload, "rows", default=[])
    if not isinstance(rows, list) or not rows or not all(isinstance(row, dict) for row in rows):
        raise ValueError("rows must be a non-empty array of objects")
    platform = str(_pick(payload, "platform", default="generic")).lower()
    runtime_root = os.environ.get(
        "AGENT_RUNTIME_DIR",
        os.path.join(tempfile.gettempdir(), "commerce-agent-runtime"),
    )
    export_root = os.path.join(runtime_root, "outputs", "mcp_exports")
    os.makedirs(export_root, exist_ok=True)
    export_id = uuid.uuid4().hex
    path = os.path.join(export_root, f"{platform}_{export_id}.csv")
    fields = []
    for row in rows:
        for key in row.keys():
            if key not in fields:
                fields.append(str(key))
    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            normalized = {
                key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
                for key, value in row.items()
            }
            writer.writerow(normalized)
    return {
        "tool": "export_listing_csv",
        "exportId": export_id,
        "platform": platform,
        "filePath": path,
        "rowCount": len(rows),
        "columns": fields,
        "encoding": "utf-8-sig",
    }


def calc_profit(price: float, cost: float, freight: float = 0.0,
                platform: str = "amazon", fee_pct: float | None = None,
                ad_pct: float | None = None, other: float = 0.0,
                packaging: float = 0.0, payment_pct: float | None = None,
                refund_pct: float | None = None, mode: str = "",
                target_margin_pct: float = 30.0) -> dict:
    """textprofittext：price - cost - packaging - text - platformcommission - text - text - english_text - text。

    mode english_text，english_text ad_pct / refund_pct english_text。
    textgross profit、profittext、english_text、english_textprofitenglish_textpriceenglish_text。
    """
    price = float(price)
    cost = float(cost)
    freight = float(freight)
    packaging = float(packaging or 0)
    other = float(other)
    if price <= 0:
        raise ValueError("priceenglish_text 0")

    mode = (mode or "").strip().lower()
    mode_cfg = PROFIT_MODES.get(mode, {})
    ad = float(ad_pct) if ad_pct is not None else float(mode_cfg.get("ad_pct", 0.0))
    refund = (float(refund_pct) if refund_pct is not None
              else float(mode_cfg.get("refund_pct", 0.0)))
    payment = (float(payment_pct) if payment_pct is not None
               else (PAYMENT_FEE_PCT_DEFAULT if mode else 0.0))
    fee = float(fee_pct) if fee_pct is not None else PLATFORM_FEE_PCT.get(
        platform, 12.0)

    fixed = cost + packaging + freight + other
    pct_total = fee + ad + payment + refund
    platform_fee = price * fee / 100
    ad_cost = price * ad / 100
    payment_fee = price * payment / 100
    refund_reserve = price * refund / 100
    profit = price - fixed - platform_fee - ad_cost - payment_fee - refund_reserve
    margin = profit / price * 100

    # english_text：price = fixed / (1 - english_text)
    denom = 1 - pct_total / 100
    breakeven = fixed / denom if denom > 0 else None
    # textprice：english_textprofitenglish_text price = fixed / (1 - pct - target)
    target_denom = 1 - (pct_total + float(target_margin_pct)) / 100
    suggested = fixed / target_denom if target_denom > 0 else None

    advice = []
    if margin < 0:
        advice.append("english_text，english_textcost")
        verdict = "english_text：english_text"
    elif margin < 15:
        advice.append("profitenglish_text（<15%），english_text")
        verdict = f"english_text：english_text {breakeven * 1.25:.2f}" if breakeven else "english_text"
    elif margin > 40:
        advice.append("profitenglish_text，english_textprofitenglish_text")
        verdict = "english_text：profittext"
    else:
        verdict = "english_text"
    if breakeven:
        advice.append(f"english_text {breakeven:.2f}，english_text {breakeven * 1.25:.2f}（25% securitytext）")
    if mode:
        advice.append(f"english_text：{mode_cfg.get('label', mode)}，"
                      f"text {ad:.0f}% / english_text {refund:.0f}% / text {payment:.1f}%")

    result = {
        "price": round(price, 2),
        "cost": round(cost, 2),
        "packaging": round(packaging, 2),
        "freight": round(freight, 2),
        "platform": platform,
        "platformFeePct": fee,
        "platformFee": round(platform_fee, 2),
        "adPct": ad,
        "adCost": round(ad_cost, 2),
        "paymentPct": payment,
        "paymentFee": round(payment_fee, 2),
        "refundPct": refund,
        "refundReserve": round(refund_reserve, 2),
        "other": round(other, 2),
        "profit": round(profit, 2),
        "marginPct": round(margin, 1),
        "breakevenPrice": round(breakeven, 2) if breakeven else None,
        "suggestedPrice": round(suggested, 2) if suggested else None,
        "targetMarginPct": float(target_margin_pct),
        "verdict": verdict,
        "advice": advice,
    }
    if mode:
        result["mode"] = mode
        result["modeLabel"] = mode_cfg.get("label", mode)
    return result


def _pick(payload: dict, *keys: str, default=None):
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return default


def _number(payload: dict, *keys: str, default: float | None = None,
            required: bool = False, positive: bool = False) -> float | None:
    raw = _pick(payload, *keys, default=default)
    if raw is None:
        if required:
            raise ValueError(f"{keys[0]} is required")
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{keys[0]} must be a number") from exc
    if positive and value <= 0:
        raise ValueError(f"{keys[0]} must be greater than 0")
    if value < 0:
        raise ValueError(f"{keys[0]} must be non-negative")
    return value


def _score(payload: dict, *keys: str, default: float = 0.0) -> float:
    value = _number(payload, *keys, default=default) or 0.0
    if 0 <= value <= 1:
        value *= 5
    return max(0.0, min(5.0, value))


def _bool(payload: dict, *keys: str, default: bool = False) -> bool:
    raw = _pick(payload, *keys, default=default)
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() in ("1", "true", "yes", "y", "on")
    return bool(raw)


def _string_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [part.strip() for part in re.split(r"[,，/|]+", value)
                if part.strip()]
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _logistics_score(weight_gram: float, length_cm: float,
                     width_cm: float, height_cm: float) -> float:
    actual_kg = weight_gram / 1000 if weight_gram else 0
    volume_kg = (
        length_cm * width_cm * height_cm / 6000
        if length_cm and width_cm and height_cm else 0
    )
    billable_kg = max(actual_kg, volume_kg)
    if billable_kg <= 0:
        return 3.0
    if billable_kg <= 0.15:
        return 5.0
    if billable_kg <= 0.30:
        return 4.0
    if billable_kg <= 0.60:
        return 3.0
    if billable_kg <= 1.00:
        return 2.0
    return 1.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def temu_price_check(data: dict | None = None, **kwargs) -> dict:
    """TEMU shadow price-check analysis.

    This is not an official TEMU pricing API. It applies the local knowledge-base
    rules for TEMU black-box price-check experiments and returns a deterministic,
    auditable prediction that the agent can use before submitting a real product.
    """
    payload = dict(data or {})
    payload.update(kwargs)

    product_name = str(
        _pick(payload, "productName", "product_name", "title",
              default="TEMU product")).strip()
    declared_price = _number(
        payload, "declaredPrice", "declared_price", "price",
        required=True, positive=True) or 0.0
    cost = _number(payload, "cost", "productCost", "product_cost",
                   default=0.0) or 0.0
    shipping_cost = _number(payload, "shippingCost", "logisticsCost",
                            "freight", default=0.0) or 0.0
    packaging_cost = _number(payload, "packagingCost", "packaging",
                             default=0.0) or 0.0
    added_cost = _number(payload, "addedCost", "extraCost", "other",
                         default=0.0) or 0.0
    weight_gram = _number(payload, "weightGram", "weight_gram",
                          default=0.0) or 0.0
    length_cm = _number(payload, "packageLengthCm", "lengthCm",
                        default=0.0) or 0.0
    width_cm = _number(payload, "packageWidthCm", "widthCm",
                       default=0.0) or 0.0
    height_cm = _number(payload, "packageHeightCm", "heightCm",
                        default=0.0) or 0.0

    delivery_components = _string_list(
        _pick(payload, "deliveryComponents", "delivery_components",
              "includedItems"))
    customization_fields = _number(
        payload, "customizationFields", "customizationFieldCount",
        "customization_fields", default=0.0) or 0.0

    blank_similarity = _score(
        payload, "blankSimilarityScore", "blank_similarity_score",
        default=4.0)
    low_price_density = _score(
        payload, "lowPriceCompetitorDensity",
        "low_price_competitor_density", default=3.0)
    title_independence = _score(
        payload, "titleIndependenceScore", "title_independence_score",
        default=2.0)
    image_independence = _score(
        payload, "imageIndependenceScore", "image_independence_score",
        default=2.0)
    identity_score = _score(
        payload, "productIdentityScore", "product_identity_score",
        default=2.0)
    scene_score = _score(
        payload, "sceneDifferentiationScore",
        "scene_differentiation_score", default=2.0)
    customization_score = max(
        _score(payload, "customizationComplexityScore",
               "customization_complexity_score", default=0.0),
        min(5.0, customization_fields * 1.25),
    )
    delivery_score = max(
        _score(payload, "deliveryStructureScore",
               "delivery_structure_score", default=0.0),
        min(5.0, len(delivery_components) * 1.35),
    )
    gift_score = 4.0 if _bool(payload, "giftReady", "gift_ready") else 0.0
    evidence_score = (
        4.5 if _bool(payload, "realDeliveryEvidence",
                     "real_delivery_evidence") else 1.0
    )
    logistics_score = _logistics_score(
        weight_gram, length_cm, width_cm, height_cm)

    value_score = (
        title_independence * 0.13 +
        image_independence * 0.11 +
        identity_score * 0.15 +
        customization_score * 0.13 +
        delivery_score * 0.17 +
        scene_score * 0.09 +
        gift_score * 0.07 +
        evidence_score * 0.08 +
        logistics_score * 0.07
    ) / 5
    pressure_score = (
        blank_similarity * 0.56 + low_price_density * 0.44
    ) / 5
    retention_rate = _clamp(
        0.47 + value_score * 0.45 - pressure_score * 0.17 +
        (logistics_score - 3.0) * 0.018,
        0.35,
        0.88,
    )
    predicted_price = round(declared_price * retention_rate, 2)

    total_cost = cost + shipping_cost + packaging_cost + added_cost
    gross_margin = round(predicted_price - total_cost, 2)
    gross_margin_pct = (
        round(gross_margin / predicted_price * 100, 1)
        if predicted_price > 0 else 0.0
    )
    pass_probability = _clamp(
        0.25 + value_score * 0.65 - pressure_score * 0.25 +
        (0.10 if gross_margin_pct >= 20 else -0.10
         if gross_margin_pct < 0 else 0.0),
        0.05,
        0.95,
    )

    risk_reasons: list[str] = []
    recommendations: list[str] = []
    if blank_similarity >= 4 and low_price_density >= 4:
        risk_reasons.append("text/english_text，english_text")
        recommendations.append("textproducttext、textvisualtext SKU text，english_text")
    if title_independence < 3:
        risk_reasons.append("titleenglish_text")
        recommendations.append("texttitleenglish_textscene/text/english_text")
    if image_independence < 3:
        risk_reasons.append("textvisualenglish_text")
        recommendations.append("english_text 3:4 text，textrealtextsceneenglish_text")
    if delivery_score < 3:
        risk_reasons.append("realenglish_text，platformenglish_text")
        recommendations.append("textrealenglish_text、text、english_text")
    if evidence_score < 3:
        risk_reasons.append("textrealtextevidence，english_textpricing")
        recommendations.append("english_text、packagingtext、textflowenglish_text")
    if gross_margin < 0:
        risk_reasons.append("textpricingenglish_textcost")
        recommendations.append("english_textcostenglish_text，english_textrealpricing")
    if logistics_score <= 2:
        risk_reasons.append("text/english_text，english_textpricingtext")
        recommendations.append("textpackagingenglish_text，english_text/english_text")
    if not recommendations:
        recommendations.append("english_textpricingtext，english_text/pricing/text/gross profit")

    if retention_rate < 0.58 or gross_margin < 0 or pass_probability < 0.45:
        risk_level = "high"
    elif retention_rate < 0.70 or pass_probability < 0.65:
        risk_level = "medium"
    else:
        risk_level = "low"

    baseline_checked = _number(
        payload, "baselineCheckedPrice", "baseline_checked_price",
        default=None)
    leverage = None
    if baseline_checked is not None and added_cost > 0:
        leverage = round((predicted_price - baseline_checked) / added_cost, 2)

    return {
        "platform": "temu",
        "model": "temu_shadow_price_check_v1",
        "productName": product_name,
        "declaredPrice": round(declared_price, 2),
        "predictedCheckedPrice": predicted_price,
        "retentionRate": round(retention_rate, 3),
        "retentionPercent": round(retention_rate * 100, 1),
        "passProbability": round(pass_probability, 3),
        "riskLevel": risk_level,
        "totalCost": round(total_cost, 2),
        "grossMargin": gross_margin,
        "grossMarginPct": gross_margin_pct,
        "priceLeverage": leverage,
        "scores": {
            "blankSimilarity": round(blank_similarity, 1),
            "lowPriceCompetitorDensity": round(low_price_density, 1),
            "titleIndependence": round(title_independence, 1),
            "imageIndependence": round(image_independence, 1),
            "productIdentity": round(identity_score, 1),
            "customizationComplexity": round(customization_score, 1),
            "deliveryStructure": round(delivery_score, 1),
            "sceneDifferentiation": round(scene_score, 1),
            "giftReady": round(gift_score, 1),
            "realDeliveryEvidence": round(evidence_score, 1),
            "logisticsStructure": round(logistics_score, 1),
            "valueScore": round(value_score, 3),
            "pressureScore": round(pressure_score, 3),
        },
        "riskReasons": risk_reasons,
        "recommendations": recommendations,
        "nextExperiment": {
            "baselineGroup": "T000: texttitle + english_text + english_text",
            "experimentGroup": "T111: textproducttext + english_text + realenglish_text",
            "recordFields": [
                "declaredPrice", "checkedPrice", "retentionRate",
                "grossMargin", "approvalHours", "passed",
            ],
        },
        "evidence": [
            "temu_pricing_rules.md",
            "temu_kindle_uv_pricing_blackbox.md",
        ],
        "disclaimer": "textpricingtext，english_text TEMU english_textpricing；realenglish_textplatformpricingenglish_text。",
    }


def _api_key() -> str:
    return (os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip())


def suggest_keywords(profile: dict, platform: str = "amazon",
                     count: int = 15) -> dict:
    """searchkeywordstext：LLM generation（text+scene+text），none Key texttemplatetext。"""
    count = max(5, min(30, int(count)))
    llm_used = False
    keywords: list = []

    if (_api_key()
            and os.environ.get("COMMERCE_LLM_PLAN", "1").strip()
            not in ("0", "false", "off")):
        try:
            import requests

            base = os.getenv("OPENAI_API_BASE",
                             "https://api.openai.com/v1").rstrip("/")
            system = (
                f"You are an e-commerce SEO expert for {platform}. Given a product, "
                f"return {count} ENGLISH search keywords buyers actually type: mix of "
                "head terms, long-tail phrases, gift/occasion terms and audience terms. "
                'Return JSON only: {"keywords": ["..."]}')
            keys = ("product_name", "category", "material", "style",
                    "key_features", "target_audience")
            user = json.dumps({k: profile[k] for k in keys if profile.get(k)},
                              ensure_ascii=False)
            resp = requests.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {_api_key()}",
                         "Content-Type": "application/json"},
                json={"model": os.getenv("LLM_MODEL", "gpt-5.5"),
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": user}],
                      "temperature": 0.5, "max_tokens": 600},
                timeout=45,
            )
            resp.raise_for_status()
            text = ((resp.json().get("choices") or [{}])[0]
                    .get("message", {}).get("content", ""))
            match = re.search(r"\{.*\}", text, re.S)
            data = json.loads(match.group(0)) if match else {}
            keywords = [str(k).strip() for k in data.get("keywords", []) if k][:count]
            llm_used = bool(keywords)
        except Exception:  # noqa: BLE001 — LLM failedtexttemplate
            keywords = []

    if not keywords:
        name = profile.get("product_name") or "product"
        material = profile.get("material") or ""
        style = profile.get("style") or ""
        audience = profile.get("target_audience") or ""
        base_words = [w for w in re.split(r"[\s,/]+",
                                          f"{name} {material} {style}") if w]
        keywords = list(dict.fromkeys(
            [name]
            + [f"{material} {name}".strip() for _ in [0] if material]
            + [f"{style} {name}".strip() for _ in [0] if style]
            + [f"{name} gift", f"{name} for {audience}".strip(),
               f"handmade {name}", f"personalized {name}", f"custom {name}"]
            + base_words))[:count]

    return {"platform": platform, "keywords": keywords,
            "source": "llm" if llm_used else "template",
            "enriched": [judge_keyword(k) for k in keywords]}


# ── P3：keywordsenglish_text（searchtext / english_text / textrisk）──

_INTENT_RULES = (
    ("english_text", ("gift", "for mom", "for dad", "for her", "for him",
              "anniversary", "birthday", "christmas", "valentine")),
    ("english_text", ("memorial", "keepsake", "remembrance", "sympathy",
               "loss of", "in memory")),
    ("english_text", ("decor", "ornament", "wall art", "suncatcher", "display",
               "hanging", "window")),
    ("english_text", ("custom", "personalized", "engraved", "name", "photo",
              "monogram", "bespoke")),
)


def _keyword_risk(keyword: str) -> str:
    """textrisktext：english_text P4 risktext，english_text。"""
    try:
        from web.services.risk_check import trademark_risk
        return trademark_risk(keyword)
    except ImportError:
        minimal = ("disney", "marvel", "pokemon", "nike", "lego", "barbie",
                   "hello kitty", "nfl", "nba", "harry potter", "star wars")
        lower = keyword.lower()
        return "textrisk" if any(w in lower for w in minimal) else "security"


def judge_keyword(keyword: str) -> dict:
    """english_textkeywordsenglish_text：searchtext / english_text / textrisk。"""
    lower = (keyword or "").lower()
    intent = "english_text"
    for label, hints in _INTENT_RULES:
        if any(h in lower for h in hints):
            intent = label
            break
    words = len(lower.split())
    conversion = "text" if words >= 3 else ("text" if words == 2 else "text")
    return {"keyword": keyword, "intent": intent,
            "conversion": conversion, "risk": _keyword_risk(keyword)}


def etsy_tags(profile: dict, keywords: list | None = None,
              max_len: int = 20) -> list:
    """generation Etsy 13 english_text（text ≤max_len text，english_textrisktext）。

    english_text：english_textkeywords → textfieldstext → english_text。
    """
    pool: list[str] = []
    for kw in (keywords or []):
        pool.append(str(kw))
    name = str(profile.get("product_name", "") or "")
    material = str(profile.get("material", "") or "")
    style = str(profile.get("style", "") or "")
    audience = str(profile.get("target_audience", "") or "")
    pool.extend(filter(None, [
        name, f"{material} {name}".strip(), f"{style} decor".strip(),
        f"{audience} gift".strip(), f"custom {name}".strip(),
        f"personalized gift", f"handmade {material}".strip(),
        "gift for her", "gift for him", "home decor",
        "birthday gift", "christmas gift", "anniversary gift",
    ]))

    tags: list[str] = []
    seen = set()
    for cand in pool:
        tag = re.sub(r"\s+", " ", cand).strip().lower()
        if not tag or len(tag) > max_len:
            # english_text max_len text（english_text）
            words = tag.split()
            while words and len(" ".join(words)) > max_len:
                words.pop()
            tag = " ".join(words)
        if not tag or tag in seen:
            continue
        if _keyword_risk(tag) == "textrisk":
            continue
        seen.add(tag)
        tags.append(tag)
        if len(tags) == 13:
            break
    return tags
