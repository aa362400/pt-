import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../src/features/notifications/notifications.service.js';
import { OzonApprovedActionRouterService } from '../src/features/notifications/ozon-approved-action-router.service.js';

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
  amr: ['pwd', 'otp'],
  mfaAt: Math.floor(Date.now() / 1000),
};

function createService(notificationOverride: Record<string, unknown> = {}) {
  const baseNotification = {
    id: 'notification-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: 'SYSTEM',
    title: 'agenttext：text Travel Mug textlistingtext',
    body: 'textgenerationproduct researchtext、Listing text、image、profitenglish_textreviewtask。',
    readAt: null,
    metadata: {
      kind: 'agent_suggestion',
      action: {
        label: 'text',
        action: 'operator.prepare_listing_batch',
        params: { productIds: ['product-1'], workspaceId: 'workspace-1' },
      },
    },
    createdAt: new Date('2026-07-08T00:00:00.000Z'),
    ...notificationOverride,
  };
  const metadata = baseNotification.metadata as Record<string, unknown>;
  const metadataAction = (metadata.action ?? {}) as Record<string, unknown>;
  const { action: _presentationAction, ...proposalContext } = metadata;
  const actionProposal = {
    id: 'proposal-1',
    organizationId: 'org-1',
    notificationId: 'notification-1',
    requestedBy: 'system',
    approverId: 'user-1',
    source: String(metadata.source ?? 'test'),
    action: String(metadataAction.action ?? 'operator.prepare_listing_batch'),
    params: (metadataAction.params ?? {
      productIds: ['product-1'],
      workspaceId: 'workspace-1',
    }) as Record<string, unknown>,
    context: proposalContext,
    payloadHash: 'a'.repeat(64),
    status: 'PENDING',
    result: null,
    error: null,
    expiresAt: new Date('2099-07-08T00:00:00.000Z'),
    claimedAt: null,
    decidedAt: null,
    executedAt: null,
    createdAt: new Date('2026-07-08T00:00:00.000Z'),
    updatedAt: new Date('2026-07-08T00:00:00.000Z'),
  };
  const actionProposals = {
    findForNotification: jest.fn().mockResolvedValue(actionProposal),
    findById: jest.fn().mockResolvedValue({
      ...actionProposal,
      notification: baseNotification,
      decisions: [],
    }),
    claimExecution: jest.fn().mockResolvedValue({
      ...actionProposal,
      status: 'EXECUTING',
      approvalDecision: { id: 'decision-1' },
      executionGrant: {
        token: `apt_${'x'.repeat(43)}`,
        proposalId: 'proposal-1',
        approvalDecisionId: 'decision-1',
        action: actionProposal.action,
        capabilityScope: `action:${actionProposal.action}`,
        payloadHash: actionProposal.payloadHash,
        expiresAt: new Date('2099-07-08T00:00:00.000Z'),
        idempotencyKey: `approval:proposal-1:${actionProposal.payloadHash}`,
      },
    }),
    claimExecutionById: jest.fn().mockResolvedValue({
      ...actionProposal,
      status: 'EXECUTING',
      notification: baseNotification,
      approvalDecision: { id: 'decision-1' },
      executionGrant: {
        token: `apt_${'x'.repeat(43)}`,
        proposalId: 'proposal-1',
        approvalDecisionId: 'decision-1',
        action: actionProposal.action,
        capabilityScope: `action:${actionProposal.action}`,
        payloadHash: actionProposal.payloadHash,
        expiresAt: new Date('2099-07-08T00:00:00.000Z'),
        idempotencyKey: `approval:proposal-1:${actionProposal.payloadHash}`,
      },
    }),
    consumeExecutionGrant: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        proposalId: input.proposalId,
        approvalDecisionId: input.approvalDecisionId,
        action: input.action,
        capabilityScope: input.capabilityScope,
        payloadHash: input.payloadHash,
        idempotencyKey: `approval:${input.proposalId}:${input.payloadHash}`,
        consumedAt: input.now,
      }),
    ),
    dismiss: jest.fn().mockResolvedValue({
      ...actionProposal,
      status: 'DISMISSED',
    }),
    completeExecution: jest.fn().mockResolvedValue(undefined),
    failExecution: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    notification: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.userId && where.userId !== baseNotification.userId
              ? null
              : baseNotification,
          ),
        ),
      findMany: jest.fn().mockResolvedValue([baseNotification]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...baseNotification,
          ...data,
        }),
      ),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue(baseNotification),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'review-notification-1',
          readAt: null,
          createdAt: new Date('2026-07-08T00:01:00.000Z'),
          ...data,
        }),
      ),
    },
    agentRun: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'run-1',
          ...data,
        }),
      ),
    },
    automationFlow: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'flow-1',
          ...data,
        }),
      ),
    },
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const events = {
    publishCreated: jest.fn(),
    publishUpdated: jest.fn(),
    publishDeleted: jest.fn(),
    publishRead: jest.fn(),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const linkfoxSkillCli = {
    install: jest.fn().mockResolvedValue({
      command: 'linkfoxskill install ecommerce-product-picker --agents codex',
      stdout: 'installed',
      stderr: '',
      cliPath:
        'C:\\Users\\1\\AppData\\Roaming\\npm\\node_modules\\linkfoxskill\\src\\index.js',
    }),
    update: jest.fn().mockResolvedValue({
      command: 'linkfoxskill update ecommerce-product-picker',
      stdout: 'updated',
      stderr: '',
      cliPath:
        'C:\\Users\\1\\AppData\\Roaming\\npm\\node_modules\\linkfoxskill\\src\\index.js',
    }),
  };
  const ozonExternalWrite = {
    executeApprovedPriceUpdate: jest.fn().mockResolvedValue({
      status: 'executed',
      action: 'ozon.price.update',
      externalExecution: {
        status: 'verified',
        provider: 'OZON',
      },
    }),
    executeApprovedStockUpdate: jest.fn().mockResolvedValue({
      status: 'executed',
      action: 'ozon.stock.update',
      externalExecution: {
        status: 'verified',
        provider: 'OZON',
      },
    }),
  };
  const automationService = {
    recoverFromFailure: jest.fn().mockResolvedValue({
      status: 'queued',
      action: 'automation.recover',
      flowId: 'flow-1',
      automationRunId: 'automation-recovery-run-1',
      externalStoreMutation: 'not_executed',
    }),
  };
  const agentRuns = {
    create: jest.fn().mockResolvedValue({ id: 'run-1', status: 'PENDING' }),
  };
  const approvedActionRouter = new OzonApprovedActionRouterService(
    ozonExternalWrite as any,
  );
  const productLaunchService = {
    preflightPublishConfirmation: jest.fn().mockReturnValue({
      type: 'mfa-step-up/v1',
      actorId: 'user-1',
      amr: ['pwd', 'otp'],
      mfaAt: user.mfaAt,
    }),
    confirmPublish: jest.fn().mockResolvedValue({
      status: 'approved_pending_external_adapter',
      externalStoreMutation: 'queued_from_immutable_snapshot',
    }),
  };
  const moduleRef = {
    get: jest.fn().mockReturnValue(productLaunchService),
  };

  return {
    service: new NotificationsService(
      prisma as any,
      audit as any,
      events as any,
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
      queue as any,
      linkfoxSkillCli as any,
      approvedActionRouter,
      automationService as any,
      agentRuns as any,
      actionProposals as any,
      moduleRef as any,
    ),
    prisma,
    audit,
    events,
    queue,
    linkfoxSkillCli,
    ozonExternalWrite,
    automationService,
    agentRuns,
    productLaunchService,
    moduleRef,
    approvedActionRouter,
    actionProposals,
    actionProposal,
  };
}

