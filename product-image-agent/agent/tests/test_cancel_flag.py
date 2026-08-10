#!/usr/bin/env python3
"""textgeneration — cancel_check text batch_generate"""
import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from generate_batch import batch_generate, generate_with_retry


class TestCancelCheck(unittest.TestCase):
    """mock cancel_check english_textgeneration"""

    def setUp(self):
        self.calls = {"n": 0}

    def _cancel_after_one(self):
        self.calls["n"] += 1
        return self.calls["n"] > 1

    @patch("generate_batch.generate_with_retry")
    def test_batch_generate_stops_early_on_cancel(self, mock_gen):
        mock_gen.side_effect = [
            {
                "scene_id": "scene_01_white_bg",
                "scene_name": "text",
                "success": True,
                "output_path": "/tmp/scene_01_white_bg.jpg",
                "engine": "gemini",
            },
            {
                "scene_id": "scene_02_lifestyle",
                "scene_name": "text",
                "success": False,
                "cancelled": True,
                "error": "cancelled",
                "engine": "gemini",
            },
        ]

        scene_plan = [
            {"scene_id": "scene_01_white_bg"},
            {"scene_id": "scene_02_lifestyle"},
            {"scene_id": "scene_03_premium"},
        ]
        product = {"product_name": "Test", "category": "general"}

        with patch("generate_batch.load_scene_template") as mock_load:
            mock_load.return_value = {
                "scene_id": "scene_01_white_bg",
                "scene_name_cn": "text",
            }
            with patch("generate_batch.os.path.exists", return_value=True):
                with tempfile.TemporaryDirectory() as output_dir:
                    with patch("builtins.print"):
                        results = batch_generate(
                            product_profile=product,
                            reference_images=["/tmp/ref.jpg"],
                            scene_plan=scene_plan,
                            scene_dir="/tmp/scenes",
                            output_dir=output_dir,
                            engine="gemini",
                            api_key="test-key",
                            parallel=False,
                            cancel_check=self._cancel_after_one,
                        )

        self.assertGreaterEqual(mock_gen.call_count, 1)
        self.assertLessEqual(mock_gen.call_count, 2)
        self.assertTrue(any(r.get("success") for r in results))

    def test_generate_with_retry_respects_cancel_before_start(self):
        cancelled = {"v": True}
        result = generate_with_retry(
            scene_template={"scene_id": "s1", "scene_name_cn": "text"},
            product={"product_name": "P"},
            reference_images=[],
            output_file="/tmp/s1.jpg",
            engine="gemini",
            api_key="key",
            cancel_check=lambda: cancelled["v"],
        )
        self.assertTrue(result.get("cancelled"))
        self.assertFalse(result.get("success"))


class TestExecutorCancel(unittest.TestCase):
    """Executor text cancel_check text True english_text cancelled"""

    @patch.object(__import__("agents.executor", fromlist=["ExecutorAgent"]).ExecutorAgent, "_run_sub_agent")
    def test_generate_pipeline_cancelled_before_start(self, mock_run):
        from agents.executor import ExecutorAgent

        executor = ExecutorAgent("cancel_test")
        report = executor.execute(
            {
                "task_id": "t1",
                "type": "generate",
                "params": {
                    "profile_path": "/tmp/p.json",
                    "plan_path": "/tmp/plan.json",
                    "session_id": "s1",
                    "output_dir": "/tmp/out",
                },
            },
            cancel_check=lambda: True,
        )
        self.assertEqual(report["status"], "cancelled")
        mock_run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
