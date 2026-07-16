"""跨境电商出图 Agent — 服务端意图解析与上架套图策略引擎。

把用户的一句自然语言拆解成结构化出图意图，并规划 1-9 张上架套图：
每张图有明确用途、比例与专业英文提示词（平台风格 × 人群 × 礼物情绪）。
只学习爆款结构与点击逻辑，画面全部原创；提示词内置反侵权约束。
"""

from __future__ import annotations

import re
from typing import Optional

CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

PLATFORM_RULES = [
    ("etsy", re.compile(r"etsy", re.I)),
    ("temu", re.compile(r"temu", re.I)),
    ("amazon", re.compile(r"amazon|亚马逊", re.I)),
    ("tiktok", re.compile(r"tiktok|抖音国际", re.I)),
    ("ebay", re.compile(r"ebay", re.I)),
    ("shopify", re.compile(r"shopify|独立站", re.I)),
]

IMAGE_TYPE_RULES = [
    ("main", re.compile(r"主图|白底图?|main image", re.I)),
    ("scene", re.compile(r"场景图|氛围图|lifestyle", re.I)),
    ("gift", re.compile(r"礼物图|送礼图|礼品图|gift image", re.I)),
    ("detail", re.compile(r"细节图|质感图|detail", re.I)),
    ("size", re.compile(r"尺寸图|大小图|size", re.I)),
    ("selling", re.compile(r"卖点图|详情图|功能图", re.I)),
    ("packaging", re.compile(r"包装图|礼盒图|开箱", re.I)),
    ("custom", re.compile(r"定制图|定制展示|个性化", re.I)),
]

AUDIENCE_RULES = [
    ("mom", "妈妈 / 母亲节人群", re.compile(r"妈妈|母亲|mom|mother", re.I)),
    ("wife", "妻子 / 爱人", re.compile(r"妻子|老婆|wife", re.I)),
    ("girlfriend", "女友 / 情侣", re.compile(r"女友|女朋友|情侣|couple|girlfriend", re.I)),
    ("petOwner", "宠物主人", re.compile(r"宠物|猫|狗|pet|paw", re.I)),
    ("graduate", "毕业生", re.compile(r"毕业|graduat", re.I)),
    ("newlywed", "新婚夫妻", re.compile(r"婚礼|新婚|结婚|wedding", re.I)),
    ("family", "家庭客户", re.compile(r"家庭|全家|家人|family", re.I)),
    ("teacher", "老师", re.compile(r"老师|教师|teacher", re.I)),
    ("kids", "孩子", re.compile(r"孩子|儿童|宝宝|kids?|baby", re.I)),
    ("western", "欧美客户", re.compile(r"欧美|西方|美国客户|europe|american", re.I)),
]

OCCASION_RULES = [
    ("christmas", "圣诞礼物", re.compile(r"圣诞|christmas|xmas", re.I)),
    ("mothersday", "母亲节", re.compile(r"母亲节|mother'?s day", re.I)),
    ("fathersday", "父亲节", re.compile(r"父亲节|father'?s day", re.I)),
    ("wedding", "婚礼纪念", re.compile(r"婚礼|结婚|wedding", re.I)),
    ("graduation", "毕业纪念", re.compile(r"毕业|graduation", re.I)),
    ("anniversary", "纪念日", re.compile(r"纪念日|周年|anniversary", re.I)),
    ("petMemorial", "宠物纪念", re.compile(r"宠物纪念|pet memorial|纪念牌", re.I)),
    ("birthday", "生日礼物", re.compile(r"生日|birthday", re.I)),
    ("valentines", "情人节", re.compile(r"情人节|valentine", re.I)),
    ("gift", "送礼场景", re.compile(r"送礼|礼物|送给|礼品|gift", re.I)),
]

