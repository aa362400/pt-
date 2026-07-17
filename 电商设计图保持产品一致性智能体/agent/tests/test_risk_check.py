# -*- coding: utf-8 -*-
"""P4 风险检测：商标词库 / 敏感词 / 物流风险 / 整体体检报告。"""

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
        self.assertEqual(risk_check.trademark_risk("cute disney pet charm"), "高风险")
        self.assertEqual(risk_check.trademark_risk("Taylor Swift fan gift"), "高风险")

    def test_suspicious_detection(self):
        self.assertEqual(risk_check.trademark_risk("magic kingdom castle decor"), "可疑")

    def test_safe(self):
        self.assertEqual(risk_check.trademark_risk("wooden flower pot"), "安全")
        self.assertEqual(risk_check.trademark_risk(""), "安全")


class TestCheckListing(unittest.TestCase):
    def setUp(self):
        self._mock = os.environ.get("COMMERCE_AGENT_MOCK")
        os.environ["COMMERCE_AGENT_MOCK"] = "1"  # 关 LLM，测规则层

    def tearDown(self):
        if self._mock is None:
            os.environ.pop("COMMERCE_AGENT_MOCK", None)
        else:
            os.environ["COMMERCE_AGENT_MOCK"] = self._mock

    def test_trademark_blocks_listing(self):
        r = risk_check.check_listing(title="Disney Mickey Mouse pet ornament")
        self.assertEqual(r["riskLevel"], "高")
        self.assertIn("disney", r["trademarkHits"])
        self.assertIn("不得上架", r["verdict"])

    def test_sensitive_words_medium(self):
        r = risk_check.check_listing(
            title="best in the world pet charm",
            description="100% effective, guaranteed to cure sadness")
        self.assertEqual(r["riskLevel"], "中")
        self.assertTrue(r["sensitiveHits"])

    def test_logistics_notes_for_acrylic(self):
        r = risk_check.check_listing(
            title="acrylic birth flower suncatcher")
        self.assertTrue(any("易碎" in n for n in r["logisticsNotes"]))

    def test_wood_customs_note(self):
        r = risk_check.check_listing(profile={"product_name": "wooden flower pot",
                                              "materials": "wood"})
        self.assertTrue(any("熏蒸" in n for n in r["logisticsNotes"]))

    def test_high_competition_adds_risk(self):
        r = risk_check.check_listing(title="pet ornament",
                                     competition_level="高")
        self.assertTrue(any("同质化" in x for x in r["risks"]))

    def test_clean_listing_without_external_clearance_is_blocked(self):
        r = risk_check.check_listing(title="handmade linen table runner")
        self.assertEqual(r["riskLevel"], "低")
        self.assertEqual(r["decision"], "BLOCK")
        self.assertFalse(r["publishable"])
        self.assertEqual(r["evidenceStatus"], "MISSING")
        self.assertNotIn("可以上架", r["verdict"])

    def test_tags_are_checked(self):
        r = risk_check.check_listing(title="pet charm",
                                     tags=["pokemon gift", "dog mom"])
        self.assertEqual(r["riskLevel"], "高")


class TestKeywordRiskIntegration(unittest.TestCase):
    def test_biz_tools_uses_word_bank(self):
        from web.services.biz_tools import judge_keyword
        self.assertEqual(judge_keyword("lego style charm")["risk"], "高风险")


if __name__ == "__main__":
    unittest.main()
