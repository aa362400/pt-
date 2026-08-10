# -*- coding: utf-8 -*-
"""P6 english_text（OpenAgent text）。

realenglish_textyesenglish_text：LLM english_text JSON、API 5xx、filetext、textinput、
fieldsenglish_text。english_text，english_textyestext。
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_ROOT = os.path.join(AGENT_ROOT, "web")
for p in (AGENT_ROOT, WEB_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)


class _FakeResp:
    """english_text HTTP response。"""

    def __init__(self, payload=None, text="", status=200):
        self._payload = payload
        self.text = text
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


def _llm_reply(content: str):
    return _FakeResp({"choices": [{"message": {"content": content}}]})


class TestLlmPerturbations(unittest.TestCase):
    """LLM english_text：text JSON / fieldstext / fieldstexterror → english_text。"""

    def setUp(self):
        self._env = {k: os.environ.get(k) for k in
                     ("OPENAI_API_KEY", "COMMERCE_AGENT_MOCK")}
        os.environ["OPENAI_API_KEY"] = "test-key"
        os.environ.pop("COMMERCE_AGENT_MOCK", None)

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    @patch("requests.post", return_value=_llm_reply("english_textoutputJSONenglish_text"))
    def test_opportunity_bad_json_falls_back_to_template(self, _):
        from web.services import opportunity
        card = opportunity.analyze_idea("english_text")
        self.assertEqual(card["source"], "template")
        self.assertIn("opportunity_score", card)

    @patch("requests.post", return_value=_llm_reply(
        '{"opportunity_score": "not-a-number", "platforms": 123}'))
    def test_opportunity_wrong_types_normalized(self, _):
        from web.services import opportunity
        card = opportunity.analyze_idea("english_text")
        self.assertTrue(0 <= card["opportunity_score"] <= 100)
        self.assertIsInstance(card["platforms"], list)

    @patch("requests.post", return_value=_llm_reply('{"found": true}'))
    def test_visual_locate_missing_box_returns_none(self, _):
        import tempfile as tf

        from PIL import Image

        from web.services import visual_locate
        with tf.TemporaryDirectory() as tmp:
            img = os.path.join(tmp, "a.jpg")
            Image.new("RGB", (32, 32), (10, 10, 10)).save(img)
            self.assertIsNone(visual_locate.locate_object(img, "logo"))

    @patch("requests.post", side_effect=ConnectionError("network down"))
    def test_memory_review_network_down_uses_rules(self, _):
        from common import memory_store
        keep, cat = memory_store.review("Etsy english_text 20 text")
        self.assertTrue(keep)
        self.assertIn(cat, memory_store.CATEGORIES)

    @patch("requests.post", side_effect=TimeoutError("llm timeout"))
    def test_risk_check_llm_timeout_still_reports_rules(self, _):
        from web.services import risk_check
        r = risk_check.check_listing(title="disney acrylic charm")
        self.assertEqual(r["riskLevel"], "text")
        self.assertFalse(r["llmUsed"])


class TestHttpPerturbations(unittest.TestCase):
    """APIenglish_text：text JSON body / english_text / english_text → 4xx text 500。"""

    @classmethod
    def setUpClass(cls):
        os.environ["COMMERCE_AGENT_MOCK"] = "1"
        os.environ.setdefault("ORCHESTRATOR_LLM_DISABLED", "1")
        from web.app import app
        cls.app = app
        cls.client = app.test_client()

    def _csrf(self):
        return self.client.get("/api/csrf-token").get_json()["csrf_token"]

    def test_malformed_json_body(self):
        r = self.client.post("/api/commerce-agent/opportunity",
                             data="{not json", content_type="application/json")
        self.assertIn(r.status_code, (400, 403))  # textyes 500

    def test_missing_fields_rejected_cleanly(self):
        r = self.client.post("/api/commerce-agent/chat-edit", json={
            "csrf_token": self._csrf()})
        self.assertEqual(r.status_code, 400)

    def test_html_injection_in_idea_is_safe(self):
        r = self.client.post("/api/commerce-agent/opportunity", json={
            "csrf_token": self._csrf(),
            "idea": "<script>alert(1)</script>english_text"})
        self.assertEqual(r.status_code, 200)
        # text JSON english_text，textfrontend esc text；english_text
        self.assertIn("opportunity_score", r.get_json()["card"])

    def test_oversized_ordinal_rejected(self):
        r = self.client.post("/api/commerce-agent/chat-edit", json={
            "csrf_token": self._csrf(), "sessionId": "t-commerce1",
            "message": "text999textlogotext"})
        self.assertEqual(r.status_code, 404)

    def test_unknown_route_is_json_404(self):
        r = self.client.get("/api/commerce-agent/no-such-endpoint")
        self.assertEqual(r.status_code, 404)
        self.assertIn("error", r.get_json())


class TestFileCorruption(unittest.TestCase):
    """english_textfiletext → automaticenglish_textwrite，text。"""

    def test_corrupt_memory_file_recovers(self):
        from common import memory_store
        with tempfile.TemporaryDirectory() as tmp:
            orig = memory_store.MEMORY_DIR
            memory_store.MEMORY_DIR = tmp
            try:
                bad = memory_store._file_path("product")
                os.makedirs(tmp, exist_ok=True)
                with open(bad, "wb") as f:
                    f.write(b"\xff\xfe broken \x00 bytes")
                # english_text
                self.assertIsInstance(memory_store.recall("english_text"), list)
                # english_text
                ok = memory_store.remember("english_textcategoryenglish_text",
                                           category="product",
                                           skip_review=True)
                self.assertTrue(ok)
            finally:
                memory_store.MEMORY_DIR = orig

    def test_corrupt_pool_file_recovers(self):
        from web.services import product_pool
        with tempfile.TemporaryDirectory() as tmp:
            orig = product_pool.POOL_PATH
            product_pool.POOL_PATH = os.path.join(tmp, "pool.json")
            try:
                with open(product_pool.POOL_PATH, "w", encoding="utf-8") as f:
                    f.write("{broken json!!")
                self.assertEqual(product_pool.list_pool(), [])
                item = product_pool.add_item("english_text")
                self.assertTrue(item["id"])
            finally:
                product_pool.POOL_PATH = orig

    def test_corrupt_action_log_skips_bad_lines(self):
        from web.services import safety
        with tempfile.TemporaryDirectory() as tmp:
            orig = safety.LOG_PATH
            safety.LOG_PATH = os.path.join(tmp, "actions.jsonl")
            try:
                with open(safety.LOG_PATH, "w", encoding="utf-8") as f:
                    f.write("{bad line\n")
                    f.write(json.dumps({"id": "ok1", "action": "x",
                                        "ts": 1, "status": "committed"}) + "\n")
                logs = safety.recent_logs()
                self.assertEqual(len(logs), 1)
                self.assertEqual(logs[0]["id"], "ok1")
            finally:
                safety.LOG_PATH = orig


class TestEngineDegradation(unittest.TestCase):
    """text/english_text：5xx text、textfailedenglish_texterror。"""

    def test_inpaint_gateway_5xx_retries_once(self):
        from PIL import Image

        from web.services import inpaint
        calls = {"n": 0}

        def flaky_post(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                return _FakeResp(status=503)
            import base64
            import io as _io
            buf = _io.BytesIO()
            Image.new("RGB", (32, 32), (200, 200, 200)).save(buf, "PNG")
            return _FakeResp({"data": [{"b64_json":
                                        base64.b64encode(buf.getvalue()).decode()}]})

        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, "raw")
            os.makedirs(raw)
            src = os.path.join(raw, "img.jpg")
            Image.new("RGB", (64, 48), (50, 60, 70)).save(src)
            env = {k: os.environ.get(k) for k in ("COMMERCE_AGENT_MOCK",)}
            os.environ.pop("COMMERCE_AGENT_MOCK", None)
            try:
                with patch("requests.post", side_effect=flaky_post), \
                        patch("time.sleep"):
                    result = inpaint.inpaint_image(src, "brighten", api_key="k")
            finally:
                for k, v in env.items():
                    if v is None:
                        os.environ.pop(k, None)
                    else:
                        os.environ[k] = v
            self.assertEqual(calls["n"], 2)  # english_text 503，automatictextsuccess
            self.assertFalse(result["mocked"])
            # outputenglish_text（text API english_text）
            with Image.open(src) as im:
                self.assertEqual(im.size, (64, 48))


if __name__ == "__main__":
    unittest.main()
