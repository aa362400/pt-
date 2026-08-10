import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SupplierQuoteEvidenceStoreService } from '../src/features/product-research/daily/services/supplier-quote-evidence-store.service.js';
import { supplierQuoteEvidenceSchema } from '../src/features/product-research/daily/contracts/supplier-quote.contract.js';

const evidence = supplierQuoteEvidenceSchema.parse({
  schemaVersion: 'supplier-quote/v1',
  evidenceGroupKey: `supplier_quote:${'e'.repeat(64)}`,
  adapterVersion: '1688-image-search/v1',
  requestId: 'quote-request-1',
  rawSnapshotSha256: 'f'.repeat(64),
  source: {
    platform: '1688',
    provider: 'future-1688-api',
    fetchedAt: '2026-07-16T11:55:00.000Z',
  },
  discovery: {
    method: 'IMAGE_SEARCH',
    searchRequestId: 'image-request-1',
    canonicalizationVersion: 'canonical/v1',
    sourceOriginalSha256: 'a'.repeat(64),
    sourceCanonicalSha256: 'b'.repeat(64),
    offerCanonicalSha256: 'c'.repeat(64),
    resultRank: 1,
  },
  match: {
    status: 'MATCHED',
    policyVersion: 'match/v1',
    method: 'CANONICAL_IMAGE_AND_VARIANT_ATTRIBUTES',
    reviewedAt: '2026-07-16T11:55:30.000Z',
    similarity: {
      algorithm: 'EMBEDDING_COSINE',
      score: '0.94',
      threshold: '0.90',
      calibrationVersion: 'gold/v1',
    },
    attributeCoverageRate: '1',
    attributeConflicts: [],
  },
  offer: {
    quoteRequestId: 'quote-request-1',
    offerId: 'offer-1',
    offerUrl: 'https://detail.1688.com/offer/1.html',
    variantId: 'variant-1',
    variantAttributes: { color: 'walnut' },
    quantity: 100,
    minimumOrderQuantity: 50,
    unitOfMeasure: 'PIECE',
    unitsPerPack: 1,
    price: {
      kind: 'EXACT',
      unitAmount: '18.50',
      totalAmount: '1850.00',
      currency: 'CNY',
      selectedTierMinimumQuantity: 50,
      selectedTierMaximumQuantity: 199,
      taxBasis: 'INCLUDED',
    },
  },
  shipping: {
    quoteId: 'shipping-1',
    offerId: 'offer-1',
    variantId: 'variant-1',
    scope: 'LANDED_RU',
    destinationCountry: 'RU',
    destinationPostalCode: '101000',
    quantity: 100,
    packageQuantity: 100,
    totalWeightKg: '80',
    incoterm: 'DDP',
    includesInternationalFreight: true,
    includesImportDuty: true,
    includesVat: true,
    includesCustomsClearance: true,
    includesDestinationDelivery: true,
    amountPerUnit: '12.00',
    totalAmount: '1200.00',
    currency: 'CNY',
    evidenceUrl: 'https://detail.1688.com/offer/1.html#shipping',
  },
  verification: {
    status: 'VERIFIED',
    verifiedAt: '2026-07-16T11:56:00.000Z',
    validUntil: '2026-07-16T13:00:00.000Z',
  },
});

const expectedBinding = {
  evidenceGroupKey: evidence.evidenceGroupKey,
  provider: evidence.source.provider,
  adapterVersion: evidence.adapterVersion,
  imageSearchRequestId: 'image-request-1',
  quoteRequestId: 'quote-request-1',
  offerId: 'offer-1',
  variantId: 'variant-1',
  variantAttributes: { color: 'walnut' },
  quantity: 100,
  sourceOriginalSha256: 'a'.repeat(64),
  sourceCanonicalSha256: 'b'.repeat(64),
  offerCanonicalSha256: 'c'.repeat(64),
  destinationCountry: 'RU',
  destinationPostalCode: '101000',
  currency: 'CNY',
  unitOfMeasure: 'PIECE' as const,
  unitsPerPack: 1,
  allowedEvidenceHosts: ['1688.com'],
};
const RAW_SNAPSHOT_REF = `supplier-quotes/org-1/raw/${evidence.rawSnapshotSha256}`;

