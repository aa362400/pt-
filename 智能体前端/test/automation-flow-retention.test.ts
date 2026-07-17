import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages-v2/AutomationFlowV2.tsx", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../src/figma-exact/AutomationFlow.tsx", import.meta.url),
  "utf8",
);

test("customer automation page removes the ordinary destructive delete workflow", () => {
  assert.doesNotMatch(pageSource, /automationApi\.delete\(/);
  assert.doesNotMatch(pageSource, /title="确认删除流程"/);
  assert.doesNotMatch(pageSource, /onDelete=\{/);
  assert.doesNotMatch(pageSource, /删除流程/);
  assert.doesNotMatch(componentSource, /onDelete/);
  assert.doesNotMatch(componentSource, /Trash2/);
  assert.doesNotMatch(componentSource, /删除流程/);
});

test("customer automation page explains and confirms evidence-preserving deactivation", () => {
  assert.match(pageSource, /停用并保留记录/);
  assert.match(pageSource, /运行与审计记录/);
  assert.match(pageSource, /流程已停用，运行与审计记录已保留/);
  assert.match(pageSource, /automationApi\.toggleEnabled\(id, active\)/);
});

test("customer automation page uses Chinese presentation and disables impossible runs with an explanation", () => {
  assert.match(pageSource, /automationFlowText/);
  assert.match(pageSource, /automationRunBlockReason/);
  assert.match(pageSource, /automationEnableBlockReason/);
  assert.match(pageSource, /automationBackendStatusLabel/);
  assert.match(componentSource, /automationTriggerLabel/);
  assert.match(componentSource, /flow\.runBlockedReason/);
  assert.match(componentSource, /暂不可运行/);
});

test("enabling a scheduled flow gives the real scheduler a next run time", () => {
  assert.match(
    pageSource,
    /automationApi\.update\(id,\s*\{\s*status: "ACTIVE",\s*nextRunAt:/,
  );
});
