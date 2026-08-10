#!/usr/bin/env python3
"""
textagent — Researcher Agent

text：textsearch、english_text、english_text
text：web_search, browse_url, fetch_url
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
    """english_textagent：searchtext、english_text、textproducttext"""

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
                    progress_callback("researcher", "search", f"textsearch: {query}...", progress=20)
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
                    progress_callback("researcher", "browse", f"english_text ({i+1}/{min(len(urls), 5)}): {url}...", progress=40 + i * 10)

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
                summary_parts.append(f"search「{query}」text {len(search_results)} english_text")
            if pages:
                ok = sum(1 for p in pages if not p.get("error"))
                summary_parts.append(f"successtext {ok}/{len(pages)} english_text")
            if reference_images:
                summary_parts.append(f"text {len(reference_images)} english_text")

            report = {
                "query": query,
                "search_results": search_results,
                "competitors": competitors,
                "reference_images": reference_images,
                "reference_urls": [r.get("url") for r in search_results if r.get("url")],
                "pages": pages,
                "summary": "；".join(summary_parts) if summary_parts else "textcompleted",
                "output_dir": output_dir,
                "session_id": session_id,
            }
            return self._wrap_report(task, report, status="success", start=start)

        except WebSearchError as e:
            return self._wrap_report(task, {"error": str(e)}, status="error", error=str(e), start=start)
        except Exception as e:
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)

    def _extract_search_query(self, message: str) -> str:
        """textusermessagetextsearchkeywords"""
        import re
        msg = message.strip()
        for pat in [
            r"(?:text|search|text|english_text|english_text)[：:\s]*(.+)",
            r"(?:text|english_text|english_text)[：:\s]*(.+)",
            r"(?:etsy|amazon|text|english_text)text(.+)",
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
            issues.append(report.get("error") or "texttaskfailed")
            return {"passed": False, "issues": issues}

        data = report.get("data", {})
        if data.get("error"):
            issues.append(data["error"])
        has_results = bool(data.get("search_results") or data.get("competitors") or data.get("pages"))
        if not has_results:
            issues.append("english_textsearchenglish_text")

        return {"passed": len(issues) == 0, "issues": issues}
