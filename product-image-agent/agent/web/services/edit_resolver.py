"""english_text — textcustomerenglish_text「english_text + english_text + english_text」。

textcustomerenglish_text，english_text：
    「english_text logo text」「english_textbackgroundenglish_text」「textyestext，text」「english_text」

parse_edit_message：textyestextyesenglish_text，english_text/english_text/text/yesnotext；
resolve_image：text「english_text / english_text / text」english_text imageId，
english_textagenttext，english_text。

english_text（english_text、english_text、english_text）；english_text"english_text"text visual_locate textvisualtext。
"""

from __future__ import annotations

import re

CN_NUM = {"text": 1, "text": 2, "text": 2, "text": 3, "text": 4, "text": 5,
          "text": 6, "text": 7, "text": 8, "text": 9, "text": 10}

# english_text（english_text「text/english_text」english_textgeneration）
EDIT_VERB_RE = re.compile(
    r"(text|text|text|text|text|text|text|text|text|text|text|text|text|text|"
    r"text|text|text|text|text|text|text|english_text|english_text|text|english_text)")

# english_text（english_text，text regenerate flow）
REGEN_RE = re.compile(r"(text|textgeneration|english_text|english_text|english_text|english_text|textgeneration)")

RESTORE_RE = re.compile(r"(text|text|text|text|text)[^。，,]*(english_text|text|text|text|text)|undo")

REFER_LAST_RE = re.compile(r"(text|text|text|text|textyestext|text|english_text|text)")

ORDINAL_RE = re.compile(r"text\s*([0-9english_text]+)\s*[english_text]")

# 「textXtext」「textXtextY」english_text X
TARGET_BA_RE = re.compile(
    r"text(.+?)(?:text|text|text|text|text|text|text|text|text|text|text|text|"
    r"text|text|text|text|text|text|english_text|text|english_text)")
# 「textX」text
TARGET_VERB_FIRST_RE = re.compile(
    r"(?:text|text|text|text|text|text|text|text)([^。，,！!？?]{1,40})")


def _to_int(token: str) -> int | None:
    token = token.strip()
    if token.isdigit():
        return int(token)
    if token in CN_NUM:
        return CN_NUM[token]
    if len(token) == 2 and token[0] == "text" and token[1] in CN_NUM:
        return 10 + CN_NUM[token[1]]
    return None


def _extract_target(message: str) -> str:
    """english_text（textvisualenglish_text），failedenglish_text。"""
    m = TARGET_BA_RE.search(message)
    if m:
        target = m.group(1)
    else:
        m = TARGET_VERB_FIRST_RE.search(message)
        target = m.group(1) if m else ""
    # text「textNtext（text/text/text）」english_text，english_text
    target = re.sub(r"text\s*[0-9english_text]+\s*[english_text]\s*(image?|text)?[english_text]?", "", target)
    target = re.sub(r"^(text|text|image?|text)[english_text]?", "", target.strip())
    return target.strip(" english_text")[:80]


def parse_edit_message(message: str) -> dict | None:
    """english_text。english_textmessagetext None。

    text: {"instruction", "target_desc", "ordinal", "refers_last", "is_restore"}
    """
    msg = (message or "").strip()
    if not msg:
        return None
    if RESTORE_RE.search(msg):
        return {"instruction": msg, "target_desc": "", "is_restore": True,
                "ordinal": None, "refers_last": True}
    if REGEN_RE.search(msg):
        return None
    if not EDIT_VERB_RE.search(msg):
        return None

    ordinal = None
    m = ORDINAL_RE.search(msg)
    if m:
        ordinal = _to_int(m.group(1))

    return {
        "instruction": msg,
        "target_desc": _extract_target(msg),
        "ordinal": ordinal,
        "refers_last": bool(REFER_LAST_RE.search(msg)),
        "is_restore": False,
    }


def resolve_image(parsed: dict, plan_images: list,
                  last_edited_id: str = "") -> dict:
    """english_textimage。

    text:
        {"imageId", "sceneId", "title"}          — english_text
        {"ambiguous": [{"index","imageId","title"}, ...]}  — english_text
        {"notFound": True}                        — textyesenglish_text
    """
    images = [p for p in (plan_images or []) if isinstance(p, dict)]
    if not images:
        return {"notFound": True}

    def _hit(entry: dict) -> dict:
        return {
            "imageId": entry.get("id") or entry.get("scene_id") or "",
            "sceneId": entry.get("scene_id") or entry.get("id") or "",
            "title": entry.get("title") or entry.get("scene_name_cn") or "",
        }

    # 1. english_text：「english_text」
    ordinal = parsed.get("ordinal")
    if ordinal:
        if 1 <= ordinal <= len(images):
            return _hit(images[ordinal - 1])
        return {"notFound": True, "reason": f"english_textyes {len(images)} text"}

    # 2. english_text：「text / textyestext / text」
    if parsed.get("refers_last") and last_edited_id:
        entry = next((p for p in images
                      if last_edited_id in (p.get("id"), p.get("scene_id"))), None)
        if entry:
            return _hit(entry)

    # 3. scenetext/titlekeywords：「english_text」「english_text」
    msg = parsed.get("instruction", "")
    matches = []
    for entry in images:
        words = [w for w in [entry.get("title", ""),
                             entry.get("scene_name_cn", ""),
                             entry.get("purpose", "")] if w]
        for word in words:
            # titletext 2 english_textmessagetext：customertext「text」english_texttitle「english_text」
            hit = False
            for run in re.findall(r"[\u4e00-\u9fff]{2,}", word):
                if any(run[i:i + 2] in msg for i in range(len(run) - 1)):
                    hit = True
                    break
            if hit:
                matches.append(entry)
                break
    matches = list({id(e): e for e in matches}.values())
    if len(matches) == 1:
        return _hit(matches[0])
    if len(matches) > 1:
        return {"ambiguous": [
            {"index": images.index(e) + 1, **_hit(e)} for e in matches]}

    # 4. textyesenglish_text：english_text
    if len(images) == 1:
        return _hit(images[0])

    # 5. yesenglish_text（customerenglish_textyestext）
    if last_edited_id:
        entry = next((p for p in images
                      if last_edited_id in (p.get("id"), p.get("scene_id"))), None)
        if entry:
            return _hit(entry)

    return {"ambiguous": [
        {"index": i + 1, **_hit(e)} for i, e in enumerate(images)]}
