# -*- coding: utf-8 -*-
"""P2 选品雷达：机会评分卡 / 新品池扩展 / 意图与通道。"""

import os
import sys
import unittest
from unittest.mock import patch

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_ROOT = os.path.join(AGENT_ROOT, "web")
for p in (AGENT_ROOT, WEB_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from web.services import opportunity  # noqa: E402


class TestTemplateCard(unittest.TestCase):
    def setUp(self):
        self._mock = os.environ.get("COMMERCE_AGENT_MOCK")
        os.environ["COMMERCE_AGENT_MOCK"] = "1"  # 强制离线模板

    def tearDown(self):
        if self._mock is None:
            os.environ.pop("COMMERCE_AGENT_MOCK", None)
        else:
            os.environ["COMMERCE_AGENT_MOCK"] = self._mock

    def test_template_card_fields_complete(self):
        card = opportunity.analyze_idea("宠物出生花亚克力定制挂件，适合 Etsy 礼物场景")
        for key in ("opportunity_score", "competition_level", "platforms",
                    "risk_notes", "verdict", "source", "idea"):
            self.assertIn(key, card)
        self.assertEqual(card["source"], "template")
        self.assertTrue(0 <= card["opportunity_score"] <= 100)

    def test_custom_gift_scores_higher(self):
        custom = opportunity.analyze_idea("定制姓名礼物挂件")
        plain = opportunity.analyze_idea("普通塑料杯")
        self.assertGreater(custom["opportunity_score"],
                           plain["opportunity_score"])

    def test_complex_customer_request_extracts_product_and_platforms(self):
        card = opportunity.analyze_idea(
            "我是一个高要求跨境卖家客户：请先不要直接出图，先判断这个产品适合 "
            "Etsy 还是 Amazon，并给我 3 张主图方案。产品是木质钢笔礼盒，"
            "目标客群是欧美送礼人群。"
        )
        self.assertEqual(card["product_name"], "木质钢笔礼盒")
        self.assertEqual(card["idea"], "木质钢笔礼盒")
        self.assertEqual(card["platforms"], ["Etsy", "Amazon"])

    def test_question_suffix_is_removed_from_product_name(self):
        card = opportunity.analyze_idea("木质小花盆能不能做？")
        self.assertEqual(card["product_name"], "木质小花盆")

    def test_empty_idea_raises(self):
        with self.assertRaises(ValueError):
            opportunity.analyze_idea("  ")


class TestNormalize(unittest.TestCase):
    def test_normalize_clamps_and_coerces(self):
        card = opportunity._normalize({
            "opportunity_score": "150",
            "competition_level": "超高",
            "platforms": "Etsy, Amazon",
            "risk_notes": None,
            "suggested_price": "19.99",
        })
        self.assertEqual(card["opportunity_score"], 100)
        self.assertEqual(card["competition_level"], "中")
        self.assertEqual(card["platforms"], ["Etsy", "Amazon"])
        self.assertEqual(card["risk_notes"], [])
        self.assertIsNone(card["suggested_price"])
        self.assertEqual(card["pricing_status"], "DATA_INSUFFICIENT")
        self.assertFalse(card["publishable"])


class TestPoolIntegration(unittest.TestCase):
    def test_card_to_pool_item(self):
        item = opportunity.card_to_pool_item({
            "product_name": "Pet Memorial Suncatcher",
            "platforms": ["Etsy", "Amazon Handmade", "Temu"],
            "suggested_price": 18.99,
            "verdict": "可以小批量测试",
            "opportunity_score": 86,
            "competition_level": "中",
            "risk_notes": ["同质化"],
            "gift_scenes": ["宠物纪念"],
            "custom_elements": ["宠物名"],
        })
        self.assertEqual(item["name"], "Pet Memorial Suncatcher")
        self.assertEqual(item["extra"]["opportunityScore"], 86)
        self.assertEqual(item["extra"]["riskLevel"], "中")

    def test_pool_add_with_extra(self):
        import tempfile

        from web.services import product_pool

        with tempfile.TemporaryDirectory() as tmp:
            orig = product_pool.POOL_PATH
            product_pool.POOL_PATH = os.path.join(tmp, "pool.json")
            try:
                item = product_pool.add_item(
                    "测试新品", "Etsy", 19.99,
                    extra={"opportunityScore": 80, "competitionLevel": "低",
                           "riskLevel": "低", "ignored_key": "x"})
                self.assertEqual(item["opportunityScore"], 80)
                self.assertNotIn("ignored_key", item)
                csv_path = product_pool.export_csv(os.path.join(tmp, "pool.csv"))
                with open(csv_path, encoding="utf-8-sig") as f:
                    content = f.read()
                self.assertIn("机会评分", content)
                self.assertIn("80", content)
            finally:
                product_pool.POOL_PATH = orig


class TestIntentRouting(unittest.TestCase):
    def test_orchestrator_valid_intent(self):
        from agents.orchestrator import VALID_INTENTS
        self.assertIn("research_product", VALID_INTENTS)

    def test_observer_regex_detects_research(self):
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-opp")
        result = ob.understand("宠物出生花亚克力挂件能不能做？", has_images=False)
        self.assertEqual(result["intent"], "research_product")

    def test_research_product_not_dispatched(self):
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-opp2")
        self.assertFalse(ob._should_dispatch("research_product"))


if __name__ == "__main__":
    unittest.main()
