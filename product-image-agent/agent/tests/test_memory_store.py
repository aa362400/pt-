# -*- coding: utf-8 -*-
"""english_text v2：english_textfile / english_text / review / text。"""

import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if AGENT_ROOT not in sys.path:
    sys.path.insert(0, AGENT_ROOT)

from common import memory_store  # noqa: E402


class MemoryStoreBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._orig_dir = memory_store.MEMORY_DIR
        memory_store.MEMORY_DIR = self.tmp
        # english_textreview（english_text、text）
        self._env = os.environ.get("MEMORY_REVIEW_LLM")
        os.environ["MEMORY_REVIEW_LLM"] = "0"

    def tearDown(self):
        memory_store.MEMORY_DIR = self._orig_dir
        if self._env is None:
            os.environ.pop("MEMORY_REVIEW_LLM", None)
        else:
            os.environ["MEMORY_REVIEW_LLM"] = self._env
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestClassifyAndReview(MemoryStoreBase):
    def test_classify_routes_by_content(self):
        self.assertEqual(memory_store.classify("textkeywordsenglish_text"), "keyword")
        self.assertEqual(memory_store.classify("english_textrisktext"), "risk")
        self.assertEqual(memory_store.classify("english_textsceneenglish_text"), "style")
        self.assertEqual(memory_store.classify("english_textcategoryenglish_text"), "product")

    def test_rule_review_rejects_noise(self):
        self.assertFalse(memory_store._rule_review("text"))
        self.assertFalse(memory_store._rule_review("text，text！"))
        self.assertTrue(memory_store._rule_review("Etsy english_text 20 text"))

    def test_review_falls_back_to_rules_when_llm_off(self):
        keep, cat = memory_store.review("Amazon english_text，english_text 85%")
        self.assertTrue(keep)
        self.assertIn(cat, memory_store.CATEGORIES)


class TestRememberAndRecall(MemoryStoreBase):
    def test_remember_and_recall_roundtrip(self):
        ok = memory_store.remember("Etsy english_textcategoryenglish_text，english_textsceneenglish_text")
        self.assertTrue(ok)
        hits = memory_store.recall("english_text scenetext")
        self.assertTrue(hits)
        self.assertIn("english_text", hits[0]["text"])

    def test_dedup(self):
        text = "Temu english_text 25% securitytext，english_text 10% text"
        self.assertTrue(memory_store.remember(text))
        self.assertFalse(memory_store.remember(text))  # english_textwrite

    def test_noise_rejected(self):
        self.assertFalse(memory_store.remember("text"))
        self.assertFalse(memory_store.remember(""))

    def test_capacity_truncation(self):
        for i in range(memory_store.MAX_ENTRIES_PER_FILE + 10):
            memory_store.remember(f"english_text{i}text：textcategoryenglish_text",
                                  category="product", skip_review=True)
        path = memory_store._file_path("product")
        entries = memory_store._load_entries(path)
        self.assertLessEqual(len(entries), memory_store.MAX_ENTRIES_PER_FILE)

    def test_recall_empty_query(self):
        self.assertEqual(memory_store.recall(""), [])

    def test_stats(self):
        memory_store.remember("Etsy english_text", category="style",
                              skip_review=True)
        s = memory_store.stats()
        self.assertEqual(s["style"], 1)


class TestExperienceCard(MemoryStoreBase):
    def test_write_card_success(self):
        ok = memory_store.write_card({
            "task": "generate english_text",
            "success": "generate completed，consistency 92，text english_text",
            "next": "english_textcategoryenglish_text",
        })
        self.assertTrue(ok)
        self.assertTrue(memory_store.recall("english_text consistency"))

    def test_write_card_failure_goes_to_risk(self):
        memory_store.write_card({
            "task": "generate english_text",
            "avoid": "generate failed：english_textfailed",
        })
        risk_entries = memory_store._load_entries(
            memory_store._file_path("risk"))
        self.assertTrue(any("english_text" in e for e in risk_entries))

    def test_empty_card(self):
        self.assertFalse(memory_store.write_card({}))


class TestObserverIntegration(MemoryStoreBase):
    def test_post_task_reflect_writes_card(self):
        from agents.observer import ObserverAgent

        ob = ObserverAgent("t-mem")
        ob.state["product_name"] = "english_text"
        with patch("common.memory_store.write_card") as mock_card:
            ob.post_task_reflect(
                {"type": "generate"},
                {"status": "completed", "data": {"consistency_score": 90}},
                {"approved": True, "feedback": ""},
            )
        self.assertTrue(mock_card.called)
        card = mock_card.call_args[0][0]
        self.assertIn("generate", card["task"])
        self.assertIn("success", card)


if __name__ == "__main__":
    unittest.main()
