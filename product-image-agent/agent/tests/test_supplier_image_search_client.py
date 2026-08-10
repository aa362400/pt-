import base64
import hashlib
import json
from dataclasses import asdict
from datetime import datetime

import pytest
import requests
from PIL import Image

from web.services.supplier_image_search_client import (
    SUPPLIER_IMAGE_SEARCH_ADAPTER_VERSION,
    SupplierImageSearchClient,
    SupplierImageSearchError,
)
from web.services.supplier_quote_config import (
    ImageSearchOutcome,
    load_supplier_quote_config,
)


SECRET = "test-secret-that-must-never-leak"
REQUEST_ID = "platform-request-1688-001"


def image_only_config(**overrides):
    env = {
        "SUPPLIER_QUOTE_ENABLED": "1",
        "SUPPLIER_QUOTE_PROVIDER": "documented-1688-image-search",
        "SUPPLIER_QUOTE_API_BASE_URL": "https://supplier.example.com",
        "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH": "/api/imageSearch1688/search",
        "SUPPLIER_QUOTE_API_KEY": SECRET,
        "SUPPLIER_QUOTE_TIMEOUT_SECONDS": "9",
        "SUPPLIER_QUOTE_MAX_IMAGE_RESULTS": "10",
    }
    env.update(overrides)
    return load_supplier_quote_config(env)


def success_body(results):
    return {
        "code": 10000,
        "msg": "success",
        "success": True,
        "data": json.dumps(
            {"success": True, "imageSearchResult": results},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    }


class FakeResponse:
    def __init__(self, status_code=200, body=None, *, raw_text=None):
        self.status_code = status_code
        text = raw_text if raw_text is not None else json.dumps(body)
        self._raw_bytes = text.encode("utf-8")
        self.text = text
        self.closed = False

    def iter_content(self, chunk_size=1, decode_unicode=False):
        assert decode_unicode is False
        for offset in range(0, len(self._raw_bytes), chunk_size):
            yield self._raw_bytes[offset : offset + chunk_size]

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.error is not None:
            raise self.error
        return self.response


def test_posts_documented_json_contract_without_redirects_and_url_wins():
    response = FakeResponse(
        body=success_body(
            [
                {
                    "offerId": 7234567890123456789,
                    "subject": "示例标题",
                    "price": "10.50",
                    "consignPrice": 10.5,
                    "multipleConsignPrice": "9.80",
                    "detailUrl": "https://detail.1688.com/offer/723.html",
                    "image": "https://cbu01.alicdn.com/723.jpg",
                    "distributionFreePostage": True,
                }
            ]
        )
    )
    session = FakeSession(response)
    client = SupplierImageSearchClient(image_only_config(), session=session)

    result = client.search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
        img_base64="not-even-valid-base64-but-url-must-win",
        image_keywords="女装连衣裙",
    )

    assert result.outcome is ImageSearchOutcome.MATCHES
    assert result.offers[0].offer_id == "7234567890123456789"
    assert result.offers[0].display_price_evidence == {
        "price": "10.50",
        "consignPrice": "10.5",
        "multipleConsignPrice": "9.80",
        "evidenceUse": "DISPLAY_ONLY",
        "verifiedProcurementCost": False,
    }
    assert not hasattr(result.offers[0], "procurement_cost")
    assert not hasattr(result.offers[0], "currency")

    url, request = session.calls[0]
    assert url == "https://supplier.example.com/api/imageSearch1688/search"
    assert request["headers"] == {
        "Content-Type": "application/json",
        "token": SECRET,
    }
    assert request["json"] == {
        "imgUrl": "https://cbu01.alicdn.com/source.jpg",
        "imageKeywords": "女装连衣裙",
    }
    assert request["timeout"] == 9
    assert request["allow_redirects"] is False
    assert request["stream"] is True
    assert response.closed is True


def test_accepts_plain_and_data_uri_base64_at_decoded_3mb_boundary():
    decoded = b"a" * (3 * 1024 * 1024)
    encoded = base64.b64encode(decoded).decode("ascii")

    for value in (encoded, "data:image/png;base64," + encoded):
        session = FakeSession(FakeResponse(body=success_body([])))
        result = SupplierImageSearchClient(
            image_only_config(), session=session
        ).search(request_id=REQUEST_ID, img_base64=value)

        assert result.outcome is ImageSearchOutcome.NO_RESULTS
        assert session.calls[0][1]["json"] == {"imgBase64": value}


