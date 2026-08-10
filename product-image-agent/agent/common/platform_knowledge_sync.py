"""平台知识同步 — 从 ShopMate 后端拉取真实业务数据，灌入本地 knowledge_base。

数据来源（通过平台 API）：
1. 历史 Listing 草稿（approved/published 的高分案例）
2. 产品研究报告（research reports summary + opportunities）
3. 关键词报表（high-volume keywords）
4. 审核通过/驳回记录（review results with notes）

设计原则：
- 只同步本组织的数据（orgId 隔离）
- 同步结果写入 knowledge/ 目录，复用现有 search() 机制
- 同步是 best-effort：失败只记日志，不阻断主流程
- 全量同步 + 增量同步两种模式
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

from common.runtime_paths import get_runtime_paths

logger = logging.getLogger("platform_knowledge_sync")

_RUNTIME_PATHS = get_runtime_paths()
ORG_KNOWLEDGE_DIR = os.path.join(_RUNTIME_PATHS.memory, "knowledge", "orgs")

# Platform API base URL (configured via env)
PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

_HEADERS = {
    "X-Api-Key": AGENT_API_KEY,
    "Content-Type": "application/json",
} if AGENT_API_KEY else {}

_SYNC_STATE_PATH = os.path.join(_RUNTIME_PATHS.memory, "platform_sync_state.json")


def _load_sync_state() -> dict:
    """Load last-sync timestamps per data type."""
    if not os.path.isfile(_SYNC_STATE_PATH):
        return {}
    try:
        with open(_SYNC_STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _save_sync_state(state: dict) -> None:
    """Persist sync state so incremental sync knows where to resume."""
    os.makedirs(os.path.dirname(_SYNC_STATE_PATH), exist_ok=True)
    tmp = _SYNC_STATE_PATH + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, _SYNC_STATE_PATH)
    except OSError as exc:
        logger.warning("Failed to save sync state: %s", exc)


def _fetch(endpoint: str) -> list | dict | None:
    """Fetch paginated data from the platform API."""
    if not AGENT_API_KEY:
        logger.warning("AGENT_API_KEY not configured, skipping platform sync")
        return None
    try:
        import requests as _requests
        resp = _requests.get(
            f"{PLATFORM_API_BASE}{endpoint}",
            headers=_HEADERS,
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning("Platform API %s returned %s", endpoint, resp.status_code)
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", endpoint, exc)
    return None


def _safe_org_id(org_id: str) -> str:
    import re
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", (org_id or "").strip())[:80]


def _items(data: list | dict | None) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        value = data.get("items") or data.get("data") or []
        return value if isinstance(value, list) else []
    return []


def _write_knowledge_file(filename: str, title: str, content: str, org_id: str) -> None:
    """Write a knowledge chunk as a markdown file."""
    safe_org = _safe_org_id(org_id)
    if not safe_org:
        raise ValueError("org_id is required for platform knowledge")
    org_dir = os.path.join(ORG_KNOWLEDGE_DIR, safe_org)
    os.makedirs(org_dir, exist_ok=True)
    path = os.path.join(org_dir, filename)
    text = f"## {title}\n\n{content}\n\n<!-- synced at {datetime.now(timezone.utc).isoformat()} -->\n"
    # Atomic write
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def sync_listings(org_id: str) -> int:
    """Sync approved/published listing drafts from the platform."""
    data = _fetch(f"/agent-data/listings?limit=50&status=published&orgId={org_id}")
    if not data:
        return 0
    items = _items(data)
    count = 0
    for item in items:
        if not item.get("title"):
            continue
        content_parts = [f"- 标题: {item['title']}"]
        if item.get("bullets"):
            for b in (item["bullets"] or []):
                content_parts.append(f"  - {b}")
        if item.get("description"):
            content_parts.append(f"  描述: {item['description'][:200]}")
        if item.get("seoTags"):
            content_parts.append(f"  SEO标签: {', '.join(item['seoTags'][:10])}")
        _write_knowledge_file(
            f"platform_listing_{item['id'][:8]}.md",
            f"平台案例: {item['title'][:60]}",
            "\n".join(content_parts),
            org_id,
        )
        count += 1
    logger.info("Synced %d listings for org %s", count, org_id)
    return count


def sync_research_reports(org_id: str) -> int:
    """Sync product research reports."""
    data = _fetch(f"/agent-data/product-research?limit=20&orgId={org_id}")
    if not data:
        return 0
    items = _items(data)
    count = 0
    for item in items:
        if not item.get("summary"):
            continue
        content = [
            f"- 查询: {item.get('query', '')}",
            f"- 平台: {item.get('platform', '')}",
            f"- 摘要: {item['summary'][:500]}",
        ]
        if item.get("opportunities"):
            content.append(f"- 机会: {str(item['opportunities'])[:300]}")
        _write_knowledge_file(
            f"platform_research_{item['id'][:8]}.md",
            f"调研报告: {item.get('query', '')[:50]}",
            "\n".join(content),
            org_id,
        )
        count += 1
    return count


def sync_keywords(org_id: str) -> int:
    """Sync keyword reports."""
    data = _fetch(f"/agent-data/keywords?limit=20&orgId={org_id}")
    if not data:
        return 0
    items = _items(data)
    count = 0
    for item in items:
        kw_list = item.get("keywords", [])
        if not kw_list:
            continue
        top_kws = kw_list[:20] if isinstance(kw_list, list) else []
        lines = [f"- 查询: {item.get('query', '')}"]
        for kw in top_kws:
            kw_name = kw.get("keyword", "") if isinstance(kw, dict) else str(kw)
            lines.append(f"  - {kw_name}")
        _write_knowledge_file(
            f"platform_keywords_{item['id'][:8]}.md",
            f"关键词: {item.get('query', '')[:50]}",
            "\n".join(lines),
            org_id,
        )
        count += 1
    return count


def sync_review_decisions(org_id: str) -> int:
    """Sync review decisions (approved/rejected with notes)."""
    data = _fetch(f"/agent-data/review?limit=50&status=APPROVED&orgId={org_id}")
    if not data:
        return 0
    items = _items(data)

    # Also fetch rejected
    rejected = _fetch(f"/agent-data/review?limit=20&status=REJECTED&orgId={org_id}")
    rej_items = _items(rejected)

    count = 0
    approved_notes = []
    rejected_notes = []

    for item in items:
        if item.get("notes"):
            approved_notes.append(f"- {item.get('notes', '')[:200]}")
        count += 1

    for item in rej_items:
        if item.get("notes"):
            rejected_notes.append(f"- {item.get('notes', '')[:200]}")

    if approved_notes:
        _write_knowledge_file(
            "platform_review_approved.md",
            "审核通过案例",
            "\n".join(approved_notes),
            org_id,
        )
    if rejected_notes:
        _write_knowledge_file(
            "platform_review_rejected.md",
            "审核驳回原因（需要避免的）",
            "\n".join(rejected_notes),
            org_id,
        )
    return count


def run_full_sync(org_id: str = "") -> dict:
    """Run a full sync of all data types. Returns counts per type."""
    if not org_id:
        org_id = os.getenv("PLATFORM_ORG_ID", "")
    if not org_id:
        logger.warning("No org_id provided, skipping sync")
        return {"error": "no org_id"}

    results = {}
    for sync_fn, name in [
        (sync_listings, "listings"),
        (sync_research_reports, "research"),
        (sync_keywords, "keywords"),
        (sync_review_decisions, "reviews"),
    ]:
        try:
            count = sync_fn(org_id)
            results[name] = count
        except Exception as exc:
            logger.error("Sync %s failed: %s", name, exc)
            results[name] = f"error: {exc}"

    # Persist sync state
    _save_sync_state({
        "lastFullSync": datetime.now(timezone.utc).isoformat(),
        "orgId": org_id,
        "results": results,
    })

    return results


def run_incremental_sync(org_id: str = "") -> dict:
    """Run an incremental sync — only sync data updated since last sync.

    Falls back to full sync if no prior sync state exists.
    """
    state = _load_sync_state()
    if not state.get("lastFullSync"):
        logger.info("No prior sync state found, running full sync")
        return run_full_sync(org_id)

    if not org_id:
        org_id = os.getenv("PLATFORM_ORG_ID", "")
    if not org_id:
        logger.warning("No org_id provided, skipping sync")
        return {"error": "no org_id"}

    since = state["lastFullSync"]
    results = {}

    for sync_fn, name, endpoint_flag in [
        (sync_listings, "listings", True),
        (sync_research_reports, "research", True),
        (sync_keywords, "keywords", True),
        (sync_review_decisions, "reviews", True),
    ]:
        try:
            count = sync_fn(org_id)
            results[name] = count
        except Exception as exc:
            logger.error("Incremental sync %s failed: %s", name, exc)
            results[name] = f"error: {exc}"

    # Update sync state
    state["lastIncrementalSync"] = datetime.now(timezone.utc).isoformat()
    state["orgId"] = org_id
    state["results"] = results
    _save_sync_state(state)

    return results
