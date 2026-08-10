"""风险检测 Agent — 产品没卖起来，店先出问题，就是它没拦住（P4）。

四类检测，规则层全部离线可用：
1. 商标/版权/名人风险：knowledge/trademark_words.txt 词库（~150 高发投诉词）
2. 平台敏感词：医疗宣称 / 最高级用语 / 夸大宣传
3. 物流风险：材质关键词 → 易碎 / 带电 / 液体 / 磁性提示
4. 同质化提示：结合机会卡竞争度

有 LLM Key 时追加整体审读（可通过 RISK_CHECK_LLM=0 关闭）。
输出格式与《跨境Agent能力升级落地方案》P4 一致：
风险等级 / 主要风险 / 侵权 / 物流 / 修改建议 / 是否建议上架。
"""

from __future__ import annotations

import os
import re

LLM_TIMEOUT = 45

_WORDS_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                           "knowledge", "trademark_words.txt")
_words_cache: list[str] | None = None

# 「近似风险」词：单独出现可疑，常与 IP 组合出现
_SUSPICIOUS = ("princess castle", "wizard school", "superhero cape",
               "magic kingdom", "cartoon character", "movie character",
               "famous singer", "team logo")

# 平台敏感词（医疗宣称/最高级/夸大）
_SENSITIVE = ("cure", "治疗", "治愈", "疗效", "抗癌", "anti-cancer", "fda approved",
              "最好", "第一名", "best in the world", "no.1", "100% effective",
              "guaranteed to", "永不褪色", "never fade", "永久", "包治")

# 材质 → 物流风险提示
_LOGISTICS_RULES = (
    (("acrylic", "亚克力", "glass", "玻璃", "ceramic", "陶瓷", "porcelain", "水晶",
      "crystal"), "易碎材质，建议加保护膜/气泡柱/硬纸盒，控制退款率"),
    (("battery", "电池", "带电", "electronic", "led"),
     "带电/含电池，部分物流渠道受限，确认可走电池线"),
    (("liquid", "液体", "香水", "perfume", "oil"),
     "含液体，多数小包渠道禁运，需特殊渠道"),
    (("magnet", "磁铁", "磁性"), "含磁性，航空运输受限，需退磁包装或海运"),
    (("wood", "木质", "木制", "bamboo", "竹"),
     "木质品部分国家需熏蒸/植检证明（如澳新），发货前确认目的国"),
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
    """单条文本的侵权风险：安全 / 可疑 / 高风险。"""
    lower = (text or "").lower()
    if not lower:
        return "安全"
    if any(w in lower for w in _load_words()):
        return "高风险"
    if any(w in lower for w in _SUSPICIOUS):
        return "可疑"
    return "安全"


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
    except Exception:  # noqa: BLE001 — LLM 审读是增强项
        return None


def check_listing(title: str = "", description: str = "",
                  tags: list | None = None, profile: dict | None = None,
                  competition_level: str = "", use_llm: bool = True) -> dict:
    """对上架资料做整体风险体检，返回结构化报告。"""
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
        risks.append(f"命中商标/版权词：{', '.join(tm_hits[:6])}")
        suggestions.append("移除或替换命中的品牌/IP/名人词，用通用描述表达同类风格")
    if suspicious:
        risks.append(f"疑似 IP 关联表达：{', '.join(suspicious[:4])}")
        suggestions.append("避免暗示知名 IP 的组合描述，突出原创设计元素")
    if sensitive:
        risks.append(f"平台敏感/夸大用语：{', '.join(sensitive[:6])}")
        suggestions.append("删除医疗宣称与绝对化用语（最好/第一/100%/永久）")
    if logistics:
        risks.append("物流：" + "；".join(logistics))
    if competition_level == "高":
        risks.append("同质化：该方向竞争度高，需差异化（材质/组合/场景）才有机会")
        suggestions.append("增加差异化元素：换材质、加定制位、组合套装或独特使用场景")

    # LLM 补充审读
    llm_used = False
    if use_llm and combined.strip():
        extra = _llm_review(combined)
        if extra:
            llm_used = True
            risks.extend(str(r)[:150] for r in (extra.get("extra_risks") or [])[:4])
            suggestions.extend(
                str(s)[:150] for s in (extra.get("suggestions") or [])[:4])

    if tm_hits:
        level, verdict = "高", "不建议直接上架：先清除侵权词再上"
    elif sensitive or suspicious or len(risks) >= 3:
        level, verdict = "中", "建议修改后小批量测试"
    elif risks:
        level, verdict = "低", "可以上架，注意上述提示"
    else:
        level, verdict = "低", "未发现明显风险，可以上架"

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
