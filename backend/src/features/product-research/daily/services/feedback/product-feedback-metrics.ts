export interface ProductFeedbackFact {
  eventType: string;
  eventAt: Date;
  value: number | null;
  currency: string | null;
  metadata?: Record<string, unknown>;
}

export interface RatioMetric {
  value: number | null;
  numerator: number;
  denominator: number;
  reason: 'DENOMINATOR_ZERO' | 'REFUND_WINDOW_NOT_MATURE' | null;
}

function ratio(
  numerator: number,
  denominator: number,
  reason: RatioMetric['reason'] = null,
): RatioMetric {
  if (reason) return { value: null, numerator, denominator, reason };
  if (denominator === 0)
    return { value: null, numerator, denominator, reason: 'DENOMINATOR_ZERO' };
  return {
    value: numerator / denominator,
    numerator,
    denominator,
    reason: null,
  };
}

function sumByCurrency(facts: ProductFeedbackFact[], eventType: string) {
  const values: Record<string, number> = {};
  for (const fact of facts) {
    if (fact.eventType !== eventType || fact.value === null) continue;
    const currency = fact.currency ?? 'UNSPECIFIED';
    values[currency] = Number(
      ((values[currency] ?? 0) + fact.value).toFixed(6),
    );
  }
  return values;
}

export function buildProductPerformance(input: {
  candidateCreatedAt: Date;
  facts: ProductFeedbackFact[];
  now?: Date;
  refundMaturityDays?: number;
}) {
  const now = input.now ?? new Date();
  const refundMaturityDays = input.refundMaturityDays ?? 30;
  const count = (eventType: string) =>
    input.facts.filter((fact) => fact.eventType === eventType).length;
  const sumCountedValue = (eventType: string) =>
    input.facts
      .filter((fact) => fact.eventType === eventType)
      .reduce((total, fact) => total + (fact.value ?? 1), 0);

  const publishedAt = input.facts
    .filter((fact) => fact.eventType === 'LISTING_PUBLISHED')
    .map((fact) => fact.eventAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const cohortStart = publishedAt ?? input.candidateCreatedAt;
  const cohortAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - cohortStart.getTime()) / 86_400_000),
  );
  const impressions = sumCountedValue('IMPRESSION');
  const clicks = sumCountedValue('CLICK');
  const favorites = sumCountedValue('FAVORITE');
  const carts = sumCountedValue('ADD_TO_CART');
  const orders = count('ORDER_CREATED');
  const refundedOrders = count('ORDER_REFUNDED');
  const refundMature = cohortAgeDays >= refundMaturityDays;
  const coverageValues = input.facts
    .map((fact) => fact.metadata?.coverageStatus)
    .filter((value): value is string => typeof value === 'string');
  const coverage = coverageValues.includes('FAILED')
    ? 'FAILED'
    : coverageValues.includes('SYNCING')
      ? 'SYNCING'
      : coverageValues.length > 0 &&
          coverageValues.every((value) => value === 'COMPLETE')
        ? 'COMPLETE'
        : input.facts.length === 0
          ? 'NOT_AVAILABLE'
          : 'PARTIAL';

  return {
    asOf: now.toISOString(),
    coverage,
    sampleSize: input.facts.length,
    cohort: {
      startedAt: cohortStart.toISOString(),
      ageDays: cohortAgeDays,
      refundMaturityDays,
      refundMature,
    },
    funnel: {
      impressions,
      clicks,
      favorites,
      carts,
      orders,
      refundedOrders,
      clickThroughRate: ratio(clicks, impressions),
      favoriteRate: ratio(favorites, clicks),
      addToCartRate: ratio(carts, clicks),
      orderRate: ratio(orders, clicks),
      refundRate: ratio(
        refundedOrders,
        orders,
        refundMature ? null : 'REFUND_WINDOW_NOT_MATURE',
      ),
    },
    financials: {
      actualKnownRevenueByCurrency: sumByCurrency(input.facts, 'REVENUE'),
      actualKnownProfitByCurrency: sumByCurrency(input.facts, 'ACTUAL_PROFIT'),
      adSpendByCurrency: sumByCurrency(input.facts, 'AD_SPEND'),
      costAdjustmentsByCurrency: sumByCurrency(input.facts, 'COST_ADJUSTMENT'),
      estimatedFullyLoadedProfit: null,
      estimatedProfitReason: 'NO_ESTIMATE_MIXED_WITH_ACTUAL_FACTS',
    },
  };
}
