import { TrustedProfitEconomicsPolicyService } from '../src/features/product-research/daily/services/trusted-profit-economics-policy.service.js';

const NOW = new Date('2026-07-16T12:00:00.000Z');

type EvidenceQuality = 'VERIFIED' | 'ESTIMATED' | 'MANUAL';

interface TraceableValueEvidence {
  quality: EvidenceQuality;
  provider: string;
  evidenceUrl: string;
  observedAt: string;
  expiresAt: string;
}

interface MoneyEvidence extends TraceableValueEvidence {
  amount: string;
  currency: string;
}

interface RateEvidence extends TraceableValueEvidence {
  value: string;
}

interface FxEvidence extends TraceableValueEvidence {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
}

interface SupplierCostEvidence extends MoneyEvidence {
  code: 'PRODUCT' | 'SHIPPING';
  required: true;
  evidenceId: string;
  scope?: 'LANDED_RU';
}

interface TrustedProfitEvidenceFixture {
  salePrice: MoneyEvidence;
  supplierCosts: SupplierCostEvidence[];
  exchangeRate: FxEvidence | null;
  rates: {
    platformFeeRate: RateEvidence;
    paymentFeeRate: RateEvidence;
    adRate: RateEvidence;
    refundRate: RateEvidence;
  };
}

function verifiedTrace(
  provider: string,
  evidenceUrl: string,
): TraceableValueEvidence {
  return {
    quality: 'VERIFIED',
    provider,
    evidenceUrl,
    observedAt: '2026-07-16T11:30:00.000Z',
    expiresAt: '2026-07-16T13:00:00.000Z',
  };
}

function trustedProfitEvidence(): TrustedProfitEvidenceFixture {
  return {
    salePrice: {
      amount: '1290.00',
      currency: 'RUB',
      ...verifiedTrace(
        'ozon-seller-api',
        'https://api-seller.ozon.ru/v3/product/info/list',
      ),
    },
    supplierCosts: [
      {
        code: 'PRODUCT',
        amount: '18.50',
        currency: 'CNY',
        required: true,
        evidenceId: `supplier_quote_snapshot:${'a'.repeat(64)}`,
        ...verifiedTrace(
          'future-1688-api',
          'https://detail.1688.com/offer/1688-offer-123.html',
        ),
      },
      {
        code: 'SHIPPING',
        amount: '12.00',
        currency: 'CNY',
        required: true,
        scope: 'LANDED_RU',
        evidenceId: `supplier_quote_snapshot:${'a'.repeat(64)}`,
        ...verifiedTrace(
          'future-1688-api',
          'https://detail.1688.com/offer/1688-offer-123.html#logistics-quote',
        ),
      },
    ],
    exchangeRate: {
      baseCurrency: 'CNY',
      quoteCurrency: 'RUB',
      rate: '11.0000',
      ...verifiedTrace(
        'central-bank-of-russia',
        'https://www.cbr.ru/currency_base/daily/',
      ),
    },
    rates: {
      platformFeeRate: {
        value: '0.12',
        ...verifiedTrace(
          'ozon-seller-api',
          'https://api-seller.ozon.ru/v1/description-category/attribute',
        ),
      },
      paymentFeeRate: {
        value: '0.01',
        ...verifiedTrace(
          'ozon-seller-contract',
          'https://seller-edu.ozon.ru/commissions/payment-processing',
        ),
      },
      adRate: {
        value: '0.10',
        ...verifiedTrace(
          'ozon-performance-api',
          'https://api-performance.ozon.ru/api/client/campaign',
        ),
      },
      refundRate: {
        value: '0.03',
        ...verifiedTrace(
          'ozon-orders-cohort',
          'https://api-seller.ozon.ru/v3/posting/fbs/list',
        ),
      },
    },
  };
}

