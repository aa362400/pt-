#!/usr/bin/env python3
"""
电商产品图智能体 — 公共工具模块

集中管理所有脚本公用的工具函数，消除重复代码。
"""
import base64
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from common.runtime_paths import get_runtime_paths


# ============================================================
# 日志基础设施
# ============================================================

LOG_DIR = get_runtime_paths().logs

def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    """
    统一日志配置。
    所有脚本用这个替代 print()。

    用法:
        from common.utils import setup_logger
        logger = setup_logger(__name__)
        logger.info("消息")
        logger.error("错误")
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # 避免重复配置

    os.makedirs(LOG_DIR, exist_ok=True)

    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
    }
    logger.setLevel(level_map.get(level.upper(), logging.INFO))

    # 控制台 handler
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    logger.addHandler(console)

    # 文件 handler（按天轮转）
    log_file = os.path.join(LOG_DIR, f"agent_{datetime.now().strftime('%Y%m%d')}.log")
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s",
    ))
    logger.addHandler(file_handler)

    return logger


# ============================================================
# MIME 类型嗅探（消除 5 个文件的重复 _guess_mime）
# ============================================================

MIME_MAP = {
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def guess_mime(path: str) -> str:
    """根据文件后缀猜测 MIME 类型"""
    ext = Path(path).suffix.lower()
    return MIME_MAP.get(ext, "image/jpeg")


# ============================================================
# Base64 编解码（消除多处重复）
# ============================================================

def encode_image_base64(path: str) -> str:
    """读取图片文件并返回 base64 编码"""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def image_to_data_url(path: str) -> str:
    """返回 data URL 格式的图片数据"""
    mime = guess_mime(path)
    b64 = encode_image_base64(path)
    return f"data:{mime};base64,{b64}"


def save_base64_image(base64_data: str, output_path: str):
    """将 base64 图片数据保存为文件"""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(base64.b64decode(base64_data))


# ============================================================
# LLM 响应解析（消除多处重复 _parse_json_response）
# ============================================================

def parse_json_response(text: str) -> dict:
    """
    从 LLM 响应中提取 JSON。
    处理 ```json ... ``` 包裹和纯 JSON 两种情况。
    """
    text = text.strip()

    # 尝试直接解析
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # 尝试提取 ```json ... ``` 块
    for delimiter in ["```json", "```"]:
        if delimiter in text:
            start = text.index(delimiter) + len(delimiter)
            end = text.index("```", start) if "```" in text[start:] else len(text)
            try:
                return json.loads(text[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                continue

    raise ValueError(f"无法从 LLM 响应中解析 JSON:\n{text[:500]}")


# ============================================================
# 颜色工具
# ============================================================

def hex_to_rgb(hex_color: str) -> tuple:
    """#FF0000 → (255, 0, 0)"""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


# ============================================================
# 图片扩展名常量
# ============================================================

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def collect_images(directory: str) -> list[str]:
    """
    从目录收集所有图片文件的完整路径。
    排除 _ 开头文件。
    """
    if not os.path.isdir(directory):
        return []
    return sorted([
        os.path.join(directory, f) for f in os.listdir(directory)
        if f.lower().endswith(IMAGE_EXTS) and not f.startswith("_")
    ])


# ============================================================
# 目录工具
# ============================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ensure_output_dirs(base_dir: str) -> dict:
    """创建标准输出目录结构，返回路径映射"""
    dirs = {
        "root": base_dir,
        "raw": os.path.join(base_dir, "raw"),
        "final": os.path.join(base_dir, "final"),
        "layout": os.path.join(base_dir, "layout"),
        "platforms": os.path.join(base_dir, "platforms"),
        "reports": os.path.join(base_dir, "reports"),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)
    return dirs


# ============================================================
# 场景模板变量的占位符替换
# ============================================================

