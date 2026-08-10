"""JSON-backed chat session persistence."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from collections.abc import Callable

from web.services.path_security import safe_join, validate_session_id
from web.services.shared_state import get_shared_redis_client, state_namespace


_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()
_REDIS_UNSET = object()
_REDIS_CLIENT = _REDIS_UNSET


class ConcurrentSessionUpdateError(RuntimeError):
    """Raised instead of silently overwriting a newer shared session record."""


def configure_redis_client(client) -> None:
    global _REDIS_CLIENT
    _REDIS_CLIENT = client


def reset_redis_client() -> None:
    global _REDIS_CLIENT
    _REDIS_CLIENT = _REDIS_UNSET


def _redis_client():
    global _REDIS_CLIENT
    if _REDIS_CLIENT is _REDIS_UNSET:
        _REDIS_CLIENT = get_shared_redis_client()
    return _REDIS_CLIENT


def _redis_session_key(sid: str) -> str:
    return f"{state_namespace()}:session:{validate_session_id(sid)}"


def _session_lock(sid: str) -> threading.Lock:
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(sid, threading.Lock())


def session_file(sessions_dir: str, sid: str) -> str:
    return safe_join(sessions_dir, f"{validate_session_id(sid)}.json")


def default_session_record(sid: str) -> dict:
    now = time.time()
    return {
        "session_id": sid,
        "created_at": now,
        "updated_at": now,
        "title": "",
        "messages": [],
        "conversation_history": [],
        "_state_version": 0,
    }


def load_session_record(sessions_dir: str, sid: str) -> dict:
    client = _redis_client()
    if client is not None:
        raw = client.get(_redis_session_key(sid))
        if raw is None:
            return default_session_record(sid)
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default_session_record(sid)
        data.setdefault("messages", [])
        data.setdefault("conversation_history", [])
        data.setdefault("_state_version", 0)
        return data
    path = session_file(sessions_dir, sid)
    if not os.path.exists(path):
        return default_session_record(sid)
    try:
        with _session_lock(sid):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        data.setdefault("messages", [])
        data.setdefault("conversation_history", [])
        return data
    except (json.JSONDecodeError, OSError):
        return default_session_record(sid)


def save_session_record(sessions_dir: str, sid: str, data: dict) -> None:
    validate_session_id(sid)
    data["session_id"] = sid
    data["updated_at"] = time.time()
    client = _redis_client()
    if client is not None:
        expected_version = int(data.get("_state_version", 0) or 0)
        data["_state_version"] = expected_version + 1
        payload = json.dumps(data, ensure_ascii=False, default=str)
        result = client.eval(
            """
            local raw = redis.call('GET', KEYS[1])
            local current = 0
            if raw then
              local ok, decoded = pcall(cjson.decode, raw)
              if ok and decoded['_state_version'] then
                current = tonumber(decoded['_state_version']) or 0
              end
            end
            if current ~= tonumber(ARGV[1]) then return -1 end
            redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
            return current + 1
            """,
            1,
            _redis_session_key(sid),
            expected_version,
            payload,
            7 * 24 * 60 * 60,
        )
        if int(result) < 0:
            data["_state_version"] = expected_version
            raise ConcurrentSessionUpdateError(
                f"Session {sid} changed concurrently; reload before saving"
            )
        return
    path = session_file(sessions_dir, sid)
    os.makedirs(sessions_dir, exist_ok=True)
    with _session_lock(sid):
        fd, temp_path = tempfile.mkstemp(
            prefix=f".{sid}.", suffix=".tmp", dir=os.path.dirname(path), text=True,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, path)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)


def list_session_records(sessions_dir: str, limit: int = 50) -> list:
    items = []
    client = _redis_client()
    if client is not None:
        prefix = f"{state_namespace()}:session:"
        for raw_key in client.scan_iter(match=f"{prefix}*"):
            key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
            sid = key[len(prefix):]
            try:
                rec = load_session_record(sessions_dir, sid)
            except ValueError:
                continue
            items.append({
                "session_id": sid,
                "title": rec.get("title") or f"text {sid}",
                "updated_at": rec.get("updated_at", 0),
                "message_count": len(rec.get("messages", [])),
                "thumb": rec.get("thumb", ""),
            })
        items.sort(key=lambda item: item["updated_at"], reverse=True)
        return items[:limit]
    if not os.path.isdir(sessions_dir):
        return items
    for name in os.listdir(sessions_dir):
        if not name.endswith(".json"):
            continue
        sid = name[:-5]
        try:
            validate_session_id(sid)
        except ValueError:
            continue
        rec = load_session_record(sessions_dir, sid)
        items.append({
            "session_id": sid,
            "title": rec.get("title") or f"text {sid}",
            "updated_at": rec.get("updated_at", 0),
            "message_count": len(rec.get("messages", [])),
            "thumb": rec.get("thumb", ""),
        })
    items.sort(key=lambda item: item["updated_at"], reverse=True)
    return items[:limit]


def update_session_record(
    sessions_dir: str,
    sid: str,
    mutator: Callable[[dict], None],
    retries: int = 3,
) -> dict:
    for attempt in range(max(1, retries)):
        record = load_session_record(sessions_dir, sid)
        mutator(record)
        try:
            save_session_record(sessions_dir, sid, record)
            return record
        except ConcurrentSessionUpdateError:
            if attempt + 1 >= retries:
                raise
    raise ConcurrentSessionUpdateError(f"Session {sid} update failed")
