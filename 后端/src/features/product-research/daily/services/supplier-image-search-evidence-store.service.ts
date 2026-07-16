import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  supplierImageSearchEvidenceSchema,
  type SupplierImageSearchEvidence,
} from '../contracts/supplier-image-search-evidence.contract.js';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';

const CANONICALIZER_VERSION = 'supplier-image-search-jcs/v1';

export interface AppendSupplierImageSearchEvidenceInput {
  organizationId: string;
  workspaceId: string | null;
  researchRunId: string;
  candidateId: string;
  evidence: SupplierImageSearchEvidence;
}

interface StoredEvidenceIdentity {
  id: string;
  contentHash: string;
  dedupeKey: string;
}

interface StoredRequestEvidenceIdentity extends StoredEvidenceIdentity {
  workspaceId: string | null;
  researchRunId: string;
  candidateId: string;
}

@Injectable()
export class SupplierImageSearchEvidenceStoreService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async append(input: AppendSupplierImageSearchEvidenceInput): Promise<{
    id: string;
    inserted: boolean;
    contentHash: string;
    dedupeKey: string;
  }> {
    const parsedEvidence = supplierImageSearchEvidenceSchema.parse(
      input.evidence,
    );
    const evidence = supplierImageSearchEvidenceSchema.parse({
      ...parsedEvidence,
      fetchedAt: new Date(parsedEvidence.fetchedAt).toISOString(),
    });
    const workspaceScopeKey = this.workspaceScopeKey(input.workspaceId);
    const contentHash = this.sha256(
      this.canonicalJson({
        canonicalizerVersion: CANONICALIZER_VERSION,
        evidence,
      }),
    );
    const dedupeKey = this.sha256(
      this.canonicalJson({
        canonicalizerVersion: CANONICALIZER_VERSION,
        organizationId: input.organizationId,
        workspaceScopeKey,
        researchRunId: input.researchRunId,
        candidateId: input.candidateId,
        contentHash,
      }),
    );

    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const [organization, workspace, researchRun, candidate] =
        await Promise.all([
          tx.organization.findUnique({
            where: { id: input.organizationId },
            select: { id: true },
          }),
          input.workspaceId === null
            ? Promise.resolve({ id: null })
            : tx.workspace.findFirst({
                where: {
                  id: input.workspaceId,
                  organizationId: input.organizationId,
                },
                select: { id: true },
              }),
          tx.productResearchRun.findFirst({
            where: {
              id: input.researchRunId,
              organizationId: input.organizationId,
              workspaceId: input.workspaceId,
            },
            select: { id: true },
          }),
          tx.productCandidate.findFirst({
            where: {
              id: input.candidateId,
              organizationId: input.organizationId,
              researchRunId: input.researchRunId,
              workspaceId: input.workspaceId,
            },
            select: { id: true },
          }),
        ]);
      if (!organization) {
        throw new ConflictException(
          'SUPPLIER_IMAGE_SEARCH_ORGANIZATION_BINDING_MISMATCH',
        );
      }
      if (!workspace) {
        throw new ConflictException(
          'SUPPLIER_IMAGE_SEARCH_WORKSPACE_BINDING_MISMATCH',
        );
      }
      if (!researchRun) {
        throw new ConflictException(
          'SUPPLIER_IMAGE_SEARCH_RESEARCH_RUN_BINDING_MISMATCH',
        );
      }
      if (!candidate) {
        throw new ConflictException(
          'SUPPLIER_IMAGE_SEARCH_CANDIDATE_BINDING_MISMATCH',
        );
      }

      const existingRequest = await tx.supplierImageSearchEvidence.findUnique({
        where: {
          organizationId_workspaceScopeKey_requestId: {
            organizationId: input.organizationId,
            workspaceScopeKey,
            requestId: evidence.requestId,
          },
        },
        select: {
          id: true,
          contentHash: true,
          dedupeKey: true,
          workspaceId: true,
          researchRunId: true,
          candidateId: true,
        },
      });
      if (existingRequest) {
        this.assertRequestContent(existingRequest, contentHash, input);
        return {
          id: existingRequest.id,
          contentHash: existingRequest.contentHash,
          dedupeKey: existingRequest.dedupeKey,
          inserted: false,
        };
      }

      const existingDedupe = await tx.supplierImageSearchEvidence.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: input.organizationId,
            dedupeKey,
          },
        },
        select: {
          id: true,
          contentHash: true,
          dedupeKey: true,
          workspaceId: true,
          researchRunId: true,
          candidateId: true,
        },
      });
      if (existingDedupe) {
        this.assertDedupeIdentity(existingDedupe, contentHash, input);
        return {
          id: existingDedupe.id,
          contentHash: existingDedupe.contentHash,
          dedupeKey: existingDedupe.dedupeKey,
          inserted: false,
        };
      }

      const canonicalization = evidence.canonicalization;
      const result = await tx.supplierImageSearchEvidence.createMany({
        data: [
          {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            workspaceScopeKey,
            researchRunId: input.researchRunId,
            candidateId: input.candidateId,
            schemaVersion: evidence.schemaVersion,
            provider: evidence.provider,
            adapterVersion: evidence.adapterVersion,
            requestId: evidence.requestId,
            outcome: evidence.outcome,
            rawSnapshotSha256: evidence.rawSnapshotSha256,
            canonicalizationVersion: canonicalization.version,
            sourceOriginalSha256: canonicalization.sourceOriginalSha256,
            sourceCanonicalSha256: canonicalization.sourceCanonicalSha256,
            canonicalByteSize: canonicalization.canonicalByteSize,
            canonicalMimeType: canonicalization.canonicalMimeType,
            canonicalWidth: canonicalization.canonicalWidth,
            canonicalHeight: canonicalization.canonicalHeight,
            retrievalHashAlgorithm: canonicalization.retrievalHashAlgorithm,
            retrievalHash: canonicalization.retrievalHash,
            providerResultCount: evidence.providerResultCount,
            normalizedOffers: evidence.normalizedOffers,
            fetchedAt: new Date(evidence.fetchedAt),
            contentCanonicalizerVersion: CANONICALIZER_VERSION,
            contentHash,
            dedupeKey,
          },
        ],
        skipDuplicates: true,
      });

      const storedByRequest = await tx.supplierImageSearchEvidence.findUnique({
        where: {
          organizationId_workspaceScopeKey_requestId: {
            organizationId: input.organizationId,
            workspaceScopeKey,
            requestId: evidence.requestId,
          },
        },
        select: {
          id: true,
          contentHash: true,
          dedupeKey: true,
          workspaceId: true,
          researchRunId: true,
          candidateId: true,
        },
      });
      if (storedByRequest) {
        this.assertRequestContent(storedByRequest, contentHash, input);
        return {
          id: storedByRequest.id,
          contentHash: storedByRequest.contentHash,
          dedupeKey: storedByRequest.dedupeKey,
          inserted: result.count === 1,
        };
      }

      const storedByDedupe = await tx.supplierImageSearchEvidence.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: input.organizationId,
            dedupeKey,
          },
        },
        select: {
          id: true,
          contentHash: true,
          dedupeKey: true,
          workspaceId: true,
          researchRunId: true,
          candidateId: true,
        },
      });
      if (storedByDedupe) {
        this.assertDedupeIdentity(storedByDedupe, contentHash, input);
        return {
          id: storedByDedupe.id,
          contentHash: storedByDedupe.contentHash,
          dedupeKey: storedByDedupe.dedupeKey,
          inserted: false,
        };
      }
      throw new ConflictException(
        'SUPPLIER_IMAGE_SEARCH_EVIDENCE_APPEND_FAILED',
      );
    });
  }

  private assertRequestContent(
    stored: StoredRequestEvidenceIdentity,
    expectedContentHash: string,
    expectedParent: Pick<
      AppendSupplierImageSearchEvidenceInput,
      'workspaceId' | 'researchRunId' | 'candidateId'
    >,
  ): void {
    if (
      stored.workspaceId !== expectedParent.workspaceId ||
      stored.researchRunId !== expectedParent.researchRunId ||
      stored.candidateId !== expectedParent.candidateId
    ) {
      throw new ConflictException(
        'SUPPLIER_IMAGE_SEARCH_REQUEST_ID_REUSED_WITH_DIFFERENT_PARENT',
      );
    }
    if (stored.contentHash !== expectedContentHash) {
      throw new ConflictException(
        'SUPPLIER_IMAGE_SEARCH_REQUEST_ID_REUSED_WITH_DIFFERENT_CONTENT',
      );
    }
  }

  private assertDedupeIdentity(
    stored: StoredRequestEvidenceIdentity,
    expectedContentHash: string,
    expectedParent: Pick<
      AppendSupplierImageSearchEvidenceInput,
      'workspaceId' | 'researchRunId' | 'candidateId'
    >,
  ): void {
    if (
      stored.workspaceId !== expectedParent.workspaceId ||
      stored.researchRunId !== expectedParent.researchRunId ||
      stored.candidateId !== expectedParent.candidateId
    ) {
      throw new ConflictException(
        'SUPPLIER_IMAGE_SEARCH_DEDUPE_KEY_REUSED_WITH_DIFFERENT_PARENT',
      );
    }
    if (stored.contentHash !== expectedContentHash) {
      throw new ConflictException(
        'SUPPLIER_IMAGE_SEARCH_DEDUPE_KEY_REUSED_WITH_DIFFERENT_CONTENT',
      );
    }
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private workspaceScopeKey(workspaceId: string | null): string {
    return workspaceId === null
      ? 'workspace:empty'
      : `workspace:id:${workspaceId}`;
  }

  private canonicalJson(value: unknown): string {
    return JSON.stringify(this.canonicalValue(value));
  }

  private canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, item]) => [key, this.canonicalValue(item)]),
      );
    }
    return value;
  }
}
