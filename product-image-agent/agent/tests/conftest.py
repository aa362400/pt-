"""english_textconfiguration：english_text LLM realtext，english_text。

english_text api_key english_text OrchestratorBrain（text test_orchestrator_llm text mock text）
english_text。
"""

import atexit
import os
import shutil
import tempfile

os.environ.setdefault("ORCHESTRATOR_LLM_DISABLED", "1")

# The local Agent may be running while the suite executes. Tests must never
# share its durable session/job files or inherit production rate-limit state.
_TEST_RUNTIME_DIR = tempfile.mkdtemp(prefix="commerce-agent-tests-")
os.environ["AGENT_RUNTIME_DIR"] = _TEST_RUNTIME_DIR
os.environ["AGENT_LOG_DIR"] = os.path.join(_TEST_RUNTIME_DIR, "logs")
os.environ["CHAT_RATE_LIMIT"] = "10000"
os.environ["EXPENSIVE_RATE_LIMIT"] = "10000"
atexit.register(shutil.rmtree, _TEST_RUNTIME_DIR, ignore_errors=True)
