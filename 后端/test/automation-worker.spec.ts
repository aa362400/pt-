import { AutomationWorker } from '../src/workers/automation.worker.js';

const tenantDatabase = (prisma: any) => ({
  run: jest.fn((_organizationId: string, operation: (tx: unknown) => unknown) =>
    operation({
      ...prisma,
      automationRun: {
        ...prisma.automationRun,
        findFirst:
          prisma.automationRun?.findFirst ?? prisma.automationRun?.findUnique,
      },
    }),
  ),
});
import { Prisma } from '@prisma/client';

const createInMemoryStepLedger = () => {
  const executions = new Map<
    string,
    { status: string; result?: Record<string, unknown> }
  >();
  const stepDefinitions = new Map<
    string,
    { stepIndex: number; action: string }
  >();
  const ledger = {
    claimRun: jest.fn().mockResolvedValue({
      outcome: 'claimed',
      controlRevision: 0,
      checkpointStepIndex: null,
    }),
    loadTerminalSteps: jest.fn().mockImplementation(async () =>
      [...executions.entries()]
        .filter(([, execution]) =>
          ['COMPLETED', 'BLOCKED'].includes(execution.status),
        )
        .map(([stepKey, execution]) => ({
          stepKey,
          stepIndex: stepDefinitions.get(stepKey)?.stepIndex,
          action: stepDefinitions.get(stepKey)?.action,
          result: execution.result,
        })),
    ),
    claimStep: jest.fn().mockImplementation(async (input) => {
      stepDefinitions.set(input.stepKey, {
        stepIndex: input.stepIndex,
        action: input.action,
      });
      return {
        outcome: 'claimed',
        controlRevision: input.expectedControlRevision,
        checkpointStepIndex: input.expectedCheckpointStepIndex,
      };
    }),
    finishStep: jest.fn().mockImplementation(async (input) => {
      executions.set(input.stepKey, {
        status: input.result.status === 'completed' ? 'COMPLETED' : 'BLOCKED',
        result: input.result,
      });
      return {
        outcome: 'continue',
        controlRevision: input.expectedControlRevision,
        checkpointStepIndex: input.stepIndex + 1,
      };
    }),
    failStep: jest.fn().mockImplementation(async (input) => {
      executions.set(input.stepKey, { status: 'FAILED' });
    }),
    finishRun: jest.fn().mockResolvedValue({
      outcome: 'completed',
      controlRevision: 0,
    }),
    releaseRun: jest.fn().mockResolvedValue(true),
  };
  return { executions, ledger };
};

