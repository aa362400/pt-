#!/usr/bin/env python3
"""
产品特征自动分析脚本 — Product Analyzer

功能：
  用 AI 视觉能力分析产品图片，自动提取结构化的产品档案（product_profile.json）
  支持 Gemini API（默认）和 Agent 辅助两种模式

用法：
  # API 模式（调用 Gemini Vision）
  python analyze_product.py \
    --images /path/to/photo1.jpg /path/to/photo2.jpg \
    --output ./product_profile.json

  # Agent 模式（输出分析 prompt，供 AI 助手填写）
  python analyze_product.py \
    --images /path/to/photo1.jpg \
    --agent-mode \
    --output ./product_profile.json

  # 从已有图片直接分析并生成
  python analyze_product.py \
    --images product_front.jpg product_side.jpg product_detail.jpg \
    --engine gemini
"""

import argparse
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Optional

# 使用公共工具模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.runtime_paths import get_runtime_paths
from common.utils import (
    guess_mime,
    parse_json_response,
    setup_logger,
    get_api_key,
    configure_stdio_utf8,
    resolve_analysis_engine,
    resolve_openai_vision_api_key,
    get_openai_vision_api_base,
    get_openai_vision_model,
    get_analyze_api_timeout,
    prepare_image_for_vision_api,
    AnalyzeApiTimeoutError,
    ANALYZE_API_MAX_RETRIES,
    ANALYZE_API_TIMEOUT_MESSAGE,
    raise_for_provider_error,
)

configure_stdio_utf8()
logger = setup_logger(__name__)


def default_profile_output_path(timestamp: int | None = None) -> str:
    generated_at = int(time.time()) if timestamp is None else timestamp
    return os.path.join(
        get_runtime_paths().outputs,
        "product_profiles",
        f"product_{generated_at}.json",
    )

# ============================================================
# 预设
# ============================================================

SYSTEM_PROMPT = """You are a professional product analyst for e-commerce.
Analyze the product images and extract detailed structured information.

Rules:
1. Be SPECIFIC — not "high quality material", but "Italian full-grain cowhide leather"
2. Extract colors as hex values where possible
3. Describe in English for use in AI image generation prompts
4. Only include what you can SEE or confidently infer from the images
5. key_features should list 3-5 most distinctive visual features
6. description should be a 2-3 sentence paragraph optimized for image generation prompts
7. If multiple images show different angles, combine the information

Output ONLY valid JSON, no markdown, no explanation."""

ANALYSIS_PROMPT = """Analyze these product images and output a JSON product profile with this exact structure:
{
  "product_name": "English name of the product",
  "product_name_cn": "中文产品名",
  "category": "product category",
  "category_cn": "产品类别",
  "materials": ["list of visible materials"],
  "colors": {
    "primary": "hex_color",
    "accents": ["hex_accent1", "hex_accent2"],
    "color_names": ["main color name", "accent color names"]
  },
  "style": "style description in English",
  "style_cn": "风格中文描述",
  "shape": "product shape description",
  "key_features": ["feature_1", "feature_2", "feature_3"],
  "target_audience": "intended user demographic",
  "usage_scenarios": ["use case 1", "use case 2", "use case 3"],
  "emotion_keywords": ["keyword1", "keyword2"],
  "description": "2-3 sentence English description optimized for AI image generation prompts",
  "description_cn": "中文产品描述"
}"""


# ============================================================
# API 调用
# ============================================================

def _encode_image(image_path: str) -> tuple[str, str]:
    """读取图片并编码为 base64（大图自动缩放至 1024px）"""
    return prepare_image_for_vision_api(image_path)


def _guess_mime(image_path: str) -> str:
    """使用公共模块的 guess_mime"""
    return guess_mime(image_path)


def _progress_print(message: str) -> None:
    print(f"  {message}", flush=True)


