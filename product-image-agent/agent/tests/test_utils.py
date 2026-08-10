#!/usr/bin/env python3
"""
english_text — english_text
"""
import os
import sys
import unittest

# text agent english_text
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from common.utils import (
    guess_mime, parse_json_response, hex_to_rgb,
    stable_unique, get_api_key, normalize_platforms,
    resolve_analysis_engine, resolve_image_engine, get_image_api_key,
    resolve_openai_api_key, resolve_image_openai_api_key,
    get_openai_vision_model, model_supports_vision,
    openai_vision_available,
    get_openai_image_api_base, get_openai_image_model,
    CROSS_BORDER_PLATFORMS, friendly_image_error_message,
    get_gemini_image_model, gemini_image_generate_url,
    list_configured_image_engines, image_engine_fallback_order,
    format_subprocess_error, friendly_error_message,
    raise_for_provider_error, is_terminal_image_provider_error,
)


class TestUtils(unittest.TestCase):

    def test_guess_mime(self):
        """text MIME english_text"""
        self.assertEqual(guess_mime("test.jpg"), "image/jpeg")
        self.assertEqual(guess_mime("test.JPG"), "image/jpeg")
        self.assertEqual(guess_mime("test.png"), "image/png")
        self.assertEqual(guess_mime("test.webp"), "image/webp")
        self.assertEqual(guess_mime("test.gif"), "image/gif")
        self.assertEqual(guess_mime("test.unknown"), "image/jpeg")
        self.assertEqual(guess_mime(""), "image/jpeg")

    def test_parse_json_response(self):
        """text LLM responsetext"""
        # text JSON
        r1 = parse_json_response('{"a": 1, "b": 2}')
        self.assertEqual(r1, {"a": 1, "b": 2})

        # ```json text
        r2 = parse_json_response('```json\n{"x": "y"}\n```')
        self.assertEqual(r2, {"x": "y"})

        # ``` text
        r3 = parse_json_response('```\n{"k": [1,2,3]}\n```')
        self.assertEqual(r3, {"k": [1, 2, 3]})

        # textyesenglish_text
        r4 = parse_json_response('textyestext：\n```json\n{"name": "test"}\n```\ntext')
        self.assertEqual(r4, {"name": "test"})

        # English
        r5 = parse_json_response('{"text": "text"}')
        self.assertEqual(r5, {"text": "text"})

        # failedenglish_text
        with self.assertRaises(ValueError):
            parse_json_response("english_textyes JSON")

    def test_hex_to_rgb(self):
        """text hex→rgb text"""
        self.assertEqual(hex_to_rgb("#FF0000"), (255, 0, 0))
        self.assertEqual(hex_to_rgb("00FF00"), (0, 255, 0))
        self.assertEqual(hex_to_rgb("#0000FF"), (0, 0, 255))
        self.assertEqual(hex_to_rgb("#8B4513"), (139, 69, 19))

    def test_stable_unique(self):
        """english_text"""
        self.assertEqual(stable_unique([1, 2, 2, 3, 1, 4]), [1, 2, 3, 4])
        self.assertEqual(stable_unique([]), [])
        self.assertEqual(stable_unique(["a", "b", "a"]), ["a", "b"])

    def test_normalize_platforms(self):
        """textplatformenglish_text"""
        self.assertEqual(
            normalize_platforms("text, amazon, english_text"),
            ["taobao_main", "amazon_main", "xiaohongshu"],
        )
        self.assertEqual(normalize_platforms(["taobao", "text"]), ["taobao_main", "jd_main"])

    def test_normalize_platforms_cross_border(self):
        self.assertEqual(normalize_platforms("alltextplatform"), list(CROSS_BORDER_PLATFORMS))
        self.assertEqual(normalize_platforms("cross-border all"), list(CROSS_BORDER_PLATFORMS))
        self.assertEqual(normalize_platforms("shopify, lazada, etsy"), ["shopify", "lazada", "etsy"])
        self.assertEqual(normalize_platforms("english_text"), ["alibaba"])

    def test_resolve_image_engine_falls_back_openai(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in (
                "GEMINI_API_KEY", "OPENAI_API_KEY", "OPENAI_API_KEY_PREMIUM",
                "OPENAI_IMAGE_API_KEY", "IMAGE_API_KEY", "MINIMAX_API_KEY", "IMAGE_ENGINE", "LLM_MODEL",
            )
        }
        try:
            os.environ["OPENAI_API_KEY"] = "sk-test"
            self.assertEqual(resolve_image_engine(), "dalle")
            self.assertEqual(get_image_api_key("dalle"), "sk-test")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_image_key_skips_premium_llm_routing(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in (
                "OPENAI_API_KEY", "OPENAI_API_KEY_PREMIUM",
                "OPENAI_IMAGE_API_KEY", "IMAGE_API_KEY", "LLM_MODEL",
            )
        }
        try:
            os.environ["OPENAI_API_KEY"] = "sk-image"
            os.environ["OPENAI_API_KEY_PREMIUM"] = "sk-premium"
            os.environ["LLM_MODEL"] = "gpt-5.5"
            self.assertEqual(resolve_openai_api_key(), "sk-premium")
            self.assertEqual(resolve_image_openai_api_key(), "sk-image")
            self.assertEqual(get_image_api_key("dalle"), "sk-image")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_image_key_prefers_openai_image_api_key(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("OPENAI_API_KEY", "OPENAI_IMAGE_API_KEY", "IMAGE_API_KEY")
        }
        try:
            os.environ["OPENAI_API_KEY"] = "sk-default"
            os.environ["OPENAI_IMAGE_API_KEY"] = "sk-dedicated"
            self.assertEqual(resolve_image_openai_api_key(), "sk-dedicated")
            self.assertEqual(get_image_api_key("dalle"), "sk-dedicated")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_image_provider_variables_take_precedence_over_legacy_openai_variables(self):
        keys = (
            "IMAGE_API_KEY", "OPENAI_IMAGE_API_KEY", "OPENAI_API_KEY",
            "IMAGE_API_BASE_URL", "OPENAI_API_BASE",
            "IMAGE_MODEL", "OPENAI_IMAGE_MODEL",
        )
        saved = {key: os.environ.pop(key, None) for key in keys}
        try:
            os.environ["IMAGE_API_KEY"] = "sk-image-provider"
            os.environ["OPENAI_IMAGE_API_KEY"] = "sk-legacy-image"
            os.environ["OPENAI_API_KEY"] = "sk-legacy-default"
            os.environ["IMAGE_API_BASE_URL"] = "https://image-provider.example/v1/"
            os.environ["OPENAI_API_BASE"] = "https://legacy-provider.example/v1"
            os.environ["IMAGE_MODEL"] = "gpt-image-current"
            os.environ["OPENAI_IMAGE_MODEL"] = "gpt-image-legacy"

            self.assertEqual(resolve_image_openai_api_key(), "sk-image-provider")
            self.assertEqual(get_openai_image_api_base(), "https://image-provider.example/v1")
            self.assertEqual(get_openai_image_model(), "gpt-image-current")

            os.environ.pop("IMAGE_API_KEY")
            os.environ.pop("IMAGE_API_BASE_URL")
            os.environ.pop("IMAGE_MODEL")
            self.assertEqual(resolve_image_openai_api_key(), "sk-legacy-image")
            self.assertEqual(get_openai_image_api_base(), "https://legacy-provider.example/v1")
            self.assertEqual(get_openai_image_model(), "gpt-image-legacy")
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_resolve_image_engine_prefers_openai_over_gemini(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("GEMINI_API_KEY", "OPENAI_API_KEY", "IMAGE_API_KEY", "IMAGE_ENGINE")
        }
        try:
            os.environ["GEMINI_API_KEY"] = "g-test"
            os.environ["OPENAI_API_KEY"] = "sk-test"
            self.assertEqual(resolve_image_engine(), "dalle")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_friendly_image_error_message(self):
        msg = friendly_image_error_message("GEMINI_API_KEY not set", "gemini")
        self.assertIn("text API Key", msg)

    def test_friendly_image_error_model_not_found(self):
        msg = friendly_image_error_message(
            '503 {"error":{"code":"model_not_found","message":"No available channel for model gpt-image-2"}}',
            "dalle",
        )
        self.assertIn("OPENAI_API_BASE", msg)
        self.assertNotIn("GEMINI_API_KEY", msg)

    def test_friendly_image_error_quota_exhausted_has_stable_code(self):
        msg = friendly_image_error_message(
            'OpenAI image API 403 [insufficient_user_quota]',
            "dalle",
        )
        self.assertIn("IMAGE_PROVIDER_QUOTA_EXHAUSTED", msg)
        self.assertIn("english_text", msg)

    def test_provider_quota_error_preserves_code_without_account_metadata(self):
        class QuotaResponse:
            status_code = 403

            def json(self):
                return {
                    "error": {
                        "code": "insufficient_user_quota",
                        "message": "balance -0.09, request id private-id",
                    }
                }

            def raise_for_status(self):
                raise AssertionError("quota response should be classified first")

        with self.assertRaises(RuntimeError) as ctx:
            raise_for_provider_error(QuotaResponse(), "OpenAI")

        message = str(ctx.exception)
        self.assertIn("MODEL_PROVIDER_QUOTA_EXHAUSTED", message)
        self.assertIn("insufficient_user_quota", message)
        self.assertNotIn("private-id", message)
        self.assertNotIn("-0.09", message)

    def test_friendly_errors_preserve_fallback_exhausted_codes(self):
        model_message = friendly_error_message(
            "[MODEL_PROVIDER_FALLBACK_EXHAUSTED] primary quota exhausted"
        )
        image_message = friendly_image_error_message(
            "[IMAGE_PROVIDER_FALLBACK_EXHAUSTED] primary quota exhausted",
            "dalle",
        )
        self.assertIn("MODEL_PROVIDER_FALLBACK_EXHAUSTED", model_message)
        self.assertIn("IMAGE_PROVIDER_FALLBACK_EXHAUSTED", image_message)

        generic_image_message = friendly_error_message(
            "[IMAGE_PROVIDER_FALLBACK_EXHAUSTED] primary quota exhausted"
        )
        self.assertIn("IMAGE_PROVIDER_FALLBACK_EXHAUSTED", generic_image_message)
        self.assertTrue(is_terminal_image_provider_error(generic_image_message))

    def test_get_gemini_image_model_default(self):
        saved = os.environ.pop("GEMINI_IMAGE_MODEL", None)
        try:
            self.assertEqual(get_gemini_image_model(), "gemini-2.5-flash-image")
            self.assertIn("gemini-2.5-flash-image", gemini_image_generate_url())
        finally:
            if saved is not None:
                os.environ["GEMINI_IMAGE_MODEL"] = saved

    def test_get_gemini_image_model_aliases_preview(self):
        saved = os.environ.get("GEMINI_IMAGE_MODEL")
        os.environ["GEMINI_IMAGE_MODEL"] = "gemini-3-pro-image-preview"
        try:
            self.assertEqual(get_gemini_image_model(), "gemini-3-pro-image")
        finally:
            if saved is None:
                os.environ.pop("GEMINI_IMAGE_MODEL", None)
            else:
                os.environ["GEMINI_IMAGE_MODEL"] = saved

    def test_image_engine_fallback_order(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("GEMINI_API_KEY", "OPENAI_API_KEY", "IMAGE_API_KEY", "MINIMAX_API_KEY")
        }
        try:
            os.environ["OPENAI_API_KEY"] = "sk-test"
            os.environ["GEMINI_API_KEY"] = "g-test"
            order = image_engine_fallback_order("dalle")
            self.assertEqual(order[0], "dalle")
            self.assertNotIn("gemini", order)
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_get_api_key_fallback(self):
        """text API Key text（english_text）"""
        # textyesenglish_text
        os.environ.pop("GEMINI_API_KEY", None)
        self.assertEqual(get_api_key("gemini"), "")

    def test_resolve_analysis_engine_prefers_openai(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("GEMINI_API_KEY", "OPENAI_API_KEY", "MINIMAX_API_KEY",
                      "LLM_MODEL", "VISION_MODEL", "VISION_API_KEY")
        }
        try:
            os.environ["OPENAI_API_KEY"] = "sk-test"
            os.environ["LLM_MODEL"] = "gpt-4o"
            self.assertEqual(resolve_analysis_engine(), "openai")
            self.assertEqual(resolve_analysis_engine("gemini"), "openai")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_deepseek_chat_is_not_used_for_vision(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("GEMINI_API_KEY", "OPENAI_API_KEY", "MINIMAX_API_KEY",
                      "LLM_MODEL", "VISION_MODEL", "VISION_API_KEY")
        }
        try:
            os.environ["OPENAI_API_KEY"] = "sk-text"
            os.environ["LLM_MODEL"] = "deepseek-chat"
            os.environ["GEMINI_API_KEY"] = "g-test"
            self.assertFalse(model_supports_vision("deepseek-chat"))
            self.assertFalse(openai_vision_available())
            self.assertEqual(resolve_analysis_engine(), "gemini")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_dedicated_vision_model_allows_text_only_chat_provider(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("OPENAI_API_KEY", "LLM_MODEL", "VISION_MODEL",
                      "VISION_API_KEY")
        }
        try:
            os.environ["LLM_MODEL"] = "deepseek-chat"
            os.environ["VISION_MODEL"] = "gpt-4o"
            os.environ["VISION_API_KEY"] = "sk-vision"
            self.assertEqual(get_openai_vision_model(), "gpt-4o")
            self.assertTrue(openai_vision_available())
            self.assertEqual(resolve_analysis_engine(), "openai")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)

    def test_format_subprocess_error_strips_traceback(self):
        stderr = (
            "Traceback (most recent call last):\n"
            "  File \"analyze_product.py\", line 489, in main\n"
            "ValueError: API Key not configured\n"
        )
        msg = format_subprocess_error(stderr=stderr)
        self.assertIn("API Key", msg)
        self.assertNotIn("Traceback", msg)

    def test_friendly_error_message_api_key(self):
        msg = friendly_error_message("textfailed: API Key not configured")
        self.assertIn("textconfiguration API Key", msg)

    def test_friendly_error_message_timeout(self):
        from common.utils import ANALYZE_API_TIMEOUT_MESSAGE
        raw = "HTTPSConnectionPool(host='jojocode.com', port=443): Read timed out. (read timeout=60)"
        msg = friendly_error_message(raw)
        self.assertEqual(msg, ANALYZE_API_TIMEOUT_MESSAGE)

    def test_get_analyze_api_timeout_default(self):
        from common.utils import get_analyze_api_timeout, ANALYZE_API_TIMEOUT_DEFAULT
        saved = os.environ.pop("ANALYZE_API_TIMEOUT", None)
        try:
            self.assertEqual(get_analyze_api_timeout(), ANALYZE_API_TIMEOUT_DEFAULT)
        finally:
            if saved is not None:
                os.environ["ANALYZE_API_TIMEOUT"] = saved

    def test_resolve_analysis_engine_analyze_engine_env(self):
        saved = {
            k: os.environ.pop(k, None)
            for k in ("GEMINI_API_KEY", "OPENAI_API_KEY", "ANALYZE_ENGINE")
        }
        try:
            os.environ["GEMINI_API_KEY"] = "g-test"
            os.environ["OPENAI_API_KEY"] = "sk-test"
            os.environ["ANALYZE_ENGINE"] = "gemini"
            self.assertEqual(resolve_analysis_engine(), "gemini")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)


if __name__ == "__main__":
    unittest.main()
