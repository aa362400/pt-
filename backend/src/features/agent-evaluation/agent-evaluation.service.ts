import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentType, Prisma, PromptVersionStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  AgentEvalWindowDto,
  CreateBusinessOutcomeDto,
  CreateFeedbackSignalDto,
  CreatePromptVersionDto,
  ListFeedbackSignalsQueryDto,
  UpdatePromptVersionStatusDto,
} from './agent-evaluation.dto.js';
import {
  AGENT_SCORECARD_VERSION,
  buildAgentScorecard,
} from './agent-scorecard.js';

@Injectable()
export class AgentEvaluationService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  async createFeedback(user: JwtPayload, dto: CreateFeedbackSignalDto) {
    const organizationId = requireOrg(user);
    this.assertStableAttribution(dto);
    const signalType = dto.signalType.trim().toUpperCase();
    const source = dto.source.trim().toUpperCase();
    const externalReference = dto.externalReference.trim();
    if (!signalType || !source || !externalReference) {
      throw new BadRequestException(
        'signalType, source, and externalReference are required',
      );
    }
    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      const run = dto.runId
        ? await tx.agentRun.findFirst({
            where: { id: dto.runId, organizationId },
            select: { id: true, agentType: true },
          })
        : null;
      if (dto.runId && !run) throw new NotFoundException('Agent run not found');

