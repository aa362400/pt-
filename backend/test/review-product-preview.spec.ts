import { ReviewService } from '../src/features/review/review.service.js';

function createService() {
  const task = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: 'PRODUCT_RESEARCH',
    entityId: 'report-1',
    status: 'PENDING',
    score: null,
    threshold: 60,
    autoApproved: false,
    autoRegenerations: 0,
    notes: null,
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
  };
  const report = {
    id: 'report-1',
    organizationId: 'org-1',
    query: 'travel tea set',
    platform: 'OZON',
    summary: 'Two evidence-backed opportunities were selected.',
    opportunities: {
      competitors: ['Portable tea set', 'Insulated travel cup'],
      priceRange: { min: 1200, max: 2400, currency: 'RUB' },
      rating: 4.6,
      sourceEvidence: {
        source: 'ozon_public_listings',
        fetchedAt: '2026-07-10T09:30:00.000Z',
        searchQuery: 'автомобильный вентилятор',
        relevance: {
          strategy: 'translated_query_terms',
          matchTerms: ['автомобильный', 'вентилятор'],
        },
        items: [
          {
            title: 'Portable tea set',
            url: 'https://www.ozon.ru/product/tea-set-1/',
            imageUrl: 'https://cdn1.ozone.ru/s3/multimedia-tea-set.jpg',
            fetchedAt: '2026-07-10T09:29:00.000Z',
            priceRub: 1200,
          },
          {
            title: 'Insulated travel cup',
            url: 'https://www.ozon.ru/product/travel-cup-2/',
            imageUrl: 'https://cdn1.ozone.ru/s3/multimedia-travel-cup.jpg',
            fetchedAt: '2026-07-10T09:29:10.000Z',
            priceRub: 2400,
          },
        ],
      },
    },
    createdAt: new Date('2026-07-10T09:31:00.000Z'),
  };
  const prisma: any = {
    reviewTask: { findFirst: jest.fn().mockResolvedValue(task) },
    productResearchReport: { findFirst: jest.fn().mockResolvedValue(report) },
    productResearchCandidateDecision: {
      findMany: jest.fn().mockResolvedValue([
        {
          candidateIndex: 1,
          status: 'REJECTED',
          reason: 'Too similar to an existing product.',
          updatedAt: new Date('2026-07-10T09:40:00.000Z'),
        },
      ]),
    },
    productLaunch: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'launch-1',
          candidateId: 'report-1:0',
          productId: 'product-1',
          status: 'GENERATING_IMAGES',
          failureCode: null,
          failureMessage: null,
          imageProjectId: null,
          agentRunId: 'run-1',
          channelId: 'channel-1',
          updatedAt: new Date('2026-07-10T10:01:00.000Z'),
        },
      ]),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const agentMemory = {
    updateReviewOutcome: jest.fn(),
    learnFromReview: jest.fn(),
  };
  const tenantDatabase = {
    run: jest.fn((organizationId, operation) => operation(prisma)),
  };
  return {
    service: new (ReviewService as any)(
      prisma,
      queue,
      agentMemory,
      undefined,
      undefined,
      undefined,
      tenantDatabase,
      { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    ) as ReviewService,
    prisma,
  };
}

describe('ReviewService product research preview', () => {
  it('returns candidate previews with evidence and launch state instead of only raw report JSON', async () => {
    const { service, prisma } = createService();

    const result: any = await service.findOne(
      { sub: 'user-1', orgId: 'org-1' } as any,
      'review-1',
    );

    expect(result.entityAvailable).toBe(true);
    expect(result.productResearchPreview).toEqual(
      expect.objectContaining({
        reportId: 'report-1',
        query: 'travel tea set',
        platform: 'OZON',
        priceRange: { min: 1200, max: 2400, currency: 'RUB' },
        rating: 4.6,
        sourceEvidence: expect.objectContaining({
          source: 'ozon_public_listings',
          fetchedAt: '2026-07-10T09:30:00.000Z',
          searchQuery: 'автомобильный вентилятор',
          relevance: {
            strategy: 'translated_query_terms',
            matchTerms: ['автомобильный', 'вентилятор'],
          },
        }),
        candidates: [
          expect.objectContaining({
            id: 'report-1:0',
            name: 'Portable tea set',
            status: 'pending',
            productUrl: 'https://www.ozon.ru/product/tea-set-1/',
            imageUrl: 'https://cdn1.ozone.ru/s3/multimedia-tea-set.jpg',
            priceRub: 1200,
            evidenceReady: true,
            launch: expect.objectContaining({
              id: 'launch-1',
              status: 'GENERATING_IMAGES',
            }),
          }),
          expect.objectContaining({
            id: 'report-1:1',
            name: 'Insulated travel cup',
            status: 'rejected',
            productUrl: 'https://www.ozon.ru/product/travel-cup-2/',
            imageUrl: 'https://cdn1.ozone.ru/s3/multimedia-travel-cup.jpg',
            evidenceReady: true,
            rejectionReason: 'Too similar to an existing product.',
          }),
        ],
      }),
    );
    expect(
      prisma.productResearchCandidateDecision.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', reportId: 'report-1' },
      }),
    );
  });
});
