import { Injectable } from '@nestjs/common';

export const LISTING_SANDBOX_POLICY_VERSION =
  'ozon-listing-sandbox/2026-07-15' as const;

export const PUBLICATION_SAFETY_THRESHOLDS = {
  allow: 85,
  review: 60,
} as const;

export type ListingSandboxRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
export type ListingSandboxStatus = 'PASSED' | 'REVIEW_REQUIRED' | 'BLOCKED';
export type PublicationSafetyDecision = 'ALLOW' | 'REVIEW' | 'BLOCK';
export type PublicationSafetyDimensionKey =
  | 'IMAGE_CONSISTENCY'
  | 'CONTENT_COMPLIANCE'
  | 'PRICE_ANOMALY'
  | 'MARGIN_BUFFER'
  | 'ATTRIBUTE_COMPLETENESS'
  | 'CHANNEL_RISK'
  | 'APPROVAL_COMPLETENESS'
  | 'EXTERNAL_RESPONSE_TRUST';
export type PublicationEvidenceStatus =
  'VERIFIED' | 'MISSING' | 'NOT_APPLICABLE';
export type ListingSandboxRuleCategory =
  | 'PLATFORM_POLICY'
  | 'INTELLECTUAL_PROPERTY'
  | 'CATEGORY'
  | 'ECONOMICS'
  | 'IMAGE'
  | 'CONTENT'
  | 'CHANNEL'
  | 'APPROVAL'
  | 'EXTERNAL_RESPONSE';

export interface ListingSandboxRuleHit {
  code: string;
  category: ListingSandboxRuleCategory;
  severity: Exclude<ListingSandboxRiskLevel, 'LOW'>;
  blocking: boolean;
  message: string;
  evidence: Record<string, unknown>;
}

export interface PublicationSafetyDimension {
  key: PublicationSafetyDimensionKey;
  score: number;
  weight: number;
  evidenceStatus: PublicationEvidenceStatus;
  reasonCodes: string[];
  evidence: Record<string, unknown>;
}

export interface ListingSandboxEvaluation {
  policyVersion: typeof LISTING_SANDBOX_POLICY_VERSION;
  status: ListingSandboxStatus;
  riskLevel: ListingSandboxRiskLevel;
  blocking: boolean;
  decision: PublicationSafetyDecision;
  overallScore: number;
  thresholds: typeof PUBLICATION_SAFETY_THRESHOLDS;
  dimensions: PublicationSafetyDimension[];
  hardBlockCodes: string[];
  softBlockCodes: string[];
  hits: ListingSandboxRuleHit[];
  evaluatedAt: string;
}

interface SandboxPayload {
  name?: unknown;
  offerId?: unknown;
  price?: unknown;
  images?: unknown;
  descriptionCategoryId?: unknown;
  attributes?: unknown;
}

interface SandboxEconomics {
  currency?: unknown;
  price?: unknown;
  cost?: unknown;
  shippingCost?: unknown;
  platformFeeRate?: unknown;
  withdrawalFeeRate?: unknown;
  netProfit?: unknown;
  marginRate?: unknown;
}

interface PublicationSafetyEvidence {
  image?: unknown;
  content?: unknown;
  pricing?: unknown;
  attributes?: unknown;
  channel?: unknown;
  approval?: unknown;
  externalResponse?: unknown;
}

export interface ListingSandboxInput {
  target?: unknown;
  snapshotHash?: unknown;
  payload?: SandboxPayload;
  economics?: SandboxEconomics;
  safetyEvidence?: PublicationSafetyEvidence;
}

const PROHIBITED_TERMS = [
  'weapon',
  'firearm',
  'narcotic',
  'оружие',
  'огнестрельное',
  'наркотик',
  'text',
  'text',
] as const;

const PROTECTED_BRAND_TERMS = [
  'disney',
  'marvel',
  'pokemon',
  'starbucks',
  'harry potter',
  'taylor swift',
] as const;

const DEFAULT_TARGET_MARGIN_RATE = 0.1;
const EXACT_PUBLISH_CAPABILITY = 'action:ozon.listing.publish';
const DIMENSION_WEIGHTS: Record<PublicationSafetyDimensionKey, number> = {
  IMAGE_CONSISTENCY: 15,
  CONTENT_COMPLIANCE: 15,
  PRICE_ANOMALY: 15,
  MARGIN_BUFFER: 15,
  ATTRIBUTE_COMPLETENESS: 10,
  CHANNEL_RISK: 10,
  APPROVAL_COMPLETENESS: 15,
  EXTERNAL_RESPONSE_TRUST: 5,
};

