"""会话与产物 TTL 清理 — 防止 sessions / outputs / uploads 无限增长。

规则：
- 目录的「最后活跃时间」= 目录树里最新文件的 mtime
- 超过 SESSION_TTL_DAYS（默认 14 天，0 = 关闭）未活跃的会话记录与输出目录被删除
- 内存中的活跃会话永不清理
- 启动时清一次，之后每 24h 清一次（守护线程）
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
        return time.time()  # 读不到就当刚活跃过，宁可不删
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                latest = max(latest, os.path.getmtime(os.path.join(root, name)))
            except OSError:
                continue
    return latest


def cleanup_expired(sessions_dir: str, output_dir: str, uploads_dir: str = "",
                    active_sids=None, days: float | None = None) -> dict:
    """删除过期会话目录，返回 {"removed": [...], "kept": n}。"""
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
    """启动守护线程：立即清一次，之后每 24h 清一次。TTL=0 时不启动。"""
    if ttl_days() <= 0:
        return

    def _loop():
        while True:
            try:
                result = cleanup_expired(
                    sessions_dir, output_dir, uploads_dir,
                    active_sids=list(sessions.keys()))
                if result.get("removed"):
                    print(f"  [Housekeeping] 已清理 {len(result['removed'])} 个过期会话目录")
            except Exception as e:  # noqa: BLE001 — 清理失败不影响服务
                print(f"  [Housekeeping] 清理失败: {e}")
            time.sleep(SWEEP_INTERVAL)

    threading.Thread(target=_loop, daemon=True, name="housekeeping").start()
