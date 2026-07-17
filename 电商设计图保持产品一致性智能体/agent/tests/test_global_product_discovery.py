import json
import hashlib
import re
from pathlib import Path

import pytest
from web.services import platform_tasks

from web.services.global_product_discovery import (
    DEFAULT_SEED_QUERIES,
    DISCOVERY_SEEDS_PER_RUN,
    _bounded_text,
    _canonical_1688_offer_url,
    _concept_limit,
    _concept_evidence_group_key,
    _excluded_concept_keys,
    _is_light_small_export_concept,
    _semantic_concept_key,
    _source_bound_result_image,
    discover_global_products,
    explicit_purchase_metrics,
)


def test_candidate_limit_caps_concepts_not_source_observations(monkeypatch):
    monkeypatch.delenv("GLOBAL_DISCOVERY_MAX_CONCEPTS", raising=False)
    assert _concept_limit({"candidateLimit": 10}) == 10
    assert _concept_limit({"candidateLimit": 3}) == 3

    monkeypatch.setenv("GLOBAL_DISCOVERY_MAX_CONCEPTS", "6")
    assert _concept_limit({"candidateLimit": 10}) == 6


@pytest.mark.parametrize(
    ("name", "product_type", "allowed"),
    [
        ("compact cable organizer clips", "cable organizer clip", True),
        ("travel zipper storage pouch", "storage pouch", True),
        ("portable electric kettle", "electric appliance", False),
        ("glass spice jar", "glass kitchen container", False),
        ("large plastic storage cabinet", "storage cabinet", False),
        ("baby medicine dispenser", "medical baby product", False),
        ("chair leg floor protector", "floor protector", True),
        ("suitcase luggage tag", "luggage tag", True),
        ("table cable organizer clips", "cable organizer clip", True),
        ("furniture felt protector pads", "furniture felt pad", True),
        ("toothpaste tube squeezer", "tube squeezer", True),
        ("travel toothbrush protective caps", "toothbrush cap", True),
        ("replacement zipper pull tabs", "zipper pull", True),
    ],
)
def test_light_small_export_screen_is_conservative_and_class_level_only(
    name, product_type, allowed
):
    assert (
        _is_light_small_export_concept(
            {"name": name, "productType": product_type}
        )
        is allowed
    )


def test_semantic_concept_key_merges_plural_and_word_order_duplicates():
    assert _semantic_concept_key(
        {"name": "dog poop bags holder"}
    ) == _semantic_concept_key({"name": "dog poop bag holder"})
    assert _semantic_concept_key(
        {"name": "silicone luggage tag"}
    ) == _semantic_concept_key({"name": "luggage tag silicone"})
    assert _semantic_concept_key(
        {"name": "round luggage tag"}
    ) != _semantic_concept_key({"name": "leather luggage tag"})
    assert _semantic_concept_key(
        {"name": "compact travel-cases", "productType": "travel case"}
    ) == _semantic_concept_key(
        {"name": "compact travel cases", "productType": "travel case"}
    )
    assert _semantic_concept_key(
        {"name": "compact holder", "productType": "cable holder"}
    ) != _semantic_concept_key(
        {"name": "compact holder", "productType": "phone holder"}
    )
    assert _semantic_concept_key(
        {"name": "pet poop scooper bag", "productType": "pet poop scooper"}
    ) == _semantic_concept_key(
        {
            "name": "portable foldable dog poop scooper",
            "productType": "dog poop scooper",
        }
    )
    assert _semantic_concept_key(
        {
            "name": "replacement poop bags for scooper",
            "productType": "pet waste bag",
        }
    ) != _semantic_concept_key(
        {
            "name": "portable foldable dog poop scooper",
            "productType": "dog poop scooper",
        }
    )


