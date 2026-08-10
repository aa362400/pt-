# -*- coding: utf-8 -*-
"""english_text QA — english_text。"""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "scripts"))

from scripts import identity_qa  # noqa: E402
from scripts.consistency_checker import check_batch_consistency  # noqa: E402


def _make_image(color=(128, 128, 128)) -> str:
    img = Image.new("RGB", (200, 200), color)
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    img.save(tmp.name, "JPEG")
    tmp.close()
    return tmp.name


class TestIdentityQaGate(unittest.TestCase):
    def test_disabled_by_env(self):
        with patch.dict(os.environ, {"IDENTITY_QA": "0", "OPENAI_API_KEY": "sk-x"}):
            self.assertFalse(identity_qa.identity_qa_enabled())
            result = identity_qa.check_product_identity(["a.jpg"], ["b.jpg"])
            self.assertFalse(result["available"])

    def test_disabled_without_keys(self):
        # identity_qa text resolve_openai_api_key text，premium key english_text
        env = {k: "" for k in ("OPENAI_API_KEY", "OPENAI_API_KEY_PREMIUM",
                               "GEMINI_API_KEY")}
        env["IDENTITY_QA"] = "1"
        with patch.dict(os.environ, env):
            self.assertFalse(identity_qa.identity_qa_enabled())

    def test_unavailable_without_refs(self):
        with patch.dict(os.environ, {"IDENTITY_QA": "1", "OPENAI_API_KEY": "sk-x"}):
            result = identity_qa.check_product_identity([], ["b.jpg"])
            self.assertFalse(result["available"])

    def test_deepseek_skips_openai_and_uses_gemini(self):
        ref = _make_image((100, 100, 100))
        gen = _make_image((110, 110, 110))
        payload = {
            "images": [{"index": 1, "identity_score": 90, "issue": ""}],
            "summary": "ok",
        }
        env = {
            "IDENTITY_QA": "1",
            "OPENAI_API_KEY": "sk-text",
            "LLM_MODEL": "deepseek-chat",
            "VISION_MODEL": "",
            "VISION_API_KEY": "",
            "GEMINI_API_KEY": "g-test",
        }
        try:
            with patch.dict(os.environ, env), \
                 patch.object(identity_qa, "_via_openai") as openai_call, \
                 patch.object(identity_qa, "_via_gemini", return_value=payload) as gemini_call:
                result = identity_qa.check_product_identity([ref], [gen])
            openai_call.assert_not_called()
            gemini_call.assert_called_once()
            self.assertTrue(result["available"])
            self.assertEqual(result["method"], "gemini")
        finally:
            for path in (ref, gen):
                if os.path.exists(path):
                    os.unlink(path)


class TestIdentityBlending(unittest.TestCase):
    """english_text：55% english_text + 25% english_text + 20% english_text，
    english_text（english_textscene）。"""

    def setUp(self):
        self.ref = _make_image((100, 100, 200))
        self.gen1 = _make_image((120, 120, 120))
        self.gen2 = _make_image((130, 125, 118))
        self.paths = [self.gen1, self.gen2]

    def tearDown(self):
        for p in [self.ref, *self.paths]:
            if os.path.exists(p):
                os.unlink(p)

    def _run_with_identity(self, identity_result):
        with patch("identity_qa.check_product_identity",
                   return_value=identity_result), \
             patch("scripts.consistency_checker.check_consistency_via_ai",
                   return_value={"ai_consistency_score": None, "ai_issues": []}), \
             patch("visual_similarity.reference_fidelity_report",
                   return_value={"avg_fidelity": 10.0, "per_image": []}):
            return check_batch_consistency(
                self.paths, profile=None, reference_images=[self.ref])

    def test_identity_scores_blend_and_low_fidelity_ignored(self):
        identity = {
            "available": True,
            "avg_identity": 90.0,
            "per_image": [
                {"file": os.path.basename(self.gen1), "identity_score": 95, "issue": ""},
                {"file": os.path.basename(self.gen2), "identity_score": 85,
                 "issue": "english_text"},
            ],
            "summary": "consistent",
            "method": "openai",
        }
        result = self._run_with_identity(identity)
        self.assertTrue(result["identity_based"])
        # english_textyes 10 english_text（english_text）
        self.assertGreaterEqual(result["consistency_score"], 55)
        self.assertTrue(result["pass"])
        # english_text per_image（textautomatictextgenerationenglish_textscene）
        per_ident = [i.get("identity_score") for i in result["per_image"]]
        self.assertIn(95, per_ident)
        self.assertIn(85, per_ident)

    def test_low_identity_fails_and_flags_image(self):
        identity = {
            "available": True,
            "avg_identity": 30.0,
            "per_image": [
                {"file": os.path.basename(self.gen1), "identity_score": 20,
                 "issue": "english_text"},
                {"file": os.path.basename(self.gen2), "identity_score": 40,
                 "issue": "english_text"},
            ],
            "summary": "inconsistent",
            "method": "openai",
        }
        result = self._run_with_identity(identity)
        self.assertTrue(result["identity_based"])
        self.assertFalse(result["pass"])
        self.assertTrue(any("english_text" in i for i in result["issues"]))

    def test_fallback_when_identity_unavailable(self):
        result = self._run_with_identity({"available": False})
        self.assertFalse(result["identity_based"])
        # english_text：english_text 25% english_text
        self.assertIn("reference_fidelity", result)


class TestExecutorRegenSelection(unittest.TestCase):
    def test_failing_scene_ids_uses_identity(self):
        from agents.executor import ExecutorAgent

        qa_data = {"check_result": {
            "identity_based": True,
            "per_image": [
                {"file": "listing_01_hero.jpg", "identity_score": 30,
                 "quality": {"quality_score": 90}},
                {"file": "listing_02_scene.jpg", "identity_score": 92,
                 "quality": {"quality_score": 88}},
            ],
            "reference_fidelity": {"per_image": [
                {"file": "listing_02_scene.jpg", "fidelity": 10},
            ]},
        }}
        failing = ExecutorAgent._failing_scene_ids(qa_data)
        self.assertEqual(failing, ["listing_01_hero"])
        # identity_based english_text（english_textscene）
        self.assertNotIn("listing_02_scene", failing)

    def test_failing_scene_ids_fidelity_fallback(self):
        from agents.executor import ExecutorAgent

        qa_data = {"check_result": {
            "identity_based": False,
            "per_image": [],
            "reference_fidelity": {"per_image": [
                {"file": "scene_01_white.jpg", "fidelity": 20},
            ]},
        }}
        failing = ExecutorAgent._failing_scene_ids(qa_data)
        self.assertEqual(failing, ["scene_01_white"])


if __name__ == "__main__":
    unittest.main()
