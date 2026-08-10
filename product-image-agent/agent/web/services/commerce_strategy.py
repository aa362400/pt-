"""cross-border e-commercetext Agent — english_textlistingenglish_text。

textuserenglish_text，english_text 1-9 textlistingtext：
english_textyesenglish_text、english_text（platformtext × text × english_text）。
english_text，textalltext；english_text。
"""

from __future__ import annotations

import re
from typing import Optional

CN_NUM = {"text": 1, "text": 2, "text": 2, "text": 3, "text": 4, "text": 5,
          "text": 6, "text": 7, "text": 8, "text": 9, "text": 10}

PLATFORM_RULES = [
    ("etsy", re.compile(r"etsy", re.I)),
    ("temu", re.compile(r"temu", re.I)),
    ("amazon", re.compile(r"amazon|english_text", re.I)),
    ("tiktok", re.compile(r"tiktok|english_text", re.I)),
    ("ebay", re.compile(r"ebay", re.I)),
    ("shopify", re.compile(r"shopify|english_text", re.I)),
]

IMAGE_TYPE_RULES = [
    ("main", re.compile(r"text|english_text?|main image", re.I)),
    ("scene", re.compile(r"scenetext|english_text|lifestyle", re.I)),
    ("gift", re.compile(r"english_text|english_text|english_text|gift image", re.I)),
    ("detail", re.compile(r"english_text|english_text|detail", re.I)),
    ("size", re.compile(r"english_text|english_text|size", re.I)),
    ("selling", re.compile(r"english_text|english_text|english_text", re.I)),
    ("packaging", re.compile(r"packagingtext|english_text|text", re.I)),
    ("custom", re.compile(r"english_text|english_text|english_text", re.I)),
]

AUDIENCE_RULES = [
    ("mom", "text / english_text", re.compile(r"text|text|mom|mother", re.I)),
    ("wife", "text / text", re.compile(r"text|text|wife", re.I)),
    ("girlfriend", "text / text", re.compile(r"text|english_text|text|couple|girlfriend", re.I)),
    ("petOwner", "english_text", re.compile(r"text|text|text|pet|paw", re.I)),
    ("graduate", "english_text", re.compile(r"text|graduat", re.I)),
    ("newlywed", "english_text", re.compile(r"text|text|text|wedding", re.I)),
    ("family", "textcustomer", re.compile(r"text|text|text|family", re.I)),
    ("teacher", "text", re.compile(r"text|text|teacher", re.I)),
    ("kids", "text", re.compile(r"text|text|text|kids?|baby", re.I)),
    ("western", "textcustomer", re.compile(r"text|text|textcustomer|europe|american", re.I)),
]

OCCASION_RULES = [
    ("christmas", "english_text", re.compile(r"text|christmas|xmas", re.I)),
    ("mothersday", "english_text", re.compile(r"english_text|mother'?s day", re.I)),
    ("fathersday", "english_text", re.compile(r"english_text|father'?s day", re.I)),
    ("wedding", "english_text", re.compile(r"text|text|wedding", re.I)),
    ("graduation", "english_text", re.compile(r"text|graduation", re.I)),
    ("anniversary", "english_text", re.compile(r"english_text|text|anniversary", re.I)),
    ("petMemorial", "english_text", re.compile(r"english_text|pet memorial|english_text", re.I)),
    ("birthday", "english_text", re.compile(r"text|birthday", re.I)),
    ("valentines", "english_text", re.compile(r"english_text|valentine", re.I)),
    ("gift", "textscene", re.compile(r"text|text|text|text|gift", re.I)),
]

PRODUCT_TYPE_RULES = [
    ("acrylic", "english_text/text", re.compile(r"english_text|acrylic", re.I)),
    ("woodPen", "english_text/text", re.compile(r"text|english_text|text|pen\b", re.I)),
    ("petTag", "english_text/text", re.compile(r"english_text|english_text|pet tag|memorial", re.I)),
    ("birthFlower", "english_text", re.compile(r"english_text|birth flower", re.I)),
    ("ornament", "english_text/text", re.compile(r"text|text|text|ornament", re.I)),
    ("jewelry", "text/text", re.compile(r"text|text|text|text|jewelry|necklace", re.I)),
    ("mug", "text/english_text", re.compile(r"text|english_text|mug", re.I)),
    ("frame", "text/english_text", re.compile(r"text|english_text|photo frame", re.I)),
    ("petGift", "english_text", re.compile(r"text.*(text|text)|pet.*(gift|memorial)", re.I)),
]

