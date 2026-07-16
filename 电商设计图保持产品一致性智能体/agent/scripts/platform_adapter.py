#!/usr/bin/env python3
"""
多平台输出适配器 — Platform Adapter

一套产品图自动适配主流电商平台的上架尺寸和格式要求。

用法：
  # 全部平台输出
  python platform_adapter.py \
    --input ./outputs/final/ \
    --output ./outputs/platforms/

  # 指定平台
  python platform_adapter.py \
    --input ./outputs/final/ \
    --output ./outputs/platforms/ \
    --platforms taobao_main amazon_main shopify

  # 附带产品档案（自动命名）
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
# 平台规格
# ============================================================

PLATFORM_SPECS = {
    "taobao_main": {
        "name": "淘宝主图",
        "size": (800, 800),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 3,
        "notes": "白底优先，无水印",
    },
    "taobao_detail": {
        "name": "淘宝详情",
        "size": (750, 9999),
        "ratio": "free",
        "format": "JPEG",
        "max_size_mb": 2,
        "notes": "宽度固定750，高度不限",
    },
    "jd_main": {
        "name": "京东主图",
        "size": (800, 800),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 3,
        "notes": "产品居中，背景干净",
    },
    "jd_detail": {
        "name": "京东详情",
        "size": (790, 9999),
        "ratio": "free",
        "format": "JPEG",
        "max_size_mb": 2,
        "notes": "宽度固定790",
    },
    "pdd_main": {
        "name": "拼多多主图",
        "size": (750, 750),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "色彩鲜明，可含文案",
    },
    "amazon_main": {
        "name": "Amazon 主图",
        "size": (1000, 1000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "纯白背景，产品占85%以上",
    },
    "amazon_detail": {
        "name": "Amazon 详情",
        "size": (1000, 1000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "信息图，可含文字",
    },
    "shopify": {
        "name": "Shopify",
        "size": (2048, 2048),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 20,
        "notes": "高分辨率，正方形",
    },
    "wechat": {
        "name": "微信朋友圈",
        "size": (1080, 1080),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "正方形，适合朋友圈/公众号",
    },
    "xiaohongshu": {
        "name": "小红书",
        "size": (1242, 1660),
        "ratio": "3:4",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "竖版3:4，封面突出",
    },
    "douyin": {
        "name": "抖音",
        "size": (1080, 1920),
        "ratio": "9:16",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "全屏竖版比例",
    },
    "alibaba": {
        "name": "阿里巴巴国际站",
        "size": (1024, 1024),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "白底，清晰大图",
    },
    "etsy": {
        "name": "Etsy",
        "size": (2000, 2000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "高分辨率正方形",
    },
    "shopline": {
        "name": "Shopline",
        "size": (1024, 1024),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "东南亚电商标准",
    },
    "lazada": {
        "name": "Lazada",
        "size": (1200, 1200),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "东南亚电商，白底",
    },
    "tiktok_shop": {
        "name": "TikTok Shop",
        "size": (1200, 1200),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "正方形主图；短视频封面另用 9:16",
    },
    "temu": {
        "name": "Temu",
        "size": (1350, 1350),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 3,
        "notes": "正方形，产品清晰居中，避免边框水印",
    },
    "shein": {
        "name": "Shein",
        "size": (1340, 1785),
        "ratio": "3:4",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "竖版3:4，时尚类目主流",
    },
    "ebay": {
        "name": "eBay",
        "size": (1600, 1600),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 12,
        "notes": "最短边≥500px，推荐1600px，无边框/文字",
    },
    "walmart": {
        "name": "Walmart",
        "size": (2000, 2000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "白底主图，产品占比高，无水印",
    },
    "mercado_libre": {
        "name": "Mercado Libre",
        "size": (1200, 1200),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 10,
        "notes": "拉美电商，白底主图无文字logo",
    },
    "coupang": {
        "name": "Coupang",
        "size": (1000, 1000),
        "ratio": "1:1",
        "format": "JPEG",
        "max_size_mb": 5,
        "notes": "韩国电商，白底居中",
    },
}


# ============================================================
# 适配处理
# ============================================================

def resize_for_platform(image: Image.Image, spec: dict) -> Image.Image:
    """按平台规格缩放图片"""
    target_w, target_h = spec["size"]

    # 如果是固定高度（free比例），按宽度缩放
    if target_h > 1000:  # "detail" 类：只固定宽度
        w_percent = target_w / image.width
        new_h = int(image.height * w_percent)
        return image.resize((target_w, new_h), Image.LANCZOS)

    # 固定尺寸：缩放并填充
    img = image.copy()
    img.thumbnail((target_w, target_h), Image.LANCZOS)

    # 创建白底画布
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
    """将单张图适配到指定平台"""
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
    将所有图片导出到指定平台。

    返回:
        {platform: {success_count, fail_count, output_dir, results}}
    """
    if not HAS_PIL:
        logger.error("❌ 需要 Pillow: pip install Pillow")
        return {}

    # 收集图片
    exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f) for f in os.listdir(input_dir)
        if f.lower().endswith(exts) and not f.startswith("_")
    ])

    if not image_paths:
        logger.error(f"❌ 未找到图片: {input_dir}")
        return {}

    project_name = os.path.basename(os.path.normpath(input_dir))

    logger.info(f"\n📱 多平台输出适配")
    logger.info(f"   图片: {len(image_paths)} 张")
    logger.info(f"   平台: {len(platforms)} 个")
    logger.info(f"{'='*50}")

    all_results = {}
    for platform in platforms:
        spec = PLATFORM_SPECS.get(platform)
        if not spec:
            logger.warning(f"  ⚠️ 未知平台: {platform}")
            continue

        plat_dir = os.path.join(output_dir, platform)
        plat_results = []

        logger.info(f"\n  📱 {spec['name']} ({platform})")
        logger.info(f"     尺寸: {spec['size'][0]}×{spec['size'][1]}")

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
        logger.info(f"     ✅ {success}/{len(plat_results)} 转换成功 → {plat_dir}")

        all_results[platform] = {
            "display_name": spec["name"],
            "size": f"{spec['size'][0]}×{spec['size'][1]}",
            "output_dir": plat_dir,
            "success_count": success,
            "fail_count": fail,
            "results": plat_results,
        }

    # 输出汇总
    logger.info(f"\n{'='*50}")
    logger.info(f"  多平台导出完成")
    for plat, res in all_results.items():
        logger.info(f"  ✅ {res['display_name']}: {res['success_count']} 张 → {res['output_dir']}")
    logger.info(f"{'='*50}\n")

    return all_results


