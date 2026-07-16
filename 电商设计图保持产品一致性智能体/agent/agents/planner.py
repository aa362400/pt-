"""任务规划器 — 把一句话目标拆成 DAG 步骤链并逐一执行。

输入格式（来自平台 taskType=plan_and_execute）：
{
  "goal": "给这个新品做全套上架准备",
  "context": {
    "productName": "智能温控水杯",
    "marketplace": "amazon.com"
  }
}

规划器用 LLM 拆解目标 → 步骤列表 → 逐步执行 → 汇总结果。
"""

from __future__ import annotations

import json
import logging
import os
import re

logger = logging.getLogger("planner")

DEFAULT_PLANNER_MODEL = "gpt-4o"
MAX_PLAN_STEPS = 6

# System prompt for the planner LLM
PLANNER_SYSTEM_PROMPT = """You are an e-commerce operations planner. Given a seller's goal,
break it down into a short sequence of executable steps. Each step calls one tool.

Available tools:
- product_research: Research a product. Input: productName, marketplace
- keyword_analysis: Analyze SEO keywords. Input: seedKeywords[], marketplace
- listing_generation: Generate listing copy. Input: productName, platform
- trend_analysis: Analyze market trends. Input: category, marketplace
- image_prompt: Generate image prompt. Input: productName, style
- generate_images: Prepare listing image generation. Input: productName, imageUrl/imageBase64, sceneCount, platforms
- profit_calculation: Calculate unit profit. Input: price, cost, freight, platform

Rules:
1. Each step's output feeds into later steps as context
2. Max 6 steps per plan
3. If a step fails, you can suggest an alternative approach
4. Use dependsOn for dependency edges when a step requires another step
5. For listing preparation, prefer this five-step chain: product_research -> keyword_analysis -> listing_generation -> generate_images -> profit_calculation
6. Output ONLY valid JSON array

Output format:
[
  {
    "id": "stable_step_id",
    "step": 1,
    "tool": "tool_name",
    "dependsOn": ["previous_step_id"],
    "input": {"param1": "value1", ...},
    "description": "简短说明这一步做什么"
  }
]

Example: For goal "准备上架一款瑜伽垫到亚马逊", output:
[
  {"step": 1, "tool": "product_research", "input": {"productName": "瑜伽垫", "marketplace": "amazon.com"}, "description": "调研瑜伽垫品类"},
  {"step": 2, "tool": "keyword_analysis", "input": {"seedKeywords": ["yoga mat", "exercise mat", "fitness mat"], "marketplace": "amazon.com"}, "description": "挖掘关键词"},
  {"step": 3, "tool": "listing_generation", "input": {"productName": "瑜伽垫", "platform": "amazon"}, "description": "生成Listing文案"}
]
"""


def _camel_to_snake(name: str) -> str:
    """Convert camelCase or PascalCase to snake_case."""
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def _convert_keys(d: dict) -> dict:
    """Recursively convert all dict keys from camelCase to snake_case."""
    if not isinstance(d, dict):
        return d
    return {_camel_to_snake(k): _convert_keys(v) if isinstance(v, dict) else v
            for k, v in d.items()}


def _step_id(step_data: dict, index: int) -> str:
    raw = step_data.get("id") or step_data.get("stepId") or step_data.get("step")
    return str(raw or index + 1)


def _depends_on(step_data: dict) -> list[str]:
    deps = (
        step_data.get("dependsOn")
        or step_data.get("depends_on")
        or step_data.get("dependencies")
        or []
    )
    if isinstance(deps, str):
        return [deps]
    if isinstance(deps, list):
        return [str(dep) for dep in deps]
    return []


def _update_context_from_output(step_context: dict, output: dict) -> None:
    step_context.update(output)
    if "summary" in output:
        step_context["research_summary"] = output["summary"]
    if "keywords" in output and isinstance(output["keywords"], list):
        kw_names = [
            k.get("keyword", "") if isinstance(k, dict) else str(k)
            for k in output["keywords"][:5]
        ]
        step_context["seedKeywords"] = kw_names
    if "title" in output:
        step_context["listing_title"] = output["title"]
    if "price" in output:
        step_context["price"] = output["price"]
    if "trends" in output:
        step_context["trend_summary"] = str(output["trends"][:3])


def _validate_plan_steps(steps: list[dict]) -> None:
    if not isinstance(steps, list):
        raise ValueError("Planner steps must be a list")
    if not steps:
        raise ValueError("Planner returned empty step list")
    if len(steps) > MAX_PLAN_STEPS:
        raise ValueError(f"Planner may return at most {MAX_PLAN_STEPS} steps")

    seen: set[str] = set()
    for index, step_data in enumerate(steps):
        if not isinstance(step_data, dict):
            raise ValueError(f"Plan step {index + 1} must be an object")
        sid = _step_id(step_data, index)
        if sid in seen:
            raise ValueError(f"Duplicate plan step id: {sid}")
        tool_name = step_data.get("tool")
        if not isinstance(tool_name, str) or not tool_name.strip():
            raise ValueError(f"Plan step {sid} must declare a tool")
        raw_input = step_data.get("input", {})
        if not isinstance(raw_input, dict):
            raise ValueError(f"Plan step {sid} input must be an object")
        dependencies = _depends_on(step_data)
        if sid in dependencies:
            raise ValueError(f"Plan step {sid} cannot depend on itself")
        unknown_dependencies = [dep for dep in dependencies if dep not in seen]
        if unknown_dependencies:
            raise ValueError(
                f"Plan step {sid} has forward or unknown dependencies: "
                + ", ".join(unknown_dependencies)
            )
        seen.add(sid)


