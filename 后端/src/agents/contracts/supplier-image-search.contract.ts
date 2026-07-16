import { z } from 'zod';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const safeIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
const credentialQueryKey =
  /(?:access[_-]?token|api[_-]?key|authorization|credential|password|secret|signature)/i;

const httpsUrlSchema = z
  .string()
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ![...url.searchParams.keys()].some((key) => credentialQueryKey.test(key))
    );
  }, 'URL must use HTTPS without embedded credentials');

const optionalContextTextSchema = z.string().trim().min(1).max(256).optional();

export const supplierImageSearchCallContextSchema = z
  .object({
    orgId: z.string().trim().min(1).max(256),
    requestId: requestIdSchema,
    userId: optionalContextTextSchema,
    workspaceId: optionalContextTextSchema,
    agentRunId: optionalContextTextSchema,
    locale: optionalContextTextSchema,
    traceId: z
      .string()
      .regex(/^[a-f0-9]{32}$/i)
      .optional(),
    traceparent: z
      .string()
      .regex(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/i)
      .optional(),
  })
  .strict();

const imageKeywordsSchema = z.string().trim().min(1).max(200).optional();
const imageBase64Schema = z
  .string()
  .trim()
  .min(1)
  .max(4 * Math.ceil(MAX_IMAGE_BYTES / 3) + 64);

export const supplierImageSearchInputSchema = z.union([
  z
    .object({
      imageUrl: httpsUrlSchema,
      imageBase64: z.never().optional(),
      imageKeywords: imageKeywordsSchema,
    })
    .strict(),
  z
    .object({
      imageUrl: z.never().optional(),
      imageBase64: imageBase64Schema,
      imageKeywords: imageKeywordsSchema,
    })
    .strict(),
]);

const displayValueSchema = z.string().min(1).max(128).nullable();
const displayPriceEvidenceSchema = z
  .object({
    price: displayValueSchema,
    consignPrice: displayValueSchema,
    multipleConsignPrice: displayValueSchema,
    evidenceUse: z.literal('DISPLAY_ONLY'),
    verifiedProcurementCost: z.literal(false),
  })
  .strict();

const supplierImageOfferSchema = z
  .object({
    offerId: z.string().regex(/^[0-9]{1,32}$/),
    subject: z.string().trim().min(1).max(1000).nullable(),
    detailUrl: httpsUrlSchema.nullable(),
    imageUrl: httpsUrlSchema.nullable(),
    distributionFreePostage: z.boolean().nullable(),
    displayPriceEvidence: displayPriceEvidenceSchema,
  })
  .strict();

const imageEvidenceSchema = z
  .object({
    canonicalizationVersion: z.literal('supplier-image-search-payload/v2'),
    sourceOriginalSha256: sha256Schema,
    sourceCanonicalSha256: sha256Schema,
    decodedSizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
    payloadMimeType: z.literal('image/png'),
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    retrievalHashAlgorithm: z.literal('DHASH64'),
    retrievalHash: z.string().regex(/^[a-f0-9]{16}$/),
    retrievalOnly: z.literal(true),
  })
  .strict();

const provenanceSchema = z
  .object({
    adapterVersion: z.literal('supplier-image-search-adapter/v1'),
    provider: safeIdentifierSchema,
    requestId: requestIdSchema,
    fetchedAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => value.endsWith('Z'), 'fetchedAt must be UTC'),
    rawSnapshotSha256: sha256Schema,
  })
  .strict();

export const supplierImageSearchResultSchema = z
  .object({
    outcome: z.enum(['MATCHES', 'NO_RESULTS']),
    providerResultCount: z.number().int().min(0).max(500),
    offers: z.array(supplierImageOfferSchema).max(50),
    imageEvidence: imageEvidenceSchema,
    provenance: provenanceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.outcome === 'MATCHES' &&
      (value.providerResultCount < 1 || value.offers.length < 1)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'MATCHES requires provider results and at least one offer',
      });
    }
    if (
      value.outcome === 'NO_RESULTS' &&
      (value.providerResultCount !== 0 || value.offers.length !== 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'NO_RESULTS requires zero provider results and no offers',
      });
    }
    if (value.providerResultCount < value.offers.length) {
      context.addIssue({
        code: 'custom',
        path: ['providerResultCount'],
        message: 'Provider result count cannot be below returned offer count',
      });
    }
  });
