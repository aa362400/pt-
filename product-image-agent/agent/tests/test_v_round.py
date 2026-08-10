# -*- coding: utf-8 -*-
"""V english_text：scenetext / english_text / english_text / english_text / english_text / textmonitoring。"""

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from PIL import Image

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))


class TestSceneDirector(unittest.TestCase):
    """V0：LLM sceneenglish_text scene（background/text/text/text）text plan。"""

    def test_enrich_applies_scene_design(self):
        from web.services import commerce_llm

        plan = {"images": [{"id": "img_1", "title": "text",
                            "prompt": "x" * 50, "ratio": "1:1"}],
                "strategy": {}}
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": json.dumps({
            "creativeDirection": "english_text",
            "images": [{"id": "img_1", "prompt": "y" * 80,
                        "scene": {"background": "english_text",
                                  "props": ["english_text", "english_text"],
                                  "lighting": "english_text", "mood": "english_text"}}],
        })}}]}
        env = {"COMMERCE_LLM_PLAN": "1", "OPENAI_API_KEY": "test-key"}
        with patch.dict(os.environ, env), \
             patch("requests.post", return_value=mock_resp):
            ok = commerce_llm.enrich_plan_with_llm(plan, {}, {"product_name": "text"})
        self.assertTrue(ok)
        scene = plan["images"][0]["scene"]
        self.assertEqual(scene["background"], "english_text")
        self.assertEqual(scene["props"], ["english_text", "english_text"])


class TestUserMemory(unittest.TestCase):
    """V2：english_textoutput。"""

    def setUp(self):
        from common import user_memory
        self.mod = user_memory
        self.tmp = tempfile.mkdtemp()
        self._orig = user_memory.MEMORY_PATH
        user_memory.MEMORY_PATH = os.path.join(self.tmp, "user_memory.json")

    def tearDown(self):
        self.mod.MEMORY_PATH = self._orig
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_record_and_summary(self):
        self.mod.record("english_textEtsy，english_text，english_text",
                        {"platforms": ["etsy"], "brand_name": "WoodJoy"})
        self.mod.record("english_text", {"platforms": ["etsy"]})
        s = self.mod.summary()
        self.assertIn("etsy", s["textplatform"])
        self.assertEqual(s["text"], "WoodJoy")
        self.assertTrue(any("text" in t for t in s["text"]))
        self.assertTrue(any("english_text" in n for n in s["english_text"]))

    def test_empty_memory_summary(self):
        self.assertEqual(self.mod.summary(), {})


class TestDefectQa(unittest.TestCase):
    """V3：visualenglish_textautomatictextgeneration。"""

    def test_identity_qa_parses_defect_fields(self):
        sys.path.insert(0, os.path.join(AGENT_ROOT, "scripts"))
        import identity_qa

        tmp = tempfile.mkdtemp()
        ref = os.path.join(tmp, "ref.jpg")
        gen = os.path.join(tmp, "gen.jpg")
        for p in (ref, gen):
            Image.new("RGB", (64, 64), (100, 120, 140)).save(p, "JPEG")

        data = {"images": [{"index": 1, "identity_score": 88, "issue": "",
                            "defect_score": 40, "defect_issue": "english_text"}],
                "overall": 70, "summary": "ok"}
        with patch.dict(os.environ, {"IDENTITY_QA": "1", "OPENAI_API_KEY": "sk-x"}), \
             patch.object(identity_qa, "_via_openai", return_value=data):
            result = identity_qa.check_product_identity([ref], [gen])
        self.assertTrue(result["available"])
        item = result["per_image"][0]
        self.assertEqual(item["defect_score"], 40)
        self.assertIn("text", item["defect_issue"])

    def test_failing_scene_ids_includes_defects(self):
        from agents.executor import ExecutorAgent

        qa_data = {"check_result": {
            "identity_based": True,
            "per_image": [
                {"file": "scene_a.jpg", "identity_score": 90,
                 "defect_score": 30, "quality": {"quality_score": 85}},
                {"file": "scene_b.jpg", "identity_score": 92,
                 "defect_score": 95, "quality": {"quality_score": 88}},
            ],
        }}
        failing = ExecutorAgent._failing_scene_ids(qa_data)
        self.assertEqual(failing, ["scene_a"])

    def test_regen_scene_prompt_gets_correction(self):
        from agents.executor import ExecutorAgent

        agent = ExecutorAgent.__new__(ExecutorAgent)
        ctx = {
            "params": {"confirmed_scenes": [
                {"scene_id": "scene_a", "prompt": "Base prompt."},
            ]},
            "plan_path": "",
            "qa_data": {"check_result": {
                "identity_based": True,
                "per_image": [{"file": "scene_a.jpg", "identity_score": 30,
                               "identity_issue": "english_text",
                               "defect_issue": "english_text"}],
            }},
        }
        scenes = ExecutorAgent._resolve_regen_scenes(agent, ctx)
        self.assertEqual(len(scenes), 1)
        self.assertIn("english_text", scenes[0]["prompt"])
        self.assertIn("english_text", scenes[0]["prompt"])
        # textsceneenglish_text
        self.assertEqual(ctx["params"]["confirmed_scenes"][0]["prompt"], "Base prompt.")


