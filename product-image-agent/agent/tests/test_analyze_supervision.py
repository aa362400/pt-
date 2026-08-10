#!/usr/bin/env python3
"""english_textsceneenglish_text"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.observer import ObserverAgent
from agents.analyst import AnalystAgent
from agents.toolkit import AgentToolkit


class TestAnalyzeSupervision(unittest.TestCase):

    def setUp(self):
        self.observer = ObserverAgent()
        base = os.path.join(os.path.dirname(__file__), "..")
        self.toolkit = AgentToolkit(
            script_dir=os.path.join(base, "scripts"),
            template_dir=os.path.join(base, "templates", "scenes"),
            output_base=os.path.join(base, "outputs"),
        )

    def test_supervise_approves_partial_profile_with_scenes(self):
        """yes product_name text description textsceneenglish_textpassed（english_text）"""
        profile = {"product_name": "english_text", "category": "general"}
        scene_plan = [{"scene_id": f"s{i}", "scene_name": f"scene{i}"} for i in range(6)]
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": profile, "scene_plan": scene_plan},
        }
        result = self.observer.supervise("task_1", report)
        self.assertTrue(result["approved"], result)
        self.assertIn("scenetext", result["user_message"])

    def test_supervise_fails_without_profile(self):
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": {}, "scene_plan": [{"scene_id": "s1"}]},
        }
        result = self.observer.supervise("task_1", report)
        self.assertFalse(result["approved"])
        self.assertIn("english_textcompleted", result["user_message"])

    def test_supervise_fails_without_scenes(self):
        profile = {"product_name": "text", "description": "english_text"}
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": profile, "scene_plan": []},
        }
        result = self.observer.supervise("task_1", report)
        self.assertFalse(result["approved"])
        self.assertIn("sceneenglish_text", result["user_message"])

    def test_supervise_message_explains_missing_parts(self):
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": None, "scene_plan": []},
        }
        result = self.observer.supervise("task_1", report)
        self.assertFalse(result["approved"])
        self.assertNotEqual(result["user_message"], "⚠️ english_text，english_text。")

    def test_normalize_profile_fills_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "product_profile.json")
            partial = {"description_cn": "Englishtext"}
            with open(path, "w", encoding="utf-8") as f:
                json.dump(partial, f)
            out = AnalystAgent._normalize_profile(
                partial, [os.path.join(tmp, "my_pen.jpg")], path,
            )
            self.assertEqual(out["product_name"], "my_pen")
            self.assertEqual(out["category"], "general")
            self.assertTrue(out.get("description"))

    def test_user_product_hints_override_hourglass_misread(self):
        profile = {
            "product_name": "Wooden Hourglass Sand Timer",
            "product_name_cn": "english_text",
            "category": "home decor",
            "materials": ["clear glass hourglass tube", "fine brown sand"],
            "shape": "slanted wooden stand holding a glass hourglass",
            "description": "A wooden hourglass sand timer.",
        }
        hints = {
            "product_type": "pen",
            "product_name": "english_text",
            "product_name_cn": "english_text",
            "category": "writing instrument gift set",
            "category_cn": "english_text",
            "user_facts": ["english_text/english_text", "english_text", "english_text"],
            "description": "english_text/english_text、english_text、english_text",
        }

        out = AnalystAgent._normalize_profile(profile, [], product_hints=hints)

        self.assertEqual(out["product_name"], "english_text")
        self.assertEqual(out["category"], "writing instrument gift set")
        self.assertNotIn("sand", " ".join(out["materials"]).lower())
        self.assertIn("brown wood-grain fountain pen", out["materials"])
        self.assertIn("english_text", out["key_features"])

    def test_observer_extracts_pen_box_product_hints(self):
        msg = "textconsistencytext：english_text、english_text、english_text、english_text、english_text。"
        hints = self.observer._extract_product_hints(msg)

        self.assertEqual(hints["product_type"], "pen")
        self.assertEqual(hints["product_name"], "english_text")
        self.assertIn("english_text", hints["user_facts"])

    def test_match_scenes_returns_at_least_five(self):
        """english_textsceneenglish_text 5 textscene（Windows GBK security）"""
        with tempfile.TemporaryDirectory() as tmp:
            profile_path = os.path.join(tmp, "product_profile.json")
            profile = {
                "product_name": "Wooden Pen",
                "category": "writing instrument",
                "description": "A wooden pen in a gift box",
            }
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump(profile, f)
            result = self.toolkit.match_scenes(profile_path, tmp, log_prefix="Test")
            scenes = result.get("scene_plan", [])
            self.assertGreaterEqual(len(scenes), 5, scenes)
            self.assertTrue(os.path.exists(result.get("plan_path", "")))


if __name__ == "__main__":
    unittest.main()
