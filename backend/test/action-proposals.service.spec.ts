import { BadRequestException } from '@nestjs/common';
import { ActionProposalsService } from '../src/features/notifications/action-proposals.service.js';

function createService() {
  let activeProposal: Record<string, unknown> | null = null;
  let lastNotification: Record<string, unknown> | null = null;
  const prisma = {
    notification: {
      create: jest.fn().mockImplementation(({ data }) => {
        lastNotification = {
          id: data.id,
          readAt: null,
          createdAt: new Date('2026-07-14T00:00:00.000Z'),
          ...data,
        };
        return Promise.resolve(lastNotification);
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...lastNotification, ...data }),
        ),
    },
    approvalDecision: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'decision-1', ...data }),
        ),
      findFirst: jest.fn().mockResolvedValue({
        id: 'decision-1',
        organizationId: 'org-1',
        actionProposalId: 'proposal-1',
        decision: 'APPROVE',
        payloadHash: 'a'.repeat(64),
      }),
    },
    feedbackSignal: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'feedback-1', ...data }),
        ),
    },
    agentRun: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    actionProposal: {
      create: jest.fn().mockImplementation(({ data }) => {
        activeProposal = {
          status: 'PENDING',
          result: null,
          error: null,
          claimedAt: null,
          decidedAt: null,
          executedAt: null,
          createdAt: new Date('2026-07-14T00:00:00.000Z'),
          updatedAt: new Date('2026-07-14T00:00:00.000Z'),
          notification: lastNotification,
          ...data,
        };
        return Promise.resolve(activeProposal);
      }),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.activeDedupeSlot === 'ACTIVE' ? activeProposal : null,
          ),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'proposal-1', ...data }),
        ),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
        operation(prisma),
    ),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    appendStrict: jest.fn().mockResolvedValue(undefined),
  };
  const events = {
    publishCreated: jest.fn(),
    publishUpdated: jest.fn(),
  };

  return {
    service: new ActionProposalsService(
      tenantDatabase as never,
      audit as never,
      events as never,
    ),
    prisma,
    audit,
    events,
  };
}

