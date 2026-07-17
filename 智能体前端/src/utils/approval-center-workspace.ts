export type ApprovalWorkQueue =
  | 'actionable'
  | 'needs_attention'
  | 'processed';

interface ReviewQueueInput {
  status: string;
  entityType: string;
  agentRunStatus: string | null;
}

const OPEN_REVIEW_STATUSES = new Set(['PENDING', 'REWORK']);
const OPEN_PROPOSAL_STATUSES = new Set([
  'PENDING',
  'CHANGES_REQUESTED',
  'UNKNOWN',
]);
const ATTENTION_PROPOSAL_STATUSES = new Set(['FAILED', 'EXPIRED']);

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
  if (ATTENTION_PROPOSAL_STATUSES.has(status)) return 'needs_attention';
  return 'processed';
}
