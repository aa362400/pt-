#!/usr/bin/env python3
"""
english_textautomaticenglish_text — Product Analyzer

text：
  text AI visualenglish_textimage，automaticenglish_text（product_profile.json）
  text Gemini API（text）text Agent english_text

text：
  # API text（text Gemini Vision）
  python analyze_product.py \
    --images /path/to/photo1.jpg /path/to/photo2.jpg \
    --output ./product_profile.json

  # Agent text（outputtext prompt，text AI english_text）
  python analyze_product.py \
    --images /path/to/photo1.jpg \
    --agent-mode \
    --output ./product_profile.json

  # textyesimageenglish_textgeneration
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

# english_text
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
# text
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
  "product_name_cn": "Englishenglish_text",
  "category": "product category",
  "category_cn": "english_text",
  "materials": ["list of visible materials"],
  "colors": {
    "primary": "hex_color",
    "accents": ["hex_accent1", "hex_accent2"],
    "color_names": ["main color name", "accent color names"]
  },
  "style": "style description in English",
  "style_cn": "textEnglishtext",
  "shape": "product shape description",
  "key_features": ["feature_1", "feature_2", "feature_3"],
  "target_audience": "intended user demographic",
  "usage_scenarios": ["use case 1", "use case 2", "use case 3"],
  "emotion_keywords": ["keyword1", "keyword2"],
  "description": "2-3 sentence English description optimized for AI image generation prompts",
  "description_cn": "Englishenglish_text"
}"""


# ============================================================
# API text
# ============================================================

def _encode_image(image_path: str) -> tuple[str, str]:
    """readimageenglish_text base64（textautomaticenglish_text 1024px）"""
    return prepare_image_for_vision_api(image_path)


def _guess_mime(image_path: str) -> str:
    """english_text guess_mime"""
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
    """english_text HTTP POST，text/connectionerrorenglish_text ANALYZE_API_MAX_RETRIES text。"""
    import requests
    from requests.exceptions import ConnectionError as RequestsConnectionError
    from requests.exceptions import Timeout as RequestsTimeout

    retryable = (RequestsTimeout, RequestsConnectionError)
    last_error: Optional[Exception] = None
    notify = progress_fn or _progress_print
    stop_heartbeat = threading.Event()

    def _heartbeat():
        while not stop_heartbeat.wait(20):
            notify("english_text，english_textresponsetext...")

    heartbeat = threading.Thread(target=_heartbeat, daemon=True)
    heartbeat.start()

    try:
        for attempt in range(ANALYZE_API_MAX_RETRIES + 1):
            if attempt > 0:
                delay = min(2 ** attempt, 30)
                notify(f"{label} connectiontext，{delay:.0f} english_text ({attempt}/{ANALYZE_API_MAX_RETRIES})...")
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
                    "%s text %s/%s textfailed: %s",
                    label, attempt + 1, ANALYZE_API_MAX_RETRIES + 1, exc,
                )
    finally:
        stop_heartbeat.set()

    raise AnalyzeApiTimeoutError(ANALYZE_API_TIMEOUT_MESSAGE) from last_error


def analyze_via_gemini(image_paths: list[str], api_key: str) -> dict:
    """passed Gemini Pro Vision API english_textimage"""
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set. Export it or pass --api-key")

    timeout = get_analyze_api_timeout()

    # textrequesttext
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

    # english_textresponse
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    text = ""
    for part in candidates[0]["content"]["parts"]:
        if "text" in part:
            text += part["text"]

    if not text:
        raise RuntimeError("Gemini returned empty text response")

    # text JSON
    return _parse_json_response(text)


def analyze_via_openai(
    image_paths: list[str],
    api_key: str,
    model: Optional[str] = None,
) -> dict:
    """passed OpenAI text Vision API english_textimage"""
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
    """passed MiniMax VL english_textimage"""
    if not api_key:
        raise ValueError("MINIMAX_API_KEY is not set")

    timeout = get_analyze_api_timeout()
    host = os.getenv("MINIMAX_API_HOST", "https://api.minimaxi.com").rstrip("/")

    # MiniMax v1 textAPI（textimagetext）
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
    """text LLM responseenglish_text JSON（english_text）"""
    return parse_json_response(text)


# ============================================================
# Agent english_text
# ============================================================

def generate_agent_analysis_prompt(image_paths: list[str]) -> str:
    """generationtext AI text（Claude）english_text prompt"""
    prompt = """# english_texttask

english_textimage，outputenglish_text JSON english_text。

## english_text

1. **english_text**：english_text"english_text"，text"english_text"
2. **visualenglish_text**：english_textimageenglish_text
3. **english_text**：`description` fieldsenglish_text，text AI text prompt
4. **english_text**：english_text

## output JSON text

```json
{
  "product_name": "English product name",
  "product_name_cn": "Englishenglish_text",
  "category": "product_category",
  "category_cn": "english_text",
  "materials": ["material1", "material2"],
  "colors": {
    "primary": "#HEX",
    "accents": ["#HEX"],
    "color_names": ["color name"]
  },
  "style": "style description in English",
  "style_cn": "textEnglishtext",
  "shape": "product shape",
  "key_features": ["feature1", "feature2", "feature3"],
  "target_audience": "target user",
  "usage_scenarios": ["use1", "use2", "use3"],
  "emotion_keywords": ["kw1", "kw2", "kw3"],
  "description": "2-3 sentence English description optimized for image generation prompts",
  "description_cn": "Englishtext"
}
```

## textimage

"""
    for i, path in enumerate(image_paths, 1):
        prompt += f"[Image {i}]: {path}\n"

    prompt += """
english_textoutput JSON，english_text。"""
    return prompt


