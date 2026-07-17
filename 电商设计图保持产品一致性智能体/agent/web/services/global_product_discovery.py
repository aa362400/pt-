"""Real, evidence-only product discovery across public marketplace results."""

from __future__ import annotations

import os
import re
import hashlib
import inspect
import time
import unicodedata
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from urllib.parse import parse_qsl, quote_plus, urlparse, urlsplit

from common.fetch_url import validate_remote_product_image
from common.web_search import (
    resolve_search_provider,
    search_images,
    search_shopping,
    search_web,
)


DEFAULT_SEED_QUERIES = (
    "adhesive cable organizer clips",
    "reusable cable tie straps",
    "compact travel storage pouch",
    "lightweight shoe storage bag",
    "laundry mesh wash bag",
    "travel jewelry storage pouch",
    "small drawer divider organizer",
    "compact drawer tray organizer",
    "compact car seat gap organizer",
    "car seat gap filler",
    "silicone chair leg protector caps",
    "furniture felt protector pads",
    "door handle wall bumper",
    "pet poop bag dispenser",
    "compact pet poop scooper",
    "desktop pen holder",
    "small desk organizer tray",
    "zipper pencil case pouch",
    "lightweight luggage tag accessory",
    "passport document holder sleeve",
    "plant label tags",
    "plant support clips",
    "keyboard cleaning brush",
    "screen cleaning brush",
    "mini dustpan brush set",
    "toothpaste tube squeezer",
    "soap saver mesh pouch",
    "eyeglass hard case",
    "earphone storage pouch",
    "badge card holder sleeve",
    "replacement zipper pull tabs",
    "crochet stitch marker clips",
    "sewing thread organizer case",
    "bed sheet holder clips",
    "curtain tieback holder clips",
    "table purse bag hook",
    "wardrobe divider labels",
    "cable label tags",
    "makeup brush protector sleeves",
    "travel toothbrush protective caps",
)
DISCOVERY_SEEDS_PER_RUN = 12

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

_MARKETPLACE_IMAGE_DOMAINS = {
    "temu.com": ("kwcdn.com", "temu.com"),
    "aliexpress.com": ("aliexpress-media.com", "alicdn.com"),
    "walmart.com": ("walmartimages.com", "walmart.com"),
    "etsy.com": ("etsystatic.com", "etsy.com"),
}
_SENSITIVE_URL_QUERY_KEY_SUFFIXES = (
    "token",
    "apikey",
    "authorization",
    "credential",
    "credentials",
    "password",
    "passwd",
    "secret",
    "signature",
    "sig",
)

