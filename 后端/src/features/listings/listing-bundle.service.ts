import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  ListingGenerationInput,
  ListingPricingEvidence,
} from '../../agents/agent-provider.interface.js';

export const LISTING_BUNDLE_SCHEMA_VERSION = 'listing-bundle/v1' as const;

const listingPricingEvidenceSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    status: z.literal('VERIFIED'),
    decision: z.literal('PASS'),
    salePrice: z.union([z.number().positive(), z.string().trim().min(1)]),
    currency: z.enum(['RUB', 'USD']),
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
    calculatorVersion: z.string().trim().min(1).max(256),
    inputSetHash: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const listingCommercialSchema = z
  .object({
    suggestedPrice: z.number().finite().positive().optional(),
    priceCurrency: z.enum(['RUB', 'USD']).nullable().default(null),
    pricingStatus: z
      .enum(['EVIDENCE_BACKED', 'DATA_INSUFFICIENT'])
      .default('DATA_INSUFFICIENT'),
    pricingEvidence: listingPricingEvidenceSchema.nullable().default(null),
    pricingMissingFields: z
      .array(z.string().trim().min(1))
      .max(32)
      .default(['pricingEvidence']),
  })
  .superRefine((value, context) => {
    if (value.pricingStatus === 'DATA_INSUFFICIENT') {
      if (
        value.suggestedPrice !== undefined ||
        value.priceCurrency !== null ||
        value.pricingEvidence !== null ||
        value.pricingMissingFields.length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['suggestedPrice'],
          message: 'Unverified commercial price is not allowed',
        });
      }
      return;
    }

    const evidencePrice = Number(value.pricingEvidence?.salePrice);
    if (
      value.suggestedPrice === undefined ||
      value.priceCurrency === null ||
      value.pricingEvidence === null ||
      !Number.isFinite(evidencePrice) ||
      evidencePrice !== value.suggestedPrice ||
      value.pricingEvidence.currency !== value.priceCurrency ||
      Date.parse(value.pricingEvidence.validFrom) > Date.now() ||
      Date.parse(value.pricingEvidence.validUntil) <= Date.now() ||
      value.pricingMissingFields.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['suggestedPrice'],
        message: 'Commercial price lost its verified economics binding',
      });
    }
  });

const agentListingOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1),
    bulletPoints: z.array(z.string().trim().min(1)).min(1).max(20),
    keywords: z.array(z.string().trim().min(1)).min(1).max(50),
    price: z.number().finite().positive().nullable().default(null),
    priceCurrency: z.enum(['RUB', 'USD']).nullable().default(null),
    pricingStatus: z
      .enum(['EVIDENCE_BACKED', 'DATA_INSUFFICIENT'])
      .default('DATA_INSUFFICIENT'),
    pricingEvidence: listingPricingEvidenceSchema.nullable().default(null),
    pricingMissingFields: z
      .array(z.string().trim().min(1))
      .max(32)
      .default(['pricingEvidence']),
    publishable: z.literal(false).default(false),
    requiresHumanReview: z.literal(true).default(true),
  })
  .superRefine((value, context) => {
    if (value.pricingStatus === 'DATA_INSUFFICIENT') {
      if (value.price !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['price'],
          message: 'Unverified listing price must be null',
        });
      }
      if (value.priceCurrency !== null || value.pricingEvidence !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricingEvidence'],
          message: 'DATA_INSUFFICIENT cannot carry pricing evidence',
        });
      }
      if (value.pricingMissingFields.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricingMissingFields'],
          message: 'Missing pricing inputs must be explicit',
        });
      }
      return;
    }

    const evidencePrice = Number(value.pricingEvidence?.salePrice);
    if (
      value.price === null ||
      value.priceCurrency === null ||
      value.pricingEvidence === null ||
      !Number.isFinite(evidencePrice) ||
      evidencePrice !== value.price ||
      value.pricingEvidence.currency !== value.priceCurrency ||
      Date.parse(value.pricingEvidence.validFrom) > Date.now() ||
      Date.parse(value.pricingEvidence.validUntil) <= Date.now()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Listing price must match current verified economics evidence',
      });
    }
    if (value.pricingMissingFields.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricingMissingFields'],
        message: 'Evidence-backed pricing cannot have missing inputs',
      });
    }
  });

