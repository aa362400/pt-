import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewAgentRetryRequest } from '../src/utils/review-agent-retry.ts';

test('failed Agent review produces a stable idempotent retry request', () => {
  const task = {
    id: 'review-1',
    entityType: 'AGENT_RUN',
    agentRun: { id: 'run-1', lifecycleStatus: 'FAILED' },
  };

  assert.deepEqual(reviewAgentRetryRequest(task), {
    runId: 'run-1',
    requestId: 'approval-review-1-run-1',
  });
  assert.deepEqual(reviewAgentRetryRequest(task), reviewAgentRetryRequest(task));
});

test('completed or unrelated reviews do not enqueue an Agent retry', () => {
  assert.equal(
    reviewAgentRetryRequest({
      id: 'review-2',
      entityType: 'AGENT_RUN',
      agentRun: { id: 'run-2', lifecycleStatus: 'COMPLETED' },
    }),
    null,
  );
  assert.equal(
    reviewAgentRetryRequest({ id: 'review-3', entityType: 'PRODUCT_RESEARCH' }),
    null,
  );
});