_DISCOVERY_SOURCES = MARKETPLACES[:2]
_DEFAULT_DISCOVERY_BUDGET_SECONDS = 12 * 60
_MAX_DISCOVERY_BUDGET_SECONDS = 12 * 60
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
_SEMANTIC_NON_IDENTITY_MODIFIERS = {
    "black",
    "blue",
    "compact",
    "green",
    "lightweight",
    "metal",
    "mini",
    "plastic",
    "portable",
    "red",
    "rubber",
    "silicone",
    "small",
    "white",
    "wood",
    "wooden",
}
_LIGHT_SMALL_CLASS_HINTS = (
    "bag",
    "brush",
    "case",
    "clip",
    "compact",
    "cover",
    "divider",
    "door handle bumper",
    "felt pad",
    "holder",
    "hook",
    "lightweight",
    "mat",
    "mini",
    "organizer",
    "pocket",
    "portable",
    "pouch",
    "protector",
    "scraper",
    "sleeve",
    "small",
    "stand",
    "strap",
    "tag",
    "toothbrush cap",
    "travel",
    "tray",
    "tube squeezer",
    "zipper pull",
)
_OUT_OF_SCOPE_CLASS_PATTERNS = tuple(
    re.compile(pattern, re.I)
    for pattern in (
        r"\b(?:baby|infant|toddler)\b",
        r"\b(?:battery|bluetooth|electric|electronic|powered|rechargeable|wireless)\b",
        r"\b(?:chemical|gel|liquid|oil|spray)\b",
        r"\b(?:glass|ceramic|mirror)\b",
        r"\b(?:blade|knife|scissors)\b",
        r"\b(?:medical|medicine|supplement|therapeutic)\b",
        r"\bappliance\b",
        r"\b(?:backpack|carrier|duffel)\b",
        r"\bluggage bag\b",
        r"\bcar trunk organizer\b",
        r"\bstorage cabinet\b",
    )
)
_CONCEPT_SINGULAR_TOKENS = {
    "bags": "bag",
    "cases": "case",
    "clips": "clip",
    "covers": "cover",
    "dividers": "divider",
    "eyeglasses": "eyeglass",
    "glasses": "eyeglass",
    "holders": "holder",
    "hooks": "hook",
    "organizers": "organizer",
    "pouches": "pouch",
    "spectacles": "eyeglass",
    "tags": "tag",
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


def _is_light_small_export_concept(concept: dict) -> bool:
    """Apply a conservative class-level screen, never a weight/dimension claim."""
    text = " ".join(
        str(concept.get(key) or "") for key in ("name", "productType")
    ).casefold()
    if any(pattern.search(text) for pattern in _OUT_OF_SCOPE_CLASS_PATTERNS):
        return False
    tokens = _tokens(text)
    return any(
        hint in tokens or (" " in hint and hint in text)
        for hint in _LIGHT_SMALL_CLASS_HINTS
    )


def _semantic_concept_key(concept: dict) -> str:
    raw_basis = " ".join(
        str(concept.get(key) or "") for key in ("name", "productType")
    )
    raw_tokens = re.findall(
        r"[^\W_]+",
        unicodedata.normalize("NFKC", raw_basis).casefold(),
        flags=re.UNICODE,
    )

    def singular(token: str) -> str:
        mapped = _CONCEPT_SINGULAR_TOKENS.get(token)
        if mapped:
            return mapped
        if token.endswith("ies") and len(token) > 3:
            return f"{token[:-3]}y"
        if token.endswith(("ches", "shes", "xes", "zes")) and len(token) > 4:
            return token[:-2]
        if token.endswith("s") and not token.endswith("ss") and len(token) > 3:
            return token[:-1]
        return token

    tokens = [
        singular(token)
        for token in raw_tokens
        if token not in _STOPWORDS
        and token not in _SEMANTIC_NON_IDENTITY_MODIFIERS
        and (len(token) >= 2 or token.isdigit())
    ]
    token_set = set(tokens)
    product_type_tokens = {
        singular(token)
        for token in re.findall(
            r"[^\W_]+",
            unicodedata.normalize(
                "NFKC", str(concept.get("productType") or "")
            ).casefold(),
            flags=re.UNICODE,
        )
        if token not in _STOPWORDS
        and token not in _SEMANTIC_NON_IDENTITY_MODIFIERS
        and (len(token) >= 2 or token.isdigit())
    }
    if {"makeup", "brush", "protector"}.issubset(token_set):
        return "makeup brush protector"
    if "toothbrush" in token_set and token_set.intersection({"cap", "cover"}):
        return "toothbrush cover"
    if "eyeglass" in token_set and token_set.intersection({"case", "pouch"}):
        return "eyeglass case"
    if token_set.intersection({"earbud", "earphone"}) and token_set.intersection(
        {"case", "pouch"}
    ):
        return "earphone case"
    is_badge_card = "badge" in token_set or {"id", "card"}.issubset(token_set)
    if is_badge_card and token_set.intersection({"case", "holder", "sleeve"}):
        return "badge card holder"
    if {"poop", "scooper"}.issubset(product_type_tokens):
        if product_type_tokens.intersection({"bag", "refill", "replacement"}):
            return "poop scooper refill bag"
        return "poop scooper"
    if {"chair", "leg"}.issubset(token_set) and token_set.intersection(
        {"cap", "feet", "foot", "pad", "protector"}
    ):
        return "chair leg protector"
    if {"seat", "gap"}.issubset(token_set) and token_set.intersection(
        {"filler", "organizer"}
    ):
        return "car seat gap accessory"
    if "cable" in token_set and token_set.intersection(
        {"clip", "holder", "organizer"}
    ):
        return "cable organizer"
    key = " ".join(sorted(token_set))
    if key:
        return key
    fallback_basis = "|".join(
        unicodedata.normalize("NFKC", str(concept.get(field) or "")).casefold()
        for field in ("name", "productType")
    )
    return f"concept {hashlib.sha256(fallback_basis.encode('utf-8')).hexdigest()}"


def _excluded_concept_keys(input_data: dict) -> set[str]:
    values = input_data.get("excludedConceptKeys")
    if not isinstance(values, list):
        return set()
    keys = set()
    for value in values[:2_000]:
        key = str(value or "").strip().casefold()
        if len(key) <= 500 and re.fullmatch(
            r"[^\W_]+(?: [^\W_]+)*", key, flags=re.UNICODE
        ):
            keys.add(key)
    return keys


def _excluded_sourcing_offer_ids(input_data: dict) -> set[str]:
    values = input_data.get("excludedSourcingOfferIds")
    if not isinstance(values, list):
        return set()
    return {
        str(value)
        for value in values[:5_000]
        if re.fullmatch(r"[1-9]\d{0,31}", str(value or ""))
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


def _safe_bound_https_url(value: str, domains: tuple[str, ...]) -> str | None:
    if not value or len(value) > 4096:
        return None
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port is not None
        or not _domain_allowed(value, domains)
    ):
        return None
    try:
        query_pairs = parse_qsl(
            parsed.query.replace(";", "&"),
            keep_blank_values=True,
            max_num_fields=100,
        )
    except ValueError:
        return None
    for query_key, _query_value in query_pairs:
        normalized_key = re.sub(r"[^a-z0-9]", "", query_key.casefold())
        if normalized_key and normalized_key.endswith(
            _SENSITIVE_URL_QUERY_KEY_SUFFIXES
        ):
            return None
    return value


def _source_bound_result_image(
    result: dict,
    page_domains: tuple[str, ...],
    image_validator=validate_remote_product_image,
) -> dict[str, str]:
    """Keep only provider fields that are explicitly bound to one result page."""

    provider = str(result.get("provider") or "").strip().casefold()
    result_type = str(result.get("result_type") or "").strip().casefold()
    if provider != "tavily" and not (
        provider == "serper" and result_type == "shopping"
    ):
        return {}
    page_url = str(result.get("url") or "").strip()
    image_url = str(result.get("image_url") or "").strip()
    if not page_url or not image_url or page_url == image_url:
        return {}
    if not _safe_bound_https_url(page_url, page_domains):
        return {}
    image_domains = tuple(
        image_domain
        for page_domain in page_domains
        for image_domain in _MARKETPLACE_IMAGE_DOMAINS.get(page_domain, ())
    )
    if not image_domains or not _safe_bound_https_url(image_url, image_domains):
        return {}
    try:
        if not image_validator(image_url):
            return {}
    except Exception:
        return {}
    return {"imageUrl": image_url, "imageEvidenceUrl": page_url}


def _discovery_budget_seconds() -> int:
    try:
        configured = int(
            os.getenv(
                "GLOBAL_DISCOVERY_BUDGET_SECONDS",
                str(_DEFAULT_DISCOVERY_BUDGET_SECONDS),
            )
        )
    except (TypeError, ValueError):
        configured = _DEFAULT_DISCOVERY_BUDGET_SECONDS
    return max(60, min(configured, _MAX_DISCOVERY_BUDGET_SECONDS))


def _deadline_kwargs(callback, deadline_monotonic: float, monotonic_fn) -> dict:
    try:
        parameters = inspect.signature(callback).parameters.values()
    except (TypeError, ValueError):
        return {}
    accepts_kwargs = any(
        parameter.kind is inspect.Parameter.VAR_KEYWORD
        for parameter in parameters
    )
    names = {parameter.name for parameter in parameters}
    options = {}
    if accepts_kwargs or "deadline_monotonic" in names:
        options["deadline_monotonic"] = deadline_monotonic
    if accepts_kwargs or "monotonic_fn" in names:
        options["monotonic_fn"] = monotonic_fn
    return options


def _safe_results(
    search_fn,
    query: str,
    stats: dict,
    limit: int = 8,
    budget_guard=None,
    deadline_monotonic: float | None = None,
    monotonic_fn=time.monotonic,
) -> list[dict]:
    if budget_guard and not budget_guard():
        return []
    stats["attempts"] += 1
    try:
        deadline_options = (
            _deadline_kwargs(search_fn, deadline_monotonic, monotonic_fn)
            if deadline_monotonic is not None
            else {}
        )
        results = search_fn(query, num_results=limit, **deadline_options)
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
    return _default_seed_frontier(input_data)[:2]


def _default_seed_frontier(input_data: dict) -> list[str]:
    exploration_key = str(input_data.get("explorationKey") or "").strip()
    rotation_key = exploration_key or str(input_data.get("businessDate") or "")
    digest = hashlib.sha256(rotation_key.encode("utf-8")).digest()
    offset = int.from_bytes(digest[:8], "big") % len(DEFAULT_SEED_QUERIES)
    return [
        DEFAULT_SEED_QUERIES[(offset + index) % len(DEFAULT_SEED_QUERIES)]
        for index in range(DISCOVERY_SEEDS_PER_RUN)
    ]


def _seed_batches(input_data: dict) -> list[list[str]]:
    supplied = input_data.get("seedQueries")
    if isinstance(supplied, list):
        cleaned = [str(item).strip() for item in supplied if str(item).strip()]
        if cleaned:
            return [cleaned[:4]]
    frontier = _default_seed_frontier(input_data)
    return [frontier[index : index + 2] for index in range(0, len(frontier), 2)]


def _concept_limit(input_data: dict) -> int:
    """Cap normalized products, not their per-market evidence observations."""
    requested = int(input_data.get("candidateLimit") or 25)
    configured = int(os.getenv("GLOBAL_DISCOVERY_MAX_CONCEPTS", "10"))
    return max(1, min(configured, requested, 10))


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
    concept: dict,
    provider: str,
    fetched_at: str,
    search_fn,
    stats: dict,
    budget_guard=None,
    deadline_monotonic: float | None = None,
    monotonic_fn=time.monotonic,
):
    query = str(concept.get("ozonQuery") or concept["name"]).strip()
    required_terms = [
        str(term).strip().casefold()
        for term in concept.get("ozonRequiredTerms", [])
        if str(term).strip()
    ][:3]
    search_query = f"site:ozon.ru/product {query}"
    results = _safe_results(
        search_fn,
        search_query,
        stats,
        limit=10,
        budget_guard=budget_guard,
        deadline_monotonic=deadline_monotonic,
        monotonic_fn=monotonic_fn,
    )
    if budget_guard and stats.get("budgetExhausted"):
        return None
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
        "platformFeeRate": None,
        "paymentFeeRate": None,
        "adRate": None,
        "refundRate": None,
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


