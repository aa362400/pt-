"""textcustomertext — agentenglish_textplatformenglish_text。

english_text：
1. english_textyesnoenglish_text？→ no：english_text
2. english_text agent-autonomy yesnotext？→ no：text
3. english_text？→ no：text
4. yesnotexthumantext？→ yes：english_text
"""

import logging
import os

logger = logging.getLogger("permission_client")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

LEVEL_NAMES = {1: "english_text", 2: "textgeneration", 3: "datatext", 4: "publish/text"}


def _headers():
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def check_action(org_id: str, action_name: str) -> dict:
    """Check if agent is allowed to perform an action for an org.
    Returns: {allowed, level, requireConfirm, reason}"""
    if not AGENT_API_KEY:
        return {"allowed": False, "level": 1, "requireConfirm": True,
                "reason": "AGENT_API_KEY not configured"}
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/admin/agent/check",
            headers=_headers(),
            params={"orgId": org_id, "action": action_name},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as exc:
        logger.warning("Permission check failed: %s", exc)
    return {"allowed": False, "level": 1, "requireConfirm": True,
            "reason": "Permission service unreachable"}


def is_autonomy_enabled(org_id: str) -> bool:
    """Check if agent autonomy is enabled for an org."""
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/admin/agent/autonomy",
            headers=_headers(),
            params={"orgId": org_id},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json().get("enabled", False)
    except Exception:
        pass
    return False


def require_permission(org_id: str, action_name: str, action_label: str = "") -> dict:
    """english_text：text→text→english_text。"""
    result = check_action(org_id, action_name)

    if not result.get("allowed"):
        logger.warning("Permission DENIED: %s/%s — %s", org_id, action_name,
                       result.get("reason", ""))
        return {"granted": False, "reason": result.get("reason", "english_text"),
                "requireConfirm": True}

    if result.get("requireConfirm"):
        logger.info("Permission GRANTED with confirmation: %s/%s", org_id, action_name)
        return {"granted": True, "requireConfirm": True, "level": result.get("level")}

    logger.info("Permission GRANTED: %s/%s (level %s)", org_id, action_name, result.get("level"))
    return {"granted": True, "requireConfirm": False, "level": result.get("level")}
