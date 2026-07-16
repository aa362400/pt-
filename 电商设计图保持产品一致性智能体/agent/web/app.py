#!/usr/bin/env python3
"""
产品图智能体 — 双智能体架构 Web UI

┌──────────────────────────────────────────────────────┐
│  用户 〈──→  观察智能体 Observer    ──→  执行智能体 Executor  │
│              (理解需求·先回话)      (派发任务)  (干活·自检) │
│                    ↑  监督验证 ←──────────┘               │
└──────────────────────────────────────────────────────┘

这不是"流动"——每一步都在代码里写死了。
"""

import argparse
import atexit
import os
import secrets
import sys
import time
import uuid

try:
    from flask import Flask, request, jsonify
    from werkzeug.exceptions import HTTPException
except ImportError:
    print("请先安装 Flask: pip install flask")
    sys.exit(1)

# Windows 控制台默认 GBK，print 含 emoji 会 UnicodeEncodeError → /api/chat 500 返回 HTML
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class _SafeStream:
    """stdout/stderr 安全代理：宿主句柄失效（重定向管道被关、控制台分离）时
    print 会抛 OSError[Errno 22]，把日志问题升级成生成任务"失败"。这里直接吞掉。"""

    def __init__(self, stream):
        self._stream = stream

    def write(self, data):
        try:
            return self._stream.write(data)
        except (OSError, ValueError):
            return len(data)

    def flush(self):
        try:
            self._stream.flush()
        except (OSError, ValueError):
            pass

    def __getattr__(self, name):
        return getattr(self._stream, name)


if not isinstance(sys.stdout, _SafeStream):
    sys.stdout = _SafeStream(sys.stdout)
if not isinstance(sys.stderr, _SafeStream):
    sys.stderr = _SafeStream(sys.stderr)

# 注册脚本和智能体路径
AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
AGENTS_DIR = os.path.join(AGENT_ROOT, "agents")
SCRIPTS_DIR = os.path.join(AGENT_ROOT, "scripts")


def _load_dotenv() -> None:
    """从 agent/.env 加载环境变量（不覆盖已存在的值）"""
    env_path = os.path.join(AGENT_ROOT, ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


_load_dotenv()

sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, AGENTS_DIR)
sys.path.insert(0, SCRIPTS_DIR)

from common.runtime_migration import migrate_legacy_runtime_state
from common.runtime_paths import ensure_runtime_paths

RUNTIME_PATHS = ensure_runtime_paths()
migrate_legacy_runtime_state(AGENT_ROOT, RUNTIME_PATHS)
os.environ["AGENT_LOG_DIR"] = RUNTIME_PATHS.logs

from common.utils import (
    normalize_platforms,
    CROSS_BORDER_PLATFORMS_CSV,
    resolve_image_engine,
    get_image_api_key,
    guess_mime,
)
from common.fetch_url import (
    extract_local_image_paths,
    extract_urls,
    fetch_product_image,
    import_local_image,
)
from agents.orchestrator import format_task_plan_chip
from web.services import (
    autonomy_platform,
    autonomy_runtime,
    housekeeping,
    image_store,
    job_queue,
    security,
    session_store,
    task_state,
    platform_tasks,
)
from engine import DualAgentEngine
from routes.core import register_core_routes
from routes.media import register_media_routes
from routes.sessions import register_session_routes
from routes.tasks import register_task_routes
from web.services.runtime_heartbeat import RuntimeHeartbeat
from web.services.supplier_quote_config import load_supplier_quote_config
from routes.chat import register_chat_routes
from routes.commerce import register_commerce_routes
from routes.integration import register_integration_routes
from routes.mcp import register_mcp_routes
from routes.sync import register_sync_routes


