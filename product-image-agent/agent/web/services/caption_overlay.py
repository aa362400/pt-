"""english_text — text LLM generationenglish_textgenerationtext，english_textlistingenglish_text。

text：english_text + texttitle + texttitle，english_text（english_text）。
textsourceenglish_text：userenglish_text > LLM english_textgeneration > english_text。
LLM failedenglish_text，english_text。
"""

from __future__ import annotations

import json
import os
import re

LLM_TIMEOUT = 30

_COPY_PROMPT = """You write punchy e-commerce listing image copy.
Given a PRODUCT profile and the IMAGE purpose, return JSON:
{"headline": "<max 6 words, benefit-driven English headline>",
 "subline": "<max 10 words supporting English subline>"}
No brand names, no emoji, no quotes inside values."""


def _api_key() -> str:
    return (os.getenv("OPENAI_API_KEY_PREMIUM", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip())


def _llm_copy(plan_entry: dict, profile: dict) -> tuple[str, str] | None:
    if os.environ.get("COMMERCE_LLM_PLAN", "1").strip() in ("0", "false", "off"):
        return None
    key = _api_key()
    if not key:
        return None
    try:
        import requests

        base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        user = json.dumps({
            "PRODUCT": {k: profile[k] for k in
                        ("product_name", "category", "material", "style",
                         "key_features", "selling_points") if profile.get(k)},
            "IMAGE": {"title": plan_entry.get("titleEn") or plan_entry.get("title", ""),
                      "purpose": plan_entry.get("purpose", "")},
        }, ensure_ascii=False)
        resp = requests.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json={
                "model": os.getenv("LLM_MODEL", "gpt-5.5"),
                "messages": [{"role": "system", "content": _COPY_PROMPT},
                             {"role": "user", "content": user}],
                "temperature": 0.5,
                "max_tokens": 200,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        text = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", text, re.S)
        data = json.loads(match.group(0)) if match else None
        headline = str((data or {}).get("headline", "")).strip()
        subline = str((data or {}).get("subline", "")).strip()
        if headline:
            return headline, subline
    except Exception:  # noqa: BLE001 — LLM textfailedenglish_texttemplatetext
        pass
    return None


def build_copy(custom_text: str, plan_entry: dict, profile: dict) -> tuple[str, str]:
    """english_texttitle/texttitle。custom_text text「title | texttitle」text。"""
    if custom_text:
        parts = re.split(r"\s*[|｜\n]\s*", custom_text, maxsplit=1)
        return parts[0][:60], (parts[1][:80] if len(parts) > 1 else "")

    llm = _llm_copy(plan_entry, profile)
    if llm:
        return llm

    headline = (plan_entry.get("titleEn") or plan_entry.get("title")
                or profile.get("product_name") or "Perfect Gift")
    points = profile.get("selling_points") or []
    subline = points[0] if isinstance(points, list) and points else (
        plan_entry.get("purpose", ""))
    return str(headline)[:60], str(subline)[:80]


_POSTER_COPY_PROMPT = """You write high-impact e-commerce campaign poster copy.
Given a PRODUCT profile, return JSON:
{"headline": "<max 5 words, bold benefit-driven English headline>",
 "subline": "<max 12 words supporting English subline>",
 "cta": "<max 3 words call-to-action, e.g. Shop Now>"}
No brand names, no emoji, no quotes inside values."""


def build_poster_copy(custom_text: str, plan_entry: dict, profile: dict) -> tuple[str, str, str]:
    """english_text：title/texttitle/CTA。custom_text text「title | texttitle | CTA」。"""
    if custom_text:
        parts = re.split(r"\s*[|｜\n]\s*", custom_text, maxsplit=2)
        return (parts[0][:40],
                parts[1][:80] if len(parts) > 1 else "",
                parts[2][:20] if len(parts) > 2 else "Shop Now")

    key = _api_key()
    if key and os.environ.get("COMMERCE_LLM_PLAN", "1").strip() not in ("0", "false", "off"):
        try:
            import requests

            base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
            user = json.dumps({
                "PRODUCT": {k: profile[k] for k in
                            ("product_name", "category", "material", "style",
                             "key_features", "selling_points") if profile.get(k)},
            }, ensure_ascii=False)
            resp = requests.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}",
                         "Content-Type": "application/json"},
                json={
                    "model": os.getenv("LLM_MODEL", "gpt-5.5"),
                    "messages": [{"role": "system", "content": _POSTER_COPY_PROMPT},
                                 {"role": "user", "content": user}],
                    "temperature": 0.6,
                    "max_tokens": 200,
                },
                timeout=LLM_TIMEOUT,
            )
            resp.raise_for_status()
            text = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
            match = re.search(r"\{.*\}", text, re.S)
            data = json.loads(match.group(0)) if match else {}
            headline = str(data.get("headline", "")).strip()
            if headline:
                return (headline[:40],
                        str(data.get("subline", "")).strip()[:80],
                        (str(data.get("cta", "")).strip() or "Shop Now")[:20])
        except Exception:  # noqa: BLE001 — LLM failedenglish_texttemplatetext
            pass

    headline, subline = build_copy("", plan_entry, profile)
    return headline[:40], subline, "Shop Now"


