#!/usr/bin/env python3
"""Web chat regressions for product-flow routing and scoped generation."""
import base64
import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "web"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from agents.observer import ObserverAgent
from agents.toolkit import AgentToolkit
from common.fetch_url import extract_local_image_paths, extract_urls, import_local_image
from common.utils import normalize_platforms
from engine import DualAgentEngine


WHITE_BG = {
    "scene_id": "scene_01_white_bg",
    "scene_name": "Clean White Background",
    "scene_name_cn": "Clean White Background",
}
LIFESTYLE = {
    "scene_id": "scene_02_lifestyle",
    "scene_name": "Lifestyle Scene",
    "scene_name_cn": "Lifestyle Scene",
}


def wait_for_background_task(tasks, sid, timeout=10.0):
    """english_text，english_text。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = (tasks.results.get(sid) or {}).get("status")
        if status and status != "running":
            return
        time.sleep(0.05)


class TestWebGenerationRouting(unittest.TestCase):
    def setUp(self):
        self.observer = ObserverAgent()
        self.observer.state["session_id"] = "webreg"
        self.observer.state["has_images"] = True
        self.observer.state["image_count"] = 1
        self.observer.state["image_paths"] = ["/tmp/ref.jpg"]
        self.observer.state["output_dir"] = "/tmp/out"
        self.observer.state["scene_plan"] = [WHITE_BG, LIFESTYLE]

    def test_analyze_and_generate_with_platform_names_does_not_route_to_web_search(self):
        msg = (
            "english_textgeneration。textyesenglish_text/english_text，platform amazon text shopify，"
            "noneenglish_text。textgeneration1english_text。"
        )

        intent = self.observer._understand_regex(msg, has_images=False)

        self.assertEqual(intent["intent"], "ask_analyze")
        self.assertNotEqual(intent["intent"], "web_search")
        self.assertEqual(intent["extracted"]["platforms"], ["amazon_main", "shopify"])
        self.assertEqual(intent["extracted"]["selected_scenes"][0]["scene_id"], "scene_01_white_bg")
        self.assertEqual(self.observer.state["pending_task_plan"][0]["step"], "generate")
        self.assertEqual(
            self.observer.state["pending_generation_constraints"]["generation_count"],
            1,
        )

    def test_llm_web_search_plan_is_overridden_for_image_generation_flow(self):
        msg = "english_textgeneration。platform amazon text shopify。textgeneration1english_text。"
        llm_result = {
            "intent": "web_search",
            "confidence": 0.9,
            "extracted": {"search_query": "amazon shopify english_text"},
            "task_plan": [{"step": "web_search", "agent": "researcher", "reason": "misclassified as search"}],
            "target_agent": "researcher",
        }

        intent = self.observer._build_intent_from_llm(llm_result, msg, has_images=False)

        self.assertEqual(intent["intent"], "ask_analyze")
        self.assertEqual(intent["dispatch_intent"], "ask_analyze")
        self.assertEqual(intent["target_agent"], "analyst")
        self.assertEqual(self.observer.state["pending_task_plan"][0]["step"], "generate")

    def test_confirm_generate_uses_only_named_one_scene_constraint(self):
        self.observer.state["profile_ready"] = True
        self.observer.state["scenes_ready"] = True
        msg = "textgenerationenglish_text1english_text，textgenerationtextscene。textgeneration。"

        intent = self.observer._understand_regex(msg, has_images=False)
        task = self.observer.dispatch(intent)

        self.assertEqual(intent["intent"], "confirm_generate")
        self.assertIsNotNone(task)
        selected = task["params"]["confirmed_scenes"]
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0]["scene_id"], "scene_01_white_bg")

    def test_unconstrained_generate_keeps_full_batch(self):
        self.observer.state["profile_ready"] = True
        self.observer.state["scenes_ready"] = True

        intent = self.observer._understand_regex("textgeneration", has_images=False)
        task = self.observer.dispatch(intent)

        self.assertEqual(intent["intent"], "confirm_generate")
        self.assertIsNone(task["params"]["confirmed_scenes"])


class TestChatRouteUrlUploadFlow(unittest.TestCase):
    def test_engine_after_url_image_state_corrects_web_search_misroute(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = os.path.join(tmp, "outputs")
            sessions_dir = os.path.join(tmp, "sessions")
            engine = DualAgentEngine("32266250", output_dir, sessions_dir)
            image_path = os.path.join(output_dir, "32266250", "originals", "url_test.png")
            os.makedirs(os.path.dirname(image_path), exist_ok=True)
            with open(image_path, "wb") as f:
                f.write(b"\x89PNG\r\n\x1a\n" + b"0" * 80)
            engine.add_images([image_path])

            with patch.object(engine.observer, "understand", return_value={
                "intent": "web_search",
                "dispatch_intent": "web_search",
                "confidence": 0.9,
                "extracted": {"search_query": "amazon shopify"},
                "raw_message": "english_textgeneration",
                "has_images": False,
                "llm_mode": False,
            }):
                intent = engine.step_observer_understand(
                    "english_textgeneration。textyesenglish_text/english_text，platform amazon text shopify，"
                    "noneenglish_text。textgeneration1english_text。",
                    has_images=False,
                )
            self.assertEqual(intent["intent"], "ask_analyze")
            self.assertEqual(intent["corrected_from"], "research_with_session_images")
            self.assertEqual(intent["extracted"]["platforms"], ["amazon_main", "shopify"])

    def test_url_upload_then_analyze_generate_does_not_dispatch_web_search(self):
        try:
            from flask import Flask
            from routes.chat import register_chat_routes
        except ImportError as exc:
            self.skipTest(f"Flask route test skipped: {exc}")

        with tempfile.TemporaryDirectory() as tmp:
            output_dir = os.path.join(tmp, "outputs")
            sessions_dir = os.path.join(tmp, "sessions")
            os.makedirs(output_dir, exist_ok=True)
            os.makedirs(sessions_dir, exist_ok=True)

            class FastEngine(DualAgentEngine):
                def step_executor_execute(self, task, progress_callback=None, cancel_check=None):
                    if task.get("type") == "analyze":
                        return {
                            "task_id": task.get("task_id", ""),
                            "type": "analyze",
                            "status": "success",
                            "data": {
                                "profile": {"product_name": "Wooden pen gift box display", "description": "test"},
                                "profile_path": os.path.join(output_dir, "profile.json"),
                                "scene_plan": [WHITE_BG, LIFESTYLE],
                                "plan_path": os.path.join(output_dir, "scene_plan.json"),
                            },
                        }
                    return {
                        "task_id": task.get("task_id", ""),
                        "type": task.get("type", ""),
                        "status": "success",
                        "data": {},
                    }

            app = Flask(__name__)
            sessions = {}

            class Tasks:
                def __init__(self):
                    self.progress = {}
                    self.results = {}
                def clear_cancel(self, sid):
                    pass
                def make_cancel_check(self, sid):
                    return lambda: False

            def fake_fetch_product_image(url, img_dir):
                os.makedirs(img_dir, exist_ok=True)
                path = os.path.join(img_dir, "url_test.png")
                with open(path, "wb") as f:
                    f.write(b"\x89PNG\r\n\x1a\n" + b"0" * 80)
                return {"success": True, "local_path": path}

            messages = {}
            def append_chat_message(sid, role, content, meta=None):
                messages.setdefault(sid, []).append({
                    "role": role,
                    "content": content,
                    "meta": meta or {},
                })

            def load_session_record(sid):
                return {"messages": messages.get(sid, []), "conversation_history": []}

            tasks = Tasks()
            register_chat_routes(
                app,
                sessions,
                tasks,
                output_dir,
                sessions_dir,
                normalize_platforms,
                extract_urls,
                fake_fetch_product_image,
                extract_local_image_paths,
                import_local_image,
                lambda plan: "",
                FastEngine,
                append_chat_message,
                load_session_record,
                lambda sid: None,
                lambda sid: (lambda: False),
                lambda sid, scenes: scenes,
                lambda images: [],
                lambda: "csrf",
                lambda token: True,
            )

            client = app.test_client()
            sid = "32266250"
            first = client.post("/api/chat", data={
                "csrf_token": "csrf",
                "session_id": sid,
                "message": "please analyze this product image: http://127.0.0.1:8765/product.png",
            })
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.get_json()["intent"], "upload")
            self.assertTrue(sessions[sid].observer.state["has_images"])

            second = client.post("/api/chat", data={
                "csrf_token": "csrf",
                "session_id": sid,
                "message": (
                    "continue analyze and generate. product is wooden pen gift box display stand, platform amazon and shopify. "
                    "no brand name. generate only 1 clean white background main image for testing."
                ),
            })

            data = second.get_json()
            self.assertEqual(second.status_code, 200)
            self.assertEqual(data["status"], "task_dispatched")
            self.assertEqual(data["intent"], "ask_analyze")
            self.assertEqual(data["task_type"], "analyze")
            self.assertNotEqual(data["task_type"], "web_search")
            wait_for_background_task(tasks, sid)

    def test_local_image_path_upload_marks_session_has_images(self):
        try:
            from flask import Flask
            from routes.chat import register_chat_routes
        except ImportError as exc:
            self.skipTest(f"Flask route test skipped: {exc}")

        with tempfile.TemporaryDirectory() as tmp:
            output_dir = os.path.join(tmp, "outputs")
            sessions_dir = os.path.join(tmp, "sessions")
            os.makedirs(output_dir, exist_ok=True)
            os.makedirs(sessions_dir, exist_ok=True)
            local_image = os.path.join(tmp, "product.jpg")
            with open(local_image, "wb") as f:
                f.write(b"\xff\xd8\xff" + b"x" * 600)

            class FastEngine(DualAgentEngine):
                def step_executor_execute(self, task, progress_callback=None, cancel_check=None):
                    return {
                        "task_id": task.get("task_id", ""),
                        "type": task.get("type", ""),
                        "status": "success",
                        "data": {
                            "profile": {"product_name": "Local product", "description": "test"},
                            "profile_path": os.path.join(output_dir, "profile.json"),
                            "scene_plan": [WHITE_BG],
                            "plan_path": os.path.join(output_dir, "scene_plan.json"),
                        },
                    }

            app = Flask(__name__)
            sessions = {}

            class Tasks:
                def __init__(self):
                    self.progress = {}
                    self.results = {}
                def clear_cancel(self, sid):
                    pass
                def make_cancel_check(self, sid):
                    return lambda: False

            messages = {}
            def append_chat_message(sid, role, content, meta=None):
                messages.setdefault(sid, []).append({
                    "role": role,
                    "content": content,
                    "meta": meta or {},
                })

            def load_session_record(sid):
                return {"messages": messages.get(sid, []), "conversation_history": []}

            tasks = Tasks()
            register_chat_routes(
                app,
                sessions,
                tasks,
                output_dir,
                sessions_dir,
                normalize_platforms,
                extract_urls,
                lambda url, img_dir: {"success": False, "error": "not used"},
                extract_local_image_paths,
                import_local_image,
                lambda plan: "",
                FastEngine,
                append_chat_message,
                load_session_record,
                lambda sid: None,
                lambda sid: (lambda: False),
                lambda sid, scenes: scenes,
                lambda images: [],
                lambda: "csrf",
                lambda token: True,
            )

            client = app.test_client()
            sid = "localpath"
            resp = client.post("/api/chat", data={
                "csrf_token": "csrf",
                "session_id": sid,
                "message": f"english_text：{local_image}",
            })

            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.get_json()["intent"], "ask_analyze")
            self.assertEqual(resp.get_json()["status"], "task_dispatched")
            self.assertTrue(sessions[sid].observer.state["has_images"])
            originals = os.path.join(output_dir, sid, "originals")
            self.assertTrue(any(name.startswith("local_") for name in os.listdir(originals)))
            wait_for_background_task(tasks, sid)


class TestGenerationFailureDetails(unittest.TestCase):
    def test_reference_image_generation_keeps_openai_even_with_gemini_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile_path = os.path.join(tmp, "product_profile.json")
            plan_path = os.path.join(tmp, "scene_plan.json")
            ref_path = os.path.join(tmp, "ref.jpg")
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump({"product_name": "Wooden pen gift box display"}, f)
            with open(plan_path, "w", encoding="utf-8") as f:
                json.dump({"scenes": [WHITE_BG]}, f, ensure_ascii=False)
            with open(ref_path, "wb") as f:
                f.write(b"fake-jpg")

            toolkit = AgentToolkit(
                script_dir=os.path.join(os.path.dirname(__file__), "..", "scripts"),
                template_dir=os.path.join(os.path.dirname(__file__), "..", "templates", "scenes"),
                output_base=tmp,
            )

            seen = {}
            def fake_batch_generate(**kwargs):
                seen.update(kwargs)
                out = os.path.join(kwargs["output_dir"], "scene_01_white_bg.jpg")
                os.makedirs(kwargs["output_dir"], exist_ok=True)
                with open(out, "wb") as f:
                    f.write(b"jpg")
                return [{
                    "scene_id": "scene_01_white_bg",
                    "scene_name": "Clean White Background",
                    "success": True,
                    "engine": kwargs["engine"],
                    "output_path": out,
                }]

            with patch.dict(os.environ, {
                "IMAGE_ENGINE": "dalle",
                "OPENAI_API_KEY": "openai-key",
                "GEMINI_API_KEY": "gemini-key",
            }, clear=False), patch("builtins.print"), patch("generate_batch.batch_generate", side_effect=fake_batch_generate):
                result = toolkit.generate_images(
                    profile_path=profile_path,
                    plan_path=plan_path,
                    image_paths=[ref_path],
                    output_dir=tmp,
                    scene_dir=toolkit.template_dir,
                    engine="dalle",
                )

            self.assertEqual(seen["engine"], "dalle")
            self.assertEqual(result["images"][0]["engine"], "dalle")

    def test_openai_reference_generation_uploads_images_to_edits_endpoint(self):
        from generate_batch import _call_openai_image_api

        with tempfile.TemporaryDirectory() as tmp:
            ref_path = os.path.join(tmp, "ref.jpg")
            output_path = os.path.join(tmp, "out.jpg")
            with open(ref_path, "wb") as f:
                f.write(b"fake-jpg-reference")

            seen = {}

            class FakeResponse:
                def raise_for_status(self):
                    return None

                def json(self):
                    return {
                        "data": [{
                            "b64_json": base64.b64encode(b"x" * 80).decode("ascii"),
                        }]
                    }

            def fake_post(url, **kwargs):
                seen["url"] = url
                seen["headers"] = kwargs.get("headers")
                seen["data"] = kwargs.get("data")
                seen["json"] = kwargs.get("json")
                seen["files"] = kwargs.get("files")
                return FakeResponse()

            with patch.dict(os.environ, {
                "IMAGE_API_BASE_URL": "https://api.openai.test/v1",
                "OPENAI_API_BASE": "https://api.openai.test/v1",
                "IMAGE_MODEL": "gpt-image-2",
                "OPENAI_IMAGE_MODEL": "gpt-image-2",
            }, clear=False), patch("requests.post", side_effect=fake_post):
                _call_openai_image_api(
                    "Keep the wooden pen display exactly like the reference.",
                    [ref_path],
                    output_path,
                    "1:1",
                    "openai-key",
                )

            self.assertEqual(seen["url"], "https://api.openai.test/v1/images/edits")
            self.assertIsNone(seen["json"])
            self.assertEqual(seen["data"]["model"], "gpt-image-2")
            self.assertEqual(seen["files"][0][0], "image[]")
            self.assertEqual(seen["files"][0][1][0], "ref.jpg")
            self.assertTrue(os.path.exists(output_path))

    def test_openai_image_api_preserves_quota_code_without_provider_metadata(self):
        from generate_batch import _call_openai_image_api

        class QuotaResponse:
            status_code = 403
            text = ""

            def json(self):
                return {
                    "error": {
                        "code": "insufficient_user_quota",
                        "message": "balance -0.09, request id secret-provider-id",
                    }
                }

        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
            "IMAGE_API_BASE_URL": "https://image-provider.example/v1",
            "IMAGE_MODEL": "gpt-image-2-4k",
        }, clear=False), patch("requests.post", return_value=QuotaResponse()):
            with self.assertRaises(RuntimeError) as ctx:
                _call_openai_image_api(
                    "Generate a product image.",
                    [],
                    os.path.join(tmp, "out.png"),
                    "1:1",
                    "test-key",
                )

        message = str(ctx.exception)
        self.assertIn("IMAGE_PROVIDER_QUOTA_EXHAUSTED", message)
        self.assertNotIn("secret-provider-id", message)
        self.assertNotIn("-0.09", message)

    def test_openai_image_api_fails_over_to_backup_key(self):
        from generate_batch import _call_openai_image_api

        calls = []

        class Response:
            def __init__(self, status_code, payload):
                self.status_code = status_code
                self._payload = payload
                self.text = ""

            def json(self):
                return self._payload

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise RuntimeError(f"HTTP {self.status_code}")

        def fake_post(_url, **kwargs):
            calls.append({
                "authorization": kwargs["headers"]["Authorization"],
                "model": kwargs["json"]["model"],
            })
            if len(calls) == 1:
                return Response(403, {
                    "error": {
                        "code": "insufficient_user_quota",
                        "message": "primary exhausted",
                    }
                })
            return Response(200, {
                "data": [{"b64_json": base64.b64encode(b"x" * 80).decode("ascii")}]
            })

        env = {
            "IMAGE_API_BASE_URL": "https://image-provider.example/v1",
            "IMAGE_MODEL": "primary-image-model",
            "IMAGE_MODEL_BACKUP": "backup-image-model",
            "IMAGE_API_KEY": "",
            "OPENAI_IMAGE_API_KEY": "",
            "OPENAI_IMAGE_API_KEY_BACKUP": "",
            "OPENAI_API_KEY": "",
            "OPENAI_API_KEY_PREMIUM": "",
            "IMAGE_API_KEY_BACKUP": "backup-key",
        }
        with tempfile.TemporaryDirectory() as tmp, patch.dict(
            os.environ, env, clear=False
        ), patch("requests.post", side_effect=fake_post):
            output = os.path.join(tmp, "out.png")
            result = _call_openai_image_api(
                "Generate a product image.", [], output, "1:1", "primary-key"
            )
            output_exists = os.path.exists(output)

        self.assertTrue(output_exists)
        self.assertIn("primary-image-model", result)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["authorization"], "Bearer primary-key")
        self.assertEqual(calls[1]["authorization"], "Bearer backup-key")

    def test_toolkit_raises_provider_details_when_all_scenes_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile_path = os.path.join(tmp, "product_profile.json")
            plan_path = os.path.join(tmp, "scene_plan.json")
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump({"product_name": "Test product"}, f)
            with open(plan_path, "w", encoding="utf-8") as f:
                json.dump({"scenes": [WHITE_BG]}, f, ensure_ascii=False)

            toolkit = AgentToolkit(
                script_dir=os.path.join(os.path.dirname(__file__), "..", "scripts"),
                template_dir=os.path.join(os.path.dirname(__file__), "..", "templates", "scenes"),
                output_base=tmp,
            )

            failed_result = [{
                "scene_id": "scene_01_white_bg",
                "scene_name": "Clean White Background",
                "success": False,
                "engine": "dalle",
                "error": "OpenAI english_text（503）。english_text，english_text gpt-image text OPENAI_API_BASE",
                "raw_error": "503 Server Error: Service Unavailable for url: https://jojocode.com/v1/images/generations",
            }]
            with patch("builtins.print"), patch("generate_batch.batch_generate", return_value=failed_result):
                with self.assertRaises(RuntimeError) as ctx:
                    toolkit.generate_images(
                        profile_path=profile_path,
                        plan_path=plan_path,
                        image_paths=[],
                        output_dir=tmp,
                        scene_dir=toolkit.template_dir,
                        api_key="test-key",
                        engine="dalle",
                    )

        message = str(ctx.exception)
        self.assertTrue(message)
        self.assertIn("503", message)
        self.assertIn("jojocode.com", message)


class TestImageProviderConfiguration(unittest.TestCase):
    def test_inpaint_prefers_dedicated_image_provider_configuration(self):
        from PIL import Image
        from web.services.inpaint import inpaint_image

        keys = (
            "IMAGE_API_BASE_URL", "OPENAI_API_BASE",
            "IMAGE_MODEL", "OPENAI_IMAGE_MODEL", "COMMERCE_AGENT_MOCK",
        )
        saved = {key: os.environ.pop(key, None) for key in keys}
        try:
            os.environ["IMAGE_API_BASE_URL"] = "https://image-provider.example/v1"
            os.environ["OPENAI_API_BASE"] = "https://legacy-provider.example/v1"
            os.environ["IMAGE_MODEL"] = "gpt-image-current"
            os.environ["OPENAI_IMAGE_MODEL"] = "gpt-image-legacy"

            with tempfile.TemporaryDirectory() as tmp:
                source = os.path.join(tmp, "source.png")
                Image.new("RGB", (32, 32), (255, 255, 255)).save(source, "PNG")
                with open(source, "rb") as image_file:
                    b64 = base64.b64encode(image_file.read()).decode("ascii")

                seen = {}

                class FakeResponse:
                    status_code = 200

                    def raise_for_status(self):
                        return None

                    def json(self):
                        return {"data": [{"b64_json": b64}]}

                def fake_post(url, **kwargs):
                    seen["url"] = url
                    seen["model"] = kwargs["data"]["model"]
                    return FakeResponse()

                with patch("requests.post", side_effect=fake_post):
                    result = inpaint_image(
                        source,
                        "change the background to light gray",
                        api_key="image-test-key",
                    )

                self.assertFalse(result["mocked"])
                self.assertEqual(seen["url"], "https://image-provider.example/v1/images/edits")
                self.assertEqual(seen["model"], "gpt-image-current")
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


class TestLowConsistencyStillDeliversImages(unittest.TestCase):
    """Low consistency scores should not hide generated images."""

    def _report(self, images, score):
        return {
            "task_id": "gen_task",
            "type": "generate",
            "status": "success",
            "data": {
                "images": images,
                "consistency_score": score,
                "platform_file_count": 7,
                "platform_count": 7,
                "platforms": ["amazon_main", "shopify"],
            },
        }

    def test_multi_scene_low_score_is_approved_with_warning(self):
        observer = ObserverAgent()
        images = [
            {"filename": "scene_01_white_bg.jpg", "scene_id": "scene_01_white_bg"},
            {"filename": "scene_02_lifestyle.jpg", "scene_id": "scene_02_lifestyle"},
        ]
        result = observer.supervise("gen_task", self._report(images, 44.8))

        self.assertTrue(result["approved"])
        self.assertTrue(result["issues"])
        self.assertIn("44.8", result["user_message"])
        self.assertEqual(observer.state["generation_result"]["images"], images)
        self.assertTrue(observer.state["generation_ready"])



    def test_single_scene_low_score_skips_consistency_warning(self):
        observer = ObserverAgent()
        images = [{"filename": "scene_02_lifestyle.jpg", "scene_id": "scene_02_lifestyle"}]
        result = observer.supervise("gen_task", self._report(images, 44.8))

        self.assertTrue(result["approved"])
        self.assertFalse(result["issues"])


    def test_no_images_is_still_a_hard_failure(self):
        observer = ObserverAgent()
        result = observer.supervise("gen_task", self._report([], None))

        self.assertFalse(result["approved"])
        self.assertTrue(result["issues"])


    def test_task_route_running_exposes_reference_lock_progress(self):
        try:
            from flask import Flask
            from routes.tasks import register_task_routes
        except ImportError as exc:
            self.skipTest(f"Flask route test skipped: {exc}")

        class Tasks:
            def __init__(self):
                self.progress = {
                    "ref-lock": {
                        "stage": "reference_lock",
                        "message": "english_text 1 english_text",
                        "task_type": "generate",
                        "reference_image_count": 1,
                        "reference_images": ["ref.jpg"],
                    }
                }
                self.results = {"ref-lock": {"status": "running", "task_type": "generate"}}

        app = Flask(__name__)
        register_task_routes(
            app,
            Tasks(),
            {},
            lambda sid: {"messages": [], "conversation_history": []},
            lambda sid, scenes: scenes,
            lambda imgs: [],
            lambda: "csrf",
            lambda token: True,
        )

        data = app.test_client().get("/api/task/ref-lock").get_json()
        self.assertEqual(data["stage"], "reference_lock")
        self.assertEqual(data["reference_image_count"], 1)
        self.assertEqual(data["reference_images"], ["ref.jpg"])

    def test_task_route_returns_images_even_when_supervision_failed(self):
        try:
            from flask import Flask
            from routes.tasks import register_task_routes
        except ImportError as exc:
            self.skipTest(f"Flask route test skipped: {exc}")

        images = [
            {"filename": "scene_02_lifestyle.jpg", "scene_id": "scene_02_lifestyle",
             "url": "/api/image/3ad023f6/final/scene_02_lifestyle.jpg"},
        ]

        class Tasks:
            def __init__(self):
                self.progress = {}
                self.results = {
                    "3ad023f6": {
                        "status": "supervision_failed",
                        "task_type": "generate",
                        "final_reply": "Low consistency score: 44.8/100",
                        "images": images,
                        "consistency_score": 44.8,
                        "platform_file_count": 7,
                        "platforms": ["amazon_main", "shopify"],
                        "download_url": "/api/download/3ad023f6",
                    }
                }

        app = Flask(__name__)
        register_task_routes(
            app,
            Tasks(),
            {},
            lambda sid: {"messages": [], "conversation_history": []},
            lambda sid, scenes: scenes,
            lambda imgs: [{"scene_id": i.get("scene_id"), "status": "done"} for i in imgs],
            lambda: "csrf",
            lambda token: True,
        )

        client = app.test_client()
        resp = client.get("/api/task/3ad023f6")
        data = resp.get_json()

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["status"], "supervision_failed")
        self.assertFalse(data["supervision_approved"])
        self.assertFalse(data["publishable"])
        # english_text€english_text
        self.assertTrue(data["images"])
        self.assertEqual(data["images"][0]["filename"], "scene_02_lifestyle.jpg")
        self.assertEqual(data["download_url"], "/api/download/3ad023f6")
        self.assertEqual(data["platform_file_count"], 7)


if __name__ == "__main__":
    unittest.main()