def _canonical_1688_offer_url(value: object) -> str | None:
    raw = str(value or "").strip()
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme != "https"
        or parsed.hostname != "detail.1688.com"
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
    ):
        return None
    match = re.fullmatch(r"/offer/([1-9]\d{0,31})\.html", parsed.path)
    if not match:
        return None
    return f"https://detail.1688.com/offer/{match.group(1)}.html"


def _normalized_cjk_text(value: object) -> str:
    return "".join(
        unicodedata.normalize("NFKC", str(value or "")).casefold().split()
    )


def _sourcing_1688_lead(
    concept: dict,
    provider: str,
    search_fn,
    stats: dict,
    budget_guard=None,
    deadline_monotonic: float | None = None,
    monotonic_fn=time.monotonic,
    seen_offer_ids: set[str] | None = None,
    sourcing_stats: dict | None = None,
) -> dict | None:
    # Re-derive from the static allowlist at the execution boundary. Never trust
    # model- or request-supplied query operators or product claims.
    from web.services.platform_tasks import _controlled_1688_sourcing_terms

    controlled = _controlled_1688_sourcing_terms(
        str(concept.get("name") or ""),
        str(concept.get("productType") or ""),
    )
    if not controlled:
        if sourcing_stats is not None:
            sourcing_stats["unmapped"] = sourcing_stats.get("unmapped", 0) + 1
        return None
    query, required_terms = controlled
    if sourcing_stats is not None:
        sourcing_stats["attempted"] = sourcing_stats.get("attempted", 0) + 1
    search_query = f"site:detail.1688.com/offer {query}"
    results = _safe_results(
        search_fn,
        search_query,
        stats,
        limit=10,
        budget_guard=budget_guard,
        deadline_monotonic=deadline_monotonic,
        monotonic_fn=monotonic_fn,
    )
    if not results and sourcing_stats is not None:
        sourcing_stats["noResults"] = sourcing_stats.get("noResults", 0) + 1
    normalized_terms = [_normalized_cjk_text(term) for term in required_terms]
    for item in results:
        url = _canonical_1688_offer_url(item.get("url"))
        if not url:
            if sourcing_stats is not None:
                sourcing_stats["invalidUrl"] = (
                    sourcing_stats.get("invalidUrl", 0) + 1
                )
            continue
        haystack = _normalized_cjk_text(
            f"{item.get('title') or ''} {item.get('snippet') or ''}"
        )
        if not all(term and term in haystack for term in normalized_terms):
            if sourcing_stats is not None:
                sourcing_stats["termMismatch"] = (
                    sourcing_stats.get("termMismatch", 0) + 1
                )
            continue
        offer_id = url.removeprefix("https://detail.1688.com/offer/").removesuffix(
            ".html"
        )
        if seen_offer_ids is not None and offer_id in seen_offer_ids:
            if sourcing_stats is not None:
                sourcing_stats["duplicateOffer"] = (
                    sourcing_stats.get("duplicateOffer", 0) + 1
                )
            continue
        if seen_offer_ids is not None:
            seen_offer_ids.add(offer_id)
        return {
            "source": "1688_public_sourcing_lead",
            "evidenceGroupKey": _concept_evidence_group_key(concept),
            "provider": str(item.get("provider") or provider),
            "externalId": offer_id,
            "url": url,
            "market": "CN",
            "name": concept["name"],
            "productType": concept["productType"],
            "material": None,
            "primaryUse": None,
            "customizationMethod": None,
            "targetAudience": None,
            "salePrice": None,
            "currency": None,
            "costs": [],
            "platformFeeRate": None,
            "paymentFeeRate": None,
            "adRate": None,
            "refundRate": None,
            "signals": [],
            "risks": [],
            "evidenceTitle": _bounded_text(item.get("title"), 500),
            "evidenceSnippet": _bounded_text(item.get("snippet"), 2_000),
            "evidenceQuery": _bounded_text(search_query, 500),
            "evidenceScope": (
                "Public search-engine index of a 1688 offer page. Supplier "
                "availability, MOQ, product specifications, package weight, "
                "dimensions, export eligibility, and procurement price are "
                "not verified; this record is a sourcing lead only."
            ),
            "sourcingQueryZh": query,
        }
    return None


