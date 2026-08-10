"""跨境出图 Agent — LLM 智能规划增强。

把「产品档案 + 用户需求 + 模板套图规划」交给 LLM，逐张定制英文提示词与创意方向：
- 提示词按真实产品（名称/材质/颜色/风格/定制点）落地，而非通用模板
- 严格保留一致性约束与反侵权约束
- 任何失败（无 Key / 超时 / 返回格式不对）都静默回退模板规划，绝不阻断出图
"""

from __future__ import annotations

import json
import os
import re

from web.services.llm_runtime import (
    configured_key_candidates,
    configured_model_candidates,
    mark_quota_exhausted,
    mark_success,
    mark_unavailable,
)

DEFAULT_TIMEOUT = 60

SYSTEM_PROMPT = """You are a world-class cross-border e-commerce creative director \
who writes image-generation prompts for product listing images (Etsy / Temu / Amazon / TikTok Shop).

You will receive:
- PRODUCT: the analyzed product profile (name, category, material, colors, style, custom areas)
- REQUEST: the parsed user request (platform, audience, gift occasion, image count)
- DRAFT_PLAN: a template plan, one entry per image, each with a slot purpose and a draft English prompt

You are the SCENE DIRECTOR: for every image you personally design the set — background \
surface & environment, supporting props, lighting scheme and mood. The draft prompt is only \
a purpose hint; the scene design is YOUR original creative decision for THIS product.

Scene design rules:
A. Choose backgrounds & props that amplify this product's selling points and fit its \
category, price feel and target audience (e.g. walnut desk + linen + morning coffee for a \
premium wooden item; bright acrylic + color pop for a Gen-Z gadget).
B. Props must be physically plausible next to the product, smaller in visual weight, and \
must NEVER be confusable as part of the product being sold.
C. Across the whole set, every image must use a DIFFERENT background and prop combination — \
no two images may feel like the same set (except the pure white-background hero, which \
stays clean with no props).
D. Respect the platform's culture (Etsy: warm handcrafted; Amazon: clean informative; \
TikTok: bold trendy).

Hard rules for every prompt:
1. Describe the actual product by name and appearance; the product must stay EXACTLY \
consistent with the reference images (same shape, colors, materials, proportions).
2. Keep the slot's purpose (hero / lifestyle emotion / audience / customization / detail / \
size / usage / packaging / summary) — do not change what the image is for.
3. Platform-appropriate styling. Original composition only — never copy an existing listing.
4. Strictly NO brand logos, NO trademarks, NO copyrighted characters, NO celebrity faces, \
NO gibberish text in the image.
5. 60-120 words per prompt, plain English, photography direction style; the prompt must \
explicitly describe the background, each prop, and the lighting you chose.
6. If PREFERENCES is present: the seller LIKED / DISLIKED previous images. Lean into the \
mood, lighting, composition and scene ideas of LIKED entries; avoid repeating what made \
DISLIKED entries fail. Never violate rules 1-5 because of a preference.

Return ONLY a JSON object:
{"creativeDirection": "<one sentence in Chinese>",
 "images": [{"id": "img_1", "prompt": "...",
             "scene": {"background": "<中文，背景/环境>",
                        "props": ["<中文道具1>", "<中文道具2>"],
                        "lighting": "<中文光线>", "mood": "<中文情绪>"}}, ...]}
Include every image id from DRAFT_PLAN exactly once."""


def _api_key() -> str:
    return (os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip())


def llm_plan_enabled() -> bool:
    if os.environ.get("COMMERCE_LLM_PLAN", "1").strip() in ("0", "false", "off"):
        return False
    return bool(configured_key_candidates())


def _compact_profile(profile: dict) -> dict:
    keys = ("product_name", "product_name_cn", "category", "category_cn", "material",
            "colors", "style", "key_features", "custom_areas", "description",
            "target_audience", "selling_points")
    return {k: profile[k] for k in keys if profile.get(k)}


def _extract_json(text: str):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text, flags=re.S)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _plan_model_candidates(think_mode: bool) -> list[str]:
    primary = (
        os.getenv("LLM_MODEL_MAX", "").strip() or configured_model_candidates()[0]
        if think_mode
        else configured_model_candidates()[0]
    )
    models = [primary]
    for model in configured_model_candidates():
        if model not in models:
            models.append(model)
    return models


def _quota_exhausted(error) -> bool:
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", 0)
    try:
        body = response.json() if response is not None else {}
    except (TypeError, ValueError):
        body = {}
    details = body.get("error") if isinstance(body, dict) else {}
    code = str(details.get("code") or "").strip().lower() if isinstance(details, dict) else ""
    return status_code in (402, 403, 429) and code in {
        "insufficient_user_quota",
        "insufficient_quota",
        "quota_exceeded",
    }


