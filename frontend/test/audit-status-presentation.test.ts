import assert from 'node:assert/strict';
import test from 'node:test';
import { auditStatusLabel } from '../src/utils/audit-presentation.ts';

test('incident timeline status is always customer-readable', () => {
  assert.equal(auditStatusLabel('FAILED'), '执行失败');
  assert.equal(auditStatusLabel('completed'), '已完成');
  assert.equal(auditStatusLabel('provider_specific_state'), '状态待确认');
});
