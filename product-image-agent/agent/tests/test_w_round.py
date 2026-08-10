# -*- coding: utf-8 -*-
"""W english_text：english_text / titletext / english_text MCP / english_text / english_text。"""

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))


class TestInpaint(unittest.TestCase):
    """W1：english_text。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        raw = os.path.join(self.tmp, "raw")
        os.makedirs(raw)
        self.src = os.path.join(raw, "scene_x.jpg")
        Image.new("RGB", (128, 128), (200, 100, 50)).save(self.src, "JPEG")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_region_from_text(self):
        from web.services import inpaint

        self.assertEqual(inpaint.region_from_text("english_text"),
                         (0.0, 0.0, 0.5, 0.5))
        self.assertEqual(inpaint.region_from_text("english_text"),
                         (0.0, 0.6, 1.0, 0.4))
        self.assertIsNone(inpaint.region_from_text("english_text"))

    def test_build_mask_transparent_region(self):
        from web.services import inpaint
        import io

        mask_bytes = inpaint._build_mask((100, 100), (0.0, 0.0, 0.5, 0.5))
        with Image.open(io.BytesIO(mask_bytes)) as mask:
            self.assertEqual(mask.getpixel((10, 10))[3], 0)      # english_text=text
            self.assertEqual(mask.getpixel((90, 90))[3], 255)    # english_text

    def test_mock_mode_backs_up_and_returns(self):
        from web.services import inpaint

        with patch.dict(os.environ, {"COMMERCE_AGENT_MOCK": "1"}):
            result = inpaint.inpaint_image(self.src, "english_text")
        self.assertTrue(result["mocked"])
        self.assertTrue(os.path.exists(result["backup"]))
        self.assertTrue(os.path.exists(self.src))


class TestListingRules(unittest.TestCase):
    """W2：textplatformtitleenglish_text。"""

    def test_check_title_flags_issues(self):
        from web.services import listing_rules

        long_title = "Best Seller " + "Wooden Coaster " * 15
        result = listing_rules.check_title(long_title, "amazon")
        self.assertFalse(result["passed"])
        self.assertTrue(any("text" in i for i in result["issues"]))
        self.assertTrue(any("english_text" in i for i in result["issues"]))
        self.assertTrue(result["mobileTruncated"])

    def test_optimize_title_truncate_fallback(self):
        from web.services import listing_rules

        title = ("Handmade Walnut Wood Coaster Set of 4, Natural Grain, "
                 "Housewarming Gift for New Home, Rustic Table Decor Protection")
        with patch.dict(os.environ, {"COMMERCE_LLM_PLAN": "0"}):
            result = listing_rules.optimize_title(title, "amazon")
        self.assertEqual(result["source"], "truncate")
        self.assertLessEqual(len(result["optimized"]), listing_rules.MOBILE_LIMIT)
        self.assertTrue(result["optimized"].startswith("Handmade Walnut"))

    def test_banned_words_stripped(self):
        from web.services import listing_rules

        with patch.dict(os.environ, {"COMMERCE_LLM_PLAN": "0"}):
            result = listing_rules.optimize_title(
                "Free Shipping Wooden Coaster", "amazon")
        self.assertNotIn("free shipping", result["optimized"].lower())

    def test_rules_override_file(self):
        from web.services import listing_rules

        tmp = tempfile.mkdtemp()
        override_path = os.path.join(tmp, "rules.json")
        with open(override_path, "w", encoding="utf-8") as f:
            json.dump({"amazon": {"max": 66}}, f)
        orig = listing_rules.RULES_OVERRIDE_PATH
        listing_rules.RULES_OVERRIDE_PATH = override_path
        try:
            self.assertEqual(listing_rules.get_rules()["amazon"]["max"], 66)
        finally:
            listing_rules.RULES_OVERRIDE_PATH = orig


class TestBizTools(unittest.TestCase):
    """W3：profitenglish_textkeywordstext。"""

    def test_calc_profit_math(self):
        from web.services.biz_tools import calc_profit

        r = calc_profit(price=30, cost=8, freight=3, platform="amazon",
                        ad_pct=10)
        # 30 - 8 - 3 - 4.5(15%) - 3(10%) = 11.5
        self.assertAlmostEqual(r["profit"], 11.5)
        self.assertAlmostEqual(r["marginPct"], 38.3, places=1)
        self.assertIsNotNone(r["breakevenPrice"])
        # english_text：(8+3)/(1-0.25) ≈ 14.67
        self.assertAlmostEqual(r["breakevenPrice"], 14.67, places=2)

    def test_calc_profit_invalid_price(self):
        from web.services.biz_tools import calc_profit

        with self.assertRaises(ValueError):
            calc_profit(price=0, cost=5)

    def test_keywords_template_fallback(self):
        from web.services.biz_tools import suggest_keywords

        with patch.dict(os.environ, {"COMMERCE_LLM_PLAN": "0"}):
            r = suggest_keywords({"product_name": "walnut coaster",
                                  "material": "walnut"}, "etsy", 10)
        self.assertEqual(r["source"], "template")
        self.assertTrue(r["keywords"])
        self.assertLessEqual(len(r["keywords"]), 10)


class TestMcpServer(unittest.TestCase):
    """W3：MCP Server english_text。"""

    def setUp(self):
        sys.path.insert(0, AGENT_ROOT)
        import mcp_server
        self.mcp = mcp_server

    def test_initialize_and_tools_list(self):
        resp = self.mcp.handle({"jsonrpc": "2.0", "id": 1,
                                "method": "initialize", "params": {}})
        self.assertEqual(resp["result"]["serverInfo"]["name"],
                         "commerce-agent-tools")
        resp = self.mcp.handle({"jsonrpc": "2.0", "id": 2,
                                "method": "tools/list"})
        names = {t["name"] for t in resp["result"]["tools"]}
        self.assertEqual(names, {"calc_profit", "suggest_keywords",
                                 "export_image_pack", "export_listing_csv",
                                 "analyze_opportunity", "check_risk",
                                 "temu_price_check", "temu_pricing_engine",
                                 "ozon_pricing_engine",
                                 "generate_image_prompts",
                                 "amazon_title_optimizer",
                                 "listing_quality_score"})

    def test_tools_call_profit(self):
        resp = self.mcp.handle({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {"name": "calc_profit",
                       "arguments": {"price": 20, "cost": 5}},
        })
        data = json.loads(resp["result"]["content"][0]["text"])
        self.assertGreater(data["profit"], 0)

    def test_tools_call_temu_price_check(self):
        resp = self.mcp.handle({
            "jsonrpc": "2.0", "id": 31, "method": "tools/call",
            "params": {"name": "temu_price_check",
                       "arguments": {
                           "productName": "Book Club Kindle Gift Set",
                           "declaredPrice": 30,
                           "cost": 9,
                           "titleIndependenceScore": 4,
                           "imageIndependenceScore": 4,
                           "deliveryComponents": ["case", "card", "box"],
                           "realDeliveryEvidence": True,
                       }},
        })
        data = json.loads(resp["result"]["content"][0]["text"])
        self.assertEqual(data["platform"], "temu")
        self.assertIn("predictedCheckedPrice", data)

    def test_tools_call_unknown(self):
        resp = self.mcp.handle({
            "jsonrpc": "2.0", "id": 4, "method": "tools/call",
            "params": {"name": "nope", "arguments": {}},
        })
        self.assertTrue(resp["result"].get("isError"))


class TestProductPool(unittest.TestCase):
    """W4：english_text FBA text。"""

    def setUp(self):
        from web.services import product_pool
        self.mod = product_pool
        self.tmp = tempfile.mkdtemp()
        self._orig = product_pool.POOL_PATH
        product_pool.POOL_PATH = os.path.join(self.tmp, "pool.json")

    def tearDown(self):
        self.mod.POOL_PATH = self._orig
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_update_remove(self):
        item = self.mod.add_item("english_text", "home", 25.99, 6.5)
        self.assertEqual(item["status"], "text")
        updated = self.mod.update_item(item["id"], {
            "status": "english_text",
            "fba": {"launchDate": "2026-07-25", "firstBatchUnits": 100},
        })
        self.assertEqual(updated["status"], "english_text")
        self.assertEqual(updated["fba"]["firstBatchUnits"], 100)
        self.mod.remove_item(item["id"])
        self.assertEqual(self.mod.list_pool(), [])

    def test_capacity_limit(self):
        for i in range(self.mod.CAPACITY):
            self.mod.add_item(f"text{i}")
        with self.assertRaises(ValueError):
            self.mod.add_item("text")

    def test_export_csv(self):
        self.mod.add_item("english_text", "home", 19.99, 4.2)
        dst = os.path.join(self.tmp, "pool.csv")
        self.mod.export_csv(dst)
        with open(dst, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn("english_text", content)
        self.assertIn("FBAtextlistingtext", content)


class TestKnowledgeBase(unittest.TestCase):
    """W5：english_text。"""

    def setUp(self):
        from common import knowledge_base
        self.mod = knowledge_base
        self.tmp = tempfile.mkdtemp()
        self._orig = knowledge_base.NOTES_PATH
        knowledge_base.NOTES_PATH = os.path.join(self.tmp, "notes.json")

    def tearDown(self):
        self.mod.NOTES_PATH = self._orig
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_search_platform_rules(self):
        hits = self.mod.search("Amazon english_text", k=3)
        self.assertTrue(hits)
        self.assertTrue(any("Amazon" in h["title"] or "text" in h["text"]
                            for h in hits))

    def test_capture_note_and_search(self):
        note = self.mod.maybe_capture_note("text：textcategoryenglish_text")
        self.assertIsNotNone(note)
        hits = self.mod.search("textcategoryenglish_text", k=3)
        self.assertTrue(any("text" in h["text"] for h in hits))

    def test_non_note_message_ignored(self):
        self.assertIsNone(self.mod.maybe_capture_note("english_text 5 text"))


if __name__ == "__main__":
    unittest.main()
