#!/usr/bin/env python3
"""
english_text — ConsistencyAdapter（textconsistencydetection Agent english_text）
"""
import os
import sys
import json
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agents.consistency_adapter import ConsistencyAdapter, create_adapter


# ── textresponse ──

MOCK_SUCCESS_RESPONSE = {
    "status": "passed",
    "score": 92.5,
    "issues": [],
    "recommendations": [
        "textconsistencytext",
        "english_text",
    ],
}

MOCK_FAILURE_RESPONSE = {
    "status": "failed",
    "score": 45.0,
    "issues": [
        "english_text: generationenglish_text > 15%",
        "english_text: english_text +12%",
    ],
    "recommendations": [
        "textgenerationenglish_text",
        "english_textyesnotext",
    ],
}

MOCK_PROFILE = {
    "product_name": "english_text",
    "category": "kitchen_appliance",
    "colors": {"primary": "#FFFFFF", "accents": ["#6C63FF"]},
    "materials": ["plastic", "stainless_steel"],
    "features": ["portable", "usb_charging"],
}


class TestConsistencyAdapter(unittest.TestCase):
    """ConsistencyAdapter english_text"""

    def setUp(self):
        self.adapter = ConsistencyAdapter(
            endpoint="https://mock-agent.example.com",
            api_key="test-key",
            timeout=5,
        )
        self.image_paths = ["/tmp/gen_01.jpg", "/tmp/gen_02.jpg"]
        self.ref_images = ["/tmp/ref_01.jpg"]

    # ── english_text ──

    def test_construct_with_env(self):
        """passedenglish_text"""
        with patch.dict(os.environ, {
            "CONSISTENCY_AGENT_URL": "https://env-agent.example.com",
            "CONSISTENCY_AGENT_API_KEY": "env-key",
            "CONSISTENCY_AGENT_TIMEOUT": "15",
        }, clear=False):
            adapter = ConsistencyAdapter()
            self.assertEqual(adapter.endpoint, "https://env-agent.example.com")
            self.assertEqual(adapter.api_key, "env-key")
            self.assertEqual(adapter.timeout, 15)

    def test_construct_with_env_defaults(self):
        """english_textconfigurationenglish_text"""
        with patch.dict(os.environ, {}, clear=True):
            adapter = ConsistencyAdapter()
            self.assertEqual(adapter.endpoint, "")
            self.assertEqual(adapter.timeout, 30)

    def test_create_adapter_factory(self):
        """english_text"""
        adapter = create_adapter(endpoint="https://test.com", api_key="k", timeout=10)
        self.assertIsInstance(adapter, ConsistencyAdapter)
        self.assertEqual(adapter.endpoint, "https://test.com")

    # ── endpoint textconfiguration ──

    def test_check_disabled_when_no_endpoint(self):
        """textconfiguration endpoint english_text skipped"""
        adapter = ConsistencyAdapter(endpoint="")
        result = adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["score"], -1.0)
        self.assertIn("skipped_reason", result)
        self.assertEqual(result["source"], "external_consistency_agent")

    # ── successtext ──

    @patch("requests.post")
    def test_check_success(self, mock_post):
        """successenglish_text passed response"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_SUCCESS_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "passed")
        self.assertAlmostEqual(result["score"], 92.5)
        self.assertEqual(len(result["issues"]), 0)
        self.assertEqual(len(result["recommendations"]), 2)
        self.assertEqual(result["source"], "external_consistency_agent")

        # textrequestenglish_text
        call_kwargs = mock_post.call_args.kwargs
        body = call_kwargs["json"]
        self.assertIn("images", body)
        self.assertIn("profile", body)
        self.assertIn("options", body)
        self.assertEqual(body["images"]["generated"], self.image_paths)
        self.assertEqual(body["images"]["references"], self.ref_images)

    @patch("requests.post")
    def test_check_failure(self, mock_post):
        """text Agent text failure english_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_FAILURE_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "failed")
        self.assertAlmostEqual(result["score"], 45.0)
        self.assertGreater(len(result["issues"]), 0)

    # ── text ──

    @patch("requests.post", side_effect=__import__("requests").Timeout("timeout"))
    def test_check_timeout(self, mock_post):
        """english_text error english_text"""
        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["score"], 0.0)
        self.assertTrue(any("text" in issue for issue in result["issues"]))

    # ── connectionfailed ──

    @patch("requests.post", side_effect=__import__("requests").ConnectionError("connection refused"))
    def test_check_connection_error(self, mock_post):
        """connectionfailedenglish_text error english_text"""
        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["score"], 0.0)
        self.assertTrue(any("connection" in issue for issue in result["issues"]))

    # ── text JSON response ──

    @patch("requests.post")
    def test_invalid_json_response(self, mock_post):
        """text JSON english_text error"""
        mock_resp = Mock()
        mock_resp.text = "not-json-at-all{{{"
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["score"], 0.0)

    # ── textfieldsresponse ──

    @patch("requests.post")
    def test_missing_fields_response(self, mock_post):
        """english_textfieldsenglish_text error"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({"status": "passed"})  # text score, issues
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")

    # ── text status ──

    @patch("requests.post")
    def test_invalid_status_response(self, mock_post):
        """text status english_text error"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({"status": "unknown", "score": 50, "issues": []})
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")

    # ── text profile ──

    @patch("requests.post")
    def test_empty_profile(self, mock_post):
        """text profile english_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_SUCCESS_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, {}, self.ref_images)
        self.assertEqual(result["status"], "passed")

    # ── textimagetext ──

    @patch("requests.post")
    def test_empty_image_paths(self, mock_post):
        """text image_paths english_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_SUCCESS_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check([], MOCK_PROFILE, [])
        self.assertEqual(result["status"], "passed")

    # ── textdetection ──

    @patch("requests.post")
    def test_check_batch(self, mock_post):
        """textdetectionenglish_text"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_SUCCESS_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        batches = [
            {"image_paths": ["a.jpg"], "profile": MOCK_PROFILE, "ref_images": ["r.jpg"]},
            {"image_paths": ["b.jpg"], "profile": MOCK_PROFILE, "ref_images": ["r.jpg"]},
        ]
        results = self.adapter.check_batch(batches)

        self.assertEqual(len(results), 2)
        for r in results:
            self.assertEqual(r["status"], "passed")

    # ── textdetectiontextfailedenglish_text ──

    @patch("requests.post", side_effect=RuntimeError("unexpected"))
    def test_check_batch_partial_failure(self, mock_post):
        """textdetectionenglish_text error english_text"""
        batches = [
            {"image_paths": ["a.jpg"], "profile": MOCK_PROFILE, "ref_images": ["r.jpg"]},
        ]
        results = self.adapter.check_batch(batches)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "error")


if __name__ == "__main__":
    unittest.main()
