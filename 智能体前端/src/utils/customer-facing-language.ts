const EXECUTION_STATUS_LABELS: Record<string, string> = {
  PENDING: '等待处理',
  QUEUED: '排队中',
  WAITING: '等待处理',
  WAITING_FOR_APPROVAL: '等待人工审批',
  WAITING_FOR_REVIEW: '等待人工复核',
  RUNNING: '执行中',
  PROCESSING: '处理中',
  SYNCING: '同步中',
  COMPLETED: '已完成',
  COMPLETE: '已完成',
  SUCCESS: '已完成',
  SUCCEEDED: '已完成',
  FAILED: '执行失败',
  ERROR: '执行异常',
  DEAD_LETTERED: '进入异常队列',
  CANCELLED: '已取消',
  CANCELED: '已取消',
  PAUSED: '已暂停',
  TIMEOUT: '已超时',
  TIMED_OUT: '已超时',
  CONNECTED: '已连接',
  DISCONNECTED: '未连接',
  ACTIVE: '已启用',
  INACTIVE: '未启用',
  ENABLED: '已启用',
  DISABLED: '已停用',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  PARTIAL: '部分完成',
  UNKNOWN: '状态待核实',
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  GENERAL_ASSISTANT: '通用运营智能体',
  PRODUCT_RESEARCH: '选品智能体',
  DAILY_PRODUCT_RESEARCH: '每日选品智能体',
  GLOBAL_PRODUCT_DISCOVERY: '全球选品智能体',
  LISTING: '商品刊登智能体',
  LISTING_GENERATION: '商品资料生成智能体',
  IMAGE_GENERATION: '商品图片智能体',
  CUSTOMER_SERVICE: '客户服务智能体',
  MARKETING: '营销智能体',
  INVENTORY: '库存智能体',
};

const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
  OWNER: '组织负责人',
  ADMIN: '管理员',
  OPERATOR: '运营成员',
  EDITOR: '编辑成员',
  MEMBER: '普通成员',
  VIEWER: '只读成员',
};

const FULFILLMENT_TYPE_LABELS: Record<string, string> = {
  FBO: 'Ozon 仓配',
  FBS: '卖家发货',
  RFBS: '卖家自配送',
  FBP: '合作伙伴仓配',
  EXPRESS: '快速配送',
};

const HAS_CHINESE = /[\u3400-\u9fff]/u;

export function executionStatusLabel(value?: string | null): string {
  if (!value) return '状态待核实';
  return EXECUTION_STATUS_LABELS[value.trim().toUpperCase()] ?? '状态待核实';
}

export function agentTypeLabel(value?: string | null): string {
  if (!value) return '业务智能体';
  return AGENT_TYPE_LABELS[value.trim().toUpperCase()] ?? '业务智能体';
}

export function organizationRoleLabel(value?: string | null): string {
  if (!value) return '普通成员';
  return ORGANIZATION_ROLE_LABELS[value.trim().toUpperCase()] ?? '普通成员';
}

export function fulfillmentTypeLabel(value?: string | null): string {
  if (!value) return '履约方式未返回';
  return FULFILLMENT_TYPE_LABELS[value.trim().toUpperCase()] ?? '履约方式待核实';
}

export function customerApiErrorMessage(
  message: string | null | undefined,
  status: number,
): string {
  const normalized = message?.trim() ?? '';
  if (normalized && HAS_CHINESE.test(normalized)) return normalized;

  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 403) return '当前账号无权执行此操作。';
  if (status === 404) return '请求的数据不存在或已失效。';
  if (status === 408 || status === 504) return '请求超时，请稍后重试。';
  if (status === 409 || status === 422) {
    return '请求未通过业务校验，请按页面提示检查后重试。';
  }
  if (status === 429) return '请求过于频繁，请稍后重试。';
  if (status >= 500) return '服务暂时不可用，请稍后重试。';
  return '请求失败，请检查网络后重试。';
}
