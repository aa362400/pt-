#!/usr/bin/env python3
"""
english_text — Style Pipeline

text AI generationenglish_text，text 10 english_text：
  - english_text（english_text，english_text）
  - english_text（textplatform/scenetext）
  - english_text（text Logo + text）
  - english_text

text：
  # textflowtext
  python style_pipeline.py \
    --input ./outputs/raw/ \
    --output ./outputs/final/ \
    --watermark brand_logo.png \
    --color-correct \
    --summary _summary.json

  # english_text
  python style_pipeline.py \
    --input ./outputs/raw/ \
    --output ./outputs/final/ \
    --color-correct

  # english_text
  python style_pipeline.py \
    --input ./outputs/final/ \
    --watermark brand_logo.png

  # english_text
  python style_pipeline.py \
    --input ./outputs/final/ \
    --crop 800x800
"""

import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional


# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import collect_images, setup_logger, get_api_key
logger = setup_logger(__name__)


try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    Image = None


# ============================================================
# platformenglish_text
# ============================================================

PLATFORM_SIZES = {
    "taobao_main": (800, 800),         # english_text 1:1
    "taobao_detail": (750, 1000),      # english_text 3:4
    "jd_main": (800, 800),             # english_text 1:1
    "jd_detail": (790, 1000),          # english_text
    "pdd_main": (750, 750),            # english_text 1:1
    "amazon_main": (1000, 1000),       # Amazon 1:1
    "amazon_detail": (1000, 1200),     # Amazon text
    "shopify": (2048, 2048),           # Shopify english_text
    "wechat": (1080, 1080),            # english_text/english_text 1:1
    "xiaohongshu": (1242, 1660),       # english_text 3:4
    "douyin": (1080, 1920),            # text 9:16
}


# ============================================================
# imageenglish_text
# ============================================================

def load_image(path: str) -> Optional[Image.Image]:
    """textimage"""
    if not HAS_PIL:
        return None
    try:
        return Image.open(path).convert("RGB")
    except Exception as e:
        logger.error(f"  ⚠️ noneenglish_textimage {path}: {e}")
        return None


def color_correct(image: Image.Image, profile: Optional[dict] = None) -> Image.Image:
    """
    english_text — english_text、english_text/english_text。
    english_text product_profile，english_text。
    """
    # 1. english_text（english_text）
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.05)

    # 2. english_text（e-commerceenglish_text）
    enhancer = ImageEnhance.Color(image)
    image = enhancer.enhance(1.08)

    # 3. english_text
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(1.1)

    return image


def crop_to_ratio(image: Image.Image, target_ratio: str) -> Image.Image:
    """
    english_text。
    english_text: "1:1", "3:4", "4:3", "9:16", "16:9", "800x800", "750x1000"
    """
    w, h = image.size

    if "x" in target_ratio:
        tw, th = map(int, target_ratio.lower().split("x"))
    elif ":" in target_ratio:
        parts = target_ratio.split(":")
        tw, th = int(parts[0]), int(parts[1])
    else:
        return image

    target_ar = tw / th
    current_ar = w / h

    if abs(current_ar - target_ar) < 0.01:
        return image  # english_text

    if current_ar > target_ar:
        # imagetext → text
        new_w = int(h * target_ar)
        offset = (w - new_w) // 2
        return image.crop((offset, 0, offset + new_w, h))
    else:
        # imagetext → text
        new_h = int(w / target_ar)
        offset = (h - new_h) // 2
        return image.crop((0, offset, w, offset + new_h))


