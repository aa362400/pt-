# -*- coding: utf-8 -*-
"""P5 textsecurityenglish_text。"""

import json
import os
import shutil
import sys
import tempfile
import unittest

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_ROOT = os.path.join(AGENT_ROOT, "web")
for p in (AGENT_ROOT, WEB_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

from web.services import safety  # noqa: E402


class SafetyBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._orig = safety.LOG_PATH
        safety.LOG_PATH = os.path.join(self.tmp, "actions.jsonl")

    def tearDown(self):
        safety.LOG_PATH = self._orig
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestRiskLevels(SafetyBase):
    def test_low_risk_executes(self):
        d = safety.propose("generate_title", {"title": "wooden pot"})
        self.assertEqual(d["decision"], "execute")
        self.assertEqual(d["risk"], "low")

    def test_medium_default_for_unknown(self):
        self.assertEqual(safety.risk_of("some_new_action"), "medium")

    def test_high_risk_needs_confirm(self):
        d = safety.propose("batch_regenerate", {"count": 9})
        self.assertEqual(d["decision"], "confirm")
        self.assertTrue(d["proposalId"])
        # english_text proposalId → text
        d2 = safety.confirm(d["proposalId"], "batch_regenerate", {"count": 9})
        self.assertEqual(d2["decision"], "execute")

    def test_danger_rejected(self):
        d = safety.propose("payment", {"amount": 100})
        self.assertEqual(d["decision"], "reject")

    def test_confirm_without_id_rejected(self):
        d = safety.confirm("", "batch_regenerate")
        self.assertEqual(d["decision"], "reject")


class TestConstraints(SafetyBase):
    def test_trademark_title_rejected(self):
        d = safety.propose("export_bundle", {"title": "disney pet ornament"})
        self.assertEqual(d["decision"], "reject")
        self.assertTrue(any("text" in i for i in d["issues"]))

    def test_long_tags_rejected(self):
        issues = safety.check_constraints("export_csv", {
            "tags": ["a" * 25, "ok tag"]})
        self.assertTrue(any("english_text" in i for i in issues))

    def test_price_below_breakeven(self):
        issues = safety.check_constraints("export_csv", {
            "price": 10, "breakeven": 12.5})
        self.assertTrue(any("english_text" in i for i in issues))

    def test_batch_too_large(self):
        d = safety.propose("batch_regenerate", {"count": 99})
        self.assertEqual(d["decision"], "reject")


class TestActionLog(SafetyBase):
    def test_append_only_log_and_query(self):
        safety.log_action("generate_images", {"count": 3}, sid="s1")
        safety.log_action("inpaint_edit", {"imageId": "img_1"}, sid="s2",
                          backup="/alts/x.jpg")
        logs = safety.recent_logs()
        self.assertEqual(len(logs), 2)
        self.assertEqual(logs[0]["action"], "inpaint_edit")  # english_text
        self.assertEqual(logs[0]["backup"], "/alts/x.jpg")
        only_s1 = safety.recent_logs(sid="s1")
        self.assertEqual(len(only_s1), 1)
        # fileenglish_textyestext JSON（append-only）
        with open(safety.LOG_PATH, encoding="utf-8") as f:
            for line in f:
                json.loads(line)

    def test_rejected_actions_logged(self):
        safety.propose("payment", {})
        logs = safety.recent_logs()
        self.assertEqual(logs[0]["status"], "rejected")


class TestBundleDocs(unittest.TestCase):
    """listing_bundle english_text（english_text）。"""

    def test_listing_md_contains_sections(self):
        from web.services import listing_bundle
        md = listing_bundle._listing_md(
            {"title": "Birth Flower Suncatcher",
             "bullets": ["b1", "b2"], "keywords": ["kw1"],
             "description": "desc",
             "platformTitles": [{"platform": "etsy", "title": "t",
                                 "passed": True}]},
            ["pet memorial", "birth flower"], "Etsy")
        for section in ("## title", "## Etsy text", "## english_text",
                        "## How to Order", "## FAQ"):
            self.assertIn(section, md)

    def test_prompts_md(self):
        from web.services import listing_bundle
        md = listing_bundle._prompts_md([
            {"title": "text", "purpose": "text", "ratio": "1:1",
             "prompt": "white background product shot"}])
        self.assertIn("text1：text", md)
        self.assertIn("white background", md)

    def test_risk_md(self):
        from web.services import listing_bundle
        md = listing_bundle._risk_md({"riskLevel": "text", "verdict": "english_text",
                                      "risks": ["r1"], "suggestions": ["s1"]})
        self.assertIn("risktext：text", md)
        self.assertIn("- r1", md)


if __name__ == "__main__":
    unittest.main()
