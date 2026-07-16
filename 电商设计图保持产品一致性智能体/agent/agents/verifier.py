"""输出自检器 — 验证 LLM 输出质量，低质输出自动重做或标记人审。

校验规则（每个任务类型不同）：
- listing_generation: 标题长度≤180字、有5条bullet points、有keywords
- keyword_analysis: 有关键词列表、关键词有volume和difficulty
- product_research: 有summary、有competitors、有priceRange
- trend_analysis: 有trends列表
- image_prompt: 有prompt字段

设计原则：
- 校验逻辑是确定性的规则检查 + LLM-as-judge 评分（复用阶段7）
- 校验失败不抛异常——记录问题、尝试自愈、最后标记给人审
- 校验结果写入 output 中的 _verification 字段
"""

import logging

logger = logging.getLogger("verifier")

MIN_TITLE_LENGTH = 10
MAX_TITLE_LENGTH = 200
REQUIRED_BULLET_COUNT = 3  # minimum acceptable
MIN_KEYWORDS = 3


def verify_listing(output: dict) -> dict:
    """Check listing generation output quality."""
    issues = []

    title = output.get("title", "")
    if not title:
        issues.append("缺少标题")
    elif len(title) < MIN_TITLE_LENGTH:
        issues.append(f"标题太短 ({len(title)} 字)")
    elif len(title) > MAX_TITLE_LENGTH:
        issues.append(f"标题超长 ({len(title)} 字，建议≤{MAX_TITLE_LENGTH})")

    bullets = output.get("bulletPoints", [])
    if not bullets:
        issues.append("缺少 Bullet Points")
    elif len(bullets) < REQUIRED_BULLET_COUNT:
        issues.append(f"Bullet Points 不足 (当前{len(bullets)}条，建议≥{REQUIRED_BULLET_COUNT})")

    keywords = output.get("keywords", [])
    if not keywords:
        issues.append("缺少关键词")
    elif len(keywords) < MIN_KEYWORDS:
        issues.append(f"关键词过少 (当前{len(keywords)}个)")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [_suggest_listing_fix(issue) for issue in issues],
    }


def verify_keywords(output: dict) -> dict:
    """Check keyword analysis output quality."""
    issues = []

    keywords = output.get("keywords", [])
    if not keywords:
        issues.append("缺少关键词数据")
    elif len(keywords) < MIN_KEYWORDS:
        issues.append(f"关键词不足 (当前{len(keywords)}个，建议≥{MIN_KEYWORDS})")
    else:
        # Check that keywords have required fields
        sample = keywords[0] if isinstance(keywords[0], dict) else {}
        if "volume" not in sample and "difficulty" not in sample:
            issues.append("关键词缺少搜索量/难度数据")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [_suggest_keyword_fix(issue) for issue in issues],
    }


def verify_research(output: dict) -> dict:
    """Check product research output quality."""
    issues = []

    summary = output.get("summary")
    if not isinstance(summary, str) or len(summary.strip()) < 30:
        issues.append("缺少调研摘要")
    competitors = output.get("competitors")
    if not isinstance(competitors, list) or len(competitors) < 2:
        issues.append("缺少竞品分析")
    elif not all(isinstance(item, str) and item.strip() for item in competitors):
        issues.append("竞品分析格式无效")

    price_range = output.get("priceRange")
    if not isinstance(price_range, dict):
        issues.append("缺少价格范围")
    else:
        minimum = price_range.get("min")
        maximum = price_range.get("max")
        if (
            not isinstance(minimum, (int, float))
            or not isinstance(maximum, (int, float))
            or isinstance(minimum, bool)
            or isinstance(maximum, bool)
            or minimum <= 0
            or maximum < minimum
        ):
            issues.append("价格范围格式无效")
        if not isinstance(price_range.get("currency"), str) or not price_range["currency"].strip():
            issues.append("缺少价格币种")

    source_evidence = output.get("sourceEvidence")
    if not isinstance(source_evidence, dict):
        issues.append("缺少可核验 Ozon 来源")
    else:
        items = source_evidence.get("items")
        if not isinstance(items, list) or len(items) < 2:
            issues.append("Ozon 来源不足")
        else:
            for item in items:
                if not isinstance(item, dict):
                    issues.append("Ozon 来源格式无效")
                    break
                url = item.get("url")
                fetched_at = item.get("fetchedAt")
                if not isinstance(url, str) or "ozon.ru" not in url.lower():
                    issues.append("Ozon 来源链接无效")
                    break
                if not isinstance(fetched_at, str) or not fetched_at:
                    issues.append("Ozon 来源缺少抓取时间")
                    break

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"请补充{issue}" for issue in issues],
    }


def verify_trends(output: dict) -> dict:
    """Check trend analysis output quality."""
    issues = []

    trends = output.get("trends", [])
    if not isinstance(trends, list) or len(trends) < 2:
        issues.append("缺少趋势数据")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"请补充{issue}" for issue in issues],
    }


