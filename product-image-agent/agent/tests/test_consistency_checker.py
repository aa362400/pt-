#!/usr/bin/env python3
"""
english_text — consistencydetectiontext
"""
import os
import sys
import unittest
import tempfile
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scripts.consistency_checker import (
    check_image_quality, extract_dominant_colors,
    color_distance, check_batch_consistency,
)


def create_test_image(color: tuple = (128, 128, 128), size: tuple = (200, 200)) -> str:
    """english_textimage，english_textfiletext"""
    img = Image.new("RGB", size, color)
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    img.save(tmp.name, "JPEG")
    return tmp.name


class TestConsistencyChecker(unittest.TestCase):

    def setUp(self):
        # english_text
        self.gray_path = create_test_image((128, 128, 128))
        self.red_path = create_test_image((180, 50, 50))
        self.blue_path = create_test_image((50, 50, 180))
        self.all_paths = [self.gray_path, self.red_path, self.blue_path]

    def tearDown(self):
        for p in self.all_paths:
            if os.path.exists(p):
                os.unlink(p)

    def test_check_image_quality(self):
        """english_textdetection"""
        result = check_image_quality(self.gray_path)
        self.assertIn("quality_score", result)
        self.assertIn("avg_brightness", result)
        self.assertIn("issues", result)
        self.assertGreaterEqual(result["quality_score"], 0)
        self.assertLessEqual(result["quality_score"], 100)

    def test_extract_dominant_colors(self):
        """english_text"""
        colors = extract_dominant_colors(self.red_path, num_colors=2)
        self.assertGreater(len(colors), 0)
        for c in colors:
            self.assertIn("hex", c)
            self.assertIn("coverage", c)

    def test_color_distance(self):
        """english_text"""
        d1 = color_distance({"rgb": {"r": 128, "g": 128, "b": 128}}, {"rgb": {"r": 130, "g": 130, "b": 130}})
        self.assertLess(d1, 5)  # text
        d2 = color_distance({"rgb": {"r": 255, "g": 0, "b": 0}}, {"rgb": {"r": 0, "g": 0, "b": 255}})
        self.assertGreater(d2, 300)  # text→text（english_text 360）

    def test_check_batch_consistency(self):
        """english_textdetection"""
        result = check_batch_consistency(self.all_paths)
        self.assertEqual(result["total"], 3)
        self.assertIn("consistency_score", result)
        self.assertIn("pass", result)
        self.assertIn("per_image", result)
        self.assertEqual(len(result["per_image"]), 3)

    def test_check_batch_consistency_empty(self):
        """textinputenglish_texterrortext"""
        result = check_batch_consistency([])
        self.assertIn("error", result)

    def test_check_batch_consistency_with_profile(self):
        """english_textdetection"""
        profile = {
            "product_name": "Test Product",
            "colors": {"primary": "#808080", "accents": ["#FF0000"]},
        }
        result = check_batch_consistency(self.all_paths, profile)
        self.assertIn("consistency_score", result)
        # text ai_vision fieldstext（textyes None）
        self.assertIn("ai_vision", result)


if __name__ == "__main__":
    unittest.main()
