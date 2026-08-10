import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const isoDateSchema = z.string().datetime({ offset: true });
const decimalSchema = z
  .string()
  .regex(/^\d{1,14}(?:\.\d{1,4})?$/)
  .refine((value) => Number(value) > 0, 'Amount must be positive');
const quantitySchema = z.number().int().positive().max(1_000_000);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const unitRateSchema = z
  .string()
  .regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/);
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search
    );
  }, {
    message:
      'Supplier evidence URLs must use HTTPS without credentials or query parameters',
  });
const evidenceGroupKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{1,63}:[a-f0-9]{64}$/);

const imageDiscoverySchema = z
  .object({
    method: z.literal('IMAGE_SEARCH'),
    searchRequestId: z.string().trim().min(3).max(160),
    canonicalizationVersion: z.string().trim().min(3).max(100),
    sourceOriginalSha256: sha256Schema,
    sourceCanonicalSha256: sha256Schema,
    offerCanonicalSha256: sha256Schema,
    resultRank: quantitySchema,
  })
  .strict();

const keywordDiscoverySchema = z
  .object({
    method: z.literal('KEYWORD_SEARCH'),
    keyword: z.string().trim().min(1).max(300),
    fallbackFromImageSearchRequestId: z.string().trim().min(3).max(160),
    fallbackReason: z.enum([
      'SOURCE_IMAGE_MISSING',
      'IMAGE_SEARCH_UNSUPPORTED',
      'IMAGE_SEARCH_NO_RESULTS',
    ]),
  })
  .strict();

const exactPriceSchema = z
  .object({
    kind: z.literal('EXACT'),
    unitAmount: decimalSchema,
    totalAmount: decimalSchema,
    currency: currencySchema,
    selectedTierMinimumQuantity: quantitySchema,
    selectedTierMaximumQuantity: quantitySchema.nullable(),
    taxBasis: z.enum(['INCLUDED', 'EXCLUDED', 'UNKNOWN']),
  })
  .strict()
  .refine(
    (value) =>
      value.selectedTierMaximumQuantity === null ||
      value.selectedTierMaximumQuantity >= value.selectedTierMinimumQuantity,
    { message: 'Selected tier maximum must not be below its minimum' },
  );

const displayRangePriceSchema = z
  .object({
    kind: z.literal('DISPLAY_RANGE'),
    minimumAmount: decimalSchema,
    maximumAmount: decimalSchema,
    currency: currencySchema,
  })
  .strict()
  .refine(
    (value) => Number(value.maximumAmount) >= Number(value.minimumAmount),
    { message: 'Display price maximum must not be below its minimum' },
  );