      const [approval, listing, snapshot] = await Promise.all([
        dto.approvalId
          ? tx.actionProposal.findFirst({
              where: { id: dto.approvalId, organizationId },
              select: { id: true },
            })
          : null,
        dto.listingId
          ? tx.listingDraft.findFirst({
              where: { id: dto.listingId, organizationId },
              select: { id: true },
            })
          : null,
        dto.snapshotId
          ? tx.listingPublishSnapshot.findFirst({
              where: { id: dto.snapshotId, organizationId },
              select: {
                id: true,
                listingDraftId: true,
                productLaunch: { select: { agentRunId: true } },
              },
            })
          : null,
      ]);
      if (dto.approvalId && !approval) {
        throw new NotFoundException('Approval proposal not found');
      }
      if (dto.listingId && !listing) {
        throw new NotFoundException('Listing draft not found');
      }
      if (dto.snapshotId && !snapshot) {
        throw new NotFoundException('Publish snapshot not found');
      }
      if (
        dto.listingId &&
        snapshot &&
        snapshot.listingDraftId !== dto.listingId
      ) {
        throw new BadRequestException(
          'listingId does not belong to the supplied snapshotId',
        );
      }
      if (
        dto.runId &&
        snapshot?.productLaunch.agentRunId &&
        snapshot.productLaunch.agentRunId !== dto.runId
      ) {
        throw new BadRequestException(
          'runId does not belong to the supplied snapshotId',
        );
      }
      const existing = await tx.feedbackSignal.findUnique({
        where: {
          organizationId_source_externalReference_signalType: {
            organizationId,
            source,
            externalReference,
            signalType,
          },
        },
      });
      if (existing) return { reused: true, signal: existing };
      const signal = await tx.feedbackSignal.create({
        data: {
          organizationId,
          runId: dto.runId,
          approvalId: dto.approvalId,
          listingId: dto.listingId,
          snapshotId: dto.snapshotId,
          promptVersion: dto.promptVersion,
          modelVersion: dto.modelVersion,
          agentType: dto.agentType ?? run?.agentType,
          signalType,
          source,
          externalReference,
          value: dto.value as Prisma.InputJsonValue,
        },
      });
      return { reused: false, signal };
    });
    if (!result.reused) {
      await this.audit.log({
        organizationId,
        actorId: user.sub,
        action: 'feedback-signal.create',
        resourceType: 'FeedbackSignal',
        resourceId: result.signal.id,
        after: {
          signalType: result.signal.signalType,
          source: result.signal.source,
          externalReference: result.signal.externalReference,
        },
      });
    }
    return result;
  }

  listFeedback(user: JwtPayload, query: ListFeedbackSignalsQueryDto) {
    const organizationId = requireOrg(user);
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.feedbackSignal.findMany({
        where: {
          organizationId,
          ...(query.agentType ? { agentType: query.agentType } : {}),
          ...(query.signalType
            ? { signalType: query.signalType.trim().toUpperCase() }
            : {}),
          ...(query.runId ? { runId: query.runId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
      }),
    );
  }

  async aggregate(user: JwtPayload, dto: AgentEvalWindowDto) {
    const organizationId = requireOrg(user);
    const window = this.parseWindow(dto.from, dto.to);
    const facts = await this.tenantDatabase.run(organizationId, async (tx) => {
      const runs = await tx.agentRun.findMany({
        where: {
          organizationId,
          agentType: dto.agentType,
          createdAt: { gte: window.from, lte: window.to },
        },
        select: {
          id: true,
          status: true,
          attempt: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
        },
      });
      const runIds = runs.map((run) => run.id);
      const feedback = await tx.feedbackSignal.findMany({
        where: {
          organizationId,
          createdAt: { gte: window.from, lte: window.to },
          OR: [
            { agentType: dto.agentType },
            ...(runIds.length > 0 ? [{ runId: { in: runIds } }] : []),
          ],
        },
        select: { runId: true, signalType: true },
      });
      const routeDecisionCount = await tx.routerDecisionLog.count({
        where: {
          organizationId,
          agentType: dto.agentType,
          createdAt: { gte: window.from, lte: window.to },
        },
      });
      return { runs, feedback, routeDecisionCount };
    });
    const scorecard = buildAgentScorecard(facts);
    const snapshot = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentEvalSnapshot.upsert({
        where: {
          organizationId_agentType_windowStart_windowEnd_version: {
            organizationId,
            agentType: dto.agentType,
            windowStart: window.from,
            windowEnd: window.to,
            version: AGENT_SCORECARD_VERSION,
          },
        },
        create: {
          organizationId,
          agentType: dto.agentType,
          windowStart: window.from,
          windowEnd: window.to,
          scores: scorecard as unknown as Prisma.InputJsonValue,
          sampleSize: scorecard.sampleSize,
          coverage: scorecard.coverage,
          version: AGENT_SCORECARD_VERSION,
        },
        update: {
          scores: scorecard as unknown as Prisma.InputJsonValue,
          sampleSize: scorecard.sampleSize,
          coverage: scorecard.coverage,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'agent-eval.aggregate',
      resourceType: 'AgentEvalSnapshot',
      resourceId: snapshot.id,
      after: {
        agentType: dto.agentType,
        sampleSize: snapshot.sampleSize,
        coverage: snapshot.coverage,
        version: snapshot.version,
      },
    });
    return snapshot;
  }

  listScorecards(user: JwtPayload, agentType?: AgentType) {
    const organizationId = requireOrg(user);
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentEvalSnapshot.findMany({
        where: { organizationId, ...(agentType ? { agentType } : {}) },
        orderBy: [{ windowEnd: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
    );
  }

  async createPromptVersion(user: JwtPayload, dto: CreatePromptVersionDto) {
    const organizationId = requireOrg(user);
    const prompt = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.promptTemplate.findFirst({
        where: { id: dto.templateRef, organizationId },
        select: { id: true, content: true },
      }),
    );
    if (!prompt) throw new NotFoundException('Prompt template not found');
    const contentHash = createHash('sha256')
      .update(prompt.content, 'utf8')
      .digest('hex');
    const created = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.promptVersion.create({
        data: {
          organizationId,
          agentType: dto.agentType,
          version: dto.version,
          templateRef: prompt.id,
          contentHash,
          routingWeight: 0,
          status: 'DRAFT',
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          createdBy: user.sub,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'prompt-version.create',
      resourceType: 'PromptVersion',
      resourceId: created.id,
      after: {
        agentType: created.agentType,
        version: created.version,
        contentHash: created.contentHash,
      },
    });
    return created;
  }

  listPromptVersions(user: JwtPayload, agentType?: AgentType) {
    const organizationId = requireOrg(user);
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.promptVersion.findMany({
        where: { organizationId, ...(agentType ? { agentType } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async updatePromptStatus(
    user: JwtPayload,
    id: string,
    dto: UpdatePromptVersionStatusDto,
  ) {
    const organizationId = requireOrg(user);
    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      const prompt = await tx.promptVersion.findFirst({
        where: { id, organizationId },
      });
      if (!prompt) throw new NotFoundException('Prompt version not found');
      this.assertPromptTransition(prompt.status, dto.status);
      if (dto.status === 'CHAMPION') {
        await tx.promptVersion.updateMany({
          where: {
            organizationId,
            agentType: prompt.agentType,
            status: 'CHAMPION',
            id: { not: prompt.id },
          },
          data: { status: 'RETIRED', routingWeight: 0 },
        });
      }
      const routingWeight =
        dto.status === 'CHAMPION'
          ? 1
          : dto.status === 'CHALLENGER'
            ? (dto.routingWeight ?? 0.05)
            : 0;
      return tx.promptVersion.update({
        where: { id: prompt.id },
        data: {
          status: dto.status,
          routingWeight,
          activatedAt:
            dto.status === 'CHAMPION' || dto.status === 'CHALLENGER'
              ? new Date()
              : prompt.activatedAt,
          metadata: {
            ...this.jsonRecord(prompt.metadata),
            lastStatusReason: dto.reason,
            lastStatusActor: user.sub,
          },
        },
      });
    });
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'prompt-version.status.update',
      resourceType: 'PromptVersion',
      resourceId: result.id,
      after: {
        status: result.status,
        routingWeight: result.routingWeight,
        reason: dto.reason,
      },
    });
    return result;
  }

  listRouterDecisions(user: JwtPayload, agentType?: AgentType) {
    const organizationId = requireOrg(user);
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.routerDecisionLog.findMany({
        where: { organizationId, ...(agentType ? { agentType } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  async createBusinessOutcome(user: JwtPayload, dto: CreateBusinessOutcomeDto) {
    const organizationId = requireOrg(user);
    if (!dto.runId && !dto.listingId && !dto.snapshotId && !dto.productId) {
      throw new BadRequestException(
        'Business outcome requires runId, listingId, snapshotId, or productId',
      );
    }
    if (Object.keys(dto.evidence).length === 0) {
      throw new BadRequestException('Business outcome requires real evidence');
    }
    const window = this.parseWindow(dto.periodStart, dto.periodEnd);
    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      if (dto.runId) {
        const run = await tx.agentRun.findFirst({
          where: { id: dto.runId, organizationId },
          select: { id: true, workspaceId: true },
        });
        if (!run) throw new NotFoundException('Agent run not found');
      }
      const existing = await tx.businessOutcome.findUnique({
        where: {
          organizationId_source_externalReference: {
            organizationId,
            source: dto.source,
            externalReference: dto.externalReference,
          },
        },
      });
      if (existing) return { reused: true, outcome: existing };
      const outcome = await tx.businessOutcome.create({
        data: {
          organizationId,
          agentRunId: dto.runId,
          listingDraftId: dto.listingId,
          publishSnapshotId: dto.snapshotId,
          productId: dto.productId,
          source: dto.source.trim().toUpperCase(),
          externalReference: dto.externalReference.trim(),
          periodStart: window.from,
          periodEnd: window.to,
          metrics: dto.metrics as Prisma.InputJsonValue,
          evidence: dto.evidence as Prisma.InputJsonValue,
          confidence: dto.confidence,
        },
      });
      return { reused: false, outcome };
    });
    if (!result.reused) {
      await this.audit.log({
        organizationId,
        actorId: user.sub,
        action: 'business-outcome.recorded',
        resourceType: 'BusinessOutcome',
        resourceId: result.outcome.id,
        after: {
          source: result.outcome.source,
          externalReference: result.outcome.externalReference,
          confidence: result.outcome.confidence,
        },
      });
    }
    return result;
  }

  private assertStableAttribution(dto: CreateFeedbackSignalDto): void {
    if (!dto.runId && !dto.approvalId && !dto.listingId && !dto.snapshotId) {
      throw new BadRequestException(
        'Formal feedback requires runId, approvalId, listingId, or snapshotId',
      );
    }
  }

  private parseWindow(from: string, to: string) {
    const parsed = { from: new Date(from), to: new Date(to) };
    if (parsed.to <= parsed.from) {
      throw new BadRequestException('to must be later than from');
    }
    if (parsed.to.getTime() - parsed.from.getTime() > 366 * 86_400_000) {
      throw new BadRequestException('Evaluation window cannot exceed 366 days');
    }
    return parsed;
  }

  private assertPromptTransition(
    from: PromptVersionStatus,
    to: PromptVersionStatus,
  ): void {
    const allowed: Record<PromptVersionStatus, PromptVersionStatus[]> = {
      DRAFT: ['CHALLENGER', 'RETIRED'],
      CHALLENGER: ['CHAMPION', 'RETIRED'],
      CHAMPION: ['RETIRED'],
      RETIRED: [],
    };
    if (!allowed[from].includes(to)) {
      throw new ConflictException(
        `Prompt version cannot transition from ${from} to ${to}`,
      );
    }
  }

  private jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }
}
