"""Collect verifiable Ozon listing evidence for product-research tasks."""

from __future__ import annotations

import json
import re
from contextvars import ContextVar
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urlparse


_PRICE_RUB_RE = re.compile(
    r"(?<!\d)(\d{1,3}(?:[\s\u00a0.,]\d{3})*|\d+)\s*(?:\u20bd|\u0440\u0443\u0431(?:\.|\u043b\u0435\u0439|\u043b\u044f|\u043b\u044c)?|rub)",
    re.IGNORECASE,
)
_MIN_EVIDENCE_ITEMS = 2
_MIN_CREDIBLE_PRICE_RUB = 10
_PAGE_FETCH_TIMEOUT_SECONDS = 8
_MAX_PAGE_BYTES = 2_000_000
_META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_HTML_ATTRIBUTE_RE = re.compile(
    r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", re.IGNORECASE | re.DOTALL
)
_JSON_LD_SCRIPT_RE = re.compile(
    r"<script[^>]+type\s*=\s*(['\"])application/ld\+json\1[^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)
_NON_PRODUCT_PRICE_CONTEXT_RE = re.compile(
    r"(?:\b(?:salary|job|hiring|vacancy|staff)\b|"
    r"\u0437\u0430\u0440\u043f\u043b\u0430\u0442\w*|"
    r"\u0432\u0430\u043a\u0430\u043d\u0441\w*|"
    r"\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\w*)",
    re.IGNORECASE,
)
_LISTING_WORD_RE = re.compile(r"[A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451]{3,}")
_LISTING_STOP_WORDS = {
    "ozon",
    "price",
    "product",
    "sale",
    "\u0430\u0440\u0442",
    "\u0446\u0435\u043d\u0430",
    "\u043a\u0443\u043f\u0438\u0442\u044c",
    "\u0442\u043e\u0432\u0430\u0440",
    "\u0440\u0443\u0431",
    "\u0440\u0443\u0431\u043b\u0435\u0439",
    "\u0440\u0443\u0431\u043b\u044c",
}
_OZON_PAGE_CACHE: ContextVar[dict[str, str | None] | None] = ContextVar(
    "ozon_page_cache",
    default=None,
)


class ResearchEvidenceError(ValueError):
    """Raised when a report would otherwise be based on unverifiable data."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "RESEARCH_EVIDENCE_UNVERIFIABLE",
        diagnostics: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self._diagnostics = diagnostics or {}

    def to_diagnostics(self) -> dict:
        return {"code": self.code, **self._diagnostics}


def collect_ozon_product_evidence(
    product_name: str,
    *,
    search_query: str | None = None,
    required_terms: list[str] | None = None,
) -> dict:
    """Collect one isolated round of Ozon product evidence.

    A fresh page cache is scoped to this call so price and image parsing can
    share one response without carrying HTML into a later research round.
    """
    cache_token = _OZON_PAGE_CACHE.set({})
    try:
        return _collect_ozon_product_evidence(
            product_name,
            search_query=search_query,
            required_terms=required_terms,
        )
    finally:
        _OZON_PAGE_CACHE.reset(cache_token)


def _collect_ozon_product_evidence(
    product_name: str,
    *,
    search_query: str | None = None,
    required_terms: list[str] | None = None,
) -> dict:
    """Return Ozon product-listing evidence with observed RUB prices.

    The function intentionally rejects generic search results, missing Ozon URLs,
    and missing price observations. A research task must not manufacture a price
    range or competitor list when the source layer cannot prove it.
    """
    query_name = str(product_name or "").strip()
    if not query_name:
        raise ResearchEvidenceError(
            "product name is required for Ozon evidence",
            code="RESEARCH_QUERY_REQUIRED",
        )
    resolved_search_query = str(search_query or query_name).strip()
    if not resolved_search_query:
        raise ResearchEvidenceError(
            "resolved Ozon search query is required",
            code="RESEARCH_QUERY_REQUIRED",
        )

    from common.web_search import (
        WebSearchError,
        resolve_search_provider,
        search_images,
        search_web,
    )

    provider, _ = resolve_search_provider()
    if not provider:
        raise ResearchEvidenceError(
            "Ozon evidence requires a configured web search provider",
            code="RESEARCH_SEARCH_PROVIDER_UNAVAILABLE",
            diagnostics={"query": query_name[:160]},
        )

    product_query = f'site:ozon.ru/product "{resolved_search_query}"'
    search_queries = [product_query]
    try:
        raw_results = search_web(product_query, num_results=8)
    except WebSearchError as exc:
        raise ResearchEvidenceError(
            f"Ozon evidence search failed: {exc}",
            code="RESEARCH_SEARCH_FAILED",
            diagnostics={
                "query": query_name[:160],
                "provider": provider,
                "searchQueries": search_queries,
            },
        ) from exc

    if _count_unique_ozon_urls(raw_results) < _MIN_EVIDENCE_ITEMS:
        broader_query = f'site:ozon.ru "{resolved_search_query}"'
        search_queries.append(broader_query)
        try:
            broader_results = search_web(broader_query, num_results=8)
        except WebSearchError:
            broader_results = []
        raw_results = _merge_unique_results(raw_results, broader_results)

    fetched_at = datetime.now(timezone.utc).isoformat()
    match_terms = _normalize_required_terms(required_terms)
    relevance_strategy = "translated_query_terms" if match_terms else "original_query_terms"
    if not match_terms:
        match_terms = derive_ozon_query_terms(resolved_search_query)
    if not match_terms:
        raise ResearchEvidenceError(
            "Ozon evidence could not establish verifiable product terms from the original query",
            code="RESEARCH_QUERY_TERMS_UNRESOLVED",
            diagnostics=_product_evidence_diagnostics(
                query_name,
                provider,
                search_queries,
                [],
                [],
                relevance_strategy,
                resolved_search_query,
            ),
        )
    items = _collect_relevant_ozon_items(raw_results, fetched_at, match_terms)

    if len(items) < _MIN_EVIDENCE_ITEMS or _count_observed_prices(items) < _MIN_EVIDENCE_ITEMS:
        price_query = _build_price_constrained_query(resolved_search_query, match_terms)
        if price_query not in search_queries:
            search_queries.append(price_query)
            try:
                price_results = search_web(price_query, num_results=8)
            except WebSearchError:
                price_results = []
            raw_results = _merge_unique_results(raw_results, price_results)
            items = _collect_relevant_ozon_items(raw_results, fetched_at, match_terms)

    image_queries = [f'site:ozon.ru/product "{resolved_search_query}"']
    if any(not item.get("imageUrl") for item in items):
        items = _enrich_ozon_listing_images(
            items,
            search_images(image_queries[0], num_results=12),
        )
    for item in items:
        if item.get("imageUrl"):
            continue
        product_id = _ozon_product_id(str(item.get("url") or ""))
        if not product_id:
            continue
        product_image_query = f"site:ozon.ru/product {product_id}"
        image_queries.append(product_image_query)
        _enrich_ozon_listing_images(
            [item],
            search_images(product_image_query, num_results=5),
        )

    if len(items) < _MIN_EVIDENCE_ITEMS:
        raise ResearchEvidenceError(
            "Ozon evidence requires at least two public Ozon listing sources",
            code="RESEARCH_EVIDENCE_SOURCES_INSUFFICIENT",
            diagnostics=_product_evidence_diagnostics(
                query_name,
                provider,
                search_queries,
                items,
                match_terms,
                relevance_strategy,
                resolved_search_query,
            ),
        )

    prices = [item["priceRub"] for item in items if item.get("priceRub") is not None]
    if len(prices) < _MIN_EVIDENCE_ITEMS:
        raise ResearchEvidenceError(
            "Ozon evidence requires observed RUB prices from at least two listings",
            code="RESEARCH_EVIDENCE_PRICES_INSUFFICIENT",
            diagnostics=_product_evidence_diagnostics(
                query_name,
                provider,
                search_queries,
                items,
                match_terms,
                relevance_strategy,
                resolved_search_query,
            ),
        )

    return {
        "source": "ozon_public_listings",
        "provider": provider,
        "query": query_name,
        "searchQuery": resolved_search_query,
        "searchQueries": search_queries,
        "imageSearchQueries": image_queries,
        "fetchedAt": fetched_at,
        "items": items,
        "relevance": {
            "strategy": relevance_strategy,
            "matchTerms": match_terms,
        },
        "competitors": [item["title"] for item in items],
        "priceRange": {
            "min": min(prices),
            "max": max(prices),
            "currency": "RUB",
        },
    }


def _product_evidence_diagnostics(
    query_name: str,
    provider: str | None,
    search_queries: list[str],
    items: list[dict],
    match_terms: list[str],
    relevance_strategy: str,
    resolved_search_query: str,
) -> dict:
    """Return a bounded, non-secret explanation of an evidence gate failure."""
    candidates = [
        {
            "id": item.get("id"),
            "title": item.get("title"),
            "url": item.get("url"),
            "imageUrl": item.get("imageUrl"),
            "priceRub": item.get("priceRub"),
            "priceSource": item.get("priceSource"),
        }
        for item in items[:5]
    ]
    return {
        "query": query_name[:160],
        "searchQuery": resolved_search_query[:160],
        "provider": provider,
        "searchQueries": search_queries[:3],
        "candidateCount": len(items),
        "observedPriceCount": sum(
            1 for item in items if item.get("priceRub") is not None
        ),
        "relevance": {
            "strategy": relevance_strategy,
            "matchTerms": match_terms,
        },
        "candidates": candidates,
    }


def _collect_relevant_ozon_items(
    raw_results: list[dict],
    fetched_at: str,
    match_terms: list[str],
) -> list[dict]:
    """Normalize public results and retain only query-grounded product matches."""
    items: list[dict] = []
    seen_urls: set[str] = set()
    for result in raw_results:
        item = _normalize_ozon_result(result, len(items) + 1, fetched_at)
        if item is None:
            continue
        url = str(item["url"]).lower()
        if url in seen_urls:
            continue
        seen_urls.add(url)
        items.append(item)

    if match_terms:
        items = [item for item in items if _matches_listing_terms(item, match_terms)]

    for index, item in enumerate(items[:5], start=1):
        item["id"] = f"ozon-{index}"
        item["matchedTerms"] = list(match_terms)
    return items[:5]


def _enrich_ozon_listing_images(items: list[dict], image_results: list[dict]) -> list[dict]:
    """Attach images only when the image result points to the same Ozon product id."""
    images_by_product_id: dict[str, str] = {}
    for result in image_results:
        if not isinstance(result, dict):
            continue
        source_url = str(result.get("url") or "").strip()
        image_url = str(result.get("image_url") or result.get("imageUrl") or "").strip()
        product_id = _ozon_product_id(source_url)
        if (
            product_id
            and image_url.lower().startswith(("https://", "http://"))
            and _is_ozon_url(source_url)
        ):
            images_by_product_id.setdefault(product_id, image_url)

    for item in items:
        if item.get("imageUrl"):
            continue
        product_id = _ozon_product_id(str(item.get("url") or ""))
        if product_id and product_id in images_by_product_id:
            item["imageUrl"] = images_by_product_id[product_id]
    return items


def derive_ozon_query_terms(search_query: str) -> list[str]:
    """Return bounded lexical terms that are provably present in the query itself."""
    terms: list[str] = []
    for term in _LISTING_WORD_RE.findall(str(search_query or "").casefold()):
        if term in _LISTING_STOP_WORDS or term in terms:
            continue
        terms.append(term)
        if len(terms) >= 3:
            break
    return terms


def _normalize_required_terms(required_terms: list[str] | None) -> list[str]:
    """Accept only compact listing words returned by the query translator."""
    if not isinstance(required_terms, list):
        return []
    normalized: list[str] = []
    for raw_term in required_terms:
        term = str(raw_term or "").strip().casefold()
        if not re.fullmatch(r"[A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451-]{2,40}", term):
            continue
        if term not in normalized:
            normalized.append(term)
        if len(normalized) >= 3:
            break
    return normalized


def _matches_listing_terms(item: dict, match_terms: list[str]) -> bool:
    text = " ".join(
        str(item.get(key) or "") for key in ("title", "url")
    ).casefold()
    return all(
        re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text) is not None
        for term in match_terms
    )


def _build_price_constrained_query(query_name: str, match_terms: list[str]) -> str:
    quoted_subject = " ".join(match_terms) if match_terms else query_name
    return (
        f'site:ozon.ru/product "{quoted_subject.replace(chr(34), " ")}" '
        '"\u0440\u0443\u0431" -\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 '
        '-\u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0430 '
        '-\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0438'
    )


def _count_observed_prices(items: list[dict]) -> int:
    return sum(1 for item in items if item.get("priceRub") is not None)


def collect_ozon_trend_evidence(category: str) -> dict:
    """Collect Ozon source references for qualitative trend research.

    Public category and listing search results do not prove a time-series growth
    rate, so this function deliberately returns no derived metric. The caller
    can only present evidence-backed qualitative observations.
    """
    query_category = str(category or "").strip()
    if not query_category:
        raise ResearchEvidenceError("category is required for Ozon trend evidence")

    from common.web_search import WebSearchError, resolve_search_provider, search_web

    provider, _ = resolve_search_provider()
    if not provider:
        raise ResearchEvidenceError("Ozon trend evidence requires a configured web search provider")
    try:
        raw_results = search_web(f'site:ozon.ru "{query_category}"', num_results=8)
    except WebSearchError as exc:
        raise ResearchEvidenceError(f"Ozon trend evidence search failed: {exc}") from exc

    fetched_at = datetime.now(timezone.utc).isoformat()
    items: list[dict] = []
    for result in raw_results:
        item = _normalize_ozon_trend_result(result, len(items) + 1, fetched_at)
        if item is None:
            continue
        items.append(item)
        if len(items) >= 5:
            break
    if len(items) < _MIN_EVIDENCE_ITEMS:
        raise ResearchEvidenceError(
            "Ozon trend evidence requires at least two public Ozon sources"
        )
    return {
        "source": "ozon_public_search",
        "provider": provider,
        "fetchedAt": fetched_at,
        "items": items,
    }


def _normalize_ozon_result(raw: object, index: int, fetched_at: str) -> dict | None:
    if not isinstance(raw, dict):
        return None
    url = str(raw.get("url") or "").strip()
    if not _is_ozon_url(url):
        return None
    title = str(raw.get("title") or "").strip()
    snippet = str(raw.get("snippet") or "").strip()
    image_url = str(raw.get("image_url") or raw.get("imageUrl") or "").strip()
    if image_url and not image_url.lower().startswith(("https://", "http://")):
        image_url = ""
    if not title:
        return None
    snippet_price = _credible_product_price(
        _extract_rub_price(f"{title} {snippet}")
    )
    page_price = (
        _credible_product_price(_fetch_ozon_listing_price(url))
        if snippet_price is None
        else None
    )
    page_image = (
        _fetch_ozon_listing_image(url)
        if not image_url and _has_ozon_product_id(url)
        else None
    )
    price = snippet_price if snippet_price is not None else page_price
    return {
        "id": f"ozon-{index}",
        "source": "Ozon public listing",
        "title": title[:240],
        "url": url,
        "snippet": snippet[:600],
        "imageUrl": image_url or page_image,
        "priceRub": price,
        "priceSource": (
            "search_snippet"
            if snippet_price is not None
            else "product_page"
            if page_price is not None
            else None
        ),
        "fetchedAt": fetched_at,
    }


def _normalize_ozon_trend_result(
    raw: object, index: int, fetched_at: str
) -> dict | None:
    if not isinstance(raw, dict):
        return None
    url = str(raw.get("url") or "").strip()
    if not _is_ozon_url(url):
        return None
    title = str(raw.get("title") or "").strip()
    snippet = str(raw.get("snippet") or "").strip()
    if not title and not snippet:
        return None
    return {
        "id": f"ozon-trend-{index}",
        "source": "Ozon public search",
        "title": (title or snippet)[:240],
        "url": url,
        "snippet": snippet[:600],
        "fetchedAt": fetched_at,
    }


def _is_ozon_url(value: str) -> bool:
    try:
        host = urlparse(value).hostname or ""
    except ValueError:
        return False
    host = host.lower()
    return host == "ozon.ru" or host.endswith(".ozon.ru")


def _count_unique_ozon_urls(results: list[dict]) -> int:
    return len(
        {
            str(result.get("url") or "").strip().lower()
            for result in results
            if isinstance(result, dict) and _is_ozon_url(str(result.get("url") or ""))
        }
    )


def _merge_unique_results(*groups: list[dict]) -> list[dict]:
    merged: list[dict] = []
    seen_urls: dict[str, int] = {}
    for group in groups:
        for result in group:
            if not isinstance(result, dict):
                continue
            url = str(result.get("url") or "").strip()
            key = url.lower()
            if not url:
                continue
            existing_index = seen_urls.get(key)
            if existing_index is not None:
                if _search_result_price_score(result) > _search_result_price_score(
                    merged[existing_index]
                ):
                    merged[existing_index] = result
                continue
            seen_urls[key] = len(merged)
            merged.append(result)
    return merged


def _search_result_price_score(result: dict) -> int:
    """Prefer a duplicate search result only when it contributes a cited price."""
    text = " ".join(
        str(result.get(key) or "") for key in ("title", "snippet")
    )
    return int(_extract_rub_price(text) is not None)


def _fetch_ozon_listing_price(url: str) -> int | None:
    """Read a public Ozon product page only when its search snippet lacks price."""
    html = _fetch_ozon_listing_page(url)
    return _extract_ozon_page_price(html) if html else None


def _fetch_ozon_listing_image(url: str) -> str | None:
    """Read the structured preview image from a public Ozon product page."""
    html = _fetch_ozon_listing_page(url)
    return _extract_ozon_page_image(html) if html else None


def _fetch_ozon_listing_page(url: str) -> str | None:
    """Fetch once per collection so price and image share the same fresh HTML."""
    if not _is_ozon_url(url):
        return None

    page_cache = _OZON_PAGE_CACHE.get()
    if page_cache is not None and url in page_cache:
        return page_cache[url]

    html = _request_ozon_listing_page(url)
    if page_cache is not None:
        page_cache[url] = html
    return html


def _request_ozon_listing_page(url: str) -> str | None:
    """Perform one bounded public Ozon page request with redirect checks."""
    if not _is_ozon_url(url):
        return None

    import requests

    try:
        response = requests.get(
            url,
            headers={
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
                "User-Agent": "Mozilla/5.0 (compatible; ShopMateEvidence/1.0)",
            },
            timeout=_PAGE_FETCH_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
    except requests.RequestException:
        return None

    if response.status_code != 200 or not _is_ozon_url(response.url):
        return None
    content_type = response.headers.get("content-type", "").lower()
    if "html" not in content_type:
        return None
    content_length = response.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > _MAX_PAGE_BYTES:
        return None
    return response.text[:_MAX_PAGE_BYTES]


def _has_ozon_product_id(url: str) -> bool:
    """Only product URLs with a stable Ozon numeric id are eligible for page fetches."""
    return _ozon_product_id(url) is not None


def _ozon_product_id(url: str) -> str | None:
    try:
        path = urlparse(url).path
    except ValueError:
        return None
    match = re.search(r"(?:^|-)(\d{6,})(?:/|$)", path)
    return match.group(1) if match else None


def _credible_product_price(price: int | None) -> int | None:
    """Reject token/sentinel prices that cannot support a product decision."""
    if price is None or price < _MIN_CREDIBLE_PRICE_RUB:
        return None
    return price


def _extract_ozon_page_image(html: str) -> str | None:
    accepted_markers = {"og:image", "twitter:image", "image"}
    for tag in _META_TAG_RE.findall(html):
        attributes = {
            name.lower(): unescape(value).strip()
            for name, _quote, value in _HTML_ATTRIBUTE_RE.findall(tag)
        }
        marker = (
            attributes.get("property")
            or attributes.get("itemprop")
            or attributes.get("name")
            or ""
        ).lower()
        if marker not in accepted_markers:
            continue
        image_url = attributes.get("content", "")
        if image_url.lower().startswith(("https://", "http://")):
            return image_url
    return None


def _extract_ozon_page_price(html: str) -> int | None:
    """Extract only explicitly structured product-offer prices from public HTML."""
    meta_price = _extract_meta_price(html)
    if meta_price is not None:
        return meta_price
    return _extract_json_ld_offer_price(html)


def _extract_meta_price(html: str) -> int | None:
    accepted_markers = {
        "product:price:amount",
        "og:price:amount",
        "price",
    }
    for tag in _META_TAG_RE.findall(html):
        attributes = {
            name.lower(): unescape(value).strip()
            for name, _quote, value in _HTML_ATTRIBUTE_RE.findall(tag)
        }
        marker = (
            attributes.get("property")
            or attributes.get("itemprop")
            or attributes.get("name")
            or ""
        ).lower()
        if marker not in accepted_markers:
            continue
        price = _parse_price_value(attributes.get("content", ""))
        if price is not None:
            return price
    return None


def _extract_json_ld_offer_price(html: str) -> int | None:
    for _quote, payload in _JSON_LD_SCRIPT_RE.findall(html):
        try:
            parsed = json.loads(unescape(payload).strip())
        except (TypeError, ValueError):
            continue
        price = _find_offer_price(parsed)
        if price is not None:
            return price
    return None


def _find_offer_price(value: object, in_offer: bool = False) -> int | None:
    if isinstance(value, list):
        for item in value:
            price = _find_offer_price(item, in_offer=in_offer)
            if price is not None:
                return price
        return None
    if not isinstance(value, dict):
        return None

    type_value = value.get("@type")
    types = type_value if isinstance(type_value, list) else [type_value]
    is_offer = in_offer or any(
        isinstance(item, str) and item.lower() == "offer" for item in types
    )
    if is_offer:
        price = _parse_price_value(value.get("price"))
        if price is not None:
            return price

    offers = value.get("offers")
    if offers is not None:
        price = _find_offer_price(offers, in_offer=True)
        if price is not None:
            return price

    graph = value.get("@graph")
    if graph is not None:
        return _find_offer_price(graph, in_offer=False)
    return None


def _parse_price_value(value: object) -> int | None:
    text = str(value or "").strip().replace("\u00a0", " ")
    match = re.search(r"\d[\d\s.,]*", text)
    if not match:
        return None
    raw = match.group(0).replace(" ", "")
    if re.search(r"[.,]\d{2}$", raw):
        raw = raw[:-3]
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    price = int(digits)
    return price if 1 <= price <= 10_000_000 else None


def _extract_rub_price(value: str) -> int | None:
    match = _PRICE_RUB_RE.search(value)
    if not match:
        return None
    context_start = max(0, match.start() - 160)
    context_end = min(len(value), match.end() + 160)
    if _NON_PRODUCT_PRICE_CONTEXT_RE.search(value[context_start:context_end]):
        return None
    digits = re.sub(r"\D", "", match.group(1))
    if not digits:
        return None
    price = int(digits)
    return price if 1 <= price <= 10_000_000 else None
