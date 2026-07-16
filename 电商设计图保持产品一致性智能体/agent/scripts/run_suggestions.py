"""CLI: 处理待办事件并生成建议。"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.event_subscriber import poll_events, inbox
from services.suggestion_engine import process_pending_events

if __name__ == "__main__":
    org_id = os.getenv("PLATFORM_ORG_ID", sys.argv[1] if len(sys.argv) > 1 else "")
    if not org_id:
        print("Usage: python scripts/run_suggestions.py <org_id>")
        sys.exit(1)
    
    events = poll_events(org_id)
    print(f"Fetched {len(events)} events")
    
    for ev in events:
        inbox.add(org_id, ev)
    
    pushed = process_pending_events(org_id, inbox.list(org_id))
    print(f"Pushed {pushed} suggestions")
