const FIELD_LABELS: Record<string, string> = {
  provider: 'Platform',
  channelId: 'Store connection',
  action: 'Business action',
  status: 'Status',
  executedAt: 'Execution time',
  humanApproved: 'Human approval',
  productId: 'Product ID',
  offerId: 'Offer ID',
  externalProductId: 'PlatformProduct ID',
  externalTaskId: 'Platform任务编号',
  reason: 'Reason',
  errorCode: 'Error code',
  failureCode: 'Failure code',
  source: 'Source',
  operation: 'Operation type',
  approved: 'Approved',
  price: 'Price',
  stock: 'Stock',
  notes: 'Business notes',
  reviewedAt: 'Review time',
  createdAt: 'Created time',
  updatedAt: 'Updated time',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REWORK: 'Needs rework',
  CANCELLED: 'Cancelled',
  UNKNOWN: 'Result pending verification',
};

export function auditStatusLabel(status: string): string {
  return STATUS_LABELS[status.toUpperCase()] ?? 'Status pending verification';
}

const SENSITIVE_FIELD = /(password|secret|token|api.?key|authorization|credential|cipher|signature)/i;

export function auditActionLabel(action: string): string {
  const value = action.toLowerCase();
  const exactLabels: Record<string, string> = {
    review_approved: 'Human approved',
    review_rejected: 'Human rejected',
    review_rework: 'Rework requested',
    'agent-eval.aggregate': 'Agent quality evaluation aggregated',
    'product-research.evidence-review-created': 'Insufficient evidence; sent to human review',
    'product-research.review-created': 'Product research review created',
    'product-research.create': 'Product research generated',
    'ozon.pricing.calculated': 'Ozon pricing calculated',
    'agent-proxy.ozon.pricing.calculate': 'Agent invoked Ozon pricing',
    'agent-proxy.unauthorized': 'Agent call blocked by permissions',
    'agent-autonomy.mode-enabled': 'Agent autonomy mode enabled',
    'agent-autonomy.mode-disabled': 'Agent autonomy mode disabled',
  };
  if (exactLabels[value]) return exactLabels[value];
  if (value.includes('approved')) return 'Human approved';
  if (value.includes('rejected')) return 'Human rejected';
  if (value.includes('rework')) return 'Rework requested';
  if (value.includes('completed')) return 'Execution completed';
  if (value.includes('failed')) return 'Failed';
  if (value.includes('started')) return 'Execution started';
  if (value.includes('created') || value.includes('create')) return 'Created';
  if (value.includes('updated') || value.includes('update')) return 'Updated';
  if (value.includes('deleted') || value.includes('delete')) return 'Deleted';
  return 'Business record';
}

export function auditResourceLabel(resourceType: string): string {
  return (
    {
      AgentRun: 'Agent task',
      AGENT_RUN: 'Agent task',
      AutomationRun: 'Automation run',
      AUTOMATION_RUN: 'Automation run',
      ExternalSubmission: 'Ozon external submission',
      EXTERNAL_SUBMISSION: 'Ozon external submission',
      ProductLaunch: 'Product launch flow',
      ListingPublishSnapshot: 'Immutable publish snapshot',
      OzonCustomerTarget: 'Ozon customer service',
      Product: 'Product',
      ReviewTask: 'Review task',
      REVIEW_TASK: 'Review task',
      ActionProposal: 'Action proposal',
      ProductResearch: 'Product research',
      ProfitCalculation: 'Pricing record',
      AgentProxy: 'Agent tool call',
      FeatureFlag: 'Feature flag',
      AgentEvalSnapshot: 'Agent quality evaluation',
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
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('zh-CN').format(value);
  if (typeof value === 'string') {
    if (key === 'status') return auditStatusLabel(value);
    if (/At$/.test(key) && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toLocaleString('zh-CN', { hour12: false });
    }
    if (value.length >= 5 && /^[?，,。.;；:：!！\s]+$/.test(value)) {
      return 'Historical text is unreadable; raw data is corrupted';
    }
    return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === 'object') {
    return `${Object.keys(value as Record<string, unknown>).length} fields`;
  }
  return 'Not recorded';
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.trim() || 'Business field';
}
