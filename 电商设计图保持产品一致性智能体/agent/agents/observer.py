#!/usr/bin/env python3
"""
观察智能体 — Observer Agent

职责：与用户对话、理解需求、派发任务给执行智能体、监督执行结果并回复用户

这不仅仅是"一个函数"，而是一个有状态的 AI Agent。
它在每次用户发消息时被激活，决定"我该说什么"和"我该派什么任务"。
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
    观察智能体

    核心循环：
      1. 接收用户消息（文本+图片）
      2. 理解用户意图 → Intent
      3. 如果需要执行任务 → 创建 Task 派发给 Executor
      4. 监督 Executor 执行过程
      5. 验证执行结果
      6. 回复用户

    状态管理：
      self.state 记录整个对话的上下文
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
        self.executor = None  # 会在外部绑定
        self.orchestrator = OrchestratorBrain()
        self._last_understand_mode = "regex"  # "llm" | "regex"

    # ============================================================
    # 1. 理解用户意图
    # ============================================================

    def understand(self, message: str, has_images: bool = False) -> dict:
        """
        理解用户消息：优先 LLM 编排，失败或无 Key 时回退正则 understand。

        返回 intent 字典，可能含 task_plan、target_agent、llm_mode 字段。
        """
        plan = self.plan_message(message, has_images)
        intent_result = plan.get("intent_result", {})
        self._clear_answered_questions(intent_result)
        self._append_event("understand", {"intent": intent_result.get("intent"), "mode": self._last_understand_mode})
        return intent_result

    def _resolve_intent(self, message: str, prompt_state: dict, has_images: bool) -> dict:
        """LLM 优先解析意图，失败/无 Key 回退观察者正则解析。"""
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
        """将 LLM 编排结果合并为 intent 字典"""
        extracted = dict(llm_result.get("extracted") or {})

        # 正则补充：反馈图片匹配、生成选项
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
            # 强制改走产品流程时，LLM 原回复针对的是旧意图，不再适用
            "llm_reply": "" if forced_product_flow else llm_result.get("llm_reply", ""),
            "llm_mode": True,
            "raw_message": message,
            "has_images": has_images,
        }

    def _merge_plan_into_intent(self, intent_result: dict, plan: dict) -> dict:
        """把全局计划的风险/澄清信息合并进 intent 字典。"""
        merged = dict(intent_result or {})
        merged["plan"] = plan
        merged["needs_clarification"] = plan.get("needs_clarification", False)
        merged["clarification_questions"] = plan.get("clarification_questions", [])
        merged["risk_level"] = plan.get("risk_level", "medium")
        if not merged.get("task_plan") and plan.get("plan"):
            merged["task_plan"] = list(plan.get("plan") or [])
        return merged

    def _understand_regex(self, message: str, has_images: bool = False) -> dict:
        """正则回退：理解用户这次发来的消息，返回意图分析结果。"""
        msg = message.strip().lower()

        # ---------- 意图判断 ----------
        intent = "unknown"
        confidence = 0.5
        extracted = {}
        msg_no_urls = re.sub(r"https?://\S+", " ", message, flags=re.I).strip().lower()

        effective_has_images = has_images or self.state.get("has_images", False)

        # 有图/会话产品上下文时，“分析/生成”优先于打招呼和平台词触发的竞品搜索。
        if effective_has_images and self._message_requests_product_flow(message):
            intent = self._product_flow_intent(message)
            confidence = 0.96 if intent == "confirm_generate" else 0.9

        # 用户刚进来、打招呼
        elif not message and not has_images:
            intent = "greet"
            confidence = 1.0
        elif re.search(r"(你好|在吗|嗨|早上好|下午好|晚上好)|\b(hi|hello)\b", msg):
            intent = "greet"
            confidence = 1.0

        # 平台适配/选品判断：用户提到 Etsy/Amazon 等平台不一定是要联网搜索。
        # “适合哪个平台/能不能做”应进入机会卡，而不是把完整需求派给研究智能体。
        elif re.search(
            r"(适合.*(etsy|amazon|temu|tiktok|亚马逊)|"
            r"(etsy|amazon|temu|tiktok|亚马逊).*(还是|和|vs|对比).*"
            r"(etsy|amazon|temu|tiktok|亚马逊)|"
            r"哪个平台|平台.*适合|适合.*平台)",
            msg_no_urls or msg,
            re.I,
        ):
            intent = "research_product"
            confidence = 0.9

        # 上网研究：搜索竞品 / 抓取链接（优先于普通 upload）
        elif re.search(
            r"(搜竞品|搜索竞品|找参考|参考图|竞品分析|搜一下|上网搜|etsy|amazon|淘宝.*类似|类似产品|竞争对手)",
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
            r"(抓取|看看|打开|browse|fetch|分析这个|这个链接|商品链接)", msg
        ):
            intent = "browse"
            confidence = 0.92
            extracted["urls"] = extract_urls(message)

        elif re.search(r"https?://", message, re.I) and not has_images:
            intent = "browse"
            confidence = 0.85
            extracted["urls"] = extract_urls(message)

        # 上传了图片（含从 URL 抓取）
        elif has_images:
            intent = "upload"
            confidence = 1.0
            extracted["image_count"] = self.state["image_count"]
            if re.search(r"https?://", message, re.I):
                extracted["from_url"] = True

        # 要求分析
        elif re.search(r"(分析|看看|这是什么|describe|识别|认识)", msg):
            if self.state["has_images"]:
                intent = "ask_analyze"
                confidence = 0.95
            else:
                intent = "need_image_first"
                confidence = 1.0

        # 选品评估：「能不能做/值不值得做/选品分析」→ 机会评分卡通道
        elif re.search(r"(能不能做|值不值得做|值得做吗|选品分析|帮我评估|适不适合(卖|上架|做))", msg):
            intent = "research_product"
            confidence = 0.9

        # 精准局部改图（已出图 + 局部修改动词：只动一块，不整张重做）
        # 放在「生成」分支之前：改图话术常含「logo」（误中 go）、「改/换」等宽泛词
        elif self.state.get("generation_result") and re.search(
            r"(去掉|去除|删掉|移除|擦掉|抹掉|修掉|把.{1,30}(换成|改成|调亮|调暗)|"
            r"恢复上一版|换回上一版|撤销修改)", msg
        ):
            intent = "edit_image"
            confidence = 0.9

        # 要求生成
        elif re.search(r"(重新生成|再来|重做|regenerate|再生成)", msg):
            if self.state["has_images"]:
                intent = "regenerate"
                confidence = 0.9
            else:
                intent = "need_image_first"
                confidence = 1.0

        elif re.search(r"(生成|开始|\bgo\b|create|generate|做吧|好|可以|来吧|开搞)", msg):
            if self.state["profile_ready"]:
                intent = "confirm_generate"
                confidence = 0.95
            elif self.state["has_images"]:
                intent = "ask_analyze"
                confidence = 0.8
            else:
                intent = "need_image_first"
                confidence = 1.0

        # 调整场景
        elif re.search(r"(调整|修改|换|改|不要|重新|去掉|只要|change|modify|remove|keep)", msg):
            intent = "adjust_scene"
            confidence = 0.9
            # 提取具体场景关键字
            for keyword in ["白底", "生活", "高端", "使用", "细节",
                            "季节", "氛围", "对比", "评价", "品牌",
                            "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]:
                if keyword in msg:
                    extracted["mentioned_scenes"] = extracted.get("mentioned_scenes", [])
                    extracted["mentioned_scenes"].append(keyword)

        # 反馈（喜欢/不喜欢某张图）
        elif re.search(r"(喜欢|不喜欢|好看|不好看|这张不错|这张不行|nice|bad| ugly|beautiful)", msg):
            intent = "feedback"
            confidence = 0.85
            extracted.update(self._extract_feedback(message))

        # A/B 测试
        elif re.search(r"(a/b|ab测试|ab test|变体|对比测试)", msg):
            if self.state["has_images"]:
                intent = "ab_test"
                confidence = 0.9
            else:
                intent = "need_image_first"
                confidence = 1.0

        # 重新生成 — 已在「要求生成」之前处理

        # 解析生成选项（品牌、平台、质量、引擎）
        if intent in ("confirm_generate", "regenerate", "upload", "ask_analyze"):
            extracted.update(self._extract_generation_options(message))
            product_hints = self._extract_product_hints(message)
            if product_hints:
                extracted["product_hints"] = product_hints
                self.state["product_hints"] = product_hints
            if self._has_generation_step(intent, []):
                self._remember_pending_generation_constraints(extracted, message)
            if intent == "ask_analyze" and re.search(r"(生成|开始|create|generate|go|出图|主图)", message, re.I):
                self.state["pending_task_plan"] = [{
                    "step": "generate",
                    "agent": "generator",
                    "reason": "用户要求分析后继续生成",
                }]
                self._remember_pending_generation_constraints(extracted, message)

        # 下载/保存
        elif re.search(r"(下载|保存|export|download|打包|zip)", msg):
            if self.state["generation_result"]:
                intent = "download"
                confidence = 1.0
            else:
                intent = "need_generate_first"
                confidence = 1.0

        # 普通聊天
        elif re.search(r"(谢谢|感谢|好的|ok|明白|知道了|thank|thanks)", msg):
            intent = "chat"
            confidence = 1.0

        # 更新意图状态
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
        """从用户消息提取喜欢/不喜欢的图片"""
        msg = message.strip()
        is_positive = bool(re.search(r"(喜欢|好看|不错|nice|good|beautiful|这张不错)", msg, re.I))
        is_negative = bool(re.search(r"(不喜欢|不好看|不行|bad|ugly|这张不行|这张不好)", msg, re.I))

        liked, disliked = [], []
        gen_result = self.state.get("generation_result") or {}
        images = gen_result.get("images", [])

        for img in images:
            fname = img.get("filename", "")
            scene_name = img.get("scene_name", "")
            scene_id = img.get("scene_id", "")
            matched = any(k and k in msg for k in [fname, scene_name, scene_id])
            if not matched:
                for keyword in ["白底", "生活", "高端", "使用", "细节", "季节", "氛围", "对比", "评价", "品牌"]:
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
        """从消息提取品牌、平台、质量、引擎与场景约束选项"""
        opts = {}
        brand_match = re.search(r"(?:品牌名|品牌|brand)[:：]\s*(.+)", message, re.I)
        if brand_match:
            opts["brand_name"] = brand_match.group(1).strip().split()[0]

        if re.search(r"(跨境|cross[- ]?border|海外平台|出海)", message, re.I):
            if re.search(r"(全部|所有|all|every)", message, re.I):
                opts["platforms"] = list(CROSS_BORDER_PLATFORMS)

        platform_match = re.search(r"(?:平台|platforms?)[:：]\s*(.+)", message, re.I)
        if platform_match:
            raw = platform_match.group(1).strip()
            raw = re.split(
                r"\s*(?:高质量|premium|自动引擎|auto[- ]?engine|生成|开始|市场|地区|节日|markets?[:：]|region[:：]|festival[:：])",
                raw, flags=re.I,
            )[0]
            raw = raw.strip(" ，,")
            platforms = normalize_platforms(raw)
            if platforms:
                opts["platforms"] = platforms
        elif re.search(r"(平台|platform)", message, re.I):
            platform_names = re.findall(
                r"(amazon|shopify|lazada|shopline|etsy|alibaba|亚马逊|阿里巴巴|国际站|淘宝|小红书|京东)",
                message,
                re.I,
            )
            platforms = normalize_platforms(platform_names)
            if platforms:
                opts["platforms"] = platforms

        if re.search(r"(premium|高质量|高级|精品)", message, re.I):
            opts["quality"] = "premium"
        if re.search(r"(auto[- ]?engine|自动引擎|多引擎|智能引擎)", message, re.I):
            opts["auto_engine"] = True

        wm_match = re.search(r"(?:水印|watermark)[:：]\s*(.+)", message, re.I)
        if wm_match:
            opts["watermark_path"] = wm_match.group(1).strip().split()[0]

        # 跨境本地化选项：市场（多语言文案）、地区（场景审美改写）、节日场景
        markets_match = re.search(r"(?:市场|markets?)[:：]\s*([a-z0-9,\s]+)", message, re.I)
        if markets_match:
            markets = [m for m in re.split(r"[,\s，]+", markets_match.group(1).strip().lower()) if m]
            if markets:
                opts["markets"] = markets
        region_match = re.search(r"(?:地区|region)[:：]\s*([a-z]+)", message, re.I)
        if region_match:
            opts["region"] = region_match.group(1).strip().lower()
        festival_match = re.search(r"(?:节日|festival)[:：]\s*([a-z_]+)", message, re.I)
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

        if has_any("钢笔", "签字笔", " fountain pen", "pen"):
            facts.append("棕色木纹钢笔")
            hints["product_type"] = "pen"
            hints["product_name"] = "木质钢笔礼盒展示架"
            hints["product_name_cn"] = "木质钢笔礼盒展示架"
            hints["category"] = "writing instrument gift set"
            hints["category_cn"] = "文具礼品与桌面收纳"

        if has_any("笔盒", "笔架", "礼盒", "展示架", "斜托"):
            facts.append("浅色木质斜托笔盒/展示架")

        if has_any("金色笔夹", "金色金属环", "金属环", "金色"):
            facts.append("金色笔夹与金色金属环")

        if has_any("透明笔帽", "透明帽", "笔帽"):
            facts.append("透明笔帽")

        if has_any("深浅双色", "双色木", "木质", "木纹"):
            facts.append("深浅双色木材与天然木纹")

        if facts:
            hints["user_facts"] = list(dict.fromkeys(facts))
            hints["description"] = "、".join(hints["user_facts"])
        return hints

    def _message_requests_product_flow(self, message: str) -> bool:
        """Whether a message is asking to continue product analysis/generation."""
        msg = message or ""
        return bool(
            re.search(r"(分析|识别|看看|生成|开始|create|generate|go|出图)", msg, re.I)
            or re.search(r"(只|仅|only).{0,12}主图", msg, re.I)
        )

    def _product_flow_intent(self, message: str) -> str:
        """Choose analyze vs generate for product-flow messages from current state."""
        msg = message or ""
        wants_generate = bool(re.search(r"(生成|开始|create|generate|go|出图|主图)", msg, re.I))
        wants_analyze = bool(re.search(r"(分析|识别|看看)", msg, re.I))
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
        wants_generate = bool(re.search(r"(生成|开始|create|generate|go|出图|主图)", message or "", re.I))
        if intent_name == "ask_analyze" and wants_generate:
            return [
                {"step": "analyze", "agent": "analyst", "reason": "用户要求继续分析产品"},
                {"step": "generate", "agent": "generator", "reason": "分析完成后按约束生成"},
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
        """Parse user requests like “只生成第2个场景/白底主图/1张”."""
        msg = message or ""
        opts = {}
        selectors = []

        count = self._extract_requested_image_count(msg)
        if count:
            opts["generation_count"] = count

        for m in re.finditer(r"第\s*([一二三四五六七八九十\d]+)\s*(?:个)?\s*(?:场景|图|张)?", msg):
            number = self._parse_cn_number(m.group(1))
            if number:
                selectors.append({"type": "index", "value": number - 1})

        for m in re.finditer(r"scene[_-]?(\d{1,2})", msg, re.I):
            number = int(m.group(1))
            selectors.append({"type": "id_prefix", "value": f"scene_{number:02d}"})

        keyword_map = [
            ("白底|纯净白底|主图|white", "scene_01_white_bg"),
            ("生活方式|生活场景|lifestyle", "scene_02_lifestyle"),
            ("高端|奢华|premium", "scene_03_premium"),
            ("使用|使用场景|in use", "scene_04_in_use"),
            ("细节|detail", "scene_05_detail"),
            ("季节|节日|season", "scene_06_seasonal"),
            ("氛围|atmosphere", "scene_07_atmospheric"),
            ("对比|套装|comparison", "scene_08_comparison"),
            ("评价|社交|review", "scene_09_review_social"),
            ("品牌故事|品牌|story", "scene_10_brand_story"),
            ("海报|宣传图|宣传海报|banner|poster", "scene_11_promo_poster"),
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
        elif count == 1 and re.search(r"(只|仅|only|不要生成其他|测试图)", msg, re.I):
            selected = self._resolve_scene_selectors(scene_plan, [], count)
            if selected:
                opts["selected_scenes"] = selected

        return opts

    def _extract_requested_image_count(self, message: str) -> Optional[int]:
        m = re.search(r"([一二两三四五六七八九十\d]+)\s*张", message)
        if not m:
            return None
        return self._parse_cn_number(m.group(1))

    def _parse_cn_number(self, raw: str) -> Optional[int]:
        raw = str(raw).strip()
        if raw.isdigit():
            return int(raw)
        mapping = {
            "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
            "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
        }
        if raw in mapping:
            return mapping[raw]
        if raw.startswith("十") and len(raw) == 2:
            return 10 + mapping.get(raw[1], 0)
        if raw.endswith("十") and len(raw) == 2:
            return mapping.get(raw[0], 0) * 10
        if "十" in raw:
            left, right = raw.split("十", 1)
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
        """从用户消息提取搜索关键词"""
        msg = message.strip()
        for pat in [
            r"(?:搜|搜索|查找|找一下|帮我搜)[：:\s]*(.+)",
            r"(?:竞品|参考图|类似产品)[：:\s]*(.+)",
            r"(?:etsy|amazon|淘宝|亚马逊)上(.+)",
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
        # 跨会话用户画像（常用平台/品牌/禁忌/风格口味），任何失败都不阻断
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
        # 记忆 v2：复盘沉淀为经验卡片（审核后写入分层记忆文件，跨会话生效）
        try:
            from common.memory_store import write_card
            product = self.state.get("product_name", "")
            data = executor_report.get("data", {}) or {}
            card = {
                "task": f"{task_type} {product}".strip(),
                "outcome": "成功" if approved else "未通过",
            }
            if approved and status != "error":
                score = data.get("consistency_score") or self.state.get(
                    "generation_result", {}).get("consistency_score")
                detail = f"{task_type} 完成"
                if score:
                    detail += f"，一致性 {score}"
                if product:
                    detail += f"，产品 {product}"
                card["success"] = detail
            else:
                card["avoid"] = (f"{task_type} 失败：" +
                                 str(supervision.get("feedback", "") or
                                     data.get("error", ""))[:120])
            write_card(card)
            # 工作记忆：记录结构化任务记录到本地 + 同步平台
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
            except Exception:  # noqa: BLE001 — 工作记忆写入失败不影响复盘
                pass
        except Exception:  # noqa: BLE001 — 经验沉淀失败不影响复盘
            pass
        self._append_event("post_task_reflect", reflection)
        return reflection

    _DEFAULT_PLATFORMS = CROSS_BORDER_PLATFORMS  # canonical ids; compare with list(...)

    def _build_proactive_questions(self, intent_name: str, extracted: Optional[dict] = None) -> list:
        """
        根据会话状态缺口生成主动追问列表。
        返回: [{"id": str, "text": str, "chips": [str, ...]}, ...]
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
                add("product_info", "这是什么产品？", ["分析一下"])
            add("platform_target", "主要卖哪个平台？（亚马逊 / Shopify / Lazada 等跨境平台）", ["选平台"])
            if not has_brand:
                add("brand_logo", "有品牌名或 Logo 吗？没有也可以先跳过。", ["设置品牌"])

        elif intent_name == "greet":
            if ctx["has_images"] and not ctx.get("profile_ready"):
                add("analyze_prompt", "我看到你上传了图，需要我先分析一下吗？", ["分析一下", "直接生成"])

        elif intent_name in ("unknown", "chat"):
            if ctx["has_images"] and not ctx.get("profile_ready"):
                add("analyze_prompt", "我看到你上传了图，需要我先分析一下吗？", ["分析一下"])
            elif ctx.get("profile_ready") and not ctx.get("generation_ready"):
                self._add_pre_generate_questions(add, prefs, has_brand, is_default_platforms)

        elif intent_name == "confirm_generate":
            self._add_pre_generate_questions(add, prefs, has_brand, is_default_platforms)

        elif intent_name == "post_analyze":
            add("scene_confirm", "上面的场景推荐符合你的预期吗？要调整还是直接生成？", ["直接生成", "调整场景"])
            if is_default_platforms:
                add("platform_target", "目标平台默认为全部跨境平台，要改吗？", ["选平台"])
            add("watermark_need", "需要加水印吗？有的话告诉我路径或稍后上传。", [])
            add("style_pref", "主图风格有偏好吗？（比如极简白底 / 生活场景感 / 高端质感）", [])

        elif intent_name == "post_generate_issues":
            add("retry_failed", "要重试失败的场景吗？", ["重新生成"])
            add("adjust_scenes", "或者告诉我需要调整哪些场景？", ["调整场景"])

        elif intent_name == "post_generate_low_score":
            add("retry_low_score", "一致性评分偏低，要重新生成还是调整部分场景？", ["重新生成", "调整场景"])

        elif intent_name in ("web_search", "browse", "research"):
            add("research_followup", "需要我继续搜索更多竞品，还是抓取某个链接的主图？", ["搜索竞品", "抓取链接"])

        elif intent_name == "unknown":
            last_msg = ""
            hist = ctx.get("conversation_history") or []
            if hist:
                last_msg = hist[-1].get("user", "")
            if re.search(r"(竞品|参考|对手|etsy|amazon)", last_msg, re.I):
                add("suggest_research", "要不要我帮你上网搜一下竞品或参考图？", ["搜索竞品"])

        ctx["pending_questions"] = list(asked)
        return questions

    def _add_pre_generate_questions(self, add, prefs, has_brand, is_default_platforms):
        """生成前检查清单式追问"""
        configured = []
        missing = []
        if has_brand:
            configured.append(f"品牌: {prefs.get('brand_name')}")
        else:
            missing.append("品牌名")
        plat = prefs.get("platforms") or list(CROSS_BORDER_PLATFORMS)
        plat_labels = {
            "amazon_main": "亚马逊", "amazon_detail": "亚马逊详情",
            "shopify": "Shopify", "lazada": "Lazada", "shopline": "Shopline",
            "etsy": "Etsy", "alibaba": "阿里巴巴国际",
            "taobao_main": "淘宝", "xiaohongshu": "小红书", "jd_main": "京东",
        }
        plat_str = "、".join(plat_labels.get(p, p) for p in plat)
        configured.append(f"平台: {plat_str}")
        if is_default_platforms:
            missing.append("平台（当前为默认）")
        quality = prefs.get("quality", "standard")
        configured.append(f"质量: {'高质量' if quality == 'premium' else '标准'}")
        if prefs.get("auto_engine"):
            configured.append("多引擎: 已开启")
        else:
            missing.append("多引擎（未开启）")

        checklist = f"已配置 {' · '.join(configured)}"
        if missing:
            checklist += f"；还缺 {'、'.join(missing)}"
        add("pre_generate_checklist", checklist + "。确认无误我就开始生成？", ["直接生成", "设置品牌", "选平台", "A/B测试"])

        if not has_brand:
            add("brand_name", "还没设置品牌名，要加吗？", ["设置品牌"])
        if is_default_platforms:
            add("platform_default", "默认全部跨境平台，要改吗？", ["选平台"])

    def _format_proactive_section(self, questions: list) -> str:
        """将主动提问自然融入回复（ChatGPT 风格）"""
        if not questions:
            return ""
        lines = [""]
        if len(questions) == 1:
            lines.append(f"💬 {questions[0]['text']}")
        else:
            lines.append("💬 在我继续之前，想跟你确认几件事：")
            for q in questions:
                lines.append(f"- {q['text']}")
        return "\n".join(lines)

    def _collect_quick_replies(self, questions: list) -> list:
        """汇总快捷回复 chip 文案（去重保序）"""
        chips = []
        for q in questions:
            chips.extend(q.get("chips", []))
        return list(dict.fromkeys(chips))

    def _clear_answered_questions(self, intent: dict):
        """用户回答相关意图后，清除对应 pending 问题，避免重复追问"""
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
        """生成基础回复并附加主动提问"""
        base = self._decide_reply_base(intent)
        questions = self._build_proactive_questions(intent["intent"], intent.get("extracted"))
        reply = base + self._format_proactive_section(questions)
        return {
            "reply": reply,
            "proactive_questions": questions,
            "quick_replies": self._collect_quick_replies(questions),
        }

    # ============================================================
    # 2. 决定回复内容
    # ============================================================

    def decide_reply(self, intent: dict) -> dict:
        """
        根据意图理解结果，决定观察者回复用户什么内容。
        这步在派发任务之前执行——先回复用户，再派任务。

        LLM 可用时用它把模板文案改写成自然、有观点的回复（事实以模板为准）；
        失败/无 Key 静默回退模板，保证永远有回复。

        返回: {"reply": str, "proactive_questions": [...], "quick_replies": [...]}
        """
        base = self._decide_reply_base(intent)
        questions = self._build_proactive_questions(intent["intent"], intent.get("extracted"))

        reply_body = base
        if intent.get("llm_mode"):
            # 优先用理解阶段一并生成的回复（零额外延迟）；缺失时再单独请求一次
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
        """基础回复文案（不含主动提问）"""
        intent_name = intent["intent"]
        ctx = self.state

        # ----- 问候 -----
        if intent_name == "greet":
            if ctx["has_images"]:
                return (
                    "👋 又见到你了！你之前上传的产品图还在，"
                    "需要我帮你 **分析** 一下，或者直接 **生成** 上架图吗？"
                )
            else:
                return (
                    "## 👋 你好！我是产品图智能体\n\n"
                    "我是 **观察智能体**，负责理解你的需求，然后调度 **执行智能体** 帮你干活。\n\n"
                    "**你可以：**\n"
                    "1. 📤 **上传产品图片** — 点击输入框左侧的 📎\n"
                    "2. 💬 **直接告诉我需求** — 比如「帮我生成一组包包的上架图」\n"
                    "3. 或者先上传图片，我来帮你分析！\n\n"
                    "> 当前状态：等待上传产品图片"
                )

        # ----- 上传了图片 -----
        elif intent_name == "upload":
            count = intent["extracted"].get("image_count", 0)
            from_url = intent["extracted"].get("from_url", False)
            if from_url:
                return (
                    f"🔗 已从你发的链接抓取 **{count} 张** 产品主图。\n\n"
                    "需要我帮你 **分析** 一下这款产品的特征吗？或者直接告诉我你的想法。"
                )
            if count == 1:
                return f"📸 收到 **1 张** 产品图！清晰度不错。\n\n需要我帮你 **分析** 一下这款产品的特征吗？或者直接告诉我你的想法。"
            else:
                return f"📸 收到 **{count} 张** 产品图！多角度拍摄很好，我能更准确地分析。\n\n要我现在帮你 **分析** 产品特征，然后推荐场景吗？"

        # ----- 需要先上传图片 -----
        elif intent_name == "need_image_first":
            return (
                "⏳ 我还没收到你的产品图片呢。\n\n"
                "请点击输入框左侧的 **📎** 按钮上传产品照片，"
                "或者直接把图片 **拖拽** 到聊天窗口。\n"
                "收到图片后我就能帮你分析并生成了！"
            )

        # ----- 要求分析 -----
        elif intent_name == "ask_analyze":
            return (
                "🔍 好的，我马上开始分析！\n\n"
                "我将使用 AI 视觉能力提取以下信息：\n"
                "- 产品名称 & 类别\n"
                "- 材质 & 颜色\n"
                "- 风格 & 关键特征\n"
                "- 目标人群 & 使用场景\n\n"
                "**观察智能体 → 执行智能体：** 已派发分析任务，请等待结果..."
            )

        # ----- 确认生成 -----
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
                extras.append(f"品牌: {prefs['brand_name']}")
            if prefs.get("auto_engine"):
                extras.append("多引擎调度")
            if prefs.get("quality") == "premium":
                extras.append("高质量模式")
            plat = prefs.get("platforms", [])
            if plat:
                extras.append(f"平台: {', '.join(plat)}")
            extra_line = f"\n**配置:** {' · '.join(extras)}\n" if extras else ""
            return (
                f"🎯 收到生成指令！准备生成 **{scene_count} 张** 情绪化上架图。\n\n"
                "完整流程：\n"
                "1. 批量创作 → 2. 后处理 → 3. 排版 → 4. 多平台适配 → 5. 一致性检测\n\n"
                f"{extra_line}"
                "**预计时间：** 2-5 分钟\n"
                "准备好了，开始吧！"
            )

        elif intent_name == "regenerate":
            return (
                "🔄 好的，我将重新执行完整生成流程。\n\n"
                "创作 → 后处理 → 排版 → 多平台 → 检测\n"
                "**观察智能体 → 执行智能体：** 已派发重新生成任务..."
            )

        elif intent_name == "ab_test":
            return (
                "🧪 收到 A/B 测试请求！\n\n"
                "我将对前 3 个场景各生成 2 个变体，方便你对比选择。\n"
                "**观察智能体 → 执行智能体：** 已派发 A/B 测试任务..."
            )

        elif intent_name == "edit_image":
            return (
                "🖌️ 收到，我来精准修改——先定位到你说的那张图和那个位置，"
                "只重绘目标区域，其余像素保持不动。改完我会自己先验收一遍。"
            )

        elif intent_name == "research_product":
            return (
                "🔍 收到，我按跨境选品逻辑帮你评估：机会评分、竞争难度、"
                "利润空间、适合平台、礼物场景、改款方向和风险提醒，马上出卡。"
            )

        elif intent_name == "web_search":
            query = intent.get("extracted", {}).get("search_query") or intent.get("raw_message", "")
            return (
                f"🔍 好的，我来帮你搜索竞品和参考图！\n\n"
                f"**搜索词：** {query}\n\n"
                "**观察智能体 → 研究智能体：** 已派发联网搜索任务..."
            )

        elif intent_name == "browse":
            urls = intent.get("extracted", {}).get("urls", [])
            url_preview = urls[0] if urls else "（链接）"
            return (
                f"🔗 收到，我来抓取这个商品页的内容和主图。\n\n"
                f"**链接：** {url_preview}\n\n"
                "**观察智能体 → 研究智能体：** 已派发链接抓取任务..."
            )

        elif intent_name == "research":
            extracted = intent.get("extracted", {})
            query = extracted.get("search_query", "")
            lines = ["🌐 好的，我来综合研究竞品并收集参考图。\n"]
            if query:
                lines.append(f"**搜索：** {query}")
            urls = extracted.get("urls", [])
            if urls:
                lines.append(f"**链接：** {len(urls)} 个")
            lines.append("\n**观察智能体 → 研究智能体：** 已派发研究任务...")
            return "\n".join(lines)

        # ----- 调整场景 -----
        elif intent_name == "adjust_scene":
            if ctx.get("scene_plan"):
                return (
                    "🔄 收到，正在根据你的要求调整场景方案。\n\n"
                    "执行智能体处理完成后，请回复 **「生成」** 或 **「重新生成」** 按新方案出图。"
                )
            return (
                "🔄 收到，我来记录你的调整需求。\n\n"
                "请告诉我具体想怎么调整？比如：\n"
                "- 「去掉第3张氛围图，换成白底」\n"
                "- 「把生活方式场景改成更温暖的风格」\n"
                "- 「只保留1、2、5、7、10这五张」\n\n"
                "调整完成后，回复 **「生成」** 开始出图。"
            )

        # ----- 反馈 -----
        elif intent_name == "feedback":
            extracted = intent.get("extracted", {})
            liked = len(extracted.get("liked", []))
            disliked = len(extracted.get("disliked", []))
            detail = ""
            if liked:
                detail += f"👍 {liked} 张喜欢 "
            if disliked:
                detail += f"👎 {disliked} 张不喜欢"
            return (
                f"📝 收到你的反馈！{detail}\n\n"
                "我会记录偏好并用于优化后续生成。"
            )

        # ----- 下载 -----
        elif intent_name == "download":
            return (
                "📥 好的，正在准备下载包...\n"
                "我给你打包所有生成的高清原图。"
            )

        elif intent_name == "need_generate_first":
            return (
                "⏳ 还没有生成好的图片呢。\n\n"
                "请先上传产品图，对我说 **「生成」**，"
                "等执行智能体完成后就能下载了。"
            )

        # ----- 普通聊天 -----
        elif intent_name == "chat":
            if ctx.get("generation_result"):
                return "😊 不客气！如果需要调整哪张图告诉我就好。"
            elif ctx.get("profile_ready"):
                return "😊 还有什么需要我帮忙的吗？可以对我说 **「生成」** 来出图。"
            else:
                return "😊 还有什么我可以帮你的？上传产品图我就能帮你生成上架图了！"

        # ----- 未知 -----
        else:
            if ctx["has_images"] and ctx["profile_ready"]:
                count = len(ctx.get('scene_plan') or []) or 1
                return (
                    "🤔 我没完全理解你的意思。你可以：\n"
                    f"- 说 **「生成」** — 按当前方案生成 {count} 张上架图\n"
                    "- 说 **「调整」** — 修改场景配置\n"
                    "- 说 **「分析」** — 重新分析产品\n"
                    "- 或者直接告诉我你的想法"
                )
            elif ctx["has_images"]:
                return (
                    "🤔 我没完全理解。我已经收到了你的图片，"
                    "需要我帮你 **分析** 一下吗？"
                )
            else:
                return (
                    "🤔 不好意思，我没完全理解你的意思。\n"
                    "你可以 **上传产品图片** 开始，或者直接说 **「帮助」** 查看更多指令。"
                )

    # ============================================================
    # 3. 派发任务给执行智能体
    # ============================================================

    def dispatch(self, intent: dict) -> Optional[dict]:
        """
        根据用户意图，决定是否派发任务给执行智能体。

        返回 Task 字典（派发给 Executor），或 None（不需要执行）。
        Task 格式:
        {
            "task_id": "task_xxx",
            "type": "analyze" | "generate" | "adjust" | "check" | "download",
            "params": { ... },
            "observer_says": "观察者对执行者说的话（指令）",
            "priority": "high" | "normal",
            "supervision": "需要观察者验证的结果字段",
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
            # 派发分析任务
            task["type"] = "analyze"
            task["params"] = {
                "image_paths": self.state.get("image_paths", []),
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
                "product_hints": intent.get("extracted", {}).get("product_hints")
                or self.state.get("product_hints", {}),
            }
            task["observer_says"] = (
                "执行智能体，请对这批产品图片进行完整分析："
                "1. 调用 analyze_product.py 提取产品特征（名称、类目、材质、颜色、风格、关键特征）"
                "2. 调用 scene_matcher.py 匹配最佳 10 场景"
                "3. 返回结构化产品档案和场景计划"
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
                f"执行智能体，请按用户要求生成 {count} 张图片，不要默认扩展到 10 张；"
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
            task["observer_says"] = "执行智能体，请记录用户反馈到偏好库。"
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
            task["observer_says"] = "执行智能体，请对前3场景生成 A/B 变体。"
            task["supervision"] = ["variant_count"]
            task["priority"] = "normal"

        elif intent_name == "download":
            task["type"] = "download"
            task["params"] = {
                "session_id": self.state["session_id"],
                "output_dir": self.state.get("output_dir", ""),
            }
            task["observer_says"] = "执行智能体，请准备下载包。"

        elif intent_name == "adjust_scene":
            task["type"] = "adjust"
            task["params"] = {
                "current_plan": self.state.get("scene_plan", []),
                "user_message": intent["raw_message"],
                "extracted": intent["extracted"],
            }
            task["observer_says"] = (
                "执行智能体，用户要求调整场景配置，"
                "请根据用户的消息内容更新场景计划。"
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
            task["observer_says"] = "研究智能体，请搜索竞品和参考图，返回结构化报告。"
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
            task["observer_says"] = "研究智能体，请抓取链接页面内容和主图。"
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
            task["observer_says"] = "研究智能体，请综合搜索竞品并抓取参考图，返回结构化报告。"
            task["supervision"] = ["competitors", "reference_images", "summary"]
            task["target_agent"] = "researcher"

        return task

    def dispatch_chained_task(self) -> Optional[dict]:
        """从 pending_task_plan 取出下一步并派发（LLM 多步任务链）"""
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
        """判断这个意图是否需要派发任务给执行者"""
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
    # 4. 监督执行智能体
    # ============================================================

    def supervise(self, task_id: str, executor_report: dict) -> dict:
        """
        监督执行智能体的报告，验证结果是否合格。

        返回:
          {
            "approved": True/False,
            "issues": ["问题1", ...],
            "feedback": "对执行者说的话",
            "user_message": "给用户的反馈",
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
            err_text = friendly_error_message(executor_report.get("error", "未知错误"))
            supervision_result["issues"].append(err_text)
            supervision_result["feedback"] = f"任务 {task_id} 执行出错: {err_text}"
            supervision_result["user_message"] = (
                f"❌ 执行时遇到问题：{err_text}\n"
                "请检查配置后重试。"
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
            supervision_result["feedback"] = f"任务 {task_id} 已取消（{completed}/{total}）"
            if images:
                supervision_result["user_message"] = (
                    f"⏹ 已取消生成，已完成 **{completed}/{total}** 张。\n"
                    "下方可预览已完成的图片；如需继续可再次发送「生成」。"
                )
                self.state["generation_ready"] = bool(completed)
                self.state["generation_result"] = data
            elif report_type == "analyze":
                supervision_result["user_message"] = "⏹ 已取消分析。"
            else:
                supervision_result["user_message"] = "⏹ 已取消，尚未生成任何图片。"
            supervision_result["proactive_questions"] = []
            supervision_result["quick_replies"] = []
            return supervision_result

        if report_type == "analyze":
            profile = data.get("profile", {}) or {}
            scene_plan = data.get("scene_plan", []) or []
            warnings = []
            critical = []

            if not profile:
                critical.append("未能生成产品档案")
            elif not profile.get("product_name") and not profile.get("description"):
                critical.append("产品档案缺少名称和描述")

            if not scene_plan:
                critical.append("场景计划为空，无法推荐上架场景")

            if profile and not profile.get("product_name"):
                warnings.append("产品名称未识别（已使用文件名或默认值）")
            if profile and not profile.get("description"):
                warnings.append("缺少产品描述")
            if scene_plan and len(scene_plan) < 5:
                warnings.append(f"场景计划仅 {len(scene_plan)} 个（建议至少 5 个）")

            if not critical:
                supervision_result["approved"] = True
                supervision_result["feedback"] = (
                    f"分析结果已验证通过。产品: {profile.get('product_name', '未知')}，"
                    f"类目: {profile.get('category', 'general')}，{len(scene_plan)} 个场景已匹配。"
                )
                base_msg = self._format_analysis_reply(profile, scene_plan)
                if warnings:
                    base_msg += f"\n\n> ⚠️ 部分信息不完整：{'；'.join(warnings)}"
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
                    f"分析结果验证未通过: {'; '.join(critical)}"
                )
                detail = "；".join(critical)
                supervision_result["user_message"] = (
                    f"⚠️ 分析未完成：{detail}。\n"
                    "请确认已上传产品图片，然后再次点击 **「分析一下」** 重试。"
                )

        elif report_type == "generate":
            images = data.get("images", [])
            score = data.get("consistency_score")
            scene_count = len(images)

            # 硬失败：一张图都没生成出来（provider/API 错误已在 status == "error" 分支处理）。
            # 软提醒：图片已生成但一致性评分偏低——绝不因此丢弃已生成、用户已付费的成果。
            hard_issues = []
            soft_warnings = []

            if not images:
                hard_issues.append("没有生成任何图片")
            else:
                # 单场景（<2 张）生成时，把 1 张生活方式图与产品原图做一致性对比
                # 本身参考意义有限，天然容易低分，因此跳过评分告警，避免误报。
                if scene_count >= 2:
                    if score is None:
                        soft_warnings.append("一致性检测未返回有效评分")
                    elif score < 60:
                        soft_warnings.append(f"一致性评分偏低（{score}/100）")

            if hard_issues:
                supervision_result["approved"] = False
                supervision_result["issues"] = hard_issues
                supervision_result["feedback"] = (
                    f"生成结果验证未通过: {'; '.join(hard_issues)}"
                )
                questions = self._build_proactive_questions("post_generate_issues")
                base_msg = (
                    f"⚠️ 生成失败：{'；'.join(hard_issues)}\n"
                    "我可以帮你重新处理。"
                )
                supervision_result["user_message"] = base_msg + self._format_proactive_section(questions)
                supervision_result["proactive_questions"] = questions
                supervision_result["quick_replies"] = self._collect_quick_replies(questions)
            else:
                # 生成成功——始终交付图片；一致性偏低仅作为非阻塞提醒附在下方。
                supervision_result["approved"] = True
                supervision_result["issues"] = soft_warnings
                plat_count = data.get("platform_file_count", 0)
                score_label = score if score is not None else "N/A"
                supervision_result["feedback"] = (
                    f"生成结果已验证通过。共 {len(images)} 张图，"
                    f"一致性 {score_label}/100，多平台输出 {plat_count} 张。"
                )
                base_msg = self._format_generation_reply(images, data)
                questions = []
                if soft_warnings:
                    questions = self._build_proactive_questions("post_generate_low_score")
                    base_msg += (
                        "\n\n> ⚠️ 温馨提示：" + "；".join(soft_warnings) +
                        "。图片已全部生成并保存，可直接使用；若对效果不满意，"
                        "也可以让我 **重新生成** 或 **调整场景**。"
                    )
                # 外部 Agent 增强检测结果（非阻塞补充信息）
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
                    f"✅ 反馈已记录！"
                    f"（👍 {data.get('liked_count', 0)} · 👎 {data.get('disliked_count', 0)}）\n"
                    "下次生成会参考你的偏好。"
                )
            else:
                supervision_result["issues"].append("反馈记录失败")

        elif report_type == "adjust":
            adjusted = data.get("adjusted_plan", [])
            skipped = data.get("skipped", [])
            if adjusted:
                supervision_result["approved"] = True
                self.state["scene_plan"] = adjusted
                self.state["confirmed_scenes"] = adjusted
                skip_line = f"\n已移除: {', '.join(skipped)}" if skipped else ""
                supervision_result["user_message"] = (
                    f"✅ 场景方案已更新，共 **{len(adjusted)}** 个场景。{skip_line}\n\n"
                    "回复 **「生成」** 或 **「重新生成」** 按新方案开始出图。"
                )
            else:
                supervision_result["issues"].append("场景调整后为空")

        elif report_type == "ab_test":
            count = data.get("variant_count", 0)
            images = data.get("images", [])
            if count > 0:
                supervision_result["approved"] = True
                lines = [
                    f"🧪 A/B 测试完成！共生成 **{count}** 个变体。",
                    "",
                    "请在下方预览对比各变体，告诉我你喜欢哪张。",
                ]
                for img in images[:12]:
                    name = img.get("label") or img.get("filename", "")
                    lines.append(f"- {name}")
                supervision_result["user_message"] = "\n".join(lines)
            else:
                supervision_result["issues"].append("A/B 变体生成失败")

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
            supervision_result["feedback"] = f"任务 {task_id} 已完成。"
            supervision_result["user_message"] = "✅ 任务已完成。"

        return supervision_result

    # ============================================================
    # 5. 格式化回复
    # ============================================================

    def _format_analysis_reply(self, profile: dict, scene_plan: list) -> str:
        """格式化分析结果为用户可见的消息"""
        lines = ["## 🔍 产品分析完成\n"]
        lines.append(f"**产品:** {profile.get('product_name', '未命名')}")
        lines.append(f"**类目:** {profile.get('category_cn', profile.get('category', '通用'))}")
        lines.append(f"**风格:** {profile.get('style_cn', profile.get('style', '现代'))}")
        materials = profile.get('materials', [])
        if materials:
            lines.append(f"**材质:** {', '.join(materials)}")
        features = profile.get('key_features', [])
        if features:
            lines.append(f"**关键特征:** {', '.join(features)}")
        emotions = profile.get('emotion_keywords', [])
        if emotions:
            lines.append(f"**情绪关键词:** {' · '.join(emotions)}")

        lines.append("")
        lines.append("---")
        lines.append("## 🎯 我为推荐了以下 10 个场景\n")

        emotion_labels = [
            "纯净、专业、聚焦产品",
            "温暖、向往、代入感",
            "奢华、精致、品质感",
            "实用、动感、问题解决",
            "真实、可信、工艺感",
            "应景、仪式感、限时感",
            "氛围感、高级感、沉浸",
            "实用、完整、套装感",
            "好评、真实、社交证明",
            "认同、调性、价值观",
        ]

        for i, scene in enumerate(scene_plan[:10]):
            name = scene.get("scene_name", f"场景 {i+1}")
            emotion = scene.get("emotion", emotion_labels[i] if i < len(emotion_labels) else "")
            score = scene.get("final_score", 0)
            stars = "⭐" * max(1, int(score / 2.5)) if score else ""
            lines.append(f"**{i+1}. {name}** {stars}")
            if emotion:
                lines.append(f"   → {emotion}")

        lines.append("")
        lines.append("---")
        lines.append(
            "回复 **「生成」** 或 **「开始」**，执行智能体就会开始批量出图。\n"
            "也可以告诉我你想 **调整** 哪些场景。"
        )

        return "\n".join(lines)

    def _format_research_reply(self, data: dict) -> str:
        """格式化上网研究结果为用户可见消息"""
        lines = ["## 🌐 上网研究完成\n"]
        summary = data.get("summary", "")
        if summary:
            lines.append(f"{summary}\n")

        search_results = data.get("search_results") or []
        if search_results:
            lines.append("### 🔍 搜索结果（Top 5）\n")
            for i, r in enumerate(search_results[:5], 1):
                title = r.get("title") or "无标题"
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
            lines.append("### 🏪 抓取页面\n")
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
            lines.append(f"### 🖼 参考图（已下载 {len(ref_images)} 张）\n")
            lines.append("参考图已保存到会话，可在下方预览。")

        lines.append("---")
        lines.append("你可以继续 **搜索竞品**、粘贴 **商品链接** 抓取，或上传产品图开始生成。")
        return "\n".join(lines)

    def _format_external_consistency_section(self, data: dict) -> str:
        """格式化外部一致性增强检测结果（非阻塞补充信息）"""
        status = data.get("external_consistency_status", "")
        score = data.get("external_consistency_score")
        issues = data.get("external_consistency_issues", []) or []
        recommendations = data.get("external_consistency_recommendations", []) or []

        status_emoji = {
            "passed": "✅",
            "failed": "⚠️",
            "error": "❌",
        }.get(status, "ℹ️")

        lines = ["\n\n---\n", "## 🔍 外部增强一致性检测\n"]
        if score is not None:
            lines.append(f"**状态:** {status_emoji} {status}　**评分:** {score}/100\n")
        else:
            lines.append(f"**状态:** {status_emoji} {status}\n")

        if issues:
            lines.append("**发现的问题:**")
            for issue in issues[:5]:
                lines.append(f"- {issue}")
            if len(issues) > 5:
                lines.append(f"…（共 {len(issues)} 项，查看详情请见检测报告）")
            lines.append("")

        if recommendations:
            lines.append("**改进建议:**")
            for rec in recommendations[:3]:
                lines.append(f"- {rec}")
            if len(recommendations) > 3:
                lines.append(f"…（共 {len(recommendations)} 项）")
            lines.append("")

        if status == "passed":
            lines.append("外部 Agent 已确认产品一致性达标，可以放心上架。")
        elif status == "failed":
            lines.append("外部 Agent 发现不一致点，建议结合内部 QA 结果决定是否调整场景重试。")
        elif status == "error":
            lines.append("外部检测服务暂时不可用，已跳过该步骤，不影响本次出图。")

        return "\n".join(lines)

    def _format_generation_reply(self, images: list, data: dict) -> str:
        """格式化生成结果"""
        score = data.get("consistency_score", "N/A")
        count = len(images)
        plat_files = data.get("platform_file_count", 0)
        plat_count = data.get("platform_count", 0)
        platforms = data.get("platforms", [])

        lines = [
            f"## ✅ {count} 张上架图全部生成完成！\n",
            f"**一致性评分：** {score}/100",
        ]
        if plat_count:
            lines.append(f"**多平台输出：** {plat_files} 张（{plat_count} 个平台: {', '.join(platforms)}）\n")
        else:
            lines.append("")
        lines.extend([
            "执行智能体已完成：创作 → 后处理 → 排版 → 多平台 → 检测 ✅\n",
            "---",
            "**你可以：**",
            "- 👆 **点击图片** 查看大图",
            "- 💬 告诉我 **哪张需要调整** 或 **喜欢/不喜欢**",
            "- 📥 点击下方按钮 **一键下载**（含 platforms/ 子目录）\n",
        ])
        return "\n".join(lines)

    # ============================================================
    # 6. 公共入口
    # ============================================================

    def process_message(
        self,
        message: str,
        has_images: bool = False,
        executor_report: Optional[dict] = None,
    ) -> dict:
        """
        处理用户消息的完整入口。

        参数:
          message: 用户文本
          has_images: 是否同时上传了图片
          executor_report: 执行智能体主动上报的结果（非None时表示这是执行者的回执）

        返回:
          {
            "reply": "观察者要回复用户的内容",
            "task": None 或 {派发给执行者的任务},
            "state_update": {要更新的会话状态},
          }
        """

        # 如果收到的是执行者报告，进行监督验证
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

        # 正常处理用户消息
        intent = self.understand(message, has_images)
        decide_result = self.decide_reply(intent)
        reply = decide_result["reply"]

        # LLM 模式：展示任务规划 chip
        if intent.get("llm_mode") and intent.get("task_plan"):
            chip = format_task_plan_chip(intent["task_plan"])
            if chip:
                reply = f"{chip}\n\n{reply}"

        task = self.dispatch(intent)

        # 如果派发了任务，标记执行者忙碌
        state_update = {
            "last_intent": intent["intent"],
        }
        if task:
            state_update["executor_busy"] = True

        # 记录对话摘要
        self.state["conversation_history"].append({
            "time": time.time(),
            "user": message,
            "intent": intent["intent"],
            "has_task": task is not None,
        })
        # 保持摘要不超过20条
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
