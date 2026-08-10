#!/usr/bin/env python3
"""
sceneenglish_text — Scene Matcher

text：
  english_textautomaticenglish_text 10 textscene
  english_textcategory（fashion/home/digital/food/beauty/sports）textscenetext

text：
  # english_text
  python scene_matcher.py --profile product_profile.json

  # outputenglish_textfile
  python scene_matcher.py --profile product_profile.json --output scene_plan.json

  # english_text - english_textscene
  python scene_matcher.py --profile product_profile.json --skip scene_06_seasonal scene_08_comparison

  # textcategory（textautomaticdetection）
  python scene_matcher.py --profile product_profile.json --category fashion
"""

import argparse
import json
import os
import sys
from typing import Optional

# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.runtime_paths import get_runtime_paths
from common.utils import setup_logger

logger = setup_logger(__name__)


def feedback_history_path() -> str:
    return os.path.join(get_runtime_paths().memory, "feedback_history.json")

# ============================================================
# category → scene english_text (0-10)
# ============================================================
# textyesenglish_textcategory，textyestextscene
# english_text：textscenetextcategoryenglish_texte-commerceenglish_text

CATEGORY_SCENE_SCORES = {
    # scene_id: {category: score, ...}
    "scene_01_white_bg": {
        "fashion": 10, "home": 9, "digital": 10, "food": 10,
        "beauty": 10, "sports": 9, "general": 9,
    },
    "scene_02_lifestyle": {
        "fashion": 10, "home": 10, "digital": 7, "food": 9,
        "beauty": 9, "sports": 9, "general": 8,
    },
    "scene_03_premium": {
        "fashion": 10, "home": 8, "digital": 9, "food": 7,
        "beauty": 10, "sports": 6, "general": 7,
    },
    "scene_04_in_use": {
        "fashion": 8, "home": 9, "digital": 10, "food": 9,
        "beauty": 9, "sports": 10, "general": 8,
    },
    "scene_05_detail": {
        "fashion": 9, "home": 8, "digital": 10, "food": 8,
        "beauty": 9, "sports": 8, "general": 7,
    },
    "scene_06_seasonal": {
        "fashion": 9, "home": 8, "digital": 6, "food": 8,
        "beauty": 8, "sports": 7, "general": 7,
    },
    "scene_07_atmospheric": {
        "fashion": 9, "home": 7, "digital": 8, "food": 6,
        "beauty": 10, "sports": 5, "general": 7,
    },
    "scene_08_comparison": {
        "fashion": 8, "home": 7, "digital": 9, "food": 7,
        "beauty": 8, "sports": 8, "general": 7,
    },
    "scene_09_review_social": {
        "fashion": 8, "home": 9, "digital": 8, "food": 9,
        "beauty": 9, "sports": 8, "general": 8,
    },
    "scene_10_brand_story": {
        "fashion": 9, "home": 8, "digital": 7, "food": 8,
        "beauty": 9, "sports": 7, "general": 7,
    },
    "scene_11_promo_poster": {
        "fashion": 9, "home": 8, "digital": 9, "food": 8,
        "beauty": 9, "sports": 9, "general": 8,
    },
}

# categoryenglish_text
CATEGORY_MAP = {
    # English → category key
    "fashion": "fashion", "clothing": "fashion", "apparel": "fashion",
    "bag": "fashion", "jewelry": "fashion", "accessory": "fashion",
    "shoe": "fashion", "watch": "fashion",
    "home": "home", "furniture": "home", "decor": "home",
    "kitchen": "home", "lighting": "home", "textile": "home",
    "digital": "digital", "electronics": "digital", "gadget": "digital",
    "phone": "digital", "computer": "digital", "camera": "digital",
    "food": "food", "beverage": "food", "snack": "food",
    "beauty": "beauty", "cosmetic": "beauty", "skincare": "beauty",
    "makeup": "beauty", "perfume": "beauty",
    "sports": "sports", "fitness": "sports", "outdoor": "sports",
    "gear": "sports",
}

