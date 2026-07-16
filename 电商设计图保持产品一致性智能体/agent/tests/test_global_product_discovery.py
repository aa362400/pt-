import pytest

from web.services.global_product_discovery import (
    DEFAULT_SEED_QUERIES,
    _bounded_text,
    _concept_evidence_group_key,
    discover_global_products,
    explicit_purchase_metrics,
)


def test_bounded_evidence_respects_javascript_utf16_string_limits():
    bounded = _bounded_text("😀" * 1_500, 2_000)

    assert len(bounded.encode("utf-16-le")) // 2 <= 2_000
    assert bounded == "😀" * 1_000


def _captured_seed_batch(monkeypatch, input_data):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    search_queries = []

    def fake_search(query, num_results=8):
        search_queries.append(query)
        return []

    discover_global_products(
        input_data,
        normalize_titles=lambda items: [],
        search_fn=fake_search,
        image_search_fn=lambda query, num_results=8: [],
    )

    prefix = "site:temu.com "
    suffix = " sold"
    return tuple(
        query[len(prefix) : -len(suffix)]
        for query in search_queries
        if query.startswith(prefix) and query.endswith(suffix)
    )


def test_same_exploration_key_produces_same_seed_batch_across_dates(monkeypatch):
    first_batch = _captured_seed_batch(
        monkeypatch,
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 10,
            "explorationKey": "continuous-loop-0001",
        },
    )
    repeated_batch = _captured_seed_batch(
        monkeypatch,
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 10,
            "explorationKey": "continuous-loop-0001",
        },
    )

    assert repeated_batch == first_batch


def test_different_exploration_keys_rotate_to_different_default_seed_batches(
    monkeypatch,
):
    first_batch = _captured_seed_batch(
        monkeypatch,
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 10,
            "explorationKey": "continuous-loop-0001",
        },
    )
    next_batch = _captured_seed_batch(
        monkeypatch,
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 10,
            "explorationKey": "continuous-loop-0002",
        },
    )
    rotated_batches = {
        (
            DEFAULT_SEED_QUERIES[offset],
            DEFAULT_SEED_QUERIES[(offset + 1) % len(DEFAULT_SEED_QUERIES)],
        )
        for offset in range(len(DEFAULT_SEED_QUERIES))
    }

    assert first_batch in rotated_batches
    assert next_batch in rotated_batches
    assert next_batch != first_batch


def test_missing_exploration_key_keeps_business_date_seed_rotation(monkeypatch):
    business_date = "2026-07-16"
    offset = sum(ord(char) for char in business_date) % len(DEFAULT_SEED_QUERIES)

    batch = _captured_seed_batch(
        monkeypatch,
        {"businessDate": business_date, "candidateLimit": 10},
    )

    assert batch == (
        DEFAULT_SEED_QUERIES[offset],
        DEFAULT_SEED_QUERIES[(offset + 1) % len(DEFAULT_SEED_QUERIES)],
    )


def test_methodology_reports_seed_batch_resolved_from_exploration_key(monkeypatch):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    exploration_key = "continuous-loop-0002"
    search_queries = []

    def fake_search(query, num_results=8):
        search_queries.append(query)
        return []

    result = discover_global_products(
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 10,
            "explorationKey": exploration_key,
        },
        normalize_titles=lambda items: [],
        search_fn=fake_search,
        image_search_fn=lambda query, num_results=8: [],
    )
    prefix = "site:temu.com "
    suffix = " sold"
    actual_batch = [
        query[len(prefix) : -len(suffix)]
        for query in search_queries
        if query.startswith(prefix) and query.endswith(suffix)
    ]
    offset = sum(ord(char) for char in exploration_key) % len(DEFAULT_SEED_QUERIES)
    expected_batch = [
        DEFAULT_SEED_QUERIES[offset],
        DEFAULT_SEED_QUERIES[(offset + 1) % len(DEFAULT_SEED_QUERIES)],
    ]

    assert result["methodology"]["seedQueries"] == actual_batch == expected_batch


def test_explicit_purchase_metrics_rejects_unlabelled_numbers():
    assert explicit_purchase_metrics("$29.99, 4.8 stars") == []
    assert ("sales", 1200) in explicit_purchase_metrics("1.2K sold")
    assert ("review_count", 245) in explicit_purchase_metrics("245 reviews")