RISK_TIPS = [
    "english_text Logo",
    "english_text",
    "english_textrealenglish_text",
    "english_text，textalltext",
]

PLATFORM_STYLES = {
    "etsy": {
        "label": "Etsy",
        "style": ("handmade artisan feel, warm natural window light, gift-giving "
                  "atmosphere, cozy home setting, wooden table, linen fabric, "
                  "dried flowers, kraft gift box, soft warm tones"),
        "tone": "english_text · text · english_text",
    },
    "temu": {
        "label": "Temu",
        "style": ("high-impact e-commerce product photography, clean bold composition, "
                  "product hero at center, strong clarity, punchy but not gaudy, "
                  "conversion-focused"),
        "tone": "english_text · english_text",
    },
    "amazon": {
        "label": "Amazon",
        "style": ("professional catalog photography, pure white seamless background, "
                  "crisp studio lighting, trustworthy premium presentation"),
        "tone": "english_text · english_text",
    },
    "tiktok": {
        "label": "TikTok Shop",
        "style": ("authentic lifestyle snapshot look, candid real-home setting, natural "
                  "phone-camera realism, emotionally engaging, scroll-stopping"),
        "tone": "realenglish_text · english_text",
    },
    "ebay": {
        "label": "eBay",
        "style": "clear practical product photography, neutral background, honest accurate presentation",
        "tone": "english_text",
    },
    "shopify": {
        "label": "english_text",
        "style": "branded editorial product photography, elegant minimal art direction, premium lifestyle mood",
        "tone": "english_text · text",
    },
}

AUDIENCE_PROMPTS = {
    "mom": "a heartfelt gift for Mom, mature feminine home setting, warm family emotion",
    "wife": "a romantic keepsake gift for a beloved wife, elegant intimate setting",
    "girlfriend": "a sweet romantic gift between a young couple, dreamy soft styling",
    "petOwner": "a loving pet owner cherishing their companion, gentle emotional storytelling",
    "graduate": "a proud graduation milestone gift, hopeful bright new-chapter mood",
    "newlywed": "a wedding keepsake for newlyweds, romantic celebration styling with florals",
    "family": "a warm multigenerational family moment at home",
    "teacher": "an appreciation gift for a beloved teacher, thoughtful desk setting",
    "kids": "a joyful gift for a child, playful bright and safe-feeling styling",
    "western": "styled for Western female shoppers, aspirational cozy lifestyle",
}

OCCASION_PROMPTS = {
    "christmas": ("Christmas holiday setting with soft fairy-light bokeh, pine branches "
                  "and wrapped presents (no Santa, no copyrighted characters)"),
    "mothersday": "Mother's Day morning scene with fresh flowers and soft pastel warmth",
    "fathersday": "Father's Day study or workshop scene, warm masculine tones",
    "wedding": "wedding reception table styling, white florals, candlelight elegance",
    "graduation": "graduation celebration desk scene, diploma ribbon and warm daylight",
    "anniversary": "anniversary celebration with candles, roses and champagne-toned warmth",
    "petMemorial": ('gentle pet memorial mood, soft light through a window, a quiet loving '
                    'remembrance ("always by your side" emotion)'),
    "birthday": "birthday gift moment with tasteful celebration styling",
    "valentines": "Valentine's Day romantic styling, blush tones and delicate hearts made of ribbon",
    "gift": "gift-giving moment, hands presenting a beautifully wrapped box, emotional anticipation",
}

NEGATIVE_PROMPT = ", ".join([
    "brand logos", "trademarks", "copyrighted characters", "celebrity faces",
    "watermark", "gibberish text", "distorted product", "wrong product proportions",
    "product color change", "cluttered background overpowering the product",
    "cheap-looking materials", "low quality", "blurry",
])


def _slot(slot_id, name, name_en, purpose, aspect, build):
    return {"id": slot_id, "name": name, "name_en": name_en,
            "purpose": purpose, "aspect": aspect, "build": build}


