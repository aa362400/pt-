#!/usr/bin/env python3
"""english_text — text jsdom textrealenglish_text。

english_text：english_text intent.js / main.js english_text，
text HTTP APIenglish_text，english_text DOM english_text。

text node + jsdom（.tmp-jsdom/node_modules/jsdom，text DOM_CHECK_JSDOM text），
english_textautomatictext，english_textbackendenglish_text。
"""

import os
import shutil
import socket
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(__file__)
AGENT_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(AGENT_ROOT, ".."))
JSDOM_DIR = os.environ.get(
    "DOM_CHECK_JSDOM",
    os.path.join(REPO_ROOT, ".tmp-jsdom", "node_modules", "jsdom"),
)

NODE = shutil.which("node")
WINDOWS_TRANSIENT_NODE_CRASH = 3221226505


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@unittest.skipUnless(NODE and os.path.isdir(JSDOM_DIR),
                     "text node + jsdom（npm install jsdom --prefix .tmp-jsdom）")
class TestDomSmoke(unittest.TestCase):
    """textrealtext → jsdom english_text → english_text"""

    server = None
    port = None

    @classmethod
    def setUpClass(cls):
        cls.port = _free_port()
        env = {**os.environ, "COMMERCE_AGENT_MOCK": "1", "SESSION_TTL_DAYS": "0"}
        cls.server = subprocess.Popen(
            [sys.executable, os.path.join(AGENT_ROOT, "web", "app.py"),
             "--port", str(cls.port), "--host", "127.0.0.1"],
            cwd=AGENT_ROOT,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # english_text
        import urllib.request
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(
                        f"http://127.0.0.1:{cls.port}/api/health", timeout=2):
                    return
            except OSError:
                time.sleep(0.5)
        raise RuntimeError("Web text 30 english_text")

    @classmethod
    def tearDownClass(cls):
        if cls.server:
            cls.server.terminate()
            try:
                cls.server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                cls.server.kill()

    def test_all_buttons_clickable(self):
        command = [NODE, os.path.join(TESTS_DIR, "dom_check.js")]
        env = {**os.environ,
               "DOM_CHECK_BASE": f"http://127.0.0.1:{self.port}",
               "DOM_CHECK_JSDOM": JSDOM_DIR}
        result = subprocess.run(
            command, env=env, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=180)
        if os.name == "nt" and result.returncode == WINDOWS_TRANSIENT_NODE_CRASH:
            result = subprocess.run(
                command, env=env, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=180)
        self.assertEqual(
            result.returncode, 0,
            f"jsdom english_textfailed:\n{result.stdout}\n{result.stderr}")


if __name__ == "__main__":
    unittest.main()
