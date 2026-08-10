export type ApprovalExecutionStatus =
  | 'executed'
  | 'approved_pending_external_adapter'
  | 'external_execution_failed';

export interface ApprovalExecutionResponse {
  status: ApprovalExecutionStatus;
  result: unknown;
  actionProposal: {
    id: string;
    payloadHash: string;
    approvalDecisionId: string;
    status: 'APPROVED' | 'EXECUTED' | 'FAILED';
  };
  notification?: unknown;
  unreadCount?: number;
}

export function describeApprovalExecution(
  response: ApprovalExecutionResponse,
): { tone: 'success' | 'error'; message: string } {
  if (response.actionProposal.status === 'FAILED') {
    return {
      tone: 'error',
      message: 'approvalenglish_text，english_textfailed。english_textfailedenglish_text。',
    };
  }
  if (response.actionProposal.status === 'EXECUTED') {
    return { tone: 'success', message: 'english_textcompleted。' };
  }
  return {
    tone: 'success',
    message: 'approvalenglish_text，english_text Ozon textpublishtext。',
  };
}

export async function stepUpAndRetryApprovalOnce<T>(input: {
  stepUp: () => Promise<unknown>;
  retryApproval: () => Promise<T>;
}): Promise<T> {
  await input.stepUp();
  return input.retryApproval();
}
