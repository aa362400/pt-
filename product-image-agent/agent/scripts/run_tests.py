#!/usr/bin/env python3
"""
english_text — english_textyestext
"""
import os
import sys
import unittest

if __name__ == "__main__":
    # text agent english_text path（text tests/ english_text import）
    AGENT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, AGENT_ROOT)

    tests_dir = os.path.join(AGENT_ROOT, "tests")
    if not os.path.isdir(tests_dir):
        print(f"❌ tests english_text: {tests_dir}")
        sys.exit(1)

    loader = unittest.TestLoader()
    suite = loader.discover(
        start_dir=tests_dir,
        pattern="test_*.py",
        top_level_dir=AGENT_ROOT,
    )

    runner = unittest.TextTestRunner(verbosity=2, buffer=False)
    result = runner.run(suite)

    if not result.wasSuccessful():
        sys.exit(1)
