"""Strict outbound adapter for the documented 1688 image-search API.

Provider prices are deliberately exposed only as display evidence. This API
does not return a quantity-bound supplier quote and therefore cannot establish
an exact procurement cost.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping
from urllib.parse import parse_qsl, urlparse

import requests

from web.services.supplier_image_evidence import (
    PROVIDER_MAX_DECODED_BYTES,
    prepare_supplier_image_search_payload,
)
from web.services.supplier_quote_config import (
    ImageSearchOutcome,
    SupplierQuoteConfig,
)


MAX_DECODED_IMAGE_BYTES = PROVIDER_MAX_DECODED_BYTES
MAX_BASE64_CHARACTERS = 4 * ((MAX_DECODED_IMAGE_BYTES + 2) // 3)
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_INNER_DATA_BYTES = 6 * 1024 * 1024
MAX_PROVIDER_RESULTS = 500
SUPPLIER_IMAGE_SEARCH_ADAPTER_VERSION = "supplier-image-search-adapter/v1"
_DATA_URI = re.compile(
    r"^data:image/[a-z0-9.+-]+;base64,(?P<payload>.*)$",
    re.IGNORECASE,
)
_SENSITIVE_QUERY_KEY_SUFFIXES = (
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


_SAFE_ERROR_MESSAGES = {
    ImageSearchOutcome.SOURCE_IMAGE_MISSING: "supplier source image is required",
    ImageSearchOutcome.UNSUPPORTED: "supplier source image is unsupported",
    ImageSearchOutcome.AUTH_FAILED: "supplier image search authentication failed",
    ImageSearchOutcome.RATE_LIMITED: "supplier image search was rate limited",
    ImageSearchOutcome.MALFORMED_RESPONSE: (
        "supplier image search returned a malformed response"
    ),
    ImageSearchOutcome.PROVIDER_ERROR: "supplier image search provider failed",
}


class SupplierImageSearchError(RuntimeError):
    """A classified, deliberately sanitized image-search failure."""

    def __init__(self, outcome: ImageSearchOutcome):
        if outcome not in _SAFE_ERROR_MESSAGES:
            outcome = ImageSearchOutcome.PROVIDER_ERROR
        self.outcome = outcome
        super().__init__(_SAFE_ERROR_MESSAGES[outcome])


@dataclass(frozen=True)
class SupplierImageOffer:
    offer_id: str
    subject: str | None = None
    detail_url: str | None = None
    image_url: str | None = None
    distribution_free_postage: bool | None = None
    _price: str | None = field(default=None, repr=False)
    _consign_price: str | None = field(default=None, repr=False)
    _multiple_consign_price: str | None = field(default=None, repr=False)

    @property
    def display_price_evidence(self) -> dict[str, str | bool | None]:
        """Return non-transactional price labels with an explicit safety marker."""

        return {
            "price": self._price,
            "consignPrice": self._consign_price,
            "multipleConsignPrice": self._multiple_consign_price,
            "evidenceUse": "DISPLAY_ONLY",
            "verifiedProcurementCost": False,
        }


@dataclass(frozen=True)
class SupplierImageSearchResult:
    outcome: ImageSearchOutcome
    offers: tuple[SupplierImageOffer, ...]
    provider_result_count: int
    provenance: SupplierImageSearchProvenance


@dataclass(frozen=True)
class SupplierImageSearchProvenance:
    adapter_version: str
    provider: str
    request_id: str
    fetched_at: str
    raw_snapshot_sha256: str


@dataclass(frozen=True)
class SupplierImageFileSearchResult:
    result: SupplierImageSearchResult
    image_evidence: Mapping[str, object] = field(repr=False)


def _fail(outcome: ImageSearchOutcome) -> None:
    raise SupplierImageSearchError(outcome)


def _reject_json_constant(_value: str) -> None:
    _fail(ImageSearchOutcome.MALFORMED_RESPONSE)


def _strict_json(text: str, maximum: int) -> Any:
    if not isinstance(text, str) or not text:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    encoded = text.encode("utf-8")
    if len(encoded) > maximum:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    try:
        return json.loads(
            text,
            parse_float=Decimal,
            parse_int=int,
            parse_constant=_reject_json_constant,
        )
    except SupplierImageSearchError:
        raise
    except (json.JSONDecodeError, TypeError, ValueError):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)


def _validated_https_url(value: Any) -> str:
    if not isinstance(value, str):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    candidate = value.strip()
    if not candidate or len(candidate) > 4096:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    try:
        parsed = urlparse(candidate)
        port = parsed.port
    except ValueError:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port is not None
        and not (1 <= port <= 65535)
    ):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    try:
        query_pairs = parse_qsl(
            parsed.query.replace(";", "&"),
            keep_blank_values=True,
            max_num_fields=100,
        )
    except ValueError:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    for query_key, _query_value in query_pairs:
        normalized_key = re.sub(r"[^a-z0-9]", "", query_key.casefold())
        if normalized_key and normalized_key.endswith(
            _SENSITIVE_QUERY_KEY_SUFFIXES
        ):
            _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    return candidate


def _validated_request_url(value: Any) -> str:
    try:
        return _validated_https_url(value)
    except SupplierImageSearchError:
        _fail(ImageSearchOutcome.UNSUPPORTED)


def _validated_request_id(value: Any) -> str:
    if not isinstance(value, str):
        _fail(ImageSearchOutcome.UNSUPPORTED)
    request_id = value.strip()
    if (
        not request_id
        or len(request_id) > 256
        or any(ord(character) < 32 for character in request_id)
    ):
        _fail(ImageSearchOutcome.UNSUPPORTED)
    return request_id


def _validated_base64(value: Any) -> str:
    if not isinstance(value, str):
        _fail(ImageSearchOutcome.UNSUPPORTED)
    candidate = value.strip()
    if not candidate:
        _fail(ImageSearchOutcome.SOURCE_IMAGE_MISSING)
    match = _DATA_URI.fullmatch(candidate)
    encoded = match.group("payload") if match else candidate
    if not encoded or len(encoded) > MAX_BASE64_CHARACTERS:
        _fail(ImageSearchOutcome.UNSUPPORTED)
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        _fail(ImageSearchOutcome.UNSUPPORTED)
    if not decoded or len(decoded) > MAX_DECODED_IMAGE_BYTES:
        _fail(ImageSearchOutcome.UNSUPPORTED)
    return candidate


def _optional_text(container: dict[str, Any], key: str, maximum: int) -> str | None:
    if key not in container:
        return None
    value = container[key]
    if not isinstance(value, str):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    stripped = value.strip()
    if not stripped or len(stripped) > maximum:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    return stripped


def _display_price(container: dict[str, Any], key: str) -> str | None:
    if key not in container:
        return None
    value = container[key]
    if isinstance(value, bool) or value is None:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if isinstance(value, str):
        rendered = value.strip()
        if not rendered or len(rendered) > 128:
            _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
        return rendered
    if isinstance(value, int):
        if value < 0:
            _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
        return str(value)
    if isinstance(value, Decimal):
        if not value.is_finite() or value < 0:
            _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
        return str(value)
    _fail(ImageSearchOutcome.MALFORMED_RESPONSE)


def _offer_id(value: Any) -> str:
    if isinstance(value, bool):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if isinstance(value, int):
        rendered = str(value)
    elif isinstance(value, str):
        rendered = value.strip()
    else:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if (
        not rendered
        or len(rendered) > 32
        or not rendered.isascii()
        or not rendered.isdecimal()
        or int(rendered) <= 0
    ):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    return rendered


def _parse_offer(raw: Any) -> SupplierImageOffer:
    if not isinstance(raw, dict) or "offerId" not in raw:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    subject = _optional_text(raw, "subject", 1000)
    title = _optional_text(raw, "title", 1000)
    detail_url = (
        _validated_https_url(raw["detailUrl"]) if "detailUrl" in raw else None
    )
    image_url = _validated_https_url(raw["image"]) if "image" in raw else None
    postage = raw.get("distributionFreePostage")
    if "distributionFreePostage" in raw and type(postage) is not bool:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    return SupplierImageOffer(
        offer_id=_offer_id(raw["offerId"]),
        subject=subject or title,
        detail_url=detail_url,
        image_url=image_url,
        distribution_free_postage=postage,
        _price=_display_price(raw, "price"),
        _consign_price=_display_price(raw, "consignPrice"),
        _multiple_consign_price=_display_price(raw, "multipleConsignPrice"),
    )


class _ResponseDeadlineGuard:
    def __init__(self, response: Any, seconds: float, timer_factory: Any):
        self._response = response
        self._lock = threading.Lock()
        self._active = True
        self._expired = False
        self._timer = timer_factory(max(0.0, seconds), self._expire)
        self._timer.daemon = True
        self._timer.start()

    @property
    def expired(self) -> bool:
        with self._lock:
            return self._expired

    def _expire(self) -> None:
        with self._lock:
            if not self._active:
                return
            self._active = False
            self._expired = True
        try:
            self._response.close()
        except Exception:  # noqa: BLE001 - deadline closure is best effort
            pass

    def cancel(self) -> bool:
        with self._lock:
            self._active = False
            expired = self._expired
        try:
            self._timer.cancel()
        except Exception:  # noqa: BLE001 - cancellation cannot expose internals
            pass
        return expired


def _check_deadline(
    deadline: float,
    monotonic: Any,
    guard: _ResponseDeadlineGuard,
) -> None:
    if guard.expired or monotonic() >= deadline:
        _fail(ImageSearchOutcome.PROVIDER_ERROR)


def _read_bounded_response(
    response: Any,
    *,
    deadline: float,
    monotonic: Any,
    guard: _ResponseDeadlineGuard,
) -> tuple[str, str]:
    content = bytearray()
    digest = hashlib.sha256()
    try:
        _check_deadline(deadline, monotonic, guard)
        chunks = response.iter_content(
            chunk_size=64 * 1024,
            decode_unicode=False,
        )
        for chunk in chunks:
            _check_deadline(deadline, monotonic, guard)
            if not chunk:
                continue
            if not isinstance(chunk, (bytes, bytearray)):
                _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
            if len(content) + len(chunk) > MAX_RESPONSE_BYTES:
                _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
            digest.update(chunk)
            content.extend(chunk)
            _check_deadline(deadline, monotonic, guard)
    except SupplierImageSearchError:
        raise
    except requests.RequestException:
        _fail(ImageSearchOutcome.PROVIDER_ERROR)
    except Exception:
        _fail(ImageSearchOutcome.PROVIDER_ERROR)
    try:
        text = bytes(content).decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    _check_deadline(deadline, monotonic, guard)
    return text, digest.hexdigest()


def _parse_response(
    response: Any,
    config: SupplierQuoteConfig,
    bound_request_id: str,
    *,
    deadline: float,
    monotonic: Any,
    guard: _ResponseDeadlineGuard,
) -> SupplierImageSearchResult:
    _check_deadline(deadline, monotonic, guard)
    status_code = getattr(response, "status_code", None)
    if status_code in {401, 403}:
        _fail(ImageSearchOutcome.AUTH_FAILED)
    if status_code == 429:
        _fail(ImageSearchOutcome.RATE_LIMITED)
    if type(status_code) is not int or not 200 <= status_code < 300:
        _fail(ImageSearchOutcome.PROVIDER_ERROR)

    response_text, raw_snapshot_sha256 = _read_bounded_response(
        response,
        deadline=deadline,
        monotonic=monotonic,
        guard=guard,
    )
    outer = _strict_json(response_text, MAX_RESPONSE_BYTES)
    if not isinstance(outer, dict):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if not {"code", "msg", "success", "data"}.issubset(outer):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    code = outer["code"]
    message = outer["msg"]
    success = outer["success"]
    data = outer["data"]
    if type(code) is not int or type(success) is not bool:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if not isinstance(message, str) or len(message) > 1000:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if success is False:
        if code == 10000:
            _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
        if message.strip().startswith("未授权"):
            _fail(ImageSearchOutcome.AUTH_FAILED)
        _fail(ImageSearchOutcome.PROVIDER_ERROR)
    if code != 10000 or not isinstance(data, str):
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)

    inner = _strict_json(data, MAX_INNER_DATA_BYTES)
    if not isinstance(inner, dict) or "success" not in inner:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    inner_success = inner["success"]
    if type(inner_success) is not bool:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    if inner_success is False:
        _fail(ImageSearchOutcome.PROVIDER_ERROR)
    raw_results = inner.get("imageSearchResult")
    if not isinstance(raw_results, list) or len(raw_results) > MAX_PROVIDER_RESULTS:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)

    parsed_offers: list[SupplierImageOffer] = []
    for raw in raw_results:
        try:
            offer = _parse_offer(raw)
        except SupplierImageSearchError as error:
            if error.outcome is not ImageSearchOutcome.MALFORMED_RESPONSE:
                raise
            continue
        parsed_offers.append(offer)
        if len(parsed_offers) >= config.max_image_results:
            break
    if raw_results and not parsed_offers:
        _fail(ImageSearchOutcome.MALFORMED_RESPONSE)
    offers = tuple(parsed_offers)
    outcome = ImageSearchOutcome.MATCHES if offers else ImageSearchOutcome.NO_RESULTS
    _check_deadline(deadline, monotonic, guard)
    return SupplierImageSearchResult(
        outcome=outcome,
        offers=offers,
        provider_result_count=len(raw_results),
        provenance=SupplierImageSearchProvenance(
            adapter_version=SUPPLIER_IMAGE_SEARCH_ADAPTER_VERSION,
            provider=str(config.provider),
            request_id=bound_request_id,
            fetched_at=datetime.now(timezone.utc)
            .isoformat(timespec="microseconds")
            .replace("+00:00", "Z"),
            raw_snapshot_sha256=raw_snapshot_sha256,
        ),
    )


class SupplierImageSearchClient:
    """POST-only client for `/api/imageSearch1688/search`."""

    def __init__(
        self,
        config: SupplierQuoteConfig,
        session: Any | None = None,
        *,
        monotonic: Any | None = None,
        timer_factory: Any | None = None,
    ):
        self._config = config
        self._session = session or requests.Session()
        self._monotonic = monotonic or time.monotonic
        self._timer_factory = timer_factory or threading.Timer
        status = config.public_status()
        if not status.get("imageSearchConfigured"):
            _fail(ImageSearchOutcome.PROVIDER_ERROR)

    def __repr__(self) -> str:
        return (
            "SupplierImageSearchClient("
            f"provider={self._config.provider!r}, configured=True)"
        )

    def search(
        self,
        *,
        request_id: str,
        img_url: str | None = None,
        img_base64: str | None = None,
        image_keywords: str | None = None,
    ) -> SupplierImageSearchResult:
        bound_request_id = _validated_request_id(request_id)
        url_value = img_url.strip() if isinstance(img_url, str) else img_url
        base64_value = (
            img_base64.strip() if isinstance(img_base64, str) else img_base64
        )
        payload: dict[str, str] = {}
        if url_value:
            payload["imgUrl"] = _validated_request_url(url_value)
        elif base64_value:
            payload["imgBase64"] = _validated_base64(base64_value)
        else:
            _fail(ImageSearchOutcome.SOURCE_IMAGE_MISSING)

        if image_keywords is not None:
            if not isinstance(image_keywords, str):
                _fail(ImageSearchOutcome.UNSUPPORTED)
            keyword = image_keywords.strip()
            if len(keyword) > 200:
                _fail(ImageSearchOutcome.UNSUPPORTED)
            if keyword:
                payload["imageKeywords"] = keyword

        endpoint = f"{self._config.api_base_url}{self._config.image_search_path}"
        deadline = self._monotonic() + self._config.timeout_seconds
        try:
            response = self._session.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "token": self._config.credential(),
                },
                json=payload,
                timeout=self._config.timeout_seconds,
                allow_redirects=False,
                stream=True,
            )
        except requests.RequestException:
            raise SupplierImageSearchError(
                ImageSearchOutcome.PROVIDER_ERROR
            ) from None
        except Exception:
            raise SupplierImageSearchError(
                ImageSearchOutcome.PROVIDER_ERROR
            ) from None

        guard = None
        result = None
        expired = False
        try:
            remaining = deadline - self._monotonic()
            if remaining <= 0:
                _fail(ImageSearchOutcome.PROVIDER_ERROR)
            guard = _ResponseDeadlineGuard(
                response,
                remaining,
                self._timer_factory,
            )
            result = _parse_response(
                response,
                self._config,
                bound_request_id,
                deadline=deadline,
                monotonic=self._monotonic,
                guard=guard,
            )
        except SupplierImageSearchError:
            raise
        except Exception:
            raise SupplierImageSearchError(
                ImageSearchOutcome.PROVIDER_ERROR
            ) from None
        finally:
            if guard is not None:
                expired = guard.cancel()
            try:
                response.close()
            except Exception:  # noqa: BLE001 - close cannot alter task outcome
                pass
        if expired or self._monotonic() >= deadline:
            _fail(ImageSearchOutcome.PROVIDER_ERROR)
        if result is None:
            _fail(ImageSearchOutcome.PROVIDER_ERROR)
        return result

    def search_file(
        self,
        source_path: str | Path,
        output_dir: str | Path,
        *,
        request_id: str,
        image_keywords: str | None = None,
    ) -> SupplierImageFileSearchResult:
        """Canonicalize a local source and search with the bounded v2 payload."""

        try:
            prepared = prepare_supplier_image_search_payload(source_path, output_dir)
            canonical = Path(str(prepared["canonicalPath"])).read_bytes()
        except (OSError, ValueError, KeyError):
            raise SupplierImageSearchError(ImageSearchOutcome.UNSUPPORTED) from None
        if (
            not canonical
            or len(canonical) > PROVIDER_MAX_DECODED_BYTES
            or len(canonical) != prepared.get("decodedSizeBytes")
            or hashlib.sha256(canonical).hexdigest()
            != prepared.get("sourceCanonicalSha256")
        ):
            _fail(ImageSearchOutcome.UNSUPPORTED)
        encoded = base64.b64encode(canonical).decode("ascii")
        result = self.search(
            request_id=request_id,
            img_base64=f"data:image/png;base64,{encoded}",
            image_keywords=image_keywords,
        )
        return SupplierImageFileSearchResult(
            result=result,
            image_evidence=MappingProxyType(dict(prepared)),
        )
