"""视觉定位与改图验收 — 精准改图链路的两只眼睛。

locate_object：把图发给视觉 LLM，问"客户说的那个东西在哪"，
返回归一化包围盒 → 直接生成 inpaint mask（物体级定位，比方位词精准得多）。

verify_edit：改完把前后两张图一起发给视觉 LLM 验收：
① 要求的改动生效了吗 ② 不该动的地方动了吗 ③ 产品还是原来那个吗。
让智能体先替客户挑一遍毛病，不达标可自动重试。

两者都是尽力而为：无 Key / 失败 / mock 模式返回 None，调用方自行降级，绝不阻断改图。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from common.utils import (  # noqa: E402
    get_openai_vision_api_base,
    get_openai_vision_model,
    openai_vision_available,
    parse_json_response,
    prepare_image_for_vision_api,
    resolve_openai_vision_api_key,
)

LOCATE_TIMEOUT = 60
VERIFY_TIMEOUT = 90
# 包围盒向外扩一圈，给重绘留融合余量
BOX_PADDING = 0.06

LOCATE_PROMPT = """You are a precise visual grounding assistant for e-commerce image editing.

In the image, find: {target}

Output JSON only:
{{"found": true/false, "box": [x, y, w, h]}}

box uses normalized coordinates (0.0-1.0): x,y = top-left corner, w,h = width/height.
Make the box tight around the target. If the target is not present, set found=false."""

VERIFY_PROMPT = """You are a strict QA inspector for an AI image edit.

The FIRST image is BEFORE the edit; the SECOND image is AFTER the edit.
The edit instruction was: {instruction}

Judge:
- change_applied: did the requested change actually happen in the AFTER image?
- unintended_change: did anything OUTSIDE the requested change visibly change
  (product shape/color/material, background, other objects)? Ignore tiny compression noise.
- product_intact: is the main product still the same product (shape/colors/proportions)?

Output JSON only:
{{"change_applied": true/false, "unintended_change": true/false,
  "product_intact": true/false, "notes": "one short sentence in Chinese"}}"""


def _vision_available() -> bool:
    if os.environ.get("COMMERCE_AGENT_MOCK", "").strip() == "1":
        return False
    model = (os.getenv("VISUAL_LOCATE_MODEL", "").strip()
             or os.getenv("IDENTITY_QA_MODEL", "").strip())
    return openai_vision_available(model)


def _call_vision(image_paths: list, prompt: str, timeout: int) -> dict | None:
    import requests

    # 与聊天/分析 LLM 同一套 Key 路由（premium 优先）：
    # 生图专用 Key 调 chat/completions 会被网关拒绝（503）
    api_key = resolve_openai_vision_api_key().strip()
    base = get_openai_vision_api_base()
    model = get_openai_vision_model(
        os.getenv("VISUAL_LOCATE_MODEL", "").strip()
        or os.getenv("IDENTITY_QA_MODEL", "").strip()
    )

    content = []
    for path in image_paths:
        data, mime = prepare_image_for_vision_api(path)
        content.append({"type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{data}"}})
    content.append({"type": "text", "text": prompt})

    resp = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"},
        json={"model": model,
              "messages": [{"role": "user", "content": content}],
              "temperature": 0.1, "max_tokens": 512},
        timeout=timeout,
    )
    resp.raise_for_status()
    text = (resp.json().get("choices") or [{}])[0].get(
        "message", {}).get("content", "")
    result = parse_json_response(text)
    return result if isinstance(result, dict) else None


def locate_object(image_path: str, target_desc: str,
                  timeout: int = LOCATE_TIMEOUT) -> tuple | None:
    """在图中定位描述的物体，返回归一化 (x, y, w, h) 或 None。"""
    if not target_desc or not _vision_available():
        return None
    try:
        data = _call_vision(
            [image_path], LOCATE_PROMPT.format(target=target_desc[:300]), timeout)
    except Exception:  # noqa: BLE001 — 定位失败降级方位词/整图，不阻断
        return None
    if not data or not data.get("found"):
        return None
    box = data.get("box")
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        x, y, w, h = (float(v) for v in box)
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    # 外扩 + 裁剪到画面内
    x = max(0.0, x - BOX_PADDING)
    y = max(0.0, y - BOX_PADDING)
    w = min(1.0 - x, w + BOX_PADDING * 2)
    h = min(1.0 - y, h + BOX_PADDING * 2)
    return (round(x, 4), round(y, 4), round(w, 4), round(h, 4))


def verify_edit(before_path: str, after_path: str, instruction: str,
                timeout: int = VERIFY_TIMEOUT) -> dict | None:
    """改图后自动验收，返回验收结论或 None（不可用）。"""
    if not _vision_available():
        return None
    if not (os.path.exists(before_path) and os.path.exists(after_path)):
        return None
    try:
        data = _call_vision(
            [before_path, after_path],
            VERIFY_PROMPT.format(instruction=instruction[:400]), timeout)
    except Exception:  # noqa: BLE001 — 验收失败按"未验收"处理
        return None
    if not data or "change_applied" not in data:
        return None
    return {
        "change_applied": bool(data.get("change_applied")),
        "unintended_change": bool(data.get("unintended_change")),
        "product_intact": bool(data.get("product_intact", True)),
        "notes": str(data.get("notes", "") or "")[:200],
        "passed": (bool(data.get("change_applied"))
                   and not bool(data.get("unintended_change"))
                   and bool(data.get("product_intact", True))),
    }
