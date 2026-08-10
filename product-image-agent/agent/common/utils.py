#!/usr/bin/env python3
"""
e-commerceenglish_textagent — english_text

english_textyesenglish_text，english_text。
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
# english_text
# ============================================================

LOG_DIR = get_runtime_paths().logs

def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    """
    english_textconfiguration。
    textyesenglish_text print()。

    text:
        from common.utils import setup_logger
        logger = setup_logger(__name__)
        logger.info("message")
        logger.error("error")
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # english_textconfiguration

    os.makedirs(LOG_DIR, exist_ok=True)

    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
    }
    logger.setLevel(level_map.get(level.upper(), logging.INFO))

    # english_text handler
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    logger.addHandler(console)

    # file handler（english_text）
    log_file = os.path.join(LOG_DIR, f"agent_{datetime.now().strftime('%Y%m%d')}.log")
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s",
    ))
    logger.addHandler(file_handler)

    return logger


# ============================================================
# MIME english_text（text 5 textfileenglish_text _guess_mime）
# ============================================================

MIME_MAP = {
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def guess_mime(path: str) -> str:
    """textfileenglish_text MIME text"""
    ext = Path(path).suffix.lower()
    return MIME_MAP.get(ext, "image/jpeg")


# ============================================================
# Base64 english_text（english_text）
# ============================================================

def encode_image_base64(path: str) -> str:
    """readimagefileenglish_text base64 text"""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def image_to_data_url(path: str) -> str:
    """text data URL english_textimagedata"""
    mime = guess_mime(path)
    b64 = encode_image_base64(path)
    return f"data:{mime};base64,{b64}"


def save_base64_image(base64_data: str, output_path: str):
    """text base64 imagedataenglish_textfile"""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(base64.b64decode(base64_data))


# ============================================================
# LLM responsetext（english_text _parse_json_response）
# ============================================================

def parse_json_response(text: str) -> dict:
    """
    text LLM responseenglish_text JSON。
    text ```json ... ``` english_text JSON english_text。
    """
    text = text.strip()

    # english_text
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # english_text ```json ... ``` text
    for delimiter in ["```json", "```"]:
        if delimiter in text:
            start = text.index(delimiter) + len(delimiter)
            end = text.index("```", start) if "```" in text[start:] else len(text)
            try:
                return json.loads(text[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                continue

    raise ValueError(f"nonetext LLM responseenglish_text JSON:\n{text[:500]}")


# ============================================================
# english_text
# ============================================================

def hex_to_rgb(hex_color: str) -> tuple:
    """#FF0000 → (255, 0, 0)"""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


# ============================================================
# imageenglish_text
# ============================================================

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def collect_images(directory: str) -> list[str]:
    """
    english_textyesimagefileenglish_text。
    text _ textfile。
    """
    if not os.path.isdir(directory):
        return []
    return sorted([
        os.path.join(directory, f) for f in os.listdir(directory)
        if f.lower().endswith(IMAGE_EXTS) and not f.startswith("_")
    ])


# ============================================================
# english_text
# ============================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ensure_output_dirs(base_dir: str) -> dict:
    """english_textoutputenglish_text，english_text"""
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
# scenetemplateenglish_text
# ============================================================

def inject_variables(template: dict, product: dict, extra_vars: Optional[dict] = None) -> dict:
    """english_texttemplatetextyesenglish_textfields"""
    vars_map = {
        "product_name": product.get("product_name", ""),
        "product_name_cn": product.get("product_name_cn", ""),
        "product_category": product.get("category", "product"),
        "product_category_cn": product.get("category_cn", "text"),
        "product_description": product.get("description", ""),
        "product_materials": ", ".join(product.get("materials", [])),
        "product_style": product.get("style", ""),
        "key_features": ", ".join(product.get("key_features", [])),
        "primary_color": product.get("colors", {}).get("primary", "#808080"),
        "secondary_color": (product.get("colors", {}).get("accents", ["#808080"]) or ["#808080"])[0],
        "season": product.get("season", "text"),
        "variants_count": product.get("variants_count", "text"),
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
# API Key securitytext（english_text）
# ============================================================

def get_api_key(engine: str = "gemini", env_override: Optional[str] = None) -> str:
    """
    securitytext API Key。
    english_text，english_text。
    english_textautomaticenglish_text。
    english_text Key text（Key Pool），english_text。

    Args:
        engine: "gemini" / "minimax" / "midjourney" / "openai"
        env_override: english_text（english_text）

    Returns:
        API Key english_text，english_text ""
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
    # Key Pool：english_text Key text
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
# english_text
# ============================================================

def stable_unique(items: list, key_fn=None) -> list:
    """english_text"""
    seen = set()
    result = []
    for item in items:
        k = key_fn(item) if key_fn else item
        if k not in seen:
            seen.add(k)
            result.append(item)
    return result


# ============================================================
# platformenglish_text（Web text / english_text）
# ============================================================

# cross-border e-commerceplatform（english_text/text/english_text/english_text/english_text）
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
    "text": "taobao_main",
    "taobao": "taobao_main",
    "text": "tmall_main",
    "tmall": "tmall_main",
    "english_text": "amazon_main",
    "amazon": "amazon_main",
    "english_text": "amazon_detail",
    "amazon_detail": "amazon_detail",
    "english_text": "xiaohongshu",
    "xiaohongshu": "xiaohongshu",
    "text": "jd_main",
    "jd": "jd_main",
    "english_text": "pdd_main",
    "pdd": "pdd_main",
    "shopify": "shopify",
    "lazada": "lazada",
    "english_text": "lazada",
    "shopline": "shopline",
    "etsy": "etsy",
    "alibaba": "alibaba",
    "tiktok": "tiktok_shop",
    "tiktok shop": "tiktok_shop",
    "tiktok_shop": "tiktok_shop",
    "temu": "temu",
    "english_text": "temu",
    "shein": "shein",
    "text": "shein",
    "ebay": "ebay",
    "text": "ebay",
    "walmart": "walmart",
    "english_text": "walmart",
    "mercado libre": "mercado_libre",
    "mercadolibre": "mercado_libre",
    "mercado_libre": "mercado_libre",
    "english_text": "mercado_libre",
    "coupang": "coupang",
    "text": "coupang",
    "english_text": "alibaba",
    "english_text": "alibaba",
    "english_text": "alibaba",
    "english_text": "alibaba",
    "text": "cross_border_all",
    "cross-border": "cross_border_all",
    "crossborder": "cross_border_all",
    "alltext": "cross_border_all",
    "textyestext": "cross_border_all",
    "all cross-border": "cross_border_all",
}

_CROSS_BORDER_KEYWORDS = re.compile(
    r"(text|cross[- ]?border|textplatform|text|export)",
    re.I,
)
_CROSS_BORDER_ALL_KEYWORDS = re.compile(
    r"(all|textyes|all|every)",
    re.I,
)


def normalize_platforms(raw) -> list:
    """
    textuserinputtextplatformtext/english_text ID text。
    english_text（text/english_text）text list。
    「text / cross-border / alltext」→ CROSS_BORDER_PLATFORMS。
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
# english_text API text / imageenglish_text
# ============================================================

ANALYZE_API_TIMEOUT_DEFAULT = 120
ANALYZE_API_MAX_RETRIES = 2
ANALYZE_IMAGE_MAX_PX = 1024
ANALYZE_API_TIMEOUT_MESSAGE = (
    "API responsetext，english_text；english_text GEMINI_API_KEY"
)


class AnalyzeApiTimeoutError(RuntimeError):
    """visualtext API text（english_text）"""


def get_analyze_api_timeout() -> int:
    """visualenglish_text HTTP text（text），english_text ANALYZE_API_TIMEOUT，text 120。"""
    raw = os.getenv("ANALYZE_API_TIMEOUT", str(ANALYZE_API_TIMEOUT_DEFAULT)).strip()
    try:
        value = int(raw)
        return max(30, min(value, 600))
    except ValueError:
        return ANALYZE_API_TIMEOUT_DEFAULT


def get_analyze_subprocess_timeout() -> int:
    """
    analyze_product english_text：english_text × (1+text) + english_text + text。
    textpassed ANALYZE_SUBPROCESS_TIMEOUT text。
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
    readenglish_textimage，text (base64_data, mime_type)。
    english_text max_size english_text，english_textvisual API response。
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
# english_text / english_text / usertexterror
# ============================================================

def configure_stdio_utf8() -> None:
    """Windows text GBK english_textnonetextoutput emoji，english_text。"""
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def resolve_openai_api_key(env_key: Optional[str] = None) -> str:
    """OpenAI text API Key（text premium text，english_text / text LLM text）。"""
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
    OpenAI english_text API Key（text LLM premium text）。
    text OPENAI_IMAGE_API_KEY，text OPENAI_API_KEY。
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
    automaticenglish_text。
    ANALYZE_ENGINE english_text openai | gemini | minimax；
    english_text OpenAI text（jojocode text），text Gemini / MiniMax。
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


# Gemini english_text（Nano Banana text，english_text ID）
GEMINI_IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image"
# english_text preview text ID，automaticenglish_text
_GEMINI_IMAGE_MODEL_ALIASES = {
    "gemini-3-pro-image-preview": "gemini-3-pro-image",
    "gemini-2.0-flash-preview-image-generation": "gemini-2.5-flash-image",
    "gemini-2.0-flash-exp-image-generation": "gemini-2.5-flash-image",
}


def get_gemini_image_model() -> str:
    """text Gemini english_text ID（textpassed GEMINI_IMAGE_MODEL text）。"""
    raw = os.getenv("GEMINI_IMAGE_MODEL", GEMINI_IMAGE_MODEL_DEFAULT).strip()
    return _GEMINI_IMAGE_MODEL_ALIASES.get(raw, raw) or GEMINI_IMAGE_MODEL_DEFAULT


def gemini_image_generate_url(model: Optional[str] = None) -> str:
    """Gemini generateContent english_text URL。"""
    model = model or get_gemini_image_model()
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def gemini_image_generation_config(aspect_ratio: str = "1:1", **extra) -> dict:
    """Gemini text generationConfig（text responseModalities english_textimage）。"""
    cfg: dict = {
        "responseModalities": ["TEXT", "IMAGE"],
        "imageConfig": {"aspectRatio": aspect_ratio},
    }
    cfg.update(extra)
    return cfg


def list_configured_image_engines() -> list[str]:
    """english_textconfiguration API Key english_text（english_text）。"""
    engines: list[str] = []
    if resolve_image_openai_api_key():
        engines.append("dalle")
    if os.getenv("GEMINI_API_KEY"):
        engines.append("gemini")
    if os.getenv("MINIMAX_API_KEY"):
        engines.append("minimax")
    return engines


def image_engine_fallback_order(primary: str) -> list[str]:
    """english_textfailedenglish_text（text，english_textconfiguration Key english_text）。"""
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
    automatictextimagegenerationtext。
    IMAGE_ENGINE english_text gemini | dalle | openai | minimax；
    english_text OpenAI gpt-image-2，text Gemini / MiniMax。
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
    """textimageenglish_text API Key。"""
    eng = (engine or "dalle").lower()
    if eng in ("dalle", "openai"):
        return resolve_image_openai_api_key()
    return get_api_key(eng)


def friendly_image_error_message(error: str, engine: str = "") -> str:
    """textimagegenerationerrortextusertextEnglishtext。"""
    lower = (error or "").lower()
    eng_label = {"gemini": "Gemini", "dalle": "OpenAI gpt-image-2", "minimax": "MiniMax"}.get(
        (engine or "").lower(), engine or "english_text"
    )
    if any(k in lower for k in (
        "api key not set", "api_key not set", "is not set", "not set. export",
        "english_text", "api key not configured",
    )):
        return f"textconfigurationtext API Key（{eng_label}）：text agent/.env english_text OPENAI_API_KEY text OPENAI_IMAGE_API_KEY"
    if "no engine available" in lower:
        return "textyesenglish_text，textconfiguration OPENAI_API_KEY text OPENAI_IMAGE_API_KEY"
    if "insufficient_user_quota" in lower:
        return (
            "[IMAGE_PROVIDER_QUOTA_EXHAUSTED] english_text，"
            "english_textimage API english_text"
        )
    if "image_provider_fallback_exhausted" in lower:
        return (
            "[IMAGE_PROVIDER_FALLBACK_EXHAUSTED] textimageenglish_text，"
            "textsecretenglish_textimageenglish_text"
        )
    if "model_not_found" in lower or "no available channel for model" in lower:
        base = get_openai_image_api_base()
        if (engine or "").lower() in ("dalle", "openai") or "jojocode" in lower or "jojocode" in base:
            return (
                "OpenAI english_text（gpt-image-2）。"
                "english_text gpt-image text/english_text OPENAI_API_BASE，english_text OPENAI_IMAGE_MODEL"
            )
        return f"{eng_label} english_text，english_text OPENAI_IMAGE_MODEL / GEMINI_IMAGE_MODEL configuration"
    if "403" in lower and "forbidden" in lower and (engine or "").lower() == "gemini":
        return (
            "Gemini text API english_text（403）。"
            "english_text GEMINI_API_KEY yestext，text GEMINI_IMAGE_MODEL text gemini-2.5-flash-image text gemini-3-pro-image"
        )
    if "503" in lower and (engine or "").lower() in ("dalle", "openai"):
        return (
            "OpenAI english_text（503）。"
            "english_text，english_text gpt-image text OPENAI_API_BASE"
        )
    if any(k in lower for k in ("english_text", "insufficient quota", "quota exceeded",
                                "exceeded your current quota")):
        return "text API english_text：english_text，text agent/.env text OPENAI_API_KEY / OPENAI_IMAGE_API_KEY"
    if "403" in lower and "forbidden" in lower:
        return f"{eng_label} textAPIenglish_textrequest（403）：english_textyesenglish_text Key nonetext，english_text/text"
    if "no image data" in lower:
        return f"{eng_label} english_textimage，english_text"
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
    """english_text/english_textoutputtextusertextEnglishtext。"""
    err = (error or "").strip()
    if not err:
        return "textfailed，english_text"

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
            "[MODEL_PROVIDER_QUOTA_EXHAUSTED] english_text，"
            "english_text API english_text"
        )
    if "model_provider_fallback_exhausted" in lower:
        return (
            "[MODEL_PROVIDER_FALLBACK_EXHAUSTED] english_text，"
            "textsecretenglish_text"
        )
    if "traceback" in lower:
        err = format_subprocess_error(stderr=err)
        lower = err.lower()

    if any(k in lower for k in ("api key not configured", "api_key not set", "not set. export")):
        return "textconfiguration API Key：text agent/.env english_text OPENAI_API_KEY"
    if "english_text api key" in lower or ("api key" in lower and "text" in err):
        return "textconfiguration API Key：text agent/.env english_text OPENAI_API_KEY"
    if "textyesyestextimage" in err or "filenotfounderror" in lower:
        return "english_textyesenglish_textimage，english_text"
    if "unicodeencodeerror" in lower:
        return "english_text，english_text"
    if ANALYZE_API_TIMEOUT_MESSAGE in err:
        return ANALYZE_API_TIMEOUT_MESSAGE
    if any(k in lower for k in (
        "read timed out", "timed out", "timeout", "apitimeout",
        "analyzeapitimeouterror",
    )):
        return ANALYZE_API_TIMEOUT_MESSAGE
    if any(k in lower for k in ("connectionpool", "connection error", "connection refused")):
        return "textconnectionfailed，english_text API text（OPENAI_API_BASE）configuration"
    if any(k in lower for k in ("english_text", "insufficient quota", "quota exceeded",
                                "exceeded your current quota")):
        return "AI APIenglish_text：text API english_text，text agent/.env text OPENAI_API_KEY_PREMIUM"
    if "403" in lower and "forbidden" in lower:
        return "AI APIenglish_textrequest（403）：english_textyesenglish_text Key nonetext，english_text/text API Key"
    if "429" in lower or "rate limit" in lower:
        return "AI APItext（429）：requestenglish_text，english_text"

    # text [Analyst] english_text
    for prefix in ("[Analyst]", "[Executor]", "textfailed:"):
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
    """english_text stdout/stderr english_texterror，text Traceback english_text UI。"""
    combined = "\n".join(part for part in (stdout, stderr) if part).strip()
    if not combined:
        return "english_textfailed，english_textconfigurationenglish_text"

    for line in combined.splitlines():
        text = line.strip()
        if "textfailed:" in text:
            return friendly_error_message(text.split("textfailed:", 1)[-1])
        if "english_text API Key" in text or "API Key not configured" in text:
            return "textconfiguration API Key：text agent/.env english_text OPENAI_API_KEY"

    if "UnicodeEncodeError" in combined:
        return "english_text，english_text"
    if "API Key" in combined or "API_KEY" in combined:
        return "textconfiguration API Key：text agent/.env english_text OPENAI_API_KEY"
    if "textyesyestextimage" in combined:
        return "english_textyesenglish_textimage，english_text"

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

    return "english_textfailed，english_textconfigurationenglish_text"
