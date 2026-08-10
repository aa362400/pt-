#!/usr/bin/env python3
"""
风格统一管线 — Style Pipeline

对 AI 生成的产品图进行后处理，确保 10 张图风格统一：
  - 统一调色（色彩校正，让产品颜色一致）
  - 智能裁剪（按平台/场景尺寸）
  - 批量水印（品牌 Logo + 文案）
  - 批量重命名

用法：
  # 全流程处理
  python style_pipeline.py \
    --input ./outputs/raw/ \
    --output ./outputs/final/ \
    --watermark brand_logo.png \
    --color-correct \
    --summary _summary.json

  # 仅调色
  python style_pipeline.py \
    --input ./outputs/raw/ \
    --output ./outputs/final/ \
    --color-correct

  # 仅加水印
  python style_pipeline.py \
    --input ./outputs/final/ \
    --watermark brand_logo.png

  # 仅裁剪
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


# 使用公共工具模块
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
# 平台尺寸标准
# ============================================================

PLATFORM_SIZES = {
    "taobao_main": (800, 800),         # 淘宝主图 1:1
    "taobao_detail": (750, 1000),      # 淘宝详情 3:4
    "jd_main": (800, 800),             # 京东主图 1:1
    "jd_detail": (790, 1000),          # 京东详情
    "pdd_main": (750, 750),            # 拼多多 1:1
    "amazon_main": (1000, 1000),       # Amazon 1:1
    "amazon_detail": (1000, 1200),     # Amazon 详情
    "shopify": (2048, 2048),           # Shopify 正方形
    "wechat": (1080, 1080),            # 朋友圈/公众号 1:1
    "xiaohongshu": (1242, 1660),       # 小红书 3:4
    "douyin": (1080, 1920),            # 抖音 9:16
}


# ============================================================
# 图片处理函数
# ============================================================

def load_image(path: str) -> Optional[Image.Image]:
    """加载图片"""
    if not HAS_PIL:
        return None
    try:
        return Image.open(path).convert("RGB")
    except Exception as e:
        logger.error(f"  ⚠️ 无法加载图片 {path}: {e}")
        return None


def color_correct(image: Image.Image, profile: Optional[dict] = None) -> Image.Image:
    """
    颜色校正 — 统一色调、微调饱和度/对比度。
    如果提供 product_profile，尝试校正产品颜色接近档案中描述。
    """
    # 1. 轻微提升对比度（让产品更立体）
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.05)

    # 2. 轻微提升饱和度（电商图需要）
    enhancer = ImageEnhance.Color(image)
    image = enhancer.enhance(1.08)

    # 3. 轻微提升锐度
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(1.1)

    return image


def crop_to_ratio(image: Image.Image, target_ratio: str) -> Image.Image:
    """
    按比例智能裁剪。
    支持格式: "1:1", "3:4", "4:3", "9:16", "16:9", "800x800", "750x1000"
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
        return image  # 比例已匹配

    if current_ar > target_ar:
        # 图片太宽 → 裁宽
        new_w = int(h * target_ar)
        offset = (w - new_w) // 2
        return image.crop((offset, 0, offset + new_w, h))
    else:
        # 图片太高 → 裁高
        new_h = int(w / target_ar)
        offset = (h - new_h) // 2
        return image.crop((0, offset, w, offset + new_h))


