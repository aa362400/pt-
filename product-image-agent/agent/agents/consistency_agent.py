#!/usr/bin/env python3
"""
ConsistencyGuardAgent — english_textconsistencydetection Agent（english_textyes QA，english_text）

text：
  english_textconsistencydetection Agent text Agent packaging，text BaseSubAgent text。
  textyes QA Agent detectioncompletedtext，english_text Agent english_textconsistencytext。
  english_textyes QA Agent。

text（text，english_text）：
  from agents.consistency_agent import ConsistencyGuardAgent
  agent = ConsistencyGuardAgent()
  agent.receive_task(task)
  report = agent.execute(task)

outputdatatext（write data.external_consistency_*，english_textyes data fields）：
  data.external_consistency_score    — text Agent text (0-100)
  data.external_consistency_status   — passed/failed/skipped/error
  data.external_consistency_issues   — english_text
  data.external_consistency_report   — textreport
"""

from __future__ import annotations

import os
import time
from typing import Optional, Callable

from .base_agent import BaseSubAgent
from .consistency_adapter import ConsistencyAdapter


class ConsistencyGuardAgent(BaseSubAgent):
    """
    english_textconsistencydetection Agent。

    english_textyes QA，english_text。
    textconfigurationtext Agent english_textautomatictext（english_text）。
    """

    AGENT_LABEL = "ConsistencyGuard"

    def __init__(self, agent_id: str = "consistency_01",
                 adapter: Optional[ConsistencyAdapter] = None):
        super().__init__(agent_id)
        self.adapter = adapter or ConsistencyAdapter()

    def execute(self, task: dict,
                progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """
        english_textconsistencytextdetection。

        input task.params:
          - image_paths: list[str]       — textdetectiontextgenerationenglish_text
          - profile: dict                — english_text
          - reference_images: list[str]  — english_text

        english_text BaseSubAgent report dict:
          status: success / error / cancelled
          data.external_consistency_*
        """
        params = task.get("params", {})
        start = time.time()

        if cancel_check and cancel_check():
            data = {"cancelled": True}
            return self._wrap_report(task, data, status="success", start=start)

        try:
            image_paths = params.get("image_paths", [])
            profile = params.get("profile", {})
            ref_images = params.get("reference_images", [])
            task_plan = params.get("task_plan", [])

            # text task_plan textscene ID english_text
            scene_ids = [
                step.get("scene_id", step.get("step", ""))
                for step in task_plan if isinstance(step, dict)
            ]

            context = {
                "session_id": params.get("session_id", ""),
                "product_name": params.get("product_name", ""),
                "scene_ids": scene_ids,
            }

            if progress_callback:
                progress_callback(
                    self.AGENT_LABEL, "check",
                    "english_textconsistencydetection...",
                    progress=95,
                )

            result = self.adapter.check(
                image_paths=image_paths,
                profile=profile,
                ref_images=ref_images,
                context=context,
            )

            # text adapter text error（text/text/textfailed），text agent error text
            if result.get("status") == "error":
                issues = list(result.get("issues", []))
                return self._wrap_report(
                    task,
                    {"external_consistency_status": "error",
                     "external_consistency_issues": issues,
                     "external_consistency_score": 0.0},
                    status="error",
                    error="; ".join(issues) if issues else "textconsistencydetectionfailed",
                    start=start,
                )

            data = {
                "external_consistency_score": result["score"],
                "external_consistency_status": result["status"],
                "external_consistency_issues": list(result.get("issues", [])),
                "external_consistency_recommendations": list(result.get("recommendations", [])),
                "external_consistency_report": result,
            }

            return self._wrap_report(task, data, status="success", start=start)

        except Exception as e:
            print(f"  [{self.AGENT_LABEL}] ❌ textfailed: {e}")
            return self._wrap_report(
                task,
                {"external_consistency_status": "error",
                 "external_consistency_issues": [str(e)],
                 "external_consistency_score": 0.0},
                status="error",
                error=str(e),
                start=start,
            )

    def self_check(self, report: dict) -> dict:
        """
        textdetectionenglish_text。

        textyes status=error english_textpassed，
        skipped（textconfiguration Agent）textpassed。
        """
        issues = []
        if report["status"] == "error":
            issues.append(f"textconsistencydetectionfailed: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        status = data.get("external_consistency_status", "skipped")

        if status == "error":
            issues.append("textconsistencydetectionenglish_text")
        elif status == "failed":
            score = data.get("external_consistency_score", 0)
            issue_count = len(data.get("external_consistency_issues", []))
            issues.append(
                f"textconsistencydetectiontextpassed: text {score}，"
                f"{issue_count} english_text"
            )

        return {"passed": len(issues) == 0, "issues": issues}
