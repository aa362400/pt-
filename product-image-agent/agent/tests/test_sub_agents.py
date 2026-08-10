#!/usr/bin/env python3
"""子智能体架构测试 — import、实例化、mock 执行流"""
import os
import sys
import unittest
from unittest.mock import patch, MagicMock, mock_open

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents import (
    ObserverAgent,
    ExecutorAgent,
    AnalystAgent,
    GeneratorAgent,
    QAAgent,
    LayoutAgent,
    AgentToolkit,
    BaseSubAgent,
)


class TestSubAgentImports(unittest.TestCase):
    """所有子智能体可正常导入"""

    def test_import_all_agents(self):
        self.assertTrue(issubclass(AnalystAgent, BaseSubAgent))
        self.assertTrue(issubclass(GeneratorAgent, BaseSubAgent))
        self.assertTrue(issubclass(QAAgent, BaseSubAgent))
        self.assertTrue(issubclass(LayoutAgent, BaseSubAgent))

    def test_init_exports(self):
        from agents import __all__
        expected = {
            "ObserverAgent", "ExecutorAgent",
            "AnalystAgent", "GeneratorAgent", "QAAgent", "LayoutAgent",
            "AgentToolkit", "BaseSubAgent",
        }
        self.assertTrue(expected.issubset(set(__all__)))


class TestSubAgentInstantiation(unittest.TestCase):
    """子智能体可正常实例化"""

    def setUp(self):
        self.toolkit = AgentToolkit(
            script_dir=os.path.join(os.path.dirname(__file__), "..", "scripts"),
            template_dir=os.path.join(os.path.dirname(__file__), "..", "templates", "scenes"),
            output_base=os.path.join(os.path.dirname(__file__), "..", "outputs"),
        )

    def test_analyst_instantiate(self):
        agent = AnalystAgent("test_analyst", self.toolkit)
        self.assertEqual(agent.agent_id, "test_analyst")
        self.assertIn("analyze_product", agent.tools)
        self.assertIn("match_scenes", agent.tools)

    def test_generator_instantiate(self):
        agent = GeneratorAgent("test_generator", self.toolkit)
        self.assertIn("generate_images", agent.tools)

    def test_qa_instantiate(self):
        agent = QAAgent("test_qa", self.toolkit)
        self.assertIn("check_consistency", agent.tools)
        self.assertIn("score_emotion", agent.tools)

    def test_layout_instantiate(self):
        agent = LayoutAgent("test_layout", self.toolkit)
        self.assertIn("post_process", agent.tools)
        self.assertIn("layout", agent.tools)
        self.assertIn("platform_adapt", agent.tools)

    def test_executor_has_sub_agents(self):
        executor = ExecutorAgent("test_executor")
        subs = executor.sub_agents
        self.assertIn("analyst", subs)
        self.assertIn("generator", subs)
        self.assertIn("qa", subs)
        self.assertIn("layout", subs)
        statuses = executor.get_agent_statuses()
        self.assertEqual(statuses["analyst"], "idle")


class TestSubAgentReceiveTask(unittest.TestCase):
    """receive_task 接口"""

    def test_analyst_receive_task(self):
        agent = AnalystAgent()
        msg = agent.receive_task({"task_id": "t1", "type": "analyze"})
        self.assertIn("Analyst", msg)
        self.assertEqual(agent.status, "busy")


