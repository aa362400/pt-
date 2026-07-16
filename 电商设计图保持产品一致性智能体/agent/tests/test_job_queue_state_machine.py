#!/usr/bin/env python3
import os
import sys
import threading
import time

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

import pytest

from web.services.job_queue import IdempotencyConflictError, JobQueue
from web.services import job_queue as job_queue_module


def test_write_waits_until_concurrent_reader_closes_file(tmp_path, monkeypatch):
    queue = JobQueue(str(tmp_path), max_workers=1)
    job = {
        "job_id": "concurrent-read-write",
        "task_type": "assistant_chat",
        "status": "queued",
    }
    queue._write(job)

    reader_open = threading.Event()
    release_reader = threading.Event()
    writer_done = threading.Event()
    original_load = job_queue_module.json.load

    def blocking_load(handle):
        reader_open.set()
        assert release_reader.wait(timeout=2)
        return original_load(handle)

    monkeypatch.setattr(job_queue_module.json, "load", blocking_load)
    reader = threading.Thread(target=queue.get, args=(job["job_id"],))
    reader.start()
    assert reader_open.wait(timeout=1)

    updated = {**job, "status": "running"}

    def write_updated():
        queue._write(updated)
        writer_done.set()

    writer = threading.Thread(target=write_updated)
    writer.start()
    assert not writer_done.wait(timeout=0.1)

    release_reader.set()
    reader.join(timeout=1)
    writer.join(timeout=1)
    assert writer_done.is_set()
    assert queue.get(job["job_id"])["status"] == "running"


def test_timeout_invalidates_late_completion(tmp_path):
    started = threading.Event()
    release = threading.Event()
    queue = JobQueue(str(tmp_path), max_workers=1, image_timeout_seconds=0.05)

    def slow_runner(_job_id, _payload, _progress):
        started.set()
        release.wait(timeout=2)
        return {"late": True}

    job = queue.submit("generate_images", {}, slow_runner)
    assert started.wait(timeout=1)

    deadline = time.time() + 2
    timed_out = None
    while time.time() < deadline:
        timed_out = queue.get(job["job_id"])
        if timed_out and timed_out["status"] == "failed":
            break
        time.sleep(0.01)

    assert timed_out is not None
    assert timed_out["status"] == "failed"
    assert "timeout" in timed_out["progress"]["stage"]

    release.set()
    time.sleep(0.1)
    assert queue.get(job["job_id"])["status"] == "failed"


def test_request_id_separates_quality_regeneration_from_transport_retry(tmp_path):
    queue = JobQueue(str(tmp_path), max_workers=1)

    def runner(_job_id, payload, _progress):
        return {"request": payload["context"]["requestId"]}

    first_payload = {
        "context": {
            "agentRunId": "run-1",
            "requestId": "run-1:generation:0",
        }
    }
    first = queue.submit("assistant_chat", first_payload, runner)
    duplicate = queue.submit("assistant_chat", first_payload, runner)
    regeneration_payload = {
        "context": {
            "agentRunId": "run-1",
            "requestId": "run-1:generation:1",
        }
    }
    regeneration = queue.submit("assistant_chat", regeneration_payload, runner)

    assert duplicate["job_id"] == first["job_id"]
    assert regeneration["job_id"] != first["job_id"]


def test_queued_duplicate_keeps_first_attempt_and_runs_once(tmp_path):
    queue = JobQueue(str(tmp_path), max_workers=1, redis_client=None)
    blocker_started = threading.Event()
    release_blocker = threading.Event()
    calls = []

    def blocker(_job_id, _payload, _progress):
        blocker_started.set()
        assert release_blocker.wait(timeout=2)
        return {"ok": True}

    def runner(_job_id, _payload, _progress):
        calls.append("run")
        return {"ok": True}

    try:
        queue.submit(
            "assistant_chat",
            {"context": {"requestId": "worker-blocker"}},
            blocker,
        )
        assert blocker_started.wait(timeout=1)

        payload = {"context": {"requestId": "queued-request"}}
        first = queue.submit("assistant_chat", payload, runner)
        duplicate = queue.submit("assistant_chat", payload, runner)

        assert queue.get(first["job_id"])["status"] == "queued"
        assert duplicate["job_id"] == first["job_id"]
        assert first["attempt"] == 1
        assert first["root_job_id"] == first["job_id"]
    finally:
        release_blocker.set()
        queue._executor.shutdown(wait=True)

    assert calls == ["run"]


def test_idempotent_replay_requires_same_input_and_keeps_original_session(tmp_path):
    queue = JobQueue(str(tmp_path), max_workers=1, redis_client=None)
    calls = []

    def runner(_job_id, payload, _progress):
        calls.append(payload["session_id"])
        return {"ok": True}

    original_payload = {
        "session_id": "session-original",
        "context": {"requestId": "request-1"},
        "input_sha256": "a" * 64,
    }
    first = queue.submit(
        "supplier_image_search",
        original_payload,
        runner,
        idempotency_key="scope-v2",
    )
    duplicate = queue.submit(
        "supplier_image_search",
        {
            **original_payload,
            "session_id": "session-retry-must-not-escape",
        },
        runner,
        idempotency_key="scope-v2",
    )

    assert duplicate["job_id"] == first["job_id"]
    assert duplicate["session_id"] == "session-original"
    assert duplicate["input_sha256"] == "a" * 64

    with pytest.raises(IdempotencyConflictError):
        queue.submit(
            "supplier_image_search",
            {
                **original_payload,
                "session_id": "session-conflict",
                "input_sha256": "b" * 64,
            },
            runner,
            idempotency_key="scope-v2",
        )

    queue._executor.shutdown(wait=True)
    assert calls == ["session-original"]


def test_failed_request_id_creates_one_linked_retry_attempt(tmp_path):
    queue = JobQueue(str(tmp_path), max_workers=1, redis_client=None)
    retry_started = threading.Event()
    release_retry = threading.Event()
    calls = []

    def runner(job_id, _payload, _progress):
        calls.append(job_id)
        if len(calls) == 1:
            raise RuntimeError("first attempt failed")
        retry_started.set()
        assert release_retry.wait(timeout=2)
        return {"ok": True}

    payload = {
        "context": {"requestId": "retryable-request-1"},
        "input_sha256": "c" * 64,
    }

    try:
        first = queue.submit("assistant_chat", payload, runner)
        deadline = time.time() + 2
        while time.time() < deadline:
            failed = queue.get(first["job_id"])
            if failed and failed["status"] == "failed":
                break
            time.sleep(0.01)

        assert queue.get(first["job_id"])["status"] == "failed"

        retry = queue.submit("assistant_chat", payload, runner)

        assert retry["job_id"] != first["job_id"]
        assert retry["attempt"] == 2
        assert retry["root_job_id"] == first["job_id"]
        assert retry["previous_job_id"] == first["job_id"]
        assert queue.get(first["job_id"])["status"] == "failed"

        assert retry_started.wait(timeout=1)
        duplicate_running = queue.submit("assistant_chat", payload, runner)
        assert duplicate_running["job_id"] == retry["job_id"]

        release_retry.set()
        deadline = time.time() + 2
        while time.time() < deadline:
            completed = queue.get(retry["job_id"])
            if completed and completed["status"] == "completed":
                break
            time.sleep(0.01)

        duplicate_completed = queue.submit("assistant_chat", payload, runner)
        assert duplicate_completed["job_id"] == retry["job_id"]
        assert calls == [first["job_id"], retry["job_id"]]
    finally:
        release_retry.set()
        queue._executor.shutdown(wait=True)
