# -*- coding: utf-8 -*-
"""18K english_text TTL text — english_text。"""

import os
import sys
import tempfile
import time
import unittest

from PIL import Image

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.services import hd_export, housekeeping  # noqa: E402


class TestHdExport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.src = os.path.join(self.tmp, "src.jpg")
        Image.new("RGB", (300, 200), (120, 90, 200)).save(self.src, "JPEG")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_upscale_to_target_long_edge(self):
        dst = os.path.join(self.tmp, "hd", "out.jpg")
        info = hd_export.export_hd(self.src, dst, target_long_edge=2048)
        self.assertTrue(os.path.exists(dst))
        self.assertEqual(max(info["width"], info["height"]), 2048)
        # english_text 3:2
        self.assertAlmostEqual(info["width"] / info["height"], 300 / 200, places=2)
        with Image.open(dst) as im:
            self.assertEqual(max(im.size), 2048)

    def test_target_capped_by_env(self):
        dst = os.path.join(self.tmp, "out2.jpg")
        os.environ["HD_EXPORT_MAX_EDGE"] = "2500"
        try:
            info = hd_export.export_hd(self.src, dst, target_long_edge=999999)
            self.assertLessEqual(max(info["width"], info["height"]), 2500)
        finally:
            os.environ.pop("HD_EXPORT_MAX_EDGE", None)

    def test_missing_source_raises(self):
        with self.assertRaises(FileNotFoundError):
            hd_export.export_hd(os.path.join(self.tmp, "nope.jpg"),
                                os.path.join(self.tmp, "o.jpg"))

    def test_tier_targets(self):
        self.assertEqual(hd_export.tier_target("1k"), 1024)
        self.assertEqual(hd_export.tier_target("2K"), 2048)
        self.assertEqual(hd_export.tier_target("3k"), 3072)
        self.assertEqual(hd_export.tier_target("4k"), 4096)
        self.assertEqual(hd_export.tier_target("8k"), 8192)
        self.assertEqual(hd_export.tier_target("18k"), 18000)
        self.assertIsNone(hd_export.tier_target("42k"))
        self.assertIsNone(hd_export.tier_target(""))

    def test_downscale_when_source_exceeds_tier(self):
        """english_text（1K english_text）。"""
        big = os.path.join(self.tmp, "big.jpg")
        Image.new("RGB", (3000, 2000), (10, 60, 160)).save(big, "JPEG")
        dst = os.path.join(self.tmp, "hd", "small.jpg")
        info = hd_export.export_hd(big, dst, target_long_edge=1024)
        self.assertEqual(max(info["width"], info["height"]), 1024)
        self.assertEqual(info["upscaler"], "none")

    def test_upscaler_reported(self):
        dst = os.path.join(self.tmp, "hd", "up.jpg")
        info = hd_export.export_hd(self.src, dst, target_long_edge=1024)
        # textconfiguration REALESRGAN_EXE text Lanczos
        self.assertIn(info["upscaler"], ("lanczos", "realesrgan"))


class TestHousekeeping(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp()
        self.sessions_dir = os.path.join(self.base, "sessions")
        self.output_dir = os.path.join(self.base, "outputs")
        os.makedirs(self.sessions_dir)
        os.makedirs(self.output_dir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.base, ignore_errors=True)

    def _make_session(self, name: str, age_days: float):
        for base in (self.sessions_dir, self.output_dir):
            d = os.path.join(base, name)
            os.makedirs(d, exist_ok=True)
            f = os.path.join(d, "record.json")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("{}")
            old = time.time() - age_days * 86400
            os.utime(f, (old, old))
            os.utime(d, (old, old))

    def test_expired_removed_fresh_kept(self):
        self._make_session("old-one", age_days=30)
        self._make_session("fresh-one", age_days=1)
        result = housekeeping.cleanup_expired(
            self.sessions_dir, self.output_dir, days=14)
        removed_names = {os.path.basename(p) for p in result["removed"]}
        self.assertEqual(removed_names, {"old-one"})
        self.assertTrue(os.path.isdir(os.path.join(self.sessions_dir, "fresh-one")))
        self.assertFalse(os.path.isdir(os.path.join(self.sessions_dir, "old-one")))

    def test_active_session_never_removed(self):
        self._make_session("active-old", age_days=60)
        result = housekeeping.cleanup_expired(
            self.sessions_dir, self.output_dir,
            active_sids=["active-old"], days=14)
        self.assertEqual(result["removed"], [])
        self.assertTrue(os.path.isdir(os.path.join(self.sessions_dir, "active-old")))

    def test_ttl_zero_disables(self):
        self._make_session("old-one", age_days=99)
        result = housekeeping.cleanup_expired(
            self.sessions_dir, self.output_dir, days=0)
        self.assertTrue(result.get("disabled"))
        self.assertTrue(os.path.isdir(os.path.join(self.sessions_dir, "old-one")))


if __name__ == "__main__":
    unittest.main()
