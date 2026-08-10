"""Deterministic Ozon pricing engine sourced from the seller workbook."""

from __future__ import annotations

import hashlib
import json
import math
import os
from functools import lru_cache
from typing import Any


_RULES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "ozon_pricing_rules.v1.json",
)


def _round(value: float, digits: int = 2) -> float:
    return round(float(value) + 1e-12, digits)


def _rate(value: Any, default: float) -> float:
    if value is None or value == "":
        return default
    number = float(value)
    if number > 1:
        number /= 100
    if not 0 <= number < 1:
        raise ValueError("rate must be between 0 and 1 (or 0 and 100 percent)")
    return number


def _positive(value: Any, field: str, *, allow_zero: bool = False) -> float:
    number = float(value)
    if number < 0 or (not allow_zero and number == 0):
        comparator = "non-negative" if allow_zero else "positive"
        raise ValueError(f"{field} must be {comparator}")
    return number


def _missing_pricing_fields(args: dict[str, Any], mode: str) -> list[str]:
    required: list[tuple[str, str, str]] = []
    if mode == "evaluate":
        required.append(("observed_sale_price_cny", "salePriceCny", "positive"))
    required.extend(
        (
            ("purchase_cost", "purchaseCostCny", "positive"),
            ("category", "ozonCategory", "text"),
            ("logistics", "logistics", "text"),
            ("weight_gram", "weightGram", "positive"),
            ("length_cm", "lengthCm", "positive"),
            ("width_cm", "widthCm", "positive"),
            ("height_cm", "heightCm", "positive"),
        )
    )
    missing: list[str] = []
    for input_key, output_key, kind in required:
        value = args.get(input_key)
        if kind == "text":
            available = bool(str(value or "").strip())
        else:
            try:
                available = not isinstance(value, bool) and float(value) > 0
            except (TypeError, ValueError):
                available = False
        if not available:
            missing.append(output_key)
    return missing


def _validate_rules(rules: dict[str, Any]) -> None:
    categories = rules.get("categories")
    logistics = rules.get("logistics")
    if not isinstance(categories, list) or not categories:
        raise ValueError("Ozon pricing rules do not contain categories")
    names = [str(item.get("category") or "").strip() for item in categories]
    if any(not name for name in names) or len(names) != len(set(names)):
        raise ValueError("Ozon pricing category names must be non-empty and unique")
    for item in categories:
        rates = item.get("commissionRates") or {}
        for key in ("upTo1500Rub", "upTo5000Rub", "above5000Rub"):
            _rate(rates.get(key), -1)
    if not isinstance(logistics, dict) or set(logistics) != {
        "express",
        "standard",
        "economy",
    }:
        raise ValueError("Ozon pricing rules must contain all three ZTO services")
    for service_name, service in logistics.items():
        tiers = service.get("tiers")
        if not isinstance(tiers, list) or len(tiers) != 6:
            raise ValueError(f"{service_name} must contain six service tiers")
        for tier in tiers:
            for field in (
                "minPriceRub",
                "maxPriceRub",
                "minWeightGram",
                "maxWeightGram",
                "baseCny",
                "perGramCny",
                "maxDimensionSumCm",
                "maxSideCm",
            ):
                _positive(
                    tier.get(field),
                    f"{service_name}.{tier.get('name')}.{field}",
                    allow_zero=True,
                )


@lru_cache(maxsize=1)
def load_rules() -> dict[str, Any]:
    with open(_RULES_PATH, "r", encoding="utf-8") as handle:
        rules = json.load(handle)
    _validate_rules(rules)
    with open(_RULES_PATH, "rb") as handle:
        rules["rulesHash"] = hashlib.sha256(handle.read()).hexdigest()
    return rules


def _category(rules: dict[str, Any], category_name: str) -> dict[str, Any]:
    expected = category_name.strip()
    for item in rules["categories"]:
        if item["category"] == expected:
            return item
    suggestions = [
        item["category"]
        for item in rules["categories"]
        if expected and (expected in item["category"] or item["category"] in expected)
    ][:8]
    suffix = f"; suggestions: {', '.join(suggestions)}" if suggestions else ""
    raise ValueError(f"unknown Ozon category: {expected}{suffix}")


def _commission_for_rub(category: dict[str, Any], price_rub: float) -> tuple[str, float]:
    rates = category["commissionRates"]
    if price_rub <= 1500:
        return "upTo1500Rub", float(rates["upTo1500Rub"])
    if price_rub <= 5000:
        return "upTo5000Rub", float(rates["upTo5000Rub"])
    return "above5000Rub", float(rates["above5000Rub"])


