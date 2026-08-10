# -*- coding: utf-8 -*-
"""X english_text：english_text / visualtext / textacceptance / english_text。"""

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


# ── english_text ──

class TestParseEditMessage(unittest.TestCase):
    def test_precise_edit_with_ordinal(self):
        parsed = edit_resolver.parse_edit_message("english_textlogotext")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["ordinal"], 3)
        self.assertFalse(parsed["is_restore"])
        self.assertIn("logo", parsed["target_desc"])

    def test_digit_ordinal(self):
        parsed = edit_resolver.parse_edit_message("text2english_text")
        self.assertEqual(parsed["ordinal"], 2)

    def test_target_extraction_ba_pattern(self):
        parsed = edit_resolver.parse_edit_message("textbackgroundenglish_text")
        self.assertEqual(parsed["target_desc"], "background")

    def test_target_extraction_verb_first(self):
        parsed = edit_resolver.parse_edit_message("english_text")
        self.assertIn("text", parsed["target_desc"])

    def test_restore_detection(self):
        for msg in ("english_text", "english_text", "english_text", "english_text"):
            parsed = edit_resolver.parse_edit_message(msg)
            self.assertIsNotNone(parsed, msg)
            self.assertTrue(parsed["is_restore"], msg)

    def test_regen_not_precise_edit(self):
        """english_text（text regenerate flow）。"""
        self.assertIsNone(edit_resolver.parse_edit_message("text2english_text"))
        self.assertIsNone(edit_resolver.parse_edit_message("english_textgeneration"))

    def test_plain_chat_returns_none(self):
        self.assertIsNone(edit_resolver.parse_edit_message("english_text"))
        self.assertIsNone(edit_resolver.parse_edit_message(""))

    def test_refers_last(self):
        parsed = edit_resolver.parse_edit_message("english_textyestext，textlogoenglish_text")
        self.assertTrue(parsed["refers_last"])


class TestResolveImage(unittest.TestCase):
    PLAN = [
        {"id": "img_1", "scene_id": "s1", "title": "english_text"},
        {"id": "img_2", "scene_id": "s2", "title": "textscene"},
        {"id": "img_3", "scene_id": "s3", "title": "english_text"},
    ]

    def _parse(self, msg):
        return edit_resolver.parse_edit_message(msg)

    def test_resolve_by_ordinal(self):
        r = edit_resolver.resolve_image(self._parse("english_textlogotext"), self.PLAN)
        self.assertEqual(r["imageId"], "img_3")

    def test_ordinal_out_of_range(self):
        r = edit_resolver.resolve_image(self._parse("english_textlogotext"), self.PLAN)
        self.assertTrue(r.get("notFound"))

    def test_resolve_by_title_keyword(self):
        r = edit_resolver.resolve_image(self._parse("english_text"), self.PLAN)
        self.assertEqual(r["imageId"], "img_3")

    def test_resolve_refers_last(self):
        r = edit_resolver.resolve_image(
            self._parse("english_textyestext，english_text"), self.PLAN,
            last_edited_id="img_2")
        self.assertEqual(r["imageId"], "img_2")

    def test_ambiguous_returns_candidates(self):
        r = edit_resolver.resolve_image(self._parse("textlogotext"), self.PLAN)
        self.assertIn("ambiguous", r)
        self.assertEqual(len(r["ambiguous"]), 3)

    def test_single_image_no_ask(self):
        r = edit_resolver.resolve_image(self._parse("textlogotext"), [self.PLAN[0]])
        self.assertEqual(r["imageId"], "img_1")

    def test_empty_plan(self):
        r = edit_resolver.resolve_image(self._parse("textlogotext"), [])
        self.assertTrue(r.get("notFound"))

    def test_last_edit_fallback(self):
        """english_text，english_text → english_textyestext。"""
        r = edit_resolver.resolve_image(self._parse("textlogotext"), self.PLAN,
                                        last_edited_id="img_1")
        self.assertEqual(r["imageId"], "img_1")


# ── visualenglish_textacceptance ──

class TestVisualLocate(unittest.TestCase):
    def setUp(self):
        import tempfile

        from PIL import Image

        self.tmp = tempfile.mkdtemp()
        self.img = os.path.join(self.tmp, "a.jpg")
        Image.new("RGB", (64, 64), (200, 100, 50)).save(self.img)
        # text mock text，text Key text mocked requests
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
        self.assertLess(x, 0.4)   # english_text
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
            "product_intact": True, "notes": "logo english_text"})
        v = visual_locate.verify_edit(self.img, self.img, "textlogo")
        self.assertTrue(v["passed"])
        self.assertIn("logo", v["notes"])

    @patch("requests.post")
    def test_verify_edit_fail_on_unintended(self, mock_post):
        mock_post.return_value = self._mock_response({
            "change_applied": True, "unintended_change": True,
            "product_intact": True, "notes": "backgroundenglish_text"})
        v = visual_locate.verify_edit(self.img, self.img, "textlogo")
        self.assertFalse(v["passed"])


# ── english_text/english_text ──

class TestEditImageIntent(unittest.TestCase):
    def test_orchestrator_valid_intent(self):
        from agents.orchestrator import VALID_INTENTS
        self.assertIn("edit_image", VALID_INTENTS)

    def test_observer_regex_detects_edit(self):
        # conftest text ORCHESTRATOR_LLM_DISABLED=1，understand english_text
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-x")
        ob.state["generation_result"] = {"images": ["x.jpg"]}
        result = ob.understand("english_textlogotext", has_images=False)
        self.assertEqual(result["intent"], "edit_image")

    def test_observer_regex_no_edit_without_generation(self):
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-x2")
        result = ob.understand("english_textlogotext", has_images=False)
        self.assertNotEqual(result["intent"], "edit_image")

    def test_edit_image_not_dispatched(self):
        """edit_image english_texttask（text chat-edit english_text）。"""
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-x3")
        self.assertFalse(ob._should_dispatch("edit_image"))


if __name__ == "__main__":
    unittest.main()