def inject_variables(template: dict, product: dict, extra_vars: Optional[dict] = None) -> dict:
    """注入产品变量到模板的所有字符串字段"""
    vars_map = {
        "product_name": product.get("product_name", ""),
        "product_name_cn": product.get("product_name_cn", ""),
        "product_category": product.get("category", "product"),
        "product_category_cn": product.get("category_cn", "产品"),
        "product_description": product.get("description", ""),
        "product_materials": ", ".join(product.get("materials", [])),
        "product_style": product.get("style", ""),
        "key_features": ", ".join(product.get("key_features", [])),
        "primary_color": product.get("colors", {}).get("primary", "#808080"),
        "secondary_color": (product.get("colors", {}).get("accents", ["#808080"]) or ["#808080"])[0],
        "season": product.get("season", "秋季"),
        "variants_count": product.get("variants_count", "多种"),
        "target_audience": product.get("target_audience", ""),
        "emotion_keywords": ", ".join(product.get("emotion_keywords", [])),
    }
    if extra_vars:
        vars_map.update(extra_vars)

    result = {}
    for key, value in template.items():
        if isinstance(value, str):
            new_value = value
            for var_name, var_value in vars_map.items():
                placeholder = "{{" + var_name + "}}"
                if placeholder in new_value:
                    new_value = new_value.replace(placeholder, var_value)
            result[key] = new_value
        else:
            result[key] = value
    return result


# ============================================================
# API Key 安全获取（统一入口）
# ============================================================

def get_api_key(engine: str = "gemini", env_override: Optional[str] = None) -> str:
    """
    安全获取 API Key。
    优先使用参数传入，其次环境变量。
    支持引擎自动映射环境变量名。
    支持逗号分隔的多 Key 轮询（Key Pool），提高可用性。

    Args:
        engine: "gemini" / "minimax" / "midjourney" / "openai"
        env_override: 直接从该环境变量取值（最高优先级）

    Returns:
        API Key 字符串，未找到返回 ""
    """
    if env_override:
        return env_override

    env_map = {
        "gemini": "GEMINI_API_KEY",
        "minimax": "MINIMAX_API_KEY",
        "midjourney": "MIDJOURNEY_API_KEY",
        "dalle": "OPENAI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "sdxl_local": "SD_API_URL",
    }
    env_var = env_map.get(engine.lower(), "GEMINI_API_KEY")
    keys_str = os.getenv(env_var, "")
    # Key Pool：逗号分隔的多 Key 轮询
    if "," in keys_str:
        keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        if keys:
            # Try each key, skipping blacklisted ones
            from web.services.job_queue import get_circuit_breaker
            cb = get_circuit_breaker()
            for _ in range(len(keys)):
                idx = getattr(get_api_key, "_idx", 0) % len(keys)
                get_api_key._idx = idx + 1
                candidate = keys[idx]
                if cb.is_available(candidate):
                    return candidate
            # All keys blacklisted — return the next one anyway (fail open)
            idx = getattr(get_api_key, "_idx", 0) % len(keys)
            get_api_key._idx = idx + 1
            return keys[idx]
    return keys_str


# ============================================================
# 稳定排序助手
# ============================================================

def stable_unique(items: list, key_fn=None) -> list:
    """去重且保持顺序"""
    seen = set()
    result = []
    for item in items:
        k = key_fn(item) if key_fn else item
        if k not in seen:
            seen.add(k)
            result.append(item)
    return result


# ============================================================
# 平台别名规范化（Web 表单 / 聊天指令共用）
# ============================================================

# 跨境电商平台（不含国内淘宝/京东/拼多多/小红书/抖音等）
CROSS_BORDER_PLATFORMS = [
    "amazon_main",
    "amazon_detail",
    "shopify",
    "lazada",
    "shopline",
    "etsy",
    "alibaba",
    "tiktok_shop",
    "temu",
    "shein",
    "ebay",
    "walmart",
    "mercado_libre",
    "coupang",
]

CROSS_BORDER_PLATFORMS_CSV = ",".join(CROSS_BORDER_PLATFORMS)

