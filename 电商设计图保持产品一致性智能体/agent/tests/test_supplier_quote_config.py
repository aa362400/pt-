import pytest

from web.services.supplier_quote_config import (
    ImageSearchOutcome,
    SupplierQuoteConfigError,
    should_use_keyword_fallback,
    load_supplier_quote_config,
)


def enabled_env(**overrides):
    values = {
        "SUPPLIER_QUOTE_ENABLED": "1",
        "SUPPLIER_QUOTE_PROVIDER": "future-1688-api",
        "SUPPLIER_QUOTE_API_BASE_URL": "https://supplier.example.com",
        "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH": "/v1/1688/search-by-image",
        "SUPPLIER_QUOTE_EXACT_QUOTE_PATH": "/v1/1688/quote",
        "SUPPLIER_QUOTE_API_KEY": "secret-value-never-expose",
        "SUPPLIER_QUOTE_DESTINATION_COUNTRY": "RU",
        "SUPPLIER_QUOTE_QUANTITY": "100",
        "SUPPLIER_QUOTE_TIMEOUT_SECONDS": "20",
        "SUPPLIER_QUOTE_MAX_AGE_SECONDS": "3600",
        "SUPPLIER_QUOTE_MAX_IMAGE_RESULTS": "10",
        "SUPPLIER_QUOTE_KEYWORD_FALLBACK": "1",
    }
    values.update(overrides)
    return values


def test_supplier_quote_is_disabled_by_default():
    config = load_supplier_quote_config({})

    assert config.enabled is False
    assert config.public_status() == {
        "enabled": False,
        "configured": False,
        "provider": None,
        "destinationCountry": "RU",
        "imageSearch": False,
        "imageSearchConfigured": False,
        "exactQuote": False,
        "exactQuoteStatus": "UNAVAILABLE_NO_CONTRACT",
        "keywordFallback": False,
        "blockingReasons": [
            {
                "code": "SUPPLIER_QUOTE_DISABLED",
                "messageZh": "1688 供应商检索未启用，当前不会调用供应商接口。",
            },
            {
                "code": "SUPPLIER_EXACT_QUOTE_CONTRACT_UNAVAILABLE",
                "messageZh": "尚未接入可验证的精确报价合同；图片搜索结果和公开 1688 链接不能作为采购报价证据。",
            },
        ],
    }


def test_supplier_quote_status_explains_real_blockers_in_chinese_without_secrets():
    status = load_supplier_quote_config({}).public_status()

    assert status["blockingReasons"] == [
        {
            "code": "SUPPLIER_QUOTE_DISABLED",
            "messageZh": "1688 供应商检索未启用，当前不会调用供应商接口。",
        },
        {
            "code": "SUPPLIER_EXACT_QUOTE_CONTRACT_UNAVAILABLE",
            "messageZh": "尚未接入可验证的精确报价合同；图片搜索结果和公开 1688 链接不能作为采购报价证据。",
        },
    ]
    assert "secret" not in str(status).lower()


def test_disabled_supplier_status_explains_an_insecure_configured_endpoint():
    status = load_supplier_quote_config(
        {
            "SUPPLIER_QUOTE_ENABLED": "0",
            "SUPPLIER_QUOTE_PROVIDER": "1688-image-search-v1",
            "SUPPLIER_QUOTE_API_BASE_URL": "http://supplier.example.com",
            "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH": "/api/imageSearch1688/search",
            "SUPPLIER_QUOTE_API_KEY": "secret-value-never-expose",
        }
    ).public_status()

    assert {
        "code": "SUPPLIER_QUOTE_INSECURE_ENDPOINT",
        "messageZh": "1688 供应商接口当前不是有效 HTTPS，平台不会通过明文连接发送 token。",
    } in status["blockingReasons"]
    assert "secret-value-never-expose" not in str(status)


@pytest.mark.parametrize(
    "missing",
    [
        "SUPPLIER_QUOTE_PROVIDER",
        "SUPPLIER_QUOTE_API_BASE_URL",
        "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH",
        "SUPPLIER_QUOTE_API_KEY",
    ],
)
def test_enabled_supplier_image_search_requires_its_provider_contract(missing):
    env = enabled_env()
    env.pop(missing)

    with pytest.raises(SupplierQuoteConfigError) as error:
        load_supplier_quote_config(env)

    assert error.value.code == "SUPPLIER_QUOTE_CONFIG_INCOMPLETE"
    assert missing in str(error.value)


def test_image_search_can_be_configured_before_exact_quote_contract_exists():
    env = enabled_env()
    env.pop("SUPPLIER_QUOTE_EXACT_QUOTE_PATH")

    config = load_supplier_quote_config(env)

    assert config.enabled is True
    assert config.exact_quote_path is None
    assert config.public_status() == {
        "enabled": True,
        "configured": False,
        "provider": "future-1688-api",
        "destinationCountry": "RU",
        "imageSearch": True,
        "imageSearchConfigured": True,
        "exactQuote": False,
        "exactQuoteStatus": "UNAVAILABLE_NO_CONTRACT",
        "keywordFallback": True,
        "blockingReasons": [
            {
                "code": "SUPPLIER_EXACT_QUOTE_CONTRACT_UNAVAILABLE",
                "messageZh": "尚未接入可验证的精确报价合同；图片搜索结果和公开 1688 链接不能作为采购报价证据。",
            },
        ],
    }


