from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from web.services.biz_tools import amazon_title_optimizer, temu_pricing_engine
from web.services.llm_runtime import configured_key_candidates, configured_model_candidates
from web.services.risk_check import check_listing
from common.utils import parse_json_response


REQUIRED_CATEGORIES = {
    "etsy_title",
    "amazon_title",
    "temu_pricing",
    "ozon_russian_listing",
    "image_consistency",
    "ip_risk",
}

CATEGORY_POLICIES = {
    "etsy_title": (
        "Allowed decisions are PASS or BLOCK. Trim the title first. PASS only when the "
        "title contains 1 to 140 characters inclusive and contains no newline. Otherwise BLOCK."
    ),
    "amazon_title": (
        "Allowed decisions are PASS or BLOCK. productName must be non-empty after trimming. "
        "Construct the title from productName, attributes, and keywords, remove duplicates, and "
        "apply maxChars (default 75). PASS only when a non-empty optimized title can be produced "
        "within maxChars. Otherwise BLOCK."
    ),
    "temu_pricing": (
        "Allowed decisions are PASS, CAUTION, or REJECT. For mode=evaluate, calculate platformFee "
        "as approvedPrice * platformFeeRate and withdrawalFee as approvedPrice * "
        "withdrawalFeeRate. Gross profit equals approvedPrice - blankCost - logisticsFee - "
        "platformFee - withdrawalFee. REJECT when gross profit is zero or negative. If gross "
        "profit is positive, PASS unless an explicitly supplied target margin or target profit is "
        "missed, in which case CAUTION. Never assume omitted revenue or subsidies."
    ),
    "ozon_russian_listing": (
        "Allowed decisions are PASS or BLOCK. PASS only when both title and description are "
        "non-empty, both contain Cyrillic characters, and evidenceCount is greater than zero. "
        "Missing evidence always means BLOCK even if the Russian text is fluent."
    ),
    "image_consistency": (
        "Allowed decisions are PASS, REVIEW, or BLOCK. If available is not true, return REVIEW. "
        "When available is true, PASS only when avgIdentity is at least 90, perImageScores is "
        "non-empty, and every per-image score is at least 85. Otherwise BLOCK."
    ),
    "ip_risk": (
        "Allowed decisions are PASS, REVIEW, or BLOCK. Any trademark or protected brand hit in "
        "title, description, or tags means BLOCK; Disney is a trademark hit. Sensitive but "
        "non-trademark wording means REVIEW. A local rule screen with no hits is not proof of "
        "safety: missing, invalid, unauthorized, or rejected external clearance evidence means "
        "BLOCK. PASS requires an authorized auditable clearance attestation and no local risks."
    ),
}


def default_dataset_path() -> Path:
    return Path(__file__).with_name("judge-golden-v1.json")


def default_output_path() -> Path:
    workspace_root = Path(__file__).resolve().parents[3]
    return workspace_root / ".agent-runtime" / "judge-calibration.json"


def load_dataset(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict) or not isinstance(value.get("cases"), list):
        raise ValueError("Judge calibration dataset must contain a cases array")
    return value


def _contains_cyrillic(value: str) -> bool:
    return any("\u0400" <= character <= "\u04ff" for character in value)