PLATFORM_ALIASES = {
    "淘宝": "taobao_main",
    "taobao": "taobao_main",
    "天猫": "tmall_main",
    "tmall": "tmall_main",
    "亚马逊": "amazon_main",
    "amazon": "amazon_main",
    "亚马逊详情": "amazon_detail",
    "amazon_detail": "amazon_detail",
    "小红书": "xiaohongshu",
    "xiaohongshu": "xiaohongshu",
    "京东": "jd_main",
    "jd": "jd_main",
    "拼多多": "pdd_main",
    "pdd": "pdd_main",
    "shopify": "shopify",
    "lazada": "lazada",
    "来赞达": "lazada",
    "shopline": "shopline",
    "etsy": "etsy",
    "alibaba": "alibaba",
    "tiktok": "tiktok_shop",
    "tiktok shop": "tiktok_shop",
    "tiktok_shop": "tiktok_shop",
    "temu": "temu",
    "拼多多海外": "temu",
    "shein": "shein",
    "希音": "shein",
    "ebay": "ebay",
    "易贝": "ebay",
    "walmart": "walmart",
    "沃尔玛": "walmart",
    "mercado libre": "mercado_libre",
    "mercadolibre": "mercado_libre",
    "mercado_libre": "mercado_libre",
    "美客多": "mercado_libre",
    "coupang": "coupang",
    "酷澎": "coupang",
    "阿里巴巴": "alibaba",
    "阿里巴巴国际": "alibaba",
    "阿里巴巴国际站": "alibaba",
    "国际站": "alibaba",
    "跨境": "cross_border_all",
    "cross-border": "cross_border_all",
    "crossborder": "cross_border_all",
    "全部跨境": "cross_border_all",
    "所有跨境": "cross_border_all",
    "all cross-border": "cross_border_all",
}

_CROSS_BORDER_KEYWORDS = re.compile(
    r"(跨境|cross[- ]?border|海外平台|出海|export)",
    re.I,
)
_CROSS_BORDER_ALL_KEYWORDS = re.compile(
    r"(全部|所有|all|every)",
    re.I,
)


def normalize_platforms(raw) -> list:
    """
    将用户输入的平台名/别名规范化为内部 ID 列表。
    支持字符串（逗号/空格分隔）或 list。
    「跨境 / cross-border / 全部跨境」→ CROSS_BORDER_PLATFORMS。
    """
    if not raw:
        return []

    if isinstance(raw, str):
        if _CROSS_BORDER_KEYWORDS.search(raw) and _CROSS_BORDER_ALL_KEYWORDS.search(raw):
            return list(CROSS_BORDER_PLATFORMS)
        parts = [p.strip() for p in re.split(r"[,，、\s]+", raw) if p.strip()]
    else:
        parts = [str(p).strip() for p in raw if str(p).strip()]

    normalized = []
    for part in parts:
        key = part.lower()
        if part in PLATFORM_ALIASES:
            alias = PLATFORM_ALIASES[part]
        elif key in PLATFORM_ALIASES:
            alias = PLATFORM_ALIASES[key]
        else:
            alias = None

        if alias == "cross_border_all":
            normalized.extend(CROSS_BORDER_PLATFORMS)
            continue
        if alias:
            normalized.append(alias)
            continue
        if part.endswith("_main") or part in (
            "shopify", "xiaohongshu", "lazada", "shopline", "etsy", "alibaba",
            "amazon_detail",
        ):
            normalized.append(part)
        elif key:
            normalized.append(key)
    return stable_unique(normalized)


# ============================================================
# 产品分析 API 超时 / 图片预处理
# ============================================================

ANALYZE_API_TIMEOUT_DEFAULT = 120
ANALYZE_API_MAX_RETRIES = 2
ANALYZE_IMAGE_MAX_PX = 1024
ANALYZE_API_TIMEOUT_MESSAGE = (
    "API 响应超时，请检查网络或稍后重试；也可尝试换用 GEMINI_API_KEY"
)


class AnalyzeApiTimeoutError(RuntimeError):
    """视觉分析 API 超时（重试耗尽）"""


def get_analyze_api_timeout() -> int:
    """视觉分析单次 HTTP 超时（秒），环境变量 ANALYZE_API_TIMEOUT，默认 120。"""
    raw = os.getenv("ANALYZE_API_TIMEOUT", str(ANALYZE_API_TIMEOUT_DEFAULT)).strip()
    try:
        value = int(raw)
        return max(30, min(value, 600))
    except ValueError:
        return ANALYZE_API_TIMEOUT_DEFAULT


