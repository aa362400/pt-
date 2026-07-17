export interface RetryableReviewTask {
  id: string;
  entityType: string;
  agentRun?: {
    id: string;
    lifecycleStatus?: string | null;
  } | null;
}

export function reviewAgentRetryRequest(
  task: RetryableReviewTask,
): { runId: string; requestId: string } | null {
  if (
    task.entityType !== 'AGENT_RUN' ||
    !task.agentRun ||
    !['FAILED', 'CANCELLED'].includes(task.agentRun.lifecycleStatus ?? '')
  ) {
    return null;
  }
  return {
    runId: task.agentRun.id,
    requestId: `approval-${task.id}-${task.agentRun.id}`.slice(0, 128),
  };
}