def test_normalizer_emits_bounded_chinese_1688_sourcing_terms(monkeypatch):
    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: {
            "concepts": [
                {
                    "sourceIndex": 0,
                    "name": "compact cable organizer clips",
                    "productType": "cable organizer clip",
                    "ozonQuery": "зажимы органайзеры для кабелей",
                    "ozonRequiredTerms": ["зажимы", "кабелей"],
                    "sourcingQueryZh": "虚构品牌航空级钛合金欧盟认证超大号理线夹",
                    "sourcingRequiredTermsZh": ["理线夹"],
                }
            ]
        },
    )

    result = platform_tasks._normalize_global_discovery_titles(
        [
            {
                "title": "Compact cable organizer clips 120 sold",
                "snippet": "Reusable desk cable holder",
            }
        ]
    )

    assert result[0]["sourcingQueryZh"] == "理线夹"
    assert result[0]["sourcingRequiredTermsZh"] == ["理线夹"]


def test_normalizer_omits_1688_query_for_an_unmapped_product_class(monkeypatch):
    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: {
            "concepts": [
                {
                    "sourceIndex": 0,
                    "name": "novelty doodad accessory",
                    "productType": "novelty doodad",
                    "ozonQuery": "novelty doodad accessory",
                    "ozonRequiredTerms": ["novelty"],
                    "sourcingQueryZh": "虚构品牌欧盟认证航空级配件",
                    "sourcingRequiredTermsZh": ["配件"],
                }
            ]
        },
    )

    result = platform_tasks._normalize_global_discovery_titles(
        [{"title": "Novelty doodad accessory", "snippet": "Small accessory"}]
    )

    assert "sourcingQueryZh" not in result[0]
    assert "sourcingRequiredTermsZh" not in result[0]


@pytest.mark.parametrize(
    ("name", "product_type", "expected_query"),
    [
        ("mini dustpan and brush set", "mini dustpan brush set", "迷你簸箕刷套装"),
        ("desktop pen holder", "pen holder", "笔筒"),
        ("pet waste bag dispenser", "pet waste bag dispenser", "宠物拾便袋盒"),
        ("travel storage bag", "travel storage bag", "旅行收纳袋"),
        ("reusable cable tie straps", "cable strap", "魔术贴扎带"),
        ("laundry mesh wash bag", "laundry mesh bag", "洗衣网袋"),
        ("travel jewelry storage pouch", "jewelry storage pouch", "首饰收纳袋"),
        ("silicone chair leg protector caps", "chair leg protector", "椅脚保护套"),
        ("furniture felt protector pads", "furniture felt pad", "家具毛毡垫"),
        ("zipper pencil case pouch", "pencil case", "拉链笔袋"),
        ("plant support clips", "plant support clip", "植物固定夹"),
        ("keyboard cleaning brush", "keyboard cleaning brush", "键盘清洁刷"),
        ("toothpaste tube squeezer", "tube squeezer", "牙膏挤压器"),
        ("replacement zipper pull tabs", "zipper pull", "拉链头"),
        ("bed sheet holder clips", "bed sheet clip", "床单固定夹"),
        ("makeup brush protector sleeves", "makeup brush protector", "化妆刷保护套"),
        ("pill storage pouch", "pill storage pouch", None),
        ("travel case", "travel case", None),
    ],
)
def test_controlled_1688_terms_cover_only_specific_safe_product_classes(
    name, product_type, expected_query
):
    result = platform_tasks._controlled_1688_sourcing_terms(name, product_type)

    if expected_query is None:
        assert result is None
    else:
        assert result is not None
        assert result[0] == expected_query


def test_semantic_concept_keys_preserve_unicode_product_identity():
    assert _semantic_concept_key(
        {"name": "органайзер для кабелей", "productType": "органайзер"}
    ) == "для кабелей органайзер"
    assert _semantic_concept_key(
        {"name": "щетка для одежды", "productType": "щетка"}
    ) == "для одежды щетка"
    assert _semantic_concept_key(
        {"name": "桌面收纳盒", "productType": "收纳盒"}
    ) == "收纳盒 桌面收纳盒"
    assert _excluded_concept_keys(
        {"excludedConceptKeys": ["для кабелей органайзер", "收纳盒 桌面收纳盒"]}
    ) == {"для кабелей органайзер", "收纳盒 桌面收纳盒"}


