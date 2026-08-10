#!/usr/bin/env python3
"""
产品一致性检测器 — Consistency Checker

自动检查 AI 生成的多张产品图中：
  - 颜色一致性：产品主色是否跨场景漂移
  - 亮度一致性：是否都处于合理曝光范围
  - 基础图像质量：是否过暗/过亮/模糊

输出校验报告 + 评分。

用法：
  # 检测单批图片
  python consistency_checker.py \
    --images ./outputs/scene_*.jpg \
    --profile product_profile.json \
    --report consistency_report.json

  # 检测批量输出目录
  python consistency_checker.py \
    --input-dir ./outputs/my_product/ \
    --profile profile.json \
    --report report.md

  # 快速检查
  python consistency_checker.py \
    --images ./outputs/*.jpg \
    --quick
"""

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Optional

# 使用公共工具模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import collect_images, setup_logger, get_api_key
logger = setup_logger(__name__)

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# ============================================================
# 颜色分析
# ============================================================

def extract_dominant_colors(image_path: str, num_colors: int = 3) -> list[dict]:
    """
    提取图片的主色调。
    使用简单的中位切割算法（不依赖外部库）。
    """
    if not HAS_PIL:
        return []

    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return []

    # 缩略加速
    img = img.resize((64, 64), Image.LANCZOS)
    pixels = list(img.getdata())

    # 量化颜色空间
    color_buckets = {}
    for r, g, b in pixels:
        # 量化到 4bit 通道
        key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
        color_buckets[key] = color_buckets.get(key, 0) + 1

    # 取最多的颜色
    sorted_colors = sorted(color_buckets.items(), key=lambda x: -x[1])

    results = []
    for key, count in sorted_colors[:num_colors]:
        r = ((key >> 8) & 0xF) << 4
        g = ((key >> 4) & 0xF) << 4
        b = (key & 0xF) << 4

        # 跳过纯白、纯黑（背景色）
        brightness = (r + g + b) / 3
        if brightness > 240 or brightness < 15:
            continue

        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        results.append({
            "hex": hex_color,
            "rgb": {"r": r, "g": g, "b": b},
            "coverage": count / len(pixels) * 100,
        })

    return results[:num_colors]


def color_distance(c1: dict, c2: dict) -> float:
    """计算两个颜色的感知距离 (0-441)"""
    dr = c1.get("rgb", {}).get("r", 0) - c2.get("rgb", {}).get("r", 0)
    dg = c1.get("rgb", {}).get("g", 0) - c2.get("rgb", {}).get("g", 0)
    db = c1.get("rgb", {}).get("b", 0) - c2.get("rgb", {}).get("b", 0)
    return math.sqrt(dr ** 2 + dg ** 2 + db ** 2)


# ============================================================
# 基础质量检测
# ============================================================

def check_image_quality(image_path: str) -> dict:
    """检测单张图片的基础质量"""
    if not HAS_PIL:
        return {"quality_score": 0, "issues": ["Pillow not installed"]}

    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as e:
        return {"error": str(e), "quality_score": 0}

    w, h = img.size
    pixels = list(img.getdata())
    total = len(pixels)

    # 平均亮度
    brightnesses = [(r + g + b) / 3 for r, g, b in pixels]
    avg_brightness = sum(brightnesses) / total

    # 过暗像素比例
    dark_ratio = sum(1 for b in brightnesses if b < 30) / total
    # 过亮像素比例
    light_ratio = sum(1 for b in brightnesses if b > 225) / total

    issues = []
    if avg_brightness < 50:
        issues.append("整体过暗")
    elif avg_brightness > 200:
        issues.append("整体过亮")
    if dark_ratio > 0.3:
        issues.append(f"阴影过多 ({dark_ratio*100:.0f}%)")
    if light_ratio > 0.5:
        issues.append(f"高光过多 ({light_ratio*100:.0f}%)")

    # 分辨率评分
    resolution_score = min(100, w * h / 10000)

    # 综合质量评分 (0-100)
    quality_score = 100
    quality_score -= max(0, abs(avg_brightness - 128) - 30) * 0.5
    quality_score -= dark_ratio * 100
    quality_score -= light_ratio * 30

    return {
        "width": w,
        "height": h,
        "aspect_ratio": f"{w/w:.2f}:{h/w:.2f}" if w else "0:0",
        "avg_brightness": round(avg_brightness, 1),
        "dark_pixel_ratio": round(dark_ratio, 3),
        "light_pixel_ratio": round(light_ratio, 3),
        "resolution_score": round(resolution_score, 1),
        "quality_score": round(max(0, min(100, quality_score)), 1),
        "issues": issues,
    }


