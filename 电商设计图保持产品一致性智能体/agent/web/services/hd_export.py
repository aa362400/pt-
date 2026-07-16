"""高清导出 — 把生成图放大到目标分辨率（1K/2K/3K/4K/8K/18K 分档）。

生图模型原生输出 1024~1536px；上架主图/宣传物料需要更大尺寸。
放大策略两级：
1. 可选 AI 超分（Real-ESRGAN，设置 REALESRGAN_EXE 指向 realesrgan-ncnn-vulkan
   可执行文件即启用）：先做 2~4x 神经网络超分，细节真实感远好于插值；
2. 分级 Lanczos（每次 ≤2x）+ 轻度锐化补足到精确目标边长；未配置 AI 时全程用它。

输出 JPEG（质量 92）：18000px 级别的 PNG 会到几百 MB，JPEG 在 20~60MB 量级。
"""

from __future__ import annotations

import os
import subprocess
import tempfile

DEFAULT_TARGET = 18000
MIN_TARGET = 1024
JPEG_MAX_EDGE = 65000  # JPEG 规格上限 65535，留余量

# 分辨率档位：档名 → 目标长边（px）
RESOLUTION_TIERS = {
    "1k": 1024,
    "2k": 2048,
    "3k": 3072,
    "4k": 4096,
    "8k": 8192,
    "18k": 18000,
}


def tier_target(tier: str) -> int | None:
    """档名（不区分大小写）→ 目标长边；未知档名返回 None。"""
    return RESOLUTION_TIERS.get(str(tier or "").strip().lower())


def max_target() -> int:
    try:
        return min(JPEG_MAX_EDGE, int(os.getenv("HD_EXPORT_MAX_EDGE", str(DEFAULT_TARGET))))
    except ValueError:
        return DEFAULT_TARGET


def _try_realesrgan(src_path: str, long_edge: int, target: int):
    """可选 AI 超分：REALESRGAN_EXE 指向 realesrgan-ncnn-vulkan 时启用。

    成功返回超分后的 PIL Image，失败/未配置返回 None（调用方回退 Lanczos）。
    """
    exe = os.getenv("REALESRGAN_EXE", "").strip()
    if not exe or not os.path.isfile(exe):
        return None

    # ncnn 版支持 -s 2/3/4；选能覆盖目标的最小倍数，超出部分由 Lanczos 收尾
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
    except Exception:  # noqa: BLE001 — AI 超分是增强项，任何失败都静默回退
        return None
    finally:
        if tmp_out and os.path.exists(tmp_out):
            try:
                os.remove(tmp_out)
            except OSError:
                pass


def export_hd(src_path: str, dst_path: str, target_long_edge: int = DEFAULT_TARGET) -> dict:
    """把 src 图片放大到长边 target_long_edge，写入 dst（JPEG）。

    返回 {"width", "height", "bytes", "path", "upscaler"}；
    源图不存在时抛 FileNotFoundError。
    """
    from PIL import Image, ImageFilter

    if not os.path.exists(src_path):
        raise FileNotFoundError(src_path)

    target = max(MIN_TARGET, min(int(target_long_edge), max_target()))

    # 18K 级别像素数远超 PIL 默认的解压炸弹阈值，这里是本地可信文件
    Image.MAX_IMAGE_PIXELS = None

    with Image.open(src_path) as im:
        img = im.convert("RGB")

    w, h = img.size
    long_edge = max(w, h)
    if long_edge >= target:
        # 已达标：等比缩到目标边长（1K/2K 档常见），保证产物尺寸符合档位
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

    # 分级放大：每级最多 2x，级间轻度锐化（超大尺寸时跳过锐化控内存/耗时）
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
        # AI 超分可能越过目标（如 2x 后超出），等比缩回精确档位
        s = target / float(max(cw, ch))
        cur = cur.resize((round(cw * s), round(ch * s)), Image.LANCZOS)
        cw, ch = cur.size

    os.makedirs(os.path.dirname(dst_path) or ".", exist_ok=True)
    cur.save(dst_path, "JPEG", quality=92)
    return {"width": cw, "height": ch, "bytes": os.path.getsize(dst_path),
            "path": dst_path, "upscaler": upscaler}
