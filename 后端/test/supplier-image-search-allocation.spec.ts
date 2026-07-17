import type { ExternalCandidate } from '../src/features/product-research/daily/contracts/external-candidate.contract.js';
import { SupplierImageSearchAllocationService } from '../src/features/product-research/daily/services/supplier-image-search-allocation.service.js';

function externalCandidate(
  overrides: Partial<ExternalCandidate> = {},
): ExternalCandidate {
  return {
    source: 'marketplace',
    provider: 'discovery-provider',
    externalId: 'external-1',
    imageUrl: 'https://images.example.test/product.png',
    imageEvidenceUrl: null,
    name: 'Portable organizer',
    productType: 'organizer',
    costs: [],
    platformFeeRate: '0.10',
    paymentFeeRate: '0.03',
    adRate: '0.08',
    refundRate: '0.02',
    signals: [],
    risks: [],
    ...overrides,
  };
}

function allocationStoreFixture(
  options: {
    serialize?: boolean;
    existing?: boolean;
    parent?: {
      id: string;
      organizationId: string;
      workspaceId: string | null;
    } | null;
  } = {},
) {
  let metadata: unknown = { retained: 'existing-health-field' };
  let exists = options.existing ?? false;
  const upsert = jest.fn(async (args: Record<string, any>) => {
    metadata = exists ? args.update.metadata : args.create.metadata;
    exists = true;
    return { id: 'health-1', metadata };
  });
  const queryRaw = jest.fn(
    async (query: { strings: readonly string[]; values: unknown[] }) => {
      const sql = query.strings.join('?');
      if (sql.includes('pg_advisory_xact_lock')) {
        if (!sql.includes('::text AS locked')) {
          const error = new Error(
            "Failed to deserialize column of type 'void'",
          ) as Error & { code: string };
          error.code = 'P2010';
          throw error;
        }
        return [{ locked: '' }];
      }
      if (sql.includes('FROM "organizations"')) {
        return parent && query.values[0] === parent.organizationId
          ? [{ id: parent.organizationId }]
          : [];
      }
      if (sql.includes('FROM "workspaces"')) {
        return parent &&
          query.values[0] === parent.workspaceId &&
          query.values[1] === parent.organizationId
          ? [{ id: parent.workspaceId }]
          : [];
      }
      if (sql.includes('FROM "product_research_runs"')) {
        return parent &&
          query.values[0] === parent.id &&
          query.values[1] === parent.organizationId &&
          query.values[2] === parent.workspaceId
          ? [{ id: parent.id }]
          : [];
      }
      if (sql.includes('FROM "product_candidates"')) {
        const candidateIds = query.values.slice(0, -3) as string[];
        return candidateParentsValid ? candidateIds.map((id) => ({ id })) : [];
      }
      throw new Error(`Unexpected SQL in allocation test: ${sql}`);
    },
  );
  const parent =
    options.parent === undefined
      ? {
          id: 'run-1',
          organizationId: 'org-1',
          workspaceId: 'workspace-1',
        }
      : options.parent;
  let candidateParentsValid = true;
  const tx = {
    $queryRaw: queryRaw,
    productResearchRun: {
      findFirst: jest.fn(async (args: Record<string, any>) =>
        parent &&
        args.where.id === parent.id &&
        args.where.organizationId === parent.organizationId &&
        args.where.workspaceId === parent.workspaceId
          ? { id: parent.id }
          : null,
      ),
    },
    productCandidate: {
      findMany: jest.fn(async (args: Record<string, any>) =>
        candidateParentsValid
          ? (args.where.id.in as string[]).map((id) => ({ id }))
          : [],
      ),
    },
    productResearchSourceHealth: {
      findUnique: jest.fn(async () => (exists ? { metadata } : null)),
      upsert,
    },
  };
  let tail = Promise.resolve();
  const run = jest.fn(
    async (_organizationId: string, operation: (value: unknown) => unknown) => {
      if (!options.serialize) return operation(tx);
      let release = () => undefined;
      const turn = new Promise<void>((resolve) => {
        release = resolve;
      });
      const previous = tail;
      tail = previous.then(() => turn);
      await previous;
      try {
        return await operation(tx);
      } finally {
        release();
      }
    },
  );
  return {
    service: new SupplierImageSearchAllocationService({ run } as never),
    run,
    queryRaw,
    upsert,
    metadata: () => metadata,
    setCandidateParentsValid: (valid: boolean) => {
      candidateParentsValid = valid;
    },
  };
}

