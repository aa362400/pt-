"""Real, evidence-only product discovery across public marketplace results."""

from __future__ import annotations

import os
import re
import hashlib
import unicodedata
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from urllib.parse import quote_plus, urlparse

from common.web_search import (
    resolve_search_provider,
    search_images,
    search_shopping,
    search_web,
)


DEFAULT_SEED_QUERIES = (
    "personalized home organization",
    "compact desk organization gift",
    "pet travel accessory",
    "car organization accessory",
    "compact kitchen organization",
    "travel storage accessory",
    "small space storage accessory",
    "personalized family gift",
)

MARKETPLACES = (
    {
        "source": "temu_public_search",
        "site": "site:temu.com",
        "domains": ("temu.com",),
        "metricHint": "sold",
        "market": "GLOBAL",
    },
    {
        "source": "aliexpress_public_search",
        "site": "site:aliexpress.com/item",
        "domains": ("aliexpress.com",),
        "metricHint": "sold",
        "market": "GLOBAL",
    },
    {
        "source": "walmart_public_search",
        "site": "site:walmart.com",
        "domains": ("walmart.com",),
        "metricHint": "reviews",
        "market": "US",
    },
    {
        "source": "etsy_public_search",
        "site": "site:etsy.com/listing",
        "domains": ("etsy.com",),
        "metricHint": "reviews",
        "market": "GLOBAL",
    },
)

_DISCOVERY_SOURCES = MARKETPLACES[:2]
_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9-]{2,}", re.IGNORECASE)
_NUMBER = r"(?P<number>\d[\d,\.\s]*)(?P<suffix>[km]?)"
_METRIC_PATTERNS = (
    (
        "sales",
        re.compile(_NUMBER + r"\+?\s*(?:sold|sales|orders?|purchases?)\b", re.I),
    ),
    (
        "review_count",
        re.compile(_NUMBER + r"\+?\s*(?:reviews?|ratings?)\b", re.I),
    ),
)
_STOPWORDS = {
    "and",
    "for",
    "from",
    "gift",
    "new",
    "official",
    "sale",
    "shop",
    "store",
    "the",
    "with",
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bounded_text(value, limit: int) -> str:
    text = str(value or "").strip()
    used_utf16_units = 0
    bounded = []
    for character in text:
        character_units = 2 if ord(character) > 0xFFFF else 1
        if used_utf16_units + character_units > limit:
            break
        bounded.append(character)
        used_utf16_units += character_units
    return "".join(bounded)


def _number(value: str, suffix: str) -> int | None:
    cleaned = re.sub(r"[\s,]", "", value)
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    multiplier = (
        1_000
        if suffix.casefold() == "k"
        else 1_000_000
        if suffix.casefold() == "m"
        else 1
    )
    result = int(parsed * multiplier)
    return result if 0 <= result <= 1_000_000_000 else None


def explicit_purchase_metrics(text: str) -> list[tuple[str, int]]:
    """Accept only numbers explicitly labelled sold/orders/reviews/ratings."""
    metrics: list[tuple[str, int]] = []
    for metric_name, pattern in _METRIC_PATTERNS:
        for match in pattern.finditer(text or ""):
            value = _number(match.group("number"), match.group("suffix"))
            if value is not None:
                metrics.append((metric_name, value))
    return metrics


def _exact_money(value: object) -> tuple[str, str] | None:
    text = str(value or "").strip()
    patterns = (
        (re.compile(r"^\$(\d+(?:,\d{3})*(?:\.\d{1,2})?)$"), "USD"),
        (re.compile(r"^€(\d+(?:[.,]\d{1,2})?)$"), "EUR"),
        (re.compile(r"^£(\d+(?:,\d{3})*(?:\.\d{1,2})?)$"), "GBP"),
        (re.compile(r"^₽(\d+(?:[\s,]\d{3})*(?:\.\d{1,2})?)$"), "RUB"),
    )
    for pattern, currency in patterns:
        match = pattern.fullmatch(text)
        if not match:
            continue
        normalized = match.group(1).replace(" ", "").replace(",", "")
        try:
            amount = Decimal(normalized)
        except InvalidOperation:
            return None
        if amount <= 0:
            return None
        return f"{amount:.2f}", currency
    return None


def _tokens(value: str) -> set[str]:
    return {
        token.casefold()
        for token in _TOKEN_RE.findall(value or "")
        if token.casefold() not in _STOPWORDS
    }


def _concept_evidence_group_key(concept: dict) -> str:
    def canonical(value: object) -> str:
        text = unicodedata.normalize("NFKC", str(value or "")).casefold()
        text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE).replace("_", " ")
        return " ".join(text.split())

    basis = "|".join(
        canonical(concept.get(key))
        for key in (
            "name",
            "productType",
            "material",
            "primaryUse",
            "customizationMethod",
        )
    )
    digest = hashlib.sha256(basis.encode("utf-8")).hexdigest()
    return f"global_product_concept:{digest}"


