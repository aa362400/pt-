import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supplierImageSearchEvidenceSchema } from '../src/features/product-research/daily/contracts/supplier-image-search-evidence.contract.js';
import { SupplierImageSearchEvidenceStoreService } from '../src/features/product-research/daily/services/supplier-image-search-evidence-store.service.js';

const MIGRATION = '20260716223000_add_supplier_image_search_evidence';

function evidenceFixture(requestId = 'image-search-request-20260716-001') {
  return supplierImageSearchEvidenceSchema.parse({
    schemaVersion: 'supplier-image-search/v1',
    provider: 'documented-1688-image-search',
    adapterVersion: 'supplier-image-search-adapter/v1',
    requestId,
    outcome: 'MATCHES',
    rawSnapshotSha256: 'a'.repeat(64),
    canonicalization: {
      version: 'supplier-image-canonical/v1',
      sourceOriginalSha256: 'b'.repeat(64),
      sourceCanonicalSha256: 'c'.repeat(64),
      canonicalByteSize: 128_000,
      canonicalMimeType: 'image/png',
      canonicalWidth: 1200,
      canonicalHeight: 1200,
      retrievalHashAlgorithm: 'DHASH64',
      retrievalHash: '0123456789abcdef',
    },
    providerResultCount: 1,
    normalizedOffers: [
      {
        offerId: '123456789000000001',
        subject: null,
        detailUrl: 'https://detail.1688.com/offer/123456789000000001.html',
        imageUrl: 'https://cbu01.alicdn.com/img/offer-1.png',
        distributionFreePostage: null,
        displayPriceEvidence: {
          price: '¥18.50 起',
          consignPrice: 'CNY 19.00 / 件',
          multipleConsignPrice: null,
          evidenceUse: 'DISPLAY_ONLY',
          verifiedProcurementCost: false,
        },
      },
    ],
    fetchedAt: '2026-07-16T03:30:00.000Z',
  });
}

interface FixtureOptions {
  organization?: unknown;
  workspace?: unknown;
  researchRun?: unknown;
  candidate?: unknown;
  requestRow?: {
    id: string;
    contentHash: string;
    dedupeKey: string;
    workspaceId: string | null;
    researchRunId: string;
    candidateId: string;
  } | null;
  dedupeRow?: {
    id: string;
    contentHash: string;
    dedupeKey: string;
    workspaceId: string | null;
    researchRunId: string;
    candidateId: string;
  } | null;
  inserted?: boolean;
}

function fixture(options: FixtureOptions = {}) {
  const createMany = jest
    .fn()
    .mockResolvedValue({ count: options.inserted === false ? 0 : 1 });
  const findUnique = jest.fn().mockImplementation(async (query: unknown) => {
    const where = (query as { where?: Record<string, unknown> }).where ?? {};
    if (
      'organizationId_provider_requestId' in where ||
      'organizationId_workspaceScopeKey_provider_requestId' in where ||
      'organizationId_workspaceScopeKey_requestId' in where
    ) {
      if (options.requestRow !== undefined) return options.requestRow;
      if (createMany.mock.calls.length === 0) return null;
    }
    if ('organizationId_dedupeKey' in where) {
      if (options.dedupeRow !== undefined) return options.dedupeRow;
      if (createMany.mock.calls.length === 0) return null;
    }
    const data = createMany.mock.calls[0]?.[0]?.data?.[0];
    return data
      ? {
          id: 'image-search-evidence-1',
          contentHash: data.contentHash,
          dedupeKey: data.dedupeKey,
          workspaceId: data.workspaceId,
          researchRunId: data.researchRunId,
          candidateId: data.candidateId,
        }
      : null;
  });
  const tx = {
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.organization === undefined
            ? { id: 'org-1' }
            : options.organization,
        ),
    },
    workspace: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.workspace === undefined
            ? { id: 'workspace-1' }
            : options.workspace,
        ),
    },
    productResearchRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.researchRun === undefined
            ? { id: 'run-1' }
            : options.researchRun,
        ),
    },
    productCandidate: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.candidate === undefined
            ? { id: 'candidate-1' }
            : options.candidate,
        ),
    },
    supplierImageSearchEvidence: { createMany, findUnique },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (_orgId: string, operation: (value: unknown) => unknown) =>
        operation(tx),
    ),
  };
  return {
    service: new SupplierImageSearchEvidenceStoreService(
      tenantDatabase as never,
    ),
    tx,
    createMany,
    findUnique,
  };
}

