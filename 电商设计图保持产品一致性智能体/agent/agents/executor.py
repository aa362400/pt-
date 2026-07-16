#!/usr/bin/env python3
"""
执行编排器 — Executor / Pipeline Orchestrator

职责：协调 4 个子智能体按管线顺序执行，保留反馈/A/B/下载等辅助任务

子智能体管线：
  analyze  → AnalystAgent
  generate → GeneratorAgent → LayoutAgent → QAAgent
"""

import base64
import io
import json
import os
import sys
import time
import threading
import zipfile
from pathlib import Path
from typing import Optional, Callable

from common.runtime_paths import get_runtime_paths

from .toolkit import AgentToolkit
from .analyst import AnalystAgent
from .generator import GeneratorAgent
from .qa import QAAgent
from .layout import LayoutAgent
from .researcher import ResearcherAgent
from .consistency_agent import ConsistencyGuardAgent
from .registry import CapabilityRegistry
from .pipeline import Pipeline, Step, LoopEdge
from .telemetry import Telemetry, NullTelemetry


class ExecutorAgent:
    """
    执行编排器（向后兼容 ExecutorAgent 名称）

    核心循环：
      1. 接收 Task（来自 Observer）
      2. 路由到对应子智能体执行
      3. 汇总子智能体自检结果
      4. 汇报：将结果上报给 Observer
    """

    def __init__(self, agent_id: str = "executor_01"):
        self.agent_id = agent_id
        self.current_task = None
        self.current_task_id = None
        self.status = "idle"  # idle | busy | error
        self.last_report = None
        self.execution_log = []
        self.sub_agent_reports = []

        base = os.path.join(os.path.dirname(__file__), "..")
        self.script_dir = os.path.join(base, "scripts")
        self.template_dir = os.path.join(base, "templates", "scenes")
        self.output_base = get_runtime_paths().outputs

        self.toolkit = AgentToolkit(
            self.script_dir, self.template_dir, self.output_base,
        )

        # 四个专业子智能体
        self.analyst = AnalystAgent(f"analyst_{agent_id}", self.toolkit)
        self.generator = GeneratorAgent(f"generator_{agent_id}", self.toolkit)
        self.qa = QAAgent(f"qa_{agent_id}", self.toolkit)
        self.layout = LayoutAgent(f"layout_{agent_id}", self.toolkit)
        self.researcher = ResearcherAgent(f"researcher_{agent_id}")
        self.consistency_guard = ConsistencyGuardAgent(
            agent_id=f"consistency_{agent_id}",
        )

        # 辅助工具（非子智能体管线）
        self.tools = {
            "record_feedback": self._tool_record_feedback,
            "ab_test": self._tool_ab_test,
            "prepare_download": self._tool_prepare_download,
            "adjust_scene_plan": self._tool_adjust_scene_plan,
        }

        # 能力注册表：任务类型 → 处理器（取代 if/elif 硬编码路由）
        self._telemetry: Optional[Telemetry] = None
        self.registry = CapabilityRegistry()
        self._register_capabilities()

    def _register_capabilities(self):
        reg = self.registry
        reg.register("analyze", self._cap_analyze,
                     description="产品分析 + 场景匹配", agent="analyst")
        reg.register("generate", self._cap_generate,
                     description="生成管线：Analyst→Generator→SubjectLock→Layout→QA（含自动重生成）",
                     agent="generator")
        reg.register("adjust", self._cap_adjust,
                     description="按用户反馈调整场景计划")
        reg.register("download", self._cap_download,
                     description="打包生成结果供下载")
        reg.register("feedback", self._cap_feedback,
                     description="记录用户喜欢/不喜欢偏好")
        reg.register("ab_test", self._cap_ab_test,
                     description="生成 A/B 测试变体", agent="generator")
        reg.register("research", self._cap_research,
                     description="联网研究：搜索竞品/抓取页面/下载参考图",
                     agent="researcher", aliases=("web_search", "browse"))
        reg.register("enhanced_qa", self._cap_enhanced_qa,
                     description="外部一致性增强检测（ConsistencyGuard），在 QA 通过后可选执行",
                     agent="consistency_guard")

    # ── 能力处理器（统一签名: task, params, progress_callback, cancel_check → data dict）──

    def _cap_analyze(self, task, params, progress_callback, cancel_check):
        return self._run_analyst(task, params, progress_callback, cancel_check)

    def _cap_generate(self, task, params, progress_callback, cancel_check):
        return self._run_generate_pipeline(task, params, progress_callback, cancel_check)

    def _cap_adjust(self, task, params, progress_callback, cancel_check):
        return self._execute_adjust(params)

    def _cap_download(self, task, params, progress_callback, cancel_check):
        return self._execute_download(params)

    def _cap_feedback(self, task, params, progress_callback, cancel_check):
        return self._execute_feedback(params)

    def _cap_ab_test(self, task, params, progress_callback, cancel_check):
        return self._execute_ab_test(params, progress_callback)

    def _cap_research(self, task, params, progress_callback, cancel_check):
        result = self._run_researcher(task, params, progress_callback, cancel_check)
        self._persist_research_to_blackboard(result)
        return result

    def _cap_enhanced_qa(self, task, params, progress_callback, cancel_check):
        sub_task = {**task, "type": "enhanced_qa", "params": params}
        return self._run_sub_agent(
            self.consistency_guard, sub_task, progress_callback, cancel_check,
        )

    def _canonical_reference_images(self, image_paths: list) -> list:
        """Return the session product images that must anchor every generation."""
        refs = []
        seen = set()
        for path in image_paths or []:
            if not path or path in seen or not os.path.exists(path):
                continue
            seen.add(path)
            refs.append(path)
        return refs

    @staticmethod
    def _auto_regen_rounds() -> int:
        """QA 不合格时的自动重生成轮数（0 关闭）"""
        try:
            return max(0, int(os.getenv("QA_AUTO_REGEN_ROUNDS", "1")))
        except ValueError:
            return 1

    def _resolve_regen_scenes(self, ctx: dict) -> list:
        """把 QA 低分场景 ID 映射回场景计划里的完整场景对象（generator 需要场景 dict）"""
        failing = self._failing_scene_ids(ctx.get("qa_data", {}))
        if not failing:
            return []

        pool = [s for s in (ctx["params"].get("confirmed_scenes") or []) if isinstance(s, dict)]
        plan_path = ctx.get("plan_path", "")
        if plan_path and os.path.exists(plan_path):
            try:
                with open(plan_path, "r", encoding="utf-8") as f:
                    plan = json.load(f)
                pool.extend(plan.get("scenes", []) if isinstance(plan, dict) else plan)
            except (json.JSONDecodeError, OSError):
                pass

        by_id = {}
        for scene in pool:
            sid = scene.get("scene_id", "")
            if sid and sid not in by_id:
                by_id[sid] = scene

        # QA 定位到的具体问题（同一性/画面瑕疵），注入重生成提示词做针对性修正
        issues_by_stem = {}
        for item in (ctx.get("qa_data", {}).get("check_result", {}) or {}).get("per_image", []) or []:
            stem = os.path.splitext(item.get("file", ""))[0]
            notes = [item.get("identity_issue", ""), item.get("defect_issue", "")]
            joined = "; ".join(n for n in notes if n)
            if stem and joined:
                issues_by_stem[stem] = joined[:200]

        resolved = []
        seen_ids = set()
        for stem in failing:
            scene = by_id.get(stem)
            if not scene:
                # 文件名 stem 可能带序号/变体后缀（如 scene_01_white_bg_v2）
                for sid, candidate in by_id.items():
                    if stem.startswith(sid):
                        scene = candidate
                        break
            if not scene or scene.get("scene_id") in seen_ids:
                continue
            seen_ids.add(scene.get("scene_id"))
            issue = issues_by_stem.get(stem)
            if issue and scene.get("prompt"):
                # 用副本注入修正指令，避免污染原场景计划
                scene = {**scene, "prompt": (
                    f"{scene['prompt']} IMPORTANT correction for this retry — the previous "
                    f"attempt failed QA because: {issue}. Fix exactly this while keeping "
                    f"the product identical to the reference images.")}
            resolved.append(scene)
        return resolved

    @staticmethod
    def _failing_scene_ids(qa_data: dict, max_scenes: int = 3) -> list:
        """
        从 QA 结果中找出需要重生成的场景 ID（按低分排序）。
        依据（优先级从高到低）：
        - 产品同一性语义分 < 60（视觉 LLM 判定产品主体与参考图不一致）
        - 单图质量分 < 60
        - 与原始产品图保真度 < 50（仅在语义 QA 不可用时使用——
          全图嵌入相似度对创意场景天然偏低，会误伤）
        无法映射回场景计划的 stem 会在 _resolve_regen_scenes 里被丢弃。
        """
        check = qa_data.get("check_result", {}) or {}
        identity_based = bool(check.get("identity_based"))
        candidates = {}  # stem -> 最低分

        for item in check.get("per_image", []) or []:
            stem = os.path.splitext(item.get("file", ""))[0]
            if stem.startswith("_"):
                continue
            ident = item.get("identity_score")
            if ident is not None and ident < 60:
                candidates[stem] = min(candidates.get(stem, 101), ident)
            defect = item.get("defect_score")
            if defect is not None and defect < 60:
                # 视觉 LLM 判定画面有生成瑕疵（畸形/伪影/乱字）也触发重生成
                candidates[stem] = min(candidates.get(stem, 101), defect)
            q = (item.get("quality") or {}).get("quality_score")
            if q is not None and q < 60:
                candidates[stem] = min(candidates.get(stem, 101), q)

        if not identity_based:
            fidelity = check.get("reference_fidelity", {}) or {}
            for item in fidelity.get("per_image", []) or []:
                stem = os.path.splitext(item.get("file", ""))[0]
                if stem.startswith("_"):
                    continue
                fid = item.get("fidelity")
                if fid is not None and fid < 50:
                    candidates[stem] = min(candidates.get(stem, 101), fid)

        ranked = sorted(candidates.items(), key=lambda kv: kv[1])
        return [stem for stem, _ in ranked[:max_scenes]]

    @property
    def sub_agents(self) -> dict:
        """所有子智能体（供 Web UI 状态展示）"""
        return {
            "analyst": self.analyst,
            "generator": self.generator,
            "qa": self.qa,
            "layout": self.layout,
            "researcher": self.researcher,
            "consistency_guard": self.consistency_guard,
        }

    def get_agent_statuses(self) -> dict:
        """返回各子智能体当前状态"""
        return {
            "executor": self.status,
            "analyst": self.analyst.status,
            "generator": self.generator.status,
            "qa": self.qa.status,
            "layout": self.layout.status,
            "researcher": self.researcher.status,
            "consistency_guard": self.consistency_guard.status,
        }

    def _ensure_scripts_path(self):
        if self.script_dir not in sys.path:
            sys.path.insert(0, self.script_dir)

    # ============================================================
    # 1. 接收任务
    # ============================================================

    def receive_task(self, task: dict) -> str:
        """接收观察者派发的任务"""
        task_id = task.get("task_id", "unknown")
        task_type = task.get("type", "unknown")

        self.current_task = task
        self.current_task_id = task_id
        self.status = "busy"
        self.sub_agent_reports = []

        msg = (
            f"[Orchestrator] 收到任务 {task_id}（类型: {task_type}）\n"
            f"  [Orchestrator] 观察者指令: {task.get('observer_says', '')[:80]}..."
        )
        print(msg)

        self.execution_log.append({
            "time": time.time(),
            "event": "receive",
            "task_id": task_id,
            "task_type": task_type,
        })

        return f"执行编排器已接收任务 {task_id}，开始调度子智能体..."

    # ============================================================
    # 2. 执行任务（路由到子智能体）
    # ============================================================

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """同步执行任务：注册表路由 → 能力处理器 → 汇总报告（含全链路追踪）"""
        task_type = task.get("type", "")
        params = task.get("params", {})

        start = time.time()
        telemetry = Telemetry(
            session_id=params.get("session_id", ""),
            trace_id=task.get("trace_id", ""),
        )
        self._telemetry = telemetry
        report = {
            "task_id": task.get("task_id", ""),
            "type": task_type,
            "status": "error",
            "data": {},
            "self_check": {"passed": False, "issues": []},
            "sub_agents": [],
            "error": "",
            "execution_time": 0,
            "trace_id": telemetry.trace_id,
        }

        try:
            if cancel_check and cancel_check():
                report["status"] = "cancelled"
                report["data"] = {"cancelled": True}
                return self._finalize_report(report, task, start, telemetry)

            handler = self.registry.resolve(task_type)
            if handler is None:
                report["error"] = f"未知任务类型: {task_type}"
            else:
                with telemetry.span(f"task:{task_type}", agent=self.agent_id):
                    result = handler(task, params, progress_callback, cancel_check)
                report["data"] = result
                report["status"] = "cancelled" if result.get("cancelled") else "success"

        except Exception as e:
            report["error"] = str(e)
            report["status"] = "error"
            print(f"  [Orchestrator] ❌ 执行失败: {e}")

        return self._finalize_report(report, task, start, telemetry)

    def _finalize_report(self, report: dict, task: dict, start: float,
                         telemetry: Optional[Telemetry] = None) -> dict:
        report["sub_agents"] = [
            {"agent": r.get("agent"), "status": r.get("status"),
             "self_check": r.get("self_check")}
            for r in self.sub_agent_reports
        ]
        report["self_check"] = self.self_check(report)
        report["execution_time"] = round(time.time() - start, 2)
        if telemetry is not None:
            report["trace"] = telemetry.summary()
            self._telemetry = None

        self.execution_log.append({
            "time": time.time(),
            "event": "complete",
            "task_id": task.get("task_id"),
            "status": report["status"],
            "duration": report["execution_time"],
        })

        self.last_report = report
        self.status = "idle" if report["status"] in ("success", "cancelled") else "error"
        self.current_task = None
        return report

    def execute_async(self, task: dict, callback: Callable):
        """异步执行任务"""
        thread = threading.Thread(
            target=lambda: callback(self.execute(task)),
            daemon=True,
        )
        thread.start()

    def _run_sub_agent(self, agent, task: dict,
                       progress_callback: Optional[Callable] = None,
                       cancel_check: Optional[Callable] = None) -> dict:
        """运行单个子智能体并记录报告（带追踪 span）"""
        if cancel_check and cancel_check():
            return {"cancelled": True, "images": [], "profile": {}, "scene_plan": []}
        agent.receive_task(task)
        tele = self._telemetry or NullTelemetry()
        label = getattr(agent, "AGENT_LABEL", "") or getattr(agent, "agent_id", "sub_agent")
        with tele.span(f"agent:{label}", agent=getattr(agent, "agent_id", ""),
                       task_type=task.get("type", "")):
            sub_report = agent.execute(task, progress_callback, cancel_check=cancel_check)
        self.sub_agent_reports.append(sub_report)
        if sub_report.get("status") == "cancelled":
            data = sub_report.get("data", {})
            data["cancelled"] = True
            return data
        if sub_report.get("status") != "success":
            from common.utils import friendly_error_message
            issues = sub_report.get("self_check", {}).get("issues", [])
            err = sub_report.get("error") or "; ".join(issues) or "子智能体执行失败"
            raise RuntimeError(friendly_error_message(f"[{sub_report.get('agent')}] {err}"))
        return sub_report.get("data", {})

    # ============================================================
    # 3. 管线编排
    # ============================================================

    def _run_analyst(self, task: dict, params: dict,
                     progress_callback: Optional[Callable] = None,
                     cancel_check: Optional[Callable] = None) -> dict:
        """分析管线 → AnalystAgent"""
        sub_task = {**task, "params": params}
        return self._run_sub_agent(self.analyst, sub_task, progress_callback, cancel_check)

    def _run_researcher(self, task: dict, params: dict,
                        progress_callback: Optional[Callable] = None,
                        cancel_check: Optional[Callable] = None) -> dict:
        """上网研究 → ResearcherAgent"""
        sub_task = {**task, "params": params}
        return self._run_sub_agent(self.researcher, sub_task, progress_callback, cancel_check)

    def _persist_research_to_blackboard(self, data: dict):
        """Save research results to SharedBlackboard if bound."""
        bb = getattr(self, "blackboard", None)
        if not bb or not data:
            return
        bb.update({
            "research_report": {
                "query": data.get("query", ""),
                "summary": data.get("summary", ""),
                "search_results": data.get("search_results", []),
                "competitors": data.get("competitors", []),
                "reference_images": data.get("reference_images", []),
            },
            "reference_urls": data.get("reference_urls") or [],
        }, agent_id=self.agent_id)
        bb.save()

    def _run_generate_pipeline(self, task: dict, params: dict,
                                progress_callback: Optional[Callable] = None,
                                cancel_check: Optional[Callable] = None) -> dict:
        """生成管线（声明式图执行）：
        prepare → analyze(条件) → generate → subject_lock(条件) → layout → qa
        └ QA 不合格时按 LoopEdge 回跳 generate（最多 QA_AUTO_REGEN_ROUNDS 轮）
        """
        ctx = self._init_generate_ctx(task, params, progress_callback, cancel_check)
        pipeline = self._build_generate_pipeline()
        pipeline.telemetry = self._telemetry or NullTelemetry()
        pipeline.run(ctx)
        return self._generate_result_from_ctx(ctx)

    def _init_generate_ctx(self, task: dict, params: dict,
                           progress_callback, cancel_check) -> dict:
        from common.utils import CROSS_BORDER_PLATFORMS

        session_id = params.get("session_id", "")
        output_dir = params.get("output_dir", "") or os.path.join(self.output_base, session_id)
        os.makedirs(output_dir, exist_ok=True)

        return {
            "task": task,
            "params": params,
            "progress_callback": progress_callback,
            "cancel_check": cancel_check,
            "reference_images": self._canonical_reference_images(params.get("image_paths", [])),
            "profile_path": params.get("profile_path", ""),
            "plan_path": params.get("plan_path", ""),
            "scene_dir": params.get("scene_dir", self.template_dir),
            "session_id": session_id,
            "output_dir": output_dir,
            "brand_name": params.get("brand_name", ""),
            "watermark_path": params.get("watermark_path", ""),
            "platforms": params.get("platforms") or list(CROSS_BORDER_PLATFORMS),
            "product_name": params.get("product_name", ""),
            "auto_engine": params.get("auto_engine", False),
            "quality": params.get("quality", "standard"),
            "gen_images": [],
            "raw_dir": "",
            "layout_data": {},
            "layout_dir": "",
            "final_images": [],
            "qa_data": {},
            "score": None,
            "regen_scenes": None,
            "auto_regen_rounds_used": 0,
        }

    # ── 生成管线步骤（run: ctx -> 增量更新 dict）──

    def _step_prepare(self, ctx: dict) -> None:
        pc = ctx["progress_callback"]
        refs = ctx["reference_images"]
        if pc:
            pc(
                "executor", "reference_lock",
                f"已锁定 {len(refs)} 张原始产品图，后续生成会持续作为参考图",
                progress=8,
                reference_image_count=len(refs),
                reference_images=[os.path.basename(p) for p in refs],
            )

    def _step_analyze(self, ctx: dict) -> dict:
        pc = ctx["progress_callback"]
        if pc:
            pc("analyst", "analyze", "未检测到分析结果，先进行分析...")
        analyze_params = {**ctx["params"], "output_dir": ctx["output_dir"]}
        analyze_data = self._run_analyst(
            {**ctx["task"], "type": "analyze", "params": analyze_params},
            analyze_params, pc, ctx["cancel_check"],
        )
        if analyze_data.get("cancelled"):
            return {
                "cancelled": True,
                "profile": analyze_data.get("profile"),
                "completed_count": 0,
                "total_count": 0,
            }
        return {
            "profile_path": analyze_data.get("profile_path", ""),
            "plan_path": analyze_data.get("plan_path", ""),
            "product_name": ctx["product_name"] or analyze_data.get("profile", {}).get("product_name", ""),
        }

    def _step_resolve_name(self, ctx: dict) -> dict:
        with open(ctx["profile_path"], "r", encoding="utf-8") as f:
            return {"product_name": json.load(f).get("product_name", "")}

    def _step_localize_scenes(self, ctx: dict) -> None:
        """场景地区化改写（目标市场审美 + 可选节日场景，失败不阻断主流程）"""
        pc = ctx["progress_callback"]
        try:
            region = ctx["params"].get("region", "")
            festival = ctx["params"].get("festival", "")
            if pc:
                pc("analyst", "localize_scenes",
                   f"正在按目标市场（{region or festival}）改写场景审美...", progress=32)
            self.toolkit.localize_scenes(
                ctx["plan_path"], region, festival, log_prefix="Analyst",
            )
        except Exception as e:
            print(f"  [Executor] ⚠️ 场景地区化跳过: {e}")

    def _step_localize_copy(self, ctx: dict) -> dict:
        """多市场本地化文案（LLM 优先、离线模板回退，失败不阻断主流程）"""
        pc = ctx["progress_callback"]
        markets = ctx["params"].get("markets") or []
        try:
            if pc:
                pc("analyst", "localize_copy",
                   f"正在生成 {len(markets)} 个市场的本地化文案...", progress=36)
            result = self.toolkit.localize_copy(
                ctx["profile_path"], markets, ctx["output_dir"], log_prefix="Analyst",
            )
            return {"localized_copy": result}
        except Exception as e:
            print(f"  [Executor] ⚠️ 本地化文案跳过: {e}")
            return {}

    def _step_compliance(self, ctx: dict) -> dict:
        """平台合规校验（白底/占比/分辨率/体积，失败不阻断主流程）"""
        pc = ctx["progress_callback"]
        try:
            input_dir = ctx.get("layout_data", {}).get("platforms_dir") or ctx.get("layout_dir")
            if not input_dir or not os.path.isdir(input_dir):
                return {}
            self._ensure_scripts_path()
            from compliance_checker import COMPLIANCE_RULES
            plat_list = [p for p in ctx["platforms"] if p in COMPLIANCE_RULES]
            if not plat_list:
                return {}
            if pc:
                pc("qa", "compliance", "正在做平台合规校验...", progress=96)
            result = self.toolkit.check_compliance(
                input_dir, plat_list, ctx["output_dir"], log_prefix="QA",
            )
            return {"compliance": result}
        except Exception as e:
            print(f"  [Executor] ⚠️ 合规校验跳过: {e}")
            return {}

    def _step_generate(self, ctx: dict) -> dict:
        gen_params = {
            **ctx["params"],
            "image_paths": ctx["reference_images"],
            "reference_images": ctx["reference_images"],
            "reference_image_count": len(ctx["reference_images"]),
            "profile_path": ctx["profile_path"],
            "plan_path": ctx["plan_path"],
            "scene_dir": ctx["scene_dir"],
            "output_dir": ctx["output_dir"],
            "session_id": ctx["session_id"],
            "auto_engine": ctx["auto_engine"],
            "quality": ctx["quality"],
        }
        if ctx.get("regen_scenes"):
            gen_params["confirmed_scenes"] = ctx["regen_scenes"]
        gen_data = self._run_sub_agent(
            self.generator,
            {**ctx["task"], "type": "generate", "params": gen_params},
            ctx["progress_callback"],
            ctx["cancel_check"],
        )
        if gen_data.get("cancelled"):
            if ctx.get("regen_scenes"):
                # 重生成轮被取消：跳出循环并保留首轮结果
                raise RuntimeError("重生成被取消")
            gen_images = gen_data.get("images", [])
            completed = gen_data.get("completed_count", len(gen_images))
            return {
                "cancelled": True,
                "gen_images": gen_images,
                "raw_dir": gen_data.get("raw_dir", ctx["output_dir"]),
                "completed_count": completed,
                "total_count": gen_data.get("total_count", completed),
            }
        return {
            "raw_dir": gen_data.get("raw_dir", ctx["output_dir"]),
            "gen_images": gen_data.get("images", []),
        }

    def _step_subject_lock(self, ctx: dict) -> None:
        """主体锁定（可选，SUBJECT_LOCK_ENABLED=1 开启）：
        把原始产品图主体像素级合成回每张生成图，产品本身零漂移。"""
        pc = ctx["progress_callback"]
        self._ensure_scripts_path()
        try:
            from subject_lock import (
                subject_lock_enabled, subject_lock_blend, lock_directory,
            )
            if not subject_lock_enabled():
                return
            if pc:
                pc("executor", "subject_lock",
                   "正在把原始产品主体锁定合成回生成图...", progress=72)
            lock_result = lock_directory(
                ctx["reference_images"][0], ctx["raw_dir"], ctx["raw_dir"],
                blend=subject_lock_blend(),
            )
            if pc and lock_result.get("success"):
                pc("executor", "subject_lock",
                   f"主体锁定完成：{lock_result.get('locked', 0)}/"
                   f"{lock_result.get('total', 0)} 张", progress=74)
        except Exception as e:
            print(f"  [Executor] ⚠️ 主体锁定跳过: {e}")

    def _step_layout(self, ctx: dict) -> dict:
        layout_params = {
            "raw_dir": ctx["raw_dir"],
            "output_dir": ctx["output_dir"],
            "profile_path": ctx["profile_path"],
            "watermark_path": ctx["watermark_path"],
            "brand_name": ctx["brand_name"],
            "product_name": ctx["product_name"],
            "platforms": ctx["platforms"],
            "session_id": ctx["session_id"],
        }
        layout_data = self._run_sub_agent(
            self.layout,
            {**ctx["task"], "type": "layout", "params": layout_params},
            ctx["progress_callback"],
            ctx["cancel_check"],
        )
        return {
            "layout_data": layout_data,
            "layout_dir": layout_data.get("layout_dir", ctx["layout_dir"] or ctx["raw_dir"]),
            "final_images": layout_data.get("images", ctx["final_images"]),
        }

    def _step_qa(self, ctx: dict) -> dict:
        qa_params = {
            "image_dir": ctx["layout_dir"],
            "profile_path": ctx["profile_path"],
            "output_dir": ctx["output_dir"],
            "reference_images": ctx["reference_images"],
        }
        qa_data = self._run_sub_agent(
            self.qa,
            {**ctx["task"], "type": "qa", "params": qa_params},
            ctx["progress_callback"],
            ctx["cancel_check"],
        )
        score = qa_data.get("consistency_score")
        if score is None:
            raise RuntimeError("一致性检测失败")
        return {"qa_data": qa_data, "score": score}

    def _step_enhanced_qa(self, ctx: dict) -> dict:
        """外部一致性增强检测（可选，需配置 CONSISTENCY_AGENT_URL）"""
        pc = ctx["progress_callback"]
        if pc:
            pc("consistency_guard", "check", "正在执行外部一致性增强检测...", progress=95)
        enhanced_data = self._run_sub_agent(
            self.consistency_guard,
            {**ctx["task"], "type": "enhanced_qa", "params": ctx["params"]},
            pc, ctx["cancel_check"],
        )
        return {"enhanced_qa_data": enhanced_data}

    def _build_generate_pipeline(self) -> Pipeline:
        """声明生成管线图：步骤 + 条件边 + QA 自动重生成回跳边"""

        def needs_analysis(ctx):
            return not ctx["profile_path"] or not os.path.exists(ctx["profile_path"])

        def needs_product_name(ctx):
            return (not ctx["product_name"] and ctx["profile_path"]
                    and os.path.exists(ctx["profile_path"]))

        def wants_scene_localization(ctx):
            return bool(
                (ctx["params"].get("region") or ctx["params"].get("festival"))
                and ctx["plan_path"] and os.path.exists(ctx["plan_path"])
                and not ctx.get("regen_scenes")
            )

        def wants_copy_localization(ctx):
            return bool(ctx["params"].get("markets") and not ctx.get("regen_scenes"))

        def can_subject_lock(ctx):
            return bool(ctx["reference_images"] and ctx["gen_images"]
                        and not ctx.get("regen_scenes"))

        def qa_needs_regen(ctx):
            """QA 不合格自动重生成：一致性未达标且低分场景能映射回场景计划"""
            if ctx["qa_data"].get("consistency_passed", False):
                return False
            # 内联 prompt 场景（前端动态规划的上架套图）多为创意生活场景，
            # 传统全图相似度低是设计预期。仅当产品同一性语义 QA 可用
            # （视觉 LLM 只看产品主体、不误伤创意场景）时才自动重生成，
            # 否则交给用户按需「重新生成/换风格」，避免误报烧生图额度。
            confirmed = ctx["params"].get("confirmed_scenes") or []
            inline_creative = confirmed and all(
                s.get("prompt") for s in confirmed if isinstance(s, dict)
            )
            check = (ctx["qa_data"].get("check_result") or {})
            if inline_creative and not check.get("identity_based"):
                return False
            return bool(self._resolve_regen_scenes(ctx))

        def prepare_regen(ctx):
            scenes = self._resolve_regen_scenes(ctx)
            ctx["regen_scenes"] = scenes
            ctx["auto_regen_rounds_used"] = ctx.get("auto_regen_rounds_used", 0) + 1
            pc = ctx["progress_callback"]
            if pc:
                names = [s.get("scene_id", "") for s in scenes]
                pc(
                    "executor", "auto_regen",
                    f"一致性未达标（{ctx['score']}），自动重生成 {len(scenes)} 个低分场景"
                    f"（第 {ctx['auto_regen_rounds_used']}/{self._auto_regen_rounds()} 轮）: "
                    f"{', '.join(names)}",
                    progress=90,
                )

        return Pipeline(
            name="generate",
            steps=[
                Step("prepare", self._step_prepare, agent="executor"),
                Step("analyze", self._step_analyze, when=needs_analysis, agent="analyst"),
                Step("resolve_name", self._step_resolve_name, when=needs_product_name,
                     agent="executor"),
                Step("localize_scenes", self._step_localize_scenes,
                     when=wants_scene_localization, agent="analyst"),
                Step("localize_copy", self._step_localize_copy,
                     when=wants_copy_localization, agent="analyst"),
                Step("generate", self._step_generate, agent="generator"),
                Step("subject_lock", self._step_subject_lock, when=can_subject_lock,
                     agent="executor"),
                Step("layout", self._step_layout, agent="layout"),
                Step("qa", self._step_qa, agent="qa"),
                Step("enhanced_qa", self._step_enhanced_qa,
                     when=lambda ctx: bool(os.environ.get("CONSISTENCY_AGENT_URL")),
                     agent="consistency_guard"),
                Step("compliance", self._step_compliance, agent="qa"),
            ],
            loops=[
                LoopEdge(
                    after="qa", back_to="generate",
                    while_=qa_needs_regen,
                    max_rounds=self._auto_regen_rounds(),
                    prepare=prepare_regen,
                ),
            ],
        )

    def _generate_result_from_ctx(self, ctx: dict) -> dict:
        """从管线上下文构建对外结果（成功 / 取消两种形态）"""
        gen_images = ctx.get("gen_images", [])
        refs = ctx.get("reference_images", [])

        if ctx.get("cancelled"):
            completed = ctx.get("completed_count", len(gen_images))
            result = {
                "images": gen_images,
                "cancelled": True,
                "session_id": ctx["session_id"],
                "output_dir": ctx["output_dir"],
                "completed_count": completed,
                "total_count": ctx.get("total_count", completed),
                "reference_image_count": len(refs),
            }
            if ctx.get("raw_dir"):
                result["raw_dir"] = ctx["raw_dir"]
            if ctx.get("profile"):
                result["profile"] = ctx["profile"]
            return result

        final_images = ctx.get("final_images") or gen_images
        layout_data = ctx.get("layout_data", {})
        extras = {}
        # 每张图的产品同一性分（语义 QA），供前端徽章展示
        qa_check = (ctx.get("qa_data", {}) or {}).get("check_result") or {}
        identity_scores = {}
        for item in qa_check.get("per_image", []) or []:
            stem = os.path.splitext(item.get("file", ""))[0]
            if stem and item.get("identity_score") is not None:
                identity_scores[stem] = item["identity_score"]
        if identity_scores:
            extras["identity_scores"] = identity_scores
            extras["identity_based"] = bool(qa_check.get("identity_based"))
        localized = ctx.get("localized_copy") or {}
        if localized:
            extras["localized_copy_path"] = localized.get("localized_copy_path", "")
            extras["localized_markets"] = localized.get("markets", [])
        compliance = ctx.get("compliance") or {}
        if compliance:
            extras["compliance_report_path"] = compliance.get("compliance_report_path", "")
            extras["compliance_pass_rate"] = compliance.get("pass_rate")
            extras["compliance_passed"] = compliance.get("passed")
        enhanced = ctx.get("enhanced_qa_data") or {}
        enhanced_data = enhanced.get("data") or {}
        if enhanced_data.get("external_consistency_status"):
            extras["external_consistency_score"] = enhanced_data.get("external_consistency_score")
            extras["external_consistency_status"] = enhanced_data.get("external_consistency_status")
            extras["external_consistency_issues"] = enhanced_data.get("external_consistency_issues", [])
            extras["external_consistency_recommendations"] = enhanced_data.get("external_consistency_recommendations", [])
        return {
            **extras,
            "images": final_images,
            "consistency_score": ctx.get("score"),
            "consistency_passed": ctx.get("qa_data", {}).get("consistency_passed", False),
            "auto_regen_rounds_used": ctx.get("auto_regen_rounds_used", 0),
            "session_id": ctx["session_id"],
            "output_dir": ctx["output_dir"],
            "raw_dir": ctx.get("raw_dir", ctx["output_dir"]),
            "final_dir": layout_data.get("final_dir", ctx.get("raw_dir", "")),
            "layout_dir": ctx.get("layout_dir", ""),
            "platforms_dir": layout_data.get("platforms_dir", ""),
            "platform_count": layout_data.get("platform_count", 0),
            "platform_file_count": layout_data.get("platform_file_count", 0),
            "platforms": ctx["platforms"],
            "auto_engine": ctx["auto_engine"],
            "quality": ctx["quality"],
            "brand_name": ctx["brand_name"],
            "download_url": f"/api/download/{ctx['session_id']}",
            "reference_image_count": len(refs),
            "reference_images": [os.path.basename(p) for p in refs],
        }

    # ============================================================
    # 4. 辅助任务（非子智能体）
    # ============================================================

    def _tool_record_feedback(self, liked: list, disliked: list,
                              product_name: str = "",
                              scene_details: dict = None) -> dict:
        """记录用户反馈偏好"""
        self._ensure_scripts_path()
        from ab_test_runner import record_feedback

        print(f"  [Orchestrator] 📝 记录用户反馈...")
        record_feedback(
            product_name=product_name,
            liked=liked,
            disliked=disliked,
            scene_details=scene_details or {},
        )
        return {
            "liked_count": len(liked or []),
            "disliked_count": len(disliked or []),
            "recorded": True,
        }

    def _tool_ab_test(self, profile_path: str, image_paths: list,
                      output_dir: str, scene_ids: list = None,
                      variants: int = 2, engine: str = "dalle",
                      api_key: str = "", session_id: str = "") -> dict:
        """A/B 测试变体生成"""
        self._ensure_scripts_path()
        from ab_test_runner import generate_ab_variants, DEFAULT_SCENES

        ab_dir = os.path.join(output_dir, "ab_test")
        os.makedirs(ab_dir, exist_ok=True)
        scenes = scene_ids or DEFAULT_SCENES[:3]

        print(f"  [Orchestrator] 🧪 A/B 测试（{len(scenes)} 场景 × {variants} 变体）...")
        results = generate_ab_variants(
            profile_path=profile_path,
            reference_images=image_paths,
            output_dir=ab_dir,
            scene_ids=scenes,
            variants=variants,
            engine=engine,
            api_key=api_key,
        )
        success = sum(1 for r in results if r.get("success"))
        ab_images = []
        for r in results:
            if not r.get("success") or not r.get("output_path"):
                continue
            rel = os.path.relpath(r["output_path"], output_dir).replace("\\", "/")
            ab_images.append({
                "filename": rel,
                "scene_id": r.get("scene_id", ""),
                "scene_name": r.get("scene_name", ""),
                "label": rel,
                "variant": r.get("variant"),
            })
        return {
            "ab_dir": ab_dir,
            "variant_count": success,
            "total": len(results),
            "results": results,
            "images": ab_images,
            "session_id": session_id or os.path.basename(os.path.dirname(ab_dir)),
        }

    def _tool_prepare_download(self, output_dir: str) -> dict:
        """准备下载包"""
        zip_buffer = io.BytesIO()
        file_count = 0
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                        fpath = os.path.join(root, f)
                        arcname = os.path.relpath(fpath, output_dir)
                        zf.write(fpath, arcname)
                        file_count += 1

        zip_buffer.seek(0)
        zip_b64 = base64.b64encode(zip_buffer.getvalue()).decode("utf-8")

        return {
            "file_count": file_count,
            "zip_size": zip_buffer.tell(),
            "zip_base64": zip_b64,
        }

    def _tool_adjust_scene_plan(self, current_plan: list,
                                 user_message: str, extracted: dict) -> dict:
        """根据用户反馈调整场景计划"""
        mentioned = extracted.get("mentioned_scenes", [])

        adjusted = []
        skipped = []
        for scene in current_plan:
            scene_name = scene.get("scene_name", "")
            scene_id = scene.get("scene_id", "")

            should_skip = False
            for keyword in mentioned:
                if keyword in scene_name or keyword in scene_id:
                    if any(k in user_message for k in ["去掉", "不要", "删除", "remove", "skip"]):
                        should_skip = True
                        skipped.append(scene_name)
                        break

            if not should_skip:
                adjusted.append(scene)

        if "只要" in user_message or "only" in user_message.lower():
            keep = []
            for scene in current_plan:
                scene_name = scene.get("scene_name", "")
                if any(k in scene_name or k in scene.get("scene_id", "") for k in mentioned):
                    keep.append(scene)
            if keep:
                adjusted = keep

        return {
            "original_count": len(current_plan),
            "adjusted_count": len(adjusted),
            "skipped": skipped,
            "adjusted_plan": adjusted,
            "note": "根据用户需求，已调整场景。",
        }

    def _execute_feedback(self, params: dict) -> dict:
        """执行反馈记录"""
        liked = params.get("liked", [])
        disliked = params.get("disliked", [])
        product_name = params.get("product_name", "")
        scene_details = params.get("scene_details", {})
        output_dir = params.get("output_dir", "")

        def _resolve(names):
            paths = []
            for name in names:
                if os.path.isabs(name) and os.path.exists(name):
                    paths.append(name)
                    continue
                for sub in ["layout", "final", "raw", ""]:
                    base = os.path.join(output_dir, sub) if sub else output_dir
                    candidate = os.path.join(base, name)
                    if os.path.exists(candidate):
                        paths.append(candidate)
                        break
                else:
                    paths.append(name)
            return paths

        return self._tool_record_feedback(
            liked=_resolve(liked),
            disliked=_resolve(disliked),
            product_name=product_name,
            scene_details=scene_details,
        )

    def _execute_ab_test(self, params: dict,
                         progress_callback: Optional[Callable] = None) -> dict:
        """执行 A/B 测试"""
        image_paths = params.get("image_paths", [])
        profile_path = params.get("profile_path", "")
        session_id = params.get("session_id", "")
        output_dir = params.get("output_dir", "")
        api_key = os.environ.get("GEMINI_API_KEY", "")

        if not output_dir:
            output_dir = os.path.join(self.output_base, session_id)

        if not profile_path or not os.path.exists(profile_path):
            analyze_data = self._run_analyst(
                {"task_id": params.get("task_id", ""), "type": "analyze", "params": params},
                params, progress_callback,
            )
            profile_path = analyze_data.get("profile_path", "")

        if progress_callback:
            progress_callback("generator", "generate", "正在生成 A/B 变体...", progress=50)

        return self._tool_ab_test(
            profile_path=profile_path,
            image_paths=image_paths,
            output_dir=output_dir,
            scene_ids=params.get("scene_ids"),
            variants=params.get("variants", 2),
            api_key=api_key,
            session_id=session_id,
        )

    def _execute_adjust(self, params: dict) -> dict:
        """执行场景调整"""
        return self._tool_adjust_scene_plan(
            params.get("current_plan", []),
            params.get("user_message", ""),
            params.get("extracted", {}),
        )

    def _execute_download(self, params: dict) -> dict:
        """执行下载准备"""
        output_dir = params.get("output_dir", "")
        if not output_dir or not os.path.exists(output_dir):
            session_id = params.get("session_id", "")
            output_dir = os.path.join(self.output_base, session_id)
        return self._tool_prepare_download(output_dir)

    # ============================================================
    # 5. 自我检查（汇总子智能体结果）
    # ============================================================

    def self_check(self, report: dict) -> dict:
        """编排器汇总自检"""
        issues = []
        data = report.get("data", {})

        if report["status"] == "error":
            issues.append(f"执行失败: {report.get('error')}")

        if report["status"] == "cancelled":
            data = report.get("data", {})
            if report.get("type") == "generate" and not data.get("images"):
                issues.append("取消时未生成任何图片")
            return {"passed": len(issues) == 0, "issues": issues}

        for sub in report.get("sub_agents", []):
            sc = sub.get("self_check", {})
            if not sc.get("passed"):
                agent = sub.get("agent", "unknown")
                for issue in sc.get("issues", []):
                    issues.append(f"[{agent}] {issue}")

        task_type = report.get("type", "")

        if task_type == "analyze":
            profile = data.get("profile", {})
            if not profile:
                issues.append("产品档案为空")
            elif not profile.get("product_name"):
                issues.append("缺少产品名称")
            if not data.get("scene_plan"):
                issues.append("场景计划为空")

        elif task_type == "generate":
            if not data.get("images"):
                issues.append("没有生成任何图片")
            score = data.get("consistency_score")
            if score is None:
                issues.append("一致性检测未返回有效评分")
            elif score < 60:
                issues.append(f"一致性评分偏低: {score}")

        elif task_type == "feedback":
            if not data.get("recorded"):
                issues.append("反馈未成功记录")

        elif task_type == "ab_test":
            if not data.get("variant_count"):
                issues.append("未生成 A/B 变体")

        elif task_type in ("research", "web_search", "browse"):
            if not (data.get("search_results") or data.get("competitors") or data.get("pages")):
                issues.append("研究未返回有效结果")

        return {"passed": len(issues) == 0, "issues": issues}