def test_semantic_concept_key_matches_shared_backend_golden_vectors():
    vectors_path = (
        Path(__file__).resolve().parents[3]
        / "contracts"
        / "semantic-concept-key-vectors.json"
    )
    vectors = json.loads(vectors_path.read_text(encoding="utf-8"))

    for vector in vectors:
        assert _semantic_concept_key(
            {"name": vector["name"], "productType": vector["productType"]}
        ) == vector["expected"]


@pytest.mark.parametrize(
    ("name", "product_type", "expected"),
    [
        (
            "chair leg caps silicone feet protector pad",
            "chair leg protector",
            "chair leg protector",
        ),
        (
            "chair leg floor protector",
            "chair leg protector",
            "chair leg protector",
        ),
        (
            "compact car seat gap organizer",
            "seat gap organizer",
            "car seat gap accessory",
        ),
        (
            "car seat gap filler organizer",
            "seat gap filler",
            "car seat gap accessory",
        ),
        (
            "replacement poop bags for scooper",
            "poop scooper replacement bag",
            "poop scooper refill bag",
        ),
        ("pet poop scooper", "pet poop scooper", "poop scooper"),
    ],
)
def test_semantic_concept_key_clusters_high_similarity_without_merging_refills(
    name, product_type, expected
):
    assert _semantic_concept_key(
        {"name": name, "productType": product_type}
    ) == expected


def test_normalizer_prioritizes_late_light_accessories_over_earlier_bulky_rows(
    monkeypatch,
):
    observed_items = []

    def fake_chat(_prompt, payload, **_kwargs):
        observed_items.extend(payload["items"])
        light_item = next(
            item for item in payload["items"] if "Cable organizer" in item["title"]
        )
        return {
            "concepts": [
                {
                    "sourceIndex": light_item["sourceIndex"],
                    "name": "compact cable organizer clips",
                    "productType": "cable organizer clip",
                    "ozonQuery": "compact cable organizer clips",
                    "ozonRequiredTerms": ["compact"],
                }
            ]
        }

    monkeypatch.setattr(platform_tasks, "_chat_json", fake_chat)
    bulky = [
        {"title": f"Large storage cabinet {index}", "snippet": "furniture"}
        for index in range(30)
    ]
    items = bulky + [
        {"title": "Cable organizer clips 120 sold", "snippet": "desk cable holder"}
    ]

    result = platform_tasks._normalize_global_discovery_titles(items)

    assert len(observed_items) == 30
    assert any(item["sourceIndex"] == 30 for item in observed_items)
    assert result[0]["sourceIndex"] == 30


@pytest.mark.parametrize(
    "unsafe_url",
    [
        "https://user@detail.1688.com/offer/123456789.html",
        "https://detail.1688.com:444/offer/123456789.html",
        "https://sub.detail.1688.com/offer/123456789.html",
        "https://detail.1688.com/offer/../login",
        "https://detail.1688.com/offer/123456789.html;spm=abc",
        "https://detail.1688.com/offer/123456789.html/%3Fspm%3Dabc",
    ],
)
def test_1688_offer_url_rejects_noncanonical_variants(unsafe_url):
    assert _canonical_1688_offer_url(unsafe_url) is None


def test_1688_offer_url_rebuilds_from_offer_id_and_strips_tracking():
    assert _canonical_1688_offer_url(
        "https://detail.1688.com/offer/123456789.html?spm=abc#share"
    ) == "https://detail.1688.com/offer/123456789.html"


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


