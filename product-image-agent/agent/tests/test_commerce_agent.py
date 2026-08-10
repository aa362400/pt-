# -*- coding: utf-8 -*-
"""cross-border e-commercetext Agent APIenglish_text。"""

import json
import os
import sys

import pytest

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.services import commerce_strategy as cs  # noqa: E402


# ── english_text：english_text ──

@pytest.mark.parametrize("message,expected", [
    ("english_text 1 english_text", 1),
    ("english_text 3 textscenetext", 3),
    ("english_text 5 english_text", 5),
    ("english_text 9 english_textlistingtext", 9),
    ("english_text Etsy english_text", 3),
    ("english_text", 5),
])
def test_parse_explicit_count(message, expected):
    parsed = cs.parse_request(message)
    assert parsed["imageCount"] == expected
    assert parsed["countSource"] == "explicit"


@pytest.mark.parametrize("message,expected", [
    ("english_textlistingtext", 5),          # listingenglish_text 5 text
    ("english_text", 9),        # english_text 9 text
    ("english_text", 1),        # english_text/english_text 1 text
    ("textgenerationtextscenetext", 3),    # english_text 3 text
])
def test_parse_default_count(message, expected):
    parsed = cs.parse_request(message)
    assert parsed["imageCount"] == expected


# ── english_text：platform / textscene / text ──

def test_parse_platform_explicit():
    assert cs.parse_request("english_text 3 text Etsy english_text")["platforms"] == ["etsy"]
    assert cs.parse_request("text 5 text Temu english_text")["platforms"] == ["temu"]
    assert "amazon" in cs.parse_request("Amazon text")["platforms"]
    assert "tiktok" in cs.parse_request("TikTok Shop listingtext")["platforms"]


def test_parse_platform_default():
    parsed = cs.parse_request("english_text 3 textscenetext")
    assert parsed["platforms"] == ["etsy", "temu"]
    assert not parsed["platformExplicit"]


def test_parse_gift_scene():
    parsed = cs.parse_request("english_text")
    assert parsed["isGift"]
    assert parsed["audienceId"] == "mom"

    parsed = cs.parse_request("english_text 5 english_textlistingtext，text Etsy")
    assert parsed["occasionId"] == "petMemorial"
    assert parsed["audienceId"] == "petOwner"
    assert parsed["isListingSet"]


def test_parse_risk_tips_present():
    parsed = cs.parse_request("text 3 english_text")
    assert parsed["riskTips"]


# ── english_text ──

def test_plan_count_matches_request():
    for n in range(1, 10):
        parsed = cs.parse_request(f"english_text {n} text")
        plan = cs.build_plan(parsed)
        assert len(plan["images"]) == n, f"text {n} english_text {len(plan['images'])}"


def test_plan_image_fields():
    plan = cs.build_plan(cs.parse_request("english_text 5 english_textlistingtext，text Etsy"))
    strategy = plan["strategy"]
    assert strategy["platform"] == "Etsy"
    assert strategy["imageCount"] == 5
    assert strategy["riskReminder"]
    for i, img in enumerate(plan["images"], 1):
        assert img["id"] == f"img_{i}"
        assert img["title"] and img["purpose"] and img["ratio"]
        assert "{{product_name}}" in img["prompt"]
        assert "Etsy" in img["prompt"]
        assert img["negativePrompt"]


def test_plan_named_type_first():
    parsed = cs.parse_request("english_text 3 english_textpackagingtext")
    plan = cs.build_plan(parsed)
    assert plan["images"][0]["slot"] == "packaging"


def test_plan_amazon_white_background():
    plan = cs.build_plan(cs.parse_request("Amazon text 1 english_text"))
    assert "white seamless" in plan["images"][0]["prompt"]


# ── english_text ──

def test_apply_instruction_warmer():
    scene = {"id": "img_2", "prompt": "Base prompt."}
    updated = cs.apply_instruction(scene, "text 2 english_text")
    assert "warmer" in updated["prompt"]
    assert scene["prompt"] == "Base prompt."  # english_text


def test_apply_instruction_multiple():
    scene = {"id": "img_1", "prompt": "Base."}
    updated = cs.apply_instruction(scene, "text，backgroundenglish_text，english_text")
    assert "white seamless" in updated["prompt"]
    assert "Simplify the background" in updated["prompt"]
    assert "no text" in updated["prompt"].lower()


# ── LLM english_text（mock LLM response） ──

