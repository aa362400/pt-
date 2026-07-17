import { ProductLaunchWorker } from '../src/workers/product-launch.worker.js';
import {
  hashPublishExecutionGrant,
  OZON_LISTING_PUBLISH_CAPABILITY,
} from '../src/features/product-launch/publish-execution-grant.js';

const publishExecutionGrant = 'plg_worker-test-grant';
const preparationAttemptId = 'preparation-attempt-1';
const prepareJobData = {
  productLaunchId: 'launch-1',
  organizationId: 'org-1',
  preparationAttemptId,
};
const publishJobData = {
  productLaunchId: 'launch-1',
  organizationId: 'org-1',
  publishExecutionGrant,
};

function createWorker() {
  const defaultPublishApprovedAt = new Date();
  const launch = {
    id: 'launch-1',
    organizationId: 'org-1',
    reviewTaskId: 'review-1',
    candidateId: 'report-1:0',
    productId: 'product-1',
    requestedBy: 'user-1',
    imageGenerationApproved: true,
    confirmAutoPublish: false,
    status: 'QUEUED',
    imageProjectId: null,
    referenceAssetId: 'asset-1',
    referenceAssetSha256: 'a'.repeat(64),
    listingDraftId: null,
    publishReviewTaskId: null,
    approvedContentHash: null,
    selectedPublishSnapshotId: null,
    approvedPublishSnapshotHash: null,
    publishExecutionGrantHash: hashPublishExecutionGrant(publishExecutionGrant),
    publishExecutionGrantScope: OZON_LISTING_PUBLISH_CAPABILITY,
    publishExecutionGrantSnapshotHash: 'c'.repeat(64),
    publishExecutionGrantExpiresAt: new Date(Date.now() + 60_000),
    publishExecutionGrantConsumedAt: null,
    publishApprovedBy: 'user-1',
    publishApprovedAt: defaultPublishApprovedAt,
    execution: {
      preparationAttemptId,
      publishStepUp: {
        type: 'mfa-step-up/v1',
        actorId: 'user-1',
        amr: ['pwd', 'otp'],
        mfaAt: Math.floor(defaultPublishApprovedAt.getTime() / 1000),
      },
    },
    product: {
      id: 'product-1',
      workspaceId: 'workspace-1',
      title: 'Portable tea set',
      sku: 'AGENT-TEA-1',
      status: 'DRAFT',
      images: [],
      metadata: { source: 'agent-product-research' },
    },
  };
  const prisma: any = {
    organization: {
      findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
    },
    channelConnection: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'channel-1',
          provider: 'OZON',
          externalShopId: 'seller-1',
          syncStatus: 'SUCCESS',
        },
      ]),
    },
    listingPublishSnapshot: {
      findFirst: jest.fn().mockResolvedValue({
        snapshot: { channelId: 'channel-1' },
      }),
    },
    productLaunch: {
      findUnique: jest.fn().mockResolvedValue(launch),
      findFirst: jest.fn().mockResolvedValue(launch),
      update: jest.fn().mockResolvedValue(launch),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    product: { update: jest.fn().mockResolvedValue(launch.product) },
    agentRun: {
      create: jest.fn().mockResolvedValue({ id: 'agent-run-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    imagePromptProject: { create: jest.fn() },
    listingDraft: { findFirst: jest.fn() },
    reviewTask: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    },
  };
  const agentProvider = {
    runImageGeneration: jest.fn().mockResolvedValue({
      mockMode: true,
      images: [{ url: 'https://example.com/mock.png' }],
      sessionId: 'mock-session',
    }),
  };
  const ozonPublisher = {
    preflightProduct: jest.fn().mockResolvedValue(null),
    preflightSnapshot: jest.fn().mockResolvedValue(null),
    publishProduct: jest.fn(),
    publishSnapshot: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const listings = {
    generateForProductLaunch: jest.fn(),
    attachMediaForReview: jest.fn(),
  };
  const review = { createFromAgentRun: jest.fn() };
  const files = {
    readImageDataUrl: jest.fn().mockResolvedValue({
      dataUrl: 'data:image/png;base64,cmVmZXJlbmNl',
      asset: {
        id: 'asset-1',
        sha256: 'a'.repeat(64),
        mimeType: 'image/png',
      },
    }),
  };
  const visualQa = {
    evaluate: jest.fn().mockReturnValue({
      schemaVersion: 'visual-qa/v1',
      outcome: 'PASSED',
      score: 100,
      evaluatedAt: '2026-07-12T08:00:00.000Z',
      checks: [],
    }),
  };
  const notificationEvents = { publishCreated: jest.fn() };
  const tenantDatabase = {
    run: jest.fn((organizationId, operation) => operation(prisma)),
  };
  const externalSubmissions = {
    prepare: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'PREPARED',
    }),
    find: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'PREPARED',
    }),
    claimForSend: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'REQUEST_SENT',
    }),
    claimLaunchForSend: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'CLAIMED',
      claimToken: 'claim-token',
    }),
    markRequestStarted: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'REQUEST_SENT',
      claimToken: 'claim-token',
    }),
    markRetryableFailureBeforeDispatch: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'RETRYABLE_FAILED',
    }),
    recordResult: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'ACKNOWLEDGED',
    }),
    recordUnknown: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'UNKNOWN',
    }),
    beginReconciliation: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'RECONCILING',
    }),
    recordReconciledResult: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'ACKNOWLEDGED',
    }),
  };
  const listingSandbox = {
    assertPublishable: jest.fn().mockResolvedValue({
      id: 'sandbox-1',
      status: 'PASSED',
      riskLevel: 'LOW',
      blocking: false,
    }),
  };
  const actionProposals = {
    create: jest.fn().mockResolvedValue({
      proposal: { id: 'approval-item-1', status: 'PENDING' },
      notification: { id: 'notification-1' },
    }),
    reconcileApprovedProductLaunchOutcome: jest.fn().mockResolvedValue({
      updated: true,
      proposalId: 'approval-item-1',
    }),
  };
  const agentPermissions = {
    check: jest.fn().mockResolvedValue({
      allowed: true,
      level: 4,
      requireConfirm: true,
    }),
  };
  const organizationControl = {
    lockEffectiveState: jest.fn().mockResolvedValue({
      state: 'RUNNING',
      revision: 0,
    }),
  };

  return {
    worker: new (ProductLaunchWorker as any)(
      prisma,
      agentProvider,
      ozonPublisher,
      audit,
      listings,
      review,
      files,
      visualQa,
      tenantDatabase,
      externalSubmissions,
      listingSandbox,
      actionProposals,
      agentPermissions,
      organizationControl,
      notificationEvents,
    ) as ProductLaunchWorker,
    prisma,
    agentProvider,
    ozonPublisher,
    audit,
    listings,
    review,
    files,
    visualQa,
    notificationEvents,
    tenantDatabase,
    externalSubmissions,
    listingSandbox,
    actionProposals,
    agentPermissions,
    organizationControl,
    launch,
  };
}

