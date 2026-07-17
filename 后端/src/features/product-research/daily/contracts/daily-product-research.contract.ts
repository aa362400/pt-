import { z } from 'zod';

export const DAILY_RESEARCH_SCHEMA_VERSION =
  'daily-product-research/v1' as const;

export const RESEARCH_PRICING_MODES = ['AUTO', 'MANUAL'] as const;
export const researchPricingModeSchema = z.enum(RESEARCH_PRICING_MODES);
export type ResearchPricingMode = z.infer<typeof researchPricingModeSchema>;

export const researchRunStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'PARTIAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'PAUSED',
  'STOPPED',
]);

export const researchStageSchema = z.enum([
  'COLLECT',
  'NORMALIZE',
  'KEYWORDS',
  'DEMAND',
  'COMPETITION',
  'PROFIT',
  'RISK',
  'SCORE',
  'REPORT',
  'FEEDBACK',
]);

export const researchStageStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'SKIPPED',
]);

export const signalQualitySchema = z.enum([
  'VERIFIED',
  'ESTIMATED',
  'MANUAL',
  'UNKNOWN',
]);

export const signalStrengthSchema = z.enum([
  'STRONG',
  'MEDIUM',
  'WEAK',
  'INVALID',
]);

export const riskSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']);

export const researchDecisionSchema = z.enum([
  'TEST_NOW',
  'WATCH',
  'HOLD',
  'REJECT',
]);

export const sourceStatusSchema = z.enum([
  'HEALTHY',
  'DEGRADED',
  'FAILED',
  'DISABLED',
  'NOT_CONFIGURED',
  'CSV_ONLY',
]);

export const dailyResearchQueuePayloadSchema = z.object({
  schemaVersion: z.literal(DAILY_RESEARCH_SCHEMA_VERSION),
  researchRunId: z.string().min(1).max(128),
  organizationId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128).nullable(),
  trigger: z.enum(['SCHEDULE', 'MANUAL', 'RETRY', 'BACKFILL']),
  // Optional only for queued jobs created before durable control deployment.
  controlRevision: z.number().int().nonnegative().safe().optional(),
});

export type DailyResearchQueuePayload = z.infer<
  typeof dailyResearchQueuePayloadSchema
>;

export const DEFAULT_SCORING_WEIGHTS = Object.freeze({
  demand: 20,
  growth: 12,
  competition: 16,
  profit: 16,
  customization: 12,
  visual: 8,
  feasibility: 6,
  lifecycle: 5,
  safety: 5,
});

export const DEFAULT_RESEARCH_THRESHOLDS = Object.freeze({
  testNow: 80,
  watch: 68,
  hold: 50,
  minimumGrossMarginBeforeAds: '0.4500',
  minimumNetMarginAfterAds: '0.1800',
  maximumRefundRate: '0.0800',
  maximumOzonPublicSearchResults: 2,
  candidateLimit: 10,
  topLimit: 10,
});
