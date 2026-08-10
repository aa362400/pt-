"""english_text — textlocalvisualenglish_text，english_text API。

english_textsearchenglish_text"english_text"english_text：
- english_text（english_text）
- visualtext（english_text / english_text）
- english_text（english_text）
- backgroundenglish_text（english_text）

output 0-100 text + Englishtext，english_text；textfailedtext None english_text。
"""

from __future__ import annotations

import os

ANALYZE_EDGE = 320  # english_text，english_text


def _foreground_stats(img):
    """english_textbackgroundenglish_text。"""
    w, h = img.size
    px = img.load()
    corners = []
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        corners.append(px[cx, cy])
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    fg_count = 0
    sx = sy = 0
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 90:
                fg_count += 1
                sx += x
                sy += y
                min_x, min_y = min(min_x, x), min(min_y, y)
                max_x, max_y = max(max_x, x), max(max_y, y)

    total = w * h
    occupancy = fg_count / total if total else 0
    if fg_count:
        center_offset = (abs(sx / fg_count - w / 2) / (w / 2)
                         + abs(sy / fg_count - h / 2) / (h / 2)) / 2
    else:
        center_offset = 1.0
    bg_brightness = sum(bg) / 3
    return occupancy, center_offset, bg_brightness


def score_image(path: str) -> dict:
    """english_text。text {"score", "reasons", "tips", "metrics"}。"""
    from PIL import Image, ImageFilter, ImageStat

    with Image.open(path) as im:
        img = im.convert("RGB")
    img.thumbnail((ANALYZE_EDGE, ANALYZE_EDGE))

    occupancy, center_offset, bg_brightness = _foreground_stats(img)

    stat = ImageStat.Stat(img)
    contrast = sum(stat.stddev) / 3          # english_text ≈ english_text
    r_mean, g_mean, b_mean = stat.mean
    colorfulness = (abs(r_mean - g_mean) + abs(g_mean - b_mean)
                    + abs(b_mean - r_mean))

    edges = img.convert("L").filter(ImageFilter.FIND_EDGES)
    sharpness = ImageStat.Stat(edges).mean[0]  # english_text ≈ text

    reasons, tips = [], []
    score = 50.0

    # english_text：60%~88% yesenglish_text
    if 0.45 <= occupancy <= 0.88:
        score += 18
        reasons.append(f"english_text（{occupancy:.0%}），english_text")
    elif occupancy < 0.45:
        score += max(0, occupancy / 0.45 * 18 - 4)
        tips.append(f"english_text（{occupancy:.0%}），english_text 60% text")
    else:
        score += 10
        tips.append("english_text，english_text")

    # english_text
    if center_offset < 0.18:
        score += 8
        reasons.append("english_text，english_text")
    elif center_offset > 0.4:
        tips.append("english_text，english_text")

    # english_text / text
    if contrast >= 45:
        score += 10
        reasons.append("english_text，english_text")
    elif contrast < 28:
        tips.append("english_text，english_text")
    if colorfulness >= 18:
        score += 6
        reasons.append("textyesenglish_text")

    # english_text
    if sharpness >= 14:
        score += 8
        reasons.append("english_text")
    elif sharpness < 7:
        tips.append("english_text，english_text")

    # backgroundenglish_text（textbackground + english_text → english_text）
    if bg_brightness >= 225:
        score += 4
        reasons.append("backgroundenglish_text")

    score = max(0, min(100, round(score, 1)))
    return {
        "score": score,
        "reasons": reasons[:4],
        "tips": tips[:3],
        "metrics": {
            "occupancy": round(occupancy, 3),
            "centerOffset": round(center_offset, 3),
            "contrast": round(contrast, 1),
            "colorfulness": round(colorfulness, 1),
            "sharpness": round(sharpness, 1),
        },
    }


def score_directory(raw_dir: str) -> list:
    """english_textallgenerationenglish_text，english_text。"""
    results = []
    files = sorted(
        f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    for fname in files:
        item = {"imageId": os.path.splitext(fname)[0], "filename": fname}
        try:
            item.update(score_image(os.path.join(raw_dir, fname)))
        except Exception as e:  # noqa: BLE001 — textfailedenglish_text
            item.update({"score": None, "error": str(e)[:80],
                         "reasons": [], "tips": []})
        results.append(item)
    results.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    return results
