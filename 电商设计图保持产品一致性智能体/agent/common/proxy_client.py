"""平台代理客户端 — 智能体通过它调用平台 API，走权限检查+审计。

每个调用前先 check permission，后 execute。
PUBLISH 级别的操作返回 pending_confirmation，不会自动执行。
"""

import json
import logging
import os

logger = logging.getLogger("proxy_client")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

# Autonomous planning may call only these non-mutating platform actions. The
# backend permission level is checked as well, but this local list prevents a
# malformed capability manifest from relabeling a write action as read-only.
AUTONOMOUS_READ_ONLY_ACTIONS = frozenset(
    {
        "profit.analyze",
        "temu.price_check",
        "temu.pricing.calculate",
        "ozon.pricing.calculate",
        "commerce.profit.calculate",
        "commerce.keywords.analyze",
        "commerce.risk.check",
        "listing.quality.score",
        "linkfoxskill.version",
        "linkfoxskill.agentlist",
        "linkfoxskill.search",
        "product.research",
        "keyword.analyze",
        "trend.analyze",
    }
)


class PlatformProxyExecutionError(RuntimeError):
    """Raised when a read-only platform action was not actually executed."""


def _execute_read_only_action(org_id: str, action: str, params: dict | None = None) -> dict:
    response = proxy_call(org_id, action, params)
    status = response.get("status") if isinstance(response, dict) else None
    if status != "executed":
        public_status = (
            status
            if status in {"error", "forbidden", "pending_confirmation"}
            else "unexpected_response"
        )
        raise PlatformProxyExecutionError(
            f"Platform read-only action failed: action={action}, status={public_status}"
        )
    return response


def _is_verified_read_only_action(action: dict) -> bool:
    name = str(action.get("name") or "").strip()
    level = action.get("permissionLevel")
    read_only_level = level == 1 or str(level).upper() == "READ_ONLY"
    return name in AUTONOMOUS_READ_ONLY_ACTIONS and read_only_level


def _headers():
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def proxy_call(
    org_id: str,
    action: str,
    params: dict = None,
    dry_run: bool = False,
    actor_id: str = "",
    workspace_id: str = "",
) -> dict:
    """Call the platform agent-proxy endpoint.

    Returns: {status, permission?, result?, error?}

    Possible statuses:
    - 'executed': action performed successfully
    - 'pending_confirmation': requires human approval
    - 'forbidden': permission denied
    - 'error': something went wrong
    """
    if not AGENT_API_KEY:
        return {"status": "error", "error": "AGENT_API_KEY not configured"}

    try:
        import requests
        payload = {
            "orgId": org_id,
            "action": action,
            "params": params or {},
            "dryRun": dry_run,
        }
        if actor_id:
            payload["actorId"] = actor_id
        if workspace_id:
            payload["workspaceId"] = workspace_id

        resp = requests.post(
            f"{PLATFORM_API_BASE}/agent-proxy",
            headers=_headers(),
            json=payload,
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 403:
            return {"status": "forbidden", "error": resp.json().get("message", "Forbidden")}
        else:
            return {"status": "error", "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as exc:
        logger.warning("Proxy call failed: %s", exc)
        return {"status": "error", "error": str(exc)}


def list_capabilities() -> list[dict]:
    """List all actions the agent is allowed to perform on the platform."""
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/admin/agent/actions",
            headers=_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else data.get("actions", [])
    except Exception as exc:
        logger.warning("Failed to list capabilities: %s", exc)
    return []


def register_proxy_tools():
    """Register all platform proxy actions as tools in the tools registry."""
    from agents.tools_registry import register

    actions = list_capabilities()
    for action in actions:
        name = action.get("name", "")
        description = action.get("description", "")
        if name and description and _is_verified_read_only_action(action):
            register(
                f"platform.{name}",
                f"[平台] {description}",
                {"orgId": "string", "params": "object?"},
                lambda org_id, params=None, action_name=name: _execute_read_only_action(
                    org_id, action_name, params
                ),
                planner_enabled=True,
                side_effect=False,
                retry_safe=True,
                max_attempts=2,
                trusted_context_keys=("orgId",),
            )
        elif name:
            logger.info(
                "Skipping non-autonomous platform capability: %s (level=%s)",
                name,
                action.get("permissionLevel"),
            )
