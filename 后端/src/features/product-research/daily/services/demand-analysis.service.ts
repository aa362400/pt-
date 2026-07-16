import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  signalQualitySchema,
  type signalStrengthSchema,
} from '../contracts/daily-product-research.contract.js';

export interface DemandSignalInput {
  source: string;
  metricName: string;
  quality: z.infer<typeof signalQualitySchema>;
  metricValue: string | null;
}

export interface DemandAnalysisResult {
  signalStrength: z.infer<typeof signalStrengthSchema>;
  confidenceScore: number;
  independentPurchaseIntentSources: number;
  contentOnlySources: string[];
  evidenceSources: string[];
}

const PURCHASE_INTENT_METRICS = new Set([
  'orders',
  'sales',
  'search_volume',
  'search_growth',
  'favorites',
  'cart_adds',
  'conversion_rate',
  'reviews',
  'review_count',
]);

const CONTENT_ONLY_METRICS = new Set(['views', 'plays', 'likes', 'shares']);

@Injectable()
export class DemandAnalysisService {
  analyze(signals: DemandSignalInput[]): DemandAnalysisResult {
    const purchaseSources = new Set<string>();
    const contentSources = new Set<string>();

    for (const signal of signals) {
      if (signal.quality === 'UNKNOWN' || signal.metricValue === null) continue;
      const source = signal.source.trim().toLowerCase();
      const metricName = signal.metricName.trim().toLowerCase();
      if (PURCHASE_INTENT_METRICS.has(metricName)) purchaseSources.add(source);
      if (CONTENT_ONLY_METRICS.has(metricName)) contentSources.add(source);
    }

    const count = purchaseSources.size;
    const signalStrength =
      count >= 3
        ? 'STRONG'
        : count === 2
          ? 'MEDIUM'
          : count === 1
            ? 'WEAK'
            : 'INVALID';
    const confidenceScore = count === 0 ? 0 : Math.min(100, 25 + count * 22);

    return {
      signalStrength,
      confidenceScore,
      independentPurchaseIntentSources: count,
      contentOnlySources: [...contentSources].sort(),
      evidenceSources: [...purchaseSources].sort(),
    };
  }
}
