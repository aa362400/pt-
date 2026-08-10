"""textplatformtitle/english_text。

textplatformtexttitleenglish_text、english_text（text 75 text）、english_text。
english_text PLATFORM_TITLE_RULES english_text（text JSON textfileenglish_text，
english_textplatformenglish_text，english_text）。

optimize_title：LLM english_text（keywordstext、≤75 english_text）；
none Key english_text。check_title：english_text（text/english_text/english_text）。
"""

from __future__ import annotations

import json
import os
import re

LLM_TIMEOUT = 45
MOBILE_LIMIT = 75  # english_textsearchenglish_text ~75 english_text

# platformenglish_text（max=english_text；banned=english_text；notes=english_text）
PLATFORM_TITLE_RULES = {
    "amazon": {
        "name": "Amazon", "max": 200,
        "banned": ["free shipping", "best seller", "hot sale", "100%",
                   "guarantee", "#1", "cheapest", "sale"],
        "notes": "english_text；english_text/english_text；textkeywordstext",
    },
    "etsy": {
        "name": "Etsy", "max": 140,
        "banned": ["free shipping", "best price"],
        "notes": "english_text；textscenetextyestext；textkeywordsenglish_text",
    },
    "ebay": {
        "name": "eBay", "max": 80,
        "banned": ["l@@k", "wow", "must see"],
        "notes": "80 english_text；text eye-catcher text",
    },
    "walmart": {
        "name": "Walmart", "max": 100,
        "banned": ["free shipping", "best seller", "hot"],
        "notes": "50-75 english_text；text+text+english_text",
    },
    "temu": {
        "name": "Temu", "max": 250,
        "banned": ["100%", "best"],
        "notes": "text 75 english_text；english_text",
    },
    "tiktok": {
        "name": "TikTok Shop", "max": 255,
        "banned": ["guarantee", "cure"],
        "notes": "english_text、scenetext；text 40 textyesenglish_text",
    },
    "shopify": {
        "name": "Shopify", "max": 255,
        "banned": [],
        "notes": "SEO title ≤60 english_text Google english_text",
    },
}

# english_textfile：platformenglish_text JSON text，english_text
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
    """titleenglish_text：text / english_text / english_text / english_text。"""
    rules = get_rules().get(platform, {"name": platform, "max": 200, "banned": []})
    title = (title or "").strip()
    issues = []
    if len(title) > rules["max"]:
        issues.append(f"text {rules['name']} text {rules['max']} text（text {len(title)}）")
    low = title.lower()
    for word in rules.get("banned", []):
        if word in low:
            issues.append(f"english_text「{word}」")
    caps = [w for w in re.findall(r"[A-Z]{4,}", title) if w not in ("USB", "LED")]
    if caps:
        issues.append(f"english_text {caps[0]} english_text spam")
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
    # english_text，english_text
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
    except Exception:  # noqa: BLE001 — LLM failedenglish_text
        pass
    return None


def optimize_title(title: str, platform: str, profile: dict | None = None) -> dict:
    """outputtextplatformtext ≤75 english_texttitle + english_text。"""
    title = (title or "").strip()
    optimized = _llm_optimize(title, platform, profile or {})
    source = "llm"
    if not optimized:
        optimized = _smart_truncate(title, MOBILE_LIMIT)
        source = "truncate"
    # english_text
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
