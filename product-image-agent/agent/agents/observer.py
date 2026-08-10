#!/usr/bin/env python3
"""
textagent — Observer Agent

text：textusertext、english_text、texttaskenglish_textagent、english_textreplyuser

english_textyes"english_text"，textyestextyesstatustext AI Agent。
english_textusertextmessageenglish_text，text"english_text"text"english_texttask"。
"""

import json
import os
import sys
import time
import re
from pathlib import Path
from typing import Optional

_agent_root = os.path.join(os.path.dirname(__file__), "..")
if _agent_root not in sys.path:
    sys.path.insert(0, os.path.abspath(_agent_root))

from .orchestrator import (
    OrchestratorBrain,
    format_task_plan_chip,
    resolve_dispatch_intent,
)
from common.utils import CROSS_BORDER_PLATFORMS, normalize_platforms
from common.fetch_url import extract_urls


class ObserverAgent:
    """
    textagent

    english_text：
      1. textusermessage（text+image）
      2. textusertext → Intent
      3. english_texttask → text Task english_text Executor
      4. text Executor english_text
      5. english_text
      6. replyuser

    statustext：
      self.state english_text
    """

    def __init__(self, agent_id: str = "observer_01"):
        self.agent_id = agent_id
        self.blackboard = None  # SharedBlackboard, bound by DualAgentEngine
        self.state = {
            "session_id": "",
            "user_name": "",
            "product_name": "",
            "has_images": False,
            "image_count": 0,
            "profile_ready": False,
            "scenes_ready": False,
            "generation_ready": False,
            "last_intent": "",
            "last_task_id": "",
            "executor_busy": False,
            "executor_last_report": None,
            "errors": [],
            "confirmed_scenes": None,
            "user_preferences": {},
            "generation_result": None,
            "conversation_history": [],
            "pending_questions": [],
            "pending_task_plan": [],
            "event_log": [],
        }
        self.executor = None  # english_text
        self.orchestrator = OrchestratorBrain()
        self._last_understand_mode = "regex"  # "llm" | "regex"

    # ============================================================
    # 1. textusertext
    # ============================================================

    def understand(self, message: str, has_images: bool = False) -> dict:
        """
        textusermessage：text LLM text，failedtextnone Key english_text understand。

        text intent text，english_text task_plan、target_agent、llm_mode fields。
        """
        plan = self.plan_message(message, has_images)
        intent_result = plan.get("intent_result", {})
        self._clear_answered_questions(intent_result)
        self._append_event("understand", {"intent": intent_result.get("intent"), "mode": self._last_understand_mode})
        return intent_result

    def _resolve_intent(self, message: str, prompt_state: dict, has_images: bool) -> dict:
        """LLM english_text，failed/none Key english_text。"""
        llm_result = self.orchestrator.understand_with_llm(message, prompt_state, has_images)
        if llm_result:
            self._last_understand_mode = "llm"
            return self._build_intent_from_llm(llm_result, message, has_images)
        self._last_understand_mode = "regex"
        return self._understand_regex(message, has_images)

    def plan_message(self, message: str, has_images: bool = False) -> dict:
        """Build a global plan and normalized intent in one shot."""
        prompt_state = self._build_prompt_state()
        intent_result = self._resolve_intent(message, prompt_state, has_images)
        plan = self.orchestrator.plan(message, prompt_state, has_images, intent=intent_result)
        intent_result = self._merge_plan_into_intent(intent_result, plan)
        self._append_event("plan_built", {
            "intent": intent_result.get("intent"),
            "dispatch_intent": intent_result.get("dispatch_intent"),
            "risk": plan.get("risk_level"),
        })
        return {
            "plan": plan,
            "intent_result": intent_result,
        }

    def replan(self, message: str, reason: str, has_images: bool = False, last_plan: Optional[dict] = None) -> dict:
        """Rebuild a plan after failure, supervision issues, or context changes."""
        prompt_state = self._build_prompt_state()
        prompt_state["replan_reason"] = reason
        prompt_state["last_plan"] = last_plan or {}
        prompt_state["last_reason"] = reason
        intent_result = self._resolve_intent(message, prompt_state, has_images)
        plan = self.orchestrator.plan(message, prompt_state, has_images, intent=intent_result)
        plan["replan_reason"] = reason
        plan["is_replan"] = True
        intent_result = self._merge_plan_into_intent(intent_result, plan)
        intent_result["replan_reason"] = reason
        self._append_event("replan", {
            "reason": reason,
            "risk_level": intent_result.get("risk_level", plan.get("risk_level", "medium")),
        })
        if self.blackboard:
            self.blackboard.append_event(self.agent_id, "replan", {
                "reason": reason,
                "plan_version": getattr(self.blackboard, "plan_version", 0),
                "risk_level": intent_result.get("risk_level", plan.get("risk_level", "medium")),
            })
            self.blackboard.save()
        return {
            "plan": plan,
            "intent_result": intent_result,
        }

    def _build_prompt_state(self) -> dict:
        """Build a stable prompt snapshot for the orchestrator."""
        prompt_state = dict(self.state)
        prompt_state["session_context"] = self.orchestrator_context()
        prompt_state["memory_context"] = self._build_memory_context()
        registry = getattr(self.executor, "registry", None)
        if registry is not None:
            prompt_state["capabilities"] = registry.capabilities()
        return prompt_state

    def _append_event(self, action: str, detail: dict | None = None) -> None:
        event = {
            "action": action,
            "detail": detail or {},
            "ts": time.time(),
        }
        self.state.setdefault("event_log", []).append(event)
        self.state["event_log"] = self.state["event_log"][-100:]
        if self.blackboard:
            self.blackboard.append_event(self.agent_id, action, detail or {})
            self.blackboard.save()

    def _build_intent_from_llm(self, llm_result: dict, message: str, has_images: bool) -> dict:
        """text LLM english_text intent text"""
        extracted = dict(llm_result.get("extracted") or {})

        # english_text：textimagetext、generationtext
        intent_name = llm_result.get("intent", "unknown")
        forced_product_flow = False
        effective_has_images = has_images or self.state.get("has_images", False)
        if (
            intent_name in ("web_search", "research", "browse")
            and effective_has_images
            and self._message_requests_product_flow(message)
        ):
            intent_name = self._product_flow_intent(message)
            forced_product_flow = True

        if intent_name == "feedback":
            extracted.update(self._extract_feedback(message))
        elif intent_name in ("confirm_generate", "regenerate", "upload", "ask_analyze"):
            regex_opts = self._extract_generation_options(message)
            for k, v in regex_opts.items():
                extracted.setdefault(k, v)

        task_plan = self._product_flow_task_plan(intent_name, message) if forced_product_flow else list(llm_result.get("task_plan") or [])
        if self._has_generation_step(intent_name, task_plan):
            self._remember_pending_generation_constraints(extracted, message)

        dispatch_intent, target_agent, remaining = resolve_dispatch_intent({
            "intent": intent_name,
            "task_plan": task_plan,
            "target_agent": llm_result.get("target_agent", "executor"),
        })
        if remaining:
            self.state["pending_task_plan"] = remaining

        self.state["last_intent"] = intent_name
        self._sync_options_to_blackboard(extracted)

        return {
            "intent": intent_name,
            "dispatch_intent": dispatch_intent,
            "confidence": llm_result.get("confidence", 0.7),
            "extracted": extracted,
            "task_plan": task_plan,
            "target_agent": target_agent,
            "reply_hint": llm_result.get("reply_hint", ""),
            # english_textflowtext，LLM textreplyenglish_textyesenglish_text，english_text
            "llm_reply": "" if forced_product_flow else llm_result.get("llm_reply", ""),
            "llm_mode": True,
            "raw_message": message,
            "has_images": has_images,
        }

    def _merge_plan_into_intent(self, intent_result: dict, plan: dict) -> dict:
        """english_textrisk/english_text intent text。"""
        merged = dict(intent_result or {})
        merged["plan"] = plan
        merged["needs_clarification"] = plan.get("needs_clarification", False)
        merged["clarification_questions"] = plan.get("clarification_questions", [])
        merged["risk_level"] = plan.get("risk_level", "medium")
        if not merged.get("task_plan") and plan.get("plan"):
            merged["task_plan"] = list(plan.get("plan") or [])
        return merged

    def _understand_regex(self, message: str, has_images: bool = False) -> dict:
        """english_text：textuserenglish_textmessage，english_text。"""
        msg = message.strip().lower()

        # ---------- english_text ----------
        intent = "unknown"
        confidence = 0.5
        extracted = {}
        msg_no_urls = re.sub(r"https?://\S+", " ", message, flags=re.I).strip().lower()

        effective_has_images = has_images or self.state.get("has_images", False)

        # yestext/english_text，“text/generation”english_textplatformenglish_textsearch。
        if effective_has_images and self._message_requests_product_flow(message):
            intent = self._product_flow_intent(message)
            confidence = 0.96 if intent == "confirm_generate" else 0.9

        # userenglish_text、english_text
        elif not message and not has_images:
            intent = "greet"
            confidence = 1.0
        elif re.search(r"(text|text|text|english_text|english_text|english_text)|\b(hi|hello)\b", msg):
            intent = "greet"
            confidence = 1.0

        # platformtext/product researchtext：usertext Etsy/Amazon textplatformenglish_textyesenglish_textsearch。
        # “english_textplatform/english_text”english_text，textyesenglish_textagent。
        elif re.search(
            r"(text.*(etsy|amazon|temu|tiktok|english_text)|"
            r"(etsy|amazon|temu|tiktok|english_text).*(textyes|text|vs|text).*"
            r"(etsy|amazon|temu|tiktok|english_text)|"
            r"textplatform|platform.*text|text.*platform)",
            msg_no_urls or msg,
            re.I,
        ):
            intent = "research_product"
            confidence = 0.9

        # english_text：searchtext / english_text（english_text upload）
        elif re.search(
            r"(english_text|searchtext|english_text|english_text|english_text|english_text|english_text|etsy|amazon|text.*text|english_text|english_text)",
            msg_no_urls or msg,
        ):
            if re.search(r"https?://", message, re.I):
                intent = "research"
                confidence = 0.9
                extracted["urls"] = extract_urls(message)
                extracted["search_query"] = self._extract_search_query(message)
            else:
                intent = "web_search"
                confidence = 0.9
                extracted["search_query"] = self._extract_search_query(message)

        elif re.search(r"https?://", message, re.I) and re.search(
            r"(text|text|text|browse|fetch|english_text|english_text|producttext)", msg
        ):
            intent = "browse"
            confidence = 0.92
            extracted["urls"] = extract_urls(message)

        elif re.search(r"https?://", message, re.I) and not has_images:
            intent = "browse"
            confidence = 0.85
            extracted["urls"] = extract_urls(message)

        # english_textimage（text URL text）
        elif has_images:
            intent = "upload"
            confidence = 1.0
            extracted["image_count"] = self.state["image_count"]
            if re.search(r"https?://", message, re.I):
                extracted["from_url"] = True

        # english_text
        elif re.search(r"(text|text|textyestext|describe|text|text)", msg):
            if self.state["has_images"]:
                intent = "ask_analyze"
                confidence = 0.95
            else:
                intent = "need_image_first"
                confidence = 1.0

        # product researchtext：「english_text/english_text/product researchtext」→ english_text
        elif re.search(r"(english_text|english_text|english_text|product researchtext|english_text|english_text(text|listing|text))", msg):
            intent = "research_product"
            confidence = 0.9

        # english_text（english_text + english_text：english_text，english_text）
        # text「generation」english_text：english_text「logo」（text go）、「text/text」english_text
        elif self.state.get("generation_result") and re.search(
            r"(text|text|text|text|text|text|text|text.{1,30}(text|text|text|text)|"
            r"english_text|english_text|english_text)", msg
        ):
            intent = "edit_image"
            confidence = 0.9

        # textgeneration
        elif re.search(r"(textgeneration|text|text|regenerate|textgeneration)", msg):
            if self.state["has_images"]:
                intent = "regenerate"
                confidence = 0.9
            else:
                intent = "need_image_first"
                confidence = 1.0

        elif re.search(r"(generation|text|\bgo\b|create|generate|text|text|text|text|text)", msg):
            if self.state["profile_ready"]:
                intent = "confirm_generate"
                confidence = 0.95
            elif self.state["has_images"]:
                intent = "ask_analyze"
                confidence = 0.8
            else:
                intent = "need_image_first"
                confidence = 1.0

        # textscene
        elif re.search(r"(text|text|text|text|text|text|text|text|change|modify|remove|keep)", msg):
            intent = "adjust_scene"
            confidence = 0.9
            # english_textsceneenglish_text
            for keyword in ["text", "text", "text", "text", "text",
                            "text", "text", "text", "text", "text",
                            "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]:
                if keyword in msg:
                    extracted["mentioned_scenes"] = extracted.get("mentioned_scenes", [])
                    extracted["mentioned_scenes"].append(keyword)

        # text（text/english_text）
        elif re.search(r"(text|english_text|text|english_text|english_text|english_text|nice|bad| ugly|beautiful)", msg):
            intent = "feedback"
            confidence = 0.85
            extracted.update(self._extract_feedback(message))

        # A/B text
        elif re.search(r"(a/b|abtext|ab test|text|english_text)", msg):
            if self.state["has_images"]:
                intent = "ab_test"
                confidence = 0.9
            else:
                intent = "need_image_first"
                confidence = 1.0

        # textgeneration — text「textgeneration」english_text

        # textgenerationtext（text、platform、text、text）
        if intent in ("confirm_generate", "regenerate", "upload", "ask_analyze"):
            extracted.update(self._extract_generation_options(message))
            product_hints = self._extract_product_hints(message)
            if product_hints:
                extracted["product_hints"] = product_hints
                self.state["product_hints"] = product_hints
            if self._has_generation_step(intent, []):
                self._remember_pending_generation_constraints(extracted, message)
            if intent == "ask_analyze" and re.search(r"(generation|text|create|generate|go|text|text)", message, re.I):
                self.state["pending_task_plan"] = [{
                    "step": "generate",
                    "agent": "generator",
                    "reason": "userenglish_textgeneration",
                }]
                self._remember_pending_generation_constraints(extracted, message)

        # text/text
        elif re.search(r"(text|text|export|download|text|zip)", msg):
            if self.state["generation_result"]:
                intent = "download"
                confidence = 1.0
            else:
                intent = "need_generate_first"
                confidence = 1.0

        # english_text
        elif re.search(r"(text|text|text|ok|text|english_text|thank|thanks)", msg):
            intent = "chat"
            confidence = 1.0

        # english_textstatus
        self.state["last_intent"] = intent

        intent_result = {
            "intent": intent,
            "dispatch_intent": intent,
            "confidence": confidence,
            "extracted": extracted,
            "raw_message": message,
            "has_images": has_images,
            "llm_mode": False,
        }
        self._sync_options_to_blackboard(extracted)
        return intent_result

    def _sync_options_to_blackboard(self, extracted: dict):
        """Write extracted generation options to shared blackboard."""
        if not self.blackboard or not extracted:
            return
        partial = {}
        for key in ("brand_name", "watermark_path", "platforms", "quality", "auto_engine"):
            if key in extracted:
                partial[key] = extracted[key]
        if partial:
            self.blackboard.update(partial, agent_id=self.agent_id)
            self.blackboard.save()
            self._append_event("sync_options", partial)

    def _extract_feedback(self, message: str) -> dict:
        """textusermessageenglish_text/english_textimage"""
        msg = message.strip()
        is_positive = bool(re.search(r"(text|text|text|nice|good|beautiful|english_text)", msg, re.I))
        is_negative = bool(re.search(r"(english_text|english_text|text|bad|ugly|english_text|english_text)", msg, re.I))

        liked, disliked = [], []
        gen_result = self.state.get("generation_result") or {}
        images = gen_result.get("images", [])

        for img in images:
            fname = img.get("filename", "")
            scene_name = img.get("scene_name", "")
            scene_id = img.get("scene_id", "")
            matched = any(k and k in msg for k in [fname, scene_name, scene_id])
            if not matched:
                for keyword in ["text", "text", "text", "text", "text", "text", "text", "text", "text", "text"]:
                    if keyword in msg and keyword in (scene_name or ""):
                        matched = True
                        break
            if matched:
                if is_positive:
                    liked.append(fname)
                elif is_negative:
                    disliked.append(fname)

        if not liked and not disliked:
            if is_positive and images:
                liked = [images[0].get("filename", "")]
            elif is_negative and len(images) > 1:
                disliked = [images[-1].get("filename", "")]

        scene_details = {}
        for img in images:
            fname = img.get("filename", "")
            if fname:
                scene_details[fname] = {
                    "scene_id": img.get("scene_id", fname),
                    "emotion": img.get("emotion", ""),
                }

        return {"liked": liked, "disliked": disliked, "scene_details": scene_details}

    def _extract_generation_options(self, message: str) -> dict:
        """textmessageenglish_text、platform、text、english_textsceneenglish_text"""
        opts = {}
        brand_match = re.search(r"(?:english_text|text|brand)[:：]\s*(.+)", message, re.I)
        if brand_match:
            opts["brand_name"] = brand_match.group(1).strip().split()[0]

        if re.search(r"(text|cross[- ]?border|textplatform|text)", message, re.I):
            if re.search(r"(all|textyes|all|every)", message, re.I):
                opts["platforms"] = list(CROSS_BORDER_PLATFORMS)

        platform_match = re.search(r"(?:platform|platforms?)[:：]\s*(.+)", message, re.I)
        if platform_match:
            raw = platform_match.group(1).strip()
            raw = re.split(
                r"\s*(?:english_text|premium|automatictext|auto[- ]?engine|generation|text|text|text|text|markets?[:：]|region[:：]|festival[:：])",
                raw, flags=re.I,
            )[0]
            raw = raw.strip(" ，,")
            platforms = normalize_platforms(raw)
            if platforms:
                opts["platforms"] = platforms
        elif re.search(r"(platform|platform)", message, re.I):
            platform_names = re.findall(
                r"(amazon|shopify|lazada|shopline|etsy|alibaba|english_text|english_text|english_text|text|english_text|text)",
                message,
                re.I,
            )
            platforms = normalize_platforms(platform_names)
            if platforms:
                opts["platforms"] = platforms

        if re.search(r"(premium|english_text|text|text)", message, re.I):
            opts["quality"] = "premium"
        if re.search(r"(auto[- ]?engine|automatictext|english_text|english_text)", message, re.I):
            opts["auto_engine"] = True

        wm_match = re.search(r"(?:text|watermark)[:：]\s*(.+)", message, re.I)
        if wm_match:
            opts["watermark_path"] = wm_match.group(1).strip().split()[0]

        # textlocalenglish_text：text（english_text）、text（sceneenglish_text）、textscene
        markets_match = re.search(r"(?:text|markets?)[:：]\s*([a-z0-9,\s]+)", message, re.I)
        if markets_match:
            markets = [m for m in re.split(r"[,\s，]+", markets_match.group(1).strip().lower()) if m]
            if markets:
                opts["markets"] = markets
        region_match = re.search(r"(?:text|region)[:：]\s*([a-z]+)", message, re.I)
        if region_match:
            opts["region"] = region_match.group(1).strip().lower()
        festival_match = re.search(r"(?:text|festival)[:：]\s*([a-z_]+)", message, re.I)
        if festival_match:
            opts["festival"] = festival_match.group(1).strip().lower()

        opts.update(self._extract_scene_constraints(message))
        return opts

    def _extract_product_hints(self, message: str) -> dict:
        """Extract user-authored product facts that should override weak visual guesses."""
        msg = message or ""
        hints = {}
        facts = []

        def has_any(*words: str) -> bool:
            return any(w and w in msg for w in words)

        if has_any("text", "english_text", " fountain pen", "pen"):
            facts.append("english_text")
            hints["product_type"] = "pen"
            hints["product_name"] = "english_text"
            hints["product_name_cn"] = "english_text"
            hints["category"] = "writing instrument gift set"
            hints["category_cn"] = "english_text"

        if has_any("text", "text", "text", "english_text", "text"):
            facts.append("english_text/english_text")

        if has_any("english_text", "english_text", "english_text", "text"):
            facts.append("english_text")

        if has_any("english_text", "english_text", "text"):
            facts.append("english_text")

        if has_any("english_text", "english_text", "text", "text"):
            facts.append("english_text")

        if facts:
            hints["user_facts"] = list(dict.fromkeys(facts))
            hints["description"] = "、".join(hints["user_facts"])
        return hints

    def _message_requests_product_flow(self, message: str) -> bool:
        """Whether a message is asking to continue product analysis/generation."""
        msg = message or ""
        return bool(
            re.search(r"(text|text|text|generation|text|create|generate|go|text)", msg, re.I)
            or re.search(r"(text|text|only).{0,12}text", msg, re.I)
        )

    def _product_flow_intent(self, message: str) -> str:
        """Choose analyze vs generate for product-flow messages from current state."""
        msg = message or ""
        wants_generate = bool(re.search(r"(generation|text|create|generate|go|text|text)", msg, re.I))
        wants_analyze = bool(re.search(r"(text|text|text)", msg, re.I))
        if wants_generate and self.state.get("profile_ready") and not wants_analyze:
            return "confirm_generate"
        if wants_generate and self.state.get("profile_ready") and wants_analyze:
            return "confirm_generate"
        return "ask_analyze"

    def _has_generation_step(self, intent_name: str, task_plan: list) -> bool:
        if intent_name in ("confirm_generate", "regenerate"):
            return True
        return any((step or {}).get("step") in ("generate", "regenerate", "layout") for step in task_plan or [])

    def _product_flow_task_plan(self, intent_name: str, message: str) -> list:
        wants_generate = bool(re.search(r"(generation|text|create|generate|go|text|text)", message or "", re.I))
        if intent_name == "ask_analyze" and wants_generate:
            return [
                {"step": "analyze", "agent": "analyst", "reason": "userenglish_text"},
                {"step": "generate", "agent": "generator", "reason": "textcompletedenglish_textgeneration"},
            ]
        return []

    def _remember_pending_generation_constraints(self, extracted: dict, message: str) -> None:
        """Persist scope hints so chained analyze -> generate can apply them after scene matching."""
        constraints = {
            key: extracted.get(key)
            for key in ("scene_selectors", "generation_count")
            if extracted.get(key) is not None
        }
        if constraints:
            constraints["raw_message"] = message
            self.state["pending_generation_constraints"] = constraints

    def _extract_scene_constraints(self, message: str) -> dict:
        """Parse user requests like “textgenerationtext2textscene/english_text/1text”."""
        msg = message or ""
        opts = {}
        selectors = []

        count = self._extract_requested_image_count(msg)
        if count:
            opts["generation_count"] = count

        for m in re.finditer(r"text\s*([english_text\d]+)\s*(?:text)?\s*(?:scene|text|text)?", msg):
            number = self._parse_cn_number(m.group(1))
            if number:
                selectors.append({"type": "index", "value": number - 1})

        for m in re.finditer(r"scene[_-]?(\d{1,2})", msg, re.I):
            number = int(m.group(1))
            selectors.append({"type": "id_prefix", "value": f"scene_{number:02d}"})

        keyword_map = [
            ("text|english_text|text|white", "scene_01_white_bg"),
            ("english_text|textscene|lifestyle", "scene_02_lifestyle"),
            ("text|text|premium", "scene_03_premium"),
            ("text|textscene|in use", "scene_04_in_use"),
            ("text|detail", "scene_05_detail"),
            ("text|text|season", "scene_06_seasonal"),
            ("text|atmosphere", "scene_07_atmospheric"),
            ("text|text|comparison", "scene_08_comparison"),
            ("text|text|review", "scene_09_review_social"),
            ("english_text|text|story", "scene_10_brand_story"),
            ("text|english_text|english_text|banner|poster", "scene_11_promo_poster"),
        ]
        for pattern, scene_id in keyword_map:
            if re.search(pattern, msg, re.I):
                selectors.append({"type": "scene_id", "value": scene_id})

        scene_plan = self.state.get("scene_plan") or []
        for scene in scene_plan:
            names = [
                scene.get("scene_name", ""),
                scene.get("scene_name_cn", ""),
                scene.get("scene_id", ""),
            ]
            if any(name and name in msg for name in names):
                selectors.append({"type": "scene_id", "value": scene.get("scene_id", "")})

        selectors = self._unique_selectors(selectors)
        if selectors:
            opts["scene_selectors"] = selectors
            selected = self._resolve_scene_selectors(scene_plan, selectors, count)
            if selected:
                opts["selected_scenes"] = selected
        elif count == 1 and re.search(r"(text|text|only|textgenerationtext|english_text)", msg, re.I):
            selected = self._resolve_scene_selectors(scene_plan, [], count)
            if selected:
                opts["selected_scenes"] = selected

        return opts

    def _extract_requested_image_count(self, message: str) -> Optional[int]:
        m = re.search(r"([english_text\d]+)\s*text", message)
        if not m:
            return None
        return self._parse_cn_number(m.group(1))

    def _parse_cn_number(self, raw: str) -> Optional[int]:
        raw = str(raw).strip()
        if raw.isdigit():
            return int(raw)
        mapping = {
            "text": 1, "text": 2, "text": 2, "text": 3, "text": 4, "text": 5,
            "text": 6, "text": 7, "text": 8, "text": 9, "text": 10,
        }
        if raw in mapping:
            return mapping[raw]
        if raw.startswith("text") and len(raw) == 2:
            return 10 + mapping.get(raw[1], 0)
        if raw.endswith("text") and len(raw) == 2:
            return mapping.get(raw[0], 0) * 10
        if "text" in raw:
            left, right = raw.split("text", 1)
            return mapping.get(left, 1) * 10 + mapping.get(right, 0)
        return None

    def _unique_selectors(self, selectors: list) -> list:
        seen = set()
        out = []
        for selector in selectors:
            key = (selector.get("type"), selector.get("value"))
            if key in seen or selector.get("value") in ("", None):
                continue
            seen.add(key)
            out.append(selector)
        return out

    def _resolve_scene_selectors(self, scene_plan: list, selectors: list, count: Optional[int] = None) -> list:
        if not scene_plan:
            return []

        by_id = {scene.get("scene_id", ""): scene for scene in scene_plan}
        selected = []

        # Prefer explicit scene names/keywords over ordinal references if both are present.
        scene_id_selectors = [s for s in selectors if s.get("type") in ("scene_id", "id_prefix")]
        index_selectors = [s for s in selectors if s.get("type") == "index"]
        ordered_selectors = scene_id_selectors or index_selectors

        for selector in ordered_selectors:
            scene = None
            if selector.get("type") == "index":
                idx = selector.get("value")
                if isinstance(idx, int) and 0 <= idx < len(scene_plan):
                    scene = scene_plan[idx]
            elif selector.get("type") == "id_prefix":
                prefix = selector.get("value", "")
                scene = next((s for s in scene_plan if s.get("scene_id", "").startswith(prefix)), None)
            else:
                scene = by_id.get(selector.get("value"))
            if scene and scene not in selected:
                selected.append(scene)

        if not selected and count == 1:
            selected = [scene_plan[0]]
        if count and count > 0:
            selected = selected[:count]
        return selected

    def _extract_search_query(self, message: str) -> str:
        """textusermessagetextsearchkeywords"""
        msg = message.strip()
        for pat in [
            r"(?:text|search|text|english_text|english_text)[：:\s]*(.+)",
            r"(?:text|english_text|english_text)[：:\s]*(.+)",
            r"(?:etsy|amazon|text|english_text)text(.+)",
        ]:
            m = re.search(pat, msg, re.I)
            if m:
                q = m.group(1).strip().rstrip("。！？!?")
                q = re.sub(r"https?://\S+", "", q).strip()
                if q:
                    return q
        cleaned = re.sub(r"https?://\S+", "", msg).strip()
        return cleaned or msg

    def orchestrator_context(self) -> dict:
        """Context snapshot for LLM orchestrator prompts."""
        if self.blackboard:
            return self.blackboard.to_context_dict()
        return {"session_id": self.state.get("session_id", ""), "observer_state": self.state}

    def _build_memory_context(self) -> dict:
        """Extract long-term memory for planning."""
        # english_textusertext（textplatform/text/text/english_text），textfailedenglish_text
        try:
            from common.user_memory import summary as user_memory_summary
            user_profile = user_memory_summary()
        except Exception:  # noqa: BLE001
            user_profile = {}

        if not self.blackboard:
            return {"user_profile": user_profile} if user_profile else {}
        memory = self.blackboard.get("memory_profile", {}) or {}
        reflections = self.blackboard.get_reflection_history(limit=10)
        reflection_summary = self.blackboard.get_reflection_summary(limit=5)
        return {
            "user_preferences": memory.get("user_preferences", {}),
            "user_profile": user_profile,
            "project_memory": memory.get("project_memory", {}),
            "success_patterns": memory.get("success_patterns", [])[-10:],
            "failure_patterns": memory.get("failure_patterns", [])[-10:],
            "recent_reflections": reflections,
            "reflection_summary": reflection_summary,
        }

    def post_task_reflect(self, task: dict, executor_report: dict, supervision: dict) -> dict:
        """Create a lightweight reflection and write it back to memory."""
        task_type = task.get("type", "")
        status = executor_report.get("status", "")
        approved = supervision.get("approved", False)
        reflection = {
            "task_type": task_type,
            "status": status,
            "approved": approved,
            "reason": supervision.get("feedback", ""),
            "timestamp": time.time(),
        }
        if self.blackboard:
            mem = self.blackboard.memory_profile
            if approved and status != "error":
                mem.setdefault("success_patterns", []).append(reflection)
                mem["success_patterns"] = mem["success_patterns"][-50:]
            else:
                mem.setdefault("failure_patterns", []).append(reflection)
                mem["failure_patterns"] = mem["failure_patterns"][-50:]
            self.blackboard.save()
        # text v2：english_text（reviewtextwriteenglish_textfile，english_text）
        try:
            from common.memory_store import write_card
            product = self.state.get("product_name", "")
            data = executor_report.get("data", {}) or {}
            card = {
                "task": f"{task_type} {product}".strip(),
                "outcome": "success" if approved else "textpassed",
            }
            if approved and status != "error":
                score = data.get("consistency_score") or self.state.get(
                    "generation_result", {}).get("consistency_score")
                detail = f"{task_type} completed"
                if score:
                    detail += f"，consistency {score}"
                if product:
                    detail += f"，text {product}"
                card["success"] = detail
            else:
                card["avoid"] = (f"{task_type} failed：" +
                                 str(supervision.get("feedback", "") or
                                     data.get("error", ""))[:120])
            write_card(card)
            # english_text：english_texttaskenglish_textlocal + syncplatform
            try:
                from common.working_memory import record_task
                record_task(
                    task_type=task_type,
                    product_name=self.state.get("product_name", ""),
                    status="completed" if approved else "failed",
                    score=data.get("consistency_score"),
                    duration_seconds=data.get("duration", 0),
                    metadata={"session_id": self.state.get("session_id", "")},
                )
            except Exception:  # noqa: BLE001 — english_textwritefailedenglish_text
                pass
        except Exception:  # noqa: BLE001 — english_textfailedenglish_text
            pass
        self._append_event("post_task_reflect", reflection)
        return reflection

    _DEFAULT_PLATFORMS = CROSS_BORDER_PLATFORMS  # canonical ids; compare with list(...)

    def _build_proactive_questions(self, intent_name: str, extracted: Optional[dict] = None) -> list:
        """
        english_textstatustextgenerationenglish_text。
        text: [{"id": str, "text": str, "chips": [str, ...]}, ...]
        """
        extracted = extracted or {}
        ctx = self.state
        prefs = ctx.get("user_preferences", {})
        asked = set(ctx.get("pending_questions", []))
        questions = []

        def add(q_id: str, text: str, chips: Optional[list] = None):
            if q_id in asked:
                return
            questions.append({"id": q_id, "text": text, "chips": chips or []})
            asked.add(q_id)

        has_brand = bool(prefs.get("brand_name") or extracted.get("brand_name"))
        platforms = prefs.get("platforms") or list(CROSS_BORDER_PLATFORMS)
        is_default_platforms = platforms == list(CROSS_BORDER_PLATFORMS)
        has_product = bool(ctx.get("product_name"))

        if intent_name == "upload":
            if not has_product:
                add("product_info", "textyesenglish_text？", ["english_text"])
            add("platform_target", "english_textplatform？（english_text / Shopify / Lazada english_textplatform）", ["textplatform"])
            if not has_brand:
                add("brand_logo", "yesenglish_text Logo text？textyesenglish_text。", ["english_text"])

        elif intent_name == "greet":
            if ctx["has_images"] and not ctx.get("profile_ready"):
                add("analyze_prompt", "english_text，english_text？", ["english_text", "textgeneration"])

        elif intent_name in ("unknown", "chat"):
            if ctx["has_images"] and not ctx.get("profile_ready"):
                add("analyze_prompt", "english_text，english_text？", ["english_text"])
            elif ctx.get("profile_ready") and not ctx.get("generation_ready"):
                self._add_pre_generate_questions(add, prefs, has_brand, is_default_platforms)

        elif intent_name == "confirm_generate":
            self._add_pre_generate_questions(add, prefs, has_brand, is_default_platforms)

        elif intent_name == "post_analyze":
            add("scene_confirm", "english_textsceneenglish_text？english_textyestextgeneration？", ["textgeneration", "textscene"])
            if is_default_platforms:
                add("platform_target", "textplatformenglish_textalltextplatform，english_text？", ["textplatform"])
            add("watermark_need", "english_text？yesenglish_text。", [])
            add("style_pref", "english_textyesenglish_text？（english_text / textscenetext / english_text）", [])

        elif intent_name == "post_generate_issues":
            add("retry_failed", "english_textfailedtextscenetext？", ["textgeneration"])
            add("adjust_scenes", "english_textscene？", ["textscene"])

        elif intent_name == "post_generate_low_score":
            add("retry_low_score", "consistencyenglish_text，english_textgenerationtextyesenglish_textscene？", ["textgeneration", "textscene"])

        elif intent_name in ("web_search", "browse", "research"):
            add("research_followup", "english_textsearchenglish_text，textyesenglish_text？", ["searchtext", "english_text"])

        elif intent_name == "unknown":
            last_msg = ""
            hist = ctx.get("conversation_history") or []
            if hist:
                last_msg = hist[-1].get("user", "")
            if re.search(r"(text|text|text|etsy|amazon)", last_msg, re.I):
                add("suggest_research", "english_text？", ["searchtext"])

        ctx["pending_questions"] = list(asked)
        return questions

    def _add_pre_generate_questions(self, add, prefs, has_brand, is_default_platforms):
        """generationenglish_text"""
        configured = []
        missing = []
        if has_brand:
            configured.append(f"text: {prefs.get('brand_name')}")
        else:
            missing.append("english_text")
        plat = prefs.get("platforms") or list(CROSS_BORDER_PLATFORMS)
        plat_labels = {
            "amazon_main": "english_text", "amazon_detail": "english_text",
            "shopify": "Shopify", "lazada": "Lazada", "shopline": "Shopline",
            "etsy": "Etsy", "alibaba": "english_text",
            "taobao_main": "text", "xiaohongshu": "english_text", "jd_main": "text",
        }
        plat_str = "、".join(plat_labels.get(p, p) for p in plat)
        configured.append(f"platform: {plat_str}")
        if is_default_platforms:
            missing.append("platform（english_text）")
        quality = prefs.get("quality", "standard")
        configured.append(f"text: {'english_text' if quality == 'premium' else 'text'}")
        if prefs.get("auto_engine"):
            configured.append("english_text: english_text")
        else:
            missing.append("english_text（english_text）")

        checklist = f"textconfiguration {' · '.join(configured)}"
        if missing:
            checklist += f"；text {'、'.join(missing)}"
        add("pre_generate_checklist", checklist + "。textnoneenglish_textgeneration？", ["textgeneration", "english_text", "textplatform", "A/Btext"])

        if not has_brand:
            add("brand_name", "english_text，english_text？", ["english_text"])
        if is_default_platforms:
            add("platform_default", "textalltextplatform，english_text？", ["textplatform"])

    def _format_proactive_section(self, questions: list) -> str:
        """english_textreply（ChatGPT text）"""
        if not questions:
            return ""
        lines = [""]
        if len(questions) == 1:
            lines.append(f"💬 {questions[0]['text']}")
        else:
            lines.append("💬 english_text，english_text：")
            for q in questions:
                lines.append(f"- {q['text']}")
        return "\n".join(lines)

    def _collect_quick_replies(self, questions: list) -> list:
        """english_textreply chip text（english_text）"""
        chips = []
        for q in questions:
            chips.extend(q.get("chips", []))
        return list(dict.fromkeys(chips))

    def _clear_answered_questions(self, intent: dict):
        """userenglish_text，english_text pending text，english_text"""
        intent_name = intent.get("intent", "")
        extracted = intent.get("extracted", {})
        prefs = self.state.get("user_preferences", {})
        pending = list(self.state.get("pending_questions", []))
        clear_ids = set()

        if extracted.get("brand_name") or prefs.get("brand_name"):
            clear_ids.update(["brand_logo", "brand_name"])
        if extracted.get("platforms"):
            clear_ids.update(["platform_target", "platform_default"])
        if extracted.get("watermark_path") or prefs.get("watermark_path"):
            clear_ids.add("watermark_need")
        if intent_name == "ask_analyze":
            clear_ids.add("analyze_prompt")
        if intent_name == "confirm_generate":
            clear_ids.update([
                "pre_generate_checklist", "brand_name", "platform_default",
                "scene_confirm", "post_analyze",
            ])
        if intent_name == "adjust_scene":
            clear_ids.update(["scene_confirm", "adjust_scenes", "retry_failed"])
        if intent_name == "regenerate":
            clear_ids.update(["retry_failed", "retry_low_score"])
        if intent_name == "feedback":
            clear_ids.add("style_pref")

        self.state["pending_questions"] = [q for q in pending if q not in clear_ids]

    def _decide_reply_with_proactive(self, intent: dict) -> dict:
        """generationtextreplyenglish_text"""
        base = self._decide_reply_base(intent)
        questions = self._build_proactive_questions(intent["intent"], intent.get("extracted"))
        reply = base + self._format_proactive_section(questions)
        return {
            "reply": reply,
            "proactive_questions": questions,
            "quick_replies": self._collect_quick_replies(questions),
        }

    # ============================================================
    # 2. textreplytext
    # ============================================================

    def decide_reply(self, intent: dict) -> dict:
        """
        english_text，english_textreplyuserenglish_text。
        english_texttaskenglish_text——textreplyuser，texttask。

        LLM english_texttemplateenglish_text、yesenglish_textreply（english_texttemplatetext）；
        failed/none Key english_texttemplate，english_textyesreply。

        text: {"reply": str, "proactive_questions": [...], "quick_replies": [...]}
        """
        base = self._decide_reply_base(intent)
        questions = self._build_proactive_questions(intent["intent"], intent.get("extracted"))

        reply_body = base
        if intent.get("llm_mode"):
            # english_textstagetextgenerationtextreply（english_text）；english_textrequesttext
            composed = (intent.get("llm_reply") or "").strip()
            if not composed:
                composed = self.orchestrator.compose_reply(
                    intent.get("raw_message", ""), intent,
                    self._build_prompt_state(), base)
            if composed:
                reply_body = composed

        return {
            "reply": reply_body + self._format_proactive_section(questions),
            "proactive_questions": questions,
            "quick_replies": self._collect_quick_replies(questions),
        }

    def _decide_reply_base(self, intent: dict) -> str:
        """textreplytext（english_text）"""
        intent_name = intent["intent"]
        ctx = self.state

        # ----- text -----
        if intent_name == "greet":
            if ctx["has_images"]:
                return (
                    "👋 english_text！english_text，"
                    "english_text **text** text，english_text **generation** listingtext？"
                )
            else:
                return (
                    "## 👋 text！textyesenglish_textagent\n\n"
                    "textyes **textagent**，english_text，english_text **textagent** english_text。\n\n"
                    "**english_text：**\n"
                    "1. 📤 **english_textimage** — textinputenglish_text 📎\n"
                    "2. 💬 **english_text** — text「textgenerationenglish_textlistingtext」\n"
                    "3. english_textimage，english_text！\n\n"
                    "> textstatus：english_textimage"
                )

        # ----- english_textimage -----
        elif intent_name == "upload":
            count = intent["extracted"].get("image_count", 0)
            from_url = intent["extracted"].get("from_url", False)
            if from_url:
                return (
                    f"🔗 english_text **{count} text** english_text。\n\n"
                    "english_text **text** english_text？english_text。"
                )
            if count == 1:
                return f"📸 text **1 text** english_text！english_text。\n\nenglish_text **text** english_text？english_text。"
            else:
                return f"📸 text **{count} text** english_text！english_text，english_text。\n\nenglish_text **text** english_text，english_textscenetext？"

        # ----- english_textimage -----
        elif intent_name == "need_image_first":
            return (
                "⏳ english_textimagetext。\n\n"
                "english_textinputenglish_text **📎** english_text，"
                "english_textimage **text** english_text。\n"
                "textimageenglish_textgenerationtext！"
            )

        # ----- english_text -----
        elif intent_name == "ask_analyze":
            return (
                "🔍 text，english_text！\n\n"
                "english_text AI visualenglish_text：\n"
                "- english_text & text\n"
                "- text & text\n"
                "- text & english_text\n"
                "- english_text & textscene\n\n"
                "**textagent → textagent：** english_texttask，english_text..."
            )

        # ----- textgeneration -----
        elif intent_name == "confirm_generate":
            extracted = intent.get("extracted", {})
            scene_count = extracted.get("generation_count")
            if not scene_count and extracted.get("selected_scenes"):
                scene_count = len(extracted["selected_scenes"])
            elif not scene_count and ctx.get("confirmed_scenes"):
                scene_count = len(ctx["confirmed_scenes"])
            elif not scene_count:
                scene_count = len(ctx.get("scene_plan") or []) or 1
            prefs = ctx.get("user_preferences", {})
            extras = []
            if prefs.get("brand_name"):
                extras.append(f"text: {prefs['brand_name']}")
            if prefs.get("auto_engine"):
                extras.append("english_text")
            if prefs.get("quality") == "premium":
                extras.append("english_text")
            plat = prefs.get("platforms", [])
            if plat:
                extras.append(f"platform: {', '.join(plat)}")
            extra_line = f"\n**configuration:** {' · '.join(extras)}\n" if extras else ""
            return (
                f"🎯 textgenerationtext！textgeneration **{scene_count} text** english_textlistingtext。\n\n"
                "textflow：\n"
                "1. english_text → 2. english_text → 3. text → 4. textplatformtext → 5. consistencydetection\n\n"
                f"{extra_line}"
                "**english_text：** 2-5 text\n"
                "english_text，english_text！"
            )

        elif intent_name == "regenerate":
            return (
                "🔄 text，english_textgenerationflow。\n\n"
                "text → english_text → text → textplatform → detection\n"
                "**textagent → textagent：** english_textgenerationtask..."
            )

        elif intent_name == "ab_test":
            return (
                "🧪 text A/B textrequest！\n\n"
                "english_text 3 textscenetextgeneration 2 english_text，english_text。\n"
                "**textagent → textagent：** english_text A/B texttask..."
            )

        elif intent_name == "edit_image":
            return (
                "🖌️ text，english_text——english_text，"
                "english_text，english_text。english_textacceptancetext。"
            )

        elif intent_name == "research_product":
            return (
                "🔍 text，english_textproduct researchenglish_text：english_text、english_text、"
                "profittext、textplatform、textscene、english_textrisktext，english_text。"
            )

        elif intent_name == "web_search":
            query = intent.get("extracted", {}).get("search_query") or intent.get("raw_message", "")
            return (
                f"🔍 text，english_textsearchenglish_text！\n\n"
                f"**searchtext：** {query}\n\n"
                "**textagent → textagent：** english_textsearchtask..."
            )

        elif intent_name == "browse":
            urls = intent.get("extracted", {}).get("urls", [])
            url_preview = urls[0] if urls else "（text）"
            return (
                f"🔗 text，english_textproductenglish_text。\n\n"
                f"**text：** {url_preview}\n\n"
                "**textagent → textagent：** english_texttask..."
            )

        elif intent_name == "research":
            extracted = intent.get("extracted", {})
            query = extracted.get("search_query", "")
            lines = ["🌐 text，english_text。\n"]
            if query:
                lines.append(f"**search：** {query}")
            urls = extracted.get("urls", [])
            if urls:
                lines.append(f"**text：** {len(urls)} text")
            lines.append("\n**textagent → textagent：** english_texttask...")
            return "\n".join(lines)

        # ----- textscene -----
        elif intent_name == "adjust_scene":
            if ctx.get("scene_plan"):
                return (
                    "🔄 text，english_textsceneplan。\n\n"
                    "textagenttextcompletedtext，textreply **「generation」** text **「textgeneration」** textplantext。"
                )
            return (
                "🔄 text，english_text。\n\n"
                "english_text？text：\n"
                "- 「english_text3english_text，english_text」\n"
                "- 「english_textsceneenglish_text」\n"
                "- 「english_text1、2、5、7、10english_text」\n\n"
                "textcompletedtext，reply **「generation」** english_text。"
            )

        # ----- text -----
        elif intent_name == "feedback":
            extracted = intent.get("extracted", {})
            liked = len(extracted.get("liked", []))
            disliked = len(extracted.get("disliked", []))
            detail = ""
            if liked:
                detail += f"👍 {liked} english_text "
            if disliked:
                detail += f"👎 {disliked} english_text"
            return (
                f"📝 english_text！{detail}\n\n"
                "english_textgeneration。"
            )

        # ----- text -----
        elif intent_name == "download":
            return (
                "📥 text，english_text...\n"
                "english_textyesgenerationenglish_text。"
            )

        elif intent_name == "need_generate_first":
            return (
                "⏳ textyesgenerationtextimagetext。\n\n"
                "english_text，english_text **「generation」**，"
                "english_textagentcompletedenglish_text。"
            )

        # ----- english_text -----
        elif intent_name == "chat":
            if ctx.get("generation_result"):
                return "😊 english_text！english_text。"
            elif ctx.get("profile_ready"):
                return "😊 textyesenglish_text？english_text **「generation」** english_text。"
            else:
                return "😊 textyesenglish_text？english_textgenerationlistingtext！"

        # ----- text -----
        else:
            if ctx["has_images"] and ctx["profile_ready"]:
                count = len(ctx.get('scene_plan') or []) or 1
                return (
                    "🤔 english_text。english_text：\n"
                    f"- text **「generation」** — english_textplangeneration {count} textlistingtext\n"
                    "- text **「text」** — textsceneconfiguration\n"
                    "- text **「text」** — english_text\n"
                    "- english_text"
                )
            elif ctx["has_images"]:
                return (
                    "🤔 english_text。english_textimage，"
                    "english_text **text** english_text？"
                )
            else:
                return (
                    "🤔 english_text，english_text。\n"
                    "english_text **english_textimage** text，english_text **「text」** english_text。"
                )

    # ============================================================
    # 3. texttaskenglish_textagent
    # ============================================================

    def dispatch(self, intent: dict) -> Optional[dict]:
        """
        textusertext，textyesnotexttaskenglish_textagent。

        text Task text（english_text Executor），text None（english_text）。
        Task text:
        {
            "task_id": "task_xxx",
            "type": "analyze" | "generate" | "adjust" | "check" | "download",
            "params": { ... },
            "observer_says": "english_text（text）",
            "priority": "high" | "normal",
            "supervision": "english_textfields",
        }
        """
        intent_name = intent.get("dispatch_intent") or intent["intent"]
        target_agent = intent.get("target_agent", "executor")
        if not self._should_dispatch(intent_name):
            return None

        task_id = f"task_{int(time.time())}_{self.state['session_id'][:4]}"
        self.state["last_task_id"] = task_id

        task = {
            "task_id": task_id,
            "type": None,
            "params": {},
            "observer_says": "",
            "priority": "normal",
            "supervision": [],
            "dispatched_at": time.time(),
            "target_agent": target_agent,
            "task_plan": intent.get("task_plan", []),
        }

        if intent_name == "ask_analyze" and self.state["has_images"]:
            # english_texttask
            task["type"] = "analyze"
            task["params"] = {
                "image_paths": self.state.get("image_paths", []),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
                "product_hints": intent.get("extracted", {}).get("product_hints")
                or self.state.get("product_hints", {}),
            }
            task["observer_says"] = (
                "textagent，english_textimageenglish_text："
                "1. text analyze_product.py english_text（text、category、text、text、text、english_text）"
                "2. text scene_matcher.py english_text 10 scene"
                "3. english_textscenetext"
            )
            task["supervision"] = ["profile", "scene_plan"]
            task["priority"] = "high"

        elif intent_name == "confirm_generate" or intent_name == "regenerate":
            prefs = self.state.get("user_preferences", {})
            extracted = intent.get("extracted", {})
            selected_scenes = extracted.get("selected_scenes")
            if not selected_scenes and extracted.get("scene_selectors"):
                selected_scenes = self._resolve_scene_selectors(
                    self.state.get("scene_plan", []),
                    extracted.get("scene_selectors", []),
                    extracted.get("generation_count"),
                )
            if not selected_scenes and self.state.get("pending_generation_constraints"):
                pending_constraints = self.state.get("pending_generation_constraints") or {}
                selectors = pending_constraints.get("scene_selectors") or []
                selected_scenes = self._resolve_scene_selectors(
                    self.state.get("scene_plan", []),
                    selectors,
                    pending_constraints.get("generation_count"),
                )
                if selected_scenes:
                    self.state.pop("pending_generation_constraints", None)
            confirmed_scenes = selected_scenes or self.state.get("confirmed_scenes")
            task["type"] = "generate"
            task["params"] = {
                "image_paths": self.state.get("image_paths", []),
                "profile_path": self.state.get("profile_path", ""),
                "plan_path": self.state.get("plan_path", ""),
                "scene_dir": self.state.get("scene_dir", ""),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
                "confirmed_scenes": confirmed_scenes,
                "generation_count": len(confirmed_scenes) if confirmed_scenes else int(extracted.get("generation_count") or 0) or None,
                "brand_name": prefs.get("brand_name", ""),
                "watermark_path": prefs.get("watermark_path", ""),
                "platforms": prefs.get("platforms", list(CROSS_BORDER_PLATFORMS)),
                "quality": prefs.get("quality", "standard"),
                "auto_engine": prefs.get("auto_engine", False),
                "product_name": self.state.get("product_name", ""),
                "markets": extracted.get("markets") or prefs.get("markets"),
                "region": extracted.get("region") or prefs.get("region", ""),
                "festival": extracted.get("festival") or prefs.get("festival", ""),
            }
            count = len(confirmed_scenes) if confirmed_scenes else len(self.state.get("scene_plan", [])) or 1
            task["observer_says"] = (
                f"textagent，textusertextgeneration {count} textimage，english_text 10 text；"
                "batch_generate → style_pipeline → layout_engine → platform_adapter → consistency_checker"
            )
            task["supervision"] = ["images", "consistency_score", "platform_file_count"]
            task["priority"] = "high"

        elif intent_name == "feedback":
            extracted = intent.get("extracted", {})
            task["type"] = "feedback"
            task["params"] = {
                "liked": extracted.get("liked", []),
                "disliked": extracted.get("disliked", []),
                "scene_details": extracted.get("scene_details", {}),
                "product_name": self.state.get("product_name", ""),
                "output_dir": self.state.get("output_dir", ""),
            }
            task["observer_says"] = "textagent，english_textuserenglish_text。"
            task["supervision"] = ["recorded"]

        elif intent_name == "ab_test":
            task["type"] = "ab_test"
            task["params"] = {
                "image_paths": self.state.get("image_paths", []),
                "profile_path": self.state.get("profile_path", ""),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
                "variants": 2,
            }
            task["observer_says"] = "textagent，english_text3scenegeneration A/B text。"
            task["supervision"] = ["variant_count"]
            task["priority"] = "normal"

        elif intent_name == "download":
            task["type"] = "download"
            task["params"] = {
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
            }
            task["observer_says"] = "textagent，english_text。"

        elif intent_name == "adjust_scene":
            task["type"] = "adjust"
            task["params"] = {
                "current_plan": self.state.get("scene_plan", []),
                "user_message": intent["raw_message"],
                "extracted": intent["extracted"],
            }
            task["observer_says"] = (
                "textagent，userenglish_textsceneconfiguration，"
                "english_textusertextmessageenglish_textscenetext。"
            )

        elif intent_name == "web_search":
            extracted = intent.get("extracted", {})
            task["type"] = "web_search"
            task["params"] = {
                "query": extracted.get("search_query") or intent.get("raw_message", ""),
                "user_message": intent.get("raw_message", ""),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
                "num_results": 5,
            }
            task["observer_says"] = "textagent，textsearchenglish_text，english_textreport。"
            task["supervision"] = ["search_results", "summary"]
            task["target_agent"] = "researcher"

        elif intent_name == "browse":
            extracted = intent.get("extracted", {})
            urls = extracted.get("urls") or extract_urls(intent.get("raw_message", ""))
            task["type"] = "browse"
            task["params"] = {
                "urls": urls,
                "user_message": intent.get("raw_message", ""),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
            }
            task["observer_says"] = "textagent，english_text。"
            task["supervision"] = ["competitors", "reference_images"]
            task["target_agent"] = "researcher"

        elif intent_name == "research":
            extracted = intent.get("extracted", {})
            task["type"] = "research"
            task["params"] = {
                "query": extracted.get("search_query") or self._extract_search_query(intent.get("raw_message", "")),
                "urls": extracted.get("urls") or extract_urls(intent.get("raw_message", "")),
                "user_message": intent.get("raw_message", ""),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
                "num_results": 5,
            }
            task["observer_says"] = "textagent，english_textsearchenglish_text，english_textreport。"
            task["supervision"] = ["competitors", "reference_images", "summary"]
            task["target_agent"] = "researcher"

        return task

    def dispatch_chained_task(self) -> Optional[dict]:
        """text pending_task_plan english_text（LLM texttasktext）"""
        pending = self.state.get("pending_task_plan") or []
        if not pending:
            return None

        next_step = pending[0]
        self.state["pending_task_plan"] = pending[1:]

        step = next_step.get("step", "")
        from .orchestrator import STEP_TO_INTENT
        dispatch_intent = STEP_TO_INTENT.get(step)
        if not dispatch_intent or not self._should_dispatch(dispatch_intent):
            return None

        synthetic_intent = {
            "intent": dispatch_intent,
            "dispatch_intent": dispatch_intent,
            "target_agent": next_step.get("agent", "executor"),
            "extracted": {},
            "raw_message": "",
            "task_plan": [next_step],
        }
        return self.dispatch(synthetic_intent)

    def _should_dispatch(self, intent_name: str) -> bool:
        """english_textyesnoenglish_texttaskenglish_text"""
        return intent_name in [
            "ask_analyze",
            "confirm_generate",
            "regenerate",
            "adjust_scene",
            "download",
            "feedback",
            "ab_test",
            "web_search",
            "browse",
            "research",
        ]

    # ============================================================
    # 4. english_textagent
    # ============================================================

    def supervise(self, task_id: str, executor_report: dict) -> dict:
        """
        english_textagenttextreport，english_textyesnotext。

        text:
          {
            "approved": True/False,
            "issues": ["text1", ...],
            "feedback": "english_text",
            "user_message": "textuserenglish_text",
          }
        """
        report_type = executor_report.get("type", "")
        status = executor_report.get("status", "")
        data = executor_report.get("data", {})

        supervision_result = {
            "approved": False,
            "issues": [],
            "feedback": "",
            "user_message": "",
        }

        if status == "error":
            from common.utils import friendly_error_message
            err_text = friendly_error_message(executor_report.get("error", "texterror"))
            supervision_result["issues"].append(err_text)
            supervision_result["feedback"] = f"task {task_id} english_text: {err_text}"
            supervision_result["user_message"] = (
                f"❌ english_text：{err_text}\n"
                "english_textconfigurationenglish_text。"
            )
            return supervision_result

        if status == "cancelled":
            completed = data.get("completed_count")
            total = data.get("total_count")
            images = data.get("images", [])
            if completed is None:
                completed = len(images)
            if total is None:
                total = completed
            supervision_result["approved"] = bool(images)
            supervision_result["feedback"] = f"task {task_id} english_text（{completed}/{total}）"
            if images:
                supervision_result["user_message"] = (
                    f"⏹ english_textgeneration，textcompleted **{completed}/{total}** text。\n"
                    "english_textcompletedtextimage；english_text「generation」。"
                )
                self.state["generation_ready"] = bool(completed)
                self.state["generation_result"] = data
            elif report_type == "analyze":
                supervision_result["user_message"] = "⏹ english_text。"
            else:
                supervision_result["user_message"] = "⏹ english_text，textgenerationtextimage。"
            supervision_result["proactive_questions"] = []
            supervision_result["quick_replies"] = []
            return supervision_result

        if report_type == "analyze":
            profile = data.get("profile", {}) or {}
            scene_plan = data.get("scene_plan", []) or []
            warnings = []
            critical = []

            if not profile:
                critical.append("textgenerationenglish_text")
            elif not profile.get("product_name") and not profile.get("description"):
                critical.append("english_text")

            if not scene_plan:
                critical.append("sceneenglish_text，noneenglish_textlistingscene")

            if profile and not profile.get("product_name"):
                warnings.append("english_text（english_textfileenglish_text）")
            if profile and not profile.get("description"):
                warnings.append("english_text")
            if scene_plan and len(scene_plan) < 5:
                warnings.append(f"sceneenglish_text {len(scene_plan)} text（english_text 5 text）")

            if not critical:
                supervision_result["approved"] = True
                supervision_result["feedback"] = (
                    f"english_textpassed。text: {profile.get('product_name', 'text')}，"
                    f"category: {profile.get('category', 'general')}，{len(scene_plan)} textsceneenglish_text。"
                )
                base_msg = self._format_analysis_reply(profile, scene_plan)
                if warnings:
                    base_msg += f"\n\n> ⚠️ english_text：{'；'.join(warnings)}"
                questions = self._build_proactive_questions("post_analyze")
                supervision_result["user_message"] = base_msg + self._format_proactive_section(questions)
                supervision_result["proactive_questions"] = questions
                supervision_result["quick_replies"] = self._collect_quick_replies(questions)
                self.state["profile_ready"] = True
                self.state["scenes_ready"] = bool(scene_plan)
                self.state["scene_plan"] = scene_plan
            else:
                for issue in critical:
                    supervision_result["issues"].append(issue)
                for w in warnings:
                    supervision_result["issues"].append(w)
                supervision_result["feedback"] = (
                    f"english_textpassed: {'; '.join(critical)}"
                )
                detail = "；".join(critical)
                supervision_result["user_message"] = (
                    f"⚠️ english_textcompleted：{detail}。\n"
                    "english_textimage，english_text **「english_text」** text。"
                )

        elif report_type == "generate":
            images = data.get("images", [])
            score = data.get("consistency_score")
            scene_count = len(images)

            # textfailed：english_textgenerationtext（provider/API errortext status == "error" english_text）。
            # english_text：imagetextgenerationtextconsistencyenglish_text——english_textgeneration、userenglish_text。
            hard_issues = []
            soft_warnings = []

            if not images:
                hard_issues.append("textyesgenerationtextimage")
            else:
                # textscene（<2 text）generationtext，text 1 english_textconsistencytext
                # english_textyestext，english_text，english_text，english_text。
                if scene_count >= 2:
                    if score is None:
                        soft_warnings.append("consistencydetectionenglish_textyesenglish_text")
                    elif score < 60:
                        soft_warnings.append(f"consistencyenglish_text（{score}/100）")

            if hard_issues:
                supervision_result["approved"] = False
                supervision_result["issues"] = hard_issues
                supervision_result["feedback"] = (
                    f"generationenglish_textpassed: {'; '.join(hard_issues)}"
                )
                questions = self._build_proactive_questions("post_generate_issues")
                base_msg = (
                    f"⚠️ generationfailed：{'；'.join(hard_issues)}\n"
                    "english_text。"
                )
                supervision_result["user_message"] = base_msg + self._format_proactive_section(questions)
                supervision_result["proactive_questions"] = questions
                supervision_result["quick_replies"] = self._collect_quick_replies(questions)
            else:
                # generationsuccess——english_textimage；consistencyenglish_text。
                supervision_result["approved"] = True
                supervision_result["issues"] = soft_warnings
                plat_count = data.get("platform_file_count", 0)
                score_label = score if score is not None else "N/A"
                supervision_result["feedback"] = (
                    f"generationenglish_textpassed。text {len(images)} text，"
                    f"consistency {score_label}/100，textplatformoutput {plat_count} text。"
                )
                base_msg = self._format_generation_reply(images, data)
                questions = []
                if soft_warnings:
                    questions = self._build_proactive_questions("post_generate_low_score")
                    base_msg += (
                        "\n\n> ⚠️ english_text：" + "；".join(soft_warnings) +
                        "。imagetextallgenerationenglish_text，english_text；english_text，"
                        "english_text **textgeneration** text **textscene**。"
                    )
                # text Agent textdetectiontext（english_text）
                ext_status = data.get("external_consistency_status", "")
                if ext_status and ext_status != "skipped":
                    base_msg += self._format_external_consistency_section(data)
                supervision_result["user_message"] = base_msg + self._format_proactive_section(questions)
                supervision_result["proactive_questions"] = questions
                supervision_result["quick_replies"] = self._collect_quick_replies(questions)
                self.state["generation_ready"] = True
                self.state["generation_result"] = data

        elif report_type == "feedback":
            if data.get("recorded"):
                supervision_result["approved"] = True
                supervision_result["user_message"] = (
                    f"✅ english_text！"
                    f"（👍 {data.get('liked_count', 0)} · 👎 {data.get('disliked_count', 0)}）\n"
                    "textgenerationenglish_text。"
                )
            else:
                supervision_result["issues"].append("english_textfailed")

        elif report_type == "adjust":
            adjusted = data.get("adjusted_plan", [])
            skipped = data.get("skipped", [])
            if adjusted:
                supervision_result["approved"] = True
                self.state["scene_plan"] = adjusted
                self.state["confirmed_scenes"] = adjusted
                skip_line = f"\nenglish_text: {', '.join(skipped)}" if skipped else ""
                supervision_result["user_message"] = (
                    f"✅ sceneplanenglish_text，text **{len(adjusted)}** textscene。{skip_line}\n\n"
                    "reply **「generation」** text **「textgeneration」** textplanenglish_text。"
                )
            else:
                supervision_result["issues"].append("sceneenglish_text")

        elif report_type == "ab_test":
            count = data.get("variant_count", 0)
            images = data.get("images", [])
            if count > 0:
                supervision_result["approved"] = True
                lines = [
                    f"🧪 A/B textcompleted！textgeneration **{count}** english_text。",
                    "",
                    "english_text，english_text。",
                ]
                for img in images[:12]:
                    name = img.get("label") or img.get("filename", "")
                    lines.append(f"- {name}")
                supervision_result["user_message"] = "\n".join(lines)
            else:
                supervision_result["issues"].append("A/B textgenerationfailed")

        elif report_type in ("research", "web_search", "browse"):
            supervision_result["approved"] = True
            supervision_result["user_message"] = self._format_research_reply(data)
            if self.blackboard:
                self.blackboard.update({
                    "research_report": {
                        "query": data.get("query", ""),
                        "summary": data.get("summary", ""),
                        "search_results": data.get("search_results", []),
                        "competitors": data.get("competitors", []),
                        "reference_images": data.get("reference_images", []),
                    },
                    "reference_urls": data.get("reference_urls", []),
                }, agent_id=self.agent_id)
                self.blackboard.save()

        else:
            supervision_result["approved"] = True
            supervision_result["feedback"] = f"task {task_id} textcompleted。"
            supervision_result["user_message"] = "✅ tasktextcompleted。"

        return supervision_result

    # ============================================================
    # 5. english_textreply
    # ============================================================

    def _format_analysis_reply(self, profile: dict, scene_plan: list) -> str:
        """english_textuserenglish_textmessage"""
        lines = ["## 🔍 english_textcompleted\n"]
        lines.append(f"**text:** {profile.get('product_name', 'english_text')}")
        lines.append(f"**category:** {profile.get('category_cn', profile.get('category', 'text'))}")
        lines.append(f"**text:** {profile.get('style_cn', profile.get('style', 'text'))}")
        materials = profile.get('materials', [])
        if materials:
            lines.append(f"**text:** {', '.join(materials)}")
        features = profile.get('key_features', [])
        if features:
            lines.append(f"**english_text:** {', '.join(features)}")
        emotions = profile.get('emotion_keywords', [])
        if emotions:
            lines.append(f"**textkeywords:** {' · '.join(emotions)}")

        lines.append("")
        lines.append("---")
        lines.append("## 🎯 english_text 10 textscene\n")

        emotion_labels = [
            "text、text、english_text",
            "text、text、english_text",
            "text、text、english_text",
            "text、text、english_text",
            "real、text、english_text",
            "text、english_text、english_text",
            "english_text、english_text、text",
            "text、text、english_text",
            "text、real、english_text",
            "text、text、english_text",
        ]

        for i, scene in enumerate(scene_plan[:10]):
            name = scene.get("scene_name", f"scene {i+1}")
            emotion = scene.get("emotion", emotion_labels[i] if i < len(emotion_labels) else "")
            score = scene.get("final_score", 0)
            stars = "⭐" * max(1, int(score / 2.5)) if score else ""
            lines.append(f"**{i+1}. {name}** {stars}")
            if emotion:
                lines.append(f"   → {emotion}")

        lines.append("")
        lines.append("---")
        lines.append(
            "reply **「generation」** text **「text」**，textagentenglish_text。\n"
            "english_text **text** textscene。"
        )

        return "\n".join(lines)

    def _format_research_reply(self, data: dict) -> str:
        """english_textusertextmessage"""
        lines = ["## 🌐 english_textcompleted\n"]
        summary = data.get("summary", "")
        if summary:
            lines.append(f"{summary}\n")

        search_results = data.get("search_results") or []
        if search_results:
            lines.append("### 🔍 searchtext（Top 5）\n")
            for i, r in enumerate(search_results[:5], 1):
                title = r.get("title") or "nonetitle"
                url = r.get("url") or ""
                snippet = (r.get("snippet") or "")[:120]
                if url:
                    lines.append(f"{i}. [{title}]({url})")
                else:
                    lines.append(f"{i}. {title}")
                if snippet:
                    lines.append(f"   {snippet}")
            lines.append("")

        competitors = data.get("competitors") or []
        if competitors:
            lines.append("### 🏪 english_text\n")
            for c in competitors[:5]:
                title = c.get("title") or c.get("url", "")
                url = c.get("url", "")
                if url:
                    lines.append(f"- [{title}]({url})")
                else:
                    lines.append(f"- {title}")
                if c.get("error"):
                    lines.append(f"  ⚠️ {c['error']}")
            lines.append("")

        ref_images = data.get("reference_images") or []
        if ref_images:
            lines.append(f"### 🖼 english_text（english_text {len(ref_images)} text）\n")
            lines.append("english_text，english_text。")

        lines.append("---")
        lines.append("english_text **searchtext**、text **producttext** text，english_textgeneration。")
        return "\n".join(lines)

    def _format_external_consistency_section(self, data: dict) -> str:
        """english_textconsistencytextdetectiontext（english_text）"""
        status = data.get("external_consistency_status", "")
        score = data.get("external_consistency_score")
        issues = data.get("external_consistency_issues", []) or []
        recommendations = data.get("external_consistency_recommendations", []) or []

        status_emoji = {
            "passed": "✅",
            "failed": "⚠️",
            "error": "❌",
        }.get(status, "ℹ️")

        lines = ["\n\n---\n", "## 🔍 english_textconsistencydetection\n"]
        if score is not None:
            lines.append(f"**status:** {status_emoji} {status}　**text:** {score}/100\n")
        else:
            lines.append(f"**status:** {status_emoji} {status}\n")

        if issues:
            lines.append("**english_text:**")
            for issue in issues[:5]:
                lines.append(f"- {issue}")
            if len(issues) > 5:
                lines.append(f"…（text {len(issues)} text，english_textdetectionreport）")
            lines.append("")

        if recommendations:
            lines.append("**english_text:**")
            for rec in recommendations[:3]:
                lines.append(f"- {rec}")
            if len(recommendations) > 3:
                lines.append(f"…（text {len(recommendations)} text）")
            lines.append("")

        if status == "passed":
            lines.append("text Agent english_textconsistencytext，english_textlisting。")
        elif status == "failed":
            lines.append("text Agent english_text，english_text QA english_textyesnotextscenetext。")
        elif status == "error":
            lines.append("textdetectionenglish_text，english_text，english_text。")

        return "\n".join(lines)

    def _format_generation_reply(self, images: list, data: dict) -> str:
        """english_textgenerationtext"""
        score = data.get("consistency_score", "N/A")
        count = len(images)
        plat_files = data.get("platform_file_count", 0)
        plat_count = data.get("platform_count", 0)
        platforms = data.get("platforms", [])

        lines = [
            f"## ✅ {count} textlistingtextallgenerationcompleted！\n",
            f"**consistencytext：** {score}/100",
        ]
        if plat_count:
            lines.append(f"**textplatformoutput：** {plat_files} text（{plat_count} textplatform: {', '.join(platforms)}）\n")
        else:
            lines.append("")
        lines.extend([
            "textagenttextcompleted：text → english_text → text → textplatform → detection ✅\n",
            "---",
            "**english_text：**",
            "- 👆 **textimage** english_text",
            "- 💬 english_text **english_text** text **text/english_text**",
            "- 📥 english_text **english_text**（text platforms/ english_text）\n",
        ])
        return "\n".join(lines)

    # ============================================================
    # 6. english_text
    # ============================================================

    def process_message(
        self,
        message: str,
        has_images: bool = False,
        executor_report: Optional[dict] = None,
    ) -> dict:
        """
        textusermessageenglish_text。

        text:
          message: usertext
          has_images: yesnoenglish_textimage
          executor_report: textagentenglish_text（textNoneenglish_textyesenglish_text）

        text:
          {
            "reply": "english_textreplyuserenglish_text",
            "task": None text {english_texttask},
            "state_update": {english_textstatus},
          }
        """

        # english_textyesenglish_textreport，english_text
        if executor_report:
            task_id = executor_report.get("task_id", "")
            supervision = self.supervise(task_id, executor_report)
            return {
                "reply": supervision["user_message"],
                "task": None,
                "supervision": supervision,
                "proactive_questions": supervision.get("proactive_questions", []),
                "quick_replies": supervision.get("quick_replies", []),
                "state_update": {
                    "executor_busy": False,
                    "executor_last_report": executor_report,
                },
            }

        # english_textusermessage
        intent = self.understand(message, has_images)
        decide_result = self.decide_reply(intent)
        reply = decide_result["reply"]

        # LLM text：texttasktext chip
        if intent.get("llm_mode") and intent.get("task_plan"):
            chip = format_task_plan_chip(intent["task_plan"])
            if chip:
                reply = f"{chip}\n\n{reply}"

        task = self.dispatch(intent)

        # english_texttask，english_text
        state_update = {
            "last_intent": intent["intent"],
        }
        if task:
            state_update["executor_busy"] = True

        # english_text
        self.state["conversation_history"].append({
            "time": time.time(),
            "user": message,
            "intent": intent["intent"],
            "has_task": task is not None,
        })
        # english_text20text
        if len(self.state["conversation_history"]) > 20:
            self.state["conversation_history"] = self.state["conversation_history"][-20:]

        return {
            "reply": reply,
            "task": task,
            "intent": intent,
            "proactive_questions": decide_result.get("proactive_questions", []),
            "quick_replies": decide_result.get("quick_replies", []),
            "understand_mode": self._last_understand_mode,
            "state_update": state_update,
        }
