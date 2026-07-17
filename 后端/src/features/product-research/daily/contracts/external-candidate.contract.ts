import { z } from 'zod';
import { signalQualitySchema } from './daily-product-research.contract.js';

const isoDateSchema = z.string().datetime({ offset: true });
const safeUrlSchema = z
  .string()
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Only http and https evidence URLs are allowed',
  });
const unitRateSchema = z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/);
const sourcingQueryZhSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{Script=Han}0-9\s-]+$/u);
const semanticConceptKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u);

export function canonical1688OfferId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'detail.1688.com' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return null;
    }
    const match = /^\/offer\/([1-9]\d{0,31})\.html$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export const externalCandidateSignalSchema = z.object({
  metricName: z.string().trim().min(1).max(100),
  metricValue: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .nullable(),
  unit: z.string().trim().max(50).nullable().optional(),
  observedAt: isoDateSchema,
  fetchedAt: isoDateSchema,
  quality: signalQualitySchema,
});

export const externalCandidateCostSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    amount: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    required: z.boolean().default(true),
  })
  .strict();

export const externalCandidateRiskSchema = z.object({
  riskType: z.string().trim().min(1).max(100),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']),
  ruleVersion: z.string().trim().min(1).max(100),
  matchedTerm: z.string().trim().max(200).nullable().optional(),
  evidence: z.string().trim().min(1).max(2000),
});

const externalComponentEvidenceSchema = z.object({
  score: z.number().min(0).max(100),
  method: z.string().trim().min(3).max(200),
  observedAt: isoDateSchema,
  evidenceUrl: safeUrlSchema,
  quality: z.enum(['VERIFIED', 'ESTIMATED', 'MANUAL']),
});

export const externalCandidateSchema = z
  .object({
    source: z.string().trim().min(1).max(80),
    provider: z.string().trim().min(1).max(120),
    conceptKey: semanticConceptKeySchema.nullable().optional(),
    evidenceGroupKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,63}:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    externalId: z.string().trim().max(200).nullable().optional(),
    url: safeUrlSchema.nullable().optional(),
    imageUrl: safeUrlSchema.nullable().optional(),
    imageEvidenceUrl: safeUrlSchema.nullable().optional(),
    evidenceTitle: z.string().trim().max(500).nullable().optional(),
    evidenceSnippet: z.string().trim().max(2000).nullable().optional(),
    evidenceQuery: z.string().trim().max(500).nullable().optional(),
    evidenceScope: z.string().trim().max(1000).nullable().optional(),
    sourcingQueryZh: sourcingQueryZhSchema.nullable().optional(),
    market: z.string().trim().max(50).nullable().optional(),
    name: z.string().trim().min(1).max(300),
    productType: z.string().trim().min(1).max(160),
    material: z.string().trim().max(160).nullable().optional(),
    primaryUse: z.string().trim().max(200).nullable().optional(),
    customizationMethod: z.string().trim().max(200).nullable().optional(),
    targetAudience: z.string().trim().max(200).nullable().optional(),
    salePrice: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable()
      .optional(),
    currency: z.string().trim().min(3).max(8).nullable().optional(),
    // Discovery connectors are untrusted evidence sources and may never inject
    // procurement costs. Verified supplier quotes use their own append-only
    // contract and persistence path.
    costs: z.array(externalCandidateCostSchema).length(0).default([]),
    // Discovery rows must state unknown rates as null. These values never unlock
    // economics; only append-only trusted evidence can do that.
    platformFeeRate: unitRateSchema.nullable(),
    paymentFeeRate: unitRateSchema.nullable(),
    adRate: unitRateSchema.nullable(),
    refundRate: unitRateSchema.nullable(),
    signals: z.array(externalCandidateSignalSchema).max(100),
    risks: z.array(externalCandidateRiskSchema).max(50).default([]),
    componentEvidence: z
      .object({
        customization: externalComponentEvidenceSchema.optional(),
        visual: externalComponentEvidenceSchema.optional(),
        feasibility: externalComponentEvidenceSchema.optional(),
        lifecycle: externalComponentEvidenceSchema.optional(),
      })
      .optional(),
  })
  .superRefine((candidate, context) => {
    if (candidate.source !== '1688_public_sourcing_lead') return;
    const offerId = canonical1688OfferId(candidate.url);
    const canonicalUrl = offerId
      ? `https://detail.1688.com/offer/${offerId}.html`
      : null;
    if (!offerId || candidate.url !== canonicalUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: '1688 sourcing leads require a canonical HTTPS offer URL',
      });
    }
    if (!offerId || candidate.externalId !== offerId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['externalId'],
        message: '1688 sourcing lead externalId must equal the offer id',
      });
    }
    if (candidate.market !== 'CN') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['market'],
        message: '1688 sourcing leads must use the CN market',
      });
    }
    for (const field of [
      'salePrice',
      'currency',
      'platformFeeRate',
      'paymentFeeRate',
      'adRate',
      'refundRate',
    ] as const) {
      if (candidate[field] !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: '1688 public sourcing leads may not provide economics',
        });
      }
    }
    if (candidate.signals.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signals'],
        message: '1688 public sourcing leads may not provide price signals',
      });
    }
  });

export const externalCandidateListSchema = z
  .array(externalCandidateSchema)
  .max(300);

export type ExternalCandidate = z.infer<typeof externalCandidateSchema>;
