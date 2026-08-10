"""In-memory task progress/result/cancel state for the dev web server."""

from __future__ import annotations

import threading

from web.services.shared_state import (
    RedisJsonMapping,
    get_shared_redis_client,
    state_namespace,
)


class TaskStateStore:
    """Small in-process store for background task state."""

    def __init__(self, redis_client=None) -> None:
        self._redis = (
            redis_client if redis_client is not None else get_shared_redis_client()
        )
        if self._redis is None:
            self.progress: dict[str, dict] = {}
            self.results: dict[str, dict] = {}
        else:
            namespace = state_namespace()
            self.progress = RedisJsonMapping(
                self._redis, f"{namespace}:task-progress"
            )
            self.results = RedisJsonMapping(
                self._redis, f"{namespace}:task-result"
            )
        self._cancel_flags: dict[str, bool] = {}
        self._cancel_lock = threading.Lock()

    def _cancel_key(self, sid: str) -> str:
        return f"{state_namespace()}:task-cancel:{sid}"

    def clear_cancel(self, sid: str) -> None:
        if self._redis is not None:
            self._redis.set(self._cancel_key(sid), "0", ex=86_400)
            return
        with self._cancel_lock:
            self._cancel_flags[sid] = False

    def set_cancel(self, sid: str, value: bool = True) -> None:
        if self._redis is not None:
            self._redis.set(
                self._cancel_key(sid), "1" if value else "0", ex=86_400
            )
            return
        with self._cancel_lock:
            self._cancel_flags[sid] = value

    def is_cancelled(self, sid: str) -> bool:
        if self._redis is not None:
            return self._redis.get(self._cancel_key(sid)) == "1"
        with self._cancel_lock:
            return bool(self._cancel_flags.get(sid))

    def make_cancel_check(self, sid: str):
        return lambda: self.is_cancelled(sid)
