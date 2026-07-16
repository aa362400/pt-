"""记忆系统 v2 — AutoMem 式分层可编辑记忆文件（经验卡片 + 审核 + 召回）。

设计（对应《跨境Agent能力升级落地方案》P1）：
- 五类 Markdown 记忆文件，人可读可改，Agent 每次任务后自动沉淀：
    profiles/memory/product_memory.md    产品/爆款方向记忆
    profiles/memory/keyword_memory.md    关键词有效性记忆
    profiles/memory/style_memory.md      图片风格记忆
    profiles/memory/risk_memory.md       风险与禁词记忆
    profiles/memory/store_strategy.md    店铺策略/SOP 记忆
- 经验卡片：任务复盘固定格式（任务/结果/成功点/风险点/下次优先/禁止重复）。
- Memory Reviewer：不是什么都值得存——LLM 审「长期有效？业务相关？影响未来决策？」，
  无 Key 时按规则兜底（有具体结论/含平台或品类词才收）。
- recall()：2-gram 词重合度跨文件召回，注入编排 LLM 上下文。

所有写入失败静默，绝不阻断主流程（与 user_memory / knowledge_base 同一原则）。
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

# 记忆类别 → 文件名（类别即业务语义，写入时按内容路由）
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
    "product": ("产品", "选品", "爆款", "类目", "品类", "定制", "礼物", "新品"),
    "keyword": ("关键词", "标签", "搜索", "长尾", "keyword", "tag"),
    "style": ("风格", "色调", "构图", "光线", "场景图", "白底", "氛围", "样式"),
    "risk": ("风险", "侵权", "禁", "违规", "下架", "封店", "敏感", "商标", "版权"),
    "strategy": ("策略", "定价", "利润", "广告", "平台", "流程", "sop", "上架"),
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
    """按关键词把一条记忆路由到类别，默认 strategy。"""
    lower = (text or "").lower()
    best, best_hits = "strategy", 0
    for cat, hints in _CATEGORY_HINTS.items():
        hits = sum(1 for h in hints if h in lower)
        if hits > best_hits:
            best, best_hits = cat, hits
    return best


def _rule_review(text: str) -> bool:
    """无 LLM 时的规则审核：太短、纯情绪、无业务词的不收。"""
    text = (text or "").strip()
    if len(text) < 8:
        return False
    if re.fullmatch(r"[好的嗯哦谢谢收到okOK！!。.\s]+", text):
        return False
    business_words = ("平台", "产品", "关键词", "风格", "风险", "利润", "标题",
                      "场景", "客户", "etsy", "amazon", "temu", "tiktok",
                      "shopify", "ebay", "标签", "禁", "侵权", "定价")
    return any(w in text.lower() for w in business_words)


def _llm_review(text: str) -> dict | None:
    """LLM 审核，返回 {"keep", "category"} 或 None（不可用/失败）。"""
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
    except Exception:  # noqa: BLE001 — 审核失败回退规则
        pass
    return None


def review(text: str) -> tuple[bool, str]:
    """审核一条候选记忆。返回 (是否入库, 类别)。"""
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
    """沉淀一条记忆（先审核后入库，去重）。返回是否已写入。"""
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
                return False  # 去重
            entries.append(entry)
            _save_entries(path, entries, os.path.splitext(
                os.path.basename(path))[0])
        return True
    except Exception:  # noqa: BLE001 — 记忆写入绝不阻断主流程
        return False


def write_card(card: dict) -> bool:
    """写入经验卡片（任务复盘固定格式），按内容拆条路由到各记忆文件。

    card 字段：task（任务）、outcome（结果）、success（成功点）、
    risk（风险点）、next（下次优先）、avoid（禁止重复）。
    """
    try:
        written = False
        task = str(card.get("task", "")).strip()
        prefix = f"任务「{task[:40]}」" if task else ""
        mapping = [
            ("success", "strategy", "成功点"),
            ("risk", "risk", "风险点"),
            ("next", "product", "下次优先"),
            ("avoid", "risk", "禁止重复"),
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
    """跨五类记忆文件召回最相关的 k 条，返回 [{"category", "text"}]。"""
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
    """各类记忆条数（记忆面板/调试用）。"""
    return {cat: len(_load_entries(_file_path(cat))) for cat in CATEGORIES}
