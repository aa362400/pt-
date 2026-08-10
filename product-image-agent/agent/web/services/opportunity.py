"""textproduct researchtext — english_text → english_text（P2）。

text「textlisting、english_text、english_text、english_text」english_text：
english_text / english_text / english_text / profittext / textplatform / english_text /
textscene / english_text / english_text / risktext。

text：english_textplatformtext（SERPER/TAVILY，yes Key text）→ LLM text →
none Key / failedenglish_texttemplatetext（english_text，fieldsenglish_textyesenglish_text）。
english_text《textAgentenglish_textplan》text 9 english_text，english_text。
"""

from __future__ import annotations

import json
import os
import re

LLM_TIMEOUT = 60

PROMPT = """You are a cross-border e-commerce product research expert
(Etsy / Amazon Handmade / Temu / TikTok Shop, customized gifts, POD, laser
engraving, UV printing). Evaluate this product idea for a small cross-border
seller. Judge around: can it be listed, customized, differentiated, and
profitable?

PRODUCT IDEA: {idea}
{context}
{signals}

Output JSON only (Chinese values where text):
{{"product_name": "english_text",
  "opportunity_score": 0-100,
  "competition_level": "text|text|text",
  "difficulty_level": "text|text|text",
  "profit_potential": "text|text|text",
  "platforms": ["Etsy", ...],
  "target_audience": ["dog mom", ...],
  "gift_scenes": ["text", ...],
  "custom_elements": ["text", ...],
  "hot_reason": "english_text",
  "variant_suggestions": ["english_text1", ...],
  "risk_notes": ["risktext1", ...],
  "suggested_price": 19.99,
  "verdict": "english_text：english_text、english_text"}}"""


def _api_key() -> str:
    from common.utils import resolve_openai_api_key
    return resolve_openai_api_key().strip()


def _llm_enabled() -> bool:
    if os.environ.get("COMMERCE_AGENT_MOCK", "").strip() == "1":
        return False
    return bool(_api_key())


def _web_signals(idea: str, org_id: str = "") -> str:
    """yessearch Key textplatformheatenglish_text LLM；textyesenglish_text。

    english_textplatformtext（ShopMate backend API），english_textsearch。
    """
    # Try platform channel first
    try:
        from common.platform_channel import available, get_trend_insights, \
            search_platform_products
        if available(org_id=org_id):
            trends = get_trend_insights(category=idea, org_id=org_id)
            products = search_platform_products(query=idea, org_id=org_id)
            parts = []
            if trends:
                trend_lines = [
                    f"- {t.get('keyword', '')}: growth={t.get('growthRate', 'N/A')}%"
                    for t in trends[:5]
                ]
                parts.append("platformtextdata:\n" + "\n".join(trend_lines))
            if products:
                product_lines = [
                    f"- {p.get('title', '')}" for p in products[:5]
                ]
                parts.append("platformtextdata:\n" + "\n".join(product_lines))
            if parts:
                return "MARKET SIGNALS (platform):\n" + "\n".join(parts)
    except Exception:  # noqa: BLE001 — platformtextfailedenglish_text
        pass

    # Fallback: external search (existing logic)
    if not (os.getenv("SERPER_API_KEY", "").strip()
            or os.getenv("TAVILY_API_KEY", "").strip()):
        return ""
    try:
        from common.web_search import search_web
        results = search_web(f"{idea} etsy amazon trend bestseller", max_results=5)
        lines = [f"- {r.get('title', '')}: {r.get('snippet', '')[:120]}"
                 for r in (results or [])[:5] if r.get("title")]
        if lines:
            return "MARKET SIGNALS (web search):\n" + "\n".join(lines)
    except Exception:  # noqa: BLE001 — english_textyesenglish_text，failedtext
        pass
    return ""


def _call_llm(idea: str, context: str, signals: str) -> dict | None:
    from common.utils import parse_json_response

    try:
        import requests

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {_api_key()}",
                     "Content-Type": "application/json"},
            json={"model": os.getenv("LLM_MODEL", "gpt-5.5"),
                  "messages": [{"role": "user", "content": PROMPT.format(
                      idea=idea[:400], context=context, signals=signals)}],
                  "temperature": 0.4, "max_tokens": 900},
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        text = (resp.json().get("choices") or [{}])[0].get(
            "message", {}).get("content", "")
        data = parse_json_response(text)
        return data if isinstance(data, dict) and "opportunity_score" in data else None
    except Exception:  # noqa: BLE001 — LLM failedtexttemplate
        return None


_CUSTOM_HINTS = ("text", "text", "text", "text", "personalized", "custom", "text")
_GIFT_HINTS = ("text", "text", "gift", "memorial", "text", "text", "text")
_PLATFORM_HINTS = (
    ("Etsy", r"\bEtsy\b|etsy"),
    ("Amazon", r"\bAmazon\b|amazon|english_text"),
    ("Amazon Handmade", r"\bAmazon Handmade\b|amazon handmade"),
    ("Temu", r"\bTemu\b|temu"),
    ("TikTok Shop", r"TikTok\s*Shop|tiktok shop"),
)


