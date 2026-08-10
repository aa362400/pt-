"""english_text TTL text — text sessions / outputs / uploads noneenglish_text。

text：
- english_text「english_text」= english_textfiletext mtime
- text SESSION_TTL_DAYS（text 14 text，0 = text）english_textoutputenglish_text
- english_text
- english_text，english_text 24h english_text（english_text）
"""

from __future__ import annotations

import os
import shutil
import threading
import time

DEFAULT_TTL_DAYS = 14
SWEEP_INTERVAL = 24 * 3600


def ttl_days() -> float:
    try:
        return float(os.getenv("SESSION_TTL_DAYS", str(DEFAULT_TTL_DAYS)))
    except ValueError:
        return DEFAULT_TTL_DAYS


def _dir_last_active(path: str) -> float:
    latest = 0.0
    try:
        latest = os.path.getmtime(path)
    except OSError:
        return time.time()  # english_text，english_text
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                latest = max(latest, os.path.getmtime(os.path.join(root, name)))
            except OSError:
                continue
    return latest


def cleanup_expired(sessions_dir: str, output_dir: str, uploads_dir: str = "",
                    active_sids=None, days: float | None = None) -> dict:
    """english_text，text {"removed": [...], "kept": n}。"""
    days = ttl_days() if days is None else days
    if days <= 0:
        return {"removed": [], "kept": 0, "disabled": True}
    cutoff = time.time() - days * 86400
    active = set(active_sids or [])
    removed, kept = [], 0

    for base in (sessions_dir, output_dir, uploads_dir):
        if not base or not os.path.isdir(base):
            continue
        for name in os.listdir(base):
            path = os.path.join(base, name)
            if not os.path.isdir(path) or name in active:
                kept += 1
                continue
            if _dir_last_active(path) < cutoff:
                try:
                    shutil.rmtree(path)
                    removed.append(path)
                except OSError:
                    kept += 1
            else:
                kept += 1
    return {"removed": removed, "kept": kept}


def start_background_sweeper(sessions_dir: str, output_dir: str,
                             uploads_dir: str, sessions: dict) -> None:
    """english_text：english_text，english_text 24h english_text。TTL=0 english_text。"""
    if ttl_days() <= 0:
        return

    def _loop():
        while True:
            try:
                result = cleanup_expired(
                    sessions_dir, output_dir, uploads_dir,
                    active_sids=list(sessions.keys()))
                if result.get("removed"):
                    print(f"  [Housekeeping] english_text {len(result['removed'])} english_text")
            except Exception as e:  # noqa: BLE001 — textfailedenglish_text
                print(f"  [Housekeeping] textfailed: {e}")
            time.sleep(SWEEP_INTERVAL)

    threading.Thread(target=_loop, daemon=True, name="housekeeping").start()
