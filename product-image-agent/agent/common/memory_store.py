"""english_text v2 — AutoMem english_textfile（english_text + review + text）。

text（text《textAgentenglish_textplan》P1）：
- text Markdown textfile，english_text，Agent texttasktextautomatictext：
    profiles/memory/product_memory.md    text/english_text
    profiles/memory/keyword_memory.md    keywordsyesenglish_text
    profiles/memory/style_memory.md      imageenglish_text
    profiles/memory/risk_memory.md       riskenglish_text
    profiles/memory/store_strategy.md    storetext/SOP text
- english_text：taskenglish_text（task/text/successtext/risktext/english_text/english_text）。
- Memory Reviewer：textyesenglish_text——LLM text「textyestext？english_text？english_text？」，
  none Key english_text（yesenglish_text/textplatformenglish_text）。
- recall()：2-gram english_textfiletext，english_text LLM english_text。

textyeswritefailedtext，english_textflow（text user_memory / knowledge_base english_text）。
"""

from __future__ import annotations

import json
import os
import re
import threading
import time

from common.runtime_paths import get_runtime_paths

_LOCK = threading.Lock()

MEMORY_DIR = get_runtime_paths().memory

# english_text → filetext（english_text，writeenglish_text）
CATEGORIES = {
    "product": "product_memory.md",
    "keyword": "keyword_memory.md",
    "style": "style_memory.md",
    "risk": "risk_memory.md",
    "strategy": "store_strategy.md",
}

MAX_ENTRIES_PER_FILE = 100
REVIEW_TIMEOUT = 20

_CATEGORY_HINTS = {
    "product": ("text", "product research", "text", "category", "text", "text", "text", "text"),
    "keyword": ("keywords", "text", "search", "text", "keyword", "tag"),
    "style": ("text", "text", "text", "text", "scenetext", "text", "text", "text"),
    "risk": ("risk", "text", "text", "text", "text", "text", "text", "text", "text"),
    "strategy": ("text", "text", "profit", "text", "platform", "flow", "sop", "listing"),
}

REVIEW_PROMPT = """You are a memory reviewer for a cross-border e-commerce agent.
Judge whether this note is worth keeping as LONG-TERM business memory.

Keep only if ALL true:
- long-term valid (not a one-off instruction or transient status)
- business relevant (products / keywords / image style / risk / store strategy)
- would influence future decisions

Note: {note}

Output JSON only: {{"keep": true/false, "category": "product|keyword|style|risk|strategy"}}"""


def _file_path(category: str) -> str:
    return os.path.join(MEMORY_DIR, CATEGORIES.get(category, CATEGORIES["strategy"]))


def classify(text: str) -> str:
    """textkeywordsenglish_text，text strategy。"""
    lower = (text or "").lower()
    best, best_hits = "strategy", 0
    for cat, hints in _CATEGORY_HINTS.items():
        hits = sum(1 for h in hints if h in lower)
        if hits > best_hits:
            best, best_hits = cat, hits
    return best


def _rule_review(text: str) -> bool:
    """none LLM english_textreview：text、english_text、noneenglish_text。"""
    text = (text or "").strip()
    if len(text) < 8:
        return False
    if re.fullmatch(r"[english_textokOK！!。.\s]+", text):
        return False
    business_words = ("platform", "text", "keywords", "text", "risk", "profit", "title",
                      "scene", "customer", "etsy", "amazon", "temu", "tiktok",
                      "shopify", "ebay", "text", "text", "text", "text")
    return any(w in text.lower() for w in business_words)


