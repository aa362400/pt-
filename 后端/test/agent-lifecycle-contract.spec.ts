import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentLifecycleEvent,
  AgentLifecycleStatus,
  resolveAgentTransition,
  TERMINAL_AGENT_LIFECYCLE_STATUSES,
} from '../src/features/agent-runs/agent-state-machine.js';

interface LifecycleContract {
  schemaVersion: string;
  statuses: string[];
  terminalStatuses: string[];
  events: string[];
  transitions: [string, string, string][];
}

const contractPath = join(
  __dirname,
  '..',
  '..',
  'contracts',
  'agent-lifecycle-v2.json',
);

function loadContract(): LifecycleContract {
  return JSON.parse(readFileSync(contractPath, 'utf8')) as LifecycleContract;
}

describe('Agent lifecycle cross-language contract', () => {
  const contract = loadContract();

  it('matches the TypeScript status and event enums exactly', () => {
    expect(new Set(contract.statuses)).toEqual(
      new Set(Object.values(AgentLifecycleStatus)),
    );
    expect(new Set(contract.events)).toEqual(
      new Set(Object.values(AgentLifecycleEvent)),
    );
    expect(new Set(contract.terminalStatuses)).toEqual(
      TERMINAL_AGENT_LIFECYCLE_STATUSES,
    );
  });

  it.each(loadContract().transitions)(
    'resolves %s + %s to %s',
    (from, event, to) => {
      expect(
        resolveAgentTransition(
          from as AgentLifecycleStatus,
          event as AgentLifecycleEvent,
        ),
      ).toBe(to);
    },
  );

  it('rejects every undeclared non-terminal transition', () => {
    const declared = new Set(
      contract.transitions.map(([from, event]) => `${from}:${event}`),
    );

    for (const status of contract.statuses) {
      for (const event of contract.events) {
        if (declared.has(`${status}:${event}`)) continue;
        expect(() =>
          resolveAgentTransition(
            status as AgentLifecycleStatus,
            event as AgentLifecycleEvent,
          ),
        ).toThrow();
      }
    }
  });
});