@Injectable()
export class ListingSandboxRuleEngine {
  evaluate(input: ListingSandboxInput): ListingSandboxEvaluation {
    const payload = this.record(input.payload) as SandboxPayload;
    const economics = this.record(input.economics) as SandboxEconomics;
    const safety = this.record(input.safetyEvidence);
    const hits: ListingSandboxRuleHit[] = [];
    const dimensions: PublicationSafetyDimension[] = [];

    dimensions.push(this.evaluateImage(payload, safety, hits));
    dimensions.push(this.evaluateContent(payload, safety, hits));
    dimensions.push(this.evaluatePrice(payload, economics, safety, hits));
    dimensions.push(this.evaluateMargin(payload, economics, safety, hits));
    dimensions.push(this.evaluateAttributes(payload, safety, hits));
    dimensions.push(this.evaluateChannel(safety, hits));
    dimensions.push(this.evaluateApproval(safety, hits));
    dimensions.push(this.evaluateExternalResponse(safety, hits));

    const overallScore = this.roundScore(
      dimensions.reduce(
        (total, dimension) =>
          total + (dimension.score * dimension.weight) / 100,
        0,
      ),
    );
    if (overallScore < PUBLICATION_SAFETY_THRESHOLDS.review) {
      this.pushUnique(
        hits,
        this.hit(
          'PUBLICATION_SCORE_BELOW_BLOCK_THRESHOLD',
          'PLATFORM_POLICY',
          'BLOCKED',
          true,
          'The weighted publication safety score is below the blocking threshold.',
          {
            overallScore,
            threshold: PUBLICATION_SAFETY_THRESHOLDS.review,
          },
        ),
      );
    }

    const hardBlockCodes = hits
      .filter((hit) => hit.blocking)
      .map((hit) => hit.code);
    const softBlockCodes = hits
      .filter((hit) => !hit.blocking)
      .map((hit) => hit.code);
    const decision: PublicationSafetyDecision =
      hardBlockCodes.length > 0
        ? 'BLOCK'
        : softBlockCodes.length > 0 ||
            overallScore < PUBLICATION_SAFETY_THRESHOLDS.allow
          ? 'REVIEW'
          : 'ALLOW';
    const status: ListingSandboxStatus =
      decision === 'BLOCK'
        ? 'BLOCKED'
        : decision === 'REVIEW'
          ? 'REVIEW_REQUIRED'
          : 'PASSED';
    const hasAbsoluteBlock = hits.some(
      (hit) => hit.blocking && hit.severity === 'BLOCKED',
    );
    const hasHighBlock = hits.some(
      (hit) => hit.blocking && hit.severity === 'HIGH',
    );
    const riskLevel: ListingSandboxRiskLevel = hasAbsoluteBlock
      ? 'BLOCKED'
      : hasHighBlock || overallScore < PUBLICATION_SAFETY_THRESHOLDS.review
        ? 'HIGH'
        : decision === 'REVIEW'
          ? 'MEDIUM'
          : 'LOW';

    return {
      policyVersion: LISTING_SANDBOX_POLICY_VERSION,
      status,
      riskLevel,
      blocking: decision === 'BLOCK',
      decision,
      overallScore,
      thresholds: PUBLICATION_SAFETY_THRESHOLDS,
      dimensions,
      hardBlockCodes,
      softBlockCodes,
      hits,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private evaluateImage(
    payload: SandboxPayload,
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.image);
    const images = Array.isArray(payload.images)
      ? payload.images.filter(
          (item): item is string =>
            typeof item === 'string' && /^https:\/\//i.test(item),
        )
      : [];
    let score = 100;
    const reasonCodes: string[] = [];

    if (images.length === 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'IMAGE_REQUIRED',
          'IMAGE',
          'BLOCKED',
          true,
          'At least one publicly accessible HTTPS product image is required.',
          { validImageCount: 0 },
        ),
      );
      score = 0;
    } else if (images.length < 2) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'IMAGE_COUNT_LOW',
          'IMAGE',
          'MEDIUM',
          false,
          'Only one product image is available; human review is required.',
          { validImageCount: images.length, recommendedMinimum: 2 },
        ),
      );
      score = Math.min(score, 82);
    }

    const qaOutcome = this.string(evidence.qaOutcome).toUpperCase();
    const qaScore = this.number(evidence.qaScore);
    const consistencyScore = this.number(evidence.consistencyScore);
    const severeMismatch = evidence.severeMismatch === true;
    if (!qaOutcome || qaScore === null || consistencyScore === null) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'IMAGE_CONSISTENCY_EVIDENCE_REQUIRED',
          'IMAGE',
          'BLOCKED',
          true,
          'Verified image QA and consistency evidence are required.',
          { qaOutcome, qaScore, consistencyScore },
        ),
      );
      score = 0;
    } else if (
      qaOutcome !== 'PASSED' ||
      severeMismatch ||
      Math.min(qaScore, consistencyScore) < 60
    ) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'IMAGE_PRODUCT_MISMATCH_SEVERE',
          'IMAGE',
          'BLOCKED',
          true,
          'Image QA indicates a severe mismatch with the approved product.',
          { qaOutcome, qaScore, consistencyScore, severeMismatch },
        ),
      );
      score = Math.min(score, Math.max(0, Math.min(qaScore, consistencyScore)));
    } else if (Math.min(qaScore, consistencyScore) < 85) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'IMAGE_STYLE_DRIFT_REVIEW',
          'IMAGE',
          'MEDIUM',
          false,
          'Image consistency is acceptable but below the automatic publication threshold.',
          { qaScore, consistencyScore, threshold: 85 },
        ),
      );
      score = Math.min(score, Math.min(qaScore, consistencyScore));
    } else {
      score = Math.min(score, Math.min(qaScore, consistencyScore));
    }

    return this.dimension(
      'IMAGE_CONSISTENCY',
      score,
      Object.keys(evidence).length > 0 ? 'VERIFIED' : 'MISSING',
      reasonCodes,
      { ...evidence, validImageCount: images.length },
    );
  }

  private evaluateContent(
    payload: SandboxPayload,
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.content);
    const name = this.string(payload.name);
    const normalizedName = name.toLocaleLowerCase();
    let score = 100;
    const reasonCodes: string[] = [];

    if (!name) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'TITLE_REQUIRED',
          'CONTENT',
          'BLOCKED',
          true,
          'A product title is required before publication.',
          { field: 'payload.name' },
        ),
      );
      score = 0;
    } else if (name.length > 200) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'TITLE_TOO_LONG',
          'CONTENT',
          'MEDIUM',
          false,
          'The title exceeds the publication limit and requires review.',
          { length: name.length, limit: 200 },
        ),
      );
      score = Math.min(score, 80);
    }

    const prohibited = PROHIBITED_TERMS.filter((term) =>
      normalizedName.includes(term),
    );
    if (prohibited.length > 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'PROHIBITED_TERM',
          'PLATFORM_POLICY',
          'BLOCKED',
          true,
          'The title contains prohibited or high-risk product terms.',
          { matchedTerms: prohibited },
        ),
      );
      score = 0;
    }

    const protectedBrands = PROTECTED_BRAND_TERMS.filter((term) =>
      normalizedName.includes(term),
    );
    if (protectedBrands.length > 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'PROTECTED_BRAND_TERM',
          'INTELLECTUAL_PROPERTY',
          'HIGH',
          true,
          'The title contains a protected brand or IP term.',
          { matchedTerms: protectedBrands },
        ),
      );
      score = Math.min(score, 40);
    }

    const evaluatorOutcome = this.string(
      evidence.evaluatorOutcome,
    ).toUpperCase();
    const evaluatorScore = this.number(evidence.evaluatorScore);
    if (
      evaluatorOutcome !== 'QUALIFIED' ||
      evidence.approvalHashMatches !== true
    ) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CONTENT_APPROVAL_EVIDENCE_INVALID',
          'CONTENT',
          'BLOCKED',
          true,
          'The listing content does not match a qualified immutable approval.',
          {
            evaluatorOutcome,
            approvalHashMatches: evidence.approvalHashMatches === true,
          },
        ),
      );
      score = Math.min(score, 0);
    } else if (evaluatorScore === null) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CONTENT_CONFIDENCE_MISSING',
          'CONTENT',
          'MEDIUM',
          false,
          'The qualified content has no confidence score.',
          { evaluatorOutcome },
        ),
      );
      score = Math.min(score, 70);
    } else if (evaluatorScore < 60) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CONTENT_CONFIDENCE_LOW',
          'CONTENT',
          'BLOCKED',
          true,
          'Content confidence is below the blocking threshold.',
          { evaluatorScore, threshold: 60 },
        ),
      );
      score = Math.min(score, evaluatorScore);
    } else if (evaluatorScore < 85) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CONTENT_CONFIDENCE_REVIEW',
          'CONTENT',
          'MEDIUM',
          false,
          'Content confidence requires human review.',
          { evaluatorScore, threshold: 85 },
        ),
      );
      score = Math.min(score, evaluatorScore);
    } else {
      score = Math.min(score, evaluatorScore);
    }

    return this.dimension(
      'CONTENT_COMPLIANCE',
      score,
      Object.keys(evidence).length > 0 ? 'VERIFIED' : 'MISSING',
      reasonCodes,
      evidence,
    );
  }

  private evaluatePrice(
    payload: SandboxPayload,
    economics: SandboxEconomics,
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.pricing);
    const price = this.number(payload.price);
    const previousPrice = this.positiveNumber(evidence.previousApprovedPrice);
    const competitorEvidenceCount =
      this.nonNegativeNumber(evidence.competitorEvidenceCount) ?? 0;
    let score = 100;
    const reasonCodes: string[] = [];

    if (price === null || price <= 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'PRICE_REQUIRED',
          'ECONOMICS',
          'BLOCKED',
          true,
          'A positive product price is required.',
          { value: payload.price ?? null },
        ),
      );
      score = 0;
    } else if (previousPrice !== null) {
      const deviationRate = Math.abs(price - previousPrice) / previousPrice;
      if (deviationRate >= 0.5) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'PRICE_DEVIATION_SEVERE',
            'ECONOMICS',
            'BLOCKED',
            true,
            'The proposed price deviates at least 50% from the last approved price.',
            { price, previousPrice, deviationRate },
          ),
        );
        score = 30;
      } else if (deviationRate >= 0.2) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'PRICE_DEVIATION_REVIEW',
            'ECONOMICS',
            'MEDIUM',
            false,
            'The proposed price deviates at least 20% from the last approved price.',
            { price, previousPrice, deviationRate },
          ),
        );
        score = 78;
      } else {
        score = this.clamp(100 - deviationRate * 100);
      }
    } else if (competitorEvidenceCount < 2) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'PRICE_REFERENCE_INSUFFICIENT',
          'ECONOMICS',
          'MEDIUM',
          false,
          'No approved price history and fewer than two competitor price sources are available.',
          { competitorEvidenceCount },
        ),
      );
      score = 75;
    } else {
      score = 90;
    }

    const cost = this.nonNegativeNumber(economics.cost);
    const shippingCost = this.nonNegativeNumber(economics.shippingCost);
    const platformFeeRate = this.rate(economics.platformFeeRate);
    const withdrawalFeeRate = this.rate(economics.withdrawalFeeRate);
    const minimumMarginRate =
      this.normalizedMarginRate(evidence.minimumMarginRate) ??
      DEFAULT_TARGET_MARGIN_RATE;
    if (
      price !== null &&
      price > 0 &&
      cost !== null &&
      shippingCost !== null &&
      platformFeeRate !== null &&
      withdrawalFeeRate !== null
    ) {
      const denominator =
        1 - platformFeeRate - withdrawalFeeRate - minimumMarginRate;
      if (denominator <= 0) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'PRICING_CONFIGURATION_INVALID',
            'ECONOMICS',
            'BLOCKED',
            true,
            'Fee and margin configuration leaves no valid price denominator.',
            {
              platformFeeRate,
              withdrawalFeeRate,
              minimumMarginRate,
            },
          ),
        );
        score = 0;
      } else {
        const floorPrice = this.roundMoney((cost + shippingCost) / denominator);
        if (price + 0.005 < floorPrice) {
          this.addReason(
            hits,
            reasonCodes,
            this.hit(
              'PRICE_BELOW_FLOOR',
              'ECONOMICS',
              'BLOCKED',
              true,
              'The proposed price is below the store-specific floor price.',
              { price, floorPrice, minimumMarginRate },
            ),
          );
          score = Math.min(score, 20);
        }
      }
    }

    return this.dimension(
      'PRICE_ANOMALY',
      score,
      Object.keys(evidence).length > 0 ? 'VERIFIED' : 'MISSING',
      reasonCodes,
      {
        ...evidence,
        competitorEvidenceCount,
      },
    );
  }

  private evaluateMargin(
    payload: SandboxPayload,
    economics: SandboxEconomics,
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const pricingEvidence = this.record(safety.pricing);
    const marginRate = this.number(economics.marginRate);
    const netProfit = this.number(economics.netProfit);
    const minimumMarginRate =
      this.normalizedMarginRate(pricingEvidence.minimumMarginRate) ??
      DEFAULT_TARGET_MARGIN_RATE;
    let score = 100;
    const reasonCodes: string[] = [];

    if (marginRate === null || netProfit === null) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'ECONOMICS_REQUIRED',
          'ECONOMICS',
          'HIGH',
          true,
          'Immutable profit and margin evidence is required.',
          {
            marginRate: economics.marginRate ?? null,
            netProfit: economics.netProfit ?? null,
          },
        ),
      );
      score = 0;
    } else if (netProfit <= 0 || marginRate <= 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'NEGATIVE_MARGIN',
          'ECONOMICS',
          'BLOCKED',
          true,
          'Expected net profit and margin must both be positive.',
          { netProfit, marginRate },
        ),
      );
      score = 0;
    } else if (marginRate < minimumMarginRate) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'MARGIN_BELOW_STORE_FLOOR',
          'ECONOMICS',
          'BLOCKED',
          true,
          'Expected margin is below the configured store floor.',
          { marginRate, minimumMarginRate },
        ),
      );
      score = Math.max(
        0,
        this.roundScore((marginRate / minimumMarginRate) * 59),
      );
    } else if (marginRate < DEFAULT_TARGET_MARGIN_RATE) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'MARGIN_BELOW_TARGET',
          'ECONOMICS',
          'MEDIUM',
          false,
          'Expected margin is positive but below the automatic publication target.',
          { marginRate, minimumMarginRate: DEFAULT_TARGET_MARGIN_RATE },
        ),
      );
      score = 75;
    } else if (marginRate - minimumMarginRate < 0.02) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'MARGIN_NEAR_STORE_FLOOR',
          'ECONOMICS',
          'MEDIUM',
          false,
          'Expected margin is within two percentage points of the store floor.',
          { marginRate, minimumMarginRate },
        ),
      );
      score = 80;
    } else {
      score = this.clamp(85 + (marginRate - minimumMarginRate) * 100);
    }

    return this.dimension(
      'MARGIN_BUFFER',
      score,
      marginRate === null || netProfit === null ? 'MISSING' : 'VERIFIED',
      reasonCodes,
      {
        price: payload.price ?? null,
        netProfit,
        marginRate,
        minimumMarginRate,
      },
    );
  }

  private evaluateAttributes(
    payload: SandboxPayload,
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.attributes);
    const reasonCodes: string[] = [];
    let score = 100;
    const categoryId = this.number(payload.descriptionCategoryId);
    const attributes = Array.isArray(payload.attributes)
      ? payload.attributes
      : [];

    if (!categoryId || !Number.isInteger(categoryId) || categoryId <= 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CATEGORY_REQUIRED',
          'CATEGORY',
          'BLOCKED',
          true,
          'A valid Ozon description category is required.',
          { field: 'payload.descriptionCategoryId' },
        ),
      );
      score = 0;
    }
    if (attributes.length === 0) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'ATTRIBUTES_REQUIRED',
          'CATEGORY',
          'BLOCKED',
          true,
          'Required Ozon category attributes are missing.',
          { attributeCount: 0 },
        ),
      );
      score = 0;
    }
    if (
      this.string(evidence.compilerStatus).toUpperCase() !== 'VALID' ||
      evidence.requiredFieldsComplete !== true
    ) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'ATTRIBUTE_VALIDATION_REQUIRED',
          'CATEGORY',
          'BLOCKED',
          true,
          'Compiler evidence does not prove all required category fields are complete.',
          {
            compilerStatus: evidence.compilerStatus ?? null,
            requiredFieldsComplete: evidence.requiredFieldsComplete === true,
          },
        ),
      );
      score = 0;
    }

    return this.dimension(
      'ATTRIBUTE_COMPLETENESS',
      score,
      Object.keys(evidence).length > 0 ? 'VERIFIED' : 'MISSING',
      reasonCodes,
      { ...evidence, attributeCount: attributes.length, categoryId },
    );
  }

  private evaluateChannel(
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.channel);
    const reasonCodes: string[] = [];
    let score = 100;
    const syncStatus = this.string(evidence.syncStatus).toUpperCase();
    const sampleSize = this.nonNegativeNumber(evidence.recentSubmissionCount);
    const failureCount = this.nonNegativeNumber(evidence.recentFailureCount);

    if (syncStatus !== 'SUCCESS') {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CHANNEL_NOT_HEALTHY',
          'CHANNEL',
          'BLOCKED',
          true,
          'The Ozon channel is not in a healthy synchronized state.',
          { syncStatus: syncStatus || null },
        ),
      );
      score = 0;
    }
    if (sampleSize === null || failureCount === null) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'CHANNEL_HISTORY_MISSING',
          'CHANNEL',
          'MEDIUM',
          false,
          'Recent external submission reliability evidence is missing.',
          { sampleSize, failureCount },
        ),
      );
      score = Math.min(score, 75);
    } else if (sampleSize > 0) {
      const failureRate = Math.min(1, failureCount / sampleSize);
      if (sampleSize >= 2 && failureRate >= 0.5) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'CHANNEL_FAILURE_RATE_HIGH',
            'CHANNEL',
            'HIGH',
            true,
            'At least half of recent external submissions failed or remain unresolved.',
            { sampleSize, failureCount, failureRate },
          ),
        );
        score = Math.min(score, 40);
      } else if (sampleSize >= 4 && failureRate >= 0.25) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'CHANNEL_FAILURE_RATE_REVIEW',
            'CHANNEL',
            'MEDIUM',
            false,
            'Recent external submission reliability requires human review.',
            { sampleSize, failureCount, failureRate },
          ),
        );
        score = Math.min(score, 75);
      } else {
        score = Math.min(score, this.clamp(100 - failureRate * 100));
      }
    }

    return this.dimension(
      'CHANNEL_RISK',
      score,
      Object.keys(evidence).length > 0 ? 'VERIFIED' : 'MISSING',
      reasonCodes,
      evidence,
    );
  }

  private evaluateApproval(
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.approval);
    const reasonCodes: string[] = [];
    let score = 100;
    const approvalComplete =
      this.string(evidence.reviewStatus).toUpperCase() === 'APPROVED' &&
      this.string(evidence.decisionType) === 'listing-approval/v2' &&
      evidence.approvalHashMatches === true &&
      this.string(evidence.approvedBy).length > 0 &&
      this.validIsoDate(evidence.approvedAt);
    if (!approvalComplete) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'APPROVAL_EVIDENCE_INCOMPLETE',
          'APPROVAL',
          'BLOCKED',
          true,
          'Immutable human approval evidence is incomplete or inconsistent.',
          {
            reviewStatus: evidence.reviewStatus ?? null,
            decisionType: evidence.decisionType ?? null,
            approvalHashMatches: evidence.approvalHashMatches === true,
            approvedByPresent: this.string(evidence.approvedBy).length > 0,
            approvedAtValid: this.validIsoDate(evidence.approvedAt),
          },
        ),
      );
      score = 0;
    }
    if (
      evidence.executionGrantRequired !== true ||
      this.string(evidence.capabilityScope) !== EXACT_PUBLISH_CAPABILITY
    ) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'APPROVAL_EXECUTION_GRANT_REQUIRED',
          'APPROVAL',
          'BLOCKED',
          true,
          'The immutable approval must require a one-time grant with the exact publish capability.',
          {
            executionGrantRequired: evidence.executionGrantRequired === true,
            capabilityScope: evidence.capabilityScope ?? null,
            requiredCapabilityScope: EXACT_PUBLISH_CAPABILITY,
          },
        ),
      );
      score = 0;
    }

    return this.dimension(
      'APPROVAL_COMPLETENESS',
      score,
      Object.keys(evidence).length > 0 ? 'VERIFIED' : 'MISSING',
      reasonCodes,
      evidence,
    );
  }

  private evaluateExternalResponse(
    safety: Record<string, unknown>,
    hits: ListingSandboxRuleHit[],
  ): PublicationSafetyDimension {
    const evidence = this.record(safety.externalResponse);
    const reasonCodes: string[] = [];
    const phase = this.string(evidence.phase).toUpperCase();
    let score = 100;

    if (evidence.duplicateSubmission === true) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'DUPLICATE_SUBMISSION',
          'EXTERNAL_RESPONSE',
          'BLOCKED',
          true,
          'A submission already exists for this immutable snapshot.',
          { duplicateSubmission: true },
        ),
      );
      score = 0;
    }
    if (evidence.severeWarning === true) {
      this.addReason(
        hits,
        reasonCodes,
        this.hit(
          'EXTERNAL_WARNING_SEVERE',
          'EXTERNAL_RESPONSE',
          'BLOCKED',
          true,
          'The external platform returned a severe warning.',
          { warningCode: evidence.warningCode ?? null },
        ),
      );
      score = 0;
    }
    const trustScore = this.number(evidence.trustScore);
    if (phase === 'POST_DISPATCH') {
      if (trustScore === null || trustScore < 60) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'EXTERNAL_RESPONSE_UNTRUSTED',
            'EXTERNAL_RESPONSE',
            'BLOCKED',
            true,
            'External response trust is missing or below the recovery threshold.',
            { trustScore },
          ),
        );
        score = Math.min(score, trustScore ?? 0);
      } else if (trustScore < 85) {
        this.addReason(
          hits,
          reasonCodes,
          this.hit(
            'EXTERNAL_RESPONSE_REVIEW',
            'EXTERNAL_RESPONSE',
            'MEDIUM',
            false,
            'External response trust requires reconciliation.',
            { trustScore },
          ),
        );
        score = Math.min(score, trustScore);
      } else {
        score = Math.min(score, trustScore);
      }
    }

    return this.dimension(
      'EXTERNAL_RESPONSE_TRUST',
      score,
      phase === 'PRE_DISPATCH'
        ? 'NOT_APPLICABLE'
        : Object.keys(evidence).length > 0
          ? 'VERIFIED'
          : 'MISSING',
      reasonCodes,
      evidence,
    );
  }

  private dimension(
    key: PublicationSafetyDimensionKey,
    score: number,
    evidenceStatus: PublicationEvidenceStatus,
    reasonCodes: string[],
    evidence: Record<string, unknown>,
  ): PublicationSafetyDimension {
    return {
      key,
      score: this.roundScore(this.clamp(score)),
      weight: DIMENSION_WEIGHTS[key],
      evidenceStatus,
      reasonCodes: [...new Set(reasonCodes)],
      evidence,
    };
  }

  private addReason(
    hits: ListingSandboxRuleHit[],
    reasonCodes: string[],
    hit: ListingSandboxRuleHit,
  ) {
    this.pushUnique(hits, hit);
    if (!reasonCodes.includes(hit.code)) reasonCodes.push(hit.code);
  }

  private pushUnique(
    hits: ListingSandboxRuleHit[],
    hit: ListingSandboxRuleHit,
  ) {
    if (!hits.some((existing) => existing.code === hit.code)) hits.push(hit);
  }

  private hit(
    code: string,
    category: ListingSandboxRuleCategory,
    severity: Exclude<ListingSandboxRiskLevel, 'LOW'>,
    blocking: boolean,
    message: string,
    evidence: Record<string, unknown>,
  ): ListingSandboxRuleHit {
    return { code, category, severity, blocking, message, evidence };
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private number(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private positiveNumber(value: unknown): number | null {
    const parsed = this.number(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  private nonNegativeNumber(value: unknown): number | null {
    const parsed = this.number(value);
    return parsed !== null && parsed >= 0 ? parsed : null;
  }

  private rate(value: unknown): number | null {
    const parsed = this.nonNegativeNumber(value);
    return parsed !== null && parsed <= 1 ? parsed : null;
  }

  private normalizedMarginRate(value: unknown): number | null {
    const parsed = this.nonNegativeNumber(value);
    if (parsed === null) return null;
    const normalized = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
    return normalized <= 1 ? normalized : null;
  }

  private validIsoDate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim().length === 0) return false;
    return Number.isFinite(Date.parse(value));
  }

  private clamp(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  private roundScore(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
