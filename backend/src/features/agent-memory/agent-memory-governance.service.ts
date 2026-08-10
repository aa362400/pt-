import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  governMemoryPayload,
  memoryGovernanceFrom,
} from './agent-memory-governance.js';

interface CorrectionInput {
  notes: string;
  reason: string;
}

interface RevokeInput {
  reason: string;
}

type GovernedMemoryType = 'work' | 'experience';

@Injectable()
export class AgentMemoryGovernanceService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: JwtPayload,
    options: { workspaceId?: string; limit?: number } = {},
  ) {
    const organizationId = requireOrg(user);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const [workMemories, experiences] = await this.tenantDatabase.run(
      organizationId,
      (tx) =>
        Promise.all([
          tx.agentWorkMemory.findMany({
            where: {
              organizationId,
              ...(options.workspaceId
                ? { workspaceId: options.workspaceId }
                : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
          tx.agentExperienceCard.findMany({
            where: {
              organizationId,
              ...(options.workspaceId
                ? { workspaceId: options.workspaceId }
                : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
        ]),
    );
    const items = [
      ...workMemories.map((item) => ({
        ...item,
        memoryType: 'work' as const,
        governance: memoryGovernanceFrom(item.metadata) ?? null,
      })),
      ...experiences.map((item) => ({
        ...item,
        memoryType: 'experience' as const,
        governance: memoryGovernanceFrom(item.evidence) ?? null,
      })),
    ].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return {
      items,
      summary: {
        total: items.length,
        trusted: items.filter(
          (item) => item.governance?.trustStatus === 'trusted',
        ).length,
        unverified: items.filter((item) => !item.governance).length,
        quarantined: items.filter(
          (item) => item.governance?.trustStatus === 'quarantined',
        ).length,
        superseded: items.filter(
          (item) => item.governance?.trustStatus === 'superseded',
        ).length,
        revoked: items.filter(
          (item) => item.governance?.trustStatus === 'revoked',
        ).length,
      },
    };
  }

  async correctExperience(
    user: JwtPayload,
    id: string,
    input: CorrectionInput,
  ) {
    const organizationId = requireOrg(user);
    const notes = input.notes?.trim();
    const reason = input.reason?.trim();
    if (!notes || !reason) {
      throw new BadRequestException('Correction notes and reason are required');
    }
    const governed = governMemoryPayload({ notes });
    if (governed.trustStatus !== 'trusted') {
      throw new BadRequestException(
        'Correction was blocked by memory injection policy',
      );
    }

    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      const existing = await tx.agentExperienceCard.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new NotFoundException('Experience memory not found');
      const previousEvidence = this.asRecord(existing.evidence);
      const previousGovernance = memoryGovernanceFrom(previousEvidence);
      const now = new Date().toISOString();
      const corrected = await tx.agentExperienceCard.create({
        data: {
          organizationId,
          workspaceId: existing.workspaceId,
          sourceReviewTaskId: existing.sourceReviewTaskId,
          taskType: existing.taskType,
          entityType: existing.entityType,
          category: existing.category,
          title: `${existing.category}: ${governed.value.notes.slice(0, 80)}`,
          lesson: `Corrected guidance: ${governed.value.notes}`,
          scoreImpact: existing.scoreImpact,
          evidence: {
            notes: governed.value.notes,
            correctionReason: reason.slice(0, 2000),
            correctedFromId: existing.id,
            governance: {
              sourceType: 'human_correction',
              sourceId: existing.id,
              version: (previousGovernance?.version ?? 1) + 1,
              contentHash: governed.contentHash,
              trustStatus: 'trusted',
              validFrom: now,
              validUntil: null,
              reasons: [],
              redactions: governed.redactions,
              correctedBy: user.sub,
            },
          },
        },
      });
      await tx.agentExperienceCard.update({
        where: { id: existing.id },
        data: {
          evidence: {
            ...previousEvidence,
            governance: {
              ...(previousGovernance ?? {}),
              trustStatus: 'superseded',
              correctedBy: user.sub,
              correctedAt: now,
              supersededById: corrected.id,
            },
          },
        },
      });
      return corrected;
    });

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'agent-memory.correct',
      resourceType: 'AgentExperienceCard',
      resourceId: id,
      after: { correctedMemoryId: result.id, reason: reason.slice(0, 2000) },
    });
    return result;
  }

  async revoke(
    user: JwtPayload,
    type: GovernedMemoryType,
    id: string,
    input: RevokeInput,
  ) {
    const organizationId = requireOrg(user);
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException('Revocation reason is required');
    const now = new Date().toISOString();

    await this.tenantDatabase.run(organizationId, async (tx) => {
      if (type === 'experience') {
        const existing = await tx.agentExperienceCard.findFirst({
          where: { id, organizationId },
        });
        if (!existing)
          throw new NotFoundException('Experience memory not found');
        const evidence = this.asRecord(existing.evidence);
        await tx.agentExperienceCard.update({
          where: { id },
          data: {
            evidence: {
              ...evidence,
              governance: {
                ...(memoryGovernanceFrom(evidence) ?? {}),
                trustStatus: 'revoked',
                revokedBy: user.sub,
                revokedAt: now,
                revokedReason: reason.slice(0, 2000),
              },
            },
          },
        });
        return;
      }
      const existing = await tx.agentWorkMemory.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new NotFoundException('Work memory not found');
      const metadata = this.asRecord(existing.metadata);
      await tx.agentWorkMemory.update({
        where: { id },
        data: {
          metadata: {
            ...metadata,
            governance: {
              ...(memoryGovernanceFrom(metadata) ?? {}),
              trustStatus: 'revoked',
              revokedBy: user.sub,
              revokedAt: now,
              revokedReason: reason.slice(0, 2000),
            },
          },
        },
      });
    });

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'agent-memory.revoke',
      resourceType:
        type === 'experience' ? 'AgentExperienceCard' : 'AgentWorkMemory',
      resourceId: id,
      after: { type, revoked: true, reason: reason.slice(0, 2000) },
    });
    return { id, type, revoked: true };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }
}
