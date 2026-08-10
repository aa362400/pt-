#!/usr/bin/env python3
"""
generationagent — Generator Agent

text：textimagegeneration + auto_engine english_text
text：batch_generate via generate_batch
text：raw images, per-scene results
"""

import os
import sys
import time
from typing import Optional, Callable

_agent_root = os.path.join(os.path.dirname(__file__), "..")
if _agent_root not in sys.path:
    sys.path.insert(0, os.path.abspath(_agent_root))

from common.utils import get_image_api_key, resolve_image_engine
from common.runtime_paths import get_runtime_paths

from .base_agent import BaseSubAgent
from .toolkit import AgentToolkit


class GeneratorAgent(BaseSubAgent):
    """generationagent：textscenetext"""

    AGENT_LABEL = "Generator"

    def __init__(self, agent_id: str = "generator_01", toolkit: AgentToolkit = None):
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
        self.template_dir = self.toolkit.template_dir

        self.tools = {
            "generate_images": self.toolkit.generate_images,
        }

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """english_textgeneration"""
        params = task.get("params", {})
        start = time.time()

        try:
            image_paths = params.get("image_paths", [])
            reference_image_count = params.get("reference_image_count", len(image_paths or []))
            profile_path = params.get("profile_path", "")
            plan_path = params.get("plan_path", "")
            scene_dir = params.get("scene_dir", self.template_dir)
            session_id = params.get("session_id", "")
            output_dir = params.get("output_dir", "")
            api_key = params.get("api_key") or ""
            engine = resolve_image_engine(params.get("engine"))
            if not api_key:
                api_key = get_image_api_key(engine)
            auto_engine = params.get("auto_engine", False)
            quality = params.get("quality", "standard")

            if not output_dir:
                output_dir = os.path.join(self.toolkit.output_base, session_id)
            os.makedirs(output_dir, exist_ok=True)

            if progress_callback:
                progress_callback(
                    "generator", "generate",
                    f"english_text {reference_image_count} english_textgenerationimage...",
                    progress=45,
                    reference_image_count=reference_image_count,
                )

            gen_result = self.toolkit.generate_images(
                profile_path, plan_path, image_paths,
                output_dir, scene_dir, api_key,
                progress_callback,
                session_id=session_id,
                auto_engine=auto_engine,
                quality=quality,
                engine=engine,
                confirmed_scenes=params.get("confirmed_scenes"),
                agent_name="generator",
                cancel_check=cancel_check,
            )

            if gen_result.get("cancelled"):
                data = {
                    "images": gen_result.get("images", []),
                    "raw_dir": gen_result.get("raw_dir", output_dir),
                    "results": gen_result.get("results", []),
                    "session_id": session_id,
                    "output_dir": output_dir,
                    "auto_engine": auto_engine,
                    "quality": quality,
                    "cancelled": True,
                    "completed_count": gen_result.get("completed_count", len(gen_result.get("images", []))),
                    "total_count": gen_result.get("total_count", 0),
                    "reference_image_count": reference_image_count,
                }
                return self._wrap_report(task, data, status="cancelled", start=start)

            data = {
                "images": gen_result.get("images", []),
                "raw_dir": gen_result.get("raw_dir", output_dir),
                "results": gen_result.get("results", []),
                "session_id": session_id,
                "output_dir": output_dir,
                "auto_engine": auto_engine,
                "quality": quality,
                "reference_image_count": reference_image_count,
            }
            return self._wrap_report(task, data, status="success", start=start)

        except Exception as e:
            print(f"  [Generator] ❌ textfailed: {e}")
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)

    def self_check(self, report: dict) -> dict:
        """generationenglish_text"""
        issues = []
        if report["status"] == "cancelled":
            data = report.get("data", {})
            if data.get("images"):
                return {"passed": True, "issues": []}
            issues.append("english_textgenerationtextimage")
            return {"passed": False, "issues": issues}
        if report["status"] == "error":
            issues.append(f"textfailed: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        images = data.get("images", [])
        if not images:
            issues.append("textyesgenerationtextimage")
        else:
            raw_dir = data.get("raw_dir", "")
            for img in images:
                fname = img.get("filename", "")
                if raw_dir and fname:
                    candidate = os.path.join(raw_dir, fname)
                    if not os.path.exists(candidate):
                        issues.append(f"imagefileenglish_text: {fname}")

        return {"passed": len(issues) == 0, "issues": issues}
