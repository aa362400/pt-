import importlib.util
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

import pytest


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def install_search_module(monkeypatch, results):
    fake_common = types.ModuleType("common")
    fake_search = types.ModuleType("common.web_search")
    fake_search.WebSearchError = RuntimeError
    fake_search.resolve_search_provider = lambda: ("serper", "test-key")
    fake_search.search_web = lambda _query, num_results=5: results[:num_results]
    fake_search.search_images = lambda _query, num_results=8: []
    monkeypatch.setitem(sys.modules, "common", fake_common)
    monkeypatch.setitem(sys.modules, "common.web_search", fake_search)


def test_collects_only_ozon_sources_with_fetch_time_and_price_range(monkeypatch):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon \u0442\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430 899 \u20bd",
                "url": "https://www.ozon.ru/product/thermal-bag-1/",
                "snippet": "\u0422\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430 \u0434\u043b\u044f \u043b\u0430\u043d\u0447\u0430, \u0446\u0435\u043d\u0430 899 \u20bd",
                "image_url": "https://cdn1.ozone.ru/s3/thermal-bag-1.jpg",
            },
            {
                "title": "Ozon \u0442\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430 \u0438\u0437\u043e\u0442\u0435\u0440\u043c\u0438\u0447\u0435\u0441\u043a\u0430\u044f",
                "url": "https://www.ozon.ru/product/thermal-bag-2/",
                "snippet": "\u0410\u043a\u0446\u0438\u044f, \u0446\u0435\u043d\u0430 1 299 \u0440\u0443\u0431.",
            },
            {
                "title": "Unrelated marketplace result",
                "url": "https://example.com/product/3",
                "snippet": "Price 10 USD",
            },
        ],
    )
    evidence = load_module("ozon_research_evidence_test", "web/services/research_evidence.py")

    result = evidence.collect_ozon_product_evidence("\u0442\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430")

    assert result["source"] == "ozon_public_listings"
    assert result["provider"] == "serper"
    assert len(result["items"]) == 2
    assert all(item["url"].startswith("https://www.ozon.ru/") for item in result["items"])
    assert result["items"][0]["imageUrl"] == "https://cdn1.ozone.ru/s3/thermal-bag-1.jpg"
    assert result["priceRange"] == {"min": 899, "max": 1299, "currency": "RUB"}
    assert result["relevance"] == {
        "strategy": "original_query_terms",
        "matchTerms": ["\u0442\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430"],
    }
    assert all(
        item["matchedTerms"] == result["relevance"]["matchTerms"]
        for item in result["items"]
    )
    assert result["fetchedAt"]


def test_rejects_research_when_ozon_evidence_is_not_sufficient(monkeypatch):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon \u0442\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430 899 \u20bd",
                "url": "https://www.ozon.ru/product/thermal-bag-1/",
                "snippet": "\u0426\u0435\u043d\u0430 899 \u20bd",
            }
        ],
    )
    evidence = load_module("ozon_research_evidence_insufficient_test", "web/services/research_evidence.py")

    with pytest.raises(evidence.ResearchEvidenceError, match="at least two"):
        evidence.collect_ozon_product_evidence("\u0442\u0435\u0440\u043c\u043e\u0441\u0443\u043c\u043a\u0430")


def test_reports_price_evidence_diagnostics_when_listing_prices_are_missing(
    monkeypatch,
):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon storage bag one",
                "url": "https://www.ozon.ru/product/storage-bag-1/",
                "snippet": "Public listing without a visible price.",
            },
            {
                "title": "Ozon storage bag two",
                "url": "https://www.ozon.ru/product/storage-bag-2/",
                "snippet": "Another public listing without a visible price.",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_price_diagnostics_test",
        "web/services/research_evidence.py",
    )
    monkeypatch.setattr(
        evidence,
        "_fetch_ozon_listing_price",
        lambda _url: None,
    )

    with pytest.raises(evidence.ResearchEvidenceError) as caught:
        evidence.collect_ozon_product_evidence("storage bag")

    diagnostics = caught.value.to_diagnostics()
    assert diagnostics["code"] == "RESEARCH_EVIDENCE_PRICES_INSUFFICIENT"
    assert diagnostics["candidateCount"] == 2
    assert diagnostics["observedPriceCount"] == 0
    assert [item["url"] for item in diagnostics["candidates"]] == [
        "https://www.ozon.ru/product/storage-bag-1/",
        "https://www.ozon.ru/product/storage-bag-2/",
    ]


