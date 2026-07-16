import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import { supplierImageSearchHttpsUrlSchema } from '../contracts/supplier-image-search-evidence.contract.js';
import type { ExternalCandidate } from '../contracts/external-candidate.contract.js';

const SOURCE = 'supplier_image_search';
const ALLOCATION_SCHEMA_VERSION =
  'supplier-image-search-allocation/v1' as const;
const MAX_REQUESTS_PER_RUN = 10;

const allocationCandidateIdSchema = z.string().trim().min(1).max(128);
const allocationEntrySchema = z
  .object({
    candidateId: allocationCandidateIdSchema,
    source: z.string().trim().min(1).max(128),
    externalId: z.string().max(512),
    imageUrl: supplierImageSearchHttpsUrlSchema,
    imageKeywords: z.string().trim().min(1).max(200).optional(),
    requestId: z.string().regex(/^dpr-sis-v1:[a-f0-9]{64}$/),
  })
  .strict();

export const supplierImageSearchAllocationSchema = z
  .object({
    schemaVersion: z.literal(ALLOCATION_SCHEMA_VERSION),
    candidateLimit: z.number().int().min(1).max(MAX_REQUESTS_PER_RUN),
    consideredCandidateIds: z
      .array(allocationCandidateIdSchema)
      .max(MAX_REQUESTS_PER_RUN),
    skippedNoSourceImageCandidateIds: z
      .array(allocationCandidateIdSchema)
      .max(MAX_REQUESTS_PER_RUN),
    skippedByBudgetCount: z.number().int().nonnegative(),
    entries: z.array(allocationEntrySchema).max(MAX_REQUESTS_PER_RUN),
  })
  .strict()
  .superRefine((allocation, context) => {
    const considered = new Set(allocation.consideredCandidateIds);
    if (considered.size !== allocation.consideredCandidateIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'considered candidate ids must be unique',
      });
    }
    const entryCandidateIds = allocation.entries.map(
      (entry) => entry.candidateId,
    );
    const skippedCandidateIds = allocation.skippedNoSourceImageCandidateIds;
    if (new Set(entryCandidateIds).size !== entryCandidateIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'allocated candidate ids must be unique',
      });
    }
    if (
      new Set(allocation.entries.map((entry) => entry.requestId)).size !==
      allocation.entries.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'allocated request ids must be unique',
      });
    }
    if (
      new Set(skippedCandidateIds).size !== skippedCandidateIds.length ||
      skippedCandidateIds.some((candidateId) =>
        entryCandidateIds.includes(candidateId),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'skipped candidates must be unique and unallocated',
      });
    }
    const assigned = new Set([...entryCandidateIds, ...skippedCandidateIds]);
    if (
      assigned.size !== considered.size ||
      [...assigned].some((candidateId) => !considered.has(candidateId))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'every considered candidate must have one immutable outcome',
      });
    }
  });

export type SupplierImageSearchAllocation = z.infer<
  typeof supplierImageSearchAllocationSchema
>;
export type SupplierImageSearchAllocationEntry = z.infer<
  typeof allocationEntrySchema
>;

export interface SupplierImageSearchAllocationCandidate {
  candidateId: string;
  fingerprint?: string;
  canonicalName: string;
  inputs: readonly ExternalCandidate[];
}

export interface SupplierImageSearchAllocationInput {
  organizationId: string;
  workspaceId: string | null;
  researchRunId: string;
  candidateLimit?: number;
  candidates: readonly SupplierImageSearchAllocationCandidate[];
}

interface SelectedSourceImage {
  source: string;
  externalId: string;
  imageUrl: string;
}

