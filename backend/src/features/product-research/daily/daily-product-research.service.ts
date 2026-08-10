import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../../shared/tenancy/org-scope.js';
import {
  DAILY_RESEARCH_SCHEMA_VERSION,
  DEFAULT_RESEARCH_THRESHOLDS,
  DEFAULT_SCORING_WEIGHTS,
} from './contracts/daily-product-research.contract.js';
import { externalCandidateListSchema } from './contracts/external-candidate.contract.js';
import type {
  CandidateDecisionDto,
  CreateScoringVersionDto,
  ListDailyCandidatesQueryDto,
  ListDailyResearchRunsQueryDto,
  ManualDailyResearchRunDto,
  ScoringVersionActionDto,
  UpdateDailyResearchScheduleDto,
} from './daily-product-research.dto.js';
import { BusinessTimeService } from './services/business-time.service.js';
import { ResearchArtifactStoreService } from './reports/research-artifact-store.service.js';
import { DailyProductResearchRuntimePolicyService } from './services/daily-product-research-runtime-policy.service.js';

const CONFIG_VERSION = 'daily-product-research/config-v11';
const SCHEDULE_FLOW_NAME = '[english_textproduct research] evidencetextproduct researchtext';

@Injectable()
export class DailyProductResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly businessTime: BusinessTimeService,
    private readonly artifactStore: ResearchArtifactStoreService,
    private readonly runtimePolicy: DailyProductResearchRuntimePolicyService,
    @InjectQueue('daily-product-research') private readonly queue: Queue,
  ) {}

  async manualRun(user: JwtPayload, dto: ManualDailyResearchRunDto) {
    const organizationId = requireOrg(user);
    if (dto.workspaceId)
      await assertWorkspaceInOrg(this.prisma, organizationId, dto.workspaceId);
    const inputCandidates = externalCandidateListSchema.parse(
      Array.isArray(dto.inputCandidates) ? dto.inputCandidates : [],
    );
    return this.createOrReuseRun({
      organizationId,
      workspaceId: dto.workspaceId ?? null,
      actorId: user.sub,
      trigger: 'MANUAL',
      businessDate: dto.businessDate,
      timezone: dto.timezone,
      candidateLimit: dto.candidateLimit,
      topLimit: dto.topLimit,
      inputCandidates,
    });
  }

  async startFromAutomation(input: {
    organizationId: string;
    workspaceId: string | null;
    actorId: string;
    automationRunId: string;
    timezone?: string;
    explorationKey?: string;
  }) {
    return this.createOrReuseRun({ ...input, trigger: 'SCHEDULE' });
  }

  async listRuns(user: JwtPayload, query: ListDailyResearchRunsQueryDto) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProductResearchRunWhereInput = {
      organizationId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.from || query.to
        ? {
            businessDate: {
              ...(query.from
                ? {
                    gte: this.businessTime.toDatabaseDate(
                      query.from.slice(0, 10),
                    ),
                  }
                : {}),
              ...(query.to
                ? {
                    lte: this.businessTime.toDatabaseDate(
                      query.to.slice(0, 10),
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.tenantDatabase.run(organizationId, (tx) =>
      Promise.all([
        tx.productResearchRun.findMany({
          where,
          include: {
            scoringVersion: { select: { id: true, version: true } },
            _count: { select: { candidates: true, artifacts: true } },
          },
          orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.productResearchRun.count({ where }),
      ]),
    );
    return {
      schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
      items,
      total,
      page,
      limit,
    };
  }

  async getRun(user: JwtPayload, id: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchRun.findFirst({
        where: { id, organizationId },
        include: {
          scoringVersion: true,
          stages: { orderBy: { createdAt: 'asc' } },
          sourceHealth: { orderBy: { source: 'asc' } },
          artifacts: { orderBy: { artifactType: 'asc' } },
          _count: { select: { candidates: true, scores: true } },
        },
      }),
    );
    if (!run)
      throw new NotFoundException('Daily product research run not found');
    return { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION, run };
  }

  async listCandidates(
    user: JwtPayload,
    runId: string,
    query: ListDailyCandidatesQueryDto,
  ) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    await this.assertRun(organizationId, runId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ProductCandidateWhereInput = {
      organizationId,
      researchRunId: runId,
      ...(query.search
        ? { canonicalName: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.decision
        ? { scores: { some: { decision: query.decision as never } } }
        : {}),
    };
    const [items, total] = await this.tenantDatabase.run(organizationId, (tx) =>
      Promise.all([
        tx.productCandidate.findMany({
          where,
          include: {
            scores: { orderBy: { createdAt: 'desc' }, take: 1 },
            risks: { orderBy: { createdAt: 'asc' } },
            _count: { select: { signals: true } },
          },
          orderBy: [
            { status: 'asc' },
            { confidenceScore: 'desc' },
            { id: 'asc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.productCandidate.count({ where }),
      ]),
    );
    return {
      schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
      items: items.map((item) => ({
        ...item,
        capabilities: this.candidateCapabilities(item),
      })),
      total,
      page,
      limit,
    };
  }

  async getCandidate(user: JwtPayload, candidateId: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    const candidate = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productCandidate.findFirst({
        where: { id: candidateId, organizationId },
        include: {
          researchRun: {
            select: {
              id: true,
              businessDate: true,
              scheduleTimezone: true,
              status: true,
            },
          },
          signals: { orderBy: [{ source: 'asc' }, { fetchedAt: 'desc' }] },
          risks: { orderBy: { createdAt: 'asc' } },
          scores: {
            include: { scoringVersion: true },
            orderBy: { createdAt: 'desc' },
          },
          feedback: { orderBy: { eventAt: 'desc' }, take: 50 },
        },
      }),
    );
    if (!candidate) throw new NotFoundException('Product candidate not found');
    return {
      schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
      candidate,
      capabilities: this.candidateCapabilities(candidate),
    };
  }

  async getSourceHealth(user: JwtPayload, runId: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    await this.assertRun(organizationId, runId);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchSourceHealth.findMany({
        where: { researchRunId: runId, organizationId },
        orderBy: { source: 'asc' },
      }),
    );
    return { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION, items };
  }

  async listArtifacts(user: JwtPayload, runId: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    await this.assertRun(organizationId, runId);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.researchReportArtifact.findMany({
        where: { researchRunId: runId, organizationId },
        select: {
          id: true,
          artifactType: true,
          schemaVersion: true,
          contentHash: true,
          byteSize: true,
          createdAt: true,
        },
        orderBy: { artifactType: 'asc' },
      }),
    );
    return { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION, items };
  }

  async getArtifact(user: JwtPayload, runId: string, artifactId: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    await this.assertRun(organizationId, runId);
    const artifact = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.researchReportArtifact.findFirst({
        where: { id: artifactId, researchRunId: runId, organizationId },
      }),
    );
    if (!artifact)
      throw new NotFoundException('Research report artifact not found');
    const content = await this.artifactStore.read(
      artifact.storageKey,
      artifact.contentHash,
    );
    return {
      schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
      artifact: {
        id: artifact.id,
        artifactType: artifact.artifactType,
        schemaVersion: artifact.schemaVersion,
        contentHash: artifact.contentHash,
        byteSize: artifact.byteSize,
        createdAt: artifact.createdAt,
        content,
      },
    };
  }

  async cancelRun(user: JwtPayload, runId: string) {
    const organizationId = requireOrg(user);
    const run = await this.assertRun(organizationId, runId);
    if (!['PENDING', 'RUNNING'].includes(run.status)) {
      throw new ConflictException(
        'Only pending or running research can be cancelled',
      );
    }
    const job = await this.queue.getJob(this.jobId(runId));
    if (job && (await job.isActive()) === false) await job.remove();
    const updated = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchRun.update({
        where: { id: runId },
        data: { status: 'CANCELLED', finishedAt: new Date() },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'daily-product-research.cancel',
      resourceType: 'ProductResearchRun',
      resourceId: runId,
    });
    return updated;
  }

  async listScoringVersions(user: JwtPayload, workspaceId?: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    if (workspaceId)
      await assertWorkspaceInOrg(this.prisma, organizationId, workspaceId);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.scoringVersion.findMany({
        where: { organizationId, workspaceScopeKey: workspaceId ?? 'ORG' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION, items };
  }

  async createScoringVersion(user: JwtPayload, dto: CreateScoringVersionDto) {
    const organizationId = requireOrg(user);
    if (dto.workspaceId)
      await assertWorkspaceInOrg(this.prisma, organizationId, dto.workspaceId);
    this.validateScoringConfiguration(dto.weights, dto.thresholds);
    const version = `v-${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)}-${this.shortHash(dto)}`;
    const created = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.scoringVersion.create({
        data: {
          organizationId,
          workspaceId: dto.workspaceId ?? null,
          workspaceScopeKey: dto.workspaceId ?? 'ORG',
          version,
          status: 'DRAFT',
          weights: dto.weights,
          thresholds: dto.thresholds as Prisma.InputJsonValue,
          reason: dto.reason,
          createdBy: user.sub,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'daily-product-research.scoring-version.create',
      resourceType: 'ScoringVersion',
      resourceId: created.id,
      after: { version, status: 'DRAFT', reason: dto.reason },
    });
    return created;
  }

  async activateScoringVersion(
    user: JwtPayload,
    id: string,
    dto: ScoringVersionActionDto,
  ) {
    const organizationId = requireOrg(user);
    const activated = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const target = await tx.scoringVersion.findFirst({
          where: { id, organizationId },
        });
        if (!target) throw new NotFoundException('Scoring version not found');
        await tx.scoringVersion.updateMany({
          where: {
            organizationId,
            workspaceScopeKey: target.workspaceScopeKey,
            status: 'ACTIVE',
            id: { not: target.id },
          },
          data: { status: 'RETIRED', retiredAt: new Date() },
        });
        return tx.scoringVersion.update({
          where: { id: target.id },
          data: {
            status: 'ACTIVE',
            activatedBy: user.sub,
            activatedAt: new Date(),
            retiredAt: null,
            reason: `${target.reason}\nActivation: ${dto.reason}`.slice(
              0,
              2000,
            ),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'daily-product-research.scoring-version.activate',
      resourceType: 'ScoringVersion',
      resourceId: id,
      after: { reason: dto.reason },
    });
    return activated;
  }

  async rollbackScoringVersion(
    user: JwtPayload,
    id: string,
    dto: ScoringVersionActionDto,
  ) {
    const organizationId = requireOrg(user);
    const source = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.scoringVersion.findFirst({ where: { id, organizationId } }),
    );
    if (!source) throw new NotFoundException('Scoring version not found');
    const draft = await this.createScoringVersion(user, {
      workspaceId: source.workspaceId ?? undefined,
      reason: `Rollback from ${source.version}: ${dto.reason}`,
      weights: this.recordNumber(source.weights),
      thresholds: this.record(source.thresholds),
    });
    return this.activateScoringVersion(user, draft.id, dto);
  }

  async getSchedule(user: JwtPayload, workspaceId?: string) {
    const organizationId = requireOrg(user);
    this.assertCanRead(user, organizationId);
    if (workspaceId)
      await assertWorkspaceInOrg(this.prisma, organizationId, workspaceId);
    const flow = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.automationFlow.findFirst({
        where: {
          organizationId,
          dedupeKey: this.scheduleDedupeKey(workspaceId ?? null),
        },
      }),
    );
    return {
      enabled:
        flow?.status === 'ACTIVE' &&
        this.runtimePolicy.policyFor(organizationId).schedulerAllowed,
      flowId: flow?.id ?? null,
      nextRunAt: flow?.nextRunAt ?? null,
      runtime: this.runtimePolicy.policyFor(organizationId),
      triggerConfig: flow?.triggerConfig ?? {
        source: 'daily_product_research',
        dailyAt: '08:00',
        timezone: 'Asia/Shanghai',
      },
    };
  }

  async updateSchedule(user: JwtPayload, dto: UpdateDailyResearchScheduleDto) {
    const organizationId = requireOrg(user);
    if (dto.workspaceId)
      await assertWorkspaceInOrg(this.prisma, organizationId, dto.workspaceId);
    const runtime = dto.enabled
      ? this.runtimePolicy.assertCanEnableSchedule(organizationId)
      : this.runtimePolicy.policyFor(organizationId);
    const timezone = dto.timezone ?? 'Asia/Shanghai';
    const dailyAt = dto.localTime ?? '08:00';
    this.businessTime.validateTimezone(timezone);
    const nextRunAt = dto.enabled
      ? this.businessTime.nextDailyOccurrence(new Date(), timezone, dailyAt)
      : null;
    const dedupeKey = this.scheduleDedupeKey(dto.workspaceId ?? null);
    const flow = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.automationFlow.upsert({
        where: { organizationId_dedupeKey: { organizationId, dedupeKey } },
        create: {
          dedupeKey,
          organizationId,
          workspaceId: dto.workspaceId ?? null,
          name: SCHEDULE_FLOW_NAME,
          description:
            'english_textevidencetextproduct research。english_textreport、notificationtexthumanreviewtask，english_textstoreenglish_text。',
          status: dto.enabled ? 'ACTIVE' : 'PAUSED',
          triggerType: 'SCHEDULE',
          triggerConfig: {
            source: 'daily_product_research',
            dailyAt,
            timezone,
            schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          },
          steps: [
            {
              key: 'daily-product-research',
              action: 'product.research.daily',
              workspaceId: dto.workspaceId ?? null,
            },
          ],
          nextRunAt,
          createdBy: user.sub,
        },
        update: {
          workspaceId: dto.workspaceId ?? null,
          status: dto.enabled ? 'ACTIVE' : 'PAUSED',
          triggerConfig: {
            source: 'daily_product_research',
            dailyAt,
            timezone,
            schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          },
          nextRunAt,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'daily-product-research.schedule.update',
      resourceType: 'AutomationFlow',
      resourceId: flow.id,
      after: {
        enabled: dto.enabled,
        dailyAt,
        timezone,
        nextRunAt,
        mode: runtime.mode,
      },
    });
    return flow;
  }

  async approveForDevelopment(
    user: JwtPayload,
    candidateId: string,
    dto: CandidateDecisionDto,
  ) {
    const organizationId = requireOrg(user);
    this.runtimePolicy.assertCanCreateInternalAction(organizationId);
    const candidate = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productCandidate.findFirst({
        where: { id: candidateId, organizationId },
        include: {
          scores: { orderBy: { createdAt: 'desc' }, take: 1 },
          risks: true,
        },
      }),
    );
    if (!candidate) throw new NotFoundException('Product candidate not found');
    if (!candidate.workspaceId)
      throw new BadRequestException(
        'A workspace is required to create a development task',
      );
    const workspaceId = candidate.workspaceId;
    const score = candidate.scores[0];
    if (
      !score ||
      score.decision !== 'TEST_NOW' ||
      score.hardGateReasons.length > 0
    ) {
      throw new ConflictException(
        'Candidate has not passed all development gates',
      );
    }
    if (candidate.risks.some((risk) => risk.severity !== 'LOW')) {
      throw new ConflictException(
        'Candidate risk requires separate human review',
      );
    }

    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      const existing = await tx.productFeedback.findFirst({
        where: {
          organizationId,
          candidateId,
          source: 'human_approval',
          externalReference: candidateId,
          eventType: 'APPROVED_FOR_DEVELOPMENT',
        },
      });
      if (existing)
        return {
          reused: true,
          feedback: existing,
          taskId: this.record(existing.metadata).taskId ?? null,
        };
      const task = await tx.teamTask.create({
        data: {
          organizationId,
          workspaceId,
          title: `english_text：${candidate.canonicalName}`.slice(0, 200),
          description:
            `source：english_textproduct research ${candidate.researchRunId}\ntext：${candidate.id}\nhumanenglish_text：${dto.reason}`.slice(
              0,
              2000,
            ),
          priority: 'HIGH',
          status: 'TODO',
          createdBy: user.sub,
        },
      });
      const feedback = await tx.productFeedback.create({
        data: {
          organizationId,
          workspaceId,
          candidateId,
          eventType: 'APPROVED_FOR_DEVELOPMENT',
          eventAt: new Date(),
          source: 'human_approval',
          externalReference: candidateId,
          metadata: { taskId: task.id, reason: dto.reason, actorId: user.sub },
        },
      });
      return { reused: false, feedback, taskId: task.id };
    });
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'daily-product-research.candidate.approve-development',
      resourceType: 'ProductCandidate',
      resourceId: candidateId,
      after: {
        reason: dto.reason,
        taskId: result.taskId,
        externalStoreMutation: false,
      },
    });
    return { ...result, action: { externalStoreMutation: 'not_executed' } };
  }

  async rejectCandidate(
    user: JwtPayload,
    candidateId: string,
    dto: CandidateDecisionDto,
  ) {
    const organizationId = requireOrg(user);
    const candidate = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productCandidate.findFirst({
        where: { id: candidateId, organizationId },
      }),
    );
    if (!candidate) throw new NotFoundException('Product candidate not found');
    if (!candidate.workspaceId)
      throw new BadRequestException(
        'A workspace is required to record feedback',
      );
    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      const existing = await tx.productFeedback.findFirst({
        where: {
          organizationId,
          candidateId,
          source: 'human_rejection',
          externalReference: candidateId,
          eventType: 'REJECTED_BY_HUMAN',
        },
      });
      if (existing) return { reused: true, feedback: existing };
      await tx.productCandidate.update({
        where: { id: candidateId },
        data: { status: 'REJECTED' },
      });
      const feedback = await tx.productFeedback.create({
        data: {
          organizationId,
          workspaceId: candidate.workspaceId!,
          candidateId,
          eventType: 'REJECTED_BY_HUMAN',
          eventAt: new Date(),
          source: 'human_rejection',
          externalReference: candidateId,
          metadata: { reason: dto.reason, actorId: user.sub },
        },
      });
      return { reused: false, feedback };
    });
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'daily-product-research.candidate.reject',
      resourceType: 'ProductCandidate',
      resourceId: candidateId,
      after: { reason: dto.reason },
    });
    return result;
  }

  private async createOrReuseRun(input: {
    organizationId: string;
    workspaceId: string | null;
    actorId: string;
    trigger: 'SCHEDULE' | 'MANUAL' | 'RETRY' | 'BACKFILL';
    automationRunId?: string;
    businessDate?: string;
    timezone?: string;
    candidateLimit?: number;
    topLimit?: number;
    inputCandidates?: unknown[];
    explorationKey?: string;
  }) {
    const runtime = this.runtimePolicy.assertCanCreateRun({
      organizationId: input.organizationId,
      trigger: input.trigger,
      manualCandidateCount: input.inputCandidates?.length ?? 0,
    });
    const timezone =
      input.timezone ??
      this.config.get<string>('DAILY_PRODUCT_RESEARCH_TIMEZONE') ??
      'Asia/Shanghai';
    this.businessTime.validateTimezone(timezone);
    const businessDate =
      input.businessDate ??
      this.businessTime.businessDate(new Date(), timezone);
    const candidateLimit =
      input.candidateLimit ??
      Number(this.config.get('DAILY_PRODUCT_RESEARCH_CANDIDATE_LIMIT', 300));
    const topLimit =
      input.topLimit ??
      Number(this.config.get('DAILY_PRODUCT_RESEARCH_TOP_LIMIT', 10));
    if (
      !Number.isInteger(candidateLimit) ||
      candidateLimit < 1 ||
      candidateLimit > 300
    ) {
      throw new BadRequestException('candidateLimit must be between 1 and 300');
    }
    if (!Number.isInteger(topLimit) || topLimit < 1 || topLimit > 10) {
      throw new BadRequestException('topLimit must be between 1 and 10');
    }
    const scoringVersion = await this.ensureActiveScoringVersion(
      input.organizationId,
      input.workspaceId,
      input.actorId,
    );
    const supplierImageSearchEnabled =
      runtime.realConnectorsAllowed &&
      this.config.get<boolean>(
        'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED',
        false,
      ) === true;
    const supplierImageSearchCandidateLimit = Number(
      this.config.get('SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT', 10),
    );
    if (
      !Number.isInteger(supplierImageSearchCandidateLimit) ||
      supplierImageSearchCandidateLimit < 1 ||
      supplierImageSearchCandidateLimit > 10
    ) {
      throw new BadRequestException(
        'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT must be between 1 and 10',
      );
    }
    const configSnapshot = {
      schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
      runtime,
      dryRun: runtime.mode === 'DRY_RUN',
      thresholds: scoringVersion.thresholds,
      candidateLimit,
      topLimit,
      enabledSources: [
        'manual_import',
        ...(runtime.realConnectorsAllowed
          ? ['global_marketplace_discovery', 'ozon_verified_evidence_cache']
          : []),
        ...(supplierImageSearchEnabled ? ['supplier_image_search'] : []),
      ],
      supplierImageSearch: {
        enabled: supplierImageSearchEnabled,
        candidateLimit: supplierImageSearchCandidateLimit,
      },
      inputCandidates: input.inputCandidates ?? [],
      ...(input.explorationKey ? { explorationKey: input.explorationKey } : {}),
    };
    const digestInput = input.explorationKey
      ? {
          inputCandidates: input.inputCandidates ?? [],
          explorationKey: input.explorationKey,
        }
      : (input.inputCandidates ?? []);
    const inputDigest = createHash('sha256')
      .update(JSON.stringify(digestInput))
      .digest('hex')
      .slice(0, 16);
    const configVersion = `${CONFIG_VERSION}:${runtime.mode}:${Number(runtime.realConnectorsAllowed)}:supplier-image-search-${supplierImageSearchEnabled ? 'on' : 'off'}-limit-${supplierImageSearchCandidateLimit}:${scoringVersion.id}:${candidateLimit}:${topLimit}:${inputDigest}`;
    const runKey = {
      organizationId: input.organizationId,
      workspaceScopeKey: input.workspaceId ?? 'ORG',
      businessDate: this.businessTime.toDatabaseDate(businessDate),
      configVersion,
    };
    const run = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const existing = await tx.productResearchRun.findFirst({
          where: runKey,
          orderBy: { attempt: 'desc' },
        });
        if (
          existing &&
          existing.status !== 'FAILED' &&
          existing.status !== 'CANCELLED'
        ) {
          return { run: existing, reused: true };
        }
        const attempt = existing ? existing.attempt + 1 : 0;
        const created = await tx.productResearchRun.create({
          data: {
            ...runKey,
            attempt,
            workspaceId: input.workspaceId,
            automationRunId: input.automationRunId ?? null,
            scheduleTimezone: timezone,
            trigger: input.trigger,
            status: 'PENDING',
            configSnapshot: configSnapshot as Prisma.InputJsonValue,
            scoringVersionId: scoringVersion.id,
            candidateLimit,
            topLimit,
            createdBy: input.actorId,
          },
        });
        return { run: created, reused: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!run.reused) {
      await this.queue.add(
        'run',
        {
          schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          researchRunId: run.run.id,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          trigger: input.trigger,
        },
        { jobId: this.jobId(run.run.id) },
      );
      await this.audit.log({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'daily-product-research.run.create',
        resourceType: 'ProductResearchRun',
        resourceId: run.run.id,
        after: {
          trigger: input.trigger,
          businessDate,
          mode: runtime.mode,
          realConnectorsAllowed: runtime.realConnectorsAllowed,
          externalStoreMutation: false,
        },
      });
    }
    return { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION, ...run };
  }

  private async ensureActiveScoringVersion(
    organizationId: string,
    workspaceId: string | null,
    actorId: string,
  ) {
    const scope = workspaceId ?? 'ORG';
    const existing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.scoringVersion.findFirst({
        where: { organizationId, workspaceScopeKey: scope, status: 'ACTIVE' },
      }),
    );
    if (existing) return existing;
    try {
      return await this.tenantDatabase.run(organizationId, (tx) =>
        tx.scoringVersion.create({
          data: {
            organizationId,
            workspaceId,
            workspaceScopeKey: scope,
            version: 'system-default-v1',
            status: 'ACTIVE',
            weights: DEFAULT_SCORING_WEIGHTS,
            thresholds: DEFAULT_RESEARCH_THRESHOLDS,
            reason: 'System default evidence-first scoring configuration',
            createdBy: actorId,
            activatedBy: actorId,
            activatedAt: new Date(),
          },
        }),
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const concurrent = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.scoringVersion.findFirst({
          where: { organizationId, workspaceScopeKey: scope, status: 'ACTIVE' },
        }),
      );
      if (!concurrent) throw error;
      return concurrent;
    }
  }

  private async assertRun(organizationId: string, runId: string) {
    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchRun.findFirst({ where: { id: runId, organizationId } }),
    );
    if (!run)
      throw new NotFoundException('Daily product research run not found');
    return run;
  }

  private candidateCapabilities(candidate: {
    scores?: Array<{ decision: string; hardGateReasons: string[] }>;
    risks?: Array<{ severity: string }>;
  }) {
    const score = candidate.scores?.[0];
    const blockingRisk = candidate.risks?.find(
      (risk) => risk.severity !== 'LOW',
    );
    const allowedActions: string[] = ['view_evidence', 'reject_candidate'];
    const blockedActions: Array<{ action: string; reason: string }> = [];
    if (
      score?.decision === 'TEST_NOW' &&
      score.hardGateReasons.length === 0 &&
      !blockingRisk
    ) {
      allowedActions.push('create_internal_development_task');
    } else {
      blockedActions.push({
        action: 'create_internal_development_task',
        reason: blockingRisk
          ? `Risk ${blockingRisk.severity} requires review`
          : 'Candidate has not passed every evidence, profit, and hard gate',
      });
    }
    blockedActions.push(
      {
        action: 'publish_to_marketplace',
        reason: 'Separate human approval and platform adapter are required',
      },
      {
        action: 'change_price',
        reason: 'External price changes are outside this approval scope',
      },
      {
        action: 'start_ads',
        reason: 'Advertising changes require a separate approval scope',
      },
    );
    return {
      allowedActions,
      blockedActions,
      externalStoreMutation: false as const,
    };
  }

  private validateScoringConfiguration(
    weights: Record<string, number>,
    thresholds: Record<string, unknown>,
  ) {
    const required = Object.keys(DEFAULT_SCORING_WEIGHTS);
    if (
      Object.keys(weights).sort().join('|') !== [...required].sort().join('|')
    ) {
      throw new BadRequestException(
        'Scoring weights must contain exactly the nine supported components',
      );
    }
    const total = Object.values(weights).reduce(
      (sum, value) => sum + Number(value),
      0,
    );
    if (
      !Object.values(weights).every(
        (value) => Number.isFinite(value) && value >= 0,
      ) ||
      Math.abs(total - 100) > 0.0001
    ) {
      throw new BadRequestException(
        'Scoring weights must be non-negative and sum to 100',
      );
    }
    for (const key of ['testNow', 'watch', 'hold']) {
      if (!Number.isFinite(Number(thresholds[key])))
        throw new BadRequestException(`Threshold ${key} is required`);
    }
    if (!(
      Number(thresholds.testNow) > Number(thresholds.watch) &&
      Number(thresholds.watch) > Number(thresholds.hold)
    )) {
      throw new BadRequestException(
        'Decision thresholds must be strictly descending',
      );
    }
  }

  private scheduleDedupeKey(workspaceId: string | null) {
    return `daily-product-research:${workspaceId ?? 'ORG'}`;
  }

  private assertCanRead(user: JwtPayload, organizationId: string) {
    const role = (user.role ?? 'MEMBER').toUpperCase();
    if (
      !this.runtimePolicy.policyFor(organizationId).visibleToMembers &&
      !['OWNER', 'ADMIN'].includes(role)
    ) {
      throw new ForbiddenException(
        'Daily product research is only visible to administrators in the current rollout mode',
      );
    }
  }

  private jobId(runId: string) {
    return `daily-product-research-${runId}`;
  }

  private shortHash(value: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex')
      .slice(0, 8);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private recordNumber(value: unknown): Record<string, number> {
    return Object.fromEntries(
      Object.entries(this.record(value)).map(([key, item]) => [
        key,
        Number(item),
      ]),
    );
  }
}
