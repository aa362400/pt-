"""自动排程器 — 将已采纳的建议转化为平台任务和自动化流程。

功能：
1. 接收已采纳的建议 → 创建 TeamTask
2. 按优先级和预计耗时排序
3. 避开配额高峰时段（可配置）
4. 登记到智能体自己的"工作日程表"
"""

import json
import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger("scheduler")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

# Peak hours — avoid scheduling during these times
PEAK_HOURS_START = 9   # 9 AM
PEAK_HOURS_END = 11    # 11 AM

# Default priority mapping
PRIORITY_MAP = {
    "high": "HIGH",
    "medium": "MEDIUM",
    "low": "LOW",
}


def _headers():
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def _next_available_slot() -> str:
    """Find the next non-peak time slot. Returns ISO datetime string."""
    now = datetime.now()
    # If we're in peak hours, schedule after peak ends
    if PEAK_HOURS_START <= now.hour < PEAK_HOURS_END:
        slot = now.replace(hour=PEAK_HOURS_END, minute=0, second=0) + timedelta(minutes=5)
    else:
        slot = now + timedelta(minutes=5)
    return slot.isoformat()


def create_task(org_id: str, suggestion: dict) -> bool:
    """Create a TeamTask from a suggestion."""
    try:
        import requests
        
        title = suggestion.get("title", "智能体建议任务")
        description = suggestion.get("description", "")
        priority = PRIORITY_MAP.get(suggestion.get("priority", "medium"), "MEDIUM")
        scheduled_at = _next_available_slot()
        
        resp = requests.post(
            f"{PLATFORM_API_BASE}/agent-proxy",
            headers=_headers(),
            json={
                "orgId": org_id,
                "action": "task.schedule",
                "params": {
                    "dueAt": scheduled_at,
                    "suggestion": {
                        **suggestion,
                        "title": title,
                        "description": description,
                        "priority": suggestion.get("priority", "medium"),
                    },
                },
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logger.info("Task created for org %s: %s (priority=%s)", org_id, title, priority)
            return True
        logger.warning("Failed to create task: %s %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.warning("Failed to create task: %s", exc)
    return False


def create_automation_flow(org_id: str, suggestion: dict) -> bool:
    """For suggestions with multi-step actions, create an AutomationFlow."""
    try:
        import requests
        
        resp = requests.post(
            f"{PLATFORM_API_BASE}/agent-proxy",
            headers=_headers(),
            json={
                "orgId": org_id,
                "action": "task.schedule",
                "params": {"suggestion": suggestion},
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logger.info("Automation flow created for %s", title)
            return True
        logger.warning("Failed to create automation flow: %s %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.warning("Failed to create automation flow: %s", exc)
    return False


def schedule(org_id: str, suggestion: dict, auto_accept: bool = False) -> dict:
    """Schedule a suggestion. If auto_accept, create task immediately.
    
    Returns: {scheduled, taskId?, flowId?, at}
    """
    if auto_accept:
        task_ok = create_task(org_id, suggestion)
        return {
            "scheduled": task_ok,
            "taskCreated": task_ok,
            "flowCreated": task_ok,
            "at": _next_available_slot(),
        }
    else:
        # Just register as pending
        return {
            "scheduled": False,
            "pending": True,
            "at": _next_available_slot(),
        }


def get_schedule(org_id: str) -> list[dict]:
    """Get the agent's work schedule (tasks created by the scheduler)."""
    from services.event_subscriber import inbox
    return [
        {"orgId": org_id, "pendingEvents": inbox.count(org_id),
         "nextSlot": _next_available_slot()}
    ]
