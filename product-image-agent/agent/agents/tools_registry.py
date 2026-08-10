"""english_text — agentenglish_textplatformenglish_text。

english_textyes：name, description, input_schema, callable。
english_text（Stage 11）passed registry english_text。
"""

from datetime import datetime, timezone
from typing import Any, Callable, Iterable
import hashlib
import json
import logging
import math
import os
import re
import threading
import time

from common.runtime_paths import ensure_runtime_paths

logger = logging.getLogger("tools_registry")

_tools: dict[str, dict] = {}
_audit_lock = threading.Lock()

MAX_STANDARD_STRING_LENGTH = 20_000
MAX_IMAGE_BASE64_LENGTH = 30 * 1024 * 1024
MAX_LIST_ITEMS = 200
MAX_OBJECT_KEYS = 200
MAX_INPUT_DEPTH = 8


class ToolInputValidationError(ValueError):
    """Raised before a tool runs when its declared input contract is violated."""


class ToolAuditError(RuntimeError):
    """Raised when the mandatory tool-call audit trail cannot be persisted."""


def _camel_to_snake(name: str) -> str:
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
        default=lambda item: f"<{type(item).__name__}>",
    )


def _digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _audit_identifiers(context: dict | None) -> dict[str, str]:
    normalized = {
        _camel_to_snake(str(key)): value for key, value in (context or {}).items()
    }

    def first(*keys: str) -> str:
        for key in keys:
            value = normalized.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()[:160]
        return ""

    values = {
        "traceId": first("trace_id", "request_id"),
        "runId": first("run_id", "agent_run_id", "task_id", "job_id"),
        "tenantId": first("tenant_id", "organization_id", "org_id"),
        "workspaceId": first("workspace_id"),
    }
    return {key: value for key, value in values.items() if value}


def _write_audit_event(event: dict) -> None:
    try:
        paths = ensure_runtime_paths()
        now = datetime.now(timezone.utc)
        record = {
            "timestamp": now.isoformat(),
            "eventType": "agent.tool.call",
            **event,
        }
        path = os.path.join(paths.logs, f"tool-calls-{now.date().isoformat()}.jsonl")
        line = _canonical_json(record) + "\n"
        with _audit_lock:
            with open(path, "a", encoding="utf-8", newline="\n") as handle:
                handle.write(line)
                handle.flush()
                os.fsync(handle.fileno())
    except Exception as exc:
        raise ToolAuditError("Tool audit trail is unavailable; execution blocked") from exc


def _validate_structure(value: Any, path: str, depth: int = 0) -> None:
    if depth > MAX_INPUT_DEPTH:
        raise ToolInputValidationError(f"{path} exceeds maximum nesting depth")
    if isinstance(value, dict):
        if len(value) > MAX_OBJECT_KEYS:
            raise ToolInputValidationError(f"{path} has too many object keys")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 128:
                raise ToolInputValidationError(f"{path} contains an invalid object key")
            _validate_structure(item, f"{path}.{key}", depth + 1)
    elif isinstance(value, list):
        if len(value) > MAX_LIST_ITEMS:
            raise ToolInputValidationError(f"{path} has too many list items")
        for index, item in enumerate(value):
            _validate_structure(item, f"{path}[{index}]", depth + 1)
    elif isinstance(value, str):
        max_length = (
            MAX_IMAGE_BASE64_LENGTH
            if path.rsplit(".", 1)[-1] in {"image_base64", "base64"}
            else MAX_STANDARD_STRING_LENGTH
        )
        if len(value) > max_length:
            raise ToolInputValidationError(f"{path} exceeds maximum string length")


def _schema_rule(spec: Any) -> tuple[str, bool, str | None]:
    if isinstance(spec, list):
        if len(spec) != 1 or not isinstance(spec[0], str):
            raise ToolInputValidationError("List schemas must declare one item type")
        item_type = spec[0]
        optional = item_type.endswith("?")
        return "list", optional, item_type.rstrip("?")
    if not isinstance(spec, str):
        raise ToolInputValidationError("Tool schema values must be strings or one-item lists")
    optional = spec.endswith("?")
    return spec.rstrip("?"), optional, None


