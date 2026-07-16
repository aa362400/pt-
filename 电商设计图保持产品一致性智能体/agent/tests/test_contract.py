"""契约测试 — 保证智能体实现与《agent-tasks.contract.json》同步。

三重防漂移：
1. 实现的 taskType 集合 == 契约声明的集合
2. 文本任务的输出必备字段在系统提示词中有约定（防止改提示词丢字段）
3. 若能找到平台仓的契约副本，两份文件必须完全一致
"""

from __future__ import annotations

import json
import os
import sys

import pytest

AGENT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if AGENT_DIR not in sys.path:
    sys.path.insert(0, AGENT_DIR)

CONTRACT_PATH = os.path.join(AGENT_DIR, "contracts", "agent-tasks.contract.json")
# 平台仓中的规范副本（同盘开发环境下可见；CI 单独跑时自动跳过比对）
PLATFORM_CONTRACT_PATH = os.path.abspath(
    os.path.join(AGENT_DIR, "..", "..", "contracts", "agent-tasks.contract.json")
)


@pytest.fixture(scope="module")
def contract() -> dict:
    with open(CONTRACT_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_task_types_match_contract(contract):
    """实现支持的 taskType 必须与契约声明完全一致。"""
    from web.services.platform_tasks import supported_text_tasks

    image_tasks = {
        "generate_images",
        "analyze_product",
        "supplier_image_search",
    }
    implemented = image_tasks | set(supported_text_tasks())
    declared = set(contract["tasks"].keys())

    assert implemented == declared, (
        f"实现与契约不一致：实现多出 {implemented - declared}，"
        f"契约多出 {declared - implemented}"
    )


def test_text_task_output_fields_promised_in_prompt(contract):
    """文本任务的输出必备字段必须出现在系统提示词的 JSON 约定里。"""
    from web.services.platform_tasks import _TASK_SPECS

    for task_type, spec in _TASK_SPECS.items():
        required = contract["tasks"][task_type]["output"]["required"]
        system_prompt = spec["system"]
        for field in required:
            assert f'"{field}"' in system_prompt, (
                f"{task_type}: 输出必备字段 {field} 未在系统提示词中约定"
            )


def test_contract_in_sync_with_platform_copy(contract):
    """双仓契约副本必须逐字节一致（找不到平台副本时跳过）。"""
    if not os.path.exists(PLATFORM_CONTRACT_PATH):
        pytest.skip("平台仓契约副本不可见（独立 CI 环境）")
    with open(PLATFORM_CONTRACT_PATH, encoding="utf-8") as f:
        platform_copy = json.load(f)
    assert platform_copy == contract, (
        "契约漂移：平台仓与智能体仓的 agent-tasks.contract.json 不一致，"
        "请同步两份文件并升 contractVersion"
    )


def test_contract_version_present(contract):
    assert contract.get("contractVersion"), "契约必须声明 contractVersion"