# categoryEnglishtext
CATEGORY_CN = {
    "fashion": "english_text",
    "home": "english_text",
    "digital": "english_text",
    "food": "english_text",
    "beauty": "english_text",
    "sports": "english_text",
    "general": "text",
}

# scenetext
SCENE_INFO = {
    "scene_01_white_bg": {
        "name": "english_text",
        "name_en": "Clean White Background",
        "emotion": "text、text、english_text",
        "ecommerce_use": "text / searchenglish_text",
        "aspect_ratio": "1:1",
    },
    "scene_02_lifestyle": {
        "name": "english_textscene",
        "name_en": "Lifestyle Scene",
        "emotion": "text、text、english_text",
        "ecommerce_use": "text / english_text",
        "aspect_ratio": "4:3",
    },
    "scene_03_premium": {
        "name": "english_text",
        "name_en": "Premium Luxury",
        "emotion": "text、text、english_text",
        "ecommerce_use": "SKUtext / english_text",
        "aspect_ratio": "4:3",
    },
    "scene_04_in_use": {
        "name": "english_textscene",
        "name_en": "In Use / Action",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / english_text",
        "aspect_ratio": "4:3",
    },
    "scene_05_detail": {
        "name": "english_text",
        "name_en": "Detail Close-up",
        "emotion": "real、text、english_text",
        "ecommerce_use": "english_text / english_text",
        "aspect_ratio": "1:1",
    },
    "scene_06_seasonal": {
        "name": "english_text",
        "name_en": "Seasonal & Holiday",
        "emotion": "text、english_text、english_text",
        "ecommerce_use": "english_text / english_text",
        "aspect_ratio": "4:3",
    },
    "scene_07_atmospheric": {
        "name": "english_text",
        "name_en": "Atmospheric Light",
        "emotion": "english_text、english_text、text",
        "ecommerce_use": "english_text / english_text",
        "aspect_ratio": "4:3",
    },
    "scene_08_comparison": {
        "name": "english_text",
        "name_en": "Comparison & Set",
        "emotion": "text、text、english_text",
        "ecommerce_use": "text / english_text",
        "aspect_ratio": "16:9",
    },
    "scene_09_review_social": {
        "name": "userenglish_text",
        "name_en": "Social Proof",
        "emotion": "text、real、english_text",
        "ecommerce_use": "english_text / english_text",
        "aspect_ratio": "1:1",
    },
    "scene_10_brand_story": {
        "name": "english_text",
        "name_en": "Brand Story",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / text",
        "aspect_ratio": "16:9",
    },
    "scene_11_promo_poster": {
        "name": "english_textvisual",
        "name_en": "Promo Poster",
        "emotion": "english_text、text、english_text",
        "ecommerce_use": "textbanner / text / english_text",
        "aspect_ratio": "16:9",
    },
}


# ============================================================
# english_text
# ============================================================

def detect_category(profile: dict) -> str:
    """
    english_textautomaticdetectioncategory。
    english_text：category fields → keywordstext → english_text
    """
    # text category fieldsdetection
    category_raw = (profile.get("category") or "").lower().strip()
    if category_raw in CATEGORY_MAP:
        return CATEGORY_MAP[category_raw]

    # keywordstext
    text_to_search = (
        category_raw + " "
        + (profile.get("category_cn") or "") + " "
        + (profile.get("product_name") or "") + " "
        + (profile.get("product_name_cn") or "") + " "
        + (profile.get("style") or "") + " "
        + " ".join(profile.get("usage_scenarios", [])) + " "
        + " ".join(profile.get("materials", []))
    ).lower()

    for keyword, category in CATEGORY_MAP.items():
        if keyword in text_to_search:
            return category

    return "general"