def _expected_default_seed_window(rotation_key):
    offset = (
        int.from_bytes(
            hashlib.sha256(rotation_key.encode("utf-8")).digest()[:8], "big"
        )
        % len(DEFAULT_SEED_QUERIES)
    )
    return tuple(
        DEFAULT_SEED_QUERIES[(offset + index) % len(DEFAULT_SEED_QUERIES)]
        for index in range(DISCOVERY_SEEDS_PER_RUN)
    )


def test_default_seed_catalog_has_a_bounded_rotating_light_small_frontier():
    assert len(DEFAULT_SEED_QUERIES) >= 36
    assert len(set(DEFAULT_SEED_QUERIES)) == len(DEFAULT_SEED_QUERIES)
    assert DISCOVERY_SEEDS_PER_RUN == 12


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
    assert first_batch == _expected_default_seed_window("continuous-loop-0001")
    assert next_batch == _expected_default_seed_window("continuous-loop-0002")
    assert next_batch != first_batch


def test_missing_exploration_key_keeps_business_date_seed_rotation(monkeypatch):
    business_date = "2026-07-16"
    batch = _captured_seed_batch(
        monkeypatch,
        {"businessDate": business_date, "candidateLimit": 10},
    )

    assert batch == _expected_default_seed_window(business_date)


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
    expected_batch = list(_expected_default_seed_window(exploration_key))

    assert result["methodology"]["seedQueries"] == actual_batch == expected_batch


def test_discovery_expands_real_seed_frontier_until_candidate_target(monkeypatch):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )

    def title_for_query(query):
        for index, seed in enumerate(DEFAULT_SEED_QUERIES):
            if seed in query:
                return f"Verified organizer concept {index}"
        quoted = re.search(r'"([^"]+)"', query)
        return quoted.group(1) if quoted else "Verified organizer concept fallback"

    def fake_search(query, num_results=8):
        if "site:ozon.ru" in query:
            return []
        if "site:temu.com" in query:
            title = title_for_query(query)
            return [
                {
                    "title": title,
                    "url": f"https://www.temu.com/{title.replace(' ', '-')}.html",
                    "snippet": "120 sold",
                    "provider": "test-search",
                }
            ]
        if "site:aliexpress.com" in query:
            title = title_for_query(query)
            return [
                {
                    "title": title,
                    "url": f"https://www.aliexpress.com/item/{abs(hash(title))}.html",
                    "snippet": "80 sold",
                    "provider": "test-search",
                }
            ]
        return []

    def normalize_titles(items):
        output = []
        seen = set()
        for index, item in enumerate(items):
            name = item["title"]
            if name in seen:
                continue
            seen.add(name)
            output.append(
                {
                    "sourceIndex": index,
                    "name": name,
                    "productType": "organizer concept",
                    "ozonQuery": name,
                    "ozonRequiredTerms": [],
                }
            )
        return output

    result = discover_global_products(
        {
            "businessDate": "2026-07-16",
            "candidateLimit": 3,
            "explorationKey": "frontier-expansion",
        },
        normalize_titles=normalize_titles,
        search_fn=fake_search,
        image_search_fn=lambda query, num_results=8: [],
        shopping_search_fn=lambda query, num_results=8: [],
    )

    assert result["conceptCount"] == 3
    assert result["requestedConceptCount"] == 3
    assert result["acceptedConceptCount"] == 3
    assert result["shortfall"] == 0
    assert result["expansionRounds"] >= 1
    assert len(result["methodology"]["seedQueries"]) > 2


