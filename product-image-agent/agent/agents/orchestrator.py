#!/usr/bin/env python3
"""
LLM english_text — OrchestratorBrain

text OpenAI text API text Gemini textusertext、english_texttaskenglish_text Agent。
none API Key english_textfailed/english_text，text Observer english_text understand()。
"""

import json
import os
import sys
from typing import Optional

_agent_root = os.path.join(os.path.dirname(__file__), "..")
if _agent_root not in sys.path:
    sys.path.insert(0, os.path.abspath(_agent_root))

from common.utils import normalize_platforms, parse_json_response

# english_text
VALID_INTENTS = frozenset({
    "greet", "upload", "ask_analyze", "confirm_generate", "adjust_scene",
    "feedback", "download", "ab_test", "regenerate", "chat", "unknown",
    "need_image_first", "need_generate_first", "edit_image",
    "web_search", "browse", "research", "research_product",
})

DEFAULT_INTENT_RESPONSE = {
    "intent": "unknown",
    "confidence": 0.0,
    "extracted": {},
    "task_plan": [],
    "reply_hint": "",
}

DEFAULT_PLAN_RESPONSE = {
    "goal": "",
    "context": {},
    "constraints": [],
    "plan": [],
    "risk_level": "medium",
    "needs_clarification": False,
    "clarification_questions": [],
    "next_action": "",
}

# task_plan step → dispatch intent
STEP_TO_INTENT = {
    "analyze": "ask_analyze",
    "generate": "confirm_generate",
    "adjust": "adjust_scene",
    "feedback": "feedback",
    "ab_test": "ab_test",
    "download": "download",
    "regenerate": "regenerate",
    "check": "ask_analyze",
    "layout": "confirm_generate",
    "web_search": "web_search",
    "browse": "browse",
    "research": "research",
}

# step → english_text Agent
STEP_TO_AGENT = {
    "analyze": "analyst",
    "generate": "generator",
    "adjust": "executor",
    "feedback": "qa",
    "ab_test": "generator",
    "download": "executor",
    "regenerate": "generator",
    "check": "qa",
    "layout": "layout",
    "web_search": "researcher",
    "browse": "researcher",
    "research": "researcher",
}

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)
DEFAULT_OPENAI_BASE = "https://api.openai.com/v1"
DEFAULT_LLM_MODEL = "gpt-4o"


def _default_llm_timeout() -> float:
    """text LLM text（text）。3 english_text API english_texttemplate，
    english_text"agentenglish_text"；text gpt-5.5 english_text 10~30 text，english_text 45 text，
    text ORCHESTRATOR_LLM_TIMEOUT text。"""
    try:
        return float(os.getenv("ORCHESTRATOR_LLM_TIMEOUT", "45"))
    except ValueError:
        return 45.0


LLM_TIMEOUT_SEC = _default_llm_timeout()

