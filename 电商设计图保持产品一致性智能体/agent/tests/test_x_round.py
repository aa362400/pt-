# -*- coding: utf-8 -*-
"""X 轮升级回归：对话直达精准改图 / 视觉定位 / 改后验收 / 版本回退。"""

import os
import sys
import unittest
from unittest.mock import patch

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_ROOT = os.path.join(AGENT_ROOT, "web")
for p in (AGENT_ROOT, WEB_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from web.services import edit_resolver  # noqa: E402
from web.services import visual_locate  # noqa: E402


# ── 对话改图解析 ──

class TestParseEditMessage(unittest.TestCase):
    def test_precise_edit_with_ordinal(self):
        parsed = edit_resolver.parse_edit_message("把第三张图杯子上的logo去掉")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["ordinal"], 3)
        self.assertFalse(parsed["is_restore"])
        self.assertIn("logo", parsed["target_desc"])

    def test_digit_ordinal(self):
        parsed = edit_resolver.parse_edit_message("第2张的阴影调暗一点")
        self.assertEqual(parsed["ordinal"], 2)

    def test_target_extraction_ba_pattern(self):
        parsed = edit_resolver.parse_edit_message("把背景换成米白色")
        self.assertEqual(parsed["target_desc"], "背景")

    def test_target_extraction_verb_first(self):
        parsed = edit_resolver.parse_edit_message("去掉右下角的水印")
        self.assertIn("水印", parsed["target_desc"])

    def test_restore_detection(self):
        for msg in ("恢复上一版", "换回上一版", "撤销修改", "还原到之前的样子"):
            parsed = edit_resolver.parse_edit_message(msg)
            self.assertIsNotNone(parsed, msg)
            self.assertTrue(parsed["is_restore"], msg)

    def test_regen_not_precise_edit(self):
        """整图重做类指令不算精准改图（交给 regenerate 流程）。"""
        self.assertIsNone(edit_resolver.parse_edit_message("第2张重做一版"))
        self.assertIsNone(edit_resolver.parse_edit_message("换个风格重新生成"))

    def test_plain_chat_returns_none(self):
        self.assertIsNone(edit_resolver.parse_edit_message("这套图整体不错"))
        self.assertIsNone(edit_resolver.parse_edit_message(""))

    def test_refers_last(self):
        parsed = edit_resolver.parse_edit_message("这张还是不行，把logo再改一下")
        self.assertTrue(parsed["refers_last"])


class TestResolveImage(unittest.TestCase):
    PLAN = [
        {"id": "img_1", "scene_id": "s1", "title": "白底主图"},
        {"id": "img_2", "scene_id": "s2", "title": "生活场景"},
        {"id": "img_3", "scene_id": "s3", "title": "宣传海报"},
    ]

    def _parse(self, msg):
        return edit_resolver.parse_edit_message(msg)

    def test_resolve_by_ordinal(self):
        r = edit_resolver.resolve_image(self._parse("把第三张的logo去掉"), self.PLAN)
        self.assertEqual(r["imageId"], "img_3")

    def test_ordinal_out_of_range(self):
        r = edit_resolver.resolve_image(self._parse("把第九张的logo去掉"), self.PLAN)
        self.assertTrue(r.get("notFound"))

    def test_resolve_by_title_keyword(self):
        r = edit_resolver.resolve_image(self._parse("把海报那张的文字擦掉"), self.PLAN)
        self.assertEqual(r["imageId"], "img_3")

    def test_resolve_refers_last(self):
        r = edit_resolver.resolve_image(
            self._parse("这张还是不行，把阴影调亮一点"), self.PLAN,
            last_edited_id="img_2")
        self.assertEqual(r["imageId"], "img_2")

    def test_ambiguous_returns_candidates(self):
        r = edit_resolver.resolve_image(self._parse("把logo去掉"), self.PLAN)
        self.assertIn("ambiguous", r)
        self.assertEqual(len(r["ambiguous"]), 3)

    def test_single_image_no_ask(self):
        r = edit_resolver.resolve_image(self._parse("把logo去掉"), [self.PLAN[0]])
        self.assertEqual(r["imageId"], "img_1")

    def test_empty_plan(self):
        r = edit_resolver.resolve_image(self._parse("把logo去掉"), [])
        self.assertTrue(r.get("notFound"))

    def test_last_edit_fallback(self):
        """多张图且没提哪张，但刚改过一张 → 默认还是那张。"""
        r = edit_resolver.resolve_image(self._parse("把logo去掉"), self.PLAN,
                                        last_edited_id="img_1")
        self.assertEqual(r["imageId"], "img_1")


