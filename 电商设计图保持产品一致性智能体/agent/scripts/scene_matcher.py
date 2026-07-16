#!/usr/bin/env python3
"""
场景智能匹配器 — Scene Matcher

功能：
  根据产品档案自动评分和推荐最适合的 10 个场景
  按产品类目（fashion/home/digital/food/beauty/sports）优化场景排序

用法：
  # 查看推荐
  python scene_matcher.py --profile product_profile.json

  # 输出匹配计划文件
  python scene_matcher.py --profile product_profile.json --output scene_plan.json

  # 自定义 - 排除某些场景
  python scene_matcher.py --profile product_profile.json --skip scene_06_seasonal scene_08_comparison

  # 指定类目（覆盖自动检测）
  python scene_matcher.py --profile product_profile.json --category fashion
"""

import argparse
import json
import os
import sys
from typing import Optional

# 使用公共工具模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.runtime_paths import get_runtime_paths
from common.utils import setup_logger

logger = setup_logger(__name__)


def feedback_history_path() -> str:
    return os.path.join(get_runtime_paths().memory, "feedback_history.json")

# ============================================================
# 类目 → 场景 评分矩阵 (0-10)
# ============================================================
# 每列是一个产品类目，每行是一个场景
# 评分依据：该场景对此类目产品的情绪传达效果和电商转化价值

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

# 类目名称映射
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

# 类目中文名
CATEGORY_CN = {
    "fashion": "服饰箱包",
    "home": "家居生活",
    "digital": "数码电子",
    "food": "食品饮料",
    "beauty": "美妆个护",
    "sports": "运动户外",
    "general": "通用",
}

# 场景信息
SCENE_INFO = {
    "scene_01_white_bg": {
        "name": "纯净白底主图",
        "name_en": "Clean White Background",
        "emotion": "干净、专业、聚焦产品",
        "ecommerce_use": "主图 / 搜索缩略图",
        "aspect_ratio": "1:1",
    },
    "scene_02_lifestyle": {
        "name": "生活方式场景",
        "name_en": "Lifestyle Scene",
        "emotion": "温暖、向往、代入感",
        "ecommerce_use": "主图 / 详情首图",
        "aspect_ratio": "4:3",
    },
    "scene_03_premium": {
        "name": "高端质感展示",
        "name_en": "Premium Luxury",
        "emotion": "奢华、精致、品质感",
        "ecommerce_use": "SKU图 / 品牌展示",
        "aspect_ratio": "4:3",
    },
    "scene_04_in_use": {
        "name": "使用中场景",
        "name_en": "In Use / Action",
        "emotion": "实用、动感、问题解决",
        "ecommerce_use": "详情页 / 功能展示",
        "aspect_ratio": "4:3",
    },
    "scene_05_detail": {
        "name": "材质细节特写",
        "name_en": "Detail Close-up",
        "emotion": "真实、可信、工艺感",
        "ecommerce_use": "详情页 / 品质展示",
        "aspect_ratio": "1:1",
    },
    "scene_06_seasonal": {
        "name": "季节节日限定",
        "name_en": "Seasonal & Holiday",
        "emotion": "应景、仪式感、限时感",
        "ecommerce_use": "活动图 / 促销图",
        "aspect_ratio": "4:3",
    },
    "scene_07_atmospheric": {
        "name": "色彩氛围光效",
        "name_en": "Atmospheric Light",
        "emotion": "氛围感、高级感、沉浸",
        "ecommerce_use": "详情页 / 品牌广告",
        "aspect_ratio": "4:3",
    },
    "scene_08_comparison": {
        "name": "对比组合展示",
        "name_en": "Comparison & Set",
        "emotion": "实用、完整、套装感",
        "ecommerce_use": "主图 / 规格选择",
        "aspect_ratio": "16:9",
    },
    "scene_09_review_social": {
        "name": "用户评价情感化",
        "name_en": "Social Proof",
        "emotion": "好评、真实、社交证明",
        "ecommerce_use": "评价区 / 社交广告",
        "aspect_ratio": "1:1",
    },
    "scene_10_brand_story": {
        "name": "品牌故事理念",
        "name_en": "Brand Story",
        "emotion": "认同、调性、价值观",
        "ecommerce_use": "品牌页 / 广告",
        "aspect_ratio": "16:9",
    },
    "scene_11_promo_poster": {
        "name": "宣传海报主视觉",
        "name_en": "Promo Poster",
        "emotion": "冲击力、渴望、大促氛围",
        "ecommerce_use": "首页banner / 大促 / 站外投放",
        "aspect_ratio": "16:9",
    },
}


# ============================================================
# 核心逻辑
# ============================================================