def score_scenes(profile: dict, category: Optional[str] = None,
                 user_preferences: Optional[dict] = None) -> list[dict]:
    """
    text 10 textsceneenglish_text。

    text：
        profile: english_text
        category: textcategory（None textautomaticdetection）
        user_preferences: usertextdata（text ab_test_runner english_text）
            {"liked_scenes": {scene_id: count}, "disliked_scenes": {scene_id: count}, ...}

    text：
        [{"scene_id": "...", "score": 0-10, "reason": "..."}, ...]
        english_text
    """
    if category is None:
        category = detect_category(profile)

    # textusertext
    liked_scenes = set()
    disliked_scenes = set()
    if user_preferences:
        liked_scenes = set(user_preferences.get("liked_scenes", {}).keys())
        disliked_scenes = set(user_preferences.get("disliked_scenes", {}).keys())

    # english_text（textsceneenglish_text category english_text）
    results = []
    for scene_id, category_scores in CATEGORY_SCENE_SCORES.items():
        base_score = category_scores.get(category, category_scores.get("general", 7))
        info = SCENE_INFO.get(scene_id, {})

        # english_textkeywordsenglish_text
        emotion_bonus = 0
        product_emotions = [k.lower() for k in profile.get("emotion_keywords", [])]
        scene_emotion = (info.get("emotion", "")).lower()
        for kw in product_emotions:
            if kw in scene_emotion:
                emotion_bonus += 1

        # userenglish_text/text
        preference_bonus = 0.0
        if scene_id in liked_scenes:
            preference_bonus = 2.0  # userenglish_textscene+2text
        elif scene_id in disliked_scenes:
            preference_bonus = -3.0  # userenglish_textscene-3text

        # english_text（text10）
        final_score = min(10, max(0, base_score + emotion_bonus * 0.5 + preference_bonus))

        results.append({
            "scene_id": scene_id,
            "scene_name": info.get("name", scene_id),
            "scene_name_en": info.get("name_en", ""),
            "emotion": info.get("emotion", ""),
            "ecommerce_use": info.get("ecommerce_use", ""),
            "aspect_ratio": info.get("aspect_ratio", "1:1"),
            "base_score": base_score,
            "emotion_bonus": emotion_bonus * 0.5,
            "preference_bonus": round(preference_bonus, 1),
            "final_score": round(final_score, 1),
        })

    # english_text
    results.sort(key=lambda x: x["final_score"], reverse=True)
    return results


def select_top_scenes(
    profile: dict,
    count: int = 10,
    category: Optional[str] = None,
    skip: Optional[list[str]] = None,
    prefer: Optional[list[str]] = None,
    user_preferences: Optional[dict] = None,
) -> list[dict]:
    """
    english_text N textscene。

    text：
        count: english_textscenetext（text10）
        category: textcategory
        skip: english_textsceneIDtext
        prefer: english_textsceneIDtext（english_text）
        user_preferences: usertextdata（english_text）

    text：
        sceneenglish_text，english_text
    """
    skip = set(skip or [])
    prefer = prefer or []

    # english_textyesscenetext（textusertext）
    all_scored = score_scenes(profile, category, user_preferences)

    # english_textscene
    filtered = [s for s in all_scored if s["scene_id"] not in skip]

    # textsceneenglish_text
    preferred_scenes = []
    remaining = []
    preferred_set = set(prefer)
    for scene in filtered:
        if scene["scene_id"] in preferred_set:
            preferred_scenes.append(scene)
        else:
            remaining.append(scene)

    # text：text + english_text
    combined = preferred_scenes + remaining

    return combined[:count]


# ============================================================
# english_textoutput
# ============================================================

def print_scene_plan(scenes: list[dict], category: str):
    """textsceneenglish_text（text logger text Windows GBK english_text emoji texterror）"""
    cn_name = CATEGORY_CN.get(category, "text")
    logger.info("=" * 60)
    logger.info("scenetextplan（category: %s）", cn_name)
    logger.info("=" * 60)
    logger.info("%3s | %-16s | %-18s | %5s | %s", "#", "scene", "english_text", "text", "e-commercetext")
    logger.info("%s", "-" * 60)

    for i, s in enumerate(scenes, 1):
        stars = "*" * max(1, int(s["final_score"] / 2.5))
        logger.info(
            "%3d | %-16s | %-18s | %4.1f %s | %s",
            i, s["scene_name"], s["emotion"], s["final_score"], stars, s["ecommerce_use"],
        )

    logger.info("=" * 60)
    ratios = {}
    for s in scenes:
        r = s["aspect_ratio"]
        ratios[r] = ratios.get(r, 0) + 1
    ratio_text = " | ".join(f"{r}: {c}text" for r, c in sorted(ratios.items()))
    logger.info("english_text: %s", ratio_text)


