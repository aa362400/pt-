from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_trend_task_pins_observations_to_ozon_evidence_and_removes_growth(monkeypatch):
    platform_tasks = load_module("platform_tasks_ozon_trend_task", "web/services/platform_tasks.py")
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)
    fake_common = types.ModuleType("common")
    fake_search = types.ModuleType("common.web_search")
    fake_search.WebSearchError = RuntimeError
    fake_search.resolve_search_provider = lambda: ("serper", "test-key")
    fake_search.search_web = lambda _query, num_results=8: [
        {
            "title": "Ozon kitchen storage collection",
            "url": "https://www.ozon.ru/category/kitchen-storage-14500/",
            "snippet": "Ozon public category result.",
        },
        {
            "title": "Ozon food containers",
            "url": "https://www.ozon.ru/category/food-containers-14600/",
            "snippet": "Ozon public category result.",
        },
    ][:num_results]
    monkeypatch.setitem(sys.modules, "common", fake_common)
    monkeypatch.setitem(sys.modules, "common.web_search", fake_search)
    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: {
            "trends": [
                {"name": "Storage assortment signal", "growth": 99, "seasonality": "Visible in Ozon search results."},
                {"name": "Container assortment signal", "growth": 88, "seasonality": "Visible in Ozon search results."},
            ]
        },
    )
    monkeypatch.setattr(platform_tasks, "_judge_quality", lambda *_args, **_kwargs: {})
    fake_verifier = types.ModuleType("agents.verifier")
    fake_verifier.verify = lambda _task_type, output: {
        "passed": output["trends"][0]["growth"] is None,
        "issues": [],
        "suggestions": [],
    }
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.verifier", fake_verifier)

    result = platform_tasks.run_text_task(
        "trend_analysis",
        {"category": "kitchen storage", "marketplace": "ozon", "timeframe": "90d"},
    )

    assert result["source"] == "ozon_public_search"
    assert result["trends"][0]["growth"] is None
    assert result["trends"][0]["evidence"][0]["url"].startswith("https://www.ozon.ru/")
    assert result["trends"][0]["evidence"][0]["fetchedAt"]
