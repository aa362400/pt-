"""Session history and blackboard routes."""

from __future__ import annotations

import json
import os

from flask import jsonify, Response, render_template_string

from agents.blackboard import SharedBlackboard


def register_session_routes(
    app,
    sessions: dict,
    sessions_dir: str,
    load_session_record,
    list_session_records,
    merge_scenes_with_disk=None,
):
    @app.route("/api/sessions")
    def api_sessions_list():
        """列出已持久化的会话（服务端 JSON）"""
        return jsonify({"sessions": list_session_records()})

    @app.route("/api/session/<sid>/messages")
    def api_session_messages(sid):
        """获取某会话的完整消息时间线"""
        rec = load_session_record(sid)
        engine = sessions.get(sid)
        conv = rec.get("conversation_history", [])
        if engine:
            conv = engine.observer.state.get("conversation_history", conv)

        # 跨境出图套图计划 + 磁盘上已生成的图（供前端历史恢复图片卡片）
        listing_plan = rec.get("listing_plan") or []
        scenes = []
        if listing_plan and merge_scenes_with_disk:
            scenes = merge_scenes_with_disk(sid, [
                {"scene_id": p.get("scene_id") or p.get("id", ""),
                 "scene_name": p.get("title", ""), "status": "pending"}
                for p in listing_plan
            ])

        return jsonify({
            "session_id": sid,
            "title": rec.get("title", ""),
            "messages": rec.get("messages", []),
            "conversation_history": conv,
            "updated_at": rec.get("updated_at", 0),
            "listing_plan": listing_plan,
            "strategy": rec.get("commerce_strategy"),
            "scenes": scenes,
            "identity_scores": rec.get("identity_scores") or {},
            "feedback": rec.get("feedback") or {},
        })

    @app.route("/api/session/<sid>/blackboard")
    def api_session_blackboard(sid):
        """返回会话共享黑板状态（供 UI 调试面板）"""
        engine = sessions.get(sid)
        if engine:
            return jsonify({
                "session_id": sid,
                "summary": engine.blackboard.to_summary(),
                "context": engine.blackboard.to_context_dict(),
                "revision": engine.blackboard.revision,
                "plan_version": engine.blackboard.plan_version,
                "plan_history": engine.blackboard.plan_history[-20:],
                "reflections": engine.blackboard.get_reflection_history(limit=20),
                "reflection_summary": engine.blackboard.get_reflection_summary(limit=10),
            })

        path = os.path.join(sessions_dir, sid, "blackboard.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                bb = SharedBlackboard.load(sid, base_dir=sessions_dir)
                bb._apply_snapshot(data)
                return jsonify({
                    "session_id": sid,
                    "summary": bb.to_summary(),
                    "context": bb.to_context_dict(),
                    "revision": bb.revision,
                    "plan_version": bb.plan_version,
                    "plan_history": bb.plan_history[-20:],
                    "reflections": bb.get_reflection_history(limit=20),
                    "reflection_summary": bb.get_reflection_summary(limit=10),
                })
            except (json.JSONDecodeError, OSError):
                pass
        return jsonify({"error": "会话不存在"}), 404
    @app.route("/api/session/<sid>/report")
    def api_session_report(sid):
        """导出会话报告（计划/反思/轨迹摘要）"""
        engine = sessions.get(sid)
        if engine:
            bb = engine.blackboard
            rec = load_session_record(sid)
            payload = {
                "session_id": sid,
                "title": rec.get("title", ""),
                "summary": bb.to_summary(),
                "blackboard": bb.to_context_dict(),
                "plan_history": bb.plan_history[-20:],
                "reflections": bb.get_reflection_history(limit=20),
                "reflection_summary": bb.get_reflection_summary(limit=10),
                "messages": rec.get("messages", [])[-50:],
            }
            return Response(json.dumps(payload, ensure_ascii=False, indent=2), mimetype="application/json")

        path = os.path.join(sessions_dir, sid, "blackboard.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                bb = SharedBlackboard.load(sid, base_dir=sessions_dir)
                bb._apply_snapshot(data)
                rec = load_session_record(sid)
                payload = {
                    "session_id": sid,
                    "title": rec.get("title", ""),
                    "summary": bb.to_summary(),
                    "blackboard": bb.to_context_dict(),
                    "plan_history": bb.plan_history[-20:],
                    "reflections": bb.get_reflection_history(limit=20),
                    "reflection_summary": bb.get_reflection_summary(limit=10),
                    "messages": rec.get("messages", [])[-50:],
                }
                return Response(json.dumps(payload, ensure_ascii=False, indent=2), mimetype="application/json")
            except (json.JSONDecodeError, OSError):
                pass
        return jsonify({"error": "会话不存在"}), 404

    @app.route("/session/<sid>/report")
    def html_session_report(sid):
        """Human-readable session report page."""
        rec = load_session_record(sid)
        engine = sessions.get(sid)
        bb = engine.blackboard if engine else SharedBlackboard.load(sid, base_dir=sessions_dir)
        if not engine and os.path.exists(os.path.join(sessions_dir, sid, "blackboard.json")):
            try:
                with open(os.path.join(sessions_dir, sid, "blackboard.json"), "r", encoding="utf-8") as f:
                    bb._apply_snapshot(json.load(f))
            except (json.JSONDecodeError, OSError):
                pass

        payload = {
            "session_id": sid,
            "title": rec.get("title", sid),
            "summary": bb.to_summary(),
            "plan_history": bb.plan_history[-10:],
            "reflection_summary": bb.get_reflection_summary(limit=8),
            "messages": rec.get("messages", [])[-20:],
        }

        template = """
        <!doctype html><html lang=zh-CN><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
        <title>会话报告 - {{ payload.title }}</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans SC',sans-serif;background:#f5f7fb;color:#182033;margin:0;padding:24px}
          .card{background:#fff;border:1px solid #e7eaf3;border-radius:16px;padding:16px 18px;margin:0 auto 16px;max-width:980px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
          h1,h2{margin:0 0 12px}
          .muted{color:#667085;font-size:13px}
          .tag{display:inline-block;padding:4px 8px;border-radius:999px;background:#f4f1ff;color:#6C5CE7;font-size:12px;font-weight:700;margin:4px 6px 0 0}
          pre{white-space:pre-wrap;word-break:break-word;background:#fbfbff;border:1px solid #e7eaf3;border-radius:12px;padding:12px}
          ul{margin:8px 0 0 20px}
          .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
          .btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;border:1px solid rgba(108,92,231,.16);background:#fff;color:#6C5CE7;text-decoration:none;font-size:13px;font-weight:700}
          .btn:hover{background:#f4f1ff}
        </style></head><body>
        <div class='card topbar'><div><h1>{{ payload.title }}</h1><div class='muted'>Session: {{ payload.session_id }}</div></div><a class='btn' href='/' target='_self'>返回会话</a></div>
        <div class='card'><h2>摘要</h2><div>{{ payload.summary.preference_summary }}</div></div>
        <div class='card'><h2>计划</h2>{% for p in payload.plan_history %}<div class='tag'>v{{ p.plan_version }}</div><div class='muted'>{{ p.next_action or p.goal or p.intent }}</div>{% endfor %}</div>
        <div class='card'><h2>反思</h2><ul>{% for r in payload.reflection_summary %}<li>{{ r }}</li>{% endfor %}</ul></div>
        <div class='card'><h2>最近消息</h2>{% for m in payload.messages %}<pre><strong>{{ m.role }}</strong>: {{ m.content }}</pre>{% endfor %}</div>
        </body></html>
        """
        return render_template_string(template, payload=payload)