def _post_with_failover(base: str, payload: dict, timeout: int, think_mode: bool):
    """Post a planning request with safe key/model fallback and no key exposure."""
    import requests

    attempts = [
        (key_role, key, model)
        for model in _plan_model_candidates(think_mode)
        for key_role, key in configured_key_candidates()
    ]
    quota_failures = 0
    for attempt_index, (key_role, key, model) in enumerate(attempts):
        request_payload = {**payload, "model": model}
        try:
            response = requests.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=request_payload,
                timeout=timeout,
            )
            response.raise_for_status()
        except requests.HTTPError as exc:
            if _quota_exhausted(exc):
                quota_failures += 1
                continue
            mark_unavailable(f"http_{getattr(exc.response, 'status_code', 0) or 'error'}")
            raise
        mark_success(key_role, model=model, fallback_active=attempt_index > 0)
        return response

    if attempts and quota_failures == len(attempts):
        mark_quota_exhausted()
    raise RuntimeError("LLM planning gateway has no available key or model")


MAX_THINK_PLAN_PROMPT = """

## MAX 思考模式（当前已开启）
用户愿意等更久换更好的规划。逐张提示词前先在内部推演（不要输出推理过程）：
该平台该类目的点击率打法、竞品主图常见套路与差异化空间、目标人群的购买触发点。
每张 prompt 写得更完整：光线、机位、材质细节、情绪氛围、构图留白都要给到位。"""


def enrich_plan_with_llm(plan: dict, parsed: dict, profile: dict,
                         timeout: int = DEFAULT_TIMEOUT,
                         preferences: dict | None = None,
                         think_mode: bool = False) -> bool:
    """用 LLM 按真实产品逐张定制提示词。原地更新 plan，成功返回 True。"""
    if not llm_plan_enabled() or not plan.get("images"):
        return False

    import requests

    try:
        draft = [{
            "id": img["id"],
            "purpose": img.get("titleEn") or img.get("title", ""),
            "purpose_cn": img.get("purpose", ""),
            "ratio": img.get("ratio", "1:1"),
            "draft_prompt": img.get("prompt", ""),
        } for img in plan["images"]]

        payload_obj = {
            "PRODUCT": _compact_profile(profile or {}),
            "REQUEST": {
                "platform": parsed.get("platform", ""),
                "audience": parsed.get("audience", ""),
                "giftScene": parsed.get("giftScene", ""),
                "productType": parsed.get("productType", ""),
                "imageCount": parsed.get("imageCount", len(draft)),
                "rawMessageHints": parsed.get("imageTypes", []),
            },
            "DRAFT_PLAN": draft,
        }
        if preferences:
            payload_obj["PREFERENCES"] = preferences
        user_prompt = json.dumps(payload_obj, ensure_ascii=False)

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        payload = {
            "messages": [
                {"role": "system",
                 "content": SYSTEM_PROMPT + (MAX_THINK_PLAN_PROMPT if think_mode else "")},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.4,
            "max_tokens": 8192 if think_mode else 4096,
        }
        if os.getenv("OPENAI_JSON_MODE", "1") != "0":
            payload["response_format"] = {"type": "json_object"}

        resp = _post_with_failover(
            base,
            payload,
            timeout * 2 if think_mode else timeout,
            think_mode,
        )
        text = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        data = _extract_json(text)
        if not isinstance(data, dict):
            return False

        by_id = {}
        for item in data.get("images", []):
            if isinstance(item, dict) and item.get("id"):
                by_id[item["id"]] = item
        updated = 0
        for img in plan["images"]:
            item = by_id.get(img["id"]) or {}
            new_prompt = str(item.get("prompt", "") or "").strip()
            if new_prompt and len(new_prompt) > 40:
                img["prompt"] = new_prompt
                img["llmCustomized"] = True
                scene = item.get("scene")
                if isinstance(scene, dict):
                    # 场景导演产物：背景/道具/光线/情绪（前端展示 + 后续追溯）
                    img["scene"] = {
                        "background": str(scene.get("background", "") or "")[:60],
                        "props": [str(p)[:30] for p in (scene.get("props") or [])[:4]],
                        "lighting": str(scene.get("lighting", "") or "")[:40],
                        "mood": str(scene.get("mood", "") or "")[:40],
                    }
                updated += 1
        if not updated:
            return False

        direction = str(data.get("creativeDirection", "")).strip()
        if direction:
            plan["strategy"]["creativeDirection"] = direction
        plan["strategy"]["llmPlanned"] = True
        return True
    except Exception:  # noqa: BLE001 — LLM 增强永不阻断主流程
        return False
