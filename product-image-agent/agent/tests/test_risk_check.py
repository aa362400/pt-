# -*- coding: utf-8 -*-
"""P4 riskdetection：english_text / english_text / textrisk / english_textreport。"""

import os
import sys
import unittest

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_ROOT = os.path.join(AGENT_ROOT, "web")
for p in (AGENT_ROOT, WEB_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from web.services import risk_check  # noqa: E402


class TestTrademarkRisk(unittest.TestCase):
    def test_word_bank_loaded(self):
        words = risk_check._load_words()
        self.assertGreater(len(words), 100)
        self.assertIn("disney", words)

    def test_high_risk_detection(self):
        self.assertEqual(risk_check.trademark_risk("cute disney pet charm"), "textrisk")
        self.assertEqual(risk_check.trademark_risk("Taylor Swift fan gift"), "textrisk")

    def test_suspicious_detection(self):
        self.assertEqual(risk_check.trademark_risk("magic kingdom castle decor"), "text")

    def test_safe(self):
        self.assertEqual(risk_check.trademark_risk("wooden flower pot"), "security")
        self.assertEqual(risk_check.trademark_risk(""), "security")


class TestCheckListing(unittest.TestCase):
    def setUp(self):
        self._mock = os.environ.get("COMMERCE_AGENT_MOCK")
        os.environ["COMMERCE_AGENT_MOCK"] = "1"  # text LLM，english_text

    def tearDown(self):
        if self._mock is None:
            os.environ.pop("COMMERCE_AGENT_MOCK", None)
        else:
            os.environ["COMMERCE_AGENT_MOCK"] = self._mock

    def test_trademark_blocks_listing(self):
        r = risk_check.check_listing(title="Disney Mickey Mouse pet ornament")
        self.assertEqual(r["riskLevel"], "text")
        self.assertIn("disney", r["trademarkHits"])
        self.assertIn("english_textlisting", r["verdict"])

    def test_sensitive_words_medium(self):
        r = risk_check.check_listing(
            title="best in the world pet charm",
            description="100% effective, guaranteed to cure sadness")
        self.assertEqual(r["riskLevel"], "text")
        self.assertTrue(r["sensitiveHits"])

    def test_logistics_notes_for_acrylic(self):
        r = risk_check.check_listing(
            title="acrylic birth flower suncatcher")
        self.assertTrue(any("text" in n for n in r["logisticsNotes"]))

    def test_wood_customs_note(self):
        r = risk_check.check_listing(profile={"product_name": "wooden flower pot",
                                              "materials": "wood"})
        self.assertTrue(any("text" in n for n in r["logisticsNotes"]))

    def test_high_competition_adds_risk(self):
        r = risk_check.check_listing(title="pet ornament",
                                     competition_level="text")
        self.assertTrue(any("english_text" in x for x in r["risks"]))

    def test_clean_listing_passes(self):
        r = risk_check.check_listing(title="handmade linen table runner")
        self.assertEqual(r["riskLevel"], "text")
        self.assertIn("textlisting", r["verdict"])

    def test_tags_are_checked(self):
        r = risk_check.check_listing(title="pet charm",
                                     tags=["pokemon gift", "dog mom"])
        self.assertEqual(r["riskLevel"], "text")


class TestKeywordRiskIntegration(unittest.TestCase):
    def test_biz_tools_uses_word_bank(self):
        from web.services.biz_tools import judge_keyword
        self.assertEqual(judge_keyword("lego style charm")["risk"], "textrisk")


if __name__ == "__main__":
    unittest.main()
