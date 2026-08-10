# ============================================================
# english_text — Metrics Tracker
# ============================================================
# text：
#   - API english_text（english_text）
#   - successtext/failedtext
#   - english_text
#   - textcost
#   - taskenglish_text
# ============================================================

import json
import os
import threading
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

from .utils import setup_logger

logger = setup_logger(__name__)

# english_text
METRICS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
METRICS_FILE = os.path.join(METRICS_DIR, "metrics.json")

# english_textcost（english_text，USD）
COST_ESTIMATES = {
    "gemini": 0.0,        # Gemini english_text
    "minimax": 0.02,      # text ¥0.15
    "midjourney": 0.08,   # MJ english_text
    "dalle": 0.04,        # DALL-E 3 standard
    "sdxl_local": 0.001,  # english_text
}


class MetricsTracker:
    """
    english_text（textsecurity）。
    english_textyes API text、tasktext、successtext。
    """

    def __init__(self, persist_file: str = METRICS_FILE):
        self._lock = threading.Lock()
        self.persist_file = persist_file
        self._metrics = {
            "started_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "total_api_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "total_cost_usd": 0.0,
            "total_duration_seconds": 0.0,
            "calls_by_engine": defaultdict(lambda: {"total": 0, "success": 0, "failed": 0, "duration_sum": 0.0}),
            "tasks": [],  # text 100 texttask
            "errors": defaultdict(int),  # error_type -> count
        }
        self._load()

    def _load(self):
        if os.path.exists(self.persist_file):
            try:
                with open(self.persist_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                # english_text defaultdict english_textpackaging
                self._metrics.update(data)
                self._metrics["calls_by_engine"] = defaultdict(
                    lambda: {"total": 0, "success": 0, "failed": 0, "duration_sum": 0.0},
                    data.get("calls_by_engine", {}),
                )
                self._metrics["errors"] = defaultdict(int, data.get("errors", {}))
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"english_text metrics failed: {e}")

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self.persist_file), exist_ok=True)
            data = dict(self._metrics)
            data["calls_by_engine"] = dict(self._metrics["calls_by_engine"])
            data["errors"] = dict(self._metrics["errors"])
            data["last_updated"] = datetime.now().isoformat()
            with open(self.persist_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError as e:
            logger.warning(f"text metrics failed: {e}")

    def record_api_call(self, engine: str, success: bool, duration: float,
                        error_type: Optional[str] = None, cost: Optional[float] = None):
        """english_text API text"""
        with self._lock:
            self._metrics["total_api_calls"] += 1
            self._metrics["total_duration_seconds"] += duration
            if success:
                self._metrics["successful_calls"] += 1
            else:
                self._metrics["failed_calls"] += 1
                if error_type:
                    self._metrics["errors"][error_type] += 1

            # english_text
            eng = self._metrics["calls_by_engine"][engine]
            eng["total"] += 1
            eng["duration_sum"] += duration
            if success:
                eng["success"] += 1
            else:
                eng["failed"] += 1

            # textcost
            estimated_cost = cost if cost is not None else COST_ESTIMATES.get(engine, 0.0)
            self._metrics["total_cost_usd"] += estimated_cost

            self._save()

    def record_task(self, task_type: str, success: bool, duration: float,
                    scenes_count: int = 0, details: Optional[dict] = None):
        """texttasktext"""
        with self._lock:
            self._metrics["tasks"].append({
                "time": datetime.now().isoformat(),
                "type": task_type,
                "success": success,
                "duration": round(duration, 2),
                "scenes_count": scenes_count,
                "details": details or {},
            })
            # english_text 100 text
            if len(self._metrics["tasks"]) > 100:
                self._metrics["tasks"] = self._metrics["tasks"][-100:]
            self._save()

    def get_summary(self) -> dict:
        """english_text"""
        with self._lock:
            total = self._metrics["total_api_calls"]
            success = self._metrics["successful_calls"]
            return {
                "total_api_calls": total,
                "success_rate": round(success / total * 100, 1) if total > 0 else 0,
                "avg_duration": round(
                    self._metrics["total_duration_seconds"] / total, 2
                ) if total > 0 else 0,
                "total_cost_usd": round(self._metrics["total_cost_usd"], 4),
                "by_engine": {
                    name: {
                        "calls": stats["total"],
                        "success_rate": round(stats["success"] / stats["total"] * 100, 1)
                                       if stats["total"] > 0 else 0,
                        "avg_duration": round(stats["duration_sum"] / stats["total"], 2)
                                        if stats["total"] > 0 else 0,
                    }
                    for name, stats in self._metrics["calls_by_engine"].items()
                },
                "top_errors": dict(sorted(
                    self._metrics["errors"].items(),
                    key=lambda x: -x[1],
                )[:5]),
                "recent_tasks": self._metrics["tasks"][-10:],
            }


# english_text
_tracker: Optional[MetricsTracker] = None
_tracker_lock = threading.Lock()


def get_tracker() -> MetricsTracker:
    """english_text"""
    global _tracker
    with _tracker_lock:
        if _tracker is None:
            _tracker = MetricsTracker()
        return _tracker


# english_text
def track_api_call(engine: str):
    """API english_text"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            tracker = get_tracker()
            start = time.time()
            try:
                result = func(*args, **kwargs)
                tracker.record_api_call(engine, True, time.time() - start)
                return result
            except Exception as e:
                tracker.record_api_call(
                    engine, False, time.time() - start,
                    error_type=type(e).__name__,
                )
                raise
        return wrapper
    return decorator
