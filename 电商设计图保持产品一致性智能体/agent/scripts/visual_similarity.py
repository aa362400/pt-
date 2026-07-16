#!/usr/bin/env python3
"""
视觉相似度度量 — Visual Similarity

不依赖深度学习框架的轻量嵌入级度量，用于量化
「生成图中的产品」与「用户上传的原始产品图」的接近程度：

  - 感知哈希（aHash + dHash）：结构层面的相似度
  - 颜色直方图交集：色彩分布相似度
  - 主体区域比对：自动框出产品主体后，仅对主体区域比较色彩特征

作为 consistency_checker 的「参考图保真度」维度接入。
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import setup_logger

logger = setup_logger(__name__)

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

HASH_SIZE = 16
HIST_BINS = 32
SUBJECT_DIFF_THRESHOLD = 30


# ============================================================
# 感知哈希
# ============================================================

def _to_gray_small(img: "Image.Image", size: int) -> list:
    small = img.convert("L").resize((size, size), Image.LANCZOS)
    return list(small.getdata())


def average_hash(image_path: str, hash_size: int = HASH_SIZE) -> list:
    """均值哈希：结构轮廓指纹"""
    with Image.open(image_path) as img:
        data = _to_gray_small(img, hash_size)
    avg = sum(data) / len(data)
    return [1 if p >= avg else 0 for p in data]


def dhash(image_path: str, hash_size: int = HASH_SIZE) -> list:
    """差值哈希：梯度指纹，对亮度变化更鲁棒"""
    with Image.open(image_path) as img:
        small = img.convert("L").resize((hash_size + 1, hash_size), Image.LANCZOS)
    px = list(small.getdata())
    bits = []
    for row in range(hash_size):
        for col in range(hash_size):
            left = px[row * (hash_size + 1) + col]
            right = px[row * (hash_size + 1) + col + 1]
            bits.append(1 if left > right else 0)
    return bits


def hash_similarity(bits1: list, bits2: list) -> float:
    """两个哈希的相似度（0-1，1 完全一致）"""
    if not bits1 or not bits2 or len(bits1) != len(bits2):
        return 0.0
    same = sum(1 for a, b in zip(bits1, bits2) if a == b)
    return same / len(bits1)


# ============================================================
# 颜色直方图
# ============================================================

def color_histogram(img: "Image.Image", bins: int = HIST_BINS) -> list:
    """RGB 三通道归一化直方图（拼接）"""
    small = img.convert("RGB").resize((128, 128), Image.LANCZOS)
    hist = small.histogram()  # 256*3
    step = 256 // bins
    result = []
    for ch in range(3):
        channel = hist[ch * 256:(ch + 1) * 256]
        binned = [sum(channel[i * step:(i + 1) * step]) for i in range(bins)]
        total = sum(binned) or 1
        result.extend(v / total for v in binned)
    return result


def histogram_similarity(h1: list, h2: list) -> float:
    """直方图交集相似度（0-1）"""
    if not h1 or not h2 or len(h1) != len(h2):
        return 0.0
    inter = sum(min(a, b) for a, b in zip(h1, h2))
    return inter / 3.0  # 三通道各归一化为1


# ============================================================
# 主体区域提取
# ============================================================

def detect_subject_bbox(img: "Image.Image") -> tuple:
    """
    以四角均值为背景色，框出与背景差异明显的主体区域。
    返回 (left, top, right, bottom)；找不到主体时返回整图。
    """
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
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

    if max_x < 0:
        return (0, 0, w, h)

    scale_x, scale_y = w / sw, h / sh
    return (
        max(0, int(min_x * scale_x)),
        max(0, int(min_y * scale_y)),
        min(w, int((max_x + 1) * scale_x)),
        min(h, int((max_y + 1) * scale_y)),
    )


def crop_subject(image_path: str) -> "Image.Image":
    """裁出产品主体区域"""
    img = Image.open(image_path).convert("RGB")
    bbox = detect_subject_bbox(img)
    return img.crop(bbox)


# ============================================================
# 参考图保真度
# ============================================================

def subject_fidelity(reference_path: str, generated_path: str) -> dict:
    """
    比较参考图与生成图的产品主体：
      - 主体区域颜色直方图相似度（权重 0.6）
      - 主体区域 dHash 结构相似度（权重 0.4）
    返回 0-100 的 fidelity 分。
    """
    if not HAS_PIL:
        return {"fidelity": None, "note": "Pillow not installed"}

    try:
        ref_subject = crop_subject(reference_path)
        gen_subject = crop_subject(generated_path)

        hist_sim = histogram_similarity(
            color_histogram(ref_subject), color_histogram(gen_subject)
        )

        # 结构：把两个主体缩放到同一尺寸后比 dHash
        size = (HASH_SIZE + 1, HASH_SIZE)
        ref_gray = list(ref_subject.convert("L").resize(size, Image.LANCZOS).getdata())
        gen_gray = list(gen_subject.convert("L").resize(size, Image.LANCZOS).getdata())

        def _dbits(px):
            bits = []
            for row in range(HASH_SIZE):
                for col in range(HASH_SIZE):
                    bits.append(1 if px[row * (HASH_SIZE + 1) + col] > px[row * (HASH_SIZE + 1) + col + 1] else 0)
            return bits

        struct_sim = hash_similarity(_dbits(ref_gray), _dbits(gen_gray))

        fidelity = (hist_sim * 0.6 + struct_sim * 0.4) * 100
        return {
            "fidelity": round(fidelity, 1),
            "color_similarity": round(hist_sim * 100, 1),
            "structure_similarity": round(struct_sim * 100, 1),
        }
    except Exception as e:
        return {"fidelity": None, "note": f"比对失败: {e}"}


def reference_fidelity_report(reference_paths: list, generated_paths: list) -> dict:
    """
    对每张生成图计算与所有参考图的最高保真度。

    返回:
        {
            "avg_fidelity": 0-100,
            "min_fidelity": 0-100,
            "per_image": [{file, fidelity, color_similarity, structure_similarity}],
        }
    """
    refs = [p for p in (reference_paths or []) if p and os.path.exists(p)]
    gens = [p for p in (generated_paths or []) if p and os.path.exists(p)]
    if not refs or not gens or not HAS_PIL:
        return {"avg_fidelity": None, "min_fidelity": None, "per_image": []}

    per_image = []
    for gen in gens:
        best = None
        for ref in refs:
            result = subject_fidelity(ref, gen)
            if result.get("fidelity") is None:
                continue
            if best is None or result["fidelity"] > best["fidelity"]:
                best = result
        entry = {"file": os.path.basename(gen), "path": gen}
        entry.update(best or {"fidelity": None})
        per_image.append(entry)

    scores = [e["fidelity"] for e in per_image if e.get("fidelity") is not None]
    if not scores:
        return {"avg_fidelity": None, "min_fidelity": None, "per_image": per_image}

    return {
        "avg_fidelity": round(sum(scores) / len(scores), 1),
        "min_fidelity": round(min(scores), 1),
        "per_image": per_image,
    }
