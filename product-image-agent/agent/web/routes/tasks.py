"""Task progress and cancellation routes."""

from __future__ import annotations

from flask import jsonify, request


def _conversation_for_session(sessions: dict, load_session_record, sid: str):
    engine = sessions.get(sid)
    rec = load_session_record(sid)
    conv = rec.get("conversation_history", [])
    if engine:
        conv = engine.observer.state.get("conversation_history", conv)
    return engine, rec, conv


def register_task_routes(
    app,
    tasks,
    sessions: dict,
    load_session_record,
    merge_scenes_with_disk,
    images_to_scene_states,
    issue_csrf_token,
    validate_csrf,
):
    @app.route("/api/task/<sid>/cancel", methods=["POST"])
    def api_task_cancel(sid):
        """requestenglish_texttask"""
        csrf_token = request.form.get("csrf_token", "").strip() or (
            request.json.get("csrf_token", "").strip() if request.is_json else ""
        )
        if not validate_csrf(csrf_token):
            return jsonify({
                "error": "CSRF textfailed，english_text",
                "csrf_token": issue_csrf_token(),
            }), 403

        result = tasks.results.get(sid, {})
        if result.get("status") not in ("running",):
            return jsonify({
                "status": "ignored",
                "message": "english_textyesenglish_texttask",
                "csrf_token": issue_csrf_token(),
            })

        tasks.set_cancel(sid, True)
        progress = tasks.progress.get(sid, {})
        progress["message"] = "english_text..."
        tasks.progress[sid] = progress
        return jsonify({
            "status": "cancelling",
            "message": "english_text...",
            "csrf_token": issue_csrf_token(),
        })

    @app.route("/api/task/<sid>")
    def api_task_status(sid):
        """texttaskenglish_text"""
        progress = tasks.progress.get(sid, {})
        result = tasks.results.get(sid, {})

        if result.get("status") == "mock_preview":
            _engine, rec, conv = _conversation_for_session(sessions, load_session_record, sid)
            images = result.get("images", [])
            return jsonify({
                "status": "mock_preview",
                "mockMode": True,
                "supervision_approved": False,
                "publishable": False,
                "task_type": result.get("task_type", progress.get("task_type", "")),
                "message": result.get("final_reply", "english_textgeneration，english_textpublish"),
                "proactive_questions": result.get("proactive_questions", []),
                "quick_replies": result.get("quick_replies", []),
                "progress": 100,
                "session_id": sid,
                "images": images,
                "scenes": merge_scenes_with_disk(
                    sid,
                    result.get("scenes") or images_to_scene_states(images),
                ),
                "download_url": result.get("download_url", ""),
                "profile": result.get("profile"),
                "scene_plan": result.get("scene_plan"),
                "blackboard_summary": result.get("blackboard_summary"),
                "trace": result.get("trace", {}),
                "messages": rec.get("messages", []),
                "conversation_history": conv,
                "csrf_token": issue_csrf_token(),
            })

        if result.get("status") == "completed":
            _engine, rec, conv = _conversation_for_session(sessions, load_session_record, sid)
            mock_mode = bool(result.get("mock") or result.get("mockMode"))
            supervision_approved = (
                result.get("supervision_approved") is True and not mock_mode
            )
            return jsonify({
                "status": "completed",
                "mockMode": mock_mode,
                "supervision_approved": supervision_approved,
                "publishable": supervision_approved and not mock_mode,
                "task_type": result.get("task_type", progress.get("task_type", "")),
                "message": result.get("final_reply", "completed"),
                "proactive_questions": result.get("proactive_questions", []),
                "quick_replies": result.get("quick_replies", []),
                "progress": 100,
                "session_id": sid,
                "images": result.get("images", []),
                "scenes": result.get("scenes") or images_to_scene_states(result.get("images", [])),
                "ab_images": result.get("ab_images", []),
                "reference_images": result.get("reference_images", []),
                "reference_image_count": result.get("reference_image_count", 0),
                "variant_count": result.get("variant_count", 0),
                "consistency_score": result.get("consistency_score", 0),
                "platform_file_count": result.get("platform_file_count", 0),
                "platform_count": result.get("platform_count", 0),
                "platforms": result.get("platforms", []),
                "download_url": result.get("download_url", ""),
                "profile": result.get("profile"),
                "scene_plan": result.get("scene_plan"),
                "blackboard_summary": result.get("blackboard_summary"),
                "trace": result.get("trace", {}),
                "messages": rec.get("messages", []),
                "conversation_history": conv,
                "csrf_token": issue_csrf_token(),
            })

        if result.get("status") == "cancelled":
            _engine, rec, conv = _conversation_for_session(sessions, load_session_record, sid)
            return jsonify({
                "status": "cancelled",
                "supervision_approved": False,
                "publishable": False,
                "message": result.get("final_reply", "english_text"),
                "proactive_questions": result.get("proactive_questions", []),
                "quick_replies": result.get("quick_replies", []),
                "progress": 100,
                "session_id": sid,
                "images": result.get("images", []),
                "scenes": merge_scenes_with_disk(
                    sid,
                    result.get("scenes") or images_to_scene_states(result.get("images", [])),
                ),
                "completed_count": result.get("completed_count"),
                "total_count": result.get("total_count"),
                "reference_image_count": result.get("reference_image_count", 0),
                "consistency_score": result.get("consistency_score", 0),
                "platform_file_count": result.get("platform_file_count", 0),
                "download_url": result.get("download_url", ""),
                "profile": result.get("profile"),
                "scene_plan": result.get("scene_plan"),
                "blackboard_summary": result.get("blackboard_summary"),
                "trace": result.get("trace", {}),
                "messages": rec.get("messages", []),
                "conversation_history": conv,
                "csrf_token": issue_csrf_token(),
            })

        if result.get("status") == "supervision_failed":
            _engine, rec, conv = _conversation_for_session(sessions, load_session_record, sid)
            # english_text：english_textpassed，english_textgenerationimage，
            # english_textfrontendtext，english_textuserenglish_text。
            images = result.get("images", [])
            return jsonify({
                "status": "supervision_failed",
                "mockMode": bool(result.get("mock") or result.get("mockMode")),
                "supervision_approved": False,
                "publishable": False,
                "task_type": result.get("task_type", progress.get("task_type", "")),
                "message": result.get("final_reply", "english_textpassed"),
                "proactive_questions": result.get("proactive_questions", []),
                "quick_replies": result.get("quick_replies", []),
                "progress": 100,
                "session_id": sid,
                "images": images,
                "scenes": merge_scenes_with_disk(
                    sid,
                    result.get("scenes") or images_to_scene_states(images),
                ),
                "consistency_score": result.get("consistency_score", 0),
                "reference_image_count": result.get("reference_image_count", 0),
                "platform_file_count": result.get("platform_file_count", 0),
                "platform_count": result.get("platform_count", 0),
                "platforms": result.get("platforms", []),
                "download_url": result.get("download_url", ""),
                "profile": result.get("profile"),
                "scene_plan": result.get("scene_plan"),
                "blackboard_summary": result.get("blackboard_summary"),
                "trace": result.get("trace", {}),
                "messages": rec.get("messages", []),
                "conversation_history": conv,
                "csrf_token": issue_csrf_token(),
            })

        if result.get("status") == "error":
            return jsonify({
                "status": "failed",
                "error": result.get("error", "texterror"),
                "progress": 0,
            })

        stage = progress.get("stage", "starting")
        scenes = merge_scenes_with_disk(sid, progress.get("scenes", []))
        completed = progress.get("completed", 0)
        total = progress.get("total", 0)

        if stage == "generate" and total > 0:
            pct = min(70, int(15 + (completed / total) * 55))
        else:
            stage_progress = {
                "starting": 5,
                "reference_lock": 8,
                "analyze": 12,
                "match": 20,
                "generate": 45,
                "postprocess": 72,
                "layout": 80,
                "platform": 88,
                "check": 95,
                "running": 50,
            }
            pct = progress.get("progress") or stage_progress.get(stage, 10)
            if scenes and stage != "generate":
                done_on_disk = sum(1 for s in scenes if s.get("status") == "done")
                if done_on_disk and total:
                    pct = max(pct, min(85, int(15 + (done_on_disk / total) * 55)))

        return jsonify({
            "status": "running",
            "message": progress.get("message", "textagentenglish_text..."),
            "progress": pct,
            "stage": stage,
            "task_type": progress.get("task_type", result.get("task_type", "")),
            "scenes": scenes,
            "completed": completed,
            "total": total,
            "current_scene": progress.get("current_scene"),
            "reference_image_count": progress.get("reference_image_count", 0),
            "reference_images": progress.get("reference_images", []),
        })