def test_search_file_always_uses_the_versioned_size_bounded_payload(tmp_path):
    source = tmp_path / "source.png"
    Image.new("RGB", (1600, 800), (30, 60, 90)).save(source)
    session = FakeSession(FakeResponse(body=success_body([])))

    execution = SupplierImageSearchClient(
        image_only_config(), session=session
    ).search_file(
        source,
        tmp_path / "canonical",
        request_id=REQUEST_ID,
        image_keywords="收纳",
    )

    sent = session.calls[0][1]["json"]["imgBase64"]
    decoded = base64.b64decode(sent.split(",", 1)[1], validate=True)
    assert len(decoded) <= 3 * 1024 * 1024
    assert execution.result.outcome is ImageSearchOutcome.NO_RESULTS
    assert (
        execution.image_evidence["canonicalizationVersion"]
        == "supplier-image-search-payload/v2"
    )
    assert execution.image_evidence["decodedSizeBytes"] == len(decoded)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"img_base64": "not-valid-base64"},
        {
            "img_base64": base64.b64encode(b"a" * (3 * 1024 * 1024 + 1)).decode(
                "ascii"
            )
        },
        {"img_url": "https://user:password@example.com/source.jpg"},
        {"img_url": "http://example.com/source.jpg"},
    ],
)
def test_rejects_unsafe_or_unsupported_image_input_before_network(kwargs):
    session = FakeSession(FakeResponse(body=success_body([])))

    with pytest.raises(SupplierImageSearchError) as error:
        SupplierImageSearchClient(image_only_config(), session=session).search(
            request_id=REQUEST_ID, **kwargs
        )

    assert error.value.outcome is ImageSearchOutcome.UNSUPPORTED
    assert session.calls == []


@pytest.mark.parametrize("kwargs", [{}, {"img_url": "  ", "img_base64": "  "}])
def test_classifies_a_missing_source_image_before_network(kwargs):
    session = FakeSession(FakeResponse(body=success_body([])))

    with pytest.raises(SupplierImageSearchError) as error:
        SupplierImageSearchClient(image_only_config(), session=session).search(
            request_id=REQUEST_ID, **kwargs
        )

    assert error.value.outcome is ImageSearchOutcome.SOURCE_IMAGE_MISSING
    assert session.calls == []


@pytest.mark.parametrize(
    ("response", "network_error", "expected"),
    [
        (FakeResponse(status_code=401, body={}), None, ImageSearchOutcome.AUTH_FAILED),
        (FakeResponse(status_code=403, body={}), None, ImageSearchOutcome.AUTH_FAILED),
        (FakeResponse(status_code=429, body={}), None, ImageSearchOutcome.RATE_LIMITED),
        (FakeResponse(status_code=302, body={}), None, ImageSearchOutcome.PROVIDER_ERROR),
        (FakeResponse(status_code=500, body={}), None, ImageSearchOutcome.PROVIDER_ERROR),
        (None, requests.Timeout("secret in transport detail"), ImageSearchOutcome.PROVIDER_ERROR),
        (
            FakeResponse(
                body={"code": 20000, "msg": "未授权", "success": False, "data": None}
            ),
            None,
            ImageSearchOutcome.AUTH_FAILED,
        ),
        (
            FakeResponse(
                body={"code": 20000, "msg": "上游失败", "success": False, "data": None}
            ),
            None,
            ImageSearchOutcome.PROVIDER_ERROR,
        ),
    ],
)
def test_classifies_transport_and_provider_failures(response, network_error, expected):
    session = FakeSession(response, error=network_error)

    with pytest.raises(SupplierImageSearchError) as error:
        SupplierImageSearchClient(image_only_config(), session=session).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg"
        )

    assert error.value.outcome is expected
    if response is not None:
        assert response.closed is True


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(raw_text="not-json"),
        FakeResponse(body=[]),
        FakeResponse(
            body={"code": True, "msg": "success", "success": True, "data": "{}"}
        ),
        FakeResponse(
            body={"code": 10000, "msg": "success", "success": False, "data": "{}"}
        ),
        FakeResponse(
            body={"code": 10000, "msg": "success", "success": True, "data": {}}
        ),
        FakeResponse(
            body={"code": 10000, "msg": "success", "success": True, "data": "not-json"}
        ),
        FakeResponse(
            body={
                "code": 10000,
                "msg": "success",
                "success": True,
                "data": json.dumps(
                    {"success": "true", "imageSearchResult": []}
                ),
            }
        ),
        FakeResponse(
            body=success_body([{"offerId": True, "subject": "bad id"}])
        ),
        FakeResponse(
            body=success_body(
                [
                    {
                        "offerId": "123",
                        "detailUrl": "https://user:password@detail.1688.com/offer/123.html",
                    }
                ]
            )
        ),
    ],
)
def test_rejects_malformed_third_party_responses(response):
    with pytest.raises(SupplierImageSearchError) as error:
        SupplierImageSearchClient(
            image_only_config(), session=FakeSession(response)
        ).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert error.value.outcome is ImageSearchOutcome.MALFORMED_RESPONSE
    assert response.closed is True