# ── 视觉定位与验收 ──

class TestVisualLocate(unittest.TestCase):
    def setUp(self):
        import tempfile

        from PIL import Image

        self.tmp = tempfile.mkdtemp()
        self.img = os.path.join(self.tmp, "a.jpg")
        Image.new("RGB", (64, 64), (200, 100, 50)).save(self.img)
        # 解除 mock 屏蔽，配假 Key 走 mocked requests
        self._env = {k: os.environ.get(k)
                     for k in ("COMMERCE_AGENT_MOCK", "OPENAI_API_KEY")}
        os.environ["COMMERCE_AGENT_MOCK"] = "0"
        os.environ["OPENAI_API_KEY"] = "test-key"

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def _mock_response(self, payload):
        import json

        class R:
            def raise_for_status(self):
                pass

            def json(self):
                return {"choices": [{"message": {
                    "content": json.dumps(payload)}}]}
        return R()

    @patch("requests.post")
    def test_locate_returns_padded_box(self, mock_post):
        mock_post.return_value = self._mock_response(
            {"found": True, "box": [0.4, 0.4, 0.2, 0.2]})
        box = visual_locate.locate_object(self.img, "the logo on the mug")
        self.assertIsNotNone(box)
        x, y, w, h = box
        self.assertLess(x, 0.4)   # 外扩了
        self.assertGreater(w, 0.2)
        self.assertLessEqual(x + w, 1.0)

    @patch("requests.post")
    def test_locate_not_found(self, mock_post):
        mock_post.return_value = self._mock_response({"found": False})
        self.assertIsNone(visual_locate.locate_object(self.img, "unicorn"))

    @patch("requests.post", side_effect=RuntimeError("boom"))
    def test_locate_failure_returns_none(self, _):
        self.assertIsNone(visual_locate.locate_object(self.img, "logo"))

    def test_locate_mock_mode_disabled(self):
        os.environ["COMMERCE_AGENT_MOCK"] = "1"
        self.assertIsNone(visual_locate.locate_object(self.img, "logo"))

    @patch("requests.post")
    def test_verify_edit_pass(self, mock_post):
        mock_post.return_value = self._mock_response({
            "change_applied": True, "unintended_change": False,
            "product_intact": True, "notes": "logo 已移除"})
        v = visual_locate.verify_edit(self.img, self.img, "去掉logo")
        self.assertTrue(v["passed"])
        self.assertIn("logo", v["notes"])

    @patch("requests.post")
    def test_verify_edit_fail_on_unintended(self, mock_post):
        mock_post.return_value = self._mock_response({
            "change_applied": True, "unintended_change": True,
            "product_intact": True, "notes": "背景也变了"})
        v = visual_locate.verify_edit(self.img, self.img, "去掉logo")
        self.assertFalse(v["passed"])


# ── 观察者/编排意图 ──

class TestEditImageIntent(unittest.TestCase):
    def test_orchestrator_valid_intent(self):
        from agents.orchestrator import VALID_INTENTS
        self.assertIn("edit_image", VALID_INTENTS)

    def test_observer_regex_detects_edit(self):
        # conftest 已设 ORCHESTRATOR_LLM_DISABLED=1，understand 走正则路径
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-x")
        ob.state["generation_result"] = {"images": ["x.jpg"]}
        result = ob.understand("把第二张图的logo去掉", has_images=False)
        self.assertEqual(result["intent"], "edit_image")

    def test_observer_regex_no_edit_without_generation(self):
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-x2")
        result = ob.understand("把第二张图的logo去掉", has_images=False)
        self.assertNotEqual(result["intent"], "edit_image")

    def test_edit_image_not_dispatched(self):
        """edit_image 不派执行者任务（由 chat-edit 通道处理）。"""
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-x3")
        self.assertFalse(ob._should_dispatch("edit_image"))


if __name__ == "__main__":
    unittest.main()
