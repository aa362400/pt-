# -*- coding: utf-8 -*-
"""平台对接 API（/api/v1/agent/*）回归测试。

覆盖：鉴权（未启用/无 Key/错 Key/对 Key）、任务创建校验、
mock 模式下 generate_images 全流程（提交 → 轮询 → 拿到图片 URL）。
"""

import base64
import hashlib
import io
import json
import os
import sys
import time
import uuid

import pytest

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

TEST_KEY = "test-platform-key-123"


def _make_png_b64() -> str:
    """生成一张小的真实 PNG（>512 字节，随机噪声防压缩），作为产品图输入。"""
    from PIL import Image

    img = Image.frombytes("RGB", (64, 64), os.urandom(64 * 64 * 3))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    raw = buf.getvalue()
    assert len(raw) > 512
    return base64.b64encode(raw).decode("ascii")


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AGENT_API_KEY", TEST_KEY)
    monkeypatch.setenv("COMMERCE_AGENT_MOCK", "1")
    from web.app import app

    with app.test_client() as c:
        yield c


def _headers(key: str = TEST_KEY) -> dict:
    return {"X-Api-Key": key}


def _poll_run(client, run_id: str, timeout: float = 10) -> dict:
    deadline = time.time() + timeout
    final = None
    while time.time() < deadline:
        response = client.get(f"/api/v1/agent/runs/{run_id}", headers=_headers())
        assert response.status_code == 200
        final = response.get_json()
        if final["status"] in ("completed", "failed"):
            return final
        time.sleep(0.05)
    raise AssertionError(f"agent run did not finish: {final}")


def _supplier_image_config(secret: str = "supplier-route-test-secret"):
    from web.services.supplier_quote_config import load_supplier_quote_config

    return load_supplier_quote_config(
        {
            "SUPPLIER_QUOTE_ENABLED": "1",
            "SUPPLIER_QUOTE_PROVIDER": "documented-1688-image-search",
            "SUPPLIER_QUOTE_API_BASE_URL": "https://supplier.example.com",
            "SUPPLIER_QUOTE_IMAGE_SEARCH_PATH": "/api/imageSearch1688/search",
            "SUPPLIER_QUOTE_API_KEY": secret,
        }
    )


def _supplier_execution(request_id: str = "supplier-route-request"):
    from web.services.supplier_image_search_client import (
        SupplierImageFileSearchResult,
        SupplierImageOffer,
        SupplierImageSearchProvenance,
        SupplierImageSearchResult,
    )
    from web.services.supplier_quote_config import ImageSearchOutcome

    return SupplierImageFileSearchResult(
        result=SupplierImageSearchResult(
            outcome=ImageSearchOutcome.MATCHES,
            offers=(
                SupplierImageOffer(
                    offer_id="7234567890123456789",
                    subject="1688 sample offer",
                    detail_url="https://detail.1688.com/offer/723.html",
                    image_url="https://cbu01.alicdn.com/723.jpg",
                    distribution_free_postage=True,
                    _price="10.50",
                    _consign_price="10.50",
                    _multiple_consign_price="9.80",
                ),
            ),
            provider_result_count=1,
            provenance=SupplierImageSearchProvenance(
                adapter_version="supplier-image-search-adapter/v1",
                provider="documented-1688-image-search",
                request_id=request_id,
                fetched_at="2026-07-16T03:19:14.123456Z",
                raw_snapshot_sha256="c" * 64,
            ),
        ),
        image_evidence={
            "canonicalizationVersion": "supplier-image-search-payload/v2",
            "sourceOriginalSha256": "a" * 64,
            "sourceCanonicalSha256": "b" * 64,
            "canonicalPath": "must-never-leave-the-agent.json",
            "decodedSizeBytes": 1234,
            "payloadMimeType": "image/png",
            "width": 800,
            "height": 600,
            "retrievalHashAlgorithm": "DHASH64",
            "retrievalHash": "0123456789abcdef",
            "retrievalOnly": True,
        },
    )