def _relevant(concept: str, result: dict) -> bool:
    expected = _tokens(concept)
    if not expected:
        return False
    observed = _tokens(
        " ".join(
            str(result.get(key) or "") for key in ("title", "snippet", "url")
        )
    )
    return len(expected & observed) >= min(2, len(expected))


def _domain_allowed(url: str, domains: tuple[str, ...]) -> bool:
    try:
        host = (urlparse(url).hostname or "").casefold()
    except ValueError:
        return False
    return any(host == domain or host.endswith("." + domain) for domain in domains)


def _safe_results(search_fn, query: str, stats: dict, limit: int = 8) -> list[dict]:
    stats["attempts"] += 1
    try:
        results = search_fn(query, num_results=limit)
        stats["successes"] += 1
        normalized = [item for item in results if isinstance(item, dict)]
        for item in normalized:
            actual_provider = str(item.get("provider") or "").strip()
            if actual_provider and actual_provider not in stats["providers"]:
                stats["providers"].append(actual_provider)
        return normalized
    except Exception as exc:
        stats["failures"].append({"query": query, "error": str(exc)[:300]})
        return []


def _seed_queries(input_data: dict) -> list[str]:
    supplied = input_data.get("seedQueries")
    if isinstance(supplied, list):
        cleaned = [str(item).strip() for item in supplied if str(item).strip()]
        if cleaned:
            return cleaned[:4]
    exploration_key = str(input_data.get("explorationKey") or "").strip()
    rotation_key = exploration_key or str(input_data.get("businessDate") or "")
    offset = sum(ord(char) for char in rotation_key) % len(DEFAULT_SEED_QUERIES)
    return [
        DEFAULT_SEED_QUERIES[offset],
        DEFAULT_SEED_QUERIES[(offset + 1) % len(DEFAULT_SEED_QUERIES)],
    ]


def _strongest_listing(
    concept: str, results: list[dict], domains: tuple[str, ...]
):
    choices = []
    for item in results:
        url = str(item.get("url") or "").strip()
        if not url or not _domain_allowed(url, domains) or not _relevant(concept, item):
            continue
        metrics = explicit_purchase_metrics(
            f"{item.get('title') or ''} {item.get('snippet') or ''}"
        )
        if metrics:
            choices.append((max(value for _, value in metrics), item, metrics))
    if not choices:
        return None
    choices.sort(key=lambda choice: choice[0], reverse=True)
    return choices[0][1], choices[0][2]


def _ozon_sample(
    concept: dict, provider: str, fetched_at: str, search_fn, stats: dict
):
    query = str(concept.get("ozonQuery") or concept["name"]).strip()
    required_terms = [
        str(term).strip().casefold()
        for term in concept.get("ozonRequiredTerms", [])
        if str(term).strip()
    ][:3]
    search_query = f"site:ozon.ru/product {query}"
    results = _safe_results(search_fn, search_query, stats, limit=10)
    relevant = []
    for item in results:
        url = str(item.get("url") or "").strip()
        if not _domain_allowed(url, ("ozon.ru",)):
            continue
        haystack = " ".join(
            str(item.get(key) or "") for key in ("title", "snippet", "url")
        ).casefold()
        if required_terms and not all(term in haystack for term in required_terms):
            continue
        if not required_terms and not _relevant(concept["name"], item):
            continue
        relevant.append(item)
    unique_urls = list(dict.fromkeys(str(item.get("url") or "") for item in relevant))
    evidence = relevant[0] if relevant else {}
    return {
        "source": "ozon_public_search_sample",
        "evidenceGroupKey": _concept_evidence_group_key(concept),
        "provider": str(evidence.get("provider") or provider),
        "externalId": None,
        "url": evidence.get("url")
        or f"https://www.ozon.ru/search/?text={quote_plus(query)}",
        "market": "RU",
        "name": concept["name"],
        "productType": concept["productType"],
        "material": None,
        "primaryUse": None,
        "customizationMethod": None,
        "targetAudience": None,
        "salePrice": None,
        "currency": None,
        "costs": [],
        "platformFeeRate": "0",
        "paymentFeeRate": "0",
        "adRate": "0",
        "refundRate": "0",
        "signals": [
            {
                "metricName": "ozon_public_search_result_count",
                "metricValue": str(len(unique_urls)),
                "unit": "sampled_relevant_listings",
                "observedAt": fetched_at,
                "fetchedAt": fetched_at,
                "quality": "ESTIMATED",
            }
        ],
        "risks": [],
        "evidenceTitle": _bounded_text(
            evidence.get("title")
            or "Ozon public-search sample returned no relevant listing",
            500,
        ),
        "evidenceSnippet": _bounded_text(evidence.get("snippet"), 2_000),
        "evidenceQuery": _bounded_text(search_query, 500),
        "evidenceScope": "Public web-search sample only; not the full Ozon catalog.",
    }