def get_analyze_subprocess_timeout() -> int:
    """
    analyze_product 子进程总超时：覆盖单次超时 × (1+重试) + 退避等待 + 缓冲。
    可通过 ANALYZE_SUBPROCESS_TIMEOUT 覆盖。
    """
    explicit = os.getenv("ANALYZE_SUBPROCESS_TIMEOUT", "").strip()
    if explicit:
        try:
            return max(60, int(explicit))
        except ValueError:
            pass
    api_timeout = get_analyze_api_timeout()
    backoff = sum(min(2 ** i, 30) for i in range(1, ANALYZE_API_MAX_RETRIES + 1))
    return api_timeout * (ANALYZE_API_MAX_RETRIES + 1) + backoff + 45


def prepare_image_for_vision_api(
    image_path: str,
    max_size: int = ANALYZE_IMAGE_MAX_PX,
) -> tuple[str, str]:
    """
    读取并可选缩放图片，返回 (base64_data, mime_type)。
    最长边超过 max_size 时等比缩小，以加快视觉 API 响应。
    """
    mime = guess_mime(image_path)
    try:
        from PIL import Image
        import io

        with Image.open(image_path) as img:
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
            elif img.mode != "RGB":
                img = img.convert("RGB")

            w, h = img.size
            if max(w, h) > max_size:
                ratio = max_size / float(max(w, h))
                img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

            buf = io.BytesIO()
            if img.mode == "RGBA":
                img.save(buf, format="PNG", optimize=True)
                out_mime = "image/png"
            elif mime == "image/webp":
                img.save(buf, format="WEBP", quality=85, method=4)
                out_mime = "image/webp"
            else:
                if img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(buf, format="JPEG", quality=85, optimize=True)
                out_mime = "image/jpeg"
            return base64.b64encode(buf.getvalue()).decode("utf-8"), out_mime
    except ImportError:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8"), mime
    except Exception:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8"), mime


# ============================================================
# 控制台编码 / 引擎选择 / 用户友好错误
# ============================================================

def configure_stdio_utf8() -> None:
    """Windows 默认 GBK 控制台无法输出 emoji，子进程也需调用。"""
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def resolve_openai_api_key(env_key: Optional[str] = None) -> str:
    """OpenAI 兼容 API Key（含 premium 路由，供聊天 / 分析 LLM 使用）。"""
    if env_key:
        return env_key
    model = os.getenv("LLM_MODEL", "gpt-4o")
    premium = os.getenv("OPENAI_API_KEY_PREMIUM", "")
    if premium and (
        model.startswith("gpt-5")
        or os.getenv("LLM_USE_PREMIUM", "").strip().lower() in ("1", "true", "yes")
    ):
        return premium
    return os.getenv("OPENAI_API_KEY", "")


def get_openai_vision_model(fallback: Optional[str] = None) -> str:
    """Return the model used for OpenAI-compatible vision requests."""
    return (
        os.getenv("VISION_MODEL", "").strip()
        or (fallback or "").strip()
        or os.getenv("LLM_MODEL", "").strip()
        or "gpt-4o"
    )


def get_openai_vision_api_base(fallback: Optional[str] = None) -> str:
    """Return the OpenAI-compatible vision API base without a trailing slash."""
    return (
        os.getenv("VISION_API_BASE", "").strip()
        or (fallback or "").strip()
        or os.getenv("OPENAI_API_BASE", "").strip()
        or "https://api.openai.com/v1"
    ).rstrip("/")


def resolve_openai_vision_api_key(env_key: Optional[str] = None) -> str:
    """Return a dedicated vision key, falling back to the chat provider key."""
    return (
        (env_key or "").strip()
        or os.getenv("VISION_API_KEY", "").strip()
        or resolve_openai_api_key().strip()
    )


def model_supports_vision(model: Optional[str]) -> bool:
    """Reject known text-only chat models before sending image content."""
    normalized = (model or "").strip().lower()
    if not normalized:
        return False
    return not normalized.startswith(("deepseek", "text-embedding"))


def openai_vision_available(model: Optional[str] = None) -> bool:
    """Whether an OpenAI-compatible provider is configured for image input."""
    return bool(
        resolve_openai_vision_api_key()
        and model_supports_vision(get_openai_vision_model(model))
    )


