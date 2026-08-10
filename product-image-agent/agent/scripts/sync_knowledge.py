"""CLI text：english_textsync。

text：
    python sync_knowledge.py <org_id>
    PLATFORM_ORG_ID=<org_id> python sync_knowledge.py

english_text：
    PLATFORM_ORG_ID         text ID（english_textread）
    PLATFORM_API_BASE       platform API text，text http://backend:3000/api/v1
    AGENT_API_KEY           platform API textsecret
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from common.platform_knowledge_sync import run_full_sync

if __name__ == "__main__":
    org_id = os.getenv("PLATFORM_ORG_ID", sys.argv[1] if len(sys.argv) > 1 else "")
    results = run_full_sync(org_id)
    print(f"Sync results: {results}")
