const SOURCE_LABELS: Record<string, string> = {
  global_marketplace_discovery: "全球市场公开检索",
  manual_import: "人工或表格导入",
  ozon_verified_evidence_cache: "Ozon 已验证证据缓存",
};

const SCORE_COMPONENT_LABELS: Record<string, string> = {
  demand: "需求强度",
  growth: "增长趋势",
  profit: "利润空间",
  safety: "合规安全",
  visual: "视觉表现",
  lifecycle: "生命周期",
  competition: "竞争程度",
  feasibility: "履约可行性",
  customization: "差异化能力",
};

const ARTIFACT_LABELS: Record<string, string> = {
  TOP_MD: "优先候选摘要",
  TOP_JSON: "优先候选数据",
  WATCHLIST_JSON: "观察名单",
  REJECTED_JSON: "淘汰清单",
  RISK_JSON: "风险报告",
  SOURCE_HEALTH_JSON: "来源健康报告",
  RUN_LOG_JSON: "完整运行记录",
};

const SIGNAL_METRIC_LABELS: Record<string, string> = {
  price: "公开售价",
  rating: "商品评分",
  sales: "销量",
  review_count: "评论数量",
  reviews: "评论数量",
  stars: "商品评分",
  public_market_price: "公开市场参考价",
  ozon_public_search_result_count: "Ozon 相关商品样本数",
};

const SIGNAL_UNIT_LABELS: Record<string, string> = {
  count: "件",
  sampled_relevant_listings: "个相关商品样本",
  CNY: "元",
  RUB: "卢布",
  USD: "美元",
  EUR: "欧元",
};

const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: "人工触发",
  SCHEDULE: "定时触发",
  RETRY: "失败重试",
  RECOVERY: "自动恢复",
};

const THRESHOLD_LABELS: Record<string, string> = {
  testNow: "建议打样线",
  watch: "观察线",
  hold: "暂缓线",
};

export function researchSourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? "其他已授权来源";
}

export function researchScoreComponentLabel(value: string): string {
  return SCORE_COMPONENT_LABELS[value] ?? "其他评分项";
}

export function researchArtifactLabel(value: string): string {
  return ARTIFACT_LABELS[value] ?? "运行报告";
}

export function researchSignalMetricLabel(value: string): string {
  return SIGNAL_METRIC_LABELS[value] ?? "其他真实信号";
}

export function researchSignalUnitLabel(value: string | null): string {
  if (!value) return "";
  return SIGNAL_UNIT_LABELS[value] ?? "单位未标注";
}

export function researchTriggerLabel(value: string): string {
  return TRIGGER_LABELS[value] ?? "系统触发";
}

export function researchThresholdLabel(value: string): string {
  return THRESHOLD_LABELS[value] ?? "其他门槛";
}

export function researchConfigLabel(value: string): string {
  const match = /config-v(\d+)/i.exec(value);
  return match ? `第 ${match[1]} 版选品规则` : "当前选品规则";
}