class TestCtrEstimator(unittest.TestCase):
    """V4：english_textlocaltext。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _make_img(self, name, subject_ratio=0.7):
        path = os.path.join(self.tmp, name)
        img = Image.new("RGB", (400, 400), (250, 250, 250))
        size = int(400 * subject_ratio)
        off = (400 - size) // 2
        for y in range(off, off + size):
            for x in range(off, off + size):
                img.putpixel((x, y), (180, 60, 40))
        img.save(path, "JPEG")
        return path

    def test_score_image_range_and_reasons(self):
        from web.services import ctr_estimator

        result = ctr_estimator.score_image(self._make_img("good.jpg"))
        self.assertIsNotNone(result["score"])
        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)
        self.assertIn("metrics", result)

    def test_score_directory_ranked(self):
        from web.services import ctr_estimator

        self._make_img("big.jpg", 0.7)
        self._make_img("small.jpg", 0.15)
        results = ctr_estimator.score_directory(self.tmp)
        self.assertEqual(len(results), 2)
        self.assertGreaterEqual(results[0]["score"], results[1]["score"])


class TestListingPack(unittest.TestCase):
    """V5：english_texttemplateenglish_text。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        raw = os.path.join(self.tmp, "raw")
        os.makedirs(raw)
        Image.new("RGB", (100, 100), (10, 60, 160)).save(
            os.path.join(raw, "hero.jpg"), "JPEG")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_template_fallback_pack(self):
        from web.services import listing_pack

        profile = {"product_name": "Walnut Coaster", "material": "walnut wood",
                   "selling_points": ["Handmade", "Natural grain"]}
        with patch.dict(os.environ, {"COMMERCE_LLM_PLAN": "0"}):
            result = listing_pack.build_listing_pack("s1", self.tmp, profile, "Etsy")
        self.assertEqual(result["source"], "template")
        self.assertIn("Walnut Coaster", result["copy"]["title"])
        self.assertEqual(len(result["copy"]["bullets"]), 5)
        self.assertTrue(os.path.exists(result["zip_path"]))
        import zipfile
        with zipfile.ZipFile(result["zip_path"]) as zf:
            names = zf.namelist()
        self.assertIn("listing.csv", names)
        self.assertIn("listing.json", names)
        self.assertIn("images/hero.jpg", names)

    def test_no_images_raises(self):
        from web.services import listing_pack

        empty = tempfile.mkdtemp()
        with self.assertRaises(ValueError):
            listing_pack.build_listing_pack("s1", empty, {})


class TestCompetitorWatch(unittest.TestCase):
    """V6：textmonitoringenglish_textreport。"""

    def setUp(self):
        from web.services import competitor_watch
        self.mod = competitor_watch
        self.tmp = tempfile.mkdtemp()
        self._orig = competitor_watch.WATCHLIST_PATH
        competitor_watch.WATCHLIST_PATH = os.path.join(self.tmp, "watch.json")

    def tearDown(self):
        self.mod.WATCHLIST_PATH = self._orig
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_remove_and_validation(self):
        self.mod.add_watch("https://example.com/item/1", "textA")
        self.assertEqual(len(self.mod.list_watches()), 1)
        with self.assertRaises(ValueError):
            self.mod.add_watch("https://example.com/item/1")
        with self.assertRaises(ValueError):
            self.mod.add_watch("ftp://bad")
        self.mod.remove_watch("https://example.com/item/1")
        self.assertEqual(self.mod.list_watches(), [])

    def test_report_detects_image_change(self):
        self.mod.add_watch("https://example.com/item/2", "textB")
        # english_text
        items = self.mod.list_watches()
        # english_textyestext 0，english_text 1 textyesenglish_text
        items[0]["last"] = {"image_hash": "1" * 64, "title": "Old Title",
                            "checked_at": 1}
        self.mod._save(items)

        img_dir = tempfile.mkdtemp()
        img_path = os.path.join(img_dir, "main.jpg")
        Image.new("RGB", (64, 64), (255, 255, 255)).save(img_path, "JPEG")

        with patch("common.fetch_url.fetch_product_image",
                   return_value={"success": True, "local_path": img_path}), \
             patch.object(self.mod, "_fetch_title", return_value="New Title"):
            report = self.mod.run_report()
        self.assertEqual(report["changedCount"], 1)
        changes = report["items"][0]["changes"]
        self.assertTrue(any("english_text" in c for c in changes))
        self.assertTrue(any("titletext" in c for c in changes))


if __name__ == "__main__":
    unittest.main()
