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
      message: '审批已记录，但外部操作执行失败。请查看失败原因后再处理。',
    };
  }
  if (response.actionProposal.status === 'EXECUTED') {
    return { tone: 'success', message: '外部操作已确认执行完成。' };
  }
  return {
    tone: 'success',
    message: '审批已记录，正在等待 Ozon 外部发布结果。',
  };
}

export async function stepUpAndRetryApprovalOnce<T>(input: {
  stepUp: () => Promise<unknown>;
  retryApproval: () => Promise<T>;
}): Promise<T> {
  await input.stepUp();
  return input.retryApproval();
}
