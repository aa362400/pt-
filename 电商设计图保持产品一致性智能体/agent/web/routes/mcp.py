"""Authenticated HTTP transport for the local commerce MCP server."""

from __future__ import annotations

from flask import jsonify, request

from web.routes.integration import _auth_error


def register_mcp_routes(app):
    @app.post("/api/mcp/jsonrpc")
    def mcp_jsonrpc():
        auth_error = _auth_error()
        if auth_error:
            return auth_error
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "JSON-RPC request must be an object"}), 400

        from mcp_server import handle

        response = handle(payload)
        if response is None:
            return "", 204
        return jsonify(response)

