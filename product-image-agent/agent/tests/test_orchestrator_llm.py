#!/usr/bin/env python3
"""LLM 编排器测试 — mock Gemini、regex 回退、JSON 解析"""
import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.observer import ObserverAgent
from agents.orchestrator import (
    OrchestratorBrain,
    format_task_plan_chip,
    parse_llm_orchestrator_response,
    resolve_dispatch_intent,
)


MOCK_LLM_JSON = {
    "intent": "ask_analyze",
    "confidence": 0.92,
    "extracted": {
        "product_name": "手提包",
        "platforms": ["taobao_main", "xiaohongshu"],
        "user_goal_summary": "分析包并生成淘宝小红书图",
    },
    "task_plan": [
        {"step": "analyze", "agent": "analyst", "reason": "先分析产品特征"},
        {"step": "generate", "agent": "generator", "reason": "再生成多平台图"},
    ],
    "reply_hint": "确认收到，先开始分析",
}


class TestParseLlmResponse(unittest.TestCase):

    def test_parse_plain_json(self):
        raw = json.dumps(MOCK_LLM_JSON, ensure_ascii=False)
        parsed = parse_llm_orchestrator_response(raw)
        self.assertEqual(parsed["intent"], "ask_analyze")
        self.assertEqual(len(parsed["task_plan"]), 2)

    def test_parse_markdown_fenced_json(self):
        raw = "```json\n" + json.dumps(MOCK_LLM_JSON, ensure_ascii=False) + "\n```"
        parsed = parse_llm_orchestrator_response(raw)
        self.assertEqual(parsed["intent"], "ask_analyze")

    def test_format_task_plan_chip(self):
        chip = format_task_plan_chip(MOCK_LLM_JSON["task_plan"])
        self.assertIn("LLM 规划", chip)
        self.assertIn("analyze", chip)
        self.assertIn("analyst", chip)


class TestResolveDispatchIntent(unittest.TestCase):

    def test_first_step_from_plan(self):
        intent, agent, remaining = resolve_dispatch_intent({
            "intent": "confirm_generate",
            "task_plan": MOCK_LLM_JSON["task_plan"],
        })
        self.assertEqual(intent, "ask_analyze")
        self.assertEqual(agent, "analyst")
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["step"], "generate")


