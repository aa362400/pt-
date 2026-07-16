#!/usr/bin/env python3
"""分析监督与场景匹配健壮性测试"""
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
        """有 product_name 或 description 且场景非空时应通过（可带警告）"""
        profile = {"product_name": "测试笔", "category": "general"}
        scene_plan = [{"scene_id": f"s{i}", "scene_name": f"场景{i}"} for i in range(6)]
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": profile, "scene_plan": scene_plan},
        }
        result = self.observer.supervise("task_1", report)
        self.assertTrue(result["approved"], result)
        self.assertIn("场景推荐", result["user_message"])

    def test_supervise_fails_without_profile(self):
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": {}, "scene_plan": [{"scene_id": "s1"}]},
        }
        result = self.observer.supervise("task_1", report)
        self.assertFalse(result["approved"])
        self.assertIn("分析未完成", result["user_message"])

    def test_supervise_fails_without_scenes(self):
        profile = {"product_name": "笔", "description": "一支笔"}
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": profile, "scene_plan": []},
        }
        result = self.observer.supervise("task_1", report)
        self.assertFalse(result["approved"])
        self.assertIn("场景计划为空", result["user_message"])

    def test_supervise_message_explains_missing_parts(self):
        report = {
            "type": "analyze",
            "status": "success",
            "data": {"profile": None, "scene_plan": []},
        }
        result = self.observer.supervise("task_1", report)
        self.assertFalse(result["approved"])
        self.assertNotEqual(result["user_message"], "⚠️ 产品分析结果不完整，需要重新分析。")

    def test_normalize_profile_fills_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "product_profile.json")
            partial = {"description_cn": "中文描述"}
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
            "product_name_cn": "木质沙漏计时器",
            "category": "home decor",
            "materials": ["clear glass hourglass tube", "fine brown sand"],
            "shape": "slanted wooden stand holding a glass hourglass",
            "description": "A wooden hourglass sand timer.",
        }
        hints = {
            "product_type": "pen",
            "product_name": "木质钢笔礼盒展示架",
            "product_name_cn": "木质钢笔礼盒展示架",
            "category": "writing instrument gift set",
            "category_cn": "文具礼品与桌面收纳",
            "user_facts": ["浅色木质斜托笔盒/展示架", "棕色木纹钢笔", "金色笔夹与金色金属环"],
            "description": "浅色木质斜托笔盒/展示架、棕色木纹钢笔、金色笔夹与金色金属环",
        }

        out = AnalystAgent._normalize_profile(profile, [], product_hints=hints)

        self.assertEqual(out["product_name"], "木质钢笔礼盒展示架")
        self.assertEqual(out["category"], "writing instrument gift set")
        self.assertNotIn("sand", " ".join(out["materials"]).lower())
        self.assertIn("brown wood-grain fountain pen", out["materials"])
        self.assertIn("棕色木纹钢笔", out["key_features"])

    def test_observer_extracts_pen_box_product_hints(self):
        msg = "产品一致性重点：浅色木质斜托笔盒、棕色木纹钢笔、金色笔夹、金色金属环、透明笔帽。"
        hints = self.observer._extract_product_hints(msg)

        self.assertEqual(hints["product_type"], "pen")
        self.assertEqual(hints["product_name"], "木质钢笔礼盒展示架")
        self.assertIn("透明笔帽", hints["user_facts"])

    def test_match_scenes_returns_at_least_five(self):
        """进程内场景匹配应返回至少 5 个场景（Windows GBK 安全）"""
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
