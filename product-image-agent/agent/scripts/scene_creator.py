#!/usr/bin/env python3
"""
LLM 场景创意器 — Scene Creator

根据产品档案自动生成具有情绪价值的场景描述、文案和完整 prompt。
支持 Gemini API（默认）和 Agent 辅助两种模式。

功能：
  - 分析产品特征，创作10个差异化场景文案
  - 每个场景包含：情绪定位、视觉描述、卖点文案
  - 输出可直接注入场景模板的完整 prompt

用法：
  python scene_creator.py \
    --profile product_profile.json \
    --output scene_descriptions.json \
    --engine gemini
"""

import argparse
import json
import os
import sys
import time
from typing import Optional

# 使用公共工具模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import parse_json_response, setup_logger, get_api_key

logger = setup_logger(__name__)

# ============================================================
# Prompt 模板
# ============================================================

SCENE_CREATION_SYSTEM_PROMPT = """You are a professional e-commerce creative director and copywriter.
Your specialty is creating emotionally compelling product scene descriptions that drive conversion.

For each product, you design 10 distinct lifestyle scenes, each conveying a different emotion.
Every scene must keep the product as the hero and maintain visual consistency.

Output rules:
- Each scene has a unique emotional angle
- Descriptions are vivid, sensory, and specific
- English for AI image generation prompts
- Chinese for user-facing copy
- Product must look identical in every scene"""

SCENE_CREATION_PROMPT = """Create 10 emotionally compelling e-commerce product scenes for this product:

Product Profile:
{product_json}

For each of the 10 scenes, define:
1. scene_id: unique identifier
2. name: Scene name in Chinese
3. name_en: Scene name in English
4. emotion: What emotion this scene conveys (e.g., "trust", "desire", "aspiration")
5. emotion_description: 1-2 sentences describing the emotional feeling
6. visual_prompt: Detailed English visual prompt (2-3 paragraphs) describing:
   - The setting, lighting, composition
   - How the product appears in this scene
   - The mood and atmosphere
   - Specific color palette and lighting style
7. copy: Short Chinese marketing copy for this scene (15-30 chars)
8. copy_en: Short English marketing copy
9. style_keywords: ["keyword1", "keyword2"] for image generation style

Requirements:
- All 10 scenes must look DIFFERENT from each other
- Each scene must have a UNIQUE emotional angle
- The product must be described CONSISTENTLY across all scenes
- Write "visual_prompt" in DETAILED English suitable for AI image generation
- Cover diverse settings: studio, lifestyle, detail, action, seasonal, etc.

Output JSON format:
{
  "product_name": "...",
  "scenes": [
    {
      "scene_id": "custom_01",
      "name": "场景名",
      "name_en": "Scene Name",
      "emotion": "emotion_keyword",
      "emotion_description": "Emotion in words",
      "visual_prompt": "...",
      "copy": "营销文案",
      "copy_en": "marketing copy",
      "style_keywords": ["kw1", "kw2"]
    }
  ]
}

Output ONLY valid JSON, no markdown, no explanation."""


# ============================================================
# LLM 调用
# ============================================================

def create_scenes_via_gemini(product_profile: dict, api_key: str) -> dict:
    """通过 Gemini 生成场景创意"""
    import requests

    prompt_text = SCENE_CREATION_PROMPT.format(
        product_json=json.dumps(product_profile, ensure_ascii=False, indent=2)
    )

    resp = requests.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": SCENE_CREATION_SYSTEM_PROMPT}]},
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {
                "temperature": 0.8,
                "topP": 0.95,
                "maxOutputTokens": 8192,
            },
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    text = ""
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "text" in part:
            text += part["text"]
    return _parse_json_response(text, product_profile)


def create_scenes_via_agent(product_profile: dict) -> str:
    """生成供 AI 助手使用的场景创作 prompt"""
    return (
        f"# 场景创作任务\n\n"
        f"请为以下产品创作10个具有情绪价值的电商场景。\n\n"
        f"## 产品档案\n```json\n{json.dumps(product_profile, ensure_ascii=False, indent=2)}\n```\n\n"
        f"对于每个场景，提供：scene_id、name(中文)、name_en(英文)、emotion(情绪)、emotion_description(情绪描述)、"
        f"visual_prompt(用于AI生图的详细英文视觉描述)、copy(中文营销文案)、copy_en(英文文案)、style_keywords(风格关键词)。\n\n"
        f"要求：\n"
        f"1. 10个场景的情绪必须差异化\n"
        f"2. 产品描述在所有场景中保持一致\n"
        f"3. visual_prompt 用英文详细描述场景、光线、构图、氛围\n"
        f"4. copy 用中文，简练有力\n\n"
        f"请直接输出 JSON 格式。"
    )


def _parse_json_response(text: str, product: dict) -> dict:
    """解析 LLM 响应（委托公共模块）"""
    result = parse_json_response(text)

    # 确保 scenes 字段存在
    if "scenes" not in result:
        result["scenes"] = []

    # 为每个场景补充 product 引用
    for scene in result["scenes"]:
        scene["_product_name"] = product.get("product_name", "")

    return result


# ============================================================
# 场景合并工具
# ============================================================

def merge_to_templates(scene_creations: dict, template_dir: str) -> list[dict]:
    """
    将 LLM 创作的场景合并为标准模板格式（用于 generate_batch.py）。
    返回场景计划列表（与 scene_matcher.py 兼容）。
    """
    scenes = scene_creations.get("scenes", [])
    scene_plan = []
    for i, scene in enumerate(scenes):
        scene_plan.append({
            "scene_id": scene.get("scene_id", f"custom_scene_{i+1:02d}"),
            "scene_name": scene.get("name", f"场景{i+1}"),
            "scene_name_en": scene.get("name_en", ""),
            "emotion": scene.get("emotion", ""),
            "emotion_description": scene.get("emotion_description", ""),
            "ecommerce_use": "自定义场景",
            "aspect_ratio": "4:3",
            "final_score": 10.0,
        })
    return scene_plan


