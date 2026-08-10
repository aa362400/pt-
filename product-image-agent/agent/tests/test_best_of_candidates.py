# -*- coding: utf-8 -*-
"""textsceneenglish_text — sceneenglish_text。"""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "scripts"))

from generate_batch import (  # noqa: E402
    _expand_candidate_scenes, _finalize_candidate_groups,
)


def _make_img(path, color):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    Image.new("RGB", (64, 64), color).save(path, "JPEG")


class TestExpandCandidates(unittest.TestCase):
    def test_no_candidates_passthrough(self):
        scenes = [{"scene_id": "a", "prompt": "p"}]
        expanded, groups = _expand_candidate_scenes(scenes)
        self.assertEqual(len(expanded), 1)
        self.assertEqual(groups, {})

    def test_expand_two_candidates(self):
        scenes = [{"scene_id": "hero", "prompt": "p", "candidates": 2},
                  {"scene_id": "b", "prompt": "p"}]
        expanded, groups = _expand_candidate_scenes(scenes)
        ids = [s["scene_id"] for s in expanded]
        self.assertEqual(ids, ["hero", "hero__cand1", "b"])
        self.assertEqual(groups, {"hero": ["hero__cand1"]})

    def test_candidates_capped_at_three(self):
        scenes = [{"scene_id": "hero", "prompt": "p", "candidates": 9}]
        expanded, _ = _expand_candidate_scenes(scenes)
        self.assertEqual(len(expanded), 3)  # text + text 2 english_text


class TestFinalizeCandidates(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def _results(self):
        main = os.path.join(self.out, "hero.jpg")
        alt = os.path.join(self.out, "hero__cand1.jpg")
        _make_img(main, (200, 40, 40))   # text：text
        _make_img(alt, (40, 200, 40))    # text：text
        return [
            {"scene_id": "hero", "success": True, "output_path": main},
            {"scene_id": "hero__cand1", "success": True, "output_path": alt},
        ], main, alt

    def test_winner_alt_promoted(self):
        """english_text：filetext，textfileenglish_text。"""
        results, main, alt = self._results()
        qa = {
            "available": True,
            "per_image": [
                {"file": "hero.jpg", "path": main, "identity_score": 40},
                {"file": "hero__cand1.jpg", "path": alt, "identity_score": 90},
            ],
        }
        with patch("identity_qa.check_product_identity", return_value=qa), \
             patch("identity_qa.identity_qa_enabled", return_value=True):
            final = _finalize_candidate_groups(
                results, {"hero": ["hero__cand1"]}, ["ref.jpg"], {}, self.out)
        self.assertEqual(len(final), 1)
        self.assertEqual(final[0]["scene_id"], "hero")
        self.assertTrue(final[0]["success"])
        self.assertTrue(final[0].get("best_of_promoted"))
        # english_textfiletext
        self.assertEqual(Image.open(main).getpixel((5, 5))[1] > 150, True)
        # english_text alts/
        self.assertTrue(os.path.exists(os.path.join(self.out, "alts", "hero_alt1.jpg")))

    def test_main_kept_when_qa_unavailable(self):
        """text QA english_text：english_text，english_text。"""
        results, main, _ = self._results()
        with patch("identity_qa.check_product_identity",
                   return_value={"available": False}), \
             patch("identity_qa.identity_qa_enabled", return_value=True):
            final = _finalize_candidate_groups(
                results, {"hero": ["hero__cand1"]}, ["ref.jpg"], {}, self.out)
        self.assertEqual(len(final), 1)
        self.assertNotIn("best_of_promoted", final[0])
        self.assertEqual(Image.open(main).getpixel((5, 5))[0] > 150, True)  # textyestext

    def test_local_quality_fallback_promotes_alt(self):
        """nonevisual LLM english_textlocalenglish_text：english_text。"""
        main = os.path.join(self.out, "hero.jpg")
        alt = os.path.join(self.out, "hero__cand1.jpg")
        _make_img(main, (8, 8, 8))       # text：english_text（english_text）
        _make_img(alt, (128, 128, 128))  # text：english_text
        results = [
            {"scene_id": "hero", "success": True, "output_path": main},
            {"scene_id": "hero__cand1", "success": True, "output_path": alt},
        ]
        with patch("identity_qa.identity_qa_enabled", return_value=False):
            final = _finalize_candidate_groups(
                results, {"hero": ["hero__cand1"]}, [], {}, self.out)
        self.assertEqual(len(final), 1)
        self.assertTrue(final[0].get("best_of_promoted"))
        with Image.open(main) as img:
            self.assertGreater(img.getpixel((5, 5))[0], 100)  # textfiletextyestext

    def test_alt_promoted_when_main_failed(self):
        """textfailedenglish_textsuccess：english_text，english_textsuccess。"""
        alt = os.path.join(self.out, "hero__cand1.jpg")
        _make_img(alt, (40, 200, 40))
        results = [
            {"scene_id": "hero", "success": False, "output_path": None,
             "error": "boom"},
            {"scene_id": "hero__cand1", "success": True, "output_path": alt},
        ]
        with patch("identity_qa.identity_qa_enabled", return_value=False):
            final = _finalize_candidate_groups(
                results, {"hero": ["hero__cand1"]}, [], {}, self.out)
        self.assertEqual(len(final), 1)
        self.assertTrue(final[0]["success"])
        self.assertTrue(os.path.exists(os.path.join(self.out, "hero.jpg")))


class TestCaptionCopy(unittest.TestCase):
    def test_custom_text_split(self):
        sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))
        from web.services import caption_overlay

        head, sub = caption_overlay.build_copy(
            "Perfect Gift | Handmade with love", {}, {})
        self.assertEqual(head, "Perfect Gift")
        self.assertEqual(sub, "Handmade with love")

    def test_fallback_without_llm(self):
        sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))
        from web.services import caption_overlay

        with patch.dict(os.environ, {"COMMERCE_LLM_PLAN": "0"}):
            head, sub = caption_overlay.build_copy(
                "", {"titleEn": "Hero Shot", "purpose": "english_text"},
                {"selling_points": ["Personalized keepsake"]})
        self.assertEqual(head, "Hero Shot")
        self.assertEqual(sub, "Personalized keepsake")

    def test_render_caption_writes_file(self):
        sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))
        from web.services import caption_overlay

        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "in.jpg")
            dst = os.path.join(tmp, "out", "in_caption.jpg")
            _make_img(src, (120, 120, 200))
            caption_overlay.render_caption(src, dst, "Perfect Gift", "sub line")
            self.assertTrue(os.path.exists(dst))
            with Image.open(dst) as out:
                self.assertEqual(out.size, (64, 64))


if __name__ == "__main__":
    unittest.main()