# ============================================================
# english_text
# ============================================================

def build_scene_plan(
    profile_path: str,
    output: Optional[str] = None,
    category: Optional[str] = None,
    skip: Optional[list[str]] = None,
    prefer: Optional[list[str]] = None,
    count: int = 10,
    user_preferences: Optional[dict] = None,
) -> list[dict]:
    """
    textscenetext。

    text：
        profile_path: english_text
        output: outputtextfiletext（None english_text）
        category: category（None automaticdetection）
        skip: english_textsceneID
        prefer: english_textsceneID
        count: scenetext
        user_preferences: usertextdata（english_text）

    text：
        sceneenglish_text
    """
    # english_text
    with open(profile_path, "r", encoding="utf-8-sig") as f:
        profile = json.load(f)

    # english_textyestext user_preferences，english_textautomatictext
    if user_preferences is None:
        try:
            feedback_path = feedback_history_path()
            if os.path.exists(feedback_path):
                with open(feedback_path, "r", encoding="utf-8") as f:
                    fb_data = json.load(f)
                user_preferences = fb_data.get("preferences", {})
                import logging
                logging.getLogger(__name__).info("textautomatictextusertextdata，textsceneenglish_text")
        except Exception:
            user_preferences = {}

    # detectioncategory
    if category is None:
        category = detect_category(profile)

    product_name = profile.get("product_name", "english_text")
    logger.info(f"text: {product_name} | category: {CATEGORY_CN.get(category, category)}")

    # textscene（textusertext）
    scenes = select_top_scenes(
        profile=profile,
        count=count,
        category=category,
        skip=skip,
        prefer=prefer,
        user_preferences=user_preferences,
    )

    # text
    print_scene_plan(scenes, category)

    # english_text
    if output:
        plan = {
            "product_name": product_name,
            "category": category,
            "category_cn": CATEGORY_CN.get(category, "text"),
            "total_scenes": len(scenes),
            "scenes": scenes,
            "skipped": list(skip) if skip else [],
        }
        os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        logger.info("sceneenglish_text: %s", output)

    return scenes


def ensure_minimum_scenes(profile: dict, scenes: list[dict], minimum: int = 5) -> list[dict]:
    """english_text minimum textscene；english_text general categorytext。"""
    if len(scenes) >= minimum:
        return scenes
    fallback = select_top_scenes(profile, count=max(minimum, 10), category="general")
    seen = {s.get("scene_id") for s in scenes}
    for s in fallback:
        if s.get("scene_id") not in seen:
            scenes.append(s)
            seen.add(s.get("scene_id"))
        if len(scenes) >= minimum:
            break
    return scenes


def main():
    parser = argparse.ArgumentParser(
        description="sceneenglish_text — english_textcategoryautomaticenglish_text10textscene",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--profile", "-p", required=True, help="english_text JSON text")
    parser.add_argument("--output", "-o", default=None, help="scenetextoutputtext")
    parser.add_argument("--category", "-c", default=None,
                        choices=list(CATEGORY_CN.keys()),
                        help="textcategory（textautomaticdetection）")
    parser.add_argument("--skip", nargs="*", default=[],
                        help="english_textscene scene_id（text scene_06_seasonal scene_08_comparison）")
    parser.add_argument("--prefer", nargs="*", default=[],
                        help="textscene scene_id（english_text）")
    parser.add_argument("--count", type=int, default=10, help="scenetext（text10）")

    args = parser.parse_args()

    if not os.path.exists(args.profile):
        logger.error("english_text: %s", args.profile)
        sys.exit(1)

    try:
        build_scene_plan(
            profile_path=args.profile,
            output=args.output,
            category=args.category,
            skip=args.skip,
            prefer=args.prefer,
            count=args.count,
        )
    except Exception as e:
        logger.error("scenetextfailed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