class TestAnalystMockExecute(unittest.TestCase):
    """Analyst mock 执行流"""

    @patch.object(AgentToolkit, "analyze_product")
    @patch.object(AgentToolkit, "match_scenes")
    def test_analyst_execute_success(self, mock_match, mock_analyze):
        mock_analyze.return_value = {
            "profile": {"product_name": "测试包", "category": "bag"},
            "profile_path": "/tmp/profile.json",
        }
        mock_match.return_value = {
            "scene_plan": [{"scene_id": "s1", "scene_name": "白底"}],
            "plan_path": "/tmp/plan.json",
        }

        agent = AnalystAgent()
        task = {
            "task_id": "t_analyze",
            "type": "analyze",
            "params": {
                "image_paths": ["/tmp/img.jpg"],
                "session_id": "sess01",
                "output_dir": "/tmp/out",
            },
        }
        report = agent.execute(task)

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["agent"], "Analyst")
        self.assertTrue(report["self_check"]["passed"])
        self.assertEqual(report["data"]["profile"]["product_name"], "测试包")
        self.assertEqual(len(report["data"]["scene_plan"]), 1)

    @patch.object(AgentToolkit, "analyze_product")
    @patch.object(AgentToolkit, "match_scenes")
    def test_analyst_fails_over_across_keys_and_models(self, mock_match, mock_analyze):
        mock_analyze.side_effect = [
            RuntimeError("[MODEL_PROVIDER_QUOTA_EXHAUSTED] primary quota"),
            RuntimeError("403 backup key unavailable"),
            {
                "profile": {"product_name": "测试包", "category": "bag"},
                "profile_path": "/tmp/profile.json",
            },
        ]
        mock_match.return_value = {
            "scene_plan": [{"scene_id": "s1", "scene_name": "白底"}],
            "plan_path": "/tmp/plan.json",
        }

        agent = AnalystAgent()
        task = {
            "task_id": "t_analyze_failover",
            "type": "analyze",
            "params": {
                "image_paths": ["/tmp/img.jpg"],
                "session_id": "sess-failover",
                "output_dir": "/tmp/out-failover",
                "engine": "openai",
            },
        }
        with patch.dict(os.environ, {
            "OPENAI_API_KEY_PREMIUM": "premium-key",
            "OPENAI_API_KEY": "standard-key",
            "LLM_MODEL": "primary-model",
            "LLM_MODEL_BACKUP": "backup-model",
        }, clear=False):
            report = agent.execute(task)

        self.assertEqual(report["status"], "success")
        self.assertEqual(mock_analyze.call_count, 3)
        third_call = mock_analyze.call_args_list[2]
        self.assertEqual(third_call.args[2], "premium-key")
        self.assertEqual(third_call.kwargs["model"], "backup-model")


class TestGeneratorMockExecute(unittest.TestCase):
    """Generator mock 执行流"""

    @patch.object(AgentToolkit, "generate_images")
    def test_generator_execute_success(self, mock_gen):
        mock_gen.return_value = {
            "images": [{"filename": "s1.jpg", "scene_id": "s1"}],
            "raw_dir": "/tmp/raw",
            "results": [{"success": True}],
        }

        agent = GeneratorAgent()
        with patch("os.path.exists", return_value=True):
            with patch("os.path.join", side_effect=lambda *a: "/".join(a)):
                report = agent.execute({
                    "task_id": "t_gen",
                    "type": "generate",
                    "params": {
                        "profile_path": "/tmp/profile.json",
                        "plan_path": "/tmp/plan.json",
                        "image_paths": ["/tmp/img.jpg"],
                        "output_dir": "/tmp/out",
                        "session_id": "sess01",
                    },
                })

        self.assertEqual(report["status"], "success")
        self.assertTrue(report["self_check"]["passed"])
        self.assertEqual(len(report["data"]["images"]), 1)


class TestQAMockExecute(unittest.TestCase):
    """QA mock 执行流"""

    @patch.object(AgentToolkit, "check_consistency")
    def test_qa_execute_success(self, mock_check):
        mock_check.return_value = {
            "consistency_score": 85,
            "passed": True,
            "report_path": "/tmp/report.json",
            "check_result": {"pass": True},
        }

        agent = QAAgent()
        report = agent.execute({
            "task_id": "t_qa",
            "type": "qa",
            "params": {
                "image_dir": "/tmp/layout",
                "profile_path": "/tmp/profile.json",
                "output_dir": "/tmp/out",
            },
        })

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["data"]["consistency_score"], 85)
        self.assertTrue(report["self_check"]["passed"])


class TestLayoutMockExecute(unittest.TestCase):
    """Layout mock 执行流"""

    @patch.object(AgentToolkit, "platform_adapt")
    @patch.object(AgentToolkit, "layout")
    @patch.object(AgentToolkit, "post_process")
    def test_layout_pipeline_success(self, mock_post, mock_layout, mock_plat):
        mock_post.return_value = {"final_dir": "/tmp/final", "processed_count": 2, "total": 2}
        mock_layout.return_value = {"layout_dir": "/tmp/layout", "processed_count": 2, "total": 2}
        mock_plat.return_value = {
            "platforms_dir": "/tmp/platforms",
            "platform_count": 3,
            "platform_file_count": 6,
            "platforms": ["taobao_main"],
        }

        agent = LayoutAgent()
        with patch.object(agent, "_collect_images_from_dir", return_value=[
            {"filename": "a.jpg", "scene_name": "a", "scene_id": "a", "subdir": "layout"},
        ]):
            with patch("os.path.exists", return_value=True):
                report = agent.execute({
                    "task_id": "t_layout",
                    "type": "layout",
                    "params": {
                        "raw_dir": "/tmp/raw",
                        "output_dir": "/tmp/out",
                        "session_id": "sess01",
                    },
                })

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["data"]["platform_count"], 3)
        self.assertTrue(report["self_check"]["passed"])
        mock_post.assert_called_once()
        mock_layout.assert_called_once()
        mock_plat.assert_called_once()


