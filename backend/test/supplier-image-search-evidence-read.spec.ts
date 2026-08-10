import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { DailyProductResearchModule } from '../src/features/product-research/daily/daily-product-research.module.js';
import { SupplierImageSearchEvidenceReadController } from '../src/features/product-research/daily/supplier-image-search-evidence-read.controller.js';
import {
  SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
  supplierImageSearchEvidenceReadResponseSchema,
} from '../src/features/product-research/daily/contracts/supplier-image-search-evidence-read.contract.js';
import { SupplierImageSearchEvidenceReadService } from '../src/features/product-research/daily/services/supplier-image-search-evidence-read.service.js';

const HASH = {
  raw: 'a'.repeat(64),
  original: 'b'.repeat(64),
  canonical: 'c'.repeat(64),
  content: 'd'.repeat(64),
};

function storedEvidence(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'evidence-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    researchRunId: 'run-1',
    candidateId: 'candidate-1',
    schemaVersion: 'supplier-image-search/v1',
    provider: 'documented-1688-image-search',
    adapterVersion: 'supplier-image-search-adapter/v1',
    requestId: 'request-1',
    outcome: 'MATCHES',
    rawSnapshotSha256: HASH.raw,
    canonicalizationVersion: 'supplier-image-canonical/v1',
    sourceOriginalSha256: HASH.original,
    sourceCanonicalSha256: HASH.canonical,
    canonicalByteSize: 128_000,
    canonicalMimeType: 'image/png',
    canonicalWidth: 1200,
    canonicalHeight: 1200,
    retrievalHashAlgorithm: 'DHASH64',
    retrievalHash: '0123456789abcdef',
    providerResultCount: 1,
    normalizedOffers: [
      {
        offerId: '123456789000000001',
        subject: 'Stainless display rack',
        detailUrl: 'https://detail.1688.com/offer/123456789000000001.html',
        imageUrl: 'https://cbu01.alicdn.com/img/offer-1.png',
        distributionFreePostage: null,
        displayPriceEvidence: {
          price: '18.50-21.00',
          consignPrice: '19.00 / piece',
          multipleConsignPrice: null,
          evidenceUse: 'DISPLAY_ONLY',
          verifiedProcurementCost: false,
        },
      },
    ],
    fetchedAt: new Date('2026-07-16T04:00:00.000Z'),
    contentCanonicalizerVersion: 'supplier-image-search-jcs/v1',
    contentHash: HASH.content,
    ...overrides,
  };
}