SYSTEM_PROMPT = """textyese-commerceenglish_textagenttext LLM english_text（OrchestratorBrain）。

## text
textuserEnglish/textmessage，outputenglish_text JSON，english_text Agent。

## english_text (intent)
greet | upload | ask_analyze | confirm_generate | adjust_scene | feedback |
download | ab_test | regenerate | edit_image | chat | unknown |
web_search | browse | research

text：textuserenglish_text/generationtextyesimage，intent text need_image_first；
textuserenglish_textyesgenerationtext，text need_generate_first。

## product researchenglish_text (research_product)
usertext「english_text / english_text / english_text / product researchtext」text
research_product（textyes web_search：web_search yesenglish_text/english_text，research_product
yesenglish_text）。task_plan english_text（textproduct researchenglish_text）。

## english_text (edit_image)
userenglish_textgenerationimageenglish_text（textyesenglish_text）text edit_image：
「english_text logo text」「english_textbackgroundenglish_text」「english_text」。
text regenerate english_text：regenerate yesenglish_textgeneration/english_text；edit_image english_text。
text：intent=edit_image text task_plan english_text（english_text，english_text Agent text）。

## english_text
- web_search: usertextsearchtext/english_text（text「english_text etsy english_text」「english_text」）
- browse: usertextproductenglish_text（text「english_text https://...」）
- research: textsearch+text（text「english_text」）

## platformautomaticenglish_text
textusertext「english_textplatformtextautomatictext / automatictext / english_text / english_textproduct」text：
1. english_textyesplatformconnectionenglish_text，english_text chat text：english_textplatform、english_text，english_textconnection。
2. english_text「english_text + automaticgenerationtext」text，english_textpublishenglish_textproduct。
3. textautomaticenglish_text/textrisktext：syncproduct、text Listing、generationimageplan、generationlistingtext、generationtext、english_textreviewtext、english_text。
4. texthumanenglish_textrisktext：english_textproduct、texttitle/image/text/text、english_text、english_textyestext。
5. textautomaticenglish_text：publish Listing、textproduct/orders/storedata、text/text、english_text/text/text/storetext。
6. textusertext“textautomatic”，reply english_text：text L1/L2 automatictext，L3 english_text，L4 english_text。

## english_text Agent
- analyst: textvisualtext、scenetext
- generator: english_text、A/B text、textgeneration
- qa: consistencydetection、english_text
- layout: english_textplatformtext
- executor: english_text（scenetext、english_text）
- researcher: textsearchtext、english_text、textproducttext

## task_plan text
- userenglish_text，textyesenglish_text，english_text step/agent/reason
- step text: analyze | generate | adjust | feedback | ab_test | download | regenerate | web_search | browse | research
- english_textstatusenglish_text（textnoneenglish_textgeneration），english_text，english_text
- english_textnoneenglish_text task_plan english_text

## platformtext
text→taobao_main, english_text/amazon→amazon_main, english_text→xiaohongshu, text→jd_main

## outputtext（text JSON，none markdown text）
{
  "intent": "...",
  "confidence": 0.0-1.0,
  "extracted": {
    "product_name": "",
    "brand_name": "",
    "platforms": [],
    "quality": "standard|premium|draft",
    "auto_engine": false,
    "mentioned_scenes": [],
    "liked": [],
    "disliked": [],
    "search_query": "",
    "urls": [],
    "user_goal_summary": "userenglish_text"
  },
  "task_plan": [{"step": "analyze", "agent": "analyst", "reason": "..."}],
  "reply_hint": "textreplyuserenglish_text",
  "reply": "english_textusertextEnglishreply"
}

## reply english_text（text）
english_textyesenglish_text、textplatform、textvisualenglish_textcross-border e-commercetext，reply yesuserenglish_text：
1. english_text：text、yestext、yestext，english_text emoji；english_text、english_text"textyesXXagent"。
2. text intent yes chat/unknown/greet：english_textuserenglish_text（product research、platformtext、english_text），
   english_text。
3. english_texttask（text/generationtext）：english_text + english_text，english_text。
4. english_textstatustextrealenglish_text，english_text"textcompleted/textgeneration"。
5. textplatformautomaticenglish_text，english_text「textautomaticgenerationtext」「english_text」「english_text」。
6. english_text 220 english_text；text markdown title，english_text。"""


MAX_THINK_PROMPT = """

## MAX english_text（english_text）
userenglish_text，english_text。english_text（textoutputenglish_text）：
1. usertextrealenglish_text（platformenglish_text、categorytext、english_text）
2. text 3 english_text
3. textriskenglish_textplan
textoutput：
- reply english_text 400 text：english_text + english_text + english_text/platformenglish_text + risktext（textyes）
- task_plan english_text（texttaskalltext，textyesenglish_text）
- extracted textfieldsenglish_text，user_goal_summary english_text"""


def _think_mode_on(state: dict | None) -> bool:
    return bool((state or {}).get("think_mode"))


def resolve_max_model() -> str:
    """MAX english_text：textconfiguration LLM_MODEL_MAX english_text LLM_MODEL。"""
    return (os.getenv("LLM_MODEL_MAX", "").strip()
            or os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL))


