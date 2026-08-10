#!/usr/bin/env python3
"""
单元测试 — ConsistencyAdapter（外部一致性检测 Agent 适配器）
"""
import os
import sys
import json
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agents.consistency_adapter import ConsistencyAdapter, create_adapter


# ── 模拟响应 ──

MOCK_SUCCESS_RESPONSE = {
    "status": "passed",
    "score": 92.5,
    "issues": [],
    "recommendations": [
        "整体一致性良好",
        "建议检查右侧阴影区域",
    ],
}

MOCK_FAILURE_RESPONSE = {
    "status": "failed",
    "score": 45.0,
    "issues": [
        "产品外形不匹配: 生成图杯体弧度与参考图偏差 > 15%",
        "颜色偏差: 主体色相偏移 +12%",
    ],
    "recommendations": [
        "调整生成角度使其与参考图一致",
        "检查产品主体锁定是否开启",
    ],
}

MOCK_PROFILE = {
    "product_name": "便携式搅拌机",
    "category": "kitchen_appliance",
    "colors": {"primary": "#FFFFFF", "accents": ["#6C63FF"]},
    "materials": ["plastic", "stainless_steel"],
    "features": ["portable", "usb_charging"],
}


class TestConsistencyAdapter(unittest.TestCase):
    """ConsistencyAdapter 单元测试"""

    def setUp(self):
        self.adapter = ConsistencyAdapter(
            endpoint="https://mock-agent.example.com",
            api_key="test-key",
            timeout=5,
        )
        self.image_paths = ["/tmp/gen_01.jpg", "/tmp/gen_02.jpg"]
        self.ref_images = ["/tmp/ref_01.jpg"]

    # ── 基础功能 ──

    def test_construct_with_env(self):
        """通过环境变量构造应正常工作"""
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
        """环境变量未配置时使用默认值"""
        with patch.dict(os.environ, {}, clear=True):
            adapter = ConsistencyAdapter()
            self.assertEqual(adapter.endpoint, "")
            self.assertEqual(adapter.timeout, 30)

    def test_create_adapter_factory(self):
        """工厂函数应返回正确实例"""
        adapter = create_adapter(endpoint="https://test.com", api_key="k", timeout=10)
        self.assertIsInstance(adapter, ConsistencyAdapter)
        self.assertEqual(adapter.endpoint, "https://test.com")

    # ── endpoint 未配置 ──

    def test_check_disabled_when_no_endpoint(self):
        """未配置 endpoint 时返回 skipped"""
        adapter = ConsistencyAdapter(endpoint="")
        result = adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["score"], -1.0)
        self.assertIn("skipped_reason", result)
        self.assertEqual(result["source"], "external_consistency_agent")

    # ── 成功调用 ──

    @patch("requests.post")
    def test_check_success(self, mock_post):
        """成功调用应返回标准化 passed 响应"""
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

        # 验证请求体结构
        call_kwargs = mock_post.call_args.kwargs
        body = call_kwargs["json"]
        self.assertIn("images", body)
        self.assertIn("profile", body)
        self.assertIn("options", body)
        self.assertEqual(body["images"]["generated"], self.image_paths)
        self.assertEqual(body["images"]["references"], self.ref_images)

    @patch("requests.post")
    def test_check_failure(self, mock_post):
        """外部 Agent 返回 failure 应正确传递"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_FAILURE_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "failed")
        self.assertAlmostEqual(result["score"], 45.0)
        self.assertGreater(len(result["issues"]), 0)

    # ── 超时 ──

    @patch("requests.post", side_effect=__import__("requests").Timeout("timeout"))
    def test_check_timeout(self, mock_post):
        """超时应返回 error 不抛异常"""
        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["score"], 0.0)
        self.assertTrue(any("超时" in issue for issue in result["issues"]))

    # ── 连接失败 ──

    @patch("requests.post", side_effect=__import__("requests").ConnectionError("connection refused"))
    def test_check_connection_error(self, mock_post):
        """连接失败应返回 error 不抛异常"""
        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["score"], 0.0)
        self.assertTrue(any("连接" in issue for issue in result["issues"]))

    # ── 非法 JSON 响应 ──

    @patch("requests.post")
    def test_invalid_json_response(self, mock_post):
        """非法 JSON 应返回 error"""
        mock_resp = Mock()
        mock_resp.text = "not-json-at-all{{{"
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["score"], 0.0)

    # ── 缺少字段响应 ──

    @patch("requests.post")
    def test_missing_fields_response(self, mock_post):
        """缺少必需字段时应返回 error"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({"status": "passed"})  # 缺 score, issues
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")

    # ── 非法 status ──

    @patch("requests.post")
    def test_invalid_status_response(self, mock_post):
        """非法 status 值应返回 error"""
        mock_resp = Mock()
        mock_resp.text = json.dumps({"status": "unknown", "score": 50, "issues": []})
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, MOCK_PROFILE, self.ref_images)

        self.assertEqual(result["status"], "error")

    # ── 空 profile ──

    @patch("requests.post")
    def test_empty_profile(self, mock_post):
        """空的 profile 不应崩溃"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_SUCCESS_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check(self.image_paths, {}, self.ref_images)
        self.assertEqual(result["status"], "passed")

    # ── 空图片列表 ──

    @patch("requests.post")
    def test_empty_image_paths(self, mock_post):
        """空的 image_paths 不应崩溃"""
        mock_resp = Mock()
        mock_resp.text = json.dumps(MOCK_SUCCESS_RESPONSE)
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        result = self.adapter.check([], MOCK_PROFILE, [])
        self.assertEqual(result["status"], "passed")

    # ── 批量检测 ──

    @patch("requests.post")
    def test_check_batch(self, mock_post):
        """批量检测应返回等长结果列表"""
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

    # ── 批量检测单批失败不应影响他批 ──

    @patch("requests.post", side_effect=RuntimeError("unexpected"))
    def test_check_batch_partial_failure(self, mock_post):
        """批量检测中单批异常应返回 error 不影响其他批次"""
        batches = [
            {"image_paths": ["a.jpg"], "profile": MOCK_PROFILE, "ref_images": ["r.jpg"]},
        ]
        results = self.adapter.check_batch(batches)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "error")


if __name__ == "__main__":
    unittest.main()
