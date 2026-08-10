#!/usr/bin/env python3
"""
english_text — english_textagenttext，english_text
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional, Callable

_agent_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _agent_root not in sys.path:
    sys.path.insert(0, _agent_root)

from common.utils import (
    CROSS_BORDER_PLATFORMS,
    format_subprocess_error,
    friendly_image_error_message,
    get_analyze_api_timeout,
    get_analyze_subprocess_timeout,
    get_api_key,
    get_image_api_key,
    resolve_analysis_engine,
    resolve_image_engine,
    resolve_openai_api_key,
)


class AgentToolkit:
    """textagentenglish_text"""

    def __init__(self, script_dir: str, template_dir: str, output_base: str):
        self.script_dir = script_dir
        self.template_dir = template_dir
        self.output_base = output_base

    def _ensure_scripts_path(self):
        if self.script_dir not in sys.path:
            sys.path.insert(0, self.script_dir)

    def _ensure_agent_root(self):
        """Ensure agent/ is on sys.path so common.* imports resolve reliably."""
        agent_root = os.path.abspath(os.path.dirname(self.script_dir))
        if agent_root not in sys.path:
            sys.path.insert(0, agent_root)

    def analyze_product(self, image_paths: list, output_dir: str,
                         api_key: str = "", engine: str = "",
                         model: str = "",
                        log_prefix: str = "Executor",
                        progress_callback: Optional[Callable] = None,
                        cancel_check: Optional[Callable[[], bool]] = None) -> dict:
        """text analyze_product.py"""
        self._ensure_agent_root()
        self._ensure_scripts_path()

        script = os.path.join(self.script_dir, "analyze_product.py")
        profile_path = os.path.join(output_dir, "product_profile.json")
        resolved_engine = resolve_analysis_engine(engine or None)

        if not api_key:
            if resolved_engine == "openai":
                api_key = resolve_openai_api_key()
            else:
                api_key = get_api_key(resolved_engine)

        cmd = [
            sys.executable, script,
            "--images"] + image_paths + [
            "--output", profile_path,
            "--engine", resolved_engine,
        ]
        if api_key:
            cmd += ["--api-key", api_key]
        if model and resolved_engine == "openai":
            cmd += ["--model", model]

        if getattr(sys, "frozen", False):
            if cancel_check and cancel_check():
                raise RuntimeError("cancelled")
            if progress_callback:
                progress_callback(
                    "analyst", "analyze",
                    "english_text...",
                    progress=18,
                )
            from analyze_product import analyze_products

            profile = analyze_products(
                image_paths=image_paths,
                output=profile_path,
                engine=resolved_engine,
                api_key=api_key or None,
                model=model or None,
            )
            return {"profile": profile, "profile_path": profile_path}

        env = os.environ.copy()
        env.setdefault("PYTHONIOENCODING", "utf-8")
        env.setdefault("ANALYZE_API_TIMEOUT", str(get_analyze_api_timeout()))

        subprocess_timeout = get_analyze_subprocess_timeout()
        print(f"  [{log_prefix}] 🔍 english_text（text: {resolved_engine}，text {subprocess_timeout}s）...")

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            encoding="utf-8",
            errors="replace",
        )

        start = time.time()
        last_progress = start
        while proc.poll() is None:
            if cancel_check and cancel_check():
                proc.kill()
                proc.wait(timeout=5)
                raise RuntimeError("cancelled")
            elapsed = time.time() - start
            if elapsed > subprocess_timeout:
                proc.kill()
                proc.wait(timeout=5)
                raise RuntimeError(
                    "API responsetext，english_text；english_text GEMINI_API_KEY"
                )
            if progress_callback and (time.time() - last_progress) >= 18:
                progress_callback(
                    "analyst", "analyze",
                    "english_text，english_textresponsetext...",
                    progress=min(32, 18 + int(elapsed / 30)),
                )
                last_progress = time.time()
            time.sleep(1)

        stdout, stderr = proc.communicate()
        if proc.returncode != 0:
            msg = format_subprocess_error(stdout, stderr, proc.returncode)
            raise RuntimeError(msg)

        profile = {}
        if os.path.exists(profile_path):
            with open(profile_path, "r", encoding="utf-8") as f:
                profile = json.load(f)

        return {"profile": profile, "profile_path": profile_path}

    def match_scenes(self, profile_path: str, output_dir: str,
                     log_prefix: str = "Executor") -> dict:
        """scenetext（english_text，text Windows english_text；failedenglish_text general category）"""
        self._ensure_scripts_path()
        from scene_matcher import build_scene_plan, ensure_minimum_scenes, select_top_scenes

        plan_path = os.path.join(output_dir, "scene_plan.json")
        scene_plan = []

        def _load_profile():
            with open(profile_path, "r", encoding="utf-8-sig") as f:
                return json.load(f)

        def _save_plan(scenes: list, category: str = "general"):
            os.makedirs(output_dir, exist_ok=True)
            profile = _load_profile()
            plan = {
                "product_name": profile.get("product_name", "english_text"),
                "category": category,
                "category_cn": category,
                "total_scenes": len(scenes),
                "scenes": scenes,
                "skipped": [],
            }
            with open(plan_path, "w", encoding="utf-8") as f:
                json.dump(plan, f, ensure_ascii=False, indent=2)

        print(f"  [{log_prefix}] textscenetext...")
        try:
            scene_plan = build_scene_plan(
                profile_path=profile_path,
                output=plan_path,
            )
        except Exception as e:
            print(f"  [{log_prefix}] sceneenglish_text: {e}，text general categorytext...")
            try:
                scene_plan = build_scene_plan(
                    profile_path=profile_path,
                    output=plan_path,
                    category="general",
                )
            except Exception as e2:
                print(f"  [{log_prefix}] general textfailed: {e2}，english_textscene...")
                profile = _load_profile()
                scene_plan = select_top_scenes(profile, count=10, category="general")
                _save_plan(scene_plan, "general")

        if os.path.exists(plan_path) and not scene_plan:
            with open(plan_path, "r", encoding="utf-8") as f:
                plan_data = json.load(f)
                scene_plan = plan_data.get("scenes", [])

        if len(scene_plan) < 5:
            profile = _load_profile()
            scene_plan = ensure_minimum_scenes(profile, scene_plan or [], minimum=5)
            _save_plan(scene_plan, "general")

        return {"scene_plan": scene_plan, "plan_path": plan_path}

    def generate_images(self, profile_path: str, plan_path: str,
                        image_paths: list, output_dir: str,
                        scene_dir: str, api_key: str = "",
                        progress_callback: Optional[Callable] = None,
                        session_id: str = "",
                        auto_engine: bool = False,
                        quality: str = "standard",
                        engine: str = "dalle",
                        confirmed_scenes: list = None,
                        generation_count: Optional[int] = None,
                        agent_name: str = "generator",
                        cancel_check: Optional[Callable[[], bool]] = None) -> dict:
        """english_textgeneration（english_textsceneenglish_text、english_text）"""
        self._ensure_agent_root()
        self._ensure_scripts_path()
        from generate_batch import batch_generate

        engine = resolve_image_engine(engine)
        if not api_key:
            api_key = get_image_api_key(engine)
        print(f"  [{agent_name}] 🎨 english_text: {engine}")
        reference_image_count = len([p for p in (image_paths or []) if os.path.exists(p)])

        with open(profile_path, "r", encoding="utf-8") as f:
            profile = json.load(f)

        scene_plan = []
        if confirmed_scenes:
            scene_plan = list(confirmed_scenes)
        elif os.path.exists(plan_path):
            with open(plan_path, "r", encoding="utf-8") as f:
                plan_data = json.load(f)
                scene_plan = plan_data.get("scenes", [])

        requested_count = generation_count if generation_count and generation_count > 0 else None
        if requested_count:
            scene_plan = scene_plan[:requested_count]

        if not scene_plan:
            scene_plan = [{"scene_id": sid} for sid in [
                "scene_01_white_bg", "scene_02_lifestyle", "scene_03_premium",
                "scene_04_in_use", "scene_05_detail", "scene_06_seasonal",
                "scene_07_atmospheric", "scene_08_comparison",
                "scene_09_review_social", "scene_10_brand_story",
                "scene_11_promo_poster",
            ]][: requested_count or 10]

        raw_dir = os.path.join(output_dir, "raw")
        os.makedirs(raw_dir, exist_ok=True)

        def on_batch_progress(event: dict):
            if not progress_callback:
                return
            done = sum(1 for s in event.get("scenes", [])
                       if s.get("status") in ("done", "failed"))
            total = event.get("total") or len(event.get("scenes", []))
            pct = int(done / total * 100) if total else 0
            progress_callback(
                agent_name, "generate",
                event.get("message", "english_text..."),
                scenes=event.get("scenes", []),
                completed=done,
                total=total,
                progress=pct,
                current_scene=event.get("scene_id"),
            )

        print(f"  [{agent_name}] 🚀 english_textgeneration（{len(scene_plan)} scene）...")
        if progress_callback:
            progress_callback(
                agent_name, "generate",
                f"english_text {len(scene_plan)} text，english_text {reference_image_count} english_text...",
                scenes=[], total=len(scene_plan), completed=0, progress=0,
                reference_image_count=reference_image_count,
            )

        results = batch_generate(
            product_profile=profile,
            reference_images=image_paths,
            scene_plan=scene_plan,
            scene_dir=scene_dir,
            output_dir=raw_dir,
            engine=engine,
            api_key=api_key,
            parallel=True,
            auto_engine=auto_engine,
            quality=quality,
            batch_progress_callback=on_batch_progress,
            cancel_check=cancel_check,
        )

        cancelled = any(r.get("cancelled") for r in results) or (
            cancel_check and cancel_check()
        )

        images = []
        for r in results:
            if r.get("success") and r.get("output_path"):
                fname = os.path.basename(r["output_path"])
                images.append({
                    "filename": fname,
                    "scene_name": r.get("scene_name", Path(fname).stem),
                    "scene_id": r.get("scene_id", ""),
                    "engine": r.get("engine") or r.get("_engine") or engine,
                })

        if progress_callback:
            progress_callback(agent_name, "generate", "allscenetextcompleted，english_text...",
                              completed=len(images), total=len(scene_plan), progress=95)

        if cancelled:
            return {
                "images": images,
                "raw_dir": raw_dir,
                "results": results,
                "cancelled": True,
                "completed_count": len(images),
                "total_count": len(scene_plan),
                "reference_image_count": reference_image_count,
            }

        if not images:
            if results:
                details = []
                for r in results[:3]:
                    err = friendly_image_error_message(
                        r.get("error", ""), r.get("engine", engine)
                    )
                    raw = r.get("raw_error") or ""
                    if raw and raw != err:
                        err = f"{err}（texterror: {raw[:180]}）"
                    details.append(
                        f"{r.get('scene_name') or r.get('scene_id') or 'scene'}[{r.get('engine', engine)}]: {err}"
                    )
                raise RuntimeError("textyesscenegenerationfailed：" + "；".join(details))
            raise RuntimeError(
                "textyesscenegenerationfailed：texttaskenglish_text，english_text API Key、english_text OPENAI_API_BASE/OPENAI_IMAGE_MODEL configuration"
            )

        return {
            "images": images,
            "raw_dir": raw_dir,
            "results": results,
            "reference_image_count": reference_image_count,
        }

    def post_process(self, raw_dir: str, output_dir: str,
                     profile_path: str = "",
                     watermark_path: str = "",
                     brand_name: str = "",
                     color_correct: bool = True,
                     log_prefix: str = "Layout") -> dict:
        """english_text：text、text"""
        self._ensure_scripts_path()
        from style_pipeline import batch_process

        final_dir = os.path.join(output_dir, "final")
        operations = {
            "color_correct": color_correct,
            "product_color_fix": bool(profile_path and os.path.exists(profile_path)),
        }
        if watermark_path and os.path.exists(watermark_path):
            operations["watermark"] = watermark_path
        if brand_name:
            operations["text_watermark"] = brand_name

        print(f"  [{log_prefix}] 🎨 english_text...")
        results = batch_process(
            raw_dir, final_dir, operations,
            profile_path=profile_path or None,
            parallel=True,
        )
        success = sum(1 for r in results if r.get("success"))
        return {
            "final_dir": final_dir,
            "processed_count": success,
            "total": len(results),
            "results": results,
        }

    def layout(self, input_dir: str, output_dir: str,
               brand_name: str = "",
               product_name: str = "",
               template: str = "product_main",
               log_prefix: str = "Layout") -> dict:
        """english_text：text product_main template"""
        self._ensure_scripts_path()
        from layout_engine import batch_layout

        layout_dir = os.path.join(output_dir, "layout")
        variables = {
            "brand_name": brand_name or "text",
            "product_name": product_name or "text",
            "sub_text": "",
            "price_text": "",
        }

        print(f"  [{log_prefix}] 📐 english_text（template: {template}）...")
        results = batch_layout(
            input_dir, layout_dir,
            template_name=template,
            variables=variables,
            parallel=True,
        )
        success = sum(1 for r in results if r.get("success"))
        return {
            "layout_dir": layout_dir,
            "processed_count": success,
            "total": len(results),
            "results": results,
        }

    def platform_adapt(self, input_dir: str, output_dir: str,
                       platforms: list[str],
                       log_prefix: str = "Layout") -> dict:
        """textplatformoutputtext"""
        self._ensure_scripts_path()
        from platform_adapter import export_to_platforms

        platforms_dir = os.path.join(output_dir, "platforms")
        plat_list = platforms or list(CROSS_BORDER_PLATFORMS)

        print(f"  [{log_prefix}] 📱 textplatformtext（{len(plat_list)} textplatform）...")
        results = export_to_platforms(input_dir, platforms_dir, plat_list, parallel=True)

        total_files = sum(r.get("success_count", 0) for r in results.values())
        return {
            "platforms_dir": platforms_dir,
            "platform_results": results,
            "platform_count": len(results),
            "platform_file_count": total_files,
            "platforms": plat_list,
        }

    def check_consistency(self, image_dir: str, profile_path: str,
                          output_dir: str,
                          log_prefix: str = "QA",
                          reference_images: list = None) -> dict:
        """english_textconsistencydetection（failedenglish_text）"""
        self._ensure_scripts_path()
        from consistency_checker import check_batch_consistency

        if not os.path.isdir(image_dir):
            return {
                "consistency_score": None,
                "report_path": "",
                "passed": False,
                "error": f"imageenglish_text: {image_dir}",
            }

        profile = None
        if profile_path and os.path.exists(profile_path):
            with open(profile_path, "r", encoding="utf-8") as f:
                profile = json.load(f)

        exts = (".jpg", ".jpeg", ".png", ".webp")
        image_paths = sorted([
            os.path.join(image_dir, f) for f in os.listdir(image_dir)
            if f.lower().endswith(exts) and not f.startswith("_")
        ])

        if not image_paths:
            return {
                "consistency_score": None,
                "report_path": "",
                "passed": False,
                "error": "english_textdetectiontextimage",
            }

        print(f"  [{log_prefix}] 🔍 textconsistencydetection（{len(image_paths)} text）...")
        result = check_batch_consistency(
            image_paths, profile, reference_images=reference_images,
        )

        report_path = os.path.join(output_dir, "consistency_report.json")
        os.makedirs(output_dir, exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        score = result.get("consistency_score")
        if score is None and "error" in result:
            return {
                "consistency_score": None,
                "report_path": report_path,
                "passed": False,
                "error": result.get("error"),
                "check_result": result,
            }

        return {
            "consistency_score": score,
            "report_path": report_path,
            "passed": result.get("pass", False),
            "check_result": result,
        }

    def fetch_url_image(self, url: str, output_dir: str) -> dict:
        """textproducttext URL english_text output_dir"""
        from common.fetch_url import fetch_product_image
        return fetch_product_image(url, output_dir)

    def score_emotion(self, image_paths: list, scene_plan: list = None) -> dict:
        """english_text hook text（english_text）"""
        self._ensure_scripts_path()
        try:
            from emotion_scorer import score_images
            return score_images(image_paths, scene_plan=scene_plan or [])
        except ImportError:
            return {"emotion_scores": [], "skipped": True, "reason": "emotion_scorer english_text"}

    def localize_copy(self, profile_path: str, markets: list,
                      output_dir: str, log_prefix: str = "Localization") -> dict:
        """english_textcostenglish_text（LLM text，texttemplatetext）"""
        self._ensure_scripts_path()
        from localization import generate_localized_copy

        profile = {}
        if profile_path and os.path.exists(profile_path):
            with open(profile_path, "r", encoding="utf-8") as f:
                profile = json.load(f)

        print(f"  [{log_prefix}] 🌍 textcostenglish_text（{len(markets or [])} english_text）...")
        output_path = os.path.join(output_dir, "localized_copy.json")
        result = generate_localized_copy(profile, markets or ["us"], output_path)
        return {
            "localized_copy_path": output_path,
            "markets": list(result.get("markets", {}).keys()),
            "source": result.get("source"),
            "copy": result.get("markets", {}),
        }

    def localize_scenes(self, plan_path: str, region: str,
                        festival: str = "", log_prefix: str = "Analyst") -> dict:
        """textsceneenglish_text，english_textscene"""
        self._ensure_scripts_path()
        from region_scenes import localize_scene_plan, resolve_region

        if not plan_path or not os.path.exists(plan_path):
            return {"success": False, "error": f"sceneenglish_text: {plan_path}"}
        with open(plan_path, "r", encoding="utf-8") as f:
            plan = json.load(f)

        scenes = plan.get("scenes", [])
        print(f"  [{log_prefix}] 🗺️ sceneenglish_text（{region}"
              f"{'+' + festival if festival else ''}）...")
        plan["scenes"] = localize_scene_plan(scenes, region, festival)
        plan["region"] = resolve_region(region)
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        return {
            "success": True,
            "plan_path": plan_path,
            "region": plan["region"],
            "scene_count": len(plan["scenes"]),
        }

    def check_compliance(self, input_dir: str, platforms: list,
                         output_dir: str, log_prefix: str = "QA") -> dict:
        """platformenglish_text（english_text/english_text/english_text/text）"""
        self._ensure_scripts_path()
        from compliance_checker import check_directory, COMPLIANCE_RULES

        plat_list = [p for p in (platforms or []) if p in COMPLIANCE_RULES]
        if not plat_list:
            plat_list = ["amazon_main"]

        print(f"  [{log_prefix}] 📋 platformenglish_text（{len(plat_list)} textplatform）...")
        report_path = os.path.join(output_dir, "compliance_report.json")
        report = check_directory(input_dir, plat_list, report_path)
        return {
            "compliance_report_path": report_path,
            "pass_rate": report.get("pass_rate"),
            "passed": report.get("failed", 0) == 0,
            "report": report,
        }
