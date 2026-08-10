#!/usr/bin/env python3
"""
textconsistencydetectiontext — Consistency Checker

automatictext AI generationenglish_text：
  - textconsistency：english_textyesnotextscenetext
  - textconsistency：yesnoenglish_text
  - english_text：yesnotext/text/text

outputtextreport + text。

text：
  # detectiontextimage
  python consistency_checker.py \
    --images ./outputs/scene_*.jpg \
    --profile product_profile.json \
    --report consistency_report.json

  # detectiontextoutputtext
  python consistency_checker.py \
    --input-dir ./outputs/my_product/ \
    --profile profile.json \
    --report report.md

  # english_text
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

# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import collect_images, setup_logger, get_api_key
logger = setup_logger(__name__)

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# ============================================================
# english_text
# ============================================================

def extract_dominant_colors(image_path: str, num_colors: int = 3) -> list[dict]:
    """
    textimageenglish_text。
    english_text（english_text）。
    """
    if not HAS_PIL:
        return []

    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return []

    # english_text
    img = img.resize((64, 64), Image.LANCZOS)
    pixels = list(img.getdata())

    # english_text
    color_buckets = {}
    for r, g, b in pixels:
        # english_text 4bit text
        key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
        color_buckets[key] = color_buckets.get(key, 0) + 1

    # english_text
    sorted_colors = sorted(color_buckets.items(), key=lambda x: -x[1])

    results = []
    for key, count in sorted_colors[:num_colors]:
        r = ((key >> 8) & 0xF) << 4
        g = ((key >> 4) & 0xF) << 4
        b = (key & 0xF) << 4

        # english_text、text（backgroundtext）
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
    """english_text (0-441)"""
    dr = c1.get("rgb", {}).get("r", 0) - c2.get("rgb", {}).get("r", 0)
    dg = c1.get("rgb", {}).get("g", 0) - c2.get("rgb", {}).get("g", 0)
    db = c1.get("rgb", {}).get("b", 0) - c2.get("rgb", {}).get("b", 0)
    return math.sqrt(dr ** 2 + dg ** 2 + db ** 2)


# ============================================================
# english_textdetection
# ============================================================

def check_image_quality(image_path: str) -> dict:
    """detectiontextimageenglish_text"""
    if not HAS_PIL:
        return {"quality_score": 0, "issues": ["Pillow not installed"]}

    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as e:
        return {"error": str(e), "quality_score": 0}

    w, h = img.size
    pixels = list(img.getdata())
    total = len(pixels)

    # english_text
    brightnesses = [(r + g + b) / 3 for r, g, b in pixels]
    avg_brightness = sum(brightnesses) / total

    # english_text
    dark_ratio = sum(1 for b in brightnesses if b < 30) / total
    # english_text
    light_ratio = sum(1 for b in brightnesses if b > 225) / total

    issues = []
    if avg_brightness < 50:
        issues.append("english_text")
    elif avg_brightness > 200:
        issues.append("english_text")
    if dark_ratio > 0.3:
        issues.append(f"english_text ({dark_ratio*100:.0f}%)")
    if light_ratio > 0.5:
        issues.append(f"english_text ({light_ratio*100:.0f}%)")

    # english_text
    resolution_score = min(100, w * h / 10000)

    # english_text (0-100)
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
# AI visualconsistencytext（english_text）
# ============================================================

def check_consistency_via_ai(
    image_paths: list[str],
    profile: Optional[dict] = None,
    api_key: str = "",
) -> dict:
    """
    text AI visualenglish_textconsistency。
    english_textyesnovisualtext。

    text:
        {
            "ai_consistency_score": 0-100,
            "ai_issues": [...],
        }
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    if not api_key or len(image_paths) < 2:
        return {"ai_consistency_score": None, "ai_issues": [], "_note": "AI detectionenglish_text（text API Key english_text2text）"}

    try:
        import base64
        import requests

        # english_text 4 english_text
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
        logger.warning(f"AI consistencyenglish_text: {e}")
        return {"ai_consistency_score": None, "ai_issues": [str(e)[:80]], "_note": "AI detectionfailed"}


# ============================================================
# textdetection（english_text）
# ============================================================

