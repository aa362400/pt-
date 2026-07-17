"""风险检测 Agent — 产品没卖起来，店先出问题，就是它没拦住（P4）。

四类检测，规则层全部离线可用：
1. 商标/版权/名人风险：knowledge/trademark_words.txt 词库（~150 高发投诉词）
2. 平台敏感词：医疗宣称 / 最高级用语 / 夸大宣传
3. 物流风险：材质关键词 → 易碎 / 带电 / 液体 / 磁性提示
4. 同质化提示：结合机会卡竞争度

有 LLM Key 时追加整体审读（可通过 RISK_CHECK_LLM=0 关闭）。本地规则和
LLM 都不是外部合规放行证明：只有部署白名单内的 provider 提供完整、可审计且
passed=true 的凭证，并且本地规则零风险时，发布门禁才会 PASS。
输出格式与《跨境Agent能力升级落地方案》P4 一致：
风险等级 / 主要风险 / 侵权 / 物流 / 修改建议 / 是否建议上架。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timedelta, timezone

LLM_TIMEOUT = 45

RISK_EVIDENCE_MISSING = "RISK_EVIDENCE_MISSING"
RISK_CLEARANCE_INVALID = "RISK_CLEARANCE_INVALID"
RISK_CLEARANCE_REJECTED = "RISK_CLEARANCE_REJECTED"
RISK_INPUT_INSUFFICIENT = "RISK_INPUT_INSUFFICIENT"
RISK_SCREENING_UNAVAILABLE = "RISK_SCREENING_UNAVAILABLE"
RISK_CLEARANCE_SUBJECT_MISMATCH = "RISK_CLEARANCE_SUBJECT_MISMATCH"
RISK_CLEARANCE_STALE = "RISK_CLEARANCE_STALE"
RISK_INPUT_INVALID = "RISK_INPUT_INVALID"
RISK_SCOPE_INSUFFICIENT = "RISK_SCOPE_INSUFFICIENT"
MIN_TRADEMARK_WORDS = 100
DEFAULT_CLEARANCE_MAX_AGE_SECONDS = 86_400
CLEARANCE_CLOCK_SKEW_SECONDS = 300
EXPECTED_TRADEMARK_FILE_SHA256 = (
    "4fcb88cbae9efb641822731c82d64975a3bfc80495b489471dc73e303c533e28"
)
EXPECTED_TRADEMARK_WORDS_SHA256 = (
    "833531f9913eb05ee553f47a2a9fe840eb395b1b74638756a9db407e2270477b"
)

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


def _trademark_word_bank_integrity(words: list[str]) -> tuple[bool, dict]:
    try:
        with open(_WORDS_PATH, "rb") as handle:
            file_digest = hashlib.sha256(handle.read()).hexdigest()
    except OSError:
        file_digest = ""
    normalized_digest = hashlib.sha256(
        "\n".join(words).encode("utf-8")
    ).hexdigest()
    unique_count = len(set(words))
    available = (
        len(words) >= MIN_TRADEMARK_WORDS
        and unique_count == len(words)
        and file_digest == EXPECTED_TRADEMARK_FILE_SHA256
        and normalized_digest == EXPECTED_TRADEMARK_WORDS_SHA256
    )
    return available, {
        "count": len(words),
        "uniqueCount": unique_count,
        "fileSha256": file_digest or None,
        "normalizedSha256": normalized_digest,
        "expectedFileSha256": EXPECTED_TRADEMARK_FILE_SHA256,
    }


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


def _authorized_clearance_providers() -> set[str]:
    """Return the deployment-owned provider allow-list.

    A caller cannot authorize its own attestation.  Operators must explicitly
    configure providers through ``RISK_CLEARANCE_AUTHORIZED_PROVIDERS``.
    """
    return {
        provider.strip().casefold()
        for provider in os.environ.get(
            "RISK_CLEARANCE_AUTHORIZED_PROVIDERS", ""
        ).split(",")
        if provider.strip()
    }


def _canonical_attributes(value: object) -> object:
    if isinstance(value, dict):
        return {
            str(key): _canonical_attributes(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (list, tuple)):
        return [_canonical_attributes(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _canonical_string_list(value: object, *, sort_values: bool = False) -> list[str]:
    if not isinstance(value, (list, tuple)):
        values = [str(value).strip()] if value not in (None, "") else []
    else:
        values = [str(item).strip() for item in value if str(item).strip()]
    if sort_values:
        return sorted(set(values))
    return values


def listing_subject_hash(title: str = "", description: str = "",
                         tags: list | None = None,
                         profile: dict | None = None,
                         competition_level: str = "",
                         platform: str = "", scope_id: str = "",
                         bullets: list | None = None,
                         keywords: list | None = None,
                         attributes: dict | None = None,
                         image_hashes: list | None = None) -> str:
    """Return the canonical hash that a clearance attestation must cover."""
    profile = profile if isinstance(profile, dict) else {}
    payload = {
        "attributes": _canonical_attributes(attributes or {}),
        "bullets": _canonical_string_list(bullets),
        "competitionLevel": str(competition_level or "").strip(),
        "description": str(description or "").strip(),
        "imageHashes": _canonical_string_list(image_hashes, sort_values=True),
        "keywords": _canonical_string_list(keywords),
        "platform": str(platform or "").strip().casefold(),
        "profile": {
            "category": str(profile.get("category") or "").strip(),
            "materials": str(profile.get("materials") or "").strip(),
            "productName": str(profile.get("product_name") or "").strip(),
        },
        "scopeId": str(scope_id or "").strip(),
        "tags": _canonical_string_list(tags, sort_values=True),
        "title": str(title or "").strip(),
    }
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _normalize_clearance_evidence(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    return {
        "provider": str(value.get("provider") or "").strip(),
        "ruleset": str(value.get("ruleset") or "").strip(),
        "evidenceRef": str(
            value.get("evidenceRef") or value.get("evidence_ref") or ""
        ).strip(),
        "fetchedAt": str(
            value.get("fetchedAt") or value.get("fetched_at") or ""
        ).strip(),
        "expiresAt": str(
            value.get("expiresAt") or value.get("expires_at") or ""
        ).strip(),
        "subjectHash": str(
            value.get("subjectHash") or value.get("subject_hash") or ""
        ).strip(),
        "passed": value.get("passed"),
        "signature": str(value.get("signature") or "").strip(),
    }


def _parse_timezone_aware_iso8601(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo is not None else None


def _clearance_max_age_seconds() -> int:
    raw = os.environ.get("RISK_CLEARANCE_MAX_AGE_SECONDS", "").strip()
    if not raw:
        return DEFAULT_CLEARANCE_MAX_AGE_SECONDS
    try:
        parsed = int(raw)
    except ValueError:
        return DEFAULT_CLEARANCE_MAX_AGE_SECONDS
    return parsed if parsed > 0 else DEFAULT_CLEARANCE_MAX_AGE_SECONDS


def _clearance_is_current(fetched_at: datetime, expires_at: datetime) -> bool:
    now = datetime.now(timezone.utc)
    fetched_utc = fetched_at.astimezone(timezone.utc)
    expires_utc = expires_at.astimezone(timezone.utc)
    age_seconds = (now - fetched_utc).total_seconds()
    return (
        expires_utc > fetched_utc
        and fetched_utc <= now + timedelta(seconds=CLEARANCE_CLOCK_SKEW_SECONDS)
        and now < expires_utc
        and age_seconds <= _clearance_max_age_seconds()
    )


def _clearance_signature_is_valid(evidence: dict) -> bool:
    secret = os.environ.get("RISK_CLEARANCE_ATTESTATION_SECRET", "").encode(
        "utf-8"
    )
    if len(secret) < 32:
        return False
    supplied = evidence.get("signature", "")
    prefix = "hmac-sha256:"
    if not supplied.startswith(prefix):
        return False
    payload = json.dumps(
        {
            field: evidence[field]
            for field in (
                "provider", "ruleset", "evidenceRef", "fetchedAt",
                "expiresAt", "subjectHash", "passed"
            )
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    expected = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(supplied[len(prefix):].casefold(), expected)


def _clearance_evidence_status(
        value: object, expected_subject_hash: str) -> tuple[str, dict | None]:
    if value is None:
        return "MISSING", None

    evidence = _normalize_clearance_evidence(value)
    if evidence is None:
        return "INVALID", None

    metadata_complete = all(
        evidence[field]
        for field in (
            "provider", "ruleset", "evidenceRef", "fetchedAt", "expiresAt",
            "subjectHash", "signature"
        )
    )
    fetched_at = _parse_timezone_aware_iso8601(evidence["fetchedAt"])
    expires_at = _parse_timezone_aware_iso8601(evidence["expiresAt"])
    provider_authorized = (
        evidence["provider"].casefold() in _authorized_clearance_providers()
    )
    if (
        not metadata_complete
        or not provider_authorized
        or fetched_at is None
        or expires_at is None
        or type(evidence["passed"]) is not bool
        or not _clearance_signature_is_valid(evidence)
    ):
        return "INVALID", evidence
    if not hmac.compare_digest(
        evidence["subjectHash"].casefold(), expected_subject_hash.casefold()
    ):
        return "SUBJECT_MISMATCH", evidence
    if not _clearance_is_current(fetched_at, expires_at):
        return "STALE", evidence
    if evidence["passed"] is False:
        return "REJECTED", evidence
    return "ATTESTED", evidence


def check_listing(title: str = "", description: str = "",
                  tags: list | None = None, profile: dict | None = None,
                  competition_level: str = "", use_llm: bool = True,
                  clearance_evidence: dict | None = None,
                  platform: str = "", scope_id: str = "",
                  bullets: list | None = None,
                  keywords: list | None = None,
                  attributes: dict | None = None,
                  image_hashes: list | None = None) -> dict:
    """筛查 listing 并执行外部合规凭证门禁；默认 fail closed。"""
    input_valid = (
        isinstance(title, str)
        and isinstance(description, str)
        and isinstance(competition_level, str)
        and isinstance(platform, str)
        and isinstance(scope_id, str)
        and (tags is None or isinstance(tags, (list, tuple)))
        and (bullets is None or isinstance(bullets, (list, tuple)))
        and (keywords is None or isinstance(keywords, (list, tuple)))
        and (image_hashes is None or isinstance(image_hashes, (list, tuple)))
        and (profile is None or isinstance(profile, dict))
        and (attributes is None or isinstance(attributes, dict))
    )
    profile = profile if isinstance(profile, dict) else {}
    attributes = attributes if isinstance(attributes, dict) else {}
    tags = _canonical_string_list(tags) if isinstance(tags, (list, tuple)) else []
    bullets = (
        _canonical_string_list(bullets)
        if isinstance(bullets, (list, tuple)) else []
    )
    keywords = (
        _canonical_string_list(keywords)
        if isinstance(keywords, (list, tuple)) else []
    )
    image_hashes = (
        _canonical_string_list(image_hashes, sort_values=True)
        if isinstance(image_hashes, (list, tuple)) else []
    )
    subject_hash = listing_subject_hash(
        title=title,
        description=description,
        tags=tags,
        profile=profile,
        competition_level=competition_level,
        platform=platform,
        scope_id=scope_id,
        bullets=bullets,
        keywords=keywords,
        attributes=attributes,
        image_hashes=image_hashes,
    )
    combined = " ".join(filter(None, [
        title, description, " ".join(tags), " ".join(bullets),
        " ".join(keywords),
        str(profile.get("product_name", "")),
        str(profile.get("materials", "")),
        str(profile.get("category", "")),
        (
            json.dumps(_canonical_attributes(attributes), ensure_ascii=False)
            if attributes else ""
        ),
    ]))

    trademark_words = _load_words()
    trademark_screen_available, trademark_word_bank = (
        _trademark_word_bank_integrity(trademark_words)
    )
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

    evidence_status, normalized_evidence = _clearance_evidence_status(
        clearance_evidence, subject_hash
    )

    if tm_hits:
        level = "高"
    elif sensitive or suspicious or len(risks) >= 3:
        level = "中"
    else:
        level = "低"

    hard_gate_reasons: list[str] = []
    input_sufficient = bool(combined.strip())
    if not input_valid:
        hard_gate_reasons.append(RISK_INPUT_INVALID)
        suggestions.append("listing 字段类型无效；数组字段必须使用 JSON 数组")
    if not input_sufficient:
        hard_gate_reasons.append(RISK_INPUT_INSUFFICIENT)
        suggestions.append("提供至少一项可筛查的标题、描述、标签或结构化商品资料")
    if not trademark_screen_available:
        hard_gate_reasons.append(RISK_SCREENING_UNAVAILABLE)
        suggestions.append("恢复完整的商标/IP 风险词库后重新执行本地筛查")
    if evidence_status == "MISSING":
        hard_gate_reasons.append(RISK_EVIDENCE_MISSING)
        suggestions.append("补充经部署授权的外部风控机构放行凭证后重新审核")
    elif evidence_status == "INVALID":
        hard_gate_reasons.append(RISK_CLEARANCE_INVALID)
        suggestions.append("核对外部凭证的授权机构、规则版本、证据引用与带时区时间戳")
    elif evidence_status == "REJECTED":
        hard_gate_reasons.append(RISK_CLEARANCE_REJECTED)
        suggestions.append("外部风控未放行，修正商品资料并重新提交合规审核")
    elif evidence_status == "SUBJECT_MISMATCH":
        hard_gate_reasons.append(RISK_CLEARANCE_SUBJECT_MISMATCH)
        suggestions.append("为当前完整 listing 内容重新获取绑定主体哈希的外部放行凭证")
    elif evidence_status == "STALE":
        hard_gate_reasons.append(RISK_CLEARANCE_STALE)
        suggestions.append("外部放行凭证已过期、超出最大时效或时间异常，请重新审核")

    if tm_hits:
        hard_gate_reasons.append("RISK_HIGH:TRADEMARK")

    if not input_valid:
        screening_status = "INPUT_INVALID"
    elif not input_sufficient:
        screening_status = "INPUT_INSUFFICIENT"
    elif not trademark_screen_available:
        screening_status = "SCREENING_UNAVAILABLE"
    elif tm_hits:
        screening_status = "HIGH_RISK_DETECTED"
    elif risks:
        screening_status = "REVIEW_REQUIRED"
    elif evidence_status == "ATTESTED":
        screening_status = "CLEARED"
    else:
        screening_status = "RULE_SCREENED"

    if (
        not input_valid
        or not input_sufficient
        or not trademark_screen_available
        or tm_hits
        or evidence_status != "ATTESTED"
    ):
        decision = "BLOCK"
    elif risks:
        decision = "REVIEW"
    else:
        decision = "PASS"

    if not input_valid:
        verdict = "listing 输入结构无效，无法证明完整内容已被筛查；禁止上架"
    elif not input_sufficient:
        verdict = "缺少可筛查的商品资料，无法完成风险判断；禁止上架并补充输入"
    elif tm_hits:
        verdict = "本地规则命中高风险商标/IP 词；不得上架，且外部凭证不能覆盖该命中"
    elif not trademark_screen_available:
        verdict = "本地商标/IP 规则词库缺失或不完整，筛查不可用；禁止上架并修复规则源"
    elif evidence_status == "MISSING":
        verdict = "仅完成本地规则筛查；缺少经授权且可审计的外部合规放行证据，禁止上架并转人工审核"
    elif evidence_status == "INVALID":
        verdict = "外部合规凭证无效或机构未获部署授权，禁止上架并转人工审核"
    elif evidence_status == "REJECTED":
        verdict = "外部合规审核未通过，禁止上架并转人工审核"
    elif evidence_status == "SUBJECT_MISMATCH":
        verdict = "外部合规凭证未绑定当前 listing 内容，禁止复用并需重新审核"
    elif evidence_status == "STALE":
        verdict = "外部合规凭证已过期或超出允许时效，禁止上架并需重新审核"
    elif risks:
        verdict = "外部放行凭证已核验，但本地规则仍发现风险提示；不得自动上架，需人工复核"
    else:
        verdict = "本地规则未命中风险，且已核验授权外部合规放行证据；通过当前风险门禁"

    return {
        "riskLevel": level,
        "detectedRiskLevel": level,
        "risks": risks,
        "trademarkHits": tm_hits,
        "sensitiveHits": sensitive,
        "logisticsNotes": logistics,
        "suggestions": suggestions,
        "verdict": verdict,
        "llmUsed": llm_used,
        "screeningStatus": screening_status,
        "screeningComponents": {
            "trademarkWordBank": (
                "AVAILABLE" if trademark_screen_available else "UNAVAILABLE"
            ),
            "trademarkWordBankEvidence": trademark_word_bank,
            "sensitiveClaims": "COMPLETED",
            "logisticsRules": "COMPLETED",
            "llmReview": "COMPLETED" if llm_used else "NOT_USED",
        },
        "evidenceStatus": evidence_status,
        "decision": decision,
        "publishable": decision == "PASS",
        "hardGateReasons": hard_gate_reasons,
        "clearanceEvidence": normalized_evidence,
        "listingSubjectHash": subject_hash,
        "evidencePolicy": {
            "maxAgeSeconds": _clearance_max_age_seconds(),
            "clockSkewSeconds": CLEARANCE_CLOCK_SKEW_SECONDS,
        },
    }
