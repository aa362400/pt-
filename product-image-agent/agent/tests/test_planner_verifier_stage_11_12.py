from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

import requests
import pytest


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_execute_plan_retries_only_failed_step_and_skips_dependents(monkeypatch):
    planner = load_module("planner_stage_test", "agents/planner.py")
    calls = []

    fake_registry = types.ModuleType("agents.tools_registry")
    fake_registry.list_tools = lambda: [
        {"name": "research", "description": "", "input_schema": {}},
        {"name": "listing", "description": "", "input_schema": {}},
    ]

    def call_tool(name: str, **kwargs):
        calls.append(name)
        if name == "research":
            raise RuntimeError("source unavailable")
        return {"ok": True}

    fake_registry.call_tool = call_tool
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.tools_registry", fake_registry)

    result = planner.execute_plan(
        [
            {"id": "research", "step": 1, "tool": "research", "input": {}},
            {
                "id": "listing",
                "step": 2,
                "tool": "listing",
                "dependsOn": ["research"],
                "input": {},
            },
        ]
    )

    assert calls == ["research", "research"]
    assert result["status"] == "failed"
    assert result["failed_steps"] == 1
    assert result["results"][0]["retried"] is True
    assert result["results"][1]["status"] == "skipped"


def test_planner_uses_configured_runtime_model(monkeypatch):
    planner = load_module("planner_runtime_model_test", "agents/planner.py")
    captured = {}

    class Response:
        ok = True
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": '{"steps": []}'}}]}

    fake_requests = types.ModuleType("requests")

    def post(_url, **kwargs):
        captured.update(kwargs["json"])
        return Response()

    fake_requests.post = post
    monkeypatch.setitem(sys.modules, "requests", fake_requests)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")
    monkeypatch.delenv("PLANNER_LLM_MODEL", raising=False)

    planner._call_llm("system", "user")

    assert captured["model"] == "deepseek-chat"


def test_planner_model_override_wins_over_runtime_default(monkeypatch):
    planner = load_module("planner_model_override_test", "agents/planner.py")
    captured = {}

    class Response:
        ok = True
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": '{"steps": []}'}}]}

    fake_requests = types.ModuleType("requests")
    fake_requests.post = lambda _url, **kwargs: (
        captured.update(kwargs["json"]) or Response()
    )
    monkeypatch.setitem(sys.modules, "requests", fake_requests)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")

    planner._call_llm("system", "user", model="deepseek-reasoner")

    assert captured["model"] == "deepseek-reasoner"


def test_run_text_task_mock_mode_does_not_call_llm(monkeypatch):
    platform_tasks = load_module("platform_tasks_mock_test", "web/services/platform_tasks.py")
    monkeypatch.setenv("COMMERCE_AGENT_MOCK", "1")

    def fail_chat_json(*_args, **_kwargs):
        raise AssertionError("mock text tasks must not call the external LLM")

    monkeypatch.setattr(platform_tasks, "_chat_json", fail_chat_json)

    result = platform_tasks.run_text_task(
        "product_research",
        {
            "productName": "Portable Espresso Maker",
            "marketplace": "amazon.com",
            "context": {"agentRunId": "local-run"},
        },
    )

    assert result["mockMode"] is True
    assert result["summary"]
    assert result["competitors"]
    assert result["priceRange"]["min"] < result["priceRange"]["max"]


def test_translates_chinese_ozon_query_without_broadening_product_intent(monkeypatch):
    platform_tasks = load_module(
        "platform_tasks_ozon_query_translation_test", "web/services/platform_tasks.py"
    )
    calls = []

    def fake_chat_json(system, payload, timeout):
        calls.append({"system": system, "payload": payload, "timeout": timeout})
        return {
            "searchQuery": "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440",
            "requiredTerms": [
                "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439",
                "\u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440",
            ],
        }

    monkeypatch.setattr(platform_tasks, "_chat_json", fake_chat_json)

    result = platform_tasks._resolve_ozon_search_intent("\u6c7d\u8f66\u98ce\u6247")

    assert result == {
        "searchQuery": "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440",
        "requiredTerms": [
            "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439",
            "\u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440",
        ],
        "strategy": "translated_query_terms",
    }
    assert calls[0]["payload"] == {
        "marketplace": "Ozon",
        "query": "\u6c7d\u8f66\u98ce\u6247",
    }