def _validate_scalar(value: Any, kind: str, path: str) -> None:
    if "|" in kind:
        allowed = kind.split("|")
        if not isinstance(value, str) or value not in allowed:
            raise ToolInputValidationError(
                f"{path} must be one of: {', '.join(allowed)}"
            )
        return
    if kind == "string":
        if not isinstance(value, str):
            raise ToolInputValidationError(f"{path} must be a string")
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ToolInputValidationError(f"{path} must be a number")
        if not math.isfinite(float(value)):
            raise ToolInputValidationError(f"{path} must be a finite number")
    elif kind == "boolean":
        if not isinstance(value, bool):
            raise ToolInputValidationError(f"{path} must be a boolean")
    elif kind == "object":
        if not isinstance(value, dict):
            raise ToolInputValidationError(f"{path} must be an object")
    else:
        raise ToolInputValidationError(f"Unsupported schema type for {path}: {kind}")
    _validate_structure(value, path)


def _normalize_kwargs(kwargs: dict) -> dict:
    normalized: dict[str, Any] = {}
    for key, value in kwargs.items():
        normalized_key = _camel_to_snake(str(key))
        if normalized_key in normalized:
            raise ToolInputValidationError(f"Duplicate input key: {normalized_key}")
        normalized[normalized_key] = value
    return normalized


def _validate_tool_input(tool: dict, kwargs: dict) -> dict:
    normalized = _normalize_kwargs(kwargs)
    schema = {
        _camel_to_snake(str(key)): value
        for key, value in tool["input_schema"].items()
    }
    context_keys = {
        _camel_to_snake(str(key)) for key in tool.get("context_keys", ())
    }
    unknown = sorted(set(normalized) - set(schema) - context_keys)
    if unknown:
        raise ToolInputValidationError(
            f"Unknown input field(s): {', '.join(unknown)}"
        )

    for key, spec in schema.items():
        kind, optional, item_type = _schema_rule(spec)
        if key not in normalized:
            if not optional:
                raise ToolInputValidationError(f"Missing required input field: {key}")
            continue
        value = normalized[key]
        if value is None and optional:
            continue
        if kind == "list":
            if not isinstance(value, list):
                raise ToolInputValidationError(f"{key} must be a list")
            _validate_structure(value, key)
            for index, item in enumerate(value):
                _validate_scalar(item, item_type or "string", f"{key}[{index}]")
        else:
            _validate_scalar(value, kind, key)

    for key in context_keys & set(normalized):
        _validate_structure(normalized[key], key)
    return normalized


def register(
    name: str,
    description: str,
    input_schema: dict,
    fn: Callable,
    *,
    planner_enabled: bool = True,
    side_effect: bool = False,
    retry_safe: bool = True,
    max_attempts: int = 2,
    context_keys: Iterable[str] = (),
    trusted_context_keys: Iterable[str] = (),
) -> None:
    if not isinstance(input_schema, dict):
        raise ValueError("input_schema must be an object")
    attempts = max(1, min(int(max_attempts), 2))
    if side_effect:
        retry_safe = False
        attempts = 1
    _tools[name] = {
        "name": name,
        "description": description,
        "input_schema": input_schema,
        "fn": fn,
        "planner_enabled": bool(planner_enabled),
        "side_effect": bool(side_effect),
        "retry_safe": bool(retry_safe),
        "max_attempts": attempts,
        "context_keys": tuple(context_keys),
        "trusted_context_keys": tuple(trusted_context_keys),
    }


def list_tools(planner_only: bool = True) -> list[dict]:
    return [
        {
            "name": name,
            "description": tool["description"],
            "input_schema": tool["input_schema"],
            "planner_enabled": tool["planner_enabled"],
            "side_effect": tool["side_effect"],
            "retry_safe": tool["retry_safe"],
            "max_attempts": tool["max_attempts"],
            "context_keys": list(tool["context_keys"]),
            "trusted_context_keys": list(tool["trusted_context_keys"]),
        }
        for name, tool in _tools.items()
        if not planner_only or tool["planner_enabled"]
    ]


