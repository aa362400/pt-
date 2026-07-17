import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DEFAULT_RESEARCH_THRESHOLDS,
  DEFAULT_SCORING_WEIGHTS,
} from '../contracts/daily-product-research.contract.js';

export type ScoreComponent = keyof typeof DEFAULT_SCORING_WEIGHTS;

export interface CandidateScoringInput {
  candidateId: string;
  fingerprint: string;
  componentScores: Record<ScoreComponent, number | null>;
  hardGateReasons: string[];
  confidenceScore: number;
  manualReviewEligible?: boolean;
}

export interface RankedCandidate extends CandidateScoringInput {
  rawTotal: number;
  finalScore: number;
  decision: 'TEST_NOW' | 'WATCH' | 'HOLD' | 'REJECT';
  rank: number | null;
  missingComponents: ScoreComponent[];
}

export interface ScoringThresholds {
  testNow: number;
  watch: number;
  hold: number;
}

export interface ScoringOptions {
  topLimit: number;
  weights?: Record<ScoreComponent, number>;
  thresholds?: ScoringThresholds;
}

@Injectable()
export class ScoringService {
  private readonly manualReviewGateReasons = new Set([
    'MANUAL_PRICING_REQUIRED',
    'RISK_EVIDENCE_MISSING',
    'PRODUCT_IMAGE_EVIDENCE_MISSING',
  ]);

  rank(inputs: CandidateScoringInput[], options: ScoringOptions) {
    if (
      !Number.isInteger(options.topLimit) ||
      options.topLimit < 1 ||
      options.topLimit > 100
    ) {
      throw new BadRequestException(
        'topLimit must be an integer between 1 and 100',
      );
    }

    const weights = options.weights ?? DEFAULT_SCORING_WEIGHTS;
    const thresholds = options.thresholds ?? DEFAULT_RESEARCH_THRESHOLDS;
    this.validateConfiguration(weights, thresholds);
    const scored = inputs.map((input) =>
      this.score(input, weights, thresholds),
    );
    const bestByFingerprint = new Map<string, RankedCandidate>();
    for (const item of scored) {
      const existing = bestByFingerprint.get(item.fingerprint);
      if (!existing || this.compare(item, existing) < 0)
        bestByFingerprint.set(item.fingerprint, item);
    }

    const unique = [...bestByFingerprint.values()].sort((left, right) =>
      this.compare(left, right),
    );
    const eligibleTop = unique
      .filter((item) => item.decision === 'TEST_NOW')
      .slice(0, options.topLimit)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return {
      testNow: eligibleTop,
      watch: unique.filter((item) => item.decision === 'WATCH'),
      hold: unique.filter((item) => item.decision === 'HOLD'),
      rejected: unique.filter((item) => item.decision === 'REJECT'),
    };
  }

  private score(
    input: CandidateScoringInput,
    weights: Record<ScoreComponent, number>,
    thresholds: ScoringThresholds,
  ): RankedCandidate {
    let rawTotal = 0;
    const missingComponents: ScoreComponent[] = [];
    for (const component of Object.keys(
      DEFAULT_SCORING_WEIGHTS,
    ) as ScoreComponent[]) {
      const score = input.componentScores[component];
      if (score === null || !Number.isFinite(score)) {
        if (weights[component] > 0) missingComponents.push(component);
        continue;
      }
      rawTotal +=
        Math.max(0, Math.min(100, score)) * (weights[component] / 100);
    }
    const missingPenalty = missingComponents.length * 5;
    const finalScore = Math.max(
      0,
      Math.round((rawTotal - missingPenalty) * 100) / 100,
    );
    const manualReviewOnly =
      input.manualReviewEligible === true &&
      input.hardGateReasons.length > 0 &&
      input.hardGateReasons.every((reason) =>
        this.manualReviewGateReasons.has(reason),
      );
    const decision =
      input.hardGateReasons.length > 0
        ? manualReviewOnly
          ? 'HOLD'
          : 'REJECT'
        : finalScore >= thresholds.testNow
          ? 'TEST_NOW'
          : finalScore >= thresholds.watch
            ? 'WATCH'
            : finalScore >= thresholds.hold
              ? 'HOLD'
              : 'REJECT';
    return {
      ...input,
      rawTotal,
      finalScore,
      decision,
      rank: null,
      missingComponents,
    };
  }

  private validateConfiguration(
    weights: Record<ScoreComponent, number>,
    thresholds: ScoringThresholds,
  ): void {
    const components = Object.keys(DEFAULT_SCORING_WEIGHTS) as ScoreComponent[];
    const total = components.reduce((sum, component) => {
      const value = weights[component];
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new BadRequestException(`Invalid scoring weight: ${component}`);
      }
      return sum + value;
    }, 0);
    if (Math.abs(total - 100) > 0.0001) {
      throw new BadRequestException('Scoring weights must total 100');
    }
    const { testNow, watch, hold } = thresholds;
    if (
      ![testNow, watch, hold].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 100,
      ) ||
      !(testNow >= watch && watch >= hold)
    ) {
      throw new BadRequestException(
        'Scoring thresholds must satisfy 100 >= testNow >= watch >= hold >= 0',
      );
    }
  }

  private compare(left: RankedCandidate, right: RankedCandidate): number {
    return (
      right.finalScore - left.finalScore ||
      right.confidenceScore - left.confidenceScore ||
      left.candidateId.localeCompare(right.candidateId)
    );
  }
}
