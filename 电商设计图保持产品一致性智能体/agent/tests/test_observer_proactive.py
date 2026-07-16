#!/usr/bin/env python3
"""观察者主动提问逻辑测试"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.observer import ObserverAgent


class TestObserverProactive(unittest.TestCase):

    def setUp(self):
        self.observer = ObserverAgent()
        self.observer.state["session_id"] = "test01"

    def test_upload_proactive_questions(self):
        """上传图片后应主动询问产品、平台、品牌"""
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 1

        intent = self.observer.understand("", has_images=True)
        self.assertEqual(intent["intent"], "upload")

        result = self.observer.decide_reply(intent)
        self.assertIn("reply", result)
        self.assertTrue(result["proactive_questions"])
        reply = result["reply"]
        self.assertIn("产品", reply)
        self.assertIn("平台", reply)
        chips = result["quick_replies"]
        self.assertIn("分析一下", chips)
        self.assertIn("设置品牌", chips)

    def test_upload_does_not_repeat_questions(self):
        """同一会话不重复追问已问过的问题"""
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 1
        self.observer.state["pending_questions"] = [
            "product_info", "platform_target", "brand_logo",
        ]

        intent = self.observer.understand("", has_images=True)
        result = self.observer.decide_reply(intent)
        self.assertEqual(result["proactive_questions"], [])

    def test_greet_with_images_prompts_analyze(self):
        """有图未分析时，问候应主动建议分析"""
        self.observer.state["has_images"] = True
        self.observer.state["profile_ready"] = False

        intent = self.observer.understand("你好")
        result = self.observer.decide_reply(intent)
        texts = " ".join(q["text"] for q in result["proactive_questions"])
        self.assertIn("分析", texts)
        self.assertIn("分析一下", result["quick_replies"])

    def test_profile_ready_pre_generate_checklist(self):
        """分析完成后、生成前应展示配置检查清单"""
        self.observer.state["has_images"] = True
        self.observer.state["profile_ready"] = True
        self.observer.state["scenes_ready"] = True
        self.observer.state["generation_ready"] = False

        intent = self.observer.understand("好的")
        result = self.observer.decide_reply(intent)
        texts = " ".join(q["text"] for q in result["proactive_questions"])
        self.assertTrue(
            "品牌" in texts or "配置" in texts or "平台" in texts,
            f"expected checklist questions, got: {texts}",
        )

    def test_confirm_generate_includes_checklist(self):
        """确认生成前应展示配置清单"""
        self.observer.state["has_images"] = True
        self.observer.state["profile_ready"] = True

        intent = self.observer.understand("生成")
        result = self.observer.decide_reply(intent)
        self.assertTrue(result["proactive_questions"])
        self.assertIn("直接生成", result["quick_replies"])

    def test_post_analyze_supervise_questions(self):
        """分析监督完成后应追问场景确认与平台"""
        profile = {
            "product_name": "测试包",
            "category": "bag",
            "description": "一款测试用手袋",
        }
        scene_plan = [{"scene_name": f"场景{i}", "emotion": "测试"} for i in range(6)]
        report = {
            "type": "analyze",
            "status": "ok",
            "data": {"profile": profile, "scene_plan": scene_plan},
        }

        result = self.observer.supervise("task_1", report)
        self.assertTrue(result["approved"])
        self.assertTrue(result.get("proactive_questions"))
        msg = result["user_message"]
        self.assertIn("场景推荐", msg)
        self.assertIn("直接生成", result.get("quick_replies", []))

    def test_clear_pending_on_brand_answer(self):
        """用户提供品牌名后清除品牌相关 pending"""
        self.observer.state["pending_questions"] = ["brand_logo", "brand_name"]
        self.observer.state.setdefault("user_preferences", {})["brand_name"] = "MyBrand"

        self.observer._clear_answered_questions({"intent": "chat", "extracted": {}})
        pending = self.observer.state["pending_questions"]
        self.assertNotIn("brand_logo", pending)
        self.assertNotIn("brand_name", pending)

    def test_process_message_returns_proactive_fields(self):
        """process_message 返回 proactive_questions 与 quick_replies"""
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 2

        out = self.observer.process_message("", has_images=True)
        self.assertIn("proactive_questions", out)
        self.assertIn("quick_replies", out)
        self.assertTrue(out["proactive_questions"])


if __name__ == "__main__":
    unittest.main()
