import { BadRequestException, ConflictException } from '@nestjs/common';
import { ListingBundleService } from '../src/features/listings/listing-bundle.service.js';
import { ListingEvaluatorService } from '../src/features/listings/listing-evaluator.service.js';
import { ListingsController } from '../src/features/listings/listings.controller.js';
import { ListingsService } from '../src/features/listings/listings.service.js';

const user = { sub: 'user-1', orgId: 'org-1' } as any;
const dto = {
  workspaceId: 'workspace-1',
  productId: 'product-1',
  productName: 'Portable tea set',
  description: 'Compact travel tea set',
  keywords: ['travel tea', 'gift'],
  platform: 'ozon',
  tone: 'professional',
} as any;
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

interface GenerationRequestRow {
  id: string;
  organizationId: string;
  userId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  status: string;
  claimToken: string;
  attempt: number;
  leaseExpiresAt: Date;
  listingDraftId: string | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createHarness(
  providerImplementation: () => Promise<typeof agentResult> = async () =>
    agentResult,
) {
  const generationRequests = new Map<string, GenerationRequestRow>();
  const drafts = new Map<string, Record<string, unknown>>();
  let generationRequestSequence = 0;
  let draftSequence = 0;

  const compositeKey = (value: {
    organizationId: string;
    userId: string;
    idempotencyKeyHash: string;
  }) =>
    `${value.organizationId}\u0000${value.userId}\u0000${value.idempotencyKeyHash}`;
  const cloneRow = (row: GenerationRequestRow) => ({ ...row });
  const matches = (
    row: GenerationRequestRow,
    where: Record<string, unknown>,
  ): boolean => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.claimToken !== undefined && row.claimToken !== where.claimToken)
      return false;
    if (
      where.requestHash !== undefined &&
      row.requestHash !== where.requestHash
    )
      return false;
    const lease = where.leaseExpiresAt as { lte?: Date } | undefined;
    if (lease?.lte && row.leaseExpiresAt.getTime() > lease.lte.getTime()) {
      return false;
    }
    return true;
  };

  const prisma: any = {
    workspace: {
      findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) },
    listingGenerationRequest: {
      upsert: jest.fn(async ({ where, create }: any) => {
        const compound = where.organizationId_userId_idempotencyKeyHash;
        const key = compositeKey(compound);
        let row = generationRequests.get(key);
        if (!row) {
          const now = new Date();
          row = {
            id: `generation-request-${++generationRequestSequence}`,
            listingDraftId: null,
            failureCode: null,
            attempt: 1,
            createdAt: now,
            updatedAt: now,
            ...create,
          };
          generationRequests.set(key, row);
        }
        return cloneRow(row);
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const compound = where.organizationId_userId_idempotencyKeyHash;
        const row = compound
          ? generationRequests.get(compositeKey(compound))
          : [...generationRequests.values()].find(
              (item) => item.id === where.id,
            );
        return row ? cloneRow(row) : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = [...generationRequests.values()].find((item) =>
          matches(item, where),
        );
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (
            value &&
            typeof value === 'object' &&
            'increment' in (value as Record<string, unknown>)
          ) {
            (row as any)[key] += Number(
              (value as Record<string, unknown>).increment,
            );
          } else {
            (row as any)[key] = value;
          }
        }
        row.updatedAt = new Date();
        return { count: 1 };
      }),
    },
    listingDraft: {
      create: jest.fn(async ({ data }: any) => {
        const draft = {
          id: `listing-${++draftSequence}`,
          status: 'DRAFT',
          createdAt: new Date(),
          ...data,
        };
        drafts.set(draft.id, draft);
        return draft;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const draft = drafts.get(where.id);
        return draft && draft.organizationId === where.organizationId
          ? draft
          : null;
      }),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const agentProvider = {
    runListingGeneration: jest.fn(providerImplementation),
  };
  const bundle = new ListingBundleService();
  const service = new ListingsService(
    prisma,
    audit as any,
    agentProvider as any,
    bundle,
    new ListingEvaluatorService(bundle),
    {
      run: jest.fn((_organizationId: string, operation: (tx: any) => unknown) =>
        operation(prisma),
      ),
    } as any,
  );

  return { service, prisma, audit, agentProvider, generationRequests, drafts };
}