def _image_evidence(concept: str, image_search_fn) -> dict | None:
    try:
        results = image_search_fn(f"{concept} product", num_results=8)
    except Exception:
        return None
    allowed = tuple(
        domain for source in MARKETPLACES for domain in source["domains"]
    )
    for item in results:
        if not isinstance(item, dict) or not _relevant(concept, item):
            continue
        page_url = str(item.get("url") or "").strip()
        image_url = str(item.get("image_url") or "").strip()
        if page_url and image_url and _domain_allowed(page_url, allowed):
            return {"imageUrl": image_url, "imageEvidenceUrl": page_url}
    return None


def _shopping_price_evidence(
    concept: dict, fetched_at: str, shopping_search_fn, stats: dict
) -> dict | None:
    stats["shoppingAttempts"] += 1
    try:
        results = shopping_search_fn(concept["name"], num_results=8)
    except Exception as exc:
        stats["failures"].append(
            {"query": f"shopping:{concept['name']}", "error": str(exc)[:300]}
        )
        return None
    for item in results:
        if not isinstance(item, dict) or not _relevant(concept["name"], item):
            continue
        url = str(item.get("url") or "").strip()
        money = _exact_money(item.get("price"))
        if not url or not money:
            continue
        amount, currency = money
        provider = str(item.get("provider") or "serper").strip() or "serper"
        if provider not in stats["providers"]:
            stats["providers"].append(provider)
        stats["shoppingSuccesses"] += 1
        image_url = str(item.get("image_url") or "").strip() or None
        return {
            "source": "google_shopping_public_sample",
            "evidenceGroupKey": _concept_evidence_group_key(concept),
            "provider": provider,
            "externalId": str(item.get("productId") or "").strip() or None,
            "url": url,
            "market": "PUBLIC_SEARCH",
            "name": concept["name"],
            "productType": concept["productType"],
            "material": None,
            "primaryUse": None,
            "customizationMethod": None,
            "targetAudience": None,
            "salePrice": None,
            "currency": None,
            "costs": [],
            "platformFeeRate": "0",
            "paymentFeeRate": "0",
            "adRate": "0",
            "refundRate": "0",
            "signals": [
                {
                    "metricName": "public_market_price",
                    "metricValue": amount,
                    "unit": currency,
                    "observedAt": fetched_at,
                    "fetchedAt": fetched_at,
                    "quality": "ESTIMATED",
                }
            ],
            "risks": [],
            "imageUrl": image_url,
            "imageEvidenceUrl": url if image_url else None,
            "evidenceTitle": _bounded_text(item.get("title"), 500),
            "evidenceSnippet": _bounded_text(
                f"{item.get('source') or ''} {item.get('delivery') or ''}",
                2_000,
            ),
            "evidenceQuery": _bounded_text(concept["name"], 500),
            "evidenceScope": (
                "Bounded Google Shopping sample. The amount is an estimated "
                "public market-price observation, not a procurement cost or "
                "verified fulfillment quote."
            ),
        }
    return None


