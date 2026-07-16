import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../../../../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../../../shared/tenancy/org-scope.js';
import {
  SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
  supplierImageSearchEvidenceReadResponseSchema,
  type SupplierImageSearchEvidenceReadResponse,
} from '../contracts/supplier-image-search-evidence-read.contract.js';
import type { ListSupplierImageSearchEvidenceQueryDto } from '../supplier-image-search-evidence-read.dto.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class SupplierImageSearchEvidenceReadService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async listForCandidate(
    user: JwtPayload,
    candidateId: string,
    query: ListSupplierImageSearchEvidenceQueryDto,
  ): Promise<SupplierImageSearchEvidenceReadResponse> {
    const organizationId = requireOrg(user);
    const limit = this.readLimit(query.limit);

    return this.tenantDatabase.run(organizationId, async (tx) => {
      const candidate = await tx.productCandidate.findFirst({
        where: { id: candidateId, organizationId },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          researchRunId: true,
        },
      });
      if (
        !candidate ||
        candidate.id !== candidateId ||
        candidate.organizationId !== organizationId
      ) {
        throw new NotFoundException('Product candidate not found');
      }

      const rows = await tx.supplierImageSearchEvidence.findMany({
        where: {
          organizationId,
          candidateId: candidate.id,
          researchRunId: candidate.researchRunId,
          workspaceId: candidate.workspaceId,
        },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          researchRunId: true,
          candidateId: true,
          schemaVersion: true,
          provider: true,
          adapterVersion: true,
          requestId: true,
          outcome: true,
          rawSnapshotSha256: true,
          canonicalizationVersion: true,
          sourceOriginalSha256: true,
          sourceCanonicalSha256: true,
          canonicalByteSize: true,
          canonicalMimeType: true,
          canonicalWidth: true,
          canonicalHeight: true,
          retrievalHashAlgorithm: true,
          retrievalHash: true,
          providerResultCount: true,
          normalizedOffers: true,
          fetchedAt: true,
          contentCanonicalizerVersion: true,
          contentHash: true,
        },
        orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });

      try {
        const response = {
          schemaVersion: SUPPLIER_IMAGE_SEARCH_EVIDENCE_READ_SCHEMA_VERSION,
          candidateId: candidate.id,
          limit,
          items: rows
            .filter(
              (row) =>
                row.organizationId === organizationId &&
                row.workspaceId === candidate.workspaceId &&
                row.researchRunId === candidate.researchRunId &&
                row.candidateId === candidate.id,
            )
            .sort((left, right) => {
              const fetchedAtOrder =
                right.fetchedAt.getTime() - left.fetchedAt.getTime();
              return fetchedAtOrder !== 0
                ? fetchedAtOrder
                : right.id.localeCompare(left.id);
            })
            .map((row) => ({
              evidenceId: row.id,
              sourceSchemaVersion: row.schemaVersion,
              outcome: row.outcome,
              provider: row.provider,
              adapterVersion: row.adapterVersion,
              requestId: row.requestId,
              fetchedAt: row.fetchedAt.toISOString(),
              providerResultCount: row.providerResultCount,
              image: {
                rawSnapshotSha256: row.rawSnapshotSha256,
                canonicalizationVersion: row.canonicalizationVersion,
                sourceOriginalSha256: row.sourceOriginalSha256,
                sourceCanonicalSha256: row.sourceCanonicalSha256,
                canonicalByteSize: row.canonicalByteSize,
                canonicalMimeType: row.canonicalMimeType,
                canonicalWidth: row.canonicalWidth,
                canonicalHeight: row.canonicalHeight,
                retrievalHashAlgorithm: row.retrievalHashAlgorithm,
                retrievalHash: row.retrievalHash,
              },
              contentCanonicalizerVersion: row.contentCanonicalizerVersion,
              contentHash: row.contentHash,
              offers: row.normalizedOffers,
            })),
        };
        return supplierImageSearchEvidenceReadResponseSchema.parse(response);
      } catch {
        throw new InternalServerErrorException(
          'SUPPLIER_IMAGE_SEARCH_EVIDENCE_CORRUPT',
        );
      }
    });
  }

  private readLimit(requested: number | undefined): number {
    if (typeof requested !== 'number' || !Number.isInteger(requested)) {
      return DEFAULT_LIMIT;
    }
    return Math.min(MAX_LIMIT, Math.max(1, requested));
  }
}
