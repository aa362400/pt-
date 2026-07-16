import { Injectable } from '@nestjs/common';

export type DeadLetterClassificationValue =
  | 'UNCLASSIFIED'
  | 'RETRYABLE'
  | 'PERMANENT'
  | 'DATA_MISSING'
  | 'PROVIDER_FAILURE';

export interface DeadLetterTriageInput {
  queueName: string;
  data: unknown;
  failedReason?: string | null;
  targetExists?: boolean;
  targetStatus?: string | null;
}

export interface DeadLetterTriageDecision {
  classification: DeadLetterClassificationValue;
  classificationReason: string;
  replayEligible: boolean;
}

const SUPPORTED_QUEUES = new Set(['agent-runs', 'automation-runs']);
const REPLAYABLE_TARGET_STATUSES = new Set([
  'FAILED',
  'CANCELLED',
  'DEAD_LETTERED',
  'TIMEOUT',
]);

export function classifyDeadLetter(
  input: DeadLetterTriageInput,
): DeadLetterTriageDecision {
  const data = asRecord(input.data);
  const normalizedReason = (input.failedReason ?? '').toLowerCase();

  if (!SUPPORTED_QUEUES.has(input.queueName)) {
    return decision('PERMANENT', '队列未接入受控恢复服务，禁止重放');
  }

  const targetId =
    input.queueName === 'agent-runs'
      ? optionalString(data.agentRunId)
      : optionalString(data.automationRunId);
  if (!targetId) {
    return decision('DATA_MISSING', '死信载荷缺少源任务 ID，无法恢复');
  }
  if (input.targetExists === false) {
    return decision('DATA_MISSING', '源任务已不存在，只能保留审计记录');
  }
  if (
    input.targetStatus &&
    !REPLAYABLE_TARGET_STATUSES.has(input.targetStatus)
  ) {
    return decision(
      'PERMANENT',
      `源任务状态为 ${input.targetStatus}，不允许创建恢复任务`,
    );
  }

  if (
    includesAny(normalizedReason, [
      'imagebase64',
      'imageurl',
      'missing required input',
      'missing input',
      '缺少输入',
      '需要图片',
    ])
  ) {
    return decision('DATA_MISSING', '任务缺少必需的商品图片或输入数据');
  }

  if (
    includesAny(normalizedReason, [
      '仅支持已接入证据链的 ozon',
      '400 client error',
      'bad request',
      'invalid argument',
      'validation error',
      'row-level security',
      '42501',
      'unsupported',
      'not replayable',
    ])
  ) {
    return decision('PERMANENT', '原始请求或系统策略不允许原样重试');
  }

  if (
    includesAny(normalizedReason, [
      'model_provider_',
      'image_provider_',
      'provider unavailable',
      'service unavailable',
      'quota',
      '额度',
      '供应商',
      '403',
      '503',
    ])
  ) {
    return decision(
      'PROVIDER_FAILURE',
      '模型或图片供应商不可用，恢复前必须先验证额度和健康状态',
    );
  }

  if (
    includesAny(normalizedReason, [
      'fetch failed',
      'winerror 5',
      'econnreset',
      'etimedout',
      'network error',
      'temporary failure',
      'connection reset',
    ])
  ) {
    return decision('RETRYABLE', '瞬时网络或本地文件锁错误，可受控重试', true);
  }

  return decision('UNCLASSIFIED', '无法从现有证据确定根因，需要人工分类');
}

@Injectable()
export class DeadLetterTriageService {
  classify(input: DeadLetterTriageInput): DeadLetterTriageDecision {
    return classifyDeadLetter(input);
  }
}

function decision(
  classification: DeadLetterClassificationValue,
  classificationReason: string,
  replayEligible = false,
): DeadLetterTriageDecision {
  return { classification, classificationReason, replayEligible };
}

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