def _post_with_retry(
    url: str,
    *,
    headers: dict,
    json_body: dict,
    timeout: int,
    label: str = "API",
    progress_fn: Optional[Callable[[str], None]] = None,
) -> "requests.Response":
    """带指数退避的 HTTP POST，超时/连接错误最多重试 ANALYZE_API_MAX_RETRIES 次。"""
    import requests
    from requests.exceptions import ConnectionError as RequestsConnectionError
    from requests.exceptions import Timeout as RequestsTimeout

    retryable = (RequestsTimeout, RequestsConnectionError)
    last_error: Optional[Exception] = None
    notify = progress_fn or _progress_print
    stop_heartbeat = threading.Event()

    def _heartbeat():
        while not stop_heartbeat.wait(20):
            notify("仍在分析中，大模型响应较慢...")

    heartbeat = threading.Thread(target=_heartbeat, daemon=True)
    heartbeat.start()

    try:
        for attempt in range(ANALYZE_API_MAX_RETRIES + 1):
            if attempt > 0:
                delay = min(2 ** attempt, 30)
                notify(f"{label} 连接异常，{delay:.0f} 秒后重试 ({attempt}/{ANALYZE_API_MAX_RETRIES})...")
                time.sleep(delay)
            try:
                return requests.post(
                    url,
                    headers=headers,
                    json=json_body,
                    timeout=timeout,
                )
            except retryable as exc:
                last_error = exc
                logger.warning(
                    "%s 第 %s/%s 次失败: %s",
                    label, attempt + 1, ANALYZE_API_MAX_RETRIES + 1, exc,
                )
    finally:
        stop_heartbeat.set()

    raise AnalyzeApiTimeoutError(ANALYZE_API_TIMEOUT_MESSAGE) from last_error


def analyze_via_gemini(image_paths: list[str], api_key: str) -> dict:
    """通过 Gemini Pro Vision API 分析产品图片"""
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set. Export it or pass --api-key")

    timeout = get_analyze_api_timeout()

    # 构建请求体
    parts = []
    for img_path in image_paths:
        data, mime = _encode_image(img_path)
        parts.append({
            "inlineData": {
                "mimeType": mime,
                "data": data,
            }
        })
    parts.append({"text": ANALYSIS_PROMPT})

    response = _post_with_retry(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
        json_body={
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.95,
                "maxOutputTokens": 4096,
            },
        },
        timeout=timeout,
        label="Gemini",
    )
    raise_for_provider_error(response, "Gemini")
    data = response.json()

    # 提取文本响应
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    text = ""
    for part in candidates[0]["content"]["parts"]:
        if "text" in part:
            text += part["text"]

    if not text:
        raise RuntimeError("Gemini returned empty text response")

    # 解析 JSON
    return _parse_json_response(text)


def analyze_via_openai(
    image_paths: list[str],
    api_key: str,
    model: Optional[str] = None,
) -> dict:
    """通过 OpenAI 兼容 Vision API 分析产品图片"""
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set")

    timeout = get_analyze_api_timeout()

    base = get_openai_vision_api_base()
    model = get_openai_vision_model(model)

    content = []
    for img_path in image_paths:
        data, mime = _encode_image(img_path)
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime};base64,{data}",
            },
        })
    content.append({"type": "text", "text": ANALYSIS_PROMPT})

    response = _post_with_retry(
        f"{base}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json_body={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            "temperature": 0.2,
            "max_tokens": 4096,
        },
        timeout=timeout,
        label="OpenAI",
    )
    raise_for_provider_error(response, "OpenAI")
    data = response.json()

    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not text:
        raise RuntimeError("OpenAI returned empty response")

    return _parse_json_response(text)


def analyze_via_minimax(image_paths: list[str], api_key: str) -> dict:
    """通过 MiniMax VL 模型分析产品图片"""
    if not api_key:
        raise ValueError("MINIMAX_API_KEY is not set")

    timeout = get_analyze_api_timeout()
    host = os.getenv("MINIMAX_API_HOST", "https://api.minimaxi.com").rstrip("/")

    # MiniMax v1 对话接口（支持图片理解）
    messages = [{"role": "user", "content": []}]
    for img_path in image_paths:
        data, mime = _encode_image(img_path)
        messages[0]["content"].append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{data}"}
        })
    messages[0]["content"].append({"type": "text", "text": ANALYSIS_PROMPT})

    response = _post_with_retry(
        f"{host}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json_body={
            "model": os.getenv("MINIMAX_VL_MODEL", "MiniMax-VL"),
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 4096,
        },
        timeout=timeout,
        label="MiniMax",
    )
    raise_for_provider_error(response, "MiniMax")
    data = response.json()

    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not text:
        raise RuntimeError("MiniMax returned empty response")

    return _parse_json_response(text)