describe('NotificationsService decisions', () => {
  it('always scopes notification lists to the current user', async () => {
    const { service, prisma } = createService();

    await service.findAll(user, {
      userId: 'user-2',
      page: 1,
      limit: 20,
    } as never);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('does not allow a user to read another users notification by id', async () => {
    const { service } = createService({ userId: 'user-2' });

    await expect(
      service.findOne(user as any, 'notification-1'),
    ).rejects.toThrow('Notification not found');
  });

  it('does not allow a user to update or delete another users notification', async () => {
    const { service, prisma } = createService({ userId: 'user-2' });

    await expect(
      service.update(user as any, 'notification-1', { title: 'tampered' }),
    ).rejects.toThrow('Notification not found');
    await expect(service.remove(user as any, 'notification-1')).rejects.toThrow(
      'Notification not found',
    );

    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.delete).not.toHaveBeenCalled();
  });

  it('atomically claims one concurrent execute request before external work', async () => {
    const { service, actionProposals, agentRuns } = createService();
    actionProposals.claimExecution
      .mockResolvedValueOnce({
        id: 'proposal-1',
        organizationId: 'org-1',
        action: 'operator.prepare_listing_batch',
        params: { productIds: ['product-1'], workspaceId: 'workspace-1' },
        context: { kind: 'agent_suggestion' },
        payloadHash: 'a'.repeat(64),
        approvalDecision: { id: 'decision-1' },
        executionGrant: {
          token: `apt_${'x'.repeat(43)}`,
          proposalId: 'proposal-1',
          approvalDecisionId: 'decision-1',
          action: 'operator.prepare_listing_batch',
          capabilityScope: 'action:operator.prepare_listing_batch',
          payloadHash: 'a'.repeat(64),
          expiresAt: new Date('2099-07-08T00:00:00.000Z'),
          idempotencyKey: `approval:proposal-1:${'a'.repeat(64)}`,
        },
      })
      .mockRejectedValueOnce(
        new BadRequestException('Action proposal is no longer pending'),
      );

    const [first, second] = await Promise.allSettled([
      service.decide(user as any, 'notification-1', { decision: 'execute' }),
      service.decide(user as any, 'notification-1', { decision: 'execute' }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(agentRuns.create).toHaveBeenCalledTimes(1);
  });

  it('executes an actionable agent suggestion through real backend records', async () => {
    const { service, prisma, audit, events, queue, agentRuns } =
      createService();

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(result.status).toBe('executed');
    expect(agentRuns.create).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', orgId: 'org-1' }),
      expect.objectContaining({
        workspaceId: 'workspace-1',
        agentType: 'PLANNER',
        input: expect.objectContaining({
          source: 'notification_center',
          productIds: ['product-1'],
        }),
      }),
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.automationFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        name: '[notificationenglish_text] text 1 textproductlisting',
        triggerType: 'MANUAL',
        triggerConfig: expect.objectContaining({
          source: 'notification_center',
          agentRunId: 'run-1',
        }),
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'APPROVAL_REQUIRED',
        title: 'textreviewenglish_textlistingtext（1 textproduct）',
        metadata: expect.objectContaining({
          kind: 'operator_batch_review',
          agentRunId: 'run-1',
          flowId: 'flow-1',
        }),
      }),
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({ status: 'executed' }),
        }),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification.decision.execute',
        resourceId: 'notification-1',
      }),
    );
    expect(events.publishCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'review-notification-1' }),
    );
    expect(events.publishUpdated).toHaveBeenCalled();
    expect(events.publishRead).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        ids: ['notification-1'],
        unreadCount: 0,
      }),
    );
  });

  it('dismisses an actionable notification without starting an agent run', async () => {
    const { service, prisma, audit, events, queue } = createService();

    const result = await service.decide(user, 'notification-1', {
      decision: 'dismiss',
    });

    expect(result.status).toBe('dismissed');
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(prisma.automationFlow.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({ status: 'dismissed' }),
        }),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification.decision.dismiss',
        resourceId: 'notification-1',
      }),
    );
    expect(events.publishUpdated).toHaveBeenCalled();
    expect(events.publishRead).toHaveBeenCalled();
  });

  it('creates a fresh automation recovery run from a failed-run notification', async () => {
    const { service, prisma, automationService } = createService({
      type: 'ALERT',
      title: 'agentautomatictextfailed：Ozon product researchtext',
      body: 'realagentenglish_text，english_textstorewrite。',
      metadata: {
        kind: 'automation_run_failed',
        flowId: 'flow-1',
        automationRunId: 'failed-run-1',
        externalStoreMutation: 'not_executed',
        action: {
          label: 'english_text',
          action: 'automation.recover',
          params: { flowId: 'flow-1', failedRunId: 'failed-run-1' },
        },
      },
    });

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(automationService.recoverFromFailure).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorId: 'user-1',
      flowId: 'flow-1',
      failedRunId: 'failed-run-1',
      reason: 'notificationenglish_text：agentautomatictextfailed：Ozon product researchtext',
      idempotencyKey: 'notification-recovery:failed-run-1',
      source: 'notification_center',
    });
    expect(result.status).toBe('executed');
    expect(result.result).toEqual(
      expect.objectContaining({
        action: 'automation.recover',
        automationRunId: 'automation-recovery-run-1',
        externalStoreMutation: 'not_executed',
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({ status: 'executed' }),
        }),
      }),
    });
  });

  it('rejects legacy actionable notifications that do not have a signed proposal', async () => {
    const { service, automationService, actionProposals } = createService({
      type: 'ALERT',
      title: 'agentautomatictextfailed：Ozon product researchtext',
      metadata: {
        kind: 'automation_run_failed',
        flowId: 'flow-legacy-1',
        automationRunId: 'failed-run-legacy-1',
      },
    });
    actionProposals.findForNotification.mockResolvedValueOnce(null);
    actionProposals.claimExecution.mockRejectedValueOnce(
      new BadRequestException('Action proposal not found'),
    );

    await expect(
      service.decide(user, 'notification-1', {
        decision: 'execute',
      }),
    ).rejects.toThrow('Action proposal not found');

    expect(automationService.recoverFromFailure).not.toHaveBeenCalled();
  });

  it('rejects executable metadata submitted through the public create method', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(
        user as any,
        {
          type: 'SYSTEM',
          title: 'tampered',
          body: 'tampered',
          metadata: {
            action: {
              action: 'ozon.price.update',
              params: { productId: 'product-1', price: 1 },
            },
          },
        } as never,
      ),
    ).rejects.toThrow('cannot contain executable metadata');

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('executes the immutable proposal action instead of tampered notification metadata', async () => {
    const { service, actionProposals, ozonExternalWrite } = createService({
      type: 'APPROVAL_REQUIRED',
      metadata: {
        kind: 'high_risk_action_review',
        action: {
          label: 'Execute',
          action: 'ozon.stock.update',
          params: { productId: 'product-1', stock: 9999 },
        },
      },
    });
    actionProposals.claimExecution.mockResolvedValueOnce({
      id: 'proposal-1',
      organizationId: 'org-1',
      action: 'ozon.price.update',
      params: { productId: 'product-1', price: 1299.5 },
      context: { source: 'trusted_test' },
      payloadHash: 'a'.repeat(64),
      approvalDecision: { id: 'decision-1' },
      executionGrant: {
        token: `apt_${'x'.repeat(43)}`,
        proposalId: 'proposal-1',
        approvalDecisionId: 'decision-1',
        action: 'ozon.price.update',
        capabilityScope: 'action:ozon.price.update',
        payloadHash: 'a'.repeat(64),
        expiresAt: new Date('2099-07-08T00:00:00.000Z'),
        idempotencyKey: `approval:proposal-1:${'a'.repeat(64)}`,
      },
    });

    await service.decide(user, 'notification-1', { decision: 'execute' });

    expect(ozonExternalWrite.executeApprovedPriceUpdate).toHaveBeenCalled();
    expect(ozonExternalWrite.executeApprovedStockUpdate).not.toHaveBeenCalled();
  });

  it('routes an approved generic Ozon price action through the guarded adapter', async () => {
    const { service, prisma, audit, events, queue, ozonExternalWrite } =
      createService({
        type: 'APPROVAL_REQUIRED',
        title: 'english_textagenttextrisktext：automatictext',
        body: 'agentrequesttext，texthumantext。',
        metadata: {
          kind: 'high_risk_action_review',
          source: 'agent_proxy',
          provider: 'OZON',
          riskLevel: 'high',
          requiresConfirmation: true,
          action: {
            label: 'text',
            action: 'price.adjust',
            params: { productId: 'product-1', price: 19.99 },
          },
        },
      });

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(result.status).toBe('executed');
    expect(result.result).toEqual(
      expect.objectContaining({
        status: 'executed',
        action: 'ozon.price.update',
      }),
    );
    expect(ozonExternalWrite.executeApprovedPriceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      expect.objectContaining({
        action: 'ozon.price.update',
        params: expect.objectContaining({
          productId: 'product-1',
          price: 19.99,
        }),
      }),
    );
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(prisma.automationFlow.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({
            status: 'executed',
          }),
        }),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification.decision.execute',
        resourceId: 'notification-1',
      }),
    );
    expect(events.publishUpdated).toHaveBeenCalled();
    expect(events.publishRead).toHaveBeenCalled();
  });

  it('executes approved LinkfoxSkill installs through the real CLI adapter', async () => {
    const { service, prisma, linkfoxSkillCli } = createService({
      type: 'APPROVAL_REQUIRED',
      title: 'english_textagenttextrisktext：text LinkFox english_textlocal Agent',
      body: 'agentrequesttext LinkFox text，texthumantext。',
      metadata: {
        kind: 'high_risk_action_review',
        source: 'agent_proxy',
        riskLevel: 'high',
        requiresConfirmation: true,
        action: {
          label: 'text',
          action: 'linkfoxskill.install',
          params: { slug: 'ecommerce-product-picker', agents: 'codex' },
        },
      },
    });

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(result.status).toBe('executed');
    expect(linkfoxSkillCli.install).toHaveBeenCalledWith({
      slug: 'ecommerce-product-picker',
      agents: 'codex',
    });
    expect(result.result).toEqual(
      expect.objectContaining({
        status: 'executed',
        action: 'linkfoxskill.install',
        cli: expect.objectContaining({
          command:
            'linkfoxskill install ecommerce-product-picker --agents codex',
          stdout: 'installed',
        }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({ status: 'executed' }),
        }),
      }),
    });
  });

  it.each([
    'store.product.update',
    'listing.publish',
    'ozon.product.update',
    'ozon.listing.publish',
  ])(
    'rejects %s when the immutable ProductLaunch snapshot identifier is missing',
    async (actionName) => {
      const {
        service,
        productLaunchService,
        ozonExternalWrite,
        actionProposals,
      } = createService({
        type: 'APPROVAL_REQUIRED',
        title: 'Confirm Ozon publication',
        metadata: {
          kind: 'high_risk_action_review',
          source: 'legacy-publish-request',
          provider: 'OZON',
          action: {
            label: 'Publish',
            action: actionName,
            params: { productId: 'mutable-product-1' },
          },
        },
      });

      await expect(
        service.decide(user, 'notification-1', { decision: 'execute' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PRODUCT_LAUNCH_SNAPSHOT_REQUIRED',
        }),
      });
      expect(productLaunchService.confirmPublish).not.toHaveBeenCalled();
      expect(
        ozonExternalWrite.executeApprovedPriceUpdate,
      ).not.toHaveBeenCalled();
      expect(
        ozonExternalWrite.executeApprovedStockUpdate,
      ).not.toHaveBeenCalled();
      expect(actionProposals.failExecution).toHaveBeenCalledWith(
        expect.objectContaining({ proposalId: 'proposal-1' }),
      );
    },
  );

  it.each([
    'product-launch.confirm-publish',
    'store.product.update',
    'listing.publish',
    'ozon.product.update',
    'ozon.listing.publish',
  ])(
    'routes %s through ProductLaunch immutable snapshot confirmation',
    async (actionName) => {
      const { service, productLaunchService, approvedActionRouter } =
        createService({
          type: 'APPROVAL_REQUIRED',
          title: 'Confirm immutable Ozon publication',
          metadata: {
            kind: 'high_risk_action_review',
            source: 'publish-snapshot-review',
            provider: 'OZON',
            action: {
              label: 'Publish',
              action: actionName,
              params: {
                productLaunchId: 'launch-1',
                productId: 'mutable-product-1',
              },
            },
          },
        });
      const routerExecute = jest.spyOn(approvedActionRouter, 'execute');

      const result = await service.decide(user, 'notification-1', {
        decision: 'execute',
      });

      expect(result.status).toBe('approved_pending_external_adapter');
      expect(productLaunchService.confirmPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          orgId: 'org-1',
          amr: ['pwd', 'otp'],
          mfaAt: user.mfaAt,
        }),
        'launch-1',
        { confirmPublish: true },
        { approvedAt: expect.any(Date) },
      );
      expect(routerExecute).not.toHaveBeenCalled();
    },
  );

  it('keeps a publish proposal pending when MFA is stale before notification approval is claimed', async () => {
    const { service, prisma, productLaunchService, actionProposals } =
      createService({
        type: 'APPROVAL_REQUIRED',
        title: 'Confirm immutable Ozon publication',
        metadata: {
          kind: 'product_launch_publish_review',
          source: 'product-launch-worker',
          action: {
            label: 'Publish',
            action: 'product-launch.confirm-publish',
            params: { productLaunchId: 'launch-1' },
          },
        },
      });
    productLaunchService.preflightPublishConfirmation.mockImplementation(() => {
      throw new ForbiddenException({
        code: 'PUBLISH_STEP_UP_REQUIRED',
        message: 'Fresh MFA is required',
      });
    });

    await expect(
      service.decide(
        {
          ...user,
          mfaAt: Math.floor(Date.now() / 1000) - 10 * 60,
        },
        'notification-1',
        { decision: 'execute' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLISH_STEP_UP_REQUIRED' }),
    });

    expect(
      productLaunchService.preflightPublishConfirmation,
    ).toHaveBeenCalledTimes(1);
    expect(actionProposals.claimExecution).not.toHaveBeenCalled();
    expect(actionProposals.consumeExecutionGrant).not.toHaveBeenCalled();
    expect(actionProposals.failExecution).not.toHaveBeenCalled();
    expect(productLaunchService.confirmPublish).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('keeps a directly approved publish item pending when MFA preflight fails', async () => {
    const { service, prisma, productLaunchService, actionProposals } =
      createService({
        type: 'APPROVAL_REQUIRED',
        title: 'Confirm immutable Ozon publication',
        metadata: {
          kind: 'product_launch_publish_review',
          source: 'product-launch-worker',
          action: {
            label: 'Publish',
            action: 'product-launch.confirm-publish',
            params: { productLaunchId: 'launch-1' },
          },
        },
      });
    productLaunchService.preflightPublishConfirmation.mockImplementation(() => {
      throw new ForbiddenException({
        code: 'PUBLISH_STEP_UP_REQUIRED',
        message: 'Fresh MFA is required',
      });
    });

    await expect(
      service.decideProposal(
        {
          ...user,
          mfaAt: Math.floor(Date.now() / 1000) - 10 * 60,
        },
        'proposal-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLISH_STEP_UP_REQUIRED' }),
    });

    expect(actionProposals.findById).toHaveBeenCalledWith({
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      actorId: 'user-1',
      actorRole: 'OWNER',
    });
    expect(actionProposals.claimExecutionById).not.toHaveBeenCalled();
    expect(actionProposals.consumeExecutionGrant).not.toHaveBeenCalled();
    expect(actionProposals.failExecution).not.toHaveBeenCalled();
    expect(productLaunchService.confirmPublish).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('returns an explicit pending-external approval contract for direct publish approval', async () => {
    const { service, actionProposals } = createService({
      type: 'APPROVAL_REQUIRED',
      title: 'Confirm immutable Ozon publication',
      metadata: {
        kind: 'product_launch_publish_review',
        source: 'product-launch-worker',
        action: {
          label: 'Publish',
          action: 'product-launch.confirm-publish',
          params: { productLaunchId: 'launch-1' },
        },
      },
    });

    const result = await service.decideProposal(user, 'proposal-1');

    expect(result).toEqual(
      expect.objectContaining({
        status: 'approved_pending_external_adapter',
        actionProposal: expect.objectContaining({
          id: 'proposal-1',
          status: 'APPROVED',
        }),
      }),
    );
    expect(actionProposals.completeExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 'proposal-1',
        status: 'APPROVED',
      }),
    );
  });

  it('executes approved Ozon price updates through the guarded external write service', async () => {
    const { service, prisma, ozonExternalWrite } = createService({
      type: 'APPROVAL_REQUIRED',
      title: 'english_textproductenglish_text：Ozon text',
      body: 'producttext Ozon text，texthumantext。',
      metadata: {
        kind: 'high_risk_action_review',
        source: 'product_management_change_order',
        riskLevel: 'high',
        requiresConfirmation: true,
        action: {
          label: 'text',
          action: 'ozon.price.update',
          params: {
            productId: 'product-1',
            workspaceId: 'workspace-1',
            price: 1299.5,
            currency: 'RUB',
          },
        },
      },
    });

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(result.status).toBe('executed');
    expect(ozonExternalWrite.executeApprovedPriceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        title: 'english_textproductenglish_text：Ozon text',
      }),
      expect.objectContaining({
        action: 'ozon.price.update',
        params: expect.objectContaining({
          productId: 'product-1',
          price: 1299.5,
        }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({ status: 'executed' }),
        }),
      }),
    });
  });

  it('executes approved Ozon stock updates through the guarded external write service', async () => {
    const { service, prisma, ozonExternalWrite } = createService({
      type: 'APPROVAL_REQUIRED',
      title: 'english_textproductenglish_text：Ozon textwrite',
      body: 'producttext Ozon textwrite，texthumantext。',
      metadata: {
        kind: 'high_risk_action_review',
        source: 'product_management_change_order',
        riskLevel: 'high',
        requiresConfirmation: true,
        action: {
          label: 'text',
          action: 'ozon.stock.update',
          params: {
            productId: 'product-1',
            workspaceId: 'workspace-1',
            stock: 12,
            warehouseId: 987654,
          },
        },
      },
    });

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(result.status).toBe('executed');
    expect(ozonExternalWrite.executeApprovedStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        title: 'english_textproductenglish_text：Ozon textwrite',
      }),
      expect.objectContaining({
        action: 'ozon.stock.update',
        params: expect.objectContaining({
          productId: 'product-1',
          stock: 12,
          warehouseId: 987654,
        }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({ status: 'executed' }),
        }),
      }),
    });
  });

  it('records approved Ozon write failures without marking the notification executed', async () => {
    const { service, prisma, ozonExternalWrite } = createService({
      type: 'APPROVAL_REQUIRED',
      title: 'english_textproductenglish_text：Ozon text',
      metadata: {
        kind: 'high_risk_action_review',
        source: 'product_management_change_order',
        action: {
          label: 'text',
          action: 'ozon.price.update',
          params: { productId: 'product-1', price: 1299.5, currency: 'RUB' },
        },
      },
    });
    ozonExternalWrite.executeApprovedPriceUpdate.mockResolvedValueOnce({
      status: 'external_execution_failed',
      action: 'ozon.price.update',
      externalExecution: {
        status: 'readback_mismatch',
        expectedPrice: 1299.5,
        actualPrice: 1000,
      },
    });

    const result = await service.decide(user, 'notification-1', {
      decision: 'execute',
    });

    expect(result.status).toBe('external_execution_failed');
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decision: expect.objectContaining({
            status: 'external_execution_failed',
            result: expect.objectContaining({
              externalExecution: expect.objectContaining({
                status: 'readback_mismatch',
              }),
            }),
          }),
        }),
      }),
    });
  });
});