@Injectable()
export class SupplierImageSearchAllocationService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async getOrCreate(
    input: SupplierImageSearchAllocationInput,
  ): Promise<SupplierImageSearchAllocation> {
    const proposed = this.buildAllocation(input);
    const lockKey = `${SOURCE.replaceAll('_', '-')}:${input.organizationId}:${input.researchRunId}`;
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked`,
      );
      await this.lockAndAssertParents(tx, input);
      const existing = await tx.productResearchSourceHealth.findUnique({
        where: {
          researchRunId_source: {
            researchRunId: input.researchRunId,
            source: SOURCE,
          },
        },
        select: { metadata: true },
      });
      const metadata = this.record(existing?.metadata);
      if (metadata.allocation !== undefined) {
        const persisted = this.parsePersisted(metadata.allocation);
        await this.lockAndAssertCandidateParents(tx, input, persisted);
        return persisted;
      }

      await this.lockAndAssertCandidateParents(tx, input, proposed);
      const nextMetadata = {
        ...metadata,
        allocation: proposed,
      } as Prisma.InputJsonObject;
      await tx.productResearchSourceHealth.upsert({
        where: {
          researchRunId_source: {
            researchRunId: input.researchRunId,
            source: SOURCE,
          },
        },
        create: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          researchRunId: input.researchRunId,
          source: SOURCE,
          status: 'DEGRADED',
          attempts: 0,
          requestedAt: new Date(),
          itemCount: 0,
          errorCode: 'SUPPLIER_IMAGE_SEARCH_ALLOCATION_PENDING',
          errorMessage:
            'Immutable supplier image-search allocation created before provider execution.',
          metadata: nextMetadata,
        },
        update: { metadata: nextMetadata },
      });
      return proposed;
    });
  }

  private buildAllocation(
    input: SupplierImageSearchAllocationInput,
  ): SupplierImageSearchAllocation {
    const candidateLimit = Math.min(
      MAX_REQUESTS_PER_RUN,
      Math.max(1, Math.floor(input.candidateLimit ?? MAX_REQUESTS_PER_RUN)),
    );
    const boundedCandidates = [...input.candidates]
      .sort(
        (left, right) =>
          this.compareText(
            left.fingerprint?.trim() || left.candidateId,
            right.fingerprint?.trim() || right.candidateId,
          ) || this.compareText(left.candidateId, right.candidateId),
      )
      .slice(0, candidateLimit);
    const seenCandidateIds = new Set<string>();
    const consideredCandidates = boundedCandidates.filter((candidate) => {
      const candidateId = allocationCandidateIdSchema.parse(
        candidate.candidateId,
      );
      if (seenCandidateIds.has(candidateId)) return false;
      seenCandidateIds.add(candidateId);
      return true;
    });
    const entries: SupplierImageSearchAllocationEntry[] = [];
    const skippedNoSourceImageCandidateIds: string[] = [];
    for (const candidate of consideredCandidates) {
      const selected = this.selectSourceImage(candidate.inputs);
      if (!selected) {
        skippedNoSourceImageCandidateIds.push(candidate.candidateId);
        continue;
      }
      const imageKeywords = this.imageKeywords(candidate.canonicalName);
      entries.push({
        candidateId: candidate.candidateId,
        source: selected.source,
        externalId: selected.externalId,
        imageUrl: selected.imageUrl,
        ...(imageKeywords ? { imageKeywords } : {}),
        requestId: this.requestId(
          input,
          candidate.candidateId,
          selected,
          imageKeywords,
        ),
      });
    }
    return supplierImageSearchAllocationSchema.parse({
      schemaVersion: ALLOCATION_SCHEMA_VERSION,
      candidateLimit,
      consideredCandidateIds: consideredCandidates.map(
        (candidate) => candidate.candidateId,
      ),
      skippedNoSourceImageCandidateIds,
      skippedByBudgetCount: Math.max(
        0,
        input.candidates.length - boundedCandidates.length,
      ),
      entries,
    });
  }

  private selectSourceImage(
    inputs: readonly ExternalCandidate[],
  ): SelectedSourceImage | null {
    const eligible = inputs
      .flatMap((input) => {
        const parsedImage = supplierImageSearchHttpsUrlSchema.safeParse(
          input.imageUrl,
        );
        if (!parsedImage.success) return [];
        const validImageEvidence = supplierImageSearchHttpsUrlSchema.safeParse(
          input.imageEvidenceUrl,
        ).success;
        return [
          {
            source: input.source,
            externalId: input.externalId ?? '',
            imageUrl: parsedImage.data,
            validImageEvidence,
          },
        ];
      })
      .sort((left, right) => {
        if (left.validImageEvidence !== right.validImageEvidence) {
          return left.validImageEvidence ? -1 : 1;
        }
        return (
          this.compareText(left.source, right.source) ||
          this.compareText(left.externalId, right.externalId) ||
          this.compareText(left.imageUrl, right.imageUrl)
        );
      });
    const selected = eligible[0];
    return selected
      ? {
          source: selected.source,
          externalId: selected.externalId,
          imageUrl: selected.imageUrl,
        }
      : null;
  }

  private requestId(
    run: Pick<
      SupplierImageSearchAllocationInput,
      'organizationId' | 'researchRunId'
    >,
    candidateId: string,
    selected: SelectedSourceImage,
    imageKeywords: string | undefined,
  ): string {
    const digest = createHash('sha256')
      .update(
        JSON.stringify([
          run.organizationId,
          run.researchRunId,
          candidateId,
          selected.source,
          selected.imageUrl,
          imageKeywords ?? null,
        ]),
      )
      .digest('hex');
    return `dpr-sis-v1:${digest}`;
  }

  private imageKeywords(canonicalName: string): string | undefined {
    const normalized = canonicalName.trim();
    if (!normalized) return undefined;
    let bounded = normalized.slice(0, 200);
    if (/[\uD800-\uDBFF]$/.test(bounded)) bounded = bounded.slice(0, -1);
    bounded = bounded.trim();
    return bounded || undefined;
  }

  private parsePersisted(value: unknown): SupplierImageSearchAllocation {
    const parsed = supplierImageSearchAllocationSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_ALLOCATION_INVALID');
    }
    return parsed.data;
  }

  private async lockAndAssertParents(
    tx: Prisma.TransactionClient,
    input: Pick<
      SupplierImageSearchAllocationInput,
      'organizationId' | 'workspaceId' | 'researchRunId'
    >,
  ): Promise<void> {
    const organizations = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT organization."id"
        FROM "organizations" AS organization
        WHERE organization."id" = ${input.organizationId}
        FOR SHARE
      `,
    );
    if (organizations.length !== 1) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_ALLOCATION_PARENT_MISMATCH');
    }
    if (input.workspaceId) {
      const workspaces = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT workspace."id"
          FROM "workspaces" AS workspace
          WHERE workspace."id" = ${input.workspaceId}
            AND workspace."organizationId" = ${input.organizationId}
          FOR SHARE
        `,
      );
      if (workspaces.length !== 1) {
        throw new Error('SUPPLIER_IMAGE_SEARCH_ALLOCATION_PARENT_MISMATCH');
      }
    }
    const researchRuns = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT research_run."id"
        FROM "product_research_runs" AS research_run
        WHERE research_run."id" = ${input.researchRunId}
          AND research_run."organizationId" = ${input.organizationId}
          AND research_run."workspaceId" IS NOT DISTINCT FROM ${input.workspaceId}
        FOR SHARE
      `,
    );
    if (researchRuns.length !== 1) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_ALLOCATION_PARENT_MISMATCH');
    }
  }

  private async lockAndAssertCandidateParents(
    tx: Prisma.TransactionClient,
    input: Pick<
      SupplierImageSearchAllocationInput,
      'organizationId' | 'workspaceId' | 'researchRunId'
    >,
    allocation: SupplierImageSearchAllocation,
  ): Promise<void> {
    const candidateIds = allocation.consideredCandidateIds;
    if (candidateIds.length === 0) return;
    const matched = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT candidate."id"
        FROM "product_candidates" AS candidate
        WHERE candidate."id" IN (${Prisma.join(candidateIds)})
          AND candidate."organizationId" = ${input.organizationId}
          AND candidate."workspaceId" IS NOT DISTINCT FROM ${input.workspaceId}
          AND candidate."researchRunId" = ${input.researchRunId}
        FOR SHARE
      `,
    );
    const matchedIds = new Set(matched.map((candidate) => candidate.id));
    if (
      matchedIds.size !== candidateIds.length ||
      candidateIds.some((candidateId) => !matchedIds.has(candidateId))
    ) {
      throw new Error('SUPPLIER_IMAGE_SEARCH_ALLOCATION_CANDIDATE_MISMATCH');
    }
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}
