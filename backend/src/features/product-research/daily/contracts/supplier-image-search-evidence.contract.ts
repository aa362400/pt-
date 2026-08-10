import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const isoDateSchema = z.string().datetime({ offset: true });
const credentialQueryKey =
  /(?:access[_-]?token|api[_-]?key|authorization|credential|password|secret|signature)/i;
const encodedQueryOctet = /%[0-9a-f]{2}/i;

export const supplierImageSearchHttpsUrlSchema = z
  .string()
  .max(4096)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      const queryHasEncodedKey = url.search
        .slice(1)
        .split('&')
        .some((parameter) =>
          encodedQueryOctet.test(parameter.split('=', 1)[0] ?? ''),
        );
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !queryHasEncodedKey &&
        ![...url.searchParams.keys()].some((key) =>
          credentialQueryKey.test(key),
        )
      );
    } catch {
      return false;
    }
  }, 'Supplier image-search URLs must use HTTPS without credentials or secret query parameters');

const displayPriceTextSchema = z.string().trim().min(1).max(128).nullable();

const displayPriceEvidenceSchema = z
  .object({
    price: displayPriceTextSchema,
    consignPrice: displayPriceTextSchema,
    multipleConsignPrice: displayPriceTextSchema,
    evidenceUse: z.literal('DISPLAY_ONLY'),
    verifiedProcurementCost: z.literal(false),
  })
  .strict();

const normalizedImageSearchOfferSchema = z
  .object({
    offerId: z.string().regex(/^\d{1,32}$/),
    subject: z.string().min(1).max(1000).nullable(),
    detailUrl: supplierImageSearchHttpsUrlSchema.nullable(),
    imageUrl: supplierImageSearchHttpsUrlSchema.nullable(),
    distributionFreePostage: z.boolean().nullable(),
    displayPriceEvidence: displayPriceEvidenceSchema,
  })
  .strict();

export const supplierImageSearchEvidenceSchema = z
  .object({
    schemaVersion: z.literal('supplier-image-search/v1'),
    provider: z.string().trim().min(1).max(100),
    adapterVersion: z.string().trim().min(3).max(100),
    requestId: z.string().trim().min(3).max(160),
    outcome: z.enum(['MATCHES', 'NO_RESULTS']),
    rawSnapshotSha256: sha256Schema,
    canonicalization: z
      .object({
        version: z.string().trim().min(3).max(100),
        sourceOriginalSha256: sha256Schema,
        sourceCanonicalSha256: sha256Schema,
        canonicalByteSize: z
          .number()
          .int()
          .positive()
          .max(3 * 1024 * 1024),
        canonicalMimeType: z.literal('image/png'),
        canonicalWidth: z.number().int().positive().max(16_384),
        canonicalHeight: z.number().int().positive().max(16_384),
        retrievalHashAlgorithm: z.literal('DHASH64'),
        retrievalHash: z.string().regex(/^[a-f0-9]{16}$/),
      })
      .strict(),
    providerResultCount: z.number().int().min(0).max(500),
    normalizedOffers: z.array(normalizedImageSearchOfferSchema).max(50),
    fetchedAt: isoDateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.outcome === 'MATCHES' &&
      (value.providerResultCount < 1 || value.normalizedOffers.length < 1)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message:
          'MATCHES requires a positive result count and at least one offer',
      });
    }
    if (
      value.outcome === 'NO_RESULTS' &&
      (value.providerResultCount !== 0 || value.normalizedOffers.length !== 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'NO_RESULTS requires zero result count and no offers',
      });
    }
    if (value.providerResultCount < value.normalizedOffers.length) {
      context.addIssue({
        code: 'custom',
        path: ['providerResultCount'],
        message:
          'Provider result count cannot be below the normalized offer count',
      });
    }
  });

export type SupplierImageSearchEvidence = z.infer<
  typeof supplierImageSearchEvidenceSchema
>;