def test_uses_public_ozon_listing_page_price_when_search_snippets_omit_it(
    monkeypatch,
):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon storage bag one",
                "url": "https://www.ozon.ru/product/storage-bag-1/",
                "snippet": "Public Ozon product listing without a price snippet.",
            },
            {
                "title": "Ozon storage bag two",
                "url": "https://www.ozon.ru/product/storage-bag-2/",
                "snippet": "Another public Ozon product listing without a price snippet.",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_page_price_test",
        "web/services/research_evidence.py",
    )
    page_prices = {
        "https://www.ozon.ru/product/storage-bag-1/": 899,
        "https://www.ozon.ru/product/storage-bag-2/": 1299,
    }
    monkeypatch.setattr(
        evidence,
        "_fetch_ozon_listing_price",
        lambda url: page_prices.get(url),
        raising=False,
    )

    result = evidence.collect_ozon_product_evidence("storage bag")

    assert result["priceRange"] == {"min": 899, "max": 1299, "currency": "RUB"}
    assert [item["priceRub"] for item in result["items"]] == [899, 1299]
    assert [item["priceSource"] for item in result["items"]] == [
        "product_page",
        "product_page",
    ]


def test_enriches_product_evidence_with_public_ozon_page_images(monkeypatch):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon phone case one 899 RUB",
                "url": "https://www.ozon.ru/product/phone-case-one-2179557564/",
                "snippet": "Price 899 RUB",
            },
            {
                "title": "Ozon phone case two 1299 RUB",
                "url": "https://www.ozon.ru/product/phone-case-two-2281668688/",
                "snippet": "Price 1299 RUB",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_page_image_test",
        "web/services/research_evidence.py",
    )
    images = {
        "https://www.ozon.ru/product/phone-case-one-2179557564/": "https://cdn1.ozone.ru/one.jpg",
        "https://www.ozon.ru/product/phone-case-two-2281668688/": "https://cdn1.ozone.ru/two.jpg",
    }
    monkeypatch.setattr(
        evidence,
        "_fetch_ozon_listing_image",
        lambda url: images.get(url),
    )

    result = evidence.collect_ozon_product_evidence("phone case")

    assert [item["imageUrl"] for item in result["items"]] == list(images.values())


def test_joins_search_images_only_by_matching_ozon_product_id(monkeypatch):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon phone case one 899 RUB",
                "url": "https://www.ozon.ru/product/phone-case-one-2179557564/",
                "snippet": "Price 899 RUB",
            },
            {
                "title": "Ozon phone case two 1299 RUB",
                "url": "https://www.ozon.ru/product/phone-case-two-2281668688/",
                "snippet": "Price 1299 RUB",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_image_join_test",
        "web/services/research_evidence.py",
    )
    monkeypatch.setattr(evidence, "_fetch_ozon_listing_image", lambda _url: None)
    monkeypatch.setattr(
        sys.modules["common.web_search"],
        "search_images",
        lambda _query, num_results=8: [
            {
                "url": "https://www.ozon.ru/product/phone-case-one-2179557564/",
                "image_url": "https://cdn1.ozone.ru/one.jpg",
            },
            {
                "url": "https://www.ozon.ru/product/different-9999999999/",
                "image_url": "https://cdn1.ozone.ru/wrong.jpg",
            },
        ],
    )

    result = evidence.collect_ozon_product_evidence("phone case")

    assert result["items"][0]["imageUrl"] == "https://cdn1.ozone.ru/one.jpg"
    assert result["items"][1]["imageUrl"] is None


