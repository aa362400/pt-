"""Signed, best-effort callbacks from the Python Agent to ShopMate."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time

from web.services.trace_context import current_trace_headers


logger = logging.getLogger("platform_webhook")
_TIMEOUT = 5


def enabled() -> bool:
    return bool(
        os.environ.get("PLATFORM_CALLBACK_URL", "").strip()
        and os.environ.get("AGENT_WEBHOOK_SECRET", "").strip()
    )


def _signed_headers(secret: bytes, body: bytes) -> dict[str, str]:
    signature = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Agent-Signature": signature,
        **current_trace_headers(),
    }


def notify_run_event(
    agent_run_id: str,
    organization_id: str,
    status: str,
    stage: str = "",
    message: str = "",
) -> bool:
    """Push a run event without allowing callback failure to alter task state."""
    if not agent_run_id or not organization_id or not enabled():
        return False

    base = os.environ["PLATFORM_CALLBACK_URL"].rstrip("/")
    secret = os.environ["AGENT_WEBHOOK_SECRET"].encode("utf-8")
    body = json.dumps(
        {
            "organizationId": organization_id,
            "runId": agent_run_id,
            "status": status,
            "stage": stage or None,
            "message": message or None,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
        ensure_ascii=False,
    ).encode("utf-8")

    try:
        import requests

        response = requests.post(
            f"{base}/api/v1/agent-runs/{agent_run_id}/events",
            data=body,
            headers=_signed_headers(secret, body),
            timeout=_TIMEOUT,
        )
        if response.status_code >= 300:
            logger.warning(
                "Platform run callback rejected %s: %s",
                response.status_code,
                response.text[:200],
            )
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Platform run callback failed: %s", exc)
        return False


def notify_lifecycle_event(
    agent_run_id: str,
    organization_id: str,
    event: str,
    event_key: str,
    *,
    attempt: int = 1,
    current_step: str = "",
    payload: dict | None = None,
) -> bool:
    """Emit a validated lifecycle event without writing platform state directly."""
    if not agent_run_id or not organization_id or not event_key or not enabled():
        return False

    from common.agent_lifecycle import AgentLifecycleEvent

    try:
        normalized_event = AgentLifecycleEvent(event).value
    except ValueError:
        logger.warning("Rejected unknown Agent lifecycle event: %s", event)
        return False

    base = os.environ["PLATFORM_CALLBACK_URL"].rstrip("/")
    secret = os.environ["AGENT_WEBHOOK_SECRET"].encode("utf-8")
    body = json.dumps(
        {
            "organizationId": organization_id,
            "runId": agent_run_id,
            "event": normalized_event,
            "eventKey": event_key,
            "payload": payload or {},
            "attempt": max(1, int(attempt)),
            "currentStep": current_step or normalized_event,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")

    try:
        import requests

        response = requests.post(
            f"{base}/api/v1/agent-runs/{agent_run_id}/lifecycle-events",
            data=body,
            headers=_signed_headers(secret, body),
            timeout=_TIMEOUT,
        )
        if response.status_code >= 300:
            logger.warning(
                "Platform lifecycle callback rejected %s: %s",
                response.status_code,
                response.text[:200],
            )
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Platform lifecycle callback failed: %s", exc)
        return False
