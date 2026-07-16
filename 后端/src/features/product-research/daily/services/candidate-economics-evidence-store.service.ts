import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import {
  appendCandidateEconomicsEvidenceSchema,
  type AppendCandidateEconomicsEvidenceInput,
} from '../contracts/trusted-economics.contract.js';

const CANONICALIZER_VERSION = 'candidate-economics-jcs/v1';
const SECRET_FIELD =
  /^(?:authorization|token|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|cookie|set-cookie)$/i;

@Injectable()
export class CandidateEconomicsEvidenceStoreService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async append(rawInput: AppendCandidateEconomicsEvidenceInput): Promise<{
    id: string;
    inserted: boolean;
    contentHash: string;
    bindingHash: string;
    dedupeKey: string;
  }> {
    const input = appendCandidateEconomicsEvidenceSchema.parse(rawInput);
    this.assertSecretFree(input.normalizedEvidence);
    const workspaceScopeKey = this.workspaceScopeKey(input.workspaceId);
    const expectedRawRef = `economics-evidence/${input.organizationId}/raw/${input.rawSnapshotSha256}`;
    if (input.rawSnapshotRef !== expectedRawRef) {
      throw new ConflictException(
        'CANDIDATE_ECONOMICS_RAW_SNAPSHOT_REF_INVALID',
      );
    }
    const bindingHash = this.sha256(this.canonicalJson(input.binding));
    const normalized = {
      canonicalizerVersion: CANONICALIZER_VERSION,
      ...input,
      bindingHash,
    };
    const contentHash = this.sha256(this.canonicalJson(normalized));
    const dedupeKey = this.sha256(
      [
        CANONICALIZER_VERSION,
        input.schemaVersion,
        workspaceScopeKey,
        input.researchRunId,
        input.candidateId,
        input.kind,
        input.provider,
        input.requestId,
        contentHash,
      ].join('|'),
    );

    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const candidate = await tx.productCandidate.findFirst({
        where: {
          id: input.candidateId,
          organizationId: input.organizationId,
          researchRunId: input.researchRunId,
          workspaceId: input.workspaceId,
        },
        select: { id: true, fingerprint: true },
      });
      if (!candidate) {
        throw new ConflictException(
          'CANDIDATE_ECONOMICS_CANDIDATE_BINDING_MISMATCH',
        );
      }
      if (candidate.fingerprint !== input.binding.candidateFingerprint) {
        throw new ConflictException('CANDIDATE_ECONOMICS_FINGERPRINT_MISMATCH');
      }

      const inserted = await tx.candidateEconomicsEvidence.createMany({
        data: [
          {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            workspaceScopeKey,
            researchRunId: input.researchRunId,
            candidateId: input.candidateId,
            schemaVersion: input.schemaVersion,
            kind: input.kind,
            valueKind: input.valueKind,
            amount: input.amount,
            rate: input.rate,
            minimumAmount: input.minimumAmount,
            currency: input.currency,
            baseCurrency: input.baseCurrency,
            quoteCurrency: input.quoteCurrency,
            quantity: input.quantity,
            unit: input.unit,
            provider: input.provider,
            adapterVersion: input.adapterVersion,
            requestId: input.requestId,
            verificationMethod: input.verificationMethod,
            verificationStatus: input.verificationStatus,
            binding: input.binding,
            bindingHash,
            normalizedEvidence: normalized as Prisma.InputJsonValue,
            rawSnapshotSha256: input.rawSnapshotSha256,
            rawSnapshotRef: input.rawSnapshotRef,
            contentHash,
            dedupeKey,
            observedAt: new Date(input.observedAt),
            fetchedAt: new Date(input.fetchedAt),
            verifiedAt: new Date(input.verifiedAt),
            validUntil: new Date(input.validUntil),
          },
        ],
        skipDuplicates: true,
      });
      const stored = await tx.candidateEconomicsEvidence.findUnique({
        where: {
          organizationId_workspaceScopeKey_provider_requestId: {
            organizationId: input.organizationId,
            workspaceScopeKey,
            provider: input.provider,
            requestId: input.requestId,
          },
        },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          researchRunId: true,
          candidateId: true,
          contentHash: true,
          bindingHash: true,
          dedupeKey: true,
        },
      });
      if (!stored) {
        throw new ConflictException('CANDIDATE_ECONOMICS_APPEND_FAILED');
      }
      if (
        stored.organizationId !== input.organizationId ||
        stored.workspaceId !== input.workspaceId ||
        stored.researchRunId !== input.researchRunId ||
        stored.candidateId !== input.candidateId ||
        stored.contentHash !== contentHash ||
        stored.bindingHash !== bindingHash
      ) {
        throw new ConflictException(
          'CANDIDATE_ECONOMICS_REQUEST_ID_REUSED_WITH_DIFFERENT_CONTENT',
        );
      }
      return {
        id: stored.id,
        inserted: inserted.count === 1,
        contentHash,
        bindingHash,
        dedupeKey: stored.dedupeKey,
      };
    });
  }

  private assertSecretFree(value: unknown, path = 'normalizedEvidence'): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.assertSecretFree(item, `${path}[${index}]`),
      );
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SECRET_FIELD.test(key)) {
        throw new ConflictException(
          `CANDIDATE_ECONOMICS_SECRET_FIELD_FORBIDDEN:${path}.${key}`,
        );
      }
      this.assertSecretFree(item, `${path}.${key}`);
    }
  }

  private workspaceScopeKey(workspaceId: string | null): string {
    return workspaceId === null
      ? 'workspace:empty'
      : `workspace:id:${workspaceId}`;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
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