def test_rejects_one_ruble_search_placeholders_as_price_evidence(monkeypatch):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon phone case one 1 RUB",
                "url": "https://www.ozon.ru/product/phone-case-one/",
                "snippet": "Price 1 RUB",
            },
            {
                "title": "Ozon phone case two 1 RUB",
                "url": "https://www.ozon.ru/product/phone-case-two/",
                "snippet": "Price 1 RUB",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_placeholder_price_test",
        "web/services/research_evidence.py",
    )
    monkeypatch.setattr(evidence, "_fetch_ozon_listing_price", lambda _url: None)

    with pytest.raises(evidence.ResearchEvidenceError) as caught:
        evidence.collect_ozon_product_evidence("phone case")

    assert caught.value.code == "RESEARCH_EVIDENCE_PRICES_INSUFFICIENT"


def test_extracts_ozon_preview_image_from_structured_meta():
    evidence = load_module(
        "ozon_research_evidence_image_meta_test",
        "web/services/research_evidence.py",
    )

    image_url = evidence._extract_ozon_page_image(
        '<html><head><meta property="og:image" content="https://cdn1.ozone.ru/product.jpg"></head></html>'
    )

    assert image_url == "https://cdn1.ozone.ru/product.jpg"


def test_refetches_each_listing_once_per_collection_without_relabeling_stale_html(
    monkeypatch,
):
    urls = [
        "https://www.ozon.ru/product/phone-case-one-2179557564/",
        "https://www.ozon.ru/product/phone-case-two-2281668688/",
    ]
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon phone case one",
                "url": urls[0],
                "snippet": "Public listing without price or image metadata.",
            },
            {
                "title": "Ozon phone case two",
                "url": urls[1],
                "snippet": "Another listing without price or image metadata.",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_collection_freshness_test",
        "web/services/research_evidence.py",
    )

    observed_at = iter(
        [
            datetime(2026, 7, 16, 3, 0, tzinfo=timezone.utc),
            datetime(2026, 7, 16, 3, 5, tzinfo=timezone.utc),
        ]
    )

    class FixedDatetime:
        @classmethod
        def now(cls, _timezone):
            return next(observed_at)

    monkeypatch.setattr(evidence, "datetime", FixedDatetime)

    page_calls = {url: 0 for url in urls}
    round_prices = {
        urls[0]: [899, 999],
        urls[1]: [1299, 1399],
    }
    round_images = {
        urls[0]: ["one-v1.jpg", "one-v2.jpg"],
        urls[1]: ["two-v1.jpg", "two-v2.jpg"],
    }

    def get(url, **_kwargs):
        page_calls[url] += 1
        round_index = page_calls[url] - 1
        response = types.SimpleNamespace()
        response.status_code = 200
        response.url = url
        response.headers = {"content-type": "text/html; charset=utf-8"}
        response.text = (
            '<meta property="product:price:amount" '
            f'content="{round_prices[url][round_index]}">'
            '<meta property="og:image" '
            f'content="https://cdn1.ozone.ru/{round_images[url][round_index]}">'
        )
        return response

    fake_requests = types.ModuleType("requests")
    fake_requests.RequestException = RuntimeError
    fake_requests.get = get
    monkeypatch.setitem(sys.modules, "requests", fake_requests)

    first = evidence.collect_ozon_product_evidence(
        "phone case",
        required_terms=["phone", "case"],
    )
    second = evidence.collect_ozon_product_evidence(
        "phone case",
        required_terms=["phone", "case"],
    )

    assert page_calls == {url: 2 for url in urls}
    assert [item["priceRub"] for item in first["items"]] == [899, 1299]
    assert [item["priceRub"] for item in second["items"]] == [999, 1399]
    assert [item["imageUrl"] for item in first["items"]] == [
        "https://cdn1.ozone.ru/one-v1.jpg",
        "https://cdn1.ozone.ru/two-v1.jpg",
    ]
    assert [item["imageUrl"] for item in second["items"]] == [
        "https://cdn1.ozone.ru/one-v2.jpg",
        "https://cdn1.ozone.ru/two-v2.jpg",
    ]
    assert first["fetchedAt"] == "2026-07-16T03:00:00+00:00"
    assert second["fetchedAt"] == "2026-07-16T03:05:00+00:00"
    assert {item["fetchedAt"] for item in first["items"]} == {
        first["fetchedAt"]
    }
    assert {item["fetchedAt"] for item in second["items"]} == {
        second["fetchedAt"]
    }


