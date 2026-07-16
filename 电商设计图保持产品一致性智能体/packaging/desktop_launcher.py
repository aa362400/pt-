#!/usr/bin/env python3
"""Windows desktop launcher for the product image agent."""

from __future__ import annotations

import argparse
import importlib
import os
import socket
import sys
import time
import webbrowser


APP_NAME = "电商产品图 AI 智能体"


def _resource_root() -> str:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.abspath(sys._MEIPASS)  # type: ignore[attr-defined]
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _configure_paths(root: str) -> None:
    agent_root = os.path.join(root, "agent")
    web_root = os.path.join(agent_root, "web")
    scripts_root = os.path.join(agent_root, "scripts")
    for path in (web_root, agent_root, scripts_root):
        if path not in sys.path:
            sys.path.insert(0, path)
    os.environ.setdefault("PYTHONUTF8", "1")


def _port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def _choose_port(preferred: int) -> int:
    if _port_available(preferred):
        return preferred
    for port in range(8081, 8121):
        if _port_available(port):
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    root = _resource_root()
    _configure_paths(root)
    os.chdir(root)

    web_app = importlib.import_module("app")
    port = _choose_port(args.port)
    url = f"http://localhost:{port}"

    print("=" * 60)
    print(f"  {APP_NAME}")
    print("=" * 60)
    print(f"  正在启动: {url}")
    print("  关闭这个窗口即可停止本地服务。")
    print("=" * 60)

    web_app.housekeeping.start_background_sweeper(
        web_app.SESSIONS_DIR,
        web_app.OUTPUT_DIR,
        web_app.UPLOAD_DIR,
        web_app.sessions,
    )

    if not args.no_browser:
        webbrowser.open(url)

    try:
        from waitress import serve

        serve(web_app.app, host=args.host, port=port, threads=16, channel_timeout=900)
    except KeyboardInterrupt:
        print("\n已停止。")
    except Exception as exc:
        print(f"\n启动失败: {exc}")
        time.sleep(8)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
