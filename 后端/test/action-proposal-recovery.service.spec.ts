import { ActionProposalRecoveryService } from '../src/features/notifications/action-proposal-recovery.service.js';

describe('ActionProposalRecoveryService', () => {
  it('scans every organization and applies the configured stale cutoff', async () => {
    const prisma = {
      organization: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
      },
    };
    const proposals = {
      recoverStaleExecutions: jest.fn().mockResolvedValue({
        recovered: 0,
        status: 'UNKNOWN',
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ACTION_PROPOSAL_STALE_AFTER_MS' ? 120_000 : undefined,
      ),
    };
    const service = new ActionProposalRecoveryService(
      prisma as never,
      proposals as never,
      config as never,
    );
    const now = new Date('2026-07-14T00:10:00.000Z');

    await service.scan(now);

    expect(proposals.recoverStaleExecutions).toHaveBeenCalledTimes(2);
    expect(proposals.recoverStaleExecutions).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      staleBefore: new Date('2026-07-14T00:08:00.000Z'),
      now,
    });
  });
});
