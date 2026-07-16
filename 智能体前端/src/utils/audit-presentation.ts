const FIELD_LABELS: Record<string, string> = {
  provider: '平台',
  channelId: '店铺连接',
  action: '业务动作',
  status: '状态',
  executedAt: '执行时间',
  humanApproved: '人工确认',
  productId: '商品编号',
  offerId: '商家货号',
  externalProductId: '平台商品编号',
  externalTaskId: '平台任务编号',
  reason: '原因',
  errorCode: '错误代码',
  failureCode: '失败代码',
  source: '来源',
  operation: '操作类型',
  approved: '是否批准',
  price: '价格',
  stock: '库存',
  notes: '业务说明',
  reviewedAt: '审核时间',
  createdAt: '创建时间',
  updatedAt: '更新时间',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  RUNNING: '执行中',
  COMPLETED: '已完成',
  FAILED: '执行失败',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  REWORK: '待重新处理',
  CANCELLED: '已取消',
  UNKNOWN: '结果待核实',
};

export function auditStatusLabel(status: string): string {
  return STATUS_LABELS[status.toUpperCase()] ?? '状态待确认';
}

const SENSITIVE_FIELD = /(password|secret|token|api.?key|authorization|credential|cipher|signature)/i;

export function auditActionLabel(action: string): string {
  const value = action.toLowerCase();
  const exactLabels: Record<string, string> = {
    review_approved: '人工批准',
    review_rejected: '人工驳回',
    review_rework: '要求重新处理',
    'agent-eval.aggregate': 'Agent 质量评估已汇总',
    'product-research.evidence-review-created': '证据不足，已转人工核验',
    'product-research.review-created': '已创建选品审核',
    'product-research.create': '已生成选品研究',
    'ozon.pricing.calculated': 'Ozon 核价已计算',
    'agent-proxy.ozon.pricing.calculate': 'Agent 已调用 Ozon 核价',
    'agent-proxy.unauthorized': 'Agent 调用被权限拦截',
    'agent-autonomy.mode-enabled': '已开启 Agent 自主模式',
    'agent-autonomy.mode-disabled': '已关闭 Agent 自主模式',
  };
  if (exactLabels[value]) return exactLabels[value];
  if (value.includes('approved')) return '人工批准';
  if (value.includes('rejected')) return '人工驳回';
  if (value.includes('rework')) return '要求重新处理';
  if (value.includes('completed')) return '执行完成';
  if (value.includes('failed')) return '执行失败';
  if (value.includes('started')) return '开始执行';
  if (value.includes('created') || value.includes('create')) return '已创建';
  if (value.includes('updated') || value.includes('update')) return '已更新';
  if (value.includes('deleted') || value.includes('delete')) return '已删除';
  return '业务记录';
}

export function auditResourceLabel(resourceType: string): string {
  return (
    {
      AgentRun: 'Agent 任务',
      AGENT_RUN: 'Agent 任务',
      AutomationRun: '自动化运行',
      AUTOMATION_RUN: '自动化运行',
      ExternalSubmission: 'Ozon 外部提交',
      EXTERNAL_SUBMISSION: 'Ozon 外部提交',
      ProductLaunch: '商品发布流程',
      ListingPublishSnapshot: '不可变发布快照',
      OzonCustomerTarget: 'Ozon 客户服务',
      Product: '商品',
      ReviewTask: '审批任务',
      REVIEW_TASK: '审批任务',
      ActionProposal: '动作申请',
      ProductResearch: '选品研究',
      ProfitCalculation: '核价记录',
      AgentProxy: 'Agent 工具调用',
      FeatureFlag: '功能开关',
      AgentEvalSnapshot: 'Agent 质量评估',
    }[resourceType] ?? resourceType
  );
}

export interface AuditSummaryItem {
  label: string;
  value: string;
}

export function summarizeAuditPayload(payload: unknown): AuditSummaryItem[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  return Object.entries(payload as Record<string, unknown>)
    .filter(([key, value]) => !SENSITIVE_FIELD.test(key) && value != null)
    .slice(0, 12)
    .map(([key, value]) => ({
      label: FIELD_LABELS[key] ?? humanizeKey(key),
      value: summarizeValue(value, key),
    }));
}

function summarizeValue(value: unknown, key: string): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return new Intl.NumberFormat('zh-CN').format(value);
  if (typeof value === 'string') {
    if (key === 'status') return auditStatusLabel(value);
    if (/At$/.test(key) && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toLocaleString('zh-CN', { hour12: false });
    }
    if (value.length >= 5 && /^[?，,。.;；:：!！\s]+$/.test(value)) {
      return '历史记录文字不可读（原始数据已损坏）';
    }
    return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  if (Array.isArray(value)) return `${value.length} 项`;
  if (value && typeof value === 'object') {
    return `${Object.keys(value as Record<string, unknown>).length} 个字段`;
  }
  return '未记录';
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.trim() || '业务字段';
}