def resolve_image_openai_api_key(env_key: Optional[str] = None) -> str:
    """
    OpenAI 兼容生图 API Key（不走 LLM premium 路由）。
    优先 OPENAI_IMAGE_API_KEY，其次 OPENAI_API_KEY。
    """
    if env_key:
        return env_key
    image_provider_key = os.getenv("IMAGE_API_KEY", "").strip()
    if image_provider_key:
        return image_provider_key
    image_key = os.getenv("OPENAI_IMAGE_API_KEY", "").strip()
    if image_key:
        return image_key
    return os.getenv("OPENAI_API_KEY", "").strip()


def get_openai_image_api_base(fallback: Optional[str] = None) -> str:
    """Return the OpenAI-compatible image API base URL without a trailing slash."""
    base = (
        os.getenv("IMAGE_API_BASE_URL", "").strip()
        or os.getenv("OPENAI_API_BASE", "").strip()
        or (fallback or "").strip()
        or "https://api.openai.com/v1"
    )
    return base.rstrip("/")


def get_openai_image_model(fallback: Optional[str] = None) -> str:
    """Return the configured image model, preferring the dedicated image settings."""
    return (
        os.getenv("IMAGE_MODEL", "").strip()
        or os.getenv("OPENAI_IMAGE_MODEL", "").strip()
        or (fallback or "").strip()
        or "gpt-image-2"
    )


def image_provider_rejects_response_format(response: object) -> bool:
    """Detect OpenAI-compatible gateways that reject response_format.

    Some gateways advertise the Images API but return HTTP 400 with a stable
    ``unknown_parameter`` error for ``response_format``. Callers may retry once
    without that optional field and still consume either ``url`` or
    ``b64_json`` from the response.
    """
    if int(getattr(response, "status_code", 0) or 0) != 400:
        return False
    try:
        payload = response.json()
    except Exception:
        return False
    error = payload.get("error", payload) if isinstance(payload, dict) else {}
    if not isinstance(error, dict):
        return False
    return (
        str(error.get("code") or "").strip().lower() == "unknown_parameter"
        and str(error.get("param") or "").strip() == "response_format"
    )


def configured_image_key_candidates(explicit_key: Optional[str] = None) -> list[tuple[str, str]]:
    """Return unique image-provider keys in failover order without exposing values."""
    raw_candidates = [
        ("requested", (explicit_key or "").strip()),
        ("image_primary", os.getenv("IMAGE_API_KEY", "").strip()),
        ("openai_image_primary", os.getenv("OPENAI_IMAGE_API_KEY", "").strip()),
        ("image_backup", os.getenv("IMAGE_API_KEY_BACKUP", "").strip()),
        ("openai_image_backup", os.getenv("OPENAI_IMAGE_API_KEY_BACKUP", "").strip()),
        ("standard", os.getenv("OPENAI_API_KEY", "").strip()),
        ("premium", os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()),
    ]
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()
    for role, key in raw_candidates:
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append((role, key))
    return candidates


def configured_image_model_candidates() -> list[str]:
    """Return primary and backup image model IDs without duplicates."""
    raw = [
        get_openai_image_model(),
        os.getenv("IMAGE_MODEL_BACKUP", "").strip(),
        os.getenv("OPENAI_IMAGE_MODEL_BACKUP", "").strip(),
    ]
    return list(dict.fromkeys(model for model in raw if model))


def resolve_analysis_engine(
    explicit: Optional[str] = None,
    vision_model: Optional[str] = None,
) -> str:
    """
    自动选择产品分析引擎。
    ANALYZE_ENGINE 可强制 openai | gemini | minimax；
    未指定时优先 OpenAI 兼容（jojocode 等），其次 Gemini / MiniMax。
    """
    env_engine = os.getenv("ANALYZE_ENGINE", "").strip().lower()
    if env_engine in ("openai", "gemini", "minimax"):
        if env_engine == "openai" and openai_vision_available(vision_model):
            return "openai"
        if env_engine == "gemini" and os.getenv("GEMINI_API_KEY"):
            return "gemini"
        if env_engine == "minimax" and os.getenv("MINIMAX_API_KEY"):
            return "minimax"

    if explicit == "openai" and openai_vision_available(vision_model):
        return "openai"
    if explicit == "minimax":
        return "minimax"
    if openai_vision_available(vision_model):
        return "openai"
    if explicit == "gemini":
        return "gemini"
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("MINIMAX_API_KEY"):
        return "minimax"
    return explicit or "gemini"


