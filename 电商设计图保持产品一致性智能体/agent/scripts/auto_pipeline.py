#!/usr/bin/env python3
"""
全自动管线总控 — Auto Pipeline

一键串联：产品分析 → 场景创意 → 场景匹配 → 批量生成 → 后处理 → 一致性检测 → 交付报告

用法：
  # 全自动模式（只需传产品图片）
  python auto_pipeline.py \
    --images product_front.jpg product_side.jpg \
    --name "复古双肩包" \
    --output ./outputs/my_product

  # 高级模式
  python auto_pipeline.py \
    --images product.jpg \
    --name "Product Name" \
    --output ./outputs/ \
    --quality premium \
    --platforms taobao_main amazon_main \
    --watermark brand_logo.png \
    --brand-name "我的品牌"

  # 快速打样（跳过一致性和后处理）
  python auto_pipeline.py \
    --images product.jpg \
    --name "样品" \
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
# 目录结构
# ============================================================

def ensure_dirs(base_dir: str):
    """创建输出目录结构"""
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
# 管线步骤
# ============================================================

def step_product_analysis(images: list[str], output_dir: str,
                          engine: str, api_key: str) -> str:
    """Step 1: 产品分析"""
    print(f"\n{'='*60}")
    print(f"  Step 1/6: 🔍 产品特征分析")
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

    print(f"  ⏳ 正在分析产品特征...")
    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0 or not os.path.exists(profile_path):
        # 回退：尝试 agent-mode
        print(f"  ⚠️ API 分析失败，尝试 Agent 辅助模式...")
        cmd_agent = [
            sys.executable, script,
            "--images"] + images + [
            "--agent-mode",
            "--output", profile_path,
        ]
        subprocess.run(cmd_agent, capture_output=True, text=True, timeout=30)
        if not os.path.exists(profile_path):
            # 创建最小档案
            minimal_profile = {
                "product_name": Path(images[0]).stem,
                "category": "general",
                "description": "Product image for e-commerce.",
                "key_features": [],
                "materials": [],
                "colors": {"primary": "#808080", "accents": [], "color_names": ["Gray"]},
                "style": "modern", "style_cn": "现代",
                "usage_scenarios": ["daily use"],
                "emotion_keywords": ["quality"],
            }
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump(minimal_profile, f, ensure_ascii=False, indent=2)
            print(f"  📝 已创建基本产品档案")
        else:
            print(f"  📝 请 AI 助手根据 prompt 补全产品档案后继续")
    else:
        elapsed = time.time() - start
        print(f"  ✅ 产品分析完成 ({elapsed:.1f}s)")

    return profile_path


def step_scene_creation(profile_path: str, output_dir: str,
                        engine: str, api_key: str, agent_mode: bool = False) -> str:
    """Step 2: 场景创意（可选，如果失败则使用默认场景）"""
    print(f"\n{'='*60}")
    print(f"  Step 2/6: 🎨 LLM 场景创意")
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

    print(f"  ⏳ 正在创作场景...")
    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode == 0 and os.path.exists(scenes_output):
        elapsed = time.time() - start
        print(f"  ✅ 场景创作完成 ({elapsed:.1f}s)")
        return scenes_output
    else:
        print(f"  ⚠️ 场景创作跳过，将使用默认10场景")
        return ""


def step_scene_matching(profile_path: str, output_dir: str) -> str:
    """Step 3: 场景匹配"""
    print(f"\n{'='*60}")
    print(f"  Step 3/6: 🎯 场景智能匹配")
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
        print(f"  ✅ 场景匹配完成 ({elapsed:.1f}s)")
        return plan_path
    else:
        print(f"  ✅ 使用默认场景（无需匹配）")
        return ""


def step_batch_generate(profile_path: str, reference_images: list[str],
                        scene_plan_path: str, output_dir: str,
                        engine: str, api_key: str, quality: str,
                        auto_engine: bool) -> str:
    """Step 4: 批量生成"""
    print(f"\n{'='*60}")
    print(f"  Step 4/6: 🚀 批量生成图片")
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
    # 解析结果
    for line in result.stdout.split("\n"):
        if "成功" in line or "失败" in line or "输出" in line or "📊" in line or "❌" in line or "✅" in line:
            print(f"  {line}")

    print(f"  ⏱  耗时: {elapsed:.1f}s")
    print(f"  📁 原始输出: {raw_dir}")

    if result.returncode != 0 and result.stderr:
        if "API" in result.stderr or "Key" in result.stderr:
            print(f"  ⚠️  生成可能有误，请检查 API Key 配置")

    return raw_dir


def step_post_process(raw_dir: str, output_dir: str, profile_path: str,
                      watermark: str = "", brand_name: str = "",
                      color_correct: bool = True) -> str:
    """Step 5: 后处理管线"""
    print(f"\n{'='*60}")
    print(f"  Step 5/6: 🎨 风格后处理管线")
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
        if "✅" in line or "❌" in line or "完成" in line:
            print(f"  {line}")

    print(f"  ✅ 后处理完成 ({elapsed:.1f}s)")
    print(f"  📁 最终输出: {final_dir}")

    return final_dir


def step_quality_check(final_dir: str, profile_path: str, output_dir: str) -> dict:
    """Step 6: 一致性检测"""
    print(f"\n{'='*60}")
    print(f"  Step 6/6: 🔍 一致性检测")
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

    # 解析结果
    for line in result.stdout.split("\n"):
        if "评分" in line or "颜色漂移" in line or "通过" in line or "调整" in line or "问题" in line:
            print(f"  {line}")

    print(f"  ✅ 检测完成 ({elapsed:.1f}s)")
    print(f"  📄 报告: {report_path}")

    # 提取评分
    score = 0
    passed = False
    for line in result.stdout.split("\n"):
        if "一致性评分" in line:
            try:
                score = float(line.split("/")[0].split(":")[-1].strip())
            except (ValueError, IndexError):
                pass
        if "通过" in line:
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
    """额外步骤：多平台导出"""
    if not platforms:
        return

    print(f"\n{'='*60}")
    print(f"  📱 多平台导出: {', '.join(platforms)}")
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
# 主流程
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
    全自动管线主入口。
    """
    platforms = platforms or []
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in product_name)[:30]
    output_dir = os.path.join(output_base, f"{safe_name}_{timestamp}" if safe_name else f"product_{timestamp}")

    # 创建目录
    ensure_dirs(output_dir)

    profile_path = ""
    scene_plan_path = ""
    raw_dir = ""
    final_dir = ""

    print(f"\n{'#'*60}")
    print(f"  📸 电商产品图全自动管线 v4")
    print(f"  {'#'*60}")
    print(f"  产品: {product_name or Path(images[0]).stem}")
    print(f"  引擎: {'auto' if auto_engine else engine}")
    print(f"  质量: {quality}")
    print(f"  输出: {output_dir}")
    print(f"  {'#'*60}")

    # Step 1: 产品分析
    profile_path = step_product_analysis(images, output_dir, engine, api_key)

    # 读取产品名
    if os.path.exists(profile_path):
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                p = json.load(f)
            if not product_name:
                product_name = p.get("product_name", product_name or "")
        except (json.JSONDecodeError, IOError):
            pass

    # Step 2: 场景创意（可跳过）
    if not skip_scenes:
        scene_plan_path = step_scene_creation(
            profile_path, output_dir, engine, api_key,
            agent_mode=agent_scenes or draft,
        )

    # Step 3: 场景匹配（如果没有创意场景则使用默认）
    if not scene_plan_path:
        scene_plan_path = step_scene_matching(profile_path, output_dir)

    # Step 4: 批量生成
    ref_images = images
    raw_dir = step_batch_generate(
        profile_path, ref_images, scene_plan_path,
        output_dir, engine, api_key, quality, auto_engine,
    )

    # Step 5: 后处理（draft 模式跳过）
    if not draft:
        final_dir = step_post_process(
            raw_dir, output_dir, profile_path,
            watermark=watermark, brand_name=brand_name,
        )

        # Step 6: 一致性检测
        check_result = step_quality_check(final_dir, profile_path, output_dir)

        # 多平台导出
        step_platform_export(final_dir, output_dir, platforms,
                             profile_path, watermark, brand_name)
    else:
        final_dir = raw_dir
        check_result = {"score": 0, "passed": True, "report_path": ""}
        print(f"\n  📝 Draft 模式：跳过检测和后处理")

    # ========================================
    # 最终交付报告
    # ========================================
    print(f"\n{'='*60}")
    print(f"  ✅ 全流程完成")
    print(f"{'='*60}")
    print(f"  📦 产品: {product_name or '未命名'}")
    print(f"  📁 输出: {output_dir}")
    print(f"     ├── product_profile.json  (产品档案)")
    print(f"     ├── scene_plan.json       (场景计划)")
    print(f"     ├── scene_prompts/        (场景模板)")
    print(f"     ├── raw/                  (原始生成)")
    print(f"     ├── final/                (后处理输出)")
    if platforms:
        print(f"     └── platforms/            (多平台适配)")
    if check_result.get("report_path"):
        print(f"  📄 检测报告: {check_result['report_path']}")
    if check_result.get("score", 0) > 0:
        status = "✅ 通过" if check_result.get("passed") else "❌ 需调整"
        print(f"  🔍 一致性评分: {check_result['score']}/100 ({status})")
    print(f"{'='*60}\n")

    # 写入 Pipeline 汇总
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
        description="📸 全自动产品图管线 v4 — 分析→创意→生成→后处理→检测→交付 一键完成",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