def test_accepts_ozon_route_variants_only_when_page_price_is_observed(
    monkeypatch,
):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Ozon routed storage bag one",
                "url": "https://www.ozon.ru/collection/storage-bag-one/",
                "snippet": "Public Ozon route without a price snippet.",
            },
            {
                "title": "Ozon routed storage bag two",
                "url": "https://www.ozon.ru/collection/storage-bag-two/",
                "snippet": "Another public Ozon route without a price snippet.",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_route_variant_test",
        "web/services/research_evidence.py",
    )
    page_prices = {
        "https://www.ozon.ru/collection/storage-bag-one/": 899,
        "https://www.ozon.ru/collection/storage-bag-two/": 1299,
    }
    monkeypatch.setattr(
        evidence,
        "_fetch_ozon_listing_price",
        lambda url: page_prices.get(url),
    )

    result = evidence.collect_ozon_product_evidence("storage bag")

    assert len(result["items"]) == 2
    assert [item["priceSource"] for item in result["items"]] == [
        "product_page",
        "product_page",
    ]


def test_retries_a_broader_ozon_query_when_product_path_query_has_too_few_sources(
    monkeypatch,
):
    install_search_module(monkeypatch, [])
    evidence = load_module(
        "ozon_research_evidence_broader_query_test",
        "web/services/research_evidence.py",
    )
    calls = []

    def search_web(query, num_results=5):
        calls.append((query, num_results))
        if "/product" in query:
            return []
        return [
            {
                "title": "Ozon storage bag one 899 RUB",
                "url": "https://www.ozon.ru/product/storage-bag-1/",
                "snippet": "Price 899 RUB",
            },
            {
                "title": "Ozon storage bag two 1 299 RUB",
                "url": "https://www.ozon.ru/product/storage-bag-2/",
                "snippet": "Price 1 299 RUB",
            },
        ]

    monkeypatch.setattr(sys.modules["common.web_search"], "search_web", search_web)

    result = evidence.collect_ozon_product_evidence("storage bag")

    assert len(calls) == 2
    assert calls[0][0] == 'site:ozon.ru/product "storage bag"'
    assert calls[1][0] == 'site:ozon.ru "storage bag"'
    assert result["searchQueries"] == [calls[0][0], calls[1][0]]
    assert result["relevance"] == {
        "strategy": "original_query_terms",
        "matchTerms": ["storage", "bag"],
    }
    assert all(item["matchedTerms"] == ["storage", "bag"] for item in result["items"])


