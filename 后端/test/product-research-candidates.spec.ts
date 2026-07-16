import { ProductResearchService } from '../src/features/product-research/product-research.service.js';

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

const sourceEvidence = {
  source: 'ozon_public_listings',
  provider: 'serper',
  fetchedAt: '2026-07-10T08:00:00.000Z',
  items: [
    {
      id: 'ozon-1',
      title: 'Ozon tea set 1200 RUB',
      url: 'https://www.ozon.ru/product/tea-set-1/',
      fetchedAt: '2026-07-10T08:00:00.000Z',
      priceRub: 1200,
    },
    {
      id: 'ozon-2',
      title: 'Ozon tea travel cup 2400 RUB',
      url: 'https://www.ozon.ru/product/tea-cup-2/',
      fetchedAt: '2026-07-10T08:00:00.000Z',
      priceRub: 2400,
    },
  ],
};

const report = {
  id: 'report-1',
  organizationId: 'org-1',
  workspaceId: null,
  query: 'tea set',
  platform: 'ozon',
  summary: 'Agent selected product candidates',
  opportunities: {
    competitors: ['茶具套装', '旅行茶杯'],
    priceRange: { min: 1200, max: 2400, currency: 'RUB' },
    rating: 4.6,
    sourceEvidence,
  },
  status: 'COMPLETED',
  createdBy: 'user-1',
  createdAt: new Date('2026-07-09T08:00:00.000Z'),
};

function createService(overrides?: {
  approvedProducts?: unknown[];
  workspace?: { id: string; currency: string };
  decisions?: unknown[];
  storeContext?: Record<string, unknown> | null;
  experienceCards?: unknown[];
}) {
  const prisma: any = {
    productResearchReport: {
      findMany: jest.fn().mockResolvedValue([report]),
      findFirst: jest.fn().mockResolvedValue(report),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'auto-report-1',
          createdAt: new Date('2026-07-09T10:00:00.000Z'),
          ...data,
        }),
      ),
    },
    agentRun: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'failed-research-run-1',
          createdAt: new Date('2026-07-10T10:00:00.000Z'),
          ...data,
        }),
      ),
    },
    reviewTask: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'research-review-1',
          createdAt: new Date('2026-07-10T10:00:01.000Z'),
          ...data,
        }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    product: {
      findMany: jest.fn().mockResolvedValue(overrides?.approvedProducts ?? []),
    },
    workspace: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides?.workspace ?? { id: 'workspace-1', currency: 'RUB' },
        ),
    },
    notification: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'notification-1',
          readAt: null,
          createdAt: new Date('2026-07-09T10:01:00.000Z'),
          ...data,
        }),
      ),
    },
    productResearchCandidateDecision: {
      findMany: jest.fn().mockResolvedValue(overrides?.decisions ?? []),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({
          id: 'decision-1',
          createdAt: new Date('2026-07-10T09:00:00.000Z'),
          updatedAt: new Date('2026-07-10T09:00:00.000Z'),
          ...create,
        }),
      ),
    },
  };
  prisma.$transaction = jest.fn((callback) => callback(prisma));
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const products = {
    create: jest.fn().mockImplementation((_user, dto) =>
      Promise.resolve({
        id: 'product-1',
        ...dto,
        createdAt: new Date('2026-07-09T09:00:00.000Z'),
      }),
    ),
  };
  const agentProvider = {
    runProductResearch: jest.fn().mockResolvedValue({
      summary: 'Auto selection found market openings',
      competitors: ['折叠收纳箱', '厨房沥水架'],
      priceRange: { min: 1200, max: 2400, currency: 'RUB' },
      rating: null,
      sourceEvidence,
      runtime: {
        model: 'gpt-5.6-sol',
        status: 'available',
        durationMs: 1200,
      },
    }),
  };
  const notificationEvents = {
    publishCreated: jest.fn(),
  };
  const storeProfiles = {
    buildResearchContext: jest
      .fn()
      .mockResolvedValue(overrides?.storeContext ?? null),
  };
  const agentMemory = {
    getExperienceCards: jest
      .fn()
      .mockResolvedValue(overrides?.experienceCards ?? []),
    learnFromReview: jest.fn().mockResolvedValue({ id: 'experience-1' }),
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };

  return {
    service: new ProductResearchService(
      prisma,
      audit as any,
      products as any,
      agentProvider as any,
      tenantDatabase as any,
      notificationEvents as any,
      storeProfiles as any,
      agentMemory as any,
    ),
    prisma,
    audit,
    products,
    agentProvider,
    tenantDatabase,
    notificationEvents,
    storeProfiles,
    agentMemory,
  };
}