快速开始:
  # 最简模式
  python auto_pipeline.py --images product.jpg

  # 完整模式
  python auto_pipeline.py \\
    --images front.jpg side.jpg \\
    --name "手工皮质双肩包" \\
    --quality premium \\
    --platforms taobao_main amazon_main xiaohongshu \\
    --watermark logo.png --brand-name "我的品牌"

  # 快速打样
  python auto_pipeline.py --images product.jpg --draft
        """,
    )
    parser.add_argument("--images", nargs="+", required=True, help="产品图片路径（至少1张）")
    parser.add_argument("--name", default="", help="产品名称")
    parser.add_argument("--output", "-o", default="./outputs", help="输出根目录")
    parser.add_argument("--engine", default="gemini", help="AI 引擎")
    parser.add_argument("--api-key", default="", help="API Key")
    parser.add_argument("--quality", choices=["premium", "standard", "draft"], default="standard")
    parser.add_argument("--auto-engine", action="store_true", help="自动选择引擎")
    parser.add_argument("--draft", action="store_true", help="快速打样（跳过检测和后处理）")
    parser.add_argument("--platforms", nargs="*", default=[], help="导出平台: taobao_main amazon_main etc.")
    parser.add_argument("--watermark", default="", help="水印图片路径")
    parser.add_argument("--brand-name", default="", help="品牌名称（文字水印）")
    parser.add_argument("--skip-scenes", action="store_true", help="跳过LLM场景创意")

    args = parser.parse_args()

    valid_imgs = [p for p in args.images if os.path.exists(p)]
    if not valid_imgs:
        print("❌ 没有有效的图片文件")
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