def _price_in_tier(price_rub: float, tier: dict[str, Any]) -> bool:
    minimum = float(tier["minPriceRub"])
    maximum = float(tier["maxPriceRub"])
    lower_ok = price_rub >= minimum if minimum <= 1 else price_rub > minimum - 1
    return lower_ok and price_rub <= maximum


def _weight_in_tier(weight_gram: float, tier: dict[str, Any]) -> bool:
    minimum = float(tier["minWeightGram"])
    maximum = float(tier["maxWeightGram"])
    lower_ok = weight_gram >= minimum if minimum <= 1 else weight_gram > minimum - 1
    return lower_ok and weight_gram <= maximum


def _shipping_cost(weight_gram: float, tier: dict[str, Any]) -> float:
    return float(tier["baseCny"]) + float(tier["perGramCny"]) * weight_gram


def _solve_price(total_cost: float, variable_rate: float, minimum_fee_cny: float) -> tuple[float, str, float]:
    denominator_minimum = 1 - variable_rate
    denominator_percentage = 1 - variable_rate - 0.02
    if denominator_minimum <= 0 or denominator_percentage <= 0:
        raise ValueError("combined margin and fee rates leave no valid selling price")

    minimum_candidate = (total_cost + minimum_fee_cny) / denominator_minimum
    if minimum_candidate * 0.02 <= minimum_fee_cny + 1e-9:
        return minimum_candidate, "minimum_15_rub", minimum_fee_cny

    percentage_candidate = total_cost / denominator_percentage
    return percentage_candidate, "two_percent", percentage_candidate * 0.02


