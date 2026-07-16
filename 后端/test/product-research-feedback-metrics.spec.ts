import { buildProductPerformance } from '../src/features/product-research/daily/services/feedback/product-feedback-metrics.js';

describe('daily product research feedback metrics', () => {
  const createdAt = new Date('2026-06-01T00:00:00.000Z');
  const now = new Date('2026-07-13T00:00:00.000Z');

  it('returns null instead of a fake zero percentage when denominator is zero', () => {
    const result = buildProductPerformance({
      candidateCreatedAt: createdAt,
      facts: [],
      now,
    });
    expect(result.funnel.clickThroughRate).toEqual({
      value: null,
      numerator: 0,
      denominator: 0,
      reason: 'DENOMINATOR_ZERO',
    });
    expect(result.coverage).toBe('NOT_AVAILABLE');
  });

  it('keeps returned actual profit separate from predicted profit', () => {
    const result = buildProductPerformance({
      candidateCreatedAt: createdAt,
      now,
      facts: [
        { eventType: 'REVENUE', eventAt: now, value: 100, currency: 'CNY' },
        {
          eventType: 'ACTUAL_PROFIT',
          eventAt: now,
          value: 21.5,
          currency: 'CNY',
        },
        { eventType: 'AD_SPEND', eventAt: now, value: 9, currency: 'CNY' },
      ],
    });
    expect(result.financials.actualKnownProfitByCurrency).toEqual({
      CNY: 21.5,
    });
    expect(result.financials.actualKnownRevenueByCurrency).toEqual({
      CNY: 100,
    });
    expect(result.financials.estimatedFullyLoadedProfit).toBeNull();
  });

  it('blocks final refund rate until its maturity window has elapsed', () => {
    const eventAt = new Date('2026-07-10T00:00:00.000Z');
    const result = buildProductPerformance({
      candidateCreatedAt: eventAt,
      now,
      refundMaturityDays: 30,
      facts: [
        {
          eventType: 'LISTING_PUBLISHED',
          eventAt,
          value: null,
          currency: null,
        },
        { eventType: 'ORDER_CREATED', eventAt, value: null, currency: null },
      ],
    });
    expect(result.funnel.refundRate.value).toBeNull();
    expect(result.funnel.refundRate.reason).toBe('REFUND_WINDOW_NOT_MATURE');
  });
});
