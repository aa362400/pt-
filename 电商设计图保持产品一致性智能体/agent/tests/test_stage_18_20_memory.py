import json
import types

from agents import planner
from common import working_memory
from services import review_learning


class _Response:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body or {}
        self.text = json.dumps(self._body)

    def json(self):
        return self._body


def test_record_task_syncs_to_durable_agent_memory_endpoint(monkeypatch, tmp_path):
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _Response(201, {"id": "memory-1"})

    import requests

    monkeypatch.setattr(working_memory, "MEMORY_PATH", str(tmp_path / "working.json"))
    monkeypatch.setattr(working_memory, "AGENT_API_KEY", "agent-secret")
    monkeypatch.setattr(requests, "post", fake_post)

    entry = working_memory.record_task(
        "LISTING_OPTIMIZER",
        product_name="Travel Mug",
        status="completed",
        score=91,
        review_status="APPROVED",
        duration_seconds=12.5,
        org_id="org-1",
        metadata={"agentRunId": "run-1", "workspaceId": "workspace-1"},
    )

    assert entry["product_name"] == "Travel Mug"
    assert calls[0]["url"].endswith("/agent-memory/records")
    assert calls[0]["json"]["organizationId"] == "org-1"
    assert calls[0]["json"]["taskType"] == "LISTING_OPTIMIZER"
    assert calls[0]["json"]["productName"] == "Travel Mug"
    assert calls[0]["json"]["status"] == "COMPLETED"


def test_query_prefers_platform_memory_when_agent_key_is_available(monkeypatch):
    def fake_get(url, headers, params, timeout):
        assert url.endswith("/agent-memory/records")
        assert params["organizationId"] == "org-1"
        assert params["productName"] == "Travel Mug"
        return _Response(
            200,
            {
                "items": [{"taskType": "LISTING_OPTIMIZER", "productName": "Travel Mug"}],
                "answer": "2026-07-03 product=Travel Mug task=LISTING_OPTIMIZER",
            },
        )

    import requests

    monkeypatch.setattr(working_memory, "AGENT_API_KEY", "agent-secret")
    monkeypatch.setattr(requests, "get", fake_get)

    result = working_memory.query(product_name="Travel Mug", org_id="org-1")

    assert result[0]["productName"] == "Travel Mug"


def test_review_learning_posts_experience_card_to_platform(monkeypatch):
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "json": json})
        return _Response(201, {"id": "experience-1"})

    import requests

    monkeypatch.setattr(review_learning, "AGENT_API_KEY", "agent-secret")
    monkeypatch.setattr(requests, "post", fake_post)

    ok = review_learning.process_rejection(
        "org-1",
        {
            "id": "review-1",
            "entityType": "IMAGE_GENERATION",
            "score": 42,
            "notes": "White background rejected because the shadow is too heavy.",
        },
    )

    assert ok is True
    assert calls[0]["url"].endswith("/agent-memory/experiences")
    assert calls[0]["json"]["organizationId"] == "org-1"
    assert calls[0]["json"]["sourceReviewTaskId"] == "review-1"
    assert calls[0]["json"]["taskType"] == "IMAGE_CREATIVE"


def test_planner_includes_org_experience_hints_in_decomposition_prompt(monkeypatch):
    captured = {}

    def fake_call_llm(system, user_msg, **kwargs):
        captured["user_msg"] = user_msg
        return json.dumps(
            {
                "steps": [
                    {
                        "id": "listing",
                        "step": 1,
                        "tool": "listing_generation",
                        "input": {"productName": "Travel Mug"},
                    }
                ]
            }
        )

    monkeypatch.setattr(
        planner,
        "fetch_experience_hints",
        lambda context: [
            {
                "category": "style",
                "lesson": "Avoid heavy shadows on white-background images.",
            }
        ],
        raising=False,
    )
    monkeypatch.setattr(planner, "_call_llm", fake_call_llm)

    planner.decompose_goal(
        "prepare listing",
        {"orgId": "org-1", "productName": "Travel Mug"},
    )

    payload = json.loads(captured["user_msg"])
    assert payload["experience_hints"][0]["lesson"] == (
        "Avoid heavy shadows on white-background images."
    )
