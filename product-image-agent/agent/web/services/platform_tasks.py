"""platformtext — english_texttaskenglish_text（LLM text）。

text /api/v1/agent/runs english_text taskType text：
    product_research / assistant_chat / listing_generation /
    keyword_analysis / trend_analysis / image_prompt / automation_step

english_text：
- text commerce_llm text OpenAI textconfiguration（OPENAI_API_KEY / OPENAI_API_BASE / LLM_MODEL）
- textconfiguration Key text**textfailed**（text ValueError），english_textdata
- outputenglish_text ShopMate backend HttpAgentProvider english_text
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime

from web.services.commerce_llm import _api_key, _extract_json
from web.services.llm_runtime import (
    configured_key_candidates,
    configured_model_candidates,
    mark_quota_exhausted,
    mark_success,
    mark_unavailable,
    snapshot as llm_runtime_snapshot,
)

DEFAULT_TIMEOUT = 90
_TRUE_VALUES = {"1", "true", "on", "yes"}
_CJK_RE = re.compile(r"[\u3400-\u9fff]")
_OZON_SEARCH_QUERY_RE = re.compile(
    r"[A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u04510-9\s-]{2,120}"
)
_OZON_SEARCH_TERM_RE = re.compile(r"[A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451-]{2,40}")
_OZON_TERM_STOPWORDS = {
    "ozon",
    "без",
    "для",
    "из",
    "купить",
    "на",
    "по",
    "под",
    "при",
    "с",
    "товар",
    "цена",
    "и",
    "в",
}
_OZON_QUERY_TRANSLATION_PROMPT = """You are a terminology translator for Ozon product search.
Translate the seller's Chinese product query into the precise Russian Ozon listing
terms. Do not broaden or narrow the product class. Do not add brands, features,
prices, claims, market data, or shopping advice. Return only JSON:
{"searchQuery":"2-8 Russian search words","requiredTerms":["1-3 core Russian terms"]}.
Each requiredTerms item must be exactly one Russian product word, never a phrase or
preposition. Every required term must occur verbatim in searchQuery."""
_GLOBAL_DISCOVERY_NORMALIZATION_PROMPT = """You normalize real marketplace search
titles into product concepts for evidence collection. Do not invent sales, demand,
prices, brands, features, or market claims. Remove store and brand names. Keep only
the concrete product class visible in each supplied title. Also translate that same
product class into a precise Russian Ozon search query. Return only JSON:
{"concepts":[{"sourceIndex":0,"name":"2-8 English product words",
"productType":"2-8 English product words","ozonQuery":"2-8 Russian search words",
"ozonRequiredTerms":["1-3 core Russian product words"]}]}. Include at most one
concept per sourceIndex and at most 10 concepts."""


def _text_mock_enabled() -> bool:
    """Return deterministic text-task payloads for local platform QA."""
    return os.getenv("COMMERCE_AGENT_MOCK", "").strip().lower() in _TRUE_VALUES


def _resolve_ozon_search_intent(product_name: str) -> dict:
    """Resolve product input into bounded, auditable Ozon search terms.

    Translation is not treated as market evidence. The returned terms are used as
    a hard candidate filter so the model cannot turn a car-fan request into a
    generic portable-fan report.
    """
    query = str(product_name or "").strip()
    if not query:
        raise ValueError("product name is required for Ozon research")
    if not _CJK_RE.search(query):
        from web.services.research_evidence import derive_ozon_query_terms

        required_terms = derive_ozon_query_terms(query)
        if not required_terms:
            raise ValueError("Ozon query did not contain verifiable listing terms")
        return {
            "searchQuery": query,
            "requiredTerms": required_terms,
            "strategy": "original_query_terms",
        }

    translated = _chat_json(
        _OZON_QUERY_TRANSLATION_PROMPT,
        {"marketplace": "Ozon", "query": query},
        timeout=20,
    )
    search_query = str(translated.get("searchQuery") or "").strip()
    if not _OZON_SEARCH_QUERY_RE.fullmatch(search_query):
        raise ValueError("Ozon query translation returned an unsafe search query")

    required_terms: list[str] = []
    raw_terms = translated.get("requiredTerms")
    if isinstance(raw_terms, list):
        for raw_term in raw_terms:
            # Compatible gateways sometimes return a short phrase despite the
            # single-word contract. Split it into bounded lexical terms rather
            # than discarding the whole translation.
            for token in _OZON_SEARCH_TERM_RE.findall(str(raw_term or "").casefold()):
                if token in _OZON_TERM_STOPWORDS:
                    continue
                if not re.search(
                    rf"(?<!\w){re.escape(token)}(?!\w)", search_query.casefold()
                ):
                    continue
                if token not in required_terms:
                    required_terms.append(token)
                if len(required_terms) >= 3:
                    break
            if len(required_terms) >= 3:
                break
    if not required_terms:
        raise ValueError("Ozon query translation did not return required listing terms")
    return {
        "searchQuery": search_query,
        "requiredTerms": required_terms,
        "strategy": "translated_query_terms",
    }


def _list_strings(value, fallback: list[str] | None = None) -> list[str]:
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        if cleaned:
            return cleaned
    return fallback or []


def _mock_text_task_result(task_type: str, input_data: dict) -> dict:
    product = str(input_data.get("productName") or input_data.get("query") or "Product").strip()
    marketplace = str(input_data.get("marketplace") or "amazon.com").strip()
    keywords = _list_strings(input_data.get("keywords"), [product.lower(), "gift", "portable"])
    seed_keywords = _list_strings(input_data.get("seedKeywords"), keywords)
    category = str(input_data.get("category") or product or "general").strip()

    if task_type == "product_research":
        return {
            "summary": (
                f"Local QA mock research for {product} on {marketplace}. "
                "The product should be validated on price, differentiation, shipping risk, "
                "and review density before launch."
            ),
            "competitors": [
                f"{product} value bundle",
                f"{product} premium kit",
                f"{product} travel version",
            ],
            "priceRange": {"min": 19.99, "max": 49.99},
            "rating": 4.3,
            "qualityScore": 82,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "global_product_discovery":
        return {
            "candidates": [],
            "provider": "mock",
            "fetchedAt": datetime.utcnow().isoformat() + "Z",
            "conceptCount": 0,
            "searchAttempts": 0,
            "searchSuccesses": 0,
            "searchFailures": [],
            "methodology": {
                "externalStoreMutation": False,
                "mockMode": True,
            },
            "mockMode": True,
        }
    if task_type == "assistant_chat":
        prompt = str(input_data.get("prompt") or "").strip()
        return {
            "response": (
                "Local platform QA is connected to the Python agent integration API; "
                f"this response is from explicit mock mode. Prompt: {prompt}"
            ),
            "qualityScore": 80,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "listing_generation":
        platform = str(input_data.get("platform") or "amazon").strip()
        return {
            "title": f"{product} for {platform.title()} - Portable Everyday Upgrade",
            "description": (
                f"{product} is positioned as a practical cross-border listing candidate. "
                "Use the final copy only after checking claims, dimensions, and compliance."
            ),
            "bulletPoints": [
                "Clear value proposition for fast customer scanning",
                "Practical feature framing without unverifiable brand claims",
                "Keyword coverage suitable for early listing validation",
                "Benefit-led copy that can be localized per marketplace",
                "QA mock output for frontend and backend integration testing",
            ],
            "keywords": keywords[:10],
            "price": 29.99,
            "qualityScore": 84,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "keyword_analysis":
        return {
            "keywords": [
                {
                    "keyword": keyword,
                    "volume": 1200 + index * 350,
                    "difficulty": min(80, 35 + index * 7),
                }
                for index, keyword in enumerate(seed_keywords[:10])
            ],
            "qualityScore": 81,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "trend_analysis":
        return {
            "trends": [
                {
                    "name": f"{category} giftable bundles",
                    "growth": 18,
                    "seasonality": "Strongest around Q4 and gifting events",
                },
                {
                    "name": f"{category} portable use cases",
                    "growth": 12,
                    "seasonality": "Steady demand with travel-related peaks",
                },
                {
                    "name": f"{category} premium materials",
                    "growth": 9,
                    "seasonality": "Less seasonal, driven by review quality",
                },
            ],
            "qualityScore": 80,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "image_prompt":
        style = str(input_data.get("style") or "clean studio product photography").strip()
        platform = str(input_data.get("platform") or "marketplace").strip()
        return {
            "prompt": (
                f"{style} for {product}, optimized for {platform}, accurate product geometry, "
                "natural shadows, commercial lighting, no logos, no misleading text overlays."
            ),
            "negativePrompt": "logos, trademarks, distorted product, extra text, unsafe claims",
            "qualityScore": 83,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "automation_step":
        step_type = str(input_data.get("stepType") or "unknown").strip()
        return {
            "executed": True,
            "stepType": step_type,
            "result": {"mode": "mock", "params": input_data.get("params") or {}},
            "note": "Deterministic local mock used for platform integration QA.",
            "qualityScore": 80,
            "qualityRationale": "Deterministic local mock used for platform integration QA.",
            "mockMode": True,
        }
    if task_type == "plan_and_execute":
        goal = str(input_data.get("goal") or "").strip()
        return {
            "status": "completed",
            "total_steps": 1,
            "completed_steps": 1,
            "failed_steps": 0,
            "results": [
                {
                    "step": 1,
                    "tool": "local_mock",
                    "status": "completed",
                    "output": {"goal": goal, "note": "Local QA mock plan executed."},
                }
            ],
            "final_context": {"goal": goal, "mockMode": True},
            "mockMode": True,
        }
    raise ValueError(f"Unsupported text task: {task_type}")

_TASK_SPECS: dict[str, dict] = {
    "global_product_discovery": {
        "system": (
            "Deterministic evidence collection task. Models may normalize product "
            "terminology but may not provide market facts or metrics. The service "
            'returns JSON with "candidates", "provider", "fetchedAt", and '
            '"methodology" fields.'
        ),
    },
    "product_research": {
        "system": (
            "You are a cross-border e-commerce market researcher. Given a product name and "
            "marketplace, produce a concise research digest grounded only in supplied sourceEvidence. "
            "Do not invent competitors, prices, ratings, rankings, or demand claims. "
            "If input.storeContext is supplied, treat its target categories, forbidden terms, "
            "and review lessons as seller constraints; do not claim a profit margin without "
            "a verified cost input. "
            "Be explicit about source limits and uncertainty in the summary. "
            'Return ONLY JSON: {"summary": "<3-5 sentences>", '
            '"competitors": ["<brand or product>", ...max 5], '
            '"priceRange": {"min": <number>, "max": <number>, "currency": "RUB"}, '
            '"rating": <number 1-5 or null>}'
        ),
    },
    "assistant_chat": {
        "system": (
            "You are ShopMate, a professional cross-border e-commerce operations assistant. "
            "Answer the user's question helpfully and concisely in the user's language. "
            'Return ONLY JSON: {"response": "<your answer>"}'
        ),
    },
    "listing_generation": {
        "system": (
            "You are an expert e-commerce copywriter. Generate listing copy for the given "
            "product and platform. No brand names you cannot verify, no keyword stuffing. "
            "If the user payload includes organization-specific `knowledge`, use the proven "
            "structure and tone as style guidance without copying exact text. "
            'Return ONLY JSON: {"title": "<max 180 chars>", "description": "<2-4 paragraphs>", '
            '"bulletPoints": ["<point>", ...exactly 5], "keywords": ["<kw>", ...max 10], '
            '"price": <suggested USD number or null>}'
        ),
    },
    "keyword_analysis": {
        "system": (
            "You are an e-commerce SEO keyword analyst. Expand the seed keywords into related "
            "search keywords for the marketplace. Volumes are best-effort estimates (monthly "
            "searches) and difficulty is 0-100. "
            'Return ONLY JSON: {"keywords": [{"keyword": "<kw>", "volume": <int>, '
            '"difficulty": <int 0-100>}, ...10-20 items]}'
        ),
    },
    "trend_analysis": {
        "system": (
            "You are an evidence-bound Ozon category analyst. Describe only qualitative "
            "observations supported by the supplied Ozon public source evidence. Never infer "
            "growth, demand volume, ranking change, or a time series from search snippets. "
            'Return ONLY JSON: {"trends": [{"name": "<observation>", '
            '"seasonality": "<short evidence-bound description>"}, ...2-5 items]}'
        ),
    },
    "image_prompt": {
        "system": (
            "You are a product photography prompt engineer. Write one detailed English "
            "image-generation prompt for the product (60-120 words, photography direction "
            "style, no logos/trademarks/celebrities). "
            'Return ONLY JSON: {"prompt": "<prompt>", "negativePrompt": "<things to avoid>"}'
        ),
    },
    "automation_step": {
        "system": (
            "You are an e-commerce automation step executor. Given a stepType, params and "
            "context, produce the step's structured output. If the step cannot be meaningfully "
            "executed from text alone, set executed=false and explain why in note. "
            'Return ONLY JSON: {"executed": <bool>, "stepType": "<echo>", '
            '"result": <object with the step output>, "note": "<short note>"}'
        ),
    },
    "plan_and_execute": {
        "system": (
            "Planner task. The planner implementation performs its own LLM calls; "
            "this contract string documents the required output shape. "
            'Return ONLY JSON: {"status": "<completed|partial|failed>", '
            '"results": [<step results>], "total_steps": <number>, '
            '"completed_steps": <number>, "failed_steps": <number>, '
            '"final_context": <object>}'
        ),
    },
}


def _run_plan_and_execute(input_data: dict, progress=None) -> dict:
    """Run plan_and_execute task — goal decomposition and step execution."""
    from agents.planner import run_plan_and_execute

    if progress:
        progress("plan", "english_texttask")
    goal = input_data.get("goal", "")
    if not goal:
        raise ValueError("plan_and_execute text goal text")
    context = input_data.get("context", {})
    return run_plan_and_execute(goal, context)


def supported_text_tasks() -> list[str]:
    return sorted(_TASK_SPECS)


def _normalize_global_discovery_titles(items: list[dict]) -> list[dict]:
    if not items:
        return []
    normalized = _chat_json(
        _GLOBAL_DISCOVERY_NORMALIZATION_PROMPT,
        {
            "items": [
                {
                    "sourceIndex": index,
                    "title": str(item.get("title") or "")[:300],
                    "snippet": str(item.get("snippet") or "")[:500],
                }
                for index, item in enumerate(items[:30])
            ]
        },
        timeout=45,
    )
    concepts = normalized.get("concepts")
    if not isinstance(concepts, list):
        raise ValueError("Global discovery normalization returned no concepts")
    output: list[dict] = []
    seen: set[str] = set()
    for raw in concepts:
        if not isinstance(raw, dict):
            continue
        source_index = raw.get("sourceIndex")
        if not isinstance(source_index, int) or not 0 <= source_index < len(items):
            continue
        name = str(raw.get("name") or "").strip()
        product_type = str(raw.get("productType") or "").strip()
        ozon_query = str(raw.get("ozonQuery") or "").strip()
        raw_terms = raw.get("ozonRequiredTerms")
        term_values = raw_terms if isinstance(raw_terms, list) else []
        ozon_terms = [
            term
            for value in term_values
            for term in _OZON_SEARCH_TERM_RE.findall(str(value or "").casefold())
            if term not in _OZON_TERM_STOPWORDS
        ][:3]
        title_tokens = {
            token.casefold()
            for token in re.findall(
                r"[A-Za-z0-9-]{3,}", str(items[source_index].get("title") or "")
            )
        }
        name_tokens = {
            token.casefold() for token in re.findall(r"[A-Za-z0-9-]{3,}", name)
        }
        key = name.casefold()
        if (
            not 3 <= len(name) <= 120
            or not 3 <= len(product_type) <= 120
            or not _OZON_SEARCH_QUERY_RE.fullmatch(ozon_query)
            or not ozon_terms
            or not title_tokens.intersection(name_tokens)
            or key in seen
        ):
            continue
        seen.add(key)
        output.append(
            {
                "sourceIndex": source_index,
                "name": name,
                "productType": product_type,
                "ozonQuery": ozon_query,
                "ozonRequiredTerms": list(dict.fromkeys(ozon_terms)),
            }
        )
    if not output:
        raise ValueError("Global discovery normalization produced no safe concepts")
    return output


def _run_global_product_discovery(input_data: dict, progress=None) -> dict:
    from web.services.global_product_discovery import discover_global_products

    return discover_global_products(
        input_data,
        normalize_titles=_normalize_global_discovery_titles,
        progress=progress,
    )


def _web_search_trend_signals(input_data: dict, progress=None) -> dict:
    category = str(input_data.get("category") or "").strip()
    marketplace = str(input_data.get("marketplace") or "").strip()
    timeframe = str(input_data.get("timeframe") or "90d").strip()
    query_parts = [
        category,
        marketplace,
        "ecommerce category trend demand",
        timeframe,
        str(datetime.utcnow().year),
    ]
    query = " ".join(part for part in query_parts if part).strip()
    if not query:
        return {"query": "", "provider": "", "results": []}

    if progress:
        progress("web_search", "english_textsearchtextevidence")

    try:
        from common.web_search import resolve_search_provider, search_web

        provider, _api_key_value = resolve_search_provider()
        results = search_web(query, num_results=8)
        cleaned = []
        for item in results:
            title = str(item.get("title") or "").strip()
            url = str(item.get("url") or "").strip()
            snippet = str(item.get("snippet") or "").strip()
            image_url = item.get("image_url")
            if not title and not snippet:
                continue
            cleaned.append(
                {
                    "title": title,
                    "url": url,
                    "snippet": snippet,
                    "image_url": str(image_url).strip() if image_url else None,
                }
            )
        return {"query": query, "provider": provider or "", "results": cleaned}
    except Exception as exc:  # noqa: BLE001 - search is best-effort before LLM
        return {"query": query, "provider": "", "results": [], "error": str(exc)}


def _trend_name_from_search_result(item: dict, category: str) -> str:
    text = str(item.get("title") or item.get("snippet") or category).strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^[\-\|\:\s]+|[\-\|\:\s]+$", "", text)
    if len(text) > 96:
        text = text[:93].rstrip() + "..."
    return text or category or "web search trend"


def _trend_data_points(growth: float, rank: int) -> list[dict]:
    now = datetime.utcnow()
    base = max(5.0, float(growth) * 0.55 + max(0, 6 - rank) * 1.5)
    points = []
    for offset in range(5, -1, -1):
        month = now.month - offset
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        value = round(base + (5 - offset) * max(1.0, float(growth) / 10), 2)
        points.append({"date": f"{year:04d}-{month:02d}", "value": value})
    return points


def _web_search_trend_fallback(input_data: dict, web_signals: dict, error: Exception) -> dict:
    category = str(input_data.get("category") or "").strip()
    results = web_signals.get("results") if isinstance(web_signals, dict) else []
    if not isinstance(results, list) or not results:
        raise error

    trends = []
    for index, item in enumerate(results[:6]):
        if not isinstance(item, dict):
            continue
        name = _trend_name_from_search_result(item, category)
        if not name:
            continue
        growth = max(6, 24 - index * 3)
        evidence = [
            {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("url") or "").strip(),
                "snippet": str(item.get("snippet") or "").strip(),
            }
        ]
        trends.append(
            {
                "name": name,
                "growth": growth,
                "seasonality": "Estimated from current web-search evidence; verify before execution.",
                "volume": f"web search evidence rank #{index + 1}",
                "source": "web_search_fallback",
                "evidence": evidence,
                "dataPoints": _trend_data_points(growth, index + 1),
                "dataPointMethod": "estimated_from_web_search_rank_and_growth",
            }
        )

    if not trends:
        raise error

    return {
        "trends": trends,
        "source": "web_search_fallback",
        "webSignals": web_signals,
        "llmError": str(error),
        "qualityScore": 72,
        "qualityRationale": "LLM failed; output is derived from live web-search evidence and marked as estimated.",
    }


def _attach_trend_web_metadata(result: dict, web_signals: dict) -> dict:
    if not isinstance(result, dict):
        return result
    if web_signals.get("results") and "webSignals" not in result:
        result["webSignals"] = web_signals
    trends = result.get("trends")
    if not isinstance(trends, list):
        return result
    evidence_results = [
        item for item in web_signals.get("results", []) if isinstance(item, dict)
    ]
    for index, trend in enumerate(trends):
        if not isinstance(trend, dict):
            continue
        trend.setdefault("source", "agent_web_search")
        if evidence_results and not trend.get("evidence"):
            item = evidence_results[min(index, len(evidence_results) - 1)]
            trend["evidence"] = [
                {
                    "title": str(item.get("title") or "").strip(),
                    "url": str(item.get("url") or "").strip(),
                    "snippet": str(item.get("snippet") or "").strip(),
                }
            ]
        if not trend.get("dataPoints"):
            try:
                growth = float(trend.get("growth") or 0)
            except (TypeError, ValueError):
                growth = 0
            trend["dataPoints"] = _trend_data_points(growth, index + 1)
            trend["dataPointMethod"] = "estimated_from_web_search_rank_and_growth"
        if evidence_results and not trend.get("volume"):
            trend["volume"] = f"web search evidence rank #{index + 1}"
    return result


def _chat_json(system: str, user_payload: dict, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """text OpenAI textAPIenglish_text JSON output。failedenglish_text（texttaskqueuetextfailed）。"""
    key_candidates = configured_key_candidates()
    if not key_candidates:
        raise ValueError(
            "texttasktext LLM：text agent/.env configuration OPENAI_API_KEY（text OPENAI_API_KEY_PREMIUM）"
        )

    import requests

    base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    model_candidates = configured_model_candidates()
    payload = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    if os.getenv("OPENAI_JSON_MODE", "1") != "0":
        payload["response_format"] = {"type": "json_object"}

    def post_chat(key: str, request_payload: dict):
        response = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=request_payload,
            timeout=timeout,
        )
        response.raise_for_status()
        return response

    def quota_exhausted(error: requests.HTTPError) -> bool:
        response = error.response
        status_code = getattr(response, "status_code", 0)
        body: dict = {}
        try:
            candidate = response.json() if response is not None else {}
            if isinstance(candidate, dict):
                body = candidate
        except (TypeError, ValueError):
            pass

        details = body.get("error") if isinstance(body.get("error"), dict) else {}
        code = str(details.get("code") or "").strip().lower()
        return (
            status_code in (402, 403, 429)
            and code in {"insufficient_user_quota", "insufficient_quota", "quota_exceeded"}
        )

    quota_failures = 0
    attempts = [
        (key_role, key, model)
        for model in model_candidates
        for key_role, key in key_candidates
    ]
    for attempt_index, (key_role, key, model) in enumerate(attempts):
        request_payload = {**payload, "model": model}
        try:
            resp = post_chat(key, request_payload)
        except requests.HTTPError as exc:
            if quota_exhausted(exc):
                quota_failures += 1
                continue
            status_code = getattr(exc.response, "status_code", 0)
            if not 500 <= status_code < 600:
                mark_unavailable(f"http_{status_code or 'error'}")
                raise

            if "response_format" not in request_payload:
                continue

            # Some OpenAI-compatible gateways reject json_object on otherwise valid models.
            fallback_payload = dict(request_payload)
            fallback_payload.pop("response_format", None)
            try:
                resp = post_chat(key, fallback_payload)
            except requests.HTTPError as fallback_error:
                if quota_exhausted(fallback_error):
                    quota_failures += 1
                    continue
                fallback_status = getattr(fallback_error.response, "status_code", 0)
                if 500 <= fallback_status < 600:
                    continue
                mark_unavailable(f"http_{fallback_status or 'error'}")
                raise
        mark_success(
            key_role,
            model=model,
            fallback_active=attempt_index > 0,
        )
        text = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        data = _extract_json(text)
        if not isinstance(data, dict):
            mark_unavailable("invalid_json")
            raise ValueError("LLM english_textnoneenglish_text JSON")
        return data

    if quota_failures == len(attempts):
        mark_quota_exhausted()
        raise RuntimeError(
            "LLM english_text，textsecretenglish_textsecrettextnoneenglish_textrealtask。english_text agent/.env text API Key。"
        )
    mark_unavailable()
    raise RuntimeError("LLM english_text，english_textrealtasktext。")


def run_text_task(task_type: str, input_data: dict, progress=None) -> dict:
    """english_textplatformtask，english_textbackendenglish_text。"""
    if _text_mock_enabled():
        if progress:
            progress("mock", f"local mock {task_type}")
        return _mock_text_task_result(task_type, input_data)

    # plan_and_execute uses its own planner LLM — skip the standard chat flow
    if task_type == "plan_and_execute":
        return _run_plan_and_execute(input_data, progress)
    if task_type == "global_product_discovery":
        return _run_global_product_discovery(input_data, progress)

    spec = _TASK_SPECS.get(task_type)
    if spec is None:
        raise ValueError(f"english_texttask: {task_type}")
    if progress:
        progress("llm", f"text {task_type}")
    started_at = datetime.utcnow()
    user_payload = {"taskType": task_type, "input": input_data}
    research_evidence = None
    trend_evidence = None
    if task_type == "product_research":
        marketplace = str(input_data.get("marketplace") or "").strip().lower()
        if marketplace not in {"ozon", "ozon.ru"}:
            raise ValueError(
                "realenglish_textevidencetext Ozon；textplatformenglish_textgenerationtext。"
            )
        if progress:
            progress("evidence", "english_text Ozon productsourceenglish_textevidence")
        product_name = str(input_data.get("productName") or input_data.get("query") or "")
        if progress:
            progress("translation", "Resolving Ozon product search terms")
        query_intent = _resolve_ozon_search_intent(product_name)
        from web.services.research_evidence import collect_ozon_product_evidence

        research_evidence = collect_ozon_product_evidence(
            product_name,
            search_query=query_intent["searchQuery"],
            required_terms=query_intent["requiredTerms"],
        )
        research_evidence["queryIntent"] = query_intent
        user_payload["sourceEvidence"] = research_evidence
    if task_type == "trend_analysis":
        marketplace = str(input_data.get("marketplace") or "").strip().lower()
        if marketplace not in {"ozon", "ozon.ru"}:
            raise ValueError(
                "Verified trend analysis currently supports Ozon evidence only; other marketplaces are not treated as real data."
            )
        if progress:
            progress("evidence", "Collecting Ozon trend source evidence")
        from web.services.research_evidence import collect_ozon_trend_evidence

        trend_evidence = collect_ozon_trend_evidence(
            str(input_data.get("category") or input_data.get("query") or "")
        )
        user_payload["trendEvidence"] = trend_evidence
    if task_type == "listing_generation":
        context = input_data.get("context") if isinstance(input_data.get("context"), dict) else {}
        org_id = str(context.get("orgId", "") or input_data.get("orgId", "") or "")
        raw_keywords = input_data.get("keywords", [])
        keyword_text = " ".join(str(k) for k in raw_keywords) if isinstance(raw_keywords, list) else ""
        query = " ".join([
            str(input_data.get("productName", "") or ""),
            str(input_data.get("description", "") or ""),
            keyword_text,
        ])
        try:
            from common.knowledge_base import search as _kb_search
            hits = _kb_search(query, k=3, org_id=org_id)
        except Exception:
            hits = []
        if hits:
            user_payload["knowledge"] = hits
    result = _chat_json(spec["system"], user_payload)

    if research_evidence is not None:
        result = _apply_ozon_research_evidence(result, research_evidence)
    if trend_evidence is not None:
        result = _apply_ozon_trend_evidence(result, trend_evidence)

    # LLM-as-judge: score the quality (best-effort, non-blocking)
    if progress:
        progress("judge", "english_text")
    quality = _judge_quality(task_type, input_data, result)
    if quality.get("qualityScore") is not None:
        result["qualityScore"] = quality["qualityScore"]
        result["qualityRationale"] = quality["qualityRationale"]

    # Stage 12: Verifier — self-check output quality
    if progress:
        progress("verify", "outputtext")
    from agents.verifier import verify as _verify_output
    verification = _verify_output(task_type, result)
    result["_verification"] = verification
    if not verification.get("passed"):
        if progress:
            progress("retry", "english_textpassed，automaticenglish_text")
        retry_payload = {
            **user_payload,
            "retry": {
                "issues": verification.get("issues", []),
                "suggestions": verification.get("suggestions", []),
            },
        }
        retry_result = _chat_json(spec["system"], retry_payload)
        if research_evidence is not None:
            retry_result = _apply_ozon_research_evidence(
                retry_result, research_evidence
            )
        if trend_evidence is not None:
            retry_result = _apply_ozon_trend_evidence(retry_result, trend_evidence)
        quality = _judge_quality(task_type, input_data, retry_result)
        if quality.get("qualityScore") is not None:
            retry_result["qualityScore"] = quality["qualityScore"]
            retry_result["qualityRationale"] = quality["qualityRationale"]
        retry_verification = _verify_output(task_type, retry_result)
        retry_result["_verification"] = retry_verification
        retry_result["_retriedByVerifier"] = True
        if not retry_verification.get("passed"):
            reason = "; ".join(str(i) for i in retry_verification.get("issues", []))
            retry_result["_requiresHumanReview"] = True
            retry_result["_failureReason"] = reason
            raise VerificationFailure(
                task_type=task_type,
                verification=retry_verification,
                source_evidence=research_evidence,
                result=retry_result,
            )
        result = retry_result

    runtime = llm_runtime_snapshot()
    result["_runtime"] = {
        "model": runtime.get("model"),
        "status": runtime.get("status"),
        "keyRole": runtime.get("keyRole"),
        "fallbackActive": runtime.get("fallbackActive"),
        "durationMs": int((datetime.utcnow() - started_at).total_seconds() * 1000),
    }
    return result


class VerificationFailure(ValueError):
    """A schema gate failed after the single permitted regeneration attempt."""

    def __init__(
        self,
        *,
        task_type: str,
        verification: dict,
        source_evidence: dict | None,
        result: dict,
    ) -> None:
        issues = [str(item) for item in verification.get("issues", [])]
        super().__init__(f"Verifier failed: {'; '.join(issues)}")
        self.task_type = task_type
        self.verification = verification
        self.source_evidence = source_evidence
        self.result = result

    def to_diagnostics(self) -> dict:
        evidence = self.source_evidence if isinstance(self.source_evidence, dict) else {}
        items = evidence.get("items") if isinstance(evidence.get("items"), list) else []
        return {
            "code": "AGENT_OUTPUT_VERIFICATION_FAILED",
            "taskType": self.task_type,
            "issues": [str(item) for item in self.verification.get("issues", [])],
            "suggestions": [str(item) for item in self.verification.get("suggestions", [])],
            "evidence": {
                "source": evidence.get("source"),
                "provider": evidence.get("provider"),
                "fetchedAt": evidence.get("fetchedAt"),
                "itemCount": len(items),
                "observedPriceCount": sum(
                    1
                    for item in items
                    if isinstance(item, dict) and item.get("priceRub") is not None
                ),
                "searchQueries": evidence.get("searchQueries", []),
            },
        }


def _apply_ozon_research_evidence(result: dict, evidence: dict) -> dict:
    """Pin factual fields to Ozon observations instead of model-generated values."""
    normalized = dict(result)
    normalized["competitors"] = list(evidence["competitors"])
    normalized["priceRange"] = dict(evidence["priceRange"])
    normalized["rating"] = None
    normalized["sourceEvidence"] = evidence
    normalized["summaryEvidenceIds"] = [item["id"] for item in evidence["items"]]
    return normalized


def _apply_ozon_trend_evidence(result: dict, evidence: dict) -> dict:
    """Pin qualitative Ozon observations to fetched sources and remove estimates."""
    normalized = dict(result)
    raw_trends = result.get("trends") if isinstance(result, dict) else []
    source_items = evidence.get("items") if isinstance(evidence, dict) else []
    trends = []
    if isinstance(raw_trends, list) and isinstance(source_items, list):
        for index, raw_trend in enumerate(raw_trends):
            if not isinstance(raw_trend, dict):
                continue
            name = str(raw_trend.get("name") or "").strip()
            seasonality = str(raw_trend.get("seasonality") or "").strip()
            if not name or not seasonality:
                continue
            source = source_items[index % len(source_items)] if source_items else None
            if not isinstance(source, dict):
                continue
            trends.append(
                {
                    "name": name,
                    "growth": None,
                    "seasonality": seasonality,
                    "source": "ozon_public_search",
                    "evidence": [source],
                    "fetchedAt": evidence.get("fetchedAt"),
                }
            )
    normalized["trends"] = trends
    normalized["source"] = "ozon_public_search"
    normalized["sourceEvidence"] = evidence
    normalized["summaryEvidenceIds"] = [
        item.get("id") for item in source_items if isinstance(item, dict) and item.get("id")
    ]
    return normalized


def _judge_key() -> str:
    """Returns the API key for the judge LLM, or empty to skip judging."""
    key = os.getenv("JUDGE_API_KEY", "")
    if not key:
        # Fall back to text LLM key
        return _api_key()
    return key


def _judge_quality(task_type: str, input_data: dict, output: dict) -> dict:
    """Use a secondary lightweight LLM call to judge output quality.
    Returns dict with qualityScore (0-100) and qualityRationale (string).
    Returns empty score if judge fails (doesn't break the main task)."""

    if not _judge_key():
        return {"qualityScore": None, "qualityRationale": ""}

    # Build judge prompt based on task type
    JUDGE_PROMPTS = {
        "product_research": (
            "You are a quality judge for e-commerce product research. "
            "Rate the research report quality 0-100 based on: "
            "completeness (has summary, competitors, price range, rating), "
            "specificity (mentions concrete numbers, market details), "
            "realism (claims are conservative and believable). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
        "listing_generation": (
            "You are a quality judge for Amazon/eBay listing copy. "
            "Rate the listing quality 0-100 based on: "
            "SEO optimization (keyword placement, relevance), "
            "persuasiveness (benefit-driven, engaging), "
            "completeness (has title, bulletPoints, description, keywords). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
        "keyword_analysis": (
            "You are a quality judge for SEO keyword research. "
            "Rate the keyword analysis quality 0-100 based on: "
            "relevance (keywords relate to seed keywords), "
            "variety (covers short-tail, long-tail, and related terms), "
            "quantity (has enough keywords to be useful). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
        "trend_analysis": (
            "You are a quality judge for market trend analysis. "
            "Rate the trend analysis quality 0-100 based on: "
            "actionability (trends can inform business decisions), "
            "specificity (has concrete growth numbers, descriptions), "
            "coverage (covers multiple trend directions). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
        "image_prompt": (
            "You are a quality judge for AI image prompts. "
            "Rate the prompt quality 0-100 based on: "
            "detail level (specific about lighting, composition, style), "
            "technical quality (correct terminology, aspect ratios), "
            "safety (no trademarked terms, NSFW content, etc). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
        "assistant_chat": (
            "You are a quality judge for AI assistant responses. "
            "Rate the response quality 0-100 based on: "
            "helpfulness (directly addresses the user's question), "
            "accuracy (claims are verifiable and correct), "
            "conciseness (no unnecessary fluff). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
        "automation_step": (
            "You are a quality judge for automation step execution. "
            "Rate the step execution quality 0-100 based on: "
            "correctness (output matches what the stepType requires), "
            "completeness (all expected fields are present), "
            "clarity (explanation is clear if step is not executable). "
            "Return ONLY JSON: {\"qualityScore\": <int 0-100>, \"rationale\": \"<1 sentence>\"}"
        ),
    }

    judge_prompt = JUDGE_PROMPTS.get(task_type)
    if not judge_prompt:
        return {"qualityScore": None, "qualityRationale": ""}

    # Build evaluation payload: show the original input and generated output
    user_msg = json.dumps({"input": input_data, "output": output}, ensure_ascii=False)

    try:
        # Use a separate, cheaper model for judging
        key = _judge_key()
        base = os.getenv("JUDGE_API_BASE", os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")).rstrip("/")
        model = os.getenv("JUDGE_MODEL", "gpt-4o-mini")

        import requests
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": judge_prompt},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.2,
                "max_tokens": 256,
            },
            timeout=15,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        data = _extract_json(text)
        if isinstance(data, dict) and "qualityScore" in data:
            score = int(data["qualityScore"])
            return {
                "qualityScore": max(0, min(100, score)),
                "qualityRationale": str(data.get("rationale", "")),
            }
    except Exception:
        pass  # Judge failure does NOT fail the task — score is advisory
    return {"qualityScore": None, "qualityRationale": ""}
