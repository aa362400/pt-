"""Persistent Agent job queue with shared idempotency and lease protection."""

from __future__ import annotations

import json
import hashlib
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from web.services.shared_state import get_shared_redis_client, state_namespace
from web.services.trace_context import bind_trace_context


TERMINAL_STATUSES = ("completed", "failed")
circuit_breaker = None


class IdempotencyConflictError(RuntimeError):
    """The same scoped request id was reused with different immutable input."""

    def __init__(self) -> None:
        super().__init__("idempotency key was already used with different input")


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 60) -> None:
        self._failures: dict[str, int] = {}
        self._blacklisted_until: dict[str, float] = {}
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout

    def record_failure(self, key: str) -> None:
        self._failures[key] = self._failures.get(key, 0) + 1
        if self._failures[key] >= self._failure_threshold:
            self._blacklisted_until[key] = time.time() + self._recovery_timeout

    def record_success(self, key: str) -> None:
        self._failures[key] = 0
        self._blacklisted_until.pop(key, None)

    def is_available(self, key: str) -> bool:
        until = self._blacklisted_until.get(key)
        if until is None:
            return True
        if time.time() >= until:
            self._blacklisted_until.pop(key, None)
            return True
        return False


def get_circuit_breaker():
    global circuit_breaker
    if circuit_breaker is None:
        circuit_breaker = CircuitBreaker()
    return circuit_breaker


