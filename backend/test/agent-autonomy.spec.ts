import { AgentAutonomyService } from '../src/features/agent-autonomy/agent-autonomy.service.js';

function createService() {
  const prisma = {
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'product-1',
        title: 'Travel Mug',
        workspaceId: 'workspace-1',
        workspace: { marketplace: 'OZON', channelType: 'OZON' },
      }),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    },
    teamTask: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'task-1', ...data }),
        ),
    },
    notification: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'notification-1', ...data }),
        ),
    },
    automationFlow: {
      findUnique: jest.fn(),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'flow-1', ...data }),
        ),
    },
    agentRun: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'run-1', ...data }),
        ),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notificationEvents = {
    publishCreated: jest.fn(),
  };
  const agentRuns = {
    create: jest.fn().mockResolvedValue({ id: 'run-1', status: 'PENDING' }),
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };
  const actionProposals = {
    create: jest.fn().mockImplementation(async (input) => {
      const notification = {
        id: 'notification-1',
        organizationId: input.organizationId,
        userId: input.approverId,
        type: input.type,
        title: input.title,
        body: input.body,
      };
      notificationEvents.publishCreated(notification);
      return {
        notification,
        proposal: { id: 'proposal-1', payloadHash: 'a'.repeat(64) },
      };
    }),
  };

  return {
    service: new AgentAutonomyService(
      prisma as any,
      audit as any,
      tenantDatabase as any,
      actionProposals as any,
      undefined,
      notificationEvents as any,
      agentRuns as any,
    ),
    prisma,
    audit,
    notificationEvents,
    agentRuns,
    tenantDatabase,
    actionProposals,
  };
}

