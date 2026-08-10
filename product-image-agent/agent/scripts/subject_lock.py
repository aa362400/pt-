#!/usr/bin/env python3
"""
english_text — Subject Lock

english_text：textuserenglish_text，
english_text AI generationtextscenetext，text「english_text 100% text」，
textbackground/english_text AI text。

english_text（automatictext）：
  1. rembg（english_text，AI text，english_text）: pip install rembg
  2. backgroundenglish_text（text PIL，text/english_text）

english_text：
  - textgenerationtextdetectionenglish_text
  - english_text
  - english_text（english_textsceneenglish_text，text"english_text"）

text：
  # text：text product.jpg english_text scene_02.jpg
  python subject_lock.py --reference product.jpg \
      --input scene_02.jpg --output locked/scene_02.jpg

  # text：text raw/ textyesgenerationtext
  python subject_lock.py --reference product.jpg \
      --input-dir outputs/raw/ --output-dir outputs/locked/

english_text：
  SUBJECT_LOCK_ENABLED=1     textgenerationenglish_textautomatictext（english_text）
  SUBJECT_LOCK_BLEND=0.85    english_text（1=english_text）
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
# text
# ============================================================

def cutout_subject(image_path: str) -> "Image.Image":
    """
    english_text，text RGBA（textbackground）。
    text rembg，english_textbackgroundenglish_text。
    """
    if HAS_REMBG:
        try:
            with open(image_path, "rb") as f:
                data = _rembg_remove(f.read())
            import io
            img = Image.open(io.BytesIO(data)).convert("RGBA")
            logger.info(f"  ✂️ rembg text: {os.path.basename(image_path)}")
            return img
        except Exception as e:
            logger.warning(f"rembg textfailed，english_text: {e}")

    return _cutout_by_background_diff(image_path)


def _cutout_by_background_diff(image_path: str) -> "Image.Image":
    """backgroundenglish_text：english_textbackgroundtext，english_text。"""
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

    # english_text，english_text
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))

    rgba = img.convert("RGBA")
    rgba.putalpha(mask)
    logger.info(f"  ✂️ english_text: {os.path.basename(image_path)}")
    return rgba


def _subject_bbox(rgba: "Image.Image") -> tuple:
    """RGBA text alpha>0 english_text"""
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    return bbox or (0, 0, rgba.width, rgba.height)


# ============================================================
# english_text（generationtext）
# ============================================================

def detect_target_bbox(img: "Image.Image") -> tuple:
    """textgenerationenglish_text（text visual_similarity.detect_subject_bbox text）"""
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
        # english_text：english_text 60%
        return (int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8))

    scale_x, scale_y = w / sw, h / sh
    return (
        max(0, int(min_x * scale_x)),
        max(0, int(min_y * scale_y)),
        min(w, int((max_x + 1) * scale_x)),
        min(h, int((max_y + 1) * scale_y)),
    )


# ============================================================
# english_text + text
# ============================================================

def _region_brightness(img: "Image.Image", bbox: tuple) -> float:
    region = img.convert("L").crop(bbox).resize((32, 32), Image.LANCZOS)
    data = list(region.getdata())
    return sum(data) / len(data)


def _match_brightness(subject: "Image.Image", target_brightness: float) -> "Image.Image":
    """english_textsceneenglish_text（english_text ±25% english_text）"""
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
    english_textscenetext。

    blend: english_text（1.0 = english_text；<1 english_textscenetext）
    subject_rgba: english_text（english_text，english_text）
    """
    if not HAS_PIL:
        return {"success": False, "error": "text Pillow: pip install Pillow"}

    try:
        subject = subject_rgba if subject_rgba is not None else cutout_subject(reference_path)
        sub_bbox = _subject_bbox(subject)
        subject_cropped = subject.crop(sub_bbox)

        scene = Image.open(scene_path).convert("RGB")
        target = detect_target_bbox(scene)
        tw, th = target[2] - target[0], target[3] - target[1]
        if tw <= 0 or th <= 0:
            return {"success": False, "error": "noneenglish_textsceneenglish_text"}

        # english_text
        sw, sh = subject_cropped.size
        scale = min(tw / sw, th / sh)
        new_size = (max(1, int(sw * scale)), max(1, int(sh * scale)))
        subject_resized = subject_cropped.resize(new_size, Image.LANCZOS)

        # english_text
        target_brightness = _region_brightness(scene, target)
        subject_resized = _match_brightness(subject_resized, target_brightness)

        # english_text
        paste_x = target[0] + (tw - new_size[0]) // 2
        paste_y = target[1] + (th - new_size[1]) // 2

        # text blend text alpha
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
    """english_text：input_dir english_textgenerationenglish_text"""
    image_paths = collect_images(input_dir)
    if not image_paths:
        return {"success": False, "error": f"english_textimage: {input_dir}"}

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
    """generationtextyesnoautomaticenglish_text"""
    return os.getenv("SUBJECT_LOCK_ENABLED", "0").strip().lower() in ("1", "true", "on", "yes")


def subject_lock_blend() -> float:
    try:
        return max(0.1, min(1.0, float(os.getenv("SUBJECT_LOCK_BLEND", "0.85"))))
    except ValueError:
        return 0.85


def main():
    parser = argparse.ArgumentParser(description="english_text")
    parser.add_argument("--reference", required=True, help="english_text")
    parser.add_argument("--input", help="textgenerationtext")
    parser.add_argument("--output", help="textoutputtext")
    parser.add_argument("--input-dir", help="generationenglish_text")
    parser.add_argument("--output-dir", help="outputtext")
    parser.add_argument("--blend", type=float, default=0.85, help="english_text 0-1")
    args = parser.parse_args()

    if args.input and args.output:
        result = lock_subject_into_scene(args.reference, args.input, args.output, args.blend)
        if result.get("success"):
            logger.info(f"✅ textoutput: {result['output_path']} (text: {result['method']})")
        else:
            logger.error(f"❌ failed: {result.get('error')}")
            sys.exit(1)
    elif args.input_dir and args.output_dir:
        result = lock_directory(args.reference, args.input_dir, args.output_dir, args.blend)
        logger.info(f"completed: {result.get('locked', 0)}/{result.get('total', 0)} text")
    else:
        parser.error("text --input/--output text --input-dir/--output-dir")


if __name__ == "__main__":
    main()
