"""CLI 入口：手动触发知识同步。

用法：
    python sync_knowledge.py <org_id>
    PLATFORM_ORG_ID=<org_id> python sync_knowledge.py

环境变量：
    PLATFORM_ORG_ID         组织 ID（未提供时从参数读取）
    PLATFORM_API_BASE       平台 API 地址，默认 http://backend:3000/api/v1
    AGENT_API_KEY           平台 API 鉴权密钥
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from common.platform_knowledge_sync import run_full_sync

if __name__ == "__main__":
    org_id = os.getenv("PLATFORM_ORG_ID", sys.argv[1] if len(sys.argv) > 1 else "")
    results = run_full_sync(org_id)
    print(f"Sync results: {results}")
