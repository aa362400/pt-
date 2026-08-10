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
  const ledger = {
    claimRun: jest.fn().mockResolvedValue(true),
    loadTerminalSteps: jest.fn().mockImplementation(async () =>
      [...executions.entries()]
        .filter(([, execution]) =>
          ['COMPLETED', 'BLOCKED'].includes(execution.status),
        )
        .map(([stepKey, execution]) => ({
          stepKey,
          result: execution.result,
        })),
    ),
    claimStep: jest.fn().mockResolvedValue(true),
    finishStep: jest.fn().mockImplementation(async (input) => {
      executions.set(input.stepKey, {
        status: input.result.status === 'completed' ? 'COMPLETED' : 'BLOCKED',
        result: input.result,
      });
    }),
    failStep: jest.fn().mockImplementation(async (input) => {
      executions.set(input.stepKey, { status: 'FAILED' });
    }),
    finishRun: jest.fn().mockResolvedValue(undefined),
    releaseRun: jest.fn().mockResolvedValue(undefined),
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
                query: 'Ozon english_text',
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
        query: 'Ozon english_text',
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
          flow: {
            id: 'flow-continuous-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdBy: 'user-1',
            name: '[agentautomatictext] Ozon product researchtext',
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
            name: '[agentautomatictext] Ozon product researchtext',
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
                query: 'Ozon english_text',
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
        title: 'agentautomatictextfailed：[agentautomatictext] Ozon product researchtext',
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
            name: '[agentautomatictext] Ozon product researchtext',
            triggerConfig: { source: 'connected_store_operator' },
            workspace: null,
            steps: [{ action: 'product.research', query: 'Ozon text' }],
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
      claimRun: jest.fn().mockResolvedValue(false),
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
});