# Gemini 生图模型（Nano Banana 系列，稳定版 ID）
GEMINI_IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image"
# 已废弃的 preview 模型 ID，自动映射到稳定版
_GEMINI_IMAGE_MODEL_ALIASES = {
    "gemini-3-pro-image-preview": "gemini-3-pro-image",
    "gemini-2.0-flash-preview-image-generation": "gemini-2.5-flash-image",
    "gemini-2.0-flash-exp-image-generation": "gemini-2.5-flash-image",
}


def get_gemini_image_model() -> str:
    """返回 Gemini 生图模型 ID（可通过 GEMINI_IMAGE_MODEL 覆盖）。"""
    raw = os.getenv("GEMINI_IMAGE_MODEL", GEMINI_IMAGE_MODEL_DEFAULT).strip()
    return _GEMINI_IMAGE_MODEL_ALIASES.get(raw, raw) or GEMINI_IMAGE_MODEL_DEFAULT


def gemini_image_generate_url(model: Optional[str] = None) -> str:
    """Gemini generateContent 生图端点 URL。"""
    model = model or get_gemini_image_model()
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def gemini_image_generation_config(aspect_ratio: str = "1:1", **extra) -> dict:
    """Gemini 生图 generationConfig（需 responseModalities 才会返回图片）。"""
    cfg: dict = {
        "responseModalities": ["TEXT", "IMAGE"],
        "imageConfig": {"aspectRatio": aspect_ratio},
    }
    cfg.update(extra)
    return cfg


def list_configured_image_engines() -> list[str]:
    """返回已配置 API Key 的生图引擎列表（按推荐优先级）。"""
    engines: list[str] = []
    if resolve_image_openai_api_key():
        engines.append("dalle")
    if os.getenv("GEMINI_API_KEY"):
        engines.append("gemini")
    if os.getenv("MINIMAX_API_KEY"):
        engines.append("minimax")
    return engines


def image_engine_fallback_order(primary: str) -> list[str]:
    """主引擎失败时的回退顺序（去重，仅含已配置 Key 的引擎）。"""
    primary_norm = "dalle" if (primary or "").lower() in ("dalle", "openai") else (primary or "gemini").lower()
    if primary_norm == "dalle":
        candidates = ["dalle", "minimax"]
    elif primary_norm == "gemini":
        candidates = ["gemini"]
    else:
        candidates = [primary_norm, "dalle", "minimax"]
    order: list[str] = []
    seen: set[str] = set()
    for eng in candidates:
        if eng in seen or not get_image_api_key(eng):
            continue
        seen.add(eng)
        order.append(eng)
    return order


def resolve_image_engine(explicit: Optional[str] = None) -> str:
    """
    自动选择图片生成引擎。
    IMAGE_ENGINE 可强制 gemini | dalle | openai | minimax；
    未指定时优先 OpenAI gpt-image-2，其次 Gemini / MiniMax。
    """
    env_engine = os.getenv("IMAGE_ENGINE", "").strip().lower()
    if env_engine in ("gemini", "minimax", "dalle", "openai"):
        if env_engine in ("dalle", "openai") and resolve_image_openai_api_key():
            return "dalle"
        if env_engine == "gemini" and os.getenv("GEMINI_API_KEY"):
            return "gemini"
        if env_engine == "minimax" and os.getenv("MINIMAX_API_KEY"):
            return "minimax"

    if explicit in ("dalle", "openai"):
        return "dalle"
    if explicit == "minimax":
        return "minimax"
    if explicit == "gemini" and os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if resolve_image_openai_api_key():
        return "dalle"
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("MINIMAX_API_KEY"):
        return "minimax"
    return explicit or "dalle"


def get_image_api_key(engine: str) -> str:
    """按图片引擎返回对应 API Key。"""
    eng = (engine or "dalle").lower()
    if eng in ("dalle", "openai"):
        return resolve_image_openai_api_key()
    return get_api_key(eng)


