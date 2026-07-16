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
      update: jest.fn().mockResolvedValue(product),
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
    }),
  };
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
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
    launch,
  };
}

describe('ProductLaunchService', () => {
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
      { productLaunchId: 'launch-1', organizationId: 'org-1' },
      expect.objectContaining({ jobId: 'product-launch:launch-1:prepare' }),
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
        jobId: `product-launch:launch-1:publish:${'c'.repeat(64)}`,
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
