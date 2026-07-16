"""新品池 — 20 个新品位的候选池与 FBA 上新计划。

条目：名称/类目/目标售价/成本/状态/FBA 计划（首批量、目标上架日、备注）。
持久化在 profiles/new_product_pool.json；容量 20，超出需先清位。
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid

_LOCK = threading.Lock()

POOL_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                         "profiles", "new_product_pool.json")
CAPACITY = 20

STATUSES = ("候选", "开发中", "打样中", "待上架", "已上架")


def _load() -> list:
    try:
        with open(POOL_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return []


def _save(items: list) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(POOL_PATH)), exist_ok=True)
    tmp = POOL_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, POOL_PATH)


def list_pool() -> list:
    return _load()


# 机会卡扩展字段（选品雷达评估结果，随条目入池）
EXTRA_FIELDS = ("opportunityScore", "competitionLevel", "riskLevel",
                "giftScenes", "customElements")


def add_item(name: str, category: str = "", target_price: float = 0,
             cost: float = 0, notes: str = "", extra: dict | None = None) -> dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("新品名称不能为空")
    with _LOCK:
        items = _load()
        if len(items) >= CAPACITY:
            raise ValueError(f"新品池已满（{CAPACITY} 位），先移除或上架一些")
        item = {
            "id": uuid.uuid4().hex[:8],
            "name": name[:60],
            "category": (category or "")[:30],
            "targetPrice": float(target_price or 0),
            "cost": float(cost or 0),
            "status": "候选",
            "fba": {"launchDate": "", "firstBatchUnits": 0, "notes": (notes or "")[:200]},
            "createdAt": time.time(),
        }
        if isinstance(extra, dict):
            item.update({k: extra[k] for k in EXTRA_FIELDS if k in extra})
        items.append(item)
        _save(items)
    return item


def update_item(item_id: str, patch: dict) -> dict:
    with _LOCK:
        items = _load()
        for item in items:
            if item.get("id") == item_id:
                if "status" in patch and patch["status"] in STATUSES:
                    item["status"] = patch["status"]
                for key in ("name", "category"):
                    if patch.get(key):
                        item[key] = str(patch[key])[:60]
                for key in ("targetPrice", "cost"):
                    if key in patch:
                        try:
                            item[key] = float(patch[key])
                        except (TypeError, ValueError):
                            pass
                fba = patch.get("fba")
                if isinstance(fba, dict):
                    item.setdefault("fba", {})
                    if "launchDate" in fba:
                        item["fba"]["launchDate"] = str(fba["launchDate"])[:20]
                    if "firstBatchUnits" in fba:
                        try:
                            item["fba"]["firstBatchUnits"] = int(fba["firstBatchUnits"])
                        except (TypeError, ValueError):
                            pass
                    if "notes" in fba:
                        item["fba"]["notes"] = str(fba["notes"])[:200]
                _save(items)
                return item
        raise ValueError("没有找到这个新品")


def remove_item(item_id: str) -> dict:
    with _LOCK:
        items = [i for i in _load() if i.get("id") != item_id]
        _save(items)
    return {"count": len(items)}


def export_csv(dst_path: str) -> str:
    """导出新品池 CSV（供 FBA 计划表使用）。"""
    import csv

    items = _load()
    os.makedirs(os.path.dirname(os.path.abspath(dst_path)), exist_ok=True)
    with open(dst_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["名称", "类目", "目标售价", "成本", "状态",
                         "FBA目标上架日", "首批量", "备注",
                         "机会评分", "竞争难度", "风险等级"])
        for it in items:
            fba = it.get("fba") or {}
            writer.writerow([
                it.get("name", ""), it.get("category", ""),
                it.get("targetPrice", 0), it.get("cost", 0),
                it.get("status", ""), fba.get("launchDate", ""),
                fba.get("firstBatchUnits", 0), fba.get("notes", ""),
                it.get("opportunityScore", ""), it.get("competitionLevel", ""),
                it.get("riskLevel", ""),
            ])
    return dst_path


def summary() -> dict:
    items = _load()
    by_status: dict = {}
    for it in items:
        by_status[it.get("status", "候选")] = by_status.get(
            it.get("status", "候选"), 0) + 1
    return {"total": len(items), "capacity": CAPACITY, "byStatus": by_status}