def test_discovery_stops_starting_external_calls_when_budget_is_exhausted(
    monkeypatch,
):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    monkeypatch.setenv("GLOBAL_DISCOVERY_BUDGET_SECONDS", "120")

    class FakeClock:
        current = 0.0

        def __call__(self):
            return self.current

    clock = FakeClock()
    search_calls = []
    normalize_calls = []

    def slow_search(query, num_results=8):
        search_calls.append(query)
        clock.current += 61
        return []

    result = discover_global_products(
        {"businessDate": "2026-07-16", "candidateLimit": 10},
        normalize_titles=lambda items: normalize_calls.append(items) or [],
        search_fn=slow_search,
        image_search_fn=lambda query, num_results=8: [],
        shopping_search_fn=lambda query, num_results=8: [],
        monotonic_fn=clock,
    )

    assert len(search_calls) == 2
    assert normalize_calls == []
    assert result["budgetExhausted"] is True
    assert result["budgetSeconds"] == 120
    assert result["shortfall"] == 10
    assert result["exhaustedSources"] is False


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
        if "site:detail.1688.com/offer" in query:
            return [
                {
                    "title": "桌面木质收纳盒 办公文具整理盒",
                    "url": (
                        "https://detail.1688.com/offer/123456789.html"
                        "?spm=tracking&share_token=discard-me"
                    ),
                    "snippet": "阿里巴巴 1688 公开商品页",
                    "provider": "tavily",
                }
            ]
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
                "sourcingQueryZh": "桌面木质收纳盒",
                "sourcingRequiredTermsZh": ["收纳盒"],
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
        "1688_public_sourcing_lead",
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
    sourcing = next(
        item
        for item in result["candidates"]
        if item["source"] == "1688_public_sourcing_lead"
    )
    assert sourcing["url"] == "https://detail.1688.com/offer/123456789.html"
    assert sourcing["externalId"] == "123456789"
    assert sourcing["salePrice"] is None
    assert sourcing["costs"] == []
    assert sourcing["platformFeeRate"] is None
    assert sourcing["paymentFeeRate"] is None
    assert sourcing["adRate"] is None
    assert sourcing["refundRate"] is None
    assert "not verified" in sourcing["evidenceScope"].lower()
    assert {
        item.get("sourcingQueryZh") for item in result["candidates"]
    } == {"桌面收纳盒"}
    assert result["sourcingLeadCount"] == 1
    assert result["methodology"]["lightSmallScreen"]["specStatus"] == (
        "SUPPLIER_WEIGHT_AND_DIMENSIONS_UNVERIFIED"
    )


def test_discovery_keeps_tavily_result_bound_marketplace_image(monkeypatch):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("tavily", "configured"),
    )

    temu_page = "https://www.temu.com/compact-cable-organizer-clips-g-1.html"
    temu_image = "https://aimg.kwcdn.com/upload_aimg/cable-clips.png"

    def fake_search(query, num_results=8):
        if "site:temu.com" in query:
            return [
                {
                    "title": "Compact cable organizer clips",
                    "url": temu_page,
                    "snippet": "1,200 sold",
                    "provider": "tavily",
                    "image_url": temu_image,
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": "Compact cable organizer clips",
                    "url": "https://www.aliexpress.com/item/1005001.html",
                    "snippet": "300 sold",
                    "provider": "tavily",
                }
            ]
        if "site:ozon.ru" in query or "site:detail.1688.com/offer" in query:
            return []
        return []

    result = discover_global_products(
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 1,
            "seedQueries": ["cable organization"],
        },
        normalize_titles=lambda _items: [
            {
                "sourceIndex": 0,
                "name": "compact cable organizer clips",
                "productType": "cable organizer clip",
                "ozonQuery": "зажимы для кабелей",
                "ozonRequiredTerms": ["зажимы", "кабелей"],
            }
        ],
        search_fn=fake_search,
        image_search_fn=lambda _query, num_results=8: [],
        shopping_search_fn=lambda _query, num_results=8: [],
    )

    temu = next(
        item
        for item in result["candidates"]
        if item["source"] == "temu_public_search"
    )
    assert temu["imageUrl"] == temu_image
    assert temu["imageEvidenceUrl"] == temu_page