describe('AutomationWorker', () => {
  const AUTOMATION_TRACE_ID = 'd8f03b6b91684acda22d005af57de4d8';
  const FORGED_JOB_TRACE_ID = '11111111111111111111111111111111';

  it('rejects a queue payload whose idempotency key differs from the persisted run', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-key-mismatch',
          idempotencyKey: 'persisted-idempotency-key',
          triggerSource: 'manual',
        }),
      },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
    );

    await expect(
      worker.process({
        id: 'job-key-mismatch',
        data: {
          automationRunId: 'automation-run-key-mismatch',
          organizationId: 'org-1',
          idempotencyKey: 'forged-idempotency-key',
        },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toThrow('idempotency key does not match');
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
  });

  it('blocks listing draft when research is pending review', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-l2-blocked',
          flowId: 'flow-l2',
          flow: {
            id: 'flow-l2',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'L2 draft flow',
            triggerConfig: { source: 'agent_autonomy_auto_draft' },
            workspace: {
              id: 'workspace-1',
              name: 'Ozon RU',
              channelType: 'OZON',
              marketplace: 'OZON',
            },
            steps: [
              {
                key: 'research',
                action: 'product.research',
                query: 'Travel Mug',
              },
              {
                key: 'listing-draft',
                action: 'listing.draft',
                dependsOn: ['research'],
                productName: 'Travel Mug',
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: { update: jest.fn().mockResolvedValue({}) },
      product: { findMany: jest.fn() },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice-1' }) },
    };
    const productResearch = {
      runAutomaticSelection: jest.fn().mockResolvedValue({
        status: 'pending_review',
        reviewTaskId: 'research-review-1',
        candidateCount: 0,
      }),
    };
    const listings = { generate: jest.fn() };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      listings as any,
    );

    await worker.process({
      id: 'job-l2',
      data: {
        automationRunId: 'automation-run-l2-blocked',
        organizationId: 'org-1',
      },
      updateProgress: jest.fn(),
    } as any);

    expect(listings.generate).not.toHaveBeenCalled();
    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-l2-blocked' },
      data: expect.objectContaining({
        status: 'PARTIAL',
        result: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              key: 'listing-draft',
              status: 'blocked_by_dependency',
              dependsOn: ['research'],
            }),
          ]),
        }),
      }),
    });
  });

  it('executes product.research by creating a real research report and approval notification', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-1',
          flowId: 'flow-1',
          flow: {
            id: 'flow-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'Ozon auto operator',
            triggerConfig: {
              source: 'store_operator',
              platform: 'OZON',
            },
            workspace: {
              id: 'workspace-1',
              name: 'Ozon RU',
              channelType: 'OZON',
              marketplace: 'OZON_RU',
            },
            steps: [
              {
                key: 'auto-product-research',
                action: 'product.research',
                query: 'Ozon 高潜新品',
                platform: 'OZON',
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
    };
    const productResearch = {
      runAutomaticSelection: jest.fn().mockResolvedValue({
        reportId: 'report-1',
        candidateCount: 3,
        notificationId: 'notification-1',
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
    );

    await worker.process({
      id: 'job-1',
      data: { automationRunId: 'automation-run-1', organizationId: 'org-1' },
      updateProgress: jest.fn(),
    } as any);

    expect(productResearch.runAutomaticSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        actorId: 'user-1',
        workspaceId: 'workspace-1',
        query: 'Ozon 高潜新品',
        platform: 'OZON',
        automationFlowId: 'flow-1',
        automationRunId: 'automation-run-1',
      }),
    );
    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        result: expect.objectContaining({
          steps: [
            expect.objectContaining({
              action: 'product.research',
              status: 'completed',
              reportIds: ['report-1'],
              notificationIds: ['notification-1'],
              candidateCount: 3,
            }),
          ],
        }),
      }),
    });
    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-1' },
      data: expect.objectContaining({ successRate: 100 }),
    });
  });

  it('gives every continuous daily research run a stable exploration key', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-continuous-1',
          flowId: 'flow-continuous-1',
          idempotencyKey: 'schedule:flow-continuous-1:2026-07-16T01:00:00Z',
          triggerSource: 'schedule',
          jobSnapshot: {
            steps: [
              {
                key: 'continuous-global-product-research',
                action: 'product.research.daily',
                continuous: true,
              },
            ],
          },
          flow: {
            id: 'flow-continuous-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: '[智能体自动运营] Ozon 选品巡检',
            triggerType: 'SCHEDULE',
            triggerConfig: {
              source: 'connected_store_operator',
              continuous: true,
              timezone: 'Asia/Shanghai',
            },
            workspace: {
              id: 'workspace-1',
              name: 'Ozon RU',
              channelType: 'OZON',
              marketplace: 'OZON_RU',
            },
            steps: [
              {
                key: 'continuous-global-product-research',
                action: 'product.research.daily',
                continuous: true,
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: { update: jest.fn().mockResolvedValue({}) },
    };
    const dailyProductResearch = {
      startFromAutomation: jest.fn().mockResolvedValue({
        run: { id: 'daily-run-1' },
        reused: false,
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      {} as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      dailyProductResearch as any,
    );

    await worker.process({
      id: 'job-continuous-1',
      data: {
        automationRunId: 'automation-run-continuous-1',
        organizationId: 'org-1',
        idempotencyKey: 'schedule:flow-continuous-1:2026-07-16T01:00:00Z',
      },
      updateProgress: jest.fn(),
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as any);

    expect(dailyProductResearch.startFromAutomation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      actorId: 'user-1',
      automationRunId: 'automation-run-continuous-1',
      timezone: 'Asia/Shanghai',
      explorationKey: 'automation-run-continuous-1',
      pricingMode: 'MANUAL',
    });
  });

  it('creates a real listing draft and review task when listing service is registered', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-listing',
          flowId: 'flow-listing',
          flow: {
            id: 'flow-listing',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'Ozon listing pipeline',
            triggerConfig: { platform: 'ozon' },
            workspace: {
              id: 'workspace-1',
              name: 'Ozon RU',
              channelType: 'OZON',
              marketplace: 'OZON',
            },
            steps: [
              {
                action: 'listing.draft',
                productName: 'Test Ozon product',
                keywords: ['ozon', 'test'],
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
    };
    const listings = {
      generate: jest.fn().mockResolvedValue({ id: 'listing-draft-1' }),
    };
    const reviewService = {
      createFromAgentRun: jest.fn().mockResolvedValue({ id: 'review-1' }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      listings as any,
      undefined,
      undefined,
      undefined,
      reviewService as any,
    );

    await worker.process({
      id: 'job-listing',
      data: {
        automationRunId: 'automation-run-listing',
        organizationId: 'org-1',
      },
      updateProgress: jest.fn(),
    } as any);

    expect(listings.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        orgId: 'org-1',
      }),
      expect.objectContaining({
        workspaceId: 'workspace-1',
        productName: 'Test Ozon product',
        platform: 'ozon',
        keywords: ['ozon', 'test'],
      }),
    );
    expect(reviewService.createFromAgentRun).toHaveBeenCalledWith('org-1', {
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-draft-1',
    });
    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-listing' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        result: expect.objectContaining({
          steps: [
            expect.objectContaining({
              action: 'listing.draft',
              status: 'completed',
              listingDraftId: 'listing-draft-1',
              reviewTaskId: 'review-1',
              requiresHumanApproval: true,
            }),
          ],
        }),
      }),
    });
  });

  it('runs a real profit calculation only when required inputs are present', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-profit',
          flowId: 'flow-profit',
          flow: {
            id: 'flow-profit',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'Profit pipeline',
            triggerConfig: {},
            workspace: null,
            steps: [
              {
                action: 'profit.calculate',
                salePrice: 30,
                productCost: 12,
                shippingCost: 3,
                currency: 'USD',
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
    };
    const profitCalculator = {
      calculate: jest.fn().mockResolvedValue({
        id: 'profit-1',
        estimatedProfit: 15,
        profitMargin: 50,
        roi: 100,
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      profitCalculator as any,
    );

    await worker.process({
      id: 'job-profit',
      data: {
        automationRunId: 'automation-run-profit',
        organizationId: 'org-1',
      },
      updateProgress: jest.fn(),
    } as any);

    expect(profitCalculator.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        orgId: 'org-1',
      }),
      expect.objectContaining({
        workspaceId: 'workspace-1',
        salePrice: 30,
        productCost: 12,
        shippingCost: 3,
        currency: 'USD',
      }),
    );
    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-profit' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        result: expect.objectContaining({
          steps: [
            expect.objectContaining({
              action: 'profit.calculate',
              status: 'completed',
              profitCalculationId: 'profit-1',
            }),
          ],
        }),
      }),
    });
  });

  it('does not accept mock image generation as completed automation work', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-image',
          flowId: 'flow-image',
          traceId: AUTOMATION_TRACE_ID,
          flow: {
            id: 'flow-image',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'Image pipeline',
            triggerConfig: {},
            workspace: null,
            steps: [
              {
                action: 'image.generate',
                productName: 'Test product',
                sceneCount: 2,
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
      imagePromptProject: {
        update: jest.fn(),
      },
    };
    const imagePrompt = {
      create: jest.fn(),
    };
    const agentProvider = {
      runImageGeneration: jest.fn().mockResolvedValue({
        sessionId: 'mock-session',
        mockMode: true,
        images: [{ url: 'https://example.com/mock.jpg' }],
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      imagePrompt as any,
      undefined,
      undefined,
      agentProvider as any,
    );

    await worker.process({
      id: 'job-image',
      data: {
        automationRunId: 'automation-run-image',
        organizationId: 'org-1',
        traceId: FORGED_JOB_TRACE_ID,
        traceparent: `00-${FORGED_JOB_TRACE_ID}-00f067aa0ba902b7-01`,
      },
      updateProgress: jest.fn(),
    } as any);

    expect(imagePrompt.create).not.toHaveBeenCalled();
    expect(agentProvider.runImageGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        requestId: expect.stringContaining('automation-run-image'),
        traceId: AUTOMATION_TRACE_ID,
        traceparent: expect.stringContaining(AUTOMATION_TRACE_ID),
      }),
    );
    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-image' },
      data: expect.objectContaining({
        status: 'PARTIAL',
        result: expect.objectContaining({
          steps: [
            expect.objectContaining({
              action: 'image.generate',
              status: 'waiting_real_provider',
            }),
          ],
        }),
      }),
    });
  });

  it('does not mark unsupported automation steps as completed', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-2',
          flowId: 'flow-2',
          flow: {
            id: 'flow-2',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'Listing pipeline',
            triggerConfig: {},
            workspace: null,
            steps: [{ action: 'listing.draft' }],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
    };
    const worker = new AutomationWorker(
      prisma as any,
      {
        runAutomaticSelection: jest.fn(),
      } as any,
      tenantDatabase(prisma) as any,
    );

    await worker.process({
      id: 'job-2',
      data: { automationRunId: 'automation-run-2', organizationId: 'org-1' },
      updateProgress: jest.fn(),
    } as any);

    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-2' },
      data: expect.objectContaining({
        status: 'PARTIAL',
        result: expect.objectContaining({
          steps: [
            expect.objectContaining({
              action: 'listing.draft',
              status: 'waiting_adapter',
            }),
          ],
        }),
      }),
    });
    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-2' },
      data: expect.objectContaining({ successRate: 0 }),
    });
  });

  it('notifies the operator when connected-store automation fails on the final attempt', async () => {
    const notification = {
      id: 'notification-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-3',
          flowId: 'flow-3',
          flow: {
            id: 'flow-3',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: '[智能体自动运营] Ozon 选品巡检',
            triggerConfig: {
              source: 'connected_store_operator',
              platform: 'OZON',
            },
            workspace: {
              id: 'workspace-1',
              name: 'Ozon RU',
              channelType: 'OZON',
              marketplace: 'OZON_RU',
            },
            steps: [
              {
                key: 'auto-product-research',
                action: 'product.research',
                query: 'Ozon 高潜新品',
                platform: 'OZON',
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn().mockResolvedValue(notification),
      },
    };
    const productResearch = {
      runAutomaticSelection: jest
        .fn()
        .mockRejectedValue(new Error('Agent API 502')),
    };
    const notificationEvents = {
      publishCreated: jest.fn(),
    };
    const actionProposals = {
      create: jest.fn().mockImplementation(async (input) => {
        notificationEvents.publishCreated(notification);
        return {
          notification: { ...notification, ...input },
          proposal: { id: 'proposal-3', payloadHash: 'a'.repeat(64) },
        };
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      notificationEvents as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      actionProposals as any,
    );

    await expect(
      worker.process({
        id: 'job-3',
        data: {
          automationRunId: 'automation-run-3',
          organizationId: 'org-1',
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as any),
    ).rejects.toThrow('Agent API 502');

    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        requestedBy: 'user-1',
        approverId: 'user-1',
        type: 'ALERT',
        title: '智能体自动运营失败：[智能体自动运营] Ozon 选品巡检',
        context: expect.objectContaining({
          kind: 'automation_run_failed',
          automationRunId: 'automation-run-3',
          flowId: 'flow-3',
          targetRoute: '/automation',
          externalStoreMutation: 'not_executed',
        }),
        action: expect.objectContaining({
          name: 'automation.recover',
          params: { flowId: 'flow-3', failedRunId: 'automation-run-3' },
        }),
      }),
    );
    expect(notificationEvents.publishCreated).toHaveBeenCalledWith(
      notification,
    );
    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-3' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        successRate: 0,
        triggerConfig: expect.objectContaining({
          lastFailureClass: 'agent_provider_unreachable',
          lastFailureMessage: 'Agent API 502',
          agentProviderFailureStreak: 1,
        }),
      }),
    });
  });

  it('writes an exhausted automation job to the dead-letter queue for later recovery', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-dead-letter',
          flow: { organizationId: 'org-1' },
        }),
      },
    };
    const deadLetterQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      deadLetterQueue as any,
    );

    await worker.onFailed(
      {
        id: 'automation-job-dead-letter',
        data: {
          automationRunId: 'automation-run-dead-letter',
          organizationId: 'org-1',
          traceId: AUTOMATION_TRACE_ID,
          traceparent: `00-${AUTOMATION_TRACE_ID}-00f067aa0ba902b7-01`,
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any,
      new Error('Agent API 502'),
    );

    expect(deadLetterQueue.add).toHaveBeenCalledWith('record', {
      originalQueue: 'automation-runs',
      originalJobId: 'automation-job-dead-letter',
      originalData: {
        automationRunId: 'automation-run-dead-letter',
        organizationId: 'org-1',
        traceId: AUTOMATION_TRACE_ID,
        traceparent: `00-${AUTOMATION_TRACE_ID}-00f067aa0ba902b7-01`,
      },
      failedReason: 'Agent API 502',
      failedAttempts: 3,
      organizationId: 'org-1',
    });
  });

  it('keeps retryable failures pending until BullMQ exhausts its attempts', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-retry',
          flowId: 'flow-retry',
          flow: {
            id: 'flow-retry',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: '[智能体自动运营] Ozon 选品巡检',
            triggerConfig: { source: 'connected_store_operator' },
            workspace: null,
            steps: [{ action: 'product.research', query: 'Ozon 新品' }],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
    };
    const worker = new AutomationWorker(
      prisma as any,
      {
        runAutomaticSelection: jest
          .fn()
          .mockRejectedValue(new Error('Agent API temporary timeout')),
      } as any,
      tenantDatabase(prisma) as any,
    );

    await expect(
      worker.process({
        id: 'job-retry',
        data: {
          automationRunId: 'automation-run-retry',
          organizationId: 'org-1',
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as any),
    ).rejects.toThrow('Agent API temporary timeout');

    expect(prisma.automationRun.update).toHaveBeenLastCalledWith({
      where: { id: 'automation-run-retry' },
      data: { status: 'PENDING', finishedAt: null, error: Prisma.DbNull },
    });
    expect(prisma.automationFlow.update).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('marks failed one-shot scheduled flows as error instead of rescheduling them', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-one-shot',
          flowId: 'flow-one-shot',
          flow: {
            id: 'flow-one-shot',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: '[Agent scheduled] One shot launch package',
            triggerType: 'SCHEDULE',
            nextRunAt: new Date('2026-07-09T12:00:00.000Z'),
            triggerConfig: {
              source: 'agent_suggestion',
              dueAt: '2026-07-09T11:00:00.000Z',
            },
            workspace: {
              id: 'workspace-1',
              name: 'Ozon RU',
              channelType: 'OZON',
              marketplace: 'OZON_RU',
            },
            steps: [
              {
                key: 'auto-product-research',
                action: 'product.research',
                query: 'Ozon one shot product',
                platform: 'OZON',
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: {
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
    };
    const productResearch = {
      runAutomaticSelection: jest
        .fn()
        .mockRejectedValue(new Error('fetch failed')),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
    );

    await expect(
      worker.process({
        id: 'job-one-shot',
        data: {
          automationRunId: 'automation-run-one-shot',
          organizationId: 'org-1',
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as any),
    ).rejects.toThrow('fetch failed');

    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-one-shot' },
      data: expect.objectContaining({
        status: 'ERROR',
        nextRunAt: null,
        successRate: 0,
        triggerConfig: expect.objectContaining({
          lastFailureClass: 'agent_provider_unreachable',
          lastFailureMessage: 'fetch failed',
        }),
      }),
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('reuses completed step results and only retries the failed step', async () => {
    const run = {
      id: 'automation-run-resume',
      flowId: 'flow-resume',
      triggerSource: 'legacy',
      controlRevision: 0,
      flow: {
        id: 'flow-resume',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Resume-safe research flow',
        triggerConfig: {},
        workspace: null,
        steps: [
          { key: 'first', action: 'product.research', query: 'first' },
          { key: 'second', action: 'product.research', query: 'second' },
          { key: 'third', action: 'product.research', query: 'third' },
        ],
      },
    };
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockResolvedValue({}),
      },
      automationFlow: { update: jest.fn().mockResolvedValue({}) },
      product: { findMany: jest.fn() },
    };
    const queryAttempts = new Map<string, number>();
    const productResearch = {
      runAutomaticSelection: jest.fn().mockImplementation(async (input) => {
        const attempts = (queryAttempts.get(input.query) ?? 0) + 1;
        queryAttempts.set(input.query, attempts);
        if (input.query === 'third' && attempts === 1) {
          throw new Error('third step temporary failure');
        }
        return {
          reportId: `report-${input.query}-${attempts}`,
          candidateCount: 1,
        };
      }),
    };
    const { executions, ledger } = createInMemoryStepLedger();
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-resume-1',
        data: { automationRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 2 },
      } as any),
    ).rejects.toThrow('third step temporary failure');

    await expect(
      worker.process({
        id: 'job-resume-2',
        data: { automationRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
        attemptsMade: 1,
        opts: { attempts: 2 },
      } as any),
    ).resolves.toEqual({ status: 'completed', automationRunId: run.id });

    expect(queryAttempts).toEqual(
      new Map([
        ['first', 1],
        ['second', 1],
        ['third', 2],
      ]),
    );
    expect(executions.get('first')?.status).toBe('COMPLETED');
    expect(executions.get('second')?.status).toBe('COMPLETED');
    expect(executions.get('third')?.status).toBe('COMPLETED');
    expect(ledger.finishRun).toHaveBeenCalledTimes(1);
    expect(ledger.releaseRun).toHaveBeenCalledTimes(1);
  });

  it('does not execute business steps when another worker owns the run lease', async () => {
    const prisma = {
      automationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'automation-run-claimed',
          flowId: 'flow-claimed',
          controlRevision: 0,
          flow: {
            id: 'flow-claimed',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: 'Claimed flow',
            triggerConfig: {},
            workspace: null,
            steps: [
              { key: 'research', action: 'product.research', query: 'ozon' },
            ],
          },
        }),
      },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'unavailable',
        controlRevision: 0,
        checkpointStepIndex: null,
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-claimed',
        data: {
          automationRunId: 'automation-run-claimed',
          organizationId: 'org-1',
        },
        updateProgress: jest.fn(),
      } as any),
    ).resolves.toEqual({
      status: 'already_claimed',
      automationRunId: 'automation-run-claimed',
    });
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
  });

  it.each([
    ['paused', 4],
    ['stopped', 5],
  ] as const)(
    'acknowledges a queued run as %s without triggering a BullMQ retry',
    async (outcome, controlRevision) => {
      const run = {
        id: `automation-run-${outcome}`,
        flowId: `flow-${outcome}`,
        controlRevision: 3,
        flow: {
          id: `flow-${outcome}`,
          organizationId: 'org-1',
          workspaceId: 'workspace-1',
          createdBy: 'user-1',
          name: 'Controlled flow',
          triggerConfig: {},
          workspace: null,
          steps: [
            { key: 'research', action: 'product.research', query: 'ozon' },
          ],
        },
      };
      const prisma = {
        automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      };
      const productResearch = { runAutomaticSelection: jest.fn() };
      const ledger = {
        claimRun: jest.fn().mockResolvedValue({
          outcome,
          controlRevision,
          checkpointStepIndex: null,
        }),
      };
      const worker = new AutomationWorker(
        prisma as any,
        productResearch as any,
        tenantDatabase(prisma) as any,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ledger as any,
      );

      await expect(
        worker.process({
          id: `job-${outcome}`,
          data: {
            automationRunId: run.id,
            organizationId: 'org-1',
            controlRevision: 3,
          },
          updateProgress: jest.fn(),
          attemptsMade: 0,
          opts: { attempts: 3 },
        } as any),
      ).resolves.toEqual({
        status: outcome,
        automationRunId: run.id,
        controlRevision,
        checkpointStepIndex: null,
      });
      expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
    },
  );

  it('fails closed before claiming when the queued control revision is stale', async () => {
    const run = {
      id: 'automation-run-stale-payload',
      flowId: 'flow-stale-payload',
      status: 'PAUSED',
      controlRevision: 9,
      flow: {
        id: 'flow-stale-payload',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Stale payload flow',
        triggerConfig: {},
        workspace: null,
        steps: [{ key: 'research', action: 'product.research', query: 'ozon' }],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const ledger = { claimRun: jest.fn() };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-stale-payload',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 8,
        },
        updateProgress: jest.fn(),
      } as any),
    ).resolves.toEqual({
      status: 'stale_control_revision',
      automationRunId: run.id,
      queuedControlRevision: 8,
      persistedControlRevision: 9,
    });
    expect(ledger.claimRun).not.toHaveBeenCalled();
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
  });

  it('rejects a future-revision PENDING job instead of trusting its payload', async () => {
    const run = {
      id: 'automation-run-stale-pending',
      flowId: 'flow-stale-pending',
      status: 'PENDING',
      controlRevision: 9,
      flow: {
        id: 'flow-stale-pending',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Stale pending flow',
        triggerConfig: {},
        workspace: null,
        steps: [],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
    };
    const ledger = { claimRun: jest.fn() };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-stale-pending',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 10,
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as any),
    ).rejects.toThrow('control revision is stale');
    expect(ledger.claimRun).not.toHaveBeenCalled();
  });

  it('rejects an invalid control revision on a PENDING job', async () => {
    const run = {
      id: 'automation-run-invalid-revision',
      flowId: 'flow-invalid-revision',
      status: 'PENDING',
      controlRevision: 0,
      flow: {
        id: 'flow-invalid-revision',
        organizationId: 'org-1',
        workspaceId: null,
        createdBy: 'user-1',
        name: 'Invalid revision flow',
        triggerConfig: {},
        workspace: null,
        steps: [],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
    };
    const ledger = { claimRun: jest.fn() };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-invalid-revision',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: -1,
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as any),
    ).rejects.toThrow('invalid control revision');
    expect(ledger.claimRun).not.toHaveBeenCalled();
  });

  it('returns PAUSED after atomically checkpointing the completed step', async () => {
    const run = {
      id: 'automation-run-checkpoint-pause',
      flowId: 'flow-checkpoint-pause',
      controlRevision: 12,
      flow: {
        id: 'flow-checkpoint-pause',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Checkpoint pause flow',
        triggerConfig: {},
        workspace: null,
        steps: [
          { key: 'first', action: 'product.research', query: 'first' },
          { key: 'second', action: 'product.research', query: 'second' },
        ],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
    };
    const productResearch = {
      runAutomaticSelection: jest.fn().mockResolvedValue({
        reportId: 'report-first',
        candidateCount: 1,
      }),
    };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 12,
        checkpointStepIndex: null,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([]),
      claimStep: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 12,
        checkpointStepIndex: null,
      }),
      finishStep: jest.fn().mockResolvedValue({
        outcome: 'paused',
        controlRevision: 13,
        checkpointStepIndex: 1,
      }),
      failStep: jest.fn(),
      finishRun: jest.fn(),
      releaseRun: jest.fn(),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-checkpoint-pause',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 12,
        },
        updateProgress: jest.fn(),
      } as any),
    ).resolves.toEqual({
      status: 'paused',
      automationRunId: run.id,
      controlRevision: 13,
      checkpointStepIndex: 1,
    });
    expect(productResearch.runAutomaticSelection).toHaveBeenCalledTimes(1);
    expect(ledger.finishStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepIndex: 0,
        expectedControlRevision: 12,
      }),
    );
    expect(ledger.claimStep).toHaveBeenCalledTimes(1);
    expect(ledger.finishRun).not.toHaveBeenCalled();
    expect(ledger.releaseRun).not.toHaveBeenCalled();
  });

  it('does not publish successful-run side effects when STOP wins finalization', async () => {
    const run = {
      id: 'automation-run-final-stop',
      flowId: 'flow-final-stop',
      controlRevision: 20,
      flow: {
        id: 'flow-final-stop',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Final stop flow',
        triggerConfig: {},
        workspace: null,
        steps: [],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn() },
    };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 20,
        checkpointStepIndex: null,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([]),
      finishRun: jest.fn().mockResolvedValue({
        outcome: 'stopped',
        controlRevision: 21,
      }),
      releaseRun: jest.fn(),
    };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-final-stop',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 20,
        },
        updateProgress: jest.fn(),
      } as any),
    ).resolves.toEqual({
      status: 'stopped',
      automationRunId: run.id,
      controlRevision: 21,
    });
    expect(ledger.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({ expectedControlRevision: 20 }),
    );
    expect(prisma.automationFlow.update).not.toHaveBeenCalled();
    expect(ledger.releaseRun).not.toHaveBeenCalled();
  });

  it('fails closed instead of replaying a step when its checkpoint ledger is inconsistent', async () => {
    const run = {
      id: 'automation-run-checkpoint-inconsistent',
      flowId: 'flow-checkpoint-inconsistent',
      controlRevision: 30,
      flow: {
        id: 'flow-checkpoint-inconsistent',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Checkpoint consistency flow',
        triggerConfig: {},
        workspace: null,
        steps: [{ key: 'research', action: 'product.research', query: 'ozon' }],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn() },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 30,
        checkpointStepIndex: 1,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([]),
      claimStep: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 30,
        checkpointStepIndex: 1,
      }),
      finishStep: jest.fn().mockResolvedValue({
        outcome: 'continue',
        controlRevision: 30,
        checkpointStepIndex: 1,
      }),
      finishRun: jest.fn().mockResolvedValue({
        outcome: 'completed',
        controlRevision: 30,
      }),
      failStep: jest.fn(),
      releaseRun: jest.fn().mockResolvedValue(true),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-checkpoint-inconsistent',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 30,
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as any),
    ).rejects.toThrow('checkpoint ledger is inconsistent');
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
    expect(ledger.releaseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedControlRevision: 30,
        finalAttempt: true,
      }),
    );
  });

  it('does not start the next step when PAUSE wins the step-boundary claim', async () => {
    const run = {
      id: 'automation-run-step-boundary-pause',
      flowId: 'flow-step-boundary-pause',
      controlRevision: 40,
      flow: {
        id: 'flow-step-boundary-pause',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Step boundary pause flow',
        triggerConfig: {},
        workspace: null,
        steps: [{ key: 'research', action: 'product.research', query: 'ozon' }],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 40,
        checkpointStepIndex: null,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([]),
      claimStep: jest.fn().mockResolvedValue({
        outcome: 'paused',
        controlRevision: 41,
        checkpointStepIndex: null,
      }),
      releaseRun: jest.fn(),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-step-boundary-pause',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 40,
        },
        updateProgress: jest.fn(),
      } as any),
    ).resolves.toEqual({
      status: 'paused',
      automationRunId: run.id,
      controlRevision: 41,
      checkpointStepIndex: null,
    });
    expect(ledger.claimStep).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedControlRevision: 40,
        expectedCheckpointStepIndex: null,
      }),
    );
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
    expect(ledger.releaseRun).not.toHaveBeenCalled();
  });

  it('does not emit terminal failure side effects after losing the run lease', async () => {
    const run = {
      id: 'automation-run-stale-release',
      flowId: 'flow-stale-release',
      controlRevision: 50,
      flow: {
        id: 'flow-stale-release',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Stale release flow',
        triggerConfig: {},
        workspace: null,
        steps: [],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn() },
      notification: { create: jest.fn() },
    };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 50,
        checkpointStepIndex: null,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([]),
      finishRun: jest.fn().mockRejectedValue(new Error('stale finisher')),
      releaseRun: jest.fn().mockResolvedValue(false),
    };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-stale-release',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 50,
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as any),
    ).resolves.toEqual({
      status: 'stale_lease',
      automationRunId: run.id,
      controlRevision: 50,
    });
    expect(prisma.automationFlow.update).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('executes the immutable run step snapshot when the live flow was edited', async () => {
    const run = {
      id: 'automation-run-snapshot-steps',
      flowId: 'flow-snapshot-steps',
      controlRevision: 60,
      jobSnapshot: {
        steps: [
          {
            key: 'operation',
            action: 'product.research',
            query: 'snapshot query',
          },
        ],
      },
      flow: {
        id: 'flow-snapshot-steps',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        name: 'Immutable snapshot flow',
        triggerConfig: {},
        workspace: null,
        steps: [
          {
            key: 'operation',
            action: 'listing.draft',
            productName: 'edited live flow',
          },
        ],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn().mockResolvedValue({}) },
    };
    const productResearch = {
      runAutomaticSelection: jest.fn().mockResolvedValue({
        reportId: 'snapshot-report',
        candidateCount: 1,
      }),
    };
    const listings = { generate: jest.fn() };
    const { ledger } = createInMemoryStepLedger();
    ledger.claimRun.mockResolvedValue({
      outcome: 'claimed',
      controlRevision: 60,
      checkpointStepIndex: null,
    });
    ledger.finishRun.mockResolvedValue({
      outcome: 'completed',
      controlRevision: 60,
    });
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      listings as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-snapshot-steps',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 60,
        },
        updateProgress: jest.fn(),
      } as any),
    ).resolves.toEqual({ status: 'completed', automationRunId: run.id });
    expect(productResearch.runAutomaticSelection).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'snapshot query' }),
    );
    expect(listings.generate).not.toHaveBeenCalled();
  });

  it('fails closed when a modern run is missing its immutable step snapshot', async () => {
    const run = {
      id: 'automation-run-missing-snapshot-steps',
      flowId: 'flow-missing-snapshot-steps',
      status: 'PENDING',
      triggerSource: 'manual',
      idempotencyKey: 'missing-snapshot-steps-key',
      controlRevision: 70,
      jobSnapshot: { trigger: 'manual' },
      flow: {
        id: 'flow-missing-snapshot-steps',
        organizationId: 'org-1',
        workspaceId: null,
        createdBy: 'user-1',
        name: 'Missing snapshot flow',
        triggerConfig: {},
        workspace: null,
        steps: [
          { key: 'research', action: 'product.research', query: 'live flow' },
        ],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn() },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 70,
        checkpointStepIndex: null,
      }),
      releaseRun: jest.fn().mockResolvedValue(true),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-missing-snapshot-steps',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          controlRevision: 70,
          idempotencyKey: 'missing-snapshot-steps-key',
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as any),
    ).rejects.toThrow('immutable step snapshot is missing');
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
  });

  it('rejects a modern terminal ledger when its checkpoint is still zero', async () => {
    const run = {
      id: 'automation-run-zero-checkpoint-ledger',
      flowId: 'flow-zero-checkpoint-ledger',
      status: 'PENDING',
      triggerSource: 'manual',
      idempotencyKey: 'zero-checkpoint-ledger-key',
      controlRevision: 75,
      jobSnapshot: {
        steps: [
          { key: 'research', action: 'product.research', query: 'snapshot' },
        ],
      },
      flow: {
        id: 'flow-zero-checkpoint-ledger',
        organizationId: 'org-1',
        workspaceId: null,
        createdBy: 'user-1',
        name: 'Zero checkpoint ledger flow',
        triggerConfig: {},
        workspace: null,
        steps: [],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn().mockResolvedValue({}) },
    };
    const productResearch = { runAutomaticSelection: jest.fn() };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 75,
        checkpointStepIndex: null,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([
        {
          stepKey: 'research',
          stepIndex: 0,
          action: 'product.research',
          result: { status: 'completed' },
        },
      ]),
      releaseRun: jest.fn().mockResolvedValue(true),
    };
    const worker = new AutomationWorker(
      prisma as any,
      productResearch as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );

    await expect(
      worker.process({
        id: 'job-zero-checkpoint-ledger',
        data: {
          automationRunId: run.id,
          organizationId: 'org-1',
          idempotencyKey: run.idempotencyKey,
          controlRevision: 75,
        },
        updateProgress: jest.fn(),
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as any),
    ).rejects.toThrow('checkpoint ledger is inconsistent');
    expect(productResearch.runAutomaticSelection).not.toHaveBeenCalled();
  });

  it('self-heals a stale retry payload after the first Redis update fails', async () => {
    const run = {
      id: 'automation-run-retry-revision',
      flowId: 'flow-retry-revision',
      status: 'PENDING',
      triggerSource: 'legacy',
      controlRevision: 80,
      flow: {
        id: 'flow-retry-revision',
        organizationId: 'org-1',
        workspaceId: null,
        createdBy: 'user-1',
        name: 'Retry revision flow',
        triggerConfig: {},
        workspace: null,
        steps: [],
      },
    };
    const prisma = {
      automationRun: { findUnique: jest.fn().mockResolvedValue(run) },
      automationFlow: { update: jest.fn() },
    };
    const ledger = {
      claimRun: jest.fn().mockResolvedValue({
        outcome: 'claimed',
        controlRevision: 81,
        checkpointStepIndex: null,
      }),
      loadTerminalSteps: jest.fn().mockResolvedValue([]),
      finishRun: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValue({
          outcome: 'completed',
          controlRevision: 81,
        }),
      releaseRun: jest.fn().mockImplementation(async () => {
        run.controlRevision = 81;
        run.status = 'PENDING';
        return true;
      }),
    };
    const worker = new AutomationWorker(
      prisma as any,
      { runAutomaticSelection: jest.fn() } as any,
      tenantDatabase(prisma) as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ledger as any,
    );
    const job = {
      id: 'job-retry-revision',
      data: {
        automationRunId: run.id,
        organizationId: 'org-1',
        controlRevision: 80,
      },
      updateProgress: jest.fn(),
      updateData: jest
        .fn()
        .mockRejectedValueOnce(new Error('Redis update failed'))
        .mockRejectedValueOnce(new Error('Redis update failed'))
        .mockImplementation(async (data) => {
          Object.assign(job.data, data);
        }),
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await expect(worker.process(job as any)).rejects.toThrow(
      'Redis update failed',
    );
    expect(ledger.releaseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedControlRevision: 81,
        finalAttempt: false,
      }),
    );
    job.attemptsMade = 1;
    await expect(worker.process(job as any)).rejects.toThrow(
      'Redis update failed',
    );
    expect(ledger.claimRun).toHaveBeenCalledTimes(1);
    job.attemptsMade = 2;
    await expect(worker.process(job as any)).resolves.toEqual({
      status: 'completed',
      automationRunId: run.id,
    });
    expect(job.updateData).toHaveBeenCalledTimes(3);
    expect(job.updateData).toHaveBeenLastCalledWith({
      ...job.data,
      controlRevision: 81,
    });
    expect(ledger.claimRun).toHaveBeenCalledTimes(2);
    expect(ledger.finishRun).toHaveBeenCalledTimes(2);
  });
});
