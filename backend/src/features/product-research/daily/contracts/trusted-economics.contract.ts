import { z } from 'zod';

export const CANDIDATE_ECONOMICS_EVIDENCE_SCHEMA_VERSION =
  'candidate-economics-evidence/v1' as const;
export const CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION =
  'candidate-economics-evaluation/v1' as const;
export const CANDIDATE_ECONOMICS_POLICY_VERSION =
  'candidate-economics-policy/v1' as const;
export const CANDIDATE_ECONOMICS_CALCULATOR_VERSION =
  'candidate-economics-calculator/v1' as const;

export const candidateEconomicsEvidenceKindSchema = z.enum([
  'SALE_PRICE',
  'DOMESTIC_TRANSPORT',
  'PACKAGING',
  'OZON_COMMISSION',
  'OZON_PAYMENT',
  'OZON_FULFILLMENT',
  'OZON_STORAGE',
  'ADVERTISING',
  'REFUND_LOSS',
  'TAX',
  'FX_RATE',
  'FX_VOLATILITY_RESERVE',
]);

export const candidateEconomicsValueKindSchema = z.enum([
  'MONEY',
  'RATE',
  'RATE_WITH_MINIMUM',
  'FX',
]);

const decimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((value) => Number.isFinite(Number(value)));
const positiveDecimalSchema = decimalSchema.refine(
  (value) => Number(value) > 0,
);
const rateSchema = decimalSchema.refine((value) => Number(value) <= 1);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const candidateEconomicsBindingSchema = z
  .object({
    candidateFingerprint: z.string().trim().min(1).max(256),
    marketplace: z.literal('OZON'),
    targetCurrency: currencySchema,
    fulfillmentMode: z.enum(['FBO', 'FBS', 'RFBS', 'ANY']).optional(),
    ozonCategoryId: z.string().trim().min(1).max(128).optional(),
    offerId: z.string().trim().min(1).max(256).optional(),
    warehouseId: z.string().trim().min(1).max(256).optional(),
    dimensionsHash: hashSchema.optional(),
    sourceWindowStart: z.string().datetime({ offset: true }).optional(),
    sourceWindowEnd: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.sourceWindowStart &&
      value.sourceWindowEnd &&
      Date.parse(value.sourceWindowEnd) <= Date.parse(value.sourceWindowStart)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceWindowEnd'],
        message: 'sourceWindowEnd must be after sourceWindowStart',
      });
    }
  });

export const appendCandidateEconomicsEvidenceSchema = z
  .object({
    schemaVersion: z.literal(CANDIDATE_ECONOMICS_EVIDENCE_SCHEMA_VERSION),
    organizationId: z.string().min(1).max(128),
    workspaceId: z.string().min(1).max(128).nullable(),
    researchRunId: z.string().min(1).max(128),
    candidateId: z.string().min(1).max(128),
    kind: candidateEconomicsEvidenceKindSchema,
    valueKind: candidateEconomicsValueKindSchema,
    amount: decimalSchema.nullable(),
    rate: rateSchema.nullable(),
    minimumAmount: decimalSchema.nullable(),
    currency: currencySchema.nullable(),
    baseCurrency: currencySchema.nullable(),
    quoteCurrency: currencySchema.nullable(),
    quantity: positiveDecimalSchema.nullable(),
    unit: z.string().trim().min(1).max(64).nullable(),
    provider: z.string().trim().min(1).max(120),
    adapterVersion: z.string().trim().min(1).max(120),
    requestId: z.string().trim().min(1).max(256),
    verificationMethod: z.string().trim().min(1).max(120),
    verificationStatus: z.literal('VERIFIED'),
    binding: candidateEconomicsBindingSchema,
    normalizedEvidence: z.record(z.string(), z.unknown()),
    rawSnapshotSha256: hashSchema,
    rawSnapshotRef: z.string().trim().min(1).max(1024),
    observedAt: z.string().datetime({ offset: true }),
    fetchedAt: z.string().datetime({ offset: true }),
    verifiedAt: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const requireField = (field: keyof typeof value, present: boolean) => {
      if (!present) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for ${value.valueKind}`,
        });
      }
    };
    if (value.valueKind === 'MONEY') {
      requireField('amount', value.amount !== null);
      requireField('currency', value.currency !== null);
    }
    if (value.valueKind === 'RATE') {
      requireField('rate', value.rate !== null);
    }
    if (value.valueKind === 'RATE_WITH_MINIMUM') {
      requireField('rate', value.rate !== null);
      requireField('minimumAmount', value.minimumAmount !== null);
      requireField('currency', value.currency !== null);
    }
    if (value.valueKind === 'FX') {
      requireField('rate', value.rate !== null && Number(value.rate) > 0);
      requireField('baseCurrency', value.baseCurrency !== null);
      requireField('quoteCurrency', value.quoteCurrency !== null);
      if (
        value.baseCurrency !== null &&
        value.quoteCurrency !== null &&
        value.baseCurrency === value.quoteCurrency
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quoteCurrency'],
          message: 'FX currencies must differ',
        });
      }
    }
    const observedAt = Date.parse(value.observedAt);
    const fetchedAt = Date.parse(value.fetchedAt);
    const verifiedAt = Date.parse(value.verifiedAt);
    const validUntil = Date.parse(value.validUntil);
    if (
      fetchedAt < observedAt ||
      verifiedAt < observedAt ||
      validUntil <= verifiedAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message:
          'Evidence time chain must satisfy observedAt <= fetchedAt/verifiedAt < validUntil',
      });
    }
  });

export type AppendCandidateEconomicsEvidenceInput = z.infer<
  typeof appendCandidateEconomicsEvidenceSchema
>;

export const candidateEconomicsPolicySchema = z
  .object({
    minimumGrossMarginBeforeAds: rateSchema,
    minimumNetMarginAfterAds: rateSchema,
    maxEvidenceAgeSeconds: z
      .number()
      .int()
      .positive()
      .max(31 * 24 * 60 * 60),
    dispatchFreshnessBufferSeconds: z
      .number()
      .int()
      .min(60)
      .max(24 * 60 * 60),
  })
  .strict();

export type CandidateEconomicsPolicy = z.infer<
  typeof candidateEconomicsPolicySchema
>;

export const DEFAULT_CANDIDATE_ECONOMICS_POLICY: CandidateEconomicsPolicy =
  Object.freeze({
    minimumGrossMarginBeforeAds: '0.5000',
    minimumNetMarginAfterAds: '0.1800',
    maxEvidenceAgeSeconds: 24 * 60 * 60,
    dispatchFreshnessBufferSeconds: 15 * 60,
  });
