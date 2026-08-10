"""跨境平台标题/描述规则优化器。

每个平台的标题硬上限、移动端展示截断（约 75 字符）、禁用词各不相同且常变。
规则集中在 PLATFORM_TITLE_RULES 一处维护（支持 JSON 覆盖文件热更新，
提前适配平台规则变化，不用改代码）。

optimize_title：LLM 压缩改写（关键词前置、≤75 字符移动端友好）；
无 Key 时按词边界智能截断兜底。check_title：规则体检（超长/禁用词/全大写）。
"""

from __future__ import annotations

import json
import os
import re

LLM_TIMEOUT = 45
MOBILE_LIMIT = 75  # 移动端搜索列表普遍在 ~75 字符处截断

# 平台规则基线（max=硬上限；banned=禁用词；notes=风格要求）
PLATFORM_TITLE_RULES = {
    "amazon": {
        "name": "Amazon", "max": 200,
        "banned": ["free shipping", "best seller", "hot sale", "100%",
                   "guarantee", "#1", "cheapest", "sale"],
        "notes": "首字母大写；不允许促销词/主观夸赞；核心关键词前置",
    },
    "etsy": {
        "name": "Etsy", "max": 140,
        "banned": ["free shipping", "best price"],
        "notes": "自然语言化；礼物场景词有效；避免关键词堆砌逗号墙",
    },
    "ebay": {
        "name": "eBay", "max": 80,
        "banned": ["l@@k", "wow", "must see"],
        "notes": "80 字符硬上限；禁 eye-catcher 符号",
    },
    "walmart": {
        "name": "Walmart", "max": 100,
        "banned": ["free shipping", "best seller", "hot"],
        "notes": "50-75 字符最佳；品牌+型号+关键属性",
    },
    "temu": {
        "name": "Temu", "max": 250,
        "banned": ["100%", "best"],
        "notes": "前 75 字符要能独立成意；属性词密集",
    },
    "tiktok": {
        "name": "TikTok Shop", "max": 255,
        "banned": ["guarantee", "cure"],
        "notes": "口语化、场景化；前 40 字符是黄金位",
    },
    "shopify": {
        "name": "Shopify", "max": 255,
        "banned": [],
        "notes": "SEO 标题 ≤60 字符对 Google 最友好",
    },
}

# 可选覆盖文件：平台改规则时改 JSON 即可，不用动代码
RULES_OVERRIDE_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                                   "profiles", "platform_title_rules.json")


def get_rules() -> dict:
    rules = {k: dict(v) for k, v in PLATFORM_TITLE_RULES.items()}
    try:
        with open(RULES_OVERRIDE_PATH, encoding="utf-8") as f:
            override = json.load(f)
        for plat, patch in (override or {}).items():
            if isinstance(patch, dict):
                rules.setdefault(plat, {}).update(patch)
    except (OSError, json.JSONDecodeError):
        pass
    return rules


def check_title(title: str, platform: str) -> dict:
    """标题规则体检：超长 / 禁用词 / 全大写词 / 移动端截断预览。"""
    rules = get_rules().get(platform, {"name": platform, "max": 200, "banned": []})
    title = (title or "").strip()
    issues = []
    if len(title) > rules["max"]:
        issues.append(f"超过 {rules['name']} 上限 {rules['max']} 字符（当前 {len(title)}）")
    low = title.lower()
    for word in rules.get("banned", []):
        if word in low:
            issues.append(f"含禁用词「{word}」")
    caps = [w for w in re.findall(r"[A-Z]{4,}", title) if w not in ("USB", "LED")]
    if caps:
        issues.append(f"全大写词 {caps[0]} 可能被判 spam")
    return {
        "platform": platform,
        "platformName": rules.get("name", platform),
        "length": len(title),
        "maxLength": rules["max"],
        "withinLimit": len(title) <= rules["max"],
        "mobilePreview": title[:MOBILE_LIMIT],
        "mobileTruncated": len(title) > MOBILE_LIMIT,
        "issues": issues,
        "passed": not issues,
    }


def _smart_truncate(title: str, limit: int) -> str:
    if len(title) <= limit:
        return title
    cut = title[:limit]
    # 按词边界回退，避免截断单词
    for sep in (" | ", ", ", " - ", " "):
        idx = cut.rfind(sep)
        if idx >= limit * 0.6:
            return cut[:idx].rstrip(" ,|-")
    return cut.rstrip(" ,|-")


def _api_key() -> str:
    return (os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip())


def _llm_optimize(title: str, platform: str, profile: dict) -> str | None:
    if os.environ.get("COMMERCE_LLM_PLAN", "1").strip() in ("0", "false", "off"):
        return None
    key = _api_key()
    if not key:
        return None
    rules = get_rules().get(platform, {})
    try:
        import requests

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        system = (
            "You optimize e-commerce listing titles. Rewrite the given title for "
            f"{rules.get('name', platform)}: max {MOBILE_LIMIT} characters, most "
            "important search keywords first, natural not keyword-stuffed, no "
            f"banned words ({', '.join(rules.get('banned', []) or ['none'])}). "
            f"Platform style: {rules.get('notes', '')}. "
            "Return ONLY the optimized title text, nothing else.")
        user = json.dumps({"title": title,
                           "product": {k: profile[k] for k in
                                       ("product_name", "category", "material",
                                        "style") if profile.get(k)}},
                          ensure_ascii=False)
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json={"model": os.getenv("LLM_MODEL", "gpt-5.5"),
                  "messages": [{"role": "system", "content": system},
                               {"role": "user", "content": user}],
                  "temperature": 0.4, "max_tokens": 120},
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        text = ((resp.json().get("choices") or [{}])[0]
                .get("message", {}).get("content", "") or "").strip().strip('"')
        if text and len(text) <= MOBILE_LIMIT + 15:
            return _smart_truncate(text, MOBILE_LIMIT)
    except Exception:  # noqa: BLE001 — LLM 失败走智能截断
        pass
    return None


def optimize_title(title: str, platform: str, profile: dict | None = None) -> dict:
    """输出该平台的 ≤75 字符优化标题 + 体检结果。"""
    title = (title or "").strip()
    optimized = _llm_optimize(title, platform, profile or {})
    source = "llm"
    if not optimized:
        optimized = _smart_truncate(title, MOBILE_LIMIT)
        source = "truncate"
    # 禁用词兜底清理
    rules = get_rules().get(platform, {})
    for word in rules.get("banned", []):
        optimized = re.sub(re.escape(word), "", optimized, flags=re.I)
    optimized = re.sub(r"\s{2,}", " ", optimized).strip(" ,|-")

    return {
        "platform": platform,
        "original": title,
        "optimized": optimized,
        "source": source,
        "check": check_title(optimized, platform),
    }


def optimize_for_platforms(title: str, platforms: list,
                           profile: dict | None = None) -> list:
    known = get_rules()
    return [optimize_title(title, p, profile) for p in platforms if p in known]
