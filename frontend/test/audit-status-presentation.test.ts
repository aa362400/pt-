import assert from 'node:assert/strict';
import test from 'node:test';
import { auditStatusLabel } from '../src/utils/audit-presentation.ts';

test('incident timeline status is always customer-readable', () => {
  assert.equal(auditStatusLabel('FAILED'), 'Failed');
  assert.equal(auditStatusLabel('completed'), 'Completed');
  assert.equal(auditStatusLabel('provider_specific_state'), 'Status pending verification');
});
