import { BadRequestException } from '@nestjs/common';
import { ListingBundleService } from '../src/features/listings/listing-bundle.service.js';
import { ListingEvaluatorService } from '../src/features/listings/listing-evaluator.service.js';
import { ReviewService } from '../src/features/review/review.service.js';

const reviewer = {
  sub: 'reviewer-1',
  email: 'reviewer@example.com',
  orgId: 'org-1',
  role: 'OWNER',
} as any;

function createListing(options?: { media?: boolean }) {
  const bundles = new ListingBundleService();
  const built = bundles.build({
    request: {
      productName: 'Portable tea set',
      description: 'Compact travel tea set',
      keywords: ['travel tea', 'gift'],
      platform: 'ozon',
    },
    agentResult: {
      title: 'Portable Tea Set for Travel',
      description:
        'A compact and durable tea set designed for travel and gifting.',
      bulletPoints: ['Compact storage', 'Durable construction'],
      keywords: ['travel tea', 'portable tea set'],
      price: null,
      priceCurrency: null,
      pricingStatus: 'DATA_INSUFFICIENT',
      pricingEvidence: null,
      pricingMissingFields: ['pricingEvidence'],
      publishable: false,
      requiresHumanReview: true,
    },
    productId: 'product-1',
    generatedAt: new Date('2026-07-12T08:00:00.000Z'),
  });
  if (built.status !== 'VALID') {
    throw new Error('Expected valid listing fixture');
  }
  if (options?.media) {
    built.bundle.mediaMapping = [
      {
        role: 'primary',
        assetUrl: 'https://assets.example.com/tea-set.png',
      },
    ];
  }
  const evaluator = new ListingEvaluatorService(bundles);
  return {
    bundles,
    evaluator,
    listing: {
      id: 'listing-1',
      organizationId: 'org-1',
      status: 'DRAFT',
      bundle: built.bundle,
      contentHash: built.bundle.provenance.outputSha256,
      approvalHash: bundles.computeApprovalSha256(built.bundle),
      provenance: built.bundle.provenance,
      evaluationResult: evaluator.evaluate(built.bundle),
      score: 90,
    },
  };
}

function createService(options?: { media?: boolean; tamper?: boolean }) {
  const fixture = createListing({ media: options?.media });
  const contentHash = fixture.listing.bundle.provenance.outputSha256;
  const listingHash = fixture.listing.approvalHash;
  if (options?.tamper) {
    fixture.listing.bundle.content.title = 'Changed after review was created';
    fixture.listing.bundle.provenance.outputSha256 =
      fixture.bundles.computeOutputSha256(fixture.listing.bundle);
    fixture.listing.contentHash =
      fixture.listing.bundle.provenance.outputSha256;
  }
  const reviewTask = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: 'LISTING_DRAFT',
    entityId: 'listing-1',
    status: 'PENDING',
    score: 90,
    threshold: 60,
    autoApproved: false,
    notes: null,
    approvalScope: {
      type: 'listing-content/v2',
      listingDraftId: 'listing-1',
      contentSha256: contentHash,
      listingSha256: listingHash,
      schemaVersion: 'listing-bundle/v1',
      capturedAt: '2026-07-12T08:01:00.000Z',
    },
    decisionEvidence: {},
  };
  const prisma: any = {
    reviewTask: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'review-created',
          ...data,
          score: data.score ?? null,
          threshold: data.threshold ?? 60,
        }),
      ),
      findFirst: jest.fn().mockResolvedValue(reviewTask),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...reviewTask, ...data }),
        ),
    },
    listingDraft: {
      findFirst: jest.fn().mockResolvedValue(fixture.listing),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...fixture.listing, ...data }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) =>
    callback(prisma),
  );
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  const memory = {
    updateReviewOutcome: jest.fn(),
    learnFromReview: jest.fn(),
  };
  const service = new (ReviewService as any)(
    prisma,
    queue,
    memory,
    fixture.bundles,
    fixture.evaluator,
    undefined,
    {
      run: jest.fn(
        (_organizationId: string, operation: (tx: unknown) => unknown) =>
          operation(prisma),
      ),
    },
    { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  ) as ReviewService;
  return { service, prisma, queue, fixture };
}

describe('ReviewService listing approval scope', () => {
  it('captures the content hash and never auto-approves a high-score listing', async () => {
    const { service, prisma } = createService({ media: true });

    await service.createFromAgentRun('org-1', {
      entityType: 'LISTING_DRAFT',
      entityId: 'listing-1',
      score: 99,
      threshold: 60,
    });

    expect(prisma.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'PENDING',
        autoApproved: false,
        approvalScope: expect.objectContaining({
          type: 'listing-content/v2',
          listingDraftId: 'listing-1',
          contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          listingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    });
  });

  it('approves only the exact reviewed hash and leaves the draft locally APPROVED', async () => {
    const { service, prisma } = createService({ media: true });

    const result = await service.update(reviewer, 'review-1', {
      status: 'APPROVED',
      notes: 'Ready for a separate publish confirmation.',
    });

    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED' }));
    expect(prisma.listingDraft.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'listing-1',
        organizationId: 'org-1',
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      data: expect.objectContaining({
        status: 'APPROVED',
        evaluationResult: expect.objectContaining({ outcome: 'QUALIFIED' }),
      }),
    });
    expect(prisma.listingDraft.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
    expect(prisma.reviewTask.update).toHaveBeenCalledWith({
      where: { id: 'review-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        assignedTo: 'reviewer-1',
        decisionEvidence: expect.objectContaining({
          type: 'listing-approval/v2',
          approvedContentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          approvedListingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          evaluatorOutcome: 'QUALIFIED',
        }),
      }),
    });
  });

  it('rejects approval when content changed after the review scope was captured', async () => {
    const { service, prisma } = createService({ media: true, tamper: true });

    await expect(
      service.update(reviewer, 'review-1', { status: 'APPROVED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reviewTask.update).not.toHaveBeenCalled();
    expect(prisma.listingDraft.updateMany).not.toHaveBeenCalled();
  });

  it('rejects approval until primary media is mapped', async () => {
    const { service, prisma } = createService({ media: false });

    await expect(
      service.update(reviewer, 'review-1', { status: 'APPROVED' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LISTING_NOT_QUALIFIED',
      }),
    });
    expect(prisma.reviewTask.update).not.toHaveBeenCalled();
    expect(prisma.listingDraft.updateMany).not.toHaveBeenCalled();
  });
});
