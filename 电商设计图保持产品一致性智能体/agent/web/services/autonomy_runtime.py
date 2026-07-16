"""Persistent, fail-closed runtime for read-only autonomous agent work."""

from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import uuid
from collections import Counter
from typing import Callable


logger = logging.getLogger("agent.autonomy")


class AutonomyTaskError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class AutonomyRuntime:
    """Poll observations and execute each stable task ID at most once.

    The runtime owns scheduling and durable state only. The supplied executor
    remains responsible for business logic and must be read-only or draft-only.
    """

    TERMINAL_STATUSES = frozenset(("completed", "failed"))

    def __init__(
        self,
        state_dir: str,
        scanner: Callable[[], list[dict]],
        executor: Callable[[dict, Callable[..., None]], dict],
        *,
        enabled: bool = False,
        interval_seconds: float = 300,
        max_attempts: int = 3,
        retry_delays: tuple[float, ...] = (30, 120, 600),
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.state_dir = os.path.abspath(state_dir)
        self.state_path = os.path.join(self.state_dir, "state.json")
        self.kill_switch_path = os.path.join(self.state_dir, "KILL_SWITCH")
        self.lock_path = os.path.join(self.state_dir, "runtime.lock")
        self.lock_guard_path = os.path.join(self.state_dir, "runtime.lock.guard")
        self.scanner = scanner
        self.executor = executor
        self.enabled = bool(enabled)
        self.interval_seconds = max(1.0, float(interval_seconds))
        self.max_attempts = max(1, int(max_attempts))
        self.retry_delays = tuple(max(0.0, float(item)) for item in retry_delays) or (0.0,)
        self.clock = clock
        self.instance_id = uuid.uuid4().hex
        self._process_identity = self._current_process_identity()
        self._mutex = threading.RLock()
        self._cycle_lock = threading.Lock()
        self._lifecycle_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._owns_lock = False
        self._lock_guard_handle = None
        os.makedirs(self.state_dir, exist_ok=True)
        self._state = self._load_state()
        self._recover_interrupted()

    def _default_state(self) -> dict:
        return {
            "version": 1,
            "tasks": {},
            "cycles": 0,
            "lastScanAt": None,
            "lastScanSuccessAt": None,
            "lastSuccessAt": None,
            "lastFailureAt": None,
            "lastError": None,
        }

    def _load_state(self) -> dict:
        try:
            with open(self.state_path, encoding="utf-8") as handle:
                loaded = json.load(handle)
            if not isinstance(loaded, dict):
                raise ValueError("autonomy state must be an object")
        except FileNotFoundError:
            loaded = self._default_state()
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"AUTONOMY_STATE_UNREADABLE: {exc}") from exc
        state = {**self._default_state(), **loaded}
        if not isinstance(state.get("tasks"), dict):
            raise RuntimeError("AUTONOMY_STATE_UNREADABLE: tasks must be an object")
        return state

    def _save(self) -> None:
        temp_path = f"{self.state_path}.{uuid.uuid4().hex}.tmp"
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(self._state, handle, ensure_ascii=False, indent=2, default=str)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, self.state_path)

    def _recover_interrupted(self) -> None:
        changed = False
        now = self.clock()
        for task in self._state["tasks"].values():
            if task.get("status") == "running":
                task["status"] = "retry_wait"
                task["nextAttemptAt"] = now
                task["recovered"] = True
                task["errorCode"] = "AUTONOMY_PROCESS_RESTARTED"
                task["error"] = "Recovered after process restart"
                changed = True
        if changed:
            self._save()

    @property
    def killed(self) -> bool:
        return os.path.exists(self.kill_switch_path)

    def get_task(self, task_id: str) -> dict | None:
        with self._mutex:
            task = self._state["tasks"].get(task_id)
            return json.loads(json.dumps(task)) if task else None

    def status(self) -> dict:
        with self._mutex:
            counts = Counter(
                str(task.get("status") or "unknown")
                for task in self._state["tasks"].values()
            )
            return {
                "enabled": self.enabled,
                "running": bool(self._thread and self._thread.is_alive()),
                "killSwitch": self.killed,
                "intervalSeconds": self.interval_seconds,
                "instanceId": self.instance_id if self._owns_lock else None,
                "cycles": int(self._state.get("cycles") or 0),
                "lastScanAt": self._state.get("lastScanAt"),
                "lastScanSuccessAt": self._state.get("lastScanSuccessAt"),
                "lastSuccessAt": self._state.get("lastSuccessAt"),
                "lastFailureAt": self._state.get("lastFailureAt"),
                "lastError": self._state.get("lastError"),
                "tasks": dict(counts),
            }

    def _normalize_task(self, raw: dict) -> dict:
        if not isinstance(raw, dict):
            raise AutonomyTaskError("AUTONOMY_INVALID_TASK", "scanner returned a non-object task")
        task_id = str(raw.get("id") or "").strip()
        task_type = str(raw.get("taskType") or "").strip()
        input_data = raw.get("input")
        if not task_id or not task_type or not isinstance(input_data, dict):
            raise AutonomyTaskError(
                "AUTONOMY_INVALID_TASK", "task requires id, taskType, and input object"
            )
        return {
            "id": task_id,
            "taskType": task_type,
            "input": input_data,
            "source": raw.get("source") if isinstance(raw.get("source"), dict) else {},
            "status": "pending",
            "attempts": 0,
            "createdAt": self.clock(),
            "nextAttemptAt": self.clock(),
            "progress": {"stage": "queued", "message": "autonomy task queued"},
        }

    def _ingest(self, observations: list[dict]) -> None:
        for raw in observations:
            task = self._normalize_task(raw)
            if task["id"] not in self._state["tasks"]:
                self._state["tasks"][task["id"]] = task

    def _validate_result(self, result: dict) -> None:
        if not isinstance(result, dict):
            raise AutonomyTaskError("AUTONOMY_INVALID_RESULT", "executor returned a non-object")
        runtime = result.get("_runtime") if isinstance(result.get("_runtime"), dict) else {}
        if (
            result.get("degraded")
            or result.get("fallbackActive")
            or result.get("mockMode")
            or runtime.get("fallbackActive")
            or runtime.get("status") == "degraded"
        ):
            reason = str(result.get("degradedReason") or "fallback or mock result")
            raise AutonomyTaskError("AUTONOMY_DEGRADED_RESULT", reason)
        evidence_gate = result.get("evidenceGate")
        if isinstance(evidence_gate, dict) and evidence_gate.get("passed") is False:
            raise AutonomyTaskError(
                "AUTONOMY_EVIDENCE_GATE_FAILED", "research evidence gate did not pass"
            )
        verification = (
            result.get("_verification")
            if isinstance(result.get("_verification"), dict)
            else {}
        )
        if verification.get("passed") is False:
            raise AutonomyTaskError(
                "AUTONOMY_OUTPUT_VERIFICATION_FAILED", "output verifier did not pass"
            )

    def _retry_delay(self, attempts: int) -> float:
        index = min(max(attempts - 1, 0), len(self.retry_delays) - 1)
        return self.retry_delays[index]

    def _execute(self, task_id: str) -> None:
        with self._mutex:
            task = self._state["tasks"][task_id]
            task["attempts"] = int(task.get("attempts") or 0) + 1
            task["status"] = "running"
            task["startedAt"] = self.clock()
            task["nextAttemptAt"] = None
            task["errorCode"] = None
            task["error"] = None
            self._save()

        def progress(stage: str, message: str, **extra) -> None:
            with self._mutex:
                task["progress"] = {"stage": stage, "message": message, **extra}
                self._save()

        try:
            result = self.executor(task, progress)
            self._validate_result(result)
            with self._mutex:
                task["status"] = "completed"
                task["result"] = result
                task["finishedAt"] = self.clock()
                task["progress"] = {
                    "stage": "done",
                    "message": "autonomy task completed",
                }
                self._state["lastSuccessAt"] = self.clock()
                self._state["lastError"] = None
                self._save()
                logger.info("autonomy_task_completed task_id=%s type=%s attempts=%s",
                            task["id"], task["taskType"], task["attempts"])
        except Exception as exc:  # noqa: BLE001
            with self._mutex:
                code = getattr(exc, "code", "AUTONOMY_EXECUTION_FAILED")
                task["errorCode"] = code
                task["error"] = f"{type(exc).__name__}: {exc}"
                task["finishedAt"] = self.clock()
                self._state["lastFailureAt"] = self.clock()
                self._state["lastError"] = {"taskId": task["id"], "code": code}
                if task["attempts"] < self.max_attempts:
                    task["status"] = "retry_wait"
                    task["nextAttemptAt"] = (
                        self.clock() + self._retry_delay(task["attempts"])
                    )
                    task["progress"] = {
                        "stage": "retry_wait",
                        "message": str(exc),
                    }
                else:
                    task["status"] = "failed"
                    task["progress"] = {"stage": "failed", "message": str(exc)}
                self._save()
                logger.warning("autonomy_task_failed task_id=%s code=%s attempts=%s",
                               task["id"], code, task["attempts"])

    def run_once(self) -> dict:
        if not self.enabled:
            return self.status()
        if self.killed:
            with self._mutex:
                self._state["lastError"] = {"code": "AUTONOMY_KILL_SWITCH_ACTIVE"}
                self._save()
            return self.status()
        if not self._cycle_lock.acquire(blocking=False):
            return self.status()
        try:
            observations = self.scanner()
            if not isinstance(observations, list):
                raise RuntimeError("autonomy scanner must return a list")
            with self._mutex:
                self._ingest(observations)
                now = self.clock()
                due_ids = [
                    task_id
                    for task_id, task in self._state["tasks"].items()
                    if task.get("status") in ("pending", "retry_wait")
                    and float(task.get("nextAttemptAt") or 0) <= now
                ]
                self._state["cycles"] = int(self._state.get("cycles") or 0) + 1
                self._state["lastScanAt"] = now
                self._state["lastScanSuccessAt"] = now
                self._state["lastError"] = None
                self._save()
            for task_id in due_ids:
                self._execute(task_id)
            return self.status()
        except Exception as exc:  # noqa: BLE001
            with self._mutex:
                self._state["lastFailureAt"] = self.clock()
                self._state["lastError"] = {
                    "code": "AUTONOMY_SCAN_FAILED",
                    "message": f"{type(exc).__name__}: {exc}",
                }
                self._save()
            logger.exception("autonomy_scan_failed")
            return self.status()
        finally:
            self._cycle_lock.release()

    @staticmethod
    def _process_start_details(pid: int) -> tuple[str | None, float | None]:
        """Return an OS process start marker and its Unix timestamp when available."""
        if pid <= 0:
            return None, None
        if os.name == "nt":
            try:
                import ctypes
                from ctypes import wintypes

                process_query_limited_information = 0x1000
                kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
                kernel32.OpenProcess.argtypes = [
                    wintypes.DWORD,
                    wintypes.BOOL,
                    wintypes.DWORD,
                ]
                kernel32.OpenProcess.restype = wintypes.HANDLE
                kernel32.GetProcessTimes.argtypes = [
                    wintypes.HANDLE,
                    ctypes.POINTER(wintypes.FILETIME),
                    ctypes.POINTER(wintypes.FILETIME),
                    ctypes.POINTER(wintypes.FILETIME),
                    ctypes.POINTER(wintypes.FILETIME),
                ]
                kernel32.GetProcessTimes.restype = wintypes.BOOL
                kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
                handle = kernel32.OpenProcess(
                    process_query_limited_information, False, pid
                )
                if not handle:
                    return None, None
                try:
                    created = wintypes.FILETIME()
                    exited = wintypes.FILETIME()
                    kernel = wintypes.FILETIME()
                    user = wintypes.FILETIME()
                    if not kernel32.GetProcessTimes(
                        handle,
                        ctypes.byref(created),
                        ctypes.byref(exited),
                        ctypes.byref(kernel),
                        ctypes.byref(user),
                    ):
                        return None, None
                    filetime = (created.dwHighDateTime << 32) | created.dwLowDateTime
                    started_at = filetime / 10_000_000 - 11_644_473_600
                    return f"windows-filetime:{filetime}", started_at
                finally:
                    kernel32.CloseHandle(handle)
            except (AttributeError, OSError, ValueError):
                return None, None

        try:
            with open(f"/proc/{pid}/stat", encoding="utf-8") as handle:
                raw_stat = handle.read().strip()
            closing_paren = raw_stat.rfind(")")
            if closing_paren < 0:
                return None, None
            # Fields following comm start at field 3 (state); starttime is field 22.
            remaining = raw_stat[closing_paren + 2 :].split()
            start_ticks = int(remaining[19])
            clock_ticks = int(os.sysconf("SC_CLK_TCK"))
            boot_time = None
            with open("/proc/stat", encoding="utf-8") as handle:
                for line in handle:
                    if line.startswith("btime "):
                        boot_time = float(line.split()[1])
                        break
            started_at = (
                boot_time + start_ticks / clock_ticks
                if boot_time is not None and clock_ticks > 0
                else None
            )
            return f"linux-proc-stat:{start_ticks}", started_at
        except (IndexError, OSError, TypeError, ValueError):
            return None, None

    @staticmethod
    def _current_process_identity() -> dict:
        pid = os.getpid()
        process_start, process_started_at = AutonomyRuntime._process_start_details(pid)
        return {
            "pid": pid,
            "hostname": socket.gethostname(),
            "processStart": process_start,
            "processStartedAt": process_started_at,
        }

    def _identity_for_live_pid(self, pid: int) -> dict:
        if pid == int(self._process_identity.get("pid") or 0):
            return dict(self._process_identity)
        process_start, process_started_at = self._process_start_details(pid)
        return {
            "pid": pid,
            "hostname": socket.gethostname(),
            "processStart": process_start,
            "processStartedAt": process_started_at,
        }

    def _try_acquire_lock_guard(self) -> bool:
        """Hold an OS advisory lock so stale-lock takeover is serialized."""
        if self._lock_guard_handle is not None:
            return True
        handle = open(self.lock_guard_path, "a+b")
        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0, os.SEEK_END)
                if handle.tell() == 0:
                    handle.write(b"\0")
                    handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (ImportError, OSError):
            handle.close()
            return False
        self._lock_guard_handle = handle
        return True

    def _release_lock_guard(self) -> None:
        handle = self._lock_guard_handle
        self._lock_guard_handle = None
        if handle is None:
            return
        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        except (ImportError, OSError):
            pass
        finally:
            handle.close()

    def _acquire_instance_lock(self) -> bool:
        if not self._try_acquire_lock_guard():
            return False
        descriptor = None
        for _attempt in range(3):
            try:
                descriptor = os.open(
                    self.lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY
                )
                break
            except FileExistsError:
                if not self._existing_lock_is_stale():
                    self._release_lock_guard()
                    return False
                try:
                    os.remove(self.lock_path)
                except FileNotFoundError:
                    pass
        if descriptor is None:
            self._release_lock_guard()
            return False
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "version": 2,
                    "instanceId": self.instance_id,
                    **self._process_identity,
                    "createdAt": self.clock(),
                },
                handle,
            )
            handle.flush()
            os.fsync(handle.fileno())
        self._owns_lock = True
        return True

    def _existing_lock_is_stale(self) -> bool:
        try:
            with open(self.lock_path, encoding="utf-8") as handle:
                lock = json.load(handle)
            pid = int(lock.get("pid") or 0)
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            try:
                age = max(0.0, self.clock() - os.path.getmtime(self.lock_path))
            except OSError:
                return True
            return age > max(60.0, self.interval_seconds * 2)
        if pid <= 0:
            return True
        if not self._pid_is_alive(pid):
            return True

        live_identity = self._identity_for_live_pid(pid)
        stored_hostname = str(lock.get("hostname") or "").strip()
        live_hostname = str(live_identity.get("hostname") or "").strip()
        if stored_hostname and live_hostname and stored_hostname != live_hostname:
            return True

        stored_start = str(lock.get("processStart") or "").strip()
        live_start = str(live_identity.get("processStart") or "").strip()
        if stored_start and live_start:
            return stored_start != live_start

        # Legacy version-one locks only carried pid and createdAt. A reused PID
        # is stale when the lock predates the currently observable process.
        try:
            created_at = float(lock.get("createdAt"))
            process_started_at = float(live_identity.get("processStartedAt"))
        except (TypeError, ValueError):
            return False
        return created_at + 1.0 < process_started_at

    @staticmethod
    def _pid_is_alive(pid: int) -> bool:
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes

            process_query_limited_information = 0x1000
            still_active = 259
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel32.OpenProcess.restype = wintypes.HANDLE
            kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
            kernel32.GetExitCodeProcess.restype = wintypes.BOOL
            kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
            handle = kernel32.OpenProcess(
                process_query_limited_information, False, pid
            )
            if not handle:
                return False
            try:
                exit_code = wintypes.DWORD()
                return bool(
                    kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
                    and exit_code.value == still_active
                )
            finally:
                kernel32.CloseHandle(handle)
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def start(self) -> bool:
        with self._lifecycle_lock:
            if not self.enabled or self.killed or self._thread:
                return False
            if not self._acquire_instance_lock():
                logger.warning("autonomy_runtime_not_started reason=instance_lock_held")
                return False

            def loop() -> None:
                try:
                    while not self._stop.is_set():
                        self.run_once()
                        self._stop.wait(self.interval_seconds)
                finally:
                    self._release_instance_lock()

            self._thread = threading.Thread(
                target=loop, name="agent-autonomy", daemon=True,
            )
            self._thread.start()
            return True

    def _release_instance_lock(self) -> None:
        if not self._owns_lock:
            self._release_lock_guard()
            return
        try:
            with open(self.lock_path, encoding="utf-8") as handle:
                current_lock = json.load(handle)
            if current_lock.get("instanceId") == self.instance_id:
                os.remove(self.lock_path)
        except FileNotFoundError:
            pass
        except (OSError, ValueError, json.JSONDecodeError):
            logger.warning("autonomy_runtime_lock_release_skipped reason=ownership_unverifiable")
        finally:
            self._owns_lock = False
            self._release_lock_guard()

    def stop(self, timeout: float = 5) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)
        if not self._thread or not self._thread.is_alive():
            self._release_instance_lock()