const input = {
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  researchRunId: 'run-1',
  candidateId: 'candidate-1',
  evidence: evidenceFixture(),
};

describe('SupplierImageSearchEvidenceStoreService', () => {
  it('appends display-only normalized offers with deterministic JCS-style hashes', async () => {
    const first = fixture();
    const second = fixture();

    const firstResult = await first.service.append(input);
    const secondResult = await second.service.append(input);
    const firstData = first.createMany.mock.calls[0][0].data[0];
    const secondData = second.createMany.mock.calls[0][0].data[0];

    expect(firstResult).toEqual({
      id: 'image-search-evidence-1',
      inserted: true,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(secondResult.contentHash).toBe(firstResult.contentHash);
    expect(secondResult.dedupeKey).toBe(firstResult.dedupeKey);
    expect(firstData.contentHash).toBe(secondData.contentHash);
    expect(firstData.dedupeKey).toBe(secondData.dedupeKey);
    expect(firstData.workspaceScopeKey).toBe('workspace:id:workspace-1');
    expect(firstData.normalizedOffers).toEqual(input.evidence.normalizedOffers);
    expect(firstData.normalizedOffers[0]).toEqual({
      offerId: '123456789000000001',
      subject: null,
      detailUrl: 'https://detail.1688.com/offer/123456789000000001.html',
      imageUrl: 'https://cbu01.alicdn.com/img/offer-1.png',
      distributionFreePostage: null,
      displayPriceEvidence: {
        price: '¥18.50 起',
        consignPrice: 'CNY 19.00 / 件',
        multipleConsignPrice: null,
        evidenceUse: 'DISPLAY_ONLY',
        verifiedProcurementCost: false,
      },
    });
    expect(firstData).not.toHaveProperty('procurementCost');
    expect(firstData).not.toHaveProperty('currency');
    expect(firstData).not.toHaveProperty('productUnitAmount');
    expect(first.tx.supplierImageSearchEvidence).not.toHaveProperty('update');
    expect(first.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_workspaceScopeKey_requestId: {
            organizationId: 'org-1',
            workspaceScopeKey: 'workspace:id:workspace-1',
            requestId: input.evidence.requestId,
          },
        },
      }),
    );
  });

  it('uses a collision-safe organization-level request scope when workspace is null', async () => {
    const orgScoped = fixture();

    await orgScoped.service.append({ ...input, workspaceId: null });

    const data = orgScoped.createMany.mock.calls[0][0].data[0];
    expect(data.workspaceScopeKey).toBe('workspace:empty');
  });

  it('normalizes provider microseconds to the persisted millisecond precision before hashing', async () => {
    const microseconds = fixture();
    const milliseconds = fixture();
    const microsecondEvidence = {
      ...evidenceFixture('image-search-request-precision'),
      fetchedAt: '2026-07-16T03:30:00.123456Z',
    };
    const millisecondEvidence = {
      ...evidenceFixture('image-search-request-precision'),
      fetchedAt: '2026-07-16T03:30:00.123Z',
    };

    const first = await microseconds.service.append({
      ...input,
      evidence: microsecondEvidence,
    });
    const second = await milliseconds.service.append({
      ...input,
      evidence: millisecondEvidence,
    });
    const stored = microseconds.createMany.mock.calls[0][0].data[0];

    expect(first.contentHash).toBe(second.contentHash);
    expect(stored.fetchedAt.toISOString()).toBe('2026-07-16T03:30:00.123Z');
    expect(stored.contentCanonicalizerVersion).toBe(
      'supplier-image-search-jcs/v1',
    );
  });

  it.each([
    ['organization', { organization: null }],
    ['workspace', { workspace: null }],
    ['research run', { researchRun: null }],
    ['candidate', { candidate: null }],
  ] as const)(
    'rejects a mismatched %s parent before inserting',
    async (_label, options) => {
      const { service, createMany } = fixture(options);

      await expect(service.append(input)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects a reused organization/provider/request id with different content', async () => {
    const { service, createMany } = fixture({
      requestRow: {
        id: 'existing-request-row',
        contentHash: 'd'.repeat(64),
        dedupeKey: 'e'.repeat(64),
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
      },
    });

    await expect(service.append(input)).rejects.toThrow(
      'SUPPLIER_IMAGE_SEARCH_REQUEST_ID_REUSED_WITH_DIFFERENT_CONTENT',
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects a reused request id whose existing row belongs to another parent chain', async () => {
    const original = fixture();
    const originalResult = await original.service.append(input);
    const replay = fixture({
      requestRow: {
        id: 'existing-request-row',
        contentHash: originalResult.contentHash,
        dedupeKey: originalResult.dedupeKey,
        workspaceId: 'workspace-other',
        researchRunId: 'run-other',
        candidateId: 'candidate-other',
      },
    });

    await expect(replay.service.append(input)).rejects.toThrow(
      'SUPPLIER_IMAGE_SEARCH_REQUEST_ID_REUSED_WITH_DIFFERENT_PARENT',
    );
    expect(replay.createMany).not.toHaveBeenCalled();
  });

  it('does not deduplicate a distinct raw snapshot, fetch time and request id', async () => {
    const original = fixture();
    const originalResult = await original.service.append(input);
    const retryEvidence = {
      ...evidenceFixture('image-search-request-20260716-002'),
      rawSnapshotSha256: 'f'.repeat(64),
      fetchedAt: '2026-07-16T03:31:00.000Z',
    };
    const retry = fixture();

    const retryResult = await retry.service.append({
      ...input,
      evidence: retryEvidence,
    });

    expect(retryResult.inserted).toBe(true);
    expect(retryResult.contentHash).not.toBe(originalResult.contentHash);
    expect(retryResult.dedupeKey).not.toBe(originalResult.dedupeKey);
    expect(retry.createMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a dedupe-key row whose content hash does not match', async () => {
    const { service, createMany } = fixture({
      requestRow: null,
      dedupeRow: {
        id: 'conflicting-dedupe-row',
        contentHash: 'd'.repeat(64),
        dedupeKey: 'e'.repeat(64),
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
      },
    });

    await expect(service.append(input)).rejects.toThrow(
      'SUPPLIER_IMAGE_SEARCH_DEDUPE_KEY_REUSED_WITH_DIFFERENT_CONTENT',
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects a dedupe-key row whose existing row belongs to another parent chain', async () => {
    const original = fixture();
    const originalResult = await original.service.append(input);
    const replay = fixture({
      requestRow: null,
      dedupeRow: {
        id: 'conflicting-dedupe-parent-row',
        contentHash: originalResult.contentHash,
        dedupeKey: originalResult.dedupeKey,
        workspaceId: 'workspace-other',
        researchRunId: 'run-other',
        candidateId: 'candidate-other',
      },
    });

    await expect(replay.service.append(input)).rejects.toThrow(
      'SUPPLIER_IMAGE_SEARCH_DEDUPE_KEY_REUSED_WITH_DIFFERENT_PARENT',
    );
    expect(replay.createMany).not.toHaveBeenCalled();
  });
});

describe('supplier image-search evidence database boundary', () => {
  const migrationPath = join(
    process.cwd(),
    'prisma',
    'migrations',
    MIGRATION,
    'migration.sql',
  );

  it('defines four RESTRICT parents, immutable storage and parent-chain RLS', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      'CREATE TABLE "supplier_image_search_evidence"',
    );
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(4);
    expect(migration).toContain(
      'supplier_image_search_evidence_immutable_guard',
    );
    expect(migration).toContain(
      'CREATE POLICY "supplier_image_search_evidence_select"',
    );
    expect(migration).toContain(
      'CREATE POLICY "supplier_image_search_evidence_insert"',
    );
    expect(migration).toContain('FROM "product_candidates" AS candidate');
    expect(migration).toContain('FROM "product_research_runs" AS research_run');
    expect(migration).toContain('FROM "workspaces" AS workspace');
    expect(migration).not.toContain(
      'CREATE POLICY "supplier_image_search_evidence_update"',
    );
    expect(migration).not.toContain(
      'CREATE POLICY "supplier_image_search_evidence_delete"',
    );
    expect(migration).toContain('"workspaceScopeKey" TEXT NOT NULL');
    expect(migration).toContain(
      'supplier_image_search_evidence_workspace_scope_check',
    );
    expect(migration).toContain(
      'supplier_image_search_evidence_organizationId_workspaceScopeKey_requestId_key',
    );
    expect(migration).not.toContain(
      'supplier_image_search_evidence_organizationId_provider_requestId_key',
    );
    expect(migration).toContain('"contentCanonicalizerVersion" TEXT NOT NULL');
    expect(migration).toContain(
      '"contentCanonicalizerVersion" = \'supplier-image-search-jcs/v1\'',
    );
  });

  it('blocks parent-chain rebinding after immutable evidence exists', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      'supplier_image_search_workspace_binding_guard',
    );
    expect(migration).toContain(
      'supplier_image_search_research_run_binding_guard',
    );
    expect(migration).toContain(
      'supplier_image_search_candidate_binding_guard',
    );
    expect(migration).toContain('supplier_image_search_candidate_delete_guard');
    expect(migration).toContain(
      'BEFORE UPDATE OF "id", "organizationId", "workspaceId", "researchRunId"',
    );
    expect(migration).toContain('OLD."id" IS DISTINCT FROM NEW."id"');
    expect(
      migration.match(/USING ERRCODE = '55000'/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(5);
    expect(migration).toContain('supplier_image_search_evidence_parent_lock');
    expect(migration.match(/SET row_security = off/g)).toHaveLength(4);
  });

  it('makes the durable allocation immutable and parent-rebind aware in SQL', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      'supplier_image_search_allocation_immutable_guard',
    );
    expect(migration).toContain(
      'reject_supplier_image_search_allocation_mutation',
    );
    expect(migration).toContain(
      `OLD."metadata"->'allocation' IS DISTINCT FROM NEW."metadata"->'allocation'`,
    );
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain('FROM "product_research_source_health"');
    expect(migration).toContain(`"metadata" ? 'allocation'`);
    expect(migration).toContain(
      `"metadata" #> '{allocation,consideredCandidateIds}'`,
    );
  });

  it('grants only read and append access when the application role exists', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      `GRANT SELECT, INSERT ON "supplier_image_search_evidence" TO "shopmate_app"`,
    );
    expect(migration).toContain(
      `REVOKE UPDATE, DELETE ON "supplier_image_search_evidence" FROM "shopmate_app"`,
    );
  });

  it('stores no procurement, currency or numeric price columns', () => {
    const schema = readFileSync(
      join(process.cwd(), 'prisma', 'schema.prisma'),
      'utf8',
    );
    const model = schema.match(
      /model SupplierImageSearchEvidence \{[\s\S]*?\n\}/,
    )?.[0];
    const migration = readFileSync(migrationPath, 'utf8');

    expect(model).toBeDefined();
    expect(model).not.toMatch(/procurementCost|currency|Decimal|Float/);
    expect(migration).not.toMatch(/"procurementCost"\s/);
    expect(migration).not.toMatch(/"currency"\s/);
    expect(migration).not.toMatch(/DECIMAL|NUMERIC|DOUBLE PRECISION/);
    expect(migration).toContain('jsonb_array_length("normalizedOffers") <= 50');
  });

  it('enforces the exact nullable Agent offer JSON shape at the SQL boundary', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const offerCheck = migration.match(
      /CREATE FUNCTION "supplier_image_search_offers_are_display_only"[\s\S]*?\$\$;/,
    )?.[0];

    expect(offerCheck).toBeDefined();
    for (const field of [
      'offerId',
      'subject',
      'detailUrl',
      'imageUrl',
      'distributionFreePostage',
      'displayPriceEvidence',
      'price',
      'consignPrice',
      'multipleConsignPrice',
      'evidenceUse',
      'verifiedProcurementCost',
    ]) {
      expect(offerCheck).toContain(`'${field}'`);
    }
    expect(offerCheck).not.toMatch(
      /'offerUrl'|'title'|'resultRank'|'minimumAmount'|'maximumAmount'|'displayText'/,
    );
    expect(offerCheck).toContain("NOT IN ('boolean', 'null')");
    expect(offerCheck).toContain("NOT IN ('string', 'null')");
    expect(offerCheck).toContain('btrim(');
    expect(offerCheck).toContain('> 128');
    expect(offerCheck).toContain("!~* '^https://");
    expect(offerCheck).toContain("~* '[?&]");
    expect(offerCheck).toContain("(offer->>'offerId') !~ '^[0-9]{1,32}$'");
    expect(offerCheck).toContain(
      "char_length(offer->>'subject') NOT BETWEEN 1 AND 1000",
    );
    expect(offerCheck).toContain("char_length(offer->>'detailUrl') > 4096");
    expect(offerCheck).toContain("char_length(offer->>'imageUrl') > 4096");
    expect(offerCheck).toContain('%[0-9a-f]{2}');
  });

  it('aligns SQL count and key text bounds with the application contract', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('"providerResultCount" BETWEEN 0 AND 500');
    expect(migration).toContain('char_length("provider") BETWEEN 1 AND 100');
    expect(migration).toContain(
      'char_length("adapterVersion") BETWEEN 3 AND 100',
    );
    expect(migration).toContain('char_length("requestId") BETWEEN 3 AND 160');
    expect(migration).toContain(
      'char_length("canonicalizationVersion") BETWEEN 3 AND 100',
    );
    expect(migration).not.toContain(
      '"providerResultCount" BETWEEN 0 AND 1000000',
    );
  });

  it('registers RLS verification, module provider and governed migration hashes', () => {
    const verifyRls = readFileSync(
      join(process.cwd(), 'src', 'cli', 'verify-rls.ts'),
      'utf8',
    );
    const module = readFileSync(
      join(
        process.cwd(),
        'src',
        'features',
        'product-research',
        'daily',
        'daily-product-research.module.ts',
      ),
      'utf8',
    );
    const governance = JSON.parse(
      readFileSync(
        join(process.cwd(), 'prisma', 'migration-governance.json'),
        'utf8',
      ),
    ) as {
      releases: Array<{
        migrations: Array<{
          name: string;
          sha256: string;
          metadataSha256: string;
          rollbackSha256: string;
        }>;
      }>;
    };
    const governed = governance.releases
      .flatMap((release) => release.migrations)
      .find((migration) => migration.name === MIGRATION);

    expect(verifyRls).toContain("'supplier_image_search_evidence'");
    expect(module).toContain('SupplierImageSearchEvidenceStoreService');
    expect(governed).toEqual({
      name: MIGRATION,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      metadataSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      rollbackSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