class TestOrchestratorBrain(unittest.TestCase):

    def setUp(self):
        self._saved_env = {
            k: os.environ.pop(k, None)
            for k in ("OPENAI_API_KEY", "ORCHESTRATOR_LLM_PROVIDER", "GEMINI_API_KEY")
        }
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "gemini"
        self.brain = OrchestratorBrain(api_key="test-key", timeout=3)

    def tearDown(self):
        for k in ("OPENAI_API_KEY", "ORCHESTRATOR_LLM_PROVIDER", "GEMINI_API_KEY"):
            os.environ.pop(k, None)
        for k, v in self._saved_env.items():
            if v is not None:
                os.environ[k] = v

    def test_no_api_key_returns_none(self):
        brain = OrchestratorBrain(api_key="")
        result = brain.understand_with_llm("你好", {}, False)
        self.assertIsNone(result)

    def test_llm_disabled_env_blocks_env_key_but_not_explicit(self):
        """全局禁用开关只影响环境变量 Key，显式注入 api_key 不受影响。"""
        os.environ["OPENAI_API_KEY"] = "env-key"
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "openai"
        try:
            env_brain = OrchestratorBrain()
            self.assertFalse(env_brain._has_llm_credentials())  # conftest 已设禁用
            explicit = OrchestratorBrain(api_key="explicit-key")
            self.assertTrue(explicit._has_llm_credentials())
        finally:
            os.environ.pop("OPENAI_API_KEY", None)
            os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "gemini"

    @patch("requests.post")
    def test_compose_reply_natural_language(self, mock_post):
        """compose_reply：LLM 把模板改写为自然回复。"""
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "openai"
        brain = OrchestratorBrain(api_key="test-key", timeout=3)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "收到！这款包很有质感，我先帮你分析特征，再出淘宝图。"}}],
        }
        mock_post.return_value = mock_resp

        text = brain.compose_reply(
            "帮我分析这个包", {"intent": "ask_analyze", "reply_hint": "确认收到"},
            {"has_images": True}, template_reply="🔍 好的，我马上开始分析！")
        self.assertIn("分析", text)
        mock_post.assert_called_once()
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "gemini"

    @patch("requests.post")
    def test_compose_reply_falls_back_on_error(self, mock_post):
        """compose_reply：LLM 失败返回 None，调用方保留模板。"""
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "openai"
        brain = OrchestratorBrain(api_key="test-key", timeout=3)
        mock_post.side_effect = RuntimeError("boom")
        self.assertIsNone(brain.compose_reply("你好", {"intent": "greet"}, {}))
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "gemini"

    def test_normalize_result_carries_llm_reply(self):
        """理解阶段一并生成的 reply 透传为 llm_reply（零额外延迟回复）。"""
        raw = dict(MOCK_LLM_JSON)
        raw["reply"] = "收到！我先分析这款手提包～"
        result = self.brain._normalize_result(raw, {"has_images": True}, True)
        self.assertEqual(result["llm_reply"], "收到！我先分析这款手提包～")

    def test_normalize_result_drops_reply_when_guard_rewrites_intent(self):
        """状态守卫改写意图（如无图不能分析）时丢弃 LLM 回复，防止承诺做不到的事。"""
        raw = dict(MOCK_LLM_JSON)
        raw["reply"] = "马上开始分析！"
        result = self.brain._normalize_result(raw, {"has_images": False}, False)
        self.assertEqual(result["intent"], "need_image_first")
        self.assertEqual(result["llm_reply"], "")

    def test_decide_reply_prefers_inline_llm_reply(self):
        """decide_reply 优先用 intent 里自带的 llm_reply，不再二次请求。"""
        observer = ObserverAgent()
        intent = {
            "intent": "ask_analyze", "extracted": {}, "llm_mode": True,
            "raw_message": "帮我分析", "llm_reply": "好嘞，马上看你的产品！",
        }
        with patch.object(observer.orchestrator, "compose_reply") as mock_compose:
            result = observer.decide_reply(intent)
        self.assertTrue(result["reply"].startswith("好嘞"))
        mock_compose.assert_not_called()

    @patch("requests.post")
    def test_max_think_mode_deepens_openai_call(self, mock_post):
        """MAX 思考模式：更深的系统提示 + 双倍思考预算 + 双倍超时。"""
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "openai"
        os.environ["OPENAI_API_KEY"] = "test-key"
        try:
            brain = OrchestratorBrain(api_key="test-key", timeout=10)
            mock_resp = MagicMock()
            mock_resp.raise_for_status = MagicMock()
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": json.dumps(MOCK_LLM_JSON, ensure_ascii=False)}}],
            }
            mock_post.return_value = mock_resp

            brain._call_openai("帮我规划", {"think_mode": True, "has_images": True}, True)
            kwargs = mock_post.call_args.kwargs
            payload = kwargs["json"]
            self.assertIn("MAX 思考模式", payload["messages"][0]["content"])
            self.assertEqual(payload["max_tokens"], 4096)
            self.assertEqual(kwargs["timeout"], 20)

            mock_post.reset_mock()
            brain._call_openai("帮我规划", {"think_mode": False, "has_images": True}, True)
            payload = mock_post.call_args.kwargs["json"]
            self.assertNotIn("MAX 思考模式", payload["messages"][0]["content"])
            self.assertEqual(payload["max_tokens"], 2048)
        finally:
            os.environ.pop("OPENAI_API_KEY", None)
            os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "gemini"

    def test_resolve_max_model_falls_back(self):
        from agents.orchestrator import resolve_max_model
        os.environ.pop("LLM_MODEL_MAX", None)
        os.environ["LLM_MODEL"] = "base-model"
        try:
            self.assertEqual(resolve_max_model(), "base-model")
            os.environ["LLM_MODEL_MAX"] = "big-model"
            self.assertEqual(resolve_max_model(), "big-model")
        finally:
            os.environ.pop("LLM_MODEL_MAX", None)
            os.environ.pop("LLM_MODEL", None)

    def test_decide_reply_uses_composed_text(self):
        """observer.decide_reply：llm_mode 下采用 LLM 自然回复，失败回退模板。"""
        observer = ObserverAgent()
        intent = {
            "intent": "ask_analyze", "extracted": {}, "llm_mode": True,
            "raw_message": "帮我分析", "reply_hint": "",
        }
        with patch.object(observer.orchestrator, "compose_reply",
                          return_value="好嘞，这就看你的产品～"):
            result = observer.decide_reply(intent)
        self.assertTrue(result["reply"].startswith("好嘞"))

        with patch.object(observer.orchestrator, "compose_reply", return_value=None):
            result = observer.decide_reply(intent)
        self.assertIn("分析", result["reply"])  # 回退到模板文案

    @patch("requests.post")
    def test_mock_llm_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "candidates": [{
                "content": {
                    "parts": [{"text": json.dumps(MOCK_LLM_JSON, ensure_ascii=False)}],
                },
            }],
        }
        mock_post.return_value = mock_resp

        state = {"has_images": True, "image_count": 1, "profile_ready": False}
        result = self.brain.understand_with_llm(
            "帮我分析这款包，然后生成淘宝和小红书用的图",
            state,
            has_images=True,
        )
        self.assertIsNotNone(result)
        self.assertTrue(result.get("llm_mode"))
        self.assertEqual(result["intent"], "ask_analyze")
        self.assertEqual(len(result["task_plan"]), 2)
        mock_post.assert_called_once()

    @patch("requests.post")
    def test_llm_timeout_fallback_via_observer(self, mock_post):
        import requests
        mock_post.side_effect = requests.Timeout("timeout")

        observer = ObserverAgent()
        observer.orchestrator = OrchestratorBrain(api_key="test-key", timeout=3)
        observer.state["session_id"] = "t01"
        observer.state["has_images"] = True

        intent = observer.understand("分析一下", has_images=False)
        self.assertFalse(intent.get("llm_mode", False))
        self.assertEqual(intent["intent"], "ask_analyze")
        self.assertEqual(observer._last_understand_mode, "regex")

    @patch("requests.post")
    def test_observer_llm_dispatch_with_target_agent(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "candidates": [{
                "content": {
                    "parts": [{"text": json.dumps(MOCK_LLM_JSON, ensure_ascii=False)}],
                },
            }],
        }
        mock_post.return_value = mock_resp

        observer = ObserverAgent()
        observer.orchestrator = OrchestratorBrain(api_key="test-key")
        observer.state["session_id"] = "t02"
        observer.state["has_images"] = True
        observer.state["image_paths"] = ["/tmp/a.jpg"]
        observer.state["output_dir"] = "/tmp/out"

        intent = observer.understand("帮我分析然后生成", has_images=True)
        self.assertTrue(intent.get("llm_mode"))
        self.assertEqual(intent["dispatch_intent"], "ask_analyze")
        self.assertEqual(intent["target_agent"], "analyst")

        task = observer.dispatch(intent)
        self.assertIsNotNone(task)
        self.assertEqual(task["type"], "analyze")
        self.assertEqual(task["target_agent"], "analyst")
        self.assertEqual(len(observer.state["pending_task_plan"]), 1)

        chained = observer.dispatch_chained_task()
        self.assertIsNotNone(chained)
        self.assertEqual(chained["type"], "generate")
        self.assertEqual(chained["target_agent"], "generator")


