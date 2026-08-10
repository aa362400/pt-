#!/usr/bin/env python3
"""
跨境本地化 — Localization

为不同目标市场生成本地化营销文案，并解决多语种字体渲染：
  - 多语言文案：英/德/法/西/日/韩/阿等市场的标题、卖点、CTA
  - LLM 优先（Gemini/OpenAI），失败自动回退到模板文案，保证离线可用
  - 多语种字体检测：按文字所属书写系统（拉丁/中日韩/阿拉伯/韩文）
    自动匹配系统字体，供 layout_engine 渲染时调用

用法：
  # 为三个市场生成本地化文案
  python localization.py --profile outputs/product_profile.json \
      --markets us jp de --output outputs/localized_copy.json

  # 查看支持的市场
  python localization.py --list-markets
"""

import argparse
import json
import os
import platform
import sys
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import (
    get_api_key,
    parse_json_response,
    resolve_analysis_engine,
    resolve_openai_api_key,
    setup_logger,
)

logger = setup_logger(__name__)

# ============================================================
# 目标市场定义
# ============================================================

MARKETS = {
    "us": {
        "name": "美国", "language": "English", "lang_code": "en",
        "script": "latin", "currency": "$",
        "tone": "direct, benefit-driven, energetic",
        "platforms": ["amazon_main", "walmart", "ebay", "tiktok_shop"],
    },
    "uk": {
        "name": "英国", "language": "English (UK)", "lang_code": "en",
        "script": "latin", "currency": "£",
        "tone": "understated, quality-focused, witty",
        "platforms": ["amazon_main", "ebay"],
    },
    "de": {
        "name": "德国", "language": "German", "lang_code": "de",
        "script": "latin", "currency": "€",
        "tone": "precise, factual, quality/engineering emphasis",
        "platforms": ["amazon_main"],
    },
    "fr": {
        "name": "法国", "language": "French", "lang_code": "fr",
        "script": "latin", "currency": "€",
        "tone": "elegant, lifestyle-oriented",
        "platforms": ["amazon_main"],
    },
    "es": {
        "name": "西班牙/拉美", "language": "Spanish", "lang_code": "es",
        "script": "latin", "currency": "€",
        "tone": "warm, family-oriented, expressive",
        "platforms": ["amazon_main", "mercado_libre"],
    },
    "jp": {
        "name": "日本", "language": "Japanese", "lang_code": "ja",
        "script": "cjk_jp", "currency": "¥",
        "tone": "polite, detail-oriented, seasonal sensitivity",
        "platforms": ["amazon_main"],
    },
    "kr": {
        "name": "韩国", "language": "Korean", "lang_code": "ko",
        "script": "hangul", "currency": "₩",
        "tone": "trendy, aesthetic-driven",
        "platforms": ["coupang"],
    },
    "sa": {
        "name": "中东（沙特/阿联酋）", "language": "Arabic", "lang_code": "ar",
        "script": "arabic", "currency": "ر.س",
        "tone": "respectful, family and quality emphasis; RTL layout",
        "platforms": ["amazon_main"],
    },
    "cn": {
        "name": "中国", "language": "Chinese", "lang_code": "zh",
        "script": "cjk", "currency": "¥",
        "tone": "简练有力，情绪价值",
        "platforms": ["taobao", "jd"],
    },
    "sea": {
        "name": "东南亚", "language": "English", "lang_code": "en",
        "script": "latin", "currency": "$",
        "tone": "value-for-money, vibrant, mobile-first",
        "platforms": ["lazada", "shopee", "tiktok_shop"],
    },
}

# ============================================================
# 离线模板文案（LLM 不可用时的回退）
# ============================================================

