#!/usr/bin/env python3
"""
english_text / textscenetext — Region & Festival Scene Library

english_text：
  1. english_text（REGION_PACKS）：english_textscene prompt english_text
     （text/text/text/text/english_text/text），english_text、text、english_text
  2. textscenetemplate（FESTIVAL_SCENES）：text/text/Prime Day/text/english_text
     english_textscenetemplate，text templates/scenes/*.json text
  3. english_text（MARKETING_CALENDAR）：english_text N english_text

text：
  # textsceneenglish_text
  python region_scenes.py --scene-plan outputs/scene_plan.json \
      --region jp --output outputs/scene_plan_jp.json

  # english_text 60 english_text
  python region_scenes.py --calendar us --days 60

  # english_textyestexttemplate
  python region_scenes.py --list-festivals
"""

import argparse
import copy
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import setup_logger

logger = setup_logger(__name__)

# ============================================================
# english_text
# ============================================================

REGION_PACKS = {
    "na": {
        "name": "text",
        "markets": ["us", "ca"],
        "style_suffix": (
            " Styled for the North American market: bright open spaces, "
            "modern farmhouse or contemporary interiors, generous natural light, "
            "confident bold composition."
        ),
        "color_palette": "clean whites, warm woods, navy and denim accents",
        "props": "hardwood floors, marble countertops, large windows, greenery",
        "avoid": "cluttered small spaces, dim lighting",
    },
    "eu": {
        "name": "text",
        "markets": ["uk", "de", "fr", "es", "it"],
        "style_suffix": (
            " Styled for the European market: understated elegance, "
            "Scandinavian minimalism or classic Parisian interiors, muted "
            "sophisticated tones, heritage and craftsmanship cues."
        ),
        "color_palette": "muted sage, cream, terracotta, aged brass accents",
        "props": "linen textiles, ceramic vessels, vintage wood, cobblestone streets",
        "avoid": "loud saturated colors, oversized americana",
    },
    "jp": {
        "name": "text",
        "markets": ["jp"],
        "style_suffix": (
            " Styled for the Japanese market: wabi-sabi aesthetics, clean "
            "uncluttered composition with generous negative space, soft diffused "
            "light, natural materials, subtle seasonal references (shun)."
        ),
        "color_palette": "soft neutrals, washi paper white, muted indigo, matcha green",
        "props": "tatami textures, shoji screens, ceramic tea ware, bonsai or ikebana",
        "avoid": "loud colors, crowded composition, exaggerated expressions",
    },
    "kr": {
        "name": "text",
        "markets": ["kr"],
        "style_suffix": (
            " Styled for the Korean market: trendy cafe aesthetics, dreamy "
            "pastel tones, soft glowy lighting, Instagram-worthy minimal styling, "
            "K-beauty inspired clean sophistication."
        ),
        "color_palette": "milky pastels, cream beige, soft pink, light grey",
        "props": "marble cafe tables, dried flowers, aesthetic stationery, soft blankets",
        "avoid": "heavy rustic textures, dark moody tones",
    },
    "sea": {
        "name": "english_text",
        "markets": ["sea", "th", "vn", "id", "my", "ph"],
        "style_suffix": (
            " Styled for the Southeast Asian market: vibrant tropical energy, "
            "bright saturated colors, lush greenery, airy bamboo and rattan "
            "textures, lively mobile-first composition."
        ),
        "color_palette": "tropical greens, vivid coral, sunny yellow, ocean blue",
        "props": "rattan furniture, palm leaves, tropical fruits, bright tiles",
        "avoid": "cold wintry scenes, muted gloomy palettes",
    },
    "me": {
        "name": "text",
        "markets": ["sa", "ae"],
        "style_suffix": (
            " Styled for the Middle Eastern market: luxurious and generous "
            "presentation, rich warm tones, ornate geometric patterns, gold "
            "accents, family-oriented abundance. Modest styling throughout."
        ),
        "color_palette": "desert gold, deep emerald, royal purple, warm sand",
        "props": "brass trays, geometric lanterns, rich fabrics, dates and coffee",
        "avoid": "immodest imagery, alcohol references, pork-related props",
    },
}

# ============================================================
# textscenetemplate（text templates/scenes/*.json text）
# ============================================================

