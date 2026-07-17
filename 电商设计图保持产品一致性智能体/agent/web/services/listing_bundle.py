"""一键上架资料包（P5）— 把一个会话的全部产出打成可交付的 zip。

内容（都有则装，缺项跳过不阻断）：
    listing.md          标题/平台标题/标签/五点/描述/How to Order/FAQ（人可读）
    listing.csv         字段表（复用 listing_pack）
    image_prompts.md    套图每张的用途与英文提示词
    risk_report.md      风险体检报告
    profit.md           利润测算（会话里算过才有）
    images/             全部成品图

依赖既有服务：listing_pack（文案）、risk_check（风险）、biz_tools（标签）。
"""

from __future__ import annotations

import json
import hashlib
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


def _audit_inline(value: object, limit: int = 500) -> str:
    return str(value if value is not None else "").replace(
        "\r", " "
    ).replace("\n", " ")[:limit]


def _listing_md(copy: dict, tags: list, platform: str) -> str:
    lines = [f"# Listing 资料 — {platform or 'Etsy'}", ""]
    lines += ["## 标题", copy.get("title", ""), ""]
    platform_titles = copy.get("platformTitles") or []
    if platform_titles:
        lines.append("## 各平台优化标题（≤75 字符）")
        for t in platform_titles:
            mark = "✅" if t.get("passed") else "⚠️"
            lines.append(f"- {mark} **{t['platform']}**: {t['title']}")
        lines.append("")
    if tags:
        lines += ["## Etsy 标签（≤13 个，≤20 字符）",
                  " · ".join(tags), ""]
    bullets = copy.get("bullets") or []
    if bullets:
        lines.append("## 五点卖点")
        lines += [f"{i}. {b}" for i, b in enumerate(bullets, 1)]
        lines.append("")
    keywords = copy.get("keywords") or []
    if keywords:
        lines += ["## 搜索关键词", ", ".join(map(str, keywords)), ""]
    description = copy.get("description", "")
    if description:
        lines += ["## 产品描述", description, ""]
    lines.append(HOW_TO_ORDER)
    return "\n".join(lines)


def _prompts_md(plan_images: list) -> str:
    lines = ["# 套图提示词（每张图的用途与英文 Prompt）", ""]
    for i, img in enumerate(plan_images, 1):
        lines += [
            f"## 图{i}：{img.get('title', '')}",
            f"- 用途：{img.get('purpose', '')}",
            f"- 比例：{img.get('ratio') or img.get('aspect_ratio', '1:1')}",
            "",
            "```text",
            str(img.get("prompt", "")).strip(),
            "```",
            "",
        ]
    return "\n".join(lines)


def _risk_md(report: dict) -> str:
    lines = [f"# 风险体检报告", "",
             f"**风险等级：{report.get('riskLevel', '低')}**",
             f"**规则筛查状态：{report.get('screeningStatus', 'UNKNOWN')}**",
             f"**证据状态：{report.get('evidenceStatus', 'MISSING')}**",
             f"**Listing 主体哈希：{report.get('listingSubjectHash', '')}**",
             f"**发布门禁：{report.get('decision', 'BLOCK')}**",
             f"**允许发布：{'是' if report.get('publishable') is True else '否'}**",
             f"**结论：{report.get('verdict', '')}**", ""]
    if report.get("hardGateReasons"):
        lines.append("## 硬阻断原因")
        lines += [f"- {reason}" for reason in report["hardGateReasons"]]
        lines.append("")
    evidence = report.get("clearanceEvidence")
    if isinstance(evidence, dict):
        lines += [
            "## 外部合规凭证",
            f"- Provider: {_audit_inline(evidence.get('provider'))}",
            f"- Ruleset: {_audit_inline(evidence.get('ruleset'))}",
            f"- Evidence Ref: {_audit_inline(evidence.get('evidenceRef'))}",
            f"- Fetched At: {_audit_inline(evidence.get('fetchedAt'))}",
            f"- Expires At: {_audit_inline(evidence.get('expiresAt'))}",
            f"- Subject Hash: {_audit_inline(evidence.get('subjectHash'))}",
            f"- Passed: {'true' if evidence.get('passed') is True else 'false'}",
            f"- Attestation Signature: {_audit_inline(evidence.get('signature'))}",
            "",
        ]
    if report.get("risks"):
        lines.append("## 发现的风险")
        lines += [f"- {r}" for r in report["risks"]]
        lines.append("")
    if report.get("suggestions"):
        lines.append("## 修改建议")
        lines += [f"- {s}" for s in report["suggestions"]]
        lines.append("")
    return "\n".join(lines)


def _profit_md(profit: dict) -> str:
    lines = ["# 利润测算", ""]
    rows = (("售价", "price"), ("成本", "cost"), ("包装", "packaging"),
            ("头程", "freight"), ("平台佣金", "platformFee"),
            ("广告预留", "adCost"), ("支付手续费", "paymentFee"),
            ("退款预留", "refundReserve"), ("净利润", "profit"),
            ("利润率%", "marginPct"), ("保本价", "breakevenPrice"),
            ("建议售价", "suggestedPrice"))
    lines.append("| 项目 | 金额 |")
    lines.append("|---|---|")
    for label, key in rows:
        if profit.get(key) is not None:
            lines.append(f"| {label} | {profit[key]} |")
    lines += ["", f"**结论：{profit.get('verdict', '')}**"]
    for a in profit.get("advice", []):
        lines.append(f"- {a}")
    return "\n".join(lines)


def build_bundle(sid: str, out_dir: str, profile: dict,
                 plan_images: list | None = None, platform: str = "Etsy",
                 profit: dict | None = None,
                 clearance_evidence: dict | None = None) -> dict:
    """打完整上架资料包，返回 {"zip_path", "files", "imageCount"}。"""
    from web.services import listing_pack, risk_check
    from web.services.biz_tools import etsy_tags

    raw_dir = os.path.join(out_dir, "raw")
    images = sorted(
        f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    if not images:
        raise ValueError("本会话还没有生成图，请先出图")

    # 文案（LLM/模板）与平台标题
    pack = listing_pack.build_listing_pack(sid, out_dir, profile or {}, platform)
    copy = pack["copy"]
    tags = etsy_tags(profile or {}, copy.get("keywords") or [])

    # 风险体检（规则层保底；有 Key 时 LLM 补充）
    image_hashes = []
    for filename in images:
        with open(os.path.join(raw_dir, filename), "rb") as image_file:
            image_hashes.append(
                f"sha256:{hashlib.sha256(image_file.read()).hexdigest()}"
            )
    report = risk_check.check_listing(
        title=copy.get("title", ""), description=copy.get("description", ""),
        tags=tags, profile=profile or {},
        platform=platform,
        scope_id=f"session:{sid}:platform:{str(platform).casefold()}",
        bullets=copy.get("bullets") or [],
        keywords=copy.get("keywords") or [],
        attributes=copy.get("attributes") or {},
        image_hashes=image_hashes,
        clearance_evidence=clearance_evidence)

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
            "screeningStatus": report["screeningStatus"],
            "evidenceStatus": report["evidenceStatus"],
            "decision": report["decision"],
            "publishable": report["publishable"],
            "hardGateReasons": report["hardGateReasons"],
            "listingSubjectHash": report["listingSubjectHash"],
            "title": copy.get("title", ""), "tags": tags,
            "source": pack["source"]}
