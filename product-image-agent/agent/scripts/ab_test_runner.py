#!/usr/bin/env python3
"""
A/B english_text

AB Test Runner: english_textscenegenerationenglish_text，english_text
Feedback Learner: textusertext，english_text，english_textgeneration

text：
  # A/B text：textscene1-3textgeneration2english_text
  python ab_test_runner.py \
    --profile profile.json \
    --images product.jpg \
    --variants 2 \
    --scenes scene_01_white_bg scene_02_lifestyle scene_03_premium

  # english_text
  python ab_test_runner.py \
    --feedback \
    --liked scene_02_lifestyle.jpg \
    --disliked scene_07_atmospheric.jpg

  # english_text
  python ab_test_runner.py \
    --show-preferences
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Optional

# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.runtime_paths import get_runtime_paths
from common.utils import setup_logger, get_api_key
logger = setup_logger(__name__)


# ============================================================
# english_text
# ============================================================

FEEDBACK_DIR = get_runtime_paths().memory
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, "feedback_history.json")


def _ensure_feedback():
    """english_textfiletext"""
    os.makedirs(FEEDBACK_DIR, exist_ok=True)
    if not os.path.exists(FEEDBACK_FILE):
        with open(FEEDBACK_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "sessions": [],
                "preferences": {
                    "liked_scenes": {},      # {scene_id: count}
                    "disliked_scenes": {},    # {scene_id: count}
                    "liked_emotions": {},     # {emotion: count}
                    "disliked_emotions": {},
                    "liked_styles": {},       # {style_keyword: count}
                    "disliked_styles": {},
                    "preferred_engine": {},   # {engine: count}
                },
                "last_updated": datetime.now().isoformat(),
            }, f, ensure_ascii=False, indent=2)


def _load_feedback() -> dict:
    _ensure_feedback()
    with open(FEEDBACK_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_feedback(data: dict):
    data["last_updated"] = datetime.now().isoformat()
    with open(FEEDBACK_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def record_feedback(
    product_name: str = "",
    liked: list[str] = None,
    disliked: list[str] = None,
    scene_details: dict = None,
):
    """
    textusertextimageenglish_text。

    text:
        product_name: english_text（text）
        liked: userenglish_textimageenglish_text
        disliked: userenglish_textimageenglish_text
        scene_details: {file_name: {scene_id, emotion, style}}
    """
    data = _load_feedback()
    scene_details = scene_details or {}
    prefs = data["preferences"]

    session = {
        "timestamp": datetime.now().isoformat(),
        "product": product_name,
        "liked": [os.path.basename(p) for p in (liked or [])],
        "disliked": [os.path.basename(p) for p in (disliked or [])],
    }

    # english_text
    # english_text scene_details text scene_id；notextfileenglish_text scene_id
    # fileenglish_text：scene_01_white_bg.jpg → scene_01_white_bg
    def _derive_scene_id(path: str, details: dict) -> str:
        if details.get("scene_id"):
            return details["scene_id"]
        fname = os.path.splitext(os.path.basename(path))[0]
        # textfiletext scene_ english_textyes scene_id
        if fname.startswith("scene_"):
            return fname
        return fname  # noenglish_textfileenglish_text

    for liked_path in (liked or []):
        fname = os.path.basename(liked_path)
        details = scene_details.get(fname, {})
        scene_id = _derive_scene_id(liked_path, details)
        prefs["liked_scenes"][scene_id] = prefs["liked_scenes"].get(scene_id, 0) + 1
        emotion = details.get("emotion", "")
        if emotion:
            prefs["liked_emotions"][emotion] = prefs["liked_emotions"].get(emotion, 0) + 1

    for disliked_path in (disliked or []):
        fname = os.path.basename(disliked_path)
        details = scene_details.get(fname, {})
        scene_id = _derive_scene_id(disliked_path, details)
        prefs["disliked_scenes"][scene_id] = prefs["disliked_scenes"].get(scene_id, 0) + 1
        emotion = details.get("emotion", "")
        if emotion:
            prefs["disliked_emotions"][emotion] = prefs["disliked_emotions"].get(emotion, 0) + 1

    data["sessions"].append(session)
    _save_feedback(data)

    logger.info(f"  ✅ english_text:")
    if liked:
        logger.info(f"     👍 text: {len(liked)} text")
    if disliked:
        logger.info(f"     👎 english_text: {len(disliked)} text")


def get_user_preferences() -> dict:
    """textuserenglish_text"""
    data = _load_feedback()
    prefs = data["preferences"]

    # english_text
    net = {}
    all_scenes = set(list(prefs["liked_scenes"].keys()) + list(prefs["disliked_scenes"].keys()))
    for scene_id in all_scenes:
        liked = prefs["liked_scenes"].get(scene_id, 0)
        disliked = prefs["disliked_scenes"].get(scene_id, 0)
        total = liked + disliked
        if total > 0:
            net[scene_id] = {
                "liked": liked,
                "disliked": disliked,
                "ratio": round(liked / total * 100, 1) if total > 0 else 0,
            }

    return {
        "total_sessions": len(data["sessions"]),
        "total_feedback": sum(
            len(s["liked"]) + len(s["disliked"]) for s in data["sessions"]
        ),
        "scene_preferences": net,
        "emotion_preferences": {
            "liked": dict(sorted(prefs["liked_emotions"].items(), key=lambda x: -x[1])),
            "disliked": dict(sorted(prefs["disliked_emotions"].items(), key=lambda x: -x[1])),
        },
        "raw": prefs,
    }


def show_preferences():
    """textusertext"""
    prefs = get_user_preferences()

    logger.info(f"\n📊 userenglish_textreport")
    logger.info(f"{'='*50}")
    logger.info(f"  english_text: {prefs['total_feedback']}")
    logger.info(f"  english_text:   {prefs['total_sessions']}")
    logger.info(f"{'='*50}")

    if prefs["scene_preferences"]:
        logger.info(f"\n  scenetext:")
        logger.info(f"  {'scene':<25} {'text':>5} {'english_text':>5} {'english_text':>8}")
        logger.info(f"  {'-'*25} {'-'*5} {'-'*5} {'-'*8}")
        for scene_id, score in sorted(
            prefs["scene_preferences"].items(),
            key=lambda x: x[1]["ratio"],
            reverse=True,
        ):
            logger.info(f"  {scene_id:<25} {score['liked']:>5} {score['disliked']:>5} {score['ratio']:>7.1f}%")

    if prefs["emotion_preferences"]["liked"]:
        logger.info(f"\n  english_text（text Top 5）:")
        for emotion, count in list(prefs["emotion_preferences"]["liked"].items())[:5]:
            logger.info(f"    👍 {emotion}: {count} text")

    if prefs["emotion_preferences"]["disliked"]:
        logger.info(f"\n  english_text（english_text Top 5）:")
        for emotion, count in list(prefs["emotion_preferences"]["disliked"].items())[:5]:
            logger.info(f"    👎 {emotion}: {count} text")


def get_recommendation() -> dict:
    """textuserenglish_textscenetext"""
    prefs = get_user_preferences()
    scene_scores = {}

    for scene_id, score in prefs["scene_preferences"].items():
        # english_text + english_text
        weighted = score["ratio"] * 0.7 + min(100, score["liked"] * 20) * 0.3
        scene_scores[scene_id] = {
            "score": round(weighted, 1),
            "ratio": score["ratio"],
            "sample_count": score["liked"] + score["disliked"],
        }

    return {
        "total_feedback": prefs["total_feedback"],
        "recommended_scenes": dict(
            sorted(scene_scores.items(), key=lambda x: -x[1]["score"])
        ),
    }


# ============================================================
# A/B textgeneration
# ============================================================

def generate_ab_variants(
    profile_path: str,
    reference_images: list[str],
    output_dir: str,
    scene_ids: list[str],
    variants: int = 2,
    engine: str = "gemini",
    api_key: str = "",
):
    """
    english_textscenegenerationenglish_text，text A/B text。

    textscenegeneration variants english_text，english_text。
    """
    from generate_batch import (
        load_product_profile, load_scene_template,
        inject_variables, generate_with_retry,
    )

    os.makedirs(output_dir, exist_ok=True)

    profile = load_product_profile(profile_path)
    scene_dir = os.path.join(os.path.dirname(__file__), "..", "templates", "scenes")

    logger.info(f"\n🧪 A/B textgeneration")
    logger.info(f"  scene: {len(scene_ids)} text × {variants} english_text = {len(scene_ids) * variants} text")
    logger.info(f"{'='*50}")

    all_results = []
    for scene_id in scene_ids:
        scene_path = os.path.join(scene_dir, f"{scene_id}.json")
        if not os.path.exists(scene_path):
            logger.warning(f"  ⚠️ sceneenglish_text: {scene_id}")
            continue

        template = load_scene_template(scene_path)
        scene_name = template.get("scene_name_cn", scene_id)

        # english_text seed hint（passed extra_vars english_text）
        for v in range(variants):
            style_variations = [
                {},  # english_text
                {"_style_hint": "slightly warmer tones, more dramatic lighting"},
                {"_style_hint": "brighter, more vibrant colors, airy feel"},
            ]

            extra_vars = style_variations[v % len(style_variations)]
            output_path = os.path.join(output_dir, scene_id, f"variant_{v+1:02d}.jpg")

            logger.info(f"  🎨 {scene_name} — text {v+1}/{variants}")

            result = generate_with_retry(
                scene_template=template,
                product=profile,
                reference_images=reference_images,
                output_file=output_path,
                engine=engine,
                api_key=api_key or os.getenv(f"{engine.upper()}_API_KEY", ""),
                extra_vars=extra_vars,
            )
            result["variant"] = v + 1
            all_results.append(result)
            logger.info(f"  {'✅' if result['success'] else '❌'}")

    # output A/B text
    logger.info(f"\n  📁 A/B textoutput: {output_dir}")
    for scene_id in scene_ids:
        scene_dir_out = os.path.join(output_dir, scene_id)
        if os.path.exists(scene_dir_out):
            files = sorted(os.listdir(scene_dir_out))
            logger.info(f"    {scene_id}/: {', '.join(files)}")

    # generationtext HTML
    _generate_ab_html(output_dir, scene_ids, variants)

    return all_results


def _generate_ab_html(output_dir: str, scene_ids: list[str], variants: int):
    """generation A/B english_text HTML"""
    os.makedirs(output_dir, exist_ok=True)
    html = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        "<title>A/B Test Comparison</title>",
        "<style>",
        "body{font-family:sans-serif;max-width:1200px;margin:0 auto;padding:20px;background:#f5f5f5}",
        "h1{color:#333;text-align:center}",
        ".scene-group{margin:30px 0;background:white;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}",
        ".scene-group h2{color:#444;margin-top:0}",
        ".variants{display:flex;gap:20px;flex-wrap:wrap}",
        ".variant{flex:1;min-width:300px;text-align:center}",
        ".variant img{width:100%;max-width:400px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.15)}",
        ".variant .label{font-size:14px;color:#666;margin-top:8px}",
        ".variant .vote-btn{display:inline-block;margin:4px;padding:6px 16px;border-radius:20px;border:none;cursor:pointer;font-size:14px}",
        ".vote-btn.like{background:#4CAF50;color:white}",
        ".vote-btn.dislike{background:#f44336;color:white}",
        "</style></head><body>",
        f"<h1>🧪 A/B Test — {len(scene_ids)} Scenes × {variants} Variants</h1>",
    ]

    for scene_id in scene_ids:
        html.append(f"<div class='scene-group'>")
        html.append(f"<h2>{scene_id}</h2><div class='variants'>")

        for v in range(variants):
            img_path = os.path.join(scene_id, f"variant_{v+1:02d}.jpg")
            abs_img_path = os.path.join(output_dir, scene_id, f"variant_{v+1:02d}.jpg")
            if os.path.exists(abs_img_path):
                # english_text data URI
                import base64
                with open(abs_img_path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("utf-8")
                data_uri = f"data:image/jpeg;base64,{b64}"
                html.append(f"<div class='variant'>")
                html.append(f"<img src='{data_uri}' alt='Variant {v+1}'>")
                html.append(f"<div class='label'>Variant {v+1}</div>")
                html.append(f"<button class='vote-btn like' onclick=\"alert('Liked variant {v+1}')\">👍</button>")
                html.append(f"<button class='vote-btn dislike' onclick=\"alert('Disliked variant {v+1}')\">👎</button>")
                html.append(f"</div>")

        html.append("</div></div>")

    html.append("</body></html>")

    index_path = os.path.join(output_dir, "index.html")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html))
    logger.info(f"  📄 A/B english_text: {index_path}")


# ============================================================
# CLItext
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="🧪 A/B english_text")

    subparsers = parser.add_subparsers(dest="command")

    # AB text
    ab_parser = subparsers.add_parser("ab-test", help="generation A/B text")
    ab_parser.add_argument("--profile", required=True)
    ab_parser.add_argument("--images", nargs="+", required=True)
    ab_parser.add_argument("--output", "-o", default="./ab_test_results")
    ab_parser.add_argument("--scenes", nargs="+", default=DEFAULT_SCENES)
    ab_parser.add_argument("--variants", type=int, default=2)
    ab_parser.add_argument("--engine", default="gemini")

    # text
    feedback_parser = subparsers.add_parser("feedback", help="textusertext")
    feedback_parser.add_argument("--liked", nargs="*", default=[])
    feedback_parser.add_argument("--disliked", nargs="*", default=[])
    feedback_parser.add_argument("--product", default="")

    # text
    subparsers.add_parser("show", help="textusertext")

    args = parser.parse_args()

    if args.command == "ab-test":
        generate_ab_variants(
            profile_path=args.profile,
            reference_images=args.images,
            output_dir=args.output,
            scene_ids=args.scenes,
            variants=args.variants,
            engine=args.engine,
        )

    elif args.command == "feedback":
        record_feedback(
            product_name=args.product,
            liked=args.liked,
            disliked=args.disliked,
        )

    elif args.command == "show":
        show_preferences()

    else:
        parser.print_help()


# text ab-test english_textscenetext
DEFAULT_SCENES = [
    "scene_01_white_bg", "scene_02_lifestyle", "scene_03_premium",
    "scene_04_in_use", "scene_05_detail",
]


if __name__ == "__main__":
    main()
