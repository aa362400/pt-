#!/usr/bin/env python3
"""
automaticenglish_text — Layout Engine

english_text，outputtextlistingenglish_text：
  - english_text：english_text、text、text、text
  - english_text：english_text、text、text、english_text
  - english_text：2/3/4/6 english_text
  - templatetext：english_texttemplate

text：
  # english_text
  python layout_engine.py \
    --input scene_01.jpg \
    --output final_01.jpg \
    --text "english_text" --subtext "english_text" \
    --template product_main

  # english_text
  python layout_engine.py \
    --batch-dir ./outputs/final/ \
    --output ./outputs/layout/ \
    --template product_main \
    --brand-name "english_text"
"""

import argparse
import json
import math
import os
import platform
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

# english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.utils import setup_logger, get_api_key, hex_to_rgb
logger = setup_logger(__name__)

# ============================================================
# Englishtextautomaticdetection
# ============================================================

def get_chinese_font(preferred_path: str = "") -> Optional[str]:
    """
    automaticdetectionenglish_textEnglishtext。
    english_text：Windows → macOS → Linux → english_text

    english_text，english_text None（english_text PIL english_text，Englishenglish_text）
    """
    if preferred_path and os.path.exists(preferred_path):
        return preferred_path

    system = platform.system()

    # Windows Englishtext
    if system == "Windows":
        windir = os.environ.get("WINDIR", "C:\\Windows")
        candidates = [
            os.path.join(windir, "Fonts", "msyh.ttc"),       # english_text
            os.path.join(windir, "Fonts", "msyhbd.ttc"),     # english_text
            os.path.join(windir, "Fonts", "simsun.ttc"),     # text
            os.path.join(windir, "Fonts", "SIMHEI.TTF"),     # text
            os.path.join(windir, "Fonts", "Deng.ttf"),       # text
        ]
        for c in candidates:
            if os.path.exists(c):
                return c

    # macOS Englishtext
    elif system == "Darwin":
        candidates = [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/Library/Fonts/Arial Unicode.ttf",
        ]
        for c in candidates:
            if os.path.exists(c):
                return c

    # Linux Englishtext
    else:
        candidates = [
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        # text fc-list searchenglish_text
        try:
            result = subprocess.run(
                ["fc-list", ":lang=zh", "-f", "%{file}\n"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.strip().split("\n"):
                if line.strip() and os.path.exists(line.strip()):
                    return line.strip()
        except Exception:
            pass

    return None


def detect_font_for_variables(variables: dict = None) -> Optional[str]:
    """
    english_text（text/text/english_text/text/text）automaticenglish_text。
    text localization text；english_textEnglishtextdetection。
    """
    sample = " ".join(str(v) for v in (variables or {}).values() if v)
    try:
        from localization import get_font_for_text
        font = get_font_for_text(sample)
        if font:
            return font
    except ImportError:
        pass
    return get_chinese_font()

# ============================================================
# texttemplate
# ============================================================

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# ============================================================
# texttemplate
# ============================================================

LAYOUT_TEMPLATES = {
    "product_main": {
        "name": "english_text",
        "canvas": (1080, 1080),
        "elements": [
            {"type": "background", "color": "#FFFFFF"},
            {"type": "image", "box": (40, 40, 1040, 840), "round_radius": 16},
            {"type": "text", "text": "{{brand_name}}", "font_size": 28,
             "position": "bottom_left", "margin": (40, 40), "color": "#999999"},
        ],
        "description": "english_text，english_text，english_text",
    },
    "product_detail_top": {
        "name": "english_text",
        "canvas": (750, 1000),
        "elements": [
            {"type": "background", "color": "#F8F8F8"},
            {"type": "image", "box": (0, 0, 750, 750)},
            {"type": "text", "text": "{{product_name}}", "font_size": 36,
             "position": "left", "offset": (40, 780), "color": "#222222", "bold": True},
            {"type": "text", "text": "{{sub_text}}", "font_size": 26,
             "position": "left", "offset": (40, 830), "color": "#666666"},
            {"type": "text", "text": "{{price_text}}", "font_size": 32,
             "position": "left", "offset": (40, 880), "color": "#FF4444", "bold": True},
        ],
        "description": "english_text，text+title+texttitle+text",
    },
    "promo_banner": {
        "name": "english_text",
        "canvas": (1080, 600),
        "elements": [
            {"type": "background", "color": "#FFF5F5"},
            {"type": "image", "box": (30, 30, 580, 570), "round_radius": 12},
            {"type": "tag", "text": "🔥 english_text", "font_size": 24,
             "box": (620, 40, 1060, 80), "color": "#FFFFFF", "bg_color": "#FF4444"},
            {"type": "text", "text": "{{product_name}}", "font_size": 38,
             "position": "left", "offset": (620, 120), "color": "#222222", "bold": True},
            {"type": "text", "text": "{{sub_text}}", "font_size": 26,
             "position": "left", "offset": (620, 180), "color": "#666666"},
            {"type": "text", "text": "{{price_text}}", "font_size": 40,
             "position": "left", "offset": (620, 280), "color": "#FF4444", "bold": True},
            {"type": "button", "text": "english_text →", "font_size": 28,
             "box": (620, 480, 1060, 560), "color": "#FFFFFF", "bg_color": "#FF4444"},
        ],
        "description": "english_text，english_text+text+text",
    },
    "collage_2": {
        "name": "english_text",
        "canvas": (1080, 540),
        "elements": [
            {"type": "background", "color": "#FFFFFF"},
            {"type": "image", "box": (10, 10, 535, 530), "round_radius": 8},
            {"type": "image", "box": (545, 10, 1070, 530), "round_radius": 8},
        ],
        "description": "english_text",
    },
    "collage_4": {
        "name": "english_text",
        "canvas": (1080, 1080),
        "elements": [
            {"type": "background", "color": "#FFFFFF"},
            {"type": "image", "box": (10, 10, 535, 535), "round_radius": 8},
            {"type": "image", "box": (545, 10, 1070, 535), "round_radius": 8},
            {"type": "image", "box": (10, 545, 535, 1070), "round_radius": 8},
            {"type": "image", "box": (545, 545, 1070, 1070), "round_radius": 8},
        ],
        "description": "english_text2x2text",
    },
    # ---- A+ english_text（Amazon A+ english_text 970px，english_text 1940 english_text）----
    "aplus_banner": {
        "name": "A+ english_text",
        "canvas": (1940, 600),
        "elements": [
            {"type": "background", "color": "#F5F3EF"},
            {"type": "image", "box": (1040, 40, 1900, 560), "round_radius": 16},
            {"type": "text", "text": "{{product_name}}", "font_size": 64,
             "position": "left", "offset": (80, 180), "color": "#1A1A1A", "bold": True},
            {"type": "text", "text": "{{sub_text}}", "font_size": 34,
             "position": "left", "offset": (80, 290), "color": "#666666"},
            {"type": "tag", "text": "{{badge_text}}", "font_size": 28,
             "box": (80, 380, 320, 440), "color": "#FFFFFF", "bg_color": "#1A1A1A"},
        ],
        "description": "A+ english_text：texttitleenglish_text",
    },
    "aplus_callouts": {
        "name": "A+ english_text",
        "canvas": (1940, 1200),
        "elements": [
            {"type": "background", "color": "#FFFFFF"},
            {"type": "image", "box": (120, 120, 1020, 1080), "round_radius": 12},
            {"type": "text", "text": "{{product_name}}", "font_size": 48,
             "position": "left", "offset": (1100, 120), "color": "#1A1A1A", "bold": True},
            {"type": "callout", "text": "{{selling_point_1}}", "font_size": 32,
             "anchor": (860, 360), "text_pos": (1100, 340), "color": "#333333",
             "accent": "#FF6B35"},
            {"type": "callout", "text": "{{selling_point_2}}", "font_size": 32,
             "anchor": (900, 620), "text_pos": (1100, 600), "color": "#333333",
             "accent": "#FF6B35"},
            {"type": "callout", "text": "{{selling_point_3}}", "font_size": 32,
             "anchor": (860, 880), "text_pos": (1100, 860), "color": "#333333",
             "accent": "#FF6B35"},
        ],
        "description": "A+ english_text：english_text，text 3 english_text",
    },
    "aplus_specs": {
        "name": "A+ english_text",
        "canvas": (1940, 1100),
        "elements": [
            {"type": "background", "color": "#FAFAFA"},
            {"type": "image", "box": (120, 130, 900, 970), "round_radius": 12},
            {"type": "text", "text": "{{product_name}}", "font_size": 46,
             "position": "left", "offset": (1000, 130), "color": "#1A1A1A", "bold": True},
            {"type": "table", "box": (1000, 240, 1820, 970), "font_size": 30,
             "rows_var": "specs", "header_color": "#1A1A1A",
             "row_colors": ("#FFFFFF", "#F2F2F2"), "text_color": "#333333"},
        ],
        "description": "A+ english_text：english_text，english_text（variables['specs'] text [[text, text], ...]）",
    },
    "aplus_dimensions": {
        "name": "A+ english_text",
        "canvas": (1940, 1200),
        "elements": [
            {"type": "background", "color": "#FFFFFF"},
            {"type": "image", "box": (420, 150, 1520, 950), "round_radius": 0},
            {"type": "dimension", "orientation": "horizontal",
             "line": (420, 1030, 1520, 1030), "text": "{{width_text}}",
             "font_size": 34, "color": "#1A1A1A"},
            {"type": "dimension", "orientation": "vertical",
             "line": (320, 150, 320, 950), "text": "{{height_text}}",
             "font_size": 34, "color": "#1A1A1A"},
            {"type": "text", "text": "{{product_name}}", "font_size": 42,
             "position": "center", "offset": (970, 60), "color": "#1A1A1A", "bold": True},
        ],
        "description": "A+ english_text：english_text/text（variables text width_text/height_text）",
    },
    "social_square": {
        "name": "english_text",
        "canvas": (1080, 1080),
        "elements": [
            {"type": "background", "color": "#FFFFFF"},
            {"type": "image", "box": (55, 55, 1025, 825), "round_radius": 20},
            {"type": "text", "text": "{{product_name}}", "font_size": 32,
             "position": "center", "offset": (540, 920), "color": "#333333"},
            {"type": "text", "text": "{{sub_text}}", "font_size": 24,
             "position": "center", "offset": (540, 970), "color": "#999999"},
            {"type": "tag", "text": "{{brand_name}}", "font_size": 20,
             "box": (40, 40, 200, 70), "color": "#FFFFFF", "bg_color": "#222222"},
        ],
        "description": "english_text",
    },
}


# ============================================================
# english_text
# ============================================================

def hex_to_rgb(hex_color: str) -> tuple:
    """#FF0000 → (255,0,0)"""
    from common.utils import hex_to_rgb as _util_hex_to_rgb
    return _util_hex_to_rgb(hex_color)


def round_corner(radius: int, color: tuple) -> Image.Image:
    """english_text"""
    corner = Image.new("L", (radius * 2, radius * 2), 0)
    draw = ImageDraw.Draw(corner)
    draw.pieslice((0, 0, radius * 2, radius * 2), 180, 270, fill=255)
    return corner


def apply_round_corners(image: Image.Image, radius: int) -> Image.Image:
    """textimageenglish_text"""
    mask = Image.new("L", image.size, 255)
    w, h = image.size
    r = min(radius, w // 2, h // 2)

    # english_text
    corner = round_corner(r, (255,))
    mask.paste(corner.crop((0, 0, r, r)), (0, 0))  # text
    mask.paste(corner.crop((r, 0, r * 2, r)), (w - r, 0))  # text
    mask.paste(corner.crop((0, r, r, r * 2)), (0, h - r))  # text
    mask.paste(corner.crop((r, r, r * 2, r * 2)), (w - r, h - r))  # text

    result = image.copy()
    result.putalpha(mask)
    return result


def add_drop_shadow(image: Image.Image, offset: int = 5, blur: int = 10,
                    shadow_color: tuple = (0, 0, 0, 80)) -> Image.Image:
    """english_text"""
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rectangle((offset, offset, image.width, image.height), fill=shadow_color)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))

    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    result.paste(shadow, (0, 0), shadow)
    result.paste(image, (0, 0), image)
    return result


def render_text(draw: ImageDraw, text: str, position, font_size: int,
                color: str = "#333333", bold: bool = False,
                font_path: Optional[str] = None, anchor: str = "lt",
                align: str = "left"):
    """english_text"""
    font = None
    if font_path and os.path.exists(font_path):
        try:
            font = ImageFont.truetype(font_path, font_size)
        except Exception:
            font = None
    if font is None:
        font = ImageFont.load_default()

    rgb = hex_to_rgb(color)
    draw.text(position, text, fill=rgb, font=font, anchor=anchor, align=align)

    return draw


def render_tag(draw: ImageDraw, text: str, box: tuple, font_size: int,
               color: str, bg_color: str, font_path: Optional[str] = None):
    """english_text/text"""
    x1, y1, x2, y2 = box
    bg_rgb = hex_to_rgb(bg_color)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=8, fill=bg_rgb)

    text_color_rgb = hex_to_rgb(color)
    font = None
    if font_path and os.path.exists(font_path):
        try:
            font = ImageFont.truetype(font_path, font_size)
        except Exception:
            pass
    if font is None:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (x1 + x2 - tw) // 2
    ty = (y1 + y2 - th) // 2
    draw.text((tx, ty), text, fill=text_color_rgb, font=font)


def _load_font(font_path: Optional[str], font_size: int):
    if font_path and os.path.exists(font_path):
        try:
            return ImageFont.truetype(font_path, font_size)
        except Exception:
            pass
    return ImageFont.load_default()


def render_callout(draw: ImageDraw, text: str, anchor: tuple, text_pos: tuple,
                   font_size: int, color: str = "#333333",
                   accent: str = "#FF6B35", font_path: Optional[str] = None):
    """english_text：english_text + text + text（A+ english_text）"""
    accent_rgb = hex_to_rgb(accent)
    ax, ay = anchor
    tx, ty = text_pos

    # english_text（english_text）
    draw.ellipse((ax - 10, ay - 10, ax + 10, ay + 10), outline=accent_rgb, width=3)
    draw.ellipse((ax - 4, ay - 4, ax + 4, ay + 4), fill=accent_rgb)
    # english_text：text → english_text
    mid_x = (ax + tx) // 2
    draw.line((ax, ay, mid_x, ty + font_size // 2), fill=accent_rgb, width=3)
    draw.line((mid_x, ty + font_size // 2, tx - 16, ty + font_size // 2),
              fill=accent_rgb, width=3)

    font = _load_font(font_path, font_size)
    draw.text((tx, ty), text, fill=hex_to_rgb(color), font=font)


def render_table(draw: ImageDraw, box: tuple, rows: list, font_size: int,
                 header_color: str = "#1A1A1A",
                 row_colors: tuple = ("#FFFFFF", "#F2F2F2"),
                 text_color: str = "#333333",
                 font_path: Optional[str] = None):
    """english_text（A+ english_text），rows = [[text, text], ...]"""
    if not rows:
        return
    x1, y1, x2, y2 = box
    row_h = min(90, max(font_size + 24, (y2 - y1) // max(1, len(rows))))
    font = _load_font(font_path, font_size)
    col_split = x1 + int((x2 - x1) * 0.42)

    for i, row in enumerate(rows):
        top = y1 + i * row_h
        if top + row_h > y2:
            break
        bg = row_colors[i % len(row_colors)]
        draw.rectangle((x1, top, x2, top + row_h), fill=hex_to_rgb(bg))
        name = str(row[0]) if len(row) > 0 else ""
        value = str(row[1]) if len(row) > 1 else ""
        ty = top + (row_h - font_size) // 2
        draw.text((x1 + 24, ty), name, fill=hex_to_rgb(header_color), font=font)
        draw.text((col_split + 24, ty), value, fill=hex_to_rgb(text_color), font=font)
    # text + english_text
    bottom = min(y2, y1 + len(rows) * row_h)
    draw.rectangle((x1, y1, x2, bottom), outline=hex_to_rgb("#DDDDDD"), width=2)
    draw.line((col_split, y1, col_split, bottom), fill=hex_to_rgb("#DDDDDD"), width=2)


def render_dimension(draw: ImageDraw, line: tuple, text: str,
                     orientation: str = "horizontal", font_size: int = 32,
                     color: str = "#1A1A1A", font_path: Optional[str] = None):
    """english_text：english_text + english_text（A+ english_text）"""
    rgb = hex_to_rgb(color)
    x1, y1, x2, y2 = line
    tick = 14
    draw.line((x1, y1, x2, y2), fill=rgb, width=3)
    font = _load_font(font_path, font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

    if orientation == "vertical":
        draw.line((x1 - tick, y1, x1 + tick, y1), fill=rgb, width=3)
        draw.line((x2 - tick, y2, x2 + tick, y2), fill=rgb, width=3)
        cx, cy = x1, (y1 + y2) // 2
        # english_text，english_text；english_text
        draw.rectangle((cx - tw - 30, cy - th, cx - 10, cy + th),
                       fill=hex_to_rgb("#FFFFFF"))
        draw.text((cx - tw - 20, cy - th // 2), text, fill=rgb, font=font)
    else:
        draw.line((x1, y1 - tick, x1, y1 + tick), fill=rgb, width=3)
        draw.line((x2, y2 - tick, x2, y2 + tick), fill=rgb, width=3)
        cx, cy = (x1 + x2) // 2, y1
        draw.rectangle((cx - tw // 2 - 12, cy - th - 8, cx + tw // 2 + 12, cy + th),
                       fill=hex_to_rgb("#FFFFFF"))
        draw.text((cx - tw // 2, cy - th // 2 - 4), text, fill=rgb, font=font)


def apply_layout(
    image: Image.Image,
    template_name: str,
    variables: dict = None,
    font_path: Optional[str] = None,
) -> Image.Image:
    """
    english_texttemplatetext。

    text:
        image: inputenglish_text
        template_name: templatetext（english_texttemplate dict）
        variables: templatetext {"product_name": "...", "brand_name": "...", ...}
        font_path: textfiletext

    text:
        english_textimage
    """
    # texttemplate
    if isinstance(template_name, dict):
        template = template_name
    else:
        template = LAYOUT_TEMPLATES.get(template_name)
        if not template:
            raise ValueError(f"texttemplate: {template_name}。text: {list(LAYOUT_TEMPLATES.keys())}")

    canvas_size = template["canvas"]
    canvas = Image.new("RGB", canvas_size, hex_to_rgb("#FFFFFF"))
    draw = ImageDraw.Draw(canvas)

    vars_dict = {
        "product_name": "english_text",
        "brand_name": "english_text",
        "sub_text": "texttitletext",
        "price_text": "¥99.00",
        "tag_text": "text",
        "badge_text": "NEW",
        "selling_point_1": "english_text",
        "selling_point_2": "english_text",
        "selling_point_3": "english_text",
        "width_text": "text",
        "height_text": "text",
        "specs": [],
    }
    if variables:
        vars_dict.update(variables)

    for elem in template["elements"]:
        elem_type = elem.get("type", "")

        if elem_type == "background":
            bg_color = elem.get("color", "#FFFFFF")
            canvas = Image.new("RGB", canvas_size, hex_to_rgb(bg_color))
            draw = ImageDraw.Draw(canvas)

        elif elem_type == "image":
            box = elem.get("box", (0, 0, canvas_size[0], canvas_size[1]))
            x1, y1, x2, y2 = box
            target_size = (x2 - x1, y2 - y1)

            # textimageenglish_text
            img_copy = image.copy().convert("RGBA")
            img_copy.thumbnail(target_size, Image.LANCZOS)

            # english_text
            ix = x1 + (target_size[0] - img_copy.width) // 2
            iy = y1 + (target_size[1] - img_copy.height) // 2

            # text
            radius = elem.get("round_radius", 0)
            if radius > 0:
                img_copy = apply_round_corners(img_copy, radius)

            canvas.paste(img_copy, (ix, iy), img_copy if img_copy.mode == "RGBA" else None)

        elif elem_type == "text":
            text = elem.get("text", "")
            for k, v in vars_dict.items():
                text = text.replace("{{" + k + "}}", str(v))

            font_size = elem.get("font_size", 28)
            color = elem.get("color", "#333333")
            position = elem.get("position", "bottom_left")
            offset = elem.get("offset", (40, 40))
            margin = elem.get("margin", offset)

            if position == "bottom_left":
                pos = (margin[0], canvas_size[1] - margin[1] - font_size - 10)
            elif position == "bottom_right":
                pos = (canvas_size[0] - margin[0] - 200, canvas_size[1] - margin[1] - font_size - 10)
            elif position == "top_left":
                pos = (margin[0], margin[1])
            elif position == "top_right":
                pos = (canvas_size[0] - margin[0] - 200, margin[1])
            elif position == "center":
                pos = (offset[0] - 100, offset[1])
            elif position == "left":
                pos = offset
            else:
                pos = offset

            render_text(draw, text, pos, font_size, color=color,
                       bold=elem.get("bold", False), font_path=font_path)

        elif elem_type == "tag":
            text = elem.get("text", "")
            for k, v in vars_dict.items():
                text = text.replace("{{" + k + "}}", str(v))

            box = elem.get("box", (0, 0, 200, 40))
            render_tag(draw, text, box, elem.get("font_size", 20),
                      color=elem.get("color", "#FFFFFF"),
                      bg_color=elem.get("bg_color", "#FF4444"),
                      font_path=font_path)

        elif elem_type == "button":
            text = elem.get("text", "")
            for k, v in vars_dict.items():
                text = text.replace("{{" + k + "}}", str(v))

            box = elem.get("box", (0, 0, 200, 50))
            render_tag(draw, text, box, elem.get("font_size", 24),
                      color=elem.get("color", "#FFFFFF"),
                      bg_color=elem.get("bg_color", "#FF4444"),
                      font_path=font_path)

        elif elem_type == "callout":
            text = elem.get("text", "")
            for k, v in vars_dict.items():
                text = text.replace("{{" + k + "}}", str(v))
            render_callout(draw, text,
                           anchor=elem.get("anchor", (0, 0)),
                           text_pos=elem.get("text_pos", (0, 0)),
                           font_size=elem.get("font_size", 32),
                           color=elem.get("color", "#333333"),
                           accent=elem.get("accent", "#FF6B35"),
                           font_path=font_path)

        elif elem_type == "table":
            rows = vars_dict.get(elem.get("rows_var", "specs")) or []
            render_table(draw, elem.get("box", (0, 0, 400, 400)), rows,
                         font_size=elem.get("font_size", 30),
                         header_color=elem.get("header_color", "#1A1A1A"),
                         row_colors=elem.get("row_colors", ("#FFFFFF", "#F2F2F2")),
                         text_color=elem.get("text_color", "#333333"),
                         font_path=font_path)

        elif elem_type == "dimension":
            text = elem.get("text", "")
            for k, v in vars_dict.items():
                text = text.replace("{{" + k + "}}", str(v))
            render_dimension(draw, elem.get("line", (0, 0, 100, 0)), text,
                             orientation=elem.get("orientation", "horizontal"),
                             font_size=elem.get("font_size", 32),
                             color=elem.get("color", "#1A1A1A"),
                             font_path=font_path)

    return canvas


def batch_layout(
    input_dir: str,
    output_dir: str,
    template_name: str = "product_main",
    variables: dict = None,
    font_path: Optional[str] = None,
    parallel: bool = True,
):
    """english_text（automaticdetectionEnglishtext）"""
    if not HAS_PIL:
        logger.error("text Pillow: pip install Pillow")
        return []

    # automaticdetectiontext（english_text，textuserenglish_text）
    if not font_path:
        detected = detect_font_for_variables(variables)
        if detected:
            font_path = detected
            logger.info(f"automaticdetectionenglish_text: {os.path.basename(detected)}")
        else:
            logger.warning("english_text，english_text（text Noto Sans CJK english_text）")

    exts = (".jpg", ".jpeg", ".png", ".webp")
    image_paths = sorted([
        os.path.join(input_dir, f) for f in os.listdir(input_dir)
        if f.lower().endswith(exts) and not f.startswith("_")
    ])

    if not image_paths:
        logger.error(f"❌ english_textimage: {input_dir}")
        return []

    os.makedirs(output_dir, exist_ok=True)
    logger.info(f"\n📐 english_text — {len(image_paths)} text")
    logger.info(f"   template: {template_name}")
    logger.info(f"   output: {output_dir}\n")

    results = []
    if parallel:
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {}
            for path in image_paths:
                output_path = os.path.join(output_dir, os.path.basename(path))
                future = executor.submit(
                    apply_layout_to_file, path, output_path,
                    template_name, variables, font_path
                )
                futures[future] = (path, output_path)

            for future in as_completed(futures):
                path, out_path = futures[future]
                try:
                    result = future.result()
                    results.append(result)
                    status = "✅" if result["success"] else "❌"
                    logger.info(f"  {status} {os.path.basename(path)}")
                except Exception as e:
                    logger.error(f"  ❌ {os.path.basename(path)}: {e}")
                    results.append({"input": path, "success": False, "error": str(e)})
    else:
        for path in image_paths:
            output_path = os.path.join(output_dir, os.path.basename(path))
            result = apply_layout_to_file(path, output_path, template_name, variables, font_path)
            results.append(result)
            status = "✅" if result["success"] else "❌"
            logger.info(f"  {status} {os.path.basename(path)}")

    logger.info(f"\n✅ textcompleted: {sum(1 for r in results if r['success'])}/{len(results)}\n")
    return results


def apply_layout_to_file(input_path: str, output_path: str,
                         template_name: str, variables: dict,
                         font_path: Optional[str]) -> dict:
    """fileenglish_text"""
    try:
        img = Image.open(input_path).convert("RGB")
        result_img = apply_layout(img, template_name, variables, font_path)
        result_img.save(output_path, "JPEG", quality=95)
        return {"input": input_path, "success": True, "output_path": output_path}
    except Exception as e:
        return {"input": input_path, "success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="📐 automaticenglish_text")
    parser.add_argument("--input", "-i", required=True, help="inputimageenglish_text")
    parser.add_argument("--output", "-o", required=True, help="outputtext")
    parser.add_argument("--template", default="product_main",
                        choices=list(LAYOUT_TEMPLATES.keys()),
                        help="texttemplate")
    parser.add_argument("--product-name", default="", help="english_text")
    parser.add_argument("--brand-name", default="", help="english_text")
    parser.add_argument("--sub-text", default="", help="texttitle")
    parser.add_argument("--price-text", default="", help="english_text")
    parser.add_argument("--font", default="", help="textfiletext")
    parser.add_argument("--batch-dir", action="store_true",
                        help="inputyestext（english_text）")
    parser.add_argument("--no-parallel", action="store_true", help="english_text")

    args = parser.parse_args()

    variables = {}
    if args.product_name:
        variables["product_name"] = args.product_name
    if args.brand_name:
        variables["brand_name"] = args.brand_name
    if args.sub_text:
        variables["sub_text"] = args.sub_text
    if args.price_text:
        variables["price_text"] = args.price_text

    if args.batch_dir or os.path.isdir(args.input):
        batch_layout(
            input_dir=args.input,
            output_dir=args.output,
            template_name=args.template,
            variables=variables,
            font_path=args.font or None,
            parallel=not args.no_parallel,
        )
    else:
        if not HAS_PIL:
            logger.error("❌ text Pillow: pip install Pillow")
            sys.exit(1)
        img = Image.open(args.input).convert("RGB")
        result = apply_layout(img, args.template, variables, args.font or None)
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        result.save(args.output, "JPEG", quality=95)
        logger.info(f"✅ {args.input} → {args.output}")


if __name__ == "__main__":
    main()
