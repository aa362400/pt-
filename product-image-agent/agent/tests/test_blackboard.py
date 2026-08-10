#!/usr/bin/env python3
"""english_text — SharedBlackboard english_text"""
import json
import os
import sys
import tempfile
import shutil
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.blackboard import SharedBlackboard


class TestSharedBlackboard(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.sid = "testbb01"
        self.output_dir = os.path.join(self.tmp, "outputs", self.sid)
        os.makedirs(self.output_dir, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_create_set_get(self):
        bb = SharedBlackboard(self.sid, output_dir=self.output_dir, base_dir=self.tmp)
        bb.set("profile", {"product_name": "english_text"}, agent_id="analyst")
        self.assertEqual(bb.get("profile")["product_name"], "english_text")
        self.assertEqual(bb.revision, 1)
        self.assertTrue(bb.event_log)

    def test_save_load_roundtrip(self):
        bb = SharedBlackboard(self.sid, output_dir=self.output_dir, base_dir=self.tmp)
        bb.set("scene_plan", [{"scene_id": "scene_01_white_bg"}], agent_id="analyst")
        bb.preferences["brand_name"] = "english_text"
        bb.save()

        loaded = SharedBlackboard.load(self.sid, base_dir=self.tmp, output_dir=self.output_dir)
        self.assertEqual(len(loaded.scene_plan), 1)
        self.assertEqual(loaded.preferences["brand_name"], "english_text")
        self.assertEqual(loaded.revision, bb.revision)

    def test_merge_feedback(self):
        bb = SharedBlackboard(self.sid, output_dir=self.output_dir, base_dir=self.tmp)
        bb.merge_feedback(
            liked=["scene_02_lifestyle.jpg"],
            disliked=["scene_07_atmospheric.jpg"],
            agent_id="observer",
        )
        self.assertIn("scene_02_lifestyle", bb.preferences["liked_scenes"])
        self.assertIn("scene_07_atmospheric", bb.preferences["disliked_scenes"])
        self.assertGreaterEqual(bb.revision, 1)
        events = [e for e in bb.event_log if e["action"] == "merge_feedback"]
        self.assertTrue(events)

    def test_event_log_and_revision_increment(self):
        bb = SharedBlackboard(self.sid, output_dir=self.output_dir, base_dir=self.tmp)
        r0 = bb.revision
        bb.set("product_name", "A", agent_id="observer")
        bb.update({"profile_path": "/tmp/p.json"}, agent_id="executor")
        bb.append_event("qa", "check", {"score": 88})
        self.assertEqual(bb.revision, r0 + 2)
        self.assertGreaterEqual(len(bb.event_log), 3)
        self.assertEqual(bb.event_log[-1]["agent"], "qa")

    def test_to_context_dict_and_summary(self):
        bb = SharedBlackboard(self.sid, output_dir=self.output_dir, base_dir=self.tmp)
        bb.profile = {"product_name": "english_text", "category": "bags"}
        bb.scene_plan = [{"scene_id": "s1"}, {"scene_id": "s2"}]
        bb.consistency_score = 85.5
        ctx = bb.to_context_dict()
        self.assertEqual(ctx["profile_summary"]["product_name"], "english_text")
        self.assertEqual(ctx["scene_count"], 2)
        summary = bb.to_summary()
        self.assertEqual(summary["profile_name"], "english_text")
        self.assertEqual(summary["consistency_score"], 85.5)

    def test_legacy_context_compat(self):
        bb = SharedBlackboard(self.sid, output_dir=self.output_dir, base_dir=self.tmp)
        bb.layout_images = [{"filename": "a.jpg"}]
        bb.preferences["platforms"] = ["taobao_main"]
        legacy = bb.to_legacy_context()
        self.assertEqual(len(legacy["generated_images"]), 1)
        self.assertEqual(legacy["platforms"], ["taobao_main"])


if __name__ == "__main__":
    unittest.main()
