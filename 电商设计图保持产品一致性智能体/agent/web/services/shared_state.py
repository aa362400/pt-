"""Shared Redis state helpers for multi-process Agent deployments."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator, MutableMapping
from typing import Any


_CLIENT_UNSET = object()
_CLIENT = _CLIENT_UNSET


def state_namespace() -> str:
    return os.environ.get("AGENT_STATE_NAMESPACE", "shopmate-agent:v1").strip()


def shared_state_required() -> bool:
    mode = os.environ.get("AGENT_STATE_MODE", "local").strip().lower()
    try:
        replicas = int(os.environ.get("AGENT_REPLICA_COUNT", "1") or "1")
    except ValueError:
        replicas = 1
    return mode == "redis" or replicas > 1


def create_redis_client():
    url = os.environ.get("AGENT_REDIS_URL", "").strip()
    required = shared_state_required()
    if not url:
        if required:
            raise RuntimeError(
                "Shared Agent state is required but AGENT_REDIS_URL is not configured"
            )
        return None
    try:
        import redis
    except ImportError as exc:
        raise RuntimeError(
            "AGENT_REDIS_URL is configured but the redis Python package is missing"
        ) from exc
    client = redis.Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=5,
        health_check_interval=30,
    )
    try:
        client.ping()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Configured Agent Redis state backend is unavailable") from exc
    return client


def get_shared_redis_client():
    global _CLIENT
    if _CLIENT is _CLIENT_UNSET:
        _CLIENT = create_redis_client()
    return _CLIENT


def configure_shared_redis_client(client) -> None:
    global _CLIENT
    _CLIENT = client


def reset_shared_redis_client() -> None:
    global _CLIENT
    _CLIENT = _CLIENT_UNSET


class RedisJsonMapping(MutableMapping[str, dict]):
    """Small dict-compatible facade used by legacy route code."""

    def __init__(self, client, prefix: str, ttl_seconds: int = 86_400) -> None:
        self.client = client
        self.prefix = prefix.rstrip(":")
        self.ttl_seconds = ttl_seconds

    def _key(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    def __getitem__(self, key: str) -> dict:
        raw = self.client.get(self._key(key))
        if raw is None:
            raise KeyError(key)
        return json.loads(raw)

    def __setitem__(self, key: str, value: dict) -> None:
        self.client.set(
            self._key(key),
            json.dumps(value, ensure_ascii=False, default=str),
            ex=self.ttl_seconds,
        )

    def __delitem__(self, key: str) -> None:
        if not self.client.delete(self._key(key)):
            raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        prefix = f"{self.prefix}:"
        for raw_key in self.client.scan_iter(match=f"{prefix}*"):
            key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
            yield key[len(prefix):]

    def __len__(self) -> int:
        return sum(1 for _ in self.__iter__())

    def get(self, key: str, default: Any = None):
        try:
            return self[key]
        except (KeyError, json.JSONDecodeError, TypeError):
            return default
