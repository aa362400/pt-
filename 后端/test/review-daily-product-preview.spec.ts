import { ReviewService } from '../src/features/review/review.service.js';

const fetchedAt = new Date('2026-07-16T09:30:00.000Z');

function dailyCandidate(
  rawSummary: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'candidate-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    researchRunId: 'research-run-1',
    canonicalName: 'stackable desk organizer',
    productType: 'desk organizer',
    material: 'plastic',
    primaryUse: 'desktop storage',
    status: 'HOLD',
    confidenceScore: 0.82,
    dataCompleteness: 88,
    rawSummary,
    researchRun: {
      id: 'research-run-1',
      businessDate: new Date('2026-07-16T00:00:00.000Z'),
      scheduleTimezone: 'Asia/Shanghai',
      status: 'COMPLETED',
    },
    signals: [
      {
        id: 'signal-1',
        source: 'google_shopping_public_sample',
        provider: 'serper',
        url: 'https://www.google.com/shopping/product/desk-organizer-1',
        fetchedAt,
        metricValue: null,
      },
    ],
    risks: [],
    scores: [
      {
        finalScore: 82,
        hardGateStatus: 'REVIEW_REQUIRED',
        hardGateReasons: ['MANUAL_PRICING_REQUIRED'],
        rank: 1,
        decision: 'HOLD',
        createdAt: fetchedAt,
      },
    ],
    economicsEvaluations: [],
    productLaunches: [],
    ...overrides,
  };
}

function createService(candidate: ReturnType<typeof dailyCandidate>) {
  const task = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: 'PRODUCT_RESEARCH',
    entityId: candidate.id,
    status: 'PENDING',
    score: 82,
    threshold: 80,
    autoApproved: false,
    autoRegenerations: 0,
    notes: null,
    createdAt: fetchedAt,
  };
  const prisma: any = {
    reviewTask: { findFirst: jest.fn().mockResolvedValue(task) },
    productResearchReport: { findFirst: jest.fn().mockResolvedValue(null) },
    productCandidate: { findFirst: jest.fn().mockResolvedValue(candidate) },
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };
  return new (ReviewService as any)(
    prisma,
    { add: jest.fn().mockResolvedValue({}) },
    { updateReviewOutcome: jest.fn(), learnFromReview: jest.fn() },
    undefined,
    undefined,
    undefined,
    tenantDatabase,
    { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  ) as ReviewService;
}

async function preview(candidate: ReturnType<typeof dailyCandidate>) {
  return (await createService(candidate).findOne(
    { sub: 'user-1', orgId: 'org-1' } as any,
    'review-1',
  )) as any;
}