def _pick_font(size: int, font_path: str = ""):
    from PIL import ImageFont

    candidates = ([font_path] if font_path else []) + [
        "C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render_caption(src: str, dst: str, headline: str, subline: str = "",
                   font_path: str = "") -> str:
    """english_text + english_text，outputtext JPEG。font_path english_text。"""
    from PIL import Image, ImageDraw

    img = Image.open(src).convert("RGB")
    w, h = img.size

    band_h = int(h * (0.24 if subline else 0.18))
    overlay = Image.new("L", (w, band_h), 0)
    od = ImageDraw.Draw(overlay)
    for y in range(band_h):
        od.line([(0, y), (w, y)], fill=int(190 * (y / max(band_h - 1, 1)) ** 1.2))
    shade = Image.new("RGB", (w, band_h), (12, 10, 24))
    img.paste(Image.composite(shade, img.crop((0, h - band_h, w, h)), overlay),
              (0, h - band_h))

    draw = ImageDraw.Draw(img)

    def _fit(text: str, max_size: int, max_w: float):
        size = max_size
        while size > 12:
            font = _pick_font(size, font_path)
            if draw.textlength(text, font=font) <= max_w:
                return font
            size -= 2
        return _pick_font(12, font_path)

    head_font = _fit(headline, int(h * 0.055), w * 0.9)
    hb = draw.textbbox((0, 0), headline, font=head_font)
    head_h = hb[3] - hb[1]

    sub_font = _fit(subline, int(h * 0.032), w * 0.86) if subline else None
    sub_h = 0
    if subline and sub_font:
        sb = draw.textbbox((0, 0), subline, font=sub_font)
        sub_h = sb[3] - sb[1]

    gap = int(h * 0.012)
    total = head_h + ((gap + sub_h) if subline else 0)
    y = h - int(band_h * 0.52) - total // 2
    draw.text((w / 2, y), headline, font=head_font, fill=(255, 255, 255),
              anchor="ma")
    if subline and sub_font:
        draw.text((w / 2, y + head_h + gap), subline, font=sub_font,
                  fill=(224, 220, 240), anchor="ma")

    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    img.save(dst, "JPEG", quality=92)
    return dst


def _wrap_text(draw, text: str, font, max_w: float) -> list[str]:
    """english_text（text，text 3 text）。"""
    words = text.split()
    lines, cur = [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
        if len(lines) == 3:
            break
    if cur and len(lines) < 3:
        lines.append(cur)
    return lines or [text]


def render_poster(src: str, dst: str, headline: str, subline: str = "",
                  cta: str = "Shop Now", font_path: str = "") -> str:
    """english_text：text 1/3 english_texttitle + texttitle + CTA text，english_text scrim。

    text scene_11_promo_poster templatetext（templateenglish_text）。
    """
    from PIL import Image, ImageDraw

    img = Image.open(src).convert("RGB")
    w, h = img.size

    # english_text scrim：english_text，english_text（english_text 2/3）
    scrim_w = int(w * 0.46)
    overlay = Image.new("L", (scrim_w, h), 0)
    od = ImageDraw.Draw(overlay)
    for x in range(scrim_w):
        od.line([(x, 0), (x, h)], fill=int(165 * (1 - x / max(scrim_w - 1, 1)) ** 1.3))
    shade = Image.new("RGB", (scrim_w, h), (10, 8, 22))
    img.paste(Image.composite(shade, img.crop((0, 0, scrim_w, h)), overlay), (0, 0))

    draw = ImageDraw.Draw(img)
    margin_x = int(w * 0.055)
    max_text_w = w * 0.34

    head_font = _pick_font(int(h * 0.085), font_path)
    head_lines = _wrap_text(draw, headline, head_font, max_text_w)
    line_h = int(h * 0.085 * 1.18)

    sub_font = _pick_font(int(h * 0.034), font_path) if subline else None
    sub_lines = _wrap_text(draw, subline, sub_font, max_text_w) if subline else []
    sub_line_h = int(h * 0.034 * 1.35)

    cta_font = _pick_font(int(h * 0.036), font_path) if cta else None

    block_h = (len(head_lines) * line_h
               + (int(h * 0.03) + len(sub_lines) * sub_line_h if sub_lines else 0)
               + (int(h * 0.06) + int(h * 0.036) + int(h * 0.045) if cta else 0))
    y = max(int(h * 0.1), (h - block_h) // 2)

    for line in head_lines:
        draw.text((margin_x, y), line, font=head_font, fill=(255, 255, 255))
        y += line_h
    if sub_lines and sub_font:
        y += int(h * 0.03)
        for line in sub_lines:
            draw.text((margin_x, y), line, font=sub_font, fill=(226, 222, 242))
            y += sub_line_h
    if cta and cta_font:
        y += int(h * 0.06)
        pad_x, pad_y = int(h * 0.035), int(h * 0.02)
        tw = draw.textlength(cta, font=cta_font)
        cta_h = int(h * 0.036)
        draw.rounded_rectangle(
            [margin_x, y, margin_x + tw + pad_x * 2, y + cta_h + pad_y * 2],
            radius=(cta_h + pad_y * 2) // 2, fill=(122, 103, 255))
        draw.text((margin_x + pad_x, y + pad_y), cta, font=cta_font,
                  fill=(255, 255, 255))

    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    img.save(dst, "JPEG", quality=92)
    return dst
