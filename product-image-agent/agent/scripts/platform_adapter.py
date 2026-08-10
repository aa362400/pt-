#!/usr/bin/env python3
"""
textplatformoutputenglish_text — Platform Adapter

english_textautomaticenglish_texte-commerceplatformtextlistingenglish_text。

text：
  # allplatformoutput
  python platform_adapter.py \
    --input ./outputs/final/ \
    --output ./outputs/platforms/

  # textplatform
  python platform_adapter.py \
    --input ./outputs/final/ \
    --output ./outputs/platforms/ \
    --platforms taobao_main amazon_main shopify

  # english_text（automatictext）
  python platform_adapter.py \
    --input ./outputs/final/ \
    --output ./outputs/platforms/ \
    --profile product_profile.json
"""

import argparse
import json
import os
import sys
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
# platformtext
# ============================================================

PLATFORM_SPECS = {
    "taobao_main": {
        "name": "english_text",
        "size": (800, 800),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 3,
        "notes": "english_text，nonetext",
    },
    "taobao_detail": {
        "name": "english_text",
        "size": (750, 9999),
        "ratio": "free",
        "format": "JPEG",
        "max_size_mb": 2,
        "notes": "english_text750，english_text",
    },
    "jd_main": {
        "name": "english_text",
        "size": (800, 800),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 3,
        "notes": "english_text，backgroundtext",
    },
    "jd_detail": {
        "name": "english_text",
        "size": (790, 9999),
        "ratio": "free",
        "format": "JPEG",
        "max_size_mb": 2,
        "notes": "english_text790",
    },
    "pdd_main": {
        "name": "english_text",
        "size": (750, 750),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "english_text，english_text",
    },
    "amazon_main": {
        "name": "Amazon text",
        "size": (1000, 1000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "textbackground，english_text85%text",
    },
    "amazon_detail": {
        "name": "Amazon text",
        "size": (1000, 1000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "english_text，english_text",
    },
    "shopify": {
        "name": "Shopify",
        "size": (2048, 2048),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 20,
        "notes": "english_text，english_text",
    },
    "wechat": {
        "name": "english_text",
        "size": (1080, 1080),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "english_text，english_text/english_text",
    },
    "xiaohongshu": {
        "name": "english_text",
        "size": (1242, 1660),
        "ratio": "3:4",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "text3:4，english_text",
    },
    "douyin": {
        "name": "text",
        "size": (1080, 1920),
        "ratio": "9:16",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "english_text",
    },
    "alibaba": {
        "name": "english_text",
        "size": (1024, 1024),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "text，english_text",
    },
    "etsy": {
        "name": "Etsy",
        "size": (2000, 2000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "english_text",
    },
    "shopline": {
        "name": "Shopline",
        "size": (1024, 1024),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "english_texte-commercetext",
    },
    "lazada": {
        "name": "Lazada",
        "size": (1200, 1200),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "english_texte-commerce，text",
    },
    "tiktok_shop": {
        "name": "TikTok Shop",
        "size": (1200, 1200),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "english_text；english_text 9:16",
    },
    "temu": {
        "name": "Temu",
        "size": (1350, 1350),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 3,
        "notes": "english_text，english_text，english_text",
    },
    "shein": {
        "name": "Shein",
        "size": (1340, 1785),
        "ratio": "3:4",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "text3:4，textcategorytext",
    },
    "ebay": {
        "name": "eBay",
        "size": (1600, 1600),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 12,
        "notes": "english_text≥500px，text1600px，nonetext/text",
    },
    "walmart": {
        "name": "Walmart",
        "size": (2000, 2000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "english_text，english_text，nonetext",
    },
    "mercado_libre": {
        "name": "Mercado Libre",
        "size": (1200, 1200),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "texte-commerce，english_textnonetextlogo",
    },
    "coupang": {
        "name": "Coupang",
        "size": (1000, 1000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "texte-commerce，english_text",
    },
}


# ============================================================
# english_text
# ============================================================

def resize_for_platform(image: Image.Image, spec: dict) -> Image.Image:
    """textplatformenglish_textimage"""
    target_w, target_h = spec["size"]

    # textyesenglish_text（freetext），english_text
    if target_h > 1000:  # "detail" text：english_text
        w_percent = target_w / image.width
        new_h = int(image.height * w_percent)
        return image.resize((target_w, new_h), Image.LANCZOS)

    # english_text：english_text
    img = image.copy()
    img.thumbnail((target_w, target_h), Image.LANCZOS)

    # english_text
    canvas = Image.new("RGB", (target_w, target_h), (255, 255, 255))
    x = (target_w - img.width) // 2
    y = (target_h - img.height) // 2
    canvas.paste(img, (x, y))

    return canvas


def process_image_for_platform(
    image_path: str,
    platform: str,
    output_dir: str,
) -> dict:
    """english_textplatform"""
    spec = PLATFORM_SPECS.get(platform)
    if not spec:
        return {"input": image_path, "success": False, "error": f"Unknown platform: {platform}"}

    try:
        img = Image.open(image_path).convert("RGB")
        adapted = resize_for_platform(img, spec)

        os.makedirs(output_dir, exist_ok=True)
        filename = os.path.splitext(os.path.basename(image_path))[0]
        output_path = os.path.join(output_dir, f"{filename}.jpg")
        adapted.save(output_path, "JPEG", quality=95)

        return {
            "input": image_path,
            "success": True,
            "platform": platform,
            "output_path": output_path,
            "size": adapted.size,
        }
    except Exception as e:
        return {"input": image_path, "success": False, "platform": platform, "error": str(e)}


def export_to_platforms(
    input_dir: str,
    output_dir: str,
    platforms: list[str],
    parallel: bool = True,
) -> dict:
    """
    textyesimageenglish_textplatform。

    text:
        {platform: {success_count, fail_count, output_dir, results}}
    """
    if not HAS_PIL:
        logger.error("❌ text Pillow: pip install Pillow")
        return {}

    # textimage
    exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f) for f in os.listdir(input_dir)
        if f.lower().endswith(exts) and not f.startswith("_")
    ])

    if not image_paths:
        logger.error(f"❌ english_textimage: {input_dir}")
        return {}

    project_name = os.path.basename(os.path.normpath(input_dir))

    logger.info(f"\n📱 textplatformoutputtext")
    logger.info(f"   image: {len(image_paths)} text")
    logger.info(f"   platform: {len(platforms)} text")
    logger.info(f"{'='*50}")

    all_results = {}
    for platform in platforms:
        spec = PLATFORM_SPECS.get(platform)
        if not spec:
            logger.warning(f"  ⚠️ textplatform: {platform}")
            continue

        plat_dir = os.path.join(output_dir, platform)
        plat_results = []

        logger.info(f"\n  📱 {spec['name']} ({platform})")
        logger.info(f"     text: {spec['size'][0]}×{spec['size'][1]}")

        if parallel and len(image_paths) > 1:
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = {
                    executor.submit(
                        process_image_for_platform, path, platform, plat_dir
                    ): path for path in image_paths
                }
                for future in as_completed(futures):
                    result = future.result()
                    plat_results.append(result)
        else:
            for path in image_paths:
                result = process_image_for_platform(path, platform, plat_dir)
                plat_results.append(result)

        success = sum(1 for r in plat_results if r["success"])
        fail = sum(1 for r in plat_results if not r["success"])
        logger.info(f"     ✅ {success}/{len(plat_results)} textsuccess → {plat_dir}")

        all_results[platform] = {
            "display_name": spec["name"],
            "size": f"{spec['size'][0]}×{spec['size'][1]}",
            "output_dir": plat_dir,
            "success_count": success,
            "fail_count": fail,
            "results": plat_results,
        }

    # outputtext
    logger.info(f"\n{'='*50}")
    logger.info(f"  textplatformtextcompleted")
    for plat, res in all_results.items():
        logger.info(f"  ✅ {res['display_name']}: {res['success_count']} text → {res['output_dir']}")
    logger.info(f"{'='*50}\n")

    return all_results


def list_platforms():
    """english_textyesenglish_textplatform"""
    logger.info(f"\n📱 english_textoutputplatform:\n")
    logger.info(f"  {'Key':<20} {'text':<16} {'text':<14} {'text':<8} {'text'}")
    logger.info(f"  {'-'*20} {'-'*16} {'-'*14} {'-'*8} {'-'*30}")
    for key, spec in sorted(PLATFORM_SPECS.items()):
        size = f"{spec['size'][0]}×{spec['size'][1]}" if spec['size'][1] < 1000 else f"{spec['size'][0]}×text"
        logger.info(f"  {key:<20} {spec['name']:<16} {size:<14} {spec['ratio']:<8} {spec['notes']}")
    logger.info("")


def main():
    parser = argparse.ArgumentParser(description="📱 textplatformoutputenglish_text")
    parser.add_argument("--input", "-i", required=True, help="inputimagetext")
    parser.add_argument("--output", "-o", required=True, help="outputenglish_text")
    parser.add_argument("--platforms", nargs="+", default=None,
                        help=f"platformtext（textall，text: {', '.join(PLATFORM_SPECS.keys())}）")
    parser.add_argument("--list", action="store_true", help="english_textplatform")
    parser.add_argument("--no-parallel", action="store_true")

    args = parser.parse_args()

    if args.list:
        list_platforms()
        return

    if args.platforms:
        platforms = [p for p in args.platforms if p in PLATFORM_SPECS]
        unknown = [p for p in args.platforms if p not in PLATFORM_SPECS]
        if unknown:
            logger.warning(f"⚠️ textplatform: {', '.join(unknown)}")
            logger.warning(f"   text: {', '.join(PLATFORM_SPECS.keys())}")
    else:
        platforms = list(PLATFORM_SPECS.keys())

    if not platforms:
        logger.error("❌ textyesyestextplatform")
        sys.exit(1)

    export_to_platforms(
        input_dir=args.input,
        output_dir=args.output,
        platforms=platforms,
        parallel=not args.no_parallel,
    )


if __name__ == "__main__":
    main()
