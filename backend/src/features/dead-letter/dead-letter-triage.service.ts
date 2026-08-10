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
    return decision('PERMANENT', 'queueenglish_text，english_text');
  }

  const targetId =
    input.queueName === 'agent-runs'
      ? optionalString(data.agentRunId)
      : optionalString(data.automationRunId);
  if (!targetId) {
    return decision('DATA_MISSING', 'english_texttask ID，noneenglish_text');
  }
  if (input.targetExists === false) {
    return decision('DATA_MISSING', 'texttaskenglish_text，english_textaudit record');
  }
  if (
    input.targetStatus &&
    !REPLAYABLE_TARGET_STATUSES.has(input.targetStatus)
  ) {
    return decision(
      'PERMANENT',
      `texttaskstatustext ${input.targetStatus}，english_texttask`,
    );
  }

  if (
    includesAny(normalizedReason, [
      'imagebase64',
      'imageurl',
      'missing required input',
      'missing input',
      'textinput',
      'textimage',
    ])
  ) {
    return decision('DATA_MISSING', 'taskenglish_textproductimagetextinputdata');
  }

  if (
    includesAny(normalizedReason, [
      'english_textevidencetext ozon',
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
    return decision('PERMANENT', 'textrequestenglish_text');
  }

  if (
    includesAny(normalizedReason, [
      'model_provider_',
      'image_provider_',
      'provider unavailable',
      'service unavailable',
      'quota',
      'text',
      'english_text',
      '403',
      '503',
    ])
  ) {
    return decision(
      'PROVIDER_FAILURE',
      'english_textimageenglish_text，english_textstatus',
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
    return decision('RETRYABLE', 'english_textlocalfiletexterror，english_text', true);
  }

  return decision('UNCLASSIFIED', 'noneenglish_textyesevidenceenglish_text，texthumantext');
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
