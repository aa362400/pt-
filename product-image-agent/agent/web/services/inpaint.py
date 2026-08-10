"""精准局部改图 — 圈哪改哪，其余像素保持不动。

用 OpenAI 兼容 images/edits 的 mask 能力：mask 中透明的区域允许重绘，
不透明区域强制保留原像素。支持两种定位方式：
- 前端圈选框（归一化坐标 rect）
- 自然语言方位词（左上/右下/中间/顶部…）自动转成矩形区域

COMMERCE_AGENT_MOCK=1 时本地模拟（直接复制原图），保证测试与演示可跑。
"""

from __future__ import annotations

import base64
import io
import os
import shutil
import time

from common.utils import (
    get_image_api_key,
    get_openai_image_api_base,
    get_openai_image_model,
)

EDIT_TIMEOUT = 180

# 方位词 → 归一化矩形 (x, y, w, h)
REGION_MAP = {
    "左上": (0.0, 0.0, 0.5, 0.5), "右上": (0.5, 0.0, 0.5, 0.5),
    "左下": (0.0, 0.5, 0.5, 0.5), "右下": (0.5, 0.5, 0.5, 0.5),
    "上方": (0.0, 0.0, 1.0, 0.4), "顶部": (0.0, 0.0, 1.0, 0.4),
    "下方": (0.0, 0.6, 1.0, 0.4), "底部": (0.0, 0.6, 1.0, 0.4),
    "左边": (0.0, 0.0, 0.4, 1.0), "左侧": (0.0, 0.0, 0.4, 1.0),
    "右边": (0.6, 0.0, 0.4, 1.0), "右侧": (0.6, 0.0, 0.4, 1.0),
    "中间": (0.25, 0.25, 0.5, 0.5), "中心": (0.25, 0.25, 0.5, 0.5),
    "背景": (0.0, 0.0, 1.0, 1.0),
}


def region_from_text(instruction: str):
    """从指令里识别方位词，返回归一化 rect 或 None。"""
    for word, rect in REGION_MAP.items():
        if word in (instruction or ""):
            return rect
    return None


def _build_mask(size: tuple, rect: tuple) -> bytes:
    """生成 RGBA mask PNG：rect 内透明（允许重绘），其余不透明（锁定）。"""
    from PIL import Image, ImageDraw

    w, h = size
    mask = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(mask)
    x, y, rw, rh = rect
    draw.rectangle(
        [int(x * w), int(y * h), int((x + rw) * w), int((y + rh) * h)],
        fill=(0, 0, 0, 0))
    buf = io.BytesIO()
    mask.save(buf, "PNG")
    return buf.getvalue()


def _decode_mask_data_url(data_url: str) -> bytes | None:
    try:
        _, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64)
        return raw if len(raw) > 64 else None
    except Exception:  # noqa: BLE001 — 非法 mask 回退方位词/整图
        return None


def inpaint_image(src_path: str, instruction: str,
                  mask_data_url: str = "", rect: tuple | None = None,
                  api_key: str = "") -> dict:
    """局部重绘 src_path（原图先备份到 alts/，结果覆写原路径）。

    返回 {"path", "backup", "mocked", "region"}；失败抛异常。
    """
    from PIL import Image

    with Image.open(src_path) as im:
        img = im.convert("RGBA")
        size = img.size
        src_png = io.BytesIO()
        img.save(src_png, "PNG")
        src_png.seek(0)

    region_desc = "custom"
    mask_bytes = None
    if mask_data_url:
        mask_bytes = _decode_mask_data_url(mask_data_url)
    if mask_bytes is None:
        found = rect or region_from_text(instruction)
        if found:
            mask_bytes = _build_mask(size, found)
            region_desc = str(found)
        else:
            # 无定位信息：整图允许重绘，但提示词强约束"只改指令提到的部分"
            mask_bytes = _build_mask(size, (0.0, 0.0, 1.0, 1.0))
            region_desc = "full"

    # 备份原图，结果覆写原路径（下游打包/导出全部拿到改后版本）
    out_dir = os.path.dirname(os.path.dirname(src_path))
    backup_dir = os.path.join(out_dir, "alts")
    os.makedirs(backup_dir, exist_ok=True)
    stem, ext = os.path.splitext(os.path.basename(src_path))
    backup = os.path.join(backup_dir, f"{stem}_pre_edit_{int(time.time())}{ext}")
    shutil.copy2(src_path, backup)

    if os.environ.get("COMMERCE_AGENT_MOCK", "").strip() == "1":
        return {"path": src_path, "backup": backup, "mocked": True,
                "region": region_desc}

    import requests

    api_key = api_key or get_image_api_key("dalle")
    if not api_key:
        raise ValueError("Image API key is not configured")

    base = get_openai_image_api_base()
    model = get_openai_image_model()
    prompt = (
        f"Edit ONLY the unmasked (editable) region: {instruction}. "
        "Everything outside the edited region must remain pixel-identical to the "
        "original image. Keep the framing and zoom level unchanged. "
        "Keep the product's shape, colors, materials and "
        "proportions exactly consistent. Photorealistic, seamless blend.")

    # 按原图长宽比选 API 尺寸：写死 1024x1024 会把横/竖图拉变形、画面被放大裁切
    ratio = size[0] / size[1] if size[1] else 1.0
    if ratio > 1.2:
        api_size = "1536x1024"
    elif ratio < 0.83:
        api_size = "1024x1536"
    else:
        api_size = "1024x1024"

    resp = None
    for attempt in (1, 2):
        src_png.seek(0)
        resp = requests.post(
            f"{base}/images/edits",
            headers={"Authorization": f"Bearer {api_key}"},
            data={"model": model, "prompt": prompt[:3800], "n": "1",
                  "size": api_size, "response_format": "b64_json"},
            files={
                "image": ("image.png", src_png, "image/png"),
                "mask": ("mask.png", io.BytesIO(mask_bytes), "image/png"),
            },
            timeout=EDIT_TIMEOUT,
        )
        # 网关抽风（502/503/524…）重试一次即可恢复，别把瞬时故障甩给客户
        if resp.status_code >= 500 and attempt == 1:
            time.sleep(3)
            continue
        break
    resp.raise_for_status()
    data = resp.json()
    item = (data.get("data") or [{}])[0]
    b64 = item.get("b64_json", "")
    if b64:
        img_bytes = base64.b64decode(b64)
    else:
        url = item.get("url", "")
        if not url:
            raise RuntimeError("图片编辑接口没有返回图像数据")
        dl = requests.get(url, timeout=120)
        dl.raise_for_status()
        img_bytes = dl.content

    with Image.open(io.BytesIO(img_bytes)) as edited:
        out = edited.convert("RGB")
        # 回到原图尺寸，下游排版/导出/对比滑块拿到的分辨率不变
        if out.size != size:
            out = out.resize(size, Image.LANCZOS)
        out.save(src_path, "JPEG", quality=92)
    return {"path": src_path, "backup": backup, "mocked": False,
            "region": region_desc}
