#!/usr/bin/env python3
"""
单元测试 — 场景匹配器
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
            "product_name": "手工双肩包",
            "product_name_cn": "手工双肩包",
            "category": "fashion",
            "category_cn": "服饰",
            "materials": ["皮革", "黄铜"],
            "usage_scenarios": ["通勤", "旅行"],
            "emotion_keywords": ["品质", "优雅"],
            "description": "手工皮包",
        }

    def test_detect_category_fashion(self):
        """检测类目：fashion"""
        cat = detect_category(self.fashion_profile)
        self.assertEqual(cat, "fashion")

    def test_detect_category_food(self):
        """检测类目：food"""
        p = {"category": "food", "product_name": "巧克力"}
        self.assertEqual(detect_category(p), "food")

    def test_detect_category_general_fallback(self):
        """检测类目：无法识别时回退到 general"""
        p = {"product_name": "Unknown Item XYZ"}
        self.assertEqual(detect_category(p), "general")

    def test_score_scenes_basic(self):
        """基本场景评分"""
        scenes = score_scenes(self.fashion_profile)
        self.assertEqual(len(scenes), len(CATEGORY_SCENE_SCORES))
        # fashion 类目下，lifestyle/premium 应该是高分
        scene_ids = [s["scene_id"] for s in scenes[:3]]
        self.assertIn("scene_02_lifestyle", scene_ids)

    def test_promo_poster_scene_registered(self):
        """宣传海报场景：评分矩阵/场景信息/模板文件三处齐备。"""
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
        # 海报要留文案位，不能让模型自己画字
        self.assertIn("text", tpl["negative_prompt"])

    def test_score_scenes_with_preferences(self):
        """场景评分：用户偏好影响排序"""
        # 用户喜欢 detail，不喜欢 lifestyle
        prefs = {
            "liked_scenes": {"scene_05_detail": 5},
            "disliked_scenes": {"scene_02_lifestyle": 3},
        }
        scenes = score_scenes(self.fashion_profile, user_preferences=prefs)
        # detail 应该有 preference_bonus > 0
        detail_scene = next(s for s in scenes if s["scene_id"] == "scene_05_detail")
        self.assertGreater(detail_scene["preference_bonus"], 0)

        # lifestyle 应该被扣分
        lifestyle_scene = next(s for s in scenes if s["scene_id"] == "scene_02_lifestyle")
        self.assertLess(lifestyle_scene["preference_bonus"], 0)

    def test_select_top_scenes_skip(self):
        """跳过指定场景"""
        scenes = select_top_scenes(
            self.fashion_profile,
            skip=["scene_07_atmospheric", "scene_08_comparison"],
            count=10,
        )
        scene_ids = [s["scene_id"] for s in scenes]
        self.assertNotIn("scene_07_atmospheric", scene_ids)
        self.assertNotIn("scene_08_comparison", scene_ids)

    def test_select_top_scenes_prefer(self):
        """优先场景应排在最前"""
        scenes = select_top_scenes(
            self.fashion_profile,
            prefer=["scene_06_seasonal"],
            count=10,
        )
        self.assertEqual(scenes[0]["scene_id"], "scene_06_seasonal")

    def test_select_top_scenes_count(self):
        """场景数量限制"""
        scenes = select_top_scenes(self.fashion_profile, count=3)
        self.assertEqual(len(scenes), 3)


if __name__ == "__main__":
    unittest.main()
