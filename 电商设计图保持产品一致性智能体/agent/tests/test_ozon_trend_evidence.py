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


def test_collects_ozon_only_trend_evidence_without_inventing_metrics(monkeypatch):
    fake_common = types.ModuleType("common")
    fake_search = types.ModuleType("common.web_search")
    fake_search.WebSearchError = RuntimeError
    fake_search.resolve_search_provider = lambda: ("serper", "test-key")
    fake_search.search_web = lambda _query, num_results=5: [
        {
            "title": "Ozon kitchen storage collection",
            "url": "https://www.ozon.ru/category/kitchen-storage-14500/",
            "snippet": "Public Ozon category result for storage products.",
        },
        {
            "title": "Ozon food containers",
            "url": "https://www.ozon.ru/category/food-containers-14600/",
            "snippet": "Public Ozon category result for food containers.",
        },
        {
            "title": "Unverified trend report",
            "url": "https://example.com/trend",
            "snippet": "Growth 99%",
        },
    ][:num_results]
    monkeypatch.setitem(sys.modules, "common", fake_common)
    monkeypatch.setitem(sys.modules, "common.web_search", fake_search)
    evidence = load_module("ozon_trend_evidence_test", "web/services/research_evidence.py")

    result = evidence.collect_ozon_trend_evidence("kitchen storage")

    assert result["source"] == "ozon_public_search"
    assert result["provider"] == "serper"
    assert result["fetchedAt"]
    assert len(result["items"]) == 2
    assert all("ozon.ru" in item["url"] for item in result["items"])
    assert all("growth" not in item for item in result["items"])