def resize_and_pad(image: Image.Image, target_size: tuple[int, int],
                   bg_color: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """
    缩放并填充到目标尺寸（保持原比例）。
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
    添加图片水印。
    watermark_path: PNG 水印图片路径
    position: bottom_right / bottom_left / top_right / top_left / center
    opacity: 透明度 0-1
    scale: 水印相对图片宽度的比例
    """
    if not os.path.exists(watermark_path):
        return image

    try:
        watermark = Image.open(watermark_path).convert("RGBA")
    except Exception:
        return image

    # 缩放水印
    wm_w = int(image.width * scale)
    wm_h = int(watermark.height * (wm_w / watermark.width))
    watermark = watermark.resize((wm_w, wm_h), Image.LANCZOS)

    # 透明度
    if opacity < 1.0:
        alpha = watermark.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        watermark.putalpha(alpha)

    # 位置
    positions = {
        "bottom_right": (image.width - wm_w - margin, image.height - wm_h - margin),
        "bottom_left": (margin, image.height - wm_h - margin),
        "top_right": (image.width - wm_w - margin, margin),
        "top_left": (margin, margin),
        "center": ((image.width - wm_w) // 2, (image.height - wm_h) // 2),
    }
    pos = positions.get(position, positions["bottom_right"])

    # 合成
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
    添加文字水印/品牌名。
    """
    # 暂不依赖字体文件，使用默认
    draw = ImageDraw.Draw(image)

    if font_size is None:
        font_size = max(16, image.width // 40)

    # 尝试加载字体
    font = None
    if font_path and os.path.exists(font_path):
        try:
            font = ImageFont.truetype(font_path, font_size)
        except Exception:
            pass

    # 计算文本大小
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    # 位置
    x, y = 0, 0
    if position == "bottom_center":
        x = (image.width - tw) // 2
        y = image.height - th - margin
    elif position == "top_center":
        x = (image.width - tw) // 2
        y = margin

    # 绘制阴影
    shadow_color = (0, 0, 0)
    draw.text((x + 1, y + 1), text, fill=shadow_color, font=font)
    draw.text((x - 1, y - 1), text, fill=shadow_color, font=font)
    # 主文字
    draw.text((x, y), text, fill=color, font=font)

    return image


def correct_product_color(image: Image.Image, profile: dict) -> Image.Image:
    """
    基于产品档案中的色值进行颜色校正。
    尝试让图片中的产品颜色更接近 product_profile 中描述的颜色。
    """
    colors = profile.get("colors", {})
    primary_hex = colors.get("primary", "")

    if not primary_hex or not primary_hex.startswith("#"):
        return image

    try:
        # 将 hex 转 RGB
        r_target, g_target, b_target = int(primary_hex[1:3], 16), int(primary_hex[3:5], 16), int(primary_hex[5:7], 16)

        # 简单白平衡校正
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
                # 跳过太亮或太暗的点
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

            # 计算校正因子
            if r_avg > 0:
                r_factor = r_target / r_avg
                g_factor = g_target / g_avg
                b_factor = b_target / b_avg

                # 温和校正 (只纠正 20% 偏差)
                factor = 0.3
                r_factor = 1 + (r_factor - 1) * factor
                g_factor = 1 + (g_factor - 1) * factor
                b_factor = 1 + (b_factor - 1) * factor

                # 应用校正到整个图片
                r_channel, g_channel, b_channel = image.split()
                from PIL import ImageMath
                r_channel = r_channel.point(lambda p: min(255, max(0, int(p * r_factor))))
                g_channel = g_channel.point(lambda p: min(255, max(0, int(p * g_factor))))
                b_channel = b_channel.point(lambda p: min(255, max(0, int(p * b_factor))))
                image = Image.merge("RGB", (r_channel, g_channel, b_channel))
    except Exception:
        pass  # 颜色校正失败时安静降级

    return image


# ============================================================
# 批量管线
# ============================================================

def process_image(
    image_path: str,
    output_dir: str,
    operations: dict,
    profile: Optional[dict] = None,
    output_suffix: str = "",
) -> dict:
    """
    单图处理管线。

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

    # 1. 颜色校正
    if operations.get("color_correct") and HAS_PIL:
        img = color_correct(img, profile)

    # 2. 基于产品档案的颜色修正
    if operations.get("product_color_fix") and profile:
        img = correct_product_color(img, profile)

    # 3. 裁剪（比例或平台）
    crop_target = operations.get("crop", "")
    if crop_target:
        img = crop_to_ratio(img, crop_target)

    # 4. 缩放至目标尺寸
    target_size = operations.get("target_size", "")
    if target_size:
        if "x" in target_size:
            tw, th = map(int, target_size.split("x"))
            img = resize_and_pad(img, (tw, th))

    # 5. 平台尺寸适配
    platform = operations.get("platform", "")
    if platform and platform in PLATFORM_SIZES:
        img = resize_and_pad(img, PLATFORM_SIZES[platform])

    # 6. 水印图片
    wm_path = operations.get("watermark", "")
    if wm_path and os.path.exists(wm_path):
        img = add_watermark(img, wm_path)

    # 7. 文字水印
    text_wm = operations.get("text_watermark", "")
    if text_wm:
        img = add_text_watermark(img, text_wm)

    # 保存
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
    """批量处理整个目录"""
    # 加载产品档案
    profile = None
    if profile_path and os.path.exists(profile_path):
        with open(profile_path, "r", encoding="utf-8") as f:
            profile = json.load(f)

    # 收集所有图片
    image_exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f)
        for f in os.listdir(input_dir)
        if f.lower().endswith(image_exts)
    ])

    if not image_paths:
        logger.error(f"❌ 未找到图片: {input_dir}")
        return []

    logger.info(f"\n{'='*50}")
    logger.info(f"🎨 风格统一管线 — {len(image_paths)} 张图片")
    logger.info(f"  颜色校正: {operations.get('color_correct', False)}")
    logger.info(f"  产品颜色修正: {operations.get('product_color_fix', False)}")
    logger.info(f"  裁剪比例: {operations.get('crop', '无')}")
    logger.info(f"  平台适配: {operations.get('platform', '无')}")
    logger.info(f"  水印: {'有' if operations.get('watermark') else '无'}")
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

    # 汇总
    success_count = sum(1 for r in results if r["success"])
    logger.info(f"\n✅ 管线完成: {success_count}/{len(results)} 成功")
    logger.info(f"📁 输出: {os.path.abspath(output_dir)}")

    return results


# ============================================================
# CLI入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="🎨 风格统一管线 — 调色+裁剪+水印+批量处理",
    )

    parser.add_argument("--input", "-i", required=True, help="输入图片目录")
    parser.add_argument("--output", "-o", required=True, help="输出目录")
    parser.add_argument("--profile", default=None, help="产品档案 JSON 路径（颜色校正参考）")

    # 操作选项
    parser.add_argument("--color-correct", action="store_true", help="启用颜色校正")
    parser.add_argument("--product-color-fix", action="store_true", help="基于产品档案的颜色修正")
    parser.add_argument("--crop", default="", help="裁剪比例，如 1:1, 4:3, 16:9")
    parser.add_argument("--platform", default="", choices=list(PLATFORM_SIZES.keys()),
                        help="输出平台尺寸")
    parser.add_argument("--target-size", default="", help="目标尺寸，如 800x800")
    parser.add_argument("--watermark", default="", help="水印图片路径（PNG）")
    parser.add_argument("--text-watermark", default="", help="文字水印内容")
    parser.add_argument("--no-parallel", action="store_true", help="串行处理")

    args = parser.parse_args()

    if not os.path.isdir(args.input):
        logger.error(f"❌ 输入目录不存在: {args.input}")
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
        logger.warning("⚠️  未安装 Pillow，图片处理功能不可用")
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
