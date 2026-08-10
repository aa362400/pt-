import os
import sys


AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.services.autonomy_platform import PlatformAutonomyScanner, ReadOnlyTaskExecutor


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.responses.pop(0)


def test_platform_event_maps_to_read_only_ozon_research_task():
    session = FakeSession(
        [
            FakeResponse(
                {
                    "items": [
                        {
                            "id": "product-research",
                            "backendState": "connected",
                            "overallState": "partial",
                        }
                    ]
                }
            ),
            FakeResponse(
                {
                    "events": [
                        {
                            "id": "event-1",
                            "action": "product.create",
                            "resourceType": "Product",
                            "resourceId": "product-1",
                            "createdAt": "2026-07-12T10:00:00Z",
                        }
                    ]
                }
            ),
            FakeResponse(
                {
                    "items": [
                        {
                            "id": "product-1",
                            "title": "Car fan",
                            "workspaceId": "workspace-1",
                        }
                    ]
                }
            ),
        ]
    )
    scanner = PlatformAutonomyScanner(
        "http://platform/api/v1", "secret", "org-1", session=session
    )

    tasks = scanner.scan()

    assert tasks == [
        {
            "id": "platform-event:event-1",
            "taskType": "product_research",
            "input": {
                "productName": "Car fan",
                "marketplace": "Ozon",
                "workspaceId": "workspace-1",
                "context": {
                    "orgId": "org-1",
                    "sourceEventId": "event-1",
                    "sourceResourceId": "product-1",
                },
            },
            "source": {
                "type": "platform_event",
                "eventId": "event-1",
                "action": "product.create",
                "resourceId": "product-1",
            },
        }
    ]


def test_unknown_product_is_not_turned_into_a_guessed_research_task():
    session = FakeSession(
        [
            FakeResponse(
                {
                    "items": [
                        {
                            "id": "product-research",
                            "backendState": "connected",
                            "overallState": "partial",
                        }
                    ]
                }
            ),
            FakeResponse(
                {
                    "events": [
                        {
                            "id": "event-1",
                            "action": "product.update",
                            "resourceType": "Product",
                            "resourceId": "missing",
                        }
                    ]
                }
            ),
            FakeResponse({"items": []}),
        ]
    )
    scanner = PlatformAutonomyScanner(
        "http://platform/api/v1", "secret", "org-1", session=session
    )

    assert scanner.scan() == []


def test_missing_backend_capability_blocks_autonomy_scan():
    session = FakeSession(
        [
            FakeResponse(
                {
                    "items": [
                        {
                            "id": "product-research",
                            "backendState": "not_connected",
                            "overallState": "missing",
                        }
                    ]
                }
            )
        ]
    )
    scanner = PlatformAutonomyScanner(
        "http://platform/api/v1", "secret", "org-1", session=session
    )

    assert scanner.scan() == []
    assert len(session.calls) == 1


def test_executor_rejects_any_non_read_only_task():
    executor = ReadOnlyTaskExecutor(lambda *_args, **_kwargs: {})

    try:
        executor.execute(
            {"id": "unsafe", "taskType": "listing.publish", "input": {}},
            lambda *_args, **_kwargs: None,
        )
    except ValueError as exc:
        assert "read-only" in str(exc)
    else:
        raise AssertionError("unsafe task was accepted")
