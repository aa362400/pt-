#!/usr/bin/env python3
import os
import sys
import threading
import time

from flask import Flask

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.routes.core import register_core_routes
from web.services.job_queue import JobQueue
from web.services.runtime_heartbeat import RuntimeHeartbeat
from web.services.supplier_quote_config import load_supplier_quote_config


def test_runtime_heartbeat_reports_active_job_without_payload(tmp_path):
    release = threading.Event()
    queue = JobQueue(str(tmp_path), max_workers=1)
    heartbeat = RuntimeHeartbeat(queue, interval_seconds=0.02)

    def runner(_job_id, _payload, _progress):
        release.wait(timeout=2)
        return {"ok": True}

    try:
        queue.submit(
            "assistant_chat",
            {"secret": "must-not-leak", "context": {"requestId": "request-1"}},
            runner,
        )
        deadline = time.time() + 2
        snapshot = heartbeat.snapshot()
        while time.time() < deadline:
            snapshot = heartbeat.snapshot()
            if snapshot["queue"].get("active_job_count") == 1:
                break
            time.sleep(0.02)

        assert snapshot["ready"] is True
        assert snapshot["queue"]["active_job_count"] == 1
        assert snapshot["queue"]["current_leases"][0]["lease_owned"] is True
        assert "secret" not in str(snapshot)
        assert "request-1" not in str(snapshot)
    finally:
        release.set()
        heartbeat.stop()


def test_health_routes_separate_liveness_from_readiness(tmp_path):
    queue = JobQueue(str(tmp_path), max_workers=1)
    heartbeat = RuntimeHeartbeat(queue, interval_seconds=0.02)
    app = Flask(__name__)
    app.config["SESSIONS"] = {}
    app.config["RUNTIME_HEARTBEAT"] = heartbeat
    app.config["SUPPLIER_QUOTE_CONFIG"] = load_supplier_quote_config({})
    register_core_routes(app, "ozon", lambda: "csrf")

    try:
        client = app.test_client()
        assert client.get("/api/live").status_code == 200
        ready = client.get("/api/ready")
        assert ready.status_code == 200
        assert ready.get_json()["status"] == "ready"
        health = client.get("/api/health").get_json()
        assert health["status"] == "ok"
        assert health["runtime"]["queue"]["state_backend"] == "local"
        assert health["supplierQuote"] == {
            "enabled": False,
            "configured": False,
            "provider": None,
            "destinationCountry": "RU",
            "imageSearch": False,
            "imageSearchConfigured": False,
            "exactQuote": False,
            "exactQuoteStatus": "UNAVAILABLE_NO_CONTRACT",
            "keywordFallback": False,
            "blockingReasons": [
                {
                    "code": "SUPPLIER_QUOTE_DISABLED",
                    "messageZh": "1688 供应商检索未启用，当前不会调用供应商接口。",
                },
                {
                    "code": "SUPPLIER_EXACT_QUOTE_CONTRACT_UNAVAILABLE",
                    "messageZh": "尚未接入可验证的精确报价合同；图片搜索结果和公开 1688 链接不能作为采购报价证据。",
                },
            ],
        }
    finally:
        heartbeat.stop()


def test_enabled_but_stopped_autonomy_is_visible_and_not_ready(tmp_path):
    queue = JobQueue(str(tmp_path), max_workers=1)
    heartbeat = RuntimeHeartbeat(queue, interval_seconds=0.02)

    class StoppedAutonomy:
        @staticmethod
        def status():
            return {
                "enabled": True,
                "running": False,
                "killSwitch": False,
                "instanceId": None,
            }

    app = Flask(__name__)
    app.config["SESSIONS"] = {}
    app.config["RUNTIME_HEARTBEAT"] = heartbeat
    app.config["AUTONOMY_RUNTIME"] = StoppedAutonomy()
    app.config["SUPPLIER_QUOTE_CONFIG"] = load_supplier_quote_config({})
    register_core_routes(app, "ozon", lambda: "csrf")

    try:
        client = app.test_client()
        assert client.get("/api/live").status_code == 200

        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.get_json()["status"] == "degraded"
        assert health.get_json()["autonomy"] == {
            "enabled": True,
            "running": False,
            "killSwitch": False,
            "instanceId": None,
        }

        ready = client.get("/api/ready")
        assert ready.status_code == 503
        assert ready.get_json()["status"] == "not_ready"
        assert ready.get_json()["autonomy"]["running"] is False
    finally:
        heartbeat.stop()