LISTING_SLOTS = [
    _slot(
        "hero", "english_text", "Click-winning Hero Shot",
        "english_text：english_text、english_text，english_text", "1:1",
        lambda ctx: (
            "Hero product shot of {{product_name}}. The product fills most of the frame "
            "as the absolute hero, perfectly sharp and true to the reference images. "
            + ("Clean pure white seamless studio background. "
               if ctx["platform"] == "amazon"
               else "Clean softly styled minimal background that makes the product pop. ")
            + "Premium first-impression e-commerce main image."
        ),
    ),
    _slot(
        "emotion", "english_textscenetext", "Emotional Lifestyle Scene",
        "english_text、text、english_text，textcustomerenglish_text", "1:1",
        lambda ctx: (
            "Emotional lifestyle scene featuring {{product_name}} in "
            f"{ctx['occasion_text'] or 'a heartfelt gift-giving moment'}. "
            f"{ctx['audience_text'] or 'Styled for Western shoppers'}. "
            "The product stays perfectly consistent with the reference images while "
            "the scene tells a story of love and meaning."
        ),
    ),
    _slot(
        "audience", "english_text", "Target Audience Scene",
        "english_text「textyestext TA text」", "1:1",
        lambda ctx: (
            "Gift-recipient scene: {{product_name}} being received or displayed by "
            f"{ctx['audience_text'] or 'a delighted Western customer'}. "
            "Genuine joyful emotion, aspirational but relatable home environment. "
            "Product exactly matches the reference images. No recognizable celebrity faces."
        ),
    ),
    _slot(
        "custom", "english_text", "Customization Showcase",
        "english_text、text、text、english_text", "1:1",
        lambda ctx: (
            "Close-up showcase of the customizable area of {{product_name}} — engraved "
            'name, special date or personalized artwork shown as elegant generic '
            'placeholder text (e.g. "Emma · 2024"). Crisp macro detail, soft studio '
            "light. The product form stays identical to the reference images."
        ),
    ),
    _slot(
        "detail", "english_text", "Material & Craft Detail",
        "text、text、text、text、text、english_text", "1:1",
        lambda ctx: (
            "Extreme close-up macro of {{product_name}} showing material texture, edges, "
            "finish and craftsmanship quality. Shallow depth of field, luxurious tactile "
            "feel, honest true-to-life material rendering identical to the reference images."
        ),
    ),
    _slot(
        "size", "english_text", "Size Reference",
        "english_texte-commerceenglish_text", "1:1",
        lambda ctx: (
            "Clean size-reference shot of {{product_name}} next to a familiar object "
            "(a coffee cup or a hand holding it naturally) on a bright minimal background, "
            "clearly communicating real-world scale. Simple, elegant, easy to read. "
            "Product matches reference images exactly."
        ),
    ),
    _slot(
        "usage", "textscenetext", "In-home Usage Scene",
        "text、text、english_text——english_text", "1:1",
        lambda ctx: (
            "In-context usage scene: {{product_name}} naturally placed "
            + ("near a decorated Christmas tree"
               if ctx["occasion"] == "christmas"
               else "on a styled shelf or desk in a beautiful Western home")
            + ". Cozy believable environment, product clearly visible and consistent "
              "with reference images."
        ),
    ),
    _slot(
        "packaging", "textpackagingtext", "Gift Packaging",
        "english_text：text、text、text，english_text", "1:1",
        lambda ctx: (
            "Gift presentation of {{product_name}} beside an elegant kraft gift box with "
            "satin ribbon and a small blank greeting card. Tasteful, not cluttered. Warm "
            "inviting light. The product itself remains exactly as in the reference images."
        ),
    ),
    _slot(
        "reasons", "english_text", "Why-buy Summary",
        "english_text + text，english_text", "1:1",
        lambda ctx: (
            "Clean summary composition of {{product_name}} with generous negative space "
            "suitable for a few short English selling-point phrases (rendered later; keep "
            "space clean, no gibberish text in image). Confident premium closing shot, "
            "product true to reference images."
        ),
    ),
]

COUNT_PRESETS = {
    1: ["hero"],
    2: ["hero", "emotion"],
    3: ["hero", "emotion", "custom"],
    4: ["hero", "emotion", "custom", "detail"],
    5: ["hero", "emotion", "audience", "custom", "detail"],
    6: ["hero", "emotion", "audience", "custom", "detail", "size"],
    7: ["hero", "emotion", "audience", "custom", "detail", "size", "usage"],
    8: ["hero", "emotion", "audience", "custom", "detail", "size", "usage", "packaging"],
    9: ["hero", "emotion", "audience", "custom", "detail", "size", "usage", "packaging", "reasons"],
}

TYPE_TO_SLOT = {
    "main": "hero", "scene": "emotion", "gift": "packaging", "detail": "detail",
    "size": "size", "selling": "reasons", "packaging": "packaging", "custom": "custom",
}

IMAGE_TYPE_LABELS = {
    "main": "text", "scene": "scenetext", "gift": "english_text", "detail": "english_text",
    "size": "english_text", "selling": "english_text", "packaging": "packagingtext", "custom": "english_text",
}


