import { createHash, createHmac } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { CandidateEconomicsPublishProofService } from '../src/features/product-launch/candidate-economics-publish-proof.service.js';
import { RiskClearanceVerifierService } from '../src/shared/risk/risk-clearance-verifier.service.js';

const riskSecret = '0123456789abcdef0123456789abcdef';
const riskVerifier = new RiskClearanceVerifierService({
  get: (key: string, fallback?: unknown) =>
    ({
      RISK_CLEARANCE_ATTESTATION_SECRET: riskSecret,
      RISK_CLEARANCE_AUTHORIZED_PROVIDERS: 'authorized-provider',
      RISK_CLEARANCE_MAX_AGE_SECONDS: '86400',
      RISK_CLEARANCE_CLOCK_SKEW_SECONDS: '300',
    })[key] ?? fallback,
} as any);

const ROLES = [
  'ADVERTISING',
  'DOMESTIC_TRANSPORT',
  'FX_VOLATILITY_RESERVE',
  'OZON_COMMISSION',
  'OZON_FULFILLMENT',
  'OZON_PAYMENT',
  'OZON_STORAGE',
  'PACKAGING',
  'REFUND_LOSS',
  'SALE_PRICE',
  'TAX',
];

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalJson(value))
    .digest('hex');
}

function createFixture() {
  const now = new Date('2026-07-16T08:00:00.000Z');
  const validFrom = new Date('2026-07-16T07:30:00.000Z');
  const validUntil = new Date('2026-07-16T12:00:00.000Z');
  const workspaceScopeKey = 'workspace:id:workspace-1';
  const candidate = {
    id: 'candidate-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    researchRunId: 'run-1',
    fingerprint: 'fingerprint-1',
    status: 'RECOMMENDED',
    canonicalName: 'Portable tea set',
    productType: 'Travel drinkware',
    material: 'ceramic',
    primaryUse: 'gift',
  };
  const supplierQuote = {
    id: 'quote-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    workspaceScopeKey,
    researchRunId: 'run-1',
    candidateId: candidate.id,
    verificationStatus: 'VERIFIED',
    priceKind: 'EXACT',
    shippingScope: 'LANDED_RU',
    rawSnapshotSha256: sha256('supplier-raw'),
    contentHash: sha256('supplier-content'),
    validUntil,
  };
  Object.assign(supplierQuote, {
    rawSnapshotRef: `supplier-quotes/org-1/raw/${supplierQuote.rawSnapshotSha256}`,
  });
  const inputs = ROLES.map((role, ordinal) => {
    const normalizedEvidence = {
      schemaVersion: 'candidate-economics-evidence/v1',
      role,
      ordinal,
      source: 'authorized-test-fixture',
    };
    const contentHash = sha256(normalizedEvidence);
    const rawSnapshotSha256 = sha256(`raw-${role}`);
    const evidenceId = `evidence-${ordinal}`;
    return {
      id: `input-${ordinal}`,
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      workspaceScopeKey,
      researchRunId: 'run-1',
      candidateId: candidate.id,
      evaluationId: 'evaluation-1',
      economicsEvidenceId: evidenceId,
      role,
      ordinal,
      evidenceContentHash: contentHash,
      rawSnapshotSha256,
      createdAt: validFrom,
      evidence: {
        id: evidenceId,
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        workspaceScopeKey,
        researchRunId: 'run-1',
        candidateId: candidate.id,
        kind: role,
        verificationStatus: 'VERIFIED',
        observedAt: validFrom,
        validUntil,
        rawSnapshotSha256,
        rawSnapshotRef: `economics-evidence/org-1/raw/${rawSnapshotSha256}`,
        contentHash,
        normalizedEvidence,
      },
    };
  });
  const policySnapshot = {
    minimumGrossMarginBeforeAds: '0.5000',
    minimumNetMarginAfterAds: '0.1800',
    maxEvidenceAgeSeconds: 86400,
    dispatchFreshnessBufferSeconds: 900,
    requiredEvidenceKinds: [...ROLES],
  };
  const policyHash = sha256(policySnapshot);
  const sortedInputs = inputs.map((row) => ({
    role: row.role,
    evidenceId: row.economicsEvidenceId,
    contentHash: row.evidenceContentHash,
    rawSnapshotSha256: row.rawSnapshotSha256,
  }));
  const inputSetHash = sha256({
    organizationId: 'org-1',
    workspaceScopeKey,
    researchRunId: 'run-1',
    candidateId: candidate.id,
    candidateFingerprint: candidate.fingerprint,
    policyHash,
    calculatorVersion: 'candidate-economics-calculator/v1',
    supplierQuote: {
      id: supplierQuote.id,
      contentHash: supplierQuote.contentHash,
      rawSnapshotSha256: supplierQuote.rawSnapshotSha256,
    },
    evidence: sortedInputs,
  });
  const rawSnapshotSetHash = sha256(
    [
      supplierQuote.rawSnapshotSha256,
      ...inputs.map((row) => row.rawSnapshotSha256),
    ].sort(),
  );
  const componentBreakdown = {
    procurement: { amount: '400.0000', source: 'SUPPLIER_QUOTE_EXACT' },
    domesticTransport: { amount: '50.0000', source: 'EVIDENCE' },
    internationalLogistics: {
      amount: '100.0000',
      source: 'SUPPLIER_QUOTE_LANDED_RU',
    },
    packaging: { amount: '20.0000', source: 'EVIDENCE' },
    ozonCommission: { amount: '200.0000', source: 'EVIDENCE' },
    payment: { amount: '20.0000', source: 'RATE_WITH_MINIMUM' },
    fulfillment: { amount: '50.0000', source: 'EVIDENCE' },
    storage: { amount: '20.0000', source: 'EVIDENCE' },
    tax: { amount: '100.0000', source: 'EVIDENCE' },
    fxVolatilityReserve: { amount: '20.0000', source: 'EVIDENCE' },
    advertising: { amount: '100.0000', source: 'EVIDENCE' },
    refundLoss: { amount: '50.0000', source: 'EVIDENCE' },
    customsVatClearanceDestinationDelivery: {
      amount: '0.0000',
      currency: 'RUB',
      treatment: 'INCLUDED_BY_SUPPLIER_LANDED_RU',
    },
  };
  const evaluationContent = {
    schemaVersion: 'candidate-economics-evaluation/v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    workspaceScopeKey,
    researchRunId: 'run-1',
    candidateId: candidate.id,
    candidateFingerprint: candidate.fingerprint,
    supplierQuoteEvidenceId: supplierQuote.id,
    policyVersion: 'candidate-economics-policy/v1',
    calculatorVersion: 'candidate-economics-calculator/v1',
    policySnapshot,
    policyHash,
    inputSetHash,
    rawSnapshotSetHash,
    status: 'VERIFIED',
    decision: 'PASS',
    currency: 'RUB',
    salePrice: '2000.0000',
    grossProfitBeforeAds: '1020.0000',
    grossMarginBeforeAds: '0.51000000',
    netProfitAfterAds: '870.0000',
    netMarginAfterAds: '0.43500000',
    totalCost: '1130.0000',
    componentBreakdown,
    hardGateReasons: [],
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
  };
  const evaluation = {
    id: 'evaluation-1',
    ...evaluationContent,
    contentHash: sha256(evaluationContent),
    dedupeKey: sha256('dedupe'),
    createdAt: validFrom,
    validFrom,
    validUntil,
    candidate,
    supplierQuote,
    inputs,
  };
  const riskAttestation = {
    provider: 'authorized-provider',
    ruleset: 'authorized-risk-rules/v1',
    evidenceRef: 'risk/report/1',
    fetchedAt: '2026-07-16T07:45:00.000Z',
    expiresAt: '2026-07-16T09:00:00.000Z',
    subjectHash: riskVerifier.subjectHash({
      title: candidate.canonicalName,
      description: candidate.productType,
      tags: [candidate.material, candidate.primaryUse],
      profile: {
        category: candidate.productType,
        materials: candidate.material,
        productName: candidate.canonicalName,
      },
      platform: 'ozon',
      scopeId: `candidate:org-1:${candidate.id}`,
    }),
    passed: true,
  };
  const riskSignature = `hmac-sha256:${createHmac('sha256', riskSecret)
    .update(canonicalJson(riskAttestation))
    .digest('hex')}`;
  const risk = {
    id: 'risk-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    researchRunId: 'run-1',
    candidateId: candidate.id,
    riskType: 'RISK_CLEARANCE_ATTESTED',
    severity: 'LOW',
    ruleVersion: 'authorized-risk-rules/v1',
    matchedTerm: null,
    evidence: {
      schemaVersion: 'risk-clearance-evidence/v1',
      subjectVersion: 'listing-risk-subject/v1',
      attestation: { ...riskAttestation, signature: riskSignature },
    },
    source: 'authorized-provider',
    reviewStatus: 'AUTO',
    reviewTaskId: null,
    createdAt: validFrom,
    updatedAt: validFrom,
  };
  const tx = {
    candidateEconomicsEvaluation: {
      findFirst: jest.fn().mockResolvedValue(evaluation),
    },
    productRiskRecord: {
      findMany: jest.fn().mockResolvedValue([risk]),
    },
  } as unknown as Prisma.TransactionClient;
  return { now, evaluation, risk, tx };
}