def test_discovery_requires_two_demand_sources_and_keeps_ozon_scope(monkeypatch):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )

    def fake_search(query, num_results=8):
        if "site:ozon.ru" in query:
            return []
        if "site:temu.com" in query:
            return [
                {
                    "title": "Personalized wooden desk organizer",
                    "url": "https://www.temu.com/personalized-wooden-desk-organizer-g-1.html",
                    "snippet": "278 sold " + "x" * 3000,
                    "provider": "tavily",
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": "Personalized wooden desk organizer",
                    "url": "https://www.aliexpress.com/item/1005001.html",
                    "snippet": "42 sold",
                    "provider": "tavily",
                }
            ]
        return []

    def fake_images(query, num_results=8):
        return [
            {
                "title": "Personalized wooden desk organizer",
                "url": "https://www.temu.com/personalized-wooden-desk-organizer-g-1.html",
                "image_url": "https://img.example.test/organizer.jpg",
                "snippet": "Temu",
            }
        ]

    result = discover_global_products(
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 10,
            "seedQueries": ["desk organization"],
        },
        normalize_titles=lambda items: [
            {
                "sourceIndex": 0,
                "name": "personalized wooden desk organizer",
                "productType": "wooden desk organizer",
                "ozonQuery": "персональный деревянный органайзер для стола",
                "ozonRequiredTerms": ["органайзер"],
            }
        ],
        search_fn=fake_search,
        image_search_fn=fake_images,
        shopping_search_fn=lambda _query, num_results=8: [],
    )

    sources = {item["source"] for item in result["candidates"]}
    assert sources == {
        "temu_public_search",
        "aliexpress_public_search",
        "ozon_public_search_sample",
    }
    ozon = next(
        item
        for item in result["candidates"]
        if item["source"] == "ozon_public_search_sample"
    )
    assert ozon["signals"][0]["metricValue"] == "0"
    assert "not the full Ozon catalog" in ozon["evidenceScope"]
    assert result["candidates"][0]["imageUrl"].endswith("organizer.jpg")
    assert len(result["candidates"][0]["evidenceSnippet"]) == 2000
    assert {
        item["provider"]
        for item in result["candidates"]
        if item["source"] != "ozon_public_search_sample"
    } == {"tavily"}
    assert result["provider"] == "tavily"
    assert result["methodology"]["externalStoreMutation"] is False


def _discover_with_public_shopping_price(monkeypatch, shopping_price):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )

    def fake_search(query, num_results=8):
        if "site:ozon.ru" in query:
            return []
        if "site:temu.com" in query:
            return [
                {
                    "title": "Portable dog water bottle",
                    "url": "https://www.temu.com/portable-dog-water-bottle-g-1.html",
                    "snippet": "278 sold",
                    "provider": "tavily",
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": "Portable dog water bottle",
                    "url": "https://www.aliexpress.com/item/1005002.html",
                    "snippet": "42 sold",
                    "provider": "tavily",
                }
            ]
        return []

    def fake_shopping_search(query, num_results=8):
        return [
            {
                "provider": "serper",
                "result_type": "shopping",
                "title": "Portable dog water bottle",
                "url": "https://shop.example.test/portable-dog-water-bottle",
                "price": shopping_price,
                "delivery": "Free delivery",
                "source": "Example Shop",
                "productId": "shopping-product-456",
                "image_url": "https://img.example.test/dog-water-bottle.jpg",
            }
        ]

    return discover_global_products(
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 10,
            "seedQueries": ["pet travel accessory"],
        },
        normalize_titles=lambda items: [
            {
                "sourceIndex": 0,
                "name": "portable dog water bottle",
                "productType": "dog water bottle",
                "ozonQuery": "portable dog water bottle",
                "ozonRequiredTerms": [],
            }
        ],
        search_fn=fake_search,
        image_search_fn=lambda query, num_results=8: [],
        shopping_search_fn=fake_shopping_search,
    )


def test_exact_public_shopping_price_is_estimated_market_signal_not_cost(monkeypatch):
    result = _discover_with_public_shopping_price(monkeypatch, "$18.99")

    shopping = next(
        item
        for item in result["candidates"]
        if item["source"] == "google_shopping_public_sample"
    )
    price_signal = next(
        signal
        for signal in shopping["signals"]
        if signal["metricName"] == "public_market_price"
    )

    assert price_signal["metricValue"] == "18.99"
    assert price_signal["unit"] == "USD"
    assert price_signal["quality"] == "ESTIMATED"
    assert shopping["salePrice"] is None
    assert shopping["costs"] == []
    assert "not a procurement cost" in shopping["evidenceScope"].lower()


def test_all_sources_for_one_concept_share_a_stable_group_without_losing_source_identity(
    monkeypatch,
):
    result = _discover_with_public_shopping_price(monkeypatch, "$18.99")

    assert len(result["candidates"]) == 4
    group_keys = {item["evidenceGroupKey"] for item in result["candidates"]}
    assert len(group_keys) == 1
    shopping = next(
        item
        for item in result["candidates"]
        if item["source"] == "google_shopping_public_sample"
    )
    assert shopping["externalId"] == "shopping-product-456"


def test_concept_group_key_normalizes_formatting_but_not_different_products():
    first = _concept_evidence_group_key(
        {"name": " Portable DOG Water Bottle ", "productType": "Dog Water Bottle"}
    )
    formatted = _concept_evidence_group_key(
        {"name": "portable-dog water bottle", "productType": "dog water bottle"}
    )
    different = _concept_evidence_group_key(
        {"name": "portable dog water bowl", "productType": "dog water bowl"}
    )

    assert first == formatted
    assert first != different


@pytest.mark.parametrize("shopping_price", ["From $18.99", "$18.99 - $24.99"])
def test_ambiguous_public_shopping_price_does_not_create_amount_evidence(
    monkeypatch, shopping_price
):
    result = _discover_with_public_shopping_price(monkeypatch, shopping_price)

    public_market_price_signals = [
        signal
        for candidate in result["candidates"]
        if candidate["source"] == "google_shopping_public_sample"
        for signal in candidate["signals"]
        if signal["metricName"] == "public_market_price"
    ]

    assert public_market_price_signals == []
