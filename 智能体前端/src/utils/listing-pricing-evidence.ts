export type ListingPricingStatus = 'EVIDENCE_BACKED' | 'DATA_INSUFFICIENT';
export type ListingPriceCurrency = 'RUB' | 'USD';

export interface ListingPricingAttributes {
  suggestedPrice?: unknown;
  priceCurrency?: unknown;
  pricingStatus?: unknown;
  economicsEvaluationId?: unknown;
}

export interface ListingPricingDisplay {
  price: number | null;
  currency: ListingPriceCurrency | null;
  status: ListingPricingStatus;
  economicsEvaluationId: string | null;
}

export function listingPricingForDisplay(
  attributes: ListingPricingAttributes | null | undefined,
): ListingPricingDisplay {
  const price = attributes?.suggestedPrice;
  const currency = attributes?.priceCurrency;
  const evaluationId = attributes?.economicsEvaluationId;
  const evidenceBacked =
    attributes?.pricingStatus === 'EVIDENCE_BACKED' &&
    typeof price === 'number' &&
    Number.isFinite(price) &&
    price > 0 &&
    (currency === 'RUB' || currency === 'USD') &&
    typeof evaluationId === 'string' &&
    evaluationId.trim().length > 0;

  return evidenceBacked
    ? {
        price,
        currency,
        status: 'EVIDENCE_BACKED',
        economicsEvaluationId: evaluationId.trim(),
      }
    : {
        price: null,
        currency: null,
        status: 'DATA_INSUFFICIENT',
        economicsEvaluationId: null,
      };
}

export function formatListingEvidencePrice(
  price: number,
  currency: ListingPriceCurrency,
): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}