FESTIVAL_SCENES = {
    "black_friday": {
        "scene_id": "festival_black_friday",
        "scene_name": "english_text — Black Friday",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / text / english_text",
        "months": [11], "regions": ["na", "eu", "me", "sea"],
        "prompt": (
            "Dramatic Black Friday sale scene featuring {{product_name}}. "
            "The {{product_category}} is spotlighted on a dark stage-like surface "
            "with bold high-contrast lighting. Deep black background with subtle "
            "red and gold accents suggesting excitement and urgency. "
            "{{product_description}} Premium hero shot with dramatic rim "
            "lighting. Key visible features: {{key_features}}."
        ),
        "negative_prompt": "cluttered, cheap look, low quality, blurry product, text, watermark",
        "style": "Dramatic hero product photography, high contrast, premium sale campaign",
        "lighting": "Dramatic spotlight, strong rim light, dark moody environment",
        "color_palette": "Black background, red and gold accents (#111111, #E02020, #FFB300)",
        "aspect_ratio": "1:1",
    },
    "christmas": {
        "scene_id": "festival_christmas",
        "scene_name": "english_text — Christmas",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / english_text / text",
        "months": [11, 12], "regions": ["na", "eu"],
        "prompt": (
            "Cozy Christmas holiday scene featuring {{product_name}}. "
            "The {{product_category}} is presented as a perfect gift beside "
            "a softly glowing Christmas tree with warm fairy lights bokeh. "
            "Wrapped presents, pine branches and subtle ornaments around. "
            "{{product_description}} Warm inviting holiday atmosphere. "
            "Key visible features: {{key_features}}."
        ),
        "negative_prompt": "cluttered, tacky decorations, harsh light, blurry product, text",
        "style": "Warm holiday lifestyle photography, gift-focused, festive but elegant",
        "lighting": "Warm fairy light bokeh, soft candle-like glow, cozy evening light",
        "color_palette": "Warm reds, forest green, gold, cream (#B3282D, #1E4633, #D4AF37)",
        "aspect_ratio": "4:3",
    },
    "prime_day": {
        "scene_id": "festival_prime_day",
        "scene_name": "Prime Day text",
        "emotion": "english_text、text、english_text",
        "ecommerce_use": "Amazon english_text / text",
        "months": [7, 10], "regions": ["na", "eu", "jp"],
        "prompt": (
            "Clean modern deal-event scene featuring {{product_name}}. "
            "The {{product_category}} floats on a smooth gradient studio "
            "background in blue tones with subtle dynamic light streaks "
            "suggesting speed and deals. {{product_description}} Crisp "
            "e-commerce hero shot. Key visible features: {{key_features}}."
        ),
        "negative_prompt": "cluttered, dark gloomy, blurry product, text, watermark, logo",
        "style": "Clean tech-forward product photography, event campaign look",
        "lighting": "Bright even studio light with cool blue gradient accents",
        "color_palette": "Blue gradients, white, cyan accents (#146EB4, #00A8E1, #FFFFFF)",
        "aspect_ratio": "1:1",
    },
    "ramadan": {
        "scene_id": "festival_ramadan",
        "scene_name": "text/english_text — Ramadan & Eid",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / text",
        "months": [2, 3, 4], "regions": ["me"],
        "prompt": (
            "Elegant Ramadan celebration scene featuring {{product_name}}. "
            "The {{product_category}} is displayed among glowing geometric "
            "lanterns (fanous), crescent moon motifs, dates on brass trays and "
            "rich fabric drapery. {{product_description}} Warm festive evening "
            "atmosphere with golden tones. Modest, family-oriented styling. "
            "Key visible features: {{key_features}}."
        ),
        "negative_prompt": "alcohol, pork, immodest imagery, cluttered, blurry product, text",
        "style": "Rich warm festive photography, Middle Eastern elegance, gift presentation",
        "lighting": "Warm lantern glow, golden hour tones, soft candlelight",
        "color_palette": "Deep gold, emerald green, royal blue, warm sand (#D4AF37, #0F5132)",
        "aspect_ratio": "4:3",
    },
    "chinese_new_year": {
        "scene_id": "festival_cny",
        "scene_name": "text — Chinese New Year",
        "emotion": "text、text、text",
        "ecommerce_use": "english_text / english_text / text",
        "months": [1, 2], "regions": ["sea"],
        "prompt": (
            "Festive Chinese New Year scene featuring {{product_name}}. "
            "The {{product_category}} is presented as a premium new year gift "
            "with red silk fabric, gold ingot decorations, red lanterns bokeh "
            "and plum blossom branches. {{product_description}} Rich celebratory "
            "atmosphere. Key visible features: {{key_features}}."
        ),
        "negative_prompt": "white flowers, funeral tones, cluttered, blurry product, text",
        "style": "Festive premium gift photography, Chinese New Year campaign",
        "lighting": "Warm red-gold festive glow, soft lantern bokeh",
        "color_palette": "Chinese red, imperial gold, warm cream (#C8102E, #FFB300)",
        "aspect_ratio": "1:1",
    },
    "valentines": {
        "scene_id": "festival_valentines",
        "scene_name": "english_text — Valentine's Day",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / english_text",
        "months": [1, 2], "regions": ["na", "eu", "jp", "kr", "sea"],
        "prompt": (
            "Romantic Valentine's Day scene featuring {{product_name}}. "
            "The {{product_category}} is styled as a heartfelt gift with soft "
            "rose petals, silk ribbon and delicate heart-shaped bokeh lights. "
            "{{product_description}} Dreamy romantic atmosphere. "
            "Key visible features: {{key_features}}."
        ),
        "negative_prompt": "tacky, oversaturated pink, cluttered, blurry product, text",
        "style": "Soft romantic gift photography, elegant and dreamy",
        "lighting": "Soft diffused pink-warm light, gentle bokeh",
        "color_palette": "Blush pink, deep rose, cream, gold accents (#F4C2C2, #C21E56)",
        "aspect_ratio": "1:1",
    },
    "summer_sale": {
        "scene_id": "festival_summer_sale",
        "scene_name": "english_text — Summer Sale",
        "emotion": "text、text、english_text",
        "ecommerce_use": "english_text / english_text",
        "months": [6, 7, 8], "regions": ["na", "eu", "jp", "kr", "sea", "me"],
        "prompt": (
            "Fresh summer sale scene featuring {{product_name}}. "
            "The {{product_category}} is displayed in a bright sunny setting "
            "with tropical leaves, clear blue sky tones and playful hard shadows. "
            "{{product_description}} Energetic vacation vibe. "
            "Key visible features: {{key_features}}."
        ),
        "negative_prompt": "gloomy, wintry, cluttered, blurry product, text, watermark",
        "style": "Bright summer campaign photography, playful hard-light editorial",
        "lighting": "Bright direct sunlight, crisp hard shadows, high key",
        "color_palette": "Sky blue, sunny yellow, coral, white (#38B6FF, #FFD447, #FF7A59)",
        "aspect_ratio": "1:1",
    },
    "back_to_school": {
        "scene_id": "festival_back_to_school",
        "scene_name": "english_text — Back to School",
        "emotion": "text、english_text、text",
        "ecommerce_use": "english_text / textscene",
        "months": [8, 9], "regions": ["na", "eu", "jp", "kr"],
        "prompt": (
            "Cheerful back-to-school scene featuring {{product_name}}. "
            "The {{product_category}} is arranged on a tidy study desk with "
            "notebooks, stationery and a backpack, bright morning light through "
            "a window. {{product_description}} Fresh optimistic start-of-term "
            "mood. Key visible features: {{key_features}}."
        ),
        "negative_prompt": "messy desk, dark, cluttered, blurry product, text, watermark",
        "style": "Bright lifestyle flat-lay or desk scene, organized and inviting",
        "lighting": "Fresh morning window light, bright and clean",
        "color_palette": "Notebook white, chalkboard green, cheerful primary accents",
        "aspect_ratio": "4:3",
    },
}

