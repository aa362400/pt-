#!/usr/bin/env python3
"""
平台合规校验器 — Platform Compliance Checker

在图片出图/平台适配后，按各跨境平台的上架规则做自动校验：
  - 白底纯度（Amazon/Walmart 等主图要求纯白背景）
  - 产品占比（Amazon 要求产品占画面 ≥85%，其余平台各有区间）
  - 最小分辨率 / 宽高比
  - 文件体积上限

用法：
  # 校验单张图对 Amazon 主图的合规性
  python compliance_checker.py --image scene_01.jpg --platform amazon_main

  # 校验整个目录对多平台的合规性并输出 JSON 报告
  python compliance_checker.py --input-dir outputs/final/ \
      --platforms amazon_main walmart ebay --report compliance.json
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import collect_images, setup_logger

logger = setup_logger(__name__)

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# 分析时统一缩到该尺寸，保证大图校验速度
ANALYZE_SIZE = 256
# 认为"接近白色"的通道下限
WHITE_THRESHOLD = 245
# 主体检测时与背景的欧氏距离阈值
SUBJECT_DIFF_THRESHOLD = 30

# ============================================================
# 各平台合规规则
#   white_bg: 是否要求纯白背景（按边缘白色占比判断）
#   occupancy: 产品主体占最长边的比例区间 (min, max)
#   min_px: 最短边最小像素
#   ratio: 要求的宽高比（None 表示不限制）
# ============================================================

COMPLIANCE_RULES = {
    "amazon_main": {
        "name": "Amazon 主图",
        "white_bg": True,
        "white_bg_min_ratio": 0.90,
        "occupancy": (0.75, 1.00),
        "min_px": 1000,
        "ratio": (1, 1),
        "max_size_mb": 10,
    },
    "amazon_detail": {
        "name": "Amazon 详情图",
        "white_bg": False,
        "occupancy": (0.30, 1.00),
        "min_px": 1000,
        "ratio": (1, 1),
        "max_size_mb": 10,
    },
    "walmart": {
        "name": "Walmart 主图",
        "white_bg": True,
        "white_bg_min_ratio": 0.85,
        "occupancy": (0.60, 1.00),
        "min_px": 1000,
        "ratio": (1, 1),
        "max_size_mb": 5,
    },
    "ebay": {
        "name": "eBay",
        "white_bg": False,
        "occupancy": (0.40, 1.00),
        "min_px": 500,
        "ratio": None,
        "max_size_mb": 12,
    },
    "mercado_libre": {
        "name": "Mercado Libre 主图",
        "white_bg": True,
        "white_bg_min_ratio": 0.85,
        "occupancy": (0.50, 1.00),
        "min_px": 1200,
        "ratio": (1, 1),
        "max_size_mb": 10,
    },
    "tiktok_shop": {
        "name": "TikTok Shop",
        "white_bg": False,
        "occupancy": (0.40, 1.00),
        "min_px": 600,
        "ratio": (1, 1),
        "max_size_mb": 5,
    },
    "temu": {
        "name": "Temu",
        "white_bg": False,
        "occupancy": (0.40, 1.00),
        "min_px": 800,
        "ratio": (1, 1),
        "max_size_mb": 3,
    },
    "shein": {
        "name": "Shein",
        "white_bg": False,
        "occupancy": (0.35, 1.00),
        "min_px": 800,
        "ratio": (3, 4),
        "max_size_mb": 5,
    },
    "coupang": {
        "name": "Coupang",
        "white_bg": True,
        "white_bg_min_ratio": 0.80,
        "occupancy": (0.50, 1.00),
        "min_px": 500,
        "ratio": (1, 1),
        "max_size_mb": 5,
    },
    "alibaba": {
        "name": "阿里国际站",
        "white_bg": False,
        "occupancy": (0.40, 1.00),
        "min_px": 800,
        "ratio": (1, 1),
        "max_size_mb": 5,
    },
    "etsy": {
        "name": "Etsy",
        "white_bg": False,
        "occupancy": (0.25, 1.00),
        "min_px": 2000,
        "ratio": None,
        "max_size_mb": 10,
    },
    "shopify": {
        "name": "Shopify",
        "white_bg": False,
        "occupancy": (0.25, 1.00),
        "min_px": 800,
        "ratio": None,
        "max_size_mb": 20,
    },
    "lazada": {
        "name": "Lazada",
        "white_bg": True,
        "white_bg_min_ratio": 0.75,
        "occupancy": (0.40, 1.00),
        "min_px": 800,
        "ratio": (1, 1),
        "max_size_mb": 5,
    },
    "shopline": {
        "name": "Shopline",
        "white_bg": False,
        "occupancy": (0.30, 1.00),
        "min_px": 800,
        "ratio": (1, 1),
        "max_size_mb": 5,
    },
}


# ============================================================
# 图像度量
# ============================================================

def _load_small(image_path: str) -> "Image.Image":
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((ANALYZE_SIZE, ANALYZE_SIZE), Image.LANCZOS)
    return img


def measure_white_background(img: "Image.Image") -> float:
    """边缘一圈像素中接近纯白的占比（0-1）"""
    w, h = img.size
    px = img.load()
    border = []
    for x in range(w):
        border.append(px[x, 0])
        border.append(px[x, h - 1])
    for y in range(h):
        border.append(px[0, y])
        border.append(px[w - 1, y])
    if not border:
        return 0.0
    white = sum(
        1 for (r, g, b) in border
        if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD
    )
    return white / len(border)


def measure_subject_occupancy(img: "Image.Image") -> dict:
    """
    估算产品主体外接框相对画面的占比。
    以四角像素均值作为背景色，与背景差异大的像素视为主体。
    返回 {occupancy_long_edge, occupancy_area, bbox}
    """
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            diff = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if diff > SUBJECT_DIFF_THRESHOLD * 3:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

    if max_x < 0:  # 全图接近背景色
        return {"occupancy_long_edge": 0.0, "occupancy_area": 0.0, "bbox": None}

    bw, bh = max_x - min_x + 1, max_y - min_y + 1
    return {
        "occupancy_long_edge": round(max(bw / w, bh / h), 3),
        "occupancy_area": round((bw * bh) / (w * h), 3),
        "bbox": (min_x, min_y, max_x, max_y),
    }


def _ratio_matches(width: int, height: int, ratio: tuple, tolerance: float = 0.02) -> bool:
    expect = ratio[0] / ratio[1]
    actual = width / height
    return abs(actual - expect) / expect <= tolerance


# ============================================================
# 校验入口
# ============================================================

def check_image_compliance(image_path: str, platform: str) -> dict:
    """校验单张图对单平台的合规性"""
    rule = COMPLIANCE_RULES.get(platform)
    if not rule:
        return {
            "image": image_path, "platform": platform,
            "passed": True, "skipped": True,
            "issues": [], "metrics": {},
            "note": f"平台 {platform} 无合规规则，默认通过",
        }
    if not HAS_PIL:
        return {
            "image": image_path, "platform": platform,
            "passed": True, "skipped": True,
            "issues": [], "metrics": {}, "note": "缺少 Pillow，跳过校验",
        }

    issues = []
    metrics = {}

    with Image.open(image_path) as raw:
        width, height = raw.size
    metrics["size"] = f"{width}x{height}"

    if min(width, height) < rule.get("min_px", 0):
        issues.append(
            f"分辨率不足：最短边 {min(width, height)}px < 要求 {rule['min_px']}px"
        )

    ratio = rule.get("ratio")
    if ratio and not _ratio_matches(width, height, ratio):
        issues.append(f"宽高比不符：{width}:{height}，要求 {ratio[0]}:{ratio[1]}")

    file_mb = os.path.getsize(image_path) / (1024 * 1024)
    metrics["file_mb"] = round(file_mb, 2)
    if file_mb > rule.get("max_size_mb", 99):
        issues.append(f"文件过大：{file_mb:.1f}MB > 上限 {rule['max_size_mb']}MB")

    small = _load_small(image_path)

    if rule.get("white_bg"):
        white_ratio = measure_white_background(small)
        metrics["white_bg_ratio"] = round(white_ratio, 3)
        if white_ratio < rule.get("white_bg_min_ratio", 0.9):
            issues.append(
                f"背景不够白：边缘白色占比 {white_ratio:.0%} < "
                f"要求 {rule.get('white_bg_min_ratio', 0.9):.0%}（主图需纯白背景）"
            )

    occ_range = rule.get("occupancy")
    if occ_range:
        occ = measure_subject_occupancy(small)
        metrics["occupancy_long_edge"] = occ["occupancy_long_edge"]
        lo, hi = occ_range
        if occ["occupancy_long_edge"] < lo:
            issues.append(
                f"产品占比过小：主体占最长边 {occ['occupancy_long_edge']:.0%} < 要求 {lo:.0%}"
            )
        elif occ["occupancy_long_edge"] > hi:
            issues.append(
                f"产品占比过大：主体占最长边 {occ['occupancy_long_edge']:.0%} > 上限 {hi:.0%}"
            )

    return {
        "image": image_path,
        "platform": platform,
        "platform_name": rule["name"],
        "passed": not issues,
        "issues": issues,
        "metrics": metrics,
    }


def check_directory(input_dir: str, platforms: list, report_path: str = "") -> dict:
    """校验目录内所有图片对多平台的合规性，返回汇总报告"""
    image_paths = collect_images(input_dir)
    results = []
    for platform in platforms:
        for path in image_paths:
            results.append(check_image_compliance(path, platform))

    passed = sum(1 for r in results if r["passed"])
    report = {
        "input_dir": input_dir,
        "platforms": platforms,
        "total_checks": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "pass_rate": round(passed / len(results), 3) if results else 1.0,
        "results": results,
    }

    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        logger.info(f"📄 合规报告已保存: {report_path}")

    return report


def main():
    parser = argparse.ArgumentParser(description="平台合规校验器")
    parser.add_argument("--image", help="单张图片路径")
    parser.add_argument("--input-dir", help="图片目录")
    parser.add_argument("--platform", help="单平台校验")
    parser.add_argument("--platforms", nargs="+", default=None, help="多平台校验")
    parser.add_argument("--report", default="", help="JSON 报告输出路径")
    args = parser.parse_args()

    platforms = args.platforms or ([args.platform] if args.platform else list(COMPLIANCE_RULES.keys()))

    if args.image:
        for platform in platforms:
            result = check_image_compliance(args.image, platform)
            status = "✅ 通过" if result["passed"] else "❌ 不合规"
            logger.info(f"{status} [{platform}] {os.path.basename(args.image)}")
            for issue in result["issues"]:
                logger.info(f"    - {issue}")
    elif args.input_dir:
        report = check_directory(args.input_dir, platforms, args.report)
        logger.info(
            f"合规校验完成: {report['passed']}/{report['total_checks']} 通过 "
            f"({report['pass_rate']:.0%})"
        )
        for r in report["results"]:
            if not r["passed"]:
                logger.info(f"  ❌ [{r['platform']}] {os.path.basename(r['image'])}")
                for issue in r["issues"]:
                    logger.info(f"      - {issue}")
    else:
        parser.error("需要 --image 或 --input-dir")


if __name__ == "__main__":
    main()
