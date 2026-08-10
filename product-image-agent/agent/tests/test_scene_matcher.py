#!/usr/bin/env python3
"""
english_text — sceneenglish_text
"""
import os
import sys
import unittest
import tempfile
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scripts.scene_matcher import (
    detect_category, score_scenes, select_top_scenes,
    CATEGORY_SCENE_SCORES, SCENE_INFO,
)


class TestSceneMatcher(unittest.TestCase):

    def setUp(self):
        self.fashion_profile = {
            "product_name": "english_text",
            "product_name_cn": "english_text",
            "category": "fashion",
            "category_cn": "text",
            "materials": ["text", "text"],
            "usage_scenarios": ["text", "text"],
            "emotion_keywords": ["text", "text"],
            "description": "english_text",
        }

    def test_detect_category_fashion(self):
        """detectioncategory：fashion"""
        cat = detect_category(self.fashion_profile)
        self.assertEqual(cat, "fashion")

    def test_detect_category_food(self):
        """detectioncategory：food"""
        p = {"category": "food", "product_name": "english_text"}
        self.assertEqual(detect_category(p), "food")

    def test_detect_category_general_fallback(self):
        """detectioncategory：noneenglish_text general"""
        p = {"product_name": "Unknown Item XYZ"}
        self.assertEqual(detect_category(p), "general")

    def test_score_scenes_basic(self):
        """textscenetext"""
        scenes = score_scenes(self.fashion_profile)
        self.assertEqual(len(scenes), len(CATEGORY_SCENE_SCORES))
        # fashion categorytext，lifestyle/premium textyestext
        scene_ids = [s["scene_id"] for s in scenes[:3]]
        self.assertIn("scene_02_lifestyle", scene_ids)

    def test_promo_poster_scene_registered(self):
        """english_textscene：english_text/scenetext/templatefileenglish_text。"""
        self.assertIn("scene_11_promo_poster", CATEGORY_SCENE_SCORES)
        self.assertIn("scene_11_promo_poster", SCENE_INFO)
        self.assertEqual(SCENE_INFO["scene_11_promo_poster"]["aspect_ratio"], "16:9")
        tpl_path = os.path.join(
            os.path.dirname(__file__), "..", "templates", "scenes",
            "scene_11_promo_poster.json")
        self.assertTrue(os.path.exists(tpl_path))
        with open(tpl_path, encoding="utf-8") as f:
            tpl = json.load(f)
        for field in ("scene_id", "prompt", "negative_prompt", "aspect_ratio"):
            self.assertIn(field, tpl)
        self.assertIn("{{product_name}}", tpl["prompt"])
        # english_text，english_text
        self.assertIn("text", tpl["negative_prompt"])

    def test_score_scenes_with_preferences(self):
        """scenetext：userenglish_text"""
        # usertext detail，english_text lifestyle
        prefs = {
            "liked_scenes": {"scene_05_detail": 5},
            "disliked_scenes": {"scene_02_lifestyle": 3},
        }
        scenes = score_scenes(self.fashion_profile, user_preferences=prefs)
        # detail textyes preference_bonus > 0
        detail_scene = next(s for s in scenes if s["scene_id"] == "scene_05_detail")
        self.assertGreater(detail_scene["preference_bonus"], 0)

        # lifestyle english_text
        lifestyle_scene = next(s for s in scenes if s["scene_id"] == "scene_02_lifestyle")
        self.assertLess(lifestyle_scene["preference_bonus"], 0)

    def test_select_top_scenes_skip(self):
        """english_textscene"""
        scenes = select_top_scenes(
            self.fashion_profile,
            skip=["scene_07_atmospheric", "scene_08_comparison"],
            count=10,
        )
        scene_ids = [s["scene_id"] for s in scenes]
        self.assertNotIn("scene_07_atmospheric", scene_ids)
        self.assertNotIn("scene_08_comparison", scene_ids)

    def test_select_top_scenes_prefer(self):
        """textsceneenglish_text"""
        scenes = select_top_scenes(
            self.fashion_profile,
            prefer=["scene_06_seasonal"],
            count=10,
        )
        self.assertEqual(scenes[0]["scene_id"], "scene_06_seasonal")

    def test_select_top_scenes_count(self):
        """sceneenglish_text"""
        scenes = select_top_scenes(self.fashion_profile, count=3)
        self.assertEqual(len(scenes), 3)


if __name__ == "__main__":
    unittest.main()