def test_inner_success_false_is_provider_error_and_empty_list_is_no_results():
    inner_failed = FakeResponse(
        body={
            "code": 10000,
            "msg": "success",
            "success": True,
            "data": json.dumps(
                {"success": False, "imageSearchResult": []}, ensure_ascii=False
            ),
        }
    )
    with pytest.raises(SupplierImageSearchError) as error:
        SupplierImageSearchClient(
            image_only_config(), session=FakeSession(inner_failed)
        ).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )
    assert error.value.outcome is ImageSearchOutcome.PROVIDER_ERROR

    empty = SupplierImageSearchClient(
        image_only_config(),
        session=FakeSession(FakeResponse(body=success_body([]))),
    ).search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
    )
    assert empty.outcome is ImageSearchOutcome.NO_RESULTS
    assert empty.offers == ()


def test_secret_is_absent_from_client_repr_and_all_error_text():
    reflected = FakeResponse(
        body={
            "code": 20000,
            "msg": f"未授权: {SECRET}",
            "success": False,
            "data": None,
        }
    )
    client = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(reflected)
    )

    with pytest.raises(SupplierImageSearchError) as captured:
        client.search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    rendered = f"{client!r} {captured.value!s} {captured.value!r}"
    assert SECRET not in rendered
    assert "token" not in repr(client).casefold()


def test_success_provenance_binds_adapter_provider_request_time_and_raw_hash():
    raw_marker = "raw-response-marker-must-not-be-returned"
    body = success_body([{"offerId": "123", "subject": "safe offer"}])
    body["ignoredProviderField"] = raw_marker
    first_response = FakeResponse(body=body)
    second_response = FakeResponse(body=body)

    first = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(first_response)
    ).search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
    )
    second = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(second_response)
    ).search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
    )

    provenance = first.provenance
    assert SUPPLIER_IMAGE_SEARCH_ADAPTER_VERSION == "supplier-image-search-adapter/v1"
    assert provenance.adapter_version == SUPPLIER_IMAGE_SEARCH_ADAPTER_VERSION
    assert provenance.provider == "documented-1688-image-search"
    assert provenance.request_id == REQUEST_ID
    assert provenance.fetched_at.endswith("Z")
    datetime.fromisoformat(provenance.fetched_at.removesuffix("Z") + "+00:00")
    assert provenance.raw_snapshot_sha256 == hashlib.sha256(
        first_response.text.encode("utf-8")
    ).hexdigest()
    assert second.provenance.raw_snapshot_sha256 == provenance.raw_snapshot_sha256
    rendered = json.dumps(asdict(provenance), ensure_ascii=False)
    assert SECRET not in rendered
    assert raw_marker not in rendered
    assert "canonicalPath" not in rendered


def test_raw_snapshot_hash_changes_when_raw_response_text_changes():
    first_response = FakeResponse(body=success_body([{"offerId": "123"}]))
    second_response = FakeResponse(body=success_body([{"offerId": "124"}]))

    first = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(first_response)
    ).search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
    )
    second = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(second_response)
    ).search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
    )

    assert first.provenance.raw_snapshot_sha256 != second.provenance.raw_snapshot_sha256


def test_oversized_stream_stops_at_decoded_byte_limit_and_closes_safely():
    class OversizedResponse:
        status_code = 200

        def __init__(self):
            self.yielded = 0
            self.closed = False

        @property
        def text(self):
            raise AssertionError("streaming client must not access response.text")

        def iter_content(self, chunk_size=1, decode_unicode=False):
            assert decode_unicode is False
            chunks = [
                b"a" * (5 * 1024 * 1024),
                b"secret-upstream-body" + b"b" * (4 * 1024 * 1024),
                b"must-not-be-read",
            ]
            for chunk in chunks:
                self.yielded += 1
                yield chunk

        def close(self):
            self.closed = True

    response = OversizedResponse()
    client = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(response)
    )

    with pytest.raises(SupplierImageSearchError) as captured:
        client.search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert captured.value.outcome is ImageSearchOutcome.MALFORMED_RESPONSE
    assert response.yielded == 2
    assert response.closed is True
    assert "secret-upstream-body" not in str(captured.value)


def test_stream_response_requires_strict_utf8_and_is_always_closed():
    response = FakeResponse(body=success_body([]))
    response._raw_bytes = b'{"code":10000,"msg":"\xff","success":true,"data":"{}"}'
    client = SupplierImageSearchClient(
        image_only_config(), session=FakeSession(response)
    )

    with pytest.raises(SupplierImageSearchError) as captured:
        client.search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert captured.value.outcome is ImageSearchOutcome.MALFORMED_RESPONSE
    assert response.closed is True