def test_llm_enrich_plan(monkeypatch):
    from web.services import commerce_llm

    monkeypatch.setenv("COMMERCE_LLM_PLAN", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    plan = cs.build_plan(cs.parse_request("text 2 text Etsy english_text"))
    llm_reply = {
        "creativeDirection": "english_text",
        "images": [
            {"id": "img_1", "prompt": "Custom hero shot of the acrylic pet memorial plaque, "
                                       "warm window light, consistent with reference images, "
                                       "no logos or trademarks anywhere."},
            {"id": "img_2", "prompt": "Emotional lifestyle scene of the same acrylic plaque "
                                       "on a wooden shelf beside dried flowers, cozy Etsy "
                                       "styling, product identical to reference images."},
        ],
    }

    class FakeResp:
        status_code = 200
        def raise_for_status(self): pass
        def json(self):
            return {"choices": [{"message": {"content": json.dumps(llm_reply)}}]}

    monkeypatch.setattr("requests.post", lambda *a, **k: FakeResp())
    ok = commerce_llm.enrich_plan_with_llm(plan, {"platform": "Etsy"}, {"product_name": "pet plaque"})
    assert ok
    assert plan["strategy"]["llmPlanned"] is True
    assert plan["strategy"]["creativeDirection"] == "english_text"
    assert "acrylic pet memorial" in plan["images"][0]["prompt"]
    assert plan["images"][0]["llmCustomized"] is True


def test_llm_enrich_plan_falls_back(monkeypatch):
    from web.services import commerce_llm

    monkeypatch.setenv("COMMERCE_LLM_PLAN", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    plan = cs.build_plan(cs.parse_request("text 1 english_text"))
    original = plan["images"][0]["prompt"]

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr("requests.post", boom)
    ok = commerce_llm.enrich_plan_with_llm(plan, {}, {"product_name": "x"})
    assert not ok
    assert plan["images"][0]["prompt"] == original  # templateenglish_text


def test_llm_enrich_disabled_without_key(monkeypatch):
    from web.services import commerce_llm

    monkeypatch.setenv("COMMERCE_LLM_PLAN", "1")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY_PREMIUM", raising=False)
    assert not commerce_llm.llm_plan_enabled()


# ── HTTP API（Flask test client，mock generation） ──

@pytest.fixture(scope="module")
def client():
    os.environ["COMMERCE_AGENT_MOCK"] = "1"
    os.environ["COMMERCE_LLM_PLAN"] = "0"
    web_dir = os.path.join(AGENT_ROOT, "web")
    if web_dir not in sys.path:
        sys.path.insert(0, web_dir)
    from web.app import app
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _csrf(client):
    return client.get("/api/csrf-token").get_json()["csrf_token"]


def test_api_parse(client):
    r = client.post("/api/commerce-agent/parse",
                    json={"message": "english_text 5 english_textlistingtext，text Etsy"})
    assert r.status_code == 200
    data = r.get_json()
    assert data["platform"] == "Etsy"
    assert data["imageCount"] == 5
    assert data["isListingSet"] is True
    assert data["riskTips"]


def test_api_parse_requires_message(client):
    assert client.post("/api/commerce-agent/parse", json={}).status_code == 400


def test_api_plan(client):
    r = client.post("/api/commerce-agent/plan", json={"message": "text 3 text Etsy english_text"})
    assert r.status_code == 200
    data = r.get_json()
    assert len(data["images"]) == 3
    assert data["strategy"]["platform"] == "Etsy"
    assert all(img["prompt"] for img in data["images"])


def test_api_generate_and_task_mock(client):
    import time as _t

    csrf = _csrf(client)
    plan = client.post("/api/commerce-agent/plan",
                       json={"message": "text 2 text"}).get_json()
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/generate", json={
        "csrf_token": csrf, "sessionId": sid, "images": plan["images"],
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["taskId"] == sid
    assert body["status"] == "processing"
    assert body["mockMode"] is True

    deadline = _t.time() + 30
    data = {}
    while _t.time() < deadline:
        data = client.get(f"/api/commerce-agent/tasks/{sid}").get_json()
        if data["status"] not in ("processing", "idle"):
            break
        _t.sleep(0.5)
    assert data["status"] == "mock_preview", data
    assert data["mockMode"] is True
    assert data["supervisionApproved"] is False
    assert data["publishable"] is False
    assert len(data["images"]) == 2
    for img in data["images"]:
        assert img["status"] == "done"
        assert img["url"].startswith(f"/api/image/{sid}/")
        # imagefilerealenglish_text
        resp = client.get(img["url"])
        assert resp.status_code == 200


def test_commerce_task_preserves_supervision_failure(client):
    from web.app import tasks

    sid = "t-commerce-supervision-failed"
    tasks.results[sid] = {
        "status": "supervision_failed",
        "supervision_approved": False,
        "final_reply": "visualconsistencytextpassed",
        "images": [],
        "scenes": [],
    }
    try:
        data = client.get(f"/api/commerce-agent/tasks/{sid}").get_json()
    finally:
        tasks.results.pop(sid, None)

    assert data["status"] == "supervision_failed"
    assert data["supervisionApproved"] is False
    assert data["publishable"] is False


def test_api_generate_requires_csrf(client):
    r = client.post("/api/commerce-agent/generate",
                    json={"sessionId": "x", "images": []})
    assert r.status_code == 403


def test_api_regenerate_mock(client):
    import time as _t

    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/regenerate", json={
        "csrf_token": csrf, "sessionId": sid,
        "imageId": "img_1", "instruction": "english_text",
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["status"] == "processing"
    assert "warmer" in body["image"]["prompt"]

    deadline = _t.time() + 30
    data = {}
    while _t.time() < deadline:
        data = client.get(f"/api/commerce-agent/tasks/{sid}").get_json()
        if data["status"] not in ("processing", "idle"):
            break
        _t.sleep(0.5)
    assert data["status"] == "mock_preview", data


def test_api_regenerate_unknown_image(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/regenerate", json={
        "csrf_token": csrf, "sessionId": "no-such-session",
        "imageId": "img_99", "instruction": "english_text",
    })
    assert r.status_code == 404


def test_api_regenerate_with_prompt_override(client):
    """userenglish_textgeneration：textuserenglish_text。"""
    import time as _t

    csrf = _csrf(client)
    sid = "t-commerce1"
    custom = ("Studio photo of the exact same ceramic mug on a marble table, "
              "soft morning light, product identical to reference images.")
    r = client.post("/api/commerce-agent/regenerate", json={
        "csrf_token": csrf, "sessionId": sid,
        "imageId": "img_1", "prompt": custom,
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["image"]["prompt"] == custom

    deadline = _t.time() + 30
    data = {}
    while _t.time() < deadline:
        data = client.get(f"/api/commerce-agent/tasks/{sid}").get_json()
        if data["status"] not in ("processing", "idle"):
            break
        _t.sleep(0.5)
    assert data["status"] == "mock_preview", data


def test_api_export_hd(client):
    """18K english_text：mock english_text。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    os.environ["HD_EXPORT_MAX_EDGE"] = "2048"  # english_text，english_text
    try:
        r = client.post("/api/commerce-agent/export-hd", json={
            "csrf_token": csrf, "sessionId": sid,
            "imageId": "img_1", "target": 999999,
        })
        assert r.status_code == 200, r.get_json()
        body = r.get_json()
        assert max(body["width"], body["height"]) == 2048
        assert body["url"].startswith(f"/api/image/{sid}/hd/")
        resp = client.get(body["url"])
        assert resp.status_code == 200
    finally:
        os.environ.pop("HD_EXPORT_MAX_EDGE", None)


def test_api_export_hd_unknown_image(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/export-hd", json={
        "csrf_token": csrf, "sessionId": "no-such", "imageId": "img_x",
    })
    assert r.status_code == 404


def test_api_export_hd_tier(client):
    """english_text：tier=2k outputtext 2048 text。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/export-hd", json={
        "csrf_token": csrf, "sessionId": sid,
        "imageId": "img_1", "tier": "2k",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert max(body["width"], body["height"]) == 2048
    assert body["tier"] == "2k"
    assert body["upscaler"] in ("lanczos", "realesrgan", "none")
    assert "_2k.jpg" in body["url"]


def test_api_export_resolution_pack(client):
    """english_text：allenglish_text 1K text zip text。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/export-resolution-pack", json={
        "csrf_token": csrf, "sessionId": sid, "tier": "1k",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["fileCount"] > 0
    assert body["tier"] == "1k"
    assert body["targetEdge"] == 1024
    resp = client.get(body["url"])
    assert resp.status_code == 200
    assert resp.mimetype == "application/zip"


def test_api_export_resolution_pack_bad_tier(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/export-resolution-pack", json={
        "csrf_token": csrf, "sessionId": "t-commerce1", "tier": "42k",
    })
    assert r.status_code == 400


def test_api_caption_poster_layout(client):
    """english_text：layout=poster outputtext CTA english_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/caption", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
        "imageId": "img_1", "layout": "poster",
        "text": "Big Sale | Up to 50% off | Shop Now",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["layout"] == "poster"
    assert body["headline"] == "Big Sale"
    assert body["cta"] == "Shop Now"
    assert "_poster.jpg" in body["url"]
    assert client.get(body["url"]).status_code == 200


def test_api_album(client):
    """english_text：english_text HTML english_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/album", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
    })
    assert r.status_code == 200, r.get_json()
    url = r.get_json()["url"]
    page = client.get(url)
    assert page.status_code == 200
    html_text = page.get_data(as_text=True)
    assert "english_text" in html_text
    assert "/api/image/t-commerce1/raw/" in html_text


def test_api_album_empty_session(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/album", json={
        "csrf_token": csrf, "sessionId": "no-such-session",
    })
    assert r.status_code == 404


def test_api_originals_listing(client):
    """english_text（Before/After english_text）：noneenglish_text。"""
    r = client.get("/api/originals/t-commerce1")
    assert r.status_code == 200
    assert isinstance(r.get_json()["originals"], list)


def test_api_inspiration(client):
    """english_text：APIenglish_text。"""
    r = client.get("/api/commerce-agent/inspiration")
    assert r.status_code == 200
    body = r.get_json()
    assert isinstance(body["suggestions"], list)
    for sg in body["suggestions"]:
        assert sg["sessionId"] and sg["sceneId"] and sg["sceneName"]


def test_api_chat_think_mode_flag(client):
    """MAX english_text：/api/chat text think_mode english_textstatus。"""
    from web.app import app as _app

    csrf = _csrf(client)
    r = client.post("/api/chat", data={
        "csrf_token": csrf, "session_id": "t-think",
        "message": "text", "think_mode": "1",
    })
    assert r.status_code == 200
    engine = _app.config["SESSIONS"]["t-think"]
    assert engine.observer.state["think_mode"] is True

    r = client.post("/api/chat", data={
        "csrf_token": _csrf(client), "session_id": "t-think", "message": "text",
    })
    assert r.status_code == 200
    assert engine.observer.state["think_mode"] is False


def test_api_ctr_score(client):
    """english_text：allgenerationenglish_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/ctr-score", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
    })
    assert r.status_code == 200, r.get_json()
    images = r.get_json()["images"]
    assert images
    scores = [im["score"] for im in images if im["score"] is not None]
    assert scores == sorted(scores, reverse=True)


def test_api_listing_pack(client):
    """english_text：text + imageenglish_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/listing-pack", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["title"]
    assert len(body["bullets"]) == 5
    resp = client.get(body["url"])
    assert resp.status_code == 200
    assert resp.mimetype == "application/zip"


def test_api_inpaint_mock(client):
    """english_text：mock english_text URL。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/inpaint", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
        "imageId": "img_1", "instruction": "english_textbackgroundenglish_text",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["mocked"] is True
    assert body["url"].startswith("/api/image/t-commerce1/")


def test_api_inpaint_requires_instruction(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/inpaint", json={
        "csrf_token": csrf, "sessionId": "t-commerce1", "imageId": "img_1",
    })
    assert r.status_code == 400