def friendly_image_error_message(error: str, engine: str = "") -> str:
    """将图片生成错误转为用户可读中文提示。"""
    lower = (error or "").lower()
    eng_label = {"gemini": "Gemini", "dalle": "OpenAI gpt-image-2", "minimax": "MiniMax"}.get(
        (engine or "").lower(), engine or "当前引擎"
    )
    if any(k in lower for k in (
        "api key not set", "api_key not set", "is not set", "not set. export",
        "未设置", "api key not configured",
    )):
        return f"请配置生图 API Key（{eng_label}）：在 agent/.env 中设置 OPENAI_API_KEY 或 OPENAI_IMAGE_API_KEY"
    if "no engine available" in lower:
        return "没有可用的生图引擎，请配置 OPENAI_API_KEY 或 OPENAI_IMAGE_API_KEY"
    if "insufficient_user_quota" in lower:
        return (
            "[IMAGE_PROVIDER_QUOTA_EXHAUSTED] 生图供应商额度不足，"
            "请充值当前图片 API 账户或切换已开通生图权限的备用供应商"
        )
    if "image_provider_fallback_exhausted" in lower:
        return (
            "[IMAGE_PROVIDER_FALLBACK_EXHAUSTED] 主图片额度不足，"
            "备用密钥或备用图片模型也不可用"
        )
    if "model_not_found" in lower or "no available channel for model" in lower:
        base = get_openai_image_api_base()
        if (engine or "").lower() in ("dalle", "openai") or "jojocode" in lower or "jojocode" in base:
            return (
                "OpenAI 代理未开通生图模型（gpt-image-2）。"
                "请更换支持 gpt-image 生图/编辑的 OPENAI_API_BASE，或检查 OPENAI_IMAGE_MODEL"
            )
        return f"{eng_label} 模型不可用，请检查 OPENAI_IMAGE_MODEL / GEMINI_IMAGE_MODEL 配置"
    if "403" in lower and "forbidden" in lower and (engine or "").lower() == "gemini":
        return (
            "Gemini 生图 API 拒绝访问（403）。"
            "请确认 GEMINI_API_KEY 有效，且 GEMINI_IMAGE_MODEL 为 gemini-2.5-flash-image 或 gemini-3-pro-image"
        )
    if "503" in lower and (engine or "").lower() in ("dalle", "openai"):
        return (
            "OpenAI 生图服务暂不可用（503）。"
            "请稍后重试，或更换支持 gpt-image 的 OPENAI_API_BASE"
        )
    if any(k in lower for k in ("额度不足", "insufficient quota", "quota exceeded",
                                "exceeded your current quota")):
        return "生图 API 额度不足：请给账户充值，或在 agent/.env 更换 OPENAI_API_KEY / OPENAI_IMAGE_API_KEY"
    if "403" in lower and "forbidden" in lower:
        return f"{eng_label} 生图接口拒绝了请求（403）：常见原因是额度用完或 Key 无权限，请检查/充值"
    if "no image data" in lower:
        return f"{eng_label} 未返回图片，请稍后重试或更换引擎"
    return friendly_error_message(error)


def is_terminal_image_provider_error(error: str) -> bool:
    """Return True for provider failures that cannot succeed by immediate retry."""
    lower = (error or "").lower()
    return any(code in lower for code in (
        "insufficient_user_quota",
        "image_provider_quota_exhausted",
        "image_provider_fallback_exhausted",
        "invalid_api_key",
        "model_not_found",
    ))


def raise_for_provider_error(response, provider: str = "AI") -> None:
    """Raise a stable quota error without leaking provider account metadata."""
    status_code = int(getattr(response, "status_code", 200) or 200)
    if status_code < 400:
        response.raise_for_status()
        return

    error_code = ""
    try:
        payload = response.json()
        provider_error = payload.get("error", payload) if isinstance(payload, dict) else payload
        if isinstance(provider_error, dict):
            error_code = str(provider_error.get("code") or "").strip()
    except Exception:
        pass

    if error_code == "insufficient_user_quota":
        raise RuntimeError(
            f"[MODEL_PROVIDER_QUOTA_EXHAUSTED] {provider} API quota exhausted "
            f"[{error_code}]"
        )
    response.raise_for_status()