def _parse_json_response(text: str) -> dict:
    """从 LLM 响应中提取 JSON（委托给公共模块）"""
    return parse_json_response(text)


# ============================================================
# Agent 辅助模式
# ============================================================

def generate_agent_analysis_prompt(image_paths: list[str]) -> str:
    """生成供 AI 助手（Claude）使用的分析 prompt"""
    prompt = """# 产品特征提取任务

请分析以下产品图片，输出结构化的 JSON 产品档案。

## 分析规则

1. **具体而非抽象**：不要写"高端材料"，要写"进口意大利植鞣牛皮"
2. **视觉可验证**：只分析图片中能看到的信息
3. **英文描述为主**：`description` 字段用英文，用于 AI 生图 prompt
4. **精确色值**：提取主色和辅色的十六进制色值

## 输出 JSON 结构

```json
{
  "product_name": "English product name",
  "product_name_cn": "中文产品名",
  "category": "product_category",
  "category_cn": "产品类别",
  "materials": ["material1", "material2"],
  "colors": {
    "primary": "#HEX",
    "accents": ["#HEX"],
    "color_names": ["color name"]
  },
  "style": "style description in English",
  "style_cn": "风格中文描述",
  "shape": "product shape",
  "key_features": ["feature1", "feature2", "feature3"],
  "target_audience": "target user",
  "usage_scenarios": ["use1", "use2", "use3"],
  "emotion_keywords": ["kw1", "kw2", "kw3"],
  "description": "2-3 sentence English description optimized for image generation prompts",
  "description_cn": "中文描述"
}
```

## 产品图片

"""
    for i, path in enumerate(image_paths, 1):
        prompt += f"[Image {i}]: {path}\n"

    prompt += """
请直接输出 JSON，不要其他内容。"""
    return prompt


# ============================================================
# 验证与补全
# ============================================================

def validate_profile(profile: dict) -> list[str]:
    """验证产品档案完整性，返回缺失字段列表"""
    required = ["product_name", "category", "description", "key_features"]
    missing = []
    for field in required:
        if field not in profile or not profile[field]:
            missing.append(field)
    return missing


def fill_missing_fields(profile: dict) -> dict:
    """为缺失字段提供默认值"""
    defaults = {
        "product_name": "Unnamed Product",
        "product_name_cn": "未命名产品",
        "category": "general",
        "category_cn": "通用",
        "materials": [],
        "colors": {"primary": "#808080", "accents": [], "color_names": ["Gray"]},
        "style": "modern",
        "style_cn": "现代风格",
        "shape": "standard",
        "key_features": [],
        "target_audience": "general consumers",
        "usage_scenarios": ["daily use"],
        "emotion_keywords": ["quality", "reliable"],
        "description": "A product.",
        "description_cn": "一款产品。",
    }
    for key, default in defaults.items():
        if key not in profile or not profile[key]:
            profile[key] = default
    return profile


# ============================================================
# 主入口
# ============================================================

