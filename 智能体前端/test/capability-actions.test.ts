import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  capabilityActionForBlocker,
  capabilityStatusKey,
} from '../src/utils/capability-actions.ts';

test('credential warnings lead to the real platform connection page', () => {
  assert.deepEqual(
    capabilityActionForBlocker('需要配置 Ozon Performance client_id/client_secret'),
    {
      kind: 'NAVIGATE',
      path: '/store-monitor',
      messageKey: 'capabilityCenter.warnings.credentials',
      actionLabelKey: 'capabilityCenter.actions.configureCredentials',
    },
  );
});

test('channel warnings lead to system channel status', () => {
  assert.equal(
    capabilityActionForBlocker('AGENT_WEBHOOK_SECRET 未配置，回调通道禁用').kind,
    'NAVIGATE',
  );
  assert.equal(
    capabilityActionForBlocker('队列通道依赖故障').kind,
    'NAVIGATE',
  );
  assert.equal(
    (capabilityActionForBlocker('队列通道依赖故障') as { path: string }).path,
    '/enterprise-readiness?section=channels',
  );
});

test('subscription warnings open customer guidance instead of a dead route', () => {
  const action = capabilityActionForBlocker('商品问答需要 Ozon Premium Plus 订阅');
  assert.equal(action.kind, 'DIALOG');
  assert.equal(action.actionLabelKey, 'capabilityCenter.actions.viewInstructions');
});

test('unknown dependencies fail closed to enterprise readiness', () => {
  assert.deepEqual(capabilityActionForBlocker('真实业务接口尚未接入'), {
    kind: 'NAVIGATE',
    path: '/enterprise-readiness',
    messageKey: 'capabilityCenter.warnings.dependency',
    actionLabelKey: 'capabilityCenter.actions.viewDependency',
  });
});

test('all capability states have one customer-readable badge', () => {
  assert.equal(capabilityStatusKey('passed'), 'capabilityCenter.status.available');
  assert.equal(capabilityStatusKey('partial'), 'capabilityCenter.status.needsConfiguration');
  assert.equal(capabilityStatusKey('backend'), 'capabilityCenter.status.dependencyFailure');
  assert.equal(capabilityStatusKey('missing'), 'capabilityCenter.status.notConnected');
});

test('capability center no longer exposes engineering integration columns', () => {
  const page = readFileSync(
    new URL('../src/pages/CapabilityCenter.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(page, /贯通/u);
  assert.doesNotMatch(page, />前端</u);
  assert.doesNotMatch(page, />后端</u);
  assert.doesNotMatch(page, />智能体</u);
  assert.match(page, /capabilityActionForBlocker/);
});
