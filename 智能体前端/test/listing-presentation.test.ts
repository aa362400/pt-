import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listingPlatformLabel,
  listingStatusLabel,
} from '../src/utils/listing-presentation.ts';

test('legacy listing platforms use customer-readable labels', () => {
  assert.equal(listingPlatformLabel('amazon'), '亚马逊');
  assert.equal(listingPlatformLabel('ozon'), 'Ozon');
  assert.equal(listingPlatformLabel(null), '未设置');
  assert.equal(listingPlatformLabel('unknown-provider'), '其他平台');
});

test('listing workflow statuses are always shown in Chinese', () => {
  assert.equal(listingStatusLabel('draft'), '草稿');
  assert.equal(listingStatusLabel('completed'), '待审核');
  assert.equal(listingStatusLabel('published'), '已发布');
  assert.equal(listingStatusLabel('future_status'), '状态待确认');
});