def test_enabled_supplier_quote_requires_https_and_ru_destination():
    with pytest.raises(SupplierQuoteConfigError) as insecure:
        load_supplier_quote_config(
            enabled_env(SUPPLIER_QUOTE_API_BASE_URL="http://supplier.example.com")
        )
    assert insecure.value.code == "SUPPLIER_QUOTE_HTTPS_REQUIRED"

    with pytest.raises(SupplierQuoteConfigError) as wrong_destination:
        load_supplier_quote_config(
            enabled_env(SUPPLIER_QUOTE_DESTINATION_COUNTRY="CN")
        )
    assert wrong_destination.value.code == "SUPPLIER_QUOTE_RU_DESTINATION_REQUIRED"


def test_insecure_http_requires_an_explicit_exact_host_allowlist():
    config = load_supplier_quote_config(
        enabled_env(
            SUPPLIER_QUOTE_API_BASE_URL="http://123.56.116.52",
            SUPPLIER_QUOTE_ALLOW_INSECURE_HTTP="1",
            SUPPLIER_QUOTE_INSECURE_HTTP_ALLOWLIST="123.56.116.52",
        )
    )

    assert config.insecure_http_allowed is True
    assert config.public_status()["imageSearchConfigured"] is True
    assert {
        "code": "SUPPLIER_QUOTE_INSECURE_HTTP_ENABLED",
        "messageZh": "1688 图片检索已按管理员配置通过固定 IP 的明文 HTTP 连接；token 会随请求发送，请尽快恢复 HTTPS。",
    } in config.public_status()["blockingReasons"]


def test_insecure_http_opt_in_never_allows_a_host_outside_the_allowlist():
    with pytest.raises(SupplierQuoteConfigError) as error:
        load_supplier_quote_config(
            enabled_env(
                SUPPLIER_QUOTE_API_BASE_URL="http://supplier.example.com",
                SUPPLIER_QUOTE_ALLOW_INSECURE_HTTP="1",
                SUPPLIER_QUOTE_INSECURE_HTTP_ALLOWLIST="123.56.116.52",
            )
        )

    assert error.value.code == "SUPPLIER_QUOTE_HTTPS_REQUIRED"


def test_exact_quote_path_alone_never_reports_an_unimplemented_capability_ready():
    config = load_supplier_quote_config(enabled_env())

    status = config.public_status()
    rendered = f"{config!r} {status!r}"

    assert config.enabled is True
    assert status["configured"] is False
    assert status["imageSearch"] is True
    assert status["imageSearchConfigured"] is True
    assert status["exactQuote"] is False
    assert status["exactQuoteStatus"] == "UNAVAILABLE_NO_CONTRACT"
    assert "secret-value-never-expose" not in rendered
    assert "api_key" not in repr(config).lower()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("SUPPLIER_QUOTE_QUANTITY", "0"),
        ("SUPPLIER_QUOTE_TIMEOUT_SECONDS", "0"),
        ("SUPPLIER_QUOTE_MAX_AGE_SECONDS", "30"),
        ("SUPPLIER_QUOTE_MAX_IMAGE_RESULTS", "0"),
    ],
)
def test_supplier_quote_rejects_unsafe_numeric_limits(field, value):
    with pytest.raises(SupplierQuoteConfigError) as error:
        load_supplier_quote_config(enabled_env(**{field: value}))

    assert error.value.code == "SUPPLIER_QUOTE_CONFIG_INVALID"


@pytest.mark.parametrize(
    "outcome",
    [
        ImageSearchOutcome.SOURCE_IMAGE_MISSING,
        ImageSearchOutcome.UNSUPPORTED,
        ImageSearchOutcome.NO_RESULTS,
    ],
)
def test_keyword_fallback_is_recall_only_for_explicit_image_limitations(outcome):
    config = load_supplier_quote_config(enabled_env())

    assert should_use_keyword_fallback(config, outcome) is True


@pytest.mark.parametrize(
    "outcome",
    [
        ImageSearchOutcome.AUTH_FAILED,
        ImageSearchOutcome.RATE_LIMITED,
        ImageSearchOutcome.MALFORMED_RESPONSE,
        ImageSearchOutcome.PROVIDER_ERROR,
        ImageSearchOutcome.MATCHES,
    ],
)
def test_keyword_fallback_never_masks_provider_or_contract_failures(outcome):
    config = load_supplier_quote_config(enabled_env())

    assert should_use_keyword_fallback(config, outcome) is False
