export type AutomationCardStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'error'
  | 'archived'
  | 'unknown';

interface AutomationFlowTextInput {
  source?: string | null;
  name?: string | null;
  description?: string | null;
}

export interface AutomationExecutionConfiguration {
  triggerType?: string | null;
  triggerConfig?: Record<string, unknown> | null;
  steps?: Array<Record<string, unknown>> | null;
  workspaceId?: string | null;
}

interface AutomationRunConfiguration extends AutomationExecutionConfiguration {
  backendStatus?: string | null;
  latestRunStatus?: string | null;
  latestRunId?: string | null;
}

const backendStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '已启用',
  PAUSED: '已暂停',
  ERROR: '执行失败',
  ARCHIVED: '已归档',
};

const triggerLabels: Record<string, string> = {
  MANUAL: '手动运行',
  SCHEDULE: '自动排期',
  WEBHOOK: '外部通知触发',
  CONDITION: '条件触发',
  EVENT: '业务事件触发',
};

const actionLabels: Record<string, string> = {
  'product.research': '真实选品调研',
  product_research: '真实选品调研',
  'product.research.daily': '每日选品调研',
  'listing.draft': '创建本地刊登草稿',
  'listing.generate': '生成刊登草稿',
  listing_generation: '生成刊登草稿',
  generate_listing: '生成刊登草稿',
  'profit.analyze': '利润分析',
  'profit.calculate': '利润核算',
  profit_calculation: '利润核算',
  'task.create': '创建本地任务',
  create_task: '创建本地任务',
  'image.prompt': '生成图片方案',
  image_prompt: '生成图片方案',
  'image.generate': '生成商品图片',
  image_generation: '生成商品图片',
  generate_images: '生成商品图片',
  'listing.publish': '等待人工确认发布',
};

const runStatusLabels: Record<string, string> = {
  PENDING: '等待执行',
  RUNNING: '执行中',
  COMPLETED: '已完成',
  PARTIAL: '部分完成',
  FAILED: '执行失败',
};

const runSourceLabels: Record<string, string> = {
  manual: '人工发起',
  schedule: '定时计划',
  automation_console: '自动化中心恢复',
  notification_center: '通知中心恢复',
  dead_letter_triage: '失败任务恢复',
  legacy: '历史记录',
};

const providerLabels: Record<string, string> = {
  OZON: 'Ozon',
  AMAZON: 'Amazon',
  ETSY: 'Etsy',
  SHOPIFY: 'Shopify',
  TIKTOK: 'TikTok Shop',
  TIKTOK_SHOP: 'TikTok Shop',
  TEMU: 'Temu',
  EBAY: 'eBay',
  WILDBERRIES: 'Wildberries',
  '1688': '1688',
};

const supportedExecutionActions = new Set([
  'product.research',
  'product_research',
  'product.research.daily',
  'listing.draft',
  'listing.generate',
  'listing_generation',
  'generate_listing',
  'profit.analyze',
  'profit.calculate',
  'profit_calculation',
  'task.create',
  'create_task',
  'image.prompt',
  'image_prompt',
]);

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function knownSystemTemplate(
  source: string | null,
  name: string,
  description: string,
): { name: string; description: string } | null {
  if (
    source === 'agent_suggestion' &&
    (name === '[Agent scheduled] Roadmap acceptance launch package' ||
      name === '[智能体排程] Roadmap acceptance launch package') &&
    description === 'Acceptance evidence for proactive suggestion and scheduling.'
  ) {
    return {
      name: '[智能体排程] 上架准备验收流程',
      description: '用于验证智能体主动建议与自动排程的验收证据。',
    };
  }

  const englishOperatorTemplate = name.match(
    /^\[Operator\] Prepare (\d+) products? for launch$/,
  );
  const chineseOperatorTemplate = name.match(
    /^\[操作员\] 准备 (\d+) 个商品上架$/,
  );
  const operatorProductCount =
    englishOperatorTemplate?.[1] ?? chineseOperatorTemplate?.[1];
  if (source === 'operator' && operatorProductCount) {
    return {
      name: `[操作员] 准备 ${operatorProductCount} 个商品上架`,
      description:
        description ===
        'Roadmap acceptance: prepare research, listing, images, margin, review, and keep publish pending confirmation.'
          ? '路线图验收流程：依次准备选品调研、刊登草稿、商品图片、利润核算和人工审核；发布继续等待人工确认。'
          : description,
    };
  }

  return null;
}

export function automationFlowText({
  source,
  name,
  description,
}: AutomationFlowTextInput): { name: string; description: string } {
  const safeName = nonEmptyString(name) ?? '流程名称未提供';
  const safeDescription = nonEmptyString(description) ?? '流程说明未提供';
  return (
    knownSystemTemplate(nonEmptyString(source), safeName, safeDescription) ?? {
      name: safeName,
      description: safeDescription,
    }
  );
}

export function automationBackendStatusLabel(status?: string | null): string {
  if (!nonEmptyString(status)) return '状态未提供';
  return backendStatusLabels[status!] ?? '状态未知';
}

export function automationTriggerLabel(trigger?: string | null): string {
  if (!nonEmptyString(trigger)) return '触发方式未提供';
  return triggerLabels[trigger!] ?? '未知触发方式';
}

export function automationActionLabel(action?: string | null): string {
  if (!nonEmptyString(action)) return '步骤未提供';
  return actionLabels[action!] ?? '未知步骤';
}