# english_text → english_text
_MARKET_TO_REGION = {}
for _region, _pack in REGION_PACKS.items():
    for _m in _pack["markets"]:
        _MARKET_TO_REGION[_m] = _region


def resolve_region(market_or_region: str) -> str:
    """english_text（us/jp/de...）english_text key"""
    code = (market_or_region or "").strip().lower()
    if code in REGION_PACKS:
        return code
    return _MARKET_TO_REGION.get(code, "")


# ============================================================
# scenetext
# ============================================================

def apply_region_style(scene: dict, region: str) -> dict:
    """
    english_textscene（prompt text + english_text/english_text）。
    english_text，english_text。
    """
    pack = REGION_PACKS.get(resolve_region(region))
    if not pack:
        return scene

    result = copy.deepcopy(scene)
    prompt = result.get("prompt") or result.get("visual_prompt") or ""
    if prompt and pack["style_suffix"] not in prompt:
        prompt = prompt.rstrip() + pack["style_suffix"] + (
            f" Regional color palette: {pack['color_palette']}. "
            f"Environment props: {pack['props']}."
        )
        if "visual_prompt" in result:
            result["visual_prompt"] = prompt
        else:
            result["prompt"] = prompt

    negative = result.get("negative_prompt", "")
    if pack.get("avoid") and pack["avoid"] not in negative:
        result["negative_prompt"] = (negative + ", " + pack["avoid"]).strip(", ")

    result["region"] = resolve_region(region)
    result["region_name"] = pack["name"]
    return result