PRODUCT_TYPE_RULES = [
    ("acrylic", "亚克力挂件/摆件", re.compile(r"亚克力|acrylic", re.I)),
    ("woodPen", "木质钢笔/文具", re.compile(r"钢笔|签字笔|文具|pen\b", re.I)),
    ("petTag", "宠物纪念牌/挂牌", re.compile(r"宠物牌|纪念牌|pet tag|memorial", re.I)),
    ("birthFlower", "出生花定制礼物", re.compile(r"出生花|birth flower", re.I)),
    ("ornament", "定制挂饰/摆件", re.compile(r"挂件|挂饰|摆件|ornament", re.I)),
    ("jewelry", "首饰/饰品", re.compile(r"项链|手链|戒指|首饰|jewelry|necklace", re.I)),
    ("mug", "杯子/马克杯", re.compile(r"杯子|马克杯|mug", re.I)),
    ("frame", "相框/照片定制", re.compile(r"相框|照片定制|photo frame", re.I)),
    ("petGift", "宠物纪念礼物", re.compile(r"宠物.*(礼物|纪念)|pet.*(gift|memorial)", re.I)),
]

RISK_TIPS = [
    "不要使用品牌 Logo",
    "不要使用版权角色",
    "不要出现真实商标与明星脸",
    "参考爆款只学结构，画面全部原创",
]

