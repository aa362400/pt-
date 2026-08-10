"""english_text — textagentenglish_text《agent-tasks.contract.json》sync。

english_text：
1. english_text taskType text == english_text
2. texttasktextoutputtextfieldsenglish_textyestext（english_textfields）
3. english_textplatformenglish_text，textfileenglish_text
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
# platformenglish_text（english_text；CI english_textautomaticenglish_text）
PLATFORM_CONTRACT_PATH = os.path.abspath(
    os.path.join(AGENT_DIR, "..", "..", "contracts", "agent-tasks.contract.json")
)


@pytest.fixture(scope="module")
def contract() -> dict:
    with open(CONTRACT_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_task_types_match_contract(contract):
    """english_text taskType english_text。"""
    from web.services.platform_tasks import supported_text_tasks

    image_tasks = {
        "generate_images",
        "analyze_product",
        "supplier_image_search",
    }
    implemented = image_tasks | set(supported_text_tasks())
    declared = set(contract["tasks"].keys())

    assert implemented == declared, (
        f"english_text：english_text {implemented - declared}，"
        f"english_text {declared - implemented}"
    )


def test_text_task_output_fields_promised_in_prompt(contract):
    """texttasktextoutputtextfieldsenglish_text JSON english_text。"""
    from web.services.platform_tasks import _TASK_SPECS

    for task_type, spec in _TASK_SPECS.items():
        required = contract["tasks"][task_type]["output"]["required"]
        system_prompt = spec["system"]
        for field in required:
            assert f'"{field}"' in system_prompt, (
                f"{task_type}: outputtextfields {field} english_text"
            )


def test_contract_in_sync_with_platform_copy(contract):
    """english_text（english_textplatformenglish_text）。"""
    if not os.path.exists(PLATFORM_CONTRACT_PATH):
        pytest.skip("platformenglish_text（text CI text）")
    with open(PLATFORM_CONTRACT_PATH, encoding="utf-8") as f:
        platform_copy = json.load(f)
    assert platform_copy == contract, (
        "english_text：platformtextagenttext agent-tasks.contract.json english_text，"
        "textsynctextfiletext contractVersion"
    )


def test_contract_version_present(contract):
    assert contract.get("contractVersion"), "english_text contractVersion"
