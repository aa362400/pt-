"""权限客户端 — 智能体执行任何敏感操作前向平台验证权限。

检查链路：
1. 该操作是否需要权限？→ 否：直接执行
2. 该组织的 agent-autonomy 是否启用？→ 否：拒绝
3. 该操作对应的权限等级在组织允许范围内？→ 否：拒绝
4. 是否需要人工确认？→ 是：标记为待确认
"""

import logging
import os

logger = logging.getLogger("permission_client")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

LEVEL_NAMES = {1: "只读分析", 2: "草稿生成", 3: "数据修改", 4: "发布/付费"}


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
    """一站式权限检查：验证→记录→返回结果。"""
    result = check_action(org_id, action_name)

    if not result.get("allowed"):
        logger.warning("Permission DENIED: %s/%s — %s", org_id, action_name,
                       result.get("reason", ""))
        return {"granted": False, "reason": result.get("reason", "权限不足"),
                "requireConfirm": True}

    if result.get("requireConfirm"):
        logger.info("Permission GRANTED with confirmation: %s/%s", org_id, action_name)
        return {"granted": True, "requireConfirm": True, "level": result.get("level")}

    logger.info("Permission GRANTED: %s/%s (level %s)", org_id, action_name, result.get("level"))
    return {"granted": True, "requireConfirm": False, "level": result.get("level")}