class TestObserverLlmIntegration(unittest.TestCase):

    def setUp(self):
        self._saved_openai = os.environ.pop("OPENAI_API_KEY", None)
        self._saved_provider = os.environ.pop("ORCHESTRATOR_LLM_PROVIDER", None)
        os.environ["ORCHESTRATOR_LLM_PROVIDER"] = "gemini"

    def tearDown(self):
        os.environ.pop("ORCHESTRATOR_LLM_PROVIDER", None)
        if self._saved_provider is not None:
            os.environ["ORCHESTRATOR_LLM_PROVIDER"] = self._saved_provider
        if self._saved_openai is not None:
            os.environ["OPENAI_API_KEY"] = self._saved_openai

    def test_regex_fallback_without_key(self):
        env_key = os.environ.pop("GEMINI_API_KEY", None)
        try:
            observer = ObserverAgent()
            observer.state["session_id"] = "rx01"
            observer.state["has_images"] = True
            intent = observer.understand("生成", has_images=False)
            self.assertFalse(intent.get("llm_mode", False))
            self.assertEqual(observer._last_understand_mode, "regex")
        finally:
            if env_key is not None:
                os.environ["GEMINI_API_KEY"] = env_key

    @patch("requests.post")
    def test_process_message_shows_plan_chip(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "candidates": [{
                "content": {
                    "parts": [{"text": json.dumps(MOCK_LLM_JSON, ensure_ascii=False)}],
                },
            }],
        }
        mock_post.return_value = mock_resp

        observer = ObserverAgent()
        observer.orchestrator = OrchestratorBrain(api_key="k")
        observer.state["session_id"] = "chip1"
        observer.state["has_images"] = True
        observer.state["image_paths"] = ["/tmp/x.jpg"]
        observer.state["output_dir"] = "/tmp/out"

        out = observer.process_message("分析并生成淘宝图", has_images=True)
        self.assertIn("LLM 规划", out["reply"])
        self.assertEqual(out["understand_mode"], "llm")


if __name__ == "__main__":
    unittest.main()