def _evaluate(case: dict[str, Any]) -> str:
    category = case["category"]
    data = case.get("input") or {}
    if category == "etsy_title":
        title = str(data.get("title") or "").strip()
        return "PASS" if 1 <= len(title) <= 140 and "\n" not in title else "BLOCK"
    if category == "amazon_title":
        try:
            result = amazon_title_optimizer(data)
        except ValueError:
            return "BLOCK"
        return "PASS" if result["withinLimit"] and result["optimizedTitle"] else "BLOCK"
    if category == "temu_pricing":
        return str(temu_pricing_engine(data)["decision"]["status"])
    if category == "ozon_russian_listing":
        title = str(data.get("title") or "").strip()
        description = str(data.get("description") or "").strip()
        evidence_count = int(data.get("evidenceCount") or 0)
        return (
            "PASS"
            if _contains_cyrillic(title)
            and _contains_cyrillic(description)
            and evidence_count > 0
            else "BLOCK"
        )
    if category == "image_consistency":
        if data.get("available") is not True:
            return "REVIEW"
        average = float(data.get("avgIdentity") or 0)
        scores = [float(value) for value in data.get("perImageScores") or []]
        return "PASS" if average >= 90 and scores and min(scores) >= 85 else "BLOCK"
    if category == "ip_risk":
        result = check_listing(
            title=str(data.get("title") or ""),
            description=str(data.get("description") or ""),
            tags=data.get("tags") or [],
            use_llm=False,
            clearance_evidence=data.get("clearanceEvidence"),
        )
        if result["decision"] == "BLOCK":
            return "BLOCK"
        if result["decision"] == "REVIEW":
            return "REVIEW"
        return "PASS"
    raise ValueError(f"Unsupported Judge calibration category: {category}")