describe('ProductLaunchWorker', () => {
  it.each([
    ['PAUSE_REQUESTED', 'PAUSED', 'PRODUCT_LAUNCH_PAUSED_BEFORE_PREPARATION'],
    ['STOP_REQUESTED', 'BLOCKED', 'PRODUCT_LAUNCH_STOPPED_BEFORE_PREPARATION'],
  ] as const)(
    'does not start local preparation when organization control is %s',
    async (controlState, expectedStatus, expectedCode) => {
      const {
        worker,
        organizationControl,
        agentProvider,
        ozonPublisher,
        listings,
      } = createWorker();
      organizationControl.lockEffectiveState.mockResolvedValue({
        state: controlState,
        revision: 9,
      });

      await expect(
        worker.process({ data: prepareJobData } as any),
      ).resolves.toMatchObject({
        status: expectedStatus,
        code: expectedCode,
        controlRevision: 9,
      });

      expect(ozonPublisher.preflightProduct).not.toHaveBeenCalled();
      expect(agentProvider.runImageGeneration).not.toHaveBeenCalled();
      expect(listings.generateForProductLaunch).not.toHaveBeenCalled();
    },
  );

  it('skips a retained preparation job whose attempt no longer owns the launch', async () => {
    const { worker, prisma, agentProvider, ozonPublisher } = createWorker();

    const result = await worker.process({
      data: {
        ...prepareJobData,
        preparationAttemptId: 'stale-preparation-attempt',
      },
    } as any);

    expect(result).toEqual({
      status: 'skipped',
      reason: 'stale_preparation_attempt',
      productLaunchId: 'launch-1',
    });
    expect(prisma.productLaunch.updateMany).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(agentProvider.runImageGeneration).not.toHaveBeenCalled();
    expect(ozonPublisher.preflightProduct).not.toHaveBeenCalled();
  });

  it('blocks incomplete Ozon launches before consuming image generation credits', async () => {
    const { worker, prisma, agentProvider, ozonPublisher } = createWorker();
    ozonPublisher.preflightProduct.mockResolvedValue({
      status: 'BLOCKED',
      code: 'OZON_IMPORT_CONFIGURATION_INCOMPLETE',
      message: 'Ozon 上架资料不完整：类目 ID。',
      channelId: 'channel-1',
    });

    const result = await worker.process({ data: prepareJobData } as any);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        productLaunchId: 'launch-1',
        productId: 'product-1',
      }),
    );
    expect(agentProvider.runImageGeneration).not.toHaveBeenCalled();
    expect(ozonPublisher.publishProduct).not.toHaveBeenCalled();
    expect(prisma.imagePromptProject.create).not.toHaveBeenCalled();
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'launch-1' },
        data: expect.objectContaining({
          status: 'BLOCKED',
          imageProjectId: null,
          failureCode: 'OZON_IMPORT_CONFIGURATION_INCOMPLETE',
        }),
      }),
    );
  });

  it('never writes a mock image result to the product or submits it to Ozon', async () => {
    const { worker, prisma, agentProvider, ozonPublisher, tenantDatabase } =
      createWorker();

    await expect(
      worker.process({
        data: prepareJobData,
      } as any),
    ).rejects.toThrow('mockMode');

    expect(agentProvider.runImageGeneration).toHaveBeenCalled();
    expect(prisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          agentType: 'IMAGE_CREATIVE',
          status: 'RUNNING',
        }),
      }),
    );
    expect(prisma.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-run-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.imagePromptProject.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(ozonPublisher.publishProduct).not.toHaveBeenCalled();
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'launch-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'IMAGE_PROVIDER_MOCK_NOT_ALLOWED',
        }),
      }),
    );
  });

  it('requires an immutable reference asset before consuming image credits', async () => {
    const { worker, prisma, agentProvider, ozonPublisher, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      referenceAssetId: null,
      referenceAssetSha256: null,
    });

    await expect(
      worker.process({
        data: prepareJobData,
      } as any),
    ).rejects.toMatchObject({ code: 'IMAGE_REFERENCE_REQUIRED' });

    expect(agentProvider.runImageGeneration).not.toHaveBeenCalled();
    expect(ozonPublisher.publishProduct).not.toHaveBeenCalled();
  });

  it('prepares real images and a listing review, then stops before any Ozon write', async () => {
    const {
      worker,
      prisma,
      agentProvider,
      ozonPublisher,
      listings,
      review,
      actionProposals,
    } = createWorker();
    agentProvider.runImageGeneration.mockResolvedValue({
      mockMode: false,
      sessionId: 'real-session',
      images: [
        {
          sceneId: 'primary',
          url: 'https://assets.example.com/primary.png',
          sha256: 'b'.repeat(64),
        },
        {
          sceneId: 'detail',
          url: 'https://assets.example.com/detail.png',
          sha256: 'c'.repeat(64),
        },
      ],
      consistencyScore: 92,
      consistencyPassed: true,
      compliancePassed: true,
      externalConsistencyStatus: 'passed',
      externalConsistencyScore: 94,
      externalConsistencyIssues: [],
      profile: { material: 'ceramic', shape: 'round' },
    });
    prisma.imagePromptProject.create.mockResolvedValue({
      id: 'image-project-1',
      generatedAssets: [],
    });
    listings.generateForProductLaunch.mockResolvedValue({ id: 'listing-1' });
    listings.attachMediaForReview.mockResolvedValue({
      id: 'listing-1',
      score: 90,
      status: 'IN_REVIEW',
      contentHash: 'a'.repeat(64),
    });
    review.createFromAgentRun.mockResolvedValue({
      id: 'listing-review-1',
      status: 'PENDING',
    });

    const result = await worker.process({ data: prepareJobData } as any);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'AWAITING_PUBLISH_APPROVAL',
        listingDraftId: 'listing-1',
        publishReviewTaskId: 'listing-review-1',
      }),
    );
    expect(listings.generateForProductLaunch).toHaveBeenCalled();
    expect(agentProvider.runImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64: 'data:image/png;base64,cmVmZXJlbmNl',
      }),
      expect.any(Object),
    );
    expect(listings.attachMediaForReview).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', orgId: 'org-1' }),
      'listing-1',
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://assets.example.com/primary.png',
        }),
      ]),
      'PUBLISH_REVIEW',
    );
    expect(review.createFromAgentRun).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        entityType: 'LISTING_DRAFT',
        entityId: 'listing-1',
      }),
    );
    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        action: {
          label: '确认发布到 Ozon',
          name: 'product-launch.confirm-publish',
          params: { productLaunchId: 'launch-1' },
        },
        context: expect.objectContaining({
          kind: 'product_launch_publish_review',
          riskLevel: 'high',
          resourceId: 'launch-1',
        }),
      }),
    );
    expect(ozonPublisher.publishProduct).not.toHaveBeenCalled();
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'launch-1' },
        data: expect.objectContaining({
          status: 'AWAITING_PUBLISH_APPROVAL',
          listingDraftId: 'listing-1',
          publishReviewTaskId: 'listing-review-1',
        }),
      }),
    );
  });

  it('generates creative-only assets and a data-insufficient draft without creating any publish path', async () => {
    const {
      worker,
      prisma,
      agentProvider,
      ozonPublisher,
      listings,
      review,
      actionProposals,
      externalSubmissions,
      launch,
    } = createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      candidateId: 'candidate-daily-1',
      execution: {
        preparationMode: 'CREATIVE_ONLY',
        preparationAttemptId,
        pricingStatus: 'DATA_INSUFFICIENT',
        publishable: false,
        ozonSubmission: 'not_authorized',
      },
    });
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-1',
      decisionEvidence: {
        candidateId: 'candidate-daily-1',
        creativePreparation: { state: 'QUEUED' },
      },
    });
    agentProvider.runImageGeneration.mockResolvedValue({
      mockMode: false,
      sessionId: 'real-creative-session',
      images: [
        {
          sceneId: 'primary',
          url: 'https://assets.example.com/creative-primary.png',
          sha256: 'd'.repeat(64),
        },
      ],
      consistencyScore: 92,
      consistencyPassed: true,
      compliancePassed: true,
      externalConsistencyStatus: 'passed',
      externalConsistencyScore: 94,
      externalConsistencyIssues: [],
      profile: { material: 'plastic', shape: 'rectangular' },
    });
    prisma.imagePromptProject.create.mockResolvedValue({
      id: 'image-project-creative-1',
      generatedAssets: [],
    });
    listings.generateForProductLaunch.mockResolvedValue({
      id: 'listing-creative-1',
    });
    listings.attachMediaForReview.mockResolvedValue({
      id: 'listing-creative-1',
      score: 88,
      status: 'DRAFT',
      contentHash: 'e'.repeat(64),
    });

    const result = await worker.process({ data: prepareJobData } as any);

    expect(result).toEqual({
      status: 'AWAITING_ECONOMICS_REVIEW',
      productLaunchId: 'launch-1',
      productId: 'product-1',
      imageProjectId: 'image-project-creative-1',
      listingDraftId: 'listing-creative-1',
      publishReviewTaskId: null,
    });
    expect(listings.attachMediaForReview).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', orgId: 'org-1' }),
      'listing-creative-1',
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://assets.example.com/creative-primary.png',
          sha256: 'd'.repeat(64),
        }),
      ]),
      'CREATIVE_DRAFT',
    );
    expect(review.createFromAgentRun).not.toHaveBeenCalled();
    expect(actionProposals.create).not.toHaveBeenCalled();
    expect(ozonPublisher.preflightProduct).not.toHaveBeenCalled();
    expect(ozonPublisher.preflightSnapshot).not.toHaveBeenCalled();
    expect(ozonPublisher.publishProduct).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(externalSubmissions.claimLaunchForSend).not.toHaveBeenCalled();
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'launch-1' },
        data: expect.objectContaining({
          status: 'AWAITING_ECONOMICS_REVIEW',
          publishReviewTaskId: null,
          confirmAutoPublish: false,
          execution: expect.objectContaining({
            preparationMode: 'CREATIVE_ONLY',
            pricingStatus: 'DATA_INSUFFICIENT',
            publishable: false,
            ozonSubmission: 'not_authorized',
          }),
        }),
      }),
    );
    expect(prisma.reviewTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-1' },
        data: expect.objectContaining({
          decisionEvidence: expect.objectContaining({
            creativePreparation: expect.objectContaining({
              state: 'COMPLETED',
              publishable: false,
              externalStoreMutation: 'not_executed',
            }),
          }),
        }),
      }),
    );
  });

  it('persists failed visual QA and stops before listing generation', async () => {
    const { worker, prisma, agentProvider, listings, ozonPublisher, visualQa } =
      createWorker();
    agentProvider.runImageGeneration.mockResolvedValue({
      mockMode: false,
      sessionId: 'real-session',
      images: [
        {
          sceneId: 'primary',
          filename: 'primary.png',
          url: 'https://assets.example.com/primary.png',
          width: 1200,
          height: 1200,
          mimeType: 'image/png',
          sha256: 'b'.repeat(64),
          byteSize: 240_000,
        },
      ],
      consistencyScore: 45,
      consistencyPassed: false,
      compliancePassed: true,
      profile: { material: 'ceramic' },
    });
    visualQa.evaluate.mockReturnValue({
      schemaVersion: 'visual-qa/v1',
      outcome: 'FAILED',
      score: 55,
      evaluatedAt: '2026-07-12T08:00:00.000Z',
      checks: [
        {
          id: 'consistency',
          status: 'FAIL',
          code: 'CONSISTENCY_QA_FAILED',
          message: 'failed',
          evidence: {},
        },
      ],
    });
    prisma.imagePromptProject.create.mockResolvedValue({
      id: 'image-project-failed',
      generatedAssets: [],
    });

    await expect(
      worker.process({
        data: prepareJobData,
      } as any),
    ).rejects.toMatchObject({ code: 'VISUAL_QA_FAILED' });

    expect(prisma.imagePromptProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          qaStatus: 'FAILED',
          qaResult: expect.objectContaining({ outcome: 'FAILED' }),
        }),
      }),
    );
    expect(listings.generateForProductLaunch).not.toHaveBeenCalled();
    expect(ozonPublisher.publishProduct).not.toHaveBeenCalled();
  });

  it('blocks the external phase before Ozon when the one-time publish grant is missing', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });

    await expect(
      worker.process({
        data: { productLaunchId: 'launch-1', organizationId: 'org-1' },
      } as any),
    ).resolves.toMatchObject({
      status: 'AWAITING_PUBLISH_APPROVAL',
      code: 'PUBLISH_EXECUTION_GRANT_INVALID',
    });

    expect(ozonPublisher.preflightSnapshot).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
    expect(externalSubmissions.claimLaunchForSend).not.toHaveBeenCalled();
    expect(externalSubmissions.markRequestStarted).not.toHaveBeenCalled();
    expect(prisma.productLaunch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['QUEUED', 'SUBMITTING_TO_OZON'] },
          confirmAutoPublish: true,
          externalSubmissions: expect.any(Object),
        }),
        data: expect.objectContaining({
          status: 'AWAITING_PUBLISH_APPROVAL',
          confirmAutoPublish: false,
          publishExecutionGrantHash: null,
          failureCode: 'PUBLISH_REAPPROVAL_REQUIRED',
        }),
      }),
    );
  });

  it('returns a valid grant without durable MFA attestation to explicit approval before Ozon preflight', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: new Date(),
      execution: {},
    });
    ozonPublisher.preflightSnapshot.mockResolvedValue({
      status: 'BLOCKED',
      code: 'TEST_PREFLIGHT_BLOCKED',
      message: 'The MFA gate must run before this preflight.',
    });

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toMatchObject({
      status: 'AWAITING_PUBLISH_APPROVAL',
      code: 'PUBLISH_STEP_UP_REQUIRED',
    });

    expect(ozonPublisher.preflightSnapshot).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(externalSubmissions.claimLaunchForSend).not.toHaveBeenCalled();
  });

  it('accepts MFA that was fresh at approval time when the independent execution grant is still live', async () => {
    const approvalAt = new Date('2026-07-16T08:00:00.000Z');
    const workerStartedAt = new Date(approvalAt.getTime() + 2_000);
    jest.useFakeTimers().setSystemTime(workerStartedAt);
    try {
      const { worker, prisma, ozonPublisher, launch } = createWorker();
      const contentHash = 'a'.repeat(64);
      prisma.productLaunch.findFirst.mockResolvedValue({
        ...launch,
        status: 'QUEUED',
        confirmAutoPublish: true,
        imageProjectId: 'image-project-1',
        listingDraftId: 'listing-1',
        publishReviewTaskId: 'listing-review-1',
        approvedContentHash: contentHash,
        selectedPublishSnapshotId: 'snapshot-1',
        approvedPublishSnapshotHash: 'c'.repeat(64),
        publishApprovedBy: 'user-1',
        publishApprovedAt: approvalAt,
        publishExecutionGrantExpiresAt: new Date(
          approvalAt.getTime() + 5 * 60_000,
        ),
        execution: {
          publishStepUp: {
            type: 'mfa-step-up/v1',
            actorId: 'user-1',
            amr: ['pwd', 'otp'],
            mfaAt: Math.floor(approvalAt.getTime() / 1000) - 299,
          },
        },
      });
      prisma.listingDraft.findFirst.mockResolvedValue({
        id: 'listing-1',
        status: 'APPROVED',
        contentHash,
        evaluationResult: { outcome: 'QUALIFIED' },
      });
      prisma.reviewTask.findFirst.mockResolvedValue({
        id: 'listing-review-1',
        status: 'APPROVED',
        entityType: 'LISTING_DRAFT',
        entityId: 'listing-1',
        decisionEvidence: {
          approvedContentSha256: contentHash,
          evaluatorOutcome: 'QUALIFIED',
        },
      });
      ozonPublisher.publishSnapshot.mockImplementation(
        async (
          _input: unknown,
          hooks: { beforeDispatch: () => Promise<void> },
        ) => {
          await hooks.beforeDispatch();
          return {
            status: 'SUBMITTED_TO_OZON',
            channelId: 'channel-1',
            taskId: 42,
          };
        },
      );

      await expect(
        worker.process({ data: publishJobData } as any),
      ).resolves.toEqual(
        expect.objectContaining({ status: 'SUBMITTED_TO_OZON', taskId: 42 }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects an expired execution grant even when MFA was fresh at approval time', async () => {
    const approvalAt = new Date('2026-07-16T08:00:00.000Z');
    jest
      .useFakeTimers()
      .setSystemTime(new Date(approvalAt.getTime() + 5 * 60_000 + 1));
    try {
      const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
        createWorker();
      prisma.productLaunch.findFirst.mockResolvedValue({
        ...launch,
        status: 'QUEUED',
        confirmAutoPublish: true,
        imageProjectId: 'image-project-1',
        listingDraftId: 'listing-1',
        publishReviewTaskId: 'listing-review-1',
        approvedContentHash: 'a'.repeat(64),
        selectedPublishSnapshotId: 'snapshot-1',
        approvedPublishSnapshotHash: 'c'.repeat(64),
        publishApprovedBy: 'user-1',
        publishApprovedAt: approvalAt,
        publishExecutionGrantExpiresAt: new Date(
          approvalAt.getTime() + 5 * 60_000,
        ),
        execution: {
          publishStepUp: {
            type: 'mfa-step-up/v1',
            actorId: 'user-1',
            amr: ['pwd', 'otp'],
            mfaAt: Math.floor(approvalAt.getTime() / 1000) - 299,
          },
        },
      });

      await expect(
        worker.process({ data: publishJobData } as any),
      ).resolves.toMatchObject({
        status: 'AWAITING_PUBLISH_APPROVAL',
        code: 'PUBLISH_EXECUTION_GRANT_INVALID',
      });

      expect(ozonPublisher.preflightSnapshot).not.toHaveBeenCalled();
      expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
      expect(externalSubmissions.prepare).not.toHaveBeenCalled();
      expect(prisma.productLaunch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'AWAITING_PUBLISH_APPROVAL',
            confirmAutoPublish: false,
            failureCode: 'PUBLISH_REAPPROVAL_REQUIRED',
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('requires reapproval when the grant expires after claim but before the Ozon request starts', async () => {
    const {
      worker,
      prisma,
      ozonPublisher,
      externalSubmissions,
      audit,
      launch,
    } = createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    externalSubmissions.markRequestStarted.mockRejectedValueOnce(
      Object.assign(new Error('Publish grant expired before dispatch'), {
        code: 'PUBLISH_EXECUTION_GRANT_INVALID',
      }),
    );
    let ozonImportCalls = 0;
    ozonPublisher.publishSnapshot.mockImplementation(
      async (
        _input: unknown,
        hooks: { beforeDispatch: () => Promise<void> },
      ) => {
        await hooks.beforeDispatch();
        ozonImportCalls += 1;
        return { status: 'SUBMITTED_TO_OZON', taskId: 42 };
      },
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toMatchObject({
      status: 'AWAITING_PUBLISH_APPROVAL',
      code: 'PUBLISH_EXECUTION_GRANT_INVALID',
    });

    expect(ozonImportCalls).toBe(0);
    expect(
      externalSubmissions.markRetryableFailureBeforeDispatch,
    ).toHaveBeenCalledTimes(1);
    expect(externalSubmissions.recordUnknown).not.toHaveBeenCalled();
    expect(
      audit.log.mock.calls.some(
        ([call]) => call.action === 'product-launch.failed',
      ),
    ).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product-launch.publish-reapproval-required',
      }),
    );
  });

  it('publishes only in the second phase after revalidating the locked approval hash', async () => {
    const {
      worker,
      prisma,
      agentProvider,
      ozonPublisher,
      listings,
      externalSubmissions,
      launch,
    } = createWorker();
    const contentHash = 'a'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: contentHash,
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    prisma.listingDraft.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'APPROVED',
      contentHash,
      evaluationResult: { outcome: 'QUALIFIED' },
    });
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'listing-review-1',
      status: 'APPROVED',
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-1',
      decisionEvidence: {
        approvedContentSha256: contentHash,
        evaluatorOutcome: 'QUALIFIED',
      },
    });
    ozonPublisher.publishSnapshot.mockImplementation(
      async (
        _input: unknown,
        hooks: { beforeDispatch: () => Promise<void> },
      ) => {
        await hooks.beforeDispatch();
        return {
          status: 'SUBMITTED_TO_OZON',
          channelId: 'channel-1',
          taskId: 42,
        };
      },
    );

    const result = await worker.process({ data: publishJobData } as any);

    expect(result).toEqual(
      expect.objectContaining({ status: 'SUBMITTED_TO_OZON', taskId: 42 }),
    );
    expect(agentProvider.runImageGeneration).not.toHaveBeenCalled();
    expect(listings.generateForProductLaunch).not.toHaveBeenCalled();
    expect(ozonPublisher.preflightSnapshot).toHaveBeenCalledWith({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      expectedSnapshotHash: 'c'.repeat(64),
    });
    expect(ozonPublisher.publishSnapshot).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        snapshotId: 'snapshot-1',
        expectedSnapshotHash: 'c'.repeat(64),
      },
      expect.objectContaining({ beforeDispatch: expect.any(Function) }),
    );
    expect(externalSubmissions.claimLaunchForSend).toHaveBeenCalledWith(
      expect.objectContaining({ publishSnapshotId: 'snapshot-1' }),
      expect.objectContaining({
        claimToken: expect.any(String),
        execution: expect.objectContaining({ ozonSubmission: 'claimed' }),
      }),
    );
    expect(externalSubmissions.markRequestStarted).toHaveBeenCalledWith(
      expect.objectContaining({ publishSnapshotId: 'snapshot-1' }),
      expect.any(String),
      publishExecutionGrant,
    );
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECOVERING',
          completedAt: null,
        }),
      }),
    );
  });

  it('marks the approval executed only when Ozon confirms the product is active', async () => {
    const { worker, prisma, ozonPublisher, actionProposals, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
    });
    ozonPublisher.preflightSnapshot.mockResolvedValue({
      status: 'ACTIVE_ON_OZON',
      channelId: 'channel-1',
      externalProductId: 'ozon-product-1',
    });

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(expect.objectContaining({ status: 'ACTIVE_ON_OZON' }));

    expect(
      actionProposals.reconcileApprovedProductLaunchOutcome,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        productLaunchId: 'launch-1',
        status: 'EXECUTED',
        result: expect.objectContaining({ status: 'ACTIVE_ON_OZON' }),
      }),
    );
  });

  it('blocks dispatch when the same Ozon seller is connected by multiple organizations', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    const contentHash = 'a'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: contentHash,
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    prisma.listingDraft.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'APPROVED',
      contentHash,
      evaluationResult: { outcome: 'QUALIFIED' },
    });
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'listing-review-1',
      status: 'APPROVED',
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-1',
      decisionEvidence: {
        approvedContentSha256: contentHash,
        evaluatorOutcome: 'QUALIFIED',
      },
    });
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1' },
      { id: 'org-2' },
    ]);
    prisma.channelConnection.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        provider: 'OZON',
        externalShopId: 'seller-1',
        syncStatus: 'SUCCESS',
      },
      {
        id: 'channel-2',
        provider: 'OZON',
        externalShopId: 'seller-1',
        syncStatus: 'SUCCESS',
      },
    ]);

    await expect(
      worker.process({ data: publishJobData } as any),
    ).rejects.toMatchObject({ code: 'OZON_STORE_OWNERSHIP_AMBIGUOUS' });

    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(ozonPublisher.preflightSnapshot).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
  });

  it('rechecks the organization kill switch and plan before external dispatch', async () => {
    const {
      worker,
      prisma,
      agentPermissions,
      ozonPublisher,
      externalSubmissions,
      launch,
    } = createWorker();
    const contentHash = 'a'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: contentHash,
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    agentPermissions.check.mockResolvedValue({
      allowed: false,
      level: 1,
      requireConfirm: false,
    });

    await expect(
      worker.process({ data: publishJobData } as any),
    ).rejects.toMatchObject({ code: 'AGENT_PUBLISH_PERMISSION_DENIED' });

    expect(agentPermissions.check).toHaveBeenCalledWith(
      'org-1',
      'ozon.listing.publish',
    );
    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
  });

  it('blocks the second phase when the immutable publish snapshot fails validation', async () => {
    const { worker, prisma, ozonPublisher, launch } = createWorker();
    const approvedHash = 'a'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: approvedHash,
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    ozonPublisher.preflightSnapshot.mockRejectedValue(
      Object.assign(new Error('Snapshot hash mismatch'), {
        code: 'PUBLISH_SNAPSHOT_HASH_MISMATCH',
      }),
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).rejects.toMatchObject({ code: 'PUBLISH_SNAPSHOT_HASH_MISMATCH' });
    expect(ozonPublisher.preflightProduct).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
  });

  it('rechecks the listing sandbox immediately before preparing an external submission', async () => {
    const {
      worker,
      prisma,
      ozonPublisher,
      externalSubmissions,
      listingSandbox,
      launch,
    } = createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    listingSandbox.assertPublishable.mockRejectedValue(
      Object.assign(new Error('Listing sandbox blocked this snapshot'), {
        code: 'LISTING_SANDBOX_BLOCKED',
      }),
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).rejects.toMatchObject({ code: 'LISTING_SANDBOX_BLOCKED' });

    expect(listingSandbox.assertPublishable).toHaveBeenCalledWith({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorRole: 'ADMIN',
    });
    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(ozonPublisher.preflightSnapshot).not.toHaveBeenCalled();
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
  });

  it('records an unknown external outcome when the Ozon request loses its response', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    ozonPublisher.publishSnapshot.mockImplementation(
      async (
        _input: unknown,
        hooks: { beforeDispatch: () => Promise<void> },
      ) => {
        await hooks.beforeDispatch();
        throw new Error('connection reset after request dispatch');
      },
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).rejects.toMatchObject({
      code: 'EXTERNAL_SUBMISSION_OUTCOME_UNKNOWN',
    });

    expect(externalSubmissions.claimLaunchForSend).toHaveBeenCalledTimes(1);
    expect(externalSubmissions.markRequestStarted).toHaveBeenCalledTimes(1);
    expect(externalSubmissions.recordUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ publishSnapshotId: 'snapshot-1' }),
      expect.any(Error),
      expect.any(String),
    );
    expect(
      externalSubmissions.markRetryableFailureBeforeDispatch,
    ).not.toHaveBeenCalled();
    expect(prisma.productLaunch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECOVERING',
          completedAt: null,
        }),
      }),
    );
  });

  it('treats PAUSE_REQUESTED before dispatch as a controlled approval return without an Ozon import', async () => {
    const {
      worker,
      prisma,
      ozonPublisher,
      externalSubmissions,
      audit,
      launch,
    } = createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    externalSubmissions.markRequestStarted.mockRejectedValue(
      Object.assign(new Error('Organization pause reached dispatch gate'), {
        code: 'PRODUCT_LAUNCH_PAUSED_BEFORE_DISPATCH',
        controlState: 'PAUSE_REQUESTED',
        controlRevision: 7,
      }),
    );
    let ozonImportCalls = 0;
    ozonPublisher.publishSnapshot.mockImplementation(
      async (
        _input: unknown,
        hooks: { beforeDispatch: () => Promise<void> },
      ) => {
        await hooks.beforeDispatch();
        ozonImportCalls += 1;
        return { status: 'SUBMITTED_TO_OZON', taskId: 42 };
      },
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'AWAITING_PUBLISH_APPROVAL',
        code: 'PRODUCT_LAUNCH_PAUSED_BEFORE_DISPATCH',
      }),
    );

    expect(ozonImportCalls).toBe(0);
    expect(
      externalSubmissions.markRetryableFailureBeforeDispatch,
    ).not.toHaveBeenCalled();
    expect(externalSubmissions.recordUnknown).not.toHaveBeenCalled();
    expect(
      audit.log.mock.calls.some(
        ([call]) => call.action === 'product-launch.failed',
      ),
    ).toBe(false);
  });

  it('treats STOP_REQUESTED before dispatch as a controlled permanent block without an Ozon import', async () => {
    const {
      worker,
      prisma,
      ozonPublisher,
      externalSubmissions,
      audit,
      launch,
    } = createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    externalSubmissions.markRequestStarted.mockRejectedValue(
      Object.assign(new Error('Organization stop reached dispatch gate'), {
        code: 'PRODUCT_LAUNCH_STOPPED_BEFORE_DISPATCH',
        controlState: 'STOP_REQUESTED',
        controlRevision: 8,
      }),
    );
    let ozonImportCalls = 0;
    ozonPublisher.publishSnapshot.mockImplementation(
      async (
        _input: unknown,
        hooks: { beforeDispatch: () => Promise<void> },
      ) => {
        await hooks.beforeDispatch();
        ozonImportCalls += 1;
        return { status: 'SUBMITTED_TO_OZON', taskId: 42 };
      },
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        code: 'PRODUCT_LAUNCH_STOPPED_BEFORE_DISPATCH',
      }),
    );

    expect(ozonImportCalls).toBe(0);
    expect(
      externalSubmissions.markRetryableFailureBeforeDispatch,
    ).not.toHaveBeenCalled();
    expect(externalSubmissions.recordUnknown).not.toHaveBeenCalled();
    expect(
      audit.log.mock.calls.some(
        ([call]) => call.action === 'product-launch.failed',
      ),
    ).toBe(false);
  });

  it('keeps a pre-dispatch local failure retryable without claiming an Ozon request was sent', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    ozonPublisher.publishSnapshot.mockResolvedValue({
      status: 'BLOCKED',
      code: 'OZON_CHANNEL_NOT_CONNECTED',
      message: 'No healthy Ozon channel is connected.',
    });

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(expect.objectContaining({ status: 'BLOCKED' }));

    expect(externalSubmissions.markRequestStarted).not.toHaveBeenCalled();
    expect(externalSubmissions.recordResult).not.toHaveBeenCalled();
    expect(
      externalSubmissions.markRetryableFailureBeforeDispatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ publishSnapshotId: 'snapshot-1' }),
      expect.any(String),
      'No healthy Ozon channel is connected.',
    );
  });

  it('does not send an ambiguous snapshot again until preflight reconciliation succeeds', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    externalSubmissions.find.mockResolvedValue({
      id: 'submission-1',
      status: 'UNKNOWN',
    });

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'RECONCILIATION_REQUIRED' }),
    );

    expect(ozonPublisher.preflightSnapshot).toHaveBeenCalledTimes(1);
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
    expect(externalSubmissions.claimLaunchForSend).not.toHaveBeenCalled();
    expect(externalSubmissions.beginReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ publishSnapshotId: 'snapshot-1' }),
      expect.objectContaining({ source: 'ozon_offer_readback' }),
    );
    expect(prisma.productLaunch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECOVERING',
          completedAt: null,
        }),
      }),
    );
  });

  it('reconciles REQUEST_SENT without invoking publishSnapshot again', async () => {
    const {
      worker,
      prisma,
      ozonPublisher,
      externalSubmissions,
      agentPermissions,
      launch,
    } = createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
      publishExecutionGrantExpiresAt: new Date(Date.now() - 60_000),
      publishExecutionGrantConsumedAt: new Date(Date.now() - 120_000),
    });
    agentPermissions.check.mockResolvedValue({
      allowed: false,
      level: 1,
      requireConfirm: false,
    });
    externalSubmissions.find.mockResolvedValue({
      id: 'submission-1',
      status: 'REQUEST_SENT',
    });

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'RECONCILIATION_REQUIRED' }),
    );

    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
    expect(agentPermissions.check).not.toHaveBeenCalled();
    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(externalSubmissions.claimLaunchForSend).not.toHaveBeenCalled();
    expect(externalSubmissions.beginReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ publishSnapshotId: 'snapshot-1' }),
      expect.objectContaining({ previousStatus: 'REQUEST_SENT' }),
    );
  });

  it('does not mark a launch failed when another worker already owns the atomic claim', async () => {
    const { worker, prisma, ozonPublisher, externalSubmissions, launch } =
      createWorker();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      confirmAutoPublish: true,
      imageProjectId: 'image-project-1',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
      approvedContentHash: 'a'.repeat(64),
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
      publishApprovedBy: 'user-1',
      publishApprovedAt: launch.publishApprovedAt,
    });
    externalSubmissions.claimLaunchForSend.mockRejectedValue(
      Object.assign(new Error('already claimed'), {
        code: 'EXTERNAL_SUBMISSION_REQUIRES_RECONCILIATION',
      }),
    );

    await expect(
      worker.process({ data: publishJobData } as any),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'RECONCILIATION_REQUIRED' }),
    );

    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
    expect(prisma.productLaunch.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
