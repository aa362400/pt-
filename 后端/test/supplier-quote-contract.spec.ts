import { supplierQuoteEvidenceSchema } from '../src/features/product-research/daily/contracts/supplier-quote.contract.js';
import { SupplierQuoteEvidencePolicyService } from '../src/features/product-research/daily/services/supplier-quote-evidence-policy.service.js';

const NOW = new Date('2026-07-16T12:00:00.000Z');
const EVIDENCE_GROUP_KEY = `supplier_quote:${'e'.repeat(64)}`;
const SOURCE_ORIGINAL_SHA256 = 'a'.repeat(64);
const SOURCE_CANONICAL_SHA256 = 'b'.repeat(64);
const OFFER_CANONICAL_SHA256 = 'c'.repeat(64);
const RAW_SNAPSHOT_SHA256 = 'f'.repeat(64);
const IMAGE_SEARCH_REQUEST_ID = 'img-1688-20260716-001';
const QUOTE_REQUEST_ID = 'quote-1688-20260716-001';

const expectedPurchase = {
  evidenceGroupKey: EVIDENCE_GROUP_KEY,
  provider: 'future-1688-api',
  adapterVersion: '1688-image-search/v1',
  imageSearchRequestId: IMAGE_SEARCH_REQUEST_ID,
  quoteRequestId: QUOTE_REQUEST_ID,
  offerId: '1688-offer-123',
  variantId: '1688-variant-walnut-large',
  variantAttributes: {
    color: 'walnut',
    size: 'large',
  },
  quantity: 100,
  sourceOriginalSha256: SOURCE_ORIGINAL_SHA256,
  sourceCanonicalSha256: SOURCE_CANONICAL_SHA256,
  offerCanonicalSha256: OFFER_CANONICAL_SHA256,
  destinationCountry: 'RU',
  destinationPostalCode: '101000',
  currency: 'CNY',
  unitOfMeasure: 'PIECE' as const,
  unitsPerPack: 1,
  allowedEvidenceHosts: ['1688.com'],
};

function exactVerifiedSupplierQuote() {
  return {
    schemaVersion: 'supplier-quote/v1',
    evidenceGroupKey: EVIDENCE_GROUP_KEY,
    adapterVersion: '1688-image-search/v1',
    requestId: QUOTE_REQUEST_ID,
    rawSnapshotSha256: RAW_SNAPSHOT_SHA256,
    source: {
      platform: '1688',
      provider: 'future-1688-api',
      fetchedAt: '2026-07-16T11:55:00.000Z',
    },
    discovery: {
      method: 'IMAGE_SEARCH',
      searchRequestId: IMAGE_SEARCH_REQUEST_ID,
      canonicalizationVersion: 'supplier-image-canonical/v1',
      sourceOriginalSha256: SOURCE_ORIGINAL_SHA256,
      sourceCanonicalSha256: SOURCE_CANONICAL_SHA256,
      offerCanonicalSha256: OFFER_CANONICAL_SHA256,
      resultRank: 1,
    },
    match: {
      status: 'MATCHED',
      policyVersion: 'supplier-image-match/v1',
      method: 'CANONICAL_IMAGE_AND_VARIANT_ATTRIBUTES',
      reviewedAt: '2026-07-16T11:55:30.000Z',
      similarity: {
        algorithm: 'EMBEDDING_COSINE',
        score: '0.94',
        threshold: '0.90',
        calibrationVersion: 'supplier-image-gold/v1',
      },
      attributeCoverageRate: '1.0',
      attributeConflicts: [],
    },
    offer: {
      quoteRequestId: QUOTE_REQUEST_ID,
      offerId: '1688-offer-123',
      offerUrl: 'https://detail.1688.com/offer/1688-offer-123.html',
      variantId: '1688-variant-walnut-large',
      variantAttributes: {
        color: 'walnut',
        size: 'large',
      },
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
      quoteId: 'shipping-quote-1688-001',
      offerId: '1688-offer-123',
      variantId: '1688-variant-walnut-large',
      scope: 'LANDED_RU',
      destinationCountry: 'RU',
      destinationPostalCode: '101000',
      quantity: 100,
      packageQuantity: 100,
      totalWeightKg: '80.00',
      incoterm: 'DDP',
      includesInternationalFreight: true,
      includesImportDuty: true,
      includesVat: true,
      includesCustomsClearance: true,
      includesDestinationDelivery: true,
      amountPerUnit: '12.00',
      totalAmount: '1200.00',
      currency: 'CNY',
      evidenceUrl:
        'https://detail.1688.com/offer/1688-offer-123.html#logistics-quote',
    },
    verification: {
      status: 'VERIFIED',
      verifiedAt: '2026-07-16T11:56:00.000Z',
      validUntil: '2026-07-16T13:00:00.000Z',
    },
  };
}

