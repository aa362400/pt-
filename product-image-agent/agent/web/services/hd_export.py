"""english_text — textgenerationenglish_text（1K/2K/3K/4K/8K/18K text）。

english_textoutput 1024~1536px；listingtext/english_text。
english_text：
1. text AI text（Real-ESRGAN，text REALESRGAN_EXE text realesrgan-ncnn-vulkan
   english_textfileenglish_text）：text 2~4x english_text，textrealenglish_text；
2. text Lanczos（text ≤2x）+ english_text；textconfiguration AI english_text。

output JPEG（text 92）：18000px english_text PNG english_text MB，JPEG text 20~60MB text。
"""

from __future__ import annotations

import os
import subprocess
import tempfile

DEFAULT_TARGET = 18000
MIN_TARGET = 1024
JPEG_MAX_EDGE = 65000  # JPEG english_text 65535，english_text

# english_text：text → english_text（px）
RESOLUTION_TIERS = {
    "1k": 1024,
    "2k": 2048,
    "3k": 3072,
    "4k": 4096,
    "8k": 8192,
    "18k": 18000,
}


def tier_target(tier: str) -> int | None:
    """text（english_text）→ english_text；english_text None。"""
    return RESOLUTION_TIERS.get(str(tier or "").strip().lower())


def max_target() -> int:
    try:
        return min(JPEG_MAX_EDGE, int(os.getenv("HD_EXPORT_MAX_EDGE", str(DEFAULT_TARGET))))
    except ValueError:
        return DEFAULT_TARGET


def _try_realesrgan(src_path: str, long_edge: int, target: int):
    """text AI text：REALESRGAN_EXE text realesrgan-ncnn-vulkan english_text。

    successenglish_text PIL Image，failed/textconfigurationtext None（english_text Lanczos）。
    """
    exe = os.getenv("REALESRGAN_EXE", "").strip()
    if not exe or not os.path.isfile(exe):
        return None

    # ncnn english_text -s 2/3/4；english_text，english_text Lanczos text
    ratio = target / float(long_edge)
    scale = 4 if ratio > 3 else (3 if ratio > 2 else 2)

    tmp_out = None
    try:
        from PIL import Image

        fd, tmp_out = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        cmd = [exe, "-i", src_path, "-o", tmp_out, "-s", str(scale)]
        model = os.getenv("REALESRGAN_MODEL", "").strip()
        if model:
            cmd += ["-n", model]
        proc = subprocess.run(
            cmd, capture_output=True, timeout=600,
        )
        if proc.returncode != 0 or not os.path.isfile(tmp_out) or os.path.getsize(tmp_out) < 64:
            return None
        with Image.open(tmp_out) as im:
            return im.convert("RGB").copy()
    except Exception:  # noqa: BLE001 — AI textyesenglish_text，textfailedenglish_text
        return None
    finally:
        if tmp_out and os.path.exists(tmp_out):
            try:
                os.remove(tmp_out)
            except OSError:
                pass


def export_hd(src_path: str, dst_path: str, target_long_edge: int = DEFAULT_TARGET) -> dict:
    """text src imageenglish_text target_long_edge，write dst（JPEG）。

    text {"width", "height", "bytes", "path", "upscaler"}；
    english_text FileNotFoundError。
    """
    from PIL import Image, ImageFilter

    if not os.path.exists(src_path):
        raise FileNotFoundError(src_path)

    target = max(MIN_TARGET, min(int(target_long_edge), max_target()))

    # 18K english_text PIL english_text，textyeslocaltextfile
    Image.MAX_IMAGE_PIXELS = None

    with Image.open(src_path) as im:
        img = im.convert("RGB")

    w, h = img.size
    long_edge = max(w, h)
    if long_edge >= target:
        # english_text：english_text（1K/2K english_text），english_text
        scale = target / float(long_edge)
        if scale < 1.0:
            img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        os.makedirs(os.path.dirname(dst_path) or ".", exist_ok=True)
        img.save(dst_path, "JPEG", quality=92)
        w, h = img.size
        return {"width": w, "height": h, "bytes": os.path.getsize(dst_path),
                "path": dst_path, "upscaler": "none"}

    upscaler = "lanczos"
    ai = _try_realesrgan(src_path, long_edge, target)
    if ai is not None:
        img = ai
        w, h = img.size
        upscaler = "realesrgan"

    scale = target / float(max(w, h))
    tw, th = round(w * scale), round(h * scale)

    # english_text：english_text 2x，english_text（english_text/text）
    cur = img
    cw, ch = w, h
    while max(cw, ch) < target:
        step = min(2.0, target / float(max(cw, ch)))
        nw = min(tw, round(cw * step))
        nh = min(th, round(ch * step))
        if (nw, nh) == (cw, ch):
            break
        cur = cur.resize((nw, nh), Image.LANCZOS)
        if nw * nh <= 120_000_000:
            cur = cur.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
        cw, ch = nw, nh
    if max(cw, ch) > target:
        # AI english_text（text 2x english_text），english_text
        s = target / float(max(cw, ch))
        cur = cur.resize((round(cw * s), round(ch * s)), Image.LANCZOS)
        cw, ch = cur.size

    os.makedirs(os.path.dirname(dst_path) or ".", exist_ok=True)
    cur.save(dst_path, "JPEG", quality=92)
    return {"width": cw, "height": ch, "bytes": os.path.getsize(dst_path),
            "path": dst_path, "upscaler": upscaler}