def test_api_chat_edit_by_ordinal(client):
    """english_text：「text1textlogotext」automaticenglish_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/chat-edit", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
        "message": "text1english_textlogotext",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["mocked"] is True
    assert body["imageId"] == "img_1"
    assert body["url"].startswith("/api/image/t-commerce1/")
    assert "logo" in body["targetDesc"]


def test_api_chat_edit_ambiguous_asks_back(client):
    """english_textnoneenglish_text：english_textyesenglish_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/chat-edit", json={
        "csrf_token": csrf, "sessionId": "t-commerce-fresh-x",
        "message": "english_text",
    })
    # english_textyesenglish_text → 404；yesenglish_text needClarify，english_text
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.get_json().get("needClarify") is True


def test_api_chat_edit_not_edit_message(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/chat-edit", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
        "message": "english_text",
    })
    assert r.status_code == 422
    assert r.get_json()["notEdit"] is True


def test_api_chat_edit_restore_last_version(client):
    """english_text「english_text」：text alts/ english_text，english_text。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    # english_text，english_text
    r = client.post("/api/commerce-agent/chat-edit", json={
        "csrf_token": csrf, "sessionId": sid,
        "message": "text1english_textbackgroundenglish_text",
    })
    assert r.status_code == 200, r.get_json()
    # text
    r = client.post("/api/commerce-agent/chat-edit", json={
        "csrf_token": _csrf(client), "sessionId": sid, "message": "english_text",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["restored"] is True
    assert body["imageId"] == "img_1"
    assert client.get(body["url"].split("?")[0]).status_code == 200


def test_api_restore_version_no_backup(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/restore-version", json={
        "csrf_token": csrf, "sessionId": "t-commerce1", "imageId": "img_2",
    })
    # img_2 english_text → textyesenglish_text
    assert r.status_code == 404


def test_api_export_bundle(client):
    """english_text：mock english_text zip（text/text/riskreport/text）。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/export-bundle", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert "listing.md" in body["files"]
    assert "risk_report.md" in body["files"]
    assert body["imageCount"] >= 1
    assert body["riskLevel"] in ("text", "text", "text")
    # zip english_text
    dl = client.get(body["url"])
    assert dl.status_code == 200
    assert dl.data[:2] == b"PK"


