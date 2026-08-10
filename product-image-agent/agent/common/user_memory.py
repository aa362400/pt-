"""english_text — usertext。

textuserenglish_text（textplatform、text、text、english_text）english_text
profiles/user_memory.json，english_textautomatictext LLM english_text，english_text。

english_text：text"english_text"，english_text；writefailedtext，english_textflow。
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
    "platforms": {},      # platform → english_text
    "taboos": [],         # text，text「english_text」
    "style_notes": [],    # english_text，text「english_text」
    "brand": "",
    "updated_at": 0,
}

# 「text/text/english_text/text/text XX」→ text
_TABOO_RE = re.compile(
    r"(?:text|text|english_text|text|text|textyes)([^，。！？,.!?\s]{1,12})")
# 「english_text/text/text XX」「text/text XX text」→ english_text
_STYLE_RE = re.compile(
    r"(?:text?(?:text|text|text|text|text|text))([^，。！？,.!?\s]{2,14}(?:text|text|text|text)?)")


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
    """english_textusermessageenglish_text。failedtext。"""
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
    except Exception:  # noqa: BLE001 — english_textflow
        pass


def summary() -> dict:
    """text LLM english_text；noneenglish_text dict。"""
    mem = _load()
    top_platforms = sorted(mem["platforms"].items(),
                           key=lambda kv: kv[1], reverse=True)[:3]
    out = {}
    if top_platforms:
        out["textplatform"] = [p for p, _ in top_platforms]
    if mem.get("brand"):
        out["text"] = mem["brand"]
    if mem.get("taboos"):
        out["text"] = mem["taboos"][-8:]
    if mem.get("style_notes"):
        out["english_text"] = mem["style_notes"][-8:]
    return out
