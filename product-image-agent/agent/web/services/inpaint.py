"""english_text — english_text，english_text。

text OpenAI text images/edits text mask text：mask english_text，
english_text。english_text：
- frontendenglish_text（english_text rect）
- english_text（text/text/text/text…）automaticenglish_text

COMMERCE_AGENT_MOCK=1 textlocaltext（english_text），english_text。
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

# english_text → english_text (x, y, w, h)
REGION_MAP = {
    "text": (0.0, 0.0, 0.5, 0.5), "text": (0.5, 0.0, 0.5, 0.5),
    "text": (0.0, 0.5, 0.5, 0.5), "text": (0.5, 0.5, 0.5, 0.5),
    "text": (0.0, 0.0, 1.0, 0.4), "text": (0.0, 0.0, 1.0, 0.4),
    "text": (0.0, 0.6, 1.0, 0.4), "text": (0.0, 0.6, 1.0, 0.4),
    "text": (0.0, 0.0, 0.4, 1.0), "text": (0.0, 0.0, 0.4, 1.0),
    "text": (0.6, 0.0, 0.4, 1.0), "text": (0.6, 0.0, 0.4, 1.0),
    "text": (0.25, 0.25, 0.5, 0.5), "text": (0.25, 0.25, 0.5, 0.5),
    "background": (0.0, 0.0, 1.0, 1.0),
}


def region_from_text(instruction: str):
    """english_text，english_text rect text None。"""
    for word, rect in REGION_MAP.items():
        if word in (instruction or ""):
            return rect
    return None


def _build_mask(size: tuple, rect: tuple) -> bytes:
    """generation RGBA mask PNG：rect english_text（english_text），english_text（text）。"""
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
    except Exception:  # noqa: BLE001 — text mask english_text/text
        return None


def inpaint_image(src_path: str, instruction: str,
                  mask_data_url: str = "", rect: tuple | None = None,
                  api_key: str = "") -> dict:
    """english_text src_path（english_text alts/，english_text）。

    text {"path", "backup", "mocked", "region"}；failedenglish_text。
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
            # noneenglish_text：english_text，english_text"english_text"
            mask_bytes = _build_mask(size, (0.0, 0.0, 1.0, 1.0))
            region_desc = "full"

    # english_text，english_text（english_text/textallenglish_text）
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

    # english_text API text：text 1024x1024 english_text/english_text、english_text
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
        # english_text（502/503/524…）english_text，english_textcustomer
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
            raise RuntimeError("imagetextAPItextyesenglish_textdata")
        dl = requests.get(url, timeout=120)
        dl.raise_for_status()
        img_bytes = dl.content

    with Image.open(io.BytesIO(img_bytes)) as edited:
        out = edited.convert("RGB")
        # english_text，english_text/text/english_text
        if out.size != size:
            out = out.resize(size, Image.LANCZOS)
        out.save(src_path, "JPEG", quality=92)
    return {"path": src_path, "backup": backup, "mocked": False,
            "region": region_desc}