def _tool_audit_context(context: dict | None) -> dict[str, str]:
    normalized = _convert_keys(context or {})

    def first(*keys: str) -> str:
        for key in keys:
            value = normalized.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()[:160]
        return ""

    values = {
        "traceId": first("trace_id", "request_id"),
        "runId": first("run_id", "agent_run_id", "task_id", "job_id"),
        "tenantId": first("tenant_id", "organization_id", "org_id"),
        "workspaceId": first("workspace_id"),
    }
    return {key: value for key, value in values.items() if value}


def _allowed_context_input(tool: dict, explicit_input: dict, context: dict) -> dict:
    tool_input = _convert_keys(explicit_input)
    normalized_context = _convert_keys(context)
    schema_keys = {
        _camel_to_snake(str(key)) for key in tool.get("input_schema", {})
    }
    context_keys = {
        _camel_to_snake(str(key)) for key in tool.get("context_keys", [])
    }
    trusted_context_keys = {
        _camel_to_snake(str(key))
        for key in tool.get("trusted_context_keys", [])
    }
    for key in schema_keys | context_keys:
        if key not in tool_input and key in normalized_context:
            tool_input[key] = normalized_context[key]
    for key in trusted_context_keys:
        if key in normalized_context:
            tool_input[key] = normalized_context[key]
        else:
            tool_input.pop(key, None)
    return tool_input


def _public_final_context(context: dict) -> dict:
    blocked = re.compile(
        r"(^|_)(api_?key|authorization|password|secret|token|image_?base64|base64)($|_)",
        re.IGNORECASE,
    )
    return {
        key: value
        for key, value in context.items()
        if not blocked.search(_camel_to_snake(str(key)))
    }


def _call_llm(system: str, user_msg: str, model: str | None = None,
              temperature: float = 0.3, max_tokens: int = 4096) -> str:
    """Call OpenAI-compatible LLM and return text response."""
    import requests

    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise ValueError("OPENAI_API_KEY not configured")

    base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")

    resolved_model = (
        model
        or os.getenv("PLANNER_LLM_MODEL")
        or os.getenv("LLM_MODEL")
        or DEFAULT_PLANNER_MODEL
    )

    resp = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": resolved_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        },
        timeout=30,
    )
    if not resp.ok:
        provider_detail = resp.text[:1000].replace(key, "[redacted]")
        raise RuntimeError(
            f"Planner LLM request failed: status={resp.status_code}, "
            f"model={resolved_model}, detail={provider_detail}"
        )
    return resp.json()["choices"][0]["message"]["content"]