def _to_number(s: str) -> int:
    if s.isdigit():
        return int(s)
    n = 0
    for ch in s:
        n = n * (10 if ch == "text" else 1) + CN_NUM.get(ch, 0)
    return n or 1


def parse_image_count(text: str) -> tuple[int, str]:
    """textimagetext。text (count, source)，source: explicit|fuzzy|default"""
    t = text or ""
    if re.search(r"english_text|text|text|1\s*[-~text]\s*9", t):
        return 9, "explicit"
    if re.search(r"text", t) and re.search(r"9", t):
        return 9, "explicit"

    parts = re.findall(r"[^\denglish_text]{0,6}?([0-9english_text]+)\s*text", t)
    if len(parts) > 1:
        total = sum(_to_number(p) for p in parts)
        if 1 <= total <= 9:
            return total, "explicit"
    single = re.search(r"([0-9english_text]+)\s*(?:text|text|text|images?|pics?)", t, re.I)
    if single:
        n = _to_number(single.group(1))
        if n >= 1:
            return min(n, 9), "explicit"
    if re.search(r"english_text|english_text|text", t) and not re.search(r"text.*[?？]", t):
        return 4, "fuzzy"
    if re.search(r"listingtext|listing", t, re.I):
        return 5, "default"
    if re.search(r"text", t):
        return 9, "default"
    if re.search(r"text|english_text", t) and not re.search(r"scene|text|text", t):
        return 1, "default"
    return 3, "default"


def _match_ids(rules, text):
    return [r[0] for r in rules if r[-1].search(text or "")]


def _match_labeled(rules, text):
    return [{"id": rid, "label": label} for rid, label, rx in rules if rx.search(text or "")]


def parse_request(message: str, product_hint: str = "") -> dict:
    """textuserenglish_text → english_text（/api/commerce-agent/parse english_text）。"""
    t = message or ""
    count, source = parse_image_count(t)
    platforms = _match_ids(PLATFORM_RULES, t)
    image_types = _match_ids(IMAGE_TYPE_RULES, t)
    audiences = _match_labeled(AUDIENCE_RULES, t)
    occasions = _match_labeled(OCCASION_RULES, t)
    product_types = _match_labeled(PRODUCT_TYPE_RULES, t)

    is_gift = bool(occasions) or bool(re.search(r"text|text|text|gift", t, re.I))
    is_listing_set = bool(re.search(r"listingtext|listing|text|listing", t, re.I)) or count >= 5

    slot_ids = _pick_slot_ids(count, image_types)
    image_type_labels = [
        IMAGE_TYPE_LABELS.get(next((k for k, v in TYPE_TO_SLOT.items() if v == sid), ""),
                              _slot_by_id(sid)["name"])
        for sid in slot_ids
    ]

    audience = audiences[0]["label"] if audiences else "texte-commercecustomer"
    occasion = occasions[0]["label"] if occasions else ("textscene" if is_gift else "")
    product_type = (product_types[0]["label"] if product_types
                    else (product_hint or "english_textautomatictext"))

    return {
        "platform": PLATFORM_STYLES.get(platforms[0], PLATFORM_STYLES["etsy"])["label"]
        if platforms else "Etsy + Temu text",
        "platforms": platforms or ["etsy", "temu"],
        "platformExplicit": bool(platforms),
        "imageCount": count,
        "countSource": source,
        "productType": product_type,
        "audience": audience,
        "audienceId": audiences[0]["id"] if audiences else "",
        "giftScene": occasion,
        "occasionId": occasions[0]["id"] if occasions else ("gift" if is_gift else ""),
        "imageTypes": image_type_labels,
        "imageTypeIds": image_types,
        "isListingSet": is_listing_set,
        "isGift": is_gift,
        "riskTips": list(RISK_TIPS),
    }


def _slot_by_id(slot_id):
    return next(s for s in LISTING_SLOTS if s["id"] == slot_id)


def _pick_slot_ids(count: int, named_types: list) -> list:
    n = max(1, min(9, count))
    ids = list(COUNT_PRESETS.get(n, COUNT_PRESETS[3]))
    named = [TYPE_TO_SLOT[t] for t in (named_types or []) if t in TYPE_TO_SLOT]
    if named:
        rest = [i for i in ids if i not in named]
        ids = list(dict.fromkeys(named + rest))[:n]
        all_ids = [s["id"] for s in LISTING_SLOTS]
        for filler in all_ids:
            if len(ids) >= n:
                break
            if filler not in ids:
                ids.append(filler)
    return ids


