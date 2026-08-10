#!/usr/bin/env python3
"""
A/B 测试与反馈学习系统

AB Test Runner: 对同一场景生成多个变体，并排对比
Feedback Learner: 记录用户偏好，学习规律，优化后续生成

用法：
  # A/B 测试：对场景1-3各生成2个变体
  python ab_test_runner.py \
    --profile profile.json \
    --images product.jpg \
    --variants 2 \
    --scenes scene_01_white_bg scene_02_lifestyle scene_03_premium

  # 记录反馈
  python ab_test_runner.py \
    --feedback \
    --liked scene_02_lifestyle.jpg \
    --disliked scene_07_atmospheric.jpg

  # 查看学习结果
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

# 使用公共工具模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.runtime_paths import get_runtime_paths
from common.utils import setup_logger, get_api_key
logger = setup_logger(__name__)


# ============================================================
# 反馈存储
# ============================================================

FEEDBACK_DIR = get_runtime_paths().memory
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, "feedback_history.json")


def _ensure_feedback():
    """确保反馈目录和文件存在"""
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
    记录用户对图片的偏好反馈。

    参数:
        product_name: 产品名称（可选）
        liked: 用户喜欢的图片路径列表
        disliked: 用户不喜欢的图片路径列表
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

    # 更新偏好统计
    # 优先用 scene_details 中的 scene_id；否则从文件名推导出 scene_id
    # 文件名格式：scene_01_white_bg.jpg → scene_01_white_bg
    def _derive_scene_id(path: str, details: dict) -> str:
        if details.get("scene_id"):
            return details["scene_id"]
        fname = os.path.splitext(os.path.basename(path))[0]
        # 如果文件名以 scene_ 开头则直接是 scene_id
        if fname.startswith("scene_"):
            return fname
        return fname  # 否则用去掉后缀的文件名兜底

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

    logger.info(f"  ✅ 反馈已记录:")
    if liked:
        logger.info(f"     👍 喜欢: {len(liked)} 张")
    if disliked:
        logger.info(f"     👎 不喜欢: {len(disliked)} 张")


def get_user_preferences() -> dict:
    """获取用户偏好统计"""
    data = _load_feedback()
    prefs = data["preferences"]

    # 计算净偏好
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
    """显示用户偏好"""
    prefs = get_user_preferences()

    logger.info(f"\n📊 用户偏好学习报告")
    logger.info(f"{'='*50}")
    logger.info(f"  总反馈次数: {prefs['total_feedback']}")
    logger.info(f"  总会话数:   {prefs['total_sessions']}")
    logger.info(f"{'='*50}")

    if prefs["scene_preferences"]:
        logger.info(f"\n  场景偏好:")
        logger.info(f"  {'场景':<25} {'喜欢':>5} {'不喜欢':>5} {'偏好率':>8}")
        logger.info(f"  {'-'*25} {'-'*5} {'-'*5} {'-'*8}")
        for scene_id, score in sorted(
            prefs["scene_preferences"].items(),
            key=lambda x: x[1]["ratio"],
            reverse=True,
        ):
            logger.info(f"  {scene_id:<25} {score['liked']:>5} {score['disliked']:>5} {score['ratio']:>7.1f}%")

    if prefs["emotion_preferences"]["liked"]:
        logger.info(f"\n  情绪偏好（喜欢 Top 5）:")
        for emotion, count in list(prefs["emotion_preferences"]["liked"].items())[:5]:
            logger.info(f"    👍 {emotion}: {count} 次")

    if prefs["emotion_preferences"]["disliked"]:
        logger.info(f"\n  情绪偏好（不喜欢 Top 5）:")
        for emotion, count in list(prefs["emotion_preferences"]["disliked"].items())[:5]:
            logger.info(f"    👎 {emotion}: {count} 次")


def get_recommendation() -> dict:
    """根据用户偏好推荐场景排序"""
    prefs = get_user_preferences()
    scene_scores = {}

    for scene_id, score in prefs["scene_preferences"].items():
        # 偏好率 + 样本量加权
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
# A/B 测试生成
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
    对指定场景生成多个变体，方便 A/B 对比。

    每个场景生成 variants 个不同的版本，放置在同名目录下。
    """
    from generate_batch import (
        load_product_profile, load_scene_template,
        inject_variables, generate_with_retry,
    )

    os.makedirs(output_dir, exist_ok=True)

    profile = load_product_profile(profile_path)
    scene_dir = os.path.join(os.path.dirname(__file__), "..", "templates", "scenes")

    logger.info(f"\n🧪 A/B 测试生成")
    logger.info(f"  场景: {len(scene_ids)} 个 × {variants} 个变体 = {len(scene_ids) * variants} 张")
    logger.info(f"{'='*50}")

    all_results = []
    for scene_id in scene_ids:
        scene_path = os.path.join(scene_dir, f"{scene_id}.json")
        if not os.path.exists(scene_path):
            logger.warning(f"  ⚠️ 场景不存在: {scene_id}")
            continue

        template = load_scene_template(scene_path)
        scene_name = template.get("scene_name_cn", scene_id)

        # 为每个变体使用不同的 seed hint（通过 extra_vars 传递风格调整）
        for v in range(variants):
            style_variations = [
                {},  # 原始版本
                {"_style_hint": "slightly warmer tones, more dramatic lighting"},
                {"_style_hint": "brighter, more vibrant colors, airy feel"},
            ]

            extra_vars = style_variations[v % len(style_variations)]
            output_path = os.path.join(output_dir, scene_id, f"variant_{v+1:02d}.jpg")

            logger.info(f"  🎨 {scene_name} — 变体 {v+1}/{variants}")

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

    # 输出 A/B 目录
    logger.info(f"\n  📁 A/B 测试输出: {output_dir}")
    for scene_id in scene_ids:
        scene_dir_out = os.path.join(output_dir, scene_id)
        if os.path.exists(scene_dir_out):
            files = sorted(os.listdir(scene_dir_out))
            logger.info(f"    {scene_id}/: {', '.join(files)}")

    # 生成对比 HTML
    _generate_ab_html(output_dir, scene_ids, variants)

    return all_results


def _generate_ab_html(output_dir: str, scene_ids: list[str], variants: int):
    """生成 A/B 对比预览 HTML"""
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
                # 使用相对路径或 data URI
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
    logger.info(f"  📄 A/B 对比页面: {index_path}")


# ============================================================
# CLI入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="🧪 A/B 测试与反馈学习系统")

    subparsers = parser.add_subparsers(dest="command")

    # AB 测试
    ab_parser = subparsers.add_parser("ab-test", help="生成 A/B 变体")
    ab_parser.add_argument("--profile", required=True)
    ab_parser.add_argument("--images", nargs="+", required=True)
    ab_parser.add_argument("--output", "-o", default="./ab_test_results")
    ab_parser.add_argument("--scenes", nargs="+", default=DEFAULT_SCENES)
    ab_parser.add_argument("--variants", type=int, default=2)
    ab_parser.add_argument("--engine", default="gemini")

    # 反馈
    feedback_parser = subparsers.add_parser("feedback", help="记录用户反馈")
    feedback_parser.add_argument("--liked", nargs="*", default=[])
    feedback_parser.add_argument("--disliked", nargs="*", default=[])
    feedback_parser.add_argument("--product", default="")

    # 偏好
    subparsers.add_parser("show", help="显示用户偏好")

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


# 为 ab-test 子命令提供默认场景列表
DEFAULT_SCENES = [
    "scene_01_white_bg", "scene_02_lifestyle", "scene_03_premium",
    "scene_04_in_use", "scene_05_detail",
]


if __name__ == "__main__":
    main()
