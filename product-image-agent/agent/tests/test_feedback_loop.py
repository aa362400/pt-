#!/usr/bin/env python3
"""
english_text — english_text
"""
import os
import sys
import unittest
import tempfile
import json
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestFeedbackSystem(unittest.TestCase):
    """text ab_test_runner english_text"""

    def setUp(self):
        # english_text FEEDBACK_DIR english_text
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
        """english_text"""
        self.runner.record_feedback(
            product_name="english_text",
            liked=["scene_02_lifestyle.jpg"],
            disliked=["scene_07_atmospheric.jpg"],
        )
        data = self.runner._load_feedback()
        self.assertGreater(len(data["sessions"]), 0)
        self.assertIn("scene_02_lifestyle", data["preferences"]["liked_scenes"])
        self.assertIn("scene_07_atmospheric", data["preferences"]["disliked_scenes"])

    def test_get_user_preferences(self):
        """english_textusertext"""
        self.runner.record_feedback(
            liked=["scene_02_lifestyle.jpg", "scene_02_lifestyle.jpg"],
            disliked=["scene_07_atmospheric.jpg"],
        )
        prefs = self.runner.get_user_preferences()
        self.assertGreater(prefs["total_feedback"], 0)
        self.assertIn("scene_02_lifestyle", prefs["scene_preferences"])

    def test_preferences_influence_scene_ranking(self):
        """textuserenglish_textscenetext（english_text）"""
        from scripts.scene_matcher import score_scenes, select_top_scenes

        # 1. english_text：text scene_05_detail
        self.runner.record_feedback(
            liked=["scene_05_detail.jpg", "scene_05_detail.jpg", "scene_05_detail.jpg"],
        )

        # 2. english_text
        prefs_data = self.runner.get_user_preferences()
        user_prefs = {
            "liked_scenes": prefs_data["raw"]["liked_scenes"],
            "disliked_scenes": prefs_data["raw"]["disliked_scenes"],
        }

        # 3. english_text
        profile = {"product_name": "test", "emotion_keywords": []}
        scenes = select_top_scenes(profile, count=10, user_preferences=user_prefs)

        # 4. detail sceneenglish_text
        top_scene_ids = [s["scene_id"] for s in scenes[:3]]
        self.assertIn("scene_05_detail", top_scene_ids,
                       f"textuserenglish_text scene_05_detail english_text3，text: {top_scene_ids}")


if __name__ == "__main__":
    unittest.main()
