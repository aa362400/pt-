"""爆品选品雷达 — 一句话产品想法 → 机会评分卡（P2）。

围绕「可上架、可改款、可定制、可赚钱」评估一个产品想法：
机会评分 / 竞争难度 / 制作难度 / 利润空间 / 适合平台 / 目标人群 /
礼物场景 / 可定制元素 / 改款建议 / 风险提醒。

链路：可选联网拉平台信号（SERPER/TAVILY，有 Key 才用）→ LLM 评估 →
无 Key / 失败时规则模板兜底（离线可用，字段完整只是判断保守）。
机会卡结构与《跨境Agent能力升级落地方案》第 9 节一致，可直接入新品池。
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
{{"product_name": "英文产品名",
  "opportunity_score": 0-100,
  "competition_level": "低|中|高",
  "difficulty_level": "低|中|高",
  "profit_potential": "低|中|高",
  "platforms": ["Etsy", ...],
  "target_audience": ["dog mom", ...],
  "gift_scenes": ["生日", ...],
  "custom_elements": ["姓名", ...],
  "hot_reason": "一句话热卖原因",
  "variant_suggestions": ["改款建议1", ...],
  "risk_notes": ["风险提醒1", ...],
  "suggested_price": 19.99,
  "verdict": "一句话结论：值不值得做、怎么切入"}}"""


def _api_key() -> str:
    from common.utils import resolve_openai_api_key
    return resolve_openai_api_key().strip()


def _llm_enabled() -> bool:
    if os.environ.get("COMMERCE_AGENT_MOCK", "").strip() == "1":
        return False
    return bool(_api_key())


def _web_signals(idea: str, org_id: str = "") -> str:
    """有搜索 Key 时抓平台热度信号摘要注入 LLM；没有则返回空串。

    优先走平台通道（ShopMate 后端 API），不可用时降级到外部搜索。
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
                parts.append("平台趋势数据:\n" + "\n".join(trend_lines))
            if products:
                product_lines = [
                    f"- {p.get('title', '')}" for p in products[:5]
                ]
                parts.append("平台产品数据:\n" + "\n".join(product_lines))
            if parts:
                return "MARKET SIGNALS (platform):\n" + "\n".join(parts)
    except Exception:  # noqa: BLE001 — 平台通道失败静默降级
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
    except Exception:  # noqa: BLE001 — 联网信号是增强项，失败静默
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
    except Exception:  # noqa: BLE001 — LLM 失败走模板
        return None


_CUSTOM_HINTS = ("定制", "刻字", "照片", "姓名", "personalized", "custom", "名字")
_GIFT_HINTS = ("礼物", "纪念", "gift", "memorial", "礼品", "送礼", "礼盒")
_PLATFORM_HINTS = (
    ("Etsy", r"\bEtsy\b|etsy"),
    ("Amazon", r"\bAmazon\b|amazon|亚马逊"),
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
        r"(?:产品|商品|品类|product|idea|想法)\s*(?:是|为|:|：)\s*([^。！？?!；;，,]+)",
        s,
        re.I,
    )
    if explicit:
        return explicit.group(1).strip()

    leading = re.search(
        r"^(.{2,80}?)(?:能不能做|值不值得做|值得做吗|适不适合|适合(?:卖|上架|做)|选品分析)",
        s,
    )
    if leading:
        return leading.group(1).strip(" ：:，,")

    after_verb = re.search(r"(?:帮我)?(?:评估|分析|看看)\s*([^。！？?!；;，,]{2,80})", s)
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
    """离线兜底：字段完整、判断保守，明确标注来源为模板。"""
    is_custom = any(h in idea.lower() for h in _CUSTOM_HINTS)
    is_gift = any(h in idea.lower() for h in _GIFT_HINTS)
    score = 50 + (10 if is_custom else 0) + (8 if is_gift else 0)
    platforms = platform_hints or (
        ["Etsy", "Amazon Handmade"] if is_custom or is_gift else ["Temu", "Amazon"]
    )
    return {
        "product_name": idea[:60],
        "opportunity_score": score,
        "competition_level": "中",
        "difficulty_level": "中",
        "profit_potential": "中",
        "platforms": platforms,
        "target_audience": ["gift buyers"] if is_gift else ["general"],
        "gift_scenes": ["生日", "节日"] if is_gift else [],
        "custom_elements": ["姓名", "日期"] if is_custom else [],
        "hot_reason": "（离线模板评估：定制/礼物属性按关键词粗判）",
        "variant_suggestions": ["增加节日限定版", "增加材质差异化版本"],
        "risk_notes": ["未联网核实竞争度，上架前建议人工看一眼同类销量",
                       "避免品牌/明星/球队等侵权元素"],
        "suggested_price": 0,
        "verdict": "模板评估仅供参考；配置 LLM Key 后可获得完整判断",
    }


def _normalize(card: dict) -> dict:
    """收敛 LLM 输出：评分/枚举夹紧，列表字段确保为 list。"""
    def _level(v):
        v = str(v or "中")
        return v if v in ("低", "中", "高") else "中"

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
    """评估一个产品想法，返回机会卡。

    profile：会话里已有的产品档案（可选），有则注入让判断更准。
    """
    raw_idea = (idea or "").strip()
    idea = extract_product_idea(raw_idea)
    if not idea:
        raise ValueError("产品想法不能为空")
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
    """机会卡 → 新品池条目字段（product_pool.add_item 的入参 + 扩展字段）。"""
    return {
        "name": card.get("product_name") or card.get("idea", "")[:60],
        "category": "/".join(card.get("platforms", [])[:2]),
        "target_price": card.get("suggested_price", 0),
        "notes": card.get("verdict", "")[:200],
        "extra": {
            "opportunityScore": card.get("opportunity_score", 0),
            "competitionLevel": card.get("competition_level", "中"),
            "riskLevel": ("高" if len(card.get("risk_notes", [])) >= 3
                          else "中" if card.get("risk_notes") else "低"),
            "giftScenes": card.get("gift_scenes", []),
            "customElements": card.get("custom_elements", []),
        },
    }
