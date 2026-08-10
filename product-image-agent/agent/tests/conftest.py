"""测试全局配置：禁用编排 LLM 真实调用，保证测试确定性与速度。

显式传入 api_key 构造的 OrchestratorBrain（如 test_orchestrator_llm 的 mock 测试）
不受此开关影响。
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