def resolve_orchestrator_provider() -> str:
    """english_text LLM english_text：openai | gemini"""
    explicit = os.getenv("ORCHESTRATOR_LLM_PROVIDER", "").strip().lower()
    if explicit in ("openai", "gemini"):
        return explicit
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "gemini"


class OrchestratorBrain:
    """LLM english_texttasktext"""

    def __init__(self, api_key: Optional[str] = None, timeout: float = LLM_TIMEOUT_SEC):
        self.api_key = api_key or ""
        self.timeout = timeout
        self.provider = resolve_orchestrator_provider()

    def _openai_api_key(self) -> str:
        model = os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL)
        premium = os.getenv("OPENAI_API_KEY_PREMIUM", "")
        if premium and (
            model.startswith("gpt-5")
            or os.getenv("LLM_USE_PREMIUM", "").strip() in ("1", "true", "yes")
        ):
            return premium
        return os.getenv("OPENAI_API_KEY", "") or self.api_key

    def _gemini_api_key(self) -> str:
        return self.api_key or os.getenv("GEMINI_API_KEY", "")

    def _llm_disabled(self) -> bool:
        """english_text（text/english_text）。english_text api_key english_text。"""
        if self.api_key:
            return False
        return os.getenv("ORCHESTRATOR_LLM_DISABLED", "").strip() in ("1", "true", "yes")

    def _has_llm_credentials(self) -> bool:
        if self._llm_disabled():
            return False
        if self.provider == "openai":
            return bool(self._openai_api_key())
        return bool(self._gemini_api_key())

    def understand_with_llm(
        self,
        message: str,
        state: dict,
        has_images: bool = False,
    ) -> Optional[dict]:
        """
        text LLM textusermessage。

        successenglish_text dict；none Key / failed / english_text None（text regex text）。
        """
        if not self._has_llm_credentials():
            return None

        if not message and not has_images:
            return self._normalize_result({
                "intent": "greet",
                "confidence": 1.0,
                "extracted": {"user_goal_summary": "userenglish_text"},
                "task_plan": [],
                "reply_hint": "english_text",
            }, state, has_images)

        if not message and has_images:
            return self._normalize_result({
                "intent": "upload",
                "confidence": 1.0,
                "extracted": {
                    "user_goal_summary": "userenglish_text",
                    "image_count": state.get("image_count", 0),
                },
                "task_plan": [],
                "reply_hint": "english_textimage，textyesnotext",
            }, state, has_images)

        providers_to_try = [self.provider]
        if self.provider == "openai" and self._gemini_api_key():
            providers_to_try.append("gemini")
        elif self.provider == "gemini" and self._openai_api_key():
            providers_to_try.append("openai")

        for provider in providers_to_try:
            try:
                if provider == "openai":
                    raw_text = self._call_openai(message, state, has_images)
                else:
                    raw_text = self._call_gemini(message, state, has_images)
                parsed = parse_llm_orchestrator_response(raw_text)
                return self._normalize_result(parsed, state, has_images)
            except Exception as e:  # noqa: BLE001 — failedenglish_text，notext"english_text"nonetextnonetext
                import logging
                logging.getLogger(__name__).warning(
                    "text LLM textfailed（%s，timeout=%ss）：%s——english_text",
                    provider, self.timeout, e)
                continue

        return None

    def understand(self, message: str, state: dict, has_images: bool = False) -> dict:
        """Unified intent entrypoint with a stable fallback shape."""
        llm_result = self.understand_with_llm(message, state, has_images)
        if llm_result:
            return llm_result
        return self._regex_fallback(message, state, has_images)

    def plan(self, message: str, state: dict, has_images: bool = False,
             intent: Optional[dict] = None) -> dict:
        """Generate a balanced global plan with risk and clarification flags.

        text intent english_text（english_text LLM）。
        """
        if intent is None:
            intent = self.understand(message, state, has_images)
        return self._build_plan(intent, state, has_images)

    REPLY_SYSTEM_PROMPT = """textyes「cross-border e-commerce AI textagent」，english_text、textplatform、textvisualenglish_texte-commercetext。
userenglish_text。english_textstatusenglish_text，textEnglishenglish_text、yestext、yesenglish_textreply。

text：
1. english_text，english_text；english_text，english_text emoji。
2. 「texttemplatereply」english_text（status、text、english_text、english_text）english_text；
   english_textyesenglish_text、yestext，english_text/platformtext 1 english_text。
3. english_textyes chat/unknown/greet：english_textuserenglish_text（e-commerceproduct research、platformtext、english_text），
   english_text。
4. textuserenglish_textplatform、automatictext、automatictextproduct、automaticpublish：english_textrisktext。
   english_text「english_text + automaticgenerationtext」；english_text；publish、text、english_textautomatictext。
5. english_text 220 english_text；textoutput JSON、text markdown title（english_text/text）。"""

    def compose_reply(self, message: str, intent: dict, state: dict,
                      template_reply: str = "") -> Optional[str]:
        """texttemplatereplyenglish_text LLM english_textreply；none Key/failedtext None（texttemplate）。"""
        if not self._has_llm_credentials():
            return None
        try:
            import requests

            api_key = self._openai_api_key()
            if not api_key:
                return None
            base = os.getenv("OPENAI_API_BASE", DEFAULT_OPENAI_BASE).rstrip("/")
            think_mode = _think_mode_on(state)
            model = resolve_max_model() if think_mode else os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL)

            history = state.get("conversation_history", [])[-4:]
            ctx = {
                "usermessage": message,
                "english_text": intent.get("intent", ""),
                "english_text": intent.get("reply_hint", ""),
                "texttemplatereply": (template_reply or "")[:600],
                "textstatus": {
                    "textyesenglish_text": state.get("has_images", False),
                    "english_text": state.get("product_name", ""),
                    "english_text": len((state.get("generation_result") or {}).get("images", [])),
                    "english_text": state.get("profile_ready", False),
                },
                "english_text": [
                    {"user": t.get("user", ""), "text": t.get("intent", "")}
                    for t in history
                ],
                "english_text": (state.get("memory_context") or {}).get("user_profile", {}),
            }
            reply_system = self.REPLY_SYSTEM_PROMPT
            if think_mode:
                reply_system += ("\n\nuserenglish_text MAX english_text：english_text，"
                                 "replyenglish_text 400 text，english_textplatform/english_text。")
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": reply_system},
                    {"role": "user", "content": json.dumps(ctx, ensure_ascii=False)},
                ],
                "temperature": 0.6,
                "max_tokens": 1200 if think_mode else 600,
            }
            timeout = self.timeout * 2 if think_mode else self.timeout
            # text 5xx/english_text：texttemplateenglish_textuserenglish_text，english_text
            text = ""
            for attempt in (1, 2):
                try:
                    resp = requests.post(
                        f"{base}/chat/completions",
                        headers={"Authorization": f"Bearer {api_key}",
                                 "Content-Type": "application/json"},
                        json=payload, timeout=timeout,
                    )
                    status = getattr(resp, "status_code", 200)
                    if attempt == 1 and isinstance(status, int) and status >= 500:
                        continue
                    resp.raise_for_status()
                    text = ((resp.json().get("choices") or [{}])[0]
                            .get("message", {}).get("content", "") or "").strip()
                    break
                except Exception:  # noqa: BLE001
                    if attempt == 2:
                        raise
            # LLM english_text JSON/english_text
            if not text or text.startswith("{"):
                return None
            return text
        except Exception:  # noqa: BLE001 — textreplyfailedenglish_texttemplate
            return None

    def _call_openai(self, message: str, state: dict, has_images: bool) -> str:
        import requests

        api_key = self._openai_api_key()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")

        base = os.getenv("OPENAI_API_BASE", DEFAULT_OPENAI_BASE).rstrip("/")
        think_mode = _think_mode_on(state)
        model = resolve_max_model() if think_mode else os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL)
        system_prompt = SYSTEM_PROMPT + (MAX_THINK_PROMPT if think_mode else "")
        user_prompt = self._build_user_prompt(message, state, has_images)

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 4096 if think_mode else 2048,
        }
        # text OpenAI english_text json_object text
        if os.getenv("OPENAI_JSON_MODE", "1") != "0":
            payload["response_format"] = {"type": "json_object"}

        response = requests.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            # english_text，english_text
            timeout=self.timeout * 2 if think_mode else self.timeout,
        )
        response.raise_for_status()
        data = response.json()

        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("OpenAI returned no choices")

        text = choices[0].get("message", {}).get("content", "")
        if not text:
            raise RuntimeError("OpenAI returned empty text")
        return text

    def _call_gemini(self, message: str, state: dict, has_images: bool) -> str:
        import requests

        api_key = self._gemini_api_key()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")

        think_mode = _think_mode_on(state)
        system_prompt = SYSTEM_PROMPT + (MAX_THINK_PROMPT if think_mode else "")
        user_prompt = self._build_user_prompt(message, state, has_images)
        response = requests.post(
            GEMINI_URL,
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "topP": 0.9,
                    "maxOutputTokens": 4096 if think_mode else 2048,
                    "responseMimeType": "application/json",
                },
            },
            timeout=self.timeout * 2 if think_mode else self.timeout,
        )
        response.raise_for_status()
        data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned no candidates")

        text = ""
        for part in candidates[0].get("content", {}).get("parts", []):
            if "text" in part:
                text += part["text"]
        if not text:
            raise RuntimeError("Gemini returned empty text")
        return text

    def _build_user_prompt(self, message: str, state: dict, has_images: bool) -> str:
        history = state.get("conversation_history", [])[-5:]
        history_lines = []
        for turn in history:
            user_msg = turn.get("user", "")
            intent = turn.get("intent", "")
            history_lines.append(f"- user: {user_msg!r} → text: {intent}")

        scene_plan = state.get("scene_plan") or []
        scene_summary = ""
        if scene_plan:
            names = [s.get("scene_name", f"scene{i+1}") for i, s in enumerate(scene_plan[:10])]
            scene_summary = "、".join(names)

        gen_result = state.get("generation_result") or {}
        image_count_gen = len(gen_result.get("images", []))

        memory_ctx = state.get("memory_context", {}) or {}
        ctx = {
            "has_images": has_images or state.get("has_images", False),
            "image_count": state.get("image_count", 0),
            "profile_ready": state.get("profile_ready", False),
            "scenes_ready": state.get("scenes_ready", False),
            "generation_ready": state.get("generation_ready", False),
            "product_name": state.get("product_name", ""),
            "scene_plan_summary": scene_summary,
            "generated_image_count": image_count_gen,
            "user_preferences": state.get("user_preferences", {}),
            "memory_context": memory_ctx,
            "reflection_summary": memory_ctx.get("reflection_summary", []),
        }
        session_ctx = state.get("session_context")
        if session_ctx:
            ctx["blackboard"] = session_ctx

        parts = [
            "## english_textstatus",
            json.dumps(ctx, ensure_ascii=False, indent=2),
        ]
        capabilities = state.get("capabilities") or []
        if capabilities:
            cap_lines = [
                f"- {c.get('task_type')}（{c.get('agent')}）: {c.get('description')}"
                for c in capabilities
            ]
            parts.extend(["", "## english_text（task_plan text step english_text）"] + cap_lines)
        parts.extend([
            "",
            "## english_text（text5text）",
        ])
        if history_lines:
            parts.extend(history_lines)
        else:
            parts.append("（nonetext）")

        # english_text：textmessageenglish_text（platformtext/categorytext/english_text）
        try:
            from common.knowledge_base import search as kb_search
            kb_hits = kb_search(message, k=3)
        except Exception:  # noqa: BLE001 — english_textfailedenglish_text
            kb_hits = []
        if kb_hits:
            parts.extend(["", "## english_text（text/english_text，english_text）"])
            for hit in kb_hits:
                parts.append(f"### {hit['title']}\n{hit['text'][:500]}")

        # text v2：texttaskenglish_text（english_text，english_text）
        try:
            from common.memory_store import recall as memory_recall
            mem_hits = memory_recall(message, k=4)
        except Exception:  # noqa: BLE001 — english_textfailedenglish_text
            mem_hits = []
        if mem_hits:
            parts.extend(["", "## english_text（texttasktext，english_text）"])
            for hit in mem_hits:
                parts.append(f"- [{hit['category']}] {hit['text'][:200]}")

        parts.extend([
            "",
            f"## usertextmessage\n{message}",
            "",
            "textoutput JSON。",
        ])
        return "\n".join(parts)

    def _regex_fallback(self, message: str, state: dict, has_images: bool) -> dict:
        """Fallback path that preserves the same response contract as LLM output."""
        return self._normalize_result({
            **DEFAULT_INTENT_RESPONSE,
            "intent": "unknown",
            "confidence": 0.5,
            "extracted": {
                "user_goal_summary": message[:120] if message else "userenglish_text",
            },
            "reply_hint": "english_text",
        }, state, has_images)

    def _build_plan(self, intent: dict, state: dict, has_images: bool) -> dict:
        """Build a balanced plan object from normalized intent."""
        extracted = intent.get("extracted", {}) or {}
        goal = extracted.get("user_goal_summary") or intent.get("reply_hint", "")
        plan = list(intent.get("task_plan") or [])
        needs_clarification = False
        clarification_questions = []
        risk_level = "low"

        effective_has_images = has_images or state.get("has_images", False)
        if intent.get("intent") in ("ask_analyze", "confirm_generate", "regenerate", "ab_test") and not effective_has_images:
            needs_clarification = True
            risk_level = "high"
            clarification_questions.append("english_text")
        elif intent.get("intent") in ("unknown", "chat") and not goal:
            needs_clarification = True
            risk_level = "medium"

        if intent.get("confidence", 0.0) < 0.65:
            risk_level = "high"
            needs_clarification = True

        if plan:
            next_action = plan[0].get("step", "")
            if next_action in ("analyze", "generate") and not effective_has_images:
                needs_clarification = True
                clarification_questions.append("english_textimageenglish_text")
        else:
            next_action = intent.get("target_agent", "")

        ctx = {
            "has_images": effective_has_images,
            "image_count": state.get("image_count", 0),
            "profile_ready": state.get("profile_ready", False),
            "generation_ready": state.get("generation_ready", False),
            "product_name": state.get("product_name", ""),
            "task_plan_size": len(plan),
        }
        return {
            **DEFAULT_PLAN_RESPONSE,
            "goal": goal,
            "context": ctx,
            "constraints": self._extract_constraints(extracted, state),
            "plan": plan,
            "risk_level": risk_level,
            "needs_clarification": needs_clarification,
            "clarification_questions": clarification_questions,
            "next_action": next_action,
        }

    def _normalize_result(
        self,
        raw: dict,
        state: Optional[dict] = None,
        has_images: bool = False,
    ) -> dict:
        """english_text LLM output"""
        state = state or {}
        intent = raw.get("intent", "unknown")
        if intent not in VALID_INTENTS:
            intent = "unknown"

        confidence = raw.get("confidence", 0.7)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0.7
        confidence = max(0.0, min(1.0, confidence))

        extracted = raw.get("extracted") or {}
        if not isinstance(extracted, dict):
            extracted = {}

        # english_text platforms
        platforms = extracted.get("platforms")
        if platforms:
            extracted["platforms"] = normalize_platforms(platforms)

        quality = extracted.get("quality", "standard")
        if quality not in ("standard", "premium", "draft"):
            extracted["quality"] = "standard"

        task_plan = raw.get("task_plan") or []
        if not isinstance(task_plan, list):
            task_plan = []

        normalized_plan = []
        for item in task_plan:
            if not isinstance(item, dict):
                continue
            step = item.get("step", "")
            agent = item.get("agent") or STEP_TO_AGENT.get(step, "executor")
            normalized_plan.append({
                "step": step,
                "agent": agent,
                "reason": item.get("reason", ""),
            })

        llm_reply = str(raw.get("reply", "") or "").strip()

        # statustext
        intent_before_guard = intent
        effective_has_images = has_images or state.get("has_images", False)
        if intent in ("ask_analyze", "confirm_generate", "regenerate", "ab_test") and not effective_has_images:
            intent = "need_image_first"
            normalized_plan = []
        elif intent == "confirm_generate" and not state.get("profile_ready") and effective_has_images:
            # english_textgenerationenglish_text analyze
            if not normalized_plan:
                normalized_plan = [{
                    "step": "analyze",
                    "agent": "analyst",
                    "reason": "english_textgeneration",
                }]
            intent = "ask_analyze"
        elif intent == "download" and not state.get("generation_result"):
            intent = "need_generate_first"
            normalized_plan = []
        elif intent == "edit_image" and not state.get("generation_result"):
            intent = "need_generate_first"
            normalized_plan = []
        if intent != intent_before_guard:
            # english_text：LLM textreplyenglish_text，english_texttemplate
            llm_reply = ""

        target_agent = "executor"
        if normalized_plan:
            target_agent = normalized_plan[0].get("agent", "executor")
        else:
            intent_agent = {
                "ask_analyze": "analyst",
                "confirm_generate": "generator",
                "regenerate": "generator",
                "adjust_scene": "executor",
                "feedback": "qa",
                "ab_test": "generator",
                "download": "executor",
                "web_search": "researcher",
                "browse": "researcher",
                "research": "researcher",
            }
            target_agent = intent_agent.get(intent, "executor")

        return {
            "intent": intent,
            "confidence": confidence,
            "extracted": extracted,
            "task_plan": normalized_plan,
            "reply_hint": raw.get("reply_hint", ""),
            "llm_reply": llm_reply,
            "target_agent": target_agent,
            "llm_mode": True,
        }

    def _extract_constraints(self, extracted: dict, state: dict) -> list:
        constraints = []
        if extracted.get("platforms"):
            constraints.append(f"platforms={','.join(extracted['platforms'])}")
        if extracted.get("quality"):
            constraints.append(f"quality={extracted['quality']}")
        if state.get("profile_ready"):
            constraints.append("profile_ready=true")
        if state.get("generation_ready"):
            constraints.append("generation_ready=true")
        return constraints


