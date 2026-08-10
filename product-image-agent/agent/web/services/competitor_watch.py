"""竞品监控 — 盯竞品链接的主图与标题变化，按需生成对比周报。

监控清单持久化在 profiles/competitor_watchlist.json；
「生成周报」时逐个抓取竞品页主图+标题，与上次快照比对：
- 主图感知哈希变化 → 竞品换图了（提示卖家跟进视觉）
- 标题变化 → 竞品调了卖点/关键词
抓取失败单条降级，不阻断整份报告。
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time

_LOCK = threading.Lock()

WATCHLIST_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                              "profiles", "competitor_watchlist.json")
MAX_WATCHES = 10


def _load() -> list:
    try:
        with open(WATCHLIST_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return []


def _save(items: list) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(WATCHLIST_PATH)), exist_ok=True)
    tmp = WATCHLIST_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, WATCHLIST_PATH)


def list_watches() -> list:
    return _load()


def add_watch(url: str, name: str = "") -> dict:
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError("请提供 http/https 竞品链接")
    with _LOCK:
        items = _load()
        if any(w.get("url") == url for w in items):
            raise ValueError("这个链接已经在监控中")
        if len(items) >= MAX_WATCHES:
            raise ValueError(f"最多监控 {MAX_WATCHES} 个竞品，请先移除一些")
        items.append({
            "url": url,
            "name": (name or url)[:60],
            "added_at": time.time(),
            "last": {},
        })
        _save(items)
    return {"count": len(items)}


def remove_watch(url: str) -> dict:
    with _LOCK:
        items = [w for w in _load() if w.get("url") != url]
        _save(items)
    return {"count": len(items)}


def _avg_hash(image_path: str) -> str:
    """8x8 感知均值哈希：主图是否更换的低成本判据。"""
    from PIL import Image

    with Image.open(image_path) as im:
        img = im.convert("L").resize((8, 8), Image.LANCZOS)
    px = list(img.getdata())
    avg = sum(px) / len(px)
    return "".join("1" if p > avg else "0" for p in px)


def _hash_distance(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    return sum(1 for x, y in zip(a, b) if x != y)


def _fetch_title(url: str, timeout: int = 15) -> str:
    try:
        from common.browse_url import browse_url

        result = browse_url(url, render_js=False, timeout=timeout)
        if not result.get("error"):
            return str(result.get("title") or "")[:120]
    except Exception:  # noqa: BLE001 — 标题抓不到不影响主图比对
        pass
    return ""


def run_report(org_id: str = "") -> dict:
    """逐个竞品抓取比对，返回 {"items": [...], "changedCount": n}。

    抓取完成后尝试从平台通道补充趋势与告警上下文。
    """
    from common.fetch_url import fetch_product_image

    with _LOCK:
        items = _load()

    report = []
    changed_count = 0
    for watch in items:
        url = watch.get("url", "")
        entry = {"url": url, "name": watch.get("name", url),
                 "ok": False, "changes": [], "note": ""}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                fetched = fetch_product_image(url, tmp)
                new_hash = ""
                if fetched.get("success"):
                    new_hash = _avg_hash(fetched["local_path"])
                new_title = _fetch_title(url)

                last = watch.get("last") or {}
                if new_hash and last.get("image_hash"):
                    if _hash_distance(new_hash, last["image_hash"]) > 10:
                        entry["changes"].append("主图更换了——建议看看新视觉方向，必要时跟进")
                if new_title and last.get("title") and new_title != last["title"]:
                    entry["changes"].append(f"标题改了：{last['title'][:40]} → {new_title[:40]}")
                if not last:
                    entry["note"] = "首次抓取，已建立基线快照"

                entry["ok"] = bool(new_hash or new_title)
                if not entry["ok"]:
                    entry["note"] = fetched.get("error", "抓取失败")

                watch["last"] = {
                    "image_hash": new_hash or last.get("image_hash", ""),
                    "title": new_title or last.get("title", ""),
                    "checked_at": time.time(),
                }
        except Exception as e:  # noqa: BLE001 — 单条失败不阻断整份报告
            entry["note"] = str(e)[:80]
        if entry["changes"]:
            changed_count += 1
        report.append(entry)

    with _LOCK:
        _save(items)

    result = {"items": report, "changedCount": changed_count,
              "checkedAt": time.time()}

    # Platform enrichment: try to add trend & alert context from the platform
    try:
        from common.platform_channel import available, get_trend_insights, \
            get_alerts
        if available(org_id=org_id):
            enrichment = {"platformTrends": [], "platformAlerts": []}

            # Collect category hints from competitor names
            name_hints = [w.get("name", "") for w in items if w.get("name")]
            for hint in name_hints[:3]:
                trends = get_trend_insights(category=hint, limit=3, org_id=org_id)
                for t in trends:
                    entry = {"keyword": t.get("keyword", ""),
                             "growthRate": t.get("growthRate", "N/A")}
                    if entry not in enrichment["platformTrends"]:
                        enrichment["platformTrends"].append(entry)

            alerts = get_alerts(severity="WARNING", limit=5, org_id=org_id)
            for a in alerts:
                enrichment["platformAlerts"].append({
                    "type": a.get("type", ""),
                    "message": a.get("message", ""),
                    "severity": a.get("severity", "WARNING"),
                })

            if enrichment["platformTrends"] or enrichment["platformAlerts"]:
                result["platformEnrichment"] = enrichment
    except Exception:  # noqa: BLE001 — 平台通道增强非必需，失败静默
        pass

    return result