def resize_and_pad(image: Image.Image, target_size: tuple[int, int],
                   bg_color: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """
    english_text（english_text）。
    """
    tw, th = target_size
    image.thumbnail((tw, th), Image.LANCZOS)
    new_img = Image.new("RGB", target_size, bg_color)
    x = (tw - image.width) // 2
    y = (th - image.height) // 2
    new_img.paste(image, (x, y))
    return new_img


def add_watermark(image: Image.Image, watermark_path: str,
                  position: str = "bottom_right",
                  opacity: float = 0.6, margin: int = 30,
                  scale: float = 0.15) -> Image.Image:
    """
    textimagetext。
    watermark_path: PNG textimagetext
    position: bottom_right / bottom_left / top_right / top_left / center
    opacity: english_text 0-1
    scale: english_textimageenglish_text
    """
    if not os.path.exists(watermark_path):
        return image

    try:
        watermark = Image.open(watermark_path).convert("RGBA")
    except Exception:
        return image

    # english_text
    wm_w = int(image.width * scale)
    wm_h = int(watermark.height * (wm_w / watermark.width))
    watermark = watermark.resize((wm_w, wm_h), Image.LANCZOS)

    # english_text
    if opacity < 1.0:
        alpha = watermark.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        watermark.putalpha(alpha)

    # text
    positions = {
        "bottom_right": (image.width - wm_w - margin, image.height - wm_h - margin),
        "bottom_left": (margin, image.height - wm_h - margin),
        "top_right": (image.width - wm_w - margin, margin),
        "top_left": (margin, margin),
        "center": ((image.width - wm_w) // 2, (image.height - wm_h) // 2),
    }
    pos = positions.get(position, positions["bottom_right"])

    # text
    image_rgba = image.convert("RGBA")
    image_rgba.paste(watermark, pos, watermark)
    return image_rgba.convert("RGB")


def add_text_watermark(image: Image.Image, text: str,
                       position: str = "bottom_center",
                       font_path: Optional[str] = None,
                       font_size: Optional[int] = None,
                       color: tuple = (255, 255, 255),
                       margin: int = 20) -> Image.Image:
    """
    english_text/english_text。
    """
    # english_textfile，english_text
    draw = ImageDraw.Draw(image)

    if font_size is None:
        font_size = max(16, image.width // 40)

    # english_text
    font = None
    if font_path and os.path.exists(font_path):
        try:
            font = ImageFont.truetype(font_path, font_size)
        except Exception:
            pass

    # english_text
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    # text
    x, y = 0, 0
    if position == "bottom_center":
        x = (image.width - tw) // 2
        y = image.height - th - margin
    elif position == "top_center":
        x = (image.width - tw) // 2
        y = margin

    # english_text
    shadow_color = (0, 0, 0)
    draw.text((x + 1, y + 1), text, fill=shadow_color, font=font)
    draw.text((x - 1, y - 1), text, fill=shadow_color, font=font)
    # english_text
    draw.text((x, y), text, fill=color, font=font)

    return image


def correct_product_color(image: Image.Image, profile: dict) -> Image.Image:
    """
    english_text。
    english_textimageenglish_text product_profile english_text。
    """
    colors = profile.get("colors", {})
    primary_hex = colors.get("primary", "")

    if not primary_hex or not primary_hex.startswith("#"):
        return image

    try:
        # text hex text RGB
        r_target, g_target, b_target = int(primary_hex[1:3], 16), int(primary_hex[3:5], 16), int(primary_hex[5:7], 16)

        # english_text
        r_avg, g_avg, b_avg = 0, 0, 0
        pixels = image.load()
        sample_points = [
            (image.width // 4, image.height // 4),
            (image.width // 2, image.height // 2),
            (image.width * 3 // 4, image.height * 3 // 4),
            (image.width // 4, image.height * 3 // 4),
            (image.width * 3 // 4, image.height // 4),
        ]
        valid = 0
        for px, py in sample_points:
            if 0 <= px < image.width and 0 <= py < image.height:
                r, g, b = pixels[px, py]
                # english_text
                brightness = (r + g + b) / 3
                if 30 < brightness < 230:
                    r_avg += r
                    g_avg += g
                    b_avg += b
                    valid += 1

        if valid > 0:
            r_avg /= valid
            g_avg /= valid
            b_avg /= valid

            # english_text
            if r_avg > 0:
                r_factor = r_target / r_avg
                g_factor = g_target / g_avg
                b_factor = b_target / b_avg

                # english_text (english_text 20% text)
                factor = 0.3
                r_factor = 1 + (r_factor - 1) * factor
                g_factor = 1 + (g_factor - 1) * factor
                b_factor = 1 + (b_factor - 1) * factor

                # english_textimage
                r_channel, g_channel, b_channel = image.split()
                from PIL import ImageMath
                r_channel = r_channel.point(lambda p: min(255, max(0, int(p * r_factor))))
                g_channel = g_channel.point(lambda p: min(255, max(0, int(p * g_factor))))
                b_channel = b_channel.point(lambda p: min(255, max(0, int(p * b_factor))))
                image = Image.merge("RGB", (r_channel, g_channel, b_channel))
    except Exception:
        pass  # english_textfailedenglish_text

    return image


# ============================================================
# english_text
# ============================================================

def process_image(
    image_path: str,
    output_dir: str,
    operations: dict,
    profile: Optional[dict] = None,
    output_suffix: str = "",
) -> dict:
    """
    english_text。

    operations:
        color_correct: bool
        product_color_fix: bool
        crop: str (ratio or platform name)
        watermark: str (path to watermark image)
        text_watermark: str (text string)
        resize: str (platform name)
        target_size: str (e.g. "800x800")
    """
    img = load_image(image_path)
    if img is None:
        return {"input": image_path, "success": False, "error": "Cannot load image"}

    filename = os.path.splitext(os.path.basename(image_path))[0]

    # 1. english_text
    if operations.get("color_correct") and HAS_PIL:
        img = color_correct(img, profile)

    # 2. english_text
    if operations.get("product_color_fix") and profile:
        img = correct_product_color(img, profile)

    # 3. text（english_textplatform）
    crop_target = operations.get("crop", "")
    if crop_target:
        img = crop_to_ratio(img, crop_target)

    # 4. english_text
    target_size = operations.get("target_size", "")
    if target_size:
        if "x" in target_size:
            tw, th = map(int, target_size.split("x"))
            img = resize_and_pad(img, (tw, th))

    # 5. platformenglish_text
    platform = operations.get("platform", "")
    if platform and platform in PLATFORM_SIZES:
        img = resize_and_pad(img, PLATFORM_SIZES[platform])

    # 6. textimage
    wm_path = operations.get("watermark", "")
    if wm_path and os.path.exists(wm_path):
        img = add_watermark(img, wm_path)

    # 7. english_text
    text_wm = operations.get("text_watermark", "")
    if text_wm:
        img = add_text_watermark(img, text_wm)

    # text
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{filename}{output_suffix}.jpg")
    img.save(output_path, "JPEG", quality=95)

    return {"input": image_path, "success": True, "output_path": output_path}


def batch_process(
    input_dir: str,
    output_dir: str,
    operations: dict,
    profile_path: Optional[str] = None,
    parallel: bool = True,
) -> list[dict]:
    """english_text"""
    # english_text
    profile = None
    if profile_path and os.path.exists(profile_path):
        with open(profile_path, "r", encoding="utf-8") as f:
            profile = json.load(f)

    # english_textyesimage
    image_exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f)
        for f in os.listdir(input_dir)
        if f.lower().endswith(image_exts)
    ])

    if not image_paths:
        logger.error(f"❌ english_textimage: {input_dir}")
        return []

    logger.info(f"\n{'='*50}")
    logger.info(f"🎨 english_text — {len(image_paths)} textimage")
    logger.info(f"  english_text: {operations.get('color_correct', False)}")
    logger.info(f"  english_text: {operations.get('product_color_fix', False)}")
    logger.info(f"  english_text: {operations.get('crop', 'none')}")
    logger.info(f"  platformtext: {operations.get('platform', 'none')}")
    logger.info(f"  text: {'yes' if operations.get('watermark') else 'none'}")
    logger.info(f"{'='*50}\n")

    results = []
    if parallel and len(image_paths) > 1:
        with ThreadPoolExecutor(max_workers=min(len(image_paths), 4)) as executor:
            futures = {
                executor.submit(
                    process_image, path, output_dir, operations, profile
                ): path for path in image_paths
            }
            for future in as_completed(futures):
                path = futures[future]
                try:
                    result = future.result()
                    results.append(result)
                    status = "✅" if result["success"] else "❌"
                    logger.info(f"  {status} {os.path.basename(path)} → {os.path.basename(result.get('output_path', ''))}")
                except Exception as e:
                    logger.error(f"  ❌ {os.path.basename(path)}: {e}")
                    results.append({"input": path, "success": False, "error": str(e)})
    else:
        for path in image_paths:
            result = process_image(path, output_dir, operations, profile)
            results.append(result)
            status = "✅" if result["success"] else "❌"
            logger.info(f"  {status} {os.path.basename(path)}")

    # text
    success_count = sum(1 for r in results if r["success"])
    logger.info(f"\n✅ textcompleted: {success_count}/{len(results)} success")
    logger.info(f"📁 output: {os.path.abspath(output_dir)}")

    return results


# ============================================================
# CLItext
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="🎨 english_text — text+text+text+english_text",
    )

    parser.add_argument("--input", "-i", required=True, help="inputimagetext")
    parser.add_argument("--output", "-o", required=True, help="outputtext")
    parser.add_argument("--profile", default=None, help="english_text JSON text（english_text）")

    # english_text
    parser.add_argument("--color-correct", action="store_true", help="english_text")
    parser.add_argument("--product-color-fix", action="store_true", help="english_text")
    parser.add_argument("--crop", default="", help="english_text，text 1:1, 4:3, 16:9")
    parser.add_argument("--platform", default="", choices=list(PLATFORM_SIZES.keys()),
                        help="outputplatformtext")
    parser.add_argument("--target-size", default="", help="english_text，text 800x800")
    parser.add_argument("--watermark", default="", help="textimagetext（PNG）")
    parser.add_argument("--text-watermark", default="", help="english_text")
    parser.add_argument("--no-parallel", action="store_true", help="english_text")

    args = parser.parse_args()

    if not os.path.isdir(args.input):
        logger.error(f"❌ inputenglish_text: {args.input}")
        sys.exit(1)

    operations = {
        "color_correct": args.color_correct,
        "product_color_fix": args.product_color_fix,
        "crop": args.crop,
        "platform": args.platform,
        "target_size": args.target_size,
        "watermark": args.watermark,
        "text_watermark": args.text_watermark,
    }

    if not HAS_PIL:
        logger.warning("⚠️  english_text Pillow，imageenglish_text")
        logger.warning("    pip install Pillow")
        sys.exit(1)

    batch_process(
        input_dir=args.input,
        output_dir=args.output,
        operations=operations,
        profile_path=args.profile,
        parallel=not args.no_parallel,
    )


if __name__ == "__main__":
    main()