def test_extracts_auditable_terms_from_non_cjk_ozon_query_without_llm(monkeypatch):
    platform_tasks = load_module(
        "platform_tasks_original_ozon_query_terms_test", "web/services/platform_tasks.py"
    )

    def fail_chat_json(*_args, **_kwargs):
        raise AssertionError("non-CJK query term extraction must not call the LLM")

    monkeypatch.setattr(platform_tasks, "_chat_json", fail_chat_json)

    result = platform_tasks._resolve_ozon_search_intent(
        "codex-qa-verification-nonexistent-product-20260716"
    )

    assert result == {
        "searchQuery": "codex-qa-verification-nonexistent-product-20260716",
        "requiredTerms": ["codex", "verification", "nonexistent"],
        "strategy": "original_query_terms",
    }


def test_translation_accepts_phrase_terms_from_openai_compatible_models(monkeypatch):
    platform_tasks = load_module(
        "platform_tasks_ozon_phrase_translation_test", "web/services/platform_tasks.py"
    )

    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: {
            "searchQuery": "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0434\u0435\u0440\u0436\u0430\u0442\u0435\u043b\u044c \u0434\u043b\u044f \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430",
            "requiredTerms": [
                "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0434\u0435\u0440\u0436\u0430\u0442\u0435\u043b\u044c",
                "\u0434\u0435\u0440\u0436\u0430\u0442\u0435\u043b\u044c \u0434\u043b\u044f \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430",
            ],
        },
    )

    result = platform_tasks._resolve_ozon_search_intent("\u8f66\u8f7d\u624b\u673a\u652f\u67b6")

    assert result["searchQuery"] == (
        "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0434\u0435\u0440\u0436\u0430\u0442\u0435\u043b\u044c \u0434\u043b\u044f \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430"
    )
    assert result["requiredTerms"] == [
        "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439",
        "\u0434\u0435\u0440\u0436\u0430\u0442\u0435\u043b\u044c",
        "\u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430",
    ]
    assert result["strategy"] == "translated_query_terms"


def test_chat_json_retries_without_json_mode_after_gateway_5xx(monkeypatch):
    platform_tasks = load_module("platform_tasks_json_mode_retry", "web/services/platform_tasks.py")
    monkeypatch.setenv("OPENAI_API_KEY", "unit-test-key")
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    monkeypatch.setenv("OPENAI_API_BASE", "https://gateway.example/v1")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    monkeypatch.setenv("OPENAI_JSON_MODE", "1")
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
        calls.append({"headers": headers, "json": json, "timeout": timeout})
        if len(calls) == 1:
            return FakeResponse(502, {"error": {"message": "unsupported json mode"}})
        return FakeResponse(
            200,
            {"choices": [{"message": {"content": '{"summary":"ok"}'}}]},
        )

    monkeypatch.setattr(requests, "post", fake_post)

    result = platform_tasks._chat_json("Return JSON", {"taskType": "product_research"})

    assert result == {"summary": "ok"}
    assert len(calls) == 2
    assert calls[0]["json"]["response_format"] == {"type": "json_object"}
    assert "response_format" not in calls[1]["json"]


