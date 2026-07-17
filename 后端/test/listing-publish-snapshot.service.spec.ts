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
      priceCurrency: 'RUB',
      pricingStatus: 'EVIDENCE_BACKED',
      pricingEvidence: {
        id: 'evaluation-1',
        status: 'VERIFIED',
        decision: 'PASS',
        salePrice: '1999.0000',
        currency: 'RUB',
        validFrom: '2026-07-14T00:00:00.000Z',
        validUntil: '2099-07-16T12:00:00.000Z',
        calculatorVersion: 'candidate-economics-calculator/v1',
        inputSetHash: 'c'.repeat(64),
        contentHash: 'b'.repeat(64),
      },
      pricingMissingFields: [],
      publishable: false,
      requiresHumanReview: true,
    },
    productId: 'product-1',
    generatedAt: new Date('2026-07-14T08:00:00.000Z'),
  });
  if (built.status !== 'VALID') throw new Error('Expected valid bundle');
  built.bundle.mediaMapping = [
    {
      role: 'primary',
      assetUrl: 'https://assets.example.com/approved-primary.png',
      assetSha256: 'f'.repeat(64),
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
  const economicsProof = {
    evaluationId: 'evaluation-1',
    contentHash: 'b'.repeat(64),
    inputSetHash: 'c'.repeat(64),
    validUntil: '2099-07-16T12:00:00.000Z',
    status: 'VERIFIED' as const,
    decision: 'PASS' as const,
    candidateId: 'candidate-1',
    researchRunId: 'research-run-1',
    currency: 'RUB',
    salePrice: '1999.0000',
    grossProfitBeforeAds: '1099.0000',
    grossMarginBeforeAds: '0.54977489',
    netProfitAfterAds: '899.0000',
    netMarginAfterAds: '0.44972486',
    totalCost: '1100.0000',
    componentBreakdown: {
      procurement: { amount: '600.0000', source: 'SUPPLIER_QUOTE_EXACT' },
      domesticTransport: { amount: '50.0000', source: 'EVIDENCE' },
      internationalLogistics: {
        amount: '100.0000',
        source: 'SUPPLIER_QUOTE_LANDED_RU',
      },
      packaging: { amount: '20.0000', source: 'EVIDENCE' },
      ozonCommission: { amount: '80.0000', source: 'EVIDENCE' },
      payment: { amount: '20.0000', source: 'RATE_WITH_MINIMUM' },
      fulfillment: { amount: '20.0000', source: 'EVIDENCE' },
      storage: { amount: '5.0000', source: 'EVIDENCE' },
      tax: { amount: '5.0000', source: 'EVIDENCE' },
      fxVolatilityReserve: { amount: '0.0000', source: 'EVIDENCE' },
      advertising: { amount: '150.0000', source: 'EVIDENCE' },
      refundLoss: { amount: '50.0000', source: 'EVIDENCE' },
      customsVatClearanceDestinationDelivery: {
        amount: '0.0000',
        currency: 'RUB',
        treatment: 'INCLUDED_BY_SUPPLIER_LANDED_RU',
      },
    },
    policyVersion: 'candidate-economics-policy/v1',
    calculatorVersion: 'candidate-economics-calculator/v1',
    policyHash: 'd'.repeat(64),
    rawSnapshotSetHash: 'e'.repeat(64),
    supplierQuoteEvidenceId: 'quote-1',
    inputCount: 11,
    risk: {
      clearanceRecordId: 'risk-1',
      ruleVersion: 'authorized-risk/v1',
      fetchedAt: '2026-07-16T08:45:00.000Z',
      evidenceHash: 'f'.repeat(64),
    },
  };
  const finalListingRisk = {
    schemaVersion: 'listing-final-risk-clearance/v1',
    subjectVersion: 'listing-risk-subject/v1',
    subjectHash: `sha256:${'1'.repeat(64)}`,
    subject: {
      title: 'Approved Ozon listing title',
      description: 'Approved product description',
      tags: [],
      platform: 'ozon',
      scopeId: 'listing:org-1:listing-1',
      bullets: ['Approved benefit'],
      keywords: ['approved keyword'],
      attributes: {},
      imageHashes: [`sha256:${'f'.repeat(64)}`],
    },
    evidenceHash: '2'.repeat(64),
    provider: 'authorized-provider',
    ruleset: 'authorized-risk-rules/v1',
    fetchedAt: '2026-07-16T07:45:00.000Z',
    expiresAt: '2099-07-16T12:00:00.000Z',
    clearanceEvidence: {
      schemaVersion: 'risk-clearance-evidence/v1',
      subjectVersion: 'listing-risk-subject/v1',
      attestation: {
        provider: 'authorized-provider',
        ruleset: 'authorized-risk-rules/v1',
        evidenceRef: 'risk/report/listing-1',
        fetchedAt: '2026-07-16T07:45:00.000Z',
        expiresAt: '2099-07-16T12:00:00.000Z',
        subjectHash: `sha256:${'1'.repeat(64)}`,
        passed: true,
        signature: `hmac-sha256:${'3'.repeat(64)}`,
      },
      evidenceHash: '2'.repeat(64),
    },
    screening: {
      decision: 'PASS',
      screeningStatus: 'CLEARED',
      evidenceStatus: 'ATTESTED',
      publishable: true,
      hardGateReasons: [],
      mcpManifestHash: '4'.repeat(64),
      mcpExecutableHash: '5'.repeat(64),
      checkedAt: '2026-07-16T08:00:00.000Z',
    },
  };
  listing.evaluationResult = {
    ...listing.evaluationResult,
    finalRiskClearance: finalListingRisk,
  };
  const economicsProofService = {
    requireInTransaction: jest.fn().mockResolvedValue(economicsProof),
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
        researchCandidateId: economicsProof.candidateId,
        economicsEvaluationId: economicsProof.evaluationId,
        economicsEvaluationHash: economicsProof.contentHash,
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
  const listingRisk = {
    requireStored: jest.fn().mockReturnValue(finalListingRisk),
  };
  const commerceMcpTrust = {
    assertTrusted: jest.fn().mockResolvedValue({ integrityVerified: true }),
  };
  const service = new ListingPublishSnapshotService(
    listingBundles,
    new CanonicalCatalogService(),
    new MarketplaceCompilerService(),
    tenantDatabase as any,
    economicsProofService as any,
    listingRisk as any,
    commerceMcpTrust as any,
  );

  return {
    service,
    prisma,
    listing,
    reviewTask,
    product,
    approvalHash,
    economicsProof,
    economicsProofService,
    listingRisk,
    commerceMcpTrust,
  };
}

describe('ListingPublishSnapshotService', () => {
  it('freezes the exact approved Ozon payload instead of publishing mutable Product data', async () => {
    const { service, prisma, product, approvalHash, economicsProof } =
      createService();

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
        schemaVersion: 'listing-publish-snapshot/v3',
        listingApprovalHash: approvalHash,
        payload: expect.objectContaining({
          name: 'Approved Ozon listing title',
          price: 1999,
          images: ['https://assets.example.com/approved-primary.png'],
        }),
        economics: expect.objectContaining({
          evaluationId: economicsProof.evaluationId,
          contentHash: economicsProof.contentHash,
          inputSetHash: economicsProof.inputSetHash,
          validUntil: economicsProof.validUntil,
          status: 'VERIFIED',
          decision: 'PASS',
          currency: 'RUB',
          price: '1999.0000',
          netProfitAfterAds: '899.0000',
          netMarginAfterAds: '0.44972486',
          totalCost: '1100.0000',
          source: 'candidate_economics_evaluations',
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
          risk: expect.objectContaining({
            source: 'product_risk_records',
            clearanceRecordId: economicsProof.risk.clearanceRecordId,
            evidenceHash: economicsProof.risk.evidenceHash,
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
    expect(prisma.listingPublishSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          economicsEvaluationId: economicsProof.evaluationId,
          economicsEvaluationHash: economicsProof.contentHash,
          economicsInputSetHash: economicsProof.inputSetHash,
          economicsValidUntil: new Date(economicsProof.validUntil),
        }),
      }),
    );
  });

  it('does not derive publish economics from mutable Product cost or fee metadata', async () => {
    const { service, product, economicsProofService } = createService();
    product.cost = 0;
    product.metadata.ozonPublication.shippingCost = 0;
    delete product.metadata.ozonPublication.platformFeeRate;
    delete product.metadata.ozonPublication.withdrawalFeeRate;

    const captured = await service.captureApproved({
      organizationId: 'org-1',
      productLaunchId: 'launch-1',
      listingDraftId: 'listing-1',
      reviewTaskId: 'review-1',
      approvedBy: 'user-1',
      approvedAt: new Date('2026-07-14T09:00:00.000Z'),
    });

    expect((captured.snapshot as any).economics.source).toBe(
      'candidate_economics_evaluations',
    );
    expect(economicsProofService.requireInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        candidateId: 'candidate-1',
        evaluationId: 'evaluation-1',
        expectedPrice: 1999,
        expectedCurrency: 'RUB',
      }),
    );
  });

  it('does not persist a snapshot when the trusted proof gate rejects it', async () => {
    const { service, prisma, economicsProofService } = createService();
    economicsProofService.requireInTransaction.mockRejectedValueOnce({
      response: {
        code: 'PUBLISH_ECONOMICS_PROOF_REQUIRED',
        message: 'proof required',
      },
    });

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
        code: 'PUBLISH_ECONOMICS_PROOF_REQUIRED',
      }),
    });
    expect(prisma.listingPublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('rejects a listing price bound to a different economics evaluation', async () => {
    const { service, prisma, economicsProof, economicsProofService } =
      createService();
    economicsProofService.requireInTransaction.mockResolvedValueOnce({
      ...economicsProof,
      evaluationId: 'different-evaluation',
    });

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
        code: 'PUBLISH_LISTING_PRICING_PROOF_INVALID',
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

  it('rejects a valid historical v1 snapshot before any external dispatch', async () => {
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
      schemaVersion: 'listing-publish-snapshot/v1',
      snapshot: historicalBody,
      snapshotHash: historicalHash,
    });

    await expect(
      service.loadApproved({
        organizationId: 'org-1',
        snapshotId: captured.id,
        expectedSnapshotHash: historicalHash,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_PROOF_REQUIRED',
      }),
    });
  });
});