describe('POST /listings/generate idempotency', () => {
  const idempotencyKey = 'listing-ui:11111111-2222-4333-8444-555555555555';

  it('returns the same persisted draft for the same organization, user, key, and request', async () => {
    const { service, prisma, audit, agentProvider, generationRequests } =
      createHarness();

    const first = await service.generate(user, dto, idempotencyKey);
    const retry = await service.generate(user, dto, idempotencyKey);

    expect(retry.id).toBe(first.id);
    expect(agentProvider.runListingGeneration).toHaveBeenCalledTimes(1);
    expect(prisma.listingDraft.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect([...generationRequests.values()][0]).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: 'COMPLETED',
      listingDraftId: first.id,
    });
  });

  it('rejects reusing the key with a different request', async () => {
    const { service, prisma, agentProvider } = createHarness();
    await service.generate(user, dto, idempotencyKey);

    await expect(
      service.generate(
        user,
        { ...dto, productName: 'Different product' },
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(agentProvider.runListingGeneration).toHaveBeenCalledTimes(1);
    expect(agentProvider.runListingGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        requestId: expect.stringMatching(/^listing-generation:[a-f0-9]{64}$/),
      }),
    );
    expect(prisma.listingDraft.create).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent retries before invoking the paid provider', async () => {
    let signalStarted!: () => void;
    let releaseProvider!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const { service, prisma, agentProvider } = createHarness(async () => {
      signalStarted();
      await providerGate;
      return agentResult;
    });

    const firstPromise = service.generate(user, dto, idempotencyKey);
    await started;
    const retryPromise = service.generate(user, dto, idempotencyKey);
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseProvider();

    const [first, retry] = await Promise.all([firstPromise, retryPromise]);
    expect(retry.id).toBe(first.id);
    expect(agentProvider.runListingGeneration).toHaveBeenCalledTimes(1);
    expect(prisma.listingDraft.create).toHaveBeenCalledTimes(1);
  });

  it('keeps requests without a key backward compatible', async () => {
    const { service, prisma, agentProvider, generationRequests } =
      createHarness();

    const first = await service.generate(user, dto);
    const second = await service.generate(user, dto);

    expect(first.id).not.toBe(second.id);
    expect(agentProvider.runListingGeneration).toHaveBeenCalledTimes(2);
    expect(prisma.listingDraft.create).toHaveBeenCalledTimes(2);
    expect(generationRequests.size).toBe(0);
  });

  it('rejects malformed keys before invoking the provider', async () => {
    const { service, agentProvider } = createHarness();

    await expect(
      service.generate(user, dto, 'too-short'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agentProvider.runListingGeneration).not.toHaveBeenCalled();
  });

  it('reclaims a failed claim with the same request without creating two drafts', async () => {
    let attempts = 0;
    const { service, prisma, agentProvider, generationRequests } =
      createHarness(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary provider failure');
        return agentResult;
      });

    await expect(service.generate(user, dto, idempotencyKey)).rejects.toThrow(
      'temporary provider failure',
    );
    const retry = await service.generate(user, dto, idempotencyKey);

    expect(retry.id).toBe('listing-1');
    expect(agentProvider.runListingGeneration).toHaveBeenCalledTimes(2);
    expect(prisma.listingDraft.create).toHaveBeenCalledTimes(1);
    expect([...generationRequests.values()][0]).toMatchObject({
      status: 'COMPLETED',
      attempt: 2,
      listingDraftId: 'listing-1',
    });
    expect(agentProvider.runListingGeneration.mock.calls[0][1].requestId).toBe(
      agentProvider.runListingGeneration.mock.calls[1][1].requestId,
    );
  });

  it('scopes the same client key independently for different users', async () => {
    const { service, prisma, agentProvider, generationRequests } =
      createHarness();

    const first = await service.generate(user, dto, idempotencyKey);
    const second = await service.generate(
      { ...user, sub: 'user-2' },
      dto,
      idempotencyKey,
    );

    expect(first.id).not.toBe(second.id);
    expect(prisma.listingDraft.create).toHaveBeenCalledTimes(2);
    expect(agentProvider.runListingGeneration).toHaveBeenCalledTimes(2);
    expect(generationRequests.size).toBe(2);
    expect(
      agentProvider.runListingGeneration.mock.calls[0][1].requestId,
    ).not.toBe(agentProvider.runListingGeneration.mock.calls[1][1].requestId);
  });

  it('forwards the HTTP Idempotency-Key header into the service boundary', async () => {
    const generate = jest.fn().mockResolvedValue({ id: 'listing-1' });
    const controller = new ListingsController({ generate } as any);

    await controller.generate(user, dto, idempotencyKey);

    expect(generate).toHaveBeenCalledWith(user, dto, idempotencyKey);
  });

  it('rejects an HTTP generation request without Idempotency-Key', async () => {
    const generate = jest.fn();
    const controller = new ListingsController({ generate } as any);

    expect(() => controller.generate(user, dto, undefined)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'LISTING_IDEMPOTENCY_KEY_REQUIRED',
        }),
      }),
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