def _canonical_hash(dataset: dict[str, Any]) -> str:
    encoded = json.dumps(
        dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_live_judge_prompt(case: dict[str, Any]) -> str:
    category = str(case.get("category") or "")
    policy = CATEGORY_POLICIES.get(category)
    if policy is None:
        raise ValueError(f"Unsupported Judge calibration category: {category}")
    payload = {
        "category": category,
        "policy": policy,
        "input": case.get("input") or {},
    }
    return (
        "You are a deterministic commerce quality gate. Apply only the supplied category policy. "
        "Do not replace BLOCK with REVIEW or REJECT, and do not replace REJECT with BLOCK. "
        "Never invent missing evidence, prices, revenue, or attributes. Return one JSON object "
        "with exactly two fields: decision and rationale. The decision must be one of PASS, "
        "REVIEW, BLOCK, CAUTION, REJECT. Keep rationale under 40 words. Before returning, verify "
        "that decision exactly matches the conclusion stated in rationale; for example, a "
        "rationale concluding 'so PASS' must use decision PASS, never REJECT.\n"
        + json.dumps(payload, ensure_ascii=False, sort_keys=True)
    )


def judge_request_limits(model: str) -> tuple[int, int]:
    if "reasoner" in model.lower():
        return 1024, 90
    return 256, 30


def live_judge_decision(case: dict[str, Any]) -> dict[str, str]:
    import requests

    base = os.getenv("JUDGE_API_BASE", os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")).rstrip("/")
    configured_judge_model = os.getenv("JUDGE_MODEL", "").strip()
    models = [configured_judge_model] if configured_judge_model else []
    models.extend(model for model in configured_model_candidates() if model not in models)
    prompt = build_live_judge_prompt(case)
    last_error = "no_attempt"
    for model in models:
        max_tokens, timeout_seconds = judge_request_limits(model)
        for key_role, key in configured_key_candidates():
            try:
                response = requests.post(
                    f"{base}/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0,
                        "max_tokens": max_tokens,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=timeout_seconds,
                )
                if not response.ok:
                    try:
                        body = response.json()
                    except ValueError:
                        body = {}
                    error = body.get("error") if isinstance(body, dict) else {}
                    code = error.get("code") if isinstance(error, dict) else None
                    last_error = f"{key_role}:{model}:http_{response.status_code}:{code or 'unknown'}"
                    continue
                body = response.json()
                content = (body.get("choices") or [{}])[0].get("message", {}).get("content", "")
                parsed = parse_json_response(content)
                decision = str(parsed.get("decision") or "").strip().upper() if isinstance(parsed, dict) else ""
                if decision in {"PASS", "REVIEW", "BLOCK", "CAUTION", "REJECT"}:
                    rationale = str(parsed.get("rationale") or "").strip()
                    return {
                        "decision": decision,
                        "model": model,
                        "rationale": rationale[:500],
                    }
                last_error = f"{key_role}:{model}:invalid_decision"
            except requests.RequestException as exc:
                last_error = f"{key_role}:{model}:{type(exc).__name__}"
    raise RuntimeError(f"Live Judge provider unavailable ({last_error})")


def run_live_calibration(dataset: dict[str, Any], *, judge=live_judge_decision) -> dict[str, Any]:
    failures = []
    models = set()
    cases = dataset["cases"]
    try:
        for case in cases:
            result = judge(case)
            actual = str(result.get("decision") or "")
            model = str(result.get("model") or "")
            rationale = str(result.get("rationale") or "")
            if model:
                models.add(model)
            expected = str(case.get("expectedDecision") or "")
            if actual != expected:
                failures.append(
                    {
                        "caseId": str(case.get("id") or ""),
                        "category": str(case.get("category") or ""),
                        "expectedDecision": expected,
                        "actualDecision": actual,
                        "rationale": rationale,
                    }
                )
    except Exception as error:
        return {
            "status": "unavailable",
            "totalCases": len(cases),
            "passedCases": 0,
            "failedCases": 0,
            "models": sorted(models),
            "failures": [],
            "error": str(error),
        }
    return {
        "status": "passed" if not failures else "failed",
        "totalCases": len(cases),
        "passedCases": len(cases) - len(failures),
        "failedCases": len(failures),
        "models": sorted(models),
        "failures": failures,
    }


def run_calibration(
    dataset: dict[str, Any], *, dataset_hash: str | None = None
) -> dict[str, Any]:
    cases = dataset["cases"]
    categories = {str(case.get("category") or "") for case in cases}
    missing_categories = sorted(REQUIRED_CATEGORIES - categories)
    failures = []
    category_counts = {category: 0 for category in sorted(REQUIRED_CATEGORIES)}
    for case in cases:
        category = str(case.get("category") or "")
        if category in category_counts:
            category_counts[category] += 1
        actual = _evaluate(case)
        expected = str(case.get("expectedDecision") or "")
        if actual != expected:
            failures.append(
                {
                    "caseId": str(case.get("id") or ""),
                    "category": category,
                    "expectedDecision": expected,
                    "actualDecision": actual,
                }
            )
    insufficient_categories = sorted(
        category for category, count in category_counts.items() if count < 2
    )
    regression_passed = not failures and not missing_categories and not insufficient_categories
    approval = dataset.get("humanApproval") or {"status": "missing"}
    human_approved = approval.get("status") == "approved"
    return {
        "status": "passed" if regression_passed else "failed",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "datasetVersion": str(dataset.get("datasetVersion") or ""),
        "datasetHash": dataset_hash or _canonical_hash(dataset),
        "hashMode": "sha256",
        "labelPolicy": str(dataset.get("labelPolicy") or ""),
        "totalCases": len(cases),
        "passedCases": len(cases) - len(failures),
        "failedCases": len(failures),
        "categoryCoverage": sorted(categories & REQUIRED_CATEGORIES),
        "categoryCounts": category_counts,
        "missingCategories": missing_categories,
        "insufficientCategories": insufficient_categories,
        "failures": failures,
        "humanApproval": approval,
        "enterpriseEligible": regression_passed and human_approved,
        "liveJudge": {"status": "not_run"},
    }


def main() -> int:
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=Path.cwd() / ".env")
    parser = argparse.ArgumentParser(description="Run the six-family Judge regression")
    parser.add_argument("--dataset", type=Path, default=default_dataset_path())
    parser.add_argument("--output", type=Path, default=default_output_path())
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    report = run_calibration(
        load_dataset(args.dataset),
        dataset_hash=hashlib.sha256(raw).hexdigest(),
    )
    if args.live:
        report["liveJudge"] = run_live_calibration(load_dataset(args.dataset))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(f"{args.output.suffix}.{Path.cwd().name}.tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    passed = report["status"] == "passed"
    if args.live:
        passed = passed and report["liveJudge"]["status"] == "passed"
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