def _llm_review(text: str) -> dict | None:
    """LLM review，text {"keep", "category"} text None（english_text/failed）。"""
    if os.environ.get("COMMERCE_AGENT_MOCK", "").strip() == "1":
        return None
    if os.environ.get("MEMORY_REVIEW_LLM", "1").strip() in ("0", "false", "off"):
        return None
    from common.utils import parse_json_response, resolve_openai_api_key

    api_key = resolve_openai_api_key().strip()
    if not api_key:
        return None
    try:
        import requests

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json={"model": os.getenv("LLM_MODEL", "gpt-5.5"),
                  "messages": [{"role": "user",
                                "content": REVIEW_PROMPT.format(note=text[:500])}],
                  "temperature": 0.0, "max_tokens": 60},
            timeout=REVIEW_TIMEOUT,
        )
        resp.raise_for_status()
        raw = (resp.json().get("choices") or [{}])[0].get(
            "message", {}).get("content", "")
        data = parse_json_response(raw)
        if isinstance(data, dict) and "keep" in data:
            return {"keep": bool(data["keep"]),
                    "category": str(data.get("category", "")) or None}
    except Exception:  # noqa: BLE001 — reviewfailedenglish_text
        pass
    return None


def review(text: str) -> tuple[bool, str]:
    """reviewenglish_text。text (yesnotext, text)。"""
    verdict = _llm_review(text)
    if verdict is not None:
        cat = verdict.get("category")
        return verdict["keep"], (cat if cat in CATEGORIES else classify(text))
    return _rule_review(text), classify(text)


def _load_entries(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, ValueError):
        return []
    return [e.strip() for e in re.split(r"\n(?=- )", content)
            if e.strip().startswith("- ")]


def _save_entries(path: str, entries: list[str], title: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    body = f"# {title}\n\n" + "\n".join(entries[-MAX_ENTRIES_PER_FILE:]) + "\n"
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(body)
    os.replace(tmp, path)


def remember(text: str, category: str = "", skip_review: bool = False) -> bool:
    """english_text（textreviewenglish_text，text）。textyesnotextwrite。"""
    try:
        text = re.sub(r"\s+", " ", (text or "")).strip()
        if not text:
            return False
        if skip_review:
            keep, cat = True, (category if category in CATEGORIES
                               else classify(text))
        else:
            keep, cat = review(text)
            if category in CATEGORIES:
                cat = category
        if not keep:
            return False
        date = time.strftime("%Y-%m-%d")
        entry = f"- [{date}] {text[:300]}"
        path = _file_path(cat)
        with _LOCK:
            entries = _load_entries(path)
            if any(text[:120] in e for e in entries):
                return False  # text
            entries.append(entry)
            _save_entries(path, entries, os.path.splitext(
                os.path.basename(path))[0])
        return True
    except Exception:  # noqa: BLE001 — textwriteenglish_textflow
        return False


def write_card(card: dict) -> bool:
    """writeenglish_text（taskenglish_text），english_textfile。

    card fields：task（task）、outcome（text）、success（successtext）、
    risk（risktext）、next（english_text）、avoid（english_text）。
    """
    try:
        written = False
        task = str(card.get("task", "")).strip()
        prefix = f"task「{task[:40]}」" if task else ""
        mapping = [
            ("success", "strategy", "successtext"),
            ("risk", "risk", "risktext"),
            ("next", "product", "english_text"),
            ("avoid", "risk", "english_text"),
        ]
        for key, cat, label in mapping:
            value = str(card.get(key, "")).strip()
            if value:
                written = remember(f"{prefix}{label}：{value}",
                                   category=cat) or written
        return written
    except Exception:  # noqa: BLE001
        return False


def _tokenize(text: str) -> set:
    tokens = set(re.findall(r"[a-zA-Z]{3,}", (text or "").lower()))
    han = re.sub(r"[^\u4e00-\u9fff]", "", text or "")
    tokens.update(han[i:i + 2] for i in range(len(han) - 1))
    return tokens


def recall(query: str, k: int = 4) -> list[dict]:
    """english_textfileenglish_text k text，text [{"category", "text"}]。"""
    q_tokens = _tokenize(query)
    if not q_tokens:
        return []
    scored = []
    for cat in CATEGORIES:
        for entry in _load_entries(_file_path(cat)):
            overlap = len(q_tokens & _tokenize(entry))
            if overlap >= 2:
                scored.append((overlap, {"category": cat,
                                         "text": entry.lstrip("- ")}))
    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:k]]


def stats() -> dict:
    """english_text（english_text/english_text）。"""
    return {cat: len(_load_entries(_file_path(cat))) for cat in CATEGORIES}