def build_plan(parsed: dict) -> dict:
    """english_textgenerationlistingenglish_text（/api/commerce-agent/plan english_text）。"""
    platform_key = (parsed.get("platforms") or ["etsy"])[0]
    platform = PLATFORM_STYLES.get(platform_key, PLATFORM_STYLES["etsy"])
    audience_text = AUDIENCE_PROMPTS.get(parsed.get("audienceId", ""), "")
    occasion_id = parsed.get("occasionId", "")
    occasion_text = OCCASION_PROMPTS.get(occasion_id, "")
    if not occasion_text and parsed.get("isGift"):
        occasion_text = OCCASION_PROMPTS["gift"]

    ctx = {"platform": platform_key, "audience_text": audience_text,
           "occasion_text": occasion_text, "occasion": occasion_id}
    slot_ids = _pick_slot_ids(parsed.get("imageCount", 3), parsed.get("imageTypeIds") or [])
    slots = [_slot_by_id(i) for i in slot_ids]

    images = []
    for i, slot in enumerate(slots):
        core = slot["build"](ctx)
        prompt_parts = [
            core,
            f"Occasion mood: {occasion_text}." if occasion_text and slot["id"] != "hero" else "",
            f"Platform style — {platform['label']}: {platform['style']}.",
            (f"Target customer: {audience_text}." if audience_text
             else "Target customer: Western e-commerce shoppers."),
            "Original creative composition (inspired by best-seller structure, "
            "never copying any existing listing).",
        ]
        images.append({
            "id": f"img_{i + 1}",
            "scene_id": f"listing_{i + 1:02d}_{slot['id']}",
            "title": slot["name"],
            "titleEn": slot["name_en"],
            "purpose": slot["purpose"],
            "slot": slot["id"],
            "ratio": slot["aspect"],
            "prompt": " ".join(p for p in prompt_parts if p),
            "negativePrompt": NEGATIVE_PROMPT,
            "style": platform["style"],
            "lighting": ("bright even studio lighting" if platform_key == "amazon"
                         else "soft warm natural light"),
        })

    creative_bits = []
    if occasion_id == "petMemorial":
        creative_bits.append("text「english_text」english_text")
    elif parsed.get("isGift"):
        creative_bits.append("english_text")
    else:
        creative_bits.append("english_text")
    creative_bits.append(f"text {platform['label']} customertext（{platform['tone']}）english_text")
    if parsed.get("audience") and parsed.get("audienceId"):
        creative_bits.append(f"english_text「{parsed['audience']}」text")

    return {
        "strategy": {
            "platform": platform["label"],
            "platformTone": platform["tone"],
            "platforms": parsed.get("platforms", []),
            "productType": parsed.get("productType", ""),
            "targetCustomer": parsed.get("audience", "texte-commercecustomer"),
            "giftScene": parsed.get("giftScene", ""),
            "imageCount": len(images),
            "structure": " + ".join(s["name"] for s in slots),
            "creativeDirection": "；".join(creative_bits),
            "riskReminder": "english_text Logo、english_text、realenglish_text；english_text，textalltext",
        },
        "images": images,
    }


# ── english_text ──

INSTRUCTION_MODS = [
    (re.compile(r"text|text|warmer", re.I),
     "Make the mood noticeably warmer and cozier: golden-hour light, soft warm tones."),
    (re.compile(r"text|english_text|english_text", re.I),
     "Make the product significantly larger in frame, dominating the composition."),
    (re.compile(r"background.*(text|text)|english_text|text", re.I),
     "Simplify the background dramatically: minimal, clean, quiet backdrop, "
     "nothing competing with the product."),
    (re.compile(r"english_text|english_text|nonetext", re.I),
     "Absolutely no text, letters or numbers anywhere in the image."),
    (re.compile(r"text", re.I),
     f"Restyle as a Christmas gift scene: {OCCASION_PROMPTS['christmas']}."),
    (re.compile(r"english_text|text", re.I),
     f"Restyle as a gift for Mom: {AUDIENCE_PROMPTS['mom']}."),
    (re.compile(r"text", re.I),
     "Switch to a pure white seamless studio background, Amazon main-image style."),
]


def apply_instruction(scene: dict, instruction: str) -> dict:
    """textEnglishenglish_text，english_text。"""
    updated = dict(scene)
    additions = [phrase for rx, phrase in INSTRUCTION_MODS if rx.search(instruction or "")]
    if additions:
        updated["prompt"] = f"{updated.get('prompt', '')} {' '.join(additions)}".strip()
    return updated
