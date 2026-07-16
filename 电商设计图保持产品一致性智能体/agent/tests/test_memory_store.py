# -*- coding: utf-8 -*-
"""记忆系统 v2：分层记忆文件 / 经验卡片 / 审核 / 召回。"""

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
        # 测试用规则审核（确定性、离线）
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
        self.assertEqual(memory_store.classify("这个关键词长尾词转化好"), "keyword")
        self.assertEqual(memory_store.classify("注意侵权风险禁词"), "risk")
        self.assertEqual(memory_store.classify("暖色调场景图风格点击率高"), "style")
        self.assertEqual(memory_store.classify("宠物纪念类目产品好卖"), "product")

    def test_rule_review_rejects_noise(self):
        self.assertFalse(memory_store._rule_review("好的"))
        self.assertFalse(memory_store._rule_review("嗯嗯，收到！"))
        self.assertTrue(memory_store._rule_review("Etsy 标签不能超过 20 字符"))

    def test_review_falls_back_to_rules_when_llm_off(self):
        keep, cat = memory_store.review("Amazon 主图必须白底，产品占比 85%")
        self.assertTrue(keep)
        self.assertIn(cat, memory_store.CATEGORIES)


class TestRememberAndRecall(MemoryStoreBase):
    def test_remember_and_recall_roundtrip(self):
        ok = memory_store.remember("Etsy 宠物纪念挂件类目竞争中等，情绪价值场景图点击率高")
        self.assertTrue(ok)
        hits = memory_store.recall("宠物纪念挂件 场景图")
        self.assertTrue(hits)
        self.assertIn("宠物纪念", hits[0]["text"])

    def test_dedup(self):
        text = "Temu 定价要留 25% 安全垫，广告费按 10% 预留"
        self.assertTrue(memory_store.remember(text))
        self.assertFalse(memory_store.remember(text))  # 重复不再写入

    def test_noise_rejected(self):
        self.assertFalse(memory_store.remember("好的"))
        self.assertFalse(memory_store.remember(""))

    def test_capacity_truncation(self):
        for i in range(memory_store.MAX_ENTRIES_PER_FILE + 10):
            memory_store.remember(f"产品方向记录第{i}号：宠物类目测试品",
                                  category="product", skip_review=True)
        path = memory_store._file_path("product")
        entries = memory_store._load_entries(path)
        self.assertLessEqual(len(entries), memory_store.MAX_ENTRIES_PER_FILE)

    def test_recall_empty_query(self):
        self.assertEqual(memory_store.recall(""), [])

    def test_stats(self):
        memory_store.remember("Etsy 标签风格建议", category="style",
                              skip_review=True)
        s = memory_store.stats()
        self.assertEqual(s["style"], 1)


class TestExperienceCard(MemoryStoreBase):
    def test_write_card_success(self):
        ok = memory_store.write_card({
            "task": "generate 木质花盆",
            "success": "generate 完成，一致性 92，产品 木质花盆",
            "next": "宠物纪念类目值得继续",
        })
        self.assertTrue(ok)
        self.assertTrue(memory_store.recall("木质花盆 一致性"))

    def test_write_card_failure_goes_to_risk(self):
        memory_store.write_card({
            "task": "generate 亚克力挂件",
            "avoid": "generate 失败：生图引擎超时导致整批失败",
        })
        risk_entries = memory_store._load_entries(
            memory_store._file_path("risk"))
        self.assertTrue(any("亚克力挂件" in e for e in risk_entries))

    def test_empty_card(self):
        self.assertFalse(memory_store.write_card({}))


class TestObserverIntegration(MemoryStoreBase):
    def test_post_task_reflect_writes_card(self):
        from agents.observer import ObserverAgent

        ob = ObserverAgent("t-mem")
        ob.state["product_name"] = "木质小花盆"
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
