#!/usr/bin/env python3
"""
单元测试 — 反馈学习系统
"""
import os
import sys
import unittest
import tempfile
import json
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestFeedbackSystem(unittest.TestCase):
    """测试 ab_test_runner 的反馈记录和查询"""

    def setUp(self):
        # 临时重定向 FEEDBACK_DIR 到测试目录
        from scripts import ab_test_runner
        self.runner = ab_test_runner
        self.tmp_dir = tempfile.mkdtemp()
        self.original_dir = ab_test_runner.FEEDBACK_DIR
        self.original_file = ab_test_runner.FEEDBACK_FILE
        ab_test_runner.FEEDBACK_DIR = self.tmp_dir
        ab_test_runner.FEEDBACK_FILE = os.path.join(self.tmp_dir, "feedback_history.json")

    def tearDown(self):
        self.runner.FEEDBACK_DIR = self.original_dir
        self.runner.FEEDBACK_FILE = self.original_file
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_record_feedback(self):
        """测试记录反馈"""
        self.runner.record_feedback(
            product_name="测试产品",
            liked=["scene_02_lifestyle.jpg"],
            disliked=["scene_07_atmospheric.jpg"],
        )
        data = self.runner._load_feedback()
        self.assertGreater(len(data["sessions"]), 0)
        self.assertIn("scene_02_lifestyle", data["preferences"]["liked_scenes"])
        self.assertIn("scene_07_atmospheric", data["preferences"]["disliked_scenes"])

    def test_get_user_preferences(self):
        """测试查询用户偏好"""
        self.runner.record_feedback(
            liked=["scene_02_lifestyle.jpg", "scene_02_lifestyle.jpg"],
            disliked=["scene_07_atmospheric.jpg"],
        )
        prefs = self.runner.get_user_preferences()
        self.assertGreater(prefs["total_feedback"], 0)
        self.assertIn("scene_02_lifestyle", prefs["scene_preferences"])

    def test_preferences_influence_scene_ranking(self):
        """验证用户偏好能影响场景排序（反馈闭环）"""
        from scripts.scene_matcher import score_scenes, select_top_scenes

        # 1. 记录反馈：喜欢 scene_05_detail
        self.runner.record_feedback(
            liked=["scene_05_detail.jpg", "scene_05_detail.jpg", "scene_05_detail.jpg"],
        )

        # 2. 加载偏好
        prefs_data = self.runner.get_user_preferences()
        user_prefs = {
            "liked_scenes": prefs_data["raw"]["liked_scenes"],
            "disliked_scenes": prefs_data["raw"]["disliked_scenes"],
        }

        # 3. 评分时注入偏好
        profile = {"product_name": "test", "emotion_keywords": []}
        scenes = select_top_scenes(profile, count=10, user_preferences=user_prefs)

        # 4. detail 场景应在最前
        top_scene_ids = [s["scene_id"] for s in scenes[:3]]
        self.assertIn("scene_05_detail", top_scene_ids,
                       f"被用户偏爱的 scene_05_detail 应该排在前3，实际: {top_scene_ids}")


if __name__ == "__main__":
    unittest.main()
