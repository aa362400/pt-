"""Best-effort migration of legacy mutable state into the runtime root."""

from __future__ import annotations

import shutil
from pathlib import Path

from common.runtime_paths import RuntimePaths, ensure_runtime_paths


def migrate_legacy_runtime_state(
    agent_root: str | None = None,
    runtime_paths: RuntimePaths | None = None,
) -> dict[str, int]:
    """Copy legacy state only when the corresponding runtime file is absent.

    The migration is intentionally non-destructive and idempotent. Legacy files
    remain untouched, and an existing runtime file always wins.
    """

    root = Path(agent_root or Path(__file__).resolve().parents[1]).resolve()
    paths = runtime_paths or ensure_runtime_paths()
    result = {"copied": 0, "skippedExisting": 0, "errors": 0}

    single_files = (
        (root / "profiles" / "user_memory.json", Path(paths.memory) / "user_memory.json"),
        (
            root / "profiles" / "working_memory.json",
            Path(paths.memory) / "working_memory.json",
        ),
        (
            root / "profiles" / "feedback_history.json",
            Path(paths.memory) / "feedback_history.json",
        ),
        (
            root / "data" / "platform_sync_state.json",
            Path(paths.memory) / "platform_sync_state.json",
        ),
    )
    trees = (
        (root / "profiles" / "memory", Path(paths.memory)),
        (
            root / "knowledge" / "orgs",
            Path(paths.memory) / "knowledge" / "orgs",
        ),
        (
            root / "references" / "product_profiles",
            Path(paths.outputs) / "product_profiles",
        ),
    )

    def copy_missing(source: Path, destination: Path) -> None:
        if not source.is_file():
            return
        if destination.exists():
            result["skippedExisting"] += 1
            return
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            result["copied"] += 1
        except OSError:
            result["errors"] += 1

    for source, destination in single_files:
        copy_missing(source, destination)

    for source_root, destination_root in trees:
        if not source_root.is_dir():
            continue
        for source in source_root.rglob("*"):
            if source.is_file():
                copy_missing(source, destination_root / source.relative_to(source_root))

    return result
