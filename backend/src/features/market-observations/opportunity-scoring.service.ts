import { Injectable } from '@nestjs/common';

interface ScoringInput {
  currentPrice: unknown;
  originalPrice: unknown;
  rating?: number | null;
  reviewCount?: number | null;
  displayedSalesText?: string | null;
  position?: number | null;
  sponsored?: boolean | null;
  title: string;
  imageUrl?: string | null;
  brand?: string | null;
  sellerName?: string | null;
  deliveryText?: string | null;
  promotionText?: string | null;
  externalId?: string | null;
  evidenceConfidence: number;
}

@Injectable()
export class OpportunityScoringService {
  readonly version = 'opportunity-score/v1';

  score(input: ScoringInput) {
    const demand = this.clamp(
      (input.rating ? input.rating * 8 : 0) +
        (input.reviewCount
          ? Math.min(45, Math.log10(input.reviewCount + 1) * 15)
          : 0) +
        (input.displayedSalesText ? 12 : 0),
    );
    const competitionOpportunity = this.clamp(
      (input.position && input.position <= 20 ? 35 : input.position ? 20 : 10) +
        (input.sponsored === false ? 25 : input.sponsored === true ? 5 : 15) +
        (input.brand ? 8 : 16) +
        (input.sellerName ? 8 : 16),
    );
    const contentOpportunity = this.clamp(
      (input.title.length < 60 ? 35 : 18) +
        (input.imageUrl ? 12 : 30) +
        (input.deliveryText ? 8 : 16) +
        (input.promotionText ? 8 : 16),
    );
    const evidence = this.clamp(
      input.evidenceConfidence * 75 +
        (input.currentPrice !== null && input.currentPrice !== undefined
          ? 10
          : 0) +
        (input.externalId ? 8 : 0) +
        (input.imageUrl ? 7 : 0),
    );
    const score = this.round(
      demand * 0.35 +
        competitionOpportunity * 0.2 +
        contentOpportunity * 0.2 +
        evidence * 0.25,
    );
    const missingEvidence = [
      'product_cost',
      'international_logistics_cost',
      'ozon_platform_fee',
      'withdrawal_and_exchange_cost',
      'supplier_lead_time',
      'compliance_and_return_risk',
    ];
    return {
      score,
      decision: 'MANUAL_REVIEW_RECOMMENDED',
      dimensions: {
        demandSignal: demand,
        competitionOpportunity,
        contentOpportunity,
        evidenceConfidence: evidence,
        marginPotential: 'unknown',
        supplyChainRisk: 'unknown',
      },
      reasons: [
        'english_textuserenglish_text Ozon textevidence。',
        'english_textrealtext。',
      ],
      risks: [
        'textcost、text、platformenglish_textsupply chainevidence，noneenglish_textrealprofit。',
        'publictextfieldsenglish_text、english_text。',
      ],
      missingEvidence,
    };
  }

  private clamp(value: number) {
    return this.round(Math.max(0, Math.min(100, value)));
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }
}