def test_api_action_log(client):
    """english_textAPI：generation/english_textyes append-only text。"""
    r = client.get("/api/commerce-agent/action-log?limit=20")
    assert r.status_code == 200
    logs = r.get_json()["logs"]
    assert isinstance(logs, list)


def test_api_risk_check(client):
    """riskdetectionAPI：english_textriskenglish_text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/risk-check", json={
        "csrf_token": csrf, "title": "disney pet ornament",
        "useLlm": False,
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["riskLevel"] == "text"
    assert body["trademarkHits"]
    assert body["suggestions"]


def test_api_plan_includes_risk_report(client):
    """english_textautomaticenglish_textrisktext。"""
    r = client.post("/api/commerce-agent/plan", json={
        "message": "text3textacrylicenglish_textlistingtext",
        "sessionId": "t-commerce1",
    })
    assert r.status_code == 200
    report = r.get_json().get("riskReport")
    assert report and report["riskLevel"] in ("text", "text", "text")


def test_api_opportunity_returns_card(client):
    """product researchtextAPI：mock english_texttemplateenglish_text，fieldstext。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/opportunity", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
        "idea": "english_text，text Etsy",
    })
    assert r.status_code == 200, r.get_json()
    card = r.get_json()["card"]
    assert 0 <= card["opportunity_score"] <= 100
    assert card["competition_level"] in ("text", "text", "text")
    assert isinstance(card["risk_notes"], list)


