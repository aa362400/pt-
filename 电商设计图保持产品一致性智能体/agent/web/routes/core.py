"""Core page and health/metrics routes."""

from __future__ import annotations

import ipaddress

from flask import jsonify, render_template, request

from common.metrics import get_tracker
from common.resilient import get_all_metrics


def _is_local_request() -> bool:
    try:
        return ipaddress.ip_address(request.remote_addr or "").is_loopback
    except ValueError:
        return False


def register_core_routes(app, platform_default: str, issue_csrf_token):
    def autonomy_snapshot() -> dict | None:
        autonomy = app.config.get("AUTONOMY_RUNTIME")
        if autonomy is None:
            return None
        try:
            return autonomy.status()
        except Exception:  # noqa: BLE001 - health must fail closed without leaking details
            return {
                "enabled": True,
                "running": False,
                "killSwitch": False,
                "instanceId": None,
                "error": "autonomy status unavailable",
            }

    def autonomy_ready(snapshot: dict | None) -> bool:
        return not snapshot or not snapshot.get("enabled") or bool(snapshot.get("running"))

    @app.route("/")
    def index():
        return render_template("index.html", platform_default=platform_default)

    @app.route("/api/health")
    def api_health():
        runtime = app.config["RUNTIME_HEARTBEAT"].snapshot()
        autonomy = autonomy_snapshot()
        supplier_quote = app.config.get("SUPPLIER_QUOTE_CONFIG")
        return jsonify({
            "status": (
                "ok"
                if runtime["ready"] and autonomy_ready(autonomy)
                else "degraded"
            ),
            "sessions_active": len(app.config["SESSIONS"]),
            "runtime": runtime,
            "autonomy": autonomy,
            "supplierQuote": (
                supplier_quote.public_status()
                if supplier_quote is not None
                else {
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
                            "messageZh": (
                                "尚未接入可验证的精确报价合同；图片搜索结果和公开 "
                                "1688 链接不能作为采购报价证据。"
                            ),
                        },
                    ],
                }
            ),
        })

    @app.route("/api/live")
    def api_live():
        return jsonify({"status": "ok"})

    @app.route("/api/ready")
    def api_ready():
        runtime = app.config["RUNTIME_HEARTBEAT"].snapshot()
        autonomy = autonomy_snapshot()
        ready = runtime["ready"] and autonomy_ready(autonomy)
        status_code = 200 if ready else 503
        return jsonify({
            "status": "ready" if ready else "not_ready",
            "runtime": runtime,
            "autonomy": autonomy,
        }), status_code

    @app.route("/api/metrics")
    def api_metrics():
        # 内部运行状态（熔断器/限流计数）只允许本机访问，避免暴露内部拓扑
        if not _is_local_request():
            return jsonify({"error": "仅限本机访问"}), 403
        try:
            summary = get_tracker().get_summary()
            resilient = get_all_metrics()
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
        return jsonify({"metrics": summary, "resilient": resilient})

    @app.route("/api/csrf-token")
    def api_csrf_token():
        return jsonify({"csrf_token": issue_csrf_token()})
