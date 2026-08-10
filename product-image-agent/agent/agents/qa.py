#!/usr/bin/env python3
"""
质检智能体 — QA Agent

职责：一致性检测 + emotion_scorer 可选 hook
工具：consistency_checker
返回：score, report, pass/fail
"""

import os
import time
from typing import Optional, Callable

from common.runtime_paths import get_runtime_paths

from .base_agent import BaseSubAgent
from .toolkit import AgentToolkit


class QAAgent(BaseSubAgent):
    """质检智能体：一致性检测与情绪评分"""

    AGENT_LABEL = "QA"

    def __init__(self, agent_id: str = "qa_01", toolkit: AgentToolkit = None):
        super().__init__(agent_id)
        if toolkit is None:
            base = os.path.join(os.path.dirname(__file__), "..")
            self.toolkit = AgentToolkit(
                script_dir=os.path.join(base, "scripts"),
                template_dir=os.path.join(base, "templates", "scenes"),
                output_base=get_runtime_paths().outputs,
            )
        else:
            self.toolkit = toolkit

        self.tools = {
            "check_consistency": self.toolkit.check_consistency,
            "score_emotion": self.toolkit.score_emotion,
        }
        self.enable_emotion_scorer = False

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """执行一致性检测（可选情绪评分）"""
        params = task.get("params", {})
        start = time.time()

        try:
            image_dir = params.get("image_dir", "")
            profile_path = params.get("profile_path", "")
            output_dir = params.get("output_dir", "")
            scene_plan = params.get("scene_plan", [])

            if progress_callback:
                progress_callback("qa", "check", "正在进行一致性检测...", progress=94)

            check_result = self.toolkit.check_consistency(
                image_dir, profile_path, output_dir, log_prefix="QA",
                reference_images=params.get("reference_images"),
            )
            score = check_result.get("consistency_score")
            if score is None:
                raise RuntimeError(check_result.get("error", "一致性检测失败"))

            emotion_data = {}
            if self.enable_emotion_scorer or params.get("enable_emotion_scorer"):
                exts = (".jpg", ".jpeg", ".png", ".webp")
                image_paths = sorted([
                    os.path.join(image_dir, f) for f in os.listdir(image_dir)
                    if f.lower().endswith(exts) and not f.startswith("_")
                ]) if os.path.isdir(image_dir) else []
                emotion_data = self.toolkit.score_emotion(image_paths, scene_plan)

            data = {
                "consistency_score": score,
                "consistency_passed": check_result.get("passed", False),
                "report_path": check_result.get("report_path", ""),
                "check_result": check_result.get("check_result", {}),
                "emotion": emotion_data,
            }
            return self._wrap_report(task, data, status="success", start=start)

        except Exception as e:
            print(f"  [QA] ❌ 执行失败: {e}")
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)

    def self_check(self, report: dict) -> dict:
        """质检结果自检"""
        issues = []
        if report["status"] == "error":
            issues.append(f"执行失败: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        score = data.get("consistency_score")
        if score is None:
            issues.append("一致性检测未返回有效评分")
        elif score < 60:
            issues.append(f"一致性评分偏低: {score}")

        return {"passed": len(issues) == 0, "issues": issues}