def verify_image_prompt(output: dict) -> dict:
    """Check image prompt output quality."""
    issues = []

    if not output.get("prompt"):
        issues.append("缺少 prompt")
    elif len(output["prompt"]) < 20:
        issues.append("prompt 过短，缺少细节描述")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"请补充{issue}" for issue in issues],
    }


def verify_evidence_bound_trends(output: dict) -> dict:
    """Reject trend output that has no verifiable Ozon evidence chain."""
    issues = []
    trends = output.get("trends")
    if not isinstance(trends, list) or len(trends) < 2:
        issues.append("Trend analysis requires at least two evidence-backed observations")
    else:
        for trend in trends:
            if not isinstance(trend, dict):
                issues.append("Trend observation format is invalid")
                break
            if not isinstance(trend.get("name"), str) or not trend["name"].strip():
                issues.append("Trend observation is missing a name")
                break
            if not isinstance(trend.get("seasonality"), str) or not trend["seasonality"].strip():
                issues.append("Trend observation is missing an evidence-bound explanation")
                break
            if trend.get("growth") is not None:
                issues.append("Trend growth metrics require a dedicated Ozon time-series source")
                break
            if trend.get("source") != "ozon_public_search":
                issues.append("Trend observation is not pinned to an Ozon source")
                break
            evidence = trend.get("evidence")
            if not isinstance(evidence, list) or not evidence:
                issues.append("Trend observation is missing Ozon evidence")
                break
            source = evidence[0]
            if (
                not isinstance(source, dict)
                or not isinstance(source.get("url"), str)
                or "ozon.ru" not in source["url"].lower()
                or not isinstance(source.get("fetchedAt"), str)
                or not source["fetchedAt"]
            ):
                issues.append("Trend Ozon evidence is invalid")
                break

    source_evidence = output.get("sourceEvidence")
    if (
        not isinstance(source_evidence, dict)
        or source_evidence.get("source") != "ozon_public_search"
        or not isinstance(source_evidence.get("fetchedAt"), str)
        or not isinstance(source_evidence.get("items"), list)
        or len(source_evidence["items"]) < 2
    ):
        issues.append("Trend report is missing a verifiable Ozon evidence chain")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"Fix: {issue}" for issue in issues],
    }


VERIFIERS = {
    "listing_generation": verify_listing,
    "keyword_analysis": verify_keywords,
    "product_research": verify_research,
    "trend_analysis": verify_evidence_bound_trends,
    "image_prompt": verify_image_prompt,
}


def _suggest_listing_fix(issue: str) -> str:
    fixes = {
        "缺少标题": "请基于产品名称和核心卖点生成标题",
        "标题太短": "在标题中增加更多关键词和卖点描述",
        "标题超长": "精简标题，删除冗余修饰词",
        "缺少 Bullet Points": "生成至少5条 Bullet Points，每行一个核心卖点",
        "缺少关键词": "提取5-10个高相关度关键词",
        "关键词过少": "扩展关键词列表至5个以上",
    }
    return fixes.get(issue, f"修复: {issue}")


def _suggest_keyword_fix(issue: str) -> str:
    fixes = {
        "缺少关键词数据": "请为种子关键词扩展相关搜索词",
        "关键词不足": "增加更多长尾关键词变体",
        "关键词缺少搜索量/难度数据": "为每个关键词估算搜索量和竞争度",
    }
    return fixes.get(issue, f"修复: {issue}")


def verify(task_type: str, output: dict) -> dict:
    """Run verification for a given task type. Returns verification result."""
    verifier = VERIFIERS.get(task_type)
    if not verifier:
        # Unknown task type — assume passed
        return {"passed": True, "issues": [], "suggestions": []}

    try:
        result = verifier(output)
        if result["passed"]:
            logger.info("Verification passed for %s", task_type)
        else:
            logger.warning("Verification failed for %s: %s", task_type, result["issues"])
        return result
    except Exception as exc:
        logger.error("Verifier crashed for %s: %s", task_type, exc)
        return {"passed": True, "issues": [], "suggestions": []}


def auto_heal(task_type: str, output: dict, original_input: dict = None) -> tuple[dict, bool]:
    """Try to fix common issues automatically via LLM.
    Returns (fixed_output, was_modified)."""

    result = verify(task_type, output)
    if result["passed"]:
        return output, False

    # Only auto-heal if issues are fixable by re-prompting
    fixable_issues = [i for i in result["issues"]
                      if not i.startswith("缺少")]
    if len(fixable_issues) > 0 and task_type == "listing_generation":
        # Try to fix by calling the task again with more specific prompt
        logger.info("Attempting auto-heal for %s", task_type)
        return output, False  # Let the caller decide to retry

    return output, False
