"""Dual-agent orchestration engine used by the Flask web layer."""

from __future__ import annotations

import os

from common.utils import CROSS_BORDER_PLATFORMS
from agents.blackboard import SharedBlackboard
from agents.executor import ExecutorAgent
from agents.observer import ObserverAgent


class DualAgentEngine:
    """
    双智能体引擎。
    每次用户发消息，执行步骤固定：
      1. 观察者理解用户消息
      2. 观察者先回复用户（他在干什么）
      3. 观察者决定是否派任务
      4. 执行者接收并执行任务
      5. 执行者向观察者汇报
      6. 观察者监督验证
      7. 观察者给用户最终回复
    """

    def __init__(self, session_id: str, output_root: str, sessions_dir: str):
        self.session_id = session_id
        self.output_root = output_root
        self.sessions_dir = sessions_dir
        output_dir = os.path.join(output_root, session_id)
        self.blackboard = SharedBlackboard.load(
            session_id, base_dir=sessions_dir, output_dir=output_dir,
        )
        if not self.blackboard.output_dir:
            self.blackboard.output_dir = output_dir
        os.makedirs(self.blackboard.output_dir, exist_ok=True)

        self.observer = ObserverAgent(agent_id=f"observer_{session_id}")
        self.executor = ExecutorAgent(agent_id=f"executor_{session_id}")
        self.observer.blackboard = self.blackboard
        self.executor.blackboard = self.blackboard

        self._sync_observer_from_blackboard()

    @property
    def context(self) -> dict:
        """Backward-compatible view of session state (delegates to blackboard)."""
        return self.blackboard.to_legacy_context()

    def _sync_observer_from_blackboard(self):
        """Restore observer state from persisted blackboard."""
        bb = self.blackboard
        prefs = bb.preferences
        self.observer.state["session_id"] = self.session_id
        self.observer.state["output_dir"] = bb.output_dir
        self.observer.state["scene_dir"] = os.path.join(
            os.path.dirname(__file__), "..", "templates", "scenes"
        )
        self.observer.state["image_paths"] = list(bb.image_paths)
        self.observer.state["has_images"] = len(bb.image_paths) > 0
        self.observer.state["image_count"] = len(bb.image_paths)
        self.observer.state["profile_path"] = bb.profile_path
        self.observer.state["plan_path"] = bb.plan_path
        self.observer.state["scene_plan"] = bb.scene_plan
        self.observer.state["confirmed_scenes"] = bb.confirmed_scenes
        self.observer.state["generation_count"] = getattr(bb, "generation_count", None)
        self.observer.state["product_name"] = (
            bb.product_name or (bb.profile or {}).get("product_name", "")
        )
        self.observer.state["profile_ready"] = bool(bb.profile)
        self.observer.state["scenes_ready"] = bool(bb.scene_plan)
        self.observer.state["generation_ready"] = bool(bb.layout_images)
        self.observer.state["conversation_history"] = list(self.observer.state.get("conversation_history", []))
        self.observer.state["user_preferences"] = {
            "brand_name": prefs.get("brand_name", ""),
            "watermark_path": prefs.get("watermark_path", ""),
            "platforms": prefs.get("platforms", list(CROSS_BORDER_PLATFORMS)),
            "quality": prefs.get("quality", "standard"),
            "auto_engine": prefs.get("auto_engine", False),
            "generation_count": prefs.get("generation_count"),
        }
        if bb.layout_images:
            gen_result = {
                "images": bb.layout_images,
                "consistency_score": bb.consistency_score,
            }
            if bb.external_consistency_status:
                gen_result["external_consistency_score"] = bb.external_consistency_score
                gen_result["external_consistency_status"] = bb.external_consistency_status
                gen_result["external_consistency_issues"] = bb.external_consistency_issues
                gen_result["external_consistency_recommendations"] = bb.external_consistency_recommendations
            self.observer.state["generation_result"] = gen_result

    def apply_options_from_intent(self, intent: dict):
        """将用户消息中的选项同步到会话上下文"""
        extracted = intent.get("extracted", {})
        prefs = self.observer.state.setdefault("user_preferences", {})
        partial = {}
        for key in ("brand_name", "watermark_path", "platforms", "quality", "auto_engine",
                    "generation_count", "markets", "region", "festival"):
            if key in extracted:
                prefs[key] = extracted[key]
                partial[key] = extracted[key]
        if partial:
            self.blackboard.update(partial, agent_id=self.observer.agent_id)
            self.blackboard.save()
        self._sync_observer_from_blackboard()

    def add_images(self, file_paths: list):
        """添加图片到上下文"""
        paths = list(self.blackboard.image_paths)
        for p in file_paths:
            if p not in paths:
                paths.append(p)
        self.blackboard.set("image_paths", paths, agent_id=self.observer.agent_id)
        self.blackboard.save()
        self._sync_observer_from_blackboard()

    # ─── 第1步：观察者理解用户 ───

    def step_observer_understand(self, user_message: str, has_images: bool = False) -> dict:
        """观察者理解用户意图"""
        intent = self.observer.understand(user_message, has_images)
        effective_has_images = (
            has_images
            or bool(self.blackboard.image_paths)
            or bool(self.observer.state.get("has_images"))
        )
        if (
            intent.get("intent") in ("web_search", "research", "browse")
            and effective_has_images
            and self.observer._message_requests_product_flow(user_message)
        ):
            intent = self.observer._understand_regex(user_message, effective_has_images)
            intent["corrected_from"] = "research_with_session_images"
        self.blackboard.append_event(self.observer.agent_id, "understand", {
            "intent": intent.get("intent"),
            "llm_mode": intent.get("llm_mode", False),
        })
        self.blackboard.save()
        return intent

    # ─── 第2步：观察者先回复用户 ───

    def step_observer_reply_first(self, intent: dict) -> dict:
        """观察者先对用户说话，含主动提问与快捷回复"""
        return self.observer.decide_reply(intent)

    # ─── 第3步：观察者决定是否派任务 ───

    def step_observer_dispatch(self, intent: dict):
        """观察者决定是否派任务给执行者"""
        task = self.observer.dispatch(intent)
        return task

    # ─── 第4步：执行者接收并执行任务 ───

    def step_executor_execute(self, task: dict, progress_callback=None,
                              cancel_check=None) -> dict:
        """执行者执行任务"""
        if not task:
            return None
        self.executor.receive_task(task)
        report = self.executor.execute(task, progress_callback, cancel_check=cancel_check)
        return report

    # ─── 第5步：观察者监督验证 ───

    def step_observer_supervise(self, report: dict) -> dict:
        """观察者监督验证执行结果"""
        task_id = report.get("task_id", "")
        result = self.observer.supervise(task_id, report)
        return result

    # ─── 第6步：观察者给用户最终回复 ───

    def step_observer_final_reply(self, supervision: dict, original_reply: str) -> str:
        """观察者给出最终回复"""
        if supervision.get("approved"):
            return supervision.get("user_message", original_reply)
        else:
            return supervision.get("user_message", "⚠️ 执行结果验证未通过，请重试。")

    # ─── 全流程一键跑 ───

    def process_user_message(self, user_message: str, has_images: bool = False,
                             progress_callback=None) -> dict:
        """
        处理一条用户消息的完整流程。
        全部步骤写死，每一步都有日志。
        """
        log = []

        # 第1步：观察者理解
        intent = self.step_observer_understand(user_message, has_images)
        self.apply_options_from_intent(intent)
        log.append(f"[Observer] 理解意图: {intent['intent']} (置信度: {intent['confidence']})")

        # 第2步：观察者先回复
        decide_result = self.step_observer_reply_first(intent)
        observer_reply = decide_result["reply"]
        log.append(f"[Observer] 回复用户: {observer_reply[:60]}...")

        # 第3步：观察者派任务
        task = self.step_observer_dispatch(intent)
        if task:
            log.append(f"[Observer] 派发任务: {task['task_id']} (类型: {task['type']})")
        else:
            log.append(f"[Observer] 无需派发任务")

        # 第4步+第5步+第6步：如果有任务，执行→监督→最终回复
        final_reply = observer_reply
        supervision_report = None

        if task:
            log.append(f"[Executor] 接收任务: {task['task_id']}")

            # 第4步：执行者执行
            executor_report = self.step_executor_execute(task, progress_callback)
            if executor_report:
                log.append(f"[Executor] 执行完成: 状态={executor_report['status']}, "
                           f"耗时={executor_report.get('execution_time', 0):.1f}s")

                # 第5步：观察者监督
                supervision_report = self.step_observer_supervise(executor_report)
                log.append(f"[Observer] 监督验证: {'✅通过' if supervision_report.get('approved') else '❌不通过'}")

                # 第6步：观察者最终回复
                final_reply = self.step_observer_final_reply(supervision_report, observer_reply)
                log.append(f"[Observer] 最终回复: {final_reply[:60]}...")

                # 同步执行结果到上下文
                self._sync_execution_results(executor_report)

        return {
            "intent": intent,
            "observer_first_reply": observer_reply,
            "proactive_questions": decide_result.get("proactive_questions", []),
            "quick_replies": decide_result.get("quick_replies", []),
            "task": task,
            "executor_report": self.executor.last_report if task else None,
            "supervision": supervision_report,
            "final_reply": final_reply,
            "log": log,
        }

    def _sync_execution_results(self, report: dict):
        """同步执行结果到共享黑板"""
        self.blackboard.sync_from_execution_report(report, agent_id=self.executor.agent_id)
        self._sync_observer_from_blackboard()


# ══════════════════════════════════════════════════════════
# Flask 路由