def test_explicit_input_profile_is_source_labelled_and_persisted(tmp_path):
    from web.engine import DualAgentEngine
    from web.routes.integration import _ensure_explicit_input_profile

    output_dir = tmp_path / "outputs"
    sessions_dir = tmp_path / "sessions"
    engine = DualAgentEngine("explicit-profile", str(output_dir), str(sessions_dir))
    reference = output_dir / "explicit-profile" / "originals" / "product.jpg"
    reference.parent.mkdir(parents=True, exist_ok=True)
    reference.write_bytes(b"reference-image")

    created = _ensure_explicit_input_profile(
        engine,
        {"productName": "Ozon wooden pen"},
        str(reference),
    )

    assert created is True
    profile_path = engine.context["profile_path"]
    with open(profile_path, encoding="utf-8") as profile_file:
        profile = json.load(profile_file)
    assert profile["product_name"] == "Ozon wooden pen"
    assert profile["evidence"] == {
        "source": "explicit_input",
        "analysisStatus": "degraded",
        "reasonCode": "VISUAL_ANALYSIS_PROVIDER_UNAVAILABLE",
    }
    assert engine.context["profile"] == profile


def test_explicit_input_profile_refuses_to_invent_missing_product_name(tmp_path):
    from web.engine import DualAgentEngine
    from web.routes.integration import _ensure_explicit_input_profile

    engine = DualAgentEngine(
        "missing-name",
        str(tmp_path / "outputs"),
        str(tmp_path / "sessions"),
    )

    assert _ensure_explicit_input_profile(engine, {}, "product.jpg") is False
    assert engine.context["profile"] is None


def test_generation_requires_executor_success_and_supervisor_approval():
    from web.routes.integration import _generation_report_accepted

    assert _generation_report_accepted(
        {"status": "success"}, {"approved": True}
    ) is True
    assert _generation_report_accepted(
        {"status": "success"}, {"approved": False}
    ) is False
    assert _generation_report_accepted(
        {"status": "error"}, {"approved": True}
    ) is False


# ── 鉴权 ──

def test_integration_disabled_without_key_env(monkeypatch):
    monkeypatch.setenv("AGENT_API_KEY", "")
    from web.app import app

    with app.test_client() as c:
        resp = c.get("/api/v1/agent/health")
        assert resp.status_code == 503


def test_health_requires_valid_key(client):
    assert client.get("/api/v1/agent/health").status_code == 401
    assert client.get(
        "/api/v1/agent/health", headers=_headers("wrong-key")).status_code == 401

    resp = client.get("/api/v1/agent/health", headers=_headers())
    assert resp.status_code == 200
    assert resp.get_json()["integration"] == "enabled"


def test_health_accepts_bearer_auth(client):
    resp = client.get(
        "/api/v1/agent/health",
        headers={"Authorization": f"Bearer {TEST_KEY}"},
    )
    assert resp.status_code == 200


# ── 任务创建校验 ──

def test_create_run_rejects_unknown_task_type(client):
    resp = client.post(
        "/api/v1/agent/runs", headers=_headers(),
        json={"taskType": "nope", "input": {"imageBase64": "x"}},
    )
    assert resp.status_code == 400
    assert "supported" in resp.get_json()


def test_create_run_requires_image(client):
    resp = client.post(
        "/api/v1/agent/runs", headers=_headers(),
        json={"taskType": "generate_images", "input": {"productName": "杯子"}},
    )
    assert resp.status_code == 400


def test_supplier_image_search_requires_existing_agent_auth_and_image(client):
    unauthenticated = client.post(
        "/api/v1/agent/runs",
        json={
            "taskType": "supplier_image_search",
            "input": {"imageBase64": _make_png_b64()},
        },
    )
    missing_image = client.post(
        "/api/v1/agent/runs",
        headers=_headers(),
        json={"taskType": "supplier_image_search", "input": {}},
    )

    assert unauthenticated.status_code == 401
    assert missing_image.status_code == 400


