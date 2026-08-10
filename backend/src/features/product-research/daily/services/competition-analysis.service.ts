import { Injectable } from '@nestjs/common';
import type { DemandSignalInput } from './demand-analysis.service.js';

@Injectable()
export class CompetitionAnalysisService {
  analyze(signals: DemandSignalInput[]) {
    const ozonPublicSampleCounts = this.values(
      signals,
      'ozon_public_search_result_count',
    );
    const listingCounts = [
      ...this.values(signals, 'listing_count'),
      ...ozonPublicSampleCounts,
    ];
    const reviewCounts = this.values(signals, 'reviews');
    const prices = this.values(signals, 'price');
    const sourceCoverage = new Set(signals.map((signal) => signal.source)).size;
    if (listingCounts.length === 0 && reviewCounts.length === 0) {
      return {
        competitionScore: null,
        entryOpportunityScore: null,
        priceRange: prices.length
          ? {
              min: Math.min(...prices).toFixed(2),
              max: Math.max(...prices).toFixed(2),
            }
          : null,
        sourceCoverage,
        missingEvidence: ['listing_count_or_reviews'],
        claims: [],
      };
    }

    const medianListings = this.median(listingCounts);
    const medianReviews = this.median(reviewCounts);
    const listingPressure =
      medianListings === null
        ? 0
        : Math.min(100, Math.log10(medianListings + 1) * 25);
    const reviewPressure =
      medianReviews === null
        ? 0
        : Math.min(100, Math.log10(medianReviews + 1) * 30);
    const knownDimensions =
      Number(medianListings !== null) + Number(medianReviews !== null);
    const competitionScore =
      Math.round(((listingPressure + reviewPressure) / knownDimensions) * 100) /
      100;
    return {
      competitionScore,
      entryOpportunityScore: Math.max(
        0,
        Math.round((100 - competitionScore) * 100) / 100,
      ),
      priceRange: prices.length
        ? {
            min: Math.min(...prices).toFixed(2),
            max: Math.max(...prices).toFixed(2),
          }
        : null,
      sourceCoverage,
      missingEvidence: [],
      claims: [
        'Competition score is derived only from persisted listing/review signals.',
        ...(ozonPublicSampleCounts.length > 0
          ? [
              'Ozon supply is a capped public web-search sample, not a full-catalog count.',
            ]
          : []),
      ],
    };
  }

  private values(signals: DemandSignalInput[], metricName: string): number[] {
    return signals
      .filter(
        (signal) =>
          signal.metricName === metricName && signal.metricValue !== null,
      )
      .map((signal) => Number(signal.metricValue))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }

  private median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }
}
