#!/usr/bin/env python3
"""上网研究模块测试 — mock API、HTML 解析、意图识别"""
import json
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import common.web_search as web_search
from common.web_search import (
    search_web,
    resolve_search_provider,
    WebSearchError,
    _normalize_result,
)
from common.browse_url import browse_url, _extract_title, _html_to_text, _extract_images
from agents.observer import ObserverAgent
from agents.researcher import ResearcherAgent
from agents.orchestrator import OrchestratorBrain, VALID_INTENTS


class TestWebSearch(unittest.TestCase):

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in (
            "SERPER_API_KEY", "TAVILY_API_KEY", "BING_SEARCH_API_KEY",
        )}

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_normalize_result(self):
        r = _normalize_result({"title": "A", "link": "https://a.com", "snippet": "hello"})
        self.assertEqual(r["url"], "https://a.com")
        self.assertEqual(r["title"], "A")

    def test_no_api_key_raises(self):
        for k in ("SERPER_API_KEY", "TAVILY_API_KEY", "BING_SEARCH_API_KEY"):
            os.environ.pop(k, None)
        with self.assertRaises(WebSearchError):
            search_web("test query")

    def test_resolve_provider_serper_first(self):
        os.environ["SERPER_API_KEY"] = "sk-test"
        os.environ.pop("TAVILY_API_KEY", None)
        provider, key = resolve_search_provider()
        self.assertEqual(provider, "serper")
        self.assertEqual(key, "sk-test")

    @patch("common.web_search._search_serper")
    def test_search_web_serper(self, mock_serper):
        os.environ["SERPER_API_KEY"] = "sk-test"
        os.environ.pop("TAVILY_API_KEY", None)
        os.environ.pop("BING_SEARCH_API_KEY", None)
        mock_serper.return_value = [
            {"title": "Etsy Pencil Case", "url": "https://etsy.com/1", "snippet": "wood", "image_url": None},
        ]
        results = search_web("wooden pencil case etsy", num_results=5)
        self.assertEqual(len(results), 1)
        self.assertIn("etsy.com", results[0]["url"])
        mock_serper.assert_called_once()

    @patch("requests.post")
    def test_serper_shopping_result_preserves_structured_cost_fields(self, mock_post):
        os.environ["SERPER_API_KEY"] = "sk-test"
        os.environ.pop("TAVILY_API_KEY", None)
        os.environ.pop("BING_SEARCH_API_KEY", None)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "shopping": [
                {
                    "title": "Personalized wooden desk organizer",
                    "link": "https://www.etsy.com/listing/123/example",
                    "price": "$34.95",
                    "delivery": "$5.17 shipping",
                    "source": "Etsy",
                    "productId": "shopping-product-123",
                }
            ]
        }
        mock_post.return_value = mock_resp

        results = search_web("personalized wooden desk organizer", num_results=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Personalized wooden desk organizer")
        self.assertEqual(
            results[0]["url"], "https://www.etsy.com/listing/123/example"
        )
        self.assertEqual(results[0]["price"], "$34.95")
        self.assertEqual(results[0]["delivery"], "$5.17 shipping")
        self.assertEqual(results[0]["source"], "Etsy")
        self.assertEqual(results[0]["productId"], "shopping-product-123")

    @patch("requests.post")
    def test_search_shopping_uses_official_serper_endpoint_and_preserves_fields(
        self, mock_post
    ):
        os.environ["SERPER_API_KEY"] = "sk-test"
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "shopping": [
                {
                    "title": "Portable dog water bottle",
                    "link": "https://www.example.com/products/dog-water-bottle",
                    "price": "$18.99",
                    "delivery": "Free delivery",
                    "source": "Example Shop",
                    "productId": "shopping-product-456",
                    "imageUrl": "https://cdn.example.com/dog-water-bottle.jpg",
                }
            ]
        }
        mock_post.return_value = mock_resp

        results = web_search.search_shopping(
            "portable dog water bottle", num_results=7
        )

        mock_post.assert_called_once_with(
            "https://google.serper.dev/shopping",
            headers={"X-API-KEY": "sk-test", "Content-Type": "application/json"},
            json={"q": "portable dog water bottle", "num": 7},
            timeout=30,
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["provider"], "serper")
        self.assertEqual(results[0]["result_type"], "shopping")
        self.assertEqual(results[0]["title"], "Portable dog water bottle")
        self.assertEqual(
            results[0]["url"],
            "https://www.example.com/products/dog-water-bottle",
        )
        self.assertEqual(results[0]["price"], "$18.99")
        self.assertEqual(results[0]["delivery"], "Free delivery")
        self.assertEqual(results[0]["source"], "Example Shop")
        self.assertEqual(results[0]["productId"], "shopping-product-456")
        self.assertEqual(
            results[0]["image_url"],
            "https://cdn.example.com/dog-water-bottle.jpg",
        )

    @patch("requests.post")
    def test_search_shopping_without_serper_key_fails_closed(self, mock_post):
        os.environ.pop("SERPER_API_KEY", None)

        results = web_search.search_shopping("portable dog water bottle")

        self.assertEqual(results, [])
        mock_post.assert_not_called()

    @patch("common.web_search._search_tavily")
    @patch("common.web_search._search_serper")
    def test_fallback_result_records_actual_tavily_provider(
        self, mock_serper, mock_tavily
    ):
        os.environ["SERPER_API_KEY"] = "sk-test"
        os.environ["TAVILY_API_KEY"] = "tv-test"
        os.environ.pop("BING_SEARCH_API_KEY", None)
        mock_serper.side_effect = RuntimeError("serper unavailable")
        mock_tavily.return_value = [
            {
                "title": "Tavily result",
                "url": "https://example.com/tavily-result",
                "snippet": "fallback evidence",
                "image_url": None,
            }
        ]

        results = search_web("fallback provider evidence", num_results=5)

        self.assertEqual(results[0]["provider"], "tavily")
        mock_serper.assert_called_once()
        mock_tavily.assert_called_once()

    @patch("requests.post")
    def test_tavily_api_parse(self, mock_post):
        os.environ.pop("SERPER_API_KEY", None)
        os.environ["TAVILY_API_KEY"] = "tv-test"
        os.environ.pop("BING_SEARCH_API_KEY", None)
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "results": [{"title": "Ref", "url": "https://example.com/r", "content": "nice product"}],
            "images": [],
        }
        mock_post.return_value = mock_resp
        results = search_web("reference product")
        self.assertEqual(results[0]["title"], "Ref")


