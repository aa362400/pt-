#!/usr/bin/env python3
"""
LLM 编排器 — OrchestratorBrain

使用 OpenAI 兼容 API 或 Gemini 理解用户意图、分解多步任务并路由到子 Agent。
无 API Key 或调用失败/超时时，由 Observer 回退到正则 understand()。
"""

import json
import os
import sys
from typing import Optional

_agent_root = os.path.join(os.path.dirname(__file__), "..")
if _agent_root not in sys.path:
    sys.path.insert(0, os.path.abspath(_agent_root))

from common.utils import normalize_platforms, parse_json_response

# 合法意图
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

# step → 默认子 Agent
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
    """编排 LLM 超时（秒）。3 秒会让代理型 API 几乎必然超时回退到正则模板，
    表现为"智能体不智能"；实测 gpt-5.5 代理一轮要 10~30 秒，默认放宽到 45 秒，
    可用 ORCHESTRATOR_LLM_TIMEOUT 调整。"""
    try:
        return float(os.getenv("ORCHESTRATOR_LLM_TIMEOUT", "45"))
    except ValueError:
        return 45.0


LLM_TIMEOUT_SEC = _default_llm_timeout()

SYSTEM_PROMPT = """你是电商产品图智能体的 LLM 编排器（OrchestratorBrain）。

## 角色
理解用户中文/英文消息，输出结构化 JSON，用于路由到专业子 Agent。

## 可用意图 (intent)
greet | upload | ask_analyze | confirm_generate | adjust_scene | feedback |
download | ab_test | regenerate | edit_image | chat | unknown |
web_search | browse | research

特殊：若用户想分析/生成但没有图片，intent 设为 need_image_first；
若用户想下载但没有生成结果，设为 need_generate_first。

## 选品评估意图 (research_product)
用户问「某个产品能不能做 / 值不值得做 / 帮我评估这个产品想法 / 选品分析」时用
research_product（不是 web_search：web_search 是找参考图/竞品页面，research_product
是要一份机会评分卡）。task_plan 必须为空数组（由选品雷达通道执行）。

## 精准局部改图意图 (edit_image)
用户要求修改已生成图片的某个局部（不是整张重做）时用 edit_image：
「把第三张图杯子上的 logo 去掉」「那张海报背景换成米白色」「阴影调淡一点」。
与 regenerate 的区别：regenerate 是整张重新生成/换风格；edit_image 只动指定区域。
注意：intent=edit_image 时 task_plan 必须为空数组（局部改图由专门通道执行，不走子 Agent 管线）。

## 上网研究意图
- web_search: 用户要搜索竞品/参考图（如「搜一下 etsy 木质笔袋」「找参考图」）
- browse: 用户粘贴商品链接要求抓取（如「看看这个链接 https://...」）
- research: 综合搜索+抓取（如「帮我研究竞品并找参考图」）

## 平台自动工作边界
当用户说「接入我的平台后自动工作 / 自动运营 / 自己上传 / 自己改商品」时：
1. 若当前没有平台连接器和授权信息，只能作为 chat 回答：说明需要先接入平台、授权范围和动作权限，不要编造已连接。
2. 默认建议从「只读分析 + 自动生成草稿」开始，不直接发布或修改线上商品。
3. 可自动规划的低/中风险工作：同步商品、诊断 Listing、生成图片方案、生成上架图、生成文案、创建待审核草稿、导出资料包。
4. 必须人工确认的高风险工作：上传到线上商品、覆盖标题/图片/描述/价格、批量重做、覆盖已有草稿。
5. 禁止自动执行的危险工作：发布 Listing、删除商品/订单/店铺数据、付款/退款、修改收款/物流/税务/店铺绑定。
6. 如果用户要求“全自动”，reply 必须提醒：先做 L1/L2 自动化，L3 只在确认后执行，L4 不执行。

## 可用子 Agent
- analyst: 产品视觉分析、场景匹配
- generator: 批量出图、A/B 变体、重新生成
- qa: 一致性检测、反馈记录
- layout: 排版与多平台适配
- executor: 通用执行（场景调整、下载打包）
- researcher: 上网搜索竞品、抓取参考图、浏览商品页

## task_plan 规则
- 用户一句话含多步时，拆成有序步骤，每步含 step/agent/reason
- step 取值: analyze | generate | adjust | feedback | ab_test | download | regenerate | web_search | browse | research
- 若当前状态不允许某步（如无图却要生成），只规划可执行的第一步，其余留到后续
- 单步或无执行需求时 task_plan 可为空数组

## 平台识别
淘宝→taobao_main, 亚马逊/amazon→amazon_main, 小红书→xiaohongshu, 京东→jd_main

## 输出格式（仅 JSON，无 markdown 说明）
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
    "user_goal_summary": "用户想要什么"
  },
  "task_plan": [{"step": "analyze", "agent": "analyst", "reason": "..."}],
  "reply_hint": "建议回复用户的要点",
  "reply": "直接展示给用户的中文回复"
}

## reply 写作要求（重要）
你同时是一位懂产品、懂平台、懂视觉营销的资深跨境电商顾问，reply 是用户唯一看到的话：
1. 像资深同事聊天：自然、有温度、有观点，可少量 emoji；不要客服腔、不要自报"我是XX智能体"。
2. 若 intent 是 chat/unknown/greet：认真回答用户的问题本身（选品、平台规则、出图建议都可聊），
   末尾自然带一句与当前会话进度相关的引导。
3. 若要派发任务（分析/生成等）：确认理解 + 说明马上要做什么，可结合产品补充一条专业洞察。
4. 只陈述会话状态里真实存在的事实，禁止编造"已完成/已生成"。
5. 涉及平台自动执行时，必须区分「可自动生成草稿」「需确认后执行」「禁止执行」。
6. 控制在 220 字以内；不用 markdown 标题，可用少量加粗。"""


