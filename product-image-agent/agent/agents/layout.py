#!/usr/bin/env python3
"""
排版智能体 — Layout Agent

职责：后处理 → 排版 → 多平台适配
工具：style_pipeline, layout_engine, platform_adapter
返回：final paths, platform counts
"""

import os
import time
from pathlib import Path
from typing import Optional, Callable

from common.runtime_paths import get_runtime_paths

from .base_agent import BaseSubAgent
from .toolkit import AgentToolkit


class LayoutAgent(BaseSubAgent):
    """排版智能体：后处理、排版、多平台输出"""

    AGENT_LABEL = "Layout"

    def __init__(self, agent_id: str = "layout_01", toolkit: AgentToolkit = None):
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
            "post_process": self.toolkit.post_process,
            "layout": self.toolkit.layout,
            "platform_adapt": self.toolkit.platform_adapt,
        }

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        """执行排版管线：后处理 → 排版 → 多平台"""
        params = task.get("params", {})
        start = time.time()

        try:
            raw_dir = params.get("raw_dir", "")
            output_dir = params.get("output_dir", "")
            profile_path = params.get("profile_path", "")
            watermark_path = params.get("watermark_path", "")
            brand_name = params.get("brand_name", "")
            product_name = params.get("product_name", "")
            from common.utils import CROSS_BORDER_PLATFORMS
            platforms = params.get("platforms") or list(CROSS_BORDER_PLATFORMS)
            template = params.get("template", "product_main")

            if not output_dir:
                output_dir = os.path.join(
                    self.toolkit.output_base, params.get("session_id", ""),
                )
            os.makedirs(output_dir, exist_ok=True)

            # 步骤 1: 后处理
            if progress_callback:
                progress_callback("layout", "postprocess", "正在进行后处理（调色/水印）...", progress=72)

            post_result = self.toolkit.post_process(
                raw_dir, output_dir, profile_path,
                watermark_path=watermark_path,
                brand_name=brand_name,
                log_prefix="Layout",
            )
            final_dir = post_result.get("final_dir", raw_dir)

            # 步骤 2: 排版
            if progress_callback:
                progress_callback("layout", "layout", "正在排版（product_main 模板）...", progress=80)

            layout_result = self.toolkit.layout(
                final_dir, output_dir,
                brand_name=brand_name,
                product_name=product_name,
                template=template,
                log_prefix="Layout",
            )
            layout_dir = layout_result.get("layout_dir", final_dir)

            # 步骤 3: 多平台适配
            if progress_callback:
                progress_callback(
                    "layout", "platform",
                    f"正在适配 {len(platforms)} 个平台...", progress=88,
                )

            platform_result = self.toolkit.platform_adapt(
                layout_dir, output_dir, platforms, log_prefix="Layout",
            )

            images = self._collect_images_from_dir(layout_dir, "layout")

            data = {
                "images": images,
                "final_dir": final_dir,
                "layout_dir": layout_dir,
                "platforms_dir": platform_result.get("platforms_dir", ""),
                "platform_count": platform_result.get("platform_count", 0),
                "platform_file_count": platform_result.get("platform_file_count", 0),
                "platforms": platforms,
                "post_processed_count": post_result.get("processed_count", 0),
                "layout_processed_count": layout_result.get("processed_count", 0),
                "output_dir": output_dir,
            }
            return self._wrap_report(task, data, status="success", start=start)

        except Exception as e:
            print(f"  [Layout] ❌ 执行失败: {e}")
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)

    def _collect_images_from_dir(self, image_dir: str, subpath: str = "") -> list:
        """从目录收集图片元数据"""
        if not os.path.isdir(image_dir):
            return []
        images = []
        for f in sorted(os.listdir(image_dir)):
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and not f.startswith("_"):
                images.append({
                    "filename": f,
                    "scene_name": Path(f).stem,
                    "scene_id": Path(f).stem,
                    "subdir": subpath,
                })
        return images

    def self_check(self, report: dict) -> dict:
        """排版结果自检"""
        issues = []
        if report["status"] == "error":
            issues.append(f"执行失败: {report.get('error')}")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        layout_dir = data.get("layout_dir", "")
        images = data.get("images", [])
        if not images:
            issues.append("排版后没有输出图片")
        elif layout_dir:
            for img in images:
                fname = img.get("filename", "")
                candidate = os.path.join(layout_dir, fname)
                if fname and not os.path.exists(candidate):
                    issues.append(f"排版图片不存在: {fname}")

        return {"passed": len(issues) == 0, "issues": issues}
