#!/usr/bin/env python3
import fnmatch
import json
import os
import sys
import threading
import time

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.services.job_queue import JobQueue
from web.services.task_state import TaskStateStore
from web.services import session_store
from web.services import shared_state
from agents.blackboard import SharedBlackboard


class FakeRedis:
    def __init__(self):
        self.data = {}
        self.lock = threading.RLock()

    def ping(self):
        return True

    def get(self, key):
        with self.lock:
            return self.data.get(key)

    def set(self, key, value, ex=None, nx=False):
        del ex
        with self.lock:
            if nx and key in self.data:
                return False
            self.data[key] = value
            return True

    def delete(self, key):
        with self.lock:
            return int(self.data.pop(key, None) is not None)

    def exists(self, key):
        with self.lock:
            return int(key in self.data)

    def expire(self, key, _ttl):
        return self.exists(key)

    def scan_iter(self, match="*"):
        with self.lock:
            keys = list(self.data)
        return iter(key for key in keys if fnmatch.fnmatch(key, match))

    def eval(self, script, key_count, *args):
        keys = args[:key_count]
        argv = args[key_count:]
        with self.lock:
            if "cjson.decode" in script:
                raw = self.data.get(keys[0])
                current = int(json.loads(raw).get("_state_version", 0)) if raw else 0
                if current != int(argv[0]):
                    return -1
                self.data[keys[0]] = argv[1]
                return current + 1
            if key_count == 2:
                existing = self.data.get(keys[0])
                replace_job_id = argv[3] if len(argv) > 3 else ""
                if existing and (
                    not replace_job_id or existing != replace_job_id
                ):
                    return [0, existing]
                self.data[keys[0]] = argv[0]
                self.data[keys[1]] = argv[1]
                return [1, argv[0]]
            if self.data.get(keys[0]) == argv[0]:
                return self.delete(keys[0])
            return 0


def test_job_idempotency_and_result_are_shared_between_instances(tmp_path):
    redis = FakeRedis()
    first_queue = JobQueue(str(tmp_path / "one"), max_workers=1, redis_client=redis)
    second_queue = JobQueue(str(tmp_path / "two"), max_workers=1, redis_client=redis)
    calls = []

    def runner(_job_id, _payload, _progress):
        calls.append("run")
        return {"ok": True}

    payload = {"context": {"requestId": "org-1:request-1"}}
    first = first_queue.submit("assistant_chat", payload, runner)
    duplicate = second_queue.submit("assistant_chat", payload, runner)

    assert duplicate["job_id"] == first["job_id"]
    deadline = time.time() + 2
    while time.time() < deadline:
        result = second_queue.get(first["job_id"])
        if result and result["status"] == "completed":
            break
        time.sleep(0.01)
    assert second_queue.get(first["job_id"])["result"] == {"ok": True}
    assert calls == ["run"]


def test_failed_shared_job_has_one_retry_attempt_across_instances(tmp_path):
    redis = FakeRedis()
    first_queue = JobQueue(str(tmp_path / "one"), max_workers=1, redis_client=redis)
    second_queue = JobQueue(str(tmp_path / "two"), max_workers=1, redis_client=redis)
    retry_started = threading.Event()
    release_retry = threading.Event()
    submit_retry = threading.Event()
    calls = []
    calls_lock = threading.Lock()
    results = []

    def runner(job_id, _payload, _progress):
        with calls_lock:
            calls.append(job_id)
            call_number = len(calls)
        if call_number == 1:
            raise RuntimeError("first attempt failed")
        retry_started.set()
        assert release_retry.wait(timeout=2)
        return {"ok": True}

    payload = {
        "context": {"requestId": "shared-retryable-request"},
        "input_sha256": "d" * 64,
    }

    def resubmit(queue):
        assert submit_retry.wait(timeout=1)
        results.append(queue.submit("assistant_chat", payload, runner))

    try:
        first = first_queue.submit("assistant_chat", payload, runner)
        deadline = time.time() + 2
        while time.time() < deadline:
            failed = second_queue.get(first["job_id"])
            if failed and failed["status"] == "failed":
                break
            time.sleep(0.01)
        assert second_queue.get(first["job_id"])["status"] == "failed"

        threads = [
            threading.Thread(target=resubmit, args=(first_queue,)),
            threading.Thread(target=resubmit, args=(second_queue,)),
        ]
        for thread in threads:
            thread.start()
        submit_retry.set()
        for thread in threads:
            thread.join(timeout=2)

        assert len(results) == 2
        assert len({result["job_id"] for result in results}) == 1
        retry = results[0]
        assert retry["job_id"] != first["job_id"]
        assert retry["attempt"] == 2
        assert retry["root_job_id"] == first["job_id"]
        assert retry["previous_job_id"] == first["job_id"]
        assert retry_started.wait(timeout=1)
        with calls_lock:
            assert calls == [first["job_id"], retry["job_id"]]
    finally:
        release_retry.set()
        first_queue._executor.shutdown(wait=True)
        second_queue._executor.shutdown(wait=True)


def test_task_progress_and_cancel_flags_are_shared():
    redis = FakeRedis()
    first = TaskStateStore(redis)
    second = TaskStateStore(redis)

    first.progress["session-1"] = {"stage": "research"}
    first.set_cancel("session-1")

    assert second.progress.get("session-1") == {"stage": "research"}
    assert second.is_cancelled("session-1") is True


def test_session_store_rejects_stale_shared_writes(tmp_path):
    redis = FakeRedis()
    session_store.configure_redis_client(redis)
    try:
        first = session_store.load_session_record(str(tmp_path), "session-1")
        first["title"] = "first"
        session_store.save_session_record(str(tmp_path), "session-1", first)

        stale = session_store.load_session_record(str(tmp_path), "session-1")
        current = session_store.load_session_record(str(tmp_path), "session-1")
        current["title"] = "current"
        session_store.save_session_record(str(tmp_path), "session-1", current)
        stale["title"] = "stale"

        try:
            session_store.save_session_record(str(tmp_path), "session-1", stale)
            raised = False
        except session_store.ConcurrentSessionUpdateError:
            raised = True

        assert raised is True
        assert session_store.load_session_record(str(tmp_path), "session-1")["title"] == "current"
    finally:
        session_store.reset_redis_client()


def test_blackboard_memory_is_visible_to_another_agent_instance(tmp_path):
    redis = FakeRedis()
    shared_state.configure_shared_redis_client(redis)
    try:
        first = SharedBlackboard("session-1", base_dir=str(tmp_path))
        first.memory_profile["project_memory"] = {"minimum_margin": 0.3}
        first.product_name = "car fan"
        first.save()

        second = SharedBlackboard.load("session-1", base_dir=str(tmp_path))

        assert second.product_name == "car fan"
        assert second.memory_profile["project_memory"]["minimum_margin"] == 0.3
    finally:
        shared_state.reset_shared_redis_client()
