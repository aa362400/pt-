"""Shared Agent lifecycle contract used by the Python runtime.

PostgreSQL remains the source of truth. The Python runtime validates and emits
events only; it never writes lifecycle state directly.
"""

from __future__ import annotations

import json
from enum import StrEnum
from pathlib import Path
from typing import Final


class AgentLifecycleStatus(StrEnum):
    CREATED = "CREATED"
    PLANNING = "PLANNING"
    WAITING_TOOL = "WAITING_TOOL"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    RETRY_SCHEDULED = "RETRY_SCHEDULED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AgentLifecycleEvent(StrEnum):
    RUN_CREATED = "RUN_CREATED"
    PLAN_STARTED = "PLAN_STARTED"
    TOOL_CALL_REQUESTED = "TOOL_CALL_REQUESTED"
    TOOL_RESULT_RECEIVED = "TOOL_RESULT_RECEIVED"
    ACTION_PROPOSED = "ACTION_PROPOSED"
    APPROVAL_GRANTED = "APPROVAL_GRANTED"
    APPROVAL_REJECTED = "APPROVAL_REJECTED"
    EXECUTION_FINISHED = "EXECUTION_FINISHED"
    VERIFICATION_PASSED = "VERIFICATION_PASSED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    RETRYABLE_ERROR = "RETRYABLE_ERROR"
    RETRY_DISPATCHED = "RETRY_DISPATCHED"
    TOOL_TIMEOUT = "TOOL_TIMEOUT"
    NON_RETRYABLE_ERROR = "NON_RETRYABLE_ERROR"
    FATAL_ERROR = "FATAL_ERROR"
    CANCELLED_BY_USER = "CANCELLED_BY_USER"


_WORKSPACE_ROOT: Final[Path] = Path(__file__).resolve().parents[3]
CONTRACT_PATH: Final[Path] = (
    _WORKSPACE_ROOT / "contracts" / "agent-lifecycle-v2.json"
)


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def transition_map(path: Path = CONTRACT_PATH) -> dict[tuple[str, str], str]:
    contract = load_contract(path)
    return {
        (str(from_status), str(event)): str(to_status)
        for from_status, event, to_status in contract["transitions"]
    }


def resolve_transition(
    from_status: AgentLifecycleStatus,
    event: AgentLifecycleEvent,
) -> AgentLifecycleStatus:
    if from_status in {
        AgentLifecycleStatus.COMPLETED,
        AgentLifecycleStatus.FAILED,
        AgentLifecycleStatus.CANCELLED,
    }:
        raise ValueError(f"Agent lifecycle status {from_status} is terminal")

    to_status = transition_map().get((from_status.value, event.value))
    if to_status is None:
        raise ValueError(
            f"Illegal Agent lifecycle transition: {from_status} + {event}"
        )
    return AgentLifecycleStatus(to_status)
