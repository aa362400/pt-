# -*- coding: utf-8 -*-
"""AI 通道预检服务回归测试。"""

from __future__ import annotations

import importlib
import threading

import pytest


@pytest.fixture()
def runtime(monkeypatch):
    module = importlib.import_module("web.services.channel_health")
    module.reset_cache_for_tests()
    monkeypatch.setenv("CHANNEL_HEALTH_CACHE_TTL_SECONDS", "300")
    return module


def test_channel_health_classifies_invalid_image_key_without_leaking_secret(
    runtime, monkeypatch
):
    monkeypatch.setattr(
        runtime,
        "_probe_llm",
        lambda timeout: {
            "status": "available",
            "provider": "openai-compatible",
            "errorCode": None,
        },
    )
    monkeypatch.setattr(
        runtime,
        "_probe_image",
        lambda timeout: (_ for _ in ()).throw(
            runtime.ChannelProbeError(401, "sk-private-value invalid api key")
        ),
    )
    monkeypatch.setattr(
        runtime,
        "_probe_search",
        lambda timeout: {
            "status": "available",
            "provider": "serper",
            "errorCode": None,
        },
    )

    result = runtime.get_channel_health(force=True)

    assert result["image"]["status"] == "unavailable"
    assert result["image"]["errorCode"] == "IMAGE_PROVIDER_INVALID_KEY"
    assert "sk-private-value" not in str(result)


def test_channel_health_classifies_llm_quota_and_search_5xx(runtime, monkeypatch):
    monkeypatch.setattr(
        runtime,
        "_probe_llm",
        lambda timeout: (_ for _ in ()).throw(
            runtime.ChannelProbeError(429, "insufficient_quota")
        ),
    )
    monkeypatch.setattr(
        runtime,
        "_probe_image",
        lambda timeout: {
            "status": "available",
            "provider": "openai-compatible",
            "errorCode": None,
        },
    )
    monkeypatch.setattr(
        runtime,
        "_probe_search",
        lambda timeout: (_ for _ in ()).throw(
            runtime.ChannelProbeError(503, "upstream unavailable")
        ),
    )

    result = runtime.get_channel_health(force=True)

    assert result["llm"]["status"] == "quota_exhausted"
    assert result["llm"]["errorCode"] == "MODEL_PROVIDER_QUOTA_EXHAUSTED"
    assert result["search"]["status"] == "unavailable"
    assert result["search"]["errorCode"] == "SEARCH_PROVIDER_UNAVAILABLE"


def test_channel_health_reuses_five_minute_cache(runtime, monkeypatch):
    calls = {"llm": 0, "image": 0, "search": 0}

    def successful(channel):
        calls[channel] += 1
        return {"status": "available", "provider": channel, "errorCode": None}

    monkeypatch.setattr(runtime, "_probe_llm", lambda timeout: successful("llm"))
    monkeypatch.setattr(runtime, "_probe_image", lambda timeout: successful("image"))
    monkeypatch.setattr(runtime, "_probe_search", lambda timeout: successful("search"))

    first = runtime.get_channel_health(force=True)
    second = runtime.get_channel_health()

    assert second == first
    assert calls == {"llm": 1, "image": 1, "search": 1}


def test_channel_health_runs_independent_probes_concurrently(runtime, monkeypatch):
    barrier = threading.Barrier(3)

    def synchronized_probe(channel):
        barrier.wait(timeout=1)
        return {"status": "available", "provider": channel, "errorCode": None}

    monkeypatch.setattr(runtime, "_probe_llm", lambda timeout: synchronized_probe("llm"))
    monkeypatch.setattr(runtime, "_probe_image", lambda timeout: synchronized_probe("image"))
    monkeypatch.setattr(runtime, "_probe_search", lambda timeout: synchronized_probe("search"))

    result = runtime.get_channel_health(force=True)

    assert result["overall"] == "available"
    assert result["llm"]["status"] == "available"
    assert result["image"]["status"] == "available"
    assert result["search"]["status"] == "available"


def test_channel_health_reports_unconfigured_channels(runtime, monkeypatch):
    monkeypatch.setattr(
        runtime,
        "_probe_llm",
        lambda timeout: {"status": "unconfigured", "provider": None, "errorCode": None},
    )
    monkeypatch.setattr(
        runtime,
        "_probe_image",
        lambda timeout: {"status": "unconfigured", "provider": None, "errorCode": None},
    )
    monkeypatch.setattr(
        runtime,
        "_probe_search",
        lambda timeout: {"status": "unconfigured", "provider": None, "errorCode": None},
    )

    result = runtime.get_channel_health(force=True)

    assert result["overall"] == "unavailable"
    assert result["llm"]["status"] == "unconfigured"
    assert result["image"]["status"] == "unconfigured"
    assert result["search"]["status"] == "unconfigured"


def test_llm_probe_treats_missing_key_as_unconfigured(runtime, monkeypatch):
    llm_runtime = importlib.import_module("web.services.llm_runtime")
    monkeypatch.setattr(
        llm_runtime,
        "probe_if_stale",
        lambda timeout: {
            "status": "unavailable",
            "lastErrorCode": "no_configured_key",
            "model": "configured-model-name",
            "fallbackActive": False,
        },
    )

    result = runtime._probe_llm(1.0)

    assert result["status"] == "unconfigured"
    assert result["provider"] is None
    assert result["errorCode"] is None
