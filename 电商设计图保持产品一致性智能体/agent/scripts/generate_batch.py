#!/usr/bin/env python3
"""
产品图批量生成脚本 v2（中级版）— Product Image Batch Generator v2

输入：产品图片 + 产品档案 → 自动匹配场景 → 批量出图 → 校验交付

功能：
  - 自动场景匹配（与 scene_matcher.py 联动）
  - 并行生成 + 指数退避重试
  - 实时进度条
  - 支持 Gemini / MiniMax 引擎
  - 直接 API 调用模式（无需 generate.py 依赖）
  - 一次完成：分析 → 匹配 → 生成

用法：
  # 一键：分析 → 匹配 → 生成
  python generate_batch.py \
    --images product.jpg product_side.jpg \
    --output ./outputs/my_product \
    --engine gemini

  # 使用已有产品档案
  python generate_batch.py \
    --product-profile profile.json \
    --reference-images product.jpg \
    --output ./outputs/my_product

  # 指定场景计划
  python generate_batch.py \
    --product-profile profile.json \
    --reference-images product.jpg \
    --scene-plan scene_plan.json \
    --output ./outputs/my_product

  # MiniMax 引擎 + 串行（限流环境）
  python generate_batch.py \
    --images product.jpg \
    --engine minimax --no-parallel
"""

import argparse
import json
import os
import sys
import time
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

# 使用公共工具模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import (
    guess_mime, inject_variables, setup_logger, get_api_key,
    collect_images, resolve_image_engine, get_image_api_key,
    friendly_image_error_message,
    is_terminal_image_provider_error,
    gemini_image_generate_url, gemini_image_generation_config,
    list_configured_image_engines, image_engine_fallback_order,
    get_openai_image_api_base, get_openai_image_model,
    configured_image_key_candidates, configured_image_model_candidates,
    image_provider_rejects_response_format,
)

logger = setup_logger(__name__)


# ============================================================
# 配置常量
# ============================================================

ENGINE_GEMINI = "gemini"
ENGINE_MINIMAX = "minimax"

# 默认场景列表
DEFAULT_SCENES = [
    "scene_01_white_bg",
    "scene_02_lifestyle",
    "scene_03_premium",
    "scene_04_in_use",
    "scene_05_detail",
    "scene_06_seasonal",
    "scene_07_atmospheric",
    "scene_08_comparison",
    "scene_09_review_social",
    "scene_10_brand_story",
    "scene_11_promo_poster",
]

# 重试配置
MAX_RETRIES = 2
RETRY_BASE_DELAY = 3.0  # 秒
MAX_WORKERS = 5          # 最大并行数

# 引擎别名
ENGINE_GEMINI = "gemini"
ENGINE_MINIMAX = "minimax"
ENGINE_MIDJOURNEY = "midjourney"
ENGINE_DALLE = "dalle"
ENGINE_SD_LOCAL = "sdxl_local"


# ============================================================
# 工具函数
# ============================================================

def color(text: str, code: str) -> str:
    """终端着色"""
    colors = {
        "green": "\033[92m",
        "yellow": "\033[93m",
        "red": "\033[91m",
        "cyan": "\033[96m",
        "bold": "\033[1m",
        "dim": "\033[2m",
        "end": "\033[0m",
    }
    return f"{colors.get(code, '')}{text}{colors['end']}"


class ProgressBar:
    """简单的进度条（不依赖 tqdm）"""

    def __init__(self, total: int, prefix: str = "", width: int = 40):
        self.total = total
        self.prefix = prefix
        self.width = width
        self.current = 0
        self.start_time = time.time()

    def update(self, n: int = 1, suffix: str = ""):
        self.current += n
        elapsed = time.time() - self.start_time
        pct = self.current / self.total
        filled = int(self.width * pct)
        bar = "█" * filled + "░" * (self.width - filled)

        if self.current > 0 and elapsed > 0:
            rate = self.current / elapsed
            remaining = (self.total - self.current) / rate if rate > 0 else 0
            time_str = f"{int(elapsed//60):02d}:{int(elapsed%60):02d}<{int(remaining//60):02d}:{int(remaining%60):02d}"
        else:
            time_str = "00:00<?:?"

        sys.stdout.write(
            f"\r{self.prefix} [{bar}] {self.current}/{self.total} "
            f"{pct*100:4.1f}% {time_str} {suffix}"
        )
        sys.stdout.flush()
        if self.current >= self.total:
            sys.stdout.write("\n")


# ============================================================
# 产品档案加载 / 创建
# ============================================================

