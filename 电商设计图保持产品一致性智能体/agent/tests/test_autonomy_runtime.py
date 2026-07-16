import json
import os
import sys
import threading
import time


AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.services.autonomy_runtime import AutonomyRuntime


def _task(task_id="event-1"):
    return {
        "id": task_id,
        "taskType": "product_research",
        "input": {"productName": "car fan", "marketplace": "Ozon"},
        "source": {"type": "platform_event"},
    }


def test_same_observation_executes_once_across_scans_and_restart(tmp_path):
    calls = []

    def scanner():
        return [_task()]

    def executor(task, _progress):
        calls.append(task["id"])
        return {"summary": "source-backed", "evidenceGate": {"passed": True}}

    runtime = AutonomyRuntime(str(tmp_path), scanner, executor, enabled=True)
    runtime.run_once()
    runtime.run_once()

    restarted = AutonomyRuntime(str(tmp_path), scanner, executor, enabled=True)
    restarted.run_once()

    assert calls == ["event-1"]
    assert restarted.status()["tasks"]["completed"] == 1


def test_interrupted_task_is_recovered_after_restart(tmp_path):
    state_path = tmp_path / "state.json"
    state_path.write_text(
        json.dumps(
            {
                "version": 1,
                "tasks": {
                    "event-1": {
                        **_task(),
                        "status": "running",
                        "attempts": 1,
                        "nextAttemptAt": None,
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    calls = []

    runtime = AutonomyRuntime(
        str(tmp_path),
        lambda: [],
        lambda task, _progress: calls.append(task["id"])
        or {"evidenceGate": {"passed": True}},
        enabled=True,
    )
    runtime.run_once()

    assert calls == ["event-1"]
    assert runtime.get_task("event-1")["status"] == "completed"
    assert runtime.get_task("event-1")["recovered"] is True


def test_degraded_result_is_retried_and_never_marked_completed(tmp_path):
    runtime = AutonomyRuntime(
        str(tmp_path),
        lambda: [_task()],
        lambda _task, _progress: {
            "response": "template fallback",
            "degraded": True,
            "degradedReason": "MODEL_PROVIDER_UNAVAILABLE",
        },
        enabled=True,
        max_attempts=2,
        retry_delays=(0,),
    )

    runtime.run_once()
    assert runtime.get_task("event-1")["status"] == "retry_wait"
    runtime.run_once()

    task = runtime.get_task("event-1")
    assert task["status"] == "failed"
    assert task["attempts"] == 2
    assert task["errorCode"] == "AUTONOMY_DEGRADED_RESULT"


def test_failed_evidence_gate_blocks_success(tmp_path):
    runtime = AutonomyRuntime(
        str(tmp_path),
        lambda: [_task()],
        lambda _task, _progress: {
            "summary": "not enough evidence",
            "evidenceGate": {"passed": False},
        },
        enabled=True,
        max_attempts=1,
    )

    runtime.run_once()

    task = runtime.get_task("event-1")
    assert task["status"] == "failed"
    assert task["errorCode"] == "AUTONOMY_EVIDENCE_GATE_FAILED"


def test_nested_runtime_fallback_is_never_marked_completed(tmp_path):
    runtime = AutonomyRuntime(
        str(tmp_path),
        lambda: [_task()],
        lambda _task, _progress: {
            "summary": "fallback output",
            "_runtime": {"fallbackActive": True, "status": "degraded"},
            "_verification": {"passed": True},
        },
        enabled=True,
        max_attempts=1,
    )

    runtime.run_once()

    task = runtime.get_task("event-1")
    assert task["status"] == "failed"
    assert task["errorCode"] == "AUTONOMY_DEGRADED_RESULT"


def test_nested_verifier_failure_blocks_success(tmp_path):
    runtime = AutonomyRuntime(
        str(tmp_path),
        lambda: [_task()],
        lambda _task, _progress: {
            "summary": "invalid research",
            "_runtime": {"fallbackActive": False, "status": "available"},
            "_verification": {"passed": False},
        },
        enabled=True,
        max_attempts=1,
    )

    runtime.run_once()

    assert runtime.get_task("event-1")["errorCode"] == "AUTONOMY_OUTPUT_VERIFICATION_FAILED"


def test_stale_instance_lock_is_recovered(tmp_path):
    (tmp_path / "runtime.lock").write_text(
        json.dumps({"instanceId": "dead", "pid": 99999999, "createdAt": 1}),
        encoding="utf-8",
    )
    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
        interval_seconds=60,
    )

    assert runtime.start() is True
    deadline = time.time() + 1
    while time.time() < deadline and not runtime.status()["running"]:
        time.sleep(0.01)
    assert runtime.status()["running"] is True
    runtime.stop()


def test_live_instance_lock_is_not_stolen(tmp_path):
    (tmp_path / "runtime.lock").write_text(
        json.dumps({"instanceId": "live", "pid": os.getpid(), "createdAt": time.time()}),
        encoding="utf-8",
    )
    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
    )

    assert runtime.start() is False


def test_reclaims_persistent_pid_one_lock_from_previous_container(
    tmp_path, monkeypatch
):
    """A recreated container must not mistake its own PID 1 for the old PID 1."""
    (tmp_path / "runtime.lock").write_text(
        json.dumps(
            {
                "version": 2,
                "instanceId": "old-container-runtime",
                "pid": 1,
                "hostname": "old-container",
                "processStart": "linux-proc-stat:100",
                "processStartedAt": 100.0,
                "createdAt": 101.0,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(os, "getpid", lambda: 1)
    monkeypatch.setattr(
        AutonomyRuntime,
        "_current_process_identity",
        staticmethod(
            lambda: {
                "pid": 1,
                "hostname": "new-container",
                "processStart": "linux-proc-stat:900",
                "processStartedAt": 900.0,
            }
        ),
        raising=False,
    )
    monkeypatch.setattr(
        AutonomyRuntime,
        "_pid_is_alive",
        staticmethod(lambda _pid: True),
    )
    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
        interval_seconds=60,
    )

    assert runtime.start() is True
    assert runtime.status()["instanceId"] is not None
    runtime.stop()


def test_legacy_pid_one_lock_older_than_current_process_is_reclaimed(
    tmp_path, monkeypatch
):
    """Version-one locks remain readable but PID reuse must be detected."""
    (tmp_path / "runtime.lock").write_text(
        json.dumps({"instanceId": "legacy", "pid": 1, "createdAt": 100.0}),
        encoding="utf-8",
    )
    monkeypatch.setattr(os, "getpid", lambda: 1)
    monkeypatch.setattr(
        AutonomyRuntime,
        "_current_process_identity",
        staticmethod(
            lambda: {
                "pid": 1,
                "hostname": "new-container",
                "processStart": "linux-proc-stat:900",
                "processStartedAt": 900.0,
            }
        ),
        raising=False,
    )
    monkeypatch.setattr(
        AutonomyRuntime,
        "_pid_is_alive",
        staticmethod(lambda _pid: True),
    )
    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
        interval_seconds=60,
    )

    assert runtime.start() is True
    runtime.stop()


def test_same_process_identity_lock_is_not_stolen(tmp_path, monkeypatch):
    identity = {
        "pid": 1,
        "hostname": "same-container",
        "processStart": "linux-proc-stat:900",
        "processStartedAt": 900.0,
    }
    (tmp_path / "runtime.lock").write_text(
        json.dumps(
            {
                "version": 2,
                "instanceId": "live-runtime",
                **identity,
                "createdAt": 901.0,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(os, "getpid", lambda: 1)
    monkeypatch.setattr(
        AutonomyRuntime,
        "_current_process_identity",
        staticmethod(lambda: dict(identity)),
        raising=False,
    )
    monkeypatch.setattr(
        AutonomyRuntime,
        "_pid_is_alive",
        staticmethod(lambda _pid: True),
    )
    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
    )

    assert runtime.start() is False


def test_stale_lock_takeover_is_atomic_for_competing_runtimes(
    tmp_path, monkeypatch
):
    (tmp_path / "runtime.lock").write_text(
        json.dumps(
            {
                "version": 2,
                "instanceId": "old-container-runtime",
                "pid": 1,
                "hostname": "old-container",
                "processStart": "linux-proc-stat:100",
                "processStartedAt": 100.0,
                "createdAt": 101.0,
            }
        ),
        encoding="utf-8",
    )
    identity = {
        "pid": 1,
        "hostname": "new-container",
        "processStart": "linux-proc-stat:900",
        "processStartedAt": 900.0,
    }
    monkeypatch.setattr(os, "getpid", lambda: 1)
    monkeypatch.setattr(
        AutonomyRuntime,
        "_current_process_identity",
        staticmethod(lambda: dict(identity)),
        raising=False,
    )
    monkeypatch.setattr(
        AutonomyRuntime,
        "_pid_is_alive",
        staticmethod(lambda _pid: True),
    )
    runtimes = [
        AutonomyRuntime(
            str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
            interval_seconds=60,
        )
        for _ in range(2)
    ]
    barrier = threading.Barrier(2)
    results = []

    def start(runtime):
        barrier.wait(timeout=1)
        results.append(runtime.start())

    starters = [threading.Thread(target=start, args=(runtime,)) for runtime in runtimes]
    for starter in starters:
        starter.start()
    for starter in starters:
        starter.join(timeout=2)

    assert sorted(results) == [False, True]
    for runtime in runtimes:
        runtime.stop()


def test_status_remains_readable_while_executor_is_running(tmp_path):
    entered = threading.Event()
    release = threading.Event()

    def executor(_task, _progress):
        entered.set()
        release.wait(timeout=2)
        return {"evidenceGate": {"passed": True}}

    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [_task()], executor, enabled=True,
    )
    worker = threading.Thread(target=runtime.run_once)
    worker.start()
    assert entered.wait(timeout=1)

    started = time.monotonic()
    status = runtime.status()
    elapsed = time.monotonic() - started

    assert elapsed < 0.2
    assert status["tasks"]["running"] == 1
    release.set()
    worker.join(timeout=2)


def test_successful_empty_scan_clears_stale_scan_error(tmp_path):
    (tmp_path / "state.json").write_text(
        json.dumps(
            {
                "version": 1,
                "tasks": {},
                "lastError": {
                    "code": "AUTONOMY_SCAN_FAILED",
                    "message": "stale failure",
                },
            }
        ),
        encoding="utf-8",
    )
    runtime = AutonomyRuntime(
        str(tmp_path), lambda: [], lambda *_args: {}, enabled=True,
    )

    status = runtime.run_once()

    assert status["lastError"] is None
    assert status["lastScanSuccessAt"] is not None