def parse_llm_orchestrator_response(text: str) -> dict:
    """text LLM responsetext JSON（text markdown english_text）"""
    return parse_json_response(text)


def resolve_dispatch_intent(intent: dict) -> tuple:
    """
    text intent + task_plan english_text intent text target_agent。
    text (dispatch_intent_name, target_agent, remaining_plan)
    """
    task_plan = intent.get("task_plan") or []
    if task_plan:
        first = task_plan[0]
        step = first.get("step", "")
        mapped = STEP_TO_INTENT.get(step, intent.get("intent", "unknown"))
        agent = first.get("agent") or STEP_TO_AGENT.get(step, "executor")
        remaining = task_plan[1:]
        return mapped, agent, remaining

    return intent.get("intent", "unknown"), intent.get("target_agent", "executor"), []


def format_task_plan_chip(task_plan: list) -> str:
    """english_text：english_text LLM tasktext"""
    if not task_plan:
        return ""
    lines = ["🧠 **LLM text**"]
    for i, step in enumerate(task_plan, 1):
        name = step.get("step", "?")
        agent = step.get("agent", "executor")
        reason = step.get("reason", "")
        line = f"{i}. `{name}` → {agent}"
        if reason:
            line += f" — {reason}"
        lines.append(line)
    return "\n".join(lines)
