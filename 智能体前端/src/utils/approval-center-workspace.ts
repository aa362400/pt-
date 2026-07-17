export type ApprovalWorkQueue =
  | 'actionable'
  | 'needs_attention'
  | 'processed';

export interface CustomerApprovalNarrative {
  displayText: string;
  technicalText: string | null;
  source: 'original-chinese' | 'translated' | 'fallback';
}

const DEFAULT_FOREIGN_NARRATIVE_FALLBACK =
  '历史审核说明不是中文，原文已收起；请结合任务状态与证据人工核对。';

const HISTORICAL_AUTOMOTIVE_FAN_EXPLANATION =
  'Ozon evidence shows five portable-fan listings, but none is explicitly identified as an automotive fan, so category relevance is uncertain. The listings include stroller, neck-worn, bladeless, illuminated, and humidifying models. Price mentions span 434–600 RUB, but both come from search snippets or review/comparison text and may not represent current selling prices. No reliable rating or demand data was supplied.';

const REVIEWED_NARRATIVE_TRANSLATIONS = new Map<string, string>([
  [
    HISTORICAL_AUTOMOTIVE_FAN_EXPLANATION,
    'Ozon 证据显示了 5 个便携风扇商品，但没有任何商品被明确识别为汽车风扇，因此类目相关性仍不确定。结果包括婴儿车风扇、挂脖风扇、无叶风扇、带灯风扇和加湿风扇。可见价格为 434–600 卢布，但两项价格都来自搜索摘要或评测、对比文本，可能不是当前在售价。现有证据未提供可靠的评分或需求数据。',
  ],
]);

function normalizedNarrative(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const replacementCount = (text.match(/[?�]/g) || []).length;
  if (replacementCount >= 3 && replacementCount / text.length >= 0.2) {
    return null;
  }
  return text;
}

/**
 * Keeps the customer-facing approval surface Chinese while retaining an
 * unreviewed historical explanation for the collapsed technical-details area.
 * Reviewed translations are intentionally exact-match only: silently machine-
 * translating a changed risk explanation could alter its business meaning.
 */
export function customerApprovalNarrative(
  values: readonly unknown[],
  fallback = DEFAULT_FOREIGN_NARRATIVE_FALLBACK,
): CustomerApprovalNarrative {
  let firstForeignText: string | null = null;

  for (const value of values) {
    const text = normalizedNarrative(value);
    if (!text) continue;

    const translated = REVIEWED_NARRATIVE_TRANSLATIONS.get(text);
    if (translated) {
      return {
        displayText: translated,
        technicalText: text,
        source: 'translated',
      };
    }

    if (/[\u3400-\u9fff]/.test(text)) {
      return {
        displayText: text,
        technicalText: firstForeignText,
        source: 'original-chinese',
      };
    }

    firstForeignText ??= text;
  }

  return {
    displayText: fallback,
    technicalText: firstForeignText,
    source: 'fallback',
  };
}

interface ReviewQueueInput {
  status: string;
  entityType: string;
  agentRunStatus: string | null;
}

const OPEN_REVIEW_STATUSES = new Set(['PENDING', 'REWORK']);
const OPEN_PROPOSAL_STATUSES = new Set([
  'PENDING',
  'CHANGES_REQUESTED',
]);
const ATTENTION_PROPOSAL_STATUSES = new Set(['FAILED', 'EXPIRED']);
const KNOWN_PROPOSAL_STATUSES = new Set([
  ...OPEN_PROPOSAL_STATUSES,
  ...ATTENTION_PROPOSAL_STATUSES,
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'EXECUTED',
  'CANCELLED',
]);

export function reviewTaskWorkQueue(
  task: ReviewQueueInput,
): ApprovalWorkQueue {
  if (!OPEN_REVIEW_STATUSES.has(task.status)) return 'processed';
  if (
    task.entityType === 'AGENT_RUN' &&
    task.agentRunStatus !== 'COMPLETED'
  ) {
    return 'needs_attention';
  }
  return 'actionable';
}

export function approvalProposalWorkQueue(status: string): ApprovalWorkQueue {
  if (OPEN_PROPOSAL_STATUSES.has(status)) return 'actionable';
  if (
    ATTENTION_PROPOSAL_STATUSES.has(status) ||
    !KNOWN_PROPOSAL_STATUSES.has(status)
  ) {
    return 'needs_attention';
  }
  return 'processed';
}
