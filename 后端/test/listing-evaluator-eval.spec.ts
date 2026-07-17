import { ListingBundleService } from '../src/features/listings/listing-bundle.service.js';
import { ListingEvaluatorService } from '../src/features/listings/listing-evaluator.service.js';

const request = {
  productName: 'Portable tea set',
  description: 'Compact travel tea set',
  keywords: ['travel tea', 'gift'],
  platform: 'ozon',
  tone: 'professional',
};

const output = {
  title: 'Portable Tea Set for Travel',
  description: 'A compact and durable tea set designed for travel and gifting.',
  bulletPoints: ['Compact storage', 'Durable construction'],
  keywords: ['travel tea', 'portable tea set'],
  price: null,
  priceCurrency: null,
  pricingStatus: 'DATA_INSUFFICIENT',
  pricingEvidence: null,
  pricingMissingFields: ['pricingEvidence'],
  publishable: false,
  requiresHumanReview: true,
};

function createBundle() {
  const bundles = new ListingBundleService();
  const result = bundles.build({
    request,
    agentResult: output,
    productId: 'product-1',
    generatedAt: new Date('2026-07-12T08:00:00.000Z'),
  });
  if (result.status !== 'VALID') {
    throw new Error('Expected valid listing fixture');
  }
  return { bundles, bundle: result.bundle };
}

describe('ListingEvaluatorService golden evals', () => {
  it('sends a valid agent draft to human review instead of declaring it publishable', () => {
    const { bundles, bundle } = createBundle();
    const evaluator = new ListingEvaluatorService(bundles);

    const evaluation = evaluator.evaluate(bundle, {
      evaluatedAt: new Date('2026-07-12T08:01:00.000Z'),
    });

    expect(evaluation).toEqual(
      expect.objectContaining({
        evaluatorVersion: 'listing-evaluator/v1',
        outcome: 'REVIEW_REQUIRED',
        score: expect.any(Number),
        blockingIssues: [],
        reviewReasons: expect.arrayContaining([
          'HUMAN_APPROVAL_REQUIRED',
          'MEDIA_MAPPING_INCOMPLETE',
        ]),
      }),
    );
  });

  it('blocks a bundle whose content no longer matches its provenance hash', () => {
    const { bundles, bundle } = createBundle();
    const evaluator = new ListingEvaluatorService(bundles);
    bundle.content.title = 'Tampered title after generation';

    const evaluation = evaluator.evaluate(bundle);

    expect(evaluation.outcome).toBe('BLOCKED');
    expect(evaluation.blockingIssues).toContain('PROVENANCE_HASH_MISMATCH');
    expect(evaluation.checks).toContainEqual(
      expect.objectContaining({
        id: 'provenance-integrity',
        status: 'FAIL',
      }),
    );
  });

  it.each([
    ['lorem ipsum placeholder description', 'description'],
    ['Your Text Here', 'title'],
  ])('blocks placeholder copy: %s', (placeholder, field) => {
    const { bundles, bundle } = createBundle();
    const evaluator = new ListingEvaluatorService(bundles);
    if (field === 'title') {
      bundle.content.title = placeholder;
    } else {
      bundle.content.description = placeholder;
    }
    bundle.provenance.outputSha256 = bundles.computeOutputSha256(bundle);

    const evaluation = evaluator.evaluate(bundle);

    expect(evaluation.outcome).toBe('BLOCKED');
    expect(evaluation.blockingIssues).toContain('PLACEHOLDER_COPY_DETECTED');
  });

  it('qualifies a complete bundle only when explicit approval is supplied', () => {
    const { bundles, bundle } = createBundle();
    const evaluator = new ListingEvaluatorService(bundles);
    bundle.mediaMapping = [
      {
        role: 'primary',
        assetUrl: 'https://assets.example.com/tea-set.png',
      },
    ];

    const withoutApproval = evaluator.evaluate(bundle);
    const withApproval = evaluator.evaluate(bundle, {
      approval: {
        approved: true,
        approvedBy: 'user-1',
        approvedAt: '2026-07-12T08:02:00.000Z',
      },
    });

    expect(withoutApproval.outcome).toBe('REVIEW_REQUIRED');
    expect(withApproval.outcome).toBe('QUALIFIED');
    expect(withApproval.approval).toEqual(
      expect.objectContaining({ approved: true, approvedBy: 'user-1' }),
    );
  });

  it('does not accept empty or malformed approval evidence', () => {
    const { bundles, bundle } = createBundle();
    const evaluator = new ListingEvaluatorService(bundles);
    bundle.mediaMapping = [
      {
        role: 'primary',
        assetUrl: 'https://assets.example.com/tea-set.png',
      },
    ];

    const evaluation = evaluator.evaluate(bundle, {
      approval: {
        approved: true,
        approvedBy: '',
        approvedAt: 'not-a-date',
      },
    });

    expect(evaluation.outcome).toBe('REVIEW_REQUIRED');
    expect(evaluation.approval).toBeNull();
    expect(evaluation.reviewReasons).toContain('HUMAN_APPROVAL_REQUIRED');
  });
});