@pytest.mark.parametrize(
    "result",
    [
        {
            "provider": "unknown",
            "url": "https://www.temu.com/item.html",
            "image_url": "https://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://example.com/item.html",
            "image_url": "https://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com/item.html",
            "image_url": "http://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com/item.html",
            "image_url": "https://www.temu.com/item.html",
        },
        {
            "provider": "tavily",
            "url": "http://www.temu.com/item.html",
            "image_url": "https://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://user:password@www.temu.com/item.html",
            "image_url": "https://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com:8443/item.html",
            "image_url": "https://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com/item.html?access_token=secret",
            "image_url": "https://aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com/item.html",
            "image_url": "https://tracker.example/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com/item.html",
            "image_url": "https://user:password@aimg.kwcdn.com/item.png",
        },
        {
            "provider": "tavily",
            "url": "https://www.temu.com/item.html",
            "image_url": "https://aimg.kwcdn.com:8443/item.png",
        },
    ],
)
def test_source_bound_result_image_rejects_untrusted_pairings(result):
    assert _source_bound_result_image(result, ("temu.com",)) == {}


@pytest.mark.parametrize(
    ("page_domains", "page_url", "image_url"),
    [
        (
            ("temu.com",),
            "https://www.temu.com/item.html",
            "https://aimg.kwcdn.com/item.png",
        ),
        (
            ("aliexpress.com",),
            "https://www.aliexpress.com/item/1005001.html",
            "https://ae-pic-a1.aliexpress-media.com/item.jpg",
        ),
        (
            ("walmart.com",),
            "https://www.walmart.com/ip/123",
            "https://i5.walmartimages.com/item.jpeg",
        ),
        (
            ("etsy.com",),
            "https://www.etsy.com/listing/123/item",
            "https://i.etsystatic.com/item.jpg",
        ),
    ],
)
def test_source_bound_result_image_accepts_only_marketplace_image_cdns(
    page_domains,
    page_url,
    image_url,
):
    assert _source_bound_result_image(
        {
            "provider": "tavily",
            "url": page_url,
            "image_url": image_url,
        },
        page_domains,
    ) == {"imageUrl": image_url, "imageEvidenceUrl": page_url}


def test_discovery_excludes_historical_concepts_before_deep_search_and_refills(
    monkeypatch,
):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    historical = {
        "name": "compact cable organizer clips",
        "productType": "cable organizer clip",
    }
    replacement = {
        "name": "lightweight luggage tag",
        "productType": "luggage tag",
    }
    deep_search_names = []

    def fake_search(query, num_results=8):
        if "site:detail.1688.com/offer" in query or "site:ozon.ru" in query:
            return []
        quoted = re.search(r'"([^"]+)"', query)
        name = quoted.group(1) if quoted else "seed compact accessory"
        if quoted:
            deep_search_names.append(name)
        if "site:temu.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.temu.com/verified-item.html",
                    "snippet": "120 sold",
                    "provider": "test-search",
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.aliexpress.com/item/1005001.html",
                    "snippet": "80 sold",
                    "provider": "test-search",
                }
            ]
        return []

    result = discover_global_products(
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 1,
            "seedQueries": ["compact accessory"],
            "excludedConceptKeys": [_semantic_concept_key(historical)],
        },
        normalize_titles=lambda _items: [historical, replacement],
        search_fn=fake_search,
        image_search_fn=lambda _query, num_results=8: [],
        shopping_search_fn=lambda _query, num_results=8: [],
    )

    candidate_names = {item["name"] for item in result["candidates"]}
    assert historical["name"] not in candidate_names
    assert historical["name"] not in deep_search_names
    assert replacement["name"] in candidate_names
    assert result["excludedByHistoryCount"] == 1


