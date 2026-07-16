import copy

from evals.judge_calibration import (
    REQUIRED_CATEGORIES,
    build_live_judge_prompt,
    default_dataset_path,
    judge_request_limits,
    load_dataset,
    run_calibration,
    run_live_calibration,
)


def test_gold_dataset_covers_all_required_business_families():
    dataset = load_dataset(default_dataset_path())

    categories = {case["category"] for case in dataset["cases"]}

    assert categories == REQUIRED_CATEGORIES
    assert all(
        sum(case["category"] == category for case in dataset["cases"]) >= 2
        for category in REQUIRED_CATEGORIES
    )


def test_provisional_policy_gold_can_pass_regression_but_not_enterprise_claim():
    report = run_calibration(load_dataset(default_dataset_path()))

    assert report["status"] == "passed"
    assert report["failedCases"] == 0
    assert report["categoryCoverage"] == sorted(REQUIRED_CATEGORIES)
    assert report["humanApproval"]["status"] == "provisional"
    assert report["enterpriseEligible"] is False


def test_any_wrong_expected_decision_fails_the_calibration():
    dataset = copy.deepcopy(load_dataset(default_dataset_path()))
    dataset["cases"][0]["expectedDecision"] = "__wrong__"

    report = run_calibration(dataset)

    assert report["status"] == "failed"
    assert report["failedCases"] == 1
    assert report["failures"][0]["caseId"] == dataset["cases"][0]["id"]


def test_live_judge_is_measured_against_gold_instead_of_becoming_the_truth():
    dataset = load_dataset(default_dataset_path())

    result = run_live_calibration(
        dataset,
        judge=lambda case: {
            "decision": case["expectedDecision"],
            "model": "judge-test-model",
        },
    )

    assert result["status"] == "passed"
    assert result["passedCases"] == len(dataset["cases"])
    assert result["failedCases"] == 0


def test_live_judge_calibration_fails_on_a_single_disagreement():
    dataset = load_dataset(default_dataset_path())
    first_id = dataset["cases"][0]["id"]

    result = run_live_calibration(
        dataset,
        judge=lambda case: {
            "decision": "BLOCK" if case["id"] == first_id else case["expectedDecision"],
            "model": "judge-test-model",
        },
    )

    assert result["status"] == "failed"
    assert result["failedCases"] == 1
    assert result["failures"][0]["caseId"] == first_id
    assert result["failures"][0]["rationale"] == ""


def test_live_judge_prompt_includes_exact_category_policy_without_gold_label():
    dataset = load_dataset(default_dataset_path())

    for case in dataset["cases"]:
        prompt = build_live_judge_prompt(case)

        assert case["category"] in prompt
        assert "policy" in prompt
        assert "expectedDecision" not in prompt


def test_live_judge_prompt_encodes_hard_evidence_and_financial_gates():
    dataset = load_dataset(default_dataset_path())
    prompts = {
        case["category"]: build_live_judge_prompt(case)
        for case in dataset["cases"]
    }

    assert "Missing evidence always means BLOCK" in prompts["ozon_russian_listing"]
    assert "Gross profit equals" in prompts["temu_pricing"]
    assert "Disney is a trademark hit" in prompts["ip_risk"]
    assert "every per-image score is at least 85" in prompts["image_consistency"]


def test_reasoning_judge_receives_enough_output_budget():
    assert judge_request_limits("deepseek-reasoner") == (1024, 90)
    assert judge_request_limits("deepseek-chat") == (256, 30)
