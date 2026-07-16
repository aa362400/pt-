"""Safe, process-local LLM runtime state for platform task observability."""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone


_LOCK = threading.Lock()
_PROBE_LOCK = threading.Lock()
_LAST_PROBE_MONOTONIC = 0.0
_STATE: dict[str, object] = {
    "status": "unknown",
    "model": "",
    "keyRole": None,
    "lastSuccessAt": None,
    "lastFailureAt": None,
    "lastErrorCode": None,
    "lastProbeAt": None,
    "fallbackActive": False,
}


def configured_key_candidates() -> list[tuple[str, str]]:
    """Return unique configured keys in preferred order without exposing values."""
    candidates: list[tuple[str, str]] = []
    premium = os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()
    standard = os.getenv("OPENAI_API_KEY", "").strip()
    if premium:
        candidates.append(("premium", premium))
    if standard and standard != premium:
        candidates.append(("standard", standard))
    return candidates


def configured_model() -> str:
    return os.getenv("LLM_MODEL", "gpt-5.5").strip() or "gpt-5.5"


def configured_model_candidates() -> list[str]:
    """Return configured primary and backup models without duplicates."""
    candidates = [configured_model()]
    backup = os.getenv("LLM_MODEL_BACKUP", "").strip()
    if backup and backup not in candidates:
        candidates.append(backup)
    return candidates


def mark_success(
    key_role: str,
    model: str | None = None,
    fallback_active: bool | None = None,
) -> None:
    keys = configured_key_candidates()
    models = configured_model_candidates()
    primary_key_role = keys[0][0] if keys else key_role
    active_model = model or configured_model()
    fallback = (
        fallback_active
        if fallback_active is not None
        else key_role != primary_key_role or active_model != models[0]
    )
    with _LOCK:
        _STATE.update(
            {
                "status": "degraded" if fallback else "available",
                "model": active_model,
                "keyRole": key_role,
                "lastSuccessAt": _now(),
                "lastErrorCode": None,
                "fallbackActive": fallback,
            }
        )


def mark_quota_exhausted() -> None:
    with _LOCK:
        _STATE.update(
            {
                "status": "quota_exhausted",
                "model": configured_model(),
                "keyRole": None,
                "lastFailureAt": _now(),
                "lastErrorCode": "insufficient_user_quota",
                "fallbackActive": False,
            }
        )


def mark_unavailable(error_code: str = "gateway_unavailable") -> None:
    with _LOCK:
        _STATE.update(
            {
                "status": "unavailable",
                "model": configured_model(),
                "keyRole": None,
                "lastFailureAt": _now(),
                "lastErrorCode": error_code,
                "fallbackActive": False,
            }
        )


def snapshot() -> dict[str, object]:
    """Return diagnostics safe for APIs and UI; never includes a credential."""
    with _LOCK:
        state = dict(_STATE)
    state["configuredKeyRoles"] = [role for role, _ in configured_key_candidates()]
    state["model"] = state.get("model") or configured_model()
    return state


def probe_if_stale(force: bool = False, timeout: float | None = None) -> dict[str, object]:
    """Run a tiny real completion request when the cached probe is stale."""
    if not force and _probe_is_fresh():
        return snapshot()

    with _PROBE_LOCK:
        if not force and _probe_is_fresh():
            return snapshot()

        keys = configured_key_candidates()
        models = configured_model_candidates()
        if not keys:
            mark_unavailable("no_configured_key")
            _mark_probe_completed()
            return snapshot()

        import requests

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        probe_timeout = timeout if timeout is not None else _probe_timeout_seconds()
        attempts = [
            (key_role, key, model)
            for model in models
            for key_role, key in keys
        ]
        quota_failures = 0
        last_error_code = "gateway_unavailable"

        for attempt_index, (key_role, key, model) in enumerate(attempts):
            try:
                response = requests.post(
                    f"{base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Reply OK"}],
                        "max_tokens": 1,
                    },
                    timeout=probe_timeout,
                )
                response.raise_for_status()
            except requests.HTTPError as exc:
                if _is_quota_error(getattr(exc, "response", None)):
                    quota_failures += 1
                else:
                    status_code = getattr(getattr(exc, "response", None), "status_code", 0)
                    last_error_code = f"http_{status_code or 'error'}"
                continue
            except requests.RequestException:
                last_error_code = "gateway_unavailable"
                continue

            mark_success(key_role, model=model, fallback_active=attempt_index > 0)
            _mark_probe_completed()
            return snapshot()

        if quota_failures == len(attempts):
            mark_quota_exhausted()
        else:
            mark_unavailable(
                "primary_quota_exhausted_fallback_unavailable"
                if quota_failures > 0
                else last_error_code
            )
        _mark_probe_completed()
        return snapshot()


def _is_quota_error(response) -> bool:
    status_code = getattr(response, "status_code", 0)
    try:
        body = response.json() if response is not None else {}
    except (TypeError, ValueError):
        body = {}
    details = body.get("error") if isinstance(body, dict) else {}
    code = str(details.get("code") or "").strip().lower() if isinstance(details, dict) else ""
    return status_code in (402, 403, 429) and code in {
        "insufficient_user_quota",
        "insufficient_quota",
        "quota_exceeded",
    }


def _probe_is_fresh() -> bool:
    with _LOCK:
        last_probe = _LAST_PROBE_MONOTONIC
    return last_probe > 0 and time.monotonic() - last_probe < _probe_ttl_seconds()


def _mark_probe_completed() -> None:
    global _LAST_PROBE_MONOTONIC
    completed_at = _now()
    with _LOCK:
        _LAST_PROBE_MONOTONIC = time.monotonic()
        _STATE["lastProbeAt"] = completed_at


def _probe_ttl_seconds() -> float:
    try:
        return max(0.0, float(os.getenv("LLM_HEALTH_PROBE_TTL_SECONDS", "300")))
    except ValueError:
        return 300.0


def _probe_timeout_seconds() -> float:
    try:
        return max(1.0, float(os.getenv("LLM_HEALTH_PROBE_TIMEOUT_SECONDS", "5")))
    except ValueError:
        return 5.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
