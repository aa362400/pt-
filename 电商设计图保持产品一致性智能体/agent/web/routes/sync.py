"""知识同步 API — 供平台定时调用来灌数据。

路由：
    POST /api/v1/knowledge/sync  触发全量知识同步
    POST /api/v1/knowledge/sync/incremental  触发增量知识同步

鉴权：复用 AGENT_API_KEY（与 /api/v1/agent/* 相同的 X-Api-Key 机制）
"""

import logging
import os
import secrets

from flask import jsonify, request

logger = logging.getLogger("sync_routes")


def _configured_key() -> str:
    return os.environ.get("AGENT_API_KEY", "").strip()


def _request_key() -> str:
    header = request.headers.get("X-Api-Key", "").strip()
    if header:
        return header
    auth = request.headers.get("Authorization", "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _sync_auth_error():
    configured = _configured_key()
    if not configured:
        return jsonify({"error": "知识同步未启用：请在 agent/.env 配置 AGENT_API_KEY"}), 503
    supplied = _request_key()
    if not supplied or not secrets.compare_digest(supplied, configured):
        return jsonify({"error": "API Key 无效"}), 401
    return None


def register_sync_routes(app):
    """Register knowledge sync API routes on the Flask app."""

    @app.route("/api/v1/knowledge/sync", methods=["POST"])
    def trigger_knowledge_sync():
        err = _sync_auth_error()
        if err:
            return err

        from common.platform_knowledge_sync import run_full_sync

        body = request.get_json(silent=True) or {}
        org_id = body.get("orgId", "")
        results = run_full_sync(org_id)
        return jsonify({"synced": results})

    @app.route("/api/v1/knowledge/sync/incremental", methods=["POST"])
    def trigger_knowledge_incremental_sync():
        err = _sync_auth_error()
        if err:
            return err

        from common.platform_knowledge_sync import run_incremental_sync

        body = request.get_json(silent=True) or {}
        org_id = body.get("orgId", "")
        results = run_incremental_sync(org_id)
        return jsonify({"synced": results})
