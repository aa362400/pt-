import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ListingBundleService } from '../src/features/listings/listing-bundle.service.js';
import { ListingsService } from '../src/features/listings/listings.service.js';
import { ListingEvaluatorService } from '../src/features/listings/listing-evaluator.service.js';

const request = {
  productName: 'Portable tea set',
  description: 'Compact travel tea set',
  keywords: ['travel tea', 'gift'],
  platform: 'ozon',
  tone: 'professional',
};

const agentResult = {
  title: 'Portable Tea Set for Travel',
  description: 'A compact tea set designed for travel and gifting.',
  bulletPoints: ['Compact storage', 'Durable construction'],
  keywords: ['travel tea', 'portable tea set'],
  price: null,
  priceCurrency: null,
  pricingStatus: 'DATA_INSUFFICIENT',
  pricingEvidence: null,
  pricingMissingFields: ['pricingEvidence'],
  publishable: false,
  requiresHumanReview: true,
};

const pricingEvidence = {
  id: 'economics-evaluation-1',
  status: 'VERIFIED' as const,
  decision: 'PASS' as const,
  salePrice: '1800.0000',
  currency: 'RUB' as const,
  validFrom: '2026-07-12T00:00:00.000Z',
  validUntil: '2099-07-13T00:00:00.000Z',
  calculatorVersion: 'candidate-economics-calculator/v1',
  inputSetHash: 'a'.repeat(64),
  contentHash: 'b'.repeat(64),
};

describe('ListingBundleService', () => {
  const service = new ListingBundleService();

  it('builds a versioned, review-gated bundle with deterministic provenance hashes', () => {
    const result = service.build({
      request,
      agentResult,
      productId: 'product-1',
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.status).toBe('VALID');
    if (result.status !== 'VALID') {
      throw new Error('Expected valid listing bundle');
    }
    expect(result.bundle).toEqual(
      expect.objectContaining({
        schemaVersion: 'listing-bundle/v1',
        platform: 'ozon',
        content: {
          title: agentResult.title,
          description: agentResult.description,
          bullets: agentResult.bulletPoints,
        },
        seo: { keywords: agentResult.keywords, searchTerms: [] },
        mediaMapping: [],
        personalization: { enabled: false, fields: [] },
        policy: { reviewRequired: true, claims: [], warnings: [] },
      }),
    );
    expect(result.bundle.provenance).toEqual(
      expect.objectContaining({
        source: 'agent-listing-generation',
        productId: 'product-1',
        generatedAt: '2026-07-12T08:00:00.000Z',
        inputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        outputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(result.validation).toEqual(
      expect.objectContaining({ status: 'VALID', issues: [] }),
    );
  });

  it('returns structured issues and no bundle for malformed model output', () => {
    const result = service.build({
      request,
      agentResult: {
        title: '',
        description: '',
        bulletPoints: [''],
        keywords: 'not-an-array',
      },
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.status).toBe('INVALID');
    if (result.status !== 'INVALID') {
      throw new Error('Expected invalid listing bundle');
    }
    expect(result.bundle).toBeNull();
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'title' }),
        expect.objectContaining({ path: 'description' }),
        expect.objectContaining({ path: 'bulletPoints.0' }),
        expect.objectContaining({ path: 'keywords' }),
      ]),
    );
  });

  it('rejects an unverified positive price instead of freezing it into the bundle', () => {
    const result = service.build({
      request,
      agentResult: {
        ...agentResult,
        price: 1800,
        priceCurrency: 'RUB',
        pricingStatus: 'DATA_INSUFFICIENT',
      },
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.status).toBe('INVALID');
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('price') }),
      ]),
    );
  });

  it('stores a price only with the matching verified economics reference', () => {
    const result = service.build({
      request,
      agentResult: {
        ...agentResult,
        price: 1800,
        priceCurrency: 'RUB',
        pricingStatus: 'EVIDENCE_BACKED',
        pricingEvidence,
        pricingMissingFields: [],
      },
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });

    expect(result.status).toBe('VALID');
    if (result.status !== 'VALID') throw new Error('Expected valid bundle');
    expect(result.bundle.commercial).toEqual({
      suggestedPrice: 1800,
      priceCurrency: 'RUB',
      pricingStatus: 'EVIDENCE_BACKED',
      pricingEvidence,
      pricingMissingFields: [],
    });
  });

  it('rejects a stored bundle whose commercial price lost its evidence binding', () => {
    const built = service.build({
      request,
      agentResult,
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });
    if (built.status !== 'VALID') throw new Error('Expected valid bundle');
    const tampered = structuredClone(built.bundle);
    tampered.commercial = {
      suggestedPrice: 1,
      priceCurrency: null,
      pricingStatus: 'DATA_INSUFFICIENT',
      pricingEvidence: null,
      pricingMissingFields: ['pricingEvidence'],
    };

    expect(service.parseStoredBundle(tampered)).toBeNull();
  });

  it('includes approved media and all decision-relevant listing fields in the approval hash', () => {
    const result = service.build({
      request,
      agentResult,
      productId: 'product-1',
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });
    if (result.status !== 'VALID') {
      throw new Error('Expected valid listing bundle');
    }

    const first = structuredClone(result.bundle);
    first.mediaMapping = [
      {
        role: 'primary',
        assetUrl: 'https://assets.example.com/approved-a.png',
      },
    ];
    const second = structuredClone(first);
    second.mediaMapping = [
      {
        role: 'primary',
        assetUrl: 'https://assets.example.com/changed-after-review.png',
      },
    ];

    expect(service.computeApprovalSha256(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(service.computeApprovalSha256(first)).not.toBe(
      service.computeApprovalSha256(second),
    );
    expect(service.computeOutputSha256(first)).toBe(
      service.computeOutputSha256(second),
    );
  });
});