def localize_scene_plan(scenes: list, region: str, festival: str = "") -> list:
    """
    english_textsceneenglish_text；english_textsceneenglish_text。
    """
    localized = [apply_region_style(s, region) for s in (scenes or [])]

    fest = FESTIVAL_SCENES.get((festival or "").strip().lower())
    if fest:
        fest_scene = apply_region_style(dict(fest), region) if region else dict(fest)
        # english_textyestextscenetext
        if not any(s.get("scene_id") == fest_scene["scene_id"] for s in localized):
            localized.insert(0, fest_scene)
    return localized


# ============================================================
# english_text
# ============================================================

def upcoming_festivals(market_or_region: str, days: int = 60,
                       today: datetime.date = None) -> list:
    """
    english_text days text（english_text）english_text。
    english_text [{festival, name, months, in_month}, ...]
    """
    region = resolve_region(market_or_region)
    today = today or datetime.date.today()
    horizon_months = set()
    cursor = today
    end = today + datetime.timedelta(days=days)
    while cursor <= end:
        horizon_months.add(cursor.month)
        # english_text 1 text
        cursor = (cursor.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)

    hits = []
    for key, fest in FESTIVAL_SCENES.items():
        if region and region not in fest["regions"]:
            continue
        matched = sorted(set(fest["months"]) & horizon_months)
        if matched:
            hits.append({
                "festival": key,
                "name": fest["scene_name"],
                "months": fest["months"],
                "in_month": matched[0],
                "emotion": fest["emotion"],
            })
    hits.sort(key=lambda h: (h["in_month"] - today.month) % 12)
    return hits


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="english_text/textscenetext")
    parser.add_argument("--scene-plan", help="scenetext JSON（scene_matcher output）")
    parser.add_argument("--region", default="", help=f"text/text: {' '.join(REGION_PACKS)} english_text")
    parser.add_argument("--festival", default="", help=f"text: {' '.join(FESTIVAL_SCENES)}")
    parser.add_argument("--output", default="", help="english_textscenetextoutputtext")
    parser.add_argument("--calendar", help="english_text，text --calendar us")
    parser.add_argument("--days", type=int, default=60, help="english_text")
    parser.add_argument("--list-festivals", action="store_true")
    args = parser.parse_args()

    if args.list_festivals:
        for key, fest in FESTIVAL_SCENES.items():
            logger.info(f"  {key:18s} {fest['scene_name']}  text {fest['months']}  text {fest['regions']}")
        return

    if args.calendar:
        hits = upcoming_festivals(args.calendar, args.days)
        if not hits:
            logger.info(f"text {args.days} text {args.calendar} noneenglish_text")
        for h in hits:
            logger.info(f"  {h['in_month']}text  {h['name']}（{h['festival']}）— {h['emotion']}")
        return

    if not args.scene_plan:
        parser.error("text --scene-plan（text --calendar / --list-festivals）")

    with open(args.scene_plan, encoding="utf-8") as f:
        plan = json.load(f)
    scenes = plan.get("scenes", plan if isinstance(plan, list) else [])

    localized = localize_scene_plan(scenes, args.region, args.festival)
    if isinstance(plan, dict):
        plan["scenes"] = localized
        plan["region"] = resolve_region(args.region)
        out_obj = plan
    else:
        out_obj = localized

    output = args.output or args.scene_plan
    with open(output, "w", encoding="utf-8") as f:
        json.dump(out_obj, f, ensure_ascii=False, indent=2)
    logger.info(f"✅ english_text {len(localized)} textscene → {output}")


if __name__ == "__main__":
    main()