@pytest.mark.parametrize(
    ("normalized_count", "expected_count", "expected_shortfall"),
    [(15, 10, 0), (10, 5, 5)],
)
def test_discovery_overfetches_unique_families_or_reports_honest_shortfall(
    monkeypatch, normalized_count, expected_count, expected_shortfall
):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    concepts = [
        {"name": "hard glasses case", "productType": "hard glasses case"},
        {
            "name": "aluminum hard shell eyeglasses case",
            "productType": "aluminum hard shell eyeglasses case",
        },
        {
            "name": "earphone storage pouch",
            "productType": "earphone storage pouch",
        },
        {
            "name": "earphone storage case",
            "productType": "earphone storage case",
        },
        {"name": "badge holder", "productType": "badge holder"},
        {
            "name": "id tag work card sleeve",
            "productType": "id tag work card sleeve",
        },
        {
            "name": "hard plastic badge holder",
            "productType": "hard plastic badge holder",
        },
        {
            "name": "transparent badge holder",
            "productType": "transparent badge holder",
        },
        {
            "name": "sewing thread organizer",
            "productType": "sewing thread organizer",
        },
        {"name": "curtain tieback holder", "productType": "curtain tieback holder"},
        {"name": "zipper pencil case pouch", "productType": "pencil case"},
        {
            "name": "passport document holder sleeve",
            "productType": "passport holder",
        },
        {"name": "plant label tags", "productType": "plant label tag"},
        {"name": "replacement zipper pull tabs", "productType": "zipper pull"},
        {
            "name": "keyboard cleaning brush",
            "productType": "keyboard cleaning brush",
        },
    ]

    def fake_search(query, num_results=8):
        if "site:ozon.ru" in query or "site:detail.1688.com/offer" in query:
            return []
        quoted = re.search(r'"([^"]+)"', query)
        name = quoted.group(1) if quoted else "seed compact organizer"
        if "site:temu.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.temu.com/verified-item.html",
                    "snippet": "120 sold",
                    "provider": "test-search",
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.aliexpress.com/item/1005001.html",
                    "snippet": "80 sold",
                    "provider": "test-search",
                }
            ]
        return []

    result = discover_global_products(
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 10,
            "seedQueries": ["compact accessory"],
        },
        normalize_titles=lambda _items: concepts[:normalized_count],
        search_fn=fake_search,
        image_search_fn=lambda _query, num_results=8: [],
        shopping_search_fn=lambda _query, num_results=8: [],
    )

    concept_keys = {item["conceptKey"] for item in result["candidates"]}
    assert result["conceptCount"] == expected_count
    assert result["acceptedConceptCount"] == expected_count
    assert result["duplicateConceptCount"] == 5
    assert result["shortfall"] == expected_shortfall
    assert result["exhaustedSources"] is (expected_shortfall > 0)
    assert len(concept_keys) == expected_count


@pytest.mark.parametrize(
    ("normalized_count", "expected_count", "expected_shortfall"),
    [(12, 10, 0), (10, 8, 2)],
)
def test_discovery_refills_after_makeup_and_toothbrush_family_deduplication(
    monkeypatch, normalized_count, expected_count, expected_shortfall
):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    concepts = [
        {
            "name": "makeup brush protector",
            "productType": "makeup brush protector",
        },
        {
            "name": "makeup brush protector mesh sleeve",
            "productType": "makeup brush protector sleeve",
        },
        {
            "name": "toothbrush head cover",
            "productType": "toothbrush head cover",
        },
        {
            "name": "toothbrush cover case",
            "productType": "toothbrush cover case",
        },
        {
            "name": "sewing thread organizer",
            "productType": "sewing thread organizer",
        },
        {"name": "curtain tieback holder", "productType": "curtain holder"},
        {"name": "zipper pencil case pouch", "productType": "pencil case"},
        {
            "name": "passport document holder sleeve",
            "productType": "passport holder",
        },
        {"name": "plant label tags", "productType": "plant label tag"},
        {"name": "replacement zipper pull tabs", "productType": "zipper pull"},
        {
            "name": "keyboard cleaning brush",
            "productType": "keyboard cleaning brush",
        },
        {
            "name": "compact cable organizer clips",
            "productType": "cable organizer clip",
        },
    ]

    def fake_search(query, num_results=8):
        if "site:ozon.ru" in query or "site:detail.1688.com/offer" in query:
            return []
        quoted = re.search(r'"([^"]+)"', query)
        name = quoted.group(1) if quoted else "seed compact organizer"
        if "site:temu.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.temu.com/verified-item.html",
                    "snippet": "120 sold",
                    "provider": "test-search",
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.aliexpress.com/item/1005001.html",
                    "snippet": "80 sold",
                    "provider": "test-search",
                }
            ]
        return []

    result = discover_global_products(
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 10,
            "seedQueries": ["compact accessory"],
        },
        normalize_titles=lambda _items: concepts[:normalized_count],
        search_fn=fake_search,
        image_search_fn=lambda _query, num_results=8: [],
        shopping_search_fn=lambda _query, num_results=8: [],
    )

    concept_keys = {item["conceptKey"] for item in result["candidates"]}
    assert result["conceptCount"] == expected_count
    assert result["acceptedConceptCount"] == expected_count
    assert result["duplicateConceptCount"] == 2
    assert result["shortfall"] == expected_shortfall
    assert result["exhaustedSources"] is (expected_shortfall > 0)
    assert len(concept_keys) == expected_count


