"""Chat route and background execution orchestration."""

from __future__ import annotations

import os
import sys
import threading
import traceback
import uuid

from flask import jsonify, request

from web.services.chat_flow import (
    add_session_event,
    apply_form_preferences,
    build_user_display,
    ensure_session,
)


def _safe_print(*args, **kwargs):
    """Print route logs without crashing on non-UTF-8 Windows consoles."""
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    safe_args = [
        str(arg).encode(encoding, errors="replace").decode(encoding, errors="replace")
        for arg in args
    ]
    try:
        print(*safe_args, **kwargs)
    except UnicodeEncodeError:
        ascii_args = [
            str(arg).encode("ascii", errors="replace").decode("ascii")
            for arg in args
        ]
        print(*ascii_args, **kwargs)


def register_chat_routes(
    app,
    sessions: dict,
    tasks,
    output_dir: str,
    sessions_dir: str,
    normalize_platforms,
    extract_urls,
    fetch_product_image,
    extract_local_image_paths,
    import_local_image,
    format_task_plan_chip,
    dual_agent_engine_cls,
    append_chat_message,
    load_session_record,
    clear_cancel_flag,
    make_cancel_check,
    merge_scenes_with_disk,
    images_to_scene_states,
    issue_csrf_token,
    validate_csrf,
):
    @app.route("/api/chat", methods=["POST"])
    def api_chat():
        """
        usertextmessage → textagenttext → english_text
        """
        csrf_token = request.form.get("csrf_token", "").strip()
        if not validate_csrf(csrf_token):
            return jsonify({
                "error": "CSRF textfailed，english_text",
                "csrf_token": issue_csrf_token(),
            }), 403

        try:
            return _api_chat_impl()
        except Exception as e:
            _safe_print(f"[ERROR] api_chat: {e}")
            import traceback
            _safe_print(traceback.format_exc())
            return jsonify({"error": f"textfailed: {e}"}), 500


    def _api_chat_impl():
        user_message = request.form.get("message", "").strip()
        sid = request.form.get("session_id", "").strip()
        files = request.files.getlist("images") if "images" in request.files else []
        has_images = len(files) > 0
        # english_text
        form_brand = request.form.get("brand_name", "").strip()
        form_platforms = request.form.get("platforms", "").strip()
        form_quality = request.form.get("quality", "").strip()
        form_auto_engine = request.form.get("auto_engine", "").strip().lower() in ("1", "true", "on", "yes")
        think_mode = request.form.get("think_mode", "").strip().lower() in ("1", "true", "on", "yes")

        # english_text（text localStorage session_id text）
        if not sid:
            # text UUID：session id textyesenglish_text，text ID english_text
            sid = str(uuid.uuid4())
        engine = ensure_session(sessions, sid, dual_agent_engine_cls, output_dir, sessions_dir)

        # english_textimage
        saved_images = []
        url_fetch_note = ""
        local_import_note = ""
        img_dir = os.path.join(engine.context["output_dir"], "originals")
        os.makedirs(img_dir, exist_ok=True)
        if has_images:
            for f in files:
                fname = f.filename or f"image_{uuid.uuid4().hex[:6]}.jpg"
                path = os.path.join(img_dir, fname)
                f.save(path)
                saved_images.append(path)
            engine.add_images(saved_images)

        # messageenglish_textimageenglish_textautomatictext，english_textfileenglish_text。
        if not has_images and user_message:
            local_errors = []
            for local_path in extract_local_image_paths(user_message):
                result = import_local_image(local_path, img_dir)
                if result.get("success"):
                    saved_images.append(result["local_path"])
                else:
                    local_errors.append(result.get("error", "localimagetextfailed"))
            if saved_images:
                engine.add_images(saved_images)
                has_images = True
                local_import_note = f"english_textimage：{len(saved_images)} text"
            elif local_errors:
                url_fetch_note = local_errors[0]

        # messagetextproducttext/image URL textautomaticenglish_text
        if not has_images and user_message:
            for page_url in extract_urls(user_message):
                result = fetch_product_image(page_url, img_dir)
                if result.get("success"):
                    saved_images.append(result["local_path"])
                    url_fetch_note = f"english_text：{page_url}"
                    break
                url_fetch_note = result.get("error", "URL textfailed")
            if saved_images:
                engine.add_images(saved_images)
                has_images = True

        # english_text
        apply_form_preferences(engine, normalize_platforms, form_brand, form_platforms, form_quality, form_auto_engine)
        # MAX english_text：english_text + english_text（textmessageenglish_text）
        engine.observer.state["think_mode"] = think_mode

        # ═══ textagenttextflow（alltext） ═══
        # text：listingtextgenerationtextmigrationtext /api/commerce-agent/generate，
        # english_text、english_text。

        # text1text：english_text，english_text
        plan_result = engine.observer.plan_message(user_message, has_images)
        intent = plan_result.get("intent_result", {})
        engine.apply_options_from_intent(intent)
        user_display = build_user_display(user_message, has_images, local_import_note, url_fetch_note, saved_images)
        url_fetch_failed = (
            bool(extract_urls(user_message) or extract_local_image_paths(user_message))
            and not saved_images
            and url_fetch_note
        )
        append_chat_message(
            sid, "user", user_display,
            {"intent": intent.get("intent"), "has_images": has_images},
        )
        # english_text：english_text（platform/text/text/text）
        try:
            from common.user_memory import record as record_user_memory
            record_user_memory(user_message, intent.get("extracted") or {})
        except Exception:  # noqa: BLE001 — english_textfailedenglish_text
            pass
        # english_text：「text：xxx」english_text，english_textautomatictext
        try:
            from common.knowledge_base import maybe_capture_note
            captured_note = maybe_capture_note(user_message)
        except Exception:  # noqa: BLE001
            captured_note = None
        add_session_event(engine, engine.observer.agent_id, "chat_received", {
            "intent": intent.get("intent"),
            "has_images": has_images,
            "sid": sid,
        })
        add_session_event(engine, engine.observer.agent_id, "plan_generated", {
            "sid": sid,
            "risk_level": intent.get("risk_level", plan_result.get("plan", {}).get("risk_level", "medium")),
            "needs_clarification": intent.get("needs_clarification", False),
            "next_action": plan_result.get("plan", {}).get("next_action", ""),
        })
        _safe_print(f"\n[textagent] === textmessage ===")
        _safe_print(f"[Observer] english_text: intent={intent['intent']}, risk={intent.get('risk_level', 'medium')}, yesimage={has_images}")

        # text2text：english_textreplyuser
        decide_result = engine.step_observer_reply_first(intent)
        observer_reply = decide_result["reply"]
        if captured_note:
            observer_reply = (f"📚 english_text：「{captured_note[:60]}」，"
                              f"english_textautomatictext。\n\n{observer_reply}")
        if url_fetch_failed:
            observer_reply = (
                f"⚠️ noneenglish_text：{url_fetch_note}\n\n"
                "english_text **english_textimage**（📎），text **imagetext**（.jpg/.png），"
                "english_textimagetext（text C:\\Users\\...\\product.jpg）。"
            )
            proactive_questions = []
            quick_replies = []
        else:
            proactive_questions = decide_result.get("proactive_questions", [])
            quick_replies = decide_result.get("quick_replies", [])
        # LLM english_text：text Key english_text（english_text/english_text）。
        # english_textuserenglish_text"english_text"，english_text。
        if (engine.observer._last_understand_mode == "regex"
                and user_message
                and not engine.observer.state.get("llm_degraded_notified")):
            try:
                has_llm_key = engine.observer.orchestrator._has_llm_credentials()
            except Exception:  # noqa: BLE001
                has_llm_key = False
            if has_llm_key:
                engine.observer.state["llm_degraded_notified"] = True
                observer_reply += (
                    "\n\n> ⚠️ textreplyenglish_text（AI APIenglish_text，english_text），"
                    "english_text；APIenglish_textautomaticenglish_text。"
                )
        _safe_print(f"[Observer] textreply: {observer_reply[:80]}...")

        # text3text：english_texttask
        # edit_image / research_product texttask：english_text
        # （edit_image → chat-edit english_text；research_product → opportunity english_text）
        skip_dispatch = (
            intent.get("needs_clarification")
            or intent.get("intent") in ("edit_image", "research_product")
        )
        task = None if skip_dispatch else engine.step_observer_dispatch(intent)
        if task:
            _safe_print(f"[Observer] texttask → Executor: {task['task_id']} ({task['type']})")
        else:
            _safe_print(f"[Observer] nonetexttask，textreplyuser")

        # english_texttask，english_textreply
        if not task:
            if intent.get("needs_clarification") and intent.get("clarification_questions"):
                proactive_questions = [
                    {"id": f"clarify_{i+1}", "text": q, "chips": []}
                    for i, q in enumerate(intent.get("clarification_questions", []))
                ]
                quick_replies = []
                observer_reply = f"🤔 english_text：\n" + "\n".join(f"- {q['text']}" for q in proactive_questions)
            append_chat_message(sid, "observer", observer_reply, {
                "intent": intent.get("intent"),
                "llm_mode": intent.get("llm_mode", False),
                "task_plan": intent.get("task_plan", []),
                "understand_mode": engine.observer._last_understand_mode,
                "proactive_questions": proactive_questions,
                "quick_replies": quick_replies,
                "needs_clarification": intent.get("needs_clarification", False),
            })
            add_session_event(engine, engine.observer.agent_id, "reply_ready", {
                "intent": intent.get("intent"),
                "task_planned": False,
                "needs_clarification": intent.get("needs_clarification", False),
            })
            rec = load_session_record(sid)
            # english_text：english_textfrontendtext chat-edit text（text→text→acceptance）
            edit_request = (
                {"message": user_message}
                if intent.get("intent") == "edit_image" and user_message
                else None
            )
            # product researchtext：textfrontendtext opportunity text（english_text）
            opportunity_idea = user_message
            if intent.get("intent") == "research_product" and user_message:
                try:
                    from web.services import opportunity
                    opportunity_idea = opportunity.extract_product_idea(user_message) or user_message
                except Exception:  # noqa: BLE001 — textfailedenglish_text
                    opportunity_idea = user_message
            opportunity_request = (
                {"idea": opportunity_idea, "raw_idea": user_message}
                if intent.get("intent") == "research_product" and user_message
                else None
            )
            return jsonify({
                "status": "ready",
                "session_id": sid,
                "reply": observer_reply,
                "observer_says": observer_reply,
                "edit_request": edit_request,
                "opportunity_request": opportunity_request,
                "proactive_questions": proactive_questions,
                "quick_replies": quick_replies,
                "intent": intent["intent"],
                "llm_mode": intent.get("llm_mode", False),
                "task_plan": intent.get("task_plan", []),
                "understand_mode": engine.observer._last_understand_mode,
                "conversation_history": rec.get("conversation_history", []),
                "messages": rec.get("messages", []),
                "blackboard_summary": engine.blackboard.to_summary(),
                "csrf_token": issue_csrf_token(),
                "plan": plan_result.get("plan", {}),
            })

        # text4text：english_texttask（english_text）
        # english_textreplytextuser，english_text
        def run_executor_and_supervise(engine, task, sid, observer_first_reply):
            try:
                append_chat_message(
                    sid, "system",
                    f"taskenglish_text: {task.get('task_id')} ({task.get('type')})",
                    {"task_id": task.get("task_id"), "task_type": task.get("type")},
                )
                # text4text：english_text
                _safe_print(f"[Executor] english_texttask: {task['task_id']}")

                def progress_callback(agent, stage, msg, **extra):
                    prev = tasks.progress.get(sid, {})
                    payload = {
                        "stage": stage, "message": msg, "agent": agent,
                        "task_type": task.get("type", ""),
                    }
                    if "scenes" not in extra and prev.get("scenes"):
                        extra = {**extra, "scenes": prev["scenes"]}
                    if "reference_image_count" not in extra and prev.get("reference_image_count"):
                        extra = {**extra, "reference_image_count": prev["reference_image_count"]}
                    if "reference_images" not in extra and prev.get("reference_images"):
                        extra = {**extra, "reference_images": prev["reference_images"]}
                    payload.update(extra)
                    if payload.get("scenes"):
                        payload["scenes"] = merge_scenes_with_disk(sid, payload["scenes"])
                    tasks.progress[sid] = payload
                    _safe_print(f"  [{agent}] {stage}: {msg}")

                cancel_check = make_cancel_check(sid)
                executor_report = engine.step_executor_execute(
                    task, progress_callback, cancel_check=cancel_check,
                )
                if not executor_report:
                    tasks.results[sid] = {
                        "status": "error",
                        "error": "english_text",
                        "error_type": "empty_executor_report",
                    }
                    add_session_event(engine, engine.executor.agent_id, "executor_empty_report", {
                        "task_id": task.get("task_id"),
                        "task_type": task.get("type"),
                    })
                    replan_result = engine.observer.replan(
                        task.get("observer_says", task.get("type", "")),
                        "executor_empty_report",
                        has_images=bool(engine.observer.state.get("has_images")),
                        last_plan=intent.get("plan", {}),
                    )
                    add_session_event(engine, engine.observer.agent_id, "plan_replanned", {
                        "task_id": task.get("task_id"),
                        "reason": "executor_empty_report",
                        "risk_level": replan_result.get("intent_result", {}).get("risk_level", "medium"),
                    })
                    return

                _safe_print(f"[Executor] textcompleted: {executor_report['status']}")

                # text5text：english_text
                supervision = engine.step_observer_supervise(executor_report)
                cancelled = executor_report.get("status") == "cancelled"
                _safe_print(f"[Observer] text: {'⏹english_text' if cancelled else ('✅passed' if supervision.get('approved') else '❌failed')}")
                if not cancelled and not supervision.get("approved"):
                    replan_result = engine.observer.replan(
                        task.get("observer_says", task.get("type", "")),
                        "supervision_failed",
                        has_images=bool(engine.observer.state.get("has_images")),
                        last_plan=intent.get("plan", {}),
                    )
                    add_session_event(engine, engine.observer.agent_id, "plan_replanned", {
                        "task_id": task.get("task_id"),
                        "reason": "supervision_failed",
                        "risk_level": replan_result.get("intent_result", {}).get("risk_level", "medium"),
                    })

                # text6text：english_textreply
                final_reply = engine.step_observer_final_reply(supervision, observer_first_reply)
                append_chat_message(sid, "observer", final_reply, {
                    "task_type": task.get("type"), "final": True, "cancelled": cancelled,
                    "proactive_questions": supervision.get("proactive_questions", []),
                    "quick_replies": supervision.get("quick_replies", []),
                })

                # synctext
                engine._sync_execution_results(executor_report)

                # taskenglish_text：textsuccess/failedenglish_text
                engine.observer.post_task_reflect(task, executor_report, supervision)

                # LLM texttasktext：textcompletedtextautomaticenglish_text（english_text）
                chained = None if cancelled else engine.observer.dispatch_chained_task()
                while chained and supervision.get("approved"):
                    append_chat_message(
                        sid, "system",
                        f"texttask: {chained.get('task_id')} ({chained.get('type')}) → {chained.get('target_agent', 'executor')}",
                        {"task_id": chained.get("task_id"), "chained": True},
                    )
                    add_session_event(engine, engine.executor.agent_id, "chain_dispatch", {
                        "task_id": chained.get("task_id"),
                        "task_type": chained.get("type"),
                    })
                    executor_report = engine.step_executor_execute(
                        chained, progress_callback, cancel_check=cancel_check,
                    )
                    if not executor_report:
                        break
                    supervision = engine.step_observer_supervise(executor_report)
                    if executor_report.get("status") == "cancelled":
                        cancelled = True
                    engine._sync_execution_results(executor_report)
                    final_reply = engine.step_observer_final_reply(supervision, observer_reply)
                    if cancelled:
                        break
                    chained = engine.observer.dispatch_chained_task()

                # english_text
                if cancelled:
                    result_status = "cancelled"
                elif supervision.get("approved"):
                    result_status = "completed"
                else:
                    result_status = "supervision_failed"
                add_session_event(engine, engine.observer.agent_id, "task_finished", {
                    "task_id": task.get("task_id"),
                    "task_type": task.get("type"),
                    "result_status": result_status,
                    "approved": supervision.get("approved", False),
                })
                result_images = engine.context.get("generated_images", []) or executor_report.get("data", {}).get("images", [])
                task_payload = {
                    "status": result_status,
                    "supervision_approved": supervision.get("approved", False),
                    "task_type": task.get("type", ""),
                    "final_reply": final_reply,
                    "supervision": supervision,
                    "proactive_questions": supervision.get("proactive_questions", []),
                    "quick_replies": supervision.get("quick_replies", []),
                    "images": result_images,
                    "scenes": merge_scenes_with_disk(
                        sid,
                        images_to_scene_states(result_images),
                    ),
                    "consistency_score": engine.context.get("consistency_score", 0),
                    "platform_file_count": engine.context.get("platform_file_count", 0),
                    "platform_count": engine.context.get("platform_count", 0),
                    "platforms": engine.context.get("platforms", []),
                    "session_id": sid,
                    "blackboard_summary": engine.blackboard.to_summary(),
                    "download_url": f"/api/download/{sid}" if engine.context.get("generated_images") else "",
                    "profile": engine.context.get("profile"),
                    "scene_plan": engine.context.get("scene_plan"),
                    "completed_count": executor_report.get("data", {}).get("completed_count"),
                    "total_count": executor_report.get("data", {}).get("total_count"),
                    "reference_image_count": executor_report.get("data", {}).get("reference_image_count", 0),
                    "reference_images": executor_report.get("data", {}).get("reference_images", []),
                    "trace": executor_report.get("trace", {}),
                }
                if task.get("type") == "ab_test":
                    ab_data = (executor_report or {}).get("data", {})
                    ab_images = []
                    for img in ab_data.get("images", []):
                        rel = img.get("filename", "")
                        ab_images.append({
                            **img,
                            "url": f"/api/image/{sid}/{rel}" if rel else "",
                        })
                    task_payload["ab_images"] = ab_images
                    task_payload["variant_count"] = ab_data.get("variant_count", 0)
                if task.get("type") in ("research", "web_search", "browse"):
                    research_data = (executor_report or {}).get("data", {})
                    ref_images = []
                    output_dir = engine.context.get("output_dir", "")
                    for img in research_data.get("reference_images", []):
                        local_path = img.get("local_path", "")
                        rel = ""
                        if local_path and output_dir and local_path.startswith(output_dir):
                            rel = os.path.relpath(local_path, output_dir).replace("\\", "/")
                        elif local_path:
                            rel = os.path.basename(local_path)
                        ref_images.append({
                            **img,
                            "url": f"/api/image/{sid}/{rel}" if rel else "",
                            "label": img.get("title") or img.get("source_url", "english_text"),
                        })
                    task_payload["reference_images"] = ref_images
                tasks.results[sid] = task_payload

                # english_text：english_text，english_text
                profile = engine.context.get("profile")
                if isinstance(profile, dict) and profile:
                    try:
                        from web.services import session_store
                        record = session_store.load_session_record(sessions_dir, sid)
                        record["product_profile"] = profile
                        session_store.save_session_record(sessions_dir, sid, record)
                    except Exception:  # noqa: BLE001 — textfailedenglish_textflow
                        pass

            except Exception as e:
                _safe_print(f"[ERROR] english_text: {e}")
                append_chat_message(sid, "executor", f"textfailed: {e}", {"error": True})
                add_session_event(engine, engine.executor.agent_id, "executor_exception", {
                    "task_id": task.get("task_id"),
                    "task_type": task.get("type"),
                    "error": str(e),
                })
                tasks.results[sid] = {
                    "status": "error",
                    "error": str(e),
                    "error_type": "executor_exception",
                }

        append_chat_message(
            sid, "observer", observer_reply,
            {
                "intent": intent.get("intent"), "has_task": True, "task_type": task.get("type"),
                "proactive_questions": proactive_questions,
                "quick_replies": quick_replies,
            },
        )
        clear_cancel_flag(sid)
        tasks.progress[sid] = {
            "stage": "starting",
            "message": "taskenglish_textagent...",
            "task_type": task.get("type", ""),
        }
        tasks.results[sid] = {"status": "running"}
        thread = threading.Thread(
            target=run_executor_and_supervise,
            args=(engine, task, sid, observer_reply),
            daemon=True,
        )
        thread.start()

        rec = load_session_record(sid)
        # english_textreply
        return jsonify({
            "status": "task_dispatched",
            "session_id": sid,
            "reply": observer_reply,
            "observer_says": observer_reply,
            "proactive_questions": proactive_questions,
            "quick_replies": quick_replies,
            "task_id": task["task_id"],
            "task_type": task["type"],
            "target_agent": task.get("target_agent", "executor"),
            "task_plan": intent.get("task_plan", []),
            "llm_mode": intent.get("llm_mode", False),
            "understand_mode": engine.observer._last_understand_mode,
            "intent": intent["intent"],
            "scene_plan": engine.context.get("scene_plan"),
            "blackboard_summary": engine.blackboard.to_summary(),
            "conversation_history": rec.get("conversation_history", []),
            "messages": rec.get("messages", []),
            "csrf_token": issue_csrf_token(),
        })
