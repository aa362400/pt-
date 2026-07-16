import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ListingGenerationInput } from '../../agents/agent-provider.interface.js';

export const LISTING_BUNDLE_SCHEMA_VERSION = 'listing-bundle/v1' as const;

const agentListingOutputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1),
  bulletPoints: z.array(z.string().trim().min(1)).min(1).max(20),
  keywords: z.array(z.string().trim().min(1)).min(1).max(50),
  price: z.number().finite().positive().optional(),
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
  commercial: z.object({
    suggestedPrice: z.number().finite().positive().optional(),
  }),
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
      ...(bundle.commercial.suggestedPrice !== undefined
        ? { price: bundle.commercial.suggestedPrice }
        : {}),
    });
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
    const output = {
      title: input.patch.title ?? input.draft.title ?? '',
      description: input.patch.description ?? input.draft.description ?? '',
      bulletPoints: input.patch.bullets ?? input.draft.bullets,
      keywords: input.patch.seoTags ?? input.draft.seoTags,
      ...(suggestedPrice ? { price: suggestedPrice } : {}),
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
    const outputForHash = {
      title: output.title,
      description: output.description,
      bulletPoints: output.bulletPoints,
      keywords: output.keywords,
      ...(output.price !== undefined ? { price: output.price } : {}),
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
      commercial: {
        ...(output.price !== undefined ? { suggestedPrice: output.price } : {}),
      },
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
