"""Fail-closed configuration for supplier image search and exact quotes."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping
from urllib.parse import urlparse


class SupplierQuoteConfigError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class ImageSearchOutcome(str, Enum):
    MATCHES = "MATCHES"
    SOURCE_IMAGE_MISSING = "SOURCE_IMAGE_MISSING"
    UNSUPPORTED = "UNSUPPORTED"
    NO_RESULTS = "NO_RESULTS"
    AUTH_FAILED = "AUTH_FAILED"
    RATE_LIMITED = "RATE_LIMITED"
    MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
    PROVIDER_ERROR = "PROVIDER_ERROR"


def _enabled(value: object) -> bool:
    return str(value or "").strip().casefold() in {"1", "true", "yes", "on"}


def _required(env: Mapping[str, str], keys: tuple[str, ...]) -> dict[str, str]:
    values = {key: str(env.get(key) or "").strip() for key in keys}
    missing = [key for key, value in values.items() if not value]
    if missing:
        raise SupplierQuoteConfigError(
            "SUPPLIER_QUOTE_CONFIG_INCOMPLETE",
            "Missing required supplier quote settings: " + ", ".join(missing),
        )
    return values


def _bounded_integer(
    env: Mapping[str, str], key: str, default: int, minimum: int, maximum: int
) -> int:
    raw = str(env.get(key, default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise SupplierQuoteConfigError(
            "SUPPLIER_QUOTE_CONFIG_INVALID", f"{key} must be an integer"
        ) from exc
    if value < minimum or value > maximum:
        raise SupplierQuoteConfigError(
            "SUPPLIER_QUOTE_CONFIG_INVALID",
            f"{key} must be between {minimum} and {maximum}",
        )
    return value


def _relative_api_path(value: str, key: str) -> str:
    if not value.startswith("/") or value.startswith("//") or "?" in value or "#" in value:
        raise SupplierQuoteConfigError(
            "SUPPLIER_QUOTE_CONFIG_INVALID",
            f"{key} must be a relative API path beginning with /",
        )
    return value


@dataclass(frozen=True)
class SupplierQuoteConfig:
    enabled: bool
    provider: str | None = None
    api_base_url: str | None = None
    image_search_path: str | None = None
    exact_quote_path: str | None = None
    destination_country: str = "RU"
    quantity: int = 100
    timeout_seconds: int = 20
    max_age_seconds: int = 3600
    max_image_results: int = 10
    keyword_fallback: bool = False
    _secret: str = field(default="", repr=False)

    def credential(self) -> str:
        """Return the credential only to the future transport adapter."""
        return self._secret

    def public_status(self) -> dict:
        image_search_configured = bool(
            self.enabled
            and self.provider
            and self.api_base_url
            and self.image_search_path
            and self._secret
        )
        # A configured path is not a capability. No exact-quote task contract,
        # transport adapter, or provider capability probe exists yet, so this
        # must remain fail-closed even if a future-looking path is present.
        exact_quote_available = False
        configured = bool(image_search_configured and exact_quote_available)
        return {
            "enabled": self.enabled,
            "configured": configured,
            "provider": self.provider,
            "destinationCountry": self.destination_country,
            "imageSearch": image_search_configured,
            "imageSearchConfigured": image_search_configured,
            "exactQuote": exact_quote_available,
            "exactQuoteStatus": "UNAVAILABLE_NO_CONTRACT",
            "keywordFallback": image_search_configured and self.keyword_fallback,
        }


def load_supplier_quote_config(
    env: Mapping[str, str],
) -> SupplierQuoteConfig:
    if not _enabled(env.get("SUPPLIER_QUOTE_ENABLED")):
        return SupplierQuoteConfig(enabled=False)

    required = _required(
        env,
        (
            "SUPPLIER_QUOTE_PROVIDER",
            "SUPPLIER_QUOTE_API_BASE_URL",
            "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH",
            "SUPPLIER_QUOTE_API_KEY",
        ),
    )
    base_url = required["SUPPLIER_QUOTE_API_BASE_URL"].rstrip("/")
    parsed = urlparse(base_url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise SupplierQuoteConfigError(
            "SUPPLIER_QUOTE_HTTPS_REQUIRED",
            "SUPPLIER_QUOTE_API_BASE_URL must be an HTTPS URL without embedded "
            "credentials, query, or fragment",
        )

    destination = str(
        env.get("SUPPLIER_QUOTE_DESTINATION_COUNTRY", "RU")
    ).strip().upper()
    exact_quote_path_raw = str(
        env.get("SUPPLIER_QUOTE_EXACT_QUOTE_PATH") or ""
    ).strip()
    if exact_quote_path_raw and destination != "RU":
        raise SupplierQuoteConfigError(
            "SUPPLIER_QUOTE_RU_DESTINATION_REQUIRED",
            "Supplier landed-cost quotes must target RU",
        )

    return SupplierQuoteConfig(
        enabled=True,
        provider=required["SUPPLIER_QUOTE_PROVIDER"],
        api_base_url=base_url,
        image_search_path=_relative_api_path(
            required["SUPPLIER_QUOTE_IMAGE_SEARCH_PATH"],
            "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH",
        ),
        exact_quote_path=(
            _relative_api_path(
                exact_quote_path_raw,
                "SUPPLIER_QUOTE_EXACT_QUOTE_PATH",
            )
            if exact_quote_path_raw
            else None
        ),
        destination_country=destination,
        quantity=_bounded_integer(
            env, "SUPPLIER_QUOTE_QUANTITY", 100, 1, 100_000
        ),
        timeout_seconds=_bounded_integer(
            env, "SUPPLIER_QUOTE_TIMEOUT_SECONDS", 20, 1, 60
        ),
        max_age_seconds=_bounded_integer(
            env, "SUPPLIER_QUOTE_MAX_AGE_SECONDS", 3600, 60, 86_400
        ),
        max_image_results=_bounded_integer(
            env, "SUPPLIER_QUOTE_MAX_IMAGE_RESULTS", 10, 1, 50
        ),
        keyword_fallback=_enabled(env.get("SUPPLIER_QUOTE_KEYWORD_FALLBACK")),
        _secret=required["SUPPLIER_QUOTE_API_KEY"],
    )


def should_use_keyword_fallback(
    config: SupplierQuoteConfig, outcome: ImageSearchOutcome
) -> bool:
    """Keyword fallback is recall-only and must not mask provider failures."""
    return bool(
        config.enabled
        and config.keyword_fallback
        and outcome
        in {
            ImageSearchOutcome.SOURCE_IMAGE_MISSING,
            ImageSearchOutcome.UNSUPPORTED,
            ImageSearchOutcome.NO_RESULTS,
        }
    )