describe('ListingsService bundle gate', () => {
  function createService(result: unknown) {
    const existingBundleResult = new ListingBundleService().build({
      request,
      agentResult,
      productId: 'product-1',
      generatedAt: new Date('2026-07-12T08:00:00.000Z'),
    });
    if (existingBundleResult.status !== 'VALID') {
      throw new Error('Expected valid fixture bundle');
    }
    const existingDraft = {
      id: 'listing-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      productId: 'product-1',
      platform: 'ozon',
      title: agentResult.title,
      description: agentResult.description,
      bullets: agentResult.bulletPoints,
      seoTags: agentResult.keywords,
      status: 'DRAFT',
      bundle: existingBundleResult.bundle,
      validationResult: existingBundleResult.validation,
      provenance: existingBundleResult.bundle.provenance,
    };
    const prisma: any = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) },
      listingDraft: {
        findFirst: jest.fn().mockResolvedValue(existingDraft),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'listing-1', status: 'DRAFT', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...existingDraft, ...data }),
          ),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const agentProvider = {
      runListingGeneration: jest.fn().mockResolvedValue(result),
    };
    return {
      service: new ListingsService(
        prisma,
        audit as any,
        agentProvider as any,
        new ListingBundleService(),
        new ListingEvaluatorService(new ListingBundleService()),
        {
          run: jest.fn(
            (_organizationId: string, operation: (tx: unknown) => unknown) =>
              operation(prisma),
          ),
        } as any,
      ),
      prisma,
      audit,
    };
  }

  const user = { sub: 'user-1', orgId: 'org-1' } as any;
  const dto = {
    workspaceId: 'workspace-1',
    productId: 'product-1',
    ...request,
  };

  it('does not persist a draft when model output fails the bundle contract', async () => {
    const { service, prisma } = createService({
      title: '',
      description: '',
      bulletPoints: [],
      keywords: [],
    });

    await expect(service.generate(user, dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.listingDraft.create).not.toHaveBeenCalled();
  });

  it('persists the bundle, validation result, schema version and provenance', async () => {
    const { service, prisma } = createService(agentResult);

    await service.generate(user, dto);

    expect(prisma.listingDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schemaVersion: 'listing-bundle/v1',
        bundle: expect.objectContaining({ platform: 'ozon' }),
        validationResult: expect.objectContaining({ status: 'VALID' }),
        evaluationResult: expect.objectContaining({
          outcome: 'REVIEW_REQUIRED',
          evaluatorVersion: 'listing-evaluator/v1',
        }),
        score: expect.any(Number),
        provenance: expect.objectContaining({
          source: 'agent-listing-generation',
        }),
      }),
    });
  });

  it('does not persist copy that the independent evaluator blocks', async () => {
    const { service, prisma } = createService({
      ...agentResult,
      description: 'Lorem ipsum placeholder description for this product.',
    });

    await expect(service.generate(user, dto)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LISTING_EVALUATION_BLOCKED',
      }),
    });
    expect(prisma.listingDraft.create).not.toHaveBeenCalled();
  });

  it('keeps legacy columns and the bundle synchronized after a manual edit', async () => {
    const { service, prisma } = createService(agentResult);

    await service.update(user, 'listing-1', {
      title: 'Updated portable tea set',
      seoTags: ['updated tea set'],
    });

    expect(prisma.listingDraft.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: expect.objectContaining({
        title: 'Updated portable tea set',
        seoTags: ['updated tea set'],
        bundle: expect.objectContaining({
          content: expect.objectContaining({
            title: 'Updated portable tea set',
          }),
          seo: expect.objectContaining({ keywords: ['updated tea set'] }),
          provenance: expect.objectContaining({
            source: 'manual-listing-edit',
            actorId: 'user-1',
            parentOutputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
        evaluationResult: expect.objectContaining({
          outcome: 'REVIEW_REQUIRED',
        }),
        score: expect.any(Number),
      }),
    });
  });

  it.each(['APPROVED', 'PUBLISHED'] as const)(
    'rejects direct %s status changes outside controlled workflows',
    async (status) => {
      const { service, prisma } = createService(agentResult);

      await expect(
        service.update(user, 'listing-1', { status }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.listingDraft.update).not.toHaveBeenCalled();
    },
  );
});
