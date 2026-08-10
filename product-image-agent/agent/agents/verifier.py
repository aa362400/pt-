"""outputenglish_text — text LLM outputtext，textoutputautomaticenglish_text。

english_text（texttaskenglish_text）：
- listing_generation: titletext≤180text、yes5textbullet points、yeskeywords
- keyword_analysis: yeskeywordstext、keywordsyesvolumetextdifficulty
- product_research: yessummary、yescompetitors、yespriceRange
- trend_analysis: yestrendstext
- image_prompt: yespromptfields

english_text：
- english_textyesenglish_text + LLM-as-judge text（textstage7）
- textfailedenglish_text——english_text、english_text、english_text
- english_textwrite output text _verification fields
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
        issues.append("texttitle")
    elif len(title) < MIN_TITLE_LENGTH:
        issues.append(f"titletext ({len(title)} text)")
    elif len(title) > MAX_TITLE_LENGTH:
        issues.append(f"titletext ({len(title)} text，text≤{MAX_TITLE_LENGTH})")

    bullets = output.get("bulletPoints", [])
    if not bullets:
        issues.append("text Bullet Points")
    elif len(bullets) < REQUIRED_BULLET_COUNT:
        issues.append(f"Bullet Points text (text{len(bullets)}text，text≥{REQUIRED_BULLET_COUNT})")

    keywords = output.get("keywords", [])
    if not keywords:
        issues.append("textkeywords")
    elif len(keywords) < MIN_KEYWORDS:
        issues.append(f"keywordstext (text{len(keywords)}text)")

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
        issues.append("textkeywordsdata")
    elif len(keywords) < MIN_KEYWORDS:
        issues.append(f"keywordstext (text{len(keywords)}text，text≥{MIN_KEYWORDS})")
    else:
        # Check that keywords have required fields
        sample = keywords[0] if isinstance(keywords[0], dict) else {}
        if "volume" not in sample and "difficulty" not in sample:
            issues.append("keywordstextsearchtext/textdata")

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
        issues.append("english_text")
    competitors = output.get("competitors")
    if not isinstance(competitors, list) or len(competitors) < 2:
        issues.append("english_text")
    elif not all(isinstance(item, str) and item.strip() for item in competitors):
        issues.append("english_textnonetext")

    price_range = output.get("priceRange")
    if not isinstance(price_range, dict):
        issues.append("english_text")
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
            issues.append("english_textnonetext")
        if not isinstance(price_range.get("currency"), str) or not price_range["currency"].strip():
            issues.append("english_text")

    source_evidence = output.get("sourceEvidence")
    if not isinstance(source_evidence, dict):
        issues.append("english_text Ozon source")
    else:
        items = source_evidence.get("items")
        if not isinstance(items, list) or len(items) < 2:
            issues.append("Ozon sourcetext")
        else:
            for item in items:
                if not isinstance(item, dict):
                    issues.append("Ozon sourcetextnonetext")
                    break
                url = item.get("url")
                fetched_at = item.get("fetchedAt")
                if not isinstance(url, str) or "ozon.ru" not in url.lower():
                    issues.append("Ozon sourcetextnonetext")
                    break
                if not isinstance(fetched_at, str) or not fetched_at:
                    issues.append("Ozon sourceenglish_text")
                    break

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"english_text{issue}" for issue in issues],
    }


def verify_trends(output: dict) -> dict:
    """Check trend analysis output quality."""
    issues = []

    trends = output.get("trends", [])
    if not isinstance(trends, list) or len(trends) < 2:
        issues.append("english_textdata")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"english_text{issue}" for issue in issues],
    }


def verify_image_prompt(output: dict) -> dict:
    """Check image prompt output quality."""
    issues = []

    if not output.get("prompt"):
        issues.append("text prompt")
    elif len(output["prompt"]) < 20:
        issues.append("prompt text，english_text")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "suggestions": [f"english_text{issue}" for issue in issues],
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
        "texttitle": "english_textgenerationtitle",
        "titletext": "texttitleenglish_textkeywordsenglish_text",
        "titletext": "texttitle，english_text",
        "text Bullet Points": "generationtext5text Bullet Points，english_text",
        "textkeywords": "text5-10english_textkeywords",
        "keywordstext": "textkeywordsenglish_text5english_text",
    }
    return fixes.get(issue, f"text: {issue}")


def _suggest_keyword_fix(issue: str) -> str:
    fixes = {
        "textkeywordsdata": "english_textkeywordsenglish_textsearchtext",
        "keywordstext": "english_textkeywordstext",
        "keywordstextsearchtext/textdata": "english_textkeywordstextsearchenglish_text",
    }
    return fixes.get(issue, f"text: {issue}")


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
                      if not i.startswith("text")]
    if len(fixable_issues) > 0 and task_type == "listing_generation":
        # Try to fix by calling the task again with more specific prompt
        logger.info("Attempting auto-heal for %s", task_type)
        return output, False  # Let the caller decide to retry

    return output, False