def test_api_opportunity_requires_idea(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/opportunity", json={
        "csrf_token": csrf, "sessionId": "t-commerce1",
    })
    assert r.status_code == 400


def test_api_chat_research_product_passthrough(client):
    """/api/chat textproduct researchenglish_text opportunity_request textfrontendtext。"""
    csrf = _csrf(client)
    r = client.post("/api/chat", data={
        "csrf_token": csrf, "session_id": "t-commerce1",
        "message": "english_text？",
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["intent"] == "research_product"
    assert body["opportunity_request"]["idea"] == "english_text"
    assert body["opportunity_request"]["raw_idea"] == "english_text？"


def test_api_chat_research_product_extracts_idea_from_complex_request(client):
    """platformenglish_text，textrealenglish_text。"""
    csrf = _csrf(client)
    msg = (
        "textyesenglish_textcustomer：english_text，english_text "
        "Etsy textyes Amazon，english_text 3 english_textplan。textyesenglish_text，"
        "english_textyesenglish_text。"
    )
    r = client.post("/api/chat", data={
        "csrf_token": csrf, "session_id": "t-commerce1",
        "message": msg,
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["intent"] == "research_product"
    assert body["opportunity_request"]["idea"] == "english_text"
    assert body["opportunity_request"]["raw_idea"] == msg


def test_api_opportunity_uses_raw_idea_platform_hints(client):
    """english_text，english_textplatformtext。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/opportunity", json={
        "csrf_token": csrf,
        "sessionId": "t-commerce1",
        "idea": "english_text",
        "raw_idea": (
            "english_text Etsy textyes Amazon。textyesenglish_text，"
            "english_textyesenglish_text。"
        ),
    })
    assert r.status_code == 200, r.get_json()
    card = r.get_json()["card"]
    assert card["idea"] == "english_text"
    assert card["platforms"] == ["Etsy", "Amazon"]


def test_api_chat_edit_intent_passthrough(client):
    """/api/chat text edit_image english_text edit_request textfrontendtext。"""
    from web.app import app as _app

    csrf = _csrf(client)
    sid = "t-commerce1"
    engine = _app.config["SESSIONS"].get(sid)
    assert engine is not None
    engine.observer.state["generation_result"] = {"done": True}
    r = client.post("/api/chat", data={
        "csrf_token": csrf, "session_id": sid,
        "message": "text2english_text",
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["intent"] == "edit_image"
    assert body["edit_request"]["message"] == "text2english_text"


def test_api_optimize_title(client):
    """textplatformtitletext：textplatformtext ≤75 english_text + text。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/optimize-title", json={
        "csrf_token": csrf,
        "title": "Handmade Walnut Wood Coaster Set of 4 Natural Grain "
                 "Housewarming Gift for New Home Rustic Table Decor",
        "platforms": ["amazon", "ebay"],
    })
    assert r.status_code == 200, r.get_json()
    results = r.get_json()["results"]
    assert {x["platform"] for x in results} == {"amazon", "ebay"}
    for x in results:
        assert len(x["optimized"]) <= 75
        assert "check" in x


def test_api_profit_and_keywords(client):
    """english_text：profitenglish_textkeywordstextAPI。"""
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/profit", json={
        "csrf_token": csrf, "price": 30, "cost": 8, "freight": 3,
        "platform": "amazon", "adPct": 10,
    })
    assert r.status_code == 200
    assert r.get_json()["profit"] == 11.5

    r = client.post("/api/commerce-agent/keywords", json={
        "csrf_token": csrf, "productName": "walnut coaster",
    })
    assert r.status_code == 200
    assert r.get_json()["keywords"]


