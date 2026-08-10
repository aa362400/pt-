"""platformdatatext — text ShopMate backend API textstore/text/textdata。

english_textsearch（SERPER/TAVILY），textplatform API english_text，
english_textautomaticenglish_textsearch。

datasource：
- StoreMetricSnapshot — storeenglish_text/orders/text/english_text
- Alert — platformtext（text/text/text）
- TrendInsight — english_text
- Product data
"""

import logging
import os

logger = logging.getLogger("platform_channel")

PLATFORM_API_BASE = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")


def _headers():
    if not AGENT_API_KEY:
        return {}
    return {"X-Api-Key": AGENT_API_KEY, "Content-Type": "application/json"}


def _org_id(org_id: str = "") -> str:
    return (org_id or os.getenv("PLATFORM_ORG_ID", "")).strip()


def _items(data: list | dict | None) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        value = data.get("items") or data.get("data") or []
        return value if isinstance(value, list) else []
    return []


def available(org_id: str = "") -> bool:
    """Check if platform channel is configured and reachable."""
    org = _org_id(org_id)
    if not AGENT_API_KEY or not org:
        return False
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/agent-data/health",
            headers=_headers(),
            params={"orgId": org},
            timeout=5,
        )
        return resp.status_code == 200
    except Exception:
        return False


def get_store_snapshot(workspace_id: str = "", org_id: str = "") -> dict | None:
    """Get latest store health snapshot from platform."""
    org = _org_id(org_id)
    if not org:
        return None
    try:
        import requests
        params = {"orgId": org}
        if workspace_id:
            params["workspaceId"] = workspace_id
        resp = requests.get(
            f"{PLATFORM_API_BASE}/agent-data/store-monitoring/summary",
            headers=_headers(),
            params=params,
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as exc:
        logger.warning("Failed to get store snapshot: %s", exc)
    return None


def get_trend_insights(category: str = "", limit: int = 10, org_id: str = "") -> list:
    """Get trend insights from the platform."""
    org = _org_id(org_id)
    if not org:
        return []
    try:
        import requests
        params = {"limit": limit, "orgId": org}
        if category:
            params["category"] = category
        resp = requests.get(
            f"{PLATFORM_API_BASE}/agent-data/trends",
            headers=_headers(),
            params=params,
            timeout=10,
        )
        if resp.status_code == 200:
            return _items(resp.json())
    except Exception as exc:
        logger.warning("Failed to get trend insights: %s", exc)
    return []


def get_alerts(severity: str = "WARNING", limit: int = 20, org_id: str = "") -> list:
    """Get active alerts from the platform."""
    org = _org_id(org_id)
    if not org:
        return []
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/agent-data/store-monitoring/alerts",
            headers=_headers(),
            params={"orgId": org, "severity": severity, "limit": limit},
            timeout=10,
        )
        if resp.status_code == 200:
            return _items(resp.json())
    except Exception as exc:
        logger.warning("Failed to get alerts: %s", exc)
    return []


def search_platform_products(query: str, limit: int = 10, org_id: str = "") -> list:
    """Search products on the platform."""
    org = _org_id(org_id)
    if not org:
        return []
    try:
        import requests
        resp = requests.get(
            f"{PLATFORM_API_BASE}/agent-data/products",
            headers=_headers(),
            params={"orgId": org, "search": query, "limit": limit},
            timeout=10,
        )
        if resp.status_code == 200:
            return _items(resp.json())
    except Exception as exc:
        logger.warning("Failed to search products: %s", exc)
    return []
