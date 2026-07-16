import { ListingBundleService } from '../src/features/listings/listing-bundle.service.js';
import { CanonicalCatalogService } from '../src/features/marketplace-compiler/canonical-catalog.service.js';
import { MarketplaceCompilerService } from '../src/features/marketplace-compiler/marketplace-compiler.service.js';
import { ListingPublishSnapshotService } from '../src/features/product-launch/listing-publish-snapshot.service.js';

function createService() {
  const listingBundles = new ListingBundleService();
  const built = listingBundles.build({
    request: {
      productName: 'Original product title',
      description: 'Approved product description',
      keywords: ['approved keyword'],
      platform: 'ozon',
    },
    agentResult: {
      title: 'Approved Ozon listing title',
      description: 'Approved product description',
      bulletPoints: ['Approved benefit'],
      keywords: ['approved keyword'],
      price: 1999,
    },
    productId: 'product-1',
    generatedAt: new Date('2026-07-14T08:00:00.000Z'),
  });
  if (built.status !== 'VALID') throw new Error('Expected valid bundle');
  built.bundle.mediaMapping = [
    {
      role: 'primary',
      assetUrl: 'https://assets.example.com/approved-primary.png',
    },
  ];
  const approvalHash = listingBundles.computeApprovalSha256(built.bundle);

  const listing = {
    id: 'listing-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    productId: 'product-1',
    status: 'APPROVED',
    contentHash: built.bundle.provenance.outputSha256,
    approvalHash,
    schemaVersion: built.bundle.schemaVersion,
    bundle: built.bundle,
    evaluationResult: { outcome: 'QUALIFIED' },
  };
  const reviewTask = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: 'LISTING_DRAFT',
    entityId: 'listing-1',
    status: 'APPROVED',
    decisionEvidence: {
      type: 'listing-approval/v2',
      approvedListingSha256: approvalHash,
      evaluatorOutcome: 'QUALIFIED',
    },
  };
  const product = {
    id: 'product-1',
    workspaceId: 'workspace-1',
    title: 'Mutable local title',
    sku: 'SKU-APPROVED-1',
    cost: 800,
    price: 1500,
    currency: 'RUB',
    images: ['https://assets.example.com/mutable-product.png'],
    metadata: {
      ozonPublication: {
        descriptionCategoryId: 17028922,
        attributes: [{ id: 85, complex_id: 0, values: [{ value: 'Brand' }] }],
        vat: '0.2',
        dimensions: { height: 10, width: 20, depth: 30, weight: 400 },
        shippingCost: 200,
        platformFeeRate: 0.12,
        withdrawalFeeRate: 0.01,
      },
      agentEvidence: {
        sourceEvidence: {
          source: 'ozon_public_listings',
          fetchedAt: '2026-07-14T07:30:00.000Z',
          items: [
            {
              title: 'Comparable one',
              url: 'https://www.ozon.ru/product/comparable-one',
              priceRub: 1800,
              fetchedAt: '2026-07-14T07:30:00.000Z',
            },
            {
              title: 'Comparable two',
              url: 'https://www.ozon.ru/product/comparable-two',
              priceRub: 2100,
              fetchedAt: '2026-07-14T07:30:00.000Z',
            },
          ],
        },
      },
    },
    createdAt: new Date('2026-07-14T07:00:00.000Z'),
  };
  const channel = {
    id: 'channel-1',
    workspaceId: 'workspace-1',
    provider: 'OZON',
    syncStatus: 'SUCCESS',
  };
  const imageProject = {
    id: 'image-project-1',
    organizationId: 'org-1',
    productId: 'product-1',
    qaStatus: 'PASSED',
    qaVersion: 'visual-qa/v1',
    qaResult: {
      outcome: 'PASSED',
      score: 96,
      evaluatedAt: '2026-07-14T08:30:00.000Z',
    },
    qaCompletedAt: new Date('2026-07-14T08:30:00.000Z'),
    settings: {
      consistencyScore: 94,
      consistencyPassed: true,
      compliancePassed: true,
      referenceAssetSha256: 'a'.repeat(64),
    },
  };
  const prisma: any = {
    listingDraft: { findFirst: jest.fn().mockResolvedValue(listing) },
    reviewTask: { findFirst: jest.fn().mockResolvedValue(reviewTask) },
    product: { findFirst: jest.fn().mockResolvedValue(product) },
    channelConnection: { findFirst: jest.fn().mockResolvedValue(channel) },
    productLaunch: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'launch-1',
        organizationId: 'org-1',
        imageProjectId: imageProject.id,
      }),
    },
    imagePromptProject: {
      findFirst: jest.fn().mockResolvedValue(imageProject),
    },
    storeAgentProfile: {
      findUnique: jest.fn().mockResolvedValue({ minimumProfitMargin: 20 }),
    },
    externalSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    listingPublishSnapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'snapshot-1',
          status: 'APPROVED',
          ...data,
        }),
      ),
    },
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };
  const service = new ListingPublishSnapshotService(
    listingBundles,
    new CanonicalCatalogService(),
    new MarketplaceCompilerService(),
    tenantDatabase as any,
  );

  return {
    service,
    prisma,
    listing,
    reviewTask,
    product,
    approvalHash,
  };
}

