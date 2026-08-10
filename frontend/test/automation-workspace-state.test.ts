import assert from 'node:assert/strict';
import test from 'node:test';

import type { AutomationFlowDetail } from '../src/api/automation.ts';
import type { AutomationFlow } from '../src/types/index.ts';
import {
  automationWorkspaceReducer,
  createInitialAutomationWorkspaceState,
  selectAutomationDetail,
} from '../src/state/automation-workspace-state.ts';

function flow(id: string, enabled = false): AutomationFlow {
  return {
    id,
    name: `Flow ${id}`,
    description: '',
    icon: 'FileText',
    status: enabled ? 'running' : 'paused',
    channel: 'MANUAL',
    channelIcon: 'FileText',
    runDuration: '0 runs',
    successRate: null,
    nextRun: 'Not scheduled',
    lastRun: 'Not run',
    isEnabled: enabled,
  };
}

function detail(id: string): AutomationFlowDetail {
  return {
    ...flow(id),
    triggers: ['MANUAL'],
    actions: ['product.research'],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

test('ignores stale automation detail responses', () => {
  let state = createInitialAutomationWorkspaceState();
  state = automationWorkspaceReducer(state, {
    type: 'detail-requested',
    requestId: 1,
    flowId: 'first',
    intent: 'view',
  });
  state = automationWorkspaceReducer(state, {
    type: 'detail-requested',
    requestId: 2,
    flowId: 'second',
    intent: 'view',
  });
  state = automationWorkspaceReducer(state, {
    type: 'detail-succeeded',
    requestId: 1,
    flowId: 'first',
    intent: 'view',
    detail: detail('first'),
    runs: { items: [], total: 0 },
  });

  assert.equal(selectAutomationDetail(state), null);
  assert.equal(state.server.detailLoading?.flowId, 'second');
});

test('does not fake an enabled flow while a toggle request is pending', () => {
  const source = flow('flow-1', false);
  let state = createInitialAutomationWorkspaceState();
  state = automationWorkspaceReducer(state, {
    type: 'flows-requested',
    requestId: 1,
  });
  state = automationWorkspaceReducer(state, {
    type: 'flows-succeeded',
    requestId: 1,
    flows: [source],
  });
  state = automationWorkspaceReducer(state, {
    type: 'operation-started',
    pending: {
      key: 'toggle:flow-1',
      flowId: 'flow-1',
      operation: 'toggle',
      startedAt: 1,
    },
  });

  assert.equal(state.server.flows[0]?.isEnabled, false);
  state = automationWorkspaceReducer(state, {
    type: 'operation-finished',
    key: 'toggle:flow-1',
  });
  assert.equal(state.server.flows[0]?.isEnabled, false);
});

test('ignores an older flow list after a newer refresh completes', () => {
  let state = createInitialAutomationWorkspaceState();
  state = automationWorkspaceReducer(state, { type: 'flows-requested', requestId: 1 });
  state = automationWorkspaceReducer(state, { type: 'flows-requested', requestId: 2 });
  state = automationWorkspaceReducer(state, {
    type: 'flows-succeeded',
    requestId: 2,
    flows: [flow('new')],
  });
  state = automationWorkspaceReducer(state, {
    type: 'flows-succeeded',
    requestId: 1,
    flows: [flow('old')],
  });

  assert.equal(state.server.flows[0]?.id, 'new');
});
