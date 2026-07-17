import { ProductLaunchService } from '../src/features/product-launch/product-launch.service.js';

const user = {
  sub: 'user-1',
  email: 'owner@example.com',
  orgId: 'org-1',
  role: 'OWNER',
  amr: ['pwd', 'otp'],
  mfaAt: Math.floor(Date.now() / 1000),
};

function createService() {
  const reviewTask = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: 'PRODUCT_RESEARCH',
    entityId: 'report-1',
    status: 'PENDING',
    notes: null,
  };
  const product = {
    id: 'product-1',
    workspaceId: 'workspace-1',
    title: 'Verified product candidate',
    sku: 'AGENT-REPORT-1',
    images: [],
    metadata: { source: 'agent-product-research' },
  };
  const launch = {
    id: 'launch-1',
    reviewTaskId: reviewTask.id,
    candidateId: 'report-1:0',
    productId: product.id,
    status: 'QUEUED',
    imageGenerationApproved: true,
    confirmAutoPublish: false,
    listingDraftId: null,
    publishReviewTaskId: null,
    approvedContentHash: null,
  };
  const prisma: any = {
    reviewTask: {
      findFirst: jest.fn().mockResolvedValue(reviewTask),
      update: jest
        .fn()
        .mockResolvedValue({ ...reviewTask, status: 'APPROVED' }),
    },
    product: {
      create: jest.fn().mockResolvedValue(product),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(product),
    },
    workspace: {
      findFirst: jest.fn(),
    },
    productCandidate: {
      findFirst: jest.fn(),
    },
    productLaunch: {
      upsert: jest.fn().mockResolvedValue(launch),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    listingDraft: { findFirst: jest.fn() },
  };
  const productResearch = {
    approveCandidate: jest.fn().mockResolvedValue({
      candidate: { id: 'report-1:0' },
      product,
      action: {
        status: 'approved_local_draft',
        externalStoreMutation: 'not_executed',
      },
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const files = {
    getOwned: jest.fn().mockResolvedValue({
      id: 'asset-1',
      purpose: 'PRODUCT_IMAGE',
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      workspaceId: 'workspace-1',
    }),
  };
  const queue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: jest.fn().mockResolvedValue(null),
  };
  const tenantDatabase = {
    run: jest.fn((organizationId, operation) => operation(prisma)),
  };
  const publishSnapshots = {
    captureApproved: jest.fn().mockResolvedValue({
      id: 'snapshot-1',
      snapshotHash: 'c'.repeat(64),
      target: 'OZON',
    }),
  };
  const externalSubmissions = {
    prepare: jest.fn().mockResolvedValue({
      id: 'submission-1',
      status: 'PREPARED',
    }),
  };
  const listingSandbox = {
    evaluate: jest.fn().mockResolvedValue({
      id: 'sandbox-1',
      status: 'PASSED',
      riskLevel: 'LOW',
      blocking: false,
    }),
    assertPublishable: jest.fn().mockResolvedValue({
      id: 'sandbox-1',
      status: 'PASSED',
      riskLevel: 'LOW',
      blocking: false,
    }),
  };
  const candidateEconomicsProof = {
    requireInTransaction: jest.fn(),
  };

  return {
    service: new (ProductLaunchService as any)(
      prisma,
      productResearch,
      audit,
      files,
      queue,
      tenantDatabase,
      publishSnapshots,
      externalSubmissions,
      listingSandbox,
      candidateEconomicsProof,
    ) as ProductLaunchService,
    prisma,
    productResearch,
    audit,
    files,
    queue,
    tenantDatabase,
    publishSnapshots,
    externalSubmissions,
    listingSandbox,
    candidateEconomicsProof,
    launch,
  };
}

function arrangeQualifiedPublish(context: ReturnType<typeof createService>): {
  contentHash: string;
  approvalHash: string;
} {
  const { prisma, launch } = context;
  const contentHash = 'a'.repeat(64);
  const approvalHash = 'b'.repeat(64);
  prisma.productLaunch.findFirst.mockResolvedValue({
    ...launch,
    status: 'AWAITING_PUBLISH_APPROVAL',
    listingDraftId: 'listing-1',
    publishReviewTaskId: 'listing-review-1',
  });
  prisma.listingDraft.findFirst.mockResolvedValue({
    id: 'listing-1',
    organizationId: 'org-1',
    status: 'APPROVED',
    contentHash,
    approvalHash,
    evaluationResult: {
      evaluatorVersion: 'listing-evaluator/v1',
      outcome: 'QUALIFIED',
    },
  });
  prisma.reviewTask.findFirst.mockResolvedValue({
    id: 'listing-review-1',
    organizationId: 'org-1',
    entityType: 'LISTING_DRAFT',
    entityId: 'listing-1',
    status: 'APPROVED',
    decisionEvidence: {
      type: 'listing-approval/v2',
      approvedContentSha256: contentHash,
      approvedListingSha256: approvalHash,
      evaluatorOutcome: 'QUALIFIED',
    },
  });
  prisma.productLaunch.update.mockResolvedValue({
    ...launch,
    status: 'QUEUED',
    confirmAutoPublish: true,
    approvedContentHash: contentHash,
    selectedPublishSnapshotId: 'snapshot-1',
    approvedPublishSnapshotHash: 'c'.repeat(64),
  });
  return { contentHash, approvalHash };
}

describe('ProductLaunchService', () => {
  it('reads one organization-scoped launch with durable wizard fields', async () => {
    const context = createService();
    context.prisma.productLaunch.findFirst.mockResolvedValue({
      ...context.launch,
      reviewTaskId: 'review-1',
      selectedPublishSnapshotId: null,
      publishApprovedAt: null,
      publishExecutionGrantHash: null,
      failureCode: 'IMAGE_PROVIDER_INVALID_KEY',
    });

    const result = await context.service.findOne(user as any, 'launch-1');

    expect(result.launch.id).toBe('launch-1');
    expect(result.launch.failureCode).toBe('IMAGE_PROVIDER_INVALID_KEY');
    expect(context.prisma.productLaunch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'launch-1', organizationId: 'org-1' },
      }),
    );
  });

  it.each([
    {
      label: 'password-only authentication',
      actor: {
        sub: 'user-1',
        email: 'owner@example.com',
        orgId: 'org-1',
        role: 'OWNER',
        amr: ['pwd'],
      },
    },
    {
      label: 'an expired MFA step-up',
      actor: {
        sub: 'user-1',
        email: 'owner@example.com',
        orgId: 'org-1',
        role: 'OWNER',
        amr: ['pwd', 'otp'],
        mfaAt: Math.floor(Date.now() / 1000) - 10 * 60,
      },
    },
  ])(
    'rejects publish confirmation authenticated with $label before any launch or snapshot work',
    async ({ actor }) => {
      const {
        service,
        tenantDatabase,
        publishSnapshots,
        externalSubmissions,
        queue,
      } = createService();

      await expect(
        service.confirmPublish(actor as any, 'launch-1', {
          confirmPublish: true,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PUBLISH_STEP_UP_REQUIRED',
        }),
      });

      expect(tenantDatabase.run).not.toHaveBeenCalled();
      expect(publishSnapshots.captureApproved).not.toHaveBeenCalled();
      expect(externalSubmissions.prepare).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('refuses to start generation or external publishing without explicit confirmation', async () => {
    const { service, productResearch, queue } = createService();

    await expect(
      service.confirm(user as any, 'review-1', {
        candidateId: 'report-1:0',
        confirmImageGeneration: false,
      }),
    ).rejects.toThrow('explicit confirmation');

    expect(productResearch.approveCandidate).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates an auditable local draft and queues image generation only after explicit confirmation', async () => {
    const { service, prisma, productResearch, audit, queue } = createService();

    const result = await service.confirm(user, 'review-1', {
      candidateId: 'report-1:0',
      confirmImageGeneration: true,
      referenceAssetId: 'asset-1',
      ozonPublication: {
        descriptionCategoryId: 17028922,
        attributes: [{ id: 85, complex_id: 0, values: [{ value: 'Brand' }] }],
        vat: '0.2',
        dimensions: { height: 10, width: 10, depth: 10, weight: 100 },
      },
    });

    expect(productResearch.approveCandidate).toHaveBeenCalledWith(
      user,
      'report-1:0',
      { workspaceId: undefined },
    );
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            ozonPublication: expect.objectContaining({
              descriptionCategoryId: 17028922,
            }),
          }),
        }),
      }),
    );
    expect(prisma.reviewTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          assignedTo: 'user-1',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'product-launch',
      expect.objectContaining({
        productLaunchId: 'launch-1',
        organizationId: 'org-1',
        preparationAttemptId: expect.any(String),
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^product-launch-launch-1-prepare-[0-9a-f-]+$/,
        ),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product-launch.preparation-confirmed',
        resourceType: 'ProductLaunch',
        resourceId: 'launch-1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({ id: 'launch-1', status: 'QUEUED' }),
        externalStoreMutation: 'local_assets_preparation_queued',
      }),
    );
    expect(prisma.productLaunch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          imageGenerationApproved: true,
          confirmAutoPublish: false,
        }),
      }),
    );
  });

  it('binds a daily research candidate launch to one exact verified economics evaluation', async () => {
    const { service, prisma, productResearch, candidateEconomicsProof, queue } =
      createService();
    const evaluationHash = 'd'.repeat(64);
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-daily-1',
      organizationId: 'org-1',
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'candidate-1',
      status: 'PENDING',
      decisionEvidence: {
        researchRunId: 'research-run-1',
        candidateId: 'candidate-1',
      },
    });
    prisma.productCandidate.findFirst.mockResolvedValue({
      id: 'candidate-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      researchRunId: 'research-run-1',
      canonicalName: 'Verified daily candidate',
      fingerprint: 'fingerprint-1',
      status: 'RECOMMENDED',
      rawSummary: { demandSignals: 2 },
      scores: [{ rank: 3 }],
    });
    candidateEconomicsProof.requireInTransaction.mockResolvedValue({
      evaluationId: 'evaluation-1',
      contentHash: evaluationHash,
      inputSetHash: 'e'.repeat(64),
      validUntil: '2099-07-16T12:00:00.000Z',
      status: 'VERIFIED',
      decision: 'PASS',
      candidateId: 'candidate-1',
      researchRunId: 'research-run-1',
      currency: 'RUB',
      salePrice: '1999.0000',
      totalCost: '900.0000',
      componentBreakdown: {
        procurement: { amount: '600.0000', source: 'SUPPLIER_QUOTE_EXACT' },
      },
    });
    prisma.product.create.mockResolvedValue({
      id: 'product-daily-1',
      workspaceId: 'workspace-1',
      title: 'Verified daily candidate',
      sku: 'DAILY-CANDIDATE-1',
      images: [],
      cost: 600,
      price: 1999,
      currency: 'RUB',
      metadata: {},
    });
    const dailyLaunch = {
      id: 'launch-daily-1',
      reviewTaskId: 'review-daily-1',
      reportId: 'research-run-1',
      candidateId: 'candidate-1',
      candidateIndex: 2,
      researchCandidateId: 'candidate-1',
      economicsEvaluationId: 'evaluation-1',
      economicsEvaluationHash: evaluationHash,
      productId: 'product-daily-1',
      referenceAssetId: 'asset-1',
      status: 'QUEUED',
    };
    prisma.productLaunch.upsert.mockResolvedValue({
      ...dailyLaunch,
      productId: null,
    });
    prisma.productLaunch.update.mockResolvedValue(dailyLaunch);

    const result = await service.confirm(user, 'review-daily-1', {
      candidateId: 'candidate-1',
      economicsEvaluationId: 'evaluation-1',
      economicsEvaluationHash: evaluationHash,
      confirmImageGeneration: true,
      referenceAssetId: 'asset-1',
    } as any);

    expect(productResearch.approveCandidate).not.toHaveBeenCalled();
    expect(candidateEconomicsProof.requireInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
        evaluationId: 'evaluation-1',
        expectedContentHash: evaluationHash,
      }),
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        title: 'Verified daily candidate',
        cost: '600.0000',
        price: '1999.0000',
        currency: 'RUB',
      }),
    });
    expect(prisma.productLaunch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reportId: 'research-run-1',
          candidateIndex: 2,
          researchCandidateId: 'candidate-1',
          economicsEvaluationId: 'evaluation-1',
          economicsEvaluationHash: evaluationHash,
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'product-launch',
      expect.objectContaining({
        productLaunchId: 'launch-daily-1',
        organizationId: 'org-1',
        preparationAttemptId: expect.any(String),
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^product-launch-launch-daily-1-prepare-[0-9a-f-]+$/,
        ),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({ id: 'launch-daily-1' }),
      }),
    );
  });

  it('fails closed when a daily research launch omits its economics proof binding', async () => {
    const { service, prisma, candidateEconomicsProof, queue } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-daily-1',
      organizationId: 'org-1',
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'candidate-1',
      status: 'PENDING',
      decisionEvidence: {
        researchRunId: 'research-run-1',
        candidateId: 'candidate-1',
      },
    });

    await expect(
      service.confirm(user, 'review-daily-1', {
        candidateId: 'candidate-1',
        confirmImageGeneration: true,
        referenceAssetId: 'asset-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRODUCT_LAUNCH_ECONOMICS_PROOF_REQUIRED',
      }),
    });

    expect(candidateEconomicsProof.requireInTransaction).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues a creative-only daily preparation without economics proof, approval, or Ozon fields', async () => {
    const {
      service,
      prisma,
      productResearch,
      candidateEconomicsProof,
      queue,
      audit,
    } = createService();
    const dailyReview = {
      id: 'review-creative-1',
      organizationId: 'org-1',
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'candidate-creative-1',
      status: 'PENDING',
      decisionEvidence: {
        researchRunId: 'research-run-creative-1',
        candidateId: 'candidate-creative-1',
      },
    };
    const creativeCandidate = {
      id: 'candidate-creative-1',
      organizationId: 'org-1',
      workspaceId: null,
      researchRunId: 'research-run-creative-1',
      canonicalName: '透明缝纫线收纳盒',
      fingerprint: 'fingerprint-creative-1',
      status: 'HOLD',
      rawSummary: { demandSignals: 2 },
      signals: [{ source: 'ozon' }, { source: '1688' }],
      risks: [
        {
          riskType: 'RISK_EVIDENCE_MISSING',
          severity: 'BLOCKED',
          reviewStatus: 'PENDING',
        },
      ],
      scores: [
        {
          rank: 1,
          decision: 'HOLD',
          hardGateStatus: 'BLOCKED',
          hardGateReasons: ['MANUAL_PRICING_REQUIRED', 'RISK_EVIDENCE_MISSING'],
        },
      ],
    };
    const creativeLaunch = {
      id: 'launch-creative-1',
      reviewTaskId: dailyReview.id,
      reportId: creativeCandidate.researchRunId,
      candidateId: creativeCandidate.id,
      candidateIndex: 0,
      researchCandidateId: creativeCandidate.id,
      economicsEvaluationId: null,
      economicsEvaluationHash: null,
      productId: 'product-creative-1',
      referenceAssetId: 'asset-1',
      referenceAssetSha256: 'a'.repeat(64),
      status: 'QUEUED',
      imageGenerationApproved: true,
      confirmAutoPublish: false,
      execution: {
        preparationMode: 'CREATIVE_ONLY',
        pricingStatus: 'DATA_INSUFFICIENT',
        publishable: false,
        ozonSubmission: 'not_authorized',
      },
    };
    prisma.reviewTask.findFirst.mockResolvedValue(dailyReview);
    prisma.productCandidate.findFirst.mockResolvedValue(creativeCandidate);
    prisma.workspace.findFirst.mockResolvedValue({
      id: 'workspace-1',
      currency: 'RUB',
    });
    prisma.productLaunch.upsert.mockResolvedValue({
      ...creativeLaunch,
      productId: null,
    });
    prisma.product.create.mockResolvedValue({
      id: 'product-creative-1',
      workspaceId: 'workspace-1',
      title: creativeCandidate.canonicalName,
      sku: 'DAILY-CANDIDATE-CREATIVE-1',
      images: [],
      cost: 0,
      price: 0,
      currency: 'RUB',
      status: 'DRAFT',
      metadata: {},
    });
    prisma.productLaunch.update.mockResolvedValue(creativeLaunch);

    const result = await service.confirm(user, dailyReview.id, {
      candidateId: creativeCandidate.id,
      preparationMode: 'CREATIVE_ONLY',
      workspaceId: 'workspace-1',
      confirmImageGeneration: true,
      referenceAssetId: 'asset-1',
    });

    expect(productResearch.approveCandidate).not.toHaveBeenCalled();
    expect(candidateEconomicsProof.requireInTransaction).not.toHaveBeenCalled();
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        title: '透明缝纫线收纳盒',
        cost: 0,
        price: 0,
        currency: 'RUB',
        status: 'DRAFT',
        metadata: expect.objectContaining({
          pricingStatus: 'DATA_INSUFFICIENT',
          publishable: false,
          externalStoreMutation: 'not_executed',
        }),
      }),
    });
    expect(prisma.productLaunch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          economicsEvaluationId: null,
          economicsEvaluationHash: null,
          imageGenerationApproved: true,
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
        where: { id: dailyReview.id },
        data: expect.not.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'product-launch',
      expect.objectContaining({
        productLaunchId: 'launch-creative-1',
        organizationId: 'org-1',
        preparationAttemptId: expect.any(String),
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^product-launch-launch-creative-1-prepare-[0-9a-f-]+$/,
        ),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product-launch.daily-candidate-creative-preparation-confirmed',
        after: expect.objectContaining({
          preparationMode: 'CREATIVE_ONLY',
          publishable: false,
          externalStoreMutation: 'not_executed',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({ id: 'launch-creative-1' }),
        externalStoreMutation: 'local_creative_preparation_queued',
      }),
    );
  });

  it('blocks creative-only preparation when a known product risk remains', async () => {
    const { service, prisma, candidateEconomicsProof, queue } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-risk-1',
      organizationId: 'org-1',
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'candidate-risk-1',
      status: 'PENDING',
      decisionEvidence: {
        researchRunId: 'research-run-risk-1',
        candidateId: 'candidate-risk-1',
      },
    });
    prisma.workspace.findFirst.mockResolvedValue({
      id: 'workspace-1',
      currency: 'RUB',
    });
    prisma.productCandidate.findFirst.mockResolvedValue({
      id: 'candidate-risk-1',
      organizationId: 'org-1',
      workspaceId: null,
      researchRunId: 'research-run-risk-1',
      canonicalName: 'Known risky item',
      fingerprint: 'fingerprint-risk-1',
      status: 'HOLD',
      rawSummary: {},
      signals: [{ source: 'ozon' }, { source: '1688' }],
      risks: [
        {
          riskType: 'TRADEMARK_INFRINGEMENT',
          severity: 'HIGH',
          reviewStatus: 'PENDING',
        },
      ],
      scores: [
        {
          rank: 1,
          decision: 'HOLD',
          hardGateStatus: 'BLOCKED',
          hardGateReasons: ['MANUAL_PRICING_REQUIRED'],
        },
      ],
    });

    await expect(
      service.confirm(user, 'review-risk-1', {
        candidateId: 'candidate-risk-1',
        preparationMode: 'CREATIVE_ONLY',
        workspaceId: 'workspace-1',
        confirmImageGeneration: true,
        referenceAssetId: 'asset-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CREATIVE_ONLY_SAFETY_GATE_FAILED',
      }),
    });

    expect(candidateEconomicsProof.requireInTransaction).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.productLaunch.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects an idempotent daily launch request when immutable evidence differs', async () => {
    const { service, prisma, files, candidateEconomicsProof, queue } =
      createService();
    const evaluationHash = 'd'.repeat(64);
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'review-daily-1',
      organizationId: 'org-1',
      entityType: 'PRODUCT_RESEARCH',
      entityId: 'candidate-1',
      status: 'APPROVED',
      decisionEvidence: {
        researchRunId: 'research-run-1',
        candidateId: 'candidate-1',
      },
    });
    prisma.productLaunch.findFirst.mockResolvedValue({
      id: 'launch-daily-1',
      organizationId: 'org-1',
      reviewTaskId: 'review-daily-1',
      candidateId: 'candidate-1',
      researchCandidateId: 'candidate-1',
      economicsEvaluationId: 'evaluation-1',
      economicsEvaluationHash: evaluationHash,
      referenceAssetId: 'asset-original',
      status: 'GENERATING_IMAGES',
    });

    await expect(
      service.confirm(user, 'review-daily-1', {
        candidateId: 'candidate-1',
        economicsEvaluationId: 'evaluation-1',
        economicsEvaluationHash: evaluationHash,
        confirmImageGeneration: true,
        referenceAssetId: 'asset-replacement',
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRODUCT_LAUNCH_IDEMPOTENCY_CONFLICT',
      }),
    });

    expect(files.getOwned).not.toHaveBeenCalled();
    expect(candidateEconomicsProof.requireInTransaction).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('records a separate publish approval only for the exact qualified listing hash', async () => {
    const { service, prisma, queue, launch, listingSandbox } = createService();
    const contentHash = 'a'.repeat(64);
    const approvalHash = 'b'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'AWAITING_PUBLISH_APPROVAL',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
    });
    prisma.listingDraft.findFirst.mockResolvedValue({
      id: 'listing-1',
      organizationId: 'org-1',
      status: 'APPROVED',
      contentHash,
      approvalHash,
      evaluationResult: {
        evaluatorVersion: 'listing-evaluator/v1',
        outcome: 'QUALIFIED',
      },
    });
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'listing-review-1',
      organizationId: 'org-1',
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-1',
      status: 'APPROVED',
      decisionEvidence: {
        type: 'listing-approval/v2',
        approvedContentSha256: contentHash,
        approvedListingSha256: approvalHash,
        evaluatorOutcome: 'QUALIFIED',
      },
    });
    prisma.productLaunch.update.mockResolvedValue({
      ...launch,
      status: 'QUEUED',
      confirmAutoPublish: true,
      approvedContentHash: contentHash,
      selectedPublishSnapshotId: 'snapshot-1',
      approvedPublishSnapshotHash: 'c'.repeat(64),
    });

    const result = await (service as any).confirmPublish(user, 'launch-1', {
      confirmPublish: true,
    });

    expect(prisma.productLaunch.update).toHaveBeenCalledWith({
      where: { id: 'launch-1' },
      data: expect.objectContaining({
        status: 'QUEUED',
        confirmAutoPublish: true,
        approvedContentHash: contentHash,
        selectedPublishSnapshotId: 'snapshot-1',
        approvedPublishSnapshotHash: 'c'.repeat(64),
        publishApprovedBy: 'user-1',
        publishApprovedAt: expect.any(Date),
        publishExecutionGrantHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        publishExecutionGrantScope: 'action:ozon.listing.publish',
        publishExecutionGrantSnapshotHash: 'c'.repeat(64),
        publishExecutionGrantExpiresAt: expect.any(Date),
        publishExecutionGrantConsumedAt: null,
        execution: expect.objectContaining({
          publishStepUp: {
            type: 'mfa-step-up/v1',
            actorId: 'user-1',
            amr: ['pwd', 'otp'],
            mfaAt: user.mfaAt,
          },
        }),
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'product-launch',
      {
        productLaunchId: 'launch-1',
        organizationId: 'org-1',
        publishExecutionGrant: expect.stringMatching(/^plg_[A-Za-z0-9_-]+$/),
      },
      expect.objectContaining({
        jobId: `product-launch-launch-1-publish-${'c'.repeat(64)}`,
      }),
    );
    expect(listingSandbox.evaluate).toHaveBeenCalledWith({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorId: 'user-1',
    });
    expect(listingSandbox.assertPublishable).toHaveBeenCalledWith({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorRole: 'OWNER',
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: 'approved_pending_external_adapter',
        externalStoreMutation: 'publish_queued_after_separate_confirmation',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('plg_');
  });

  it('reconciles an ambiguous publish queue add by stable job ID without rolling back approval', async () => {
    const context = createService();
    const { service, prisma, queue, audit } = context;
    arrangeQualifiedPublish(context);
    queue.add.mockRejectedValueOnce(new Error('Redis response lost'));
    queue.getJob.mockResolvedValueOnce({ id: 'existing-publish-job' });

    await expect(
      (service as any).confirmPublish(user, 'launch-1', {
        confirmPublish: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'approved_pending_external_adapter' }),
    );

    expect(queue.getJob).toHaveBeenCalledWith(
      `product-launch-launch-1-publish-${'c'.repeat(64)}`,
    );
    expect(prisma.productLaunch.update).toHaveBeenCalledTimes(1);
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          confirmAutoPublish: true,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product-launch.publish-queue-add-reconciled',
      }),
    );
  });

  it('keeps durable publish approval queued when add and readback are both unavailable', async () => {
    const context = createService();
    const { service, prisma, queue } = context;
    arrangeQualifiedPublish(context);
    queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    queue.getJob.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      (service as any).confirmPublish(user, 'launch-1', {
        confirmPublish: true,
      }),
    ).rejects.toThrow('awaiting reconciliation');

    expect(prisma.productLaunch.update).toHaveBeenCalledTimes(1);
    expect(prisma.productLaunch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          confirmAutoPublish: true,
        }),
      }),
    );
  });

  it('does not prepare or queue an Ozon write when the listing sandbox blocks it', async () => {
    const {
      service,
      prisma,
      queue,
      launch,
      listingSandbox,
      externalSubmissions,
    } = createService();
    const contentHash = 'a'.repeat(64);
    const approvalHash = 'b'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'AWAITING_PUBLISH_APPROVAL',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
    });
    prisma.listingDraft.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'APPROVED',
      contentHash,
      approvalHash,
      evaluationResult: { outcome: 'QUALIFIED' },
    });
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'listing-review-1',
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-1',
      status: 'APPROVED',
      decisionEvidence: {
        type: 'listing-approval/v2',
        approvedContentSha256: contentHash,
        approvedListingSha256: approvalHash,
        evaluatorOutcome: 'QUALIFIED',
      },
    });
    listingSandbox.evaluate.mockResolvedValue({
      id: 'sandbox-blocked',
      status: 'BLOCKED',
      riskLevel: 'BLOCKED',
      blocking: true,
    });
    listingSandbox.assertPublishable.mockRejectedValue(
      new Error('Listing sandbox blocked this publish snapshot.'),
    );

    await expect(
      (service as any).confirmPublish(user, 'launch-1', {
        confirmPublish: true,
      }),
    ).rejects.toThrow('sandbox blocked');

    expect(externalSubmissions.prepare).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.productLaunch.update).not.toHaveBeenCalled();
  });

  it('rejects publish confirmation when review evidence targets another hash', async () => {
    const { service, prisma, queue, launch } = createService();
    const contentHash = 'a'.repeat(64);
    const approvalHash = 'b'.repeat(64);
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'AWAITING_PUBLISH_APPROVAL',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
    });
    prisma.listingDraft.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'APPROVED',
      contentHash,
      approvalHash,
      evaluationResult: { outcome: 'QUALIFIED' },
    });
    prisma.reviewTask.findFirst.mockResolvedValue({
      id: 'listing-review-1',
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-1',
      status: 'APPROVED',
      decisionEvidence: {
        type: 'listing-approval/v2',
        approvedContentSha256: 'b'.repeat(64),
        approvedListingSha256: approvalHash,
        evaluatorOutcome: 'QUALIFIED',
      },
    });

    await expect(
      (service as any).confirmPublish(user, 'launch-1', {
        confirmPublish: true,
      }),
    ).rejects.toThrow('hash');
    expect(prisma.productLaunch.update).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not reset an existing launch that already awaits publish approval', async () => {
    const { service, prisma, productResearch, queue, launch } = createService();
    prisma.productLaunch.findFirst.mockResolvedValue({
      ...launch,
      status: 'AWAITING_PUBLISH_APPROVAL',
      listingDraftId: 'listing-1',
      publishReviewTaskId: 'listing-review-1',
    });

    const result = await service.confirm(user, 'review-1', {
      candidateId: 'report-1:0',
      confirmImageGeneration: true,
      referenceAssetId: 'asset-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({
          status: 'AWAITING_PUBLISH_APPROVAL',
        }),
        externalStoreMutation: 'awaiting_publish_approval',
      }),
    );
    expect(productResearch.approveCandidate).not.toHaveBeenCalled();
    expect(prisma.productLaunch.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
