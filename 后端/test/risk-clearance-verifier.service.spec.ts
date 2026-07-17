import { createHmac } from 'node:crypto';
import { RiskClearanceVerifierService } from '../src/shared/risk/risk-clearance-verifier.service.js';

const secret = '0123456789abcdef0123456789abcdef';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function createService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    RISK_CLEARANCE_ATTESTATION_SECRET: secret,
    RISK_CLEARANCE_AUTHORIZED_PROVIDERS: 'authorized-provider',
    RISK_CLEARANCE_MAX_AGE_SECONDS: '86400',
    RISK_CLEARANCE_CLOCK_SKEW_SECONDS: '300',
    ...overrides,
  };
  return new RiskClearanceVerifierService({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as any);
}

function signedEnvelope(
  service: RiskClearanceVerifierService,
  overrides: Record<string, unknown> = {},
) {
  const attestation = {
    provider: 'authorized-provider',
    ruleset: 'authorized-risk-rules/v1',
    evidenceRef: 'risk/report/1',
    fetchedAt: '2026-07-16T07:45:00.000Z',
    expiresAt: '2026-07-16T09:00:00.000Z',
    subjectHash: service.subjectHash({
      title: 'Portable tea set',
      description: 'Travel drinkware',
      tags: ['ceramic', 'gift'],
      profile: {
        category: 'drinkware',
        materials: 'ceramic',
        productName: 'Portable tea set',
      },
      platform: 'OZON',
      scopeId: 'candidate:org-1:candidate-1',
      bullets: ['Compact'],
      keywords: ['tea set'],
      attributes: { color: 'white', pack: 1 },
      imageHashes: ['b'.repeat(64), 'a'.repeat(64)],
    }),
    passed: true,
    ...overrides,
  };
  const payload = JSON.stringify(canonicalValue(attestation));
  const signature = `hmac-sha256:${createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;
  return {
    schemaVersion: 'risk-clearance-evidence/v1',
    subjectVersion: 'listing-risk-subject/v1',
    attestation: { ...attestation, signature },
  };
}

describe('RiskClearanceVerifierService', () => {
  it('matches the shared Python listing-subject golden vector', () => {
    const service = createService();

    expect(
      service.subjectHash({
        title: 'Portable tea set',
        description: 'Travel drinkware',
        tags: ['ceramic', 'gift'],
        profile: {
          category: 'drinkware',
          materials: 'ceramic',
          productName: 'Portable tea set',
        },
        platform: 'OZON',
        scopeId: 'candidate:org-1:candidate-1',
        bullets: ['Compact'],
        keywords: ['tea set'],
        attributes: { color: 'white', pack: 1 },
        imageHashes: ['b'.repeat(64), 'a'.repeat(64)],
      }),
    ).toBe(
      'sha256:9ebb3394d0fc4e36e7d92e306eaae38070bec2d6956b877edfb54a4a26baee16',
    );
  });

  it('accepts a fresh authorized signature for the exact subject', () => {
    const service = createService();
    const evidence = signedEnvelope(service);
    const result = service.verify({
      evidence,
      expectedSubjectHash: evidence.attestation.subjectHash,
      at: new Date('2026-07-16T08:00:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
        proof: expect.objectContaining({
          evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it.each([
    ['summary-only evidence', { summary: 'attested by anyone' }, 'MALFORMED'],
    [
      'unauthorized provider',
      (service: RiskClearanceVerifierService) =>
        signedEnvelope(service, { provider: 'caller-controlled' }),
      'PROVIDER_UNAUTHORIZED',
    ],
    [
      'bad signature',
      (service: RiskClearanceVerifierService) => {
        const evidence = signedEnvelope(service);
        evidence.attestation.signature = `hmac-sha256:${'0'.repeat(64)}`;
        return evidence;
      },
      'SIGNATURE_INVALID',
    ],
    [
      'expired evidence',
      (service: RiskClearanceVerifierService) =>
        signedEnvelope(service, {
          expiresAt: '2026-07-16T07:59:59.000Z',
        }),
      'STALE',
    ],
    [
      'rejected evidence',
      (service: RiskClearanceVerifierService) =>
        signedEnvelope(service, { passed: false }),
      'REJECTED',
    ],
  ])('rejects %s', (_label, evidenceFactory, reason) => {
    const service = createService();
    const evidence =
      typeof evidenceFactory === 'function'
        ? evidenceFactory(service)
        : evidenceFactory;
    const expectedSubjectHash =
      typeof evidence === 'object' &&
      evidence !== null &&
      'attestation' in evidence
        ? String(
            (evidence as { attestation: { subjectHash: string } }).attestation
              .subjectHash,
          )
        : `sha256:${'0'.repeat(64)}`;

    expect(
      service.verify({
        evidence,
        expectedSubjectHash,
        at: new Date('2026-07-16T08:00:00.000Z'),
      }),
    ).toEqual({ valid: false, reason });
  });

  it('rejects a valid signature replayed for another subject', () => {
    const service = createService();
    const evidence = signedEnvelope(service);

    expect(
      service.verify({
        evidence,
        expectedSubjectHash: `sha256:${'f'.repeat(64)}`,
        at: new Date('2026-07-16T08:00:00.000Z'),
      }),
    ).toEqual({ valid: false, reason: 'SUBJECT_MISMATCH' });
  });

  it('fails closed when deployment-owned verification config is absent', () => {
    const service = createService({
      RISK_CLEARANCE_ATTESTATION_SECRET: '',
      RISK_CLEARANCE_AUTHORIZED_PROVIDERS: '',
    });
    const signedWithConfiguredShape = signedEnvelope(createService());

    expect(
      service.verify({
        evidence: signedWithConfiguredShape,
        expectedSubjectHash: signedWithConfiguredShape.attestation.subjectHash,
        at: new Date('2026-07-16T08:00:00.000Z'),
      }),
    ).toEqual({ valid: false, reason: 'CONFIG_MISSING' });
  });
});
