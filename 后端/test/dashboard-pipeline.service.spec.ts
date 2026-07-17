import { DashboardService } from '../src/features/dashboard/dashboard.service.js';

describe('DashboardService.getPipeline', () => {
  it('aggregates org-scoped real records and summarizes action required', async () => {
    const productResearchRun = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'research-1',
          workspaceId: null,
          status: 'PARTIAL',
          currentStage: null,
          errorSummary: { code: 'EVIDENCE_INSUFFICIENT' },
          updatedAt: new Date('2026-07-17T01:00:00Z'),
          _count: { candidates: 4 },
        },
      ]),
    };
    const reviewTask = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'review-1',
          entityType: 'PRODUCT_RESEARCH',
          entityId: 'research-report-1',
          status: 'PENDING',
          notes: null,
          createdAt: new Date('2026-07-17T02:00:00Z'),
        },
      ]),
    };
    const productLaunch = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'launch-1',
          reviewTaskId: 'review-launch-1',
          status: 'ACTIVE_ON_OZON',
          failureCode: null,
          failureMessage: null,
          selectedPublishSnapshotId: 'snapshot-1',
          createdAt: new Date('2026-07-17T03:00:00Z'),
          updatedAt: new Date('2026-07-17T04:00:00Z'),
          researchCandidate: { canonicalName: '便携理线收纳袋' },
        },
      ]),
    };
    const tx = { productResearchRun, reviewTask, productLaunch };
    const tenantDatabase = {
      run: jest.fn(async (organizationId: string, operation: (client: typeof tx) => unknown) => {
        expect(organizationId).toBe('org-1');
        return operation(tx);
      }),
    };
    const service = new DashboardService({} as never, tenantDatabase as never);

    const result = await service.getPipeline({ sub: 'user-1', orgId: 'org-1' } as never);

    expect(productResearchRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
    expect(reviewTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
    expect(productLaunch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'research-1', stage: 'EVIDENCE_REVIEW', errorCode: 'EVIDENCE_INSUFFICIENT' }),
        expect.objectContaining({ id: 'review-1', stage: 'APPROVAL', blockedOn: '等待人工审批' }),
        expect.objectContaining({ id: 'launch-1', title: '便携理线收纳袋', stage: 'MONITORING' }),
      ]),
    );
    expect(result.summary).toMatchObject({
      total: 3,
      needsAttention: 2,
      blocked: 2,
      byStage: { EVIDENCE_REVIEW: 1, APPROVAL: 1, MONITORING: 1 },
    });
  });
});