function fixture(candidate: unknown = { id: 'candidate-1' }) {
  const createMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockImplementation(async () => ({
    id: 'evidence-row-1',
    contentHash: createMany.mock.calls[0]?.[0]?.data?.[0]?.contentHash,
  }));
  const tx = {
    productCandidate: {
      findFirst: jest.fn().mockResolvedValue(candidate),
    },
    supplierQuoteEvidence: { createMany, findUnique },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (_orgId: string, operation: (value: unknown) => unknown) =>
        operation(tx),
    ),
  };
  return {
    service: new SupplierQuoteEvidenceStoreService(tenantDatabase as never),
    tx,
    createMany,
    findUnique,
  };
}

describe('SupplierQuoteEvidenceStoreService', () => {
  it('appends normalized evidence with deterministic hashes and no update path', async () => {
    const first = fixture();
    const second = fixture();
    const input = {
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      researchRunId: 'run-1',
      candidateId: 'candidate-1',
      evidence,
      expectedBinding,
      rawSnapshotRef: RAW_SNAPSHOT_REF,
    };

    await expect(first.service.append(input)).resolves.toEqual({
      id: 'evidence-row-1',
      inserted: true,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await second.service.append(input);

    const firstData = first.createMany.mock.calls[0][0].data[0];
    const secondData = second.createMany.mock.calls[0][0].data[0];
    expect(firstData.contentHash).toBe(secondData.contentHash);
    expect(firstData.dedupeKey).toBe(secondData.dedupeKey);
    expect(firstData).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        workspaceScopeKey: 'workspace:id:workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        productUnitAmount: '18.50',
        shippingUnitAmount: '12.00',
        normalizedEvidence: evidence,
        expectedBinding,
      }),
    );
    expect(first.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(first.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_workspaceScopeKey_provider_requestId: {
          organizationId: 'org-1',
          workspaceScopeKey: 'workspace:id:workspace-1',
          provider: evidence.source.provider,
          requestId: evidence.requestId,
        },
      },
      select: { id: true, contentHash: true },
    });
    expect(first.tx.supplierQuoteEvidence).not.toHaveProperty('update');
  });

  it('reports an idempotent retry without mutating evidence', async () => {
    const { service, createMany } = fixture();
    createMany.mockResolvedValue({ count: 0 });

    const result = await service.append({
      organizationId: 'org-1',
      workspaceId: null,
      researchRunId: 'run-1',
      candidateId: 'candidate-1',
      evidence,
      expectedBinding,
      rawSnapshotRef: RAW_SNAPSHOT_REF,
    });

    expect(result.inserted).toBe(false);
  });

  it('rejects a candidate outside the precommitted tenant/run/workspace binding', async () => {
    const { service, createMany } = fixture(null);

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence,
        expectedBinding,
        rawSnapshotRef: RAW_SNAPSHOT_REF,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects a signed URL or credential-like raw snapshot reference', async () => {
    const { service } = fixture();

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence,
        expectedBinding,
        rawSnapshotRef: 'https://storage.example.com/raw?token=secret',
      }),
    ).rejects.toThrow('SUPPLIER_QUOTE_RAW_SNAPSHOT_REF_INVALID');
  });

  it('rejects VERIFIED evidence without an immutable raw snapshot reference', async () => {
    const { service, createMany } = fixture();

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence,
        expectedBinding,
      }),
    ).rejects.toThrow('SUPPLIER_QUOTE_RAW_SNAPSHOT_REF_REQUIRED');
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects a raw snapshot reference bound to another organization', async () => {
    const { service } = fixture();

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence,
        expectedBinding,
        rawSnapshotRef: `supplier-quotes/org-2/raw/${evidence.rawSnapshotSha256}`,
      }),
    ).rejects.toThrow('SUPPLIER_QUOTE_RAW_SNAPSHOT_REF_INVALID');
  });

  it('rejects unknown expected-binding fields instead of persisting credentials', async () => {
    const { service, createMany } = fixture();

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence,
        expectedBinding: {
          ...expectedBinding,
          apiKey: 'must-never-be-persisted',
        } as typeof expectedBinding,
        rawSnapshotRef: RAW_SNAPSHOT_REF,
      }),
    ).rejects.toThrow();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('revalidates evidence at the storage boundary and rejects unknown secret fields', async () => {
    const { service, createMany } = fixture();

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence: {
          ...evidence,
          apiKey: 'must-never-be-persisted',
        } as typeof evidence,
        expectedBinding,
        rawSnapshotRef: RAW_SNAPSHOT_REF,
      }),
    ).rejects.toThrow();
    expect(createMany).not.toHaveBeenCalled();
  });

  it.each([
    'https://user:password@detail.1688.com/offer/1.html',
    'https://detail.1688.com/offer/1.html?access_token=secret',
  ])('rejects credential-bearing evidence URL %s', async (offerUrl) => {
    const { service, createMany } = fixture();

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence: {
          ...evidence,
          offer: { ...evidence.offer, offerUrl },
        },
        expectedBinding,
        rawSnapshotRef: RAW_SNAPSHOT_REF,
      }),
    ).rejects.toThrow();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects a reused provider request id with different normalized content', async () => {
    const { service, createMany, findUnique } = fixture();
    createMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({
      id: 'existing-evidence',
      contentHash: 'd'.repeat(64),
    });

    await expect(
      service.append({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        researchRunId: 'run-1',
        candidateId: 'candidate-1',
        evidence,
        expectedBinding,
        rawSnapshotRef: RAW_SNAPSHOT_REF,
      }),
    ).rejects.toThrow(
      'SUPPLIER_QUOTE_REQUEST_ID_REUSED_WITH_DIFFERENT_CONTENT',
    );
  });

  it('uses an insert-only tenant policy bound to the candidate and run', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260716220000_add_supplier_quote_evidence',
        'migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      'CREATE POLICY "supplier_quote_evidence_insert"',
    );
    expect(migration).toContain('FROM "product_candidates" AS candidate');
    expect(migration).toContain(
      'candidate."researchRunId" = "supplier_quote_evidence"."researchRunId"',
    );
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).toContain('supplier_quote_evidence_immutable_guard');
    expect(migration).toContain(
      'supplier_quote_evidence_organizationId_provider_requestId_key',
    );
    expect(migration).not.toContain(
      'CREATE POLICY "supplier_quote_evidence_update"',
    );
    expect(migration).not.toContain(
      'CREATE POLICY "supplier_quote_evidence_delete"',
    );
  });

  it('hardens the applied quote ledger with workspace-scoped idempotency, parent guards, snapshot proof, and least privilege', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260716224500_harden_supplier_quote_evidence',
        'migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('"workspaceScopeKey" TEXT');
    expect(migration).toContain(
      'supplier_quote_evidence_workspace_scope_check',
    );
    expect(migration).toContain(
      'supplier_quote_evidence_verified_snapshot_check',
    );
    expect(migration).toContain('lock_supplier_quote_evidence_parents');
    expect(migration).toContain(
      'supplier_quote_evidence_candidate_binding_guard',
    );
    expect(migration).toContain(
      'supplier_quote_evidence_research_run_binding_guard',
    );
    expect(migration).toContain(
      'supplier_quote_evidence_workspace_binding_guard',
    );
    expect(migration).toContain(
      'supplier_quote_evidence_organizationId_workspaceScopeKey_provider_requestId_key',
    );
    expect(migration).toContain(
      'REVOKE UPDATE, DELETE ON "supplier_quote_evidence" FROM "shopmate_app"',
    );
  });
});