def test_enrich_plan_think_mode_payload(monkeypatch):
    """MAX english_text：english_text LLM requestenglish_text。"""
    from unittest.mock import MagicMock, patch as _patch

    from web.services import commerce_llm

    monkeypatch.setenv("COMMERCE_LLM_PLAN", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    plan = {"images": [{"id": "img_1", "title": "text", "prompt": "x" * 50, "ratio": "1:1"}],
            "strategy": {}}

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": json.dumps({
            "images": [{"id": "img_1", "prompt": "y" * 60}]})}}],
    }
    with _patch("requests.post", return_value=mock_resp) as mock_post:
        ok = commerce_llm.enrich_plan_with_llm(plan, {}, {"product_name": "text"},
                                               think_mode=True)
    assert ok
    payload = mock_post.call_args.kwargs["json"]
    assert "MAX english_text" in payload["messages"][0]["content"]
    assert payload["max_tokens"] == 8192


def test_api_export_platforms(client):
    """textplatformenglish_text：textplatformlistingenglish_text + zip english_text。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/export-platforms", json={
        "csrf_token": csrf, "sessionId": sid,
        "platforms": ["etsy", "amazon_main"],
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["fileCount"] > 0
    keys = {p["key"] for p in body["platforms"]}
    assert keys == {"etsy", "amazon_main"}
    resp = client.get(body["url"])
    assert resp.status_code == 200
    assert resp.mimetype == "application/zip"

    import io
    import zipfile
    with zipfile.ZipFile(io.BytesIO(resp.data)) as zf:
        names = zf.namelist()
        assert any(n.replace("\\", "/").startswith("etsy/") for n in names)
        assert any(n.replace("\\", "/").startswith("amazon_main/") for n in names)


def test_api_export_platforms_no_images(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/export-platforms", json={
        "csrf_token": csrf, "sessionId": "no-such-session",
    })
    assert r.status_code == 404


def test_api_compliance_check(client):
    """listingenglish_text：english_textplatformenglish_textrisk。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/compliance", json={
        "csrf_token": csrf, "sessionId": sid,
        "platforms": ["amazon_main", "ebay"],
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["platforms"] == ["amazon_main", "ebay"]
    assert body["totalChecks"] == len(body["images"]) * 2
    assert body["passed"] + body["failed"] == body["totalChecks"]
    for im in body["images"]:
        assert im["imageId"]
        assert len(im["checks"]) == 2
        for chk in im["checks"]:
            assert "passed" in chk and "issues" in chk


def test_api_compliance_no_images(client):
    csrf = _csrf(client)
    r = client.post("/api/commerce-agent/compliance", json={
        "csrf_token": csrf, "sessionId": "no-such-session",
    })
    assert r.status_code == 404


