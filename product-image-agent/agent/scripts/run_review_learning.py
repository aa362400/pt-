#!/usr/bin/env python3
"""CLI: textreviewdata -> english_text。"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.review_learning import poll_and_learn, generate_weekly_report

if __name__ == "__main__":
    org_id = os.getenv("PLATFORM_ORG_ID", sys.argv[1] if len(sys.argv) > 1 else "")
    if not org_id:
        print("Usage: python scripts/run_review_learning.py <org_id>")
        sys.exit(1)

    force = "--force" in sys.argv
    learned = poll_and_learn(org_id, force=force)
    print(f"Learned from {learned} review rejections")

    report = generate_weekly_report(org_id)
    print(f"Weekly report: {report}")
