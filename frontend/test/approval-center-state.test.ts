import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReviewTask } from '../src/api/review.ts';
import {
  approvalCenterReducer,
  createInitialApprovalCenterState,
  selectReviewTask,
} from '../src/state/approval-center-state.ts';

function reviewTask(id: string, status: ReviewTask['status'] = 'PENDING'): ReviewTask {
  return {
    id,
    organizationId: 'org-1',
    entityType: 'AGENT_RUN',
    entityId: `run-${id}`,
    status,
    score: null,
    threshold: 60,
    autoApproved: false,
    autoRegenerations: 0,
    createdAt: '2026-07-15T00:00:00.000Z',
  };
}

test('ignores an older detail response after the customer selects another task', () => {
  let state = createInitialApprovalCenterState();
  state = approvalCenterReducer(state, {
    type: 'detail-requested',
    requestId: 1,
    selection: { kind: 'review', id: 'first' },
  });
  state = approvalCenterReducer(state, {
    type: 'detail-requested',
    requestId: 2,
    selection: { kind: 'review', id: 'second' },
  });
  state = approvalCenterReducer(state, {
    type: 'detail-succeeded',
    requestId: 1,
    selection: { kind: 'review', id: 'first' },
    detail: reviewTask('first'),
  });

  assert.equal(state.view.selection?.id, 'second');
  assert.equal(selectReviewTask(state), null);
  assert.equal(state.server.detailLoading, true);
});

test('a pending operation never changes authoritative approval status', () => {
  const task = reviewTask('task-1');
  let state = createInitialApprovalCenterState();
  state = approvalCenterReducer(state, {
    type: 'server-review-received',
    task,
  });
  state = approvalCenterReducer(state, {
    type: 'operation-started',
    pending: {
      key: 'review:task-1:approve',
      entityId: 'task-1',
      operation: 'approve',
      startedAt: 1,
    },
  });

  assert.equal(state.server.tasks[0]?.status, 'PENDING');

  state = approvalCenterReducer(state, {
    type: 'operation-finished',
    key: 'review:task-1:approve',
  });
  assert.equal(state.server.tasks[0]?.status, 'PENDING');
  assert.equal(state.optimistic.pending, null);
});

test('a failed partial refresh preserves the last known server data', () => {
  const task = reviewTask('task-1');
  let state = createInitialApprovalCenterState();
  state = approvalCenterReducer(state, {
    type: 'server-review-received',
    task,
  });
  state = approvalCenterReducer(state, { type: 'list-requested', requestId: 4 });
  state = approvalCenterReducer(state, {
    type: 'list-settled',
    requestId: 4,
    tasks: { ok: false, error: 'offline' },
    approvals: { ok: true, value: [] },
    stats: { ok: false, error: 'offline' },
  });

  assert.deepEqual(state.server.tasks, [task]);
  assert.equal(state.server.errors.tasks, 'offline');
});
