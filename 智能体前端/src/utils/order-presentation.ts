export type CustomerOrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'issue'
  | 'refund';

export type CustomerOrderStatusFilter = CustomerOrderStatus | 'all';

export interface OrderFilterState {
  selectedTab: CustomerOrderStatusFilter;
  searchQuery: string;
}

const PROCESSING_STATUSES = new Set([
  'acceptance_in_progress',
  'awaiting_approve',
  'awaiting_deliver',
  'awaiting_delivery',
  'awaiting_packaging',
  'awaiting_registration',
  'processing',
]);

const SHIPPED_STATUSES = new Set([
  'delivering',
  'driver_pickup',
  'sent_by_seller',
  'shipped',
]);

const REFUND_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refund',
  'refunded',
]);

const ISSUE_STATUSES = new Set([
  'arbitration',
  'client_arbitration',
  'error',
  'failed',
  'not_accepted',
]);

const STATUS_LABELS: Record<string, string> = {
  acceptance_in_progress: '验收中',
  arbitration: '平台仲裁中',
  awaiting_approve: '等待确认',
  awaiting_deliver: '等待交运',
  awaiting_delivery: '等待交运',
  awaiting_packaging: '等待打包',
  awaiting_registration: '等待登记',
  cancelled: '已取消',
  canceled: '已取消',
  client_arbitration: '客户仲裁中',
  delivered: '已送达',
  delivering: '配送中',
  driver_pickup: '司机取件中',
  error: '异常',
  failed: '失败',
  not_accepted: '分拣中心未接收',
  processing: '处理中',
  refund: '退款中',
  refunded: '已退款',
  sent_by_seller: '卖家已发出',
  shipped: '已发货',
};

function normalizedStatus(value: string): string {
  return value.trim().toLowerCase();
}

export function clearOrderFilters(): OrderFilterState {
  return { selectedTab: 'all', searchQuery: '' };
}

export function applyOrderSearchInput(
  current: OrderFilterState,
  searchQuery: string,
): OrderFilterState {
  if (!searchQuery.trim()) return clearOrderFilters();
  return { ...current, searchQuery };
}

export function selectOrderStatusTab(
  selectedTab: CustomerOrderStatusFilter,
): OrderFilterState {
  return { selectedTab, searchQuery: '' };
}

export function mapMarketplaceOrderStatus(value: string): CustomerOrderStatus {
  const status = normalizedStatus(value);
  if (status === 'delivered') return 'delivered';
  if (SHIPPED_STATUSES.has(status)) return 'shipped';
  if (REFUND_STATUSES.has(status)) return 'refund';
  if (ISSUE_STATUSES.has(status)) return 'issue';
  if (PROCESSING_STATUSES.has(status)) return 'processing';
  return 'pending';
}

export function marketplaceOrderStatusLabel(value: string): string {
  const status = normalizedStatus(value);
  return STATUS_LABELS[status] ?? '待核实';
}
