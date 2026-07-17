import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  inventoryStateFromStock,
  productPerformanceFromMetadata,
  productStatusFromBackend,
  productStatusLabel,
} from '../src/utils/product-management-presentation.ts';

const pageSource = readFileSync(
  new URL('../src/pages-v2/ProductManagementV2.tsx', import.meta.url),
  'utf8',
);
const tableSource = readFileSync(
  new URL('../src/figma-exact/ProductManagement.tsx', import.meta.url),
  'utf8',
);

test('backend PAUSED remains paused regardless of stock and is shown in Chinese', () => {
  assert.equal(productStatusFromBackend('PAUSED'), 'paused');
  assert.equal(productStatusFromBackend('paused'), 'paused');
  assert.equal(productStatusLabel('paused'), '已暂停');
  assert.equal(inventoryStateFromStock(0), 'out_of_stock');
});

test('all known backend product statuses have exact Chinese presentation', () => {
  assert.equal(productStatusLabel(productStatusFromBackend('ACTIVE')), '在售');
  assert.equal(productStatusLabel(productStatusFromBackend('DRAFT')), '草稿');
  assert.equal(productStatusLabel(productStatusFromBackend('ARCHIVED')), '已归档');
  assert.equal(productStatusLabel(productStatusFromBackend('DELETED')), '已删除');
  assert.equal(productStatusLabel(productStatusFromBackend('future_status')), '状态待确认');
});

test('performance is never invented when the backend has no valid assessment', () => {
  assert.equal(productPerformanceFromMetadata(undefined), 'unassessed');
  assert.equal(productPerformanceFromMetadata({}), 'unassessed');
  assert.equal(productPerformanceFromMetadata({ performance: 'unknown' }), 'unassessed');
  assert.equal(productPerformanceFromMetadata({ performance: 'GOOD' }), 'good');
  assert.equal(productPerformanceFromMetadata({ performance: 'poor' }), 'poor');
  assert.doesNotMatch(pageSource, /performance:\s*['"]good['"]/);
  assert.match(tableSource, /unassessed:\s*\{\s*label:\s*['"]未评估['"]/);
});

test('missing metrics are shown as no data and paused products can be filtered', () => {
  assert.match(tableSource, /product\.sales30d \?\? ['"]暂无数据['"]/);
  assert.match(tableSource, /product\.views30d === null \? ['"]暂无数据['"]/);
  assert.match(tableSource, /product\.conversionRate \?\? ['"]暂无数据['"]/);
  assert.match(tableSource, /key:\s*['"]paused['"],\s*label:\s*['"]已暂停['"]/);
});
