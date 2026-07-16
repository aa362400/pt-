# -*- coding: utf-8 -*-
"""P3 经营工具增强：利润三模式 / 关键词三判断 / Etsy 13 标签。"""

import os
import sys
import unittest
from unittest.mock import patch

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_ROOT = os.path.join(AGENT_ROOT, "web")
for p in (AGENT_ROOT, WEB_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from web.services.biz_tools import (  # noqa: E402
    calc_profit, etsy_tags, judge_keyword, suggest_keywords,
    temu_price_check,
)


class TestProfitModes(unittest.TestCase):
    def test_backward_compatible_default(self):
        """不带新参数的老调用行为不变（无广告/支付/退款扣项）。"""
        r = calc_profit(price=20, cost=5)
        self.assertEqual(r["adCost"], 0)
        self.assertEqual(r["paymentFee"], 0)
        self.assertEqual(r["refundReserve"], 0)
        self.assertGreater(r["profit"], 0)

    def test_conservative_less_profit_than_normal(self):
        con = calc_profit(price=20, cost=5, mode="conservative")
        nor = calc_profit(price=20, cost=5, mode="normal")
        self.assertLess(con["profit"], nor["profit"])
        self.assertEqual(con["modeLabel"], "保守（新店）")

    def test_suggested_price_meets_target_margin(self):
        r = calc_profit(price=20, cost=5, freight=2, mode="normal",
                        target_margin_pct=30)
        self.assertIsNotNone(r["suggestedPrice"])
        # 按建议售价复算，利润率应接近目标值
        check = calc_profit(price=r["suggestedPrice"], cost=5, freight=2,
                            mode="normal")
        self.assertAlmostEqual(check["marginPct"], 30, delta=1.5)

    def test_packaging_and_refund_counted(self):
        base = calc_profit(price=20, cost=5)
        loaded = calc_profit(price=20, cost=5, packaging=1.0, refund_pct=5)
        self.assertAlmostEqual(base["profit"] - loaded["profit"],
                               1.0 + 20 * 0.05, places=2)

    def test_losing_price_verdict(self):
        r = calc_profit(price=6, cost=5, freight=2, mode="conservative")
        self.assertIn("不建议", r["verdict"])

    def test_zero_price_raises(self):
        with self.assertRaises(ValueError):
            calc_profit(price=0, cost=5)


class TestTemuPriceCheck(unittest.TestCase):
    def test_predicts_shadow_checked_price_and_risk(self):
        r = temu_price_check({
            "productName": "Personalized Book Club Kindle Gift Set",
            "declaredPrice": 30,
            "cost": 9,
            "shippingCost": 2,
            "packageLengthCm": 20,
            "packageWidthCm": 14,
            "packageHeightCm": 2,
            "weightGram": 180,
            "blankSimilarityScore": 5,
            "lowPriceCompetitorDensity": 4,
            "titleIndependenceScore": 4,
            "imageIndependenceScore": 4,
            "productIdentityScore": 5,
            "customizationFields": 3,
            "deliveryComponents": ["Kindle case", "reader card", "gift box"],
            "giftReady": True,
            "realDeliveryEvidence": True,
        })

        self.assertEqual(r["platform"], "temu")
        self.assertGreater(r["predictedCheckedPrice"], 0)
        self.assertGreaterEqual(r["retentionRate"], 0.35)
        self.assertLessEqual(r["retentionRate"], 0.88)
        self.assertIn(r["riskLevel"], ("low", "medium", "high"))
        self.assertIn("temu_pricing_rules.md", r["evidence"])

    def test_real_differentiation_beats_plain_white_label(self):
        plain = temu_price_check({
            "productName": "Personalized Kindle Case",
            "declaredPrice": 30,
            "cost": 8,
            "blankSimilarityScore": 5,
            "lowPriceCompetitorDensity": 5,
            "titleIndependenceScore": 1,
            "imageIndependenceScore": 1,
            "productIdentityScore": 1,
            "customizationFields": 1,
            "deliveryComponents": ["Kindle case"],
            "realDeliveryEvidence": False,
        })
        differentiated = temu_price_check({
            "productName": "Midnight Readers Society Kindle Gift Set",
            "declaredPrice": 30,
            "cost": 10,
            "blankSimilarityScore": 5,
            "lowPriceCompetitorDensity": 5,
            "titleIndependenceScore": 5,
            "imageIndependenceScore": 5,
            "productIdentityScore": 5,
            "customizationFields": 4,
            "deliveryComponents": ["Kindle case", "reader card", "gift box"],
            "giftReady": True,
            "realDeliveryEvidence": True,
        })

        self.assertGreater(
            differentiated["retentionRate"], plain["retentionRate"])
        self.assertGreater(
            differentiated["predictedCheckedPrice"],
            plain["predictedCheckedPrice"])


class TestKeywordJudgment(unittest.TestCase):
    def test_intent_detection(self):
        self.assertEqual(judge_keyword("pet loss gift")["intent"], "买礼物")
        self.assertEqual(judge_keyword("dog memorial keepsake")["intent"], "找纪念品")
        self.assertEqual(judge_keyword("window suncatcher decor")["intent"], "找装饰品")
        self.assertEqual(judge_keyword("personalized name charm")["intent"], "找定制")

    def test_conversion_by_length(self):
        self.assertEqual(judge_keyword("custom birth flower suncatcher")["conversion"], "高")
        self.assertEqual(judge_keyword("pet ornament")["conversion"], "中")
        self.assertEqual(judge_keyword("ornament")["conversion"], "低")

    def test_trademark_risk_flagged(self):
        self.assertEqual(judge_keyword("disney pet charm")["risk"], "高风险")
        self.assertEqual(judge_keyword("wooden pet charm")["risk"], "安全")

    def test_suggest_keywords_returns_enriched(self):
        with patch.dict(os.environ, {"COMMERCE_LLM_PLAN": "0"}):
            r = suggest_keywords({"product_name": "walnut coaster"}, "etsy", 8)
        self.assertEqual(len(r["enriched"]), len(r["keywords"]))
        self.assertIn("intent", r["enriched"][0])


class TestEtsyTags(unittest.TestCase):
    PROFILE = {"product_name": "birth flower suncatcher",
               "material": "acrylic", "style": "boho",
               "target_audience": "dog mom"}

    def test_thirteen_tags_max_20_chars(self):
        tags = etsy_tags(self.PROFILE,
                         ["pet memorial", "custom pet gift", "birth flower",
                          "acrylic charm", "window decor"])
        self.assertLessEqual(len(tags), 13)
        self.assertGreaterEqual(len(tags), 5)
        for tag in tags:
            self.assertLessEqual(len(tag), 20, tag)

    def test_no_trademark_tags(self):
        tags = etsy_tags(self.PROFILE, ["disney charm", "pet memorial"])
        self.assertTrue(all("disney" not in t for t in tags))

    def test_dedup(self):
        tags = etsy_tags(self.PROFILE, ["pet memorial", "Pet Memorial"])
        self.assertEqual(len(tags), len(set(tags)))


if __name__ == "__main__":
    unittest.main()
