import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileResearchRunSelection,
  researchRunRefreshInterval,
  shouldApplyRunDataResponse,
} from "../src/utils/daily-product-research-run-selection.ts";

const runs = [{ id: "run-new" }, { id: "run-old" }];

test("automatic selection follows the newest run", () => {
  assert.deepEqual(
    reconcileResearchRunSelection(runs, "run-old", "AUTO"),
    { runId: "run-new", mode: "AUTO" },
  );
});

test("manual selection preserves a historical run while it remains listed", () => {
  assert.deepEqual(
    reconcileResearchRunSelection(runs, "run-old", "MANUAL"),
    { runId: "run-old", mode: "MANUAL" },
  );
});

test("a missing manual selection falls back to the newest run", () => {
  assert.deepEqual(
    reconcileResearchRunSelection(runs, "run-missing", "MANUAL"),
    { runId: "run-new", mode: "AUTO" },
  );
});

test("an empty run list clears the selection and resets automatic mode", () => {
  assert.deepEqual(
    reconcileResearchRunSelection([], "run-old", "MANUAL"),
    { runId: null, mode: "AUTO" },
  );
});

test("active runs refresh quickly and terminal or empty selections still refresh slowly", () => {
  assert.equal(researchRunRefreshInterval("RUNNING"), 5_000);
  assert.equal(researchRunRefreshInterval("PENDING"), 5_000);
  assert.equal(researchRunRefreshInterval("COMPLETED"), 30_000);
  assert.equal(researchRunRefreshInterval(null), 30_000);
});

test("only the latest response for the current selection may update detail", () => {
  const current = {
    requestId: 4,
    latestRequestId: 4,
    runId: "run-new",
    selectedRunId: "run-new",
  };

  assert.equal(shouldApplyRunDataResponse(current), true);
  assert.equal(
    shouldApplyRunDataResponse({ ...current, requestId: 3 }),
    false,
  );
  assert.equal(
    shouldApplyRunDataResponse({ ...current, selectedRunId: "run-old" }),
    false,
  );
});
