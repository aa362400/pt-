"""Platform observation adapter for the read-only autonomy runtime."""

from __future__ import annotations

import logging
from typing import Callable

import requests


logger = logging.getLogger("agent.autonomy.platform")


def _unwrap(payload):
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    return payload if isinstance(payload, dict) else {}


class PlatformAutonomyScanner:
    """Convert recent platform product events into stable research tasks."""

    SUPPORTED_ACTIONS = frozenset(("product.create", "product.update"))

    def __init__(
        self,
        base_url: str,
        api_key: str,
        org_id: str,
        *,
        session=None,
        timeout: float = 10,
    ) -> None:
        self.base_url = str(base_url or "").rstrip("/")
        self.api_key = str(api_key or "").strip()
        self.org_id = str(org_id or "").strip()
        self.session = session or requests.Session()
        self.timeout = timeout

    def _get(self, path: str, params: dict) -> dict:
        if not self.base_url or not self.api_key or not self.org_id:
            raise RuntimeError("platform autonomy requires base URL, API key, and org ID")
        response = self.session.get(
            f"{self.base_url}{path}",
            headers={"X-Api-Key": self.api_key},
            params={"orgId": self.org_id, **params},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return _unwrap(response.json())

    def scan(self) -> list[dict]:
        capability_payload = self._get("/agent-data/capabilities", {})
        capabilities = capability_payload.get("items")
        if not isinstance(capabilities, list):
            raise RuntimeError("platform autonomy received an invalid capability registry")
        research_capability = next(
            (
                item
                for item in capabilities
                if isinstance(item, dict) and item.get("id") == "product-research"
            ),
            None,
        )
        if not research_capability:
            raise RuntimeError("product research capability is not registered")
        if research_capability.get("backendState") != "connected":
            logger.warning(
                "autonomy_scan_blocked capability=product-research reason=backend_not_connected"
            )
            return []

        event_payload = self._get("/events/pending", {"limit": 50})
        product_payload = self._get("/agent-data/products", {"limit": 50})
        events = event_payload.get("events")
        products = product_payload.get("items")
        if not isinstance(events, list) or not isinstance(products, list):
            raise RuntimeError("platform autonomy received an invalid response")
        products_by_id = {
            str(item.get("id")): item
            for item in products
            if isinstance(item, dict) and item.get("id")
        }
        tasks = []
        for event in events:
            if not isinstance(event, dict):
                continue
            action = str(event.get("action") or "")
            if action not in self.SUPPORTED_ACTIONS:
                continue
            event_id = str(event.get("id") or "").strip()
            resource_id = str(event.get("resourceId") or "").strip()
            product = products_by_id.get(resource_id)
            if not event_id or not product:
                logger.warning(
                    "autonomy_observation_skipped event_id=%s reason=product_not_found",
                    event_id or "unknown",
                )
                continue
            title = str(product.get("title") or "").strip()
            if not title:
                logger.warning(
                    "autonomy_observation_skipped event_id=%s reason=product_title_missing",
                    event_id,
                )
                continue
            workspace_id = str(product.get("workspaceId") or "").strip()
            tasks.append(
                {
                    "id": f"platform-event:{event_id}",
                    "taskType": "product_research",
                    "input": {
                        "productName": title,
                        "marketplace": "Ozon",
                        "workspaceId": workspace_id,
                        "context": {
                            "orgId": self.org_id,
                            "sourceEventId": event_id,
                            "sourceResourceId": resource_id,
                        },
                    },
                    "source": {
                        "type": "platform_event",
                        "eventId": event_id,
                        "action": action,
                        "resourceId": resource_id,
                    },
                }
            )
        return tasks


class ReadOnlyTaskExecutor:
    """Hard allow-list around existing platform task implementations."""

    ALLOWED_TASKS = frozenset(("product_research",))

    def __init__(self, runner: Callable) -> None:
        self.runner = runner

    def execute(self, task: dict, progress) -> dict:
        task_type = str(task.get("taskType") or "")
        if task_type not in self.ALLOWED_TASKS:
            raise ValueError(f"task {task_type!r} is not allowed in read-only autonomy")
        input_data = task.get("input")
        if not isinstance(input_data, dict):
            raise ValueError("autonomy task input must be an object")
        return self.runner(task_type, input_data, progress)