def call_tool(name: str, **kwargs) -> Any:
    audit_context = kwargs.pop("_audit_context", None)
    tool = _tools.get(name)
    if not tool:
        _write_audit_event(
            {
                "toolName": str(name)[:160],
                "status": "rejected",
                "errorCode": "UNKNOWN_TOOL",
                "inputHash": _digest(kwargs),
                "inputKeys": sorted(str(key) for key in kwargs),
                **_audit_identifiers(audit_context),
            }
        )
        raise ValueError(f"Unknown tool: {name}")

    started = time.perf_counter()
    try:
        validated = _validate_tool_input(tool, kwargs)
    except ToolInputValidationError:
        _write_audit_event(
            {
                "toolName": name,
                "status": "rejected",
                "errorCode": "INVALID_TOOL_INPUT",
                "inputHash": _digest(kwargs),
                "inputKeys": sorted(str(key) for key in kwargs),
                **_audit_identifiers(audit_context),
            }
        )
        raise

    base_event = {
        "toolName": name,
        "inputHash": _digest(validated),
        "inputKeys": sorted(validated),
        "inputBytes": len(_canonical_json(validated).encode("utf-8")),
        "sideEffect": tool["side_effect"],
        **_audit_identifiers(audit_context),
    }
    _write_audit_event({**base_event, "status": "started"})
    try:
        output = tool["fn"](**validated)
    except Exception as exc:
        _write_audit_event(
            {
                **base_event,
                "status": "failed",
                "durationMs": round((time.perf_counter() - started) * 1000, 3),
                "errorCode": "TOOL_EXECUTION_FAILED",
                "errorType": type(exc).__name__,
            }
        )
        raise
    _write_audit_event(
        {
            **base_event,
            "status": "completed",
            "durationMs": round((time.perf_counter() - started) * 1000, 3),
            "outputHash": _digest(output),
            "outputType": type(output).__name__,
        }
    )
    return output


# === Register built-in tools ===

def _tool_product_research(product_name: str, marketplace: str = "amazon.com",
                           **_context) -> dict:
    from web.services.platform_tasks import run_text_task
    result = run_text_task("product_research", {
        "productName": product_name,
        "marketplace": marketplace,
    })
    return result


def _tool_keyword_analysis(seed_keywords: list | None = None,
                           marketplace: str = "amazon.com", **_context) -> dict:
    from web.services.platform_tasks import run_text_task
    result = run_text_task("keyword_analysis", {
        "seedKeywords": seed_keywords or [],
        "marketplace": marketplace,
    })
    return result


def _tool_listing_generation(product_name: str, platform: str = "amazon",
                             **context) -> dict:
    from web.services.platform_tasks import run_text_task
    result = run_text_task("listing_generation", {
        "productName": product_name,
        "platform": platform,
        "keywords": context.get("seedKeywords") or context.get("keywords") or [],
        "description": context.get("research_summary", ""),
        "context": context.get("context", {}),
    })
    return result


def _tool_trend_analysis(category: str, marketplace: str = "amazon.com",
                         **_context) -> dict:
    from web.services.platform_tasks import run_text_task
    result = run_text_task("trend_analysis", {
        "category": category,
        "marketplace": marketplace,
    })
    return result


def _tool_image_prompt(product_name: str, style: str = "product_photography",
                       description: str = "", **_context) -> dict:
    from web.services.platform_tasks import run_text_task
    input_data = {"productName": product_name, "style": style}
    if description:
        input_data["description"] = description
    result = run_text_task("image_prompt", input_data)
    return result


def _tool_generate_images(product_name: str, image_base64: str = "",
                          image_url: str = "", scene_count: int = 5,
                          platforms: list | None = None, message: str = "",
                          **context) -> dict:
    if not image_base64 and not image_url:
        raise ValueError("generate_images requires imageBase64 or imageUrl")
    return {
        "taskType": "generate_images",
        "status": "ready",
        "input": {
            "productName": product_name,
            "imageBase64": image_base64 or None,
            "imageUrl": image_url or None,
            "sceneCount": max(1, min(int(scene_count or 5), 9)),
            "platforms": platforms or context.get("platforms") or [],
            "message": message or f"Generate listing images for {product_name}",
        },
    }


def _profit_data_insufficient(platform: str, missing_fields: list[str]) -> dict:
    return {
        "tool": "profit_calculation",
        "platform": platform,
        "status": "BLOCKED",
        "decision": "DATA_INSUFFICIENT",
        "publishable": False,
        "missingFields": missing_fields,
        "result": None,
    }