def test_rejects_cjk_query_without_translated_terms(monkeypatch):
    install_search_module(monkeypatch, [])
    evidence = load_module(
        "ozon_research_evidence_chinese_relevance_test",
        "web/services/research_evidence.py",
    )
    calls = []
    query_name = "\u6c7d\u8f66\u98ce\u6247"

    def search_web(query, num_results=5):
        calls.append((query, num_results))
        if query == f'site:ozon.ru/product "{query_name}"':
            return [
                {
                    "title": "Ozon \u0412\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 A",
                    "url": "https://www.ozon.ru/product/car-fan-a/",
                    "snippet": "\u0426\u0435\u043d\u0430 1 200 \u0440\u0443\u0431.",
                },
                {
                    "title": "Ozon \u0410\u0440\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0442\u043e\u0440 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439",
                    "url": "https://www.ozon.ru/product/car-air-freshener/",
                    "snippet": "\u0426\u0435\u043d\u0430 700 \u0440\u0443\u0431.",
                },
                {
                    "title": "Ozon \u0412\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 B",
                    "url": "https://www.ozon.ru/product/car-fan-b/",
                    "snippet": "\u041f\u0443\u0431\u043b\u0438\u0447\u043d\u0430\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0442\u043e\u0432\u0430\u0440\u0430 \u0431\u0435\u0437 \u0446\u0435\u043d\u044b \u0432 \u0441\u043d\u0438\u043f\u043f\u0435\u0442\u0435.",
                },
            ]
        return []

    monkeypatch.setattr(sys.modules["common.web_search"], "search_web", search_web)
    monkeypatch.setattr(evidence, "_fetch_ozon_listing_price", lambda _url: None)

    with pytest.raises(evidence.ResearchEvidenceError) as caught:
        evidence.collect_ozon_product_evidence(query_name)

    diagnostics = caught.value.to_diagnostics()
    assert diagnostics["code"] == "RESEARCH_QUERY_TERMS_UNRESOLVED"
    assert diagnostics["candidateCount"] == 0
    assert diagnostics["relevance"] == {
        "strategy": "original_query_terms",
        "matchTerms": [],
    }
    assert calls == [(f'site:ozon.ru/product "{query_name}"', 8)]


def test_does_not_accept_query_terms_only_from_a_contaminated_snippet(monkeypatch):
    install_search_module(
        monkeypatch,
        [
            {
                "title": "Honor phone case one 899 RUB",
                "url": "https://www.ozon.ru/product/honor-phone-case-one/",
                "snippet": "Price 899 RUB",
            },
            {
                "title": "Honor phone case two 1299 RUB",
                "url": "https://www.ozon.ru/product/honor-phone-case-two/",
                "snippet": "Price 1299 RUB",
            },
            {
                "title": "Truck suspension pin 6100 RUB",
                "url": "https://www.ozon.ru/product/truck-suspension-pin/",
                "snippet": "Search suggestions: Honor phone case. Price 6100 RUB",
            },
        ],
    )
    evidence = load_module(
        "ozon_research_evidence_snippet_contamination_test",
        "web/services/research_evidence.py",
    )

    result = evidence.collect_ozon_product_evidence(
        "Honor phone case",
        search_query="Honor phone case",
        required_terms=["honor", "case"],
    )

    assert [item["title"] for item in result["items"]] == [
        "Honor phone case one 899 RUB",
        "Honor phone case two 1299 RUB",
    ]


def test_ignores_salary_context_prices_and_retries_for_a_listing_price(monkeypatch):
    install_search_module(monkeypatch, [])
    evidence = load_module(
        "ozon_research_evidence_salary_context_test",
        "web/services/research_evidence.py",
    )
    calls = []
    query_name = "car fan"

    def search_web(query, num_results=5):
        calls.append((query, num_results))
        if query == f'site:ozon.ru/product "{query_name}"':
            return [
                {
                    "title": "Ozon car fan A",
                    "url": "https://www.ozon.ru/product/car-fan-a/",
                    "snippet": "Price 1 200 RUB",
                },
                {
                    "title": "Ozon car fan B",
                    "url": "https://www.ozon.ru/product/car-fan-b/",
                    "snippet": "Salary 13 000 RUB per month for staff.",
                },
                {
                    "title": "Ozon car fan C",
                    "url": "https://www.ozon.ru/product/car-fan-c/",
                    "snippet": "Public Ozon listing without a visible price.",
                },
            ]
        if query != f'site:ozon.ru/product "{query_name}"' and "car fan" in query:
            return [
                {
                    "title": "Ozon car fan C",
                    "url": "https://www.ozon.ru/product/car-fan-c/",
                    "snippet": "Price 1 800 RUB",
                },
            ]
        return []

    monkeypatch.setattr(sys.modules["common.web_search"], "search_web", search_web)
    monkeypatch.setattr(evidence, "_fetch_ozon_listing_price", lambda _url: None)

    result = evidence.collect_ozon_product_evidence(query_name)

    assert result["priceRange"] == {"min": 1200, "max": 1800, "currency": "RUB"}
    assert [item["priceRub"] for item in result["items"]] == [1200, None, 1800]
    assert len(calls) == 2
    assert "-\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438" in calls[1][0]


