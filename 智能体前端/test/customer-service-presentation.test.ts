import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  customerChatStatusLabel,
  customerChatTypeLabel,
  customerSourceLabel,
  filterCustomerConversations,
} from '../src/utils/customer-service-presentation.ts';

const pageSource = readFileSync(
  new URL('../src/pages-v2/CustomerServiceV2.tsx', import.meta.url),
  'utf8',
);
const viewSource = readFileSync(
  new URL('../src/figma-exact/CustomerService.tsx', import.meta.url),
  'utf8',
);

test('Ozon chat type and status codes are presented in accurate Chinese', () => {
  assert.equal(customerChatTypeLabel('Buyer_Seller'), '买家与卖家');
  assert.equal(customerChatTypeLabel('SELLER_SUPPORT'), '卖家与 Ozon 客服');
  assert.equal(customerChatTypeLabel('UNSPECIFIED'), '会话类型未返回');
  assert.equal(customerChatTypeLabel('future_type'), '其他会话类型');

  assert.equal(customerChatStatusLabel('OPENED'), '进行中');
  assert.equal(customerChatStatusLabel('CLOSED'), '已关闭');
  assert.equal(customerChatStatusLabel('UNSPECIFIED'), '状态未返回');
  assert.equal(customerChatStatusLabel('future_status'), '其他状态');
});

test('customer-service source keys are presented in Chinese', () => {
  assert.equal(customerSourceLabel('chats'), '买家聊天');
  assert.equal(customerSourceLabel('questions'), '商品问答');
  assert.equal(customerSourceLabel('reviews'), '商品评价');
  assert.equal(customerSourceLabel('future_source'), '其他数据源');
  assert.match(pageSource, /customerSourceLabel\(key\)/);
});

test('search and pending filters return only matching real conversations', () => {
  const conversations = [
    {
      id: 'chat:1',
      customer: 'Ozon 买家',
      platform: 'Ozon',
      subject: '买家聊天 · 进行中',
      lastMessage: '请问什么时候发货',
      status: 'pending' as const,
      orderId: '123',
    },
    {
      id: 'review:2',
      customer: 'Ozon 评价 5/5',
      platform: 'Ozon 评价',
      subject: '商品评价',
      lastMessage: '质量很好',
      status: 'resolved' as const,
      orderId: '456',
    },
  ];

  assert.deepEqual(
    filterCustomerConversations(conversations, '发货', 'all').map(
      (item) => item.id,
    ),
    ['chat:1'],
  );
  assert.deepEqual(
    filterCustomerConversations(conversations, '', 'pending').map(
      (item) => item.id,
    ),
    ['chat:1'],
  );
  assert.deepEqual(
    filterCustomerConversations(conversations, '456', 'all').map(
      (item) => item.id,
    ),
    ['review:2'],
  );
});

test('unsupported customer-service writes are visibly disabled instead of navigating to a placeholder', () => {
  assert.match(viewSource, /title="归档功能尚未接入后端"[\s\S]{0,160}disabled/);
  assert.match(viewSource, /title="更多操作尚未接入后端"[\s\S]{0,160}disabled/);
  assert.match(viewSource, /title="附件发送尚未接入后端"[\s\S]{0,160}disabled/);
  assert.match(viewSource, /title="图片发送尚未接入后端"[\s\S]{0,160}disabled/);
  assert.doesNotMatch(viewSource, /onClick=\{onOpenOperations\}/);
  assert.doesNotMatch(pageSource, /useNavigate/);
});