def test_chat_json_reports_quota_exhaustion_without_fake_result(monkeypatch):
    platform_tasks = load_module("platform_tasks_quota_test", "web/services/platform_tasks.py")
    monkeypatch.setenv("OPENAI_API_KEY", "unit-test-key")
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    monkeypatch.setenv("OPENAI_API_BASE", "https://gateway.example/v1")
    calls = []

    class FakeResponse:
        status_code = 403

        def raise_for_status(self):
            error = requests.HTTPError("403 quota exhausted")
            error.response = self
            raise error

        def json(self):
            return {
                "error": {
                    "code": "insufficient_user_quota",
                    "message": "quota exhausted",
                }
            }

    def fake_post(*_args, **_kwargs):
        calls.append(1)
        return FakeResponse()

    monkeypatch.setattr(requests, "post", fake_post)

    try:
        platform_tasks._chat_json("Return JSON", {"taskType": "product_research"})
    except RuntimeError as exc:
        assert "额度不足" in str(exc)
    else:
        raise AssertionError("quota exhaustion must not produce a fake task result")

    assert len(calls) == 1


def test_chat_json_falls_back_to_standard_key_after_premium_quota_exhaustion(
    monkeypatch,
):
    platform_tasks = load_module(
        "platform_tasks_quota_failover_test", "web/services/platform_tasks.py"
    )
    monkeypatch.setenv("OPENAI_API_KEY_PREMIUM", "premium-key")
    monkeypatch.setenv("OPENAI_API_KEY", "standard-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://gateway.example/v1")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
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
                {
                    "error": {
                        "code": "insufficient_user_quota",
                        "message": "premium quota exhausted",
                    }
                },
            )
        return FakeResponse(
            200,
            {"choices": [{"message": {"content": '{"summary":"ok"}'}}]},
        )

    monkeypatch.setattr(requests, "post", fake_post)

    result = platform_tasks._chat_json("Return JSON", {"taskType": "product_research"})

    assert result == {"summary": "ok"}
    assert calls == ["Bearer premium-key", "Bearer standard-key"]


def test_chat_json_uses_standard_key_after_primary_gateway_5xx(monkeypatch):
    platform_tasks = load_module(
        "platform_tasks_gateway_failover_test", "web/services/platform_tasks.py"
    )
    monkeypatch.setenv("OPENAI_API_KEY_PREMIUM", "premium-key")
    monkeypatch.setenv("OPENAI_API_KEY", "standard-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://gateway.example/v1")
    monkeypatch.setenv("LLM_MODEL", "gpt-5.6-sol")
    monkeypatch.setenv("OPENAI_JSON_MODE", "1")
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
        calls.append((headers["Authorization"], "response_format" in json))
        if headers["Authorization"] == "Bearer premium-key":
            return FakeResponse(502, {"error": {"message": "gateway unavailable"}})
        return FakeResponse(
            200,
            {"choices": [{"message": {"content": '{"summary":"ok"}'}}]},
        )

    monkeypatch.setattr(requests, "post", fake_post)

    result = platform_tasks._chat_json("Return JSON", {"taskType": "product_research"})

    assert result == {"summary": "ok"}
    assert calls == [
        ("Bearer premium-key", True),
        ("Bearer premium-key", False),
        ("Bearer standard-key", True),
    ]


def test_chat_json_uses_backup_model_after_primary_model_quota_exhaustion(monkeypatch):
    platform_tasks = load_module(
        "platform_tasks_backup_model_test", "web/services/platform_tasks.py"
    )
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "standard-key")
    monkeypatch.setenv("OPENAI_API_BASE", "https://gateway.example/v1")
    monkeypatch.setenv("LLM_MODEL", "gpt-primary")
    monkeypatch.setenv("LLM_MODEL_BACKUP", "gpt-backup")
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
        calls.append(json["model"])
        if json["model"] == "gpt-primary":
            return FakeResponse(
                429,
                {"error": {"code": "insufficient_quota", "message": "quota exhausted"}},
            )
        return FakeResponse(
            200,
            {"choices": [{"message": {"content": '{"summary":"ok"}'}}]},
        )

    monkeypatch.setattr(requests, "post", fake_post)

    result = platform_tasks._chat_json("Return JSON", {"taskType": "product_research"})

    assert result == {"summary": "ok"}
    assert calls == ["gpt-primary", "gpt-backup"]
    runtime = platform_tasks.llm_runtime_snapshot()
    assert runtime["model"] == "gpt-backup"
    assert runtime["status"] == "degraded"
    assert runtime["fallbackActive"] is True


