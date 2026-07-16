"""平台事件订阅器 — 从 BullMQ 接收平台业务事件。

运行方式：作为独立线程在 agent 启动时运行，或者由定时任务轮询。

事件类型：
- product.created: 新品创建 → 触发选品评估
- alert.inventory_low: 库存不足 → 触发补货建议
- alert.bad_review: 差评告警 → 触发跟进方案
- alert.price_change: 价格变动 → 触发调价建议
"""

import json
import logging
import os
import time
from collections import deque

logger = logging.getLogger("event_subscriber")

# In-memory event inbox (per-org)
_inbox: dict[str, deque] = {}
MAX_INBOX_PER_ORG = 100

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")


def _headers():
    if not AGENT_API_KEY:
        return {}
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def poll_events(org_id: str = "") -> list[dict]:
    """Poll platform for pending events (fallback when no push mechanism).
    
    In production, BullMQ would push events directly to the agent.
    This is the polling fallback path.
    """
    if not AGENT_API_KEY or not org_id:
        return []
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/events/pending",
            headers=_headers(),
            params={"orgId": org_id, "limit": 20},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            events = data if isinstance(data, list) else data.get("events", [])
            return events
    except Exception as exc:
        logger.warning("Failed to poll events: %s", exc)
    return []


class EventInbox:
    """组织级事件收件箱。"""
    
    def __init__(self, max_size: int = MAX_INBOX_PER_ORG):
        self._inbox: dict[str, deque] = {}
        self._max_size = max_size
    
    def add(self, org_id: str, event: dict) -> None:
        if org_id not in self._inbox:
            self._inbox[org_id] = deque(maxlen=self._max_size)
        self._inbox[org_id].append(event)
        logger.info("Event added to inbox [%s]: %s", org_id, event.get("type", "?"))
    
    def list(self, org_id: str) -> list[dict]:
        return list(self._inbox.get(org_id, []))
    
    def clear(self, org_id: str) -> None:
        if org_id in self._inbox:
            self._inbox[org_id].clear()
    
    def count(self, org_id: str) -> int:
        return len(self._inbox.get(org_id, []))


# Singleton
inbox = EventInbox()


def process_event(event: dict) -> str | None:
    """Process a single platform event and return a suggestion if applicable.
    
    Returns: suggestion_text or None if no action needed.
    """
    event_type = event.get("type", "")
    data = event.get("data", {})
    
    if event_type == "product.created":
        title = data.get("title", "Unknown")
        return f"新品创建: {title}。建议: 分析产品机会、生成关键词和 Listing 草稿。"
    
    elif event_type == "alert.inventory_low":
        title = data.get("title", "Unknown")
        return f"库存预警: {title}。建议: 检查库存并制定补货计划。"
    
    elif event_type == "alert.bad_review":
        title = data.get("title", "Unknown")
        return f"差评告警: {title}。建议: 分析差评原因并生成回复方案。"
    
    elif event_type == "alert.price_change":
        title = data.get("title", "Unknown")
        return f"价格变动: {title}。建议: 评估是否需要调价。"
    
    return None