class TestExecutorOrchestrator(unittest.TestCase):
    """Executor 编排器 mock 管线"""

    @patch.object(ExecutorAgent, "_run_sub_agent")
    def test_generate_pipeline_routes_sub_agents(self, mock_run):
        mock_run.side_effect = [
            {"images": [{"filename": "r.jpg"}], "raw_dir": "/tmp/raw"},
            {
                "images": [{"filename": "l.jpg", "subdir": "layout"}],
                "layout_dir": "/tmp/layout",
                "final_dir": "/tmp/final",
                "platforms_dir": "/tmp/plat",
                "platform_count": 3,
                "platform_file_count": 6,
            },
            {"consistency_score": 90, "consistency_passed": True},
        ]

        executor = ExecutorAgent("orch_test")
        task = {
            "task_id": "t_pipe",
            "type": "generate",
            "params": {
                "image_paths": ["/tmp/img.jpg"],
                "profile_path": "/tmp/profile.json",
                "plan_path": "/tmp/plan.json",
                "session_id": "sess01",
                "output_dir": "/tmp/out",
                "product_name": "测试产品",
            },
        }

        with patch("os.path.exists", return_value=True):
            with patch("builtins.open", mock_open(read_data='{"product_name":"测试"}')):
                report = executor.execute(task)

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["data"]["consistency_score"], 90)
        self.assertEqual(mock_run.call_count, 3)

    @patch.object(ExecutorAgent, "_run_sub_agent")
    def test_analyze_delegates_to_analyst(self, mock_run):
        mock_run.return_value = {
            "profile": {"product_name": "包"},
            "scene_plan": [{"scene_id": "s1"}],
            "profile_path": "/tmp/p.json",
            "plan_path": "/tmp/pl.json",
        }

        executor = ExecutorAgent()
        report = executor.execute({
            "task_id": "t1",
            "type": "analyze",
            "params": {"image_paths": [], "session_id": "s", "output_dir": "/tmp"},
        })

        self.assertEqual(report["status"], "success")
        mock_run.assert_called_once()
        call_args = mock_run.call_args[0]
        self.assertIs(call_args[0], executor.analyst)


class TestChatGptStyleGenerationFlow(unittest.TestCase):
    @patch.object(ExecutorAgent, "_run_sub_agent")
    def test_generate_pipeline_locks_existing_reference_images(self, mock_run):
        mock_run.side_effect = [
            {"images": [{"filename": "r.jpg"}], "raw_dir": "/tmp/raw", "reference_image_count": 1},
            {"images": [{"filename": "l.jpg", "subdir": "layout"}], "layout_dir": "/tmp/layout"},
            {"consistency_score": 91, "consistency_passed": True},
        ]
        executor = ExecutorAgent("style_test")
        progress = []
        task = {
            "task_id": "t_pipe",
            "type": "generate",
            "params": {
                "image_paths": ["/tmp/ref.jpg", "/tmp/missing.jpg", "/tmp/ref.jpg"],
                "profile_path": "/tmp/profile.json",
                "plan_path": "/tmp/plan.json",
                "session_id": "sess01",
                "output_dir": "/tmp/out",
            },
        }

        def progress_callback(agent, stage, msg, **extra):
            progress.append({"agent": agent, "stage": stage, "msg": msg, **extra})

        def exists(path):
            return path in {"/tmp/ref.jpg", "/tmp/profile.json", "/tmp/plan.json"}

        with patch("os.path.exists", side_effect=exists):
            with patch("builtins.open", mock_open(read_data='{"product_name":"Pen"}')):
                report = executor.execute(task, progress_callback=progress_callback)

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["data"]["reference_image_count"], 1)
        self.assertEqual(progress[0]["stage"], "reference_lock")
        self.assertEqual(progress[0]["reference_image_count"], 1)
        gen_params = mock_run.call_args_list[0].args[1]["params"]
        self.assertEqual(gen_params["image_paths"], ["/tmp/ref.jpg"])
        self.assertEqual(gen_params["reference_images"], ["/tmp/ref.jpg"])


if __name__ == "__main__":
    unittest.main()