function deriveCalculationInput(
  evidence: TrustedProfitEvidenceFixture,
  rawCandidateCosts: Array<{
    code: string;
    amount: string | null;
    required: boolean;
  }> = [],
) {
  return new TrustedProfitEconomicsPolicyService().deriveCalculationInput({
    evidence,
    rawCandidateCosts,
    targetCurrency: 'RUB',
    now: NOW,
    maxEvidenceAgeSeconds: 60 * 60,
  });
}

function expectBlocked(
  result: {
    calculationInput: unknown;
    hardGateReasons: string[];
  },
  reason: string,
) {
  expect(result.calculationInput).toBeNull();
  expect(result.hardGateReasons).toContain(reason);
}

describe('trusted profit economics evidence policy', () => {
  it('reports every absent required evidence family explicitly', () => {
    const result =
      new TrustedProfitEconomicsPolicyService().deriveCalculationInput({
        evidence: {},
        rawCandidateCosts: [],
        targetCurrency: 'RUB',
        now: NOW,
        maxEvidenceAgeSeconds: 60 * 60,
      });

    expect(result.calculationInput).toBeNull();
    expect(result.hardGateReasons).toEqual([
      'SALE_PRICE_EVIDENCE_MISSING',
      'SUPPLIER_COST_EVIDENCE_MISSING',
      'PLATFORM_FEE_RATE_EVIDENCE_MISSING',
      'PAYMENT_FEE_RATE_EVIDENCE_MISSING',
      'AD_RATE_EVIDENCE_MISSING',
      'REFUND_RATE_EVIDENCE_MISSING',
    ]);
  });

  it('converts verified CNY supplier costs into RUB before constructing profit input', () => {
    const result = deriveCalculationInput(trustedProfitEvidence());

    expect(result.hardGateReasons).toEqual([]);
    expect(result.calculationInput).toEqual({
      currency: 'RUB',
      salePrice: '1290.00',
      costs: [
        { code: 'PRODUCT', amount: '203.50', required: true },
        { code: 'SHIPPING', amount: '132.00', required: true },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
    });
  });

  it('blocks CNY costs plus a RUB sale price when trusted FX evidence is missing', () => {
    const evidence = trustedProfitEvidence();
    evidence.exchangeRate = null;

    expectBlocked(
      deriveCalculationInput(evidence),
      'CURRENCY_CONVERSION_MISSING',
    );
  });

  it.each([
    'baseCurrency',
    'quoteCurrency',
    'rate',
    'provider',
    'evidenceUrl',
    'observedAt',
    'expiresAt',
  ] as const)('requires the FX evidence field %s', (field) => {
    const evidence = trustedProfitEvidence();
    Reflect.deleteProperty(evidence.exchangeRate!, field);

    expectBlocked(
      deriveCalculationInput(evidence),
      'CURRENCY_CONVERSION_EVIDENCE_INVALID',
    );
  });

  it('requires FX evidence to be VERIFIED', () => {
    const evidence = trustedProfitEvidence();
    evidence.exchangeRate!.quality = 'ESTIMATED';

    expectBlocked(
      deriveCalculationInput(evidence),
      'CURRENCY_CONVERSION_VERIFICATION_REQUIRED',
    );
  });

  it.each([
    {
      label: 'expired',
      observedAt: '2026-07-16T11:00:00.000Z',
      expiresAt: '2026-07-16T11:59:59.000Z',
    },
    {
      label: 'older than the accepted freshness window',
      observedAt: '2026-07-16T10:59:59.000Z',
      expiresAt: '2026-07-16T13:00:00.000Z',
    },
  ])('rejects $label FX evidence', ({ observedAt, expiresAt }) => {
    const evidence = trustedProfitEvidence();
    evidence.exchangeRate!.observedAt = observedAt;
    evidence.exchangeRate!.expiresAt = expiresAt;

    expectBlocked(
      deriveCalculationInput(evidence),
      'CURRENCY_CONVERSION_STALE',
    );
  });

  it('requires the FX pair to convert supplier-cost currency into sale currency', () => {
    const evidence = trustedProfitEvidence();
    evidence.exchangeRate!.baseCurrency = 'USD';
    evidence.exchangeRate!.quoteCurrency = 'RUB';

    expectBlocked(
      deriveCalculationInput(evidence),
      'CURRENCY_CONVERSION_PAIR_MISMATCH',
    );
  });

  it.each([
    {
      label: 'sale price',
      mutate: (evidence: TrustedProfitEvidenceFixture) => {
        evidence.salePrice.quality = 'ESTIMATED';
      },
      reason: 'SALE_PRICE_VERIFICATION_REQUIRED',
    },
    {
      label: 'platform fee rate',
      mutate: (evidence: TrustedProfitEvidenceFixture) => {
        evidence.rates.platformFeeRate.quality = 'ESTIMATED';
      },
      reason: 'PLATFORM_FEE_RATE_VERIFICATION_REQUIRED',
    },
    {
      label: 'payment fee rate',
      mutate: (evidence: TrustedProfitEvidenceFixture) => {
        evidence.rates.paymentFeeRate.quality = 'ESTIMATED';
      },
      reason: 'PAYMENT_FEE_RATE_VERIFICATION_REQUIRED',
    },
    {
      label: 'advertising rate',
      mutate: (evidence: TrustedProfitEvidenceFixture) => {
        evidence.rates.adRate.quality = 'ESTIMATED';
      },
      reason: 'AD_RATE_VERIFICATION_REQUIRED',
    },
    {
      label: 'refund rate',
      mutate: (evidence: TrustedProfitEvidenceFixture) => {
        evidence.rates.refundRate.quality = 'ESTIMATED';
      },
      reason: 'REFUND_RATE_VERIFICATION_REQUIRED',
    },
  ])('does not trust an unverified $label', ({ mutate, reason }) => {
    const evidence = trustedProfitEvidence();
    mutate(evidence);

    expectBlocked(deriveCalculationInput(evidence), reason);
  });

  describe.each([
    {
      label: 'sale price',
      select: (evidence: TrustedProfitEvidenceFixture) => evidence.salePrice,
      reason: 'SALE_PRICE_EVIDENCE_INVALID',
    },
    {
      label: 'platform fee rate',
      select: (evidence: TrustedProfitEvidenceFixture) =>
        evidence.rates.platformFeeRate,
      reason: 'PLATFORM_FEE_RATE_EVIDENCE_INVALID',
    },
    {
      label: 'payment fee rate',
      select: (evidence: TrustedProfitEvidenceFixture) =>
        evidence.rates.paymentFeeRate,
      reason: 'PAYMENT_FEE_RATE_EVIDENCE_INVALID',
    },
    {
      label: 'advertising rate',
      select: (evidence: TrustedProfitEvidenceFixture) => evidence.rates.adRate,
      reason: 'AD_RATE_EVIDENCE_INVALID',
    },
    {
      label: 'refund rate',
      select: (evidence: TrustedProfitEvidenceFixture) =>
        evidence.rates.refundRate,
      reason: 'REFUND_RATE_EVIDENCE_INVALID',
    },
  ])('traceable $label evidence', ({ select, reason }) => {
    it.each(['provider', 'evidenceUrl', 'observedAt', 'expiresAt'] as const)(
      'requires %s',
      (field) => {
        const evidence = trustedProfitEvidence();
        Reflect.deleteProperty(select(evidence), field);

        expectBlocked(deriveCalculationInput(evidence), reason);
      },
    );
  });

  it('rejects raw discovery-candidate costs even when trusted evidence is complete', () => {
    const result = deriveCalculationInput(trustedProfitEvidence(), [
      { code: 'PRODUCT', amount: '1.00', required: true },
      { code: 'SHIPPING', amount: '1.00', required: true },
    ]);

    expectBlocked(result, 'RAW_CANDIDATE_COSTS_FORBIDDEN');
  });
});