def check_batch_consistency(
    image_paths: list[str],
    profile: Optional[dict] = None,
    reference_images: Optional[list] = None,
) -> dict:
    """
    textdetectionconsistency。

    reference_images: userenglish_text；english_text
    「english_text」（english_text+english_text），text 25% english_text。

    text:
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
    logger.info(f"🔍 textconsistencydetection — {len(image_paths)} textimage")
    logger.info(f"{'='*50}\n")

    # textdetection
    per_image = []
    for path in image_paths:
        name = os.path.basename(path)

        # textdetection
        quality = check_image_quality(path)

        # english_text
        colors = extract_dominant_colors(path) if HAS_PIL else []

        per_image.append({
            "file": name,
            "path": path,
            "quality": quality,
            "dominant_colors": colors,
        })

        # english_text
        if quality.get("quality_score", 0) > 0:
            score = quality["quality_score"]
            status = "✅" if score >= 60 else "⚠️" if score >= 40 else "❌"
            colors_str = " ".join(c.get("hex", "") for c in colors[:2])
            issues = quality.get("issues", [])
            issue_str = f" [{', '.join(issues)}]" if issues else ""
            logger.info(f"  {status} {name:<40} text:{score:>5.1f}  {colors_str}{issue_str}")
        else:
            logger.info(f"  ❓ {name:<40}  nonetextdetection")

    if not HAS_PIL:
        logger.warning(f"\n  ⚠️  text Pillow english_textdetection: pip install Pillow")
        return {
            "total": len(image_paths),
            "consistency_score": 0,
            "per_image": per_image,
            "pass": False,
            "note": "Pillow not installed",
        }

    # english_text
    all_colors = []
    for item in per_image:
        for c in item.get("dominant_colors", []):
            all_colors.append(c)

    color_drifts = []
    if len(all_colors) >= 2:
        base_color = all_colors[0]  # english_text
        for c in all_colors[1:]:
            drift = color_distance(base_color, c)
            color_drifts.append(drift)

    avg_color_drift = sum(color_drifts) / max(len(color_drifts), 1)
    max_color_drift = max(color_drifts) if color_drifts else 0

    # text
    quality_scores = [i["quality"]["quality_score"] for i in per_image
                      if i["quality"].get("quality_score", 0) > 0]
    avg_quality = sum(quality_scores) / max(len(quality_scores), 1)

    # ── AI visualconsistencytext（english_text） ──
    ai_result = check_consistency_via_ai(image_paths, profile)
    ai_score = ai_result.get("ai_consistency_score")

    # textconsistencytext（english_text + AI visual）
    consistency_score = avg_quality * 0.6

    # english_text
    color_penalty = min(30, avg_color_drift * 0.3)
    consistency_score -= color_penalty

    # textimagetext
    bad_images = sum(1 for i in per_image
                     if i["quality"].get("quality_score", 0) < 40)
    consistency_score -= bad_images * 5

    consistency_score = round(max(0, min(100, consistency_score)), 1)
    image_score = consistency_score  # english_text

    # ── english_text QA（english_text：visual LLM english_textyesnotext） ──
    identity_report = {"available": False}
    if reference_images:
        try:
            from identity_qa import check_product_identity
            identity_report = check_product_identity(
                reference_images, image_paths, profile)
        except Exception as e:
            logger.warning(f"english_text QA english_text: {e}")
            identity_report = {"available": False, "note": str(e)[:80]}

    # ── english_text（english_text） ──
    fidelity_report = {}
    if reference_images:
        try:
            from visual_similarity import reference_fidelity_report
            fidelity_report = reference_fidelity_report(reference_images, image_paths)
        except Exception as e:
            logger.warning(f"english_text: {e}")
            fidelity_report = {"avg_fidelity": None, "note": str(e)[:80]}
    avg_fidelity = fidelity_report.get("avg_fidelity") if fidelity_report else None

    identity_based = bool(identity_report.get("available"))
    if identity_based:
        # text QA english_text：english_text 55% + english_text 25% + english_text 20%。
        # english_textsceneenglish_text，english_text、english_text。
        avg_identity = identity_report["avg_identity"]
        cross_image = ai_score if ai_score is not None else avg_identity
        consistency_score = round(
            avg_identity * 0.55 + image_score * 0.25 + cross_image * 0.20, 1)
        # english_text per_image，textautomatictextgenerationenglish_textscene
        identity_by_file = {e["file"]: e for e in identity_report.get("per_image", [])}
        for item in per_image:
            entry = identity_by_file.get(item["file"])
            if entry:
                item["identity_score"] = entry.get("identity_score")
                if entry.get("issue"):
                    item["identity_issue"] = entry["issue"]
                # visual LLM english_text（text/text/english_text），textautomatictextgeneration
                if entry.get("defect_score") is not None:
                    item["defect_score"] = entry["defect_score"]
                if entry.get("defect_issue"):
                    item["defect_issue"] = entry["defect_issue"]
        logger.info(f"\n  🧬 english_text(text): {avg_identity}/100 (text 55%)")
        logger.info(f"  🔬 english_text: {image_score}/100 (text 25%)")
        logger.info(f"  🤖 english_text: {cross_image}/100 (text 20%)")
        logger.info(f"  🎯 textconsistencytext: {consistency_score}/100")
    elif ai_score is not None:
        ai_weight = 0.4  # AI visualtext 40%
        image_weight = 0.6  # english_text 60%
        blended = consistency_score * image_weight + ai_score * ai_weight
        logger.info(f"\n  🤖 AI visualconsistency: {ai_score}/100 (text {ai_weight*100:.0f}%)")
        logger.info(f"  🔬 english_textconsistency: {consistency_score}/100 (text {image_weight*100:.0f}%)")
        logger.info(f"  🎯 textconsistencytext: {blended:.1f}/100")
        consistency_score = round(blended, 1)
    else:
        logger.info(f"\n  ℹ️  text/AI visualenglish_text（configuration OPENAI_API_KEY text GEMINI_API_KEY english_text）")

    if avg_fidelity is not None and not identity_based:
        fidelity_weight = 0.25
        consistency_score = round(
            consistency_score * (1 - fidelity_weight) + avg_fidelity * fidelity_weight, 1
        )
        logger.info(f"  🎯 english_text: {avg_fidelity}/100 (text {fidelity_weight*100:.0f}%)")
        logger.info(f"  🎯 english_textconsistencytext: {consistency_score}/100")

    # english_text
    all_issues = []
    for item in per_image:
        for issue in item["quality"].get("issues", []):
            all_issues.append(f"{item['file']}: {issue}")

    # english_text
    if max_color_drift > 30:
        all_issues.append(f"english_text (max Δ={max_color_drift:.0f})")

    # english_text（text QA text）
    for entry in (identity_report.get("per_image") or []):
        iid = entry.get("identity_score")
        if iid is not None and iid < 60:
            issue = entry.get("issue") or "english_text"
            all_issues.append(f"{entry['file']}: english_text {iid}/100 — {issue}")
        dfs = entry.get("defect_score")
        if dfs is not None and dfs < 60:
            d_issue = entry.get("defect_issue") or "english_textgenerationtext"
            all_issues.append(f"{entry['file']}: english_text {dfs}/100 — {d_issue}")

    # english_text（english_text QA english_text）
    if not identity_based:
        for entry in (fidelity_report.get("per_image") or []):
            fid = entry.get("fidelity")
            if fid is not None and fid < 50:
                all_issues.append(f"{entry['file']}: english_text ({fid}/100)")

    # text AI text
    ai_issues = ai_result.get("ai_issues", [])
    all_issues.extend(ai_issues)

    pass_threshold = 55
    passed = consistency_score >= pass_threshold

    # text
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
        "issues": all_issues[:30],  # text30text
    }

    # output
    logger.info(f"\n{'-'*50}")
    grade = "✅ passed" if passed else "❌ english_text"
    logger.info(f"  consistencytext: {consistency_score}/100 ({grade})")
    logger.info(f"  english_text:   {avg_quality:.1f}/100")
    logger.info(f"  english_text:   Δ={avg_color_drift:.1f} (max Δ={max_color_drift:.1f})")
    if all_issues:
        logger.info(f"  english_text:   {len(all_issues)} text")
        for issue in all_issues[:5]:
            logger.info(f"    · {issue}")
        if len(all_issues) > 5:
            logger.info(f"    ... textyes {len(all_issues) - 5} text")
    logger.info(f"{'='*50}\n")

    return result


# ============================================================
# reportoutput
# ============================================================

def generate_report(result: dict, output_path: str, profile_name: str = ""):
    """generationenglish_textconsistencydetectionreport"""
    ext = os.path.splitext(output_path)[1].lower()

    if ext == ".json":
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.info(f"📄 reportenglish_text: {output_path}")
        return

    # Markdown report
    lines = []
    lines.append("# textconsistencydetectionreport\n")
    if profile_name:
        lines.append(f"**text**: {profile_name}\n")
    lines.append(f"**detectiontext**: {__import__('time').strftime('%Y-%m-%d %H:%M:%S')}\n")
    lines.append(f"**imagetext**: {result.get('total', 0)}\n")

    score = result.get("consistency_score", 0)
    passed = result.get("pass", False)
    grade = "✅ passed" if passed else "❌ english_text"
    lines.append(f"**consistencytext**: {score}/100 — {grade}\n")

    lines.append("## detectiontext\n")
    lines.append(f"| text | text | text |")
    lines.append(f"|------|-----|------|")
    lines.append(f"| consistencytext | {score}/100 | {'≥55passed' if passed else 'text≥55'} |")
    lines.append(f"| english_text | {result.get('avg_quality_score', 0)}/100 | english_text |")
    lines.append(f"| english_text (text) | Δ={result.get('color_drift', {}).get('avg', 0)} | <15text |")
    lines.append(f"| english_text (text) | Δ={result.get('color_drift', {}).get('max', 0)} | <30text |")
    lines.append(f"| textimage | {result.get('bad_image_count', 0)}text | text<40 |")
    lines.append("")

    lines.append("## textdetection\n")
    lines.append(f"| # | file | english_text | text |")
    lines.append(f"|---|------|---------|------|")
    for i, img in enumerate(result.get("per_image", []), 1):
        quality = img.get("quality", {})
        score_i = quality.get("quality_score", 0)
        issues = quality.get("issues", [])
        issue_str = "; ".join(issues) if issues else "none"
        lines.append(f"| {i} | {img['file']} | {score_i} | {issue_str} |")

    lines.append("")
    lines.append("## english_text\n")
    issues = result.get("issues", [])
    if issues:
        for issue in issues:
            lines.append(f"- ❗ {issue}")
    else:
        lines.append("- noneenglish_text\n")

    # writefile
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    logger.info(f"📄 reportenglish_text: {output_path}")


# ============================================================
# CLItext
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="🔍 textconsistencydetectiontext — automaticenglish_text、english_text",
    )

    input_group = parser.add_argument_group("input", "inputtext")
    input_group.add_argument("--images", nargs="+", default=None, help="imageenglish_text")
    input_group.add_argument("--input-dir", default=None, help="imagetext")

    parser.add_argument("--profile", default=None, help="english_text JSON（english_text）")
    parser.add_argument("--report", "-o", default=None, help="outputreporttext (.json text .md)")
    parser.add_argument("--quick", action="store_true", help="english_text（english_textdetection）")
    parser.add_argument("--threshold", type=float, default=55, help="passedtext（text55）")

    args = parser.parse_args()

    # textimage
    image_paths = []
    if args.images:
        for pattern in args.images:
            # english_text（shell text）
            image_paths.extend([p for p in [pattern] if os.path.exists(p)])
    elif args.input_dir:
        if not os.path.isdir(args.input_dir):
            logger.error(f"❌ english_text: {args.input_dir}")
            sys.exit(1)
        exts = (".jpg", ".jpeg", ".png", ".webp")
        image_paths = sorted([
            os.path.join(args.input_dir, f) for f in os.listdir(args.input_dir)
            if f.lower().endswith(exts) and not f.startswith("_")
        ])
    else:
        logger.error("❌ english_text --images text --input-dir")
        sys.exit(1)

    if not image_paths:
        logger.error("❌ english_textimage")
        sys.exit(1)

    # english_text
    profile = None
    profile_name = ""
    if args.profile and os.path.exists(args.profile):
        with open(args.profile, "r", encoding="utf-8-sig") as f:
            profile = json.load(f)
        profile_name = profile.get("product_name", "")

    # textdetection
    result = check_batch_consistency(image_paths, profile)

    # outputreport
    if args.report:
        generate_report(result, args.report, profile_name)

    # english_text
    if not result.get("pass", False):
        sys.exit(1)


if __name__ == "__main__":
    main()