describe('ListingPublishSnapshotService', () => {
  it('freezes the exact approved Ozon payload instead of publishing mutable Product data', async () => {
    const { service, prisma, product, approvalHash } = createService();

    const snapshot = await service.captureApproved({
      organizationId: 'org-1',
      productLaunchId: 'launch-1',
      listingDraftId: 'listing-1',
      reviewTaskId: 'review-1',
      approvedBy: 'user-1',
      approvedAt: new Date('2026-07-14T09:00:00.000Z'),
    });

    expect(snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.listingApprovalHash).toBe(approvalHash);
    expect(snapshot.snapshot).toEqual(
      expect.objectContaining({
        channelId: 'channel-1',
        schemaVersion: 'listing-publish-snapshot/v2',
        listingApprovalHash: approvalHash,
        payload: expect.objectContaining({
          name: 'Approved Ozon listing title',
          price: 1999,
          images: ['https://assets.example.com/approved-primary.png'],
        }),
        economics: expect.objectContaining({
          currency: 'RUB',
          price: 1999,
          cost: 800,
          shippingCost: 200,
          platformFeeRate: 0.12,
          withdrawalFeeRate: 0.01,
          netProfit: expect.any(Number),
          marginRate: expect.any(Number),
          source: {
            cost: 'product.cost',
            shippingCost:
              'product.metadata.ozonPublication.shippingCost',
            platformFeeRate:
              'product.metadata.ozonPublication.platformFeeRate',
            withdrawalFeeRate:
              'product.metadata.ozonPublication.withdrawalFeeRate',
          },
        }),
        safetyEvidence: {
          image: expect.objectContaining({
            qaOutcome: 'PASSED',
            qaScore: 96,
            consistencyScore: 94,
            severeMismatch: false,
          }),
          content: expect.objectContaining({
            evaluatorOutcome: 'QUALIFIED',
            approvalHashMatches: true,
          }),
          pricing: expect.objectContaining({
            competitorEvidenceCount: 2,
            minimumMarginRate: 20,
          }),
          attributes: expect.objectContaining({
            compilerStatus: 'VALID',
            requiredFieldsComplete: true,
          }),
          channel: expect.objectContaining({
            syncStatus: 'SUCCESS',
            recentSubmissionCount: 0,
            recentFailureCount: 0,
          }),
          approval: expect.objectContaining({
            reviewStatus: 'APPROVED',
            decisionType: 'listing-approval/v2',
            approvalHashMatches: true,
            capabilityScope: 'action:ozon.listing.publish',
            executionGrantRequired: true,
          }),
          externalResponse: expect.objectContaining({
            phase: 'PRE_DISPATCH',
            duplicateSubmission: false,
            severeWarning: false,
          }),
        },
      }),
    );

    product.title = 'Changed after approval';
    product.price = 1;
    product.images = ['https://assets.example.com/changed.png'];
    expect((snapshot.snapshot as any).payload).toEqual(
      expect.objectContaining({
        name: 'Approved Ozon listing title',
        price: 1999,
        images: ['https://assets.example.com/approved-primary.png'],
      }),
    );
    expect(prisma.listingPublishSnapshot.create).toHaveBeenCalledTimes(1);
    const persistedSnapshot =
      prisma.listingPublishSnapshot.create.mock.calls[0][0].data.snapshot;
    expect(JSON.stringify(persistedSnapshot)).not.toContain('default:0');
    expect(JSON.stringify(persistedSnapshot)).not.toContain('default:0.12');
    expect(JSON.stringify(persistedSnapshot)).not.toContain('default:0.01');
  });

  it('rejects product.cost=0 instead of freezing unverified product economics', async () => {
    const { service, prisma, product } = createService();
    product.cost = 0;

    await expect(
      service.captureApproved({
        organizationId: 'org-1',
        productLaunchId: 'launch-1',
        listingDraftId: 'listing-1',
        reviewTaskId: 'review-1',
        approvedBy: 'user-1',
        approvedAt: new Date('2026-07-14T09:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_INVALID',
      }),
    });
    expect(prisma.listingPublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('rejects a missing shippingCost instead of freezing default:0 provenance', async () => {
    const { service, prisma, product } = createService();
    const publication = product.metadata.ozonPublication as Record<
      string,
      unknown
    >;
    delete publication.shippingCost;

    await expect(
      service.captureApproved({
        organizationId: 'org-1',
        productLaunchId: 'launch-1',
        listingDraftId: 'listing-1',
        reviewTaskId: 'review-1',
        approvedBy: 'user-1',
        approvedAt: new Date('2026-07-14T09:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_INVALID',
      }),
    });
    expect(prisma.listingPublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('rejects a missing platformFeeRate instead of freezing default:0.12 provenance', async () => {
    const { service, prisma, product } = createService();
    const publication = product.metadata.ozonPublication as Record<
      string,
      unknown
    >;
    delete publication.platformFeeRate;

    await expect(
      service.captureApproved({
        organizationId: 'org-1',
        productLaunchId: 'launch-1',
        listingDraftId: 'listing-1',
        reviewTaskId: 'review-1',
        approvedBy: 'user-1',
        approvedAt: new Date('2026-07-14T09:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_INVALID',
      }),
    });
    expect(prisma.listingPublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('rejects a missing withdrawalFeeRate instead of freezing default:0.01 provenance', async () => {
    const { service, prisma, product } = createService();
    const publication = product.metadata.ozonPublication as Record<
      string,
      unknown
    >;
    delete publication.withdrawalFeeRate;

    await expect(
      service.captureApproved({
        organizationId: 'org-1',
        productLaunchId: 'launch-1',
        listingDraftId: 'listing-1',
        reviewTaskId: 'review-1',
        approvedBy: 'user-1',
        approvedAt: new Date('2026-07-14T09:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_INVALID',
      }),
    });
    expect(prisma.listingPublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('rejects a stored snapshot whose immutable body no longer matches its hash', async () => {
    const { service, prisma } = createService();
    const captured = await service.captureApproved({
      organizationId: 'org-1',
      productLaunchId: 'launch-1',
      listingDraftId: 'listing-1',
      reviewTaskId: 'review-1',
      approvedBy: 'user-1',
      approvedAt: new Date('2026-07-14T09:00:00.000Z'),
    });
    prisma.listingPublishSnapshot.findFirst.mockResolvedValue({
      ...captured,
      snapshot: {
        ...(captured.snapshot as any),
        payload: {
          ...(captured.snapshot as any).payload,
          price: 1,
        },
      },
    });

    await expect(
      service.loadApproved({
        organizationId: 'org-1',
        snapshotId: captured.id,
        expectedSnapshotHash: captured.snapshotHash,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_SNAPSHOT_HASH_MISMATCH',
      }),
    });
  });

  it('can read a valid historical v1 snapshot without economics so the sandbox can block it explicitly', async () => {
    const { service, prisma } = createService();
    const captured = await service.captureApproved({
      organizationId: 'org-1',
      productLaunchId: 'launch-1',
      listingDraftId: 'listing-1',
      reviewTaskId: 'review-1',
      approvedBy: 'user-1',
      approvedAt: new Date('2026-07-14T09:00:00.000Z'),
    });
    const historicalBody = {
      ...(captured.snapshot as any),
      schemaVersion: 'listing-publish-snapshot/v1',
    };
    delete historicalBody.economics;
    delete historicalBody.safetyEvidence;
    const historicalHash = (service as any).sha256(historicalBody);
    prisma.listingPublishSnapshot.findFirst.mockResolvedValue({
      ...captured,
      snapshot: historicalBody,
      snapshotHash: historicalHash,
    });

    const loaded = await service.loadApproved({
      organizationId: 'org-1',
      snapshotId: captured.id,
      expectedSnapshotHash: historicalHash,
    });

    expect((loaded.snapshot as any).economics).toBeUndefined();
  });
});
