export type ProductPresentationStatus =
  | 'active'
  | 'draft'
  | 'paused'
  | 'archived'
  | 'deleted'
  | 'unknown';

export type ProductPerformance =
  | 'excellent'
  | 'good'
  | 'poor'
  | 'unassessed';

export type InventoryState =
  | 'normal'
  | 'low_stock'
  | 'out_of_stock'
  | 'unknown';

const PRODUCT_STATUS_LABELS: Record<ProductPresentationStatus, string> = {
  active: '在售',
  draft: '草稿',
  paused: '已暂停',
  archived: '已归档',
  deleted: '已删除',
  unknown: '状态待确认',
};

export function productStatusFromBackend(value: unknown): ProductPresentationStatus {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (status === 'ACTIVE') return 'active';
  if (status === 'DRAFT') return 'draft';
  if (status === 'PAUSED') return 'paused';
  if (status === 'ARCHIVED') return 'archived';
  if (status === 'DELETED') return 'deleted';
  return 'unknown';
}

export function productStatusLabel(status: ProductPresentationStatus): string {
  return PRODUCT_STATUS_LABELS[status];
}

export function productPerformanceFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ProductPerformance {
  const value = typeof metadata?.performance === 'string'
    ? metadata.performance.trim().toLocaleLowerCase()
    : '';
  if (value === 'excellent' || value === 'good' || value === 'poor') return value;
  return 'unassessed';
}

export function inventoryStateFromStock(stock: number | null): InventoryState {
  if (stock === null) return 'unknown';
  if (stock === 0) return 'out_of_stock';
  if (stock < 10) return 'low_stock';
  return 'normal';
}