def merge_to_prompt_files(scene_creations: dict, output_dir: str):
    """
    将 LLM 创作的场景保存为标准 JSON prompt 文件。
    每个场景保存为 {scene_id}.json，可直接被 generate_batch.py 读取。
    """
    scenes = scene_creations.get("scenes", [])
    for scene in scenes:
        scene_id = scene.get("scene_id", "custom_scene")
        prompt = {
            "scene_id": scene_id,
            "scene_name": scene.get("name", ""),
            "scene_name_cn": scene.get("name", ""),
            "emotion": scene.get("emotion_description", scene.get("emotion", "")),
            "prompt": scene.get("visual_prompt", ""),
            "style": ", ".join(scene.get("style_keywords", [])),
            "composition": "Creative composition matching the emotional tone of the scene",
            "lighting": "Mood-appropriate lighting that enhances both the product and the emotional atmosphere",
            "color_palette": "Colors that match the specified emotion and atmosphere",
            "negative_prompt": "inconsistent product appearance, product color changing, product distortion, low quality, blurry",
            "aspect_ratio": "4:3",
        }
        filepath = os.path.join(output_dir, f"{scene_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(prompt, f, ensure_ascii=False, indent=2)
        print(f"  💾 场景模板已保存: {filepath}")


# ============================================================
# 主入口
# ============================================================

def create_scenes(
    profile_path: str,
    output: Optional[str] = None,
    prompt_output: Optional[str] = None,
    engine: str = "gemini",
    api_key: Optional[str] = None,
    agent_mode: bool = False,
) -> dict:
    """
    创作场景。

    参数:
        profile_path: 产品档案路径
        output: 场景创作 JSON 输出路径
        prompt_output: prompt 文件输出目录（生成标准模板）
        engine: API 引擎
        api_key: API Key
        agent_mode: Agent 辅助模式
    """
    # 加载产品档案
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    product_name = profile.get("product_name", "未命名")
    print(f"\n{'='*50}")
    print(f"🎨 LLM 场景创意器")
    print(f"📦 产品: {product_name}")
    print(f"{'='*50}\n")

    if agent_mode:
        # Agent 辅助模式
        prompt = create_scenes_via_agent(profile)
        prompt_file = output or "scene_creation_prompt.md"
        with open(prompt_file, "w", encoding="utf-8") as f:
            f.write(prompt)
        print(f"  📝 场景创作 prompt 已输出: {prompt_file}")
        print(f"  🤖 请 AI 助手根据此 prompt 完成场景创作")
        return {"_mode": "agent_assist", "_prompt_file": prompt_file}

    else:
        # API 模式
        if not api_key:
            api_key = os.getenv("GEMINI_API_KEY" if engine == "gemini" else "MINIMAX_API_KEY")
        if not api_key:
            raise ValueError(f"API Key 未设置。请通过 --api-key 或环境变量 {engine.upper()}_API_KEY 传入。")

        print(f"  ⚙️  引擎: {engine}")
        print(f"  ⏳ 正在创作10个场景...", end=" ", flush=True)

        start = time.time()
        if engine == "gemini":
            result = create_scenes_via_gemini(profile, api_key)
        else:
            raise ValueError("MiniMax 场景创作暂不支持，请使用 Gemini 或 --agent-mode")

        elapsed = time.time() - start
        scene_count = len(result.get("scenes", []))
        print(f"✅ {scene_count} 个场景创作完成 ({elapsed:.1f}s)")

        # 输出摘要
        print(f"\n  📋 场景列表:")
        for i, scene in enumerate(result.get("scenes", []), 1):
            emotion = scene.get("emotion", "")
            name = scene.get("name", "")
            copy = scene.get("copy", "")
            print(f"  {i:>2}. {name:<12} | {emotion:<12} | {copy}")

        # 保存 JSON
        if output:
            os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
            with open(output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n  💾 场景创作已保存: {output}")

        # 同时输出标准 prompt 文件
        if prompt_output:
            os.makedirs(prompt_output, exist_ok=True)
            merge_to_prompt_files(result, prompt_output)
            print(f"  💾 prompt 模板已输出至: {prompt_output}")

        return result


def main():
    parser = argparse.ArgumentParser(
        description="🎨 LLM 场景创意器 — 根据产品档案自动创作10个情绪化场景",
    )
    parser.add_argument("--profile", "-p", required=True, help="产品档案 JSON 路径")
    parser.add_argument("--output", "-o", default=None, help="场景创作 JSON 输出路径")
    parser.add_argument("--prompt-output", default=None, help="标准 prompt 模板输出目录")
    parser.add_argument("--engine", choices=["gemini", "minimax"], default="gemini")
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--agent-mode", action="store_true",
                        help="Agent 辅助模式（输出 prompt 供 AI 助手填写）")
    args = parser.parse_args()

    if not os.path.exists(args.profile):
        print(f"❌ 产品档案不存在: {args.profile}")
        sys.exit(1)

    try:
        create_scenes(
            profile_path=args.profile,
            output=args.output,
            prompt_output=args.prompt_output,
            engine=args.engine,
            api_key=args.api_key,
            agent_mode=args.agent_mode,
        )
    except Exception as e:
        print(f"\n❌ 场景创作失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