def analyze_products(
    image_paths: list[str],
    output: Optional[str] = None,
    engine: str = "gemini",
    api_key: Optional[str] = None,
    agent_mode: bool = False,
    model: Optional[str] = None,
) -> dict:
    """
    分析产品图片，输出产品档案。

    参数：
        image_paths: 图片路径列表
        output: 输出 JSON 路径（None 表示不保存）
        engine: "gemini" | "minimax" | "openai"
        api_key: API Key（None 表示从环境变量读取）
        agent_mode: 启用 Agent 辅助模式（输出 prompt 而非调用 API）

    返回：
        产品档案 dict
    """
    # 校验图片
    valid_images = []
    for path in image_paths:
        if not os.path.exists(path):
            print(f"  ⚠️ 图片不存在，跳过: {path}")
            continue
        valid_images.append(path)

    if not valid_images:
        raise FileNotFoundError("没有有效的图片文件")

    print(f"\n{'='*50}")
    print(f"🔍 产品特征分析")
    print(f"📷 图片: {len(valid_images)} 张")
    extra_vars = {}

    if agent_mode:
        # Agent 辅助模式：输出 prompt
        prompt = generate_agent_analysis_prompt(valid_images)
        profile_path = os.path.join(
            os.path.dirname(output) if output else ".",
            "_analysis_prompt.md"
        )
        with open(profile_path, "w", encoding="utf-8") as f:
            f.write(prompt)
        print(f"  📝 分析 prompt 已输出: {profile_path}")
        print(f"  🤖 请 AI 助手根据图片和 prompt 补全产品档案")
        extra_vars["_analysis_prompt_path"] = profile_path
        # 返回空 profile，等待 AI 助手填充
        profile = {"_mode": "agent_assist", "_prompt_file": profile_path}
    else:
        # API 模式 — 无 Gemini Key 时自动切 OpenAI 兼容（jojocode 等）
        engine = resolve_analysis_engine(engine, vision_model=model)
        if not api_key:
            if engine == "openai":
                api_key = resolve_openai_vision_api_key()
            else:
                api_key = get_api_key(engine)
        if not api_key:
            print("  ❌ 未设置 API Key")
            print("  请通过 --api-key 参数或环境变量传入:")
            print("    export GEMINI_API_KEY=your_key  (Gemini)")
            print("    export MINIMAX_API_KEY=your_key (MiniMax)")
            print("    export OPENAI_API_KEY=your_key  (OpenAI 兼容)")
            print("  或者使用 --agent-mode 模式，由 AI 助手辅助分析")
            raise ValueError("API Key not configured")

        print(f"  ⚙️  引擎: {engine}")
        print(f"  ⏳ 正在分析...", end=" ", flush=True)

        try:
            if engine == "minimax":
                profile = analyze_via_minimax(valid_images, api_key)
            elif engine == "openai":
                profile = analyze_via_openai(valid_images, api_key, model=model)
            else:
                profile = analyze_via_gemini(valid_images, api_key)
        except AnalyzeApiTimeoutError:
            gemini_key = get_api_key("gemini")
            forced = os.getenv("ANALYZE_ENGINE", "").strip().lower()
            if engine == "openai" and gemini_key and forced != "openai":
                print("\n  ⚠️ OpenAI 兼容 API 超时，尝试 Gemini 备用引擎...", flush=True)
                profile = analyze_via_gemini(valid_images, gemini_key)
            else:
                raise

        print("✅ 分析完成")

    # 验证和补全
    profile = fill_missing_fields(profile)
    missing = validate_profile(profile)
    if missing:
        print(f"  ⚠️ 部分字段未提取到: {', '.join(missing)}（已使用默认值）")

    # 保存
    if output:
        os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
        print(f"  💾 产品档案已保存: {output}")

    return profile


def main():
    parser = argparse.ArgumentParser(
        description="产品特征自动分析 — 从产品图片提取结构化产品档案",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # Gemini API 分析
  python analyze_product.py --images product.jpg --output profile.json

  # 多角度分析
  python analyze_product.py --images front.jpg side.jpg detail.jpg --output profile.json

  # Agent 辅助模式（输出 prompt 由 AI 助手填写）
  python analyze_product.py --images product.jpg --agent-mode --output profile.json

  # MiniMax 引擎
  python analyze_product.py --images product.jpg --engine minimax --output profile.json
        """,
    )
    parser.add_argument("--images", nargs="+", required=True, help="产品图片路径（至少1张）")
    parser.add_argument("--output", "-o", default=None, help="输出 JSON 路径（默认: 当前目录）")
    parser.add_argument(
        "--engine",
        choices=["gemini", "minimax", "openai"],
        default="gemini",
        help="分析引擎",
    )
    parser.add_argument("--api-key", default=None, help="API Key（默认从环境变量读取）")
    parser.add_argument("--model", default=None, help="OpenAI 兼容视觉分析模型")
    parser.add_argument("--agent-mode", action="store_true", help="Agent 辅助模式，不调用 API 而是输出分析 prompt")

    args = parser.parse_args()

    # 自动设置输出路径
    if args.output is None:
        args.output = default_profile_output_path()

    try:
        profile = analyze_products(
            image_paths=args.images,
            output=args.output,
            engine=args.engine,
            api_key=args.api_key,
            agent_mode=args.agent_mode,
            model=args.model,
        )
        if "_mode" not in profile:
            print(f"\n✅ 分析完成！产品: {profile.get('product_name', '')}")
            print(f"📁 输出: {os.path.abspath(args.output)}")
    except AnalyzeApiTimeoutError:
        print(f"\n❌ 分析失败: {ANALYZE_API_TIMEOUT_MESSAGE}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 分析失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
