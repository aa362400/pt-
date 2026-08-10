#!/usr/bin/env python3
"""
textautomaticenglish_text — Auto Pipeline

english_text：english_text → scenetext → scenetext → textgeneration → english_text → consistencydetection → textreport

text：
  # textautomatictext（english_textimage）
  python auto_pipeline.py \
    --images product_front.jpg product_side.jpg \
    --name "english_text" \
    --output ./outputs/my_product

  # english_text
  python auto_pipeline.py \
    --images product.jpg \
    --name "Product Name" \
    --output ./outputs/ \
    --quality premium \
    --platforms taobao_main amazon_main \
    --watermark brand_logo.png \
    --brand-name "english_text"

  # english_text（textconsistencyenglish_text）
  python auto_pipeline.py \
    --images product.jpg \
    --name "text" \
    --draft
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


# ============================================================
# english_text
# ============================================================

def ensure_dirs(base_dir: str):
    """textoutputenglish_text"""
    dirs = [
        base_dir,
        os.path.join(base_dir, "raw"),
        os.path.join(base_dir, "final"),
        os.path.join(base_dir, "reports"),
        os.path.join(base_dir, "platforms"),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    return dirs


# ============================================================
# english_text
# ============================================================

def step_product_analysis(images: list[str], output_dir: str,
                          engine: str, api_key: str) -> str:
    """Step 1: english_text"""
    print(f"\n{'='*60}")
    print(f"  Step 1/6: 🔍 english_text")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "analyze_product.py")
    profile_path = os.path.join(output_dir, "product_profile.json")

    cmd = [
        sys.executable, script,
        "--images"] + images + [
        "--engine", engine,
        "--output", profile_path,
    ]
    if api_key:
        cmd += ["--api-key", api_key]

    print(f"  ⏳ english_text...")
    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0 or not os.path.exists(profile_path):
        # text：text agent-mode
        print(f"  ⚠️ API textfailed，text Agent english_text...")
        cmd_agent = [
            sys.executable, script,
            "--images"] + images + [
            "--agent-mode",
            "--output", profile_path,
        ]
        subprocess.run(cmd_agent, capture_output=True, text=True, timeout=30)
        if not os.path.exists(profile_path):
            # english_text
            minimal_profile = {
                "product_name": Path(images[0]).stem,
                "category": "general",
                "description": "Product image for e-commerce.",
                "key_features": [],
                "materials": [],
                "colors": {"primary": "#808080", "accents": [], "color_names": ["Gray"]},
                "style": "modern", "style_cn": "text",
                "usage_scenarios": ["daily use"],
                "emotion_keywords": ["quality"],
            }
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump(minimal_profile, f, ensure_ascii=False, indent=2)
            print(f"  📝 english_text")
        else:
            print(f"  📝 text AI english_text prompt english_text")
    else:
        elapsed = time.time() - start
        print(f"  ✅ english_textcompleted ({elapsed:.1f}s)")

    return profile_path


def step_scene_creation(profile_path: str, output_dir: str,
                        engine: str, api_key: str, agent_mode: bool = False) -> str:
    """Step 2: scenetext（text，textfailedenglish_textscene）"""
    print(f"\n{'='*60}")
    print(f"  Step 2/6: 🎨 LLM scenetext")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "scene_creator.py")
    scenes_output = os.path.join(output_dir, "custom_scenes.json")
    prompt_output = os.path.join(output_dir, "scene_prompts")

    if agent_mode:
        cmd = [
            sys.executable, script,
            "--profile", profile_path,
            "--agent-mode",
            "--output", scenes_output,
            "--prompt-output", prompt_output,
        ]
    else:
        cmd = [
            sys.executable, script,
            "--profile", profile_path,
            "--engine", engine,
            "--output", scenes_output,
            "--prompt-output", prompt_output,
        ]
        if api_key:
            cmd += ["--api-key", api_key]

    print(f"  ⏳ english_textscene...")
    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode == 0 and os.path.exists(scenes_output):
        elapsed = time.time() - start
        print(f"  ✅ scenetextcompleted ({elapsed:.1f}s)")
        return scenes_output
    else:
        print(f"  ⚠️ sceneenglish_text，english_text10scene")
        return ""


def step_scene_matching(profile_path: str, output_dir: str) -> str:
    """Step 3: scenetext"""
    print(f"\n{'='*60}")
    print(f"  Step 3/6: 🎯 sceneenglish_text")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "scene_matcher.py")
    plan_path = os.path.join(output_dir, "scene_plan.json")

    cmd = [
        sys.executable, script,
        "--profile", profile_path,
        "--output", plan_path,
    ]

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode == 0 and os.path.exists(plan_path):
        elapsed = time.time() - start
        print(f"  ✅ scenetextcompleted ({elapsed:.1f}s)")
        return plan_path
    else:
        print(f"  ✅ english_textscene（noneenglish_text）")
        return ""


def step_batch_generate(profile_path: str, reference_images: list[str],
                        scene_plan_path: str, output_dir: str,
                        engine: str, api_key: str, quality: str,
                        auto_engine: bool) -> str:
    """Step 4: textgeneration"""
    print(f"\n{'='*60}")
    print(f"  Step 4/6: 🚀 textgenerationimage")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "generate_batch.py")
    raw_dir = os.path.join(output_dir, "raw")

    cmd = [
        sys.executable, script,
        "--product-profile", profile_path,
        "--reference-images"] + reference_images + [
        "--output-dir", raw_dir,
    ]

    if scene_plan_path and os.path.exists(scene_plan_path):
        cmd += ["--scene-plan", scene_plan_path]
    if api_key:
        cmd += ["--api-key", api_key]
    if auto_engine:
        cmd += ["--auto-engine"]
        cmd += ["--quality", quality]
    else:
        cmd += ["--engine", engine]

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    elapsed = time.time() - start
    print(f"\n  {'='*40}")
    # english_text
    for line in result.stdout.split("\n"):
        if "success" in line or "failed" in line or "output" in line or "📊" in line or "❌" in line or "✅" in line:
            print(f"  {line}")

    print(f"  ⏱  text: {elapsed:.1f}s")
    print(f"  📁 textoutput: {raw_dir}")

    if result.returncode != 0 and result.stderr:
        if "API" in result.stderr or "Key" in result.stderr:
            print(f"  ⚠️  generationtextyestext，english_text API Key configuration")

    return raw_dir


def step_post_process(raw_dir: str, output_dir: str, profile_path: str,
                      watermark: str = "", brand_name: str = "",
                      color_correct: bool = True) -> str:
    """Step 5: english_text"""
    print(f"\n{'='*60}")
    print(f"  Step 5/6: 🎨 english_text")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "style_pipeline.py")
    final_dir = os.path.join(output_dir, "final")

    cmd = [
        sys.executable, script,
        "--input", raw_dir,
        "--output", final_dir,
    ]
    if color_correct:
        cmd += ["--color-correct"]
    if profile_path and os.path.exists(profile_path):
        cmd += ["--product-color-fix", "--profile", profile_path]
    if watermark and os.path.exists(watermark):
        cmd += ["--watermark", watermark]
    if brand_name:
        cmd += ["--text-watermark", brand_name]

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    elapsed = time.time() - start

    print(f"  {' '.join(cmd)}")
    for line in result.stdout.split("\n"):
        if "✅" in line or "❌" in line or "completed" in line:
            print(f"  {line}")

    print(f"  ✅ english_textcompleted ({elapsed:.1f}s)")
    print(f"  📁 textoutput: {final_dir}")

    return final_dir


def step_quality_check(final_dir: str, profile_path: str, output_dir: str) -> dict:
    """Step 6: consistencydetection"""
    print(f"\n{'='*60}")
    print(f"  Step 6/6: 🔍 consistencydetection")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "consistency_checker.py")
    report_path = os.path.join(output_dir, "reports", "consistency_report.md")

    cmd = [
        sys.executable, script,
        "--input-dir", final_dir,
        "--report", report_path,
    ]
    if profile_path and os.path.exists(profile_path):
        cmd += ["--profile", profile_path]

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    elapsed = time.time() - start

    # english_text
    for line in result.stdout.split("\n"):
        if "text" in line or "english_text" in line or "passed" in line or "text" in line or "text" in line:
            print(f"  {line}")

    print(f"  ✅ detectioncompleted ({elapsed:.1f}s)")
    print(f"  📄 report: {report_path}")

    # english_text
    score = 0
    passed = False
    for line in result.stdout.split("\n"):
        if "consistencytext" in line:
            try:
                score = float(line.split("/")[0].split(":")[-1].strip())
            except (ValueError, IndexError):
                pass
        if "passed" in line:
            passed = True

    return {
        "score": score,
        "passed": passed,
        "report_path": report_path,
        "exit_code": result.returncode,
    }


def step_platform_export(final_dir: str, output_dir: str,
                         platforms: list[str], profile_path: str,
                         watermark: str = "", brand_name: str = ""):
    """english_text：textplatformtext"""
    if not platforms:
        return

    print(f"\n{'='*60}")
    print(f"  📱 textplatformtext: {', '.join(platforms)}")
    print(f"{'='*60}")

    script = os.path.join(SCRIPT_DIR, "style_pipeline.py")
    platform_dir = os.path.join(output_dir, "platforms")

    for platform in platforms:
        out_dir = os.path.join(platform_dir, platform)
        cmd = [
            sys.executable, script,
            "--input", final_dir,
            "--output", out_dir,
            "--platform", platform,
            "--color-correct",
        ]
        if watermark and os.path.exists(watermark):
            cmd += ["--watermark", watermark]
        if brand_name:
            cmd += ["--text-watermark", brand_name]

        subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        print(f"  ✅ {platform} → {out_dir}")


# ============================================================
# textflow
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def run_pipeline(
    images: list[str],
    product_name: str = "",
    output_base: str = "./outputs",
    engine: str = "gemini",
    api_key: str = "",
    quality: str = "standard",
    auto_engine: bool = False,
    draft: bool = False,
    platforms: list[str] = None,
    watermark: str = "",
    brand_name: str = "",
    skip_scenes: bool = False,
    agent_scenes: bool = False,
):
    """
    textautomaticenglish_text。
    """
    platforms = platforms or []
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in product_name)[:30]
    output_dir = os.path.join(output_base, f"{safe_name}_{timestamp}" if safe_name else f"product_{timestamp}")

    # english_text
    ensure_dirs(output_dir)

    profile_path = ""
    scene_plan_path = ""
    raw_dir = ""
    final_dir = ""

    print(f"\n{'#'*60}")
    print(f"  📸 e-commerceenglish_textautomatictext v4")
    print(f"  {'#'*60}")
    print(f"  text: {product_name or Path(images[0]).stem}")
    print(f"  text: {'auto' if auto_engine else engine}")
    print(f"  text: {quality}")
    print(f"  output: {output_dir}")
    print(f"  {'#'*60}")

    # Step 1: english_text
    profile_path = step_product_analysis(images, output_dir, engine, api_key)

    # readenglish_text
    if os.path.exists(profile_path):
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                p = json.load(f)
            if not product_name:
                product_name = p.get("product_name", product_name or "")
        except (json.JSONDecodeError, IOError):
            pass

    # Step 2: scenetext（english_text）
    if not skip_scenes:
        scene_plan_path = step_scene_creation(
            profile_path, output_dir, engine, api_key,
            agent_mode=agent_scenes or draft,
        )

    # Step 3: scenetext（english_textyestextsceneenglish_text）
    if not scene_plan_path:
        scene_plan_path = step_scene_matching(profile_path, output_dir)

    # Step 4: textgeneration
    ref_images = images
    raw_dir = step_batch_generate(
        profile_path, ref_images, scene_plan_path,
        output_dir, engine, api_key, quality, auto_engine,
    )

    # Step 5: english_text（draft english_text）
    if not draft:
        final_dir = step_post_process(
            raw_dir, output_dir, profile_path,
            watermark=watermark, brand_name=brand_name,
        )

        # Step 6: consistencydetection
        check_result = step_quality_check(final_dir, profile_path, output_dir)

        # textplatformtext
        step_platform_export(final_dir, output_dir, platforms,
                             profile_path, watermark, brand_name)
    else:
        final_dir = raw_dir
        check_result = {"score": 0, "passed": True, "report_path": ""}
        print(f"\n  📝 Draft text：textdetectionenglish_text")

    # ========================================
    # english_textreport
    # ========================================
    print(f"\n{'='*60}")
    print(f"  ✅ textflowcompleted")
    print(f"{'='*60}")
    print(f"  📦 text: {product_name or 'english_text'}")
    print(f"  📁 output: {output_dir}")
    print(f"     ├── product_profile.json  (english_text)")
    print(f"     ├── scene_plan.json       (scenetext)")
    print(f"     ├── scene_prompts/        (scenetemplate)")
    print(f"     ├── raw/                  (textgeneration)")
    print(f"     ├── final/                (english_textoutput)")
    if platforms:
        print(f"     └── platforms/            (textplatformtext)")
    if check_result.get("report_path"):
        print(f"  📄 detectionreport: {check_result['report_path']}")
    if check_result.get("score", 0) > 0:
        status = "✅ passed" if check_result.get("passed") else "❌ english_text"
        print(f"  🔍 consistencytext: {check_result['score']}/100 ({status})")
    print(f"{'='*60}\n")

    # write Pipeline text
    summary = {
        "product_name": product_name,
        "timestamp": timestamp,
        "engine": engine,
        "quality": quality,
        "auto_engine": auto_engine,
        "draft_mode": draft,
        "output_dir": os.path.abspath(output_dir),
        "images": images,
        "platforms": platforms,
        "consistency_check": check_result,
        "files": {
            "profile": os.path.abspath(profile_path) if profile_path else "",
            "scene_plan": os.path.abspath(scene_plan_path) if scene_plan_path else "",
            "raw": os.path.abspath(raw_dir) if raw_dir else "",
            "final": os.path.abspath(final_dir) if final_dir else "",
        },
    }
    summary_path = os.path.join(output_dir, "_pipeline_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="📸 textautomaticenglish_text v4 — text→text→generation→english_text→detection→text textcompleted",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
english_text:
  # english_text
  python auto_pipeline.py --images product.jpg

  # english_text
  python auto_pipeline.py \\
    --images front.jpg side.jpg \\
    --name "english_text" \\
    --quality premium \\
    --platforms taobao_main amazon_main xiaohongshu \\
    --watermark logo.png --brand-name "english_text"

  # english_text
  python auto_pipeline.py --images product.jpg --draft
        """,
    )
    parser.add_argument("--images", nargs="+", required=True, help="textimagetext（text1text）")
    parser.add_argument("--name", default="", help="english_text")
    parser.add_argument("--output", "-o", default="./outputs", help="outputenglish_text")
    parser.add_argument("--engine", default="gemini", help="AI text")
    parser.add_argument("--api-key", default="", help="API Key")
    parser.add_argument("--quality", choices=["premium", "standard", "draft"], default="standard")
    parser.add_argument("--auto-engine", action="store_true", help="automaticenglish_text")
    parser.add_argument("--draft", action="store_true", help="english_text（textdetectionenglish_text）")
    parser.add_argument("--platforms", nargs="*", default=[], help="textplatform: taobao_main amazon_main etc.")
    parser.add_argument("--watermark", default="", help="textimagetext")
    parser.add_argument("--brand-name", default="", help="english_text（english_text）")
    parser.add_argument("--skip-scenes", action="store_true", help="textLLMscenetext")

    args = parser.parse_args()

    valid_imgs = [p for p in args.images if os.path.exists(p)]
    if not valid_imgs:
        print("❌ textyesyestextimagefile")
        sys.exit(1)

    run_pipeline(
        images=valid_imgs,
        product_name=args.name,
        output_base=args.output,
        engine=args.engine,
        api_key=args.api_key,
        quality=args.quality,
        auto_engine=args.auto_engine,
        draft=args.draft,
        platforms=args.platforms,
        watermark=args.watermark,
        brand_name=args.brand_name,
        skip_scenes=args.skip_scenes,
    )


if __name__ == "__main__":
    main()
