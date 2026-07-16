#!/usr/bin/env python3
"""Web search — Serper (primary) → Tavily → Bing fallback."""

import os
from typing import Optional

USER_AGENT = "Mozilla/5.0 (compatible; ProductImageAgent/1.0)"


class WebSearchError(Exception):
    """Raised when no search provider is configured or all providers fail."""


def _normalize_result(item: dict) -> dict:
    result = {
        "title": (item.get("title") or "").strip(),
        "url": (item.get("url") or item.get("link") or "").strip(),
        "snippet": (item.get("snippet") or item.get("content") or item.get("description") or "").strip(),
        "image_url": (item.get("image_url") or item.get("imageUrl") or "").strip() or None,
    }
    for key in (
        "provider",
        "result_type",
        "price",
        "delivery",
        "source",
        "productId",
    ):
        value = item.get(key)
        if value is not None:
            result[key] = value.strip() if isinstance(value, str) else value
    return result


def _normalize_shopping_result(item: dict) -> dict:
    return _normalize_result({
        "provider": "serper",
        "result_type": "shopping",
        "title": item.get("title"),
        "url": item.get("link"),
        "snippet": item.get("source") or "",
        "image_url": item.get("imageUrl"),
        "price": item.get("price"),
        "delivery": item.get("delivery"),
        "source": item.get("source"),
        "productId": item.get("productId"),
    })


def _search_serper(query: str, num_results: int, api_key: str) -> list[dict]:
    import requests

    resp = requests.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
        json={"q": query, "num": num_results},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    results = []
    for item in (data.get("shopping") or [])[:num_results]:
        results.append(_normalize_shopping_result(item))
    for item in (data.get("organic") or [])[:num_results]:
        results.append(_normalize_result({
            "title": item.get("title"),
            "url": item.get("link"),
            "snippet": item.get("snippet"),
        }))
    for item in (data.get("images") or [])[: max(0, num_results - len(results))]:
        norm = _normalize_result({
            "title": item.get("title"),
            "url": item.get("link") or item.get("imageUrl"),
            "snippet": item.get("source") or "",
            "image_url": item.get("imageUrl") or item.get("link"),
        })
        if norm["url"]:
            results.append(norm)
    return results[:num_results]


def _search_serper_images(query: str, num_results: int, api_key: str) -> list[dict]:
    import requests

    resp = requests.post(
        "https://google.serper.dev/images",
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
        json={"q": query, "num": num_results},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return [
        _normalize_result(
            {
                "title": item.get("title"),
                "url": item.get("link"),
                "snippet": item.get("source") or "",
                "image_url": item.get("imageUrl"),
            }
        )
        for item in (data.get("images") or [])[:num_results]
        if item.get("link") and item.get("imageUrl")
    ]


def _search_tavily(query: str, num_results: int, api_key: str) -> list[dict]:
    import requests

    resp = requests.post(
        "https://api.tavily.com/search",
        headers={"Content-Type": "application/json"},
        json={
            "api_key": api_key,
            "query": query,
            "max_results": num_results,
            "include_images": True,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    results = []
    for item in (data.get("results") or [])[:num_results]:
        results.append(_normalize_result({
            "title": item.get("title"),
            "url": item.get("url"),
            "snippet": item.get("content"),
        }))
    for img_url in (data.get("images") or [])[: max(0, num_results - len(results))]:
        if isinstance(img_url, str):
            results.append(_normalize_result({
                "title": "Image result",
                "url": img_url,
                "snippet": "",
                "image_url": img_url,
            }))
    return results[:num_results]


def _search_bing(query: str, num_results: int, api_key: str) -> list[dict]:
    import requests

    resp = requests.get(
        "https://api.bing.microsoft.com/v7.0/search",
        headers={"Ocp-Apim-Subscription-Key": api_key},
        params={"q": query, "count": num_results, "mkt": "zh-CN"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    results = []
    for item in (data.get("webPages", {}).get("value") or [])[:num_results]:
        results.append(_normalize_result({
            "title": item.get("name"),
            "url": item.get("url"),
            "snippet": item.get("snippet"),
        }))
    return results[:num_results]


def resolve_search_provider() -> tuple[Optional[str], Optional[str]]:
    """Return (provider_name, api_key) for first configured provider."""
    serper = os.getenv("SERPER_API_KEY", "").strip()
    if serper:
        return "serper", serper
    tavily = os.getenv("TAVILY_API_KEY", "").strip()
    if tavily:
        return "tavily", tavily
    bing = os.getenv("BING_SEARCH_API_KEY", "").strip()
    if bing:
        return "bing", bing
    return None, None


def search_images(query: str, num_results: int = 8) -> list[dict]:
    """Search images with source-page URLs so evidence can be joined safely."""
    query = (query or "").strip()
    if not query:
        return []
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not api_key:
        return []
    try:
        return _search_serper_images(query, num_results, api_key)
    except Exception:
        return []


def search_shopping(query: str, num_results: int = 8) -> list[dict]:
    """Search Google Shopping while preserving structured price provenance."""
    query = (query or "").strip()
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not query or not api_key:
        return []
    try:
        import requests

        resp = requests.post(
            "https://google.serper.dev/shopping",
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json={"q": query, "num": num_results},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return [
            _normalize_shopping_result(item)
            for item in (data.get("shopping") or [])[:num_results]
            if isinstance(item, dict)
        ]
    except Exception:
        return []


def search_web(query: str, num_results: int = 5) -> list[dict]:
    """
    Search the web. Uses Serper → Tavily → Bing based on env keys.

    Returns list of {title, url, snippet, image_url?}.
    Raises WebSearchError if no API key is configured or all providers fail.
    """
    query = (query or "").strip()
    if not query:
        return []

    provider, api_key = resolve_search_provider()
    if not provider:
        raise WebSearchError(
            "未配置搜索 API Key。请在 .env 中设置 SERPER_API_KEY、TAVILY_API_KEY 或 BING_SEARCH_API_KEY 之一。"
        )

    providers = []
    if os.getenv("SERPER_API_KEY", "").strip():
        providers.append(("serper", os.getenv("SERPER_API_KEY", "").strip(), _search_serper))
    if os.getenv("TAVILY_API_KEY", "").strip():
        providers.append(("tavily", os.getenv("TAVILY_API_KEY", "").strip(), _search_tavily))
    if os.getenv("BING_SEARCH_API_KEY", "").strip():
        providers.append(("bing", os.getenv("BING_SEARCH_API_KEY", "").strip(), _search_bing))

    errors = []
    for name, key, fn in providers:
        try:
            results = fn(query, num_results, key)
            if results:
                normalized = []
                for item in results:
                    attributed = dict(item)
                    attributed.setdefault("provider", name)
                    normalized.append(attributed)
                return normalized
        except Exception as e:
            errors.append(f"{name}: {e}")

    if errors:
        raise WebSearchError("搜索失败: " + "; ".join(errors))
    return []