def _validate_core_imports() -> None:
    """启动时校验关键符号，避免长驻进程加载旧版 common.utils 后在运行期才报错。"""
    import common.utils as utils_mod

    required = (
        "resolve_image_engine",
        "get_image_api_key",
        "resolve_analysis_engine",
        "friendly_image_error_message",
    )
    missing = [name for name in required if not hasattr(utils_mod, name)]
    if missing:
        raise RuntimeError(
            f"common.utils ({utils_mod.__file__}) 缺少: {', '.join(missing)}。"
            "请停止旧 Web 进程并重新启动以加载最新代码。"
        )
    if not callable(resolve_image_engine):
        raise RuntimeError("resolve_image_engine 未正确加载，请重启 Web 服务。")


_validate_core_imports()

WEB_ROOT = os.path.dirname(__file__)

app = Flask(
    __name__,
    template_folder=os.path.join(WEB_ROOT, "templates"),
    static_folder=os.path.join(WEB_ROOT, "static"),
)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024


def _resolve_secret_key() -> str:
    """优先用 FLASK_SECRET_KEY；未设置时生成并持久化到本地文件。

    每次重启随机生成会导致 CSRF token 与登录 session 全部失效，
    因此把首次生成的密钥落盘复用（该文件已被 .gitignore 的 *.key 覆盖）。
    """
    env_key = os.environ.get("FLASK_SECRET_KEY", "").strip()
    if env_key:
        return env_key
    key_path = os.path.join(RUNTIME_PATHS.secrets, "flask_secret.key")
    try:
        if os.path.isfile(key_path):
            with open(key_path, encoding="utf-8") as f:
                stored = f.read().strip()
            if stored:
                return stored
        generated = secrets.token_hex(32)
        with open(key_path, "w", encoding="utf-8") as f:
            f.write(generated)
        return generated
    except OSError:
        return secrets.token_hex(32)


app.config["SECRET_KEY"] = _resolve_secret_key()
# 前端迭代频繁：静态资源禁缓存，避免浏览器新旧 JS/CSS 混用导致按钮失效
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


@app.after_request
def _no_cache_static(resp):
    if request.path.startswith("/static/") or request.path == "/":
        resp.headers["Cache-Control"] = "no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
    return resp

CSRF_TTL = 3600
CHAT_RATE_LIMIT = int(os.environ.get("CHAT_RATE_LIMIT", "30"))
CHAT_RATE_WINDOW = 60
_rate_limiter = security.RateLimiter()
_csrf_manager = security.CsrfManager(app.config["SECRET_KEY"], ttl=CSRF_TTL)

RUNTIME_DIR = RUNTIME_PATHS.root
UPLOAD_DIR = RUNTIME_PATHS.uploads
OUTPUT_DIR = RUNTIME_PATHS.outputs
SESSIONS_DIR = RUNTIME_PATHS.sessions
JOBS_DIR = RUNTIME_PATHS.jobs
AUTONOMY_DIR = RUNTIME_PATHS.autonomy

# ── 核心：一个会话里住着两个智能体 ──
sessions = {}  # session_id → DualAgentEngine
tasks = task_state.TaskStateStore()
jobs = job_queue.JobQueue(JOBS_DIR)
runtime_heartbeat = RuntimeHeartbeat(jobs)
autonomy_scanner = autonomy_platform.PlatformAutonomyScanner(
    os.environ.get("PLATFORM_API_BASE", "http://127.0.0.1:3000/api/v1"),
    os.environ.get("AGENT_API_KEY", ""),
    os.environ.get("PLATFORM_ORG_ID", ""),
)
autonomy_executor = autonomy_platform.ReadOnlyTaskExecutor(
    platform_tasks.run_text_task,
)
autonomy = autonomy_runtime.AutonomyRuntime(
    AUTONOMY_DIR,
    autonomy_scanner.scan,
    autonomy_executor.execute,
    enabled=os.environ.get("AGENT_AUTONOMY_RUNTIME_ENABLED", "").strip().lower()
    in ("1", "true", "on", "yes"),
    interval_seconds=float(
        os.environ.get("AGENT_AUTONOMY_INTERVAL_SECONDS", "300") or 300
    ),
    max_attempts=int(os.environ.get("AGENT_AUTONOMY_MAX_ATTEMPTS", "3") or 3),
)
atexit.register(autonomy.stop)
atexit.register(runtime_heartbeat.stop)
app.config["SESSIONS"] = sessions
app.config["AUTONOMY_RUNTIME"] = autonomy
app.config["RUNTIME_HEARTBEAT"] = runtime_heartbeat
app.config["SUPPLIER_QUOTE_CONFIG"] = load_supplier_quote_config(os.environ)


