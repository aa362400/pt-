#!/usr/bin/env python3
"""Browse URL — requests + BeautifulSoup, optional Playwright JS render."""

import json
import os
import re
from typing import Optional
from urllib.parse import urljoin, urlparse

from common.fetch_url import (
    MAX_PAGE_BYTES,
    USER_AGENT,
    UnsafeRemoteUrl,
    _is_safe_remote_url,
    _pick_image_url,
    _read_limited,
    _safe_get,
    OG_IMAGE_RES,
)

MAX_IMAGES = 3
DEFAULT_TIMEOUT = 30
SCRIPT_RE = re.compile(r"<script[^>]*>[\s\S]*?</script>", re.I)
STYLE_RE = re.compile(r"<style[^>]*>[\s\S]*?</style>", re.I)
TAG_RE = re.compile(r"<[^>]+>")
IMG_SRC_RE = re.compile(
    r'<img[^>]+(?:src|data-src|data-original)=["\']([^"\']+)["\']',
    re.I,
)


def _load_cookie_jar() -> dict:
    """Load domain → cookies list from COOKIE_JAR_PATH JSON file."""
    path = os.getenv("COOKIE_JAR_PATH", "").strip()
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _cookies_for_url(url: str, jar: dict) -> list[dict]:
    """Pick cookies matching URL domain from jar."""
    if not jar:
        return []
    host = (urlparse(url).hostname or "").lower()
    cookies = []
    for domain, items in jar.items():
        d = domain.lower().lstrip(".")
        if host == d or host.endswith("." + d):
            if isinstance(items, list):
                cookies.extend(items)
    return cookies


def _requests_cookies(url: str) -> dict:
    jar = _load_cookie_jar()
    cookies = {}
    for c in _cookies_for_url(url, jar):
        name = c.get("name")
        value = c.get("value")
        if name and value is not None:
            cookies[name] = value
    return cookies


def _extract_title(html: str) -> str:
    m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
    return m.group(1).strip() if m else ""


def _html_to_text(html: str, max_len: int = 2000) -> str:
    text = SCRIPT_RE.sub(" ", html)
    text = STYLE_RE.sub(" ", text)
    text = TAG_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len]


def _extract_images(page_url: str, html: str, og_image: Optional[str]) -> list[str]:
    seen = set()
    images = []
    if og_image:
        seen.add(og_image)
        images.append(og_image)
    for m in IMG_SRC_RE.finditer(html):
        src = urljoin(page_url, m.group(1).strip())
        if src.startswith("data:") or src in seen:
            continue
        seen.add(src)
        images.append(src)
        if len(images) >= MAX_IMAGES:
            break
    return images[:MAX_IMAGES]


def _fetch_static(url: str, timeout: int) -> tuple[str, str]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    resp = _safe_get(
        url,
        headers=headers,
        cookies=_requests_cookies(url),
        timeout=timeout,
        stream=True,
    )
    final_url = resp.url
    encoding = resp.encoding if isinstance(resp.encoding, str) else "utf-8"
    content = _read_limited(resp, MAX_PAGE_BYTES)
    return final_url, content.decode(encoding or "utf-8", errors="replace")


def _fetch_playwright(url: str, timeout: int) -> Optional[tuple[str, str]]:
    if os.getenv("PLAYWRIGHT_ENABLED", "0").strip() not in ("1", "true", "yes"):
        return None
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None

    if not _is_safe_remote_url(url):
        raise UnsafeRemoteUrl("unsafe remote URL")

    jar = _load_cookie_jar()
    pw_cookies = _cookies_for_url(url, jar)
    timeout_ms = timeout * 1000

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT)
        if pw_cookies:
            try:
                context.add_cookies(pw_cookies)
            except Exception:
                pass
        page = context.new_page()
        page.route(
            "**/*",
            lambda route: route.continue_()
            if route.request.url.startswith(("data:", "blob:"))
            or _is_safe_remote_url(route.request.url)
            else route.abort(),
        )
        page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        final_url = page.url
        if not _is_safe_remote_url(final_url):
            raise UnsafeRemoteUrl("unsafe final URL")
        html = page.content()
        browser.close()
    return final_url, html


def browse_url(url: str, render_js: bool = False, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """
    Fetch page content and extract title, text snippet, images, og_image.

    Returns: {title, text_snippet, images[], og_image, url, render_mode, error?}
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {
            "title": "",
            "text_snippet": "",
            "images": [],
            "og_image": None,
            "url": url,
            "render_mode": "none",
            "error": "仅支持 http/https 链接",
        }
    if not _is_safe_remote_url(url):
        return {
            "title": "",
            "text_snippet": "",
            "images": [],
            "og_image": None,
            "url": url,
            "render_mode": "none",
            "error": "不安全的远程地址",
        }

    page_url = url
    html = ""
    render_mode = "requests"

    try:
        if render_js:
            rendered = _fetch_playwright(url, timeout)
            if rendered:
                page_url, html = rendered
                render_mode = "playwright"
            else:
                page_url, html = _fetch_static(url, timeout)
        else:
            page_url, html = _fetch_static(url, timeout)
    except Exception as e:
        return {
            "title": "",
            "text_snippet": "",
            "images": [],
            "og_image": None,
            "url": url,
            "render_mode": render_mode,
            "error": str(e),
        }

    og_image = _pick_image_url(page_url, html)
    title = _extract_title(html)
    text_snippet = _html_to_text(html)
    images = _extract_images(page_url, html, og_image)

    return {
        "title": title,
        "text_snippet": text_snippet,
        "images": images,
        "og_image": og_image,
        "url": page_url,
        "render_mode": render_mode,
    }
