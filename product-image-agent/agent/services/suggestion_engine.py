"""english_text — english_textplatformenglish_text，english_textplatformnotification。

flow：
1. text EventInbox english_text
2. english_text（text opportunity.py english_text）
3. english_text → generationenglish_text
4. textplatform API textnotification/english_text
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
        title = data.get("title", "text")
        return {
            "type": "suggestion",
            "title": f"text「{title}」generationlistingtext",
            "description": f"detectionenglish_text：{title}。english_textgeneration Listing text、keywordsenglish_text，"
                          f"text 3 textcompletedtextlistingtext。",
            "priority": "high",
            "estimated_effort": "3 text",
            "estimated_benefit": "textlistingenglish_text",
            "action": {
                "type": "one_click",
                "label": "textgenerationtextlistingtext",
                "route": f"/listing-generator?product={data.get('resourceId', '')}",
            },
            "score": 85,
        }
    
    elif event_type == "alert.inventory_low":
        title = data.get("title", "textproduct")
        return {
            "type": "suggestion",
            "title": f"「{title}」english_text",
            "description": f"detectionenglish_text：{title}。english_textsecuritytext，english_text，"
                          f"english_text。",
            "priority": "high",
            "estimated_effort": "5 text",
            "estimated_benefit": "english_text",
            "action": {
                "type": "navigate",
                "label": "english_text",
                "route": "/store-monitor",
            },
            "score": 90,
        }
    
    elif event_type == "alert.bad_review":
        title = data.get("title", "text")
        return {
            "type": "suggestion",
            "title": f"english_text：{title}",
            "description": f"detectionenglish_text，english_textreplycustomer，"
                          f"english_textstoreenglish_text。",
            "priority": "medium",
            "estimated_effort": "10 text",
            "estimated_benefit": "textstoretext",
            "action": {
                "type": "navigate",
                "label": "english_text",
                "route": "/store-monitor",
            },
            "score": 70,
        }
    
    elif event_type == "alert.price_change":
        title = data.get("title", "product")
        return {
            "type": "suggestion",
            "title": f"「{title}」english_text",
            "description": f"detectionenglish_text，english_textcompetitor pricetext，"
                          f"textyesnoenglish_text。",
            "priority": "low",
            "estimated_effort": "3 text",
            "estimated_benefit": "english_text",
            "action": {
                "type": "navigate",
                "label": "english_text",
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
