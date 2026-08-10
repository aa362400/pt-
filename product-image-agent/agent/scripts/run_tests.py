#!/usr/bin/env python3
"""
测试运行器 — 一键运行所有测试
"""
import os
import sys
import unittest

if __name__ == "__main__":
    # 添加 agent 根目录到 path（让 tests/ 可以被 import）
    AGENT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, AGENT_ROOT)

    tests_dir = os.path.join(AGENT_ROOT, "tests")
    if not os.path.isdir(tests_dir):
        print(f"❌ tests 目录不存在: {tests_dir}")
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
