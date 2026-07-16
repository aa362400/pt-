"""Agent process heartbeat and readiness snapshot."""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone


def _iso_utc(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


class RuntimeHeartbeat:
    def __init__(self, job_queue, interval_seconds: float | None = None) -> None:
        self._job_queue = job_queue
        self._interval_seconds = max(
            1.0,
            interval_seconds
            if interval_seconds is not None
            else float(os.environ.get("AGENT_HEARTBEAT_INTERVAL_SECONDS", "10")),
        )
        self._started_at = time.time()
        self._last_heartbeat_at = 0.0
        self._queue_snapshot: dict = {}
        self._last_error = ""
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._tick()
        self._thread = threading.Thread(
            target=self._run,
            name="agent-runtime-heartbeat",
            daemon=True,
        )
        self._thread.start()

    def _tick(self) -> None:
        try:
            queue_snapshot = self._job_queue.health_snapshot()
            error = ""
        except Exception as exc:  # noqa: BLE001
            queue_snapshot = {}
            error = f"{type(exc).__name__}: {exc}"
        now = time.time()
        with self._lock:
            self._queue_snapshot = queue_snapshot
            self._last_error = error
            self._last_heartbeat_at = now

    def _run(self) -> None:
        while not self._stop_event.wait(self._interval_seconds):
            self._tick()

    def snapshot(self) -> dict:
        with self._lock:
            heartbeat_at = self._last_heartbeat_at
            queue_snapshot = dict(self._queue_snapshot)
            last_error = self._last_error
        now = time.time()
        freshness_limit = max(15.0, self._interval_seconds * 3)
        heartbeat_fresh = heartbeat_at > 0 and now - heartbeat_at <= freshness_limit
        state_backend_available = bool(
            queue_snapshot.get("state_backend_available", False)
        )
        ready = heartbeat_fresh and not last_error and state_backend_available
        return {
            "ready": ready,
            "heartbeat_fresh": heartbeat_fresh,
            "heartbeat_at": _iso_utc(heartbeat_at) if heartbeat_at else None,
            "uptime_seconds": round(now - self._started_at, 3),
            "queue": queue_snapshot,
            "error": last_error or None,
        }

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=max(1.0, self._interval_seconds + 1))