def fetch_experience_hints(context: dict | None = None) -> list[dict]:
    """Load org-scoped review-learning cards for the next plan."""
    context = context or {}
    org_id = context.get("orgId") or context.get("org_id")
    api_key = os.getenv("AGENT_API_KEY", "")
    if not org_id or not api_key:
        return []
    try:
        import requests
        params = {"organizationId": org_id, "limit": 5}
        task_type = context.get("taskType") or context.get("task_type")
        if task_type:
            params["taskType"] = task_type
        base = os.getenv("PLATFORM_API_BASE", "http://backend:3000/api/v1")
        resp = requests.get(
            f"{base}/agent-memory/experiences",
            headers={"X-Api-Key": api_key},
            params=params,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            cards = data if isinstance(data, list) else data.get("items", data)
            return [
                {
                    "category": card.get("category"),
                    "taskType": card.get("taskType"),
                    "lesson": card.get("lesson"),
                }
                for card in cards[:5]
                if isinstance(card, dict) and card.get("lesson")
            ]
    except Exception as exc:
        logger.warning("Failed to load experience hints: %s", exc)
    return []


def decompose_goal(goal: str, context: dict | None = None) -> list[dict]:
    """分解目标为步骤列表。"""
    user_payload: dict = {"goal": goal}
    if context:
        user_payload["context"] = context
    experience_hints = fetch_experience_hints(context)
    if experience_hints:
        user_payload["experience_hints"] = experience_hints

    text = _call_llm(
        PLANNER_SYSTEM_PROMPT,
        json.dumps(user_payload, ensure_ascii=False),
        temperature=0.2,
    )

    # Parse: wrap in array if LLM returns an object with "steps" key
    data = json.loads(text)
    if isinstance(data, dict):
        steps = data.get("steps", data.get("plan", []))
    elif isinstance(data, list):
        steps = data
    else:
        raise ValueError(f"Unexpected planner output type: {type(data)}")

    _validate_plan_steps(steps)

    logger.info("Decomposed goal into %d steps: %s", len(steps),
                [s.get("tool", "?") for s in steps])
    return steps


def execute_plan(steps: list[dict], global_context: dict | None = None) -> dict:
    """按顺序执行步骤链，每一步的输出传入下一步的 context。"""
    from agents import tools_registry

    _validate_plan_steps(steps)
    available = {tool["name"]: tool for tool in tools_registry.list_tools()}
    non_retryable_error_types = tuple(
        error_type
        for error_type in (
            getattr(tools_registry, "ToolInputValidationError", None),
            getattr(tools_registry, "ToolAuditError", None),
        )
        if isinstance(error_type, type)
    )
    results = []
    results_by_id: dict[str, dict] = {}
    step_context = dict(global_context or {})
    audit_context = _tool_audit_context(global_context)

    for index, step_data in enumerate(steps):
        sid = _step_id(step_data, index)
        tool_name = step_data.get("tool", "")
        step_input = step_data.get("input", {})
        description = step_data.get("description", tool_name)
        dependencies = _depends_on(step_data)

        unmet = [
            dep for dep in dependencies
            if results_by_id.get(dep, {}).get("status") != "completed"
        ]
        if unmet:
            result = {
                "id": sid,
                "step": step_data.get("step", index + 1),
                "tool": tool_name,
                "description": description,
                "status": "skipped",
                "error": f"Dependencies not completed: {', '.join(unmet)}",
                "dependsOn": dependencies,
            }
            results.append(result)
            results_by_id[sid] = result
            continue

        tool = available.get(tool_name)
        if not tool:
            logger.warning("Tool %s not available, skipping step", tool_name)
            result = {"id": sid, "step": step_data.get("step", index + 1),
                      "tool": tool_name, "status": "failed",
                      "error": f"Tool {tool_name} not available",
                      "attempts": 0, "retried": False}
            results.append(result)
            results_by_id[sid] = result
            continue

        # Only declared schema/context keys may cross from the global plan
        # context into a tool. Explicit LLM input is validated by the registry.
        tool_kwargs = _allowed_context_input(tool, step_input, step_context)

        logger.info("Executing step %s: %s (%s)", step_data.get("step"),
                    description, tool_name)

        retry_safe = bool(tool.get("retry_safe", True))
        max_attempts = max(1, min(int(tool.get("max_attempts", 2)), 2))
        if tool.get("side_effect") or not retry_safe:
            max_attempts = 1

        output = None
        error: Exception | None = None
        attempts = 0
        for attempt in range(1, max_attempts + 1):
            attempts = attempt
            try:
                output = tools_registry.call_tool(
                    tool_name,
                    _audit_context=audit_context,
                    **tool_kwargs,
                )
                error = None
                break
            except Exception as exc:
                error = exc
                logger.error(
                    "Step %s attempt %d/%d failed: %s",
                    tool_name,
                    attempt,
                    max_attempts,
                    exc,
                )
                if non_retryable_error_types and isinstance(
                    exc, non_retryable_error_types
                ):
                    break
                if attempt < max_attempts:
                    logger.info("Retrying step %s...", tool_name)

        if error is None:
            result = {
                "id": sid,
                "step": step_data.get("step", index + 1),
                "tool": tool_name,
                "description": description,
                "status": "completed",
                "output": output,
                "dependsOn": dependencies,
                "attempts": attempts,
                "retried": attempts > 1,
            }
            results.append(result)
            results_by_id[sid] = result
            if isinstance(output, dict):
                _update_context_from_output(step_context, output)
        else:
            error_text = str(error)
            if attempts > 1:
                error_text = f"Retry failed: {error_text}"
            result = {
                "id": sid,
                "step": step_data.get("step", index + 1),
                "tool": tool_name,
                "description": description,
                "status": "failed",
                "error": error_text,
                "dependsOn": dependencies,
                "attempts": attempts,
                "retried": attempts > 1,
            }
            results.append(result)
            results_by_id[sid] = result

    completed_steps = sum(1 for r in results if r.get("status") == "completed")
    failed_steps = sum(1 for r in results if r.get("status") == "failed")
    skipped_steps = sum(1 for r in results if r.get("status") == "skipped")
    status = "completed"
    if failed_steps:
        status = "partial" if completed_steps else "failed"
    elif skipped_steps:
        status = "partial"

    return {
        "status": status,
        "total_steps": len(steps),
        "completed_steps": completed_steps,
        "failed_steps": failed_steps,
        "skipped_steps": skipped_steps,
        "results": results,
        "final_context": _public_final_context(step_context),
    }


def run_plan_and_execute(goal: str, context: dict | None = None) -> dict:
    """入口：分解 → 执行 → 返回结果。"""
    steps = decompose_goal(goal, context)
    result = execute_plan(steps, context)
    return result
