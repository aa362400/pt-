import { createHmac } from 'node:crypto';
import { ListingBundleService } from '../src/features/listings/listing-bundle.service.js';
import { ListingRiskClearanceService } from '../src/features/listings/listing-risk-clearance.service.js';
import { RiskClearanceVerifierService } from '../src/shared/risk/risk-clearance-verifier.service.js';

const secret = '0123456789abcdef0123456789abcdef';

function canonical(value: unknown): string {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, visit(nested)]),
      );
    }
    return item;
  };
  return JSON.stringify(visit(value));
}

function fixture() {
  const verifier = new RiskClearanceVerifierService({
    get: (key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        RISK_CLEARANCE_ATTESTATION_SECRET: secret,
        RISK_CLEARANCE_AUTHORIZED_PROVIDERS: 'authorized-provider',
        RISK_CLEARANCE_MAX_AGE_SECONDS: '86400',
      };
      return values[key] ?? fallback;
    },
  } as any);
  const service = new ListingRiskClearanceService(verifier);
  const bundles = new ListingBundleService();
  const result = bundles.build({
    request: {
      productName: 'Portable tea set',
      description: 'Travel drinkware',
      keywords: ['tea set'],
      platform: 'ozon',
    },
    agentResult: {
      title: 'Portable tea set',
      description: 'Travel drinkware',
      bulletPoints: ['Compact'],
      keywords: ['tea set'],
      price: 1999,
      priceCurrency: 'RUB',
      pricingStatus: 'EVIDENCE_BACKED',
      pricingEvidence: {
        id: 'evaluation-1',
        status: 'VERIFIED',
        decision: 'PASS',
        salePrice: '1999.0000',
        currency: 'RUB',
        validFrom: '2026-07-16T07:00:00.000Z',
        validUntil: '2099-07-16T09:00:00.000Z',
        calculatorVersion: 'candidate-economics-calculator/v1',
        inputSetHash: 'a'.repeat(64),
        contentHash: 'b'.repeat(64),
      },
      pricingMissingFields: [],
      publishable: false,
      requiresHumanReview: true,
    },
    productId: 'product-1',
  });
  if (result.status !== 'VALID') throw new Error('Expected valid bundle');
  result.bundle.mediaMapping = [
    {
      role: 'primary',
      assetUrl: 'https://assets.example.com/primary.png',
      assetSha256: 'c'.repeat(64),
    },
  ];
  const subject = service.subject({
    organizationId: 'org-1',
    listingDraftId: 'listing-1',
    bundle: result.bundle,
  });
  const attestation = {
    provider: 'authorized-provider',
    ruleset: 'authorized-risk-rules/v1',
    evidenceRef: 'risk/report/listing-1',
    fetchedAt: '2026-07-16T07:45:00.000Z',
    expiresAt: '2026-07-16T09:00:00.000Z',
    subjectHash: subject.subjectHash,
    passed: true,
  };
  const evidence = {
    schemaVersion: 'risk-clearance-evidence/v1',
    subjectVersion: 'listing-risk-subject/v1',
    attestation: {
      ...attestation,
      signature: `hmac-sha256:${createHmac('sha256', secret)
        .update(canonical(attestation))
        .digest('hex')}`,
    },
  };
  const screeningResult = {
    decision: 'PASS',
    screeningStatus: 'CLEARED',
    evidenceStatus: 'ATTESTED',
    publishable: true,
    hardGateReasons: [],
    listingSubjectHash: subject.subjectHash,
  };
  return { service, bundle: result.bundle, evidence, screeningResult, subject };
}

describe('ListingRiskClearanceService', () => {
  it('binds a trusted PASS to the exact final listing and image set', () => {
    const data = fixture();
    const proof = data.service.build({
      organizationId: 'org-1',
      listingDraftId: 'listing-1',
      bundle: data.bundle,
      clearanceEvidence: data.evidence,
      screeningResult: data.screeningResult,
      mcpManifestHash: 'd'.repeat(64),
      mcpExecutableHash: 'e'.repeat(64),
      at: new Date('2026-07-16T08:00:00.000Z'),
    });

    expect(proof).toEqual(
      expect.objectContaining({
        subjectHash: data.subject.subjectHash,
        evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        screening: expect.objectContaining({ decision: 'PASS' }),
      }),
    );
    expect(
      data.service.requireStored({
        organizationId: 'org-1',
        listingDraftId: 'listing-1',
        bundle: data.bundle,
        value: proof,
        at: new Date('2026-07-16T08:05:00.000Z'),
      }),
    ).toEqual(proof);
  });

  it('rejects replay after any reviewed image hash changes', () => {
    const data = fixture();
    const proof = data.service.build({
      organizationId: 'org-1',
      listingDraftId: 'listing-1',
      bundle: data.bundle,
      clearanceEvidence: data.evidence,
      screeningResult: data.screeningResult,
      mcpManifestHash: 'd'.repeat(64),
      mcpExecutableHash: 'e'.repeat(64),
      at: new Date('2026-07-16T08:00:00.000Z'),
    });
    data.bundle.mediaMapping[0].assetSha256 = 'f'.repeat(64);

    expect(() =>
      data.service.requireStored({
        organizationId: 'org-1',
        listingDraftId: 'listing-1',
        bundle: data.bundle,
        value: proof,
        at: new Date('2026-07-16T08:05:00.000Z'),
      }),
    ).toThrow('final reviewed listing');
  });

  it('rejects media without an immutable digest before risk screening', () => {
    const data = fixture();
    delete data.bundle.mediaMapping[0].assetSha256;

    expect(() =>
      data.service.subject({
        organizationId: 'org-1',
        listingDraftId: 'listing-1',
        bundle: data.bundle,
      }),
    ).toThrow('SHA-256');
  });
});