PLATFORM_STYLES = {
    "etsy": {
        "label": "Etsy",
        "style": ("handmade artisan feel, warm natural window light, gift-giving "
                  "atmosphere, cozy home setting, wooden table, linen fabric, "
                  "dried flowers, kraft gift box, soft warm tones"),
        "tone": "手工感 · 温暖 · 送礼氛围",
    },
    "temu": {
        "label": "Temu",
        "style": ("high-impact e-commerce product photography, clean bold composition, "
                  "product hero at center, strong clarity, punchy but not gaudy, "
                  "conversion-focused"),
        "tone": "卖点清晰 · 点击力强",
    },
    "amazon": {
        "label": "Amazon",
        "style": ("professional catalog photography, pure white seamless background, "
                  "crisp studio lighting, trustworthy premium presentation"),
        "tone": "干净专业 · 可信赖",
    },
    "tiktok": {
        "label": "TikTok Shop",
        "style": ("authentic lifestyle snapshot look, candid real-home setting, natural "
                  "phone-camera realism, emotionally engaging, scroll-stopping"),
        "tone": "真实生活感 · 情绪冲动",
    },
    "ebay": {
        "label": "eBay",
        "style": "clear practical product photography, neutral background, honest accurate presentation",
        "tone": "清晰实用",
    },
    "shopify": {
        "label": "独立站",
        "style": "branded editorial product photography, elegant minimal art direction, premium lifestyle mood",
        "tone": "品牌感 · 高级",
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
        "hero", "点击型主图", "Click-winning Hero Shot",
        "第一张主图：干净高级、产品最大化，第一眼知道卖什么", "1:1",
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
        "emotion", "情绪价值场景图", "Emotional Lifestyle Scene",
        "强调送礼、纪念、爱与仪式感，让客户产生情绪共鸣", "1:1",
        lambda ctx: (
            "Emotional lifestyle scene featuring {{product_name}} in "
            f"{ctx['occasion_text'] or 'a heartfelt gift-giving moment'}. "
            f"{ctx['audience_text'] or 'Styled for Western shoppers'}. "
            "The product stays perfectly consistent with the reference images while "
            "the scene tells a story of love and meaning."
        ),
    ),
    _slot(
        "audience", "目标人群图", "Target Audience Scene",
        "让目标买家一眼看到「这就是送 TA 的」", "1:1",
        lambda ctx: (
            "Gift-recipient scene: {{product_name}} being received or displayed by "
            f"{ctx['audience_text'] or 'a delighted Western customer'}. "
            "Genuine joyful emotion, aspirational but relatable home environment. "
            "Product exactly matches the reference images. No recognizable celebrity faces."
        ),
    ),
    _slot(
        "custom", "可定制元素图", "Customization Showcase",
        "展示姓名、日期、照片、出生花等可定制细节", "1:1",
        lambda ctx: (
            "Close-up showcase of the customizable area of {{product_name}} — engraved "
            'name, special date or personalized artwork shown as elegant generic '
            'placeholder text (e.g. "Emma · 2024"). Crisp macro detail, soft studio '
            "light. The product form stays identical to the reference images."
        ),
    ),
    _slot(
        "detail", "细节质感图", "Material & Craft Detail",
        "材质、边缘、纹理、印刷、雕刻、光泽的信任感特写", "1:1",
        lambda ctx: (
            "Extreme close-up macro of {{product_name}} showing material texture, edges, "
            "finish and craftsmanship quality. Shallow depth of field, luxurious tactile "
            "feel, honest true-to-life material rendering identical to the reference images."
        ),
    ),
    _slot(
        "size", "尺寸比例图", "Size Reference",
        "用欧美电商风格清晰展示产品大小", "1:1",
        lambda ctx: (
            "Clean size-reference shot of {{product_name}} next to a familiar object "
            "(a coffee cup or a hand holding it naturally) on a bright minimal background, "
            "clearly communicating real-world scale. Simple, elegant, easy to read. "
            "Product matches reference images exactly."
        ),
    ),
    _slot(
        "usage", "使用场景图", "In-home Usage Scene",
        "家里、书桌、圣诞树旁——买回去长什么样", "1:1",
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
        "packaging", "礼物包装图", "Gift Packaging",
        "适合送礼：丝带、卡片、礼盒，但不过度复杂", "1:1",
        lambda ctx: (
            "Gift presentation of {{product_name}} beside an elegant kraft gift box with "
            "satin ribbon and a small blank greeting card. Tasteful, not cluttered. Warm "
            "inviting light. The product itself remains exactly as in the reference images."
        ),
    ),
    _slot(
        "reasons", "购买理由总结图", "Why-buy Summary",
        "少量英文卖点短句 + 产品，收尾促单", "1:1",
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
    "main": "主图", "scene": "场景图", "gift": "送礼图", "detail": "细节图",
    "size": "尺寸图", "selling": "卖点图", "packaging": "包装图", "custom": "定制展示图",
}


def _to_number(s: str) -> int:
    if s.isdigit():
        return int(s)
    n = 0
    for ch in s:
        n = n * (10 if ch == "十" else 1) + CN_NUM.get(ch, 0)
    return n or 1


def parse_image_count(text: str) -> tuple[int, str]:
    """识别图片数量。返回 (count, source)，source: explicit|fuzzy|default"""
    t = text or ""
    if re.search(r"完整套图|全套|整套|1\s*[-~到]\s*9", t):
        return 9, "explicit"
    if re.search(r"一套", t) and re.search(r"9", t):
        return 9, "explicit"

    parts = re.findall(r"[^\d一两二三四五六七八九十]{0,6}?([0-9一两二三四五六七八九十]+)\s*张", t)
    if len(parts) > 1:
        total = sum(_to_number(p) for p in parts)
        if 1 <= total <= 9:
            return total, "explicit"
    single = re.search(r"([0-9一两二三四五六七八九十]+)\s*(?:张|个|幅|images?|pics?)", t, re.I)
    if single:
        n = _to_number(single.group(1))
        if n >= 1:
            return min(n, 9), "explicit"
    if re.search(r"多来几张|多出几张|几张", t) and not re.search(r"几张.*[?？]", t):
        return 4, "fuzzy"
    if re.search(r"上架图|listing", t, re.I):
        return 5, "default"
    if re.search(r"套图", t):
        return 9, "default"
    if re.search(r"主图|产品图", t) and not re.search(r"场景|礼物|细节", t):
        return 1, "default"
    return 3, "default"


def _match_ids(rules, text):
    return [r[0] for r in rules if r[-1].search(text or "")]


def _match_labeled(rules, text):
    return [{"id": rid, "label": label} for rid, label, rx in rules if rx.search(text or "")]


def parse_request(message: str, product_hint: str = "") -> dict:
    """解析用户自然语言需求 → 结构化意图（/api/commerce-agent/parse 的核心）。"""
    t = message or ""
    count, source = parse_image_count(t)
    platforms = _match_ids(PLATFORM_RULES, t)
    image_types = _match_ids(IMAGE_TYPE_RULES, t)
    audiences = _match_labeled(AUDIENCE_RULES, t)
    occasions = _match_labeled(OCCASION_RULES, t)
    product_types = _match_labeled(PRODUCT_TYPE_RULES, t)

    is_gift = bool(occasions) or bool(re.search(r"送礼|礼物|送给|gift", t, re.I))
    is_listing_set = bool(re.search(r"上架图|listing|套图|上架", t, re.I)) or count >= 5

    slot_ids = _pick_slot_ids(count, image_types)
    image_type_labels = [
        IMAGE_TYPE_LABELS.get(next((k for k, v in TYPE_TO_SLOT.items() if v == sid), ""),
                              _slot_by_id(sid)["name"])
        for sid in slot_ids
    ]

    audience = audiences[0]["label"] if audiences else "欧美电商客户"
    occasion = occasions[0]["label"] if occasions else ("送礼场景" if is_gift else "")
    product_type = (product_types[0]["label"] if product_types
                    else (product_hint or "根据上传产品图自动识别"))

    return {
        "platform": PLATFORM_STYLES.get(platforms[0], PLATFORM_STYLES["etsy"])["label"]
        if platforms else "Etsy + Temu 兼容",
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
    """按解析结果生成上架套图规划（/api/commerce-agent/plan 的核心）。"""
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
        creative_bits.append("突出「它一直在你身边」的纪念情绪")
    elif parsed.get("isGift"):
        creative_bits.append("突出送礼瞬间的情绪价值与仪式感")
    else:
        creative_bits.append("突出产品品质与第一眼点击力")
    creative_bits.append(f"按 {platform['label']} 客户审美（{platform['tone']}）定制画面")
    if parsed.get("audience") and parsed.get("audienceId"):
        creative_bits.append(f"画面向「{parsed['audience']}」倾斜")

    return {
        "strategy": {
            "platform": platform["label"],
            "platformTone": platform["tone"],
            "platforms": parsed.get("platforms", []),
            "productType": parsed.get("productType", ""),
            "targetCustomer": parsed.get("audience", "欧美电商客户"),
            "giftScene": parsed.get("giftScene", ""),
            "imageCount": len(images),
            "structure": " + ".join(s["name"] for s in slots),
            "creativeDirection": "；".join(creative_bits),
            "riskReminder": "避免品牌 Logo、版权角色、真实商标与明星脸；参考爆款只学结构，画面全部原创",
        },
        "images": images,
    }


# ── 单张图改图指令 ──

INSTRUCTION_MODS = [
    (re.compile(r"温馨|温暖|warmer", re.I),
     "Make the mood noticeably warmer and cozier: golden-hour light, soft warm tones."),
    (re.compile(r"放大|大一点|突出产品", re.I),
     "Make the product significantly larger in frame, dominating the composition."),
    (re.compile(r"背景.*(简单|干净)|简单一点|简洁", re.I),
     "Simplify the background dramatically: minimal, clean, quiet backdrop, "
     "nothing competing with the product."),
    (re.compile(r"不要文字|去掉文字|无文字", re.I),
     "Absolutely no text, letters or numbers anywhere in the image."),
    (re.compile(r"圣诞", re.I),
     f"Restyle as a Christmas gift scene: {OCCASION_PROMPTS['christmas']}."),
    (re.compile(r"送妈妈|母亲", re.I),
     f"Restyle as a gift for Mom: {AUDIENCE_PROMPTS['mom']}."),
    (re.compile(r"白底", re.I),
     "Switch to a pure white seamless studio background, Amazon main-image style."),
]


def apply_instruction(scene: dict, instruction: str) -> dict:
    """把中文改图指令追加为英文提示词修饰，只影响这一张图。"""
    updated = dict(scene)
    additions = [phrase for rx, phrase in INSTRUCTION_MODS if rx.search(instruction or "")]
    if additions:
        updated["prompt"] = f"{updated.get('prompt', '')} {' '.join(additions)}".strip()
    return updated