def _session_output_dir(session_id: str) -> str:
    """Resolve session output directory (in-memory session or persisted path)."""
    return image_store.session_output_dir(session_id, sessions, SESSIONS_DIR, OUTPUT_DIR)


def _merge_scenes_with_disk(session_id: str, scenes: list) -> list:
    """Mark scene slots done when matching files exist under raw/."""
    return image_store.merge_scenes_with_disk(session_id, scenes, sessions, SESSIONS_DIR, OUTPUT_DIR)


def _images_to_scene_states(images: list) -> list:
    """Convert blackboard/API image metadata to gen-studio scene states."""
    return image_store.images_to_scene_states(images)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _check_rate_limit(key: str, limit: int, window: int) -> bool:
    return _rate_limiter.check(key, limit, window)


def _issue_csrf_token() -> str:
    return _csrf_manager.issue()


def _validate_csrf(token: str) -> bool:
    return _csrf_manager.validate(token)


def _is_api_request() -> bool:
    return request.path.startswith("/api/")


@app.errorhandler(404)
def _api_not_found(e):
    if _is_api_request():
        return jsonify({"error": "接口不存在"}), 404
    return e


@app.errorhandler(403)
def _api_forbidden(e):
    if _is_api_request():
        return jsonify({"error": "禁止访问"}), 403
    return e


@app.errorhandler(500)
def _api_internal_error(e):
    if _is_api_request():
        return jsonify({"error": "服务器内部错误，请稍后重试"}), 500
    return e


@app.errorhandler(429)
def _api_rate_limited(e):
    if _is_api_request():
        return jsonify({"error": "请求过于频繁，请稍后再试"}), 429
    return e


def _api_path() -> bool:
    return request.path.startswith("/api/")


@app.errorhandler(HTTPException)
def _handle_http_error(e):
    if _api_path():
        return jsonify({"error": e.description or e.name, "status": e.code}), e.code
    return e


@app.errorhandler(Exception)
def _handle_api_exception(e):
    if _api_path():
        app.logger.exception("API error on %s", request.path)
        msg = "服务器内部错误，请稍后重试"
        if app.debug:
            msg = f"{msg} ({type(e).__name__}: {e})"
        return jsonify({"error": msg}), 500
    raise e


# 高成本接口（生图/导出/商业分析会消耗付费 API 额度）统一限流
EXPENSIVE_RATE_LIMIT = int(os.environ.get("EXPENSIVE_RATE_LIMIT", "60"))
EXPENSIVE_PATH_PREFIXES = (
    "/api/commerce-agent/",
    "/api/generate",
    "/api/regenerate",
    "/api/inpaint",
    "/api/export",
    "/api/v1/agent/",
    "/api/mcp/",
)


@app.before_request
def _guard_chat_rate():
    if request.method != "POST":
        return
    if request.path == "/api/chat":
        if not _check_rate_limit(f"chat:{_client_ip()}", CHAT_RATE_LIMIT, CHAT_RATE_WINDOW):
            return jsonify({"error": "请求过于频繁，请稍后再试"}), 429
        return
    if request.path.startswith(EXPENSIVE_PATH_PREFIXES):
        if not _check_rate_limit(f"heavy:{_client_ip()}",
                                 EXPENSIVE_RATE_LIMIT, CHAT_RATE_WINDOW):
            return jsonify({"error": "请求过于频繁，请稍后再试"}), 429


# ── 可选访问口令保护（设置 WEB_ACCESS_PASSWORD 即启用，适合公网部署）──

def _access_password() -> str:
    return os.environ.get("WEB_ACCESS_PASSWORD", "").strip()