def _image_evidence(
    concept: str,
    image_search_fn,
    image_validator=validate_remote_product_image,
    budget_guard=None,
    deadline_monotonic: float | None = None,
    monotonic_fn=time.monotonic,
) -> dict | None:
    if budget_guard and not budget_guard():
        return None
    try:
        deadline_options = (
            _deadline_kwargs(image_search_fn, deadline_monotonic, monotonic_fn)
            if deadline_monotonic is not None
            else {}
        )
        results = image_search_fn(
            f"{concept} product",
            num_results=8,
            **deadline_options,
        )
    except Exception:
        return None
    for item in results:
        if not isinstance(item, dict) or not _relevant(concept, item):
            continue
        page_url = str(item.get("url") or "").strip()
        image_url = str(item.get("image_url") or "").strip()
        for source in MARKETPLACES:
            page_domains = source["domains"]
            if not _safe_bound_https_url(page_url, page_domains):
                continue
            image_domains = tuple(
                image_domain
                for page_domain in page_domains
                for image_domain in _MARKETPLACE_IMAGE_DOMAINS.get(
                    page_domain, ()
                )
            )
            if _safe_bound_https_url(image_url, image_domains):
                try:
                    image_is_valid = bool(image_validator(image_url))
                except Exception:
                    image_is_valid = False
                if not image_is_valid:
                    continue
                return {
                    "imageUrl": image_url,
                    "imageEvidenceUrl": page_url,
                }
    return None


