export enum AgentLifecycleStatus {
  CREATED = 'CREATED',
  PLANNING = 'PLANNING',
  WAITING_TOOL = 'WAITING_TOOL',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  EXECUTING = 'EXECUTING',
  VERIFYING = 'VERIFYING',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum AgentLifecycleEvent {
  RUN_CREATED = 'RUN_CREATED',
  PLAN_STARTED = 'PLAN_STARTED',
  TOOL_CALL_REQUESTED = 'TOOL_CALL_REQUESTED',
  TOOL_RESULT_RECEIVED = 'TOOL_RESULT_RECEIVED',
  ACTION_PROPOSED = 'ACTION_PROPOSED',
  APPROVAL_GRANTED = 'APPROVAL_GRANTED',
  APPROVAL_REJECTED = 'APPROVAL_REJECTED',
  EXECUTION_FINISHED = 'EXECUTION_FINISHED',
  VERIFICATION_PASSED = 'VERIFICATION_PASSED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  RETRYABLE_ERROR = 'RETRYABLE_ERROR',
  RETRY_DISPATCHED = 'RETRY_DISPATCHED',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  NON_RETRYABLE_ERROR = 'NON_RETRYABLE_ERROR',
  FATAL_ERROR = 'FATAL_ERROR',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
}

export const TERMINAL_AGENT_LIFECYCLE_STATUSES = new Set<AgentLifecycleStatus>([
  AgentLifecycleStatus.COMPLETED,
  AgentLifecycleStatus.FAILED,
  AgentLifecycleStatus.CANCELLED,
]);

const TRANSITIONS: Readonly<
  Partial<
    Record<
      AgentLifecycleStatus,
      Partial<Record<AgentLifecycleEvent, AgentLifecycleStatus>>
    >
  >
> = {
  [AgentLifecycleStatus.CREATED]: {
    [AgentLifecycleEvent.PLAN_STARTED]: AgentLifecycleStatus.PLANNING,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
  },
  [AgentLifecycleStatus.PLANNING]: {
    [AgentLifecycleEvent.TOOL_CALL_REQUESTED]:
      AgentLifecycleStatus.WAITING_TOOL,
    [AgentLifecycleEvent.ACTION_PROPOSED]:
      AgentLifecycleStatus.WAITING_APPROVAL,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.NON_RETRYABLE_ERROR]: AgentLifecycleStatus.FAILED,
  },
  [AgentLifecycleStatus.WAITING_TOOL]: {
    [AgentLifecycleEvent.TOOL_RESULT_RECEIVED]: AgentLifecycleStatus.EXECUTING,
    [AgentLifecycleEvent.RETRYABLE_ERROR]: AgentLifecycleStatus.RETRY_SCHEDULED,
    [AgentLifecycleEvent.TOOL_TIMEOUT]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.NON_RETRYABLE_ERROR]: AgentLifecycleStatus.FAILED,
  },
  [AgentLifecycleStatus.WAITING_APPROVAL]: {
    [AgentLifecycleEvent.APPROVAL_GRANTED]: AgentLifecycleStatus.EXECUTING,
    [AgentLifecycleEvent.APPROVAL_REJECTED]: AgentLifecycleStatus.CANCELLED,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.NON_RETRYABLE_ERROR]: AgentLifecycleStatus.FAILED,
  },
  [AgentLifecycleStatus.EXECUTING]: {
    [AgentLifecycleEvent.EXECUTION_FINISHED]: AgentLifecycleStatus.VERIFYING,
    [AgentLifecycleEvent.RETRYABLE_ERROR]: AgentLifecycleStatus.RETRY_SCHEDULED,
    [AgentLifecycleEvent.NON_RETRYABLE_ERROR]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
  },
  [AgentLifecycleStatus.VERIFYING]: {
    [AgentLifecycleEvent.ACTION_PROPOSED]:
      AgentLifecycleStatus.WAITING_APPROVAL,
    [AgentLifecycleEvent.VERIFICATION_PASSED]: AgentLifecycleStatus.COMPLETED,
    [AgentLifecycleEvent.VERIFICATION_FAILED]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.NON_RETRYABLE_ERROR]: AgentLifecycleStatus.FAILED,
  },
  [AgentLifecycleStatus.RETRY_SCHEDULED]: {
    [AgentLifecycleEvent.RETRY_DISPATCHED]: AgentLifecycleStatus.EXECUTING,
    [AgentLifecycleEvent.FATAL_ERROR]: AgentLifecycleStatus.FAILED,
    [AgentLifecycleEvent.NON_RETRYABLE_ERROR]: AgentLifecycleStatus.FAILED,
  },
};

for (const status of [
  AgentLifecycleStatus.CREATED,
  AgentLifecycleStatus.PLANNING,
  AgentLifecycleStatus.WAITING_TOOL,
  AgentLifecycleStatus.WAITING_APPROVAL,
  AgentLifecycleStatus.EXECUTING,
  AgentLifecycleStatus.VERIFYING,
  AgentLifecycleStatus.RETRY_SCHEDULED,
]) {
  TRANSITIONS[status]![AgentLifecycleEvent.CANCELLED_BY_USER] =
    AgentLifecycleStatus.CANCELLED;
}

export function resolveAgentTransition(
  from: AgentLifecycleStatus,
  event: AgentLifecycleEvent,
): AgentLifecycleStatus {
  if (TERMINAL_AGENT_LIFECYCLE_STATUSES.has(from)) {
    throw new Error(`Agent lifecycle status ${from} is terminal`);
  }

  const to = TRANSITIONS[from]?.[event];
  if (!to) {
    throw new Error(`Illegal Agent lifecycle transition: ${from} + ${event}`);
  }
  return to;
}