MAX_THINK_PROMPT = """

## MAX 思考模式（当前已开启）
用户开启了深度思考模式，愿意用更长等待换更高质量。请先在内部完整推演（不要输出推理过程）：
1. 用户的真实目标与隐含约束（平台合规规则、类目特性、目标人群购买心理）
2. 至少 3 种可行做法的取舍与理由
3. 主要风险和后手方案
然后输出：
- reply 可放宽到 400 字：给出结论 + 建议依据 + 至少一条竞品/平台层面的洞察 + 风险提醒（如有）
- task_plan 尽可能完整（多步任务全部列出，而不是只列第一步）
- extracted 的字段尽量填满，user_goal_summary 写透彻"""


def _think_mode_on(state: dict | None) -> bool:
    return bool((state or {}).get("think_mode"))


def resolve_max_model() -> str:
    """MAX 模式可选强模型：未配置 LLM_MODEL_MAX 时沿用 LLM_MODEL。"""
    return (os.getenv("LLM_MODEL_MAX", "").strip()
            or os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL))


def resolve_orchestrator_provider() -> str:
    """解析编排器 LLM 提供商：openai | gemini"""
    explicit = os.getenv("ORCHESTRATOR_LLM_PROVIDER", "").strip().lower()
    if explicit in ("openai", "gemini"):
        return explicit
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "gemini"


