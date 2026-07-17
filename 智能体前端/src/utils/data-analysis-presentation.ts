const PRODUCT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '在售',
  DRAFT: '草稿',
  PAUSED: '已暂停',
  ARCHIVED: '已归档',
  DELETED: '已删除',
};

const OZON_STATUS_LABELS: Record<string, string> = {
  VISIBLE: 'Ozon 可见',
  INVISIBLE: 'Ozon 不可见',
  PROCESSING: 'Ozon 处理中',
  MODERATED: 'Ozon 审核中',
  DECLINED: 'Ozon 审核未通过',
  ERROR: 'Ozon 异常',
  ARCHIVED: 'Ozon 已归档',
};

const PRODUCT_SOURCE_LABELS: Record<string, string> = {
  ozon: 'Ozon',
  product_table: '商品目录',
};

const TREND_SOURCE_LABELS: Record<string, string> = {
  trend_insight: '趋势洞察',
  keyword_report: '关键词报告',
  mixed: '趋势洞察与关键词报告',
};

const DATA_SOURCE_LABELS: Record<string, string> = {
  profit_calculations: '利润计算记录',
  products: 'Ozon 商品同步目录',
};

const CURRENCY_LABELS: Record<string, string> = {
  RUB: '俄罗斯卢布',
  CNY: '人民币',
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
};

const TREND_LABELS = new Map<string, string>([
  ['18 high-demand and trending products to sell online in 2026', '2026 年适合在线销售的 18 款高需求趋势商品'],
  ['2026 ecommerce trends: why brands are moving beyond ...', '2026 年电商趋势：品牌为何正在突破传统模式'],
  ['5 fastest growing categories on amazon in 2026', '2026 年亚马逊增长最快的 5 个类目'],
  ['5 emerging e-commerce trends for 2026 | alsendo', '2026 年 5 个新兴电商趋势'],
  ['amazon prime day 2026 predictions: ecommerce trends ...', '2026 年亚马逊会员日预测：电商趋势'],
  ["amazon prime day's effect generates $26.4 billion in u.s. ...", '亚马逊会员日带动美国市场产生 264 亿美元影响'],
  ['amazon us prime day 2026 sales estimates - pmg', '2026 年亚马逊美国站会员日销售预估'],
  ['cantonese sauce (кантонский соус) available on ozon', 'Ozon 在售广式酱料'],
  ['corn (mais) category on ozon with promotions', 'Ozon 玉米类目促销商品'],
  ['ecommerce trends: the fastest-growing online retailers in ...', '电商趋势：增长最快的在线零售商'],
  ['ecommerce trends: the fastest-growing online retailers in 2026', '2026 年电商趋势：增长最快的在线零售商'],
  ['fastest-growing amazon categories to watch in 2026 - supplykick', '2026 年值得关注的亚马逊增长最快类目'],
  ["five demand signals we're watching before prime day", '会员日前值得关注的五个需求信号'],
  ['key trends shaping online commerce in 2026', '塑造 2026 年在线商业的关键趋势'],
  ['key trends shaping online commerce in 2026 - signifyd', '塑造 2026 年在线商业的关键趋势'],
  ['mai xiang cun brand products on ozon', 'Ozon 上的麦香村品牌商品'],
  ['newest e-commerce trends for 2026 - youtube', '2026 年最新电商趋势（视频）'],
  ['parking sensor (датчик парктроника) from chinese supplier with export to europe and us', '中国供应商的倒车雷达传感器，出口欧洲和美国'],
  ['the best-selling products online in 2026 - cj dropshipping', '2026 年线上畅销商品'],
  ['top ecommerce trends to watch in 2026', '2026 年值得关注的主要电商趋势'],
  ['udon noodles (udon noodles) with discount', '促销中的乌冬面'],
  ['your 2026 ecommerce strategy is already obsolete - youtube', '您的 2026 年电商策略可能已经过时（视频）'],
  ['tenant-isolation', '租户隔离'],
]);

function normalizedCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizedKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';
}

export function dataAnalysisProductStatusLabel(
  ozonStatus: unknown,
  productStatus: unknown,
): string {
  const ozonCode = normalizedCode(ozonStatus);
  if (ozonCode && OZON_STATUS_LABELS[ozonCode]) return OZON_STATUS_LABELS[ozonCode];

  const productCode = normalizedCode(productStatus);
  if (productCode && PRODUCT_STATUS_LABELS[productCode]) return PRODUCT_STATUS_LABELS[productCode];
  return ozonCode || productCode ? '状态未知' : '状态未提供';
}

export function dataAnalysisProductSourceLabel(value: unknown): string {
  const source = normalizedKey(value);
  if (!source) return '来源未提供';
  return PRODUCT_SOURCE_LABELS[source] ?? '来源未知';
}

export function dataAnalysisTrendSourceLabel(value: unknown): string {
  const source = normalizedKey(value);
  if (!source) return '来源未提供';
  return TREND_SOURCE_LABELS[source] ?? '来源未知';
}

export function dataAnalysisSourceLabel(value: unknown): string {
  const source = normalizedKey(value);
  if (!source) return '数据来源未提供';
  return DATA_SOURCE_LABELS[source] ?? '数据来源未知';
}

export function dataAnalysisCurrencyLabel(value: unknown): string {
  const currency = normalizedCode(value);
  if (!currency) return '币种未提供';
  return CURRENCY_LABELS[currency] ?? '币种未知';
}

export function dataAnalysisTrendLabel(value: unknown): string {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label) return '趋势描述未提供';

  const translated = TREND_LABELS.get(label.toLocaleLowerCase('en-US'));
  if (translated) return translated;
  if (/\p{Script=Han}/u.test(label)) return label;
  if (/[A-Za-z]/u.test(label)) return '英文趋势描述待翻译';
  return '外文趋势描述待翻译';
}
