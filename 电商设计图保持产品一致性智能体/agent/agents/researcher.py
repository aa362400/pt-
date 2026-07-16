#!/usr/bin/env python3
"""
研究智能体 — Researcher Agent

职责：竞品搜索、参考图抓取、链接浏览
工具：web_search, browse_url, fetch_url
"""

import os
import time
from typing import Optional, Callable
from urllib.parse import urlparse

from common.fetch_url import extract_urls, fetch_product_image
from common.web_search import search_web, WebSearchError
from common.browse_url import browse_url
from common.runtime_paths import get_runtime_paths

from .base_agent import BaseSubAgent


def _needs_js_render(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    js_domains = ("taobao.com", "tmall.com", "amazon.", "etsy.com", "1688.com")
    return any(d in host for d in js_domains)


class ResearcherAgent(BaseSubAgent):
    """上网研究子智能体：搜索竞品、抓取参考图、浏览商品页"""

    AGENT_LABEL = "Researcher"

    def __init__(self, agent_id: str = "researcher_01"):
        super().__init__(agent_id)
        self.tools = {
            "web_search": search_web,
            "browse_url": browse_url,
            "fetch_product_image": fetch_product_image,
        }

    def execute(self, task: dict, progress_callback: Optional[Callable] = None,
                cancel_check: Optional[Callable] = None) -> dict:
        params = task.get("params", {})
        task_type = task.get("type", "research")
        start = time.time()

        try:
            query = (params.get("query") or "").strip()
            urls = list(params.get("urls") or [])
            if not urls and params.get("url"):
                urls = [params["url"]]
            message = params.get("user_message") or params.get("raw_message") or ""
            if not urls and message:
                urls = extract_urls(message)
            if not query and message and task_type in ("research", "web_search"):
                query = self._extract_search_query(message)

            output_dir = params.get("output_dir") or ""
            session_id = params.get("session_id", "")
            if not output_dir and session_id:
                output_dir = os.path.join(
                    get_runtime_paths().outputs, session_id, "research"
                )
            os.makedirs(output_dir, exist_ok=True)

            search_results = []
            if query and task_type in ("research", "web_search"):
                if progress_callback:
                    progress_callback("researcher", "search", f"正在搜索: {query}...", progress=20)
                search_results = search_web(query, num_results=params.get("num_results", 5))
                if not urls:
                    urls = [r["url"] for r in search_results if r.get("url")][:3]

            pages = []
            reference_images = []
            competitors = []

            render_js_default = os.getenv("PLAYWRIGHT_ENABLED", "0").strip() in ("1", "true", "yes")

            for i, url in enumerate(urls[:5]):
                if cancel_check and cancel_check():
                    return self._wrap_report(task, {"cancelled": True}, status="cancelled", start=start)

                if progress_callback:
                    progress_callback("researcher", "browse", f"正在抓取 ({i+1}/{min(len(urls), 5)}): {url}...", progress=40 + i * 10)

                use_js = params.get("render_js", render_js_default) or _needs_js_render(url)
                page = browse_url(url, render_js=use_js)
                pages.append(page)

                competitor = {
                    "url": page.get("url") or url,
                    "title": page.get("title", ""),
                    "snippet": (page.get("text_snippet") or "")[:300],
                    "og_image": page.get("og_image"),
                    "images": page.get("images", []),
                }
                if page.get("error"):
                    competitor["error"] = page["error"]
                competitors.append(competitor)

                img_url = page.get("og_image") or (page.get("images") or [None])[0]
                if img_url and output_dir:
                    fetch_result = fetch_product_image(img_url, output_dir)
                    if fetch_result.get("success"):
                        reference_images.append({
                            "source_url": url,
                            "image_url": fetch_result.get("image_url"),
                            "local_path": fetch_result.get("local_path"),
                            "title": page.get("title", ""),
                        })

            summary_parts = []
            if query:
                summary_parts.append(f"搜索「{query}」找到 {len(search_results)} 条结果")
            if pages:
                ok = sum(1 for p in pages if not p.get("error"))
                summary_parts.append(f"成功抓取 {ok}/{len(pages)} 个链接")
            if reference_images:
                summary_parts.append(f"下载 {len(reference_images)} 张参考图")

            report = {
                "query": query,
                "search_results": search_results,
                "competitors": competitors,
                "reference_images": reference_images,
                "reference_urls": [r.get("url") for r in search_results if r.get("url")],
                "pages": pages,
                "summary": "；".join(summary_parts) if summary_parts else "研究完成",
                "output_dir": output_dir,
                "session_id": session_id,
            }
            return self._wrap_report(task, report, status="success", start=start)

        except WebSearchError as e:
            return self._wrap_report(task, {"error": str(e)}, status="error", error=str(e), start=start)
        except Exception as e:
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)

    def _extract_search_query(self, message: str) -> str:
        """从用户消息提取搜索关键词"""
        import re
        msg = message.strip()
        for pat in [
            r"(?:搜|搜索|查找|找一下|帮我搜)[：:\s]*(.+)",
            r"(?:竞品|参考图|类似产品)[：:\s]*(.+)",
            r"(?:etsy|amazon|淘宝|亚马逊)上(.+)",
        ]:
            m = re.search(pat, msg, re.I)
            if m:
                return m.group(1).strip().rstrip("。！？!?")
        return msg

    def self_check(self, report: dict) -> dict:
        issues = []
        if report["status"] == "cancelled":
            return {"passed": True, "issues": []}
        if report["status"] == "error":
            issues.append(report.get("error") or "研究任务失败")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        if data.get("error"):
            issues.append(data["error"])
        has_results = bool(data.get("search_results") or data.get("competitors") or data.get("pages"))
        if not has_results:
            issues.append("未获得任何搜索结果或页面内容")

        return {"passed": len(issues) == 0, "issues": issues}