def test_supplier_image_search_async_success_has_safe_evidence_only(
    client, monkeypatch
):
    from web.app import app
    from web.services.supplier_image_search_client import SupplierImageSearchClient

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )
    captured = {}

    def fake_search_file(
        self,
        source_path,
        output_dir,
        *,
        request_id,
        image_keywords=None,
    ):
        captured.update(
            source_path=str(source_path),
            output_dir=str(output_dir),
            request_id=request_id,
            image_keywords=image_keywords,
        )
        assert os.path.isfile(source_path)
        return _supplier_execution(request_id)

    monkeypatch.setattr(SupplierImageSearchClient, "search_file", fake_search_file)
    request_id = f"supplier-success-{uuid.uuid4().hex}"
    response = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": request_id},
        json={
            "taskType": "supplier_image_search",
            "input": {
                "imageBase64": _make_png_b64(),
                "imageKeywords": "桌面收纳",
            },
            "context": {
                "orgId": "org-supplier-test",
                "workspaceId": "workspace-supplier-test",
            },
        },
    )

    assert response.status_code == 202
    final = _poll_run(client, response.get_json()["runId"])

    assert final["status"] == "completed"
    assert final["context"]["orgId"] == "org-supplier-test"
    assert final["context"]["workspaceId"] == "workspace-supplier-test"
    assert captured["request_id"] == request_id
    assert captured["image_keywords"] == "桌面收纳"
    assert final["result"] == {
        "outcome": "MATCHES",
        "providerResultCount": 1,
        "offers": [
            {
                "offerId": "7234567890123456789",
                "subject": "1688 sample offer",
                "detailUrl": "https://detail.1688.com/offer/723.html",
                "imageUrl": "https://cbu01.alicdn.com/723.jpg",
                "distributionFreePostage": True,
                "displayPriceEvidence": {
                    "price": "10.50",
                    "consignPrice": "10.50",
                    "multipleConsignPrice": "9.80",
                    "evidenceUse": "DISPLAY_ONLY",
                    "verifiedProcurementCost": False,
                },
            }
        ],
        "imageEvidence": {
            "canonicalizationVersion": "supplier-image-search-payload/v2",
            "sourceOriginalSha256": "a" * 64,
            "sourceCanonicalSha256": "b" * 64,
            "decodedSizeBytes": 1234,
            "payloadMimeType": "image/png",
            "width": 800,
            "height": 600,
            "retrievalHashAlgorithm": "DHASH64",
            "retrievalHash": "0123456789abcdef",
            "retrievalOnly": True,
        },
        "provenance": {
            "adapterVersion": "supplier-image-search-adapter/v1",
            "provider": "documented-1688-image-search",
            "requestId": request_id,
            "fetchedAt": "2026-07-16T03:19:14.123456Z",
            "rawSnapshotSha256": "c" * 64,
        },
    }
    rendered = json.dumps(final["result"], ensure_ascii=False)
    assert "canonicalPath" not in rendered
    assert '"procurementCost"' not in rendered
    assert '"currency"' not in rendered
    assert "supplier-route-test-secret" not in rendered


def test_supplier_image_search_uses_safe_public_url_fetch_and_url_wins(
    client, monkeypatch
):
    from PIL import Image

    from common import fetch_url
    from web.app import app
    from web.services.supplier_image_search_client import SupplierImageSearchClient

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )
    fetched = []

    def fake_fetch_product_image(url, dest_dir, **kwargs):
        fetched.append(url)
        assert kwargs == {"require_https": True}
        os.makedirs(dest_dir, exist_ok=True)
        local_path = os.path.join(dest_dir, "public-source.png")
        Image.new("RGB", (80, 80), (20, 40, 60)).save(local_path)
        return {"success": True, "local_path": local_path}

    monkeypatch.setattr(fetch_url, "fetch_product_image", fake_fetch_product_image)
    monkeypatch.setattr(
        SupplierImageSearchClient,
        "search_file",
        lambda *_args, **_kwargs: _supplier_execution(),
    )
    source_url = "https://public-images.example.com/product.png"
    response = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": f"supplier-url-{uuid.uuid4().hex}"},
        json={
            "taskType": "supplier_image_search",
            "input": {
                "imageUrl": source_url,
                "imageBase64": "invalid-base64-must-not-win",
            },
        },
    )

    final = _poll_run(client, response.get_json()["runId"])
    assert final["status"] == "completed"
    assert fetched == [source_url]


