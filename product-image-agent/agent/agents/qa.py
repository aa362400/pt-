#!/usr/bin/env python3
"""
textagent — QA Agent

text：consistencydetection + emotion_scorer text hook
text：consistency_checker
text：score, report, pass/fail
"""

import os
import time
from typing import Optional, Callable

from common.runtime_paths import get_runtime_paths

from .base_agent import BaseSubAgent
from .toolkit import AgentToolkit


class QAAgent(BaseSubAgent):
    """textagent：consistencydetectionenglish_text"""

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
        """textconsistencydetection（english_text）"""
        params = task.get("params", {})
        start = time.time()

        try:
            image_dir = params.get("image_dir", "")
            profile_path = params.get("profile_path", "")
            output_dir = params.get("output_dir", "")
            scene_plan = params.get("scene_plan", [])

            if progress_callback:
                progress_callback("qa", "check", "english_textconsistencydetection...", progress=94)

            check_result = self.toolkit.check_consistency(
                image_dir, profile_path, output_dir, log_prefix="QA",
                reference_images=params.get("reference_images"),
            )
            score = check_result.get("consistency_score")
            if score is None:
                raise RuntimeError(check_result.get("error", "consistencydetectionfailed"))

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
            print(f"  [QA] ❌ textfailed: {e}")
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)

    def self_check(self, report: dict) -> dict:
        """english_text"""
        issues = []
        if report["status"] == "error":
            issues.append(f"textfailed: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        score = data.get("consistency_score")
        if score is None:
            issues.append("consistencydetectionenglish_textyesenglish_text")
        elif score < 60:
            issues.append(f"consistencyenglish_text: {score}")

        return {"passed": len(issues) == 0, "issues": issues}
