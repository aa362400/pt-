const PLATFORM_LABELS: Record<string, string> = {
  ozon: 'Ozon',
  amazon: '亚马逊',
  shopify: 'Shopify',
  etsy: 'Etsy',
  ebay: 'eBay',
  temu: 'Temu',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  completed: '待审核',
  published: '已发布',
  in_review: '待审核',
  rejected: '已驳回',
  failed: '失败',
};

export function listingPlatformLabel(platform?: string | null): string {
  const normalized = platform?.trim().toLocaleLowerCase();
  if (!normalized) return '未设置';
  return PLATFORM_LABELS[normalized] ?? '其他平台';
}

export function listingStatusLabel(status?: string | null): string {
  const normalized = status?.trim().toLocaleLowerCase();
  if (!normalized) return '状态待确认';
  return STATUS_LABELS[normalized] ?? '状态待确认';
}