_FALLBACK_COPY = {
    "en": {
        "headline": "{name} — Made to Impress",
        "subtext": "Premium quality you can see and feel",
        "cta": "Shop Now",
        "badge": "NEW",
    },
    "de": {
        "headline": "{name} — Qualität, die überzeugt",
        "subtext": "Präzise verarbeitet, langlebig im Alltag",
        "cta": "Jetzt kaufen",
        "badge": "NEU",
    },
    "fr": {
        "headline": "{name} — L'élégance au quotidien",
        "subtext": "Une qualité premium, pensée pour vous",
        "cta": "Acheter",
        "badge": "NOUVEAU",
    },
    "es": {
        "headline": "{name} — Calidad que enamora",
        "subtext": "Diseñado para tu día a día",
        "cta": "Comprar ahora",
        "badge": "NUEVO",
    },
    "ja": {
        "headline": "{name} — 毎日をもっと心地よく",
        "subtext": "細部までこだわった上質な仕上がり",
        "cta": "今すぐ購入",
        "badge": "新発売",
    },
    "ko": {
        "headline": "{name} — 일상을 특별하게",
        "subtext": "디테일까지 완성한 프리미엄 퀄리티",
        "cta": "지금 구매하기",
        "badge": "신상품",
    },
    "ar": {
        "headline": "{name} — جودة تليق بك",
        "subtext": "تصميم فاخر لحياتك اليومية",
        "cta": "تسوق الآن",
        "badge": "جديد",
    },
    "zh": {
        "headline": "{name} — 品质看得见",
        "subtext": "匠心工艺，为生活加分",
        "cta": "立即购买",
        "badge": "新品",
    },
}

# ============================================================
# LLM 文案生成
# ============================================================

_COPY_SYSTEM_PROMPT = (
    "You are a senior cross-border e-commerce copywriter. "
    "Write native-quality marketing copy for product listing images. "
    "Output ONLY valid JSON, no markdown."
)

_COPY_PROMPT = """Product profile:
{product_json}

Target markets (write copy in each market's native language, matching local tone):
{markets_json}

For EACH market, produce listing-image copy:
{{
  "markets": {{
    "<market_code>": {{
      "language": "<lang_code>",
      "headline": "short punchy headline, <= 8 words / 16 CJK chars",
      "subtext": "one-line supporting benefit",
      "selling_points": ["3 short bullet points"],
      "cta": "call-to-action button text",
      "badge": "1-2 word promo badge (e.g. NEW)"
    }}
  }}
}}

Rules:
1. Native phrasing, NOT literal translation. Match each market tone.
2. Keep headline short enough to overlay on an image.
3. Currency-free copy (prices are added separately).
Output ONLY the JSON object."""


def _generate_via_gemini(profile: dict, markets: dict, api_key: str) -> dict:
    import requests

    prompt = _COPY_PROMPT.format(
        product_json=json.dumps(profile, ensure_ascii=False, indent=2),
        markets_json=json.dumps(
            {k: {"language": v["language"], "tone": v["tone"]} for k, v in markets.items()},
            ensure_ascii=False, indent=2,
        ),
    )
    resp = requests.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": _COPY_SYSTEM_PROMPT}]},
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4096},
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    text = ""
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        text += part.get("text", "")
    return parse_json_response(text)


def _generate_via_openai(profile: dict, markets: dict, api_key: str) -> dict:
    import requests

    prompt = _COPY_PROMPT.format(
        product_json=json.dumps(profile, ensure_ascii=False, indent=2),
        markets_json=json.dumps(
            {k: {"language": v["language"], "tone": v["tone"]} for k, v in markets.items()},
            ensure_ascii=False, indent=2,
        ),
    )
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini"),
            "messages": [
                {"role": "system", "content": _COPY_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
        },
        timeout=90,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]
    return parse_json_response(text)


def _fallback_copy(profile: dict, markets: dict) -> dict:
    """离线模板文案：无 API key / 调用失败时保证可用"""
    name = profile.get("product_name", "Product")
    features = profile.get("key_features", [])[:3]
    result = {}
    for code, market in markets.items():
        tpl = _FALLBACK_COPY.get(market["lang_code"], _FALLBACK_COPY["en"])
        result[code] = {
            "language": market["lang_code"],
            "headline": tpl["headline"].format(name=name),
            "subtext": tpl["subtext"],
            "selling_points": [str(f) for f in features],
            "cta": tpl["cta"],
            "badge": tpl["badge"],
            "source": "template_fallback",
        }
    return {"markets": result}