def load_product_profile(profile_path: str) -> dict:
    with open(profile_path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def analyze_and_create_profile(
    images: list[str],
    api_key: str,
    engine: str = ENGINE_GEMINI,
    output_dir: Optional[str] = None,
) -> dict:
    """
    分析产品图片并创建产品档案。
    内部调用 analyze_product.py 或直接使用 API。
    """
    # 方式1：使用 analyze_product.py
    analyzer_path = os.path.join(os.path.dirname(__file__), "analyze_product.py")
    if os.path.exists(analyzer_path):
        import subprocess
        output = os.path.join(output_dir or os.getcwd(), "product_profile.json") if output_dir else None
        cmd = [
            sys.executable, analyzer_path,
            "--images"] + images + [
            "--engine", engine,
        ]
        if api_key:
            cmd += ["--api-key", api_key]
        if output:
            cmd += ["--output", output]

        print(f"  ⏳ 正在分析产品特征...")
        start = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0 and output and os.path.exists(output):
            elapsed = time.time() - start
            print(f"  ✅ 产品分析完成 ({elapsed:.1f}s)")
            return load_product_profile(output)
        # 如果 analyze_product.py 返回 JSON 到 stdout
        try:
            profile = json.loads(result.stdout)
            if profile.get("product_name"):
                print(f"  ✅ 产品分析完成")
                return profile
        except (json.JSONDecodeError, TypeError):
            pass
        # 如果失败，回退到方式2
        print(f"  ⚠️ analyze_product.py 处理异常，使用 LLM 分析: {result.stderr[:200] if result.stderr else 'unknown'}")

    # 方式2：直接 LLM 分析（通过 Gemini API）
    if engine == ENGINE_GEMINI and api_key:
        return _analyze_via_gemini_api(images, api_key)

    # 方式3：要求用户提供
    print("  ❌ 无法自动分析产品特征。请使用 analyze_product.py 生成产品档案后重试。")
    print(f"     python analyze_product.py --images {' '.join(images)} --output profile.json")
    return {
        "product_name": "Product",
        "category": "general",
        "description": "Please provide a product description.",
        "_mode": "placeholder"
    }


def _analyze_via_gemini_api(images: list[str], api_key: str) -> dict:
    """通过 Gemini 直接分析产品图片"""
    import base64
    import requests

    system_prompt = "You are a professional product analyst. Output ONLY valid JSON."
    analysis_prompt = """Analyze these product images. Output a JSON with:
{
  "product_name": "English name",
  "product_name_cn": "中文名",
  "category": "category (fashion/home/digital/food/beauty/sports/general)",
  "category_cn": "类别中文",
  "materials": ["material1", "material2"],
  "colors": {"primary": "#HEX", "accents": ["#HEX"], "color_names": ["name"]},
  "style": "style in English",
  "style_cn": "风格中文",
  "shape": "shape description",
  "key_features": ["feature1", "feature2", "feature3"],
  "target_audience": "who is this for",
  "usage_scenarios": ["use1", "use2"],
  "emotion_keywords": ["word1", "word2"],
  "description": "2-3 sentence English description for AI image generation",
  "description_cn": "中文描述"
}"""
    parts = []
    for img_path in images:
        mime = _guess_mime(img_path)
        with open(img_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        parts.append({"inlineData": {"mimeType": mime, "data": b64}})
    parts.append({"text": analysis_prompt})

    resp = requests.post(
        gemini_image_generate_url(),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096},
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    text = ""
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "text" in part:
            text += part["text"]
    return _parse_json_response(text)


def _guess_mime(path: str) -> str:
    """使用公共模块"""
    return guess_mime(path)


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    for delimiter in ["```json", "```"]:
        if delimiter in text:
            start = text.index(delimiter) + len(delimiter)
            end = text.index("```", start) if "```" in text[start:] else len(text)
            text = text[start:end].strip()
    return json.loads(text)


# ============================================================
# 场景匹配集成
# ============================================================

def match_scenes(
    profile: dict,
    category: Optional[str] = None,
    skip: Optional[list[str]] = None,
    prefer: Optional[list[str]] = None,
    scene_dir: Optional[str] = None,
) -> list[dict]:
    """匹配场景，返回场景模板列表"""
    try:
        from scene_matcher import select_top_scenes, detect_category
    except ImportError:
        # 尝试相对导入
        sys.path.insert(0, os.path.dirname(__file__))
        from scene_matcher import select_top_scenes, detect_category

    if category is None:
        category = detect_category(profile)

    return select_top_scenes(
        profile=profile,
        count=10,
        category=category,
        skip=skip,
        prefer=prefer,
    )


def load_scene_template(scene_path: str) -> dict:
    with open(scene_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ============================================================
# Prompt 构建
# ============================================================

def inject_variables(template: dict, product: dict, extra_vars: Optional[dict] = None) -> dict:
    """注入产品变量到模板（委托公共模块）"""
    from common.utils import inject_variables as _inject
    return _inject(template, product, extra_vars)



def build_gemini_prompt(injected: dict) -> str:
    """构建 Gemini 完整 prompt"""
    parts = [
        f"PRODUCT PHOTOGRAPHY — {injected.get('scene_name', 'Product Scene')}",
        f"Emotion to convey: {injected.get('emotion', '')}",
        f"E-commerce use: {injected.get('ecommerce_use', '')}",
        "",
        "IMPORTANT — Product Consistency Requirements:",
        "- The product must look EXACTLY the same as shown in the reference images",
        "- Same shape, same color, same materials, same proportions",
        "- Do NOT change the product's design, color, or details between scenes",
        "- The product is the hero — scene elements must NOT alter the product's appearance",
        "",
        "Subject:",
        injected.get("prompt", ""),
        "",
        f"Style: {injected.get('style', '')}",
        f"Composition: {injected.get('composition', '')}",
        f"Lighting: {injected.get('lighting', '')}",
        f"Color palette: {injected.get('color_palette', '')}",
        "",
        f"Aspect ratio: {injected.get('aspect_ratio', '1:1')}",
        "",
        "Negative prompt:",
        injected.get("negative_prompt", ""),
        "- Product changing color or shape between scenes",
        "- Product losing its identifying features",
        "- Distorted product proportions",
    ]
    return "\n".join(parts)


def build_minimax_prompt(injected: dict) -> str:
    """构建 MiniMax 简短 prompt（≤1500字符）"""
    core = injected.get("prompt", "")
    consistency = ("IMPORTANT: Keep the product EXACTLY as in reference images. "
                   "Same shape, color, materials. Do NOT alter the product.")
    combined = f"{consistency} {core}"
    return combined[:1480]


# ============================================================
# API 直接调用（无需 generate.py）
# ============================================================

def _call_gemini_api(prompt: str, ref_images: list[str], output_file: str, aspect_ratio: str, api_key: str) -> str:
    """直接调用 Gemini 生图 API"""
    import base64
    import requests

    parts = []
    for img in ref_images:
        if not os.path.exists(img):
            continue
        mime = _guess_mime(img)
        with open(img, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        parts.append({"inlineData": {"mimeType": mime, "data": b64}})
    parts.append({"text": prompt})

    resp = requests.post(
        gemini_image_generate_url(),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "generationConfig": gemini_image_generation_config(aspect_ratio),
            "contents": [{"parts": parts}],
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if part.get("inlineData"):
            img_data = part["inlineData"]["data"]
            os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
            with open(output_file, "wb") as f:
                f.write(base64.b64decode(img_data))
            return f"Generated: {output_file}"
    raise RuntimeError("No image data in Gemini response")


def _call_minimax_api(prompt: str, ref_images: list[str], output_file: str, aspect_ratio: str, api_key: str) -> str:
    """直接调用 MiniMax 生图 API"""
    import base64
    import requests

    host = os.getenv("MINIMAX_API_HOST", "https://api.minimaxi.com").rstrip("/")
    body = {
        "model": os.getenv("MINIMAX_IMAGE_MODEL", "image-01"),
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "response_format": "base64",
        "n": 1,
        "prompt_optimizer": True,
    }
    if ref_images:
        body["subject_reference"] = []
        for img in ref_images:
            if not os.path.exists(img):
                continue
            with open(img, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            mime = _guess_mime(img)
            body["subject_reference"].append({
                "type": "character",
                "image_file": f"data:{mime};base64,{b64}"
            })

    resp = requests.post(
        f"{host}/v1/image_generation",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    payload = resp.json()
    base_resp = payload.get("base_resp") or {}
    if base_resp.get("status_code", 0) != 0:
        raise RuntimeError(f"MiniMax error {base_resp.get('status_code')}: {base_resp.get('status_msg')}")
    images = (payload.get("data") or {}).get("image_base64") or []
    if not images:
        raise RuntimeError("MiniMax returned no image data")
    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    with open(output_file, "wb") as f:
        f.write(base64.b64decode(images[0]))
    return f"Generated: {output_file}"


def _decode_b64_image(b64: str) -> bytes:
    """Decode base64 image payload (handles data-URI prefix and padding)."""
    import base64

    value = (b64 or "").strip()
    if not value:
        raise ValueError("empty base64 image payload")
    if value.startswith("data:"):
        value = value.split(",", 1)[1]
    value += "=" * ((4 - len(value) % 4) % 4)
    return base64.b64decode(value)


def _write_image_file(output_file: str, data: bytes) -> str:
    """Write image bytes to disk and verify the file exists."""
    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    with open(output_file, "wb") as f:
        f.write(data)
    if not os.path.isfile(output_file) or os.path.getsize(output_file) < 64:
        raise RuntimeError(f"Image file not saved: {output_file}")
    return output_file


def _extract_openai_image_fields(data: dict) -> tuple[Optional[str], Optional[str]]:
    """Extract b64_json / url from OpenAI-compatible image API responses."""
    items = data.get("data")
    if not items and data.get("images"):
        items = data["images"]
    if not items:
        return None, None
    item = items[0] if isinstance(items, list) else items
    if isinstance(item, str):
        if item.startswith("http"):
            return None, item
        return item, None
    if not isinstance(item, dict):
        return None, None
    b64 = item.get("b64_json") or item.get("b64") or item.get("base64")
    url = item.get("url") or item.get("image_url")
    return b64, url


def _call_openai_image_api_once(
    prompt: str,
    ref_images: list[str],
    output_file: str,
    aspect_ratio: str,
    api_key: str,
    model: str,
) -> str:
    """OpenAI 兼容生图 API（jojocode gpt-image-2 等）。"""
    import requests

    # With reference images, this uses /images/edits and uploads the product
    # image bytes; /images/generations is only used when no reference exists.
    base = get_openai_image_api_base()

    size_map = {
        "1:1": "1024x1024",
        "3:4": "1024x1536",
        "4:3": "1536x1024",
        "9:16": "1024x1536",
        "16:9": "1536x1024",
    }
    size = size_map.get(aspect_ratio, "1024x1024")

    valid_refs = [p for p in (ref_images or []) if os.path.exists(p)]
    if valid_refs:
        opened_files = []
        try:
            files = []
            for path in valid_refs[:8]:
                handle = open(path, "rb")
                opened_files.append(handle)
                files.append(("image[]", (os.path.basename(path), handle, _guess_mime(path))))
            request_data = {
                "model": model,
                "prompt": prompt[:4000],
                "n": "1",
                "size": size,
                "response_format": "b64_json",
            }
            resp = requests.post(
                f"{base}/images/edits",
                headers={"Authorization": f"Bearer {api_key}"},
                data=request_data,
                files=files,
                timeout=180,
            )
            if image_provider_rejects_response_format(resp):
                request_data.pop("response_format", None)
                for handle in opened_files:
                    handle.seek(0)
                resp = requests.post(
                    f"{base}/images/edits",
                    headers={"Authorization": f"Bearer {api_key}"},
                    data=request_data,
                    files=files,
                    timeout=180,
                )
        finally:
            for handle in opened_files:
                handle.close()
    else:
        request_json = {
            "model": model,
            "prompt": prompt[:4000],
            "n": 1,
            "size": size,
            "response_format": "b64_json",
        }
        resp = requests.post(
            f"{base}/images/generations",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=request_json,
            timeout=180,
        )
        if image_provider_rejects_response_format(resp):
            request_json.pop("response_format", None)
            resp = requests.post(
                f"{base}/images/generations",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=request_json,
                timeout=180,
            )
    status_code = int(getattr(resp, "status_code", 200) or 200)
    if status_code >= 400:
        error_code = ""
        error_message = ""
        try:
            error_payload = resp.json()
            provider_error = error_payload.get("error", error_payload)
            if isinstance(provider_error, dict):
                error_code = str(provider_error.get("code") or "").strip()
                error_message = str(provider_error.get("message") or "").strip()
            else:
                error_message = str(provider_error).strip()
        except Exception:
            error_message = str(getattr(resp, "text", "") or "").strip()

        # Keep machine-readable provider codes while avoiding account balances,
        # request IDs, or other provider metadata in user-visible task errors.
        if error_code == "insufficient_user_quota":
            error_message = "image provider quota exhausted"
        detail = f" [{error_code}]" if error_code else ""
        suffix = f": {error_message[:300]}" if error_message else ""
        raise RuntimeError(f"OpenAI image API {status_code}{detail}{suffix}")

    resp.raise_for_status()
    data = resp.json()
    b64, image_url = _extract_openai_image_fields(data)
    if b64:
        _write_image_file(output_file, _decode_b64_image(b64))
        return f"Generated ({model}): {output_file}"

    if image_url:
        dl_headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        img_resp = requests.get(image_url, headers=dl_headers, timeout=120)
        img_resp.raise_for_status()
        _write_image_file(output_file, img_resp.content)
        return f"Generated ({model}): {output_file}"
    raise RuntimeError(f"No image data in {model} response")


def _call_openai_image_api(
    prompt: str,
    ref_images: list[str],
    output_file: str,
    aspect_ratio: str,
    api_key: str,
) -> str:
    """Call the image provider with key/model failover and stable terminal errors."""
    attempts = [
        (key_role, candidate_key, model)
        for model in configured_image_model_candidates()
        for key_role, candidate_key in configured_image_key_candidates(api_key)
    ]
    if not attempts:
        raise RuntimeError("Image provider API key not configured")

    last_error: Exception | None = None
    quota_failures = 0
    for attempt_index, (key_role, candidate_key, model) in enumerate(attempts):
        try:
            return _call_openai_image_api_once(
                prompt,
                ref_images,
                output_file,
                aspect_ratio,
                candidate_key,
                model,
            )
        except Exception as exc:  # noqa: BLE001 - provider failover boundary
            last_error = exc
            error_text = str(exc).lower()
            if "insufficient_user_quota" in error_text:
                quota_failures += 1
            can_fail_over = any(token in error_text for token in (
                "quota", "401", "403", "429", "model_not_found",
                "no available channel", "500", "502", "503", "504",
                "timeout", "timed out", "connection",
            ))
            if can_fail_over and attempt_index + 1 < len(attempts):
                logger.warning(
                    "Image provider route failed; switching route role=%s model=%s",
                    key_role,
                    model,
                )
                continue
            break

    if quota_failures == len(attempts):
        raise RuntimeError(
            "[IMAGE_PROVIDER_QUOTA_EXHAUSTED] 所有图片供应商路由额度不足"
        ) from last_error
    if quota_failures > 0:
        raise RuntimeError(
            "[IMAGE_PROVIDER_FALLBACK_EXHAUSTED] 主图片额度不足，备用密钥或备用模型不可用"
        ) from last_error
    raise last_error or RuntimeError("Image provider routes exhausted")


# ============================================================
# 核心生成（带重试）
# ============================================================

def _sleep_cancellable(seconds: float, cancel_check: Optional[Callable[[], bool]] = None) -> bool:
    """Sleep in small chunks; return True if cancelled during wait."""
    if seconds <= 0:
        return bool(cancel_check and cancel_check())
    end = time.time() + seconds
    while time.time() < end:
        if cancel_check and cancel_check():
            return True
        time.sleep(min(0.5, end - time.time()))
    return False


def _invoke_image_engine(
    engine: str,
    prompt: str,
    reference_images: list[str],
    output_file: str,
    aspect_ratio: str,
    api_key: str,
) -> str:
    """调用指定生图引擎，成功则返回结果描述。"""
    if engine == ENGINE_GEMINI:
        return _call_gemini_api(prompt, reference_images, output_file, aspect_ratio, api_key)
    if engine in (ENGINE_DALLE, "openai"):
        return _call_openai_image_api(prompt, reference_images, output_file, aspect_ratio, api_key)
    return _call_minimax_api(prompt, reference_images, output_file, aspect_ratio, api_key)


def generate_with_retry(
    scene_template: dict,
    product: dict,
    reference_images: list[str],
    output_file: str,
    engine: str,
    api_key: str,
    extra_vars: Optional[dict] = None,
    progress_callback: Optional[Callable] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> dict:
    """生成单张图，带重试；主引擎失败后自动尝试其他已配置引擎。"""
    scene_id = scene_template.get("scene_id", "unknown")
    scene_name = scene_template.get("scene_name_cn", scene_id)

    # 注入变量
    injected = inject_variables(scene_template, product, extra_vars)
    aspect_ratio = injected.get("aspect_ratio", "1:1")

    engines_to_try = image_engine_fallback_order(engine)
    primary = "dalle" if (engine or "").lower() in ("dalle", "openai") else (engine or "gemini").lower()
    if api_key and primary not in engines_to_try:
        engines_to_try.insert(0, primary)

    if cancel_check and cancel_check():
        return {
            "scene_id": scene_id,
            "scene_name": scene_name,
            "success": False,
            "attempts": 0,
            "output_path": None,
            "error": "cancelled",
            "engine": primary,
            "cancelled": True,
        }

    if not engines_to_try:
        friendly = friendly_image_error_message("API key not set", engine)
        return {
            "scene_id": scene_id,
            "scene_name": scene_name,
            "success": False,
            "attempts": 0,
            "output_path": None,
            "error": friendly,
            "engine": engine,
        }

    total_attempts = 0
    last_error = None
    last_error_details = {}
    last_engine = engines_to_try[0]

    for eng in engines_to_try:
        eng_key = api_key if eng == (engine if engine not in ("openai",) else "dalle") else get_image_api_key(eng)
        if not eng_key:
            continue
        last_engine = eng

        # 构建 prompt（按引擎）
        if eng == ENGINE_GEMINI or eng in (ENGINE_DALLE, "openai"):
            prompt = build_gemini_prompt(injected)
        else:
            prompt = build_minimax_prompt(injected)

        for attempt in range(MAX_RETRIES + 1):
            if cancel_check and cancel_check():
                return {
                    "scene_id": scene_id,
                    "scene_name": scene_name,
                    "success": False,
                    "attempts": total_attempts,
                    "output_path": None,
                    "error": "cancelled",
                    "engine": eng,
                    "cancelled": True,
                }
            if progress_callback:
                if len(engines_to_try) > 1 and eng != engines_to_try[0] and attempt == 0:
                    progress_callback(scene_id, scene_name, f"fallback_{eng}")
                else:
                    status_detail = "generating" if attempt == 0 else f"retry_{attempt}"
                    progress_callback(scene_id, scene_name, status_detail)

            try:
                result = _invoke_image_engine(
                    eng, prompt, reference_images, output_file, aspect_ratio, eng_key,
                )
                logger.info("Scene %s generated with engine=%s", scene_id, eng)
                return {
                    "scene_id": scene_id,
                    "scene_name": scene_name,
                    "success": True,
                    "attempts": total_attempts + 1,
                    "output_path": output_file,
                    "result": result,
                    "engine": eng,
                }

            except Exception as e:
                last_error = e
                last_error_details = {
                    "engine": eng,
                    "error_type": type(e).__name__,
                    "raw_error": str(e),
                }
                total_attempts += 1
                if is_terminal_image_provider_error(str(e)):
                    logger.warning(
                        "Scene %s hit non-retryable provider error on engine=%s: %s",
                        scene_id, eng, e,
                    )
                    break
                if attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    # 限流 / 服务端过载：加大退避，避免连环 429
                    err_text = str(e).lower()
                    if any(tok in err_text for tok in
                           ("429", "rate limit", "too many requests",
                            "503", "overloaded")):
                        delay = max(delay * 3, 10.0)
                    if progress_callback:
                        progress_callback(scene_id, scene_name, f"waiting_{delay:.0f}s")
                    if _sleep_cancellable(delay, cancel_check):
                        return {
                            "scene_id": scene_id,
                            "scene_name": scene_name,
                            "success": False,
                            "attempts": total_attempts,
                            "output_path": None,
                            "error": "cancelled",
                            "engine": eng,
                            "cancelled": True,
                        }
                else:
                    logger.warning(
                        "Scene %s failed on engine=%s after %d attempts: %s",
                        scene_id, eng, MAX_RETRIES + 1, e,
                    )
                    break

    raw_error = str(last_error) if last_error else ""
    friendly = friendly_image_error_message(raw_error, last_engine)
    return {
        "scene_id": scene_id,
        "scene_name": scene_name,
        "success": False,
        "attempts": total_attempts,
        "output_path": None,
        "error": friendly,
        "raw_error": raw_error,
        "error_details": last_error_details,
        "engine": last_engine,
    }


def generate_scene_with_auto_fallback(
    scene_template: dict,
    product: dict,
    reference_images: list[str],
    output_file: str,
    api_key: str,
    quality: str = "standard",
    extra_vars: Optional[dict] = None,
    progress_callback: Optional[Callable] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> dict:
    """多引擎模式：按优先级尝试引擎，主引擎失败时自动回退。"""
    from multi_engine_bridge import generate_with_best_engine

    scene_id = scene_template.get("scene_id", "unknown")
    scene_name = scene_template.get("scene_name_cn", scene_id)
    injected = inject_variables(scene_template, product, extra_vars)
    aspect_ratio = injected.get("aspect_ratio", "1:1")
    prompt = build_gemini_prompt(injected)
    category = product.get("category", "general")

    if cancel_check and cancel_check():
        return {
            "scene_id": scene_id,
            "scene_name": scene_name,
            "success": False,
            "attempts": 0,
            "output_path": None,
            "error": "cancelled",
            "engine": "auto",
            "cancelled": True,
        }

    if progress_callback:
        progress_callback(scene_id, scene_name, "generating")

    bridge_result = generate_with_best_engine(
        prompt=prompt,
        ref_images=reference_images,
        output_file=output_file,
        scene_id=scene_id,
        category=category,
        quality=quality,
        api_keys={"gemini": api_key} if api_key else None,
        aspect_ratio=aspect_ratio,
        fallback=True,
    )
    used_engine = bridge_result.get("engine", "unknown")
    if bridge_result.get("success"):
        return {
            "scene_id": scene_id,
            "scene_name": scene_name,
            "success": True,
            "attempts": 1,
            "output_path": output_file,
            "engine": used_engine,
            "result": bridge_result.get("message", ""),
        }
    return {
        "scene_id": scene_id,
        "scene_name": scene_name,
        "success": False,
        "attempts": 1,
        "output_path": None,
        "error": bridge_result.get("error", "auto engine failed"),
        "engine": used_engine,
    }


# ============================================================
# 同场景多候选选优（关键图一次生成多张，语义 QA 自动选最像的）
# ============================================================

def _expand_candidate_scenes(scenes: list) -> tuple[list, dict]:
    """把 candidates>1 的场景扩展出 __candN 影子场景。

    返回 (扩展后的场景列表, {主场景 id: [影子场景 id, ...]})。
    """
    expanded = []
    groups: dict[str, list] = {}
    for scene in scenes:
        expanded.append(scene)
        try:
            n = int(scene.get("candidates") or 1)
        except (TypeError, ValueError):
            n = 1
        main_id = scene.get("scene_id", "")
        if n <= 1 or not main_id:
            continue
        for k in range(1, min(n, 3)):
            alt = dict(scene)
            alt["scene_id"] = f"{main_id}__cand{k}"
            expanded.append(alt)
            groups.setdefault(main_id, []).append(alt["scene_id"])
    return expanded, groups


def _score_candidates(candidates: list, reference_images: list,
                      product_profile: dict) -> dict:
    """给每张候选图算综合分（0-100）：产品同一性 + 参考图保真 + 画面质量。

    identity（视觉 LLM）可用时权重 0.5/0.3/0.2；不可用时退化为
    保真 0.6 + 质量 0.4，保证离线也能选优而不是永远取第一张。
    """
    paths = [c["output_path"] for c in candidates]

    identity: dict[str, float] = {}
    try:
        from identity_qa import check_product_identity, identity_qa_enabled
        if reference_images and identity_qa_enabled():
            qa = check_product_identity(reference_images, paths, product_profile)
            if qa.get("available"):
                identity = {
                    os.path.basename(p["path"]): p["identity_score"]
                    for p in qa.get("per_image", [])
                    if p.get("identity_score") is not None
                }
    except Exception as e:  # noqa: BLE001 — 语义 QA 失败退化到本地指标
        logger.warning("候选 identity 评分失败: %s", e)

    fidelity: dict[str, float] = {}
    try:
        from visual_similarity import reference_fidelity_report
        if reference_images:
            rep = reference_fidelity_report(reference_images, paths)
            fidelity = {
                os.path.basename(p["file"]): p["fidelity"]
                for p in rep.get("per_image", [])
                if p.get("fidelity") is not None
            }
    except Exception as e:  # noqa: BLE001
        logger.warning("候选保真度评分失败: %s", e)

    quality: dict[str, float] = {}
    try:
        from emotion_scorer import score_image_quality
        for p in paths:
            q = score_image_quality(p)
            if q.get("quality_score") is not None and not q.get("error"):
                quality[os.path.basename(p)] = q["quality_score"]
    except Exception as e:  # noqa: BLE001
        logger.warning("候选质量评分失败: %s", e)

    scores = {}
    for p in paths:
        name = os.path.basename(p)
        idn, fid, qua = identity.get(name), fidelity.get(name), quality.get(name)
        if idn is not None:
            score = (idn * 0.5
                     + (fid if fid is not None else idn) * 0.3
                     + (qua if qua is not None else 50) * 0.2)
        elif fid is not None or qua is not None:
            score = ((fid if fid is not None else 50) * 0.6
                     + (qua if qua is not None else 50) * 0.4)
        else:
            score = None
        scores[name] = None if score is None else round(score, 1)
    return scores


def _finalize_candidate_groups(
    results: list,
    candidate_groups: dict,
    reference_images: list,
    product_profile: dict,
    output_dir: str,
) -> list:
    """每组候选里按综合分（同一性+保真+质量）选最优放到主文件名，其余归档到 alts/。"""
    alt_ids_all = {a for alts in candidate_groups.values() for a in alts}
    if not candidate_groups:
        return results
    by_id = {r.get("scene_id"): r for r in results}

    for main_id, alt_ids in candidate_groups.items():
        main = by_id.get(main_id)
        if main is None:
            continue
        candidates = [
            by_id[cid] for cid in [main_id] + alt_ids
            if by_id.get(cid, {}).get("success")
            and by_id[cid].get("output_path")
            and os.path.exists(by_id[cid]["output_path"])
        ]
        if not candidates:
            continue

        winner = candidates[0]
        if len(candidates) > 1:
            try:
                scores = _score_candidates(
                    candidates, reference_images, product_profile)

                def _score(c):
                    s = scores.get(os.path.basename(c["output_path"]))
                    return -1 if s is None else s

                if any(v is not None for v in scores.values()):
                    winner = max(candidates, key=_score)
                    logger.info(
                        "Best-of candidates for %s: winner=%s scores=%s",
                        main_id, os.path.basename(winner["output_path"]), scores,
                    )
            except Exception as e:  # noqa: BLE001 — 选优失败保持默认第一张
                logger.warning("候选选优失败（保留默认）: %s", e)

        main_path = (main.get("output_path")
                     or os.path.join(output_dir, f"{main_id}.jpg"))
        if winner is not main:
            if main.get("success") and os.path.exists(main_path):
                tmp = main_path + ".swap"
                os.replace(main_path, tmp)
                os.replace(winner["output_path"], main_path)
                os.replace(tmp, winner["output_path"])
            else:
                os.replace(winner["output_path"], main_path)
            main.update({
                "success": True,
                "output_path": main_path,
                "engine": winner.get("engine", main.get("engine")),
                "error": None,
                "best_of_promoted": True,
            })

        # 落选候选移到 alts/ 子目录，避免混进平台导出与打包
        alts_dir = os.path.join(output_dir, "alts")
        for k, cid in enumerate(alt_ids, 1):
            alt = by_id.get(cid)
            path = (alt or {}).get("output_path")
            if path and os.path.exists(path):
                os.makedirs(alts_dir, exist_ok=True)
                dest = os.path.join(alts_dir, f"{main_id}_alt{k}.jpg")
                try:
                    os.replace(path, dest)
                except OSError:
                    pass

    return [r for r in results if r.get("scene_id") not in alt_ids_all]


# ============================================================
# 批量生成主逻辑
# ============================================================

def batch_generate(
    product_profile: dict,
    reference_images: list[str],
    scene_plan: list[dict],
    scene_dir: str,
    output_dir: str,
    engine: str = ENGINE_GEMINI,
    api_key: Optional[str] = None,
    parallel: bool = True,
    auto_engine: bool = False,
    quality: str = "standard",
    extra_vars: Optional[dict] = None,
    batch_progress_callback: Optional[Callable] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> list[dict]:
    """
    批量生成场景图。

    auto_engine: 为每个场景自动选择最佳引擎（需 engine_config.yaml）
    quality: 质量等级 (premium/standard/draft)

    返回:
        [{scene_id, scene_name, success, attempts, output_path, error}, ...]
    """
    engine = resolve_image_engine(engine)
    if not api_key:
        api_key = get_image_api_key(engine)

    configured = list_configured_image_engines()
    if not configured and not api_key:
        logger.error("No image generation API keys configured")
        print("❌ 未配置任何生图 API Key")
        print("   请在 agent/.env 中设置 OPENAI_API_KEY，或设置 OPENAI_IMAGE_API_KEY / MINIMAX_API_KEY")
        return []

    os.makedirs(output_dir, exist_ok=True)

    # 加载场景模板。plan 项自带 prompt 时视为内联场景定义
    # （前端/编排层动态规划的上架套图），无需磁盘模板文件。
    scenes = []
    for plan_item in scene_plan:
        scene_id = plan_item.get("scene_id", "")
        if plan_item.get("prompt"):
            template = dict(plan_item)
            template.setdefault("scene_name", scene_id or "custom scene")
            template.setdefault("scene_name_cn", template["scene_name"])
            template.setdefault("aspect_ratio", "1:1")
        else:
            scene_path = os.path.join(scene_dir, scene_id + ".json")
            if not os.path.exists(scene_path):
                print(f"  ⚠️ 场景模板不存在: {scene_path}")
                continue
            template = load_scene_template(scene_path)
        # 合并 plan 中的评分信息
        template["_plan_score"] = plan_item.get("final_score", 0)
        template["_emotion"] = plan_item.get("emotion", "")
        scenes.append(template)

    if not scenes:
        print("❌ 场景计划为空：既没有内联 prompt，也没有匹配到场景模板文件")
        return []

    # 关键场景多候选（candidates>1）：扩展影子场景，生成后语义 QA 选优
    scenes, candidate_groups = _expand_candidate_scenes(scenes)

    total = len(scenes)

    # 场景进度追踪（供 Web UI 实时展示）
    import threading
    scene_states = []
    for i, scene in enumerate(scenes):
        sid = scene.get("scene_id", f"scene_{i}")
        scene_states.append({
            "scene_id": sid,
            "scene_name": scene.get("scene_name_cn") or scene.get("scene_name") or sid,
            "status": "pending",
            "filename": f"{sid}.jpg",
            "index": i,
        })
    progress_lock = threading.Lock()

    def _emit(event: str, **kwargs):
        if not batch_progress_callback:
            return
        with progress_lock:
            batch_progress_callback({"event": event, "scenes": list(scene_states), **kwargs})

    def _set_scene_status(scene_id: str, status: str, **extra):
        with progress_lock:
            for s in scene_states:
                if s["scene_id"] == scene_id:
                    s["status"] = status
                    s.update(extra)
                    break

    _emit("init", total=total, message="准备开始创作...")

    # 打印摘要
    engine_label = "auto" if auto_engine else engine
    fallback_note = ""
    if not auto_engine and len(configured) > 1:
        fallback_note = f" | 回退: {', '.join(e for e in configured if e != engine)}"
    if not auto_engine and not api_key:
        logger.warning("No API key for image engine %s", engine)
        print(f"  ⚠️  未配置 {engine} 的 API Key，将尝试其他已配置引擎")
    print(f"\n{color('='*80, 'cyan')}")
    print(f"  📦 {color(product_profile.get('product_name', '未命名'), 'bold')}")
    print(f"  🎯 场景: {total} 个 | ⚙️  {engine_label}{fallback_note} | {'并行' if parallel else '串行'}")
    print(f"  📁 输出: {os.path.abspath(output_dir)}")
    print(f"{color('='*80, 'cyan')}\n")

    # 加载引擎配置（auto_engine 模式）
    engine_cfg = {}
    engine_selector = None
    if auto_engine:
        try:
            import yaml
            cfg_path = os.path.join(os.path.dirname(__file__), "..", "engine_config.yaml")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r") as f:
                    engine_cfg = yaml.safe_load(f)
                from multi_engine_bridge import select_best_engine
                engine_selector = select_best_engine
        except ImportError:
            print("  ⚠️  auto-engine 需要 PyYAML: pip install pyyaml")
            print("  回退到指定引擎模式")
            auto_engine = False

    # 进度条
    pb = ProgressBar(total, prefix="  Generating scenes", width=45)

    def on_progress(scene_id, scene_name, status):
        if status == "generating":
            _set_scene_status(scene_id, "generating")
            _emit("scene_start", scene_id=scene_id, scene_name=scene_name,
                  message=f"正在创作：{scene_name}...")
        elif status.startswith("retry"):
            _set_scene_status(scene_id, "retrying")
            _emit("scene_retry", scene_id=scene_id, scene_name=scene_name,
                  message=f"重试中：{scene_name}...")

    def _mark_remaining_cancelled(from_index: int):
        with progress_lock:
            for s in scene_states:
                if s.get("index", 0) >= from_index and s.get("status") == "pending":
                    s["status"] = "cancelled"
        _emit("cancelled", message="已取消剩余场景...")

    results = []
    cancelled = False
    if parallel and total > 1:
        with ThreadPoolExecutor(max_workers=min(total, MAX_WORKERS)) as pool:
            future_map = {}
            for scene in scenes:
                if cancel_check and cancel_check():
                    cancelled = True
                    idx = scenes.index(scene)
                    _mark_remaining_cancelled(idx)
                    break
                scene_id = scene.get("scene_id", "unknown")
                scene_engine = engine
                if auto_engine and engine_selector:
                    category = product_profile.get("category", "general")
                    engine_rank = engine_selector(scene_id, category, quality, engine_cfg)
                    scene_engine = engine_rank[0] if engine_rank else engine
                    scene_api_key = api_key or os.getenv(f"{scene_engine.upper()}_API_KEY")
                else:
                    scene_api_key = api_key or get_image_api_key(scene_engine)

                fname = f"{scene_id}.jpg"
                output_path = os.path.join(output_dir, fname)

                def _scene_cb(sid=scene_id, sname=scene.get("scene_name_cn", scene_id)):
                    return lambda sc_id, sc_name, st: on_progress(sid, sname, st)

                if auto_engine and engine_selector:
                    future = pool.submit(
                        generate_scene_with_auto_fallback,
                        scene_template=scene,
                        product=product_profile,
                        reference_images=reference_images,
                        output_file=output_path,
                        api_key=api_key,
                        quality=quality,
                        extra_vars=extra_vars,
                        progress_callback=_scene_cb(),
                        cancel_check=cancel_check,
                    )
                    scene_engine = "auto"
                else:
                    future = pool.submit(
                        generate_with_retry,
                        scene_template=scene,
                        product=product_profile,
                        reference_images=reference_images,
                        output_file=output_path,
                        engine=scene_engine,
                        api_key=scene_api_key,
                        extra_vars=extra_vars,
                        progress_callback=_scene_cb(),
                        cancel_check=cancel_check,
                    )
                future_map[future] = (scene_id, scene.get("scene_name_cn", ""), scene_engine, fname)

            for future in as_completed(future_map):
                if cancel_check and cancel_check():
                    cancelled = True
                    pending_ids = {fid for fid, st in future_map.items() if not fid.done()}
                    for fid in pending_ids:
                        sid, sname, seng, fn = future_map[fid]
                        _set_scene_status(sid, "cancelled", filename=fn)
                    break
                scene_id, scene_name_cn, scene_engine, fname = future_map[future]
                try:
                    result = future.result()
                    if result.get("cancelled"):
                        cancelled = True
                    if not result.get("engine") and scene_engine:
                        result["engine"] = scene_engine
                    results.append(result)
                    used_engine = result.get("engine", scene_engine)
                    if result.get("success"):
                        saved_name = os.path.basename(result.get("output_path") or fname)
                        _set_scene_status(scene_id, "done", filename=saved_name, engine=used_engine)
                        _emit("scene_done", scene_id=scene_id, scene_name=scene_name_cn,
                              filename=saved_name, engine=used_engine, success=True,
                              message=f"已完成：{scene_name_cn} ({used_engine})")
                    else:
                        err_msg = friendly_image_error_message(
                            result.get("error", ""), result.get("engine", scene_engine)
                        )
                        _set_scene_status(
                            scene_id, "failed", filename=fname, engine=used_engine,
                            error=err_msg, raw_error=result.get("raw_error", ""),
                        )
                        _emit("scene_done", scene_id=scene_id, scene_name=scene_name_cn,
                              filename=fname, engine=used_engine, success=False,
                              raw_error=result.get("raw_error", ""),
                              error=err_msg,
                              message=f"失败：{scene_name_cn} — {err_msg}")
                except Exception as e:
                    results.append({
                        "scene_id": scene_id,
                        "scene_name": scene_name_cn,
                        "success": False,
                        "output_path": None,
                        "error": str(e),
                    })
                    _set_scene_status(scene_id, "failed", filename=fname, raw_error=str(e))
                    _emit("scene_done", scene_id=scene_id, scene_name=scene_name_cn,
                          filename=fname, success=False, raw_error=str(e), message=str(e))
                finally:
                    pb.update()
                if cancelled:
                    idx = next(
                        (i for i, s in enumerate(scenes) if s.get("scene_id") == scene_id),
                        len(scenes),
                    )
                    _mark_remaining_cancelled(idx + 1)
                    break

        scene_order = {s.get("scene_id", f"s{i}"): i for i, s in enumerate(scenes)}
        results.sort(key=lambda r: scene_order.get(r.get("scene_id", ""), 999))

    else:
        for scene in scenes:
            if cancel_check and cancel_check():
                cancelled = True
                idx = scenes.index(scene)
                _mark_remaining_cancelled(idx)
                break
            scene_id = scene.get("scene_id", "unknown")
            scene_name = scene.get("scene_name_cn", scene_id)
            scene_engine = engine
            scene_api_key = api_key
            if auto_engine and engine_selector:
                category = product_profile.get("category", "general")
                engine_rank = engine_selector(scene_id, category, quality, engine_cfg)
                scene_engine = engine_rank[0] if engine_rank else engine
                scene_api_key = api_key or os.getenv(f"{scene_engine.upper()}_API_KEY")
            fname = f"{scene_id}.jpg"
            output_path = os.path.join(output_dir, fname)
            if auto_engine and engine_selector:
                result = generate_scene_with_auto_fallback(
                    scene_template=scene,
                    product=product_profile,
                    reference_images=reference_images,
                    output_file=output_path,
                    api_key=api_key,
                    quality=quality,
                    extra_vars=extra_vars,
                    progress_callback=on_progress,
                    cancel_check=cancel_check,
                )
                scene_engine = result.get("engine", "auto")
            else:
                result = generate_with_retry(
                    scene_template=scene,
                    product=product_profile,
                    reference_images=reference_images,
                    output_file=output_path,
                    engine=scene_engine,
                    api_key=scene_api_key,
                    extra_vars=extra_vars,
                    progress_callback=on_progress,
                    cancel_check=cancel_check,
                )
                result["engine"] = scene_engine
            results.append(result)
            if result.get("cancelled") or (cancel_check and cancel_check()):
                cancelled = True
                _mark_remaining_cancelled(scenes.index(scene) + 1)
                break
            if result.get("success"):
                saved_name = os.path.basename(result.get("output_path") or fname)
                _set_scene_status(scene_id, "done", filename=saved_name, engine=scene_engine)
                _emit("scene_done", scene_id=scene_id, scene_name=scene_name,
                      filename=saved_name, engine=scene_engine, success=True,
                      message=f"已完成：{scene_name} ({scene_engine})")
            else:
                err_msg = friendly_image_error_message(
                    result.get("error", ""), result.get("engine", scene_engine)
                )
                _set_scene_status(
                    scene_id, "failed", filename=fname, engine=scene_engine,
                    error=err_msg, raw_error=result.get("raw_error", ""),
                )
                _emit("scene_done", scene_id=scene_id, scene_name=scene_name,
                      filename=fname, engine=scene_engine, success=False,
                      raw_error=result.get("raw_error", ""),
                      error=err_msg,
                      message=f"失败：{scene_name} — {err_msg}")
            pb.update(suffix=scene_name)

    if cancelled:
        _emit("cancelled", message="生成已取消")

    # 多候选选优：每组挑同一性最高的一张作为正式图
    if candidate_groups:
        if cancelled:
            alt_ids = {a for alts in candidate_groups.values() for a in alts}
            results = [r for r in results if r.get("scene_id") not in alt_ids]
        else:
            results = _finalize_candidate_groups(
                results, candidate_groups, reference_images,
                product_profile, output_dir)
        total = len(results) or total

    # 统计
    success_count = sum(1 for r in results if r["success"])
    fail_count = sum(1 for r in results if not r["success"])
    total_attempts = sum(r.get("attempts", 1) for r in results)

    # 结果表格
    print(f"\n{color('  Results:', 'bold')}")
    if auto_engine:
        print(f"  {'':>3} {'Scene':<20} {'Engine':<12} {'Status':<10} {'Retries':<8} {'Output':<30}")
        print(f"  {'-'*3} {'-'*20} {'-'*12} {'-'*10} {'-'*8} {'-'*30}")
        for i, r in enumerate(results, 1):
            status = color("✅ OK", "green") if r["success"] else color("❌ FAIL", "red")
            retry = r.get("attempts", 1) - 1
            retry_str = f"({retry}x)" if retry > 0 else ""
            eng = r.get("_engine", "")
            out = r.get("output_path", "") or r.get("error", "")[:28]
            print(f"  {i:>3} {r['scene_name']:<20} {eng:<12} {status:<10} {retry_str:<8} {os.path.basename(out) if out else '':<30}")
    else:
        print(f"  {'':>3} {'Scene':<20} {'Status':<10} {'Retries':<8} {'Output':<30}")
        print(f"  {'-'*3} {'-'*20} {'-'*10} {'-'*8} {'-'*30}")
        for i, r in enumerate(results, 1):
            status = color("✅ OK", "green") if r["success"] else color("❌ FAIL", "red")
            retry = r.get("attempts", 1) - 1
            retry_str = f"({retry}x)" if retry > 0 else ""
            out = r.get("output_path", "") or r.get("error", "")[:28]
            print(f"  {i:>3} {r['scene_name']:<20} {status:<10} {retry_str:<8} {os.path.basename(out) if out else '':<30}")

    # 汇总
    print(f"\n{color('='*50, 'cyan')}")
    avg_attempts = total_attempts / max(total, 1)
    print(f"  📊 {success_count} 成功 / {fail_count} 失败 / {total} 总计")
    print(f"  🔄 平均尝试: {avg_attempts:.1f}x / 场景")
    print(f"  📁 输出: {os.path.abspath(output_dir)}")
    print(f"{color('='*50, 'cyan')}\n")

    # 生成 summary
    summary = {
        "product_name": product_profile.get("product_name", ""),
        "generated_at": datetime.now().isoformat(),
        "engine": engine,
        "total_scenes": total,
        "success_count": success_count,
        "fail_count": fail_count,
        "total_api_calls": total_attempts,
        "output_dir": os.path.abspath(output_dir),
        "results": results,
    }
    with open(os.path.join(output_dir, "_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return results


# ============================================================
# CLI入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="📸 产品图批量生成 v2 — 分析→匹配→生成 一站式",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
快速开始:
  # 一键完成（分析+匹配+生成）
  python generate_batch.py --images product.jpg --output ./outputs

  # 使用已有产品档案
  python generate_batch.py --product-profile profile.json --reference-images product.jpg

完整示例:
  python generate_batch.py \\
    --images front.jpg side.jpg detail.jpg \\
    --output ./outputs/my_bag \\
    --engine gemini \\
    --parallel

  python generate_batch.py \\
    --product-profile profile.json \\
    --reference-images product.jpg \\
    --scene-plan scene_plan.json \\
    --output ./outputs \\
    --engine minimax \\
    --no-parallel
        """,
    )

    # 输入方式：图片（自动分析）或 已有档案
    input_group = parser.add_argument_group("input", "输入方式（二选一）")
    input_group.add_argument("--images", nargs="+", default=None,
                             help="产品图片路径（自动分析特征）")
    input_group.add_argument("--product-profile", default=None,
                             help="已有产品档案 JSON 路径")
    input_group.add_argument("--reference-images", nargs="*", default=None,
                             help="参考图路径（与 --product-profile 搭配）")

    # 场景控制
    parser.add_argument("--scene-plan", default=None,
                        help="场景计划 JSON 路径（由 scene_matcher.py 生成）")
    parser.add_argument("--scenes", nargs="+", default=None,
                        help="指定场景 scene_id 列表")
    parser.add_argument("--scene-dir", default=None,
                        help="场景模板目录（默认: ../templates/scenes）")
    parser.add_argument("--category", default=None,
                        choices=["fashion", "home", "digital", "food", "beauty", "sports"],
                        help="产品类目（默认自动检测）")
    parser.add_argument("--skip-scenes", nargs="*", default=[],
                        help="排除的场景 scene_id")
    parser.add_argument("--prefer-scenes", nargs="*", default=[],
                        help="优先场景 scene_id")

    # 引擎控制
    parser.add_argument("--engine", choices=[ENGINE_GEMINI, ENGINE_MINIMAX, ENGINE_MIDJOURNEY, ENGINE_DALLE, ENGINE_SD_LOCAL],
                        default=ENGINE_DALLE, help="AI 引擎（默认: OpenAI gpt-image）")
    parser.add_argument("--auto-engine", action="store_true",
                        help="自动为每个场景选择最佳引擎（覆盖 --engine）")
    parser.add_argument("--quality", choices=["premium", "standard", "draft"],
                        default="standard", help="质量等级（auto-engine 模式）")
    parser.add_argument("--api-key", default=None,
                        help="API Key（默认从环境变量读取）")
    parser.add_argument("--no-parallel", action="store_true",
                        help="串行生成（默认并行）")
    parser.add_argument("--output", "-o", default=None,
                        help="输出目录（默认: ./outputs/<product_name>/）")

    args = parser.parse_args()

    # ========================================
    # 解析路径
    # ========================================
    script_dir = os.path.dirname(__file__)
    if args.scene_dir is None:
        args.scene_dir = os.path.join(script_dir, "..", "templates", "scenes")
    args.scene_dir = os.path.abspath(args.scene_dir)

    # ========================================
    # 获取 API Key
    # ========================================
    resolved_engine = resolve_image_engine(args.engine)
    api_key = args.api_key or get_image_api_key(resolved_engine)
    args.engine = resolved_engine
    if not api_key:
        print(f"❌ 未设置生图 API Key（引擎: {resolved_engine}）")
        print("   export OPENAI_API_KEY=your_key   (OpenAI gpt-image)")
        print("   export OPENAI_IMAGE_API_KEY=your_key  (可选：单独用于生图)")
        sys.exit(1)

    # ========================================
    # 获取产品档案
    # ========================================
    profile = None
    ref_images = []

    if args.images:
        # 模式1：从图片自动分析
        valid_imgs = [p for p in args.images if os.path.exists(p)]
        if not valid_imgs:
            print("❌ 没有有效的图片文件")
            sys.exit(1)
        ref_images = valid_imgs

        print(f"📸 产品图片: {len(valid_imgs)} 张")
        profile = analyze_and_create_profile(
            images=valid_imgs,
            api_key=api_key,
            engine=args.engine,
            output_dir=os.path.dirname(args.output) if args.output else None,
        )

    elif args.product_profile:
        # 模式2：使用已有产品档案
        if not os.path.exists(args.product_profile):
            print(f"❌ 产品档案不存在: {args.product_profile}")
            sys.exit(1)
        profile = load_product_profile(args.product_profile)
        ref_images = args.reference_images or []
        print(f"📖 加载产品档案: {args.product_profile}")

    else:
        print("❌ 请提供 --images（自动分析）或 --product-profile（已有档案）")
        sys.exit(1)

    # ========================================
    # 校验参考图
    # ========================================
    if ref_images:
        ref_images = [p for p in ref_images if os.path.exists(p)]
        if not ref_images:
            print("⚠️  参考图无效，将无参考图生成")
    print(f"🖼️  参考图: {len(ref_images)} 张")

    # ========================================
    # 获取场景列表
    # ========================================
    scenes_to_generate = []

    if args.scene_plan:
        # 从场景计划文件加载
        with open(args.scene_plan, "r", encoding="utf-8") as f:
            plan = json.load(f)
        scenes_to_generate = plan.get("scenes", [])
        print(f"📋 加载场景计划: {args.scene_plan}")

    elif args.scenes:
        # 指定场景列表
        scenes_to_generate = [{"scene_id": s} for s in args.scenes]

    else:
        # 自动匹配
        print(f"🔍 正在匹配最佳场景...")
        scenes_to_generate = match_scenes(
            profile=profile,
            category=args.category,
            skip=args.skip_scenes or None,
            prefer=args.prefer_scenes or None,
        )

    # ========================================
    # 生成
    # ========================================
    if not scenes_to_generate:
        print("❌ 没有场景需要生成")
        sys.exit(1)

    product_name = profile.get("product_name", "product").replace(" ", "_").lower()
    output_dir = args.output or os.path.join(
        os.path.dirname(script_dir), "outputs",
        f"{product_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )

    batch_generate(
        product_profile=profile,
        reference_images=ref_images,
        scene_plan=scenes_to_generate,
        scene_dir=args.scene_dir,
        output_dir=output_dir,
        engine=args.engine,
        api_key=api_key,
        parallel=not args.no_parallel,
        auto_engine=args.auto_engine,
        quality=args.quality,
    )


if __name__ == "__main__":
    main()