# ============================================================
# AI 视觉一致性验证（新增维度）
# ============================================================

def check_consistency_via_ai(
    image_paths: list[str],
    profile: Optional[dict] = None,
    api_key: str = "",
) -> dict:
    """
    使用 AI 视觉能力验证产品一致性。
    分析多张图中产品是否视觉一致。

    返回:
        {
            "ai_consistency_score": 0-100,
            "ai_issues": [...],
        }
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    if not api_key or len(image_paths) < 2:
        return {"ai_consistency_score": None, "ai_issues": [], "_note": "AI 检测不可用（需要 API Key 和至少2张图）"}

    try:
        import base64
        import requests

        # 选取前 4 张图作为样本
        sample_paths = image_paths[:4]

        parts = []
        for path in sample_paths:
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            mime = "image/jpeg"
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})

        product_context = ""
        if profile:
            product_context = (
                f"Expected product: {profile.get('product_name', '')}. "
                f"Category: {profile.get('category', '')}. "
                f"Colors: {profile.get('colors', {})}. "
                f"Materials: {', '.join(profile.get('materials', []))}. "
                f"Key features: {', '.join(profile.get('key_features', []))}."
            )

        prompt = f"""You are a product consistency inspector for e-commerce AI-generated images.

{product_context}

Analyze these {len(sample_paths)} product images of the SAME product in different scenes.
Rate on each dimension (0-100, higher = better):

1. product_consistency: Does the product look the same across all images? Same color, shape, materials?
2. color_accuracy: Is the product's color consistent across scenes?
3. detail_preservation: Are fine details (logo, stitching, hardware) consistently visible?
4. feature_retention: Are key features present in all images?
5. overall_consistency: Overall product visual consistency score.

