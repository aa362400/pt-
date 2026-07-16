# Consistency Score Threshold Calibration

## Current Threshold
The default threshold is 60, configured by `AGENT_REVIEW_THRESHOLD`.

## Calibration Method
To validate the threshold:
1. Collect 50 tasks with their qualityScore and a human review verdict
2. Plot precision/recall for each threshold value 30-90
3. Pick the threshold where precision >= 90% (auto-approved tasks are truly good)
4. Update `AGENT_REVIEW_THRESHOLD` and redeploy the worker

## Running Calibration
1. Export 50 tasks with scores from the database
2. Have 2+ human reviewers independently rate each as pass/fail
3. Compare against the LLM-judge score for each threshold
4. Document the chosen threshold and the precision/recall curve

## Acceptance Evidence Required

Do not mark stage 7 complete until this document includes:

- at least 50 scored samples,
- the human pass/fail verdict for each sample,
- the precision/recall curve or table,
- the chosen `AGENT_REVIEW_THRESHOLD` and reviewer sign-off.
