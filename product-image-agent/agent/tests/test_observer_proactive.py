#!/usr/bin/env python3
"""english_text"""
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
        """textimageenglish_text、platform、text"""
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 1

        intent = self.observer.understand("", has_images=True)
        self.assertEqual(intent["intent"], "upload")

        result = self.observer.decide_reply(intent)
        self.assertIn("reply", result)
        self.assertTrue(result["proactive_questions"])
        reply = result["reply"]
        self.assertIn("text", reply)
        self.assertIn("platform", reply)
        chips = result["quick_replies"]
        self.assertIn("english_text", chips)
        self.assertIn("english_text", chips)

    def test_upload_does_not_repeat_questions(self):
        """english_text"""
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 1
        self.observer.state["pending_questions"] = [
            "product_info", "platform_target", "brand_logo",
        ]

        intent = self.observer.understand("", has_images=True)
        result = self.observer.decide_reply(intent)
        self.assertEqual(result["proactive_questions"], [])

    def test_greet_with_images_prompts_analyze(self):
        """yesenglish_text，english_text"""
        self.observer.state["has_images"] = True
        self.observer.state["profile_ready"] = False

        intent = self.observer.understand("text")
        result = self.observer.decide_reply(intent)
        texts = " ".join(q["text"] for q in result["proactive_questions"])
        self.assertIn("text", texts)
        self.assertIn("english_text", result["quick_replies"])

    def test_profile_ready_pre_generate_checklist(self):
        """textcompletedtext、generationenglish_textconfigurationenglish_text"""
        self.observer.state["has_images"] = True
        self.observer.state["profile_ready"] = True
        self.observer.state["scenes_ready"] = True
        self.observer.state["generation_ready"] = False

        intent = self.observer.understand("text")
        result = self.observer.decide_reply(intent)
        texts = " ".join(q["text"] for q in result["proactive_questions"])
        self.assertTrue(
            "text" in texts or "configuration" in texts or "platform" in texts,
            f"expected checklist questions, got: {texts}",
        )

    def test_confirm_generate_includes_checklist(self):
        """textgenerationenglish_textconfigurationtext"""
        self.observer.state["has_images"] = True
        self.observer.state["profile_ready"] = True

        intent = self.observer.understand("generation")
        result = self.observer.decide_reply(intent)
        self.assertTrue(result["proactive_questions"])
        self.assertIn("textgeneration", result["quick_replies"])

    def test_post_analyze_supervise_questions(self):
        """english_textcompletedenglish_textsceneenglish_textplatform"""
        profile = {
            "product_name": "english_text",
            "category": "bag",
            "description": "english_text",
        }
        scene_plan = [{"scene_name": f"scene{i}", "emotion": "text"} for i in range(6)]
        report = {
            "type": "analyze",
            "status": "ok",
            "data": {"profile": profile, "scene_plan": scene_plan},
        }

        result = self.observer.supervise("task_1", report)
        self.assertTrue(result["approved"])
        self.assertTrue(result.get("proactive_questions"))
        msg = result["user_message"]
        self.assertIn("scenetext", msg)
        self.assertIn("textgeneration", result.get("quick_replies", []))

    def test_clear_pending_on_brand_answer(self):
        """userenglish_text pending"""
        self.observer.state["pending_questions"] = ["brand_logo", "brand_name"]
        self.observer.state.setdefault("user_preferences", {})["brand_name"] = "MyBrand"

        self.observer._clear_answered_questions({"intent": "chat", "extracted": {}})
        pending = self.observer.state["pending_questions"]
        self.assertNotIn("brand_logo", pending)
        self.assertNotIn("brand_name", pending)

    def test_process_message_returns_proactive_fields(self):
        """process_message text proactive_questions text quick_replies"""
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 2

        out = self.observer.process_message("", has_images=True)
        self.assertIn("proactive_questions", out)
        self.assertIn("quick_replies", out)
        self.assertTrue(out["proactive_questions"])


if __name__ == "__main__":
    unittest.main()