def test_run_text_task_blocks_bad_output_after_one_retry(monkeypatch):
    platform_tasks = load_module("platform_tasks_stage_test", "web/services/platform_tasks.py")
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)

    bad_listing = {"title": "x", "bulletPoints": [], "keywords": []}
    calls = []

    def fake_chat_json(system: str, payload: dict, timeout: int = 90):
        calls.append(payload)
        return dict(bad_listing)

    fake_verifier = types.ModuleType("agents.verifier")
    fake_verifier.verify = lambda task_type, output: {
        "passed": False,
        "issues": ["missing useful listing content"],
        "suggestions": ["regenerate the listing with title, bullets and keywords"],
    }
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.verifier", fake_verifier)
    monkeypatch.setattr(platform_tasks, "_chat_json", fake_chat_json)
    monkeypatch.setattr(platform_tasks, "_judge_quality", lambda *args, **kwargs: {})

    try:
        platform_tasks.run_text_task(
            "listing_generation",
            {"productName": "Yoga Mat", "keywords": ["yoga"]},
        )
    except ValueError as exc:
        assert "Verifier failed" in str(exc)
        assert "missing useful listing content" in str(exc)
    else:
        raise AssertionError("bad listing output was not blocked")

    assert len(calls) == 2
    assert calls[1]["retry"]["issues"] == ["missing useful listing content"]


def test_product_research_verifier_failure_preserves_evidence_diagnostics(monkeypatch):
    platform_tasks = load_module(
        "platform_tasks_research_verifier_diagnostics_test",
        "web/services/platform_tasks.py",
    )
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)

    evidence = {
        "source": "ozon_public_listings",
        "provider": "serper",
        "fetchedAt": "2026-07-10T10:00:00+00:00",
        "searchQueries": ['site:ozon.ru/product "storage bag"'],
        "items": [
            {
                "id": "ozon-1",
                "title": "Ozon storage bag one",
                "url": "https://www.ozon.ru/product/storage-bag-1/",
                "priceRub": 899,
                "fetchedAt": "2026-07-10T10:00:00+00:00",
            },
            {
                "id": "ozon-2",
                "title": "Ozon storage bag two",
                "url": "https://www.ozon.ru/product/storage-bag-2/",
                "priceRub": 1299,
                "fetchedAt": "2026-07-10T10:00:00+00:00",
            },
        ],
        "competitors": ["Ozon storage bag one", "Ozon storage bag two"],
        "priceRange": {"min": 899, "max": 1299, "currency": "RUB"},
    }

    fake_evidence = types.ModuleType("web.services.research_evidence")
    fake_evidence.derive_ozon_query_terms = lambda query: query.casefold().split()
    fake_evidence.collect_ozon_product_evidence = lambda _query, **_kwargs: evidence
    monkeypatch.setitem(sys.modules, "web.services.research_evidence", fake_evidence)
    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: {"summary": "x"},
    )
    monkeypatch.setattr(platform_tasks, "_judge_quality", lambda *_args, **_kwargs: {})

    fake_verifier = types.ModuleType("agents.verifier")
    fake_verifier.verify = lambda _task_type, _output: {
        "passed": False,
        "issues": ["缺少竞品分析"],
        "suggestions": ["请保留 Ozon 竞品证据"],
    }
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.verifier", fake_verifier)

    with pytest.raises(platform_tasks.VerificationFailure) as caught:
        platform_tasks.run_text_task(
            "product_research",
            {"productName": "storage bag", "marketplace": "ozon"},
        )

    diagnostics = caught.value.to_diagnostics()
    assert diagnostics["code"] == "AGENT_OUTPUT_VERIFICATION_FAILED"
    assert diagnostics["issues"] == ["缺少竞品分析"]
    assert diagnostics["evidence"]["itemCount"] == 2
    assert diagnostics["evidence"]["observedPriceCount"] == 2


