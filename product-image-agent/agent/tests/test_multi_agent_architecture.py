#!/usr/bin/env python3
"""textagentenglish_text：text / english_text / english_text / english_text"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.protocol import (
    AgentMessage,
    make_report,
    make_task,
    validate_report,
)
from agents.registry import CapabilityRegistry
from agents.pipeline import Pipeline, Step, LoopEdge
from agents.telemetry import Telemetry
from agents.executor import ExecutorAgent


# ============================================================
# protocol
# ============================================================

class TestProtocol(unittest.TestCase):
    def test_make_task_shape(self):
        task = make_task("generate", {"quality": "premium"}, observer_says="text")
        self.assertEqual(task["type"], "generate")
        self.assertEqual(task["params"]["quality"], "premium")
        self.assertTrue(task["task_id"])
        self.assertTrue(task["trace_id"])

    def test_make_report_valid(self):
        task = make_task("analyze")
        report = make_report(task, {"profile": {}}, "success", agent="analyst")
        self.assertEqual(validate_report(report), [])
        self.assertEqual(report["trace_id"], task["trace_id"])

    def test_validate_report_catches_issues(self):
        self.assertIn("reporttextyes dict", validate_report("nope"))
        issues = validate_report({"task_id": "t", "status": "weird"})
        self.assertTrue(any("textfields" in i for i in issues))
        self.assertTrue(any("text status" in i for i in issues))

    def test_agent_message_carries_trace(self):
        task = make_task("generate")
        msg = AgentMessage.task("observer", "executor", task)
        self.assertEqual(msg.trace_id, task["trace_id"])
        self.assertEqual(msg.msg_type, "task")
        self.assertEqual(msg.to_dict()["payload"]["type"], "generate")


# ============================================================
# registry
# ============================================================

class TestCapabilityRegistry(unittest.TestCase):
    def test_register_resolve_alias(self):
        reg = CapabilityRegistry()
        handler = lambda *a: {"ok": True}
        reg.register("research", handler, description="english_text",
                     aliases=("web_search", "browse"))
        self.assertIs(reg.resolve("research"), handler)
        self.assertIs(reg.resolve("web_search"), handler)
        self.assertIsNone(reg.resolve("nope"))
        # english_text
        self.assertEqual(len(reg.capabilities()), 1)

    def test_executor_registers_all_task_types(self):
        ex = ExecutorAgent("t_reg")
        for task_type in ("analyze", "generate", "adjust", "download",
                          "feedback", "ab_test", "research", "web_search", "browse"):
            self.assertTrue(ex.registry.has(task_type), task_type)

    def test_executor_unknown_task_type(self):
        ex = ExecutorAgent("t_unknown")
        report = ex.execute({"task_id": "t1", "type": "no_such_capability", "params": {}})
        self.assertEqual(report["status"], "error")
        self.assertIn("texttasktext", report["error"])
        self.assertIn("trace", report)


# ============================================================
# pipeline
# ============================================================

class TestPipeline(unittest.TestCase):
    def test_linear_flow_merges_ctx(self):
        p = Pipeline("t", [
            Step("a", lambda ctx: {"x": 1}),
            Step("b", lambda ctx: {"y": ctx["x"] + 1}),
        ])
        ctx = p.run({})
        self.assertEqual(ctx["y"], 2)

    def test_condition_skips_step(self):
        p = Pipeline("t", [
            Step("a", lambda ctx: {"ran_a": True}, when=lambda ctx: False),
            Step("b", lambda ctx: {"ran_b": True}),
        ])
        ctx = p.run({})
        self.assertNotIn("ran_a", ctx)
        self.assertTrue(ctx["ran_b"])

    def test_loop_edge_reruns_until_pass(self):
        """text QA english_text → text generate textautomatictextgenerationtext"""
        calls = {"generate": 0, "qa": 0}

        def gen(ctx):
            calls["generate"] += 1
            return {}

        def qa(ctx):
            calls["qa"] += 1
            return {"passed": calls["qa"] >= 2}  # english_textpassed

        p = Pipeline(
            "t",
            [Step("generate", gen), Step("qa", qa)],
            loops=[LoopEdge(
                after="qa", back_to="generate",
                while_=lambda ctx: not ctx.get("passed"),
                max_rounds=3,
                prepare=lambda ctx: ctx.setdefault("rounds", []).append(1),
            )],
        )
        ctx = p.run({})
        self.assertTrue(ctx["passed"])
        self.assertEqual(calls["generate"], 2)
        self.assertEqual(calls["qa"], 2)
        self.assertEqual(len(ctx["rounds"]), 1)

    def test_loop_respects_max_rounds(self):
        calls = {"n": 0}

        def qa(ctx):
            calls["n"] += 1
            return {}

        p = Pipeline(
            "t", [Step("qa", qa)],
            loops=[LoopEdge(after="qa", back_to="qa",
                            while_=lambda ctx: True, max_rounds=2)],
        )
        p.run({})
        self.assertEqual(calls["n"], 3)  # text + 2 english_text

    def test_loop_round_failure_keeps_previous_result(self):
        """textgenerationenglish_text：english_textsuccesstext，texttasktextfailed"""
        state = {"round": 0}

        def gen(ctx):
            state["round"] += 1
            if state["round"] > 1:
                raise RuntimeError("regen boom")
            return {"images": ["first_round.jpg"]}

        p = Pipeline(
            "t",
            [Step("gen", gen), Step("qa", lambda ctx: {"score": 50})],
            loops=[LoopEdge(after="qa", back_to="gen",
                            while_=lambda ctx: True, max_rounds=2)],
        )
        ctx = p.run({})
        self.assertEqual(ctx["images"], ["first_round.jpg"])
        self.assertEqual(ctx["score"], 50)
        self.assertTrue(ctx["loop_errors"])

    def test_first_round_failure_raises(self):
        p = Pipeline("t", [Step("a", lambda ctx: (_ for _ in ()).throw(RuntimeError("boom")))])
        with self.assertRaises(RuntimeError):
            p.run({})

    def test_cancel_stops_pipeline(self):
        ran = []
        p = Pipeline("t", [
            Step("a", lambda ctx: ran.append("a")),
            Step("b", lambda ctx: ran.append("b")),
        ])
        flags = {"cancel": False}

        def cancel_after_a():
            return bool(ran)  # a english_text

        ctx = p.run({"cancel_check": cancel_after_a})
        self.assertEqual(ran, ["a"])
        self.assertTrue(ctx["cancelled"])

    def test_invalid_loop_edge_rejected(self):
        with self.assertRaises(ValueError):
            Pipeline("t", [Step("a", lambda ctx: None)],
                     loops=[LoopEdge(after="a", back_to="missing",
                                     while_=lambda ctx: True)])


# ============================================================
# telemetry
# ============================================================

class TestTelemetry(unittest.TestCase):
    def test_nested_spans_and_summary(self):
        tele = Telemetry(session_id="s1")
        with tele.span("task:generate", agent="executor"):
            with tele.span("agent:qa", agent="qa_01"):
                pass
        self.assertEqual(len(tele.spans), 2)
        inner, outer = tele.spans  # english_text
        self.assertEqual(inner["name"], "agent:qa")
        self.assertEqual(inner["parent_id"], outer["span_id"])
        self.assertEqual(outer["parent_id"], "")
        summary = tele.summary()
        self.assertEqual(summary["span_count"], 2)
        self.assertEqual(summary["errors"], [])

    def test_error_span_recorded_and_reraised(self):
        tele = Telemetry()
        with self.assertRaises(ValueError):
            with tele.span("step:qa", agent="qa"):
                raise ValueError("bad")
        self.assertEqual(tele.spans[0]["status"], "error")
        self.assertIn("bad", tele.spans[0]["error"])
        self.assertTrue(tele.summary()["errors"])


# ============================================================
# executor text：english_text + text + text
# ============================================================

class TestExecutorPipelineIntegration(unittest.TestCase):
    def _fake_sub_agent_runner(self, tmp, qa_pass_on_round: int):
        """text _run_sub_agent：texttaskenglish_textdata，english_text QA english_textpassed"""
        profile_path = os.path.join(tmp, "profile.json")
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump({"product_name": "Test Mug"}, f)
        plan_path = os.path.join(tmp, "plan.json")
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump({"scenes": [{
                "scene_id": "scene_01_white_bg",
                "scene_name": "Clean White Background",
                "prompt": "A clean scene featuring {{product_name}}.",
            }]}, f, ensure_ascii=False)
        counters = {"generate": 0, "qa": 0, "layout": 0, "analyze": 0}

        def fake(agent, task, progress_callback=None, cancel_check=None):
            ttype = task.get("type", "")
            counters[ttype] = counters.get(ttype, 0) + 1
            if ttype == "analyze":
                return {"profile_path": profile_path,
                        "plan_path": plan_path,
                        "profile": {"product_name": "Test Mug"}}
            if ttype == "generate":
                if task.get("params", {}).get("confirmed_scenes") and counters["generate"] > 1:
                    counters["last_regen_scenes"] = task["params"]["confirmed_scenes"]
                return {"raw_dir": tmp,
                        "images": [{"filename": "scene_01_white_bg.jpg"}]}
            if ttype == "layout":
                return {"layout_dir": tmp,
                        "images": [{"filename": "scene_01_white_bg.jpg"}]}
            if ttype == "qa":
                passed = counters["qa"] >= qa_pass_on_round
                return {
                    "consistency_score": 90 if passed else 40,
                    "consistency_passed": passed,
                    "check_result": {
                        "per_image": [{
                            "file": "scene_01_white_bg.jpg",
                            "quality": {"quality_score": 90 if passed else 30},
                        }],
                    },
                }
            return {}

        return fake, counters

    def test_generate_pipeline_happy_path(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            ex = ExecutorAgent("t_pipe")
            fake, counters = self._fake_sub_agent_runner(tmp, qa_pass_on_round=1)
            ex._run_sub_agent = fake
            report = ex.execute({
                "task_id": "t1", "type": "generate",
                "params": {"session_id": "s1", "output_dir": tmp},
            })
            self.assertEqual(report["status"], "success")
            data = report["data"]
            self.assertEqual(data["consistency_score"], 90)
            self.assertTrue(data["consistency_passed"])
            self.assertEqual(data["auto_regen_rounds_used"], 0)
            self.assertEqual(counters["generate"], 1)
            # english_textyesenglish_text span
            names = [s["name"] for s in report["trace"]["spans"]]
            self.assertIn("pipeline:generate", names)
            self.assertIn("step:qa", names)

    def test_generate_pipeline_auto_regen_loop(self):
        import tempfile
        os.environ["QA_AUTO_REGEN_ROUNDS"] = "2"
        try:
            with tempfile.TemporaryDirectory() as tmp:
                ex = ExecutorAgent("t_regen")
                fake, counters = self._fake_sub_agent_runner(tmp, qa_pass_on_round=2)
                ex._run_sub_agent = fake
                report = ex.execute({
                    "task_id": "t2", "type": "generate",
                    "params": {"session_id": "s2", "output_dir": tmp},
                })
                self.assertEqual(report["status"], "success")
                data = report["data"]
                self.assertTrue(data["consistency_passed"])
                self.assertEqual(data["auto_regen_rounds_used"], 1)
                self.assertEqual(counters["generate"], 2)
                self.assertEqual(counters["qa"], 2)
                # english_textgenerationtext generator english_textyestextscene dict（textfiletext stem）
                regen_scenes = counters.get("last_regen_scenes")
                self.assertTrue(regen_scenes)
                self.assertEqual(regen_scenes[0]["scene_id"], "scene_01_white_bg")
                self.assertIn("prompt", regen_scenes[0])
        finally:
            os.environ.pop("QA_AUTO_REGEN_ROUNDS", None)

    def test_generate_pipeline_cross_border_steps(self):
        """text markets/region/festival english_text，localenglish_textgenerationenglish_text"""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            plan_path = os.path.join(tmp, "scene_plan.json")
            with open(plan_path, "w", encoding="utf-8") as f:
                json.dump({"scenes": [{
                    "scene_id": "scene_02_lifestyle",
                    "prompt": "A lifestyle scene featuring {{product_name}}.",
                }]}, f, ensure_ascii=False)
            profile_path = os.path.join(tmp, "profile.json")
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump({"product_name": "Ceramic Mug",
                           "key_features": ["handmade"]}, f)

            for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"):
                os.environ.pop(var, None)

            ex = ExecutorAgent("t_xb")
            fake, counters = self._fake_sub_agent_runner(tmp, qa_pass_on_round=1)
            ex._run_sub_agent = fake
            report = ex.execute({
                "task_id": "t4", "type": "generate",
                "params": {
                    "session_id": "s4", "output_dir": tmp,
                    "profile_path": profile_path, "plan_path": plan_path,
                    "markets": ["us", "jp"], "region": "jp",
                },
            })
            self.assertEqual(report["status"], "success")
            data = report["data"]
            # localenglish_textgeneration（texttemplatetext）english_text
            self.assertEqual(sorted(data["localized_markets"]), ["jp", "us"])
            self.assertTrue(os.path.exists(data["localized_copy_path"]))
            # sceneenglish_text
            with open(plan_path, encoding="utf-8") as f:
                plan = json.load(f)
            self.assertIn("wabi-sabi", plan["scenes"][0]["prompt"])
            self.assertEqual(plan["region"], "jp")
            # english_textlocalenglish_text
            names = [s["name"] for s in report["trace"]["spans"]]
            self.assertIn("step:localize_scenes", names)
            self.assertIn("step:localize_copy", names)

    def test_adjust_capability_via_registry(self):
        ex = ExecutorAgent("t_adjust")
        report = ex.execute({
            "task_id": "t3", "type": "adjust",
            "params": {
                "current_plan": [{"scene_id": "s1", "scene_name": "text"}],
                "user_message": "english_text",
                "extracted": {"mentioned_scenes": ["text"]},
            },
        })
        self.assertEqual(report["status"], "success")
        self.assertEqual(report["data"]["adjusted_count"], 0)
        self.assertTrue(report.get("trace_id"))


if __name__ == "__main__":
    unittest.main()