class OrchestratorBrain:
    """LLM 驱动的意图理解与任务分解"""

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
        """全局禁用开关（测试/离线环境用）。显式注入 api_key 时不受影响。"""
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
        调用 LLM 理解用户消息。

        成功返回规范化 dict；无 Key / 失败 / 超时返回 None（触发 regex 回退）。
        """
        if not self._has_llm_credentials():
            return None

        if not message and not has_images:
            return self._normalize_result({
                "intent": "greet",
                "confidence": 1.0,
                "extracted": {"user_goal_summary": "用户进入会话"},
                "task_plan": [],
                "reply_hint": "友好问候并引导上传产品图",
            }, state, has_images)

        if not message and has_images:
            return self._normalize_result({
                "intent": "upload",
                "confidence": 1.0,
                "extracted": {
                    "user_goal_summary": "用户上传了产品图",
                    "image_count": state.get("image_count", 0),
                },
                "task_plan": [],
                "reply_hint": "确认收到图片，询问是否分析",
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
            except Exception as e:  # noqa: BLE001 — 失败要留痕，否则"回退正则"无声无息
                import logging
                logging.getLogger(__name__).warning(
                    "编排 LLM 调用失败（%s，timeout=%ss）：%s——回退正则理解",
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

        传入 intent 时直接基于该意图建计划（避免重复调用 LLM）。
        """
        if intent is None:
            intent = self.understand(message, state, has_images)
        return self._build_plan(intent, state, has_images)

    REPLY_SYSTEM_PROMPT = """你是「跨境电商 AI 出图智能体」，一位懂产品、懂平台、懂视觉营销的资深电商顾问。
用户在和你对话。请基于给定的会话状态与意图，用中文写一段自然、有温度、有观点的回复。

要求：
1. 像资深同事聊天，不要客服腔；口语化但专业，可少量 emoji。
2. 「参考模板回复」里的事实信息（状态、数字、下一步操作、按钮名）必须保留且不得编造新事实；
   你的工作是把它讲得自然、有见解，并结合产品/平台补充 1 条洞察或建议。
3. 若意图是 chat/unknown/greet：直接回答用户的问题本身（电商选品、平台规则、出图建议等都可聊），
   末尾自然带一句和当前会话进度相关的引导。
4. 如果用户谈到接入平台、自动上传、自动改商品、自动发布：必须说明风险边界。
   默认建议先做「只读分析 + 自动生成草稿」；线上修改需要确认；发布、删除、付款等危险动作不自动执行。
5. 控制在 220 字以内；不要输出 JSON、不要 markdown 标题（可用少量加粗/列表）。"""

    def compose_reply(self, message: str, intent: dict, state: dict,
                      template_reply: str = "") -> Optional[str]:
        """把模板回复升级为 LLM 自然语言回复；无 Key/失败返回 None（保留模板）。"""
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
                "用户消息": message,
                "识别意图": intent.get("intent", ""),
                "要点提示": intent.get("reply_hint", ""),
                "参考模板回复": (template_reply or "")[:600],
                "会话状态": {
                    "已有产品图": state.get("has_images", False),
                    "产品名": state.get("product_name", ""),
                    "已出图张数": len((state.get("generation_result") or {}).get("images", [])),
                    "档案就绪": state.get("profile_ready", False),
                },
                "最近对话": [
                    {"用户": t.get("user", ""), "意图": t.get("intent", "")}
                    for t in history
                ],
                "长期记忆": (state.get("memory_context") or {}).get("user_profile", {}),
            }
            reply_system = self.REPLY_SYSTEM_PROMPT
            if think_mode:
                reply_system += ("\n\n用户开启了 MAX 思考模式：先在内部深入推演再回答，"
                                 "回复可放宽到 400 字，须包含建议依据与一条平台/竞品层面的洞察。")
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
            # 瞬时 5xx/超时重试一次：回退模板意味着用户看到呆板话术，值得多等一拍
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
            # LLM 偶发返回 JSON/空串时不采用
            if not text or text.startswith("{"):
                return None
            return text
        except Exception:  # noqa: BLE001 — 自然回复失败静默回退模板
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
        # 部分 OpenAI 兼容代理支持 json_object 模式
        if os.getenv("OPENAI_JSON_MODE", "1") != "0":
            payload["response_format"] = {"type": "json_object"}

        response = requests.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            # 深思模式推理时间更长，给双倍超时预算
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
            history_lines.append(f"- 用户: {user_msg!r} → 意图: {intent}")

        scene_plan = state.get("scene_plan") or []
        scene_summary = ""
        if scene_plan:
            names = [s.get("scene_name", f"场景{i+1}") for i, s in enumerate(scene_plan[:10])]
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
            "## 当前会话状态",
            json.dumps(ctx, ensure_ascii=False, indent=2),
        ]
        capabilities = state.get("capabilities") or []
        if capabilities:
            cap_lines = [
                f"- {c.get('task_type')}（{c.get('agent')}）: {c.get('description')}"
                for c in capabilities
            ]
            parts.extend(["", "## 系统可用能力（task_plan 的 step 只能从这里选）"] + cap_lines)
        parts.extend([
            "",
            "## 最近对话（最多5轮）",
        ])
        if history_lines:
            parts.extend(history_lines)
        else:
            parts.append("（无历史）")

        # 行业知识库：按消息相关性注入要点（平台规范/类目打法/经验笔记）
        try:
            from common.knowledge_base import search as kb_search
            kb_hits = kb_search(message, k=3)
        except Exception:  # noqa: BLE001 — 知识库失败不阻断理解
            kb_hits = []
        if kb_hits:
            parts.extend(["", "## 行业知识库要点（回答/规划时参考，不要照抄原文）"])
            for hit in kb_hits:
                parts.append(f"### {hit['title']}\n{hit['text'][:500]}")

        # 记忆 v2：历史任务沉淀的经验卡片（跨会话，越用越懂这家店）
        try:
            from common.memory_store import recall as memory_recall
            mem_hits = memory_recall(message, k=4)
        except Exception:  # noqa: BLE001 — 记忆召回失败不阻断理解
            mem_hits = []
        if mem_hits:
            parts.extend(["", "## 历史经验记忆（过往任务沉淀，规划时参考）"])
            for hit in mem_hits:
                parts.append(f"- [{hit['category']}] {hit['text'][:200]}")

        parts.extend([
            "",
            f"## 用户本条消息\n{message}",
            "",
            "请输出 JSON。",
        ])
        return "\n".join(parts)

    def _regex_fallback(self, message: str, state: dict, has_images: bool) -> dict:
        """Fallback path that preserves the same response contract as LLM output."""
        return self._normalize_result({
            **DEFAULT_INTENT_RESPONSE,
            "intent": "unknown",
            "confidence": 0.5,
            "extracted": {
                "user_goal_summary": message[:120] if message else "用户未提供文本",
            },
            "reply_hint": "使用规则引擎回退解析",
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
            clarification_questions.append("请先上传产品图")
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
                clarification_questions.append("需要先上传图片再继续")
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
        """校验并规范化 LLM 输出"""
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

        # 规范化 platforms
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

        # 状态守卫
        intent_before_guard = intent
        effective_has_images = has_images or state.get("has_images", False)
        if intent in ("ask_analyze", "confirm_generate", "regenerate", "ab_test") and not effective_has_images:
            intent = "need_image_first"
            normalized_plan = []
        elif intent == "confirm_generate" and not state.get("profile_ready") and effective_has_images:
            # 未分析时优先生成计划中的 analyze
            if not normalized_plan:
                normalized_plan = [{
                    "step": "analyze",
                    "agent": "analyst",
                    "reason": "需先分析产品再生成",
                }]
            intent = "ask_analyze"
        elif intent == "download" and not state.get("generation_result"):
            intent = "need_generate_first"
            normalized_plan = []
        elif intent == "edit_image" and not state.get("generation_result"):
            intent = "need_generate_first"
            normalized_plan = []
        if intent != intent_before_guard:
            # 守卫改写了意图：LLM 写的回复可能承诺了做不到的事，丢弃回退模板
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
    """从 LLM 响应解析 JSON（兼容 markdown 代码块）"""
    return parse_json_response(text)


def resolve_dispatch_intent(intent: dict) -> tuple:
    """
    从 intent + task_plan 解析实际派发的 intent 名与 target_agent。
    返回 (dispatch_intent_name, target_agent, remaining_plan)
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
    """调试用语：格式化 LLM 任务规划"""
    if not task_plan:
        return ""
    lines = ["🧠 **LLM 规划**"]
    for i, step in enumerate(task_plan, 1):
        name = step.get("step", "?")
        agent = step.get("agent", "executor")
        reason = step.get("reason", "")
        line = f"{i}. `{name}` → {agent}"
        if reason:
            line += f" — {reason}"
        lines.append(line)
    return "\n".join(lines)
