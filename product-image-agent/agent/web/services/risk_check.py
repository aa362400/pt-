"""riskdetection Agent — english_text，english_text，textyesenglish_text（P4）。

textdetection，english_textallenglish_text：
1. text/text/textrisk：knowledge/trademark_words.txt text（~150 english_text）
2. platformenglish_text：english_text / english_text / english_text
3. textrisk：textkeywords → text / text / text / english_text
4. english_text：english_text

yes LLM Key english_text（textpassed RISK_CHECK_LLM=0 text）。
outputenglish_text《textAgentenglish_textplan》P4 text：
risktext / textrisk / text / text / english_text / yesnotextlisting。
"""

from __future__ import annotations

import os
import re

LLM_TIMEOUT = 45

_WORDS_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                           "knowledge", "trademark_words.txt")
_words_cache: list[str] | None = None

# 「textrisk」text：english_text，text IP english_text
_SUSPICIOUS = ("princess castle", "wizard school", "superhero cape",
               "magic kingdom", "cartoon character", "movie character",
               "famous singer", "team logo")

# platformenglish_text（english_text/english_text/text）
_SENSITIVE = ("cure", "text", "text", "text", "text", "anti-cancer", "fda approved",
              "text", "english_text", "best in the world", "no.1", "100% effective",
              "guaranteed to", "english_text", "never fade", "text", "text")

# text → textrisktext
_LOGISTICS_RULES = (
    (("acrylic", "english_text", "glass", "text", "ceramic", "text", "porcelain", "text",
      "crystal"), "english_text，english_text/english_text/english_text，english_text"),
    (("battery", "text", "text", "electronic", "led"),
     "text/english_text，english_text，english_text"),
    (("liquid", "text", "text", "perfume", "oil"),
     "english_text，english_text，english_text"),
    (("magnet", "text", "text"), "english_text，english_text，english_textpackagingenglish_text"),
    (("wood", "text", "text", "bamboo", "text"),
     "english_text/english_text（english_text），english_text"),
)

LLM_PROMPT = """You are a cross-border e-commerce compliance reviewer.
Review this listing draft for risks (trademark/copyright, platform policy,
exaggerated claims, logistics). Be practical, not paranoid.

LISTING:
{listing}

Output JSON only:
{{"extra_risks": ["risk sentence in Chinese", ...],
  "suggestions": ["suggestion in Chinese", ...]}}"""


def _load_words() -> list[str]:
    global _words_cache
    if _words_cache is None:
        words = []
        try:
            with open(_WORDS_PATH, encoding="utf-8") as f:
                for line in f:
                    line = line.strip().lower()
                    if line and not line.startswith("#"):
                        words.append(line)
        except OSError:
            pass
        _words_cache = words
    return _words_cache


def trademark_risk(text: str) -> str:
    """english_textrisk：security / text / textrisk。"""
    lower = (text or "").lower()
    if not lower:
        return "security"
    if any(w in lower for w in _load_words()):
        return "textrisk"
    if any(w in lower for w in _SUSPICIOUS):
        return "text"
    return "security"


def find_trademark_hits(text: str) -> list[str]:
    lower = (text or "").lower()
    return [w for w in _load_words() if w in lower]


def _sensitive_hits(text: str) -> list[str]:
    lower = (text or "").lower()
    return [w for w in _SENSITIVE if w in lower]


def _logistics_notes(text: str) -> list[str]:
    lower = (text or "").lower()
    notes = []
    for hints, note in _LOGISTICS_RULES:
        if any(h in lower for h in hints):
            notes.append(note)
    return notes


def _llm_review(listing_text: str) -> dict | None:
    if os.environ.get("COMMERCE_AGENT_MOCK", "").strip() == "1":
        return None
    if os.environ.get("RISK_CHECK_LLM", "1").strip() in ("0", "false", "off"):
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
                  "messages": [{"role": "user", "content": LLM_PROMPT.format(
                      listing=listing_text[:1500])}],
                  "temperature": 0.2, "max_tokens": 400},
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        text = (resp.json().get("choices") or [{}])[0].get(
            "message", {}).get("content", "")
        data = parse_json_response(text)
        return data if isinstance(data, dict) else None
    except Exception:  # noqa: BLE001 — LLM textyesenglish_text
        return None


def check_listing(title: str = "", description: str = "",
                  tags: list | None = None, profile: dict | None = None,
                  competition_level: str = "", use_llm: bool = True) -> dict:
    """textlistingenglish_textrisktext，english_textreport。"""
    profile = profile or {}
    tags = [str(t) for t in (tags or [])]
    combined = " ".join(filter(None, [
        title, description, " ".join(tags),
        str(profile.get("product_name", "")),
        str(profile.get("materials", "")),
        str(profile.get("category", "")),
    ]))

    tm_hits = find_trademark_hits(combined)
    sensitive = _sensitive_hits(combined)
    logistics = _logistics_notes(combined)
    suspicious = [w for w in _SUSPICIOUS if w in combined.lower()]

    risks: list[str] = []
    suggestions: list[str] = []
    if tm_hits:
        risks.append(f"english_text/english_text：{', '.join(tm_hits[:6])}")
        suggestions.append("english_text/IP/english_text，english_text")
    if suspicious:
        risks.append(f"text IP english_text：{', '.join(suspicious[:4])}")
        suggestions.append("english_text IP english_text，english_text")
    if sensitive:
        risks.append(f"platformtext/english_text：{', '.join(sensitive[:6])}")
        suggestions.append("english_text（text/text/100%/text）")
    if logistics:
        risks.append("text：" + "；".join(logistics))
    if competition_level == "text":
        risks.append("english_text：english_text，english_text（text/text/scene）textyestext")
        suggestions.append("english_text：english_text、english_text、english_textscene")

    # LLM english_text
    llm_used = False
    if use_llm and combined.strip():
        extra = _llm_review(combined)
        if extra:
            llm_used = True
            risks.extend(str(r)[:150] for r in (extra.get("extra_risks") or [])[:4])
            suggestions.extend(
                str(s)[:150] for s in (extra.get("suggestions") or [])[:4])

    if tm_hits:
        level, verdict = "text", "english_textlisting：english_text"
    elif sensitive or suspicious or len(risks) >= 3:
        level, verdict = "text", "english_text"
    elif risks:
        level, verdict = "text", "textlisting，english_text"
    else:
        level, verdict = "text", "english_textrisk，textlisting"

    return {
        "riskLevel": level,
        "risks": risks,
        "trademarkHits": tm_hits,
        "sensitiveHits": sensitive,
        "logisticsNotes": logistics,
        "suggestions": suggestions,
        "verdict": verdict,
        "llmUsed": llm_used,
    }
