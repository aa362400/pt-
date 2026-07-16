#!/usr/bin/env python3
"""
声明式管线图 — Declarative Pipeline Graph

把「analyze → generate → subject_lock → layout → qa（不合格回跳重生成）」
这类多智能体协作流程声明成数据结构，由统一 Runner 执行：

  - Step：命名步骤，携带条件（when）与执行函数（run: ctx -> 增量更新）
  - LoopEdge：条件回跳边（如 QA 不合格 → 回跳 generate），带最大轮数
  - Pipeline：顺序 + 条件跳过 + 受控循环 + 取消检查 + 追踪 span

约定：
  - ctx 是共享上下文 dict；step.run 返回的 dict 会 merge 进 ctx
  - 取消：runner 在每步前调用 ctx["cancel_check"]()，命中则置
    ctx["cancelled"]=True 并停止
  - 循环轮内出现异常：视为「重试失败」，保留上一轮成功结果并跳出循环
    （首轮/非循环步骤异常则正常抛出）
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from .telemetry import Telemetry, NullTelemetry


@dataclass
class Step:
    name: str
    run: Callable[[dict], Optional[dict]]
    when: Optional[Callable[[dict], bool]] = None  # False 时跳过
    agent: str = ""


@dataclass
class LoopEdge:
    """在 after 步骤完成后，若 while_ 为真则回跳到 back_to 步骤"""
    after: str
    back_to: str
    while_: Callable[[dict], bool]
    max_rounds: int = 1
    prepare: Optional[Callable[[dict], None]] = None  # 回跳前修改 ctx
    rounds_used: int = field(default=0, init=False)


class Pipeline:
    """多智能体协作管线执行器"""

    def __init__(self, name: str, steps: list, loops: list = None,
                 telemetry: Telemetry = None):
        self.name = name
        self.steps = steps
        self.loops = loops or []
        self.telemetry = telemetry or NullTelemetry()
        self._index = {s.name: i for i, s in enumerate(steps)}
        for loop in self.loops:
            if loop.after not in self._index or loop.back_to not in self._index:
                raise ValueError(f"循环边引用了不存在的步骤: {loop.after} -> {loop.back_to}")
            if self._index[loop.back_to] > self._index[loop.after]:
                raise ValueError(f"循环边必须向前回跳: {loop.after} -> {loop.back_to}")

    def _cancelled(self, ctx: dict) -> bool:
        if ctx.get("cancelled"):
            return True
        cancel_check = ctx.get("cancel_check")
        if cancel_check and cancel_check():
            ctx["cancelled"] = True
            return True
        return False

    def _in_loop_round(self, step_index: int) -> bool:
        """当前步骤是否处于某条循环边的回跳轮（非首轮）"""
        for loop in self.loops:
            if loop.rounds_used > 0 and \
                    self._index[loop.back_to] <= step_index <= self._index[loop.after]:
                return True
        return False

    def run(self, ctx: dict) -> dict:
        for loop in self.loops:
            loop.rounds_used = 0

        i = 0
        with self.telemetry.span(f"pipeline:{self.name}"):
            while i < len(self.steps):
                if self._cancelled(ctx):
                    break
                step = self.steps[i]
                if step.when and not step.when(ctx):
                    i += 1
                    continue
                try:
                    with self.telemetry.span(f"step:{step.name}", agent=step.agent):
                        updates = step.run(ctx)
                    if updates:
                        ctx.update(updates)
                except Exception as e:
                    if self._in_loop_round(i):
                        # 重生成轮失败：保留上一轮成功结果，跳出循环继续后续步骤
                        ctx.setdefault("loop_errors", []).append(
                            {"step": step.name, "error": str(e)})
                        self.telemetry.event("loop_round_failed", agent=step.agent,
                                             step=step.name, error=str(e)[:200])
                        i = self._skip_past_loops(i)
                        continue
                    raise

                if self._cancelled(ctx):
                    break

                # 检查是否有从当前步骤出发的回跳边
                jumped = False
                for loop in self.loops:
                    if loop.after != step.name:
                        continue
                    if loop.rounds_used >= loop.max_rounds:
                        continue
                    if self._cancelled(ctx) or not loop.while_(ctx):
                        continue
                    loop.rounds_used += 1
                    if loop.prepare:
                        loop.prepare(ctx)
                    self.telemetry.event(
                        "loop_back", step=loop.back_to,
                        round=loop.rounds_used, max_rounds=loop.max_rounds,
                    )
                    i = self._index[loop.back_to]
                    jumped = True
                    break
                if not jumped:
                    i += 1
        return ctx

    def _skip_past_loops(self, current_index: int) -> int:
        """循环轮失败时：跳到覆盖当前步骤的所有循环边之后"""
        next_i = current_index + 1
        for loop in self.loops:
            if loop.rounds_used > 0 and \
                    self._index[loop.back_to] <= current_index <= self._index[loop.after]:
                next_i = max(next_i, self._index[loop.after] + 1)
        return next_i