def test_discovery_counts_each_canonical_1688_offer_once_across_concepts(
    monkeypatch,
):
    monkeypatch.setattr(
        "web.services.global_product_discovery.resolve_search_provider",
        lambda: ("test-search", "configured"),
    )
    concepts = [
        {
            "name": "compact cable organizer clips",
            "productType": "cable organizer clip",
            "sourcingQueryZh": "理线夹",
            "sourcingRequiredTermsZh": ["理线夹"],
        },
        {
            "name": "small desk organizer",
            "productType": "desk organizer",
            "sourcingQueryZh": "桌面收纳盒",
            "sourcingRequiredTermsZh": ["桌面", "收纳盒"],
        },
    ]

    def fake_search(query, num_results=8):
        if "site:detail.1688.com/offer" in query:
            return [
                {
                    "title": "桌面理线夹 桌面收纳盒",
                    "url": (
                        "https://detail.1688.com/offer/123456789.html"
                        "?spm=different-tracking"
                    ),
                    "snippet": "1688 公开商品页",
                    "provider": "test-search",
                }
            ]
        if "site:ozon.ru" in query:
            return []
        quoted = re.search(r'"([^"]+)"', query)
        name = quoted.group(1) if quoted else "seed compact organizer"
        if "site:temu.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.temu.com/verified-item.html",
                    "snippet": "120 sold",
                    "provider": "test-search",
                }
            ]
        if "site:aliexpress.com" in query:
            return [
                {
                    "title": name,
                    "url": "https://www.aliexpress.com/item/1005001.html",
                    "snippet": "80 sold",
                    "provider": "test-search",
                }
            ]
        return []

    result = discover_global_products(
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 2,
            "seedQueries": ["compact organizer"],
        },
        normalize_titles=lambda _items: concepts,
        search_fn=fake_search,
        image_search_fn=lambda _query, num_results=8: [],
        shopping_search_fn=lambda _query, num_results=8: [],
    )

    leads = [
        item
        for item in result["candidates"]
        if item["source"] == "1688_public_sourcing_lead"
    ]
    assert len(leads) == 1
    assert leads[0]["externalId"] == "123456789"
    assert result["sourcingLeadCount"] == 1
    assert result["duplicateSourcingOfferCount"] == 1

    excluded_result = discover_global_products(
        {
            "businessDate": "2026-07-17",
            "candidateLimit": 2,
            "seedQueries": ["compact organizer"],
            "excludedSourcingOfferIds": ["123456789"],
        },
        normalize_titles=lambda _items: concepts,
        search_fn=fake_search,
        image_search_fn=lambda _query, num_results=8: [],
        shopping_search_fn=lambda _query, num_results=8: [],
    )
    assert not any(
        item["source"] == "1688_public_sourcing_lead"
        for item in excluded_result["candidates"]
    )
    assert excluded_result["duplicateSourcingOfferCount"] == 2


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
