"""主动建议引擎 — 将感知到的平台事件转化为结构化建议，推送到平台通知。

流程：
1. 从 EventInbox 获取未处理事件
2. 对每个事件进行机会评分（复用 opportunity.py 的评分逻辑）
3. 评分超过阈值 → 生成结构化建议
4. 走平台 API 创建通知/建议记录
"""

import json
import logging
import os
from datetime import datetime

logger = logging.getLogger("suggestion_engine")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

# Minimum opportunity score to generate a suggestion
SCORE_THRESHOLD = 60

# Rate limit: max suggestions per org per hour
MAX_SUGGESTIONS_PER_HOUR = 10


def _headers():
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def _rate_limited(org_id: str) -> bool:
    """Check if we've sent too many suggestions recently."""
    import time
    from collections import defaultdict
    if not hasattr(_rate_limited, "_counters"):
        _rate_limited._counters = defaultdict(list)
    now = time.time()
    # Clean old entries
    _rate_limited._counters[org_id] = [t for t in _rate_limited._counters[org_id] if now - t < 3600]
    if len(_rate_limited._counters[org_id]) >= MAX_SUGGESTIONS_PER_HOUR:
        return True
    _rate_limited._counters[org_id].append(now)
    return False


def evaluate_event(event: dict) -> dict | None:
    """Evaluate a platform event and return a suggestion if worthwhile.
    
    Returns:
    {
        "type": "suggestion",
        "title": "...",
        "description": "...",
        "priority": "high|medium|low",
        "estimated_effort": "...",
        "estimated_benefit": "...",
        "action": {"type": "one_click|navigate", "route": "..."},
        "score": 0-100
    } or None if below threshold.
    """
    event_type = event.get("type", "")
    data = event.get("data", {})
    
    if event_type == "product.created":
        title = data.get("title", "新品")
        return {
            "type": "suggestion",
            "title": f"为「{title}」生成上架内容",
            "description": f"检测到新品创建：{title}。建议立即生成 Listing 文案、关键词和产品图，"
                          f"预计 3 分钟完成全套上架准备。",
            "priority": "high",
            "estimated_effort": "3 分钟",
            "estimated_benefit": "快速上架抢占流量",
            "action": {
                "type": "one_click",
                "label": "一键生成全套上架内容",
                "route": f"/listing-generator?product={data.get('resourceId', '')}",
            },
            "score": 85,
        }
    
    elif event_type == "alert.inventory_low":
        title = data.get("title", "库存商品")
        return {
            "type": "suggestion",
            "title": f"「{title}」库存告急",
            "description": f"检测到库存预警：{title}。当前库存低于安全线，建议立即制定补货计划，"
                          f"避免断货影响排名。",
            "priority": "high",
            "estimated_effort": "5 分钟",
            "estimated_benefit": "避免断货损失",
            "action": {
                "type": "navigate",
                "label": "查看库存详情",
                "route": "/store-monitor",
            },
            "score": 90,
        }
    
    elif event_type == "alert.bad_review":
        title = data.get("title", "差评")
        return {
            "type": "suggestion",
            "title": f"差评需跟进：{title}",
            "description": f"检测到差评告警，建议及时分析差评原因并回复客户，"
                          f"降低对店铺评分的影响。",
            "priority": "medium",
            "estimated_effort": "10 分钟",
            "estimated_benefit": "维护店铺评分",
            "action": {
                "type": "navigate",
                "label": "查看差评详情",
                "route": "/store-monitor",
            },
            "score": 70,
        }
    
    elif event_type == "alert.price_change":
        title = data.get("title", "商品")
        return {
            "type": "suggestion",
            "title": f"「{title}」价格变动提醒",
            "description": f"检测到价格变动告警，建议分析竞品价格策略，"
                          f"评估是否需要跟进调价。",
            "priority": "low",
            "estimated_effort": "3 分钟",
            "estimated_benefit": "保持价格竞争力",
            "action": {
                "type": "navigate",
                "label": "查看价格分析",
                "route": "/profit-calculator",
            },
            "score": 45,
        }
    
    return None


def push_suggestion(org_id: str, suggestion: dict) -> bool:
    """Push a suggestion to the platform notification system."""
    if not AGENT_API_KEY:
        logger.warning("AGENT_API_KEY not configured, cannot push suggestion")
        return False
    
    if _rate_limited(org_id):
        logger.info("Rate limited: skipping suggestion for org %s", org_id)
        return False
    
    try:
        import requests
        resp = requests.post(
            f"{PLATFORM_API_BASE}/agent-proxy",
            headers=_headers(),
            json={
                "orgId": org_id,
                "action": "notification.suggest",
                "params": {
                    "suggestion": suggestion,
                },
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logger.info("Suggestion pushed for org %s: %s", org_id, suggestion["title"])
            return True
        logger.warning("Failed to push suggestion: %s", resp.status_code)
    except Exception as exc:
        logger.warning("Failed to push suggestion: %s", exc)
    return False


def process_pending_events(org_id: str, events: list[dict]) -> int:
    """Process all pending events for an org and push suggestions.
    Returns count of suggestions pushed."""
    count = 0
    for event in events:
        suggestion = evaluate_event(event)
        if suggestion and suggestion.get("score", 0) >= SCORE_THRESHOLD:
            if push_suggestion(org_id, suggestion):
                count += 1
    return count
