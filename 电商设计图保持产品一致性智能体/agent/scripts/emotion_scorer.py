#!/usr/bin/env python3
"""
情绪价值评分器 — Emotion Scorer

用 AI 评估产品图的情绪传达效果：
  - 情绪传达度：这张图传递了哪种情绪？强度如何？
  - 产品突出度：产品是否在视觉焦点？
  - 构图评分：构图是否专业？
  - 文案配合度：如果配有文案，是否图文一致？

用法：
  # 单图评分
  python emotion_scorer.py --image scene_01.jpg

  # 批量评分
  python emotion_scorer.py --batch-dir ./outputs/final/
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

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
# 评分维度和标准
# ============================================================

# 10种电商情绪维度
EMOTION_DIMENSIONS = {
    "professional": {"name": "专业可信", "keywords": ["干净", "清晰", "正式", "可靠"]},
    "aspirational": {"name": "向往渴望", "keywords": ["美好", "理想", "品质生活", "令人向往"]},
    "luxurious": {"name": "奢华高端", "keywords": ["精致", "昂贵", "高级感", "奢华"]},
    "warm_comfort": {"name": "温暖舒适", "keywords": ["温馨", "舒适", "放松", "亲切"]},
    "trustworthy": {"name": "真实信任", "keywords": ["真实", "可信", "诚实", "透明"]},
    "exciting": {"name": "兴奋动感", "keywords": ["活力", "动感", "激情", "能量"]},
    "seasonal": {"name": "应景仪式", "keywords": ["节日", "季节", "仪式感", "限时"]},
    "minimal": {"name": "简约高级", "keywords": ["简约", "干净", "克制", "留白"]},
    "nostalgic": {"name": "怀旧情感", "keywords": ["怀旧", "经典", "回忆", "温度"]},
    "playful": {"name": "有趣活泼", "keywords": ["有趣", "活泼", "创意", "快乐"]},
}


def score_image_quality(image_path: str) -> dict:
    """
    基于图像处理的质量评分（无需 API）。
    返回 0-100 的分数。
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

    # 亮度
    brightnesses = [(r + g + b) / 3 for r, g, b in pixels]
    avg_brightness = sum(brightnesses) / total

    # 对比度估计
    brightness_vals = sorted(brightnesses)
    bottom_10 = brightness_vals[int(total * 0.1)]
    top_10 = brightness_vals[int(total * 0.9)]
    contrast = top_10 - bottom_10

    # 色彩丰富度（RGB通道差异）
    r_vals = [p[0] for p in pixels]
    g_vals = [p[1] for p in pixels]
    b_vals = [p[2] for p in pixels]
    r_range = max(r_vals) - min(r_vals)
    g_range = max(g_vals) - min(g_vals)
    b_range = max(b_vals) - min(b_vals)
    color_range = (r_range + g_range + b_range) / 3

    # 分辨率评分
    resolution = min(100, (w * h) / (1920 * 1080) * 100)

    # 综合质量评分
    score = 100
    score -= abs(avg_brightness - 128) * 0.3  # 曝光
    score -= max(0, 60 - contrast) * 0.2  # 对比度
    score += min(20, color_range * 0.05)  # 色彩
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
    使用 Gemini Vision 对图片进行情绪价值评分。
    如果 API Key 不可用则回退到纯图像评分。
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

        # 解析 JSON
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
    """回退到纯图像评分"""
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
# 批量评分
# ============================================================

def batch_score(
    input_dir: str,
    api_key: str = "",
    parallel: bool = True,
    use_ai: bool = False,
) -> dict:
    """批量评分"""
    exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f) for f in os.listdir(input_dir)
        if f.lower().endswith(exts) and not f.startswith("_")
    ])

    if not image_paths:
        logger.error(f"❌ 未找到图片: {input_dir}")
        return {"total": 0}

    logger.info(f"\n{'='*50}")
    logger.info(f"  📊 情绪价值评分 — {len(image_paths)} 张图")
    method = "AI 视觉" if use_ai else "图像分析"
    logger.info(f"  方法: {method}")
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

    # 计算总体评分
    total_quality = sum(r.get("quality_score", r.get("emotional_impact", 0) * 10) for r in results)
    avg_score = total_quality / max(len(results), 1)

    # 输出结果
    logger.info(f"  {'文件':<35} {'品质评分':>8} {'情绪':<12} {'建议'}")
    logger.info(f"  {'-'*35} {'-'*8} {'-'*12} {'-'*30}")

    for r in results:
        qs = r.get("quality_score", r.get("emotional_impact", 0) * 10)
        emotion = r.get("dominant_emotion", "-")
        impr = r.get("improvement", "")[:28]
        logger.info(f"  {r['file']:<35} {qs:>8.1f} {emotion:<12} {impr}")

    # 汇总
    logger.info(f"\n  {'='*40}")
    logger.info(f"  平均品质评分: {avg_score:.1f}/100")
    logger.info(f"  {'='*40}\n")

    return {
        "method": method,
        "total": len(results),
        "avg_quality_score": round(avg_score, 1),
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="📊 情绪价值评分器")
    parser.add_argument("--image", default=None, help="单张图片路径")
    parser.add_argument("--batch-dir", default=None, help="批量目录")
    parser.add_argument("--output", "-o", default=None, help="输出评分 JSON")
    parser.add_argument("--use-ai", action="store_true", help="使用 AI 评分（需 GEMINI_API_KEY）")
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
            logger.info(f"  💾 评分结果已保存: {args.output}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