describe('AgentAutonomyService', () => {
  it('preserves a globally enabled autonomy flag when enabling L2 for one organization', async () => {
    const { service, prisma, agentRuns } = createService();
    prisma.featureFlag.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.name === 'agent-autonomy'
          ? { name: where.name, enabled: true, orgIds: [] }
          : null,
      ),
    );

    await service.setAutoDraftMode('org-1', 'user-1', true);

    expect(prisma.featureFlag.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'agent-autonomy-auto-draft' },
        create: expect.objectContaining({ orgIds: ['org-1'] }),
      }),
    );
  });

  it('creates only research and listing-draft steps when L2 mode is enabled', async () => {
    const { service, prisma } = createService();
    prisma.featureFlag.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.name === 'agent-paused-org-1'
          ? null
          : { name: where.name, enabled: true, orgIds: ['org-1'] },
      ),
    );

    const result = await service.handlePlatformEvent({
      type: 'product.created',
      orgId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Product',
      resourceId: 'product-1',
      data: { title: 'Travel Mug', workspaceId: 'workspace-1' },
      timestamp: '2026-07-12T10:00:00.000Z',
    });

    expect(result.autoDraft).toEqual(
      expect.objectContaining({ status: 'queued', flowId: 'flow-1' }),
    );
    const created = prisma.automationFlow.create.mock.calls[0][0].data;
    expect(created.steps).toEqual([
      expect.objectContaining({ key: 'research', action: 'product.research' }),
      expect.objectContaining({
        key: 'listing-draft',
        action: 'listing.draft',
        dependsOn: ['research'],
        requiresHumanApproval: true,
      }),
    ]);
    expect(JSON.stringify(created.steps)).not.toMatch(
      /publish|price|stock|ads|order|payment|image\.generate/,
    );
  });

  it('blocks L2 flow creation while the organization kill switch is enabled', async () => {
    const { service, prisma } = createService();
    prisma.featureFlag.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({ name: where.name, enabled: true, orgIds: ['org-1'] }),
    );

    const result = await service.handlePlatformEvent({
      type: 'product.created',
      orgId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Product',
      resourceId: 'product-1',
      data: { title: 'Travel Mug', workspaceId: 'workspace-1' },
      timestamp: '2026-07-12T11:00:00.000Z',
    });

    expect(result.autoDraft?.status).toBe('blocked_by_kill_switch');
    expect(prisma.automationFlow.create).not.toHaveBeenCalled();
  });

  it('records a product-created event as an awareness task and proactive suggestion card', async () => {
    const { service, prisma, audit, notificationEvents, actionProposals } =
      createService();

    const result = await service.handlePlatformEvent({
      type: 'product.created',
      orgId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Product',
      resourceId: 'product-1',
      data: { title: 'Travel Mug', workspaceId: 'workspace-1' },
      timestamp: '2026-07-08T00:00:00.000Z',
    });

    expect(result.awarenessTaskId).toBe('task-1');
    expect(result.suggestionNotificationId).toBe('notification-1');
    expect(prisma.teamTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        priority: 'HIGH',
        title: expect.stringContaining('english_text'),
      }),
    });
    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        requestedBy: 'user-1',
        approverId: 'user-1',
        type: 'SYSTEM',
        context: expect.objectContaining({
          kind: 'agent_suggestion',
          sourceEventType: 'product.created',
        }),
        action: expect.objectContaining({
          label: 'text',
          name: 'operator.prepare_listing_batch',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent-autonomy.suggestion-created',
        actorId: 'user-1',
      }),
    );
    expect(notificationEvents.publishCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notification-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('records a product-updated event as a review task and proactive suggestion card', async () => {
    const { service, prisma, notificationEvents, actionProposals } =
      createService();

    const result = await service.handleProductUpdatedEvent({
      type: 'product.updated',
      orgId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Product',
      resourceId: 'product-1',
      data: { title: 'Travel Mug', workspaceId: 'workspace-1' },
      timestamp: '2026-07-09T00:00:00.000Z',
    });

    expect(result.awarenessTaskId).toBe('task-1');
    expect(result.suggestionNotificationId).toBe('notification-1');
    expect(prisma.teamTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: expect.stringContaining('english_text'),
        description: expect.stringContaining('text Listing'),
      }),
    });
    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('text Travel Mug textlistingtext'),
        body: expect.stringContaining('textstorewritetexthumantext'),
        context: expect.objectContaining({
          sourceEventType: 'product.updated',
        }),
        action: expect.objectContaining({
          name: 'operator.prepare_listing_batch',
        }),
      }),
    );
    expect(notificationEvents.publishCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notification-1',
        type: 'SYSTEM',
      }),
    );
  });

  it('turns an accepted suggestion into today work-board task plus scheduled flow', async () => {
    const { service, prisma } = createService();

    const result = await service.scheduleSuggestion({
      orgId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      suggestion: {
        title: 'Prepare Travel Mug listing',
        description: 'Generate listing, images, margin check, and review task.',
        priority: 'high',
        score: 88,
        action: {
          action: 'operator.prepare_listing_batch',
          params: { productIds: ['product-1'] },
        },
      },
      dueAt: '2026-07-08T08:30:00.000Z',
    });

    expect(result.taskId).toBe('task-1');
    expect(result.flowId).toBe('flow-1');
    expect(prisma.teamTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: expect.stringContaining('Prepare Travel Mug listing'),
        dueAt: new Date('2026-07-08T08:30:00.000Z'),
      }),
    });
    expect(prisma.automationFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        triggerType: 'SCHEDULE',
        status: 'ACTIVE',
        steps: expect.arrayContaining([
          expect.objectContaining({
            action: 'listing.publish',
            requiresConfirmation: true,
            status: 'pending_confirmation',
          }),
        ]),
      }),
    });
  });

  it('prepares a 20-product operator batch while leaving publish pending confirmation', async () => {
    const { service, prisma, audit, notificationEvents, agentRuns } =
      createService();
    const productIds = Array.from(
      { length: 20 },
      (_, index) => `product-${index + 1}`,
    );

    const result = await service.prepareListingBatch({
      orgId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      productIds,
      instruction: 'english_text 20 english_textallcompletedlistingtext',
    });

    expect(result.productCount).toBe(20);
    expect(result.agentRunId).toBe('run-1');
    expect(result.publish.status).toBe('pending_confirmation');
    expect(agentRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', orgId: 'org-1' }),
      expect.objectContaining({
        workspaceId: 'workspace-1',
        agentType: 'PLANNER',
        input: expect.objectContaining({
          productIds,
          steps: expect.arrayContaining([
            expect.objectContaining({ action: 'product.research' }),
            expect.objectContaining({ action: 'listing.draft' }),
            expect.objectContaining({ action: 'image.generate' }),
            expect.objectContaining({ action: 'profit.analyze' }),
            expect.objectContaining({ action: 'task.create' }),
            expect.objectContaining({
              action: 'listing.publish',
              requiresConfirmation: true,
            }),
          ]),
        }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'APPROVAL_REQUIRED',
        metadata: expect.objectContaining({
          publish: expect.objectContaining({ status: 'pending_confirmation' }),
        }),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent-autonomy.operator-batch-prepared',
        resourceType: 'AgentRun',
        actorId: 'user-1',
      }),
    );
    expect(notificationEvents.publishCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notification-1',
        organizationId: 'org-1',
        userId: 'user-1',
        type: 'APPROVAL_REQUIRED',
      }),
    );
  });
});