describe('ProductResearchService candidates', () => {
  it('creates a reusable review task for an existing pending candidate without approving or publishing it', async () => {
    const { service, prisma, products } = createService();

    const result = await service.ensureCandidateReview(user, 'report-1:0');

    expect(prisma.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        entityType: 'PRODUCT_RESEARCH',
        entityId: 'report-1',
        status: 'PENDING',
        autoApproved: false,
      }),
    });
    expect(products.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      reviewTaskId: 'research-review-1',
      reused: false,
    });
  });

  it('creates a product research review task for a manually requested evidence-backed report', async () => {
    const { service, prisma } = createService();

    const result = await service.create(user, {
      query: 'travel tea set',
      platform: 'OZON',
      workspaceId: 'workspace-1',
    });

    expect(prisma.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        entityType: 'PRODUCT_RESEARCH',
        entityId: 'auto-report-1',
        status: 'PENDING',
        autoApproved: false,
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          kind: 'product_research_candidates_approval',
          reviewTaskId: 'research-review-1',
          targetRoute: '/review',
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'auto-report-1',
        reviewTaskId: 'research-review-1',
      }),
    );
  });

  it('accepts related Ozon sources without a price when two cited listing prices prove the range', async () => {
    const { service, prisma, agentProvider } = createService();
    agentProvider.runProductResearch.mockResolvedValueOnce({
      summary:
        'Two cited Ozon listing prices establish the range while a third source adds competitor context.',
      competitors: [
        'Ozon tea set 1200 RUB',
        'Ozon tea travel cup 2400 RUB',
        'Ozon tea accessory without a price',
      ],
      priceRange: { min: 1200, max: 2400, currency: 'RUB' },
      rating: null,
      sourceEvidence: {
        ...sourceEvidence,
        items: [
          ...sourceEvidence.items,
          {
            id: 'ozon-3',
            title: 'Ozon tea accessory without a price',
            url: 'https://www.ozon.ru/product/tea-accessory-3/',
            fetchedAt: '2026-07-10T08:00:00.000Z',
            priceRub: null,
          },
        ],
      },
    });

    const result = await service.create(user, {
      query: 'tea set',
      platform: 'OZON',
      workspaceId: 'workspace-1',
    });

    expect(prisma.productResearchReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'COMPLETED',
        opportunities: expect.objectContaining({
          sourceEvidence: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ priceRub: null }),
            ]),
          }),
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'auto-report-1',
        reviewTaskId: 'research-review-1',
      }),
    );
  });

  it('routes Ozon listings unrelated to the original non-CJK query to manual review', async () => {
    const { service, prisma, agentProvider } = createService();
    const unrelatedItems = [
      {
        id: 'ozon-air-filter-1',
        title: 'HEPA air filter for home purifier',
        url: 'https://www.ozon.ru/product/hepa-air-filter-1/',
        snippet: 'Replacement filter element for a household air purifier.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: 950,
      },
      {
        id: 'ozon-air-filter-2',
        title: 'Washable air filter replacement cartridge',
        url: 'https://www.ozon.ru/product/washable-air-filter-2/',
        snippet: 'Reusable dust filter cartridge for indoor air cleaning.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: 1450,
      },
      {
        id: 'ozon-air-filter-3',
        title: 'Carbon air filter replacement pack',
        url: 'https://www.ozon.ru/product/carbon-air-filter-3/',
        snippet: 'Activated carbon replacement filters for a room purifier.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: null,
      },
      {
        id: 'ozon-air-filter-4',
        title: 'Compact purifier air filter element',
        url: 'https://www.ozon.ru/product/compact-air-filter-4/',
        snippet: 'Fine particle filter element for compact home purifiers.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: null,
      },
      {
        id: 'ozon-air-filter-5',
        title: 'Air filter set for desktop purifier',
        url: 'https://www.ozon.ru/product/desktop-air-filter-5/',
        snippet: 'Two replacement filters for a small desktop air purifier.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: null,
      },
    ];
    const competitors = unrelatedItems.map((item) => item.title);
    agentProvider.runProductResearch.mockResolvedValueOnce({
      summary:
        'Five Ozon air-filter listings provide competitor context and two observed RUB prices.',
      competitors,
      priceRange: { min: 950, max: 1450, currency: 'RUB' },
      rating: null,
      sourceEvidence: {
        source: 'ozon_public_listings',
        provider: 'serper',
        fetchedAt: '2026-07-16T06:00:00.000Z',
        competitors,
        items: unrelatedItems,
      },
    });

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'codex-qa-verification-nonexistent-product-20260716',
      platform: 'OZON',
      source: 'store_operator',
    });

    expect(prisma.productResearchReport.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        lifecycleStatus: 'FAILED',
        errorCode: 'RESEARCH_EVIDENCE_UNVERIFIABLE',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        reportId: null,
        candidateCount: 0,
        status: 'pending_review',
      }),
    );
  });

  it('accepts at least two Ozon listings related to an English product query', async () => {
    const { service, prisma, agentProvider } = createService();
    const relatedItems = [
      {
        id: 'ozon-air-filter-1',
        title: 'HEPA air filter for home purifier',
        url: 'https://www.ozon.ru/product/hepa-air-filter-1/',
        snippet: 'Replacement filter element for a household air purifier.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: 950,
      },
      {
        id: 'ozon-air-filter-2',
        title: 'Washable air filter replacement cartridge',
        url: 'https://www.ozon.ru/product/washable-air-filter-2/',
        snippet: 'Reusable dust filter cartridge for indoor air cleaning.',
        matchedTerms: ['air', 'filter'],
        fetchedAt: '2026-07-16T06:00:00.000Z',
        priceRub: 1450,
      },
    ];
    const competitors = relatedItems.map((item) => item.title);
    agentProvider.runProductResearch.mockResolvedValueOnce({
      summary:
        'Two relevant Ozon air-filter listings establish a reproducible RUB price range.',
      competitors,
      priceRange: { min: 950, max: 1450, currency: 'RUB' },
      rating: null,
      sourceEvidence: {
        source: 'ozon_public_listings',
        provider: 'serper',
        fetchedAt: '2026-07-16T06:00:00.000Z',
        competitors,
        items: relatedItems,
      },
    });

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'air filter',
      platform: 'OZON',
      source: 'store_operator',
    });

    expect(prisma.productResearchReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        query: 'air filter',
        status: 'COMPLETED',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        reportId: 'auto-report-1',
        candidateCount: 2,
      }),
    );
  });

  it('rejects a Chinese-query report unless its Ozon evidence records translated hard-match terms', () => {
    const { service } = createService();
    const automotiveEvidence = {
      ...sourceEvidence,
      items: sourceEvidence.items.map((item, index) => ({
        ...item,
        title: `Ozon \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440 ${index + 1}`,
      })),
    };
    const opportunities = {
      ...report.opportunities,
      sourceEvidence: {
        ...automotiveEvidence,
        searchQuery:
          '\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440',
        relevance: {
          strategy: 'repeated_listing_terms',
          matchTerms: [
            '\u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440',
            '\u043f\u043e\u0440\u0442\u0430\u0442\u0438\u0432\u043d\u044b\u0439',
          ],
        },
      },
    };

    expect(
      (service as any).hasVerifiableOzonEvidence(
        opportunities,
        'Evidence-backed automotive fan report.',
        '\u6c7d\u8f66\u98ce\u6247',
      ),
    ).toBe(false);

    (opportunities.sourceEvidence as any).relevance = {
      strategy: 'translated_query_terms',
      matchTerms: [
        '\u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439',
        '\u0432\u0435\u043d\u0442\u0438\u043b\u044f\u0442\u043e\u0440',
      ],
    };

    expect(
      (service as any).hasVerifiableOzonEvidence(
        opportunities,
        'Evidence-backed automotive fan report.',
        '\u6c7d\u8f66\u98ce\u6247',
      ),
    ).toBe(true);
  });

  it('lists only unapproved agent-selected candidates by default', async () => {
    const { service } = createService({
      approvedProducts: [
        {
          id: 'product-approved',
          workspaceId: 'workspace-1',
          title: '旅行茶杯',
          sku: 'AGENT-REPORT-2',
          asinOrExternalId: null,
          images: [],
          price: 1800,
          currency: 'RUB',
          status: 'DRAFT',
          createdAt: new Date('2026-07-09T09:00:00.000Z'),
          metadata: {
            source: 'agent-product-research',
            researchReportId: 'report-1',
            candidateIndex: 1,
          },
        },
      ],
    });

    const result = await service.findCandidates(user, { limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'report-1:0',
        name: '茶具套装',
        status: 'pending',
        approvedProductId: null,
      }),
    );
  });

  it('approves a candidate into a real draft product without external store mutation', async () => {
    const { service, products, audit, prisma } = createService();

    const result = await service.approveCandidate(user, 'report-1:0', {});

    expect(products.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        workspaceId: 'workspace-1',
        title: '茶具套装',
        currency: 'RUB',
        status: 'DRAFT',
        price: 1800,
        metadata: expect.objectContaining({
          source: 'agent-product-research',
          approvalStatus: 'approved',
          externalStoreMutation: 'not_executed',
          researchReportId: 'report-1',
          candidateIndex: 0,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product-research.candidate.approve',
        resourceId: 'report-1:0',
        after: expect.objectContaining({
          productId: 'product-1',
          externalStoreMutation: 'not_executed',
        }),
      }),
    );
    expect(result.action).toEqual({
      status: 'approved_local_draft',
      externalStoreMutation: 'not_executed',
    });
    expect(prisma.productResearchCandidateDecision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_reportId_candidateIndex: {
            organizationId: 'org-1',
            reportId: 'report-1',
            candidateIndex: 0,
          },
        },
      }),
    );
  });

  it('persists automatic selection candidates, creates a review task, and notifies the operator to review them', async () => {
    const {
      service,
      prisma,
      agentProvider,
      notificationEvents,
      storeProfiles,
      agentMemory,
    } = createService({
      storeContext: {
        workspaceId: 'workspace-1',
        targetCategories: ['Kitchen'],
        forbiddenTerms: ['regulated'],
        minimumProfitMargin: 25,
        notes: 'Avoid fragile goods.',
      },
      experienceCards: [
        {
          title: 'product: Avoid fragile items',
          lesson: 'Avoid fragile goods.',
        },
      ],
    });

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'tea set',
      platform: 'OZON',
      source: 'store_operator',
      automationFlowId: 'flow-1',
      automationRunId: 'run-1',
    });

    expect(agentProvider.runProductResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: 'tea set',
        marketplace: 'OZON',
        storeContext: expect.objectContaining({
          targetCategories: ['Kitchen'],
          forbiddenTerms: ['regulated'],
          reviewLessons: ['Avoid fragile goods.'],
        }),
      }),
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    );
    expect(storeProfiles.buildResearchContext).toHaveBeenCalledWith(
      'org-1',
      'workspace-1',
    );
    expect(agentMemory.getExperienceCards).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        taskType: 'product_research',
      }),
    );
    expect(prisma.productResearchReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        query: 'tea set',
        platform: 'OZON',
        status: 'COMPLETED',
        createdBy: 'user-1',
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        type: 'APPROVAL_REQUIRED',
        metadata: expect.objectContaining({
          kind: 'product_research_candidates_approval',
          reportId: 'auto-report-1',
          reviewTaskId: 'research-review-1',
          targetRoute: '/review',
          candidateCount: 2,
        }),
      }),
    });
    expect(prisma.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        entityType: 'PRODUCT_RESEARCH',
        entityId: 'auto-report-1',
        status: 'PENDING',
        autoApproved: false,
      }),
    });
    expect(notificationEvents.publishCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notification-1' }),
    );
    expect(result).toEqual({
      reportId: 'auto-report-1',
      candidateCount: 2,
      notificationId: 'notification-1',
      reviewTaskId: 'research-review-1',
    });
  });

  it('records a rejection, removes the candidate from the pending queue, and teaches the agent', async () => {
    const { service, prisma, audit, agentMemory } = createService({
      decisions: [
        {
          reportId: 'report-1',
          candidateIndex: 0,
          status: 'REJECTED',
          reason: 'Contains a store forbidden term.',
          createdAt: new Date('2026-07-10T08:00:00.000Z'),
          updatedAt: new Date('2026-07-10T08:00:00.000Z'),
        },
      ],
    });

    const rejected = await (service as any).rejectCandidate(
      user as any,
      'report-1:0',
      {
        reason: 'Contains a store forbidden term.',
      },
    );
    const pending = await service.findCandidates(user, { limit: 20 });
    const rejectedList = await service.findCandidates(user, {
      limit: 20,
      status: 'rejected',
    });

    expect(rejected.action).toEqual({
      status: 'rejected',
      externalStoreMutation: 'not_executed',
    });
    expect(prisma.productResearchCandidateDecision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'REJECTED',
          reason: 'Contains a store forbidden term.',
        }),
      }),
    );
    expect(agentMemory.learnFromReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceReviewTaskId: 'product-research:report-1:0',
        taskType: 'product_research',
        notes: expect.stringContaining('Contains a store forbidden term.'),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'product-research.candidate.reject' }),
    );
    expect(pending.total).toBe(1);
    expect(pending.items[0]).toEqual(
      expect.objectContaining({ id: 'report-1:1' }),
    );
    expect(rejectedList.items[0]).toEqual(
      expect.objectContaining({
        id: 'report-1:0',
        status: 'rejected',
        rejectionReason: 'Contains a store forbidden term.',
      }),
    );
  });

  it('routes an automatic result without verifiable Ozon evidence to manual review without creating a report', async () => {
    const { service, prisma, agentProvider } = createService();
    agentProvider.runProductResearch.mockResolvedValueOnce({
      summary: 'This result has fields but no source evidence.',
      competitors: ['Unverified competitor A', 'Unverified competitor B'],
      priceRange: { min: 1200, max: 2400, currency: 'RUB' },
      rating: null,
    });

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'Ozon proof required product',
      platform: 'OZON',
      source: 'store_operator',
    });

    expect(prisma.productResearchReport.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        agentType: 'PRODUCT_RESEARCHER',
        status: 'FAILED',
        lifecycleStatus: 'FAILED',
        currentStep: 'VERIFICATION_FAILED',
        errorCode: 'RESEARCH_EVIDENCE_UNVERIFIABLE',
      }),
    });
    expect(prisma.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        entityType: 'AGENT_RUN',
        entityId: 'failed-research-run-1',
        status: 'PENDING',
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        type: 'APPROVAL_REQUIRED',
        metadata: expect.objectContaining({
          kind: 'product_research_evidence_review',
          reviewTaskId: 'research-review-1',
          targetRoute: '/review',
        }),
      }),
    });
    expect(result).toEqual({
      reportId: null,
      candidateCount: 0,
      notificationId: 'notification-1',
      reviewTaskId: 'research-review-1',
      agentRunId: 'failed-research-run-1',
      status: 'pending_review',
    });
  });

  it('does not persist a manual report when evidence verification fails and sends it to review', async () => {
    const { service, prisma, agentProvider } = createService();
    agentProvider.runProductResearch.mockRejectedValueOnce(
      new Error(
        'Ozon evidence requires observed RUB prices from at least two listings',
      ),
    );

    await expect(
      service.create(user as any, {
        query: 'Ozon proof required product',
        platform: 'OZON',
        workspaceId: 'workspace-1',
      }),
    ).rejects.toThrow('已创建人工审核任务');

    expect(prisma.productResearchReport.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).toHaveBeenCalled();
    expect(prisma.reviewTask.create).toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('preserves a remote verifier failure and its Ozon evidence diagnostics for review', async () => {
    const { service, prisma, agentProvider } = createService();
    const error = new Error(
      'Verifier failed: missing competitor analysis',
    ) as Error & {
      diagnostics?: Record<string, unknown>;
    };
    error.diagnostics = {
      code: 'AGENT_OUTPUT_VERIFICATION_FAILED',
      issues: ['missing competitor analysis'],
      evidence: { itemCount: 2, observedPriceCount: 2 },
    };
    agentProvider.runProductResearch.mockRejectedValueOnce(error);

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'Ozon evidence-backed storage bag',
      platform: 'OZON',
      source: 'store_operator',
    });

    expect(prisma.productResearchReport.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        errorCode: 'RESEARCH_OUTPUT_VERIFICATION_FAILED',
        errorMessage: expect.stringContaining('missing competitor analysis'),
        progress: expect.objectContaining({
          remoteDiagnostics: expect.objectContaining({
            code: 'AGENT_OUTPUT_VERIFICATION_FAILED',
            evidence: { itemCount: 2, observedPriceCount: 2 },
          }),
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        reportId: null,
        status: 'pending_review',
      }),
    );
  });

  it('classifies missing public RUB prices as evidence failure and preserves candidates', async () => {
    const { service, prisma, agentProvider } = createService();
    const error = new Error(
      'Ozon evidence requires observed RUB prices from at least two listings',
    ) as Error & {
      diagnostics?: Record<string, unknown>;
    };
    error.diagnostics = {
      code: 'RESEARCH_EVIDENCE_PRICES_INSUFFICIENT',
      candidateCount: 2,
      observedPriceCount: 0,
      candidates: [
        {
          title: 'Ozon storage bag one',
          url: 'https://www.ozon.ru/product/storage-bag-1/',
        },
        {
          title: 'Ozon storage bag two',
          url: 'https://www.ozon.ru/product/storage-bag-2/',
        },
      ],
    };
    agentProvider.runProductResearch.mockRejectedValueOnce(error);

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'Ozon storage bag',
      platform: 'OZON',
      source: 'store_operator',
    });

    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        errorCode: 'RESEARCH_EVIDENCE_UNVERIFIABLE',
        errorMessage:
          'Ozon 公开商品来源中不足两条可解析的 RUB 价格，未生成报告。',
        progress: expect.objectContaining({
          remoteDiagnostics: expect.objectContaining({
            code: 'RESEARCH_EVIDENCE_PRICES_INSUFFICIENT',
            candidateCount: 2,
            observedPriceCount: 0,
          }),
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({ status: 'pending_review' }),
    );
  });

  it('routes a report whose price range is not derived from cited Ozon prices to manual review', async () => {
    const { service, prisma, agentProvider } = createService();
    agentProvider.runProductResearch.mockResolvedValueOnce({
      summary:
        'Evidence is present but the persisted market price would be fabricated.',
      competitors: ['Ozon tea set 1200 RUB', 'Ozon tea travel cup 2400 RUB'],
      priceRange: { min: 999, max: 2400, currency: 'RUB' },
      rating: null,
      sourceEvidence,
    });

    const result = await service.runAutomaticSelection({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'Ozon tea set',
      platform: 'OZON',
      source: 'store_operator',
    });

    expect(prisma.productResearchReport.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        reportId: null,
        reviewTaskId: 'research-review-1',
        status: 'pending_review',
      }),
    );
  });
});
