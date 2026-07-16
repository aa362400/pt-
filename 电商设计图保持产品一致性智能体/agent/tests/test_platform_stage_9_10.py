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


def test_platform_sync_writes_listing_knowledge_under_org_dir(tmp_path):
    sync = load_module("platform_knowledge_sync_test", "common/platform_knowledge_sync.py")
    sync.KNOWLEDGE_DIR = str(tmp_path / "knowledge")
    sync.ORG_KNOWLEDGE_DIR = str(tmp_path / "knowledge" / "orgs")

    seen = []

    def fake_fetch(endpoint: str):
      seen.append(endpoint)
      return {
          "items": [
              {
                  "id": "listing-123456",
                  "title": "Cobalt Hero Yoga Mat",
                  "bullets": ["Non slip surface", "Giftable packaging"],
                  "description": "High scoring listing copy",
                  "seoTags": ["yoga mat", "fitness"],
              }
          ]
      }

    sync._fetch = fake_fetch

    assert sync.sync_listings("org-a") == 1
    assert seen == ["/agent-data/listings?limit=50&status=published&orgId=org-a"]
    assert (tmp_path / "knowledge" / "orgs" / "org-a" / "platform_listing_listing-.md").exists()
    assert not (tmp_path / "knowledge" / "platform_listing_listing-.md").exists()


def test_knowledge_search_only_loads_requested_org_platform_docs(tmp_path):
    kb = load_module("knowledge_base_test", "common/knowledge_base.py")
    kb.KNOWLEDGE_DIR = str(tmp_path / "knowledge")
    kb.ORG_KNOWLEDGE_DIR = str(tmp_path / "knowledge" / "orgs")
    kb.NOTES_PATH = str(tmp_path / "profiles" / "knowledge_notes.json")

    (tmp_path / "knowledge" / "orgs" / "org-a").mkdir(parents=True)
    (tmp_path / "knowledge" / "orgs" / "org-b").mkdir(parents=True)
    (tmp_path / "knowledge" / "orgs" / "org-a" / "case.md").write_text(
        "## Cobalt Hero\n\nUse cobalt hero framing and premium gift tone.",
        encoding="utf-8",
    )
    (tmp_path / "knowledge" / "orgs" / "org-b" / "case.md").write_text(
        "## Amber Value\n\nUse amber value framing and budget tone.",
        encoding="utf-8",
    )

    org_a_hits = kb.search("cobalt hero", org_id="org-a")
    org_b_hits = kb.search("cobalt hero", org_id="org-b")

    assert any("Cobalt Hero" == hit["title"] for hit in org_a_hits)
    assert not any("Cobalt Hero" == hit["title"] for hit in org_b_hits)


def test_platform_channel_uses_agent_data_routes_with_org(monkeypatch):
    channel = load_module("platform_channel_test", "common/platform_channel.py")
    channel.AGENT_API_KEY = "agent-secret"
    channel.PLATFORM_API_BASE = "http://backend:3000/api/v1"

    calls = []

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"items": [{"type": "INVENTORY", "message": "low stock"}]}

    fake_requests = types.SimpleNamespace(
        get=lambda url, headers=None, params=None, timeout=None: (
            calls.append((url, headers, params, timeout)) or Response()
        )
    )
    monkeypatch.setitem(sys.modules, "requests", fake_requests)

    assert channel.get_alerts(org_id="org-a") == [
        {"type": "INVENTORY", "message": "low stock"}
    ]
    url, headers, params, timeout = calls[0]
    assert url == "http://backend:3000/api/v1/agent-data/store-monitoring/alerts"
    assert headers["X-Api-Key"] == "agent-secret"
    assert params["orgId"] == "org-a"
    assert params["severity"] == "WARNING"
    assert timeout == 10
