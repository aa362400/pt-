#!/usr/bin/env python3
"""
产品主体锁定 — Subject Lock

顶级产品图工作流的核心步骤：把用户原始产品图中的主体抠出，
像素级合成回 AI 生成的场景图中，保证「产品本身 100% 不变」，
只让背景/氛围由 AI 发挥。

抠图策略（自动降级）：
  1. rembg（若已安装，AI 抠图，效果最好）: pip install rembg
  2. 背景色差分抠图（纯 PIL，白底/纯色底产品图效果良好）

合成策略：
  - 在生成图中检测主体位置与尺寸
  - 将原始产品主体等比缩放到该位置替换
  - 亮度匹配（把主体亮度向场景图局部亮度靠拢，缓解"贴图感"）

用法：
  # 单张：把 product.jpg 的主体锁进 scene_02.jpg
  python subject_lock.py --reference product.jpg \
      --input scene_02.jpg --output locked/scene_02.jpg

  # 批量：锁定 raw/ 下所有生成图
  python subject_lock.py --reference product.jpg \
      --input-dir outputs/raw/ --output-dir outputs/locked/

环境变量：
  SUBJECT_LOCK_ENABLED=1     在生成管线中自动启用（默认关闭）
  SUBJECT_LOCK_BLEND=0.85    主体不透明度（1=完全替换）
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import collect_images, setup_logger

logger = setup_logger(__name__)

try:
    from PIL import Image, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    from rembg import remove as _rembg_remove
    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False

SUBJECT_DIFF_THRESHOLD = 30


# ============================================================
# 抠图
# ============================================================

def cutout_subject(image_path: str) -> "Image.Image":
    """
    抠出产品主体，返回 RGBA（透明背景）。
    优先 rembg，缺失时退回背景色差分。
    """
    if HAS_REMBG:
        try:
            with open(image_path, "rb") as f:
                data = _rembg_remove(f.read())
            import io
            img = Image.open(io.BytesIO(data)).convert("RGBA")
            logger.info(f"  ✂️ rembg 抠图: {os.path.basename(image_path)}")
            return img
        except Exception as e:
            logger.warning(f"rembg 抠图失败，退回色差分抠图: {e}")

    return _cutout_by_background_diff(image_path)


def _cutout_by_background_diff(image_path: str) -> "Image.Image":
    """背景色差分抠图：以四角均值为背景色，差异小的像素设为透明。"""
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    mask = Image.new("L", (w, h), 0)
    mpx = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            diff = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if diff > SUBJECT_DIFF_THRESHOLD * 3:
                mpx[x, y] = 255

    # 平滑边缘，填补小孔
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))

    rgba = img.convert("RGBA")
    rgba.putalpha(mask)
    logger.info(f"  ✂️ 色差分抠图: {os.path.basename(image_path)}")
    return rgba


def _subject_bbox(rgba: "Image.Image") -> tuple:
    """RGBA 图中 alpha>0 区域的外接框"""
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    return bbox or (0, 0, rgba.width, rgba.height)


# ============================================================
# 主体定位（生成图中）
# ============================================================

def detect_target_bbox(img: "Image.Image") -> tuple:
    """在生成图中找主体位置（与 visual_similarity.detect_subject_bbox 同法）"""
    w, h = img.size
    small = img.convert("RGB").resize((128, 128), Image.LANCZOS)
    sw, sh = small.size
    px = small.load()
    corners = [px[0, 0], px[sw - 1, 0], px[0, sh - 1], px[sw - 1, sh - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    min_x, min_y, max_x, max_y = sw, sh, -1, -1
    for y in range(sh):
        for x in range(sw):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > SUBJECT_DIFF_THRESHOLD * 3:
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)

    if max_x < 0:
        # 找不到主体：放中间 60%
        return (int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8))

    scale_x, scale_y = w / sw, h / sh
    return (
        max(0, int(min_x * scale_x)),
        max(0, int(min_y * scale_y)),
        min(w, int((max_x + 1) * scale_x)),
        min(h, int((max_y + 1) * scale_y)),
    )


# ============================================================
# 亮度匹配 + 合成
# ============================================================

def _region_brightness(img: "Image.Image", bbox: tuple) -> float:
    region = img.convert("L").crop(bbox).resize((32, 32), Image.LANCZOS)
    data = list(region.getdata())
    return sum(data) / len(data)


def _match_brightness(subject: "Image.Image", target_brightness: float) -> "Image.Image":
    """把主体整体亮度向场景亮度靠拢（限制在 ±25% 内避免失真）"""
    from PIL import ImageEnhance
    gray = subject.convert("L")
    alpha = subject.getchannel("A")
    data = [p for p, a in zip(gray.getdata(), alpha.getdata()) if a > 128]
    if not data:
        return subject
    current = sum(data) / len(data)
    if current <= 0:
        return subject
    factor = max(0.75, min(1.25, target_brightness / current))
    rgb = subject.convert("RGB")
    adjusted = ImageEnhance.Brightness(rgb).enhance(factor).convert("RGBA")
    adjusted.putalpha(alpha)
    return adjusted


def lock_subject_into_scene(
    reference_path: str,
    scene_path: str,
    output_path: str,
    blend: float = 0.85,
    subject_rgba: "Image.Image" = None,
) -> dict:
    """
    将参考图产品主体锁定合成进场景图。

    blend: 主体不透明度（1.0 = 像素级完全替换；<1 保留部分场景光影）
    subject_rgba: 已抠好的主体（批量时复用，避免重复抠图）
    """
    if not HAS_PIL:
        return {"success": False, "error": "需要 Pillow: pip install Pillow"}

    try:
        subject = subject_rgba if subject_rgba is not None else cutout_subject(reference_path)
        sub_bbox = _subject_bbox(subject)
        subject_cropped = subject.crop(sub_bbox)

        scene = Image.open(scene_path).convert("RGB")
        target = detect_target_bbox(scene)
        tw, th = target[2] - target[0], target[3] - target[1]
        if tw <= 0 or th <= 0:
            return {"success": False, "error": "无法定位场景中的主体区域"}

        # 等比缩放主体到目标框内
        sw, sh = subject_cropped.size
        scale = min(tw / sw, th / sh)
        new_size = (max(1, int(sw * scale)), max(1, int(sh * scale)))
        subject_resized = subject_cropped.resize(new_size, Image.LANCZOS)

        # 亮度匹配
        target_brightness = _region_brightness(scene, target)
        subject_resized = _match_brightness(subject_resized, target_brightness)

        # 居中放入目标框
        paste_x = target[0] + (tw - new_size[0]) // 2
        paste_y = target[1] + (th - new_size[1]) // 2

        # 按 blend 调整 alpha
        if blend < 1.0:
            alpha = subject_resized.getchannel("A").point(lambda a: int(a * blend))
            subject_resized.putalpha(alpha)

        composed = scene.convert("RGBA")
        composed.alpha_composite(subject_resized, (paste_x, paste_y))
        result = composed.convert("RGB")

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        result.save(output_path, "JPEG", quality=95)

        return {
            "success": True,
            "output_path": output_path,
            "target_bbox": target,
            "method": "rembg" if HAS_REMBG else "background_diff",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def lock_directory(
    reference_path: str,
    input_dir: str,
    output_dir: str,
    blend: float = 0.85,
) -> dict:
    """批量锁定：input_dir 内每张生成图都合成参考图主体"""
    image_paths = collect_images(input_dir)
    if not image_paths:
        return {"success": False, "error": f"未找到图片: {input_dir}"}

    subject = cutout_subject(reference_path)
    results = []
    for path in image_paths:
        out = os.path.join(output_dir, os.path.basename(path))
        result = lock_subject_into_scene(
            reference_path, path, out, blend=blend, subject_rgba=subject,
        )
        result["input"] = path
        results.append(result)
        status = "✅" if result.get("success") else "❌"
        logger.info(f"  {status} {os.path.basename(path)}")

    ok = sum(1 for r in results if r.get("success"))
    return {
        "success": ok > 0,
        "total": len(results),
        "locked": ok,
        "output_dir": output_dir,
        "results": results,
    }


def subject_lock_enabled() -> bool:
    """生成管线是否自动启用主体锁定"""
    return os.getenv("SUBJECT_LOCK_ENABLED", "0").strip().lower() in ("1", "true", "on", "yes")


def subject_lock_blend() -> float:
    try:
        return max(0.1, min(1.0, float(os.getenv("SUBJECT_LOCK_BLEND", "0.85"))))
    except ValueError:
        return 0.85


def main():
    parser = argparse.ArgumentParser(description="产品主体锁定合成")
    parser.add_argument("--reference", required=True, help="原始产品图")
    parser.add_argument("--input", help="单张生成图")
    parser.add_argument("--output", help="单张输出路径")
    parser.add_argument("--input-dir", help="生成图目录")
    parser.add_argument("--output-dir", help="输出目录")
    parser.add_argument("--blend", type=float, default=0.85, help="主体不透明度 0-1")
    args = parser.parse_args()

    if args.input and args.output:
        result = lock_subject_into_scene(args.reference, args.input, args.output, args.blend)
        if result.get("success"):
            logger.info(f"✅ 已输出: {result['output_path']} (抠图: {result['method']})")
        else:
            logger.error(f"❌ 失败: {result.get('error')}")
            sys.exit(1)
    elif args.input_dir and args.output_dir:
        result = lock_directory(args.reference, args.input_dir, args.output_dir, args.blend)
        logger.info(f"完成: {result.get('locked', 0)}/{result.get('total', 0)} 张")
    else:
        parser.error("需要 --input/--output 或 --input-dir/--output-dir")


if __name__ == "__main__":
    main()