def _attach_image_to_matching_evidence(
    evidence: list[dict], image: dict[str, str]
) -> bool:
    """Attach an image only to evidence from the same validated marketplace."""

    page_url = str(image.get("imageEvidenceUrl") or "").strip()
    for source in MARKETPLACES:
        page_domains = source["domains"]
        if not _safe_bound_https_url(page_url, page_domains):
            continue
        for item in evidence:
            if item.get("source") != source["source"]:
                continue
            evidence_url = str(item.get("url") or "").strip()
            if _safe_bound_https_url(evidence_url, page_domains):
                item.update(image)
                return True
        return False
    return False


def _shopping_price_evidence(
    concept: dict,
    fetched_at: str,
    shopping_search_fn,
    stats: dict,
    image_validator=validate_remote_product_image,
    budget_guard=None,
    deadline_monotonic: float | None = None,
    monotonic_fn=time.monotonic,
) -> dict | None:
    if budget_guard and not budget_guard():
        return None
    stats["shoppingAttempts"] += 1
    try:
        deadline_options = (
            _deadline_kwargs(
                shopping_search_fn,
                deadline_monotonic,
                monotonic_fn,
            )
            if deadline_monotonic is not None
            else {}
        )
        results = shopping_search_fn(
            concept["name"],
            num_results=8,
            **deadline_options,
        )
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
        if image_url:
            parsed_image = urlparse(image_url)
            image_domain = parsed_image.hostname or ""
            if not image_domain or not _safe_bound_https_url(
                image_url,
                (image_domain,),
            ):
                image_url = None
            else:
                try:
                    if not image_validator(image_url):
                        image_url = None
                except Exception:
                    image_url = None
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
            "platformFeeRate": None,
            "paymentFeeRate": None,
            "adRate": None,
            "refundRate": None,
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
    image_validator=validate_remote_product_image,
    monotonic_fn=time.monotonic,
) -> dict:
    """Discover and verify concepts without allowing model-generated facts."""
    provider, _ = resolve_search_provider()
    if not provider:
        raise ValueError("No real web-search provider is configured")
    fetched_at = _iso_now()
    budget_seconds = _discovery_budget_seconds()
    budget_started_at = monotonic_fn()
    budget_deadline = budget_started_at + budget_seconds
    stats = {
        "attempts": 0,
        "successes": 0,
        "failures": [],
        "providers": [],
        "shoppingAttempts": 0,
        "shoppingSuccesses": 0,
        "imageValidationAttempts": 0,
        "imageValidationAccepted": 0,
        "imageValidationRejected": 0,
        "budgetExhausted": False,
    }

    def budget_allows_external_call() -> bool:
        if monotonic_fn() < budget_deadline:
            return True
        stats["budgetExhausted"] = True
        return False

    image_validation_cache: dict[str, object | None] = {}

    def verify_product_image(image_url: str):
        if image_url in image_validation_cache:
            return image_validation_cache[image_url]
        if not budget_allows_external_call():
            return None
        stats["imageValidationAttempts"] += 1
        try:
            options = _deadline_kwargs(
                image_validator,
                budget_deadline,
                monotonic_fn,
            )
            validation = image_validator(image_url, **options)
        except Exception:
            validation = None
        if not budget_allows_external_call():
            validation = None
        if validation:
            stats["imageValidationAccepted"] += 1
        else:
            stats["imageValidationRejected"] += 1
        image_validation_cache[image_url] = validation
        return validation

    raw_items = []
    seed_batches = _seed_batches(input_data)
    attempted_seed_queries = []
    seed_batches_attempted = 0
    if progress:
        progress("global_discovery", "正在检索全球市场真实成交与评价证据")
    for seed_batch in seed_batches:
        if not budget_allows_external_call():
            break
        seed_batches_attempted += 1
        for seed in seed_batch:
            if not budget_allows_external_call():
                break
            attempted_seed_queries.append(seed)
            for source in _DISCOVERY_SOURCES:
                if not budget_allows_external_call():
                    break
                query = f"{source['site']} {seed} {source['metricHint']}"
                for item in _safe_results(
                    search_fn,
                    query,
                    stats,
                    limit=6,
                    budget_guard=budget_allows_external_call,
                    deadline_monotonic=budget_deadline,
                    monotonic_fn=monotonic_fn,
                ):
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
            if stats["budgetExhausted"]:
                break
        if stats["budgetExhausted"]:
            break
    if (
        not raw_items
        and stats["failures"]
        and not stats["budgetExhausted"]
    ):
        raise RuntimeError("Global marketplace searches failed without usable evidence")

    max_concepts = _concept_limit(input_data)
    concept_attempt_limit = min(30, max_concepts * 3)
    concepts = []
    if raw_items and budget_allows_external_call():
        concepts = normalize_titles(
            raw_items,
            **_deadline_kwargs(
                normalize_titles,
                budget_deadline,
                monotonic_fn,
            ),
        )[:concept_attempt_limit]
    excluded_by_light_small_screen = 0
    duplicate_concept_count = 0
    excluded_by_history_count = 0
    historical_concept_keys = _excluded_concept_keys(input_data)
    screened_concepts = []
    seen_concept_keys = set()
    for concept in concepts:
        if not _is_light_small_export_concept(concept):
            excluded_by_light_small_screen += 1
            continue
        semantic_key = _semantic_concept_key(concept)
        if semantic_key in historical_concept_keys:
            excluded_by_history_count += 1
            continue
        if not semantic_key or semantic_key in seen_concept_keys:
            duplicate_concept_count += 1
            continue
        seen_concept_keys.add(semantic_key)
        normalized_concept = dict(concept)
        normalized_concept["conceptKey"] = semantic_key
        screened_concepts.append(normalized_concept)
    concepts = screened_concepts
    candidates = []
    partial_evidence_count = 0
    evidence_gaps = []
    accepted = 0
    sourcing_lead_count = 0
    seen_sourcing_offer_ids = _excluded_sourcing_offer_ids(input_data)
    sourcing_stats = {
        "attempted": 0,
        "unmapped": 0,
        "noResults": 0,
        "invalidUrl": 0,
        "termMismatch": 0,
        "duplicateOffer": 0,
    }
    for concept in concepts:
        if not budget_allows_external_call():
            break
        evidence = []
        for source in MARKETPLACES:
            if not budget_allows_external_call():
                break
            query = f"{source['site']} \"{concept['name']}\" {source['metricHint']}"
            results = _safe_results(
                search_fn,
                query,
                stats,
                limit=8,
                budget_guard=budget_allows_external_call,
                deadline_monotonic=budget_deadline,
                monotonic_fn=monotonic_fn,
            )
            strongest = _strongest_listing(
                concept["name"], results, source["domains"]
            )
            if not strongest:
                continue
            item, metrics = strongest
            source_bound_image = _source_bound_result_image(
                item,
                source["domains"],
                verify_product_image,
            )
            evidence.append(
                {
                    "source": source["source"],
                    "conceptKey": concept["conceptKey"],
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
                    "platformFeeRate": None,
                    "paymentFeeRate": None,
                    "adRate": None,
                    "refundRate": None,
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
                    **source_bound_image,
                }
            )

        if not budget_allows_external_call():
            break
        independent_source_count = len({item["source"] for item in evidence})
        if independent_source_count < 2:
            if evidence:
                # Preserve real observations instead of discarding them.  The
                # backend keeps the resulting concept in PARTIAL/HOLD state;
                # no price or cost is invented to make it pass the gate.
                candidates.extend(evidence)
                partial_evidence_count += len(evidence)
                evidence_gaps.append(
                    {
                        "conceptKey": concept["conceptKey"],
                        "conceptName": concept["name"],
                        "foundIndependentSources": independent_source_count,
                        "requiredIndependentSources": 2,
                        "missingIndependentSources": 2 - independent_source_count,
                    }
                )
            continue
        ozon = _ozon_sample(
            concept,
            provider,
            fetched_at,
            search_fn,
            stats,
            budget_guard=budget_allows_external_call,
            deadline_monotonic=budget_deadline,
            monotonic_fn=monotonic_fn,
        )
        if ozon is None:
            break
        shopping = _shopping_price_evidence(
            concept,
            fetched_at,
            shopping_search_fn,
            stats,
            image_validator=verify_product_image,
            budget_guard=budget_allows_external_call,
            deadline_monotonic=budget_deadline,
            monotonic_fn=monotonic_fn,
        )
        if shopping:
            shopping["conceptKey"] = concept["conceptKey"]
            evidence.append(shopping)
        sourcing_lead = _sourcing_1688_lead(
            concept,
            provider,
            search_fn,
            stats,
            budget_guard=budget_allows_external_call,
            deadline_monotonic=budget_deadline,
            monotonic_fn=monotonic_fn,
            seen_offer_ids=seen_sourcing_offer_ids,
            sourcing_stats=sourcing_stats,
        )
        if sourcing_lead:
            sourcing_lead["conceptKey"] = concept["conceptKey"]
            evidence.append(sourcing_lead)
            sourcing_lead_count += 1
        image = _image_evidence(
            concept["name"],
            image_search_fn,
            image_validator=verify_product_image,
            budget_guard=budget_allows_external_call,
            deadline_monotonic=budget_deadline,
            monotonic_fn=monotonic_fn,
        )
        if not budget_allows_external_call():
            break
        if image:
            _attach_image_to_matching_evidence(evidence, image)
        from web.services.platform_tasks import _controlled_1688_sourcing_terms

        controlled_sourcing = _controlled_1688_sourcing_terms(
            concept["name"], concept["productType"]
        )
        sourcing_query_zh = controlled_sourcing[0] if controlled_sourcing else ""
        if sourcing_query_zh:
            for item in evidence:
                item["sourcingQueryZh"] = sourcing_query_zh
            ozon["sourcingQueryZh"] = sourcing_query_zh
        ozon["conceptKey"] = concept["conceptKey"]
        candidates.extend(evidence)
        candidates.append(ozon)
        accepted += 1
        if accepted >= max_concepts or stats["budgetExhausted"]:
            break

    provider_summary = (
        stats["providers"][0]
        if len(stats["providers"]) == 1
        else ",".join(stats["providers"])
        if stats["providers"]
        else provider
    )
    budget_elapsed_ms = max(
        0,
        int((monotonic_fn() - budget_started_at) * 1_000),
    )
    insufficient_evidence = accepted < max_concepts
    maximum_observed_sources = max(
        (
            int(item["foundIndependentSources"])
            for item in evidence_gaps
        ),
        default=0,
    )
    return {
        "status": "PARTIAL" if insufficient_evidence else "COMPLETED",
        "errorCode": "EVIDENCE_INSUFFICIENT" if insufficient_evidence else None,
        "candidates": candidates,
        "provider": provider_summary,
        "fetchedAt": fetched_at,
        "conceptCount": accepted,
        "requestedConceptCount": max_concepts,
        "acceptedConceptCount": accepted,
        "rawEvidenceCount": len(candidates),
        "partialEvidenceCount": partial_evidence_count,
        "evidenceGap": {
            "requiredIndependentSources": 2,
            "maximumObservedIndependentSources": maximum_observed_sources,
            "partialConceptCount": len(evidence_gaps),
            "gaps": evidence_gaps,
        },
        "attemptedProviders": stats["providers"] or [provider],
        "discoveryEvidenceCount": len(raw_items),
        "sourcingLeadCount": sourcing_lead_count,
        "excludedByLightSmallScreen": excluded_by_light_small_screen,
        "duplicateConceptCount": duplicate_concept_count,
        "excludedByHistoryCount": excluded_by_history_count,
        "duplicateSourcingOfferCount": sourcing_stats["duplicateOffer"],
        "sourcingSearchAttemptCount": sourcing_stats["attempted"],
        "sourcingUnmappedConceptCount": sourcing_stats["unmapped"],
        "sourcingNoResultCount": sourcing_stats["noResults"],
        "sourcingInvalidUrlCount": sourcing_stats["invalidUrl"],
        "sourcingTermMismatchCount": sourcing_stats["termMismatch"],
        "expansionRounds": max(0, seed_batches_attempted - 1),
        "shortfall": max(0, max_concepts - accepted),
        "exhaustedSources": (
            accepted < max_concepts and not stats["budgetExhausted"]
        ),
        "budgetExhausted": stats["budgetExhausted"],
        "budgetSeconds": budget_seconds,
        "budgetElapsedMs": budget_elapsed_ms,
        "searchAttempts": stats["attempts"],
        "searchSuccesses": stats["successes"],
        "shoppingAttempts": stats["shoppingAttempts"],
        "shoppingSuccesses": stats["shoppingSuccesses"],
        "searchFailures": stats["failures"],
        "methodology": {
            "seedQueries": attempted_seed_queries,
            "searchProviders": stats["providers"] or [provider],
            "demand": "Only explicit sold/orders/reviews/ratings values from public marketplace search results.",
            "ozonSupply": "Relevant results in a capped Ozon public web-search sample; not a full-catalog absence claim.",
            "sourcing1688": "Chinese queries come only from a controlled product-class lexicon. A strictly canonical public-index 1688 offer URL is stored only as a sourcing lead; no displayed price becomes procurement evidence and unknown rates remain null.",
            "lightSmallScreen": {
                "profile": "LIGHT_SMALL_NON_ELECTRIC_CLASS_SCREEN_V2",
                "excludedConceptCount": excluded_by_light_small_screen,
                "duplicateConceptCount": duplicate_concept_count,
                "excludedByHistoryCount": excluded_by_history_count,
                "specStatus": "SUPPLIER_WEIGHT_AND_DIMENSIONS_UNVERIFIED",
            },
            "evidenceGrouping": "All observations for one normalized discovery concept share an explicit stable group key while retaining their source-specific external ids.",
            "budget": "A monotonic execution budget stops new external calls and returns only evidence already verified before exhaustion.",
            "imageQuality": {
                "policy": "REMOTE_RASTER_PRODUCT_IMAGE_V1",
                "attempts": stats["imageValidationAttempts"],
                "accepted": stats["imageValidationAccepted"],
                "rejected": stats["imageValidationRejected"],
                "minimumDimensions": "180x180",
                "maximumAspectRatio": "3:1",
                "validation": "HTTPS public-address download plus declared MIME, decoded raster format, byte-size, dimensions and aspect-ratio checks; failures are omitted.",
            },
            "budgetSeconds": budget_seconds,
            "budgetExhausted": stats["budgetExhausted"],
            "externalStoreMutation": False,
        },
    }