def detect_category(profile: dict) -> str:
    """
    从产品档案自动检测类目。
    依次检查：category 字段 → 关键词匹配 → 默认通用
    """
    # 从 category 字段检测
    category_raw = (profile.get("category") or "").lower().strip()
    if category_raw in CATEGORY_MAP:
        return CATEGORY_MAP[category_raw]

    # 关键词匹配
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
    对 10 个场景评分和排序。

    参数：
        profile: 产品档案
        category: 指定类目（None 则自动检测）
        user_preferences: 用户偏好数据（从 ab_test_runner 的反馈学习系统获取）
            {"liked_scenes": {scene_id: count}, "disliked_scenes": {scene_id: count}, ...}

    返回：
        [{"scene_id": "...", "score": 0-10, "reason": "..."}, ...]
        按评分降序排列
    """
    if category is None:
        category = detect_category(profile)

    # 加载用户偏好
    liked_scenes = set()
    disliked_scenes = set()
    if user_preferences:
        liked_scenes = set(user_preferences.get("liked_scenes", {}).keys())
        disliked_scenes = set(user_preferences.get("disliked_scenes", {}).keys())

    # 基础评分（每个场景对当前 category 的分数）
    results = []
    for scene_id, category_scores in CATEGORY_SCENE_SCORES.items():
        base_score = category_scores.get(category, category_scores.get("general", 7))
        info = SCENE_INFO.get(scene_id, {})

        # 从情绪关键词匹配加分
        emotion_bonus = 0
        product_emotions = [k.lower() for k in profile.get("emotion_keywords", [])]
        scene_emotion = (info.get("emotion", "")).lower()
        for kw in product_emotions:
            if kw in scene_emotion:
                emotion_bonus += 1

        # 用户偏好加分/减分
        preference_bonus = 0.0
        if scene_id in liked_scenes:
            preference_bonus = 2.0  # 用户喜欢的场景+2分
        elif scene_id in disliked_scenes:
            preference_bonus = -3.0  # 用户不喜欢的场景-3分

        # 最终评分（满分10）
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

    # 按分数降序
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
    选择最佳的 N 个场景。

    参数：
        count: 需要的场景数（默认10）
        category: 指定类目
        skip: 要跳过的场景ID列表
        prefer: 优先选择的场景ID列表（强制包含）
        user_preferences: 用户偏好数据（反馈学习注入）

    返回：
        场景计划列表，保持推荐的顺序
    """
    skip = set(skip or [])
    prefer = prefer or []

    # 获取所有场景评分（注入用户偏好）
    all_scored = score_scenes(profile, category, user_preferences)

    # 排除跳过的场景
    filtered = [s for s in all_scored if s["scene_id"] not in skip]

    # 优先场景强制排到前面
    preferred_scenes = []
    remaining = []
    preferred_set = set(prefer)
    for scene in filtered:
        if scene["scene_id"] in preferred_set:
            preferred_scenes.append(scene)
        else:
            remaining.append(scene)

    # 组合：优先 + 剩余中最优的
    combined = preferred_scenes + remaining

    return combined[:count]


# ============================================================
# 可视化输出
# ============================================================

def print_scene_plan(scenes: list[dict], category: str):
    """打印场景计划表（使用 logger 避免 Windows GBK 控制台 emoji 编码错误）"""
    cn_name = CATEGORY_CN.get(category, "通用")
    logger.info("=" * 60)
    logger.info("场景推荐方案（类目: %s）", cn_name)
    logger.info("=" * 60)
    logger.info("%3s | %-16s | %-18s | %5s | %s", "#", "场景", "情绪价值", "评分", "电商用途")
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
    ratio_text = " | ".join(f"{r}: {c}张" for r, c in sorted(ratios.items()))
    logger.info("比例分布: %s", ratio_text)


# ============================================================
# 主入口
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
    构建场景计划。

    参数：
        profile_path: 产品档案路径
        output: 输出计划文件路径（None 不保存）
        category: 类目（None 自动检测）
        skip: 排除的场景ID
        prefer: 优先的场景ID
        count: 场景数量
        user_preferences: 用户偏好数据（反馈学习注入）

    返回：
        场景计划列表
    """
    # 加载产品档案
    with open(profile_path, "r", encoding="utf-8-sig") as f:
        profile = json.load(f)

    # 如果没有传入 user_preferences，尝试从反馈系统自动加载
    if user_preferences is None:
        try:
            feedback_path = feedback_history_path()
            if os.path.exists(feedback_path):
                with open(feedback_path, "r", encoding="utf-8") as f:
                    fb_data = json.load(f)
                user_preferences = fb_data.get("preferences", {})
                import logging
                logging.getLogger(__name__).info("已自动加载用户偏好数据，用于场景排序调优")
        except Exception:
            user_preferences = {}

    # 检测类目
    if category is None:
        category = detect_category(profile)

    product_name = profile.get("product_name", "未知产品")
    logger.info(f"产品: {product_name} | 类目: {CATEGORY_CN.get(category, category)}")

    # 选择场景（注入用户偏好）
    scenes = select_top_scenes(
        profile=profile,
        count=count,
        category=category,
        skip=skip,
        prefer=prefer,
        user_preferences=user_preferences,
    )

    # 打印
    print_scene_plan(scenes, category)

    # 保存计划
    if output:
        plan = {
            "product_name": product_name,
            "category": category,
            "category_cn": CATEGORY_CN.get(category, "通用"),
            "total_scenes": len(scenes),
            "scenes": scenes,
            "skipped": list(skip) if skip else [],
        }
        os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        logger.info("场景计划已保存: %s", output)

    return scenes


def ensure_minimum_scenes(profile: dict, scenes: list[dict], minimum: int = 5) -> list[dict]:
    """保证至少 minimum 个场景；不足时用 general 类目补齐。"""
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
        description="场景智能匹配器 — 根据产品类目自动推荐最佳10个场景",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--profile", "-p", required=True, help="产品档案 JSON 路径")
    parser.add_argument("--output", "-o", default=None, help="场景计划输出路径")
    parser.add_argument("--category", "-c", default=None,
                        choices=list(CATEGORY_CN.keys()),
                        help="产品类目（默认自动检测）")
    parser.add_argument("--skip", nargs="*", default=[],
                        help="排除的场景 scene_id（如 scene_06_seasonal scene_08_comparison）")
    parser.add_argument("--prefer", nargs="*", default=[],
                        help="优先场景 scene_id（强制排在前）")
    parser.add_argument("--count", type=int, default=10, help="场景数量（默认10）")

    args = parser.parse_args()

    if not os.path.exists(args.profile):
        logger.error("产品档案不存在: %s", args.profile)
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
        logger.error("场景匹配失败: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