class JobQueue:
    _IMAGE_TASKS = frozenset(
        ("generate_images", "analyze_product", "supplier_image_search")
    )
    _TEXT_TASKS = frozenset((
        "product_research", "assistant_chat", "listing_generation",
        "keyword_analysis", "trend_analysis", "image_prompt", "automation_step",
        "plan_and_execute", "global_product_discovery",
    ))

    def __init__(
        self,
        jobs_dir: str,
        max_workers: int | None = None,
        image_timeout_seconds: float | None = None,
        redis_client=None,
    ) -> None:
        self.jobs_dir = jobs_dir
        os.makedirs(jobs_dir, exist_ok=True)
        if max_workers is None:
            try:
                max_workers = int(os.environ.get("AGENT_MAX_CONCURRENCY", "2"))
            except ValueError:
                max_workers = 2
        self._max_workers = max(1, max_workers)
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers, thread_name_prefix="agent-job",
        )
        self._lock = threading.RLock()
        self._redis = (
            redis_client if redis_client is not None else get_shared_redis_client()
        )
        self._instance_id = uuid.uuid4().hex
        self._namespace = state_namespace()
        self._job_ttl_seconds = max(
            3600, int(os.environ.get("AGENT_JOB_STATE_TTL_SECONDS", "604800"))
        )
        self._in_flight: dict[str, str] = {}
        self._active_jobs: dict[str, str] = {}
        self._last_activity_at = time.time()
        self._circuit_breaker = get_circuit_breaker()
        self._image_timeout_seconds = (
            image_timeout_seconds
            if image_timeout_seconds is not None
            else float(os.environ.get("AGENT_IMAGE_JOB_TIMEOUT_SECONDS", "900"))
        )
        self._sweep_interrupted()

    def _path(self, job_id: str) -> str:
        return os.path.join(self.jobs_dir, f"{job_id}.json")

    def _job_key(self, job_id: str) -> str:
        return f"{self._namespace}:job:{job_id}"

    def _idempotency_key(self, value: str) -> str:
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        return f"{self._namespace}:job-idempotency:{digest}"

    def _lease_key(self, job_id: str) -> str:
        return f"{self._namespace}:job-lease:{job_id}"

    def _write(self, job: dict) -> None:
        if self._redis is not None:
            self._redis.set(
                self._job_key(job["job_id"]),
                json.dumps(job, ensure_ascii=False, default=str),
                ex=self._job_ttl_seconds,
            )
            return
        path = self._path(job["job_id"])
        temp_path = f"{path}.{uuid.uuid4().hex}.tmp"
        with self._lock:
            with open(temp_path, "w", encoding="utf-8") as handle:
                json.dump(job, handle, ensure_ascii=False, default=str)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, path)

    def get(self, job_id: str) -> dict | None:
        if not job_id or "/" in job_id or "\\" in job_id or ".." in job_id:
            return None
        if self._redis is not None:
            raw = self._redis.get(self._job_key(job_id))
            if raw is None:
                return None
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return None
        with self._lock:
            try:
                with open(self._path(job_id), encoding="utf-8") as handle:
                    return json.load(handle)
            except (OSError, json.JSONDecodeError):
                return None

    def _is_current_generation(self, job_id: str, generation: int) -> bool:
        current = self.get(job_id)
        return bool(
            current
            and current.get("status") not in TERMINAL_STATUSES
            and int(current.get("generation", 0)) == generation
        )

    def _sweep_interrupted(self) -> None:
        if self._redis is not None:
            prefix = f"{self._namespace}:job:"
            for raw_key in self._redis.scan_iter(match=f"{prefix}*"):
                key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
                job = self.get(key[len(prefix):])
                if not job or job.get("status") != "running":
                    continue
                if self._redis.exists(self._lease_key(job["job_id"])):
                    continue
                job["status"] = "failed"
                job["error"] = "taskenglish_text，english_text，english_text requestId english_text"
                job["progress"] = {
                    "stage": "lease_expired",
                    "message": job["error"],
                }
                job["finished_at"] = time.time()
                job["generation"] = int(job.get("generation", 0)) + 1
                self._write(job)
            return
        try:
            names = os.listdir(self.jobs_dir)
        except OSError:
            return
        for name in names:
            if not name.endswith(".json"):
                continue
            job = self.get(name[:-5])
            if job and job.get("status") not in TERMINAL_STATUSES:
                job["status"] = "failed"
                job["error"] = "taskenglish_text，english_text"
                job["finished_at"] = time.time()
                job["generation"] = int(job.get("generation", 0)) + 1
                self._write(job)

    def _find_by_idempotency_key(self, key: str) -> dict | None:
        if self._redis is not None:
            job_id = self._redis.get(self._idempotency_key(key))
            if isinstance(job_id, bytes):
                job_id = job_id.decode()
            return self.get(str(job_id)) if job_id else None
        try:
            names = os.listdir(self.jobs_dir)
        except OSError:
            return None
        matches = []
        for name in names:
            if not name.endswith(".json"):
                continue
            job = self.get(name[:-5])
            if job and job.get("idempotency_key") == key:
                matches.append(job)
        if not matches:
            return None
        return max(
            matches,
            key=lambda job: (
                int(job.get("attempt") or 1),
                float(job.get("created_at") or 0),
            ),
        )

    @staticmethod
    def _assert_idempotent_match(
        existing: dict,
        *,
        task_type: str,
        input_sha256: str,
    ) -> None:
        if existing.get("task_type") != task_type:
            raise IdempotencyConflictError()
        if input_sha256 and existing.get("input_sha256") != input_sha256:
            raise IdempotencyConflictError()

    def _clear_in_flight(self, job_id: str) -> None:
        with self._lock:
            for key, value in list(self._in_flight.items()):
                if value == job_id:
                    del self._in_flight[key]

    def health_snapshot(self) -> dict:
        """Return dependency and lease state without exposing business payloads."""
        with self._lock:
            active_jobs = list(self._active_jobs.items())
            last_activity_at = self._last_activity_at

        backend_available = True
        if self._redis is not None:
            try:
                backend_available = bool(self._redis.ping())
            except Exception:  # noqa: BLE001
                backend_available = False

        leases = []
        for job_id, task_type in active_jobs:
            lease_owned = True
            if self._redis is not None and backend_available:
                try:
                    owner = self._redis.get(self._lease_key(job_id))
                    if isinstance(owner, bytes):
                        owner = owner.decode()
                    lease_owned = owner == self._instance_id
                except Exception:  # noqa: BLE001
                    lease_owned = False
            leases.append({
                "job_ref": hashlib.sha256(job_id.encode("utf-8")).hexdigest()[:12],
                "task_type": task_type,
                "lease_owned": lease_owned,
            })

        return {
            "state_backend": "redis" if self._redis is not None else "local",
            "state_backend_available": backend_available,
            "worker_capacity": self._max_workers,
            "active_job_count": len(active_jobs),
            "current_leases": leases,
            "last_activity_at": last_activity_at,
        }

    def submit(self, task_type: str, payload: dict, runner, idempotency_key: str = "") -> dict:
        idempotency_key = idempotency_key or (
            (payload.get("context") or {}).get("requestId", "")
            or (payload.get("context") or {}).get("agentRunId", "")
            or ""
        )
        input_sha256 = str(payload.get("input_sha256") or "").strip().lower()
        if input_sha256 and (
            len(input_sha256) != 64
            or any(character not in "0123456789abcdef" for character in input_sha256)
        ):
            raise ValueError("input_sha256 must be a lowercase SHA-256 digest")
        with self._lock:
            existing = None
            if idempotency_key:
                existing_job_id = self._in_flight.get(idempotency_key)
                existing = self.get(existing_job_id) if existing_job_id else None
                if not existing:
                    existing = self._find_by_idempotency_key(idempotency_key)
                if existing:
                    self._assert_idempotent_match(
                        existing,
                        task_type=task_type,
                        input_sha256=input_sha256,
                    )
                    if existing.get("status") != "failed":
                        return existing

            job_id = uuid.uuid4().hex
            previous_job_id = ""
            attempt = 1
            root_job_id = job_id
            if existing and existing.get("status") == "failed":
                previous_job_id = str(existing["job_id"])
                attempt = int(existing.get("attempt") or 1) + 1
                root_job_id = str(existing.get("root_job_id") or previous_job_id)
                input_sha256 = input_sha256 or str(
                    existing.get("input_sha256") or ""
                )
            job = {
                "job_id": job_id,
                "task_type": task_type,
                "status": "queued",
                "progress": {"stage": "queued", "message": "task queued"},
                "result": None,
                "error": "",
                "context": (payload.get("context") or {}) if isinstance(payload, dict) else {},
                "created_at": time.time(),
                "started_at": None,
                "finished_at": None,
                "generation": 1,
                "attempt": attempt,
                "root_job_id": root_job_id,
            }
            if previous_job_id:
                job["previous_job_id"] = previous_job_id
            session_id = str(payload.get("session_id") or "").strip()
            if session_id:
                job["session_id"] = session_id
            if input_sha256:
                job["input_sha256"] = input_sha256
            if idempotency_key:
                job["idempotency_key"] = idempotency_key
                if self._redis is None:
                    self._in_flight[idempotency_key] = job["job_id"]
            if self._redis is not None and idempotency_key:
                created, selected_job_id = self._create_shared_job(
                    job,
                    idempotency_key,
                    replace_job_id=previous_job_id,
                )
                if not created:
                    existing = self.get(selected_job_id)
                    if existing:
                        self._assert_idempotent_match(
                            existing,
                            task_type=task_type,
                            input_sha256=input_sha256,
                        )
                        return existing
                    raise RuntimeError(
                        "Agent shared idempotency record points to a missing job"
                    )
            else:
                self._write(job)
            self._last_activity_at = time.time()

        self._executor.submit(self._run, job["job_id"], payload, runner)
        return job

    def _create_shared_job(
        self,
        job: dict,
        idempotency_key: str,
        *,
        replace_job_id: str = "",
    ) -> tuple[bool, str]:
        result = self._redis.eval(
            """
            local existing = redis.call('GET', KEYS[1])
            if existing and (ARGV[4] == '' or existing ~= ARGV[4]) then
              return {0, existing}
            end
            redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
            redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
            return {1, ARGV[1]}
            """,
            2,
            self._idempotency_key(idempotency_key),
            self._job_key(job["job_id"]),
            job["job_id"],
            json.dumps(job, ensure_ascii=False, default=str),
            self._job_ttl_seconds,
            replace_job_id,
        )
        created = int(result[0]) == 1
        selected = result[1].decode() if isinstance(result[1], bytes) else str(result[1])
        return created, selected

    def _acquire_lease(self, job_id: str) -> bool:
        if self._redis is None:
            return True
        ttl = max(1200, int(self._image_timeout_seconds) + 60)
        return bool(
            self._redis.set(
                self._lease_key(job_id), self._instance_id, nx=True, ex=ttl
            )
        )

    def _renew_lease(self, job_id: str) -> None:
        if self._redis is None:
            return
        if self._redis.get(self._lease_key(job_id)) == self._instance_id:
            ttl = max(1200, int(self._image_timeout_seconds) + 60)
            self._redis.expire(self._lease_key(job_id), ttl)

    def _release_lease(self, job_id: str) -> None:
        if self._redis is None:
            return
        self._redis.eval(
            """
            if redis.call('GET', KEYS[1]) == ARGV[1] then
              return redis.call('DEL', KEYS[1])
            end
            return 0
            """,
            1,
            self._lease_key(job_id),
            self._instance_id,
        )

    def _notify(self, payload: dict, status: str, stage: str, message: str) -> None:
        agent_run_id = str((payload.get("context") or {}).get("agentRunId", "") or "")
        organization_id = str((payload.get("context") or {}).get("orgId", "") or "")
        if not agent_run_id or not organization_id:
            return
        try:
            from web.services import platform_webhook

            with bind_trace_context(payload.get("context") or {}):
                platform_webhook.notify_run_event(
                    agent_run_id, organization_id, status, stage, message
                )
        except Exception:
            # Delivery failures are observable at the caller, but cannot change
            # the durable task result after the business action completed.
            return

    def _expire_generation(self, job_id: str, generation: int, payload: dict) -> None:
        with self._lock:
            job = self.get(job_id)
            if not job or not self._is_current_generation(job_id, generation):
                return
            job["status"] = "failed"
            job["error"] = f"task timeout after {self._image_timeout_seconds} seconds"
            job["progress"] = {"stage": "timeout", "message": job["error"]}
            job["finished_at"] = time.time()
            job["generation"] = generation + 1
            self._write(job)
        self._notify(payload, "failed", "timeout", job["error"])
        self._clear_in_flight(job_id)

    def _run(self, job_id: str, payload: dict, runner) -> None:
        with bind_trace_context(payload.get("context") or {}):
            self._run_bound(job_id, payload, runner)

    def _run_bound(self, job_id: str, payload: dict, runner) -> None:
        if not self._acquire_lease(job_id):
            return
        job = self.get(job_id)
        if not job:
            self._release_lease(job_id)
            return
        generation = int(job.get("generation", 0))
        with self._lock:
            self._active_jobs[job_id] = str(job.get("task_type", "unknown"))
            self._last_activity_at = time.time()
        try:
            if job.get("task_type") not in self._IMAGE_TASKS:
                self._execute(job_id, payload, runner, generation)
                return

            timer = threading.Timer(
                self._image_timeout_seconds,
                self._expire_generation,
                args=(job_id, generation, payload),
            )
            timer.daemon = True
            timer.start()
            try:
                self._execute(job_id, payload, runner, generation)
            finally:
                timer.cancel()
        finally:
            with self._lock:
                self._active_jobs.pop(job_id, None)
                self._last_activity_at = time.time()
            self._release_lease(job_id)

    def _execute(self, job_id: str, payload: dict, runner, generation: int) -> None:
        with self._lock:
            job = self.get(job_id)
            if not job or not self._is_current_generation(job_id, generation):
                return
            job["status"] = "running"
            job["started_at"] = time.time()
            job["progress"] = {"stage": "starting", "message": "task started"}
            self._write(job)
            self._renew_lease(job_id)
        self._notify(payload, "running", "starting", "task started")

        def progress(stage: str, message: str, **extra) -> None:
            with self._lock:
                current = self.get(job_id)
                if not current or not self._is_current_generation(job_id, generation):
                    return
                current["progress"] = {"stage": stage, "message": message, **extra}
                self._write(current)
                self._renew_lease(job_id)
            self._notify(payload, "running", stage, message)

        try:
            result = runner(job_id, payload, progress)
            with self._lock:
                job = self.get(job_id)
                if not job or not self._is_current_generation(job_id, generation):
                    return
                job["status"] = "completed"
                job["result"] = result
                job["progress"] = {"stage": "done", "message": "task completed"}
                job["finished_at"] = time.time()
                self._write(job)
            self._notify(payload, "completed", "done", "task completed")
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                job = self.get(job_id)
                if not job or not self._is_current_generation(job_id, generation):
                    return
                job["status"] = "failed"
                job["error"] = f"{type(exc).__name__}: {exc}"
                diagnostics = getattr(exc, "to_diagnostics", None)
                if callable(diagnostics):
                    job["diagnostics"] = diagnostics()
                job["finished_at"] = time.time()
                self._write(job)
            self._notify(payload, "failed", "error", job["error"])
        finally:
            self._clear_in_flight(job_id)