def friendly_error_message(error: str) -> str:
    """将异常/子进程输出转为用户可读中文提示。"""
    err = (error or "").strip()
    if not err:
        return "执行失败，请稍后重试"

    lower = err.lower()
    if (
        "image_provider_quota_exhausted" in lower
        or "image_provider_fallback_exhausted" in lower
    ):
        return friendly_image_error_message(err)
    if (
        "model_provider_quota_exhausted" in lower
        or "insufficient_user_quota" in lower
    ):
        return (
            "[MODEL_PROVIDER_QUOTA_EXHAUSTED] 模型供应商额度不足，"
            "请充值当前 API 账户或切换可用的备用模型供应商"
        )
    if "model_provider_fallback_exhausted" in lower:
        return (
            "[MODEL_PROVIDER_FALLBACK_EXHAUSTED] 主模型额度不足，"
            "备用密钥或备用模型也不可用"
        )
    if "traceback" in lower:
        err = format_subprocess_error(stderr=err)
        lower = err.lower()

    if any(k in lower for k in ("api key not configured", "api_key not set", "not set. export")):
        return "请配置 API Key：在 agent/.env 中设置 OPENAI_API_KEY"
    if "未设置 api key" in lower or ("api key" in lower and "未" in err):
        return "请配置 API Key：在 agent/.env 中设置 OPENAI_API_KEY"
    if "没有有效的图片" in err or "filenotfounderror" in lower:
        return "未找到有效的产品图片，请重新上传"
    if "unicodeencodeerror" in lower:
        return "系统编码异常，请刷新页面后重试"
    if ANALYZE_API_TIMEOUT_MESSAGE in err:
        return ANALYZE_API_TIMEOUT_MESSAGE
    if any(k in lower for k in (
        "read timed out", "timed out", "timeout", "apitimeout",
        "analyzeapitimeouterror",
    )):
        return ANALYZE_API_TIMEOUT_MESSAGE
    if any(k in lower for k in ("connectionpool", "connection error", "connection refused")):
        return "网络连接失败，请检查网络或 API 地址（OPENAI_API_BASE）配置"
    if any(k in lower for k in ("额度不足", "insufficient quota", "quota exceeded",
                                "exceeded your current quota")):
        return "AI 接口额度不足：请给 API 账户充值，或在 agent/.env 更换 OPENAI_API_KEY_PREMIUM"
    if "403" in lower and "forbidden" in lower:
        return "AI 接口拒绝了请求（403）：常见原因是额度用完或 Key 无权限，请检查/充值 API Key"
    if "429" in lower or "rate limit" in lower:
        return "AI 接口限流（429）：请求太频繁，稍等几秒再试"

    # 去掉 [Analyst] 等前缀重复
    for prefix in ("[Analyst]", "[Executor]", "分析失败:"):
        if err.startswith(prefix):
            err = err[len(prefix):].strip()

    if len(err) > 240:
        return err[:240] + "..."
    return err


def format_subprocess_error(
    stdout: str = "",
    stderr: str = "",
    returncode: int = 1,
) -> str:
    """从子进程 stdout/stderr 提取友好错误，避免 Traceback 泄露到 UI。"""
    combined = "\n".join(part for part in (stdout, stderr) if part).strip()
    if not combined:
        return "产品分析失败，请检查配置后重试"

    for line in combined.splitlines():
        text = line.strip()
        if "分析失败:" in text:
            return friendly_error_message(text.split("分析失败:", 1)[-1])
        if "未设置 API Key" in text or "API Key not configured" in text:
            return "请配置 API Key：在 agent/.env 中设置 OPENAI_API_KEY"

    if "UnicodeEncodeError" in combined:
        return "系统编码异常，请刷新页面后重试"
    if "API Key" in combined or "API_KEY" in combined:
        return "请配置 API Key：在 agent/.env 中设置 OPENAI_API_KEY"
    if "没有有效的图片" in combined:
        return "未找到有效的产品图片，请重新上传"

    for line in combined.splitlines():
        text = line.strip()
        if not text:
            continue
        if text.startswith("Traceback"):
            break
        if text.startswith("File ") or text.startswith("During handling"):
            continue
        if text.startswith("  ") or text.startswith("^"):
            continue
        return friendly_error_message(text)

    return "产品分析失败，请检查配置后重试"
