from __future__ import annotations

import base64
import sys
from pathlib import Path


AGENT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = AGENT_ROOT / "scripts"
for root in (AGENT_ROOT, SCRIPTS_ROOT):
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

from common.utils import image_provider_rejects_response_format
import generate_batch


class _Response:
    def __init__(self, status_code: int, payload: dict, content: bytes = b""):
        self.status_code = status_code
        self._payload = payload
        self.content = content

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_detects_only_response_format_compatibility_error():
    rejected = _Response(400, {
        "error": {
            "code": "unknown_parameter",
            "param": "response_format",
        },
    })
    unrelated = _Response(400, {
        "error": {"code": "invalid_api_key", "param": None},
    })

    assert image_provider_rejects_response_format(rejected) is True
    assert image_provider_rejects_response_format(unrelated) is False
    assert image_provider_rejects_response_format(_Response(200, {})) is False


def test_generation_retries_without_response_format_and_downloads_url(monkeypatch, tmp_path):
    calls: list[dict] = []
    image_bytes = b"verified-image-bytes" * 8

    class _Requests:
        @staticmethod
        def post(url, **kwargs):
            calls.append(dict(kwargs["json"]))
            if len(calls) == 1:
                return _Response(400, {
                    "error": {
                        "code": "unknown_parameter",
                        "param": "response_format",
                    },
                })
            return _Response(200, {"data": [{"url": "https://images.example/item.png"}]})

        @staticmethod
        def get(url, **kwargs):
            return _Response(200, {}, image_bytes)

    monkeypatch.setitem(sys.modules, "requests", _Requests)
    monkeypatch.setattr(generate_batch, "get_openai_image_api_base", lambda: "https://gateway.example/v1")
    target = tmp_path / "generated.png"

    result = generate_batch._call_openai_image_api_once(
        "product prompt",
        [],
        str(target),
        "1:1",
        "secret-key",
        "gpt-image-2",
    )

    assert calls[0]["response_format"] == "b64_json"
    assert "response_format" not in calls[1]
    assert calls[1]["prompt"] == "product prompt"
    assert target.read_bytes() == image_bytes
    assert "gpt-image-2" in result


def test_generation_keeps_base64_support_for_standard_providers(monkeypatch, tmp_path):
    image_bytes = b"standard-provider-image" * 8

    class _Requests:
        @staticmethod
        def post(url, **kwargs):
            return _Response(200, {
                "data": [{"b64_json": base64.b64encode(image_bytes).decode("ascii")}],
            })

    monkeypatch.setitem(sys.modules, "requests", _Requests)
    monkeypatch.setattr(generate_batch, "get_openai_image_api_base", lambda: "https://standard.example/v1")
    target = tmp_path / "generated.png"

    generate_batch._call_openai_image_api_once(
        "product prompt",
        [],
        str(target),
        "1:1",
        "secret-key",
        "gpt-image-2",
    )

    assert target.read_bytes() == image_bytes
