"""对话改图解析器 — 把客户一句话变成「哪张图 + 改哪里 + 改成什么」。

刁难客户不会点按钮拖框，只会说：
    「把第三张图杯子上的 logo 去掉」「那张海报的背景换成米白色」「还是不行，再改」「恢复上一版」

parse_edit_message：识别是不是改图指令，抽出序号/目标物/指令/是否回退；
resolve_image：把「第三张 / 海报那张 / 这张」落到计划里的具体 imageId，
歧义时返回候选让智能体反问，绝不瞎猜改错图。

纯规则实现（确定性、零延迟、可测试）；像素级"目标物在哪"交给 visual_locate 的视觉模型。
"""

from __future__ import annotations

import re

CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

# 精准局部修改动词（区别于「重做/换风格」的整图重生成）
EDIT_VERB_RE = re.compile(
    r"(去掉|去除|删掉|删除|移除|擦掉|抹掉|修掉|遮住|换成|改成|变成|调亮|调暗|"
    r"加上|加个|添上|放大|缩小|挪到|移到|修一下|处理一下|修正|改一下)")

# 整图重做类词（命中则不算精准改图，交给 regenerate 流程）
REGEN_RE = re.compile(r"(重做|重新生成|再来一版|换个风格|换一版|重新出|再生成)")

RESTORE_RE = re.compile(r"(恢复|换回|退回|还原|撤销)[^。，,]*(上一版|原来|之前|原图|修改)|undo")

REFER_LAST_RE = re.compile(r"(这张|那张|刚才|刚改|还是不行|再改|继续改|不对)")

ORDINAL_RE = re.compile(r"第\s*([0-9一两二三四五六七八九十]+)\s*[张个幅]")

# 「把X去掉」「把X换成Y」中抽目标物 X
TARGET_BA_RE = re.compile(
    r"把(.+?)(?:去掉|去除|删掉|删除|移除|擦掉|抹掉|修掉|遮住|换成|改成|变成|"
    r"调亮|调暗|放大|缩小|挪到|移到|修一下|修正|改一下)")
# 「去掉X」式
TARGET_VERB_FIRST_RE = re.compile(
    r"(?:去掉|去除|删掉|删除|移除|擦掉|抹掉|修掉)([^。，,！!？?]{1,40})")


def _to_int(token: str) -> int | None:
    token = token.strip()
    if token.isdigit():
        return int(token)
    if token in CN_NUM:
        return CN_NUM[token]
    if len(token) == 2 and token[0] == "十" and token[1] in CN_NUM:
        return 10 + CN_NUM[token[1]]
    return None


def _extract_target(message: str) -> str:
    """抽出要定位的目标物描述（给视觉模型看的），失败返回空串。"""
    m = TARGET_BA_RE.search(message)
    if m:
        target = m.group(1)
    else:
        m = TARGET_VERB_FIRST_RE.search(message)
        target = m.group(1) if m else ""
    # 去掉「第N张图（的/里/上）」这类指图前缀，留下物体本身
    target = re.sub(r"第\s*[0-9一两二三四五六七八九十]+\s*[张个幅]\s*(图片?|海报)?[的里上中]?", "", target)
    target = re.sub(r"^(这张|那张|图片?|海报)[的里上中]?", "", target.strip())
    return target.strip(" 的里上中")[:80]


def parse_edit_message(message: str) -> dict | None:
    """识别改图指令。非改图消息返回 None。

    返回: {"instruction", "target_desc", "ordinal", "refers_last", "is_restore"}
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
    """把指令落到具体图片。

    返回:
        {"imageId", "sceneId", "title"}          — 唯一命中
        {"ambiguous": [{"index","imageId","title"}, ...]}  — 需要反问
        {"notFound": True}                        — 没有可改的图
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

    # 1. 序号直达：「第三张」
    ordinal = parsed.get("ordinal")
    if ordinal:
        if 1 <= ordinal <= len(images):
            return _hit(images[ordinal - 1])
        return {"notFound": True, "reason": f"本轮只有 {len(images)} 张图"}

    # 2. 指代上一次改过的图：「这张 / 还是不行 / 再改」
    if parsed.get("refers_last") and last_edited_id:
        entry = next((p for p in images
                      if last_edited_id in (p.get("id"), p.get("scene_id"))), None)
        if entry:
            return _hit(entry)

    # 3. 场景名/标题关键词：「那张海报」「白底那张」
    msg = parsed.get("instruction", "")
    matches = []
    for entry in images:
        words = [w for w in [entry.get("title", ""),
                             entry.get("scene_name_cn", ""),
                             entry.get("purpose", "")] if w]
        for word in words:
            # 标题拆 2 字滑窗与消息比对：客户说「海报」也能命中标题「宣传海报」
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

    # 4. 只有一张图：不用问
    if len(images) == 1:
        return _hit(images[0])

    # 5. 有上次改过的图兜底（客户连着说改图大概率还是那张）
    if last_edited_id:
        entry = next((p for p in images
                      if last_edited_id in (p.get("id"), p.get("scene_id"))), None)
        if entry:
            return _hit(entry)

    return {"ambiguous": [
        {"index": i + 1, **_hit(e)} for i, e in enumerate(images)]}