def test_supplier_image_search_rejects_http_url_before_fetch(client, monkeypatch):
    from common import fetch_url
    from web.app import app

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )
    fetched = []

    def forbidden_fetch(url, dest_dir, **kwargs):
        fetched.append((url, dest_dir, kwargs))
        return {"success": False, "error": "must not be called"}

    monkeypatch.setattr(fetch_url, "fetch_product_image", forbidden_fetch)
    response = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": f"supplier-http-{uuid.uuid4().hex}"},
        json={
            "taskType": "supplier_image_search",
            "input": {"imageUrl": "http://public.example.com/product.png"},
        },
    )
    if response.status_code == 202:
        _poll_run(client, response.get_json()["runId"])

    assert response.status_code == 400
    assert fetched == []


def test_supplier_image_search_unconfigured_is_a_failed_run(client, monkeypatch):
    from web.app import app
    from web.services.supplier_quote_config import load_supplier_quote_config

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        load_supplier_quote_config({}),
    )
    response = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": f"supplier-off-{uuid.uuid4().hex}"},
        json={
            "taskType": "supplier_image_search",
            "input": {"imageBase64": _make_png_b64()},
        },
    )

    assert response.status_code == 202
    final = _poll_run(client, response.get_json()["runId"])
    assert final["status"] == "failed"
    assert final["result"] is None
    assert final["diagnostics"] == {
        "code": "SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED",
        "outcome": "PROVIDER_ERROR",
    }


@pytest.mark.parametrize(
    ("failure_outcome", "expected"),
    [
        ("AUTH_FAILED", "AUTH_FAILED"),
        ("RATE_LIMITED", "RATE_LIMITED"),
        ("MALFORMED_RESPONSE", "MALFORMED_RESPONSE"),
        ("PROVIDER_ERROR", "PROVIDER_ERROR"),
    ],
)
def test_supplier_image_search_preserves_safe_error_classification(
    client, monkeypatch, failure_outcome, expected
):
    from web.app import app
    from web.services.supplier_image_search_client import (
        SupplierImageSearchClient,
        SupplierImageSearchError,
    )
    from web.services.supplier_quote_config import ImageSearchOutcome

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )

    def fail_search(*_args, **_kwargs):
        raise SupplierImageSearchError(ImageSearchOutcome(failure_outcome))

    monkeypatch.setattr(SupplierImageSearchClient, "search_file", fail_search)
    response = client.post(
        "/api/v1/agent/runs",
        headers={
            **_headers(),
            "X-Request-Id": f"supplier-error-{expected}-{uuid.uuid4().hex}",
        },
        json={
            "taskType": "supplier_image_search",
            "input": {"imageBase64": _make_png_b64()},
        },
    )

    final = _poll_run(client, response.get_json()["runId"])
    assert final["status"] == "failed"
    assert final["diagnostics"] == {
        "code": "SUPPLIER_IMAGE_SEARCH_FAILED",
        "outcome": expected,
    }


def test_supplier_image_search_never_persists_secret_or_untrusted_error_body(
    client, monkeypatch
):
    from web.app import app
    from web.services.supplier_image_search_client import SupplierImageSearchClient

    secret = "supplier-secret-never-persist"
    untrusted_body = "raw-upstream-body-never-persist"
    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(secret),
    )

    def fail_with_untrusted_detail(*_args, **_kwargs):
        raise RuntimeError(f"{secret}: {untrusted_body}")

    monkeypatch.setattr(
        SupplierImageSearchClient,
        "search_file",
        fail_with_untrusted_detail,
    )
    response = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": f"supplier-hygiene-{uuid.uuid4().hex}"},
        json={
            "taskType": "supplier_image_search",
            "input": {"imageBase64": _make_png_b64()},
        },
    )

    final = _poll_run(client, response.get_json()["runId"])
    rendered = json.dumps(final, ensure_ascii=False)
    assert final["status"] == "failed"
    assert final["diagnostics"] == {
        "code": "SUPPLIER_IMAGE_SEARCH_FAILED",
        "outcome": "PROVIDER_ERROR",
    }
    assert secret not in rendered
    assert untrusted_body not in rendered