def test_trend_analysis_uses_web_search_signals(monkeypatch):
    platform_tasks = load_module("platform_tasks_trend_search_test", "web/services/platform_tasks.py")
    calls = []

    fake_common = types.ModuleType("common")
    fake_web_search = types.ModuleType("common.web_search")
    fake_web_search.resolve_search_provider = lambda: ("serper", "secret")

    def fake_search_web(query: str, num_results: int = 5):
        calls.append((query, num_results))
        return [
            {
                "title": "Amazon Europe home wellness trend report 2026",
                "url": "https://example.com/trend-report",
                "snippet": "Search demand is growing for compact home wellness products.",
                "image_url": None,
            }
        ]

    fake_web_search.search_web = fake_search_web
    monkeypatch.setitem(sys.modules, "common", fake_common)
    monkeypatch.setitem(sys.modules, "common.web_search", fake_web_search)

    signals = platform_tasks._web_search_trend_signals(
        {"category": "欧美市场", "marketplace": "amazon_us", "timeframe": "90d"}
    )

    assert calls
    assert "欧美市场" in calls[0][0]
    assert signals["provider"] == "serper"
    assert signals["results"][0]["url"] == "https://example.com/trend-report"


def test_trend_analysis_falls_back_to_real_web_evidence_when_llm_fails(monkeypatch):
    platform_tasks = load_module("platform_tasks_trend_fallback_test", "web/services/platform_tasks.py")
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)

    with pytest.raises(ValueError, match="Ozon"):
        platform_tasks.run_text_task(
            "trend_analysis",
            {"category": "kitchen storage", "marketplace": "amazon_us", "timeframe": "90d"},
        )
    return

    def fail_chat_json(*_args, **_kwargs):
        raise RuntimeError("502 Server Error: Bad Gateway")

    fake_verifier = types.ModuleType("agents.verifier")
    fake_verifier.verify = lambda task_type, output: {
        "passed": True,
        "issues": [],
        "suggestions": [],
    }
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.verifier", fake_verifier)
    monkeypatch.setattr(platform_tasks, "_chat_json", fail_chat_json)
    monkeypatch.setattr(platform_tasks, "_judge_quality", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        platform_tasks,
        "_web_search_trend_signals",
        lambda input_data, progress=None: {
            "query": "欧美市场 amazon_us ecommerce trend 2026",
            "provider": "serper",
            "results": [
                {
                    "title": "Amazon Europe home wellness trend report 2026",
                    "url": "https://example.com/trend-report",
                    "snippet": "Search demand is growing for compact home wellness products.",
                    "image_url": None,
                },
                {
                    "title": "Holiday gifting demand for personalized desk accessories",
                    "url": "https://example.com/gifting",
                    "snippet": "Retailers report rising demand before Q4 holidays.",
                    "image_url": None,
                },
            ],
        },
    )

    result = platform_tasks.run_text_task(
        "trend_analysis",
        {"category": "欧美市场", "marketplace": "amazon_us", "timeframe": "90d"},
    )

    assert result["source"] == "web_search_fallback"
    assert result["webSignals"]["provider"] == "serper"
    assert result["trends"]
    assert result["trends"][0]["source"] == "web_search_fallback"
    assert result["trends"][0]["evidence"][0]["url"] == "https://example.com/trend-report"
    assert result["trends"][0]["dataPoints"]
    assert result["trends"][0]["dataPointMethod"] == "estimated_from_web_search_rank_and_growth"


def test_trend_analysis_rejects_non_ozon_marketplaces_before_calling_the_llm(monkeypatch):
    platform_tasks = load_module("platform_tasks_ozon_only_trend_test", "web/services/platform_tasks.py")
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)

    with pytest.raises(ValueError, match="Ozon"):
        platform_tasks.run_text_task(
            "trend_analysis",
            {"category": "kitchen storage", "marketplace": "amazon_us", "timeframe": "90d"},
        )
