# -*- coding: utf-8 -*-
"""P2 product researchtext：english_text / english_text / english_text。"""

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
        os.environ["COMMERCE_AGENT_MOCK"] = "1"  # english_texttemplate

    def tearDown(self):
        if self._mock is None:
            os.environ.pop("COMMERCE_AGENT_MOCK", None)
        else:
            os.environ["COMMERCE_AGENT_MOCK"] = self._mock

    def test_template_card_fields_complete(self):
        card = opportunity.analyze_idea("english_text，text Etsy textscene")
        for key in ("opportunity_score", "competition_level", "platforms",
                    "risk_notes", "verdict", "source", "idea"):
            self.assertIn(key, card)
        self.assertEqual(card["source"], "template")
        self.assertTrue(0 <= card["opportunity_score"] <= 100)

    def test_custom_gift_scores_higher(self):
        custom = opportunity.analyze_idea("english_text")
        plain = opportunity.analyze_idea("english_text")
        self.assertGreater(custom["opportunity_score"],
                           plain["opportunity_score"])

    def test_complex_customer_request_extracts_product_and_platforms(self):
        card = opportunity.analyze_idea(
            "textyesenglish_textcustomer：english_text，english_text "
            "Etsy textyes Amazon，english_text 3 english_textplan。textyesenglish_text，"
            "english_textyesenglish_text。"
        )
        self.assertEqual(card["product_name"], "english_text")
        self.assertEqual(card["idea"], "english_text")
        self.assertEqual(card["platforms"], ["Etsy", "Amazon"])

    def test_question_suffix_is_removed_from_product_name(self):
        card = opportunity.analyze_idea("english_text？")
        self.assertEqual(card["product_name"], "english_text")

    def test_empty_idea_raises(self):
        with self.assertRaises(ValueError):
            opportunity.analyze_idea("  ")


class TestNormalize(unittest.TestCase):
    def test_normalize_clamps_and_coerces(self):
        card = opportunity._normalize({
            "opportunity_score": "150",
            "competition_level": "text",
            "platforms": "Etsy, Amazon",
            "risk_notes": None,
            "suggested_price": "19.99",
        })
        self.assertEqual(card["opportunity_score"], 100)
        self.assertEqual(card["competition_level"], "text")
        self.assertEqual(card["platforms"], ["Etsy", "Amazon"])
        self.assertEqual(card["risk_notes"], [])
        self.assertEqual(card["suggested_price"], 19.99)


class TestPoolIntegration(unittest.TestCase):
    def test_card_to_pool_item(self):
        item = opportunity.card_to_pool_item({
            "product_name": "Pet Memorial Suncatcher",
            "platforms": ["Etsy", "Amazon Handmade", "Temu"],
            "suggested_price": 18.99,
            "verdict": "english_text",
            "opportunity_score": 86,
            "competition_level": "text",
            "risk_notes": ["english_text"],
            "gift_scenes": ["english_text"],
            "custom_elements": ["english_text"],
        })
        self.assertEqual(item["name"], "Pet Memorial Suncatcher")
        self.assertEqual(item["extra"]["opportunityScore"], 86)
        self.assertEqual(item["extra"]["riskLevel"], "text")

    def test_pool_add_with_extra(self):
        import tempfile

        from web.services import product_pool

        with tempfile.TemporaryDirectory() as tmp:
            orig = product_pool.POOL_PATH
            product_pool.POOL_PATH = os.path.join(tmp, "pool.json")
            try:
                item = product_pool.add_item(
                    "english_text", "Etsy", 19.99,
                    extra={"opportunityScore": 80, "competitionLevel": "text",
                           "riskLevel": "text", "ignored_key": "x"})
                self.assertEqual(item["opportunityScore"], 80)
                self.assertNotIn("ignored_key", item)
                csv_path = product_pool.export_csv(os.path.join(tmp, "pool.csv"))
                with open(csv_path, encoding="utf-8-sig") as f:
                    content = f.read()
                self.assertIn("english_text", content)
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
        result = ob.understand("english_text？", has_images=False)
        self.assertEqual(result["intent"], "research_product")

    def test_research_product_not_dispatched(self):
        from agents.observer import ObserverAgent
        ob = ObserverAgent("t-opp2")
        self.assertFalse(ob._should_dispatch("research_product"))


if __name__ == "__main__":
    unittest.main()
