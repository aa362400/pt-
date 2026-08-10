import { Injectable } from '@nestjs/common';
import type {
  ExpectedSupplierPurchase,
  SupplierQuoteEvidence,
} from '../contracts/supplier-quote.contract.js';

const DEFAULT_MAX_EVIDENCE_AGE_SECONDS = 60 * 60;
const DEFAULT_MAX_QUOTE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_CLOCK_SKEW_SECONDS = 120;

export interface VerifiedSupplierProfitCost {
  code: 'PRODUCT' | 'SHIPPING';
  amount: string;
  currency: string;
  required: true;
  quality: 'VERIFIED';
  scope?: 'LANDED_RU';
  evidenceId: string;
  evidenceUrl: string;
  observedAt: string;
  expiresAt: string;
}

@Injectable()
export class SupplierQuoteEvidencePolicyService {
  deriveProfitCosts(input: {
    evidence: SupplierQuoteEvidence;
    expected: ExpectedSupplierPurchase;
    now?: Date;
  }): {
    costs: VerifiedSupplierProfitCost[];
    hardGateReasons: string[];
  } {
    const { evidence, expected } = input;
    const now = input.now ?? new Date();
    const reasons: string[] = [];

    if (
      evidence.evidenceGroupKey !== expected.evidenceGroupKey ||
      evidence.source.provider !== expected.provider ||
      evidence.adapterVersion !== expected.adapterVersion ||
      evidence.requestId !== expected.quoteRequestId ||
      evidence.offer.quoteRequestId !== expected.quoteRequestId ||
      (evidence.discovery.method === 'IMAGE_SEARCH' &&
        evidence.discovery.searchRequestId !== expected.imageSearchRequestId)
    ) {
      reasons.push('SUPPLIER_REQUEST_BINDING_MISMATCH');
    }
    if (evidence.offer.offerId !== expected.offerId) {
      reasons.push('SUPPLIER_OFFER_MISMATCH');
    }
    if (evidence.offer.variantId !== expected.variantId) {
      reasons.push('SUPPLIER_VARIANT_MISMATCH');
    }
    if (evidence.offer.quantity !== expected.quantity) {
      reasons.push('SUPPLIER_QUANTITY_MISMATCH');
    }
    if (evidence.offer.quantity < evidence.offer.minimumOrderQuantity) {
      reasons.push('SUPPLIER_MOQ_NOT_MET');
    }
    if (
      evidence.offer.unitOfMeasure !== expected.unitOfMeasure ||
      evidence.offer.unitsPerPack !== expected.unitsPerPack
    ) {
      reasons.push('SUPPLIER_UNIT_BINDING_MISMATCH');
    }
    if (evidence.offer.unitsPerPack !== 1) {
      reasons.push('SUPPLIER_PACK_UNIT_CONVERSION_REQUIRED');
    }
    if (
      !this.sameAttributes(
        evidence.offer.variantAttributes,
        expected.variantAttributes,
      )
    ) {
      reasons.push('SUPPLIER_VARIANT_ATTRIBUTE_MISMATCH');
    }
    if (evidence.match.status !== 'MATCHED') {
      reasons.push('SUPPLIER_IMAGE_MATCH_REQUIRED');
    }
    if (evidence.match.attributeConflicts.length > 0) {
      reasons.push('SUPPLIER_VARIANT_ATTRIBUTE_CONFLICT');
    }
    if (Number(evidence.match.attributeCoverageRate) < 1) {
      reasons.push('SUPPLIER_VARIANT_ATTRIBUTE_COVERAGE_INCOMPLETE');
    }
    if (
      Number(evidence.match.similarity.score) <
      Number(evidence.match.similarity.threshold)
    ) {
      reasons.push('SUPPLIER_IMAGE_MATCH_THRESHOLD_NOT_MET');
    }
    if (evidence.verification.status !== 'VERIFIED') {
      reasons.push('SUPPLIER_QUOTE_VERIFICATION_REQUIRED');
    }

    this.validateTimeChain(evidence, expected, now, reasons);

    if (evidence.discovery.method !== 'IMAGE_SEARCH') {
      reasons.push('SUPPLIER_IMAGE_SEARCH_EVIDENCE_REQUIRED');
    } else if (
      evidence.discovery.sourceOriginalSha256 !==
        expected.sourceOriginalSha256 ||
      evidence.discovery.sourceCanonicalSha256 !==
        expected.sourceCanonicalSha256 ||
      evidence.discovery.offerCanonicalSha256 !== expected.offerCanonicalSha256
    ) {
      reasons.push('SUPPLIER_IMAGE_EVIDENCE_MISMATCH');
    }
    if (evidence.offer.price.kind !== 'EXACT') {
      reasons.push('SUPPLIER_PRICE_NOT_EXACT');
    } else {
      if (
        evidence.offer.quantity <
          evidence.offer.price.selectedTierMinimumQuantity ||
        (evidence.offer.price.selectedTierMaximumQuantity !== null &&
          evidence.offer.quantity >
            evidence.offer.price.selectedTierMaximumQuantity)
      ) {
        reasons.push('SUPPLIER_PRICE_TIER_MISMATCH');
      }
      if (evidence.offer.price.taxBasis !== 'INCLUDED') {
        reasons.push('SUPPLIER_PRODUCT_TAX_BASIS_INCOMPLETE');
      }
      if (
        !this.decimalProductEquals(
          evidence.offer.price.unitAmount,
          evidence.offer.quantity,
          evidence.offer.price.totalAmount,
        )
      ) {
        reasons.push('SUPPLIER_PRODUCT_TOTAL_MISMATCH');
      }
    }

    if (
      evidence.shipping.scope !== 'LANDED_RU' ||
      evidence.shipping.destinationCountry !== 'RU' ||
      expected.destinationCountry !== 'RU' ||
      evidence.shipping.destinationCountry !== expected.destinationCountry ||
      evidence.shipping.destinationPostalCode !==
        expected.destinationPostalCode ||
      evidence.shipping.quantity !== expected.quantity ||
      evidence.shipping.incoterm !== 'DDP' ||
      !evidence.shipping.includesInternationalFreight ||
      !evidence.shipping.includesImportDuty ||
      !evidence.shipping.includesVat ||
      !evidence.shipping.includesCustomsClearance ||
      !evidence.shipping.includesDestinationDelivery
    ) {
      reasons.push('SUPPLIER_LANDED_RU_SHIPPING_REQUIRED');
    }
    if (
      evidence.shipping.offerId !== expected.offerId ||
      evidence.shipping.variantId !== expected.variantId ||
      evidence.shipping.packageQuantity !== expected.quantity
    ) {
      reasons.push('SUPPLIER_SHIPPING_BINDING_MISMATCH');
    }
    if (
      !this.decimalProductEquals(
        evidence.shipping.amountPerUnit,
        evidence.shipping.quantity,
        evidence.shipping.totalAmount,
      )
    ) {
      reasons.push('SUPPLIER_SHIPPING_TOTAL_MISMATCH');
    }

    const productCurrency = evidence.offer.price.currency;
    if (
      productCurrency !== expected.currency ||
      evidence.shipping.currency !== expected.currency
    ) {
      reasons.push('SUPPLIER_ECONOMICS_CURRENCY_MISMATCH');
    }
    if (
      !this.allowedHost(
        evidence.offer.offerUrl,
        expected.allowedEvidenceHosts,
      ) ||
      !this.allowedHost(
        evidence.shipping.evidenceUrl,
        expected.allowedEvidenceHosts,
      )
    ) {
      reasons.push('SUPPLIER_EVIDENCE_HOST_NOT_ALLOWED');
    }

    const hardGateReasons = [...new Set(reasons)];
    if (hardGateReasons.length > 0 || evidence.offer.price.kind !== 'EXACT') {
      return { costs: [], hardGateReasons };
    }

    const shared = {
      currency: expected.currency,
      required: true as const,
      quality: 'VERIFIED' as const,
      evidenceId: `supplier_quote_snapshot:${evidence.rawSnapshotSha256}`,
      observedAt: evidence.source.fetchedAt,
      expiresAt: evidence.verification.validUntil,
    };
    return {
      hardGateReasons: [],
      costs: [
        {
          code: 'PRODUCT',
          amount: evidence.offer.price.unitAmount,
          evidenceUrl: evidence.offer.offerUrl,
          ...shared,
        },
        {
          code: 'SHIPPING',
          amount: evidence.shipping.amountPerUnit,
          scope: 'LANDED_RU',
          evidenceUrl: evidence.shipping.evidenceUrl,
          ...shared,
        },
      ],
    };
  }

