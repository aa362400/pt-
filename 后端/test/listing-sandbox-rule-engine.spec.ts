import { ListingSandboxRuleEngine } from '../src/features/listing-sandbox/listing-sandbox-rule-engine.js';

function validSnapshot() {
  return {
    target: 'OZON',
    snapshotHash: 'a'.repeat(64),
    payload: {
      name: 'Автомобильный вентилятор 12 В',
      offerId: 'CAR-FAN-001',
      price: 1999,
      images: [
        'https://assets.example.com/car-fan-main.png',
        'https://assets.example.com/car-fan-detail.png',
      ],
      descriptionCategoryId: 17028922,
      attributes: [{ id: 85, values: [{ value: 'No brand' }] }],
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
    safetyEvidence: {
      image: {
        qaOutcome: 'PASSED',
        qaScore: 96,
        consistencyScore: 96,
      },
      content: {
        evaluatorOutcome: 'QUALIFIED',
        evaluatorScore: 95,
        approvalHashMatches: true,
      },
      pricing: {
        previousApprovedPrice: 1950,
        competitorEvidenceCount: 3,
        minimumMarginRate: 0.2,
      },
      attributes: {
        compilerStatus: 'VALID',
        requiredFieldsComplete: true,
      },
      channel: {
        syncStatus: 'SUCCESS',
        recentSubmissionCount: 10,
        recentFailureCount: 0,
      },
      approval: {
        reviewStatus: 'APPROVED',
        decisionType: 'listing-approval/v2',
        approvalHashMatches: true,
        approvedBy: 'user-1',
        approvedAt: '2026-07-15T08:00:00.000Z',
        capabilityScope: 'action:ozon.listing.publish',
        executionGrantRequired: true,
      },
      externalResponse: {
        phase: 'PRE_DISPATCH',
        duplicateSubmission: false,
        severeWarning: false,
      },
    },
  };
}

describe('ListingSandboxRuleEngine', () => {
  const engine = new ListingSandboxRuleEngine();

  it('passes a complete low-risk listing and returns an explainable report', () => {
    const result = engine.evaluate(validSnapshot());

    expect(result.status).toBe('PASSED');
    expect(result.riskLevel).toBe('LOW');
    expect(result.blocking).toBe(false);
    expect(result.hits).toEqual([]);
    expect(result.decision).toBe('ALLOW');
    expect(result.overallScore).toBeGreaterThanOrEqual(85);
    expect(result.dimensions).toHaveLength(8);
    expect(result.dimensions.map((dimension) => dimension.key)).toEqual([
      'IMAGE_CONSISTENCY',
      'CONTENT_COMPLIANCE',
      'PRICE_ANOMALY',
      'MARGIN_BUFFER',
      'ATTRIBUTE_COMPLETENESS',
      'CHANNEL_RISK',
      'APPROVAL_COMPLETENESS',
      'EXTERNAL_RESPONSE_TRUST',
    ]);
    expect(result.policyVersion).toMatch(/^ozon-listing-sandbox\//);
  });

  it('requires review for a soft price anomaly even when the weighted score remains high', () => {
    const snapshot = validSnapshot();
    snapshot.safetyEvidence.pricing.previousApprovedPrice = 1500;

    const result = engine.evaluate(snapshot);

    expect(result.decision).toBe('REVIEW');
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.overallScore).toBeGreaterThanOrEqual(60);
    expect(result.softBlockCodes).toContain('PRICE_DEVIATION_REVIEW');
  });

  it('hard blocks execution when the one-time approval capability policy is missing', () => {
    const snapshot = validSnapshot();
    snapshot.safetyEvidence.approval.executionGrantRequired = false;

    const result = engine.evaluate(snapshot);

    expect(result.decision).toBe('BLOCK');
    expect(result.status).toBe('BLOCKED');
    expect(result.hardBlockCodes).toContain(
      'APPROVAL_EXECUTION_GRANT_REQUIRED',
    );
  });

  it('hard blocks a duplicate external submission before dispatch', () => {
    const snapshot = validSnapshot();
    snapshot.safetyEvidence.externalResponse.duplicateSubmission = true;

    const result = engine.evaluate(snapshot);

    expect(result.decision).toBe('BLOCK');
    expect(result.hardBlockCodes).toContain('DUPLICATE_SUBMISSION');
  });

  it('blocks prohibited goods terms before an Ozon write can be dispatched', () => {
    const snapshot = validSnapshot();
    snapshot.payload.name = 'Оружие replica weapon';

    const result = engine.evaluate(snapshot);

    expect(result.status).toBe('BLOCKED');
    expect(result.riskLevel).toBe('BLOCKED');
    expect(result.blocking).toBe(true);
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROHIBITED_TERM',
          category: 'PLATFORM_POLICY',
          blocking: true,
        }),
      ]),
    );
  });

  it('escalates protected brand terms for administrator review', () => {
    const snapshot = validSnapshot();
    snapshot.payload.name = 'Disney автомобильный вентилятор';

    const result = engine.evaluate(snapshot);

    expect(result.status).toBe('BLOCKED');
    expect(result.riskLevel).toBe('HIGH');
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROTECTED_BRAND_TERM',
          category: 'INTELLECTUAL_PROPERTY',
          severity: 'HIGH',
        }),
      ]),
    );
  });

  it('blocks listings below the configured profit floor', () => {
    const snapshot = validSnapshot();
    snapshot.economics.netProfit = -12;
    snapshot.economics.marginRate = -0.006;

    const result = engine.evaluate(snapshot);

    expect(result.status).toBe('BLOCKED');
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NEGATIVE_MARGIN',
          category: 'ECONOMICS',
          blocking: true,
        }),
      ]),
    );
  });

  it('blocks a positive margin that is below the store-specific profit floor', () => {
    const snapshot = validSnapshot();
    snapshot.economics.netProfit = 739.13;
    snapshot.economics.marginRate = 0.3698;
    snapshot.safetyEvidence.pricing.minimumMarginRate = 0.4;

    const result = engine.evaluate(snapshot);

    expect(result.decision).toBe('BLOCK');
    expect(result.hardBlockCodes).toContain('MARGIN_BELOW_STORE_FLOOR');
  });

  it('requires human review when margin is positive but below target', () => {
    const snapshot = validSnapshot();
    snapshot.economics.netProfit = 120;
    snapshot.economics.marginRate = 0.06;
    snapshot.safetyEvidence.pricing.minimumMarginRate = 0.05;

    const result = engine.evaluate(snapshot);

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.blocking).toBe(false);
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MARGIN_BELOW_TARGET' }),
      ]),
    );
  });

  it('blocks missing category and missing product images with separate evidence', () => {
    const snapshot = validSnapshot();
    snapshot.payload.descriptionCategoryId = 0;
    snapshot.payload.images = [];

    const result = engine.evaluate(snapshot);

    expect(result.status).toBe('BLOCKED');
    expect(result.hits.map((hit) => hit.code)).toEqual(
      expect.arrayContaining(['CATEGORY_REQUIRED', 'IMAGE_REQUIRED']),
    );
  });
});
