import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeApprovalExecution,
  stepUpAndRetryApprovalOnce,
} from '../src/api/approval-execution.ts';

test('describes queued Ozon publication as pending, never executed', () => {
  assert.deepEqual(
    describeApprovalExecution({
      status: 'approved_pending_external_adapter',
      result: { externalStoreMutation: 'publish_queued_after_separate_confirmation' },
      actionProposal: {
        id: 'proposal-1',
        payloadHash: 'a'.repeat(64),
        approvalDecisionId: 'decision-1',
        status: 'APPROVED',
      },
    }),
    {
      tone: 'success',
      message: 'Approval recorded. Waiting for the Ozon external publishing result.',
    },
  );
});

test('reports executed only when the authoritative proposal status is EXECUTED', () => {
  assert.deepEqual(
    describeApprovalExecution({
      status: 'executed',
      result: { externalExecution: { status: 'verified' } },
      actionProposal: {
        id: 'proposal-1',
        payloadHash: 'a'.repeat(64),
        approvalDecisionId: 'decision-1',
        status: 'EXECUTED',
      },
    }),
    {
      tone: 'success',
      message: 'External operation confirmed as completed.',
    },
  );
});

test('performs exactly one approval retry after a successful MFA step-up', async () => {
  let stepUpCalls = 0;
  let retryCalls = 0;

  await assert.rejects(
    stepUpAndRetryApprovalOnce({
      stepUp: async () => {
        stepUpCalls += 1;
      },
      retryApproval: async () => {
        retryCalls += 1;
        throw new Error('still blocked');
      },
    }),
    /still blocked/,
  );

  assert.equal(stepUpCalls, 1);
  assert.equal(retryCalls, 1);
});