export const supplierQuoteEvidenceSchema = z
  .object({
    schemaVersion: z.literal('supplier-quote/v1'),
    evidenceGroupKey: evidenceGroupKeySchema,
    adapterVersion: z.string().trim().min(3).max(100),
    requestId: z.string().trim().min(3).max(160),
    rawSnapshotSha256: sha256Schema,
    source: z
      .object({
        platform: z.literal('1688'),
        provider: z.string().trim().min(1).max(100),
        fetchedAt: isoDateSchema,
      })
      .strict(),
    discovery: z.discriminatedUnion('method', [
      imageDiscoverySchema,
      keywordDiscoverySchema,
    ]),
    match: z
      .object({
        status: z.enum(['MATCHED', 'NEEDS_REVIEW', 'REJECTED', 'UNMATCHED']),
        policyVersion: z.string().trim().min(3).max(100),
        method: z.literal('CANONICAL_IMAGE_AND_VARIANT_ATTRIBUTES'),
        reviewedAt: isoDateSchema,
        similarity: z
          .object({
            algorithm: z.enum(['EMBEDDING_COSINE', 'SSIM']),
            score: unitRateSchema,
            threshold: unitRateSchema,
            calibrationVersion: z.string().trim().min(3).max(100),
          })
          .strict(),
        attributeCoverageRate: unitRateSchema,
        attributeConflicts: z
          .array(
            z
              .object({
                attribute: z.string().trim().min(1).max(100),
                expected: z.string().trim().max(300),
                actual: z.string().trim().max(300),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    offer: z
      .object({
        quoteRequestId: z.string().trim().min(3).max(160),
        offerId: z.string().trim().min(1).max(200),
        offerUrl: httpsUrlSchema,
        variantId: z.string().trim().min(1).max(200),
        variantAttributes: z.record(
          z.string().trim().min(1).max(100),
          z.string().trim().max(300),
        ),
        quantity: quantitySchema,
        minimumOrderQuantity: quantitySchema,
        unitOfMeasure: z.enum(['PIECE', 'SET', 'PACK']),
        unitsPerPack: quantitySchema,
        price: z.discriminatedUnion('kind', [
          exactPriceSchema,
          displayRangePriceSchema,
        ]),
      })
      .strict(),
    shipping: z
      .object({
        quoteId: z.string().trim().min(3).max(200),
        offerId: z.string().trim().min(1).max(200),
        variantId: z.string().trim().min(1).max(200),
        scope: z.enum([
          'DOMESTIC_ONLY',
          'CROSS_BORDER_ONLY',
          'LANDED',
          'LANDED_RU',
        ]),
        destinationCountry: z.string().regex(/^[A-Z]{2}$/),
        destinationPostalCode: z.string().trim().min(3).max(32),
        quantity: quantitySchema,
        packageQuantity: quantitySchema,
        totalWeightKg: decimalSchema,
        incoterm: z.enum(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']),
        includesInternationalFreight: z.boolean(),
        includesImportDuty: z.boolean(),
        includesVat: z.boolean(),
        includesCustomsClearance: z.boolean(),
        includesDestinationDelivery: z.boolean(),
        amountPerUnit: decimalSchema,
        totalAmount: decimalSchema,
        currency: currencySchema,
        evidenceUrl: httpsUrlSchema,
      })
      .strict(),
    verification: z
      .object({
        status: z.enum(['VERIFIED', 'UNVERIFIED']),
        verifiedAt: isoDateSchema,
        validUntil: isoDateSchema,
      })
      .strict(),
  })
  .strict();

export type SupplierQuoteEvidence = z.infer<
  typeof supplierQuoteEvidenceSchema
>;

export const expectedSupplierPurchaseSchema = z
  .object({
    evidenceGroupKey: evidenceGroupKeySchema,
    provider: z.string().trim().min(1).max(100),
    adapterVersion: z.string().trim().min(3).max(100),
    imageSearchRequestId: z.string().trim().min(3).max(160),
    quoteRequestId: z.string().trim().min(3).max(160),
    offerId: z.string().trim().min(1).max(200),
    variantId: z.string().trim().min(1).max(200),
    variantAttributes: z.record(
      z.string().trim().min(1).max(100),
      z.string().trim().max(300),
    ),
    quantity: quantitySchema,
    sourceOriginalSha256: sha256Schema,
    sourceCanonicalSha256: sha256Schema,
    offerCanonicalSha256: sha256Schema,
    destinationCountry: z.string().regex(/^[A-Z]{2}$/),
    destinationPostalCode: z.string().trim().min(3).max(32),
    currency: currencySchema,
    unitOfMeasure: z.enum(['PIECE', 'SET', 'PACK']),
    unitsPerPack: quantitySchema,
    allowedEvidenceHosts: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/),
      )
      .min(1)
      .max(20),
    maxEvidenceAgeSeconds: z.number().int().min(60).max(86_400).optional(),
    maxQuoteTtlSeconds: z.number().int().min(60).max(86_400).optional(),
    clockSkewSeconds: z.number().int().min(0).max(300).optional(),
  })
  .strict();

export type ExpectedSupplierPurchase = z.infer<
  typeof expectedSupplierPurchaseSchema
>;
