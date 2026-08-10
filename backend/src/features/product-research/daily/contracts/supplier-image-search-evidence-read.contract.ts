import { z } from 'zod';
import { supplierImageSearchHttpsUrlSchema } from './supplier-image-search-evidence.contract.js';

export const SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION =
  'supplier-image-search-evidence-read/v1' as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const httpsUrlSchema = supplierImageSearchHttpsUrlSchema.nullable();

export const supplierImageSearchDisplayPriceReadSchema = z
  .object({
    price: z.string().trim().min(1).max(128).nullable(),
    consignPrice: z.string().trim().min(1).max(128).nullable(),
    multipleConsignPrice: z.string().trim().min(1).max(128).nullable(),
    evidenceUse: z.literal('DISPLAY_ONLY'),
    verifiedProcurementCost: z.literal(false),
  })
  .strict();

export const supplierImageSearchOfferReadSchema = z
  .object({
    offerId: z.string().regex(/^\d{1,32}$/),
    subject: z.string().min(1).max(1000).nullable(),
    detailUrl: httpsUrlSchema,
    imageUrl: httpsUrlSchema,
    distributionFreePostage: z.boolean().nullable(),
    displayPriceEvidence: supplierImageSearchDisplayPriceReadSchema,
  })
  .strict();

const supplierImageSearchCanonicalImageReadSchema = z
  .object({
    rawSnapshotSha256: sha256Schema,
    canonicalizationVersion: z.string().trim().min(3).max(100),
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
  .strict();

export const supplierImageSearchEvidenceReadItemSchema = z
  .object({
    evidenceId: z.string().trim().min(1).max(191),
    sourceSchemaVersion: z.literal('supplier-image-search/v1'),
    outcome: z.enum(['MATCHES', 'NO_RESULTS']),
    provider: z.string().trim().min(1).max(100),
    adapterVersion: z.string().trim().min(3).max(100),
    requestId: z.string().trim().min(3).max(160),
    fetchedAt: z.string().datetime({ offset: true }),
    providerResultCount: z.number().int().min(0).max(500),
    image: supplierImageSearchCanonicalImageReadSchema,
    contentCanonicalizerVersion: z.string().trim().min(3).max(100),
    contentHash: sha256Schema,
    offers: z.array(supplierImageSearchOfferReadSchema).max(50),
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
        message: 'MATCHES requires result evidence',
      });
    }
    if (
      value.outcome === 'NO_RESULTS' &&
      (value.providerResultCount !== 0 || value.offers.length !== 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'NO_RESULTS requires a persisted zero-result observation',
      });
    }
    if (value.providerResultCount < value.offers.length) {
      context.addIssue({
        code: 'custom',
        path: ['providerResultCount'],
        message: 'Provider result count is below the returned offer count',
      });
    }
  });

export const supplierImageSearchEvidenceReadResponseSchema = z
  .object({
    schemaVersion: z.literal(
      SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
    ),
    candidateId: z.string().trim().min(1).max(191),
    limit: z.number().int().min(1).max(50),
    items: z.array(supplierImageSearchEvidenceReadItemSchema).max(50),
  })
  .strict();

export type SupplierImageSearchEvidenceReadResponse = z.infer<
  typeof supplierImageSearchEvidenceReadResponseSchema
>;