def _package_check(args: dict[str, Any], tier: dict[str, Any], line: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    dimensions = [args.get("length_cm"), args.get("width_cm"), args.get("height_cm")]
    supplied = [value is not None and value != "" for value in dimensions]
    if any(supplied) and not all(supplied):
        blockers.append("PACKAGE_DIMENSIONS_INCOMPLETE")
    elif all(supplied):
        numeric = [_positive(value, "package dimension") for value in dimensions]
        if sum(numeric) > float(tier["maxDimensionSumCm"]):
            blockers.append("PACKAGE_DIMENSION_SUM_EXCEEDED")
        if max(numeric) > float(tier["maxSideCm"]):
            blockers.append("PACKAGE_MAX_SIDE_EXCEEDED")
    else:
        warnings.append("PACKAGE_DIMENSIONS_NOT_PROVIDED")

    if bool(args.get("has_battery")) and line["batteryRequirement"] == "msds" and not bool(args.get("has_msds")):
        blockers.append("BATTERY_MSDS_REQUIRED")

    return {
        "status": "BLOCKED" if blockers else ("UNKNOWN" if warnings else "PASS"),
        "blockers": blockers,
        "warnings": warnings,
        "limits": {
            "maxWeightGram": tier["maxWeightGram"],
            "maxDimensionSumCm": tier["maxDimensionSumCm"],
            "maxSideCm": tier["maxSideCm"],
            "batteryRequirement": line["batteryRequirement"],
        },
    }


def _select_observed_tier(line: dict[str, Any], price_rub: float, weight_gram: float) -> dict[str, Any]:
    matches = [
        tier
        for tier in line["tiers"]
        if _price_in_tier(price_rub, tier) and _weight_in_tier(weight_gram, tier)
    ]
    if not matches:
        raise ValueError("price/weight combination is outside the selected ZTO service limits")
    return matches[0]


def _solve_target(
    *,
    rules: dict[str, Any],
    category: dict[str, Any],
    line: dict[str, Any],
    purchase_cost: float,
    other_cost: float,
    weight_gram: float,
    target_margin: float,
    advertising_rate: float,
    fixed_cost_rate: float,
    exchange_rate: float,
) -> dict[str, Any]:
    minimum_fee_cny = float(rules["currency"]["acquiringMinimumRub"]) / exchange_rate
    candidates: list[dict[str, Any]] = []
    commission_brackets = (
        ("upTo1500Rub", 0, 1500),
        ("upTo5000Rub", 1500, 5000),
        ("above5000Rub", 5000, math.inf),
    )
    for tier in line["tiers"]:
        if not _weight_in_tier(weight_gram, tier):
            continue
        freight = _shipping_cost(weight_gram, tier)
        total_cost = purchase_cost + other_cost + freight
        for bracket_name, bracket_min, bracket_max in commission_brackets:
            commission_rate = float(category["commissionRates"][bracket_name])
            variable_rate = target_margin + commission_rate + advertising_rate + fixed_cost_rate
            price_cny, acquiring_branch, acquiring_fee = _solve_price(
                total_cost, variable_rate, minimum_fee_cny
            )
            price_rub = price_cny * exchange_rate
            commission_valid = price_rub > bracket_min and price_rub <= bracket_max
            if not (commission_valid and _price_in_tier(price_rub, tier)):
                continue
            candidates.append(
                {
                    "salePriceCny": price_cny,
                    "salePriceRub": price_rub,
                    "freightCny": freight,
                    "totalCostCny": total_cost,
                    "commissionTier": bracket_name,
                    "commissionRate": commission_rate,
                    "serviceTier": tier,
                    "acquiringFeeCny": acquiring_fee,
                    "acquiringFeeBranch": acquiring_branch,
                }
            )
    if not candidates:
        raise ValueError("no valid price satisfies Ozon commission and ZTO service tiers")
    return min(candidates, key=lambda item: item["salePriceCny"])


def _evaluate_price(
    *,
    rules: dict[str, Any],
    category: dict[str, Any],
    line: dict[str, Any],
    purchase_cost: float,
    other_cost: float,
    weight_gram: float,
    sale_price_cny: float,
    advertising_rate: float,
    fixed_cost_rate: float,
    exchange_rate: float,
) -> dict[str, Any]:
    price_rub = sale_price_cny * exchange_rate
    commission_tier, commission_rate = _commission_for_rub(category, price_rub)
    service_tier = _select_observed_tier(line, price_rub, weight_gram)
    freight = _shipping_cost(weight_gram, service_tier)
    total_cost = purchase_cost + other_cost + freight
    minimum_fee = float(rules["currency"]["acquiringMinimumRub"]) / exchange_rate
    acquiring_fee = max(sale_price_cny * 0.02, minimum_fee)
    acquiring_branch = "two_percent" if sale_price_cny * 0.02 >= minimum_fee else "minimum_15_rub"
    commission_fee = sale_price_cny * commission_rate
    advertising_fee = sale_price_cny * advertising_rate
    fixed_cost_fee = sale_price_cny * fixed_cost_rate
    profit = sale_price_cny - total_cost - acquiring_fee - commission_fee - advertising_fee - fixed_cost_fee
    return {
        "salePriceCny": sale_price_cny,
        "salePriceRub": price_rub,
        "freightCny": freight,
        "totalCostCny": total_cost,
        "commissionTier": commission_tier,
        "commissionRate": commission_rate,
        "commissionFeeCny": commission_fee,
        "advertisingFeeCny": advertising_fee,
        "fixedCostFeeCny": fixed_cost_fee,
        "acquiringFeeCny": acquiring_fee,
        "acquiringFeeBranch": acquiring_branch,
        "profitCny": profit,
        "marginRate": profit / sale_price_cny,
        "serviceTier": service_tier,
    }


def _public_result(result: dict[str, Any]) -> dict[str, Any]:
    tier = result["serviceTier"]
    return {
        **{key: value for key, value in result.items() if key != "serviceTier"},
        "salePriceCny": _round(result["salePriceCny"]),
        "salePriceRub": _round(result["salePriceRub"]),
        "freightCny": _round(result["freightCny"]),
        "totalCostCny": _round(result["totalCostCny"]),
        "acquiringFeeCny": _round(result["acquiringFeeCny"]),
        **({"profitCny": _round(result["profitCny"]), "marginRate": _round(result["marginRate"], 6)} if "profitCny" in result else {}),
        "serviceTier": tier["name"],
    }


def ozon_pricing_engine(args: dict[str, Any]) -> dict[str, Any]:
    rules = load_rules()
    mode = str(args.get("mode") or "calculate").strip().lower()
    source = {
        "ruleVersion": rules["version"],
        "workbook": rules["source"]["workbook"],
        "workbookSha256": rules["source"].get("workbookSha256"),
        "rulesHash": rules["rulesHash"],
        "pricingFormulaVersion": rules["source"].get(
            "pricingFormulaVersion", "ozon-workbook-corrected/v1"
        ),
        "correctionsApplied": rules["source"]["corrections"],
    }
    if mode == "categories":
        return {
            "mode": mode,
            "categories": rules["categories"],
            "logistics": [
                {"value": name, "label": value["label"], "deliveryDays": value["deliveryDays"]}
                for name, value in rules["logistics"].items()
            ],
            "defaults": rules["defaults"],
            "currency": rules["currency"],
            "source": source,
        }
    if mode == "batch":
        items = args.get("items")
        if not isinstance(items, list) or not 1 <= len(items) <= 100:
            raise ValueError("batch items must contain between 1 and 100 rows")
        rows: list[dict[str, Any]] = []
        passed = cautions = rejected = blocked = failed = 0
        for index, raw in enumerate(items):
            item_id = str(index + 1)
            if isinstance(raw, dict):
                item_id = str(raw.get("item_id") or raw.get("sku") or item_id)
            try:
                if not isinstance(raw, dict):
                    raise ValueError("batch row must be an object")
                item_args = dict(raw)
                item_args.pop("item_id", None)
                item_args.pop("sku", None)
                item_args["mode"] = str(
                    item_args.get("mode")
                    or (
                        "evaluate"
                        if item_args.get("observed_sale_price_cny")
                        else "calculate"
                    )
                ).lower()
                if item_args["mode"] not in {"calculate", "evaluate"}:
                    raise ValueError("batch row mode must be calculate or evaluate")
                result = ozon_pricing_engine(item_args)
                decision = result["decision"]
                passed += int(decision == "PASS")
                cautions += int(decision == "CAUTION")
                rejected += int(decision == "REJECT")
                blocked += int(decision in {"BLOCKED", "DATA_INSUFFICIENT"})
                rows.append({"itemId": item_id, "ok": True, "result": result})
            except (TypeError, ValueError) as error:
                failed += 1
                rows.append(
                    {
                        "itemId": item_id,
                        "ok": False,
                        "error": {
                            "code": "OZON_PRICING_ROW_INVALID",
                            "message": str(error),
                        },
                    }
                )
        return {
            "mode": mode,
            "items": rows,
            "summary": {
                "total": len(rows),
                "passed": passed,
                "cautions": cautions,
                "rejected": rejected,
                "blocked": blocked,
                "failed": failed,
            },
            "source": source,
        }
    if mode not in {"calculate", "evaluate"}:
        raise ValueError("mode must be categories, calculate, evaluate, or batch")

    missing_fields = _missing_pricing_fields(args, mode)
    if missing_fields:
        return {
            "mode": mode,
            "status": "BLOCKED",
            "decision": "DATA_INSUFFICIENT",
            "publishable": False,
            "missingFields": missing_fields,
            "result": None,
            "source": source,
        }

    category = _category(rules, str(args.get("category") or ""))
    logistics = str(args.get("logistics") or "").strip().lower()
    if logistics not in rules["logistics"]:
        raise ValueError("logistics must be express, standard, or economy")
    line = rules["logistics"][logistics]
    purchase_cost = _positive(args.get("purchase_cost"), "purchase_cost")
    other_cost = _positive(args.get("other_cost", 0), "other_cost", allow_zero=True)
    weight_gram = _positive(args.get("weight_gram"), "weight_gram")
    exchange_rate = _positive(
        args.get("exchange_rate", rules["currency"]["rubPerCny"]), "exchange_rate"
    )
    advertising_rate = _rate(args.get("advertising_rate"), rules["defaults"]["advertisingRate"])
    fixed_cost_rate = _rate(args.get("fixed_cost_rate"), rules["defaults"]["fixedCostRate"])
    listing_multiplier = _positive(
        args.get("listing_multiplier", rules["defaults"]["listingMultiplier"]),
        "listing_multiplier",
    )

    if mode == "evaluate":
        observed = _positive(args.get("observed_sale_price_cny"), "observed_sale_price_cny")
        evaluated = _evaluate_price(
            rules=rules,
            category=category,
            line=line,
            purchase_cost=purchase_cost,
            other_cost=other_cost,
            weight_gram=weight_gram,
            sale_price_cny=observed,
            advertising_rate=advertising_rate,
            fixed_cost_rate=fixed_cost_rate,
            exchange_rate=exchange_rate,
        )
        package = _package_check(args, evaluated["serviceTier"], line)
        public = _public_result(evaluated)
        minimum_prices = {}
        for label, margin in (
            ("margin20", 0.2),
            ("margin15", 0.15),
            ("margin10", 0.1),
        ):
            minimum_prices[label] = _public_result(
                _solve_target(
                    rules=rules,
                    category=category,
                    line=line,
                    purchase_cost=purchase_cost,
                    other_cost=other_cost,
                    weight_gram=weight_gram,
                    target_margin=margin,
                    advertising_rate=advertising_rate,
                    fixed_cost_rate=fixed_cost_rate,
                    exchange_rate=exchange_rate,
                )
            )["salePriceCny"]
        public["minimumPricesCny"] = minimum_prices
        target_margin = _rate(args.get("target_margin_rate"), 0.2)
        if package["blockers"]:
            decision = "BLOCKED"
        elif public["profitCny"] <= 0:
            decision = "REJECT"
        elif public["marginRate"] + 1e-9 < target_margin:
            decision = "CAUTION"
        else:
            decision = "PASS"
        return {
            "mode": mode,
            "category": category,
            "logistics": {"key": logistics, "label": line["label"], "deliveryDays": line["deliveryDays"]},
            "inputs": {
                "purchaseCostCny": purchase_cost,
                "otherCostCny": other_cost,
                "weightGram": weight_gram,
                "targetMarginRate": target_margin,
                "advertisingRate": advertising_rate,
                "fixedCostRate": fixed_cost_rate,
                "exchangeRateRubPerCny": exchange_rate,
            },
            "result": public,
            "packageCompliance": package,
            "decision": decision,
            "source": source,
        }

    target_margin = _rate(args.get("target_margin_rate"), 0.2)
    target = _solve_target(
        rules=rules,
        category=category,
        line=line,
        purchase_cost=purchase_cost,
        other_cost=other_cost,
        weight_gram=weight_gram,
        target_margin=target_margin,
        advertising_rate=advertising_rate,
        fixed_cost_rate=fixed_cost_rate,
        exchange_rate=exchange_rate,
    )
    package = _package_check(args, target["serviceTier"], line)
    target_public = _public_result(target)
    minimum_prices = {}
    for label, margin in (("margin20", 0.2), ("margin15", 0.15), ("margin10", 0.1)):
        minimum_prices[label] = _public_result(
            _solve_target(
                rules=rules,
                category=category,
                line=line,
                purchase_cost=purchase_cost,
                other_cost=other_cost,
                weight_gram=weight_gram,
                target_margin=margin,
                advertising_rate=advertising_rate,
                fixed_cost_rate=fixed_cost_rate,
                exchange_rate=exchange_rate,
            )
        )["salePriceCny"]
    evaluated = _evaluate_price(
        rules=rules,
        category=category,
        line=line,
        purchase_cost=purchase_cost,
        other_cost=other_cost,
        weight_gram=weight_gram,
        sale_price_cny=target["salePriceCny"],
        advertising_rate=advertising_rate,
        fixed_cost_rate=fixed_cost_rate,
        exchange_rate=exchange_rate,
    )
    return {
        "mode": mode,
        "category": category,
        "logistics": {"key": logistics, "label": line["label"], "deliveryDays": line["deliveryDays"]},
        "inputs": {
            "purchaseCostCny": purchase_cost,
            "otherCostCny": other_cost,
            "weightGram": weight_gram,
            "targetMarginRate": target_margin,
            "advertisingRate": advertising_rate,
            "fixedCostRate": fixed_cost_rate,
            "exchangeRateRubPerCny": exchange_rate,
        },
        "result": {
            **target_public,
            "commissionFeeCny": _round(evaluated["commissionFeeCny"]),
            "advertisingFeeCny": _round(evaluated["advertisingFeeCny"]),
            "fixedCostFeeCny": _round(evaluated["fixedCostFeeCny"]),
            "profitCny": _round(evaluated["profitCny"]),
            "marginRate": _round(evaluated["marginRate"], 6),
            "listingPriceCny": _round(target["salePriceCny"] * listing_multiplier),
            "minimumPricesCny": minimum_prices,
        },
        "packageCompliance": package,
        "decision": "BLOCKED" if package["blockers"] else "PASS",
        "formulaTrace": [
            f"english_text = {target['serviceTier']['baseCny']} + {target['serviceTier']['perGramCny']} × {weight_gram}g",
            f"textcost = text {purchase_cost} + text {other_cost} + text {target['freightCny']:.4f}",
            f"priceenglish_textgross profit {target_margin:.2%}、commission {target['commissionRate']:.2%}、text {advertising_rate:.2%}、textcost {fixed_cost_rate:.2%}",
            f"english_text = {target['acquiringFeeBranch']}，text {target['acquiringFeeCny']:.4f} CNY",
        ],
        "source": source,
    }