Also list specific issues found (if any).
Output JSON only:
{{
  "product_consistency": 0-100,
  "color_accuracy": 0-100,
  "detail_preservation": 0-100,
  "feature_retention": 0-100,
  "overall_consistency": 0-100,
  "issues": ["issue description"],
  "summary": "one sentence verdict"
}}"""

        resp = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "contents": [{"parts": parts + [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024},
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        text = ""
        for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "text" in part:
                text += part["text"]

        from common.utils import parse_json_response
        result = parse_json_response(text)
        result["_method"] = "gemini_ai_vision"
        return {
            "ai_consistency_score": result.get("overall_consistency", 50),
            "ai_product_consistency": result.get("product_consistency", 50),
            "ai_color_accuracy": result.get("color_accuracy", 50),
            "ai_detail_preservation": result.get("detail_preservation", 50),
            "ai_feature_retention": result.get("feature_retention", 50),
            "ai_issues": result.get("issues", []),
            "ai_summary": result.get("summary", ""),
        }

    except Exception as e:
        logger.warning(f"AI 一致性验证不可用: {e}")
        return {"ai_consistency_score": None, "ai_issues": [str(e)[:80]], "_note": "AI 检测失败"}


# ============================================================
# 批量检测（增强版）
# ============================================================

def check_batch_consistency(
    image_paths: list[str],
    profile: Optional[dict] = None,
    reference_images: Optional[list] = None,
) -> dict:
    """
    批量检测一致性。

    reference_images: 用户上传的原始产品图；提供时会额外计算
    「参考图保真度」（主体区域颜色+结构相似），并按 25% 权重并入总分。

    返回:
        {
            "total": 10,
            "consistency_score": 85.5,
            "per_image": [...],
            "color_drift": {"max": 23.4, "avg": 12.1},
            "reference_fidelity": {...},
            "issues": [...],
            "pass": True/False
        }
    """
    if not image_paths:
        return {"total": 0, "error": "No images provided"}

    logger.info(f"\n{'='*50}")
    logger.info(f"🔍 产品一致性检测 — {len(image_paths)} 张图片")
    logger.info(f"{'='*50}\n")

    # 逐张检测
    per_image = []
    for path in image_paths:
        name = os.path.basename(path)

        # 质量检测
        quality = check_image_quality(path)

        # 颜色提取
        colors = extract_dominant_colors(path) if HAS_PIL else []

        per_image.append({
            "file": name,
            "path": path,
            "quality": quality,
            "dominant_colors": colors,
        })

        # 打印单行摘要
        if quality.get("quality_score", 0) > 0:
            score = quality["quality_score"]
            status = "✅" if score >= 60 else "⚠️" if score >= 40 else "❌"
            colors_str = " ".join(c.get("hex", "") for c in colors[:2])
            issues = quality.get("issues", [])
            issue_str = f" [{', '.join(issues)}]" if issues else ""
            logger.info(f"  {status} {name:<40} 评分:{score:>5.1f}  {colors_str}{issue_str}")
        else:
            logger.info(f"  ❓ {name:<40}  无法检测")

    if not HAS_PIL:
        logger.warning(f"\n  ⚠️  安装 Pillow 获取更详细检测: pip install Pillow")
        return {
            "total": len(image_paths),
            "consistency_score": 0,
            "per_image": per_image,
            "pass": False,
            "note": "Pillow not installed",
        }

    # 颜色漂移分析
    all_colors = []
    for item in per_image:
        for c in item.get("dominant_colors", []):
            all_colors.append(c)

    color_drifts = []
    if len(all_colors) >= 2:
        base_color = all_colors[0]  # 第一张图的主色作为基准
        for c in all_colors[1:]:
            drift = color_distance(base_color, c)
            color_drifts.append(drift)

    avg_color_drift = sum(color_drifts) / max(len(color_drifts), 1)
    max_color_drift = max(color_drifts) if color_drifts else 0

    # 打分
    quality_scores = [i["quality"]["quality_score"] for i in per_image
                      if i["quality"].get("quality_score", 0) > 0]
    avg_quality = sum(quality_scores) / max(len(quality_scores), 1)

    # ── AI 视觉一致性验证（增强维度） ──
    ai_result = check_consistency_via_ai(image_paths, profile)
    ai_score = ai_result.get("ai_consistency_score")

    # 综合一致性评分（图像分析 + AI 视觉）
    consistency_score = avg_quality * 0.6

    # 颜色漂移扣分
    color_penalty = min(30, avg_color_drift * 0.3)
    consistency_score -= color_penalty

    # 异常图片扣分
    bad_images = sum(1 for i in per_image
                     if i["quality"].get("quality_score", 0) < 40)
    consistency_score -= bad_images * 5

    consistency_score = round(max(0, min(100, consistency_score)), 1)
    image_score = consistency_score  # 传统图像分析维度得分

    # ── 产品同一性语义 QA（核心维度：视觉 LLM 只看产品主体是否同一） ──
    identity_report = {"available": False}
    if reference_images:
        try:
            from identity_qa import check_product_identity
            identity_report = check_product_identity(
                reference_images, image_paths, profile)
        except Exception as e:
            logger.warning(f"产品同一性语义 QA 不可用: {e}")
            identity_report = {"available": False, "note": str(e)[:80]}

    # ── 参考图保真度（主体区域嵌入级度量） ──
    fidelity_report = {}
    if reference_images:
        try:
            from visual_similarity import reference_fidelity_report
            fidelity_report = reference_fidelity_report(reference_images, image_paths)
        except Exception as e:
            logger.warning(f"参考图保真度计算不可用: {e}")
            fidelity_report = {"avg_fidelity": None, "note": str(e)[:80]}
    avg_fidelity = fidelity_report.get("avg_fidelity") if fidelity_report else None

    identity_based = bool(identity_report.get("available"))
    if identity_based:
        # 语义 QA 可信时以它为主：产品同一性 55% + 图像分析 25% + 多图一致 20%。
        # 全图嵌入保真度对创意场景天然偏低，此时仅作信息展示、不参与打分。
        avg_identity = identity_report["avg_identity"]
        cross_image = ai_score if ai_score is not None else avg_identity
        consistency_score = round(
            avg_identity * 0.55 + image_score * 0.25 + cross_image * 0.20, 1)
        # 把单图同一性分并入 per_image，供自动重生成挑选低分场景
        identity_by_file = {e["file"]: e for e in identity_report.get("per_image", [])}
        for item in per_image:
            entry = identity_by_file.get(item["file"])
            if entry:
                item["identity_score"] = entry.get("identity_score")
                if entry.get("issue"):
                    item["identity_issue"] = entry["issue"]
                # 视觉 LLM 的画面瑕疵分（畸形/伪影/乱字等），供自动重生成
                if entry.get("defect_score") is not None:
                    item["defect_score"] = entry["defect_score"]
                if entry.get("defect_issue"):
                    item["defect_issue"] = entry["defect_issue"]
        logger.info(f"\n  🧬 产品同一性(语义): {avg_identity}/100 (权重 55%)")
        logger.info(f"  🔬 图像分析: {image_score}/100 (权重 25%)")
        logger.info(f"  🤖 多图一致: {cross_image}/100 (权重 20%)")
        logger.info(f"  🎯 综合一致性评分: {consistency_score}/100")
    elif ai_score is not None:
        ai_weight = 0.4  # AI 视觉占 40%
        image_weight = 0.6  # 图像分析占 60%
        blended = consistency_score * image_weight + ai_score * ai_weight
        logger.info(f"\n  🤖 AI 视觉一致性: {ai_score}/100 (权重 {ai_weight*100:.0f}%)")
        logger.info(f"  🔬 图像分析一致性: {consistency_score}/100 (权重 {image_weight*100:.0f}%)")
        logger.info(f"  🎯 综合一致性评分: {blended:.1f}/100")
        consistency_score = round(blended, 1)
    else:
        logger.info(f"\n  ℹ️  语义/AI 视觉验证未启用（配置 OPENAI_API_KEY 或 GEMINI_API_KEY 可开启）")

    if avg_fidelity is not None and not identity_based:
        fidelity_weight = 0.25
        consistency_score = round(
            consistency_score * (1 - fidelity_weight) + avg_fidelity * fidelity_weight, 1
        )
        logger.info(f"  🎯 参考图保真度: {avg_fidelity}/100 (权重 {fidelity_weight*100:.0f}%)")
        logger.info(f"  🎯 融合后一致性评分: {consistency_score}/100")

    # 汇总问题
    all_issues = []
    for item in per_image:
        for issue in item["quality"].get("issues", []):
            all_issues.append(f"{item['file']}: {issue}")

    # 颜色大漂移
    if max_color_drift > 30:
        all_issues.append(f"颜色漂移较大 (max Δ={max_color_drift:.0f})")

    # 产品同一性低分的单图（语义 QA 维度）
    for entry in (identity_report.get("per_image") or []):
        iid = entry.get("identity_score")
        if iid is not None and iid < 60:
            issue = entry.get("issue") or "产品主体与参考图不一致"
            all_issues.append(f"{entry['file']}: 同一性 {iid}/100 — {issue}")
        dfs = entry.get("defect_score")
        if dfs is not None and dfs < 60:
            d_issue = entry.get("defect_issue") or "画面存在明显生成瑕疵"
            all_issues.append(f"{entry['file']}: 画面瑕疵 {dfs}/100 — {d_issue}")

    # 参考图保真度过低的单图（仅在语义 QA 不可用时作为判据）
    if not identity_based:
        for entry in (fidelity_report.get("per_image") or []):
            fid = entry.get("fidelity")
            if fid is not None and fid < 50:
                all_issues.append(f"{entry['file']}: 与原始产品图相似度偏低 ({fid}/100)")

    # 汇总 AI 问题
    ai_issues = ai_result.get("ai_issues", [])
    all_issues.extend(ai_issues)

    pass_threshold = 55
    passed = consistency_score >= pass_threshold

    # 结果
    result = {
        "total": len(image_paths),
        "consistency_score": consistency_score,
        "pass": passed,
        "avg_quality_score": round(avg_quality, 1),
        "color_drift": {
            "max": round(max_color_drift, 1),
            "avg": round(avg_color_drift, 1),
        },
        "bad_image_count": bad_images,
        "per_image": per_image,
        "ai_vision": {
            "score": ai_score,
            "product_consistency": ai_result.get("ai_product_consistency"),
            "color_accuracy": ai_result.get("ai_color_accuracy"),
            "detail_preservation": ai_result.get("ai_detail_preservation"),
            "feature_retention": ai_result.get("ai_feature_retention"),
            "summary": ai_result.get("ai_summary", ""),
        },
        "identity": identity_report,
        "identity_based": identity_based,
        "reference_fidelity": fidelity_report,
        "issues": all_issues[:30],  # 最多30条
    }

    # 输出
    logger.info(f"\n{'-'*50}")
    grade = "✅ 通过" if passed else "❌ 需调整"
    logger.info(f"  一致性评分: {consistency_score}/100 ({grade})")
    logger.info(f"  平均画质:   {avg_quality:.1f}/100")
    logger.info(f"  颜色漂移:   Δ={avg_color_drift:.1f} (max Δ={max_color_drift:.1f})")
    if all_issues:
        logger.info(f"  发现问题:   {len(all_issues)} 项")
        for issue in all_issues[:5]:
            logger.info(f"    · {issue}")
        if len(all_issues) > 5:
            logger.info(f"    ... 还有 {len(all_issues) - 5} 项")
    logger.info(f"{'='*50}\n")

    return result


# ============================================================
# 报告输出
# ============================================================

def generate_report(result: dict, output_path: str, profile_name: str = ""):
    """生成可读的一致性检测报告"""
    ext = os.path.splitext(output_path)[1].lower()

    if ext == ".json":
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.info(f"📄 报告已保存: {output_path}")
        return

    # Markdown 报告
    lines = []
    lines.append("# 产品一致性检测报告\n")
    if profile_name:
        lines.append(f"**产品**: {profile_name}\n")
    lines.append(f"**检测时间**: {__import__('time').strftime('%Y-%m-%d %H:%M:%S')}\n")
    lines.append(f"**图片数量**: {result.get('total', 0)}\n")

    score = result.get("consistency_score", 0)
    passed = result.get("pass", False)
    grade = "✅ 通过" if passed else "❌ 需调整"
    lines.append(f"**一致性评分**: {score}/100 — {grade}\n")

    lines.append("## 检测指标\n")
    lines.append(f"| 指标 | 值 | 说明 |")
    lines.append(f"|------|-----|------|")
    lines.append(f"| 一致性评分 | {score}/100 | {'≥55通过' if passed else '需≥55'} |")
    lines.append(f"| 平均画质 | {result.get('avg_quality_score', 0)}/100 | 越高越好 |")
    lines.append(f"| 颜色漂移 (平均) | Δ={result.get('color_drift', {}).get('avg', 0)} | <15为佳 |")
    lines.append(f"| 颜色漂移 (最大) | Δ={result.get('color_drift', {}).get('max', 0)} | <30为佳 |")
    lines.append(f"| 异常图片 | {result.get('bad_image_count', 0)}张 | 评分<40 |")
    lines.append("")

    lines.append("## 逐图检测\n")
    lines.append(f"| # | 文件 | 质量评分 | 问题 |")
    lines.append(f"|---|------|---------|------|")
    for i, img in enumerate(result.get("per_image", []), 1):
        quality = img.get("quality", {})
        score_i = quality.get("quality_score", 0)
        issues = quality.get("issues", [])
        issue_str = "; ".join(issues) if issues else "无"
        lines.append(f"| {i} | {img['file']} | {score_i} | {issue_str} |")

    lines.append("")
    lines.append("## 问题汇总\n")
    issues = result.get("issues", [])
    if issues:
        for issue in issues:
            lines.append(f"- ❗ {issue}")
    else:
        lines.append("- 无显著问题\n")

    # 写入文件
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    logger.info(f"📄 报告已保存: {output_path}")


# ============================================================
# CLI入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="🔍 产品一致性检测器 — 自动检查颜色漂移、画质问题",
    )

    input_group = parser.add_argument_group("input", "输入方式")
    input_group.add_argument("--images", nargs="+", default=None, help="图片路径列表")
    input_group.add_argument("--input-dir", default=None, help="图片目录")

    parser.add_argument("--profile", default=None, help="产品档案 JSON（作为参考）")
    parser.add_argument("--report", "-o", default=None, help="输出报告路径 (.json 或 .md)")
    parser.add_argument("--quick", action="store_true", help="快速模式（仅基础检测）")
    parser.add_argument("--threshold", type=float, default=55, help="通过阈值（默认55）")

    args = parser.parse_args()

    # 收集图片
    image_paths = []
    if args.images:
        for pattern in args.images:
            # 支持通配符（shell 展开）
            image_paths.extend([p for p in [pattern] if os.path.exists(p)])
    elif args.input_dir:
        if not os.path.isdir(args.input_dir):
            logger.error(f"❌ 目录不存在: {args.input_dir}")
            sys.exit(1)
        exts = (".jpg", ".jpeg", ".png", ".webp")
        image_paths = sorted([
            os.path.join(args.input_dir, f) for f in os.listdir(args.input_dir)
            if f.lower().endswith(exts) and not f.startswith("_")
        ])
    else:
        logger.error("❌ 请提供 --images 或 --input-dir")
        sys.exit(1)

    if not image_paths:
        logger.error("❌ 未找到图片")
        sys.exit(1)

    # 加载产品档案
    profile = None
    profile_name = ""
    if args.profile and os.path.exists(args.profile):
        with open(args.profile, "r", encoding="utf-8-sig") as f:
            profile = json.load(f)
        profile_name = profile.get("product_name", "")

    # 执行检测
    result = check_batch_consistency(image_paths, profile)

    # 输出报告
    if args.report:
        generate_report(result, args.report, profile_name)

    # 退出码
    if not result.get("pass", False):
        sys.exit(1)


if __name__ == "__main__":
    main()