def test_api_feedback_like_dislike_clear(client):
    """text/english_text：text、text、text，english_textAPItext。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/feedback", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_1",
        "verdict": "like",
    })
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["likes"] == 1

    r = client.post("/api/commerce-agent/feedback", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_2",
        "verdict": "dislike",
    })
    assert r.get_json()["dislikes"] == 1

    # english_textAPIenglish_textstatus
    r = client.get(f"/api/session/{sid}/messages")
    fb = r.get_json()["feedback"]
    assert fb["img_1"]["verdict"] == "like"
    assert fb["img_2"]["verdict"] == "dislike"

    # text
    r = client.post("/api/commerce-agent/feedback", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_1",
        "verdict": "clear",
    })
    assert r.get_json()["likes"] == 0

    r = client.post("/api/commerce-agent/feedback", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_1",
        "verdict": "bogus",
    })
    assert r.status_code == 400


def test_api_localized_pack(client, monkeypatch):
    """english_text：localenglish_text + english_text + zip text。"""
    import scripts.localization as loc

    def _fake_copy(profile, markets, output_path=""):
        return {"markets": {
            code: {"language": loc.MARKETS[code]["lang_code"],
                   "headline": f"Headline {code}", "subtext": "sub",
                   "selling_points": [], "cta": "Buy",
                   "market_name": loc.MARKETS[code]["name"],
                   "rtl": loc.MARKETS[code]["script"] == "arabic",
                   "recommended_platforms": loc.MARKETS[code]["platforms"]}
            for code in markets}, "source": "template_fallback"}

    monkeypatch.setattr(loc, "generate_localized_copy", _fake_copy)

    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/localized-pack", json={
        "csrf_token": csrf, "sessionId": sid, "markets": ["us", "jp", "bogus"],
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert {m["market"] for m in body["markets"]} == {"us", "jp"}
    resp = client.get(body["url"])
    assert resp.status_code == 200
    assert resp.mimetype == "application/zip"

    import io
    import zipfile
    with zipfile.ZipFile(io.BytesIO(resp.data)) as zf:
        names = [n.replace("\\", "/") for n in zf.namelist()]
        assert "us/copy.json" in names
        assert "us/hero_caption.jpg" in names
        assert "jp/copy.json" in names


def test_access_password_gate(client, monkeypatch):
    """english_text：english_text 401/english_text，english_text。"""
    monkeypatch.setenv("WEB_ACCESS_PASSWORD", "s3cret")

    # english_text
    assert client.get("/api/health").status_code == 200
    # API english_text → 401
    assert client.get("/api/sessions").status_code == 401
    # english_text → english_text
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 302 and "/login" in r.headers["Location"]

    # errortext
    r = client.post("/login", data={"password": "wrong"})
    assert r.status_code == 403

    # english_text → text
    r = client.post("/login", data={"password": "s3cret"},
                    follow_redirects=False)
    assert r.status_code == 302
    assert client.get("/api/sessions").status_code == 200

    # english_text（english_text monkeypatch automaticcompleted）
    monkeypatch.delenv("WEB_ACCESS_PASSWORD")
    with client.session_transaction() as sess:
        sess.clear()
    assert client.get("/api/sessions").status_code == 200


def test_api_ab_test_and_pick(client):
    """A/B text：generationenglish_text，english_text。"""
    import time as _t

    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/ab-test", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_1",
        "variants": 3,
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert len(body["variants"]) == 3
    assert body["variants"][0]["sceneId"].endswith("__ab1")

    deadline = _t.time() + 30
    data = {}
    while _t.time() < deadline:
        data = client.get(f"/api/commerce-agent/tasks/{sid}").get_json()
        if data["status"] not in ("processing", "idle"):
            break
        _t.sleep(0.5)
    assert data["status"] == "mock_preview", data
    done = {im["sceneId"] for im in data["images"] if im["status"] == "done"}
    assert {v["sceneId"] for v in body["variants"]} <= done

    winner = body["variants"][1]["sceneId"]
    r = client.post("/api/commerce-agent/ab-pick", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_1",
        "winnerSceneId": winner,
    })
    assert r.status_code == 200, r.get_json()
    pick = r.get_json()
    assert client.get(pick["url"]).status_code == 200

    # english_text
    fb = client.get(f"/api/session/{sid}/messages").get_json()["feedback"]
    assert fb["img_1"]["verdict"] == "like"
    assert winner in fb["img_1"]["prompt"]


def test_api_profile_library_and_adopt(client):
    """english_text：english_textyestext，english_text。"""
    from PIL import Image

    from web.app import OUTPUT_DIR, SESSIONS_DIR, sessions as live_sessions
    from web.services import session_store

    src_sid = "t-profile-src"
    rec = session_store.load_session_record(SESSIONS_DIR, src_sid)
    rec["product_profile"] = {
        "product_name": "Ceramic Mug", "product_name_cn": "english_text",
        "category": "mug", "category_cn": "text",
    }
    session_store.save_session_record(SESSIONS_DIR, src_sid, rec)
    originals = os.path.join(OUTPUT_DIR, src_sid, "originals")
    os.makedirs(originals, exist_ok=True)
    Image.new("RGB", (64, 64), (200, 100, 50)).save(
        os.path.join(originals, "ref.jpg"), "JPEG")

    r = client.get("/api/commerce-agent/profiles")
    assert r.status_code == 200
    profs = r.get_json()["profiles"]
    mine = next(p for p in profs if p["sessionId"] == src_sid)
    assert mine["productName"] == "english_text"
    assert mine["category"] == "text"

    csrf = _csrf(client)
    new_sid = "t-profile-new"
    r = client.post("/api/commerce-agent/adopt-profile", json={
        "csrf_token": csrf, "sessionId": new_sid, "sourceSessionId": src_sid,
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["productName"] == "english_text"
    assert body["referenceImageCount"] == 1

    engine = live_sessions.get(new_sid)
    assert engine is not None
    assert engine.context["profile"]["product_name"] == "Ceramic Mug"

    # textsourceenglish_text 404
    r = client.post("/api/commerce-agent/adopt-profile", json={
        "csrf_token": csrf, "sessionId": new_sid,
        "sourceSessionId": "no-such-profile",
    })
    assert r.status_code == 404


def test_api_caption_overlay(client):
    """english_text：english_text。"""
    csrf = _csrf(client)
    sid = "t-commerce1"
    r = client.post("/api/commerce-agent/caption", json={
        "csrf_token": csrf, "sessionId": sid, "imageId": "img_1",
        "text": "Perfect Gift | Handmade with love",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["headline"] == "Perfect Gift"
    assert body["subline"] == "Handmade with love"
    assert body["url"].startswith(f"/api/image/{sid}/layout/")
    resp = client.get(body["url"])
    assert resp.status_code == 200


def test_api_image_thumbnail(client):
    """english_text：?thumb=1 text WebP text，text URL textyestext。"""
    data = client.get("/api/commerce-agent/tasks/t-commerce1").get_json()
    done = next(im for im in data["images"] if im["status"] == "done")

    full = client.get(done["url"])
    assert full.status_code == 200
    assert full.mimetype != "image/webp"

    thumb = client.get(done["url"] + "?thumb=1")
    assert thumb.status_code == 200
    assert thumb.mimetype == "image/webp"
    assert len(thumb.data) < len(full.data) or len(full.data) < 20000

    from io import BytesIO

    from PIL import Image
    with Image.open(BytesIO(thumb.data)) as img:
        assert max(img.size) <= 480


def test_api_usage_stats(client):
    """generationenglish_text：mock english_text。"""
    r = client.get("/api/commerce-agent/usage/t-commerce1")
    assert r.status_code == 200
    body = r.get_json()
    assert body["rounds"] >= 1
    assert body["images"] >= 2
    assert body["seconds"] > 0


def test_api_sse_stream(client):
    """SSE english_text：completedtexttaskenglish_text。"""
    r = client.get("/api/commerce-agent/stream/t-commerce1")
    assert r.status_code == 200
    assert r.mimetype == "text/event-stream"
    payload = r.data.decode("utf-8")
    assert payload.startswith("data: ")
    data = json.loads(payload.split("data: ", 1)[1].split("\n\n")[0])
    assert data["taskId"] == "t-commerce1"
    assert data["status"] in ("mock_preview", "idle")
    if data["status"] == "mock_preview":
        assert data["mockMode"] is True
        assert data["publishable"] is False


def test_scene_from_image_hero_candidates(monkeypatch):
    """textsceneautomaticenglish_text，textscenetext。"""
    from web.routes import commerce as commerce_routes

    monkeypatch.setenv("BEST_OF_HERO", "2")
    hero = commerce_routes._scene_from_image(
        {"scene_id": "listing_01_hero", "title": "text", "prompt": "p"})
    assert hero["candidates"] == 2
    scene = commerce_routes._scene_from_image(
        {"scene_id": "listing_02_emotion", "title": "scene", "prompt": "p"})
    assert "candidates" not in scene

    monkeypatch.setenv("BEST_OF_HERO", "0")
    hero_off = commerce_routes._scene_from_image(
        {"scene_id": "listing_01_hero", "title": "text", "prompt": "p"})
    assert "candidates" not in hero_off


def test_session_history_restore(client):
    """generationenglish_textmessage，textfrontendenglish_text。"""
    import time as _t

    csrf = _csrf(client)
    plan = client.post("/api/commerce-agent/plan",
                       json={"message": "text 2 text Etsy english_text"}).get_json()
    sid = "t-commerce-hist"
    r = client.post("/api/commerce-agent/generate", json={
        "csrf_token": csrf, "sessionId": sid, "images": plan["images"],
        "message": "text 2 text Etsy english_text", "strategy": plan["strategy"],
    })
    assert r.status_code == 200

    deadline = _t.time() + 30
    while _t.time() < deadline:
        data = client.get(f"/api/commerce-agent/tasks/{sid}").get_json()
        if data["status"] not in ("processing", "idle"):
            break
        _t.sleep(0.5)

    rec = client.get(f"/api/session/{sid}/messages").get_json()
    assert len(rec["listing_plan"]) == 2
    assert rec["strategy"]["platform"] == "Etsy"
    roles = [m["role"] for m in rec["messages"]]
    assert "user" in roles and "observer" in roles
    done = [s for s in rec["scenes"] if s["status"] == "done"]
    assert len(done) == 2

    # english_text
    sessions = client.get("/api/sessions").get_json()["sessions"]
    assert any(s["session_id"] == sid for s in sessions)
