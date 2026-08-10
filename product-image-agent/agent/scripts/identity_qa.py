#!/usr/bin/env python3
"""
english_text QA — Identity QA

textvisual LLM english_text：「generationenglish_text，textuserenglish_textyestextyesenglish_text？」

english_text/english_text，textdetectiontext「english_textyesnotext」：
english_textscene（background/text/english_text）english_text，
english_text、text、text、english_text——textyesenglish_text。

english_text：OpenAI textvisualtext（OPENAI_API_KEY）→ Gemini（GEMINI_API_KEY）。
english_text：IDENTITY_QA=0 text；IDENTITY_QA_MODEL english_text（english_text LLM_MODEL）。
english_text / failedenglish_text {"available": False}，english_text。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import (  # noqa: E402
    get_openai_vision_api_base, get_openai_vision_model,
    openai_vision_available, parse_json_response,
    prepare_image_for_vision_api, resolve_openai_vision_api_key, setup_logger,
)

logger = setup_logger(__name__)

MAX_REFERENCE = 3       # english_text 3 text（english_text）
MAX_GENERATED = 8       # english_text 8 textgenerationtext
DEFAULT_TIMEOUT = 90

PROMPT_TEMPLATE = """You are a strict product-identity inspector for e-commerce AI-generated listing images.

The FIRST {ref_count} image(s) are REFERENCE photos of the real product uploaded by the seller.
The remaining {gen_count} image(s) are AI-GENERATED listing images, numbered gen_1 .. gen_{gen_count} in order.

{product_context}

For EACH generated image, judge ONLY the product subject (ignore background, scene,
lighting mood, props, composition — creative scenes are expected and fine):

- identity_score (0-100): is the product in this image the SAME product as the reference?
  100 = identical shape / colors / materials / proportions / key details.
  Deduct for wrong color, altered shape, missing or invented parts, wrong material texture,
  distorted proportions, or a clearly different product.
- issue: one short sentence describing the biggest identity problem ("" if none).
- defect_score (0-100): technical quality of the AI render itself, judged on the WHOLE image.
  100 = flawless. Deduct for warped/melted geometry, AI artifacts, duplicated or fused
  objects, garbled or nonsense text, watermark-like ghosts, deformed hands/faces,
  physically impossible props, reflections or shadows.
- defect_issue: one short sentence describing the worst render defect ("" if none).

Output JSON only:
{{"images": [{{"index": 1, "identity_score": 0-100, "issue": "",
              "defect_score": 0-100, "defect_issue": ""}}, ...],
  "overall": 0-100, "summary": "one sentence"}}
Include every generated image exactly once, index = its gen number."""


def identity_qa_enabled() -> bool:
    if os.environ.get("IDENTITY_QA", "1").strip().lower() in ("0", "false", "off"):
        return False
    return bool(openai_vision_available(os.getenv("IDENTITY_QA_MODEL", ""))
                or os.getenv("GEMINI_API_KEY", "").strip())


def _product_context(profile: dict | None) -> str:
    if not profile:
        return ""
    return ("Known product info: "
            f"name={profile.get('product_name', '')}; "
            f"category={profile.get('category', '')}; "
            f"colors={profile.get('colors', {})}; "
            f"materials={', '.join(profile.get('materials', []) or [])}.")


def _via_openai(ref_paths: list, gen_paths: list, prompt: str, timeout: int) -> dict:
    import requests

    # english_text/text LLM english_text Key text（premium text）：
    # english_text Key text chat/completions english_text（503）
    api_key = resolve_openai_vision_api_key().strip()
    base = get_openai_vision_api_base()
    model = get_openai_vision_model(os.getenv("IDENTITY_QA_MODEL", ""))

    content = []
    for path in ref_paths + gen_paths:
        data, mime = prepare_image_for_vision_api(path)
        content.append({"type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{data}"}})
    content.append({"type": "text", "text": prompt})

    resp = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.1,
            "max_tokens": 2048,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    text = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
    return parse_json_response(text)


def _via_gemini(ref_paths: list, gen_paths: list, prompt: str, timeout: int) -> dict:
    import requests

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    parts = []
    for path in ref_paths + gen_paths:
        data, mime = prepare_image_for_vision_api(path)
        parts.append({"inlineData": {"mimeType": mime, "data": data}})
    parts.append({"text": prompt})

    resp = requests.post(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-3-pro-image-preview:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={"contents": [{"parts": parts}],
              "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2048}},
        timeout=timeout,
    )
    resp.raise_for_status()
    text = ""
    for part in (resp.json().get("candidates") or [{}])[0].get(
            "content", {}).get("parts", []):
        text += part.get("text", "")
    return parse_json_response(text)


def check_product_identity(
    reference_images: list,
    generated_images: list,
    profile: dict | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    """
    english_textgenerationenglish_text。

    text:
        {
            "available": True/False,
            "avg_identity": 0-100,
            "per_image": [{"file": name, "path": path,
                           "identity_score": 0-100, "issue": ""}],
            "summary": "...",
            "method": "openai" | "gemini",
        }
    """
    refs = [p for p in (reference_images or []) if p and os.path.exists(p)][:MAX_REFERENCE]
    gens = [p for p in (generated_images or []) if p and os.path.exists(p)]
    if not identity_qa_enabled() or not refs or not gens:
        return {"available": False}

    per_image = []
    summaries = []
    method = ""
    for start in range(0, len(gens), MAX_GENERATED):
        batch = gens[start:start + MAX_GENERATED]
        prompt = PROMPT_TEMPLATE.format(
            ref_count=len(refs),
            gen_count=len(batch),
            product_context=_product_context(profile),
        )
        data = None
        try:
            if openai_vision_available(os.getenv("IDENTITY_QA_MODEL", "")):
                data = _via_openai(refs, batch, prompt, timeout)
                method = "openai"
        except Exception as e:  # noqa: BLE001 — text QA english_textflow
            logger.warning(f"Identity QA (OpenAI) failed: {e}")
        if data is None and os.getenv("GEMINI_API_KEY", "").strip():
            try:
                data = _via_gemini(refs, batch, prompt, timeout)
                method = "gemini"
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Identity QA (Gemini) failed: {e}")
        if not isinstance(data, dict) or not data.get("images"):
            return {"available": False}

        by_index = {}
        for item in data.get("images", []):
            if isinstance(item, dict) and item.get("index") is not None:
                try:
                    by_index[int(item["index"])] = item
                except (TypeError, ValueError):
                    continue
        for i, path in enumerate(batch, 1):
            item = by_index.get(i, {})

            def _clamp(value):
                try:
                    return max(0, min(100, float(value)))
                except (TypeError, ValueError):
                    return None

            per_image.append({
                "file": os.path.basename(path),
                "path": path,
                "identity_score": _clamp(item.get("identity_score")),
                "issue": str(item.get("issue", "") or "")[:200],
                "defect_score": _clamp(item.get("defect_score")),
                "defect_issue": str(item.get("defect_issue", "") or "")[:200],
            })
        if data.get("summary"):
            summaries.append(str(data["summary"]))

    scored = [p["identity_score"] for p in per_image if p["identity_score"] is not None]
    if not scored:
        return {"available": False}

    return {
        "available": True,
        "avg_identity": round(sum(scored) / len(scored), 1),
        "per_image": per_image,
        "summary": " ".join(summaries)[:400],
        "method": method,
    }
