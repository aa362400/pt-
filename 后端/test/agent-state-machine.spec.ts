import {
  AgentLifecycleEvent,
  AgentLifecycleStatus,
  resolveAgentTransition,
} from '../src/features/agent-runs/agent-state-machine.js';

describe('Agent lifecycle state machine contract', () => {
  it.each([
    [
      AgentLifecycleStatus.CREATED,
      AgentLifecycleEvent.PLAN_STARTED,
      AgentLifecycleStatus.PLANNING,
    ],
    [
      AgentLifecycleStatus.PLANNING,
      AgentLifecycleEvent.TOOL_CALL_REQUESTED,
      AgentLifecycleStatus.WAITING_TOOL,
    ],
    [
      AgentLifecycleStatus.PLANNING,
      AgentLifecycleEvent.ACTION_PROPOSED,
      AgentLifecycleStatus.WAITING_APPROVAL,
    ],
    [
      AgentLifecycleStatus.WAITING_TOOL,
      AgentLifecycleEvent.TOOL_RESULT_RECEIVED,
      AgentLifecycleStatus.EXECUTING,
    ],
    [
      AgentLifecycleStatus.WAITING_APPROVAL,
      AgentLifecycleEvent.APPROVAL_GRANTED,
      AgentLifecycleStatus.EXECUTING,
    ],
    [
      AgentLifecycleStatus.EXECUTING,
      AgentLifecycleEvent.EXECUTION_FINISHED,
      AgentLifecycleStatus.VERIFYING,
    ],
    [
      AgentLifecycleStatus.VERIFYING,
      AgentLifecycleEvent.VERIFICATION_PASSED,
      AgentLifecycleStatus.COMPLETED,
    ],
    [
      AgentLifecycleStatus.EXECUTING,
      AgentLifecycleEvent.RETRYABLE_ERROR,
      AgentLifecycleStatus.RETRY_SCHEDULED,
    ],
    [
      AgentLifecycleStatus.RETRY_SCHEDULED,
      AgentLifecycleEvent.RETRY_DISPATCHED,
      AgentLifecycleStatus.EXECUTING,
    ],
  ])('%s + %s -> %s', (from, event, expected) => {
    expect(resolveAgentTransition(from, event)).toBe(expected);
  });

  it.each([
    AgentLifecycleStatus.CREATED,
    AgentLifecycleStatus.PLANNING,
    AgentLifecycleStatus.WAITING_TOOL,
    AgentLifecycleStatus.WAITING_APPROVAL,
    AgentLifecycleStatus.EXECUTING,
    AgentLifecycleStatus.VERIFYING,
    AgentLifecycleStatus.RETRY_SCHEDULED,
  ])('allows cancellation from non-terminal status %s', (from) => {
    expect(
      resolveAgentTransition(from, AgentLifecycleEvent.CANCELLED_BY_USER),
    ).toBe(AgentLifecycleStatus.CANCELLED);
  });

  it.each([
    AgentLifecycleStatus.COMPLETED,
    AgentLifecycleStatus.FAILED,
    AgentLifecycleStatus.CANCELLED,
  ])('rejects every transition from terminal status %s', (from) => {
    expect(() =>
      resolveAgentTransition(from, AgentLifecycleEvent.PLAN_STARTED),
    ).toThrow('terminal');
  });

  it('rejects out-of-order events', () => {
    expect(() =>
      resolveAgentTransition(
        AgentLifecycleStatus.CREATED,
        AgentLifecycleEvent.VERIFICATION_PASSED,
      ),
    ).toThrow('Illegal Agent lifecycle transition');
  });
});
