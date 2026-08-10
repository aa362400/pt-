#!/usr/bin/env python3
"""
english_text — Declarative Pipeline Graph

text「analyze → generate → subject_lock → layout → qa（english_textgeneration）」
english_textagenttextflowenglish_textdatatext，english_text Runner text：

  - Step：english_text，english_text（when）english_text（run: ctx -> english_text）
  - LoopEdge：english_text（text QA english_text → text generate），english_text
  - Pipeline：text + english_text + english_text + english_text + text span

text：
  - ctx yesenglish_text dict；step.run english_text dict text merge text ctx
  - text：runner english_text ctx["cancel_check"]()，english_text
    ctx["cancelled"]=True english_text
  - english_text：text「textfailed」，english_textsuccessenglish_text
    （text/english_text）
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from .telemetry import Telemetry, NullTelemetry


@dataclass
class Step:
    name: str
    run: Callable[[dict], Optional[dict]]
    when: Optional[Callable[[dict], bool]] = None  # False english_text
    agent: str = ""


@dataclass
class LoopEdge:
    """text after textcompletedtext，text while_ english_text back_to text"""
    after: str
    back_to: str
    while_: Callable[[dict], bool]
    max_rounds: int = 1
    prepare: Optional[Callable[[dict], None]] = None  # english_text ctx
    rounds_used: int = field(default=0, init=False)


class Pipeline:
    """textagentenglish_text"""

    def __init__(self, name: str, steps: list, loops: list = None,
                 telemetry: Telemetry = None):
        self.name = name
        self.steps = steps
        self.loops = loops or []
        self.telemetry = telemetry or NullTelemetry()
        self._index = {s.name: i for i, s in enumerate(steps)}
        for loop in self.loops:
            if loop.after not in self._index or loop.back_to not in self._index:
                raise ValueError(f"english_text: {loop.after} -> {loop.back_to}")
            if self._index[loop.back_to] > self._index[loop.after]:
                raise ValueError(f"english_text: {loop.after} -> {loop.back_to}")

    def _cancelled(self, ctx: dict) -> bool:
        if ctx.get("cancelled"):
            return True
        cancel_check = ctx.get("cancel_check")
        if cancel_check and cancel_check():
            ctx["cancelled"] = True
            return True
        return False

    def _in_loop_round(self, step_index: int) -> bool:
        """english_textyesnoenglish_text（english_text）"""
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
                        # textgenerationtextfailed：english_textsuccesstext，english_text
                        ctx.setdefault("loop_errors", []).append(
                            {"step": step.name, "error": str(e)})
                        self.telemetry.event("loop_round_failed", agent=step.agent,
                                             step=step.name, error=str(e)[:200])
                        i = self._skip_past_loops(i)
                        continue
                    raise

                if self._cancelled(ctx):
                    break

                # textyesnoyesenglish_text
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
        """english_textfailedtext：english_textyesenglish_text"""
        next_i = current_index + 1
        for loop in self.loops:
            if loop.rounds_used > 0 and \
                    self._index[loop.back_to] <= current_index <= self._index[loop.after]:
                next_i = max(next_i, self._index[loop.after] + 1)
        return next_i
