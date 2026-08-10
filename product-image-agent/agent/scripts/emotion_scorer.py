#!/usr/bin/env python3
"""
english_text — Emotion Scorer

text AI english_text：
  - english_text：english_text？english_text？
  - english_text：textyesnotextvisualtext？
  - english_text：textyesnotext？
  - english_text：english_textyestext，yesnoenglish_text？

text：
  # english_text
  python emotion_scorer.py --image scene_01.jpg

  # english_text
  python emotion_scorer.py --batch-dir ./outputs/final/
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

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

# 10texte-commerceenglish_text
EMOTION_DIMENSIONS = {
    "professional": {"name": "english_text", "keywords": ["text", "text", "text", "text"]},
    "aspirational": {"name": "english_text", "keywords": ["text", "text", "english_text", "english_text"]},
    "luxurious": {"name": "english_text", "keywords": ["text", "text", "english_text", "text"]},
    "warm_comfort": {"name": "english_text", "keywords": ["text", "text", "text", "text"]},
    "trustworthy": {"name": "realtext", "keywords": ["real", "text", "text", "text"]},
    "exciting": {"name": "english_text", "keywords": ["text", "text", "text", "text"]},
    "seasonal": {"name": "english_text", "keywords": ["text", "text", "english_text", "text"]},
    "minimal": {"name": "english_text", "keywords": ["text", "text", "text", "text"]},
    "nostalgic": {"name": "english_text", "keywords": ["text", "text", "text", "text"]},
    "playful": {"name": "yesenglish_text", "keywords": ["yestext", "text", "text", "text"]},
}


def score_image_quality(image_path: str) -> dict:
    """
    english_text（nonetext API）。
    text 0-100 english_text。
    """
    if not HAS_PIL:
        return {"quality_score": 50, "error": "Pillow not installed"}

    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as e:
        return {"quality_score": 0, "error": str(e)}

    w, h = img.size
    pixels = list(img.getdata())
    total = len(pixels)

    # text
    brightnesses = [(r + g + b) / 3 for r, g, b in pixels]
    avg_brightness = sum(brightnesses) / total

    # english_text
    brightness_vals = sorted(brightnesses)
    bottom_10 = brightness_vals[int(total * 0.1)]
    top_10 = brightness_vals[int(total * 0.9)]
    contrast = top_10 - bottom_10

    # english_text（RGBenglish_text）
    r_vals = [p[0] for p in pixels]
    g_vals = [p[1] for p in pixels]
    b_vals = [p[2] for p in pixels]
    r_range = max(r_vals) - min(r_vals)
    g_range = max(g_vals) - min(g_vals)
    b_range = max(b_vals) - min(b_vals)
    color_range = (r_range + g_range + b_range) / 3

    # english_text
    resolution = min(100, (w * h) / (1920 * 1080) * 100)

    # english_text
    score = 100
    score -= abs(avg_brightness - 128) * 0.3  # text
    score -= max(0, 60 - contrast) * 0.2  # english_text
    score += min(20, color_range * 0.05)  # text
    score = max(0, min(100, score))

    return {
        "quality_score": round(score, 1),
        "avg_brightness": round(avg_brightness, 1),
        "contrast": round(contrast, 1),
        "resolution_score": round(resolution, 1),
        "width": w,
        "height": h,
    }


def score_via_gemini(image_path: str, api_key: str = "") -> dict:
    """
    text Gemini Vision textimageenglish_text。
    text API Key english_text。
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _fallback_score(image_path, "no_api_key")

    import base64
    import requests

    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    prompt = """Score this e-commerce product image on these dimensions (1-10):
1. emotional_impact: How emotionally compelling is this image?
2. product_focus: Is the product clearly the hero?
3. composition: Is the composition professional?
4. lighting: Is the lighting appropriate and appealing?
5. color_harmony: Are the colors harmonious?
6. commercial_value: How suitable is this for e-commerce listing?

Also identify:
- dominant_emotion: the main emotion this image conveys
- improvement: one specific improvement suggestion

Output JSON only, no explanation."""

    try:
        resp = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "contents": [{
                    "parts": [
                        {"inlineData": {"mimeType": "image/jpeg", "data": b64}},
                        {"text": prompt},
                    ]
                }],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1024},
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        text = ""
        for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "text" in part:
                text += part["text"]

        # text JSON
        for delim in ["```json", "```"]:
            if delim in text:
                start = text.index(delim) + len(delim)
                end = text.index("```", start) if "```" in text[start:] else len(text)
                text = text[start:end].strip()
        result = json.loads(text)
        result["_method"] = "gemini_ai"
        return result

    except Exception as e:
        return _fallback_score(image_path, str(e)[:50])


