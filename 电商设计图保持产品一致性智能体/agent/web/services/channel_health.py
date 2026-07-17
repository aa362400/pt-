"""Lightweight, cached health probes for the three AI execution channels.

The public snapshot is intentionally credential-free.  Image probes only read
provider model metadata; they never request image generation and therefore do
not consume image-generation credits.
"""

from __future__ import annotations

import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable


_LOCK = threading.Lock()
_PROBE_LOCK = threading.Lock()
_CACHE: dict[str, object] | None = None
_CACHE_MONOTONIC = 0.0


class ChannelProbeError(RuntimeError):
    """Normalized transport failure used by provider-specific probes."""

    def __init__(self, status_code: int | None, provider_code: str = ""):
        super().__init__(provider_code)
        self.status_code = status_code or 0
        self.provider_code = provider_code


def get_channel_health(
    *, force: bool = False, timeout: float | None = None
) -> dict[str, object]:
    """Return a cached, sanitized health snapshot for llm/image/search."""

    if not force:
        cached = _fresh_cache()
        if cached is not None:
            return cached

    with _PROBE_LOCK:
        if not force:
            cached = _fresh_cache()
            if cached is not None:
                return cached

        probe_timeout = timeout if timeout is not None else _timeout_seconds()
        probes = {
            "llm": _probe_llm,
            "image": _probe_image,
            "search": _probe_search,
        }
        # The backend owns a bounded HTTP timeout. Running independent provider
        # probes concurrently keeps one slow search provider from hiding the
        # already-known model and image states behind an Agent timeout.
        with ThreadPoolExecutor(max_workers=len(probes)) as executor:
            futures = {
                channel: executor.submit(_run_probe, channel, probe, probe_timeout)
                for channel, probe in probes.items()
            }
            channels = {
                channel: future.result() for channel, future in futures.items()
            }
        statuses = [str(item.get("status")) for item in channels.values()]
        overall = (
            "available"
            if all(status == "available" for status in statuses)
            else "degraded"
            if any(status in {"available", "degraded"} for status in statuses)
            else "unavailable"
        )
        snapshot: dict[str, object] = {
            "overall": overall,
            "checkedAt": _now(),
            "cacheTtlSeconds": int(_ttl_seconds()),
            **channels,
        }
        global _CACHE, _CACHE_MONOTONIC
        with _LOCK:
            _CACHE = snapshot
            _CACHE_MONOTONIC = time.monotonic()
        return _copy_snapshot(snapshot)


def reset_cache_for_tests() -> None:
    global _CACHE, _CACHE_MONOTONIC
    with _LOCK:
        _CACHE = None
        _CACHE_MONOTONIC = 0.0


def _run_probe(
    channel: str,
    probe: Callable[[float], dict[str, object]],
    timeout: float,
) -> dict[str, object]:
    started = time.monotonic()
    try:
        result = dict(probe(timeout))
        result.setdefault("status", "available")
        result.setdefault("provider", None)
        result.setdefault("errorCode", None)
        result.setdefault("message", _success_message(channel, str(result["status"])))
    except ChannelProbeError as exc:
        result = _classify_failure(channel, exc.status_code, exc.provider_code)
    except Exception as exc:  # Boundary: never expose provider payloads or stacks.
        status_code = _status_code_from_exception(exc)
        result = _classify_failure(channel, status_code, str(exc))
    result["latencyMs"] = max(0, int((time.monotonic() - started) * 1000))
    return result


def _probe_llm(timeout: float) -> dict[str, object]:
    from web.services.llm_runtime import probe_if_stale

    snapshot = probe_if_stale(timeout=timeout)
    status = str(snapshot.get("status") or "unknown")
    raw_code = str(snapshot.get("lastErrorCode") or "")
    if raw_code == "no_configured_key":
        return {
            "status": "unconfigured",
            "provider": None,
            "model": snapshot.get("model"),
            "fallbackActive": False,
            "errorCode": None,
        }
    if status in {"quota_exhausted", "unavailable"}:
        if status == "quota_exhausted":
            code = "MODEL_PROVIDER_QUOTA_EXHAUSTED"
        else:
            code = "MODEL_PROVIDER_UNAVAILABLE"
        return {
            "status": status,
            "provider": "openai-compatible",
            "model": snapshot.get("model"),
            "fallbackActive": snapshot.get("fallbackActive") is True,
            "errorCode": code,
            "message": _failure_message("llm", code, raw_code),
        }
    return {
        "status": status,
        "provider": "openai-compatible" if status != "unconfigured" else None,
        "model": snapshot.get("model"),
        "fallbackActive": snapshot.get("fallbackActive") is True,
        "errorCode": None,
    }