def discover_global_products(
    input_data: dict,
    *,
    normalize_titles,
    progress=None,
    search_fn=search_web,
    image_search_fn=search_images,
    shopping_search_fn=search_shopping,
) -> dict:
    """Discover and verify concepts without allowing model-generated facts."""
    provider, _ = resolve_search_provider()
    if not provider:
        raise ValueError("No real web-search provider is configured")
    fetched_at = _iso_now()
    stats = {
        "attempts": 0,
        "successes": 0,
        "failures": [],
        "providers": [],
        "shoppingAttempts": 0,
        "shoppingSuccesses": 0,
    }
    raw_items = []
    seed_queries = _seed_queries(input_data)
    if progress:
        progress("global_discovery", "正在检索全球市场真实成交与评价证据")
    for seed in seed_queries:
        for source in _DISCOVERY_SOURCES:
            query = f"{source['site']} {seed} {source['metricHint']}"
            for item in _safe_results(search_fn, query, stats, limit=6):
                metrics = explicit_purchase_metrics(
                    f"{item.get('title') or ''} {item.get('snippet') or ''}"
                )
                if metrics:
                    raw_items.append(
                        {
                            "source": source["source"],
                            "seedQuery": seed,
                            "title": str(item.get("title") or "").strip(),
                            "snippet": str(item.get("snippet") or "").strip(),
                            "url": str(item.get("url") or "").strip(),
                        }
                    )
    if not raw_items and stats["failures"]:
        raise RuntimeError("Global marketplace searches failed without usable evidence")

    max_concepts = max(
        1,
        min(
            int(os.getenv("GLOBAL_DISCOVERY_MAX_CONCEPTS", "5")),
            max(1, int(input_data.get("candidateLimit") or 25) // 5),
        ),
    )
    concepts = normalize_titles(raw_items)[:max_concepts] if raw_items else []
    candidates = []
    accepted = 0
    for concept in concepts:
        evidence = []
        for source in MARKETPLACES:
            query = f"{source['site']} \"{concept['name']}\" {source['metricHint']}"
            results = _safe_results(search_fn, query, stats, limit=8)
            strongest = _strongest_listing(
                concept["name"], results, source["domains"]
            )
            if not strongest:
                continue
            item, metrics = strongest
            evidence.append(
                {
                    "source": source["source"],
                    "evidenceGroupKey": _concept_evidence_group_key(concept),
                    "provider": str(item.get("provider") or provider),
                    "externalId": None,
                    "url": item.get("url"),
                    "market": source["market"],
                    "name": concept["name"],
                    "productType": concept["productType"],
                    "material": None,
                    "primaryUse": None,
                    "customizationMethod": None,
                    "targetAudience": None,
                    "salePrice": None,
                    "currency": None,
                    "costs": [],
                    "platformFeeRate": "0",
                    "paymentFeeRate": "0",
                    "adRate": "0",
                    "refundRate": "0",
                    "signals": [
                        {
                            "metricName": metric_name,
                            "metricValue": str(value),
                            "unit": "count",
                            "observedAt": fetched_at,
                            "fetchedAt": fetched_at,
                            "quality": "VERIFIED",
                        }
                        for metric_name, value in metrics
                    ],
                    "risks": [],
                    "evidenceTitle": _bounded_text(item.get("title"), 500),
                    "evidenceSnippet": _bounded_text(item.get("snippet"), 2_000),
                    "evidenceQuery": _bounded_text(query, 500),
                    "evidenceScope": "Public marketplace search result with an explicit purchase-intent metric.",
                }
            )

        if len({item["source"] for item in evidence}) < 2:
            continue
        shopping = _shopping_price_evidence(
            concept, fetched_at, shopping_search_fn, stats
        )
        if shopping:
            evidence.append(shopping)
        ozon = _ozon_sample(concept, provider, fetched_at, search_fn, stats)
        image = _image_evidence(concept["name"], image_search_fn)
        if image:
            evidence[0].update(image)
        candidates.extend(evidence)
        candidates.append(ozon)
        accepted += 1

    provider_summary = (
        stats["providers"][0]
        if len(stats["providers"]) == 1
        else ",".join(stats["providers"])
        if stats["providers"]
        else provider
    )
    return {
        "candidates": candidates,
        "provider": provider_summary,
        "fetchedAt": fetched_at,
        "conceptCount": accepted,
        "searchAttempts": stats["attempts"],
        "searchSuccesses": stats["successes"],
        "shoppingAttempts": stats["shoppingAttempts"],
        "shoppingSuccesses": stats["shoppingSuccesses"],
        "searchFailures": stats["failures"],
        "methodology": {
            "seedQueries": seed_queries,
            "searchProviders": stats["providers"] or [provider],
            "demand": "Only explicit sold/orders/reviews/ratings values from public marketplace search results.",
            "ozonSupply": "Relevant results in a capped Ozon public web-search sample; not a full-catalog absence claim.",
            "evidenceGrouping": "All observations for one normalized discovery concept share an explicit stable group key while retaining their source-specific external ids.",
            "externalStoreMutation": False,
        },
    }