_AUTH_EXEMPT_PATHS = ("/api/health", "/login")

_LOGIN_PAGE = """<!doctype html><html lang=zh-CN><head><meta charset=utf-8>
<meta name=viewport content='width=device-width,initial-scale=1'><title>登录</title>
<style>body{font-family:-apple-system,'Segoe UI','Noto Sans SC',sans-serif;background:#F7F6FB;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #ECECF4;border-radius:20px;padding:34px 36px;
box-shadow:0 18px 50px rgba(31,31,42,.10);width:320px;text-align:center}
h1{font-size:18px;margin:0 0 6px}p{font-size:13px;color:#8B8B9A;margin:0 0 18px}
input{width:100%;box-sizing:border-box;padding:11px 14px;border:1px solid #ECECF4;
border-radius:12px;font-size:14px;margin-bottom:12px}
button{width:100%;padding:11px;border:none;border-radius:99px;background:#7A67FF;
color:#fff;font-size:14px;font-weight:700;cursor:pointer}
.err{color:#E24A4A;font-size:12.5px;margin-bottom:10px}</style></head><body>
<form class=card method=post action=/login>
<h1>✦ 跨境电商 AI 出图 Agent</h1><p>本站已开启访问保护，请输入访问口令</p>
{ERROR}<input type=password name=password placeholder="访问口令" autofocus>
<button type=submit>进入</button></form></body></html>"""


@app.before_request
def _guard_access():
    password = _access_password()
    if not password:
        return
    if (request.path in _AUTH_EXEMPT_PATHS
            or request.path.startswith("/static/")
            # 平台对接 API 使用自己的 AGENT_API_KEY 鉴权，不走网页口令
            or request.path.startswith("/api/v1/agent/")
            or request.path.startswith("/api/mcp/")):
        return
    from flask import redirect, session as flask_session
    if flask_session.get("authed"):
        return
    if _is_api_request():
        return jsonify({"error": "未登录：本站已开启访问保护", "login": "/login"}), 401
    return redirect("/login")


@app.route("/login", methods=["GET", "POST"])
def login():
    from flask import redirect, session as flask_session

    password = _access_password()
    if not password:
        return redirect("/")
    if request.method == "POST":
        if not _check_rate_limit(f"login:{_client_ip()}", 10, 300):
            return _LOGIN_PAGE.replace(
                "{ERROR}", "<div class=err>尝试过于频繁，请 5 分钟后再试</div>"), 429
        supplied = request.form.get("password", "")
        if secrets.compare_digest(supplied, password):
            flask_session["authed"] = True
            flask_session.permanent = True
            return redirect("/")
        return _LOGIN_PAGE.replace(
            "{ERROR}", "<div class=err>口令不对，再试一次</div>"), 403
    return _LOGIN_PAGE.replace("{ERROR}", "")


register_core_routes(app, CROSS_BORDER_PLATFORMS_CSV, _issue_csrf_token)
register_mcp_routes(app)


def _load_session_record(sid: str) -> dict:
    return session_store.load_session_record(SESSIONS_DIR, sid)


def _save_session_record(sid: str, data: dict):
    session_store.save_session_record(SESSIONS_DIR, sid, data)


def append_chat_message(sid: str, role: str, content: str, meta: dict = None):
    """持久化单条聊天消息（服务端 JSON + 内存 observer 摘要）"""
    if not sid or not content:
        return
    msg = {
        "id": uuid.uuid4().hex[:12],
        "role": role,
        "content": content,
        "ts": time.time(),
        "meta": meta or {},
    }
    engine = sessions.get(sid)
    history = None
    if engine and role == "user":
        engine.observer.state.setdefault("conversation_history", []).append({
            "time": msg["ts"],
            "user": content,
            "intent": (meta or {}).get("intent", ""),
            "has_task": (meta or {}).get("has_task", False),
        })
        hist = engine.observer.state["conversation_history"]
        if len(hist) > 20:
            engine.observer.state["conversation_history"] = hist[-20:]
        history = engine.observer.state["conversation_history"]

    def mutate(record: dict) -> None:
        record.setdefault("messages", []).append(msg)
        if role == "user" and not record.get("title"):
            record["title"] = content[:40].replace("\n", " ")
        if history is not None:
            record["conversation_history"] = history

    session_store.update_session_record(SESSIONS_DIR, sid, mutate)