def _probe_image(timeout: float) -> dict[str, object]:
    import requests
    from common.utils import (
        get_image_api_key,
        get_openai_image_api_base,
        get_openai_image_model,
        get_gemini_image_model,
        resolve_image_engine,
    )

    engine = resolve_image_engine(None)
    api_key = get_image_api_key(engine)
    if not api_key:
        return {"status": "unconfigured", "provider": None, "errorCode": None}

    if engine == "gemini":
        model = get_gemini_image_model()
        response = requests.get(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}",
            params={"key": api_key},
            timeout=timeout,
        )
        provider = "gemini"
    elif engine in {"dalle", "openai"}:
        model = get_openai_image_model()
        response = requests.get(
            f"{get_openai_image_api_base()}/models/{model}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )
        provider = "openai-compatible"
    else:
        # MiniMax has no zero-credit capability endpoint that is stable across
        # regions. Configuration is visible, but execution remains degraded
        # until a real generation records success.
        return {
            "status": "degraded",
            "provider": engine,
            "model": os.getenv("MINIMAX_IMAGE_MODEL", "").strip() or None,
            "errorCode": None,
            "message": "图片通道已配置，供应商不支持免额度探测，将在首次生图时确认。",
        }

    if not response.ok:
        raise ChannelProbeError(
            response.status_code,
            _provider_error_code(response),
        )
    return {
        "status": "available",
        "provider": provider,
        "model": model,
        "errorCode": None,
    }


def _probe_search(timeout: float) -> dict[str, object]:
    from common.web_search import resolve_search_provider, search_web

    provider, _ = resolve_search_provider()
    if not provider:
        return {"status": "unconfigured", "provider": None, "errorCode": None}
    try:
        search_web(
            "site:ozon.ru товар",
            num_results=1,
            deadline_monotonic=time.monotonic() + timeout,
        )
    except Exception as exc:
        raise ChannelProbeError(_status_code_from_exception(exc), str(exc)) from exc
    return {"status": "available", "provider": provider, "errorCode": None}


def _classify_failure(
    channel: str, status_code: int, provider_code: str
) -> dict[str, object]:
    normalized = provider_code.lower()
    is_quota = status_code in {402, 429} or any(
        marker in normalized
        for marker in ("insufficient_quota", "quota_exceeded", "resource_exhausted")
    )
    is_auth = status_code in {401, 403} and not is_quota
    prefixes = {"llm": "MODEL", "image": "IMAGE", "search": "SEARCH"}
    prefix = prefixes[channel]
    if is_quota:
        code = f"{prefix}_PROVIDER_QUOTA_EXHAUSTED"
        status = "quota_exhausted"
    elif is_auth and channel == "image":
        code = "IMAGE_PROVIDER_INVALID_KEY"
        status = "unavailable"
    else:
        code = f"{prefix}_PROVIDER_UNAVAILABLE"
        status = "unavailable"
    return {
        "status": status,
        "provider": None,
        "errorCode": code,
        "message": _failure_message(channel, code, provider_code),
    }


def _failure_message(channel: str, code: str, _provider_code: str = "") -> str:
    labels = {"llm": "大模型", "image": "图片生成", "search": "联网搜索"}
    if code.endswith("QUOTA_EXHAUSTED"):
        return f"{labels[channel]}通道额度已用尽，请充值或切换已授权供应商。"
    if code == "IMAGE_PROVIDER_INVALID_KEY":
        return "图片生成通道密钥无效，请更新密钥后重试。"
    return f"{labels[channel]}通道当前不可用，请检查供应商配置或稍后重试。"


def _success_message(channel: str, status: str) -> str:
    labels = {"llm": "大模型", "image": "图片生成", "search": "联网搜索"}
    if status == "unconfigured":
        return f"{labels[channel]}通道尚未配置。"
    if status == "degraded":
        return f"{labels[channel]}通道处于降级状态。"
    return f"{labels[channel]}通道可用。"


def _provider_error_code(response) -> str:
    try:
        payload = response.json()
    except (TypeError, ValueError):
        return f"http_{getattr(response, 'status_code', 0) or 'error'}"
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        return str(error.get("code") or error.get("status") or "provider_error")
    return "provider_error"


def _status_code_from_exception(exc: Exception) -> int:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    match = re.search(r"(?<!\d)(401|402|403|429|5\d\d)(?!\d)", str(exc))
    return int(match.group(1)) if match else 0


def _fresh_cache() -> dict[str, object] | None:
    with _LOCK:
        if _CACHE is None or _CACHE_MONOTONIC <= 0:
            return None
        if time.monotonic() - _CACHE_MONOTONIC >= _ttl_seconds():
            return None
        return _copy_snapshot(_CACHE)


def _copy_snapshot(snapshot: dict[str, object]) -> dict[str, object]:
    return {
        key: dict(value) if isinstance(value, dict) else value
        for key, value in snapshot.items()
    }


def _ttl_seconds() -> float:
    try:
        # The task contract requires a minimum five-minute cache.
        return max(300.0, float(os.getenv("CHANNEL_HEALTH_CACHE_TTL_SECONDS", "300")))
    except ValueError:
        return 300.0


def _timeout_seconds() -> float:
    try:
        return max(1.0, float(os.getenv("CHANNEL_HEALTH_PROBE_TIMEOUT_SECONDS", "5")))
    except ValueError:
        return 5.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