def test_uses_translated_query_terms_to_reject_wrong_fan_categories(monkeypatch):
    install_search_module(monkeypatch, [])
    evidence = load_module(
        "ozon_research_evidence_translated_query_test",
        "web/services/research_evidence.py",
    )
    calls = []
    original_query = "\u6c7d\u8f66\u98ce\u6247"
    translated_query = "\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440"
    required_terms = translated_query.split()

    def search_web(query, num_results=5):
        calls.append((query, num_results))
        if query == f'site:ozon.ru/product "{translated_query}"':
            return [
                {
                    "title": "Ozon \u0412\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 A",
                    "url": "https://www.ozon.ru/product/car-fan-a/",
                    "snippet": "\u0426\u0435\u043d\u0430 1 200 \u0440\u0443\u0431.",
                },
                {
                    "title": "Ozon \u0412\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440 \u043f\u043e\u0440\u0442\u0430\u0442\u0438\u0432\u043d\u044b\u0439",
                    "url": "https://www.ozon.ru/product/portable-fan/",
                    "snippet": "\u0426\u0435\u043d\u0430 700 \u0440\u0443\u0431.",
                },
                {
                    "title": "Ozon \u0412\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 B",
                    "url": "https://www.ozon.ru/product/car-fan-b/",
                    "snippet": "\u0426\u0435\u043d\u0430 1 800 \u0440\u0443\u0431.",
                },
            ]
        return []

    monkeypatch.setattr(sys.modules["common.web_search"], "search_web", search_web)
    monkeypatch.setattr(evidence, "_fetch_ozon_listing_price", lambda _url: None)

    result = evidence.collect_ozon_product_evidence(
        original_query,
        search_query=translated_query,
        required_terms=required_terms,
    )

    assert calls == [(f'site:ozon.ru/product "{translated_query}"', 8)]
    assert result["query"] == original_query
    assert result["searchQuery"] == translated_query
    assert result["relevance"] == {
        "strategy": "translated_query_terms",
        "matchTerms": required_terms,
    }
    assert [item["url"] for item in result["items"]] == [
        "https://www.ozon.ru/product/car-fan-a/",
        "https://www.ozon.ru/product/car-fan-b/",
    ]
    assert all(item["matchedTerms"] == required_terms for item in result["items"])


def test_rejects_unrelated_repeated_listing_terms_for_original_query(monkeypatch):
    install_search_module(monkeypatch, [])
    evidence = load_module(
        "ozon_research_evidence_unrelated_repeated_terms_test",
        "web/services/research_evidence.py",
    )
    calls = []
    query_name = "codex-qa-verification-nonexistent-product-20260716"
    unrelated_results = [
        {
            "title": f"Ozon Фильтр воздушный {index} {900 + index} RUB",
            "url": f"https://www.ozon.ru/product/air-filter-{100000 + index}/",
            "snippet": f"Price {900 + index} RUB",
        }
        for index in range(5)
    ]

    def search_web(query, num_results=5):
        calls.append((query, num_results))
        return unrelated_results[:num_results]

    monkeypatch.setattr(sys.modules["common.web_search"], "search_web", search_web)

    with pytest.raises(evidence.ResearchEvidenceError) as caught:
        evidence.collect_ozon_product_evidence(query_name)

    diagnostics = caught.value.to_diagnostics()
    assert diagnostics["code"] == "RESEARCH_EVIDENCE_SOURCES_INSUFFICIENT"
    assert diagnostics["candidateCount"] == 0
    assert diagnostics["relevance"]["strategy"] == "original_query_terms"
    assert {"codex", "verification", "nonexistent"}.issubset(
        diagnostics["relevance"]["matchTerms"]
    )
    assert all("фильтр воздушный" not in query.casefold() for query, _ in calls)