def generate_localized_copy(
    profile: dict,
    market_codes: list,
    output_path: str = "",
) -> dict:
    """
    为多个目标市场生成本地化文案。

    返回:
        {
          "markets": {"us": {headline, subtext, selling_points, cta, badge}, ...},
          "source": "gemini" | "openai" | "template_fallback",
        }
    """
    markets = {}
    for code in market_codes:
        code = str(code).strip().lower()
        if code in MARKETS:
            markets[code] = MARKETS[code]
        else:
            logger.warning(f"未知市场代码，跳过: {code}（可选: {', '.join(MARKETS)}）")
    if not markets:
        return {"markets": {}, "source": "none", "error": "无有效市场代码"}

    result = None
    source = "template_fallback"
    engine = resolve_analysis_engine()

    if engine == "gemini":
        api_key = get_api_key("gemini")
        if api_key:
            try:
                result = _generate_via_gemini(profile, markets, api_key)
                source = "gemini"
            except Exception as e:
                logger.warning(f"Gemini 文案生成失败，尝试回退: {e}")
    if result is None:
        openai_key = resolve_openai_api_key()
        if openai_key:
            try:
                result = _generate_via_openai(profile, markets, openai_key)
                source = "openai"
            except Exception as e:
                logger.warning(f"OpenAI 文案生成失败，使用模板回退: {e}")

    if not result or not result.get("markets"):
        result = _fallback_copy(profile, markets)
        source = "template_fallback"

    # 补齐市场元信息 + 缺失字段
    for code, market in markets.items():
        entry = result["markets"].setdefault(code, {})
        fallback = _FALLBACK_COPY.get(market["lang_code"], _FALLBACK_COPY["en"])
        entry.setdefault("language", market["lang_code"])
        entry.setdefault("headline", fallback["headline"].format(
            name=profile.get("product_name", "Product")))
        entry.setdefault("subtext", fallback["subtext"])
        entry.setdefault("selling_points", profile.get("key_features", [])[:3])
        entry.setdefault("cta", fallback["cta"])
        entry.setdefault("badge", fallback["badge"])
        entry["market_name"] = market["name"]
        entry["currency"] = market["currency"]
        entry["script"] = market["script"]
        entry["rtl"] = market["script"] == "arabic"
        entry["recommended_platforms"] = market["platforms"]

    result["source"] = source

    if output_path:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.info(f"📄 本地化文案已保存: {output_path}")

    return result


# ============================================================
# 多语种字体检测
# ============================================================

_FONT_CANDIDATES = {
    "Windows": {
        "cjk": ["msyh.ttc", "msyhbd.ttc", "simsun.ttc", "SIMHEI.TTF", "Deng.ttf"],
        "cjk_jp": ["YuGothM.ttc", "YuGothB.ttc", "msgothic.ttc", "meiryo.ttc", "msyh.ttc"],
        "hangul": ["malgun.ttf", "malgunbd.ttf", "gulim.ttc", "msyh.ttc"],
        "arabic": ["segoeui.ttf", "tahoma.ttf", "arial.ttf"],
        "latin": ["segoeui.ttf", "arial.ttf", "calibri.ttf"],
    },
    "Darwin": {
        "cjk": ["/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/STHeiti Light.ttc"],
        "cjk_jp": ["/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
                   "/System/Library/Fonts/Hiragino Sans GB.ttc",
                   "/System/Library/Fonts/PingFang.ttc"],
        "hangul": ["/System/Library/Fonts/AppleSDGothicNeo.ttc"],
        "arabic": ["/System/Library/Fonts/GeezaPro.ttc",
                   "/Library/Fonts/Arial Unicode.ttf"],
        "latin": ["/System/Library/Fonts/Helvetica.ttc",
                  "/System/Library/Fonts/SFNS.ttf"],
    },
    "Linux": {
        "cjk": ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"],
        "cjk_jp": ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                   "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"],
        "hangul": ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                   "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"],
        "arabic": ["/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
                   "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
        "latin": ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"],
    },
}

