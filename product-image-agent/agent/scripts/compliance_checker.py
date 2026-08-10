#!/usr/bin/env python3
"""
platformenglish_text — Platform Compliance Checker

textimagetext/platformenglish_text，english_textplatformtextlistingenglish_textautomatictext：
  - english_text（Amazon/Walmart english_textbackground）
  - english_text（Amazon english_text ≥85%，textplatformtextyestext）
  - english_text / english_text
  - fileenglish_text

text：
  # english_text Amazon english_text
  python compliance_checker.py --image scene_01.jpg --platform amazon_main

  # english_textplatformenglish_textoutput JSON report
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

# english_text，english_text
ANALYZE_SIZE = 256
# text"english_text"english_text
WHITE_THRESHOLD = 245
# textdetectiontextbackgroundenglish_text
SUBJECT_DIFF_THRESHOLD = 30

# ============================================================
# textplatformenglish_text
#   white_bg: yesnoenglish_textbackground（english_text）
#   occupancy: english_text (min, max)
#   min_px: english_text
#   ratio: english_text（None english_text）
# ============================================================

COMPLIANCE_RULES = {
    "amazon_main": {
        "name": "Amazon text",
        "white_bg": True,
        "white_bg_min_ratio": 0.90,
        "occupancy": (0.75, 1.00),
        "min_px": 1000,
        "ratio": (1, 1),
        "max_size_mb": 10,
    },
    "amazon_detail": {
        "name": "Amazon english_text",
        "white_bg": False,
        "occupancy": (0.30, 1.00),
        "min_px": 1000,
        "ratio": (1, 1),
        "max_size_mb": 10,
    },
    "walmart": {
        "name": "Walmart text",
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
        "name": "Mercado Libre text",
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
        "name": "english_text",
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
# english_text
# ============================================================

def _load_small(image_path: str) -> "Image.Image":
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((ANALYZE_SIZE, ANALYZE_SIZE), Image.LANCZOS)
    return img


def measure_white_background(img: "Image.Image") -> float:
    """english_text（0-1）"""
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
    english_text。
    english_textbackgroundtext，textbackgroundenglish_text。
    text {occupancy_long_edge, occupancy_area, bbox}
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

    if max_x < 0:  # english_textbackgroundtext
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
# english_text
# ============================================================

def check_image_compliance(image_path: str, platform: str) -> dict:
    """english_textplatformenglish_text"""
    rule = COMPLIANCE_RULES.get(platform)
    if not rule:
        return {
            "image": image_path, "platform": platform,
            "passed": True, "skipped": True,
            "issues": [], "metrics": {},
            "note": f"platform {platform} noneenglish_text，textpassed",
        }
    if not HAS_PIL:
        return {
            "image": image_path, "platform": platform,
            "passed": True, "skipped": True,
            "issues": [], "metrics": {}, "note": "text Pillow，english_text",
        }

    issues = []
    metrics = {}

    with Image.open(image_path) as raw:
        width, height = raw.size
    metrics["size"] = f"{width}x{height}"

    if min(width, height) < rule.get("min_px", 0):
        issues.append(
            f"english_text：english_text {min(width, height)}px < text {rule['min_px']}px"
        )

    ratio = rule.get("ratio")
    if ratio and not _ratio_matches(width, height, ratio):
        issues.append(f"english_text：{width}:{height}，text {ratio[0]}:{ratio[1]}")

    file_mb = os.path.getsize(image_path) / (1024 * 1024)
    metrics["file_mb"] = round(file_mb, 2)
    if file_mb > rule.get("max_size_mb", 99):
        issues.append(f"filetext：{file_mb:.1f}MB > text {rule['max_size_mb']}MB")

    small = _load_small(image_path)

    if rule.get("white_bg"):
        white_ratio = measure_white_background(small)
        metrics["white_bg_ratio"] = round(white_ratio, 3)
        if white_ratio < rule.get("white_bg_min_ratio", 0.9):
            issues.append(
                f"backgroundenglish_text：english_text {white_ratio:.0%} < "
                f"text {rule.get('white_bg_min_ratio', 0.9):.0%}（english_textbackground）"
            )

    occ_range = rule.get("occupancy")
    if occ_range:
        occ = measure_subject_occupancy(small)
        metrics["occupancy_long_edge"] = occ["occupancy_long_edge"]
        lo, hi = occ_range
        if occ["occupancy_long_edge"] < lo:
            issues.append(
                f"english_text：english_text {occ['occupancy_long_edge']:.0%} < text {lo:.0%}"
            )
        elif occ["occupancy_long_edge"] > hi:
            issues.append(
                f"english_text：english_text {occ['occupancy_long_edge']:.0%} > text {hi:.0%}"
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
    """english_textyesimagetextplatformenglish_text，english_textreport"""
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
        logger.info(f"📄 textreportenglish_text: {report_path}")

    return report


def main():
    parser = argparse.ArgumentParser(description="platformenglish_text")
    parser.add_argument("--image", help="textimagetext")
    parser.add_argument("--input-dir", help="imagetext")
    parser.add_argument("--platform", help="textplatformtext")
    parser.add_argument("--platforms", nargs="+", default=None, help="textplatformtext")
    parser.add_argument("--report", default="", help="JSON reportoutputtext")
    args = parser.parse_args()

    platforms = args.platforms or ([args.platform] if args.platform else list(COMPLIANCE_RULES.keys()))

    if args.image:
        for platform in platforms:
            result = check_image_compliance(args.image, platform)
            status = "✅ passed" if result["passed"] else "❌ english_text"
            logger.info(f"{status} [{platform}] {os.path.basename(args.image)}")
            for issue in result["issues"]:
                logger.info(f"    - {issue}")
    elif args.input_dir:
        report = check_directory(args.input_dir, platforms, args.report)
        logger.info(
            f"english_textcompleted: {report['passed']}/{report['total_checks']} passed "
            f"({report['pass_rate']:.0%})"
        )
        for r in report["results"]:
            if not r["passed"]:
                logger.info(f"  ❌ [{r['platform']}] {os.path.basename(r['image'])}")
                for issue in r["issues"]:
                    logger.info(f"      - {issue}")
    else:
        parser.error("text --image text --input-dir")


if __name__ == "__main__":
    main()
