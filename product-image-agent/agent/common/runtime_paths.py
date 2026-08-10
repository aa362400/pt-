"""Single source of truth for mutable Agent runtime state."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass


@dataclass(frozen=True)
class RuntimePaths:
    root: str
    uploads: str
    outputs: str
    sessions: str
    jobs: str
    memory: str
    autonomy: str
    logs: str
    secrets: str


def get_runtime_paths(root: str | None = None) -> RuntimePaths:
    configured = root or os.environ.get("AGENT_RUNTIME_DIR", "").strip()
    runtime_root = os.path.abspath(
        os.path.expanduser(
            configured
            or os.path.join(tempfile.gettempdir(), "commerce-agent-runtime")
        )
    )
    return RuntimePaths(
        root=runtime_root,
        uploads=os.path.join(runtime_root, "uploads"),
        outputs=os.path.join(runtime_root, "outputs"),
        sessions=os.path.join(runtime_root, "sessions"),
        jobs=os.path.join(runtime_root, "jobs"),
        memory=os.path.join(runtime_root, "memory"),
        autonomy=os.path.join(runtime_root, "autonomy"),
        logs=os.path.join(runtime_root, "logs"),
        secrets=os.path.join(runtime_root, "secrets"),
    )


def ensure_runtime_paths(root: str | None = None) -> RuntimePaths:
    paths = get_runtime_paths(root)
    for path in (
        paths.root,
        paths.uploads,
        paths.outputs,
        paths.sessions,
        paths.jobs,
        paths.memory,
        paths.autonomy,
        paths.logs,
        paths.secrets,
    ):
        os.makedirs(path, exist_ok=True)
    return paths
