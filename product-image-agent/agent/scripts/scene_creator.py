#!/usr/bin/env python3
"""
LLM sceneenglish_text — Scene Creator

english_textautomaticgenerationtextyesenglish_textscenetext、english_text prompt。
text Gemini API（text）text Agent english_text。

text：
  - english_text，text10english_textscenetext
  - textscenetext：english_text、visualtext、english_text
  - outputenglish_textscenetemplateenglish_text prompt

text：
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

# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import parse_json_response, setup_logger, get_api_key

logger = setup_logger(__name__)

# ============================================================
# Prompt template
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
      "name": "scenetext",
      "name_en": "Scene Name",
      "emotion": "emotion_keyword",
      "emotion_description": "Emotion in words",
      "visual_prompt": "...",
      "copy": "english_text",
      "copy_en": "marketing copy",
      "style_keywords": ["kw1", "kw2"]
    }
  ]
}

Output ONLY valid JSON, no markdown, no explanation."""


# ============================================================
# LLM text
# ============================================================

def create_scenes_via_gemini(product_profile: dict, api_key: str) -> dict:
    """passed Gemini generationscenetext"""
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
    """generationtext AI english_textscenetext prompt"""
    return (
        f"# scenetexttask\n\n"
        f"english_text10textyesenglish_texte-commercescene。\n\n"
        f"## english_text\n```json\n{json.dumps(product_profile, ensure_ascii=False, indent=2)}\n```\n\n"
        f"english_textscene，text：scene_id、name(English)、name_en(text)、emotion(text)、emotion_description(english_text)、"
        f"visual_prompt(textAIenglish_textvisualtext)、copy(Englishenglish_text)、copy_en(english_text)、style_keywords(textkeywords)。\n\n"
        f"text：\n"
        f"1. 10textsceneenglish_text\n"
        f"2. english_textyessceneenglish_text\n"
        f"3. visual_prompt english_textscene、text、text、text\n"
        f"4. copy textEnglish，textyestext\n\n"
        f"english_textoutput JSON text。"
    )


def _parse_json_response(text: str, product: dict) -> dict:
    """text LLM response（english_text）"""
    result = parse_json_response(text)

    # text scenes fieldstext
    if "scenes" not in result:
        result["scenes"] = []

    # english_textscenetext product text
    for scene in result["scenes"]:
        scene["_product_name"] = product.get("product_name", "")

    return result


# ============================================================
# sceneenglish_text
# ============================================================

def merge_to_templates(scene_creations: dict, template_dir: str) -> list[dict]:
    """
    text LLM english_textsceneenglish_texttemplatetext（text generate_batch.py）。
    textsceneenglish_text（text scene_matcher.py text）。
    """
    scenes = scene_creations.get("scenes", [])
    scene_plan = []
    for i, scene in enumerate(scenes):
        scene_plan.append({
            "scene_id": scene.get("scene_id", f"custom_scene_{i+1:02d}"),
            "scene_name": scene.get("name", f"scene{i+1}"),
            "scene_name_en": scene.get("name_en", ""),
            "emotion": scene.get("emotion", ""),
            "emotion_description": scene.get("emotion_description", ""),
            "ecommerce_use": "english_textscene",
            "aspect_ratio": "4:3",
            "final_score": 10.0,
        })
    return scene_plan


def merge_to_prompt_files(scene_creations: dict, output_dir: str):
    """
    text LLM english_textsceneenglish_text JSON prompt file。
    textsceneenglish_text {scene_id}.json，english_text generate_batch.py read。
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
        print(f"  💾 scenetemplateenglish_text: {filepath}")


# ============================================================
# english_text
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
    textscene。

    text:
        profile_path: english_text
        output: scenetext JSON outputtext
        prompt_output: prompt fileoutputtext（generationtexttemplate）
        engine: API text
        api_key: API Key
        agent_mode: Agent english_text
    """
    # english_text
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    product_name = profile.get("product_name", "english_text")
    print(f"\n{'='*50}")
    print(f"🎨 LLM sceneenglish_text")
    print(f"📦 text: {product_name}")
    print(f"{'='*50}\n")

    if agent_mode:
        # Agent english_text
        prompt = create_scenes_via_agent(profile)
        prompt_file = output or "scene_creation_prompt.md"
        with open(prompt_file, "w", encoding="utf-8") as f:
            f.write(prompt)
        print(f"  📝 scenetext prompt textoutput: {prompt_file}")
        print(f"  🤖 text AI english_text prompt completedscenetext")
        return {"_mode": "agent_assist", "_prompt_file": prompt_file}

    else:
        # API text
        if not api_key:
            api_key = os.getenv("GEMINI_API_KEY" if engine == "gemini" else "MINIMAX_API_KEY")
        if not api_key:
            raise ValueError(f"API Key english_text。textpassed --api-key english_text {engine.upper()}_API_KEY text。")

        print(f"  ⚙️  text: {engine}")
        print(f"  ⏳ english_text10textscene...", end=" ", flush=True)

        start = time.time()
        if engine == "gemini":
            result = create_scenes_via_gemini(profile, api_key)
        else:
            raise ValueError("MiniMax sceneenglish_text，english_text Gemini text --agent-mode")

        elapsed = time.time() - start
        scene_count = len(result.get("scenes", []))
        print(f"✅ {scene_count} textscenetextcompleted ({elapsed:.1f}s)")

        # outputtext
        print(f"\n  📋 scenetext:")
        for i, scene in enumerate(result.get("scenes", []), 1):
            emotion = scene.get("emotion", "")
            name = scene.get("name", "")
            copy = scene.get("copy", "")
            print(f"  {i:>2}. {name:<12} | {emotion:<12} | {copy}")

        # text JSON
        if output:
            os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
            with open(output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n  💾 sceneenglish_text: {output}")

        # textoutputtext prompt file
        if prompt_output:
            os.makedirs(prompt_output, exist_ok=True)
            merge_to_prompt_files(result, prompt_output)
            print(f"  💾 prompt templatetextoutputtext: {prompt_output}")

        return result


def main():
    parser = argparse.ArgumentParser(
        description="🎨 LLM sceneenglish_text — english_textautomatictext10english_textscene",
    )
    parser.add_argument("--profile", "-p", required=True, help="english_text JSON text")
    parser.add_argument("--output", "-o", default=None, help="scenetext JSON outputtext")
    parser.add_argument("--prompt-output", default=None, help="text prompt templateoutputtext")
    parser.add_argument("--engine", choices=["gemini", "minimax"], default="gemini")
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--agent-mode", action="store_true",
                        help="Agent english_text（output prompt text AI english_text）")
    args = parser.parse_args()

    if not os.path.exists(args.profile):
        print(f"❌ english_text: {args.profile}")
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
        print(f"\n❌ scenetextfailed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