  private validateTimeChain(
    evidence: SupplierQuoteEvidence,
    expected: ExpectedSupplierPurchase,
    now: Date,
    reasons: string[],
  ) {
    const fetchedAt = new Date(evidence.source.fetchedAt).getTime();
    const reviewedAt = new Date(evidence.match.reviewedAt).getTime();
    const verifiedAt = new Date(evidence.verification.verifiedAt).getTime();
    const validUntil = new Date(evidence.verification.validUntil).getTime();
    const nowMs = now.getTime();
    const clockSkewMs =
      (expected.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS) * 1000;
    const maxEvidenceAgeMs =
      (expected.maxEvidenceAgeSeconds ?? DEFAULT_MAX_EVIDENCE_AGE_SECONDS) *
      1000;
    const maxQuoteTtlMs =
      (expected.maxQuoteTtlSeconds ?? DEFAULT_MAX_QUOTE_TTL_SECONDS) * 1000;

    if (verifiedAt > nowMs + clockSkewMs) {
      reasons.push('SUPPLIER_QUOTE_VERIFIED_IN_FUTURE');
    }
    if (
      fetchedAt > reviewedAt ||
      reviewedAt > verifiedAt ||
      validUntil <= verifiedAt
    ) {
      reasons.push('SUPPLIER_QUOTE_TIME_CHAIN_INVALID');
    }
    if (fetchedAt > nowMs + clockSkewMs) {
      reasons.push('SUPPLIER_QUOTE_SOURCE_IN_FUTURE');
    }
    if (nowMs - fetchedAt > maxEvidenceAgeMs) {
      reasons.push('SUPPLIER_QUOTE_SOURCE_STALE');
    }
    if (validUntil - verifiedAt > maxQuoteTtlMs) {
      reasons.push('SUPPLIER_QUOTE_TTL_TOO_LONG');
    }
    if (validUntil <= nowMs) {
      reasons.push('SUPPLIER_QUOTE_EXPIRED');
    }
  }

  private allowedHost(value: string, allowedHosts: string[]): boolean {
    const host = new URL(value).hostname.toLocaleLowerCase();
    return allowedHosts.some((allowed) => {
      const normalized = allowed.trim().toLocaleLowerCase();
      return (
        normalized && (host === normalized || host.endsWith(`.${normalized}`))
      );
    });
  }

  private decimalProductEquals(
    unitAmount: string,
    quantity: number,
    totalAmount: string,
  ): boolean {
    const unit = this.decimalParts(unitAmount);
    const total = this.decimalParts(totalAmount);
    return (
      unit.value * BigInt(quantity) * total.scale === total.value * unit.scale
    );
  }

  private decimalParts(value: string): { value: bigint; scale: bigint } {
    const [whole, fraction = ''] = value.split('.');
    return {
      value: BigInt(`${whole}${fraction}`),
      scale: 10n ** BigInt(fraction.length),
    };
  }

  private sameAttributes(
    actual: Record<string, string>,
    expected: Record<string, string>,
  ): boolean {
    const actualEntries = Object.entries(actual).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
  }
}
