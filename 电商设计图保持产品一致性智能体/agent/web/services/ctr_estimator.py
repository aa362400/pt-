"""主图点击率预估 — 纯本地视觉特征启发式，不依赖外部 API。

从买家在搜索列表里"扫一眼"的视角评估每张图的点击吸引力：
- 主体占比与居中度（够不够抓眼）
- 视觉冲击（对比度 / 色彩饱满度）
- 清晰度（边缘锐度）
- 背景干净度（主图规范偏好）

输出 0-100 分 + 中文理由，供排序展示与选优加权；单图失败返回 None 分不阻断。
"""

from __future__ import annotations

import os

ANALYZE_EDGE = 320  # 降采样长边，控制耗时


def _foreground_stats(img):
    """以四角平均色为背景估计前景占比与主体偏移。"""
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
    """单图点击率预估。返回 {"score", "reasons", "tips", "metrics"}。"""
    from PIL import Image, ImageFilter, ImageStat

    with Image.open(path) as im:
        img = im.convert("RGB")
    img.thumbnail((ANALYZE_EDGE, ANALYZE_EDGE))

    occupancy, center_offset, bg_brightness = _foreground_stats(img)

    stat = ImageStat.Stat(img)
    contrast = sum(stat.stddev) / 3          # 通道标准差 ≈ 对比度
    r_mean, g_mean, b_mean = stat.mean
    colorfulness = (abs(r_mean - g_mean) + abs(g_mean - b_mean)
                    + abs(b_mean - r_mean))

    edges = img.convert("L").filter(ImageFilter.FIND_EDGES)
    sharpness = ImageStat.Stat(edges).mean[0]  # 边缘均值 ≈ 锐度

    reasons, tips = [], []
    score = 50.0

    # 主体占比：60%~88% 是黄金区间
    if 0.45 <= occupancy <= 0.88:
        score += 18
        reasons.append(f"主体占比合适（{occupancy:.0%}），列表里一眼看清产品")
    elif occupancy < 0.45:
        score += max(0, occupancy / 0.45 * 18 - 4)
        tips.append(f"主体偏小（{occupancy:.0%}），建议放大产品占比到 60% 以上")
    else:
        score += 10
        tips.append("主体几乎撑满画面，适当留边呼吸感更好")

    # 居中度
    if center_offset < 0.18:
        score += 8
        reasons.append("产品居中，视线落点稳")
    elif center_offset > 0.4:
        tips.append("主体偏离中心较多，缩略图里容易被裁掉重点")

    # 对比度 / 色彩
    if contrast >= 45:
        score += 10
        reasons.append("明暗对比强，缩略图里更跳")
    elif contrast < 28:
        tips.append("对比度偏平，可以加深阴影或提亮主体")
    if colorfulness >= 18:
        score += 6
        reasons.append("色彩有记忆点")

    # 清晰度
    if sharpness >= 14:
        score += 8
        reasons.append("边缘锐利清晰")
    elif sharpness < 7:
        tips.append("画面偏软，建议导出前做轻度锐化")

    # 背景干净度（亮背景 + 低占比噪声 → 更像规范主图）
    if bg_brightness >= 225:
        score += 4
        reasons.append("背景干净透亮")

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
    """给目录下全部生成图打分，按分数降序返回。"""
    results = []
    files = sorted(
        f for f in (os.listdir(raw_dir) if os.path.isdir(raw_dir) else [])
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    for fname in files:
        item = {"imageId": os.path.splitext(fname)[0], "filename": fname}
        try:
            item.update(score_image(os.path.join(raw_dir, fname)))
        except Exception as e:  # noqa: BLE001 — 单图失败不阻断整批
            item.update({"score": None, "error": str(e)[:80],
                         "reasons": [], "tips": []})
        results.append(item)
    results.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    return results
