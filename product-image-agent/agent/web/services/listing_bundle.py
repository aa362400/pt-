"""textlistingenglish_text（P5）— english_textallenglish_text zip。

text（textyestext，english_text）：
    listing.md          title/platformtitle/text/text/text/How to Order/FAQ（english_text）
    listing.csv         fieldstext（text listing_pack）
    image_prompts.md    english_text
    risk_report.md      risktextreport
    profit.md           profittext（english_textyes）
    images/             allenglish_text

english_textyestext：listing_pack（text）、risk_check（risk）、biz_tools（text）。
"""

from __future__ import annotations

import json
import os
import zipfile

HOW_TO_ORDER = """## How to Order
1. Choose your options and add to cart
2. Enter personalization details at checkout (name / date / photo if applicable)
3. We confirm your proof within 24h, then craft and ship

## FAQ
**Can I change my personalization after ordering?**
Yes — within 12 hours of purchase, just message us.

**When will my order ship?**
Made-to-order items ship in 2-4 business days.

**What if it arrives damaged?**
Contact us with a photo and we will replace it free of charge."""


def _write(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _listing_md(copy: dict, tags: list, platform: str) -> str:
    lines = [f"# Listing text — {platform or 'Etsy'}", ""]
    lines += ["## title", copy.get("title", ""), ""]
    platform_titles = copy.get("platformTitles") or []
    if platform_titles:
        lines.append("## textplatformtexttitle（≤75 text）")
        for t in platform_titles:
            mark = "✅" if t.get("passed") else "⚠️"
            lines.append(f"- {mark} **{t['platform']}**: {t['title']}")
        lines.append("")
    if tags:
        lines += ["## Etsy text（≤13 text，≤20 text）",
                  " · ".join(tags), ""]
    bullets = copy.get("bullets") or []
    if bullets:
        lines.append("## english_text")
        lines += [f"{i}. {b}" for i, b in enumerate(bullets, 1)]
        lines.append("")
    keywords = copy.get("keywords") or []
    if keywords:
        lines += ["## searchkeywords", ", ".join(map(str, keywords)), ""]
    description = copy.get("description", "")
    if description:
        lines += ["## english_text", description, ""]
    lines.append(HOW_TO_ORDER)
    return "\n".join(lines)


def _prompts_md(plan_images: list) -> str:
    lines = ["# english_text（english_text Prompt）", ""]
    for i, img in enumerate(plan_images, 1):
        lines += [
            f"## text{i}：{img.get('title', '')}",
            f"- text：{img.get('purpose', '')}",
            f"- text：{img.get('ratio') or img.get('aspect_ratio', '1:1')}",
            "",
            "```text",
            str(img.get("prompt", "")).strip(),
            "```",
            "",
        ]
    return "\n".join(lines)


def _risk_md(report: dict) -> str:
    lines = [f"# risktextreport", "",
             f"**risktext：{report.get('riskLevel', 'text')}**",
             f"**text：{report.get('verdict', '')}**", ""]
    if report.get("risks"):
        lines.append("## english_textrisk")
        lines += [f"- {r}" for r in report["risks"]]
        lines.append("")
    if report.get("suggestions"):
        lines.append("## english_text")
        lines += [f"- {s}" for s in report["suggestions"]]
        lines.append("")
    return "\n".join(lines)


def _profit_md(profit: dict) -> str:
    lines = ["# profittext", ""]
    rows = (("price", "price"), ("cost", "cost"), ("packaging", "packaging"),
            ("text", "freight"), ("platformcommission", "platformFee"),
            ("english_text", "adCost"), ("english_text", "paymentFee"),
            ("english_text", "refundReserve"), ("textprofit", "profit"),
            ("profittext%", "marginPct"), ("english_text", "breakevenPrice"),
            ("textprice", "suggestedPrice"))
    lines.append("| text | text |")
    lines.append("|---|---|")
    for label, key in rows:
        if profit.get(key) is not None:
            lines.append(f"| {label} | {profit[key]} |")
    lines += ["", f"**text：{profit.get('verdict', '')}**"]
    for a in profit.get("advice", []):
        lines.append(f"- {a}")
    return "\n".join(lines)


def build_bundle(sid: str, out_dir: str, profile: dict,
                 plan_images: list | None = None, platform: str = "Etsy",
                 profit: dict | None = None) -> dict:
    """english_textlistingenglish_text，text {"zip_path", "files", "imageCount"}。"""
    from web.services import listing_pack, risk_check
    from web.services.biz_tools import etsy_tags

    raw_dir = os.path.join(out_dir, "raw")
    images = sorted(
        f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    if not images:
        raise ValueError("english_textyesgenerationtext，english_text")

    # text（LLM/template）textplatformtitle
    pack = listing_pack.build_listing_pack(sid, out_dir, profile or {}, platform)
    copy = pack["copy"]
    tags = etsy_tags(profile or {}, copy.get("keywords") or [])

    # risktext（english_text；yes Key text LLM text）
    report = risk_check.check_listing(
        title=copy.get("title", ""), description=copy.get("description", ""),
        tags=tags, profile=profile or {})

    bundle_dir = os.path.join(out_dir, "bundle")
    files = {}
    _write(os.path.join(bundle_dir, "listing.md"),
           _listing_md(copy, tags, platform))
    files["listing.md"] = True
    if plan_images:
        _write(os.path.join(bundle_dir, "image_prompts.md"),
               _prompts_md(plan_images))
        files["image_prompts.md"] = True
    _write(os.path.join(bundle_dir, "risk_report.md"), _risk_md(report))
    files["risk_report.md"] = True
    if profit:
        _write(os.path.join(bundle_dir, "profit.md"), _profit_md(profit))
        files["profit.md"] = True

    zip_path = os.path.join(out_dir, "listing_bundle.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in files:
            zf.write(os.path.join(bundle_dir, fname), fname)
        listing_csv = os.path.join(out_dir, "listing", "listing.csv")
        if os.path.exists(listing_csv):
            zf.write(listing_csv, "listing.csv")
            files["listing.csv"] = True
        for fname in images:
            zf.write(os.path.join(raw_dir, fname),
                     os.path.join("images", fname))

    return {"zip_path": zip_path, "files": sorted(files),
            "imageCount": len(images), "riskLevel": report["riskLevel"],
            "title": copy.get("title", ""), "tags": tags,
            "source": pack["source"]}