def _tool_profit_calculation(
    price: float | None = None,
    cost: float | None = None,
    freight: float | None = None,
    platform: str = "amazon",
    fee_pct: float | None = None,
    category: str | None = None,
    logistics: str | None = None,
    weight_gram: float | None = None,
    length_cm: float | None = None,
    width_cm: float | None = None,
    height_cm: float | None = None,
    **context,
) -> dict:
    platform_key = str(platform or "").strip().lower()
    missing: list[str] = []
    if price is None or float(price) <= 0:
        missing.append("salePriceCny")
    if cost is None or float(cost) <= 0:
        missing.append("purchaseCostCny")

    if platform_key == "ozon":
        required_ozon = (
            (category, "ozonCategory"),
            (logistics, "logistics"),
            (weight_gram, "weightGram"),
            (length_cm, "lengthCm"),
            (width_cm, "widthCm"),
            (height_cm, "heightCm"),
        )
        for value, field in required_ozon:
            if value is None or value == "":
                missing.append(field)
            elif field not in {"ozonCategory", "logistics"} and float(value) <= 0:
                missing.append(field)
        if missing:
            return _profit_data_insufficient(platform_key, missing)

        from web.services.ozon_pricing import ozon_pricing_engine

        priced = ozon_pricing_engine(
            {
                "mode": "evaluate",
                "category": category,
                "logistics": logistics,
                "purchase_cost": float(cost),
                "weight_gram": float(weight_gram),
                "observed_sale_price_cny": float(price),
                "length_cm": float(length_cm),
                "width_cm": float(width_cm),
                "height_cm": float(height_cm),
            }
        )
        decision = priced["decision"]
        return {
            **priced,
            "tool": "profit_calculation",
            "status": "BLOCKED" if decision == "BLOCKED" else "VERIFIED",
            "publishable": decision == "PASS",
            "missingFields": [],
        }

    if freight is None:
        missing.append("freightCny")
    if fee_pct is None:
        missing.append("platformFeePct")
    if missing:
        return _profit_data_insufficient(platform_key, missing)

    from web.services.biz_tools import calc_profit

    result = calc_profit(
        price=float(price),
        cost=float(cost),
        freight=float(freight),
        platform=platform_key,
        fee_pct=float(fee_pct),
        mode=str(context.get("mode") or "normal"),
    )
    return {
        "tool": "profit_calculation",
        "platform": platform_key,
        "status": "VERIFIED",
        "decision": "PASS" if result["profit"] > 0 else "REJECT",
        "publishable": result["profit"] > 0,
        "missingFields": [],
        "result": result,
    }


def _tool_temu_price_check(**context) -> dict:
    from web.services.biz_tools import temu_price_check
    return temu_price_check(context)


def register_defaults():
    register(
        "product_research",
        "Research a product on a marketplace",
        {"productName": "string", "marketplace": "string?"},
        _tool_product_research,
    )
    register(
        "keyword_analysis",
        "Analyze keywords for SEO",
        {"seedKeywords": ["string?"], "marketplace": "string?"},
        _tool_keyword_analysis,
    )
    register(
        "listing_generation",
        "Generate listing copy for a product",
        {
            "productName": "string",
            "platform": "amazon|shopify|etsy|ebay|ozon|temu|tiktok",
        },
        _tool_listing_generation,
        context_keys=("seedKeywords", "keywords", "research_summary", "context"),
    )
    register(
        "trend_analysis",
        "Analyze market trends for a category",
        {"category": "string", "marketplace": "string?"},
        _tool_trend_analysis,
    )
    register(
        "image_prompt",
        "Generate an image-generation prompt for a product",
        {"productName": "string", "style": "string?", "description": "string?"},
        _tool_image_prompt,
    )
    register(
        "generate_images",
        "Prepare a generate_images task payload for listing images",
        {
            "productName": "string",
            "imageBase64": "string?",
            "imageUrl": "string?",
            "sceneCount": "number?",
            "platforms": ["string?"],
            "message": "string?",
        },
        _tool_generate_images,
    )
    register(
        "profit_calculation",
        "Calculate profit only from explicit costs and verifiable marketplace rates",
        {
            "price": "number?",
            "cost": "number?",
            "freight": "number?",
            "platform": "string?",
            "feePct": "number?",
            "category": "string?",
            "logistics": "express|standard|economy?",
            "weightGram": "number?",
            "lengthCm": "number?",
            "widthCm": "number?",
            "heightCm": "number?",
        },
        _tool_profit_calculation,
        context_keys=("mode",),
    )
    register(
        "temu_price_check",
        "Run TEMU shadow price-check analysis with explainable risk scoring",
        {
            "productName": "string?",
            "declaredPrice": "number",
            "cost": "number",
            "titleIndependenceScore": "number?",
            "imageIndependenceScore": "number?",
            "deliveryComponents": ["string?"],
            "realDeliveryEvidence": "boolean?",
        },
        _tool_temu_price_check,
    )


# Auto-register defaults on import
register_defaults()