def extract_product_idea(text: str) -> str:
    """Extract the product idea from a fuller customer request.

    Users often ask for a decision plus deliverables in one sentence. The
    opportunity card should score the actual product, not use the whole request
    as the product name.
    """
    s = re.sub(r"\s+", " ", str(text or "")).strip(" \t\r\n。！？?!")
    if not s:
        return ""

    explicit = re.search(
        r"(?:text|product|text|product|idea|text)\s*(?:yes|text|:|：)\s*([^。！？?!；;，,]+)",
        s,
        re.I,
    )
    if explicit:
        return explicit.group(1).strip()

    leading = re.search(
        r"^(.{2,80}?)(?:english_text|english_text|english_text|english_text|text(?:text|listing|text)|product researchtext)",
        s,
    )
    if leading:
        return leading.group(1).strip(" ：:，,")

    after_verb = re.search(r"(?:text)?(?:text|text|text)\s*([^。！？?!；;，,]{2,80})", s)
    if after_verb:
        return after_verb.group(1).strip(" ：:，,")

    return s[:80].strip()


def extract_platform_hints(text: str) -> list[str]:
    """Return platform names explicitly mentioned by the user, in mention order."""
    s = str(text or "")
    found: list[tuple[int, str]] = []
    for label, pattern in _PLATFORM_HINTS:
        match = re.search(pattern, s, re.I)
        if match:
            found.append((match.start(), label))
    ordered = []
    for _, label in sorted(found):
        if label == "Amazon Handmade" and "Amazon" in ordered:
            ordered.remove("Amazon")
        if label not in ordered:
            ordered.append(label)
    return ordered


def _template_card(idea: str, platform_hints: list[str] | None = None) -> dict:
    """english_text：fieldstext、english_text，english_textsourcetexttemplate。"""
    is_custom = any(h in idea.lower() for h in _CUSTOM_HINTS)
    is_gift = any(h in idea.lower() for h in _GIFT_HINTS)
    score = 50 + (10 if is_custom else 0) + (8 if is_gift else 0)
    platforms = platform_hints or (
        ["Etsy", "Amazon Handmade"] if is_custom or is_gift else ["Temu", "Amazon"]
    )
    return {
        "product_name": idea[:60],
        "opportunity_score": score,
        "competition_level": "text",
        "difficulty_level": "text",
        "profit_potential": "text",
        "platforms": platforms,
        "target_audience": ["gift buyers"] if is_gift else ["general"],
        "gift_scenes": ["text", "text"] if is_gift else [],
        "custom_elements": ["text", "text"] if is_custom else [],
        "hot_reason": "（texttemplatetext：text/english_textkeywordstext）",
        "variant_suggestions": ["english_text", "english_text"],
        "risk_notes": ["english_text，listingenglish_texthumanenglish_text",
                       "english_text/text/english_text"],
        "suggested_price": 0,
        "verdict": "templateenglish_text；configuration LLM Key english_text",
    }


def _normalize(card: dict) -> dict:
    """text LLM output：text/english_text，textfieldsenglish_text list。"""
    def _level(v):
        v = str(v or "text")
        return v if v in ("text", "text", "text") else "text"

    try:
        score = int(float(card.get("opportunity_score", 50)))
    except (TypeError, ValueError):
        score = 50
    card["opportunity_score"] = max(0, min(100, score))
    for key in ("competition_level", "difficulty_level", "profit_potential"):
        card[key] = _level(card.get(key))
    for key in ("platforms", "target_audience", "gift_scenes",
                "custom_elements", "variant_suggestions", "risk_notes"):
        value = card.get(key)
        if isinstance(value, str):
            card[key] = [v.strip() for v in re.split(r"[,，、;；]", value) if v.strip()]
        elif not isinstance(value, list):
            card[key] = []
        else:
            deduped = []
            for item in value:
                item = str(item).strip()
                if item and item not in deduped:
                    deduped.append(item)
            card[key] = deduped
    try:
        card["suggested_price"] = round(float(card.get("suggested_price", 0)), 2)
    except (TypeError, ValueError):
        card["suggested_price"] = 0
    return card


def analyze_idea(idea: str, profile: dict | None = None, org_id: str = "") -> dict:
    """english_text，english_text。

    profile：english_textyesenglish_text（text），yesenglish_text。
    """
    raw_idea = (idea or "").strip()
    idea = extract_product_idea(raw_idea)
    if not idea:
        raise ValueError("english_text")
    platform_hints = extract_platform_hints(raw_idea)

    context = ""
    if profile:
        keys = ("product_name", "category", "materials", "style", "colors")
        known = {k: profile[k] for k in keys if profile.get(k)}
        if known:
            context = "KNOWN PRODUCT PROFILE: " + json.dumps(
                known, ensure_ascii=False, default=str)[:400]

    source = "template"
    card = None
    if _llm_enabled():
        signals = _web_signals(idea, org_id=org_id)
        card = _call_llm(idea, context, signals)
        if card:
            source = "llm+web" if signals else "llm"
    if card is None:
        card = _template_card(idea, platform_hints)
    elif platform_hints:
        card["platforms"] = platform_hints

    card = _normalize(card)
    card["idea"] = idea[:200]
    card["raw_idea"] = raw_idea[:300]
    card["source"] = source
    return card


def card_to_pool_item(card: dict) -> dict:
    """english_text → english_textfields（product_pool.add_item english_text + textfields）。"""
    return {
        "name": card.get("product_name") or card.get("idea", "")[:60],
        "category": "/".join(card.get("platforms", [])[:2]),
        "target_price": card.get("suggested_price", 0),
        "notes": card.get("verdict", "")[:200],
        "extra": {
            "opportunityScore": card.get("opportunity_score", 0),
            "competitionLevel": card.get("competition_level", "text"),
            "riskLevel": ("text" if len(card.get("risk_notes", [])) >= 3
                          else "text" if card.get("risk_notes") else "text"),
            "giftScenes": card.get("gift_scenes", []),
            "customElements": card.get("custom_elements", []),
        },
    }