export function automationRunStatusLabel(status?: string | null): string {
  if (!nonEmptyString(status)) return '运行状态未提供';
  return runStatusLabels[status!] ?? '运行状态未知';
}

export function automationRunSourceLabel(source?: string | null): string {
  if (!nonEmptyString(source)) return '来源未提供';
  return runSourceLabels[source!] ?? '未知来源';
}

export function automationProviderLabel(provider?: string | null): string {
  const safeProvider = nonEmptyString(provider);
  if (!safeProvider) return '数据来源未提供';
  return providerLabels[safeProvider.toUpperCase()] ?? '未知数据来源';
}

export function automationCardStatus(
  backendStatus?: string | null,
  latestRunStatus?: string | null,
): AutomationCardStatus {
  if (latestRunStatus === 'FAILED') return 'error';
  if (backendStatus === 'DRAFT') return 'draft';
  if (backendStatus === 'ACTIVE') return 'active';
  if (backendStatus === 'PAUSED') return 'paused';
  if (backendStatus === 'ERROR') return 'error';
  if (backendStatus === 'ARCHIVED') return 'archived';
  return 'unknown';
}

export function automationExecutionBlockReason({
  triggerType,
  steps,
  workspaceId,
}: AutomationExecutionConfiguration): string | null {
  if (triggerType !== 'MANUAL' && triggerType !== 'SCHEDULE') {
    return '当前页面尚未配置这种触发方式。';
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return '该流程没有执行步骤。';
  }

  const unsupportedStep = steps.find((step) => {
    const action = nonEmptyString(step.action);
    return !action || !supportedExecutionActions.has(action);
  });
  if (unsupportedStep) {
    return `步骤“${automationActionLabel(nonEmptyString(unsupportedStep.action))}”尚未接入当前页面可验证的执行器。`;
  }

  for (const step of steps) {
    const action = nonEmptyString(step.action);
    const boundWorkspace = nonEmptyString(step.workspaceId) ?? nonEmptyString(workspaceId);
    if (
      action &&
      ['listing.draft', 'listing.generate', 'listing_generation', 'generate_listing'].includes(
        action,
      ) &&
      !boundWorkspace
    ) {
      return '刊登草稿步骤必须绑定一个工作区。';
    }
    if (
      action &&
      ['image.prompt', 'image_prompt'].includes(action) &&
      !nonEmptyString(step.productId) &&
      !nonEmptyString(step.productName)
    ) {
      return '图片方案步骤必须填写商品名称或绑定商品。';
    }
    if (
      action &&
      ['profit.analyze', 'profit.calculate', 'profit_calculation'].includes(action)
    ) {
      const hasProduct = Boolean(nonEmptyString(step.productId));
      const salePrice = Number(step.salePrice ?? step.price);
      const productCost = Number(step.productCost ?? step.cost);
      if (
        !hasProduct &&
        (!Number.isFinite(salePrice) ||
          salePrice <= 0 ||
          !Number.isFinite(productCost) ||
          productCost < 0)
      ) {
        return '利润核算步骤必须填写大于 0 的售价和不小于 0 的成本。';
      }
    }
  }

  return null;
}

export function automationEnableBlockReason(
  input: AutomationExecutionConfiguration,
): string | null {
  const executionIssue = automationExecutionBlockReason(input);
  if (executionIssue) return executionIssue;
  if (input.triggerType !== 'SCHEDULE') return null;

  const config = input.triggerConfig ?? {};
  if (nonEmptyString(config.retiredAt)) {
    return '该历史流程已停用，不能重新启用。';
  }

  const dailyAt = nonEmptyString(config.dailyAt);
  if (dailyAt) {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailyAt)
      ? null
      : '自动排期流程的每日运行时间格式无效。';
  }

  const intervalMinutesValue = config.intervalMinutes ?? config.everyMinutes;
  if (intervalMinutesValue !== undefined && intervalMinutesValue !== null) {
    const intervalMinutes = Number(intervalMinutesValue);
    return Number.isFinite(intervalMinutes) && intervalMinutes >= 5
      ? null
      : '自动排期流程的执行间隔不能少于 5 分钟。';
  }

  if (config.intervalMs !== undefined && config.intervalMs !== null) {
    const intervalMs = Number(config.intervalMs);
    return Number.isFinite(intervalMs) && intervalMs >= 300_000
      ? null
      : '自动排期流程的执行间隔不能少于 5 分钟。';
  }

  const dueAt = nonEmptyString(config.dueAt);
  if (dueAt) {
    return Number.isNaN(new Date(dueAt).getTime())
      ? '自动排期流程的运行时间格式无效。'
      : null;
  }

  return '自动排期流程未提供有效的运行时间或执行间隔。';
}

export function automationRunBlockReason(
  input: AutomationRunConfiguration,
): string | null {
  const configurationIssue = automationExecutionBlockReason(input);
  if (configurationIssue) return configurationIssue;

  if (input.backendStatus === 'ARCHIVED') return '已归档流程不能直接运行。';
  if (!backendStatusLabels[input.backendStatus ?? '']) return '流程状态未知，不能运行。';
  if (input.latestRunStatus === 'FAILED' || input.backendStatus === 'ERROR') {
    return nonEmptyString(input.latestRunId)
      ? null
      : '后端未提供可恢复的失败运行编号。';
  }
  if (input.backendStatus !== 'ACTIVE') return '流程未启用，请先启用。';
  return null;
}
