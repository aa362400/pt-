const sourceLabels: Record<string, string> = {
  '1688_public_sourcing_lead': '1688 货源线索',
  aliexpress_public_search: 'AliExpress',
  etsy_public_search: 'Etsy',
  google_shopping_public_sample: 'Google Shopping',
  ozon_public_listings: 'Ozon',
  ozon_public_search_cache: 'Ozon 公开搜索缓存',
  ozon_public_search_sample: 'Ozon',
  temu_public_search: 'Temu',
  walmart_public_search: 'Walmart',
};

export function marketEvidenceSourceLabel(source: string): string {
  return sourceLabels[source] ?? '其他已授权市场来源';
}
