"""工作记忆 — 任务完结后写入结构化记录，同步到平台数据库。

每完成一个任务（不论成功/失败），记录：
- 做了什么（task_type, product_name）
- 为谁做的（org_id）（正在做）
- 结果（status, score）
- 人审结论（review_status, review_notes）
- 耗时（duration_seconds）

记录存储：本地一份（working_memory.json）+ 同步到平台 API。
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

from common.runtime_paths import get_runtime_paths

logger = logging.getLogger("working_memory")

MEMORY_PATH = os.path.join(get_runtime_paths().memory, "working_memory.json")
PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")

DEFAULT_ORG_ID = os.getenv("PLATFORM_ORG_ID", "unknown")

_MAX_RECORDS = 500


def _load() -> list:
    try:
        with open(MEMORY_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return []


def _save(records: list) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(MEMORY_PATH)), exist_ok=True)
    tmp = MEMORY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(records[-_MAX_RECORDS:], f, ensure_ascii=False, indent=2)
    os.replace(tmp, MEMORY_PATH)


def record_task(
    task_type: str,
    product_name: str = "",
    status: str = "completed",
    score: float | None = None,
    review_status: str = "",
    review_notes: str = "",
    duration_seconds: float = 0,
    org_id: str = "",
    metadata: dict = None,
) -> dict:
    """记录一次任务完结。"""
    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "id": f"{int(time.time())}_{task_type}_{hash(product_name) % 10000}",
        "task_type": task_type,
        "product_name": product_name or "",
        "status": status,
        "score": score,
        "review_status": review_status,
        "review_notes": review_notes,
        "duration_seconds": duration_seconds,
        "org_id": org_id or DEFAULT_ORG_ID,
        "ts": now,
        "metadata": metadata or {},
    }

    # Save locally
    records = _load()
    records.append(entry)
    _save(records)

    # Sync to platform (best-effort)
    _sync_to_platform(entry)

    return entry


def _sync_to_platform(entry: dict) -> bool:
    """Sync a task record to the platform audit log or a working_memory endpoint."""
    if not AGENT_API_KEY:
        return False
    try:
        import requests
        metadata = entry.get("metadata") or {}
        resp = requests.post(
            f"{PLATFORM_API_BASE}/agent-memory/records",
            headers={"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"},
            json={
                "organizationId": entry["org_id"],
                "workspaceId": metadata.get("workspaceId"),
                "agentRunId": metadata.get("agentRunId"),
                "productId": metadata.get("productId"),
                "productName": entry["product_name"],
                "taskType": entry["task_type"],
                "status": entry["status"].upper(),
                "score": entry["score"],
                "reviewStatus": entry["review_status"] or None,
                "reviewNotes": entry["review_notes"] or None,
                "durationSeconds": entry["duration_seconds"],
                "result": metadata.get("result"),
                "metadata": metadata,
            },
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception as exc:
        logger.warning("Failed to sync working memory: %s", exc)
    return False


def _query_platform(
    task_type: str = "",
    product_name: str = "",
    org_id: str = "",
    limit: int = 20,
) -> list | None:
    if not AGENT_API_KEY or not org_id:
        return None
    try:
        import requests
        params = {"organizationId": org_id, "limit": limit}
        if task_type:
            params["taskType"] = task_type
        if product_name:
            params["productName"] = product_name
        resp = requests.get(
            f"{PLATFORM_API_BASE}/agent-memory/records",
            headers={"X-Api-Key": AGENT_API_KEY},
            params=params,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("items", []) if isinstance(data, dict) else data
    except Exception as exc:
        logger.warning("Failed to query platform working memory: %s", exc)
    return None


def query(
    task_type: str = "",
    product_name: str = "",
    limit: int = 20,
    org_id: str = "",
) -> list:
    """查询工作记忆。按 task_type 或 product_name 过滤。"""
    platform_records = _query_platform(task_type, product_name, org_id, limit)
    if platform_records is not None:
        return platform_records

    records = _load()
    result = records[:]
    if task_type:
        result = [r for r in result if r["task_type"] == task_type]
    if product_name:
        result = [r for r in result if product_name.lower() in r["product_name"].lower()]
    return result[-limit:]


def get_stats() -> dict:
    """返回工作记忆统计。"""
    records = _load()
    total = len(records)
    completed = sum(1 for r in records if r["status"] == "completed")
    failed = sum(1 for r in records if r["status"] == "failed")
    avg_score = (
        sum(r["score"] for r in records if r["score"] is not None) /
        max(sum(1 for r in records if r["score"] is not None), 1)
    ) if any(r["score"] is not None for r in records) else None

    return {
        "total": total,
        "completed": completed,
        "failed": failed,
        "avg_score": round(avg_score, 1) if avg_score else None,
        "recent": records[-5:] if records else [],
    }
