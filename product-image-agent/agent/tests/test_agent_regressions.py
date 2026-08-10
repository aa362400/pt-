#!/usr/bin/env python3
"""Regression tests for intent planning and blackboard events."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.blackboard import SharedBlackboard
from agents.orchestrator import resolve_dispatch_intent


class TestReflectionRegression(unittest.TestCase):
    def test_reflection_write_and_summary(self):
        bb = SharedBlackboard("s-reflect")
        bb.sync_from_execution_report({
            "type": "generate",
            "status": "ok",
            "data": {
                "images": [{"filename": "a.jpg"}],
                "consistency_score": 90,
                "platforms": ["amazon_main"],
            },
        })
        bb.sync_from_execution_report({
            "type": "generate",
            "status": "error",
            "error_type": "executor_exception",
            "error": "boom",
            "data": {"task_type": "generate"},
        })
        success = bb.get_reflection_history(task_type="generate", approved=True)
        failure = bb.get_reflection_history(task_type="generate", approved=False)
        summary = bb.get_reflection_summary(task_type="generate")
        self.assertTrue(success)
        self.assertTrue(failure)
        self.assertTrue(summary)
        self.assertTrue(any("successtext" in item or "risktext" in item for item in summary))

        observer_ctx = __import__("agents.observer", fromlist=["ObserverAgent"]).ObserverAgent()
        observer_ctx.blackboard = bb
        mem = observer_ctx._build_memory_context()
        self.assertIn("reflection_summary", mem)
        self.assertTrue(mem["reflection_summary"])



class TestMemoryDrivenPlanning(unittest.TestCase):
    def test_memory_profile_persists_and_recalls(self):
        bb = SharedBlackboard("s-mem")
        bb.merge_feedback(["scene_01_white_bg.jpg"], ["scene_03_premium.jpg"])
        bb.sync_from_execution_report({
            "type": "generate",
            "data": {
                "images": [{"filename": "scene_01_white_bg.jpg"}],
                "consistency_score": 88,
                "platforms": ["amazon_main"],
            },
        })
        snapshot = bb.to_dict()
        self.assertIn("memory_profile", snapshot)
        self.assertTrue(snapshot["memory_profile"]["user_preferences"]["liked_scenes"])
        self.assertTrue(snapshot["memory_profile"]["success_patterns"])
        self.assertTrue(bb.to_summary()["preference_summary"])



class TestPlanVersioning(unittest.TestCase):
    def test_blackboard_plan_history_and_version(self):
        bb = SharedBlackboard("s-plan")
        bb.sync_from_execution_report({
            "type": "plan",
            "data": {
                "intent": "ask_analyze",
                "goal": "english_textgeneration",
                "risk_level": "high",
                "needs_clarification": True,
                "next_action": "ask_user",
                "plan": [{"step": "analyze", "agent": "analyst", "reason": "need analysis"}],
            },
        })
        self.assertEqual(bb.plan_version, 1)
        self.assertEqual(len(bb.plan_history), 1)
        record = bb.plan_history[0]
        self.assertEqual(record["intent"], "ask_analyze")
        self.assertEqual(record["risk_level"], "high")
        self.assertTrue(record["needs_clarification"])



class TestBlackboardSchema(unittest.TestCase):
    def test_append_event_schema(self):
        bb = SharedBlackboard("s1")
        bb.append_event("observer_s1", "task_finished", {"task_id": "t1", "status": "completed"})
        event = bb.event_log[-1]
        self.assertEqual(event["event_type"], "task_finished")
        self.assertEqual(event["agent_id"], "observer_s1")
        self.assertEqual(event["session_id"], "s1")
        self.assertEqual(event["task_id"], "t1")
        self.assertEqual(event["status"], "completed")


class TestIntentAndChainRegression(unittest.TestCase):
    def test_chain_task_resolution(self):
        intent, agent, remaining = resolve_dispatch_intent({
            "intent": "confirm_generate",
            "task_plan": [
                {"step": "analyze", "agent": "analyst", "reason": "first"},
                {"step": "generate", "agent": "generator", "reason": "second"},
            ],
        })
        self.assertEqual(intent, "ask_analyze")
        self.assertEqual(agent, "analyst")
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["step"], "generate")

    def test_generation_constraints_exist_in_observer(self):
        from agents.observer import ObserverAgent
        observer = ObserverAgent()
        observer.state["session_id"] = "s2"
        observer.state["has_images"] = True
        result = observer._understand_regex("textgenerationtext2textscene，1text", has_images=True)
        self.assertIn(result["intent"], ("ask_analyze", "confirm_generate", "regenerate", "upload"))
        self.assertIsInstance(result.get("extracted", {}), dict)

    def test_replan_marks_plan_and_reason(self):
        from agents.observer import ObserverAgent
        observer = ObserverAgent()
        observer.state["session_id"] = "s3"
        observer.state["has_images"] = True
        out = observer.replan("english_textgeneration", "supervision_failed", has_images=True, last_plan={"plan": []})
        self.assertTrue(out["plan"].get("is_replan"))
        self.assertEqual(out["plan"].get("replan_reason"), "supervision_failed")
        self.assertEqual(out["intent_result"].get("replan_reason"), "supervision_failed")


if __name__ == "__main__":
    unittest.main()