class TestBrowseUrl(unittest.TestCase):

    def test_extract_title(self):
        html = "<html><head><title>商品页 - 淘宝</title></head><body></body></html>"
        self.assertEqual(_extract_title(html), "商品页 - 淘宝")

    def test_html_to_text(self):
        html = "<html><body><p>Hello</p><script>ignore()</script></body></html>"
        text = _html_to_text(html)
        self.assertIn("Hello", text)
        self.assertNotIn("ignore", text)

    def test_extract_images_with_og(self):
        html = (
            '<meta property="og:image" content="https://cdn.example.com/main.jpg">'
            '<img src="https://cdn.example.com/a.jpg">'
        )
        imgs = _extract_images("https://shop.example.com/p/1", html, "https://cdn.example.com/main.jpg")
        self.assertLessEqual(len(imgs), 3)
        self.assertEqual(imgs[0], "https://cdn.example.com/main.jpg")

    @patch("common.browse_url._fetch_static")
    def test_browse_url_static(self, mock_fetch):
        mock_fetch.return_value = (
            "https://example.com/item",
            '<html><head><title>Test Product</title>'
            '<meta property="og:image" content="https://cdn.example.com/p.jpg">'
            '</head><body><p>Product description here</p></body></html>',
        )
        result = browse_url("https://example.com/item", render_js=False)
        self.assertEqual(result["title"], "Test Product")
        self.assertIsNotNone(result["og_image"])
        self.assertIn("Product description", result["text_snippet"])


class TestResearchIntent(unittest.TestCase):

    def setUp(self):
        self.observer = ObserverAgent()
        self.observer.state["session_id"] = "test_research"

    def test_web_search_intent(self):
        intent = self.observer._understand_regex("帮我搜一下etsy上木质笔袋的参考图")
        self.assertEqual(intent["intent"], "web_search")
        self.assertTrue(intent["extracted"].get("search_query"))

    def test_browse_intent_with_url(self):
        msg = "抓取这个链接 https://www.etsy.com/listing/12345/test"
        intent = self.observer._understand_regex(msg)
        self.assertEqual(intent["intent"], "browse")
        self.assertTrue(intent["extracted"].get("urls"))

    def test_research_intent_mixed(self):
        msg = "搜竞品 https://www.amazon.com/dp/B001 木质笔袋"
        intent = self.observer._understand_regex(msg)
        self.assertEqual(intent["intent"], "research")
        self.assertTrue(intent["extracted"].get("urls"))

    def test_dispatch_web_search(self):
        intent = {
            "intent": "web_search",
            "dispatch_intent": "web_search",
            "extracted": {"search_query": "etsy wooden pencil case"},
            "raw_message": "搜竞品 etsy 木质笔袋",
        }
        task = self.observer.dispatch(intent)
        self.assertIsNotNone(task)
        self.assertEqual(task["type"], "web_search")
        self.assertEqual(task["params"]["query"], "etsy wooden pencil case")

    def test_valid_intents_include_research(self):
        self.assertIn("web_search", VALID_INTENTS)
        self.assertIn("browse", VALID_INTENTS)
        self.assertIn("research", VALID_INTENTS)


class TestResearcherAgent(unittest.TestCase):

    @patch("agents.researcher.search_web")
    @patch("agents.researcher.browse_url")
    @patch("agents.researcher.fetch_product_image")
    def test_research_execute(self, mock_fetch, mock_browse, mock_search):
        mock_search.return_value = [
            {"title": "Competitor", "url": "https://etsy.com/1", "snippet": "wood case"},
        ]
        mock_browse.return_value = {
            "title": "Competitor",
            "text_snippet": "A nice wood case",
            "images": ["https://cdn.example.com/img.jpg"],
            "og_image": "https://cdn.example.com/img.jpg",
            "url": "https://etsy.com/1",
            "render_mode": "requests",
        }
        mock_fetch.return_value = {
            "success": True,
            "local_path": "/tmp/ref.jpg",
            "image_url": "https://cdn.example.com/img.jpg",
        }

        agent = ResearcherAgent("test_researcher")
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            report = agent.execute({
                "task_id": "t1",
                "type": "research",
                "params": {"query": "wood pencil case etsy", "output_dir": tmp},
            })
            self.assertEqual(report["status"], "success")
            data = report["data"]
            self.assertTrue(data.get("search_results"))
            self.assertTrue(data.get("competitors"))
            self.assertTrue(data.get("summary"))


if __name__ == "__main__":
    unittest.main()