def test_supplier_image_search_reuses_existing_job_for_same_request_id(
    client, monkeypatch
):
    from web.app import app
    from web.services.supplier_image_search_client import SupplierImageSearchClient

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )
    calls = []

    def fake_search_file(*_args, **_kwargs):
        calls.append("search")
        return _supplier_execution()

    monkeypatch.setattr(SupplierImageSearchClient, "search_file", fake_search_file)
    request_id = f"supplier-idempotent-{uuid.uuid4().hex}"
    payload = {
        "taskType": "supplier_image_search",
        "input": {"imageBase64": _make_png_b64()},
        "context": {"orgId": "org-idempotency"},
    }
    first = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": request_id},
        json=payload,
    )
    second = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": request_id},
        json=payload,
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.get_json()["runId"] == second.get_json()["runId"]
    assert first.get_json()["sessionId"] == second.get_json()["sessionId"]
    final = _poll_run(client, first.get_json()["runId"])
    assert final["status"] == "completed"
    assert calls == ["search"]


def test_supplier_image_search_does_not_reuse_job_across_workspaces(
    client, monkeypatch
):
    from web.app import app
    from web.services.supplier_image_search_client import SupplierImageSearchClient

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )
    calls = []

    def fake_search_file(*_args, **kwargs):
        calls.append(kwargs["request_id"])
        return _supplier_execution(kwargs["request_id"])

    monkeypatch.setattr(SupplierImageSearchClient, "search_file", fake_search_file)
    request_id = f"supplier-workspace-scope-{uuid.uuid4().hex}"
    image_base64 = _make_png_b64()

    def submit(workspace_id: str):
        return client.post(
            "/api/v1/agent/runs",
            headers={**_headers(), "X-Request-Id": request_id},
            json={
                "taskType": "supplier_image_search",
                "input": {"imageBase64": image_base64},
                "context": {
                    "orgId": "org-workspace-scope",
                    "workspaceId": workspace_id,
                },
            },
        )

    first = submit("workspace-a")
    second = submit("workspace-b")

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.get_json()["runId"] != second.get_json()["runId"]
    assert first.get_json()["sessionId"] != second.get_json()["sessionId"]
    assert _poll_run(client, first.get_json()["runId"])["status"] == "completed"
    assert _poll_run(client, second.get_json()["runId"])["status"] == "completed"
    assert calls == [request_id, request_id]


def test_supplier_image_search_same_scope_rejects_changed_input(client, monkeypatch):
    from web.app import app
    from web.services.supplier_image_search_client import SupplierImageSearchClient

    monkeypatch.setitem(
        app.config,
        "SUPPLIER_QUOTE_CONFIG",
        _supplier_image_config(),
    )
    calls = []

    def fake_search_file(*_args, **kwargs):
        calls.append(kwargs["request_id"])
        return _supplier_execution(kwargs["request_id"])

    monkeypatch.setattr(SupplierImageSearchClient, "search_file", fake_search_file)
    request_id = f"supplier-conflict-{uuid.uuid4().hex}"
    first = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": request_id},
        json={
            "taskType": "supplier_image_search",
            "input": {"imageBase64": _make_png_b64()},
            "context": {"orgId": "org-conflict"},
        },
    )
    second = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), "X-Request-Id": request_id},
        json={
            "taskType": "supplier_image_search",
            "input": {"imageBase64": _make_png_b64()},
            "context": {"orgId": "org-conflict"},
        },
    )

    assert first.status_code == 202
    assert second.status_code == 409
    assert second.get_json()["code"] == "AGENT_IDEMPOTENCY_CONFLICT"
    assert _poll_run(client, first.get_json()["runId"])["status"] == "completed"
    assert calls == [request_id]