describe('ReviewService daily product research preview', () => {
  it('preserves a known canonical variant ahead of a broader sourcing query and exposes only a provenance-backed HTTPS image pair', async () => {
    const result = await preview(
      dailyCandidate({
        evidence: [
          {
            source: 'google_shopping_public_sample',
            url: 'https://www.google.com/shopping/product/desk-organizer-1',
            imageUrl: 'https://images.example.com/desk-organizer.webp',
            imageEvidenceUrl:
              'https://www.google.com/shopping/product/desk-organizer-1',
            sourcingQueryZh: '桌面收纳盒',
            title: 'Stackable desk organizer',
          },
        ],
      }),
    );

    expect(result.dailyProductResearchPreview.displayName).toBe(
      '可叠放桌面收纳盒',
    );
    expect(result.productResearchPreview).toEqual(
      expect.objectContaining({
        query: '可叠放桌面收纳盒',
        platform: 'MULTI',
        summary:
          '每日真实选品候选。只有绑定仍在有效期内且已通过核验的利润评估，并由服务端重新通过风险审核后，才允许进入本地图片与商品资料准备。',
        sourceEvidence: expect.objectContaining({
          searchQuery: '可叠放桌面收纳盒',
          items: expect.arrayContaining([
            expect.objectContaining({
              url: 'https://www.google.com/shopping/product/desk-organizer-1',
              imageUrl: 'https://images.example.com/desk-organizer.webp',
            }),
          ]),
        }),
        candidates: [
          expect.objectContaining({
            name: '可叠放桌面收纳盒',
            productUrl:
              'https://www.google.com/shopping/product/desk-organizer-1',
            imageUrl: 'https://images.example.com/desk-organizer.webp',
          }),
        ],
      }),
    );
    expect(
      result.productResearchPreview.sourceEvidence.relevance.matchTerms,
    ).toEqual(['可叠放桌面收纳盒']);
  });

  it('uses a controlled product mapping when no valid Chinese sourcing field exists', async () => {
    const result = await preview(
      dailyCandidate(
        {
          evidence: [
            {
              source: 'google_shopping_public_sample',
              sourcingQueryZh: 'pencil case wholesale',
            },
          ],
        },
        {
          canonicalName: 'transparent mesh pencil case',
          productType: 'pencil case',
        },
      ),
    );

    expect(result.dailyProductResearchPreview.displayName).toBe('透明网格笔袋');
    expect(result.productResearchPreview.candidates[0].name).toBe(
      '透明网格笔袋',
    );
  });

  it('prioritizes a valid displayNameZh over a broader sourcing query', async () => {
    const result = await preview(
      dailyCandidate({
        displayNameZh: '可叠放桌面文件收纳架',
        evidence: [
          {
            source: 'google_shopping_public_sample',
            displayNameZh: '可叠放桌面收纳盒',
            sourcingQueryZh: '桌面收纳盒',
          },
        ],
      }),
    );

    expect(result.dailyProductResearchPreview.displayName).toBe(
      '可叠放桌面文件收纳架',
    );
  });

  it('accepts an evidence-level displayNameZh when the root field is absent', async () => {
    const result = await preview(
      dailyCandidate({
        evidence: [
          {
            source: 'google_shopping_public_sample',
            displayNameZh: '双层大容量笔袋',
            sourcingQueryZh: '笔袋',
          },
        ],
      }),
    );

    expect(result.dailyProductResearchPreview.displayName).toBe(
      '双层大容量笔袋',
    );
  });

  it('rejects a mixed Chinese-English controlled name and falls back closed when no mapping is known', async () => {
    const result = await preview(
      dailyCandidate(
        {
          displayNameZh: 'desk organizer 桌面收纳盒',
          evidence: [
            {
              source: 'google_shopping_public_sample',
              displayNameZh: 'quantum widget 量子配件',
              sourcingQueryZh: 'widget 配件',
            },
          ],
        },
        {
          canonicalName: 'unmapped quantum widget',
          productType: 'unmapped widget',
        },
      ),
    );

    expect(result.dailyProductResearchPreview.displayName).toBe(
      '中文名称待确认',
    );
  });

  it.each([
    ['pencil case double layer', 'pencil case', '双层笔袋'],
    ['transparent mesh pencil case', 'pencil case', '透明网格笔袋'],
    ['stackable desk organizer', 'desk organizer', '可叠放桌面收纳盒'],
    ['desk organizer tray', 'desk organizer', '桌面收纳托盘'],
    ['desk mail organizer', 'desk organizer', '桌面信件收纳架'],
    ['luggage tag pu', 'luggage tag', '聚氨酯行李牌'],
  ])(
    'preserves the real product variant for %s',
    async (canonicalName, productType, expectedName) => {
      const result = await preview(
        dailyCandidate(
          { evidence: [] },
          {
            canonicalName,
            productType,
          },
        ),
      );

      expect(result.dailyProductResearchPreview.displayName).toBe(expectedName);
    },
  );

  it('keeps a supplemental image tied to its own evidence page when it differs from the demand signal URL', async () => {
    const result = await preview(
      dailyCandidate({
        evidence: [
          {
            source: 'aliexpress_public_search',
            url: 'https://www.aliexpress.com/item/1005000000000000.html',
            imageUrl: 'https://images.example.com/supplemental-product.jpg',
            imageEvidenceUrl: 'https://www.walmart.com/ip/123456789',
            sourcingQueryZh: '桌面收纳盒',
          },
        ],
      }),
    );

    expect(result.productResearchPreview.candidates[0]).toEqual(
      expect.objectContaining({
        imageUrl: 'https://images.example.com/supplemental-product.jpg',
        productUrl: 'https://www.walmart.com/ip/123456789',
      }),
    );
    expect(result.productResearchPreview.sourceEvidence.items[0]).toEqual(
      expect.objectContaining({
        url: 'https://www.walmart.com/ip/123456789',
        imageUrl: 'https://images.example.com/supplemental-product.jpg',
      }),
    );
  });

  it.each([
    ['plain HTTP', 'http://images.example.com/product.jpg'],
    ['localhost', 'https://localhost/product.jpg'],
    ['loopback IPv4', 'https://127.0.0.1/product.jpg'],
    ['private IPv4 10/8', 'https://10.2.3.4/product.jpg'],
    ['private IPv4 172.16/12', 'https://172.20.3.4/product.jpg'],
    ['private IPv4 192.168/16', 'https://192.168.2.3/product.jpg'],
    ['link-local IPv4', 'https://169.254.169.254/latest/meta-data'],
    ['loopback IPv6', 'https://[::1]/product.jpg'],
    ['link-local IPv6', 'https://[fe80::1]/product.jpg'],
    ['local mDNS name', 'https://catalog.local/product.jpg'],
    [
      'embedded credentials',
      'https://user:pass@images.example.com/product.jpg',
    ],
    ['nonstandard port', 'https://images.example.com:8443/product.jpg'],
  ])('rejects an unsafe %s image URL', async (_label, unsafeImageUrl) => {
    const result = await preview(
      dailyCandidate({
        evidence: [
          {
            source: 'google_shopping_public_sample',
            imageUrl: unsafeImageUrl,
            imageEvidenceUrl: 'https://shop.example.com/products/1',
            sourcingQueryZh: '桌面收纳盒',
          },
        ],
      }),
    );

    expect(result.productResearchPreview.candidates[0].imageUrl).toBeNull();
    expect(
      result.productResearchPreview.sourceEvidence.items.every(
        (item: { imageUrl: string | null }) => item.imageUrl === null,
      ),
    ).toBe(true);
  });

  it.each([
    ['localhost', 'https://localhost/products/1'],
    ['private address', 'https://192.168.1.10/products/1'],
    ['link-local address', 'https://169.254.169.254/latest/meta-data'],
    ['local name', 'https://supplier.local/products/1'],
    ['credentials', 'https://user:pass@shop.example.com/products/1'],
    ['nonstandard port', 'https://shop.example.com:9443/products/1'],
  ])(
    'rejects an unsafe %s provenance URL',
    async (_label, unsafeEvidenceUrl) => {
      const result = await preview(
        dailyCandidate({
          evidence: [
            {
              source: 'google_shopping_public_sample',
              imageUrl: 'https://images.example.com/product.jpg',
              imageEvidenceUrl: unsafeEvidenceUrl,
              sourcingQueryZh: '桌面收纳盒',
            },
          ],
        }),
      );

      expect(result.productResearchPreview.candidates[0].imageUrl).toBeNull();
      expect(result.productResearchPreview.candidates[0].productUrl).toBe(
        'https://www.google.com/shopping/product/desk-organizer-1',
      );
    },
  );

  it.each([null, 'malformed', { evidence: 'not-an-array' }])(
    'fails closed for malformed rawSummary %#',
    async (rawSummary) => {
      const result = await preview(
        dailyCandidate(rawSummary, {
          canonicalName: 'unmapped quantum widget',
          productType: 'unmapped widget',
        }),
      );

      expect(result.dailyProductResearchPreview.displayName).toBe(
        '中文名称待确认',
      );
      expect(result.productResearchPreview.candidates[0]).toEqual(
        expect.objectContaining({
          name: '中文名称待确认',
          imageUrl: null,
        }),
      );
    },
  );

  it.each([
    {
      label: 'image evidence URL',
      evidence: [
        {
          source: 'source',
          imageUrl: 'https://images.example.com/product.jpg',
        },
      ],
    },
    {
      label: 'named source',
      evidence: [
        {
          imageUrl: 'https://images.example.com/product.jpg',
          imageEvidenceUrl: 'https://shop.example.com/products/1',
        },
      ],
    },
  ])('requires a valid $label for image provenance', async ({ evidence }) => {
    const result = await preview(dailyCandidate({ evidence }));

    expect(result.productResearchPreview.candidates[0].imageUrl).toBeNull();
  });
});