function fixture(input?: {
  candidate?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
}) {
  const writes = {
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const tx = {
    productCandidate: {
      findFirst: jest.fn().mockResolvedValue(
        input?.candidate === undefined
          ? {
              id: 'candidate-1',
              organizationId: 'org-1',
              workspaceId: 'workspace-1',
              researchRunId: 'run-1',
            }
          : input.candidate,
      ),
    },
    supplierImageSearchEvidence: {
      findMany: jest.fn().mockResolvedValue(input?.rows ?? []),
      ...writes,
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (_organizationId: string, operation: (value: unknown) => unknown) =>
        operation(tx),
    ),
  };
  return {
    service: new SupplierImageSearchEvidenceReadService(
      tenantDatabase as never,
    ),
    tx,
    writes,
    tenantDatabase,
  };
}

const user = {
  sub: 'user-1',
  email: 'owner@example.com',
  orgId: 'org-1',
};

describe('SupplierImageSearchEvidenceReadService', () => {
  it('returns tenant-bound MATCHES and explicit NO_RESULTS evidence newest first', async () => {
    const matches = storedEvidence();
    const noResults = storedEvidence({
      id: 'evidence-0',
      requestId: 'request-0',
      outcome: 'NO_RESULTS',
      providerResultCount: 0,
      normalizedOffers: [],
      fetchedAt: new Date('2026-07-16T03:00:00.000Z'),
      contentHash: 'e'.repeat(64),
    });
    const { service, tx, tenantDatabase } = fixture({
      rows: [noResults, matches],
    });

    const result = await service.listForCandidate(user, 'candidate-1', {
      limit: 25,
    });

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(tx.productCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: 'candidate-1', organizationId: 'org-1' },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        researchRunId: true,
      },
    });
    expect(tx.supplierImageSearchEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          candidateId: 'candidate-1',
          researchRunId: 'run-1',
          workspaceId: 'workspace-1',
        },
        orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        take: 25,
      }),
    );
    expect(result).toEqual(
      supplierImageSearchEvidenceReadResponseSchema.parse(result),
    );
    expect(result.schemaVersion).toBe(
      SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
    );
    expect(result.items.map((item) => item.outcome)).toEqual([
      'MATCHES',
      'NO_RESULTS',
    ]);
    expect(result.items[0]?.offers[0]?.displayPriceEvidence).toEqual({
      price: '18.50-21.00',
      consignPrice: '19.00 / piece',
      multipleConsignPrice: null,
      evidenceUse: 'DISPLAY_ONLY',
      verifiedProcurementCost: false,
    });
    expect(typeof result.items[0]?.offers[0]?.displayPriceEvidence.price).toBe(
      'string',
    );
  });

  it('returns 404 for a candidate outside the JWT organization without querying evidence', async () => {
    const { service, tx } = fixture({ candidate: null });

    await expect(
      service.listForCandidate(user, 'candidate-from-org-2', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.supplierImageSearchEvidence.findMany).not.toHaveBeenCalled();
  });

  it('fails the candidate lookup closed if a database result violates the organization predicate', async () => {
    const { service, tx } = fixture({
      candidate: {
        id: 'candidate-1',
        organizationId: 'org-2',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
      },
    });

    await expect(
      service.listForCandidate(user, 'candidate-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.supplierImageSearchEvidence.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['organization', { organizationId: 'org-from-other-tenant' }],
    ['workspace', { workspaceId: 'workspace-from-other-parent' }],
    ['research run', { researchRunId: 'run-from-other-parent' }],
    ['candidate', { candidateId: 'candidate-from-other-parent' }],
  ])(
    'drops a row whose stored %s binding does not match the verified candidate',
    async (_binding, overrides) => {
      const { service } = fixture({ rows: [storedEvidence(overrides)] });

      await expect(
        service.listForCandidate(user, 'candidate-1', {}),
      ).resolves.toEqual({
        schemaVersion: SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
        candidateId: 'candidate-1',
        limit: 20,
        items: [],
      });
    },
  );

  it('returns an empty list when no evidence exists and never fabricates NO_RESULTS', async () => {
    const { service } = fixture({ rows: [] });

    const result = await service.listForCandidate(user, 'candidate-1', {});

    expect(result.items).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('NO_RESULTS');
  });

  it('fails closed on malformed persisted normalizedOffers instead of returning partial evidence', async () => {
    const valid = storedEvidence();
    const malformed = storedEvidence({
      id: 'evidence-malformed',
      normalizedOffers: [
        {
          offerId: '123',
          subject: null,
          detailUrl: null,
          imageUrl: null,
          distributionFreePostage: null,
          displayPriceEvidence: {
            price: 18.5,
            consignPrice: null,
            multipleConsignPrice: null,
            evidenceUse: 'DISPLAY_ONLY',
            verifiedProcurementCost: false,
          },
        },
      ],
    });
    const { service } = fixture({ rows: [valid, malformed] });

    await expect(
      service.listForCandidate(user, 'candidate-1', {}),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('enforces the read limit at 50 even when called without validation pipes', async () => {
    const { service, tx } = fixture();

    const result = await service.listForCandidate(user, 'candidate-1', {
      limit: 500,
    });

    expect(result.limit).toBe(50);
    expect(tx.supplierImageSearchEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('requires an organization claim and performs no read or write without it', async () => {
    const { service, tenantDatabase } = fixture();

    await expect(
      service.listForCandidate(
        { sub: 'user-1', email: 'user@example.com' },
        'candidate-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantDatabase.run).not.toHaveBeenCalled();
  });

  it('uses only read methods and has no provider dependency or write path', async () => {
    const { service, writes } = fixture({ rows: [storedEvidence()] });

    await service.listForCandidate(user, 'candidate-1', {});

    for (const write of Object.values(writes)) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(Object.keys(service)).toEqual(['tenantDatabase']);
  });

  it('rejects forbidden cost, currency, raw payload, secret and dedupe fields in the read contract', () => {
    const response = {
      schemaVersion: SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
      candidateId: 'candidate-1',
      limit: 20,
      items: [],
    };

    for (const forbidden of [
      'currency',
      'numericCost',
      'rawBody',
      'imgBase64',
      'token',
      'dedupeKey',
    ]) {
      expect(
        supplierImageSearchEvidenceReadResponseSchema.safeParse({
          ...response,
          [forbidden]: 'forbidden',
        }).success,
      ).toBe(false);
    }
  });
});

describe('SupplierImageSearchEvidenceReadController', () => {
  it('is registered with its service in the daily research module', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      DailyProductResearchModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DailyProductResearchModule,
    ) as unknown[];

    expect(controllers).toContain(SupplierImageSearchEvidenceReadController);
    expect(providers).toContain(SupplierImageSearchEvidenceReadService);
  });

  it('delegates the GET read without changing the caller organization', async () => {
    const service = {
      listForCandidate: jest.fn().mockResolvedValue({
        schemaVersion: SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
        candidateId: 'candidate-1',
        limit: 20,
        items: [],
      }),
    };
    const controller = new SupplierImageSearchEvidenceReadController(
      service as never,
    );

    await controller.listForCandidate(
      user,
      { candidateId: 'candidate-1' },
      { limit: 20 },
    );

    expect(service.listForCandidate).toHaveBeenCalledWith(user, 'candidate-1', {
      limit: 20,
    });
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        SupplierImageSearchEvidenceReadController,
      ),
    ).toBe('daily-product-research');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        SupplierImageSearchEvidenceReadController.prototype.listForCandidate,
      ),
    ).toBe('candidates/:candidateId/supplier-image-search-evidence');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        SupplierImageSearchEvidenceReadController.prototype.listForCandidate,
      ),
    ).toBe(RequestMethod.GET);
  });
});
