import assert from 'node:assert/strict';
import test from 'node:test';

import { organizationNameForCustomer } from '../src/utils/profile-display.ts';

test('opaque technical organization identifiers are not exposed as customer labels', () => {
  assert.equal(organizationNameForCustomer('aa362400'), '当前组织');
  assert.equal(organizationNameForCustomer('cmro68vho05zypm01cuq6fzya'), '当前组织');
});

test('customer-readable organization names remain visible', () => {
  assert.equal(organizationNameForCustomer('杰科设计工作室'), '杰科设计工作室');
  assert.equal(organizationNameForCustomer('Jieke Design Studio'), 'Jieke Design Studio');
  assert.equal(organizationNameForCustomer(null), '当前组织');
});
