import { ReviewService } from '../src/features/review/review.service.js';

function createService() {
  const reviewTask = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: 'IMAGE_GENERATION',
    entityId: 'image-1',
    status: 'PENDING',
    notes: null,
    score: 42,
    threshold: 60,
  };
  const updatedReviewTask = {
    ...reviewTask,
    status: 'REJECTED',
    notes: 'White background rejected because the shadow is too heavy.',
    reviewedAt: new Date('2026-07-08T10:00:00.000Z'),
  };
  const prisma = {
    agentRun: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'run-1',
        organizationId: 'org-1',
        status: 'COMPLETED',
        errorCode: null,
      }),
    },
    reviewTask: {
      create: jest.fn().mockResolvedValue({
        ...reviewTask,
        autoApproved: false,
        autoRegenerations: 0,
      }),
      findFirst: jest.fn().mockResolvedValue(reviewTask),
      update: jest.fn().mockResolvedValue(updatedReviewTask),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const agentMemory = {
    learnFromReview: jest.fn().mockResolvedValue({}),
    updateReviewOutcome: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const audit = {
    appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const service = new (ReviewService as any)(
    prisma as any,
    queue as any,
    agentMemory as any,
    undefined,
    undefined,
    undefined,
    {
      run: jest.fn(
        (_organizationId: string, operation: (tx: unknown) => unknown) =>
          operation(prisma),
      ),
    },
    audit,
  ) as ReviewService;

  return { service, prisma, queue, agentMemory };
}

describe('ReviewService review learning', () => {
  it('does not let a generic approval bypass the explicit product launch confirmation', async () => {
    const { service, prisma } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-product-research-1',
      organizationId: 'org-1',
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'report-1',
      status: 'PENDING',
      notes: null,
      score: null,
      threshold: 60,
    });

    await expect(
      service.update(
        { sub: 'user-1', orgId: 'org-1' } as any,
        'review-product-research-1',
        { status: 'APPROVED' },
      ),
    ).rejects.toThrow('explicit product launch confirmation');
    expect(prisma.reviewTask.update).not.toHaveBeenCalled();
  });

  it('does not allow a failed agent run to be presented as approved', async () => {
    const { service, prisma } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-failed-research-1',
      organizationId: 'org-1',
      entityType: 'AGENT_RUN',
      entityId: 'failed-research-run-1',
      status: 'PENDING',
      notes: 'Ozon evidence is insufficient.',
      score: null,
      threshold: 60,
    });
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'failed-research-run-1',
      organizationId: 'org-1',
      status: 'FAILED',
      errorCode: 'RESEARCH_EVIDENCE_UNVERIFIABLE',
    });

    await expect(
      service.update(
        { sub: 'user-1', orgId: 'org-1' } as any,
        'review-failed-research-1',
        { status: 'APPROVED' },
      ),
    ).rejects.toThrow('失败或未完成的智能体任务不能标记为通过');
    expect(prisma.reviewTask.update).not.toHaveBeenCalled();
  });

  it('turns rejected human review notes into an org-scoped experience card', async () => {
    const { service, agentMemory } = createService();

    await service.update({ sub: 'user-1', orgId: 'org-1' } as any, 'review-1', {
      status: 'REJECTED',
      notes: 'White background rejected because the shadow is too heavy.',
    });

    expect(agentMemory.learnFromReview).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceReviewTaskId: 'review-1',
      taskType: 'IMAGE_CREATIVE',
      entityType: 'IMAGE_GENERATION',
      score: 42,
      notes: 'White background rejected because the shadow is too heavy.',
    });
  });

  it('turns low-score review tasks into experience cards even before human review', async () => {
    const { service, agentMemory } = createService();

    await service.createFromAgentRun('org-1', {
      entityType: 'IMAGE_GENERATION',
      entityId: 'image-1',
      score: 29,
      threshold: 60,
    });

    expect(agentMemory.learnFromReview).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceReviewTaskId: 'review-1:low-score',
      taskType: 'IMAGE_CREATIVE',
      entityType: 'IMAGE_GENERATION',
      score: 29,
      notes: 'Low consistency score 29 below threshold 60.',
    });
  });

  it('keeps high-scoring product research pending for an explicit human launch confirmation', async () => {
    const { service, prisma, queue } = createService();

    await service.createFromAgentRun('org-1', {
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'report-1',
      score: 100,
      threshold: 60,
    });

    expect(prisma.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'PRODUCT_RESEARCH',
        status: 'PENDING',
        autoApproved: false,
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({
        organizationId: 'org-1',
        type: 'APPROVAL_REQUIRED',
      }),
    );
  });

  it('writes human review outcomes back to matching work memory records', async () => {
    const { service, prisma, agentMemory } = createService();
    const reviewTask = {
      id: 'review-2',
      organizationId: 'org-1',
      entityType: 'AGENT_RUN',
      entityId: 'run-1',
      status: 'PENDING',
      notes: null,
      score: 55,
      threshold: 60,
    };
    prisma.reviewTask.findFirst.mockResolvedValue(reviewTask);
    prisma.reviewTask.update.mockResolvedValue({
      ...reviewTask,
      status: 'REWORK',
      notes: 'Listing title needs the real material.',
      reviewedAt: new Date('2026-07-08T10:00:00.000Z'),
    });

    await service.update({ sub: 'user-1', orgId: 'org-1' } as any, 'review-2', {
      status: 'REWORK',
      notes: 'Listing title needs the real material.',
    });

    expect(agentMemory.updateReviewOutcome).toHaveBeenCalledWith({
      organizationId: 'org-1',
      agentRunId: 'run-1',
      reviewStatus: 'REWORK',
      reviewNotes: 'Listing title needs the real material.',
    });
  });
});
