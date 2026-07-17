type CustomerConversationSearchable = {
  customer: string;
  platform: string;
  subject: string;
  lastMessage: string;
  status: 'pending' | 'resolved';
  orderId: string | null;
};

export type CustomerConversationFilter = 'all' | 'pending';

function normalizeCode(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function customerChatTypeLabel(value: string | null | undefined) {
  switch (normalizeCode(value)) {
    case 'BUYER_SELLER':
    case 'SELLER_BUYER':
      return '买家与卖家';
    case 'SELLER_SUPPORT':
    case 'SUPPORT_SELLER':
      return '卖家与 Ozon 客服';
    case '':
    case 'UNKNOWN':
    case 'UNSPECIFIED':
      return '会话类型未返回';
    default:
      return '其他会话类型';
  }
}

export function customerChatParticipantLabel(
  value: string | null | undefined,
) {
  switch (normalizeCode(value)) {
    case 'BUYER_SELLER':
    case 'SELLER_BUYER':
      return 'Ozon 买家';
    case 'SELLER_SUPPORT':
    case 'SUPPORT_SELLER':
      return 'Ozon 客服支持';
    default:
      return 'Ozon 会话';
  }
}

export function customerChatStatusLabel(value: string | null | undefined) {
  switch (normalizeCode(value)) {
    case 'OPEN':
    case 'OPENED':
    case 'ACTIVE':
      return '进行中';
    case 'CLOSE':
    case 'CLOSED':
    case 'RESOLVED':
      return '已关闭';
    case '':
    case 'UNKNOWN':
    case 'UNSPECIFIED':
      return '状态未返回';
    default:
      return '其他状态';
  }
}

export function customerSourceLabel(value: string | null | undefined) {
  switch (normalizeCode(value)) {
    case 'CHATS':
      return '买家聊天';
    case 'QUESTIONS':
      return '商品问答';
    case 'REVIEWS':
      return '商品评价';
    default:
      return '其他数据源';
  }
}

export function isCustomerMessageSender(value: string | null | undefined) {
  const code = normalizeCode(value);
  return (
    code === 'BUYER' ||
    code === 'CUSTOMER' ||
    code === 'CLIENT' ||
    code.startsWith('BUYER_') ||
    code.startsWith('CUSTOMER_')
  );
}

export function filterCustomerConversations<T extends CustomerConversationSearchable>(
  conversations: T[],
  query: string,
  filter: CustomerConversationFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  return conversations.filter((conversation) => {
    if (filter === 'pending' && conversation.status !== 'pending') return false;
    if (!normalizedQuery) return true;
    return [
      conversation.customer,
      conversation.platform,
      conversation.subject,
      conversation.lastMessage,
      conversation.orderId ?? '',
    ].some((value) =>
      value.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
    );
  });
}
