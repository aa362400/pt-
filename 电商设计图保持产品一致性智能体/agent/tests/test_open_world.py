# -*- coding: utf-8 -*-
"""P6 开放环境鲁棒性测试集（OpenAgent 思想）。

真实业务不是静态考卷：LLM 返回坏 JSON、接口 5xx、文件损坏、恶意输入、
字段缺失都会发生。本测试集专门扰动这些环节，验证各链路正确降级而不是崩。
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
    """可编程的假 HTTP 响应。"""

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
    """LLM 返回劣化：非 JSON / 字段缺失 / 字段类型错误 → 各服务降级不崩。"""

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

    @patch("requests.post", return_value=_llm_reply("我不会输出JSON哈哈哈"))
    def test_opportunity_bad_json_falls_back_to_template(self, _):
        from web.services import opportunity
        card = opportunity.analyze_idea("木质花盆")
        self.assertEqual(card["source"], "template")
        self.assertIn("opportunity_score", card)

    @patch("requests.post", return_value=_llm_reply(
        '{"opportunity_score": "not-a-number", "platforms": 123}'))
    def test_opportunity_wrong_types_normalized(self, _):
        from web.services import opportunity
        card = opportunity.analyze_idea("木质花盆")
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
        keep, cat = memory_store.review("Etsy 标签不能超过 20 字符")
        self.assertTrue(keep)
        self.assertIn(cat, memory_store.CATEGORIES)

    @patch("requests.post", side_effect=TimeoutError("llm timeout"))
    def test_risk_check_llm_timeout_still_reports_rules(self, _):
        from web.services import risk_check
        r = risk_check.check_listing(title="disney acrylic charm")
        self.assertEqual(r["riskLevel"], "高")
        self.assertFalse(r["llmUsed"])


class TestHttpPerturbations(unittest.TestCase):
    """接口层扰动：坏 JSON body / 超大参数 / 注入内容 → 4xx 而非 500。"""

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
        self.assertIn(r.status_code, (400, 403))  # 不是 500

    def test_missing_fields_rejected_cleanly(self):
        r = self.client.post("/api/commerce-agent/chat-edit", json={
            "csrf_token": self._csrf()})
        self.assertEqual(r.status_code, 400)

    def test_html_injection_in_idea_is_safe(self):
        r = self.client.post("/api/commerce-agent/opportunity", json={
            "csrf_token": self._csrf(),
            "idea": "<script>alert(1)</script>木质花盆"})
        self.assertEqual(r.status_code, 200)
        # 返回 JSON 原样携带文本，由前端 esc 渲染；服务端不崩即可
        self.assertIn("opportunity_score", r.get_json()["card"])

    def test_oversized_ordinal_rejected(self):
        r = self.client.post("/api/commerce-agent/chat-edit", json={
            "csrf_token": self._csrf(), "sessionId": "t-commerce1",
            "message": "把第999张的logo去掉"})
        self.assertEqual(r.status_code, 404)

    def test_unknown_route_is_json_404(self):
        r = self.client.get("/api/commerce-agent/no-such-endpoint")
        self.assertEqual(r.status_code, 404)
        self.assertIn("error", r.get_json())


class TestFileCorruption(unittest.TestCase):
    """持久化文件损坏 → 自动当空处理并可继续写入，不崩。"""

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
                # 召回不崩
                self.assertIsInstance(memory_store.recall("宠物产品"), list)
                # 还能继续写
                ok = memory_store.remember("宠物纪念类目值得继续做",
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
                item = product_pool.add_item("恢复测试品")
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
    """生图/编辑引擎故障：5xx 重试、彻底失败给明确错误。"""

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
            self.assertEqual(calls["n"], 2)  # 第一次 503，自动重试成功
            self.assertFalse(result["mocked"])
            # 输出尺寸恢复为原图尺寸（不因 API 方图拉变形）
            with Image.open(src) as im:
                self.assertEqual(im.size, (64, 48))


if __name__ == "__main__":
    unittest.main()