const jsonRecordSchema = z.record(z.string(), z.unknown());
const storedListingBundleSchema = z.object({
  schemaVersion: z.literal(LISTING_BUNDLE_SCHEMA_VERSION),
  platform: z.string().trim().min(1),
  content: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    bullets: z.array(z.string().trim().min(1)).min(1),
  }),
  seo: z.object({
    keywords: z.array(z.string().trim().min(1)).min(1),
    searchTerms: z.array(z.string()),
  }),
  attributes: jsonRecordSchema,
  commercial: listingCommercialSchema,
  personalization: z.object({
    enabled: z.boolean(),
    fields: z.array(jsonRecordSchema),
  }),
  mediaMapping: z.array(jsonRecordSchema),
  policy: z.object({
    reviewRequired: z.literal(true),
    claims: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  provenance: z.object({
    source: z.enum(['agent-listing-generation', 'manual-listing-edit']),
    productId: z.string().optional(),
    actorId: z.string().optional(),
    parentOutputSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    generatedAt: z.string().min(1),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

type AgentListingOutput = z.infer<typeof agentListingOutputSchema>;

export interface ListingBundleValidationIssue {
  code: 'OUTPUT_SCHEMA_INVALID';
  path: string;
  message: string;
}

export interface ListingBundleValidation {
  status: 'VALID' | 'INVALID';
  schemaVersion: typeof LISTING_BUNDLE_SCHEMA_VERSION;
  checkedAt: string;
  issues: ListingBundleValidationIssue[];
}

export interface ListingBundleV1 {
  schemaVersion: typeof LISTING_BUNDLE_SCHEMA_VERSION;
  platform: string;
  content: {
    title: string;
    description: string;
    bullets: string[];
  };
  seo: {
    keywords: string[];
    searchTerms: string[];
  };
  attributes: Record<string, unknown>;
  commercial: {
    suggestedPrice?: number;
    priceCurrency: 'RUB' | 'USD' | null;
    pricingStatus: 'EVIDENCE_BACKED' | 'DATA_INSUFFICIENT';
    pricingEvidence: ListingPricingEvidence | null;
    pricingMissingFields: string[];
  };
  personalization: {
    enabled: boolean;
    fields: Array<Record<string, unknown>>;
  };
  mediaMapping: Array<Record<string, unknown>>;
  policy: {
    reviewRequired: true;
    claims: string[];
    warnings: string[];
  };
  provenance: {
    source: 'agent-listing-generation' | 'manual-listing-edit';
    productId?: string;
    actorId?: string;
    parentOutputSha256?: string;
    generatedAt: string;
    inputSha256: string;
    outputSha256: string;
  };
}

export type ListingBundleBuildResult =
  | {
      status: 'VALID';
      bundle: ListingBundleV1;
      validation: ListingBundleValidation & { status: 'VALID' };
    }
  | {
      status: 'INVALID';
      bundle: null;
      validation: ListingBundleValidation & { status: 'INVALID' };
    };

@Injectable()
export class ListingBundleService {
  parseStoredBundle(value: unknown): ListingBundleV1 | null {
    const parsed = storedListingBundleSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  computeOutputSha256(bundle: ListingBundleV1): string {
    return this.sha256({
      title: bundle.content.title,
      description: bundle.content.description,
      bulletPoints: bundle.content.bullets,
      keywords: bundle.seo.keywords,
      commercial: bundle.commercial,
    });
  }

  computeInputSha256(value: unknown): string {
    return this.sha256(value);
  }

  computeApprovalSha256(bundle: ListingBundleV1): string {
    return this.sha256({
      schemaVersion: bundle.schemaVersion,
      platform: bundle.platform,
      content: bundle.content,
      seo: bundle.seo,
      attributes: bundle.attributes,
      commercial: bundle.commercial,
      personalization: bundle.personalization,
      mediaMapping: bundle.mediaMapping,
      policy: bundle.policy,
    });
  }

  build(input: {
    request: ListingGenerationInput;
    agentResult: unknown;
    productId?: string;
    generatedAt?: Date;
  }): ListingBundleBuildResult {
    const generatedAt = (input.generatedAt ?? new Date()).toISOString();
    const parsed = agentListingOutputSchema.safeParse(input.agentResult);
    if (!parsed.success) {
      return {
        status: 'INVALID',
        bundle: null,
        validation: {
          status: 'INVALID',
          schemaVersion: LISTING_BUNDLE_SCHEMA_VERSION,
          checkedAt: generatedAt,
          issues: parsed.error.issues.map((issue) => ({
            code: 'OUTPUT_SCHEMA_INVALID',
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
    }

    const bundle = this.createBundle(input, parsed.data, generatedAt);
    return {
      status: 'VALID',
      bundle,
      validation: {
        status: 'VALID',
        schemaVersion: LISTING_BUNDLE_SCHEMA_VERSION,
        checkedAt: generatedAt,
        issues: [],
      },
    };
  }

  revise(input: {
    draft: {
      productId?: string | null;
      platform: string;
      title?: string | null;
      description?: string | null;
      bullets: string[];
      seoTags: string[];
      bundle: unknown;
    };
    patch: {
      title?: string;
      description?: string;
      bullets?: string[];
      seoTags?: string[];
    };
    actorId: string;
    revisedAt?: Date;
  }): ListingBundleBuildResult {
    const revisedAt = (input.revisedAt ?? new Date()).toISOString();
    const existingBundle = this.asRecord(input.draft.bundle);
    const existingCommercial = this.asRecord(existingBundle.commercial);
    const suggestedPrice = this.asPositiveNumber(
      existingCommercial.suggestedPrice,
    );
    const rawPricingEvidence = existingCommercial.pricingEvidence;
    const pricingEvidence =
      rawPricingEvidence &&
      typeof rawPricingEvidence === 'object' &&
      !Array.isArray(rawPricingEvidence)
        ? rawPricingEvidence
        : null;
    const existingPricingMissingFields = this.asStringArray(
      existingCommercial.pricingMissingFields,
    );
    const output = {
      title: input.patch.title ?? input.draft.title ?? '',
      description: input.patch.description ?? input.draft.description ?? '',
      bulletPoints: input.patch.bullets ?? input.draft.bullets,
      keywords: input.patch.seoTags ?? input.draft.seoTags,
      price: suggestedPrice,
      priceCurrency:
        existingCommercial.priceCurrency === 'RUB' ||
        existingCommercial.priceCurrency === 'USD'
          ? existingCommercial.priceCurrency
          : null,
      pricingStatus:
        existingCommercial.pricingStatus === 'EVIDENCE_BACKED'
          ? 'EVIDENCE_BACKED'
          : 'DATA_INSUFFICIENT',
      pricingEvidence,
      pricingMissingFields:
        existingPricingMissingFields.length > 0
          ? existingPricingMissingFields
          : ['pricingEvidence'],
      publishable: false as const,
      requiresHumanReview: true as const,
    };
    const parsed = agentListingOutputSchema.safeParse(output);
    if (!parsed.success) {
      return this.invalidResult(parsed.error, revisedAt);
    }

    const request: ListingGenerationInput = {
      productName: output.title,
      description: output.description,
      keywords: output.keywords,
      platform: input.draft.platform,
    };
    const existingProvenance = this.asRecord(existingBundle.provenance);
    const parentOutputSha256 = this.asOptionalString(
      existingProvenance.outputSha256,
    );
    const bundle = this.createBundle(
      {
        request,
        ...(input.draft.productId ? { productId: input.draft.productId } : {}),
      },
      parsed.data,
      revisedAt,
      {
        source: 'manual-listing-edit',
        actorId: input.actorId,
        ...(parentOutputSha256 ? { parentOutputSha256 } : {}),
      },
    );

    bundle.attributes = this.asRecord(existingBundle.attributes);
    bundle.mediaMapping = this.asRecordArray(existingBundle.mediaMapping);
    bundle.personalization = this.readPersonalization(
      existingBundle.personalization,
    );
    bundle.policy = this.readPolicy(existingBundle.policy);

    return {
      status: 'VALID',
      bundle,
      validation: {
        status: 'VALID',
        schemaVersion: LISTING_BUNDLE_SCHEMA_VERSION,
        checkedAt: revisedAt,
        issues: [],
      },
    };
  }

  private createBundle(
    input: {
      request: ListingGenerationInput;
      productId?: string;
    },
    output: AgentListingOutput,
    generatedAt: string,
    provenance: {
      source: 'agent-listing-generation' | 'manual-listing-edit';
      actorId?: string;
      parentOutputSha256?: string;
    } = { source: 'agent-listing-generation' },
  ): ListingBundleV1 {
    const commercial: ListingBundleV1['commercial'] = {
      ...(output.price !== null ? { suggestedPrice: output.price } : {}),
      priceCurrency: output.priceCurrency,
      pricingStatus: output.pricingStatus,
      pricingEvidence: output.pricingEvidence,
      pricingMissingFields: output.pricingMissingFields,
    };
    const outputForHash = {
      title: output.title,
      description: output.description,
      bulletPoints: output.bulletPoints,
      keywords: output.keywords,
      commercial,
    };

    return {
      schemaVersion: LISTING_BUNDLE_SCHEMA_VERSION,
      platform: input.request.platform.trim().toLowerCase(),
      content: {
        title: output.title,
        description: output.description,
        bullets: output.bulletPoints,
      },
      seo: { keywords: output.keywords, searchTerms: [] },
      attributes: {},
      commercial,
      personalization: { enabled: false, fields: [] },
      mediaMapping: [],
      policy: {
        reviewRequired: true,
        claims: [],
        warnings: [],
      },
      provenance: {
        source: provenance.source,
        ...(input.productId ? { productId: input.productId } : {}),
        ...(provenance.actorId ? { actorId: provenance.actorId } : {}),
        ...(provenance.parentOutputSha256
          ? { parentOutputSha256: provenance.parentOutputSha256 }
          : {}),
        generatedAt,
        inputSha256: this.sha256(input.request),
        outputSha256: this.sha256(outputForHash),
      },
    };
  }

  private invalidResult(
    error: z.ZodError,
    checkedAt: string,
  ): ListingBundleBuildResult {
    return {
      status: 'INVALID',
      bundle: null,
      validation: {
        status: 'INVALID',
        schemaVersion: LISTING_BUNDLE_SCHEMA_VERSION,
        checkedAt,
        issues: error.issues.map((issue) => ({
          code: 'OUTPUT_SCHEMA_INVALID',
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asRecordArray(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  }

  private asOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private asPositiveNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
  }

  private readPersonalization(value: unknown) {
    const personalization = this.asRecord(value);
    return {
      enabled: personalization.enabled === true,
      fields: this.asRecordArray(personalization.fields),
    };
  }

  private readPolicy(value: unknown): ListingBundleV1['policy'] {
    const policy = this.asRecord(value);
    return {
      reviewRequired: true,
      claims: this.asStringArray(policy.claims),
      warnings: this.asStringArray(policy.warnings),
    };
  }

  private sha256(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
