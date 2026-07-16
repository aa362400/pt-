import { AgentRunConsistencyService } from '../src/features/agent-runs/agent-run-consistency.service.js';

describe('AgentRunConsistencyService', () => {
  it('reports lifecycle/legacy mismatches instead of hiding them', async () => {
    const tx = {
      agentRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-good',
            status: 'RUNNING',
            lifecycleStatus: 'WAITING_TOOL',
            attempt: 1,
            updatedAt: new Date(),
          },
          {
            id: 'run-bad',
            status: 'COMPLETED',
            lifecycleStatus: 'FAILED',
            attempt: 1,
            updatedAt: new Date(),
          },
        ]),
      },
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        getState: jest.fn().mockResolvedValue('active'),
      }),
    };
    const service = new AgentRunConsistencyService(
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof tx) => unknown,
          ) => operation(tx),
        ),
      } as any,
      queue as any,
    );

    const result = await service.inspect({
      sub: 'user-1',
      orgId: 'org-1',
    } as any);

    expect(result.state).toEqual(
      expect.objectContaining({
        sampleSize: 2,
        matching: 1,
        mismatchCount: 1,
        ratio: 0.5,
        passed: false,
      }),
    );
    expect(result.state.mismatches[0]).toEqual(
      expect.objectContaining({
        id: 'run-bad',
        expectedLegacyStatus: 'FAILED',
      }),
    );
    expect(result.queue).toEqual(
      expect.objectContaining({ sampleSize: 1, found: 1 }),
    );
  });
});
