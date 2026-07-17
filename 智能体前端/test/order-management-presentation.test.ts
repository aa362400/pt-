import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyOrderSearchInput,
  clearOrderFilters,
  marketplaceOrderStatusLabel,
  mapMarketplaceOrderStatus,
  selectOrderStatusTab,
} from '../src/utils/order-presentation.ts';

const pageSource = readFileSync(
  new URL('../src/figma-exact/OrderManagement.tsx', import.meta.url),
  'utf8',
);

test('Ozon waiting-for-delivery is never presented as delivered', () => {
  assert.equal(mapMarketplaceOrderStatus('awaiting_deliver'), 'processing');
  assert.equal(mapMarketplaceOrderStatus('awaiting_delivery'), 'processing');
  assert.equal(marketplaceOrderStatusLabel('awaiting_deliver'), '等待交运');
  assert.equal(marketplaceOrderStatusLabel('delivered'), '已送达');
});

test('known Ozon shipment states map to precise customer-facing groups', () => {
  assert.equal(mapMarketplaceOrderStatus('awaiting_packaging'), 'processing');
  assert.equal(mapMarketplaceOrderStatus('awaiting_approve'), 'processing');
  assert.equal(mapMarketplaceOrderStatus('delivering'), 'shipped');
  assert.equal(mapMarketplaceOrderStatus('driver_pickup'), 'shipped');
  assert.equal(mapMarketplaceOrderStatus('sent_by_seller'), 'shipped');
  assert.equal(mapMarketplaceOrderStatus('delivered'), 'delivered');
  assert.equal(mapMarketplaceOrderStatus('cancelled'), 'refund');
  assert.equal(mapMarketplaceOrderStatus('arbitration'), 'issue');
  assert.equal(mapMarketplaceOrderStatus('not_accepted'), 'issue');
  assert.equal(mapMarketplaceOrderStatus('future_unknown_status'), 'pending');
});

test('order workbench has real search and refresh, with unsupported actions visibly disabled', () => {
  assert.match(pageSource, /value=\{searchQuery\}/);
  assert.match(pageSource, /onInput=\{handleSearchInput\}/);
  assert.match(pageSource, /onClick=\{onRefresh\}/);
  assert.match(pageSource, /title="批量发货尚未接入"[\s\S]{0,180}disabled/);
  assert.match(pageSource, /title="订单导出尚未接入"[\s\S]{0,180}disabled/);
  assert.match(pageSource, /aria-label=\{`给订单 \$\{order\.orderId\} 发邮件`\}[\s\S]{0,180}disabled/);
  assert.doesNotMatch(pageSource, />2<\/button>/);
  assert.doesNotMatch(pageSource, />3<\/button>/);
  assert.doesNotMatch(pageSource, /上一页|下一页/);
});

test('clearing the controlled search restores every order instead of retaining a stale status filter', () => {
  assert.deepEqual(
    applyOrderSearchInput(
      { selectedTab: 'processing', searchQuery: '旧订单' },
      '',
    ),
    { selectedTab: 'all', searchQuery: '' },
  );
  assert.deepEqual(clearOrderFilters(), { selectedTab: 'all', searchQuery: '' });
  assert.match(pageSource, /onInput=\{handleSearchInput\}/);
  assert.match(pageSource, /aria-label="清空订单搜索和状态筛选"/);
});

test('selecting a status tab clears an older search instead of silently intersecting both filters', () => {
  assert.deepEqual(selectOrderStatusTab('shipped'), {
    selectedTab: 'shipped',
    searchQuery: '',
  });
  assert.match(pageSource, /onClick=\{\(\) => handleSelectTab\(tab\.key\)\}/);
});
