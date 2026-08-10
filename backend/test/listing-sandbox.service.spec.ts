import { createHash } from 'node:crypto';
import { ListingSandboxRuleEngine } from '../src/features/listing-sandbox/listing-sandbox-rule-engine.js';
import { ListingSandboxService } from '../src/features/listing-sandbox/listing-sandbox.service.js';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createHarness() {
  const snapshotBody = {
    target: 'OZON',
    payload: {
      name: 'replica weapon',
      offerId: 'BLOCKED-1',
      price: 1999,
      images: ['https://assets.example.com/main.png'],
      descriptionCategoryId: 17028922,
      attributes: [{ id: 85 }],
    },
    economics: {
      currency: 'RUB',
      price: 1999,
      cost: 800,
      shippingCost: 200,
      platformFeeRate: 0.12,
      withdrawalFeeRate: 0.01,
      netProfit: 739.13,
      marginRate: 0.3698,
    },
  };
  const snapshot = {
    id: 'snapshot-1',
    organizationId: 'org-1',
    snapshotHash: createHash('sha256')
      .update(stableJson(snapshotBody))
      .digest('hex'),
    status: 'APPROVED',
    target: 'OZON',
    snapshot: snapshotBody,
    listingDraftId: 'listing-1',
    productLaunch: { agentRunId: null },
  };
  let report: any = null;
  const hits: any[] = [];
  const tx: any = {
    listingPublishSnapshot: {
      findFirst: jest.fn().mockResolvedValue(snapshot),
      update: jest.fn().mockImplementation(({ data }) => {
        snapshot.status = data.status;
        return Promise.resolve({ ...snapshot });
      }),
    },
    listingSandboxReport: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(report)),
      create: jest.fn().mockImplementation(({ data }) => {
        report = { id: 'report-1', ...data, ruleHits: hits };
        return Promise.resolve(report);
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        report = { ...report, ...data };
        return Promise.resolve(report);
      }),
    },
    policyRuleHit: {
      createMany: jest.fn().mockImplementation(({ data }) => {
        hits.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    agentRun: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    feedbackSignal: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: `feedback-${data.signalType}`, ...data }),
        ),
    },
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(tx)),
  };
  const audit = {
    appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const service = new ListingSandboxService(
    tenantDatabase as any,
    new ListingSandboxRuleEngine(),
    audit as any,
  );

  return { service, tx, snapshot, audit, getReport: () => report };
}

describe('ListingSandboxService', () => {
  it('persists scoring evidence and blocks the immutable publish snapshot', async () => {
    const { service, tx, snapshot, audit } = createHarness();

    const report = await service.evaluate({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorId: 'admin-1',
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.summary).toEqual(
      expect.objectContaining({
        decision: 'BLOCK',
        overallScore: expect.any(Number),
        dimensions: expect.arrayContaining([
          expect.objectContaining({ key: 'IMAGE_CONSISTENCY' }),
          expect.objectContaining({ key: 'APPROVAL_COMPLETENESS' }),
        ]),
        hardBlockCodes: expect.arrayContaining(['PROHIBITED_TERM']),
      }),
    );
    expect(report.ruleHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleCode: 'PROHIBITED_TERM' }),
      ]),
    );
    expect(snapshot.status).toBe('BLOCKED');
    expect(tx.policyRuleHit.createMany).toHaveBeenCalledTimes(1);
    expect(tx.feedbackSignal.create).toHaveBeenCalledTimes(2);
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'listing-sandbox.evaluated' }),
    );
  });

  it('returns the existing report when the same snapshot hash is evaluated twice', async () => {
    const { service, tx } = createHarness();

    const first = await service.evaluate({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorId: 'admin-1',
    });
    const second = await service.evaluate({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorId: 'admin-1',
    });

    expect(second.id).toBe(first.id);
    expect(tx.listingSandboxReport.create).toHaveBeenCalledTimes(1);
  });

  it('does not allow an administrator to override a hard publication block', async () => {
    const { service, snapshot, audit } = createHarness();
    const report = await service.evaluate({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      actorId: 'admin-1',
    });

    await expect(
      service.override({
        organizationId: 'org-1',
        reportId: report.id,
        actorId: 'admin-1',
        actorRole: 'OWNER',
        reason: 'too short',
      }),
    ).rejects.toThrow('Override reason must contain at least 10 characters');

    await expect(
      service.override({
        organizationId: 'org-1',
        reportId: report.id,
        actorId: 'admin-1',
        actorRole: 'OWNER',
        reason: 'Verified evidence is available for administrator review',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LISTING_SANDBOX_HARD_BLOCK_IMMUTABLE',
      }),
    });

    expect(snapshot.status).toBe('BLOCKED');
    expect(audit.appendStrict).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'listing-sandbox.overridden' }),
    );
  });
});