@pytest.mark.parametrize(
    ("field", "url"),
    [
        ("detailUrl", "https://detail.1688.com/offer/1?token=provider-secret"),
        ("image", "https://cbu01.alicdn.com/1.jpg?x-api-key=provider-secret"),
        (
            "image",
            "https://cbu01.alicdn.com/1.jpg?X-Amz-Signature=provider-secret",
        ),
    ],
)
def test_rejects_provider_urls_with_sensitive_query_credentials(field, url):
    response = FakeResponse(body=success_body([{"offerId": "123", field: url}]))

    with pytest.raises(SupplierImageSearchError) as captured:
        SupplierImageSearchClient(
            image_only_config(), session=FakeSession(response)
        ).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert captured.value.outcome is ImageSearchOutcome.MALFORMED_RESPONSE
    assert "provider-secret" not in str(captured.value)
    assert response.closed is True


def test_preserves_noncredential_provider_url_query_parameters():
    detail_url = "https://detail.1688.com/offer/123.html?page=2"
    image_url = (
        "https://cbu01.alicdn.com/123.jpg?"
        "x-oss-process=image/resize,w_500&quality=90"
    )
    result = SupplierImageSearchClient(
        image_only_config(),
        session=FakeSession(
            FakeResponse(
                body=success_body(
                    [
                        {
                            "offerId": "123",
                            "detailUrl": detail_url,
                            "image": image_url,
                        }
                    ]
                )
            )
        ),
    ).search(
        request_id=REQUEST_ID,
        img_url="https://cbu01.alicdn.com/source.jpg",
    )

    assert result.offers[0].detail_url == detail_url
    assert result.offers[0].image_url == image_url


def test_total_deadline_starts_before_post_and_closes_late_response():
    class FakeClock:
        def __init__(self):
            self.now = 100.0

        def __call__(self):
            return self.now

    clock = FakeClock()
    response = FakeResponse(body=success_body([]))

    class SlowPostSession(FakeSession):
        def post(self, url, **kwargs):
            clock.now += 10
            return super().post(url, **kwargs)

    with pytest.raises(SupplierImageSearchError) as captured:
        SupplierImageSearchClient(
            image_only_config(SUPPLIER_QUOTE_TIMEOUT_SECONDS="9"),
            session=SlowPostSession(response),
            monotonic=clock,
        ).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert captured.value.outcome is ImageSearchOutcome.PROVIDER_ERROR
    assert response.closed is True


def test_total_deadline_stops_slow_drip_and_cancels_guard():
    class FakeClock:
        def __init__(self):
            self.now = 10.0

        def __call__(self):
            return self.now

    class RecordingTimer:
        instances = []

        def __init__(self, seconds, callback):
            self.seconds = seconds
            self.callback = callback
            self.daemon = False
            self.started = False
            self.cancelled = False
            self.__class__.instances.append(self)

        def start(self):
            self.started = True

        def cancel(self):
            self.cancelled = True

    class SlowDripResponse(FakeResponse):
        def iter_content(self, chunk_size=1, decode_unicode=False):
            yield b"{"
            clock.now += 10
            yield b'"code":10000}'

    clock = FakeClock()
    response = SlowDripResponse(body=success_body([]))
    with pytest.raises(SupplierImageSearchError) as captured:
        SupplierImageSearchClient(
            image_only_config(SUPPLIER_QUOTE_TIMEOUT_SECONDS="9"),
            session=FakeSession(response),
            monotonic=clock,
            timer_factory=RecordingTimer,
        ).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert captured.value.outcome is ImageSearchOutcome.PROVIDER_ERROR
    assert response.closed is True
    assert len(RecordingTimer.instances) == 1
    assert RecordingTimer.instances[0].started is True
    assert RecordingTimer.instances[0].cancelled is True


def test_deadline_guard_can_close_a_blocked_response_and_never_succeed():
    class ImmediateTimer:
        def __init__(self, _seconds, callback):
            self.callback = callback
            self.daemon = False
            self.cancelled = False

        def start(self):
            self.callback()

        def cancel(self):
            self.cancelled = True

    class CloseAwareResponse(FakeResponse):
        def iter_content(self, chunk_size=1, decode_unicode=False):
            assert self.closed is True
            return iter(())

    response = CloseAwareResponse(body=success_body([]))
    with pytest.raises(SupplierImageSearchError) as captured:
        SupplierImageSearchClient(
            image_only_config(),
            session=FakeSession(response),
            timer_factory=ImmediateTimer,
        ).search(
            request_id=REQUEST_ID,
            img_url="https://cbu01.alicdn.com/source.jpg",
        )

    assert captured.value.outcome is ImageSearchOutcome.PROVIDER_ERROR
    assert response.closed is True
