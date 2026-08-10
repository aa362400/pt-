"""跨会话长期记忆 — 用户画像。

把用户在任何会话里透露的稳定偏好（常用平台、品牌、禁忌、风格口味）沉淀到
profiles/user_memory.json，新会话自动带入 LLM 上下文，不用每次重新交代。

设计原则：只记"稳定偏好"，不记一次性指令；写入失败静默，绝不阻断聊天主流程。
"""

from __future__ import annotations

import json
import os
import re
import threading
import time

from common.runtime_paths import get_runtime_paths

_LOCK = threading.Lock()

MEMORY_PATH = os.path.join(get_runtime_paths().memory, "user_memory.json")

_EMPTY = {
    "platforms": {},      # 平台 → 提及次数
    "taboos": [],         # 禁忌，如「不要紫色」
    "style_notes": [],    # 风格口味，如「喜欢暖色调」
    "brand": "",
    "updated_at": 0,
}

# 「不要/别用/别出现/禁止/避免 XX」→ 禁忌
_TABOO_RE = re.compile(
    r"(?:不要|别用|别出现|禁止|避免|不能有)([^，。！？,.!?\s]{1,12})")
# 「我只做/主做/专注 XX」「喜欢/偏好 XX 风格」→ 风格口味
_STYLE_RE = re.compile(
    r"(?:我?(?:只做|主做|专注|喜欢|偏好|想要))([^，。！？,.!?\s]{2,14}(?:风格|色调|风|感)?)")


def _load() -> dict:
    try:
        with open(MEMORY_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {**_EMPTY, **data}
    except (OSError, json.JSONDecodeError):
        pass
    return dict(_EMPTY)


def _save(mem: dict) -> None:
    mem["updated_at"] = time.time()
    os.makedirs(os.path.dirname(os.path.abspath(MEMORY_PATH)), exist_ok=True)
    tmp = MEMORY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(mem, f, ensure_ascii=False, indent=2)
    os.replace(tmp, MEMORY_PATH)


def record(message: str, extracted: dict | None = None) -> None:
    """从一条用户消息里沉淀稳定偏好。失败静默。"""
    try:
        message = (message or "").strip()
        extracted = extracted or {}
        if not message and not extracted:
            return
        with _LOCK:
            mem = _load()
            changed = False

            for plat in extracted.get("platforms") or []:
                mem["platforms"][plat] = mem["platforms"].get(plat, 0) + 1
                changed = True

            brand = str(extracted.get("brand_name", "") or "").strip()
            if brand and brand != mem.get("brand"):
                mem["brand"] = brand[:30]
                changed = True

            for m in _TABOO_RE.finditer(message):
                taboo = m.group(1).strip()
                if taboo and taboo not in mem["taboos"]:
                    mem["taboos"] = (mem["taboos"] + [taboo])[-12:]
                    changed = True

            for m in _STYLE_RE.finditer(message):
                note = m.group(1).strip()
                if len(note) >= 2 and note not in mem["style_notes"]:
                    mem["style_notes"] = (mem["style_notes"] + [note])[-12:]
                    changed = True

            if changed:
                _save(mem)
    except Exception:  # noqa: BLE001 — 记忆沉淀绝不阻断主流程
        pass


def summary() -> dict:
    """给 LLM 上下文用的紧凑画像；无记忆时返回空 dict。"""
    mem = _load()
    top_platforms = sorted(mem["platforms"].items(),
                           key=lambda kv: kv[1], reverse=True)[:3]
    out = {}
    if top_platforms:
        out["常用平台"] = [p for p, _ in top_platforms]
    if mem.get("brand"):
        out["品牌"] = mem["brand"]
    if mem.get("taboos"):
        out["禁忌"] = mem["taboos"][-8:]
    if mem.get("style_notes"):
        out["风格口味"] = mem["style_notes"][-8:]
    return out