def list_platforms():
    """打印所有支持的平台"""
    logger.info(f"\n📱 支持的输出平台:\n")
    logger.info(f"  {'Key':<20} {'名称':<16} {'尺寸':<14} {'比例':<8} {'说明'}")
    logger.info(f"  {'-'*20} {'-'*16} {'-'*14} {'-'*8} {'-'*30}")
    for key, spec in sorted(PLATFORM_SPECS.items()):
        size = f"{spec['size'][0]}×{spec['size'][1]}" if spec['size'][1] < 1000 else f"{spec['size'][0]}×不限"
        logger.info(f"  {key:<20} {spec['name']:<16} {size:<14} {spec['ratio']:<8} {spec['notes']}")
    logger.info("")


def main():
    parser = argparse.ArgumentParser(description="📱 多平台输出适配器")
    parser.add_argument("--input", "-i", required=True, help="输入图片目录")
    parser.add_argument("--output", "-o", required=True, help="输出根目录")
    parser.add_argument("--platforms", nargs="+", default=None,
                        help=f"平台列表（默认全部，可选: {', '.join(PLATFORM_SPECS.keys())}）")
    parser.add_argument("--list", action="store_true", help="列出支持的平台")
    parser.add_argument("--no-parallel", action="store_true")

    args = parser.parse_args()

    if args.list:
        list_platforms()
        return

    if args.platforms:
        platforms = [p for p in args.platforms if p in PLATFORM_SPECS]
        unknown = [p for p in args.platforms if p not in PLATFORM_SPECS]
        if unknown:
            logger.warning(f"⚠️ 未知平台: {', '.join(unknown)}")
            logger.warning(f"   可用: {', '.join(PLATFORM_SPECS.keys())}")
    else:
        platforms = list(PLATFORM_SPECS.keys())

    if not platforms:
        logger.error("❌ 没有有效的平台")
        sys.exit(1)

    export_to_platforms(
        input_dir=args.input,
        output_dir=args.output,
        platforms=platforms,
        parallel=not args.no_parallel,
    )


if __name__ == "__main__":
    main()