@pytest.mark.parametrize(
    ("request_headers", "context"),
    [
        ({"X-Request-Id": "invalid/request"}, {}),
        ({}, {"requestId": "invalid/request"}),
        (
            {"X-Request-Id": "valid-request"},
            {"requestId": "invalid/request"},
        ),
    ],
)
def test_create_run_rejects_every_explicit_invalid_request_id(
    client, monkeypatch, request_headers, context
):
    from web.app import jobs

    def must_not_submit(*_args, **_kwargs):
        raise AssertionError("invalid request id must be rejected before submission")

    monkeypatch.setattr(jobs, "submit", must_not_submit)
    response = client.post(
        "/api/v1/agent/runs",
        headers={**_headers(), **request_headers},
        json={
            "taskType": "assistant_chat",
            "input": {"prompt": "request id validation"},
            "context": context,
        },
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "INVALID_REQUEST_ID"


def test_idempotency_scope_binds_org_task_and_stable_input_hash(client, monkeypatch):
    from web.app import jobs

    captured = []

    def capture_submit(task_type, payload, runner, idempotency_key=None):
        del runner
        captured.append((task_type, payload, idempotency_key))
        return {
            "job_id": f"captured-{len(captured)}",
            "status": "queued",
            "session_id": payload["session_id"],
        }

    monkeypatch.setattr(jobs, "submit", capture_submit)
    request_id = f"scope-{uuid.uuid4().hex}"
    requests_to_make = [
        (
            "assistant_chat",
            {"prompt": "same", "workspaceId": "workspace"},
            {"orgId": "org-a"},
        ),
        (
            "assistant_chat",
            {"workspaceId": "workspace", "prompt": "same"},
            {"orgId": "org-b"},
        ),
        (
            "supplier_image_search",
            {"imageBase64": _make_png_b64()},
            {"orgId": "org-a"},
        ),
    ]
    responses = []
    for task_type, input_data, context in requests_to_make:
        responses.append(
            client.post(
                "/api/v1/agent/runs",
                headers={**_headers(), "X-Request-Id": request_id},
                json={"taskType": task_type, "input": input_data, "context": context},
            )
        )

    assert [response.status_code for response in responses] == [202, 202, 202]
    assert len({entry[2] for entry in captured}) == 3
    assert all(len(entry[1]["input_sha256"]) == 64 for entry in captured)
    expected = json.dumps(
        {"prompt": "same", "workspaceId": "workspace"},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    assert captured[0][1]["input_sha256"] == hashlib.sha256(expected).hexdigest()
    assert all(
        response.get_json()["sessionId"] == captured[index][1]["session_id"]
        for index, response in enumerate(responses)
    )


def test_idempotency_scope_normalizes_empty_workspace_without_marker_collision():
    from web.routes.integration import _scoped_idempotency_key

    args = ("org-a", "assistant_chat", "request-a")
    missing_workspace = _scoped_idempotency_key(args[0], None, args[1], args[2])
    whitespace_workspace = _scoped_idempotency_key(args[0], "   ", args[1], args[2])
    marker_like_workspace = _scoped_idempotency_key(
        args[0], "workspace:empty", args[1], args[2]
    )

    assert missing_workspace == whitespace_workspace
    assert missing_workspace != marker_like_workspace


def test_create_run_uses_validated_trace_headers_as_authoritative_context(
    client, monkeypatch
):
    from web.app import jobs

    captured = {}

    def capture_submit(task_type, payload, runner, idempotency_key=None):
        captured.update(
            task_type=task_type,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        return {"job_id": "trace-job-1", "status": "queued"}

    monkeypatch.setattr(jobs, "submit", capture_submit)
    trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    response = client.post(
        "/api/v1/agent/runs",
        headers={
            **_headers(),
            "X-Request-Id": "run-1:attempt:1",
            "X-Trace-Id": trace_id,
            "traceparent": f"00-{trace_id}-00f067aa0ba902b7-01",
        },
        json={
            "taskType": "assistant_chat",
            "input": {"prompt": "trace this task"},
            "context": {
                "requestId": "forged-body-request",
                "traceId": "f" * 32,
                "traceparent": f"00-{'f' * 32}-1111111111111111-00",
            },
        },
    )

    assert response.status_code == 202
    context = captured["payload"]["context"]
    assert context["requestId"] == "run-1:attempt:1"
    assert context["traceId"] == trace_id
    assert context["traceparent"].startswith(f"00-{trace_id}-")
    assert response.headers["X-Trace-Id"] == trace_id
    assert response.headers["traceparent"] == context["traceparent"]


def test_get_unknown_run_returns_404(client):
    resp = client.get("/api/v1/agent/runs/deadbeef", headers=_headers())
    assert resp.status_code == 404


def test_create_run_reports_job_store_failure(client, monkeypatch):
    from web.app import jobs

    def fail_submit(*_args, **_kwargs):
        raise OSError("job store is not writable")

    monkeypatch.setattr(jobs, "submit", fail_submit)

    resp = client.post(
        "/api/v1/agent/runs",
        headers=_headers(),
        json={
            "taskType": "assistant_chat",
            "input": {"prompt": "verify job store failure handling"},
        },
    )

    assert resp.status_code == 503
    assert resp.get_json()["code"] == "AGENT_JOB_STORE_UNAVAILABLE"


def test_get_run_includes_structured_failure_diagnostics(client, monkeypatch):
    from web.app import jobs

    job = {
        "job_id": "diagnostics-test-run",
        "task_type": "product_research",
        "status": "failed",
        "progress": {"stage": "verify", "message": "verification failed"},
        "result": None,
        "error": "VerificationFailure: Verifier failed: missing competitor analysis",
        "diagnostics": {
            "code": "AGENT_OUTPUT_VERIFICATION_FAILED",
            "issues": ["missing competitor analysis"],
            "evidence": {"itemCount": 2, "observedPriceCount": 2},
        },
        "context": {},
    }
    monkeypatch.setattr(jobs, "get", lambda run_id: job if run_id == job["job_id"] else None)

    resp = client.get(
        f"/api/v1/agent/runs/{job['job_id']}",
        headers=_headers(),
    )

    assert resp.status_code == 200
    assert resp.get_json()["diagnostics"] == job["diagnostics"]


def test_autonomy_status_and_manual_scan_require_agent_auth(client, monkeypatch):
    from web.app import autonomy

    monkeypatch.setattr(
        autonomy,
        "status",
        lambda: {
            "enabled": True,
            "running": True,
            "killSwitch": False,
            "tasks": {"completed": 2},
        },
    )
    monkeypatch.setattr(autonomy, "run_once", autonomy.status)

    assert client.get("/api/v1/agent/autonomy/status").status_code == 401
    status = client.get(
        "/api/v1/agent/autonomy/status", headers=_headers()
    )
    scan = client.post(
        "/api/v1/agent/autonomy/scan", headers=_headers()
    )

    assert status.status_code == 200
    assert status.get_json()["tasks"]["completed"] == 2
    assert scan.status_code == 200
    assert scan.get_json()["running"] is True


# ── mock 模式端到端 ──

def test_generate_images_mock_end_to_end(client):
    resp = client.post(
        "/api/v1/agent/runs", headers=_headers(),
        json={
            "taskType": "generate_images",
            "input": {
                "productName": "陶瓷马克杯",
                "imageBase64": _make_png_b64(),
                "sceneCount": 3,
                "message": "生成 3 张上架套图",
            },
        },
    )
    assert resp.status_code == 202
    body = resp.get_json()
    run_id = body["runId"]
    assert body["status"] in ("queued", "running")
    assert body["sessionId"]

    # 轮询直到任务结束（mock 模式应在数秒内完成）
    deadline = time.time() + 60
    final = None
    while time.time() < deadline:
        poll = client.get(f"/api/v1/agent/runs/{run_id}", headers=_headers())
        assert poll.status_code == 200
        final = poll.get_json()
        if final["status"] in ("completed", "failed"):
            break
        time.sleep(0.5)

    assert final is not None
    assert final["status"] == "completed", f"任务未完成: {final}"
    result = final["result"]
    assert result["mockMode"] is True
    assert result["supervisionApproved"] is False
    assert result["publishable"] is False
    assert result["consistencyPassed"] is None
    assert result["compliancePassed"] is None
    assert len(result["images"]) >= 1
    for img in result["images"]:
        assert img["url"].startswith("/api/image/")
        assert img["width"] > 0
        assert img["height"] > 0
        assert img["mimeType"].startswith("image/")
        assert len(img["sha256"]) == 64
        assert img["byteSize"] > 0

    # 生成的图片可以通过媒体路由取到
    first_url = result["images"][0]["url"]
    media = client.get(first_url)
    assert media.status_code == 200


def test_job_queue_persists_and_survives_restart(tmp_path):
    from web.services.job_queue import JobQueue

    q = JobQueue(str(tmp_path), max_workers=1)
    job = q.submit("demo", {}, lambda job_id, payload, progress: {"ok": True})
    deadline = time.time() + 10
    while time.time() < deadline:
        current = q.get(job["job_id"])
        if current["status"] == "completed":
            break
        time.sleep(0.1)
    assert q.get(job["job_id"])["status"] == "completed"
    assert q.get(job["job_id"])["result"] == {"ok": True}

    # 模拟一个中断残留的 running 任务文件 → 新进程启动时应标记 failed
    import json

    stuck_id = "feedfacefeedface"
    with open(os.path.join(str(tmp_path), f"{stuck_id}.json"), "w",
              encoding="utf-8") as f:
        json.dump({
            "job_id": stuck_id, "task_type": "stuck", "status": "running",
            "progress": {}, "result": None, "error": "",
            "created_at": time.time(), "started_at": time.time(),
            "finished_at": None,
        }, f)

    q2 = JobQueue(str(tmp_path), max_workers=1)
    swept = q2.get(stuck_id)
    assert swept["status"] == "failed"
    assert "重启" in swept["error"]


def test_assistant_chat_routes_to_dual_agent_core(client, monkeypatch):
    from engine import DualAgentEngine

    calls = []

    def fake_process(self, user_message, has_images=False, progress_callback=None):
        calls.append({
            "message": user_message,
            "has_images": has_images,
            "assistant_id": self.observer.state.get("assistant_id"),
        })
        if progress_callback:
            progress_callback("observer", "reply", "fake core reply")
        return {
            "final_reply": "REAL_CORE_REPLY",
            "observer_first_reply": "fallback reply",
            "intent": {"intent": "chat"},
            "task": None,
            "proactive_questions": [],
            "quick_replies": [],
        }

    monkeypatch.setattr(DualAgentEngine, "process_user_message", fake_process)

    resp = client.post(
        "/api/v1/agent/runs", headers=_headers(),
        json={
            "taskType": "assistant_chat",
            "input": {
                "assistantId": "dashboard-assistant",
                "prompt": "strict real agent validation",
            },
        },
    )
    assert resp.status_code == 202
    run_id = resp.get_json()["runId"]

    deadline = time.time() + 10
    final = None
    while time.time() < deadline:
        poll = client.get(f"/api/v1/agent/runs/{run_id}", headers=_headers())
        assert poll.status_code == 200
        final = poll.get_json()
        if final["status"] in ("completed", "failed"):
            break
        time.sleep(0.1)

    assert final is not None
    assert final["status"] == "completed", final
    assert final["result"]["response"] == "REAL_CORE_REPLY"
    assert final["result"]["mockMode"] is False
    assert final["result"]["agentCore"] == "DualAgentEngine"
    assert calls == [{
        "message": "strict real agent validation",
        "has_images": False,
        "assistant_id": "dashboard-assistant",
    }]
