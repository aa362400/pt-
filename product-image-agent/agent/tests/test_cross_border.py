"""跨境本地化能力回归测试：多语言文案 / 地区场景 / 合规校验 / A+ 排版"""

import datetime
import json
import os
import sys

import pytest

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "scripts"))

from localization import (  # noqa: E402
    MARKETS,
    _FALLBACK_COPY,
    detect_text_script,
    generate_localized_copy,
    get_font_for_script,
)
from region_scenes import (  # noqa: E402
    FESTIVAL_SCENES,
    REGION_PACKS,
    apply_region_style,
    localize_scene_plan,
    resolve_region,
    upcoming_festivals,
)

PROFILE = {
    "product_name": "Ceramic Mug",
    "key_features": ["handmade", "350ml", "matte glaze"],
}


# ============================================================
# localization
# ============================================================

class TestDetectTextScript:
    def test_japanese_kana_wins_over_kanji(self):
        assert detect_text_script("毎日をもっと心地よく") == "cjk_jp"

    def test_korean(self):
        assert detect_text_script("지금 구매하기") == "hangul"

    def test_arabic(self):
        assert detect_text_script("تسوق الآن") == "arabic"

    def test_chinese(self):
        assert detect_text_script("品质看得见") == "cjk"

    def test_latin_and_empty(self):
        assert detect_text_script("Shop Now") == "latin"
        assert detect_text_script("") == "latin"


class TestLocalizedCopy:
    def test_fallback_copy_covers_all_requested_markets(self, monkeypatch):
        # 清空 key，强制走离线模板回退
        for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"):
            monkeypatch.delenv(var, raising=False)
        result = generate_localized_copy(PROFILE, ["us", "jp", "de", "sa", "kr"])
        assert result["source"] == "template_fallback"
        assert set(result["markets"]) == {"us", "jp", "de", "sa", "kr"}
        for entry in result["markets"].values():
            assert entry["headline"]
            assert entry["cta"]
            assert entry["selling_points"]

    def test_rtl_flag_and_metadata(self, monkeypatch):
        for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"):
            monkeypatch.delenv(var, raising=False)
        result = generate_localized_copy(PROFILE, ["sa", "us"])
        assert result["markets"]["sa"]["rtl"] is True
        assert result["markets"]["us"]["rtl"] is False
        assert result["markets"]["us"]["currency"] == "$"
        assert result["markets"]["sa"]["recommended_platforms"]

    def test_unknown_market_skipped(self, monkeypatch):
        for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"):
            monkeypatch.delenv(var, raising=False)
        result = generate_localized_copy(PROFILE, ["us", "atlantis"])
        assert set(result["markets"]) == {"us"}

    def test_output_file_written(self, tmp_path, monkeypatch):
        for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"):
            monkeypatch.delenv(var, raising=False)
        out = str(tmp_path / "copy.json")
        generate_localized_copy(PROFILE, ["us"], out)
        with open(out, encoding="utf-8") as f:
            data = json.load(f)
        assert "us" in data["markets"]

    def test_every_market_lang_has_fallback_template(self):
        for market in MARKETS.values():
            assert market["lang_code"] in _FALLBACK_COPY or market["lang_code"] == "en"


class TestFontDetection:
    def test_returns_path_or_none(self):
        for script in ("latin", "cjk", "cjk_jp", "hangul", "arabic"):
            font = get_font_for_script(script)
            assert font is None or os.path.exists(font)


# ============================================================
# region_scenes
# ============================================================

class TestRegionScenes:
    def test_resolve_region_from_market(self):
        assert resolve_region("us") == "na"
        assert resolve_region("sa") == "me"
        assert resolve_region("jp") == "jp"
        assert resolve_region("eu") == "eu"
        assert resolve_region("unknown") == ""

    def test_apply_region_style_is_pure(self):
        scene = {"scene_id": "s1", "prompt": "A scene.", "negative_prompt": "blurry"}
        styled = apply_region_style(scene, "jp")
        assert "wabi-sabi" in styled["prompt"]
        assert styled["region"] == "jp"
        assert scene["prompt"] == "A scene."  # 原对象不被改动

    def test_apply_region_style_idempotent_suffix(self):
        scene = {"scene_id": "s1", "prompt": "A scene."}
        once = apply_region_style(scene, "kr")
        twice = apply_region_style(once, "kr")
        assert once["prompt"] == twice["prompt"]

    def test_middle_east_adds_avoid_terms(self):
        scene = {"scene_id": "s1", "prompt": "A scene.", "negative_prompt": "blurry"}
        styled = apply_region_style(scene, "sa")
        assert "immodest" in styled["negative_prompt"]

    def test_visual_prompt_field_supported(self):
        scene = {"scene_id": "s1", "visual_prompt": "A scene."}
        styled = apply_region_style(scene, "eu")
        assert "European market" in styled["visual_prompt"]
        assert "prompt" not in styled

    def test_localize_plan_inserts_festival_first(self):
        scenes = [{"scene_id": "s1", "prompt": "A scene."}]
        plan = localize_scene_plan(scenes, "us", "christmas")
        assert plan[0]["scene_id"] == "festival_christmas"
        assert len(plan) == 2

    def test_festival_templates_have_required_fields(self):
        for fest in FESTIVAL_SCENES.values():
            for field in ("scene_id", "prompt", "negative_prompt", "months", "regions"):
                assert fest.get(field), f"{fest['scene_id']} 缺 {field}"
            assert "{{product_name}}" in fest["prompt"]

    def test_festival_regions_are_valid(self):
        for fest in FESTIVAL_SCENES.values():
            for region in fest["regions"]:
                assert region in REGION_PACKS


