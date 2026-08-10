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


def test_image_plan_llm_falls_back_to_standard_key_after_premium_quota_error(monkeypatch):
    commerce_llm = load_module("commerce_llm_failover_test", "web/services/commerce_llm.py")
    monkeypatch.setenv("COMMERCE_LLM_PLAN", "1")
    monkeypatch.setenv("OPENAI_API_KEY_PREMIUM", "premium-key")
    monkeypatch.setenv("OPENAI_API_KEY", "standard-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://gateway.example/v1")
    calls = []

    class FakeResponse:
        def __init__(self, status_code: int, payload: dict):
            self.status_code = status_code
            self._payload = payload

        def raise_for_status(self):
            if self.status_code >= 400:
                error = requests.HTTPError(f"{self.status_code} gateway failure")
                error.response = self
                raise error

        def json(self):
            return self._payload

    def fake_post(_url, headers, json, timeout):
        calls.append(headers["Authorization"])
        if len(calls) == 1:
            return FakeResponse(
                403,
                {"error": {"code": "insufficient_user_quota", "message": "quota exhausted"}},
            )
        return FakeResponse(
            200,
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"images":[{"id":"img_1","prompt":"A detailed product photography prompt that is long enough to use safely."}]}'
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(requests, "post", fake_post)
    plan = {
        "images": [{"id": "img_1", "title": "Hero", "purpose": "Hero", "prompt": "draft"}],
        "strategy": {},
    }

    applied = commerce_llm.enrich_plan_with_llm(
        plan,
        {"platform": "ozon", "imageCount": 1},
        {"product_name": "Storage box"},
    )

    assert applied is True
    assert calls == ["Bearer premium-key", "Bearer standard-key"]
    assert plan["images"][0]["llmCustomized"] is True