def _fallback_score(image_path: str, reason: str = "") -> dict:
    """english_text"""
    quality = score_image_quality(image_path)
    return {
        "emotional_impact": round(quality["quality_score"] / 20, 1),
        "product_focus": 7.0,
        "composition": round(quality["resolution_score"] / 15, 1),
        "lighting": round(max(1, 10 - abs(quality["avg_brightness"] - 128) / 15), 1),
        "color_harmony": round(quality["quality_score"] / 15, 1),
        "commercial_value": round(quality["quality_score"] / 12, 1),
        "dominant_emotion": "professional",
        "improvement": reason,
        "quality_score": quality["quality_score"],
        "_method": "fallback_image_analysis",
    }


# ============================================================
# english_text
# ============================================================

def batch_score(
    input_dir: str,
    api_key: str = "",
    parallel: bool = True,
    use_ai: bool = False,
) -> dict:
    """english_text"""
    exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f) for f in os.listdir(input_dir)
        if f.lower().endswith(exts) and not f.startswith("_")
    ])

    if not image_paths:
        logger.error(f"❌ english_textimage: {input_dir}")
        return {"total": 0}

    logger.info(f"\n{'='*50}")
    logger.info(f"  📊 english_text — {len(image_paths)} text")
    method = "AI visual" if use_ai else "english_text"
    logger.info(f"  text: {method}")
    logger.info(f"{'='*50}\n")

    results = []
    if parallel and len(image_paths) > 1:
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {}
            for path in image_paths:
                if use_ai:
                    future = executor.submit(score_via_gemini, path, api_key)
                else:
                    future = executor.submit(score_image_quality, path)
                futures[future] = path

            for future in as_completed(futures):
                path = futures[future]
                name = os.path.basename(path)
                try:
                    score_result = future.result()
                    results.append({"file": name, **score_result})
                except Exception as e:
                    results.append({"file": name, "error": str(e)})
    else:
        for path in image_paths:
            name = os.path.basename(path)
            if use_ai:
                score_result = score_via_gemini(path, api_key)
            else:
                score_result = score_image_quality(path)
            results.append({"file": name, **score_result})

    # english_text
    total_quality = sum(r.get("quality_score", r.get("emotional_impact", 0) * 10) for r in results)
    avg_score = total_quality / max(len(results), 1)

    # outputtext
    logger.info(f"  {'file':<35} {'english_text':>8} {'text':<12} {'text'}")
    logger.info(f"  {'-'*35} {'-'*8} {'-'*12} {'-'*30}")

    for r in results:
        qs = r.get("quality_score", r.get("emotional_impact", 0) * 10)
        emotion = r.get("dominant_emotion", "-")
        impr = r.get("improvement", "")[:28]
        logger.info(f"  {r['file']:<35} {qs:>8.1f} {emotion:<12} {impr}")

    # text
    logger.info(f"\n  {'='*40}")
    logger.info(f"  english_text: {avg_score:.1f}/100")
    logger.info(f"  {'='*40}\n")

    return {
        "method": method,
        "total": len(results),
        "avg_quality_score": round(avg_score, 1),
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="📊 english_text")
    parser.add_argument("--image", default=None, help="textimagetext")
    parser.add_argument("--batch-dir", default=None, help="english_text")
    parser.add_argument("--output", "-o", default=None, help="outputtext JSON")
    parser.add_argument("--use-ai", action="store_true", help="text AI text（text GEMINI_API_KEY）")
    parser.add_argument("--no-parallel", action="store_true")

    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY", "")

    if args.image:
        if args.use_ai:
            result = score_via_gemini(args.image, api_key)
        else:
            result = score_image_quality(args.image)
            result["file"] = os.path.basename(args.image)
        print(json.dumps(result, ensure_ascii=False, indent=2))

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

    elif args.batch_dir:
        result = batch_score(
            input_dir=args.batch_dir,
            api_key=api_key,
            parallel=not args.no_parallel,
            use_ai=args.use_ai,
        )
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            logger.info(f"  💾 english_text: {args.output}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
