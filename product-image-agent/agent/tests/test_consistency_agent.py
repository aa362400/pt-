#!/usr/bin/env python3
"""
english_text — ConsistencyGuardAgent（english_textconsistencydetectiontext Agent）
"""
import os
import sys
import json
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agents.consistency_agent import ConsistencyGuardAgent
from agents.consistency_adapter import ConsistencyAdapter


MOCK_PROFILE = {
    "product_name": "english_text",
    "category": "kitchen_appliance",
    "colors": {"primary": "#FFFFFF", "accents": ["#6C63FF"]},
}


def _make_task(task_type="enhanced_qa", **extra_params):
    return {
        "task_id": "test_task_001",
        "type": task_type,
        "params": {
            "image_paths": ["/tmp/gen_01.jpg", "/tmp/gen_02.jpg"],
            "profile": MOCK_PROFILE,
            "reference_images": ["/tmp/ref_01.jpg"],
            "session_id": "test_session",
            "product_name": "english_text",
            **extra_params,
        },
        "trace_id": "trace_test_001",
    }


class TestConsistencyGuardAgent(unittest.TestCase):
    """ConsistencyGuardAgent english_text"""

    def setUp(self):
        self.adapter = ConsistencyAdapter(
            endpoint="https://mock-agent.example.com",
            api_key="test-key",
            timeout=5,
        )
        self.agent = ConsistencyGuardAgent(
            agent_id="consistency_test",
            adapter=self.adapter,
        )

    # ── english_text ──

    def test_construct(self):
        """english_text"""
        agent = ConsistencyGuardAgent()
        self.assertEqual(agent.AGENT_LABEL, "ConsistencyGuard")
        self.assertEqual(agent.status, "idle")

    def test_receive_task(self):
        """receive_task english_textstatus"""
        msg = self.agent.receive_task(_make_task())
        self.assertEqual(self.agent.status, "busy")
        self.assertIn("ConsistencyGuard", msg)

    # ── adapter textconfiguration ──

    def test_skipped_when_no_endpoint(self):
        """adapter textconfigurationenglish_text status=success text external_consistency=skipped"""
        agent = ConsistencyGuardAgent(adapter=ConsistencyAdapter(endpoint=""))
        agent.receive_task(_make_task())
        report = agent.execute(_make_task())
        self.assertEqual(report["status"], "success")
        data = report.get("data", {})
        self.assertEqual(data.get("external_consistency_status"), "skipped")
        self.assertEqual(data.get("external_consistency_score"), -1.0)

    # ── successtext ──

    @patch("requests.post")
    def test_execute_success(self, mock_post):
        """successdetectionenglish_text external fields"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({
            "status": "passed",
            "score": 95.0,
            "issues": [],
            "recommendations": ["textconsistencytext"],
        })
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        self.agent.receive_task(_make_task())
        report = self.agent.execute(_make_task())

        self.assertEqual(report["status"], "success")
        data = report.get("data", {})
        self.assertEqual(data.get("external_consistency_status"), "passed")
        self.assertAlmostEqual(data.get("external_consistency_score"), 95.0)
        self.assertIsNotNone(data.get("external_consistency_report"))
        self.assertIn("external_consistency_report", data)

    # ── text Agent textfailed ──

    @patch("requests.post")
    def test_execute_failure(self, mock_post):
        """text Agent text failure english_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({
            "status": "failed",
            "score": 35.0,
            "issues": ["english_text"],
            "recommendations": ["textgenerationtext"],
        })
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        report = self.agent.execute(_make_task())
        self.assertEqual(report["status"], "success")
        data = report.get("data", {})
        self.assertEqual(data.get("external_consistency_status"), "failed")
        self.assertAlmostEqual(data.get("external_consistency_score"), 35.0)

    # ── text ──

    @patch("requests.post", side_effect=__import__("requests").Timeout("timeout"))
    def test_execute_timeout(self, mock_post):
        """english_text error"""
        report = self.agent.execute(_make_task())
        self.assertEqual(report["status"], "error")

    # ── connectionfailed ──

    @patch("requests.post", side_effect=__import__("requests").ConnectionError("refused"))
    def test_execute_connection_error(self, mock_post):
        """connectionfailedenglish_text error"""
        report = self.agent.execute(_make_task())
        self.assertEqual(report["status"], "error")

    # ── text ──

    def test_execute_cancelled(self):
        """english_text cancelled"""
        def cancel():
            return True
        report = self.agent.execute(_make_task(), cancel_check=cancel)
        self.assertEqual(report["status"], "success")
        self.assertTrue(report.get("data", {}).get("cancelled"))

    # ── self_check ──

    def test_self_check_success(self):
        """self_check passed textpassed"""
        report = {
            "status": "success",
            "data": {
                "external_consistency_status": "passed",
                "external_consistency_score": 95.0,
                "external_consistency_issues": [],
            },
        }
        check = self.agent.self_check(report)
        self.assertTrue(check["passed"])

    def test_self_check_skipped(self):
        """skipped english_textpassed"""
        report = {
            "status": "success",
            "data": {
                "external_consistency_status": "skipped",
                "external_consistency_score": -1.0,
                "external_consistency_issues": [],
            },
        }
        check = self.agent.self_check(report)
        self.assertTrue(check["passed"])

    def test_self_check_failed(self):
        """failed textyes issues"""
        report = {
            "status": "success",
            "data": {
                "external_consistency_status": "failed",
                "external_consistency_score": 35.0,
                "external_consistency_issues": ["english_text"],
            },
        }
        check = self.agent.self_check(report)
        self.assertFalse(check["passed"])
        self.assertGreater(len(check["issues"]), 0)

    def test_self_check_error(self):
        """error textyes issues"""
        report = {
            "status": "error",
            "error": "connectionfailed",
            "data": {},
        }
        check = self.agent.self_check(report)
        self.assertFalse(check["passed"])

    # ── textimage/text profile ──

    @patch("requests.post")
    def test_empty_images(self, mock_post):
        """textimageenglish_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({
            "status": "passed", "score": 100.0,
            "issues": [], "recommendations": [],
        })
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        task = _make_task(image_paths=[], profile={}, reference_images=[])
        report = self.agent.execute(task)
        self.assertEqual(report["status"], "success")

    # ── text adapter english_text ──

    @patch("requests.post")
    def test_integration_with_adapter(self, mock_post):
        """agent → adapter english_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({
            "status": "passed",
            "score": 88.0,
            "issues": [],
            "recommendations": ["text"],
        })
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        adapter = ConsistencyAdapter(endpoint="https://test.com", api_key="k", timeout=5)
        agent = ConsistencyGuardAgent(adapter=adapter)
        report = agent.execute(_make_task())

        self.assertEqual(report["status"], "success")
        self.assertAlmostEqual(
            report["data"]["external_consistency_score"], 88.0,
        )


if __name__ == "__main__":
    unittest.main()