_SCRIPT_BY_LANG = {
    "zh": "cjk", "ja": "cjk_jp", "ko": "hangul", "ar": "arabic",
    "en": "latin", "de": "latin", "fr": "latin", "es": "latin",
    "it": "latin", "pt": "latin",
}


def detect_text_script(text: str) -> str:
    """按 Unicode 区段判断文本主要书写系统"""
    if not text:
        return "latin"
    for ch in text:
        cp = ord(ch)
        if 0x0600 <= cp <= 0x06FF or 0x0750 <= cp <= 0x077F:
            return "arabic"
        if 0xAC00 <= cp <= 0xD7AF or 0x1100 <= cp <= 0x11FF:
            return "hangul"
        if 0x3040 <= cp <= 0x30FF:  # 平假名/片假名
            return "cjk_jp"
    for ch in text:
        if 0x4E00 <= ord(ch) <= 0x9FFF:
            return "cjk"
    return "latin"


def get_font_for_script(script: str) -> Optional[str]:
    """按书写系统返回可用系统字体路径；找不到返回 None"""
    system = platform.system()
    table = _FONT_CANDIDATES.get(system, _FONT_CANDIDATES["Linux"])
    candidates = table.get(script, table.get("latin", []))

    if system == "Windows":
        fonts_dir = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")
        candidates = [os.path.join(fonts_dir, c) for c in candidates]

    for path in candidates:
        if os.path.exists(path):
            return path

    # Linux 上再用 fc-list 兜底
    if system not in ("Windows", "Darwin"):
        lang_hint = {"cjk": "zh", "cjk_jp": "ja", "hangul": "ko", "arabic": "ar"}.get(script)
        if lang_hint:
            try:
                import subprocess
                result = subprocess.run(
                    ["fc-list", f":lang={lang_hint}", "-f", "%{file}\n"],
                    capture_output=True, text=True, timeout=5,
                )
                for line in result.stdout.strip().split("\n"):
                    if line.strip() and os.path.exists(line.strip()):
                        return line.strip()
            except Exception:
                pass
    return None


def get_font_for_language(lang_code: str) -> Optional[str]:
    """按语言代码（en/zh/ja/ko/ar/de...）返回字体路径"""
    return get_font_for_script(_SCRIPT_BY_LANG.get(lang_code.lower(), "latin"))


def get_font_for_text(text: str) -> Optional[str]:
    """按文本内容自动匹配字体路径"""
    return get_font_for_script(detect_text_script(text))


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="跨境本地化文案生成")
    parser.add_argument("--profile", help="产品档案 JSON 路径")
    parser.add_argument("--markets", nargs="+", default=["us"],
                        help=f"目标市场: {' '.join(MARKETS)}")
    parser.add_argument("--output", default="", help="输出 JSON 路径")
    parser.add_argument("--list-markets", action="store_true", help="列出支持的市场")
    args = parser.parse_args()

    if args.list_markets:
        for code, m in MARKETS.items():
            font = get_font_for_script(m["script"])
            logger.info(
                f"  {code:4s} {m['name']}（{m['language']}）"
                f" 货币 {m['currency']} 字体 {os.path.basename(font) if font else '未找到'}"
            )
        return

    if not args.profile:
        parser.error("需要 --profile（或用 --list-markets 查看市场）")
    with open(args.profile, encoding="utf-8") as f:
        profile = json.load(f)

    result = generate_localized_copy(profile, args.markets, args.output)
    logger.info(f"✅ 文案来源: {result.get('source')}")
    for code, entry in result.get("markets", {}).items():
        logger.info(f"  [{code}] {entry.get('headline')} / {entry.get('cta')}")


if __name__ == "__main__":
    main()