# ============================================================
# english_text
# ============================================================

def validate_profile(profile: dict) -> list[str]:
    """english_text，english_textfieldstext"""
    required = ["product_name", "category", "description", "key_features"]
    missing = []
    for field in required:
        if field not in profile or not profile[field]:
            missing.append(field)
    return missing


def fill_missing_fields(profile: dict) -> dict:
    """english_textfieldsenglish_text"""
    defaults = {
        "product_name": "Unnamed Product",
        "product_name_cn": "english_text",
        "category": "general",
        "category_cn": "text",
        "materials": [],
        "colors": {"primary": "#808080", "accents": [], "color_names": ["Gray"]},
        "style": "modern",
        "style_cn": "english_text",
        "shape": "standard",
        "key_features": [],
        "target_audience": "general consumers",
        "usage_scenarios": ["daily use"],
        "emotion_keywords": ["quality", "reliable"],
        "description": "A product.",
        "description_cn": "english_text。",
    }
    for key, default in defaults.items():
        if key not in profile or not profile[key]:
            profile[key] = default
    return profile


# ============================================================
# english_text
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
    english_textimage，outputenglish_text。

    text：
        image_paths: imageenglish_text
        output: output JSON text（None english_text）
        engine: "gemini" | "minimax" | "openai"
        api_key: API Key（None english_textread）
        agent_mode: text Agent english_text（output prompt english_text API）

    text：
        english_text dict
    """
    # textimage
    valid_images = []
    for path in image_paths:
        if not os.path.exists(path):
            print(f"  ⚠️ imageenglish_text，text: {path}")
            continue
        valid_images.append(path)

    if not valid_images:
        raise FileNotFoundError("textyesyestextimagefile")

    print(f"\n{'='*50}")
    print(f"🔍 english_text")
    print(f"📷 image: {len(valid_images)} text")
    extra_vars = {}

    if agent_mode:
        # Agent english_text：output prompt
        prompt = generate_agent_analysis_prompt(valid_images)
        profile_path = os.path.join(
            os.path.dirname(output) if output else ".",
            "_analysis_prompt.md"
        )
        with open(profile_path, "w", encoding="utf-8") as f:
            f.write(prompt)
        print(f"  📝 text prompt textoutput: {profile_path}")
        print(f"  🤖 text AI english_textimagetext prompt english_text")
        extra_vars["_analysis_prompt_path"] = profile_path
        # english_text profile，text AI english_text
        profile = {"_mode": "agent_assist", "_prompt_file": profile_path}
    else:
        # API text — none Gemini Key textautomatictext OpenAI text（jojocode text）
        engine = resolve_analysis_engine(engine, vision_model=model)
        if not api_key:
            if engine == "openai":
                api_key = resolve_openai_vision_api_key()
            else:
                api_key = get_api_key(engine)
        if not api_key:
            print("  ❌ english_text API Key")
            print("  textpassed --api-key english_text:")
            print("    export GEMINI_API_KEY=your_key  (Gemini)")
            print("    export MINIMAX_API_KEY=your_key (MiniMax)")
            print("    export OPENAI_API_KEY=your_key  (OpenAI text)")
            print("  english_text --agent-mode text，text AI english_text")
            raise ValueError("API Key not configured")

        print(f"  ⚙️  text: {engine}")
        print(f"  ⏳ english_text...", end=" ", flush=True)

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
                print("\n  ⚠️ OpenAI text API text，text Gemini english_text...", flush=True)
                profile = analyze_via_gemini(valid_images, gemini_key)
            else:
                raise

        print("✅ textcompleted")

    # english_text
    profile = fill_missing_fields(profile)
    missing = validate_profile(profile)
    if missing:
        print(f"  ⚠️ textfieldsenglish_text: {', '.join(missing)}（english_text）")

    # text
    if output:
        os.makedirs(os.path.dirname(os.path.abspath(output)) or ".", exist_ok=True)
        with open(output, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
        print(f"  💾 english_text: {output}")

    return profile


def main():
    parser = argparse.ArgumentParser(
        description="english_textautomatictext — english_textimageenglish_text",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
example:
  # Gemini API text
  python analyze_product.py --images product.jpg --output profile.json

  # english_text
  python analyze_product.py --images front.jpg side.jpg detail.jpg --output profile.json

  # Agent english_text（output prompt text AI english_text）
  python analyze_product.py --images product.jpg --agent-mode --output profile.json

  # MiniMax text
  python analyze_product.py --images product.jpg --engine minimax --output profile.json
        """,
    )
    parser.add_argument("--images", nargs="+", required=True, help="textimagetext（text1text）")
    parser.add_argument("--output", "-o", default=None, help="output JSON text（text: english_text）")
    parser.add_argument(
        "--engine",
        choices=["gemini", "minimax", "openai"],
        default="gemini",
        help="english_text",
    )
    parser.add_argument("--api-key", default=None, help="API Key（english_textread）")
    parser.add_argument("--model", default=None, help="OpenAI textvisualenglish_text")
    parser.add_argument("--agent-mode", action="store_true", help="Agent english_text，english_text API textyesoutputtext prompt")

    args = parser.parse_args()

    # automatictextoutputtext
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
            print(f"\n✅ textcompleted！text: {profile.get('product_name', '')}")
            print(f"📁 output: {os.path.abspath(args.output)}")
    except AnalyzeApiTimeoutError:
        print(f"\n❌ textfailed: {ANALYZE_API_TIMEOUT_MESSAGE}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ textfailed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
