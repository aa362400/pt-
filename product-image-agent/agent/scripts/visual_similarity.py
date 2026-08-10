#!/usr/bin/env python3
"""
visualenglish_text — Visual Similarity

english_text，english_text
「generationenglish_text」text「userenglish_text」english_text：

  - english_text（aHash + dHash）：english_text
  - english_text：english_text
  - english_text：automaticenglish_text，english_text

text consistency_checker text「english_text」english_text。
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
# english_text
# ============================================================

def _to_gray_small(img: "Image.Image", size: int) -> list:
    small = img.convert("L").resize((size, size), Image.LANCZOS)
    return list(small.getdata())


def average_hash(image_path: str, hash_size: int = HASH_SIZE) -> list:
    """english_text：english_text"""
    with Image.open(image_path) as img:
        data = _to_gray_small(img, hash_size)
    avg = sum(data) / len(data)
    return [1 if p >= avg else 0 for p in data]


def dhash(image_path: str, hash_size: int = HASH_SIZE) -> list:
    """english_text：english_text，english_text"""
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
    """english_text（0-1，1 english_text）"""
    if not bits1 or not bits2 or len(bits1) != len(bits2):
        return 0.0
    same = sum(1 for a, b in zip(bits1, bits2) if a == b)
    return same / len(bits1)


# ============================================================
# english_text
# ============================================================

def color_histogram(img: "Image.Image", bins: int = HIST_BINS) -> list:
    """RGB english_text（text）"""
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
    """english_text（0-1）"""
    if not h1 or not h2 or len(h1) != len(h2):
        return 0.0
    inter = sum(min(a, b) for a, b in zip(h1, h2))
    return inter / 3.0  # english_text1


# ============================================================
# english_text
# ============================================================

def detect_subject_bbox(img: "Image.Image") -> tuple:
    """
    english_textbackgroundtext，english_textbackgroundenglish_text。
    text (left, top, right, bottom)；english_text。
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
    """english_text"""
    img = Image.open(image_path).convert("RGB")
    bbox = detect_subject_bbox(img)
    return img.crop(bbox)


# ============================================================
# english_text
# ============================================================

def subject_fidelity(reference_path: str, generated_path: str) -> dict:
    """
    english_textgenerationenglish_text：
      - english_text（text 0.6）
      - english_text dHash english_text（text 0.4）
    text 0-100 text fidelity text。
    """
    if not HAS_PIL:
        return {"fidelity": None, "note": "Pillow not installed"}

    try:
        ref_subject = crop_subject(reference_path)
        gen_subject = crop_subject(generated_path)

        hist_sim = histogram_similarity(
            color_histogram(ref_subject), color_histogram(gen_subject)
        )

        # text：english_text dHash
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
        return {"fidelity": None, "note": f"textfailed: {e}"}


def reference_fidelity_report(reference_paths: list, generated_paths: list) -> dict:
    """
    english_textgenerationenglish_textyesenglish_text。

    text:
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
