from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path


AGENT_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    path = AGENT_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_keyword_prompt_forbids_llm_metric_estimates():
    platform_tasks = load_module(
        "platform_tasks_keyword_prompt_policy",
        "web/services/platform_tasks.py",
    )

    prompt = platform_tasks._TASK_SPECS["keyword_analysis"]["system"]

    assert "best-effort estimates" not in prompt
    assert "must be null" in prompt
    assert "DATA_INSUFFICIENT" in prompt


def test_keyword_task_strips_llm_metric_estimates_and_marks_data_insufficient(
    monkeypatch,
):
    platform_tasks = load_module(
        "platform_tasks_keyword_metric_policy",
        "web/services/platform_tasks.py",
    )
    monkeypatch.delenv("COMMERCE_AGENT_MOCK", raising=False)
    monkeypatch.delenv("AGENT_ALLOW_MOCK", raising=False)
    monkeypatch.setattr(
        platform_tasks,
        "_chat_json",
        lambda *_args, **_kwargs: {
            "keywords": [
                {"keyword": "portable fan", "volume": 9900, "difficulty": 12},
                {"keyword": "usb desk fan", "volume": 8800, "difficulty": 23},
                {"keyword": "quiet travel fan", "volume": 7700, "difficulty": 34},
            ]
        },
    )
    monkeypatch.setattr(platform_tasks, "_judge_quality", lambda *_args, **_kwargs: {})
    fake_verifier = types.ModuleType("agents.verifier")
    fake_verifier.verify = lambda _task_type, output: {
        "passed": all(
            item["volume"] is None
            and item["difficulty"] is None
            and item["metricStatus"] == "DATA_INSUFFICIENT"
            and item["metricEvidence"] is None
            for item in output["keywords"]
        ),
        "issues": [],
        "suggestions": [],
    }
    fake_agents = types.ModuleType("agents")
    fake_agents.__path__ = []
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.verifier", fake_verifier)

    result = platform_tasks.run_text_task(
        "keyword_analysis",
        {"seedKeywords": ["portable fan"], "marketplace": "ozon"},
    )

    assert result["dataStatus"] == "DATA_INSUFFICIENT"
    assert result["keywords"] == [
        {
            "keyword": "portable fan",
            "volume": None,
            "difficulty": None,
            "metricStatus": "DATA_INSUFFICIENT",
            "metricEvidence": None,
        },
        {
            "keyword": "usb desk fan",
            "volume": None,
            "difficulty": None,
            "metricStatus": "DATA_INSUFFICIENT",
            "metricEvidence": None,
        },
        {
            "keyword": "quiet travel fan",
            "volume": None,
            "difficulty": None,
            "metricStatus": "DATA_INSUFFICIENT",
            "metricEvidence": None,
        },
    ]
