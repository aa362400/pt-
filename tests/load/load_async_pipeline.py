#!/usr/bin/env python3
"""Guarded end-to-end Agent run load driver for local or approved staging use."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import asdict, dataclass


TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}


@dataclass
class Sample:
    request_id: str
    run_id: str | None
    status: str
    create_ms: float
    total_ms: float
    polls: int
    error: str | None = None


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * fraction) - 1))
    return round(ordered[index], 2)


def is_loopback(base_url: str) -> bool:
    host = (urllib.parse.urlparse(base_url).hostname or "").lower()
    return host in {"127.0.0.1", "localhost", "::1"}


def request_json(method: str, url: str, token: str, payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Load-Test": "shopmate-async-pipeline",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"message": raw[:500]}
        return error.code, parsed


def run_one(index: int, args: argparse.Namespace) -> Sample:
    request_id = f"async-load-{index}-{uuid.uuid4().hex[:12]}"
    started = time.perf_counter()
    create_started = time.perf_counter()
    status, body = request_json(
        "POST",
        f"{args.base_url}/api/v1/agent-runs",
        args.token,
        {
            "agentType": args.agent_type,
            "clientRequestId": request_id,
            "input": {
                "prompt": "Async pipeline load test. Return a short health acknowledgement only.",
                "loadTest": True,
                "requestId": request_id,
            },
        },
    )
    create_ms = (time.perf_counter() - create_started) * 1000
    if status not in {200, 201, 202}:
        return Sample(request_id, None, f"CREATE_HTTP_{status}", create_ms, create_ms, 0, str(body)[:500])

    run_id = str(body.get("id") or body.get("runId") or "") or None
    if not run_id:
        return Sample(request_id, None, "CREATE_INVALID_RESPONSE", create_ms, create_ms, 0, "missing run id")

    polls = 0
    deadline = time.monotonic() + args.timeout_seconds
    last_status = "CREATED"
    while time.monotonic() < deadline:
        if args.inject_latency_ms:
            time.sleep(args.inject_latency_ms / 1000)
        time.sleep(args.poll_interval)
        polls += 1
        poll_status, timeline = request_json(
            "GET",
            f"{args.base_url}/api/v1/agent-runs/{run_id}/timeline",
            args.token,
        )
        if poll_status == 429:
            time.sleep(min(args.poll_interval * 2 ** min(polls, 4), 10))
            continue
        if poll_status != 200:
            return Sample(
                request_id,
                run_id,
                f"POLL_HTTP_{poll_status}",
                create_ms,
                (time.perf_counter() - started) * 1000,
                polls,
                str(timeline)[:500],
            )
        last_status = str(
            timeline.get("lifecycleStatus")
            or timeline.get("status")
            or (timeline.get("run") or {}).get("lifecycleStatus")
            or "UNKNOWN"
        ).upper()
        if last_status in TERMINAL:
            return Sample(
                request_id,
                run_id,
                last_status,
                create_ms,
                (time.perf_counter() - started) * 1000,
                polls,
            )

    return Sample(
        request_id,
        run_id,
        "TIMEOUT",
        create_ms,
        (time.perf_counter() - started) * 1000,
        polls,
        f"last status: {last_status}",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("BASE_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--token", default=os.getenv("AUTH_TOKEN", ""))
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--timeout-seconds", type=float, default=180)
    parser.add_argument("--poll-interval", type=float, default=1.0)
    parser.add_argument("--inject-latency-ms", type=int, default=0)
    parser.add_argument("--agent-type", default=os.getenv("LOAD_TEST_AGENT_TYPE", "GENERAL_ASSISTANT"))
    parser.add_argument("--report", default="")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.base_url = args.base_url.rstrip("/")
    if args.runs < 1 or args.concurrency < 1:
        raise SystemExit("--runs and --concurrency must be positive")
    if args.dry_run:
        print(json.dumps({
            "mode": "dry-run",
            "baseUrl": args.base_url,
            "runs": args.runs,
            "concurrency": args.concurrency,
            "remote": not is_loopback(args.base_url),
            "writesEnabled": os.getenv("LOAD_TEST_ALLOW_WRITES") == "1",
            "modelCostEnabled": os.getenv("LOAD_TEST_ALLOW_MODEL_COST") == "1",
        }, ensure_ascii=False, indent=2))
        return 0

    if os.getenv("LOAD_TEST_ALLOW_WRITES") != "1":
        raise SystemExit("Refusing to create runs. Set LOAD_TEST_ALLOW_WRITES=1 explicitly.")
    if os.getenv("LOAD_TEST_ALLOW_MODEL_COST") != "1":
        raise SystemExit("Agent runs may consume paid quota. Set LOAD_TEST_ALLOW_MODEL_COST=1 explicitly.")
    if not args.token:
        raise SystemExit("AUTH_TOKEN is required for a dedicated load-test account.")
    if not is_loopback(args.base_url) and os.getenv("LOAD_TEST_ALLOW_REMOTE") != "1":
        raise SystemExit("Remote targets are blocked unless LOAD_TEST_ALLOW_REMOTE=1.")

    ready_status, ready = request_json("GET", f"{args.base_url}/api/v1/ready", args.token)
    if ready_status != 200:
        raise SystemExit(f"Readiness preflight failed: HTTP {ready_status} {ready}")

    wall_started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        samples = list(executor.map(lambda index: run_one(index, args), range(args.runs)))
    wall_ms = (time.perf_counter() - wall_started) * 1000

    completed = [sample for sample in samples if sample.status == "COMPLETED"]
    failed = [sample for sample in samples if sample.status != "COMPLETED"]
    create_times = [sample.create_ms for sample in samples]
    total_times = [sample.total_ms for sample in samples]
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target": args.base_url,
        "runs": len(samples),
        "completed": len(completed),
        "failed": len(failed),
        "successRate": round(len(completed) / len(samples), 4),
        "wallTimeMs": round(wall_ms, 2),
        "throughputPerSecond": round(len(samples) / max(wall_ms / 1000, 0.001), 3),
        "createMs": {
            "mean": round(statistics.fmean(create_times), 2),
            "p50": percentile(create_times, 0.50),
            "p95": percentile(create_times, 0.95),
        },
        "completionMs": {
            "mean": round(statistics.fmean(total_times), 2),
            "p50": percentile(total_times, 0.50),
            "p95": percentile(total_times, 0.95),
        },
        "statusCounts": {
            status: sum(1 for sample in samples if sample.status == status)
            for status in sorted({sample.status for sample in samples})
        },
        "samples": [asdict(sample) for sample in samples],
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
