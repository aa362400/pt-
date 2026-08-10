"""一键铺货包 — 出图之外连 listing 文案一起交付。

产出：标题（按平台字数习惯）、五点描述、搜索关键词、长描述，
写成 listing.json + listing.csv，与全部成图一起打包 zip，上架流程一步到位。

文案来源：LLM 按产品档案撰写；无 Key/失败时用档案字段模板拼装兜底。
"""

from __future__ import annotations

import csv
import json
import os
import re
import zipfile

LLM_TIMEOUT = 60

_COPY_PROMPT = """You are a senior cross-border e-commerce listing copywriter.
Given a PRODUCT profile and target PLATFORM, write conversion-optimized ENGLISH listing copy.

Return JSON only:
{"title": "<search-optimized title, max 180 chars, keywords front-loaded>",
 "bullets": ["<benefit-driven bullet 1>", "...5 bullets total, each max 200 chars"],
 "keywords": ["<search keyword/phrase>", "...8-12 items"],
 "description": "<2-3 short paragraphs, warm and concrete, max 900 chars>"}
No brand names unless provided, no emoji, no ALL-CAPS words except common ones."""


def _api_key() -> str:
    return (os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip())


def _llm_copy(profile: dict, platform: str) -> dict | None:
    if os.environ.get("COMMERCE_LLM_PLAN", "1").strip() in ("0", "false", "off"):
        return None
    key = _api_key()
    if not key:
        return None
    try:
        import requests

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        keys = ("product_name", "category", "material", "colors", "style",
                "key_features", "selling_points", "target_audience", "description")
        user = json.dumps({
            "PRODUCT": {k: profile[k] for k in keys if profile.get(k)},
            "PLATFORM": platform or "Etsy",
        }, ensure_ascii=False)
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json={
                "model": os.getenv("LLM_MODEL", "gpt-5.5"),
                "messages": [{"role": "system", "content": _COPY_PROMPT},
                             {"role": "user", "content": user}],
                "temperature": 0.5,
                "max_tokens": 1500,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        text = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", text, re.S)
        data = json.loads(match.group(0)) if match else None
        if isinstance(data, dict) and data.get("title"):
            return data
    except Exception:  # noqa: BLE001 — LLM 失败回退模板文案
        pass
    return None


def _template_copy(profile: dict) -> dict:
    """无 LLM 时的模板文案：把档案字段拼装成能用的初稿。"""
    name = profile.get("product_name") or "Handcrafted Product"
    material = profile.get("material") or ""
    style = profile.get("style") or ""
    features = profile.get("key_features") or []
    if isinstance(features, str):
        features = [features]
    points = profile.get("selling_points") or []
    if isinstance(points, str):
        points = [points]

    bullets = [str(p)[:200] for p in (points + features)][:5]
    while len(bullets) < 5:
        bullets.append(f"Perfect gift choice — {name}"[:200])

    keywords = [w for w in re.split(r"[\s,/]+", f"{name} {material} {style}") if w][:12]
    return {
        "title": f"{name} | {material} {style}".strip(" |")[:180],
        "bullets": bullets,
        "keywords": keywords,
        "description": (profile.get("description")
                        or f"{name}. Carefully crafted and ready to ship.")[:900],
    }


def build_listing_pack(sid: str, out_dir: str, profile: dict,
                       platform: str = "") -> dict:
    """生成铺货包 zip，返回 {"zip_path", "copy", "source", "imageCount"}。

    没有成图时抛 ValueError。
    """
    raw_dir = os.path.join(out_dir, "raw")
    images = sorted(
        f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    if not images:
        raise ValueError("本会话还没有生成图，请先出图")

    copy = _llm_copy(profile or {}, platform)
    source = "llm"
    if not copy:
        copy = _template_copy(profile or {})
        source = "template"

    # 各平台 ≤75 字符优化标题（规则见 listing_rules，支持 JSON 覆盖热更新）
    try:
        from web.services import listing_rules
        platform_titles = listing_rules.optimize_for_platforms(
            copy["title"], ["amazon", "etsy", "ebay", "walmart", "temu"],
            profile or {})
    except Exception:  # noqa: BLE001 — 标题优化失败不阻断打包
        platform_titles = []
    copy["platformTitles"] = [
        {"platform": t["platform"], "title": t["optimized"],
         "passed": t["check"]["passed"]}
        for t in platform_titles
    ]

    listing_dir = os.path.join(out_dir, "listing")
    os.makedirs(listing_dir, exist_ok=True)

    json_path = os.path.join(listing_dir, "listing.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"platform": platform, "source": source, **copy},
                  f, ensure_ascii=False, indent=2)

    csv_path = os.path.join(listing_dir, "listing.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["field", "value"])
        writer.writerow(["title", copy["title"]])
        for t in copy.get("platformTitles", []):
            writer.writerow([f"title_{t['platform']}", t["title"]])
        for i, b in enumerate(copy.get("bullets", []), 1):
            writer.writerow([f"bullet_{i}", b])
        writer.writerow(["keywords", ", ".join(copy.get("keywords", []))])
        writer.writerow(["description", copy.get("description", "")])

    zip_path = os.path.join(out_dir, "listing_pack.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(json_path, "listing.json")
        zf.write(csv_path, "listing.csv")
        for fname in images:
            zf.write(os.path.join(raw_dir, fname), os.path.join("images", fname))

    return {"zip_path": zip_path, "copy": copy, "source": source,
            "imageCount": len(images)}