def list_session_records(limit: int = 50) -> list:
    return session_store.list_session_records(SESSIONS_DIR, limit)


def _clear_cancel_flag(sid: str) -> None:
    tasks.clear_cancel(sid)


def _make_cancel_check(sid: str):
    return tasks.make_cancel_check(sid)


register_session_routes(
    app,
    sessions,
    SESSIONS_DIR,
    _load_session_record,
    list_session_records,
    _merge_scenes_with_disk,
)
register_media_routes(app, sessions, _session_output_dir, guess_mime)
register_task_routes(
    app,
    tasks,
    sessions,
    _load_session_record,
    _merge_scenes_with_disk,
    _images_to_scene_states,
    _issue_csrf_token,
    _validate_csrf,
)

register_chat_routes(
    app,
    sessions,
    tasks,
    OUTPUT_DIR,
    SESSIONS_DIR,
    normalize_platforms,
    extract_urls,
    fetch_product_image,
    extract_local_image_paths,
    import_local_image,
    format_task_plan_chip,
    DualAgentEngine,
    append_chat_message,
    _load_session_record,
    _clear_cancel_flag,
    _make_cancel_check,
    _merge_scenes_with_disk,
    _images_to_scene_states,
    _issue_csrf_token,
    _validate_csrf,
)

register_commerce_routes(
    app,
    sessions,
    tasks,
    OUTPUT_DIR,
    SESSIONS_DIR,
    DualAgentEngine,
    _merge_scenes_with_disk,
    _issue_csrf_token,
    _validate_csrf,
    get_image_api_key,
    resolve_image_engine,
    append_chat_message,
    _load_session_record,
    _save_session_record,
)

register_integration_routes(
    app,
    sessions,
    OUTPUT_DIR,
    SESSIONS_DIR,
    DualAgentEngine,
    jobs,
    get_image_api_key,
    resolve_image_engine,
    autonomy,
)

register_sync_routes(app)

# ── 注册平台代理工具（Stage 17: Full Platform Proxy）──

try:
    from common.proxy_client import register_proxy_tools as _register_proxy_tools
    _register_proxy_tools()
except Exception:
    import logging as _logging
    _logging.getLogger("app").warning(
        "Failed to register platform proxy tools (agent-proxy not available yet)"
    )


# ══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Product Image Agent - Dual Agent Chat UI")
    parser.add_argument("--port", type=int, default=8080, help="Port")
    parser.add_argument("--host", default="0.0.0.0", help="Host")
    parser.add_argument("--debug", action="store_true", help="Debug mode (Flask dev server)")
    args = parser.parse_args()

    housekeeping.start_background_sweeper(SESSIONS_DIR, OUTPUT_DIR, UPLOAD_DIR, sessions)
    autonomy.start()

    print("=" * 55)
    print("  产品图智能体 — 双智能体架构")
    print("=" * 55)
    print(f"  界面: http://localhost:{args.port}")
    print(f"  架构: 观察者(Observer) + 执行者(Executor)")
    print(f"  流程: 用户→观察者回复→派任务→执行者干活→观察者验证→交付")
    print("=" * 55)

    if args.debug:
        app.run(host=args.host, port=args.port, debug=True)
        return

    # 生产模式：waitress（多线程 WSGI，稳定承载长时生成任务），未安装时回退 Flask
    try:
        from waitress import serve
        print("  服务器: waitress (production)")
        serve(app, host=args.host, port=args.port, threads=16,
              channel_timeout=900)
    except ImportError:
        print("  服务器: Flask dev server（pip install waitress 可切生产模式）")
        app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