describe('ActionProposalsService', () => {
  it('deduplicates the same active business action with a stable key', async () => {
    const { service, prisma, events } = createService();
    const input = {
      organizationId: 'org-1',
      requestedBy: 'user-1',
      approverId: 'user-1',
      source: 'product_management_change_order',
      title: 'Confirm price update',
      action: {
        name: 'ozon.price.update',
        params: { productId: 'product-1', price: 1299.5 },
      },
      context: { kind: 'high_risk_action_review' },
    };

    const first = await service.create(input);
    const second = await service.create(input);

    expect(second.proposal.id).toBe(first.proposal.id);
    expect(prisma.actionProposal.create).toHaveBeenCalledTimes(1);
    expect(events.publishCreated).toHaveBeenCalledTimes(1);
    expect(prisma.actionProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        activeDedupeSlot: 'ACTIVE',
        version: 1,
      }),
    });
  });

  it('moves stale executing proposals to UNKNOWN for reconciliation without retrying', async () => {
    const { service, prisma } = createService();
    prisma.actionProposal.updateMany.mockResolvedValueOnce({ count: 2 });

    const result = await service.recoverStaleExecutions({
      organizationId: 'org-1',
      staleBefore: new Date('2026-07-14T00:00:00.000Z'),
      now: new Date('2026-07-14T00:10:00.000Z'),
    });

    expect(result).toEqual({ recovered: 2, status: 'UNKNOWN' });
    expect(prisma.actionProposal.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        status: 'EXECUTING',
        claimedAt: { lt: new Date('2026-07-14T00:00:00.000Z') },
      },
      data: expect.objectContaining({
        status: 'UNKNOWN',
        activeDedupeSlot: 'ACTIVE',
      }),
    });
  });

  it('stores executable parameters only in the immutable proposal record', async () => {
    const { service, prisma, events } = createService();

    const result = await service.create({
      organizationId: 'org-1',
      requestedBy: 'user-1',
      approverId: 'user-1',
      source: 'product_management_change_order',
      title: 'english_text Ozon text',
      body: 'english_texthumantext。',
      action: {
        label: 'text',
        name: 'ozon.price.update',
        params: { productId: 'product-1', price: 1299.5 },
      },
      context: {
        kind: 'high_risk_action_review',
        provider: 'OZON',
        preview: { currentPrice: 1199.5, requestedPrice: 1299.5 },
      },
    });

    expect(prisma.actionProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ozon.price.update',
        params: { productId: 'product-1', price: 1299.5 },
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: 'PENDING',
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          actionProposalId: result.proposal.id,
          action: {
            label: 'text',
            name: 'ozon.price.update',
          },
        }),
      }),
    });
    const notificationInput = prisma.notification.create.mock.calls[0][0].data
      .metadata as Record<string, unknown>;
    expect(JSON.stringify(notificationInput)).not.toContain('product-1');
    expect(JSON.stringify(notificationInput)).not.toContain('1299.5');
    expect(events.publishCreated).toHaveBeenCalledWith(result.notification);
  });

  it('rejects an altered proposal before claiming execution', async () => {
    const { service, prisma } = createService();
    prisma.actionProposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      organizationId: 'org-1',
      notificationId: 'notification-1',
      requestedBy: 'user-1',
      approverId: 'user-1',
      source: 'agent_proxy',
      action: 'ozon.price.update',
      params: { productId: 'tampered', price: 1 },
      context: { provider: 'OZON' },
      payloadHash: '0'.repeat(64),
      status: 'PENDING',
      expiresAt: new Date('2026-07-15T00:00:00.000Z'),
    });

    await expect(
      service.claimExecution({
        organizationId: 'org-1',
        approverId: 'user-1',
        notificationId: 'notification-1',
        now: new Date('2026-07-14T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.actionProposal.updateMany).not.toHaveBeenCalled();
  });

  it('allows only one pending proposal claim', async () => {
    const { service, prisma } = createService();
    const proposal = {
      id: 'proposal-1',
      organizationId: 'org-1',
      notificationId: 'notification-1',
      requestedBy: 'user-1',
      approverId: 'user-1',
      source: 'agent_proxy',
      action: 'ozon.price.update',
      params: { productId: 'product-1', price: 1299.5 },
      context: { provider: 'OZON' },
      status: 'PENDING',
      expiresAt: new Date('2026-07-15T00:00:00.000Z'),
    };
    prisma.actionProposal.findFirst.mockResolvedValue({
      ...proposal,
      payloadHash: service.computePayloadHash(proposal),
    });
    prisma.actionProposal.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.claimExecution({
        organizationId: 'org-1',
        approverId: 'user-1',
        notificationId: 'notification-1',
        now: new Date('2026-07-14T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('re-reads and verifies the terminal state after execution', async () => {
    const { service, prisma } = createService();
    prisma.actionProposal.findFirst.mockResolvedValueOnce({
      id: 'proposal-1',
      organizationId: 'org-1',
      status: 'EXECUTED',
    });

    const result = await service.completeExecution({
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      status: 'EXECUTED',
      result: { externalId: 'ozon-1' },
      now: new Date('2026-07-14T00:10:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({ id: 'proposal-1', status: 'EXECUTED' }),
    );
    expect(prisma.actionProposal.findFirst).toHaveBeenCalledWith({
      where: { id: 'proposal-1', organizationId: 'org-1' },
    });
  });

  it('marks an approved publish proposal executed only after Ozon is active', async () => {
    const { service, prisma, audit } = createService();
    prisma.actionProposal.findFirst.mockResolvedValueOnce({
      id: 'proposal-1',
      organizationId: 'org-1',
      action: 'product-launch.confirm-publish',
      status: 'APPROVED',
    });

    const result = await service.reconcileApprovedProductLaunchOutcome({
      organizationId: 'org-1',
      productLaunchId: 'launch-1',
      status: 'EXECUTED',
      result: { status: 'ACTIVE_ON_OZON', externalProductId: 'ozon-1' },
      now: new Date('2026-07-16T08:15:00.000Z'),
    });

    expect(result).toEqual({ updated: true, proposalId: 'proposal-1' });
    expect(prisma.actionProposal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'proposal-1',
        organizationId: 'org-1',
        status: 'APPROVED',
      },
      data: expect.objectContaining({
        status: 'EXECUTED',
        executedAt: new Date('2026-07-16T08:15:00.000Z'),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'action-proposal.external-result-reconciled',
        resourceId: 'proposal-1',
      }),
    );
  });

  it('fails closed when the terminal state cannot be verified', async () => {
    const { service, prisma } = createService();
    prisma.actionProposal.findFirst.mockResolvedValueOnce({
      id: 'proposal-1',
      organizationId: 'org-1',
      status: 'UNKNOWN',
    });

    await expect(
      service.failExecution({
        organizationId: 'org-1',
        proposalId: 'proposal-1',
        error: new Error('timeout'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restricts non-admin approval queues to proposals assigned to the actor', async () => {
    const { service, prisma } = createService();
    prisma.actionProposal.findFirst.mockResolvedValue(null);
    prisma.actionProposal.findMany = jest.fn().mockResolvedValue([]);

    await service.list({
      organizationId: 'org-1',
      actorId: 'reviewer-1',
      actorRole: 'MEMBER',
      status: 'PENDING',
      skip: 0,
      take: 20,
    });

    expect(prisma.actionProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          approverId: 'reviewer-1',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('records a rejection as an immutable decision bound to the proposal hash', async () => {
    const { service, prisma } = createService();
    const proposal = {
      id: 'proposal-1',
      organizationId: 'org-1',
      notificationId: 'notification-1',
      requestedBy: 'requester-1',
      approverId: 'reviewer-1',
      source: 'product-launch-worker',
      action: 'ozon.listing.publish',
      params: { productLaunchId: 'launch-1' },
      context: { riskLevel: 'high' },
      status: 'PENDING',
      expiresAt: new Date('2026-07-15T00:00:00.000Z'),
      notification: { id: 'notification-1', metadata: {}, readAt: null },
    };
    prisma.actionProposal.findFirst.mockResolvedValue({
      ...proposal,
      payloadHash: service.computePayloadHash(proposal),
    });

    await service.recordReviewDecision({
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      actorId: 'reviewer-1',
      actorRole: 'ADMIN',
      decision: 'REJECT',
      reason: 'productimageenglish_textevidenceenglish_text，english_text。',
    });

    expect(prisma.actionProposal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'proposal-1',
        organizationId: 'org-1',
        status: 'PENDING',
      },
      data: expect.objectContaining({
        status: 'REJECTED',
        activeDedupeSlot: null,
      }),
    });
    expect(prisma.approvalDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionProposalId: 'proposal-1',
        decision: 'REJECT',
        actorId: 'reviewer-1',
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it('allows an organization admin to claim an assigned proposal and records approval intent first', async () => {
    const { service, prisma } = createService();
    const proposal = {
      id: 'proposal-1',
      organizationId: 'org-1',
      notificationId: 'notification-1',
      requestedBy: 'requester-1',
      approverId: 'other-reviewer',
      source: 'product-launch-worker',
      action: 'ozon.listing.publish',
      params: { productId: 'product-1' },
      context: { riskLevel: 'high' },
      status: 'PENDING',
      expiresAt: new Date('2026-07-15T00:00:00.000Z'),
      notification: { id: 'notification-1', metadata: {}, readAt: null },
    };
    prisma.actionProposal.findFirst.mockResolvedValue({
      ...proposal,
      payloadHash: service.computePayloadHash(proposal),
    });

    const result = await service.claimExecutionById({
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
      now: new Date('2026-07-14T01:00:00.000Z'),
    });

    expect(prisma.approvalDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionProposalId: 'proposal-1',
        decision: 'APPROVE',
        actorId: 'admin-1',
        actorRole: 'ADMIN',
      }),
    });
    expect(prisma.actionProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionGrantHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          executionGrantScope: 'action:ozon.listing.publish',
          executionGrantDecisionId: expect.any(String),
          executionGrantExpiresAt: expect.any(Date),
          executionGrantConsumedAt: null,
        }),
      }),
    );
    expect(result.executionGrant).toEqual(
      expect.objectContaining({
        token: expect.stringMatching(/^apt_[A-Za-z0-9_-]+$/),
        capabilityScope: 'action:ozon.listing.publish',
        action: 'ozon.listing.publish',
        proposalId: 'proposal-1',
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        idempotencyKey: expect.stringContaining('approval:proposal-1:'),
      }),
    );
  });

  it('consumes an approval execution grant once and rejects replay', async () => {
    const { service, prisma } = createService();
    prisma.approvalDecision.findFirst.mockResolvedValue({
      id: 'decision-1',
      organizationId: 'org-1',
      actionProposalId: 'proposal-1',
      decision: 'APPROVE',
      payloadHash: 'a'.repeat(64),
    });
    prisma.actionProposal.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const input = {
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      approvalDecisionId: 'decision-1',
      action: 'ozon.price.update',
      payloadHash: 'a'.repeat(64),
      token: `apt_${'x'.repeat(43)}`,
      capabilityScope: 'action:ozon.price.update',
      now: new Date('2026-07-14T01:01:00.000Z'),
    };

    const first = await (service as any).consumeExecutionGrant(input);

    expect(first).toEqual(
      expect.objectContaining({
        proposalId: 'proposal-1',
        approvalDecisionId: 'decision-1',
        action: 'ozon.price.update',
        capabilityScope: 'action:ozon.price.update',
        idempotencyKey: expect.stringContaining('approval:proposal-1:'),
      }),
    );
    await expect(
      (service as any).consumeExecutionGrant(input),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.actionProposal.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'proposal-1',
          organizationId: 'org-1',
          status: 'EXECUTING',
          executionGrantConsumedAt: null,
        }),
        data: { executionGrantConsumedAt: input.now },
      }),
    );
  });

  it('keeps a sandbox-blocked proposal active for correction instead of marking it failed', async () => {
    const { service, prisma } = createService();
    prisma.actionProposal.findFirst.mockResolvedValueOnce({
      id: 'proposal-1',
      organizationId: 'org-1',
      status: 'CHANGES_REQUESTED',
    });

    const error = new BadRequestException({
      code: 'LISTING_SANDBOX_BLOCKED',
      message: 'Listing sandbox blocked this publish snapshot.',
      reportId: 'sandbox-report-1',
    });
    await service.failExecution({
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      error,
      now: new Date('2026-07-14T02:00:00.000Z'),
    });

    expect(prisma.actionProposal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'proposal-1',
        organizationId: 'org-1',
        status: 'EXECUTING',
      },
      data: expect.objectContaining({
        status: 'CHANGES_REQUESTED',
        activeDedupeSlot: 'ACTIVE',
        error: 'Listing sandbox blocked this publish snapshot.',
        result: expect.objectContaining({
          code: 'LISTING_SANDBOX_BLOCKED',
          reportId: 'sandbox-report-1',
        }),
      }),
    });
  });

  it('records an override decision when an admin resumes a sandbox-blocked proposal', async () => {
    const { service, prisma } = createService();
    const proposal = {
      id: 'proposal-1',
      organizationId: 'org-1',
      notificationId: 'notification-1',
      requestedBy: 'worker-1',
      approverId: 'reviewer-1',
      source: 'product-launch-worker',
      action: 'product-launch.confirm-publish',
      params: { productLaunchId: 'launch-1' },
      context: { riskLevel: 'high' },
      status: 'CHANGES_REQUESTED',
      expiresAt: new Date('2026-07-15T00:00:00.000Z'),
      notification: { id: 'notification-1', metadata: {}, readAt: null },
    };
    prisma.actionProposal.findFirst.mockResolvedValue({
      ...proposal,
      payloadHash: service.computePayloadHash(proposal),
    });

    await service.claimExecutionById({
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
      reason: 'english_textprofit、imageenglish_text，english_text。',
      sandboxReportId: 'sandbox-report-1',
      now: new Date('2026-07-14T03:00:00.000Z'),
    });

    expect(prisma.actionProposal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'proposal-1',
        organizationId: 'org-1',
        status: 'CHANGES_REQUESTED',
      },
      data: expect.objectContaining({ status: 'EXECUTING' }),
    });
    expect(prisma.approvalDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionProposalId: 'proposal-1',
        decision: 'OVERRIDE',
        actorId: 'admin-1',
        sandboxReportId: 'sandbox-report-1',
      }),
    });
  });
});
