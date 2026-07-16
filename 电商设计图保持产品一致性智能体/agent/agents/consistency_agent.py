#!/usr/bin/env python3
"""
ConsistencyGuardAgent — 增强产品一致性检测 Agent（不替换现有 QA，叠加层）

职责：
  作为外部一致性检测 Agent 的子 Agent 包装，遵守 BaseSubAgent 契约。
  在现有 QA Agent 检测完成后，额外调用外部 Agent 做增强一致性检查。
  不修改不干扰现有 QA Agent。

用法（手动，不需改管线）：
  from agents.consistency_agent import ConsistencyGuardAgent
  agent = ConsistencyGuardAgent()
  agent.receive_task(task)
  report = agent.execute(task)

输出数据结构（写入 data.external_consistency_*，不覆盖现有 data 字段）：
  data.external_consistency_score    — 外部 Agent 评分 (0-100)
  data.external_consistency_status   — passed/failed/skipped/error
  data.external_consistency_issues   — 问题列表
  data.external_consistency_report   — 完整报告
"""

from __future__ import annotations

import os
import time
from typing import Optional, Callable

from .base_agent import BaseSubAgent
from .consistency_adapter import ConsistencyAdapter


class ConsistencyGuardAgent(BaseSubAgent):
    """
    增强产品一致性检测 Agent。

    不替换现有 QA，作为增强检查层叠加执行。
    未配置外部 Agent 端点时自动跳过（不报错不阻塞）。
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
        执行外部一致性增强检测。

        输入 task.params:
          - image_paths: list[str]       — 待检测的生成图路径
          - profile: dict                — 产品档案
          - reference_images: list[str]  — 参考产品图路径

        返回标准 BaseSubAgent report dict:
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

            # 从 task_plan 提取场景 ID 作为附加上下文
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
                    "正在进行外部增强一致性检测...",
                    progress=95,
                )

            result = self.adapter.check(
                image_paths=image_paths,
                profile=profile,
                ref_images=ref_images,
                context=context,
            )

            # 如果 adapter 返回 error（网络/超时/解析失败），以 agent error 上报
            if result.get("status") == "error":
                issues = list(result.get("issues", []))
                return self._wrap_report(
                    task,
                    {"external_consistency_status": "error",
                     "external_consistency_issues": issues,
                     "external_consistency_score": 0.0},
                    status="error",
                    error="; ".join(issues) if issues else "外部一致性检测失败",
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
            print(f"  [{self.AGENT_LABEL}] ❌ 执行失败: {e}")
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
        增强检测结果自检。

        只有 status=error 时标记为未通过，
        skipped（未配置 Agent）视为通过。
        """
        issues = []
        if report["status"] == "error":
            issues.append(f"外部一致性检测失败: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        status = data.get("external_consistency_status", "skipped")

        if status == "error":
            issues.append("外部一致性检测返回异常")
        elif status == "failed":
            score = data.get("external_consistency_score", 0)
            issue_count = len(data.get("external_consistency_issues", []))
            issues.append(
                f"外部一致性检测未通过: 评分 {score}，"
                f"{issue_count} 个问题"
            )

        return {"passed": len(issues) == 0, "issues": issues}