describe('CandidateEconomicsPublishProofService', () => {
  const service = new CandidateEconomicsPublishProofService(riskVerifier);

  it('accepts only the exact fresh VERIFIED/PASS evaluation and risk clearance', async () => {
    const fixture = createFixture();

    const proof = await service.requireInTransaction(fixture.tx, {
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      candidateId: 'candidate-1',
      evaluationId: 'evaluation-1',
      expectedContentHash: fixture.evaluation.contentHash,
      at: fixture.now,
      expectedPrice: 2000,
      expectedCurrency: 'RUB',
    });

    expect(proof).toEqual(
      expect.objectContaining({
        evaluationId: 'evaluation-1',
        contentHash: fixture.evaluation.contentHash,
        status: 'VERIFIED',
        decision: 'PASS',
        salePrice: '2000.0000',
        totalCost: '1130.0000',
        inputCount: 11,
        risk: expect.objectContaining({ clearanceRecordId: 'risk-1' }),
      }),
    );
  });

  it('rejects a launch without an explicit evaluation binding before querying', async () => {
    const fixture = createFixture();

    await expect(
      service.requireInTransaction(fixture.tx, {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
        evaluationId: null,
        expectedContentHash: null,
        at: fixture.now,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_PROOF_REQUIRED',
      }),
    });
    expect(
      fixture.tx.candidateEconomicsEvaluation.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('rejects a legacy summary-only risk clearance even when its text looks attested', async () => {
    const fixture = createFixture();
    (fixture.risk as any).evidence = {
      summary:
        'Risk clearance attested by authorized-provider; evidenceRef=risk/report/1; fetchedAt=2026-07-16T07:45:00.000Z.',
    };

    await expect(
      service.requireInTransaction(fixture.tx, {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
        evaluationId: 'evaluation-1',
        expectedContentHash: fixture.evaluation.contentHash,
        at: fixture.now,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        reasons: expect.arrayContaining(['RISK_CLEARANCE_PROOF_INVALID']),
      }),
    });
  });

  it('rejects an evaluation that expires inside the dispatch safety buffer', async () => {
    const fixture = createFixture();
    fixture.evaluation.validUntil = new Date('2026-07-16T08:10:00.000Z');

    await expect(
      service.requireInTransaction(fixture.tx, {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
        evaluationId: 'evaluation-1',
        expectedContentHash: fixture.evaluation.contentHash,
        at: fixture.now,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_PROOF_STALE',
        reasons: expect.arrayContaining(['ECONOMICS_PROOF_STALE']),
      }),
    });
  });

  it('rejects a tampered economics input even when the evaluation row still says PASS', async () => {
    const fixture = createFixture();
    fixture.evaluation.inputs[0].evidence.normalizedEvidence = {
      tampered: true,
    };

    await expect(
      service.requireInTransaction(fixture.tx, {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
        evaluationId: 'evaluation-1',
        expectedContentHash: fixture.evaluation.contentHash,
        at: fixture.now,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_PROOF_INVALID',
        reasons: expect.arrayContaining([
          'ECONOMICS_INPUT_INVALID:ADVERTISING',
        ]),
      }),
    });
  });

  it('rejects PASS economics when authorized risk-clearance evidence is absent', async () => {
    const fixture = createFixture();
    jest
      .mocked(fixture.tx.productRiskRecord.findMany)
      .mockResolvedValueOnce([]);

    await expect(
      service.requireInTransaction(fixture.tx, {
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
        evaluationId: 'evaluation-1',
        expectedContentHash: fixture.evaluation.contentHash,
        at: fixture.now,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PUBLISH_ECONOMICS_PROOF_INVALID',
        reasons: expect.arrayContaining(['RISK_CLEARANCE_PROOF_INVALID']),
      }),
    });
  });
});
