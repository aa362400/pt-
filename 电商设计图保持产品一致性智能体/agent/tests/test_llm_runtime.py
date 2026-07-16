from __future__ import annotations

import importlib.util
from pathlib import Path

import requests


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_standard_key_is_available_when_it_is_the_only_configured_key(monkeypatch):
    runtime = load_module("llm_runtime_standard_only_test", "web/services/llm_runtime.py")
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "standard-key")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6")

    runtime.mark_success("standard")

    snapshot = runtime.snapshot()
    assert snapshot["status"] == "available"
    assert snapshot["keyRole"] == "standard"
    assert snapshot["fallbackActive"] is False


class FakeResponse:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body or {"choices": [{"message": {"content": "OK"}}]}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)


def test_probe_marks_primary_model_available_without_exposing_key(monkeypatch):
    runtime = load_module("llm_runtime_probe_success_test", "web/services/llm_runtime.py")
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "standard-secret")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

    monkeypatch.setattr(requests, "post", fake_post)

    snapshot = runtime.probe_if_stale(force=True, timeout=2)

    assert snapshot["status"] == "available"
    assert snapshot["model"] == "gpt-5.6-sol"
    assert snapshot["keyRole"] == "standard"
    assert snapshot["lastProbeAt"]
    assert len(calls) == 1
    assert calls[0][1]["timeout"] == 2
    assert calls[0][1]["json"]["max_tokens"] == 1
    assert "standard-secret" not in str(snapshot)


def test_probe_uses_fallback_key_and_reports_degraded(monkeypatch):
    runtime = load_module("llm_runtime_probe_fallback_test", "web/services/llm_runtime.py")
    monkeypatch.setenv("OPENAI_API_KEY_PREMIUM", "premium-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "standard-secret")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    responses = [
        FakeResponse(429, {"error": {"code": "insufficient_user_quota"}}),
        FakeResponse(),
    ]
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: responses.pop(0))

    snapshot = runtime.probe_if_stale(force=True)

    assert snapshot["status"] == "degraded"
    assert snapshot["keyRole"] == "standard"
    assert snapshot["fallbackActive"] is True


def test_probe_reports_quota_exhausted_when_every_attempt_has_no_quota(monkeypatch):
    runtime = load_module("llm_runtime_probe_quota_test", "web/services/llm_runtime.py")
    monkeypatch.setenv("OPENAI_API_KEY_PREMIUM", "premium-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "standard-secret")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    quota_response = FakeResponse(429, {"error": {"code": "insufficient_user_quota"}})
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: quota_response)

    snapshot = runtime.probe_if_stale(force=True)

    assert snapshot["status"] == "quota_exhausted"
    assert snapshot["lastErrorCode"] == "insufficient_user_quota"


def test_probe_reports_primary_quota_and_unusable_fallback(monkeypatch):
    runtime = load_module("llm_runtime_probe_mixed_failure_test", "web/services/llm_runtime.py")
    monkeypatch.setenv("OPENAI_API_KEY_PREMIUM", "premium-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "image-only-secret")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    responses = [
        FakeResponse(403, {"error": {"code": "insufficient_user_quota"}}),
        FakeResponse(503, {"error": {"code": "model_not_found"}}),
    ]
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: responses.pop(0))

    snapshot = runtime.probe_if_stale(force=True)

    assert snapshot["status"] == "unavailable"
    assert snapshot["lastErrorCode"] == "primary_quota_exhausted_fallback_unavailable"


def test_probe_cache_avoids_repeated_gateway_calls(monkeypatch):
    runtime = load_module("llm_runtime_probe_cache_test", "web/services/llm_runtime.py")
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "standard-secret")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    monkeypatch.setenv("LLM_HEALTH_PROBE_TTL_SECONDS", "300")
    call_count = 0

    def fake_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return FakeResponse()

    monkeypatch.setattr(requests, "post", fake_post)

    runtime.probe_if_stale(force=True)
    snapshot = runtime.probe_if_stale()

    assert snapshot["status"] == "available"
    assert call_count == 1