const runInput = {
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  researchRunId: 'run-1',
  candidateLimit: 10,
};

describe('SupplierImageSearchAllocationService', () => {
  it('persists one immutable allocation in source-health metadata and preserves existing metadata', async () => {
    const fixture = allocationStoreFixture({ existing: true });

    const allocation = await fixture.service.getOrCreate({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-1',
          canonicalName: 'Portable organizer',
          inputs: [externalCandidate()],
        },
      ],
    });

    expect(allocation).toMatchObject({
      schemaVersion: 'supplier-image-search-allocation/v1',
      candidateLimit: 10,
      consideredCandidateIds: ['candidate-1'],
      skippedNoSourceImageCandidateIds: [],
      skippedByBudgetCount: 0,
      entries: [
        {
          candidateId: 'candidate-1',
          source: 'marketplace',
          externalId: 'external-1',
          imageUrl: 'https://images.example.test/product.png',
          imageKeywords: 'Portable organizer',
          requestId:
            'dpr-sis-v1:796909eaedf5fe29a3746acb4bda821d4ccff85aa14c7770153a8d5dea85c495',
        },
      ],
    });
    expect(fixture.metadata()).toEqual({
      retained: 'existing-health-field',
      allocation,
    });
    expect(fixture.queryRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        strings: expect.arrayContaining([
          expect.stringContaining('pg_advisory_xact_lock'),
        ]),
        values: ['supplier-image-search:org-1:run-1'],
      }),
    );
    const advisoryLockQuery = fixture.queryRaw.mock.calls[0][0];
    const advisoryLockSql = advisoryLockQuery.strings.join('?');
    expect(advisoryLockSql).toContain(
      'pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked',
    );
    expect(advisoryLockQuery.values).toEqual([
      'supplier-image-search:org-1:run-1',
    ]);
    const parentLockSql = fixture.queryRaw.mock.calls
      .slice(1)
      .map(([query]) => query.strings.join('?'))
      .join('\n');
    expect(parentLockSql).toContain('FROM "organizations"');
    expect(parentLockSql).toContain('FROM "workspaces"');
    expect(parentLockSql).toContain('FROM "product_research_runs"');
    expect(parentLockSql).toContain('FROM "product_candidates"');
    expect(parentLockSql.match(/FOR SHARE/g)?.length).toBe(4);
    expect(parentLockSql).not.toContain('org-1');
    expect(parentLockSql).not.toContain('workspace-1');
    expect(parentLockSql).not.toContain('run-1');
  });

  it('uses fingerprint ordering so reversed discovery input produces the same first allocation', async () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      candidateId: `candidate-${index.toString().padStart(2, '0')}`,
      fingerprint: `fingerprint-${(11 - index).toString().padStart(2, '0')}`,
      canonicalName: `Candidate ${index}`,
      inputs: [
        externalCandidate({
          imageUrl: `https://images.example.test/${index}.png`,
        }),
      ],
    }));
    const firstStore = allocationStoreFixture();
    const reversedStore = allocationStoreFixture();

    const first = await firstStore.service.getOrCreate({
      ...runInput,
      candidates,
    });
    const reversed = await reversedStore.service.getOrCreate({
      ...runInput,
      candidates: [...candidates].reverse(),
    });

    expect(reversed).toEqual(first);
    expect(first.entries).toHaveLength(10);
    expect(first.entries.map((entry) => entry.candidateId)).toEqual([
      'candidate-11',
      'candidate-10',
      'candidate-09',
      'candidate-08',
      'candidate-07',
      'candidate-06',
      'candidate-05',
      'candidate-04',
      'candidate-03',
      'candidate-02',
    ]);
  });

  it('serializes concurrent initialization and makes the first allocation win without mutation', async () => {
    const fixture = allocationStoreFixture({ serialize: true });
    const firstInput = {
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-first',
          canonicalName: 'First',
          inputs: [
            externalCandidate({
              imageUrl: 'https://images.example.test/first.png',
            }),
          ],
        },
      ],
    };
    const secondInput = {
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-second',
          canonicalName: 'Second',
          inputs: [
            externalCandidate({
              imageUrl: 'https://images.example.test/second.png',
            }),
          ],
        },
      ],
    };

    const [first, second] = await Promise.all([
      fixture.service.getOrCreate(firstInput),
      fixture.service.getOrCreate(secondInput),
    ]);

    expect(second).toEqual(first);
    expect(first.entries.map((entry) => entry.candidateId)).toEqual([
      'candidate-first',
    ]);
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
    expect(
      fixture.queryRaw.mock.calls.filter(([query]) =>
        query.strings.join('?').includes('pg_advisory_xact_lock'),
      ),
    ).toHaveLength(2);
  });

  it.each([
    {
      label: 'organization',
      input: { ...runInput, organizationId: 'org-other' },
    },
    {
      label: 'workspace',
      input: { ...runInput, workspaceId: 'workspace-other' },
    },
  ])(
    'fails closed when the research-run $label parent is mismatched',
    async ({ input }) => {
      const fixture = allocationStoreFixture();

      await expect(
        fixture.service.getOrCreate({
          ...input,
          candidates: [
            {
              candidateId: 'candidate-1',
              canonicalName: 'First',
              inputs: [externalCandidate()],
            },
          ],
        }),
      ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_ALLOCATION_PARENT_MISMATCH');
      expect(fixture.upsert).not.toHaveBeenCalled();
    },
  );

  it('revalidates every persisted Agent candidate against the full parent chain', async () => {
    const fixture = allocationStoreFixture();
    const input = {
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-1',
          canonicalName: 'First',
          inputs: [externalCandidate()],
        },
      ],
    };
    await fixture.service.getOrCreate(input);
    fixture.setCandidateParentsValid(false);

    await expect(fixture.service.getOrCreate(input)).rejects.toThrow(
      'SUPPLIER_IMAGE_SEARCH_ALLOCATION_CANDIDATE_MISMATCH',
    );
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
  });

  it('locks and validates considered candidates even when every candidate lacks a source image', async () => {
    const fixture = allocationStoreFixture();
    fixture.setCandidateParentsValid(false);

    await expect(
      fixture.service.getOrCreate({
        ...runInput,
        candidates: [
          {
            candidateId: 'candidate-no-source-image',
            canonicalName: 'No source image',
            inputs: [externalCandidate({ imageUrl: null })],
          },
        ],
      }),
    ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_ALLOCATION_CANDIDATE_MISMATCH');
    expect(fixture.upsert).not.toHaveBeenCalled();
    expect(
      fixture.queryRaw.mock.calls.some(([query]) =>
        query.strings.join('?').includes('FROM "product_candidates"'),
      ),
    ).toBe(true);
  });

  it('fails closed when persisted allocation metadata is malformed', async () => {
    const fixture = allocationStoreFixture();
    await fixture.service.getOrCreate({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-1',
          canonicalName: 'First',
          inputs: [externalCandidate()],
        },
      ],
    });
    const metadata = fixture.metadata() as Record<string, unknown>;
    (metadata.allocation as Record<string, unknown>).entries = [
      {
        candidateId: 'candidate-1',
        source: 'marketplace',
        externalId: 'external-1',
        imageUrl: 'http://insecure.example.test/image.png',
        requestId: 'not-stable',
      },
    ];

    await expect(
      fixture.service.getOrCreate({
        ...runInput,
        candidates: [],
      }),
    ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_ALLOCATION_INVALID');
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
  });
});
