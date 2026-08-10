"""reviewenglish_text — english_textautomaticenglish_text。

flow：
1. english_text REJECTED/REWORK reviewtext
2. english_text（notes）
3. english_text（product_memory / style_memory / risk_memory text）
4. write memory_store text"english_text"text
5. english_texttask recall() english_text
"""

import logging
import os
import time
from datetime import datetime, timezone

logger = logging.getLogger("review_learning")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

# How often to check for new reviews (seconds)
POLL_INTERVAL = 3600  # 1 hour

# Track last poll time per org
_last_poll: dict[str, float] = {}


def _headers():
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def fetch_rejected_reviews(org_id: str, since: str = "") -> list[dict]:
    """Fetch rejected/rework review tasks from the platform."""
    if not AGENT_API_KEY:
        return []
    items = []
    try:
        import requests

        for status in ("REJECTED", "REWORK"):
            params = {"status": status, "limit": 50}
            if since:
                params["since"] = since
            resp = requests.get(
                f"{PLATFORM_API_BASE}/review",
                headers=_headers(),
                params=params,
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                batch = data if isinstance(data, list) else data.get("items", [])
                items.extend(batch)
    except Exception as exc:
        logger.warning("Failed to fetch reviews: %s", exc)
    return items


def categorize_rejection(notes: str, entity_type: str = "") -> str:
    """english_text。

    Returns: category name for memory_store.classify()
    """
    notes_lower = notes.lower()

    # Style/visual issues → style_memory
    style_keywords = [
        "text", "text", "background", "text", "text", "scene", "text",
        "text", "text", "text", "visualtext",
    ]
    if any(kw in notes_lower for kw in style_keywords):
        return "style"

    # Product/content issues → product_memory
    product_keywords = [
        "title", "text", "text", "text", "text", "text", "text",
        "text", "text", "text",
    ]
    if any(kw in notes_lower for kw in product_keywords):
        return "product"

    # Risk/legal issues → risk_memory
    risk_keywords = [
        "text", "text", "text", "text", "text", "text", "text",
        "text", "text", "text",
    ]
    if any(kw in notes_lower for kw in risk_keywords):
        return "risk"

    # Default based on entity type
    type_map = {
        "IMAGE_GENERATION": "style",
        "LISTING_DRAFT": "product",
        "PRODUCT_RESEARCH": "product",
    }
    return type_map.get(entity_type, "product")


def process_rejection(org_id: str, review: dict) -> bool:
    """Process a single rejected/rework review into memory.

    Returns True if a memory card was written.
    """
    notes = (review.get("notes") or "").strip()
    entity_type = review.get("entityType", "")
    score = review.get("score")

    if not notes:
        return False

    # Categorize
    category = categorize_rejection(notes, entity_type)
    platform_written = _write_experience_to_platform(
        org_id=org_id,
        review=review,
        category=category,
        notes=notes,
    )

    # Build "rejection" experience card text
    card_text = (
        f"reviewtext — {entity_type}\n"
        f"text: {notes[:200]}\n"
        f"text: {score or 'N/A'}\n"
    )

    # Write to memory_store as a "to avoid" entry
    try:
        from common.memory_store import remember, classify

        # Write as business knowledge
        written = remember(card_text, category=category)
        if written:
            logger.info(
                "Rejection learned: %s -> %s (%s)", notes[:50], category, entity_type
            )
        return platform_written or written
    except Exception as exc:
        logger.warning("Failed to write rejection to memory: %s", exc)
    return platform_written


def _write_experience_to_platform(
    org_id: str,
    review: dict,
    category: str,
    notes: str,
) -> bool:
    if not AGENT_API_KEY:
        return False
    try:
        import requests
        entity_type = review.get("entityType", "")
        task_type = review.get("taskType") or _task_type_from_entity(entity_type)
        resp = requests.post(
            f"{PLATFORM_API_BASE}/agent-memory/experiences",
            headers=_headers(),
            json={
                "organizationId": org_id,
                "workspaceId": review.get("workspaceId"),
                "sourceReviewTaskId": review.get("id"),
                "taskType": task_type,
                "entityType": entity_type,
                "score": review.get("score"),
                "notes": notes,
            },
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception as exc:
        logger.warning("Failed to write platform experience card: %s", exc)
    return False


def _task_type_from_entity(entity_type: str) -> str:
    if entity_type == "IMAGE_GENERATION":
        return "IMAGE_CREATIVE"
    if entity_type == "LISTING_DRAFT":
        return "LISTING_OPTIMIZER"
    if entity_type == "PRODUCT_RESEARCH":
        return "PRODUCT_RESEARCHER"
    return "GENERAL_ASSISTANT"


def poll_and_learn(org_id: str, force: bool = False) -> int:
    """Poll for new rejected reviews and learn from them.
    Returns count of new memories created."""
    now = time.time()
    last = _last_poll.get(org_id, 0)

    if not force and now - last < POLL_INTERVAL:
        return 0

    _last_poll[org_id] = now

    # Build 'since' parameter
    since = ""
    if last > 0:
        since = datetime.fromtimestamp(last, tz=timezone.utc).isoformat()

    reviews = fetch_rejected_reviews(org_id, since=since)
    count = 0
    for review in reviews:
        if process_rejection(org_id, review):
            count += 1

    if count > 0:
        logger.info("Learned from %d rejected reviews for org %s", count, org_id)
    return count


def generate_weekly_report(org_id: str) -> dict:
    """generation"english_text"report。"""
    stats = {}
    try:
        from common.memory_store import stats as memory_stats

        stats = memory_stats()
    except ImportError:
        pass

    # Get review stats from platform
    review_count = 0
    approval_rate = 0
    try:
        import requests

        resp = requests.get(
            f"{PLATFORM_API_BASE}/review/stats",
            headers=_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            rs = resp.json()
            review_count = (
                rs.get("approved", 0)
                + rs.get("rejected", 0)
                + rs.get("rework", 0)
            )
            total_decided = rs.get("approved", 0) + rs.get("rejected", 0)
            approval_rate = round(
                rs.get("approved", 0) / max(total_decided, 1) * 100, 1
            )
    except Exception:
        pass

    return {
        "org_id": org_id,
        "week": datetime.now(timezone.utc).strftime("%Y-W%V"),
        "memory_stats": stats,
        "review_count": review_count,
        "approval_rate": f"{approval_rate}%",
        "learned_this_week": review_count,
    }