class TestMarketingCalendar:
    def test_us_summer(self):
        hits = upcoming_festivals("us", 60, datetime.date(2026, 7, 2))
        names = [h["festival"] for h in hits]
        assert "prime_day" in names
        assert "summer_sale" in names
        assert "ramadan" not in names

    def test_middle_east_ramadan(self):
        hits = upcoming_festivals("sa", 90, datetime.date(2026, 2, 1))
        assert any(h["festival"] == "ramadan" for h in hits)

    def test_year_wraparound(self):
        hits = upcoming_festivals("us", 90, datetime.date(2026, 11, 15))
        names = [h["festival"] for h in hits]
        assert "black_friday" in names
        assert "christmas" in names
        assert "valentines" in names  # 跨年后的 1-2 月


# ============================================================
# compliance_checker（规则完整性）
# ============================================================

class TestComplianceRules:
    def test_new_platforms_have_rules(self):
        from compliance_checker import COMPLIANCE_RULES
        for platform in ("amazon_main", "walmart", "ebay", "tiktok_shop",
                         "temu", "shein", "coupang", "mercado_libre"):
            assert platform in COMPLIANCE_RULES

    def test_white_bg_platforms_define_threshold(self):
        from compliance_checker import COMPLIANCE_RULES
        for name, rule in COMPLIANCE_RULES.items():
            if rule.get("white_bg"):
                assert 0 < rule["white_bg_min_ratio"] <= 1, name

    def test_white_image_passes_amazon(self, tmp_path):
        PIL = pytest.importorskip("PIL")
        from PIL import Image, ImageDraw
        from compliance_checker import check_image_compliance

        img = Image.new("RGB", (1200, 1200), (255, 255, 255))
        draw = ImageDraw.Draw(img)
        # 中央画一个大产品色块（占比 >75%）
        draw.rectangle((90, 90, 1110, 1110), fill=(120, 60, 30))
        path = str(tmp_path / "main.jpg")
        img.save(path, "JPEG")

        result = check_image_compliance(path, "amazon_main")
        assert result["passed"], result["issues"]

    def test_colored_background_fails_amazon(self, tmp_path):
        pytest.importorskip("PIL")
        from PIL import Image
        from compliance_checker import check_image_compliance

        img = Image.new("RGB", (1200, 1200), (30, 90, 160))
        path = str(tmp_path / "blue.jpg")
        img.save(path, "JPEG")

        result = check_image_compliance(path, "amazon_main")
        assert not result["passed"]
        assert any("背景不够白" in issue for issue in result["issues"])


# ============================================================
# layout_engine A+ 模板
# ============================================================

class TestAplusTemplates:
    APLUS = ("aplus_banner", "aplus_callouts", "aplus_specs", "aplus_dimensions")

    def test_templates_registered(self):
        from layout_engine import LAYOUT_TEMPLATES
        for name in self.APLUS:
            assert name in LAYOUT_TEMPLATES

    def test_render_all_aplus_templates(self, tmp_path):
        pytest.importorskip("PIL")
        from PIL import Image
        from layout_engine import apply_layout

        img = Image.new("RGB", (800, 800), (200, 200, 200))
        variables = {
            "product_name": "Ceramic Mug",
            "sub_text": "Premium matte glaze",
            "badge_text": "NEW",
            "selling_point_1": "Handmade",
            "selling_point_2": "350ml",
            "selling_point_3": "Dishwasher safe",
            "width_text": "9.5 cm",
            "height_text": "11 cm",
            "specs": [["Material", "Ceramic"], ["Capacity", "350 ml"]],
        }
        for name in self.APLUS:
            result = apply_layout(img, name, variables)
            assert result.size[0] == 1940, name

    def test_font_detection_by_variables(self):
        from layout_engine import detect_font_for_variables
        font = detect_font_for_variables({"product_name": "陶瓷杯"})
        assert font is None or os.path.exists(font)
