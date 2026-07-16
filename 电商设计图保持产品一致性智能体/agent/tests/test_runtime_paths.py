from pathlib import Path


def test_legacy_runtime_migration_only_copies_missing_state(tmp_path):
    from common.runtime_migration import migrate_legacy_runtime_state
    from common.runtime_paths import get_runtime_paths

    legacy_root = tmp_path / "agent"
    runtime = get_runtime_paths(str(tmp_path / "runtime"))

    (legacy_root / "profiles" / "memory").mkdir(parents=True)
    (legacy_root / "profiles" / "user_memory.json").write_text(
        '{"brand":"legacy"}', encoding="utf-8"
    )
    (legacy_root / "profiles" / "working_memory.json").write_text(
        "[]", encoding="utf-8"
    )
    (legacy_root / "profiles" / "memory" / "risk_memory.md").write_text(
        "legacy risk", encoding="utf-8"
    )

    current_user_memory = Path(runtime.memory) / "user_memory.json"
    current_user_memory.parent.mkdir(parents=True)
    current_user_memory.write_text('{"brand":"current"}', encoding="utf-8")

    first = migrate_legacy_runtime_state(str(legacy_root), runtime)
    second = migrate_legacy_runtime_state(str(legacy_root), runtime)

    assert first["copied"] == 2
    assert first["skippedExisting"] == 1
    assert second["copied"] == 0
    assert current_user_memory.read_text(encoding="utf-8") == '{"brand":"current"}'
    assert (Path(runtime.memory) / "working_memory.json").exists()
    assert (Path(runtime.memory) / "risk_memory.md").read_text(
        encoding="utf-8"
    ) == "legacy risk"


def test_runtime_path_contract_uses_one_configured_root():
    from common.runtime_paths import get_runtime_paths

    paths = get_runtime_paths()
    root = Path(paths.root).resolve()

    assert Path(paths.sessions).resolve().parent == root
    assert Path(paths.outputs).resolve().parent == root
    assert Path(paths.jobs).resolve().parent == root
    assert Path(paths.uploads).resolve().parent == root
    assert Path(paths.memory).resolve().parent == root
    assert Path(paths.logs).resolve().parent == root
    assert Path(paths.autonomy).resolve().parent == root
    assert Path(paths.secrets).resolve().parent == root


def test_all_stateful_modules_share_the_runtime_contract():
    import mcp_server
    from agents import blackboard
    from common import knowledge_base, memory_store, user_memory, working_memory
    from common.runtime_paths import get_runtime_paths

    paths = get_runtime_paths()

    assert Path(mcp_server._session_out_dir("runtime-contract")) == (
        Path(paths.outputs) / "runtime-contract"
    )
    assert Path(blackboard._sessions_root(None)) == Path(paths.sessions)
    assert Path(memory_store.MEMORY_DIR) == Path(paths.memory)
    assert Path(user_memory.MEMORY_PATH) == Path(paths.memory) / "user_memory.json"
    assert Path(working_memory.MEMORY_PATH) == Path(paths.memory) / "working_memory.json"
    assert Path(knowledge_base.NOTES_PATH) == Path(paths.memory) / "knowledge_notes.json"
    assert Path(knowledge_base.ORG_KNOWLEDGE_DIR) == Path(paths.memory) / "knowledge" / "orgs"


def test_default_agent_outputs_are_durable():
    from agents.executor import ExecutorAgent
    from common.runtime_paths import get_runtime_paths

    executor = ExecutorAgent("runtime_contract")

    assert Path(executor.output_base) == Path(get_runtime_paths().outputs)
    assert Path(executor.toolkit.output_base) == Path(get_runtime_paths().outputs)


def test_sync_feedback_and_generated_profiles_are_durable():
    from common import platform_knowledge_sync
    from common.runtime_paths import get_runtime_paths
    from scripts import ab_test_runner, analyze_product, scene_matcher

    paths = get_runtime_paths()

    assert Path(platform_knowledge_sync.ORG_KNOWLEDGE_DIR) == (
        Path(paths.memory) / "knowledge" / "orgs"
    )
    assert Path(platform_knowledge_sync._SYNC_STATE_PATH) == (
        Path(paths.memory) / "platform_sync_state.json"
    )
    assert Path(ab_test_runner.FEEDBACK_DIR) == Path(paths.memory)
    assert Path(ab_test_runner.FEEDBACK_FILE) == (
        Path(paths.memory) / "feedback_history.json"
    )
    assert Path(scene_matcher.feedback_history_path()) == (
        Path(paths.memory) / "feedback_history.json"
    )
    assert Path(analyze_product.default_profile_output_path(123)) == (
        Path(paths.outputs) / "product_profiles" / "product_123.json"
    )