function deriveCosts(
  quote: ReturnType<typeof exactVerifiedSupplierQuote>,
  expected = expectedPurchase,
) {
  const evidence = supplierQuoteEvidenceSchema.parse(quote);
  const policy = new SupplierQuoteEvidencePolicyService();

  return policy.deriveProfitCosts({
    evidence,
    expected,
    now: NOW,
  });
}

function expectNoProfitCosts(result: {
  costs: Array<{ code: string }>;
  hardGateReasons: string[];
}) {
  expect(result.costs).toEqual([]);
  expect(result.costs.some((cost) => cost.code === 'PRODUCT')).toBe(false);
  expect(result.costs.some((cost) => cost.code === 'SHIPPING')).toBe(false);
}

describe('supplier quote evidence contract and profit-cost policy', () => {
  it('consumes an exact matched, verified, fresh 1688 variant quote plus LANDED RU shipping', () => {
    const quote = exactVerifiedSupplierQuote();
    const parsed = supplierQuoteEvidenceSchema.parse(quote);

    expect(parsed).toEqual(
      expect.objectContaining({
        evidenceGroupKey: EVIDENCE_GROUP_KEY,
        adapterVersion: '1688-image-search/v1',
        requestId: QUOTE_REQUEST_ID,
        rawSnapshotSha256: RAW_SNAPSHOT_SHA256,
        discovery: expect.objectContaining({
          method: 'IMAGE_SEARCH',
          searchRequestId: IMAGE_SEARCH_REQUEST_ID,
          sourceOriginalSha256: SOURCE_ORIGINAL_SHA256,
          sourceCanonicalSha256: SOURCE_CANONICAL_SHA256,
          offerCanonicalSha256: OFFER_CANONICAL_SHA256,
        }),
        match: expect.objectContaining({ status: 'MATCHED' }),
        offer: expect.objectContaining({
          offerId: expectedPurchase.offerId,
          variantId: expectedPurchase.variantId,
          quantity: 100,
          minimumOrderQuantity: 50,
          unitOfMeasure: 'PIECE',
          unitsPerPack: 1,
          price: expect.objectContaining({ kind: 'EXACT' }),
        }),
        shipping: expect.objectContaining({
          scope: 'LANDED_RU',
          destinationCountry: 'RU',
          destinationPostalCode: '101000',
          quantity: 100,
        }),
        verification: expect.objectContaining({ status: 'VERIFIED' }),
      }),
    );

    const result = deriveCosts(quote);

    expect(result.hardGateReasons).toEqual([]);
    expect(result.costs).toEqual([
      {
        code: 'PRODUCT',
        amount: '18.50',
        currency: 'CNY',
        required: true,
        quality: 'VERIFIED',
        evidenceId: `supplier_quote_snapshot:${RAW_SNAPSHOT_SHA256}`,
        evidenceUrl: 'https://detail.1688.com/offer/1688-offer-123.html',
        observedAt: '2026-07-16T11:55:00.000Z',
        expiresAt: '2026-07-16T13:00:00.000Z',
      },
      {
        code: 'SHIPPING',
        amount: '12.00',
        currency: 'CNY',
        required: true,
        quality: 'VERIFIED',
        scope: 'LANDED_RU',
        evidenceId: `supplier_quote_snapshot:${RAW_SNAPSHOT_SHA256}`,
        evidenceUrl:
          'https://detail.1688.com/offer/1688-offer-123.html#logistics-quote',
        observedAt: '2026-07-16T11:55:00.000Z',
        expiresAt: '2026-07-16T13:00:00.000Z',
      },
    ]);
  });

  it.each([
    {
      label: 'offer',
      expected: { ...expectedPurchase, offerId: 'different-offer' },
      reason: 'SUPPLIER_OFFER_MISMATCH',
    },
    {
      label: 'variant',
      expected: { ...expectedPurchase, variantId: 'different-variant' },
      reason: 'SUPPLIER_VARIANT_MISMATCH',
    },
    {
      label: 'quantity',
      expected: { ...expectedPurchase, quantity: 101 },
      reason: 'SUPPLIER_QUANTITY_MISMATCH',
    },
  ])(
    'rejects a quote that is not bound to the exact requested $label',
    ({ expected, reason }) => {
      const result = deriveCosts(exactVerifiedSupplierQuote(), expected);

      expectNoProfitCosts(result);
      expect(result.hardGateReasons).toContain(reason);
    },
  );

  it.each([
    'evidenceGroupKey',
    'adapterVersion',
    'requestId',
    'rawSnapshotSha256',
  ] as const)('requires the traceability envelope field %s', (field) => {
    const quote = exactVerifiedSupplierQuote();
    Reflect.deleteProperty(quote, field);

    expect(supplierQuoteEvidenceSchema.safeParse(quote).success).toBe(false);
  });

  it.each([
    {
      label: 'raw response snapshot',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.rawSnapshotSha256 = 'not-a-sha256';
      },
    },
    {
      label: 'original source image',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.discovery.sourceOriginalSha256 = 'not-a-sha256';
      },
    },
    {
      label: 'canonical source image',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.discovery.sourceCanonicalSha256 = 'not-a-sha256';
      },
    },
    {
      label: 'canonical offer image',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.discovery.offerCanonicalSha256 = 'not-a-sha256';
      },
    },
  ])('rejects a malformed $label SHA256', ({ mutate }) => {
    const quote = exactVerifiedSupplierQuote();
    mutate(quote);

    expect(supplierQuoteEvidenceSchema.safeParse(quote).success).toBe(false);
  });

  it.each([
    {
      label: 'match',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.match.status = 'UNMATCHED';
      },
      reason: 'SUPPLIER_IMAGE_MATCH_REQUIRED',
    },
    {
      label: 'verification',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.verification.status = 'UNVERIFIED';
      },
      reason: 'SUPPLIER_QUOTE_VERIFICATION_REQUIRED',
    },
  ])(
    'does not consume supplier evidence without $label status',
    ({ mutate, reason }) => {
      const quote = exactVerifiedSupplierQuote();
      mutate(quote);
      const result = deriveCosts(quote);

      expectNoProfitCosts(result);
      expect(result.hardGateReasons).toContain(reason);
    },
  );

  it('rejects an exact quantity below the supplier MOQ', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.offer.quantity = 40;
    const result = deriveCosts(quote, {
      ...expectedPurchase,
      quantity: 40,
    });

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain('SUPPLIER_MOQ_NOT_MET');
  });

  it.each([
    {
      label: 'source image',
      expected: {
        ...expectedPurchase,
        sourceOriginalSha256: 'd'.repeat(64),
      },
    },
    {
      label: 'canonical source image',
      expected: {
        ...expectedPurchase,
        sourceCanonicalSha256: 'd'.repeat(64),
      },
    },
    {
      label: 'canonical matched offer image',
      expected: {
        ...expectedPurchase,
        offerCanonicalSha256: 'd'.repeat(64),
      },
    },
  ])(
    'rejects evidence whose $label SHA256 is not bound to the requested product',
    ({ expected }) => {
      const result = deriveCosts(exactVerifiedSupplierQuote(), expected);

      expectNoProfitCosts(result);
      expect(result.hardGateReasons).toContain(
        'SUPPLIER_IMAGE_EVIDENCE_MISMATCH',
      );
    },
  );

  it('does not turn a 1688 display price range into PRODUCT or SHIPPING costs', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.offer.price = {
      kind: 'DISPLAY_RANGE',
      minimumAmount: '18.50',
      maximumAmount: '26.00',
      currency: 'CNY',
    } as unknown as typeof quote.offer.price;
    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain('SUPPLIER_PRICE_NOT_EXACT');
  });

  it('does not consume a keyword-only supplier result without image-search proof', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.discovery = {
      method: 'KEYWORD_SEARCH',
      keyword: 'wood organizer',
      fallbackFromImageSearchRequestId: IMAGE_SEARCH_REQUEST_ID,
      fallbackReason: 'IMAGE_SEARCH_NO_RESULTS',
    } as unknown as typeof quote.discovery;
    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_IMAGE_SEARCH_EVIDENCE_REQUIRED',
    );
  });

  it('does not consume DOMESTIC_ONLY freight as a LANDED RU SHIPPING cost', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.shipping = {
      ...quote.shipping,
      scope: 'DOMESTIC_ONLY',
      destinationCountry: 'CN',
    };
    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_LANDED_RU_SHIPPING_REQUIRED',
    );
  });

  it('does not consume a quote with conflicting selected-variant attributes', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.match.attributeConflicts = [
      {
        attribute: 'color',
        expected: 'walnut',
        actual: 'white',
      },
    ] as unknown as typeof quote.match.attributeConflicts;
    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_VARIANT_ATTRIBUTE_CONFLICT',
    );
  });

  it('does not consume expired quote evidence', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.verification.validUntil = '2026-07-16T11:59:59.000Z';
    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain('SUPPLIER_QUOTE_EXPIRED');
  });

  it('does not partially emit costs when product and landed shipping currencies differ', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.shipping.currency = 'RUB';
    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_ECONOMICS_CURRENCY_MISMATCH',
    );
  });

  it.each([
    {
      label: 'future verification',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.verification.verifiedAt = '2026-07-16T12:03:00.000Z';
        quote.verification.validUntil = '2026-07-16T13:03:00.000Z';
      },
      reason: 'SUPPLIER_QUOTE_VERIFIED_IN_FUTURE',
    },
    {
      label: 'stale fetch',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.source.fetchedAt = '2026-07-16T10:59:59.000Z';
      },
      reason: 'SUPPLIER_QUOTE_SOURCE_STALE',
    },
    {
      label: 'verification before fetch',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.verification.verifiedAt = '2026-07-16T11:54:59.000Z';
      },
      reason: 'SUPPLIER_QUOTE_TIME_CHAIN_INVALID',
    },
    {
      label: 'excessive validity window',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        quote.verification.validUntil = '2026-07-17T11:56:01.000Z';
      },
      reason: 'SUPPLIER_QUOTE_TTL_TOO_LONG',
    },
  ])('rejects a quote with $label', ({ mutate, reason }) => {
    const quote = exactVerifiedSupplierQuote();
    mutate(quote);

    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(reason);
  });

  it('requires LANDED_RU to target the configured Russian destination', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.shipping.destinationCountry = 'CN';
    quote.shipping.destinationPostalCode = '100000';
    const result = deriveCosts(quote, {
      ...expectedPurchase,
      destinationCountry: 'CN',
      destinationPostalCode: '100000',
    });

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_LANDED_RU_SHIPPING_REQUIRED',
    );
  });

  it('binds the shipping quote to the selected offer, variant and package quantity', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.shipping.variantId = 'different-variant';
    quote.shipping.packageQuantity = 99;

    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_SHIPPING_BINDING_MISMATCH',
    );
  });

  it('requires calibrated visual similarity to meet its recorded threshold', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.match.similarity.score = '0.89';

    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain(
      'SUPPLIER_IMAGE_MATCH_THRESHOLD_NOT_MET',
    );
  });

  it.each([
    {
      label: 'evidence group',
      expected: {
        ...expectedPurchase,
        evidenceGroupKey: `supplier_quote:${'d'.repeat(64)}`,
      },
    },
    {
      label: 'provider',
      expected: { ...expectedPurchase, provider: 'different-provider' },
    },
    {
      label: 'image request',
      expected: {
        ...expectedPurchase,
        imageSearchRequestId: 'different-image-request',
      },
    },
    {
      label: 'quote request',
      expected: {
        ...expectedPurchase,
        quoteRequestId: 'different-quote-request',
      },
    },
  ])(
    'rejects evidence not bound to the precommitted $label',
    ({ expected }) => {
      const result = deriveCosts(exactVerifiedSupplierQuote(), expected);

      expectNoProfitCosts(result);
      expect(result.hardGateReasons).toContain(
        'SUPPLIER_REQUEST_BINDING_MISMATCH',
      );
    },
  );

  it('rejects inconsistent exact totals instead of trusting the unit label', () => {
    const quote = exactVerifiedSupplierQuote();
    quote.offer.price.totalAmount = '1800.00';

    const result = deriveCosts(quote);

    expectNoProfitCosts(result);
    expect(result.hardGateReasons).toContain('SUPPLIER_PRODUCT_TOTAL_MISMATCH');
  });

  it.each([
    {
      label: 'conflicting exact-price metadata',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        (quote.offer.price as Record<string, unknown>).isDisplayRange = true;
      },
    },
    {
      label: 'conflicting landed-duty metadata',
      mutate: (quote: ReturnType<typeof exactVerifiedSupplierQuote>) => {
        (quote.shipping as Record<string, unknown>).dutiesIncluded = false;
      },
    },
  ])('rejects nested unknown fields: $label', ({ mutate }) => {
    const quote = exactVerifiedSupplierQuote();
    mutate(quote);

    expect(supplierQuoteEvidenceSchema.safeParse(quote).success).toBe(false);
  });
});
