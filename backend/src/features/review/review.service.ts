import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import type { ReviewStatus, ReviewEntityType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { AgentMemoryService } from '../agent-memory/agent-memory.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  CreateReviewTaskDto,
  ReviewListQueryDto,
  UpdateReviewDto,
} from './review.dto.js';
import { ListingBundleService } from '../listings/listing-bundle.service.js';
import { ListingEvaluatorService } from '../listings/listing-evaluator.service.js';
import { SupplyChainService } from '../supply-chain/supply-chain.service.js';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('review-notifications')
    private readonly reviewNotificationQueue: Queue,
    private readonly agentMemory: AgentMemoryService,
    private readonly listingBundles: ListingBundleService,
    private readonly listingEvaluator: ListingEvaluatorService,
    private readonly supplyChain: SupplyChainService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrg(user: JwtPayload): string {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    return user.orgId;
  }

  /**
   * Create a review task after an agent run completes.
   * Called from worker context (no JwtPayload available).
   */
  async createFromAgentRun(
    orgId: string,
    dto: CreateReviewTaskDto,
  ): Promise<{
    id: string;
    status: string;
    autoApproved: boolean;
    score: number | null;
    threshold: number;
  }> {
    const score = dto.score ?? null;
    const threshold = dto.threshold ?? 60;
    const approvalScope =
      dto.entityType === 'LISTING_DRAFT'
        ? await this.captureListingApprovalScope(orgId, dto.entityId)
        : {};
    // Product research candidates always require a human to inspect the
    // source evidence and explicitly authorize the image/publishing flow.
    const autoApproved =
      dto.entityType !== 'PRODUCT_RESEARCH' &&
      dto.entityType !== 'LISTING_DRAFT' &&
      score !== null &&
      score >= threshold;

    const reviewTask = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.create({
        data: {
          organizationId: orgId,
          entityType: dto.entityType as
            | 'AGENT_RUN'
            | 'IMAGE_GENERATION'
            | 'LISTING_DRAFT'
            | 'PRODUCT_RESEARCH',
          entityId: dto.entityId,
          status: autoApproved ? 'APPROVED' : 'PENDING',
          score,
          threshold,
          autoApproved,
          autoRegenerations: 0,
          approvalScope: approvalScope as Prisma.InputJsonValue,
        },
      }),
    );

    if (score !== null && score < threshold) {
      await this.learnFromLowScoreReview(orgId, {
        id: reviewTask.id,
        entityType: reviewTask.entityType,
        score,
        threshold,
      });
    }

    // If score is very low (< 30) trigger urgent review notification
    if (score !== null && score < 30) {
      await this.reviewNotificationQueue.add('notification', {
        organizationId: orgId,
        userId: '',
        type: 'APPROVAL_REQUIRED',
        title: 'Low consistency score — review required',
        body: `Review task ${reviewTask.id} for ${dto.entityType} ${dto.entityId} scored ${score} (below threshold ${threshold}).`,
        metadata: {
          reviewTaskId: reviewTask.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          score,
          threshold,
          urgent: true,
        },
      });
    }

    // If below threshold but not urgent, still create approval notification
    if (!autoApproved && (score === null || score >= 30)) {
      await this.reviewNotificationQueue.add('notification', {
        organizationId: orgId,
        userId: '',
        type: 'APPROVAL_REQUIRED',
        title: 'Content pending review',
        body: `Review task ${reviewTask.id} for ${dto.entityType} ${dto.entityId} requires approval.`,
        metadata: {
          reviewTaskId: reviewTask.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          score,
          threshold,
          urgent: false,
        },
      });
    }

    return {
      id: reviewTask.id,
      status: reviewTask.status,
      autoApproved: reviewTask.autoApproved,
      score: reviewTask.score,
      threshold: reviewTask.threshold,
    };
  }

  /** List review tasks with org-scoped filtering. */
  async findAll(user: JwtPayload, query: ReviewListQueryDto) {
    const orgId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ReviewTaskWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status as ReviewStatus } : {}),
      ...(query.entityType
        ? { entityType: query.entityType as ReviewEntityType }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.reviewTask.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.reviewTask.count({ where }),
      ]),
    );

    return {
      items: await Promise.all(
        items.map((item) => this.enrichReviewTask(orgId, item)),
      ),
      total,
      page,
      limit,
    };
  }

  /** Get a single review task (org-scoped). */
  async findOne(user: JwtPayload, id: string) {
    const orgId = this.requireOrg(user);
    const task = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!task) {
      throw new NotFoundException('Review task not found');
    }
    return this.enrichReviewTask(orgId, task);
  }

  /**
   * Update review task — approve, reject, or request rework.
   * Logs an audit trail entry.
   */
  async update(user: JwtPayload, id: string, dto: UpdateReviewDto) {
    const orgId = this.requireOrg(user);
    const task = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!task) {
      throw new NotFoundException('Review task not found');
    }

    if (task.entityType === 'PRODUCT_RESEARCH' && dto.status === 'APPROVED') {
      throw new BadRequestException(
        'Product research approval requires explicit product launch confirmation',
      );
    }
    if (task.entityType === 'AGENT_RUN' && dto.status === 'APPROVED') {
      const agentRun = await this.tenantDatabase.run(orgId, (tx) =>
        tx.agentRun.findFirst({
          where: { id: task.entityId, organizationId: orgId },
          select: { status: true, errorCode: true },
        }),
      );
      if (!agentRun) {
        throw new NotFoundException('Agent run not found');
      }
      if (agentRun.status !== 'COMPLETED') {
        throw new BadRequestException({
          code: 'AGENT_RUN_NOT_APPROVABLE',
          message:
            'failedtextcompletedtextagenttaskenglish_textpassed，english_text“text”text“english_text”。',
          agentRunStatus: agentRun.status,
          errorCode: agentRun.errorCode,
        });
      }
    }
    if (task.entityType === 'LISTING_DRAFT' && dto.status === 'APPROVED') {
      return this.approveListingReview(user, task, dto.notes);
    }
    if (task.entityType === 'SUPPLY_PLAN') {
      await this.supplyChain.decide(user, task.entityId, {
        decision: dto.status === 'APPROVED' ? 'APPROVE' : 'REJECT',
        reason: dto.notes,
      });
      return this.findOne(user, task.id);
    }

    const before = { status: task.status, notes: task.notes };

    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.update({
        where: { id: task.id },
        data: {
          status: dto.status as 'APPROVED' | 'REJECTED' | 'REWORK',
          notes: dto.notes ?? task.notes,
          reviewedAt: new Date(),
          assignedTo: user.sub,
        },
      }),
    );

    // Log audit trail
    await this.audit.appendStrict({
      organizationId: orgId,
      actorId: user.sub,
      action: `REVIEW_${dto.status}`,
      resourceType: 'REVIEW_TASK',
      resourceId: task.id,
      before,
      after: {
        status: updated.status,
        notes: updated.notes,
        reviewedAt: updated.reviewedAt,
      },
    });

    await this.updateWorkMemoryReviewOutcome(orgId, {
      entityType: updated.entityType,
      entityId: updated.entityId,
      status: updated.status,
      notes: updated.notes,
    });

    // If approved, update the original entity status (if applicable)
    if (dto.status === 'APPROVED') {
      await this.updateOriginalEntityStatus(orgId, task);
    }

    // If rejected or rework, notify the original entity creator
    if (dto.status === 'REJECTED' || dto.status === 'REWORK') {
      await this.learnFromRejectedReview(orgId, {
        id: updated.id,
        entityType: updated.entityType,
        score: updated.score,
        notes: updated.notes,
      });
      await this.reviewNotificationQueue.add('notification', {
        organizationId: orgId,
        userId: '',
        type: 'APPROVAL_REQUIRED',
        title:
          dto.status === 'REJECTED'
            ? 'Content rejected — needs revision'
            : 'Rework requested',
        body: `Review task ${task.id} for ${task.entityType} ${task.entityId} was ${dto.status.toLowerCase()}.${dto.notes ? ` Notes: ${dto.notes}` : ''}`,
        metadata: {
          reviewTaskId: task.id,
          entityType: task.entityType,
          entityId: task.entityId,
          action: dto.status,
          notes: dto.notes,
        },
      });
    }

    return updated;
  }

  private async captureListingApprovalScope(
    organizationId: string,
    listingDraftId: string,
  ): Promise<Record<string, unknown>> {
    const listing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingDraft.findFirst({
        where: { id: listingDraftId, organizationId },
        select: {
          id: true,
          schemaVersion: true,
          bundle: true,
          contentHash: true,
          approvalHash: true,
        },
      }),
    );
    if (!listing) {
      throw new NotFoundException('Listing draft not found');
    }
    const bundle = this.listingBundles.parseStoredBundle(listing.bundle);
    if (!bundle || !listing.contentHash || !listing.approvalHash) {
      throw new BadRequestException({
        code: 'LISTING_SCOPE_UNAVAILABLE',
        message:
          'Listing must have valid content and complete approval hashes before review.',
      });
    }
    const computedHash = this.listingBundles.computeOutputSha256(bundle);
    const approvalHash = this.listingBundles.computeApprovalSha256(bundle);
    if (
      computedHash !== listing.contentHash ||
      computedHash !== bundle.provenance.outputSha256 ||
      approvalHash !== listing.approvalHash
    ) {
      throw new BadRequestException({
        code: 'LISTING_PROVENANCE_INVALID',
        message: 'Listing content does not match its recorded provenance hash.',
      });
    }
    return {
      type: 'listing-content/v2',
      listingDraftId: listing.id,
      contentSha256: computedHash,
      listingSha256: approvalHash,
      schemaVersion: listing.schemaVersion,
      capturedAt: new Date().toISOString(),
    };
  }

  private async approveListingReview(
    user: JwtPayload,
    task: {
      id: string;
      organizationId: string;
      entityId: string;
      notes: string | null;
      status: ReviewStatus;
    },
    notes?: string,
  ) {
    const organizationId = this.requireOrg(user);
    return this.prisma.$transaction(async (tx) => {
      const currentTask = await tx.reviewTask.findFirst({
        where: {
          id: task.id,
          organizationId,
          entityType: 'LISTING_DRAFT',
        },
      });
      if (!currentTask) {
        throw new NotFoundException('Review task not found');
      }
      const scope = this.asRecord(currentTask.approvalScope);
      const scopeHash = this.asOptionalString(scope.contentSha256);
      const scopeListingHash = this.asOptionalString(scope.listingSha256);
      if (
        scope.type !== 'listing-content/v2' ||
        scope.listingDraftId !== currentTask.entityId ||
        !scopeHash ||
        !scopeListingHash
      ) {
        throw new BadRequestException({
          code: 'LISTING_APPROVAL_SCOPE_MISSING',
          message:
            'Review task is not bound to a complete listing approval hash.',
        });
      }

      const listing = await tx.listingDraft.findFirst({
        where: { id: currentTask.entityId, organizationId },
      });
      if (!listing) {
        throw new NotFoundException('Listing draft not found');
      }
      if (
        listing.contentHash !== scopeHash ||
        listing.approvalHash !== scopeListingHash
      ) {
        throw new BadRequestException({
          code: 'LISTING_CHANGED_AFTER_REVIEW',
          message:
            'Listing changed after review creation. Create a new review task.',
        });
      }
      const bundle = this.listingBundles.parseStoredBundle(listing.bundle);
      if (!bundle) {
        throw new BadRequestException({
          code: 'LISTING_BUNDLE_INVALID',
          message: 'Stored Listing Bundle failed runtime validation.',
        });
      }
      const computedHash = this.listingBundles.computeOutputSha256(bundle);
      const computedListingHash =
        this.listingBundles.computeApprovalSha256(bundle);
      if (
        computedHash !== scopeHash ||
        bundle.provenance.outputSha256 !== scopeHash ||
        computedListingHash !== scopeListingHash
      ) {
        throw new BadRequestException({
          code: 'LISTING_CHANGED_AFTER_REVIEW',
          message: 'Listing provenance no longer matches the reviewed content.',
        });
      }

      const approvedAt = new Date();
      const approval = {
        approved: true as const,
        approvedBy: user.sub,
        approvedAt: approvedAt.toISOString(),
      };
      const evaluation = this.listingEvaluator.evaluate(bundle, { approval });
      if (evaluation.outcome !== 'QUALIFIED') {
        throw new BadRequestException({
          code: 'LISTING_NOT_QUALIFIED',
          message: 'Listing still has blocking or review requirements.',
          evaluation,
        });
      }

      const listingUpdate = await tx.listingDraft.updateMany({
        where: {
          id: listing.id,
          organizationId,
          contentHash: scopeHash,
          approvalHash: scopeListingHash,
        },
        data: {
          status: 'APPROVED',
          evaluationResult: evaluation as unknown as Prisma.InputJsonValue,
          score: evaluation.score,
        },
      });
      if (listingUpdate.count !== 1) {
        throw new BadRequestException({
          code: 'LISTING_CHANGED_DURING_APPROVAL',
          message: 'Listing changed during approval. No approval was recorded.',
        });
      }

      const decisionEvidence = {
        type: 'listing-approval/v2',
        approvedContentSha256: scopeHash,
        approvedListingSha256: scopeListingHash,
        approvedBy: user.sub,
        approvedAt: approvedAt.toISOString(),
        evaluatorVersion: evaluation.evaluatorVersion,
        evaluatorOutcome: evaluation.outcome,
        evaluatorScore: evaluation.score,
      };
      const updated = await tx.reviewTask.update({
        where: { id: currentTask.id },
        data: {
          status: 'APPROVED',
          notes: notes ?? currentTask.notes,
          reviewedAt: approvedAt,
          assignedTo: user.sub,
          score: evaluation.score,
          decisionEvidence: decisionEvidence,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.sub,
          action: 'REVIEW_APPROVED',
          resourceType: 'REVIEW_TASK',
          resourceId: currentTask.id,
          before: { status: currentTask.status, notes: currentTask.notes },
          after: {
            status: 'APPROVED',
            notes: updated.notes,
            reviewedAt: approvedAt,
            decisionEvidence,
          },
        },
      });
      return updated;
    });
  }

  private async updateWorkMemoryReviewOutcome(
    orgId: string,
    task: {
      entityType: string;
      entityId: string;
      status: string;
      notes: string | null;
    },
  ): Promise<void> {
    if (task.entityType !== 'AGENT_RUN') {
      return;
    }
    try {
      await this.agentMemory.updateReviewOutcome({
        organizationId: orgId,
        agentRunId: task.entityId,
        reviewStatus: task.status,
        reviewNotes: task.notes,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update work memory review outcome for ${task.entityId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async learnFromRejectedReview(
    orgId: string,
    task: {
      id: string;
      entityType: string;
      score: number | null;
      notes: string | null;
    },
  ): Promise<void> {
    const notes = task.notes?.trim();
    if (!notes) {
      return;
    }
    await this.writeExperienceCard({
      orgId,
      sourceReviewTaskId: task.id,
      entityType: task.entityType,
      score: task.score,
      notes,
    });
  }

  private async learnFromLowScoreReview(
    orgId: string,
    task: {
      id: string;
      entityType: string;
      score: number;
      threshold: number;
    },
  ): Promise<void> {
    await this.writeExperienceCard({
      orgId,
      sourceReviewTaskId: `${task.id}:low-score`,
      entityType: task.entityType,
      score: task.score,
      notes: `Low consistency score ${task.score} below threshold ${task.threshold}.`,
    });
  }

  private async writeExperienceCard(input: {
    orgId: string;
    sourceReviewTaskId: string;
    entityType: string;
    score: number | null;
    notes: string;
  }): Promise<void> {
    try {
      await this.agentMemory.learnFromReview({
        organizationId: input.orgId,
        sourceReviewTaskId: input.sourceReviewTaskId,
        taskType: this.taskTypeFromEntity(input.entityType),
        entityType: input.entityType,
        score: input.score,
        notes: input.notes,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write review learning card for ${input.sourceReviewTaskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private taskTypeFromEntity(entityType: string): string {
    switch (entityType) {
      case 'IMAGE_GENERATION':
        return 'IMAGE_CREATIVE';
      case 'LISTING_DRAFT':
        return 'LISTING_OPTIMIZER';
      case 'PRODUCT_RESEARCH':
        return 'PRODUCT_RESEARCHER';
      default:
        return 'GENERAL_ASSISTANT';
    }
  }

  private async enrichReviewTask<
    T extends {
      entityType: string;
      entityId: string;
      organizationId: string;
    },
  >(orgId: string, task: T) {
    switch (task.entityType) {
      case 'AGENT_RUN': {
        const agentRun = await this.tenantDatabase.run(orgId, (tx) =>
          tx.agentRun.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(agentRun),
          entityLoadError: agentRun
            ? null
            : 'text AgentRun english_text。',
          agentRun,
        };
      }
      case 'IMAGE_GENERATION': {
        const imageProject = await this.tenantDatabase.run(orgId, (tx) =>
          tx.imagePromptProject.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(imageProject),
          entityLoadError: imageProject
            ? null
            : 'textimageenglish_text。',
          imageProject,
        };
      }
      case 'LISTING_DRAFT': {
        const listingDraft = await this.tenantDatabase.run(orgId, (tx) =>
          tx.listingDraft.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(listingDraft),
          entityLoadError: listingDraft
            ? null
            : 'text Listing english_text。',
          listingDraft,
        };
      }
      case 'PRODUCT_RESEARCH': {
        const productResearch = await this.tenantDatabase.run(orgId, (tx) =>
          tx.productResearchReport.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        const productResearchPreview = productResearch
          ? await this.buildProductResearchPreview(
              orgId,
              task.entityId,
              productResearch,
            )
          : null;
        return {
          ...task,
          entityAvailable: Boolean(productResearch),
          entityLoadError: productResearch
            ? null
            : 'textproduct researchreportenglish_text。',
          productResearch,
          productResearchPreview,
        };
      }
      case 'SUPPLY_PLAN': {
        const supplyPlan = await this.tenantDatabase.run(orgId, (transaction) =>
          transaction.replenishmentPlan.findFirst({
            where: { id: task.entityId, organizationId: orgId },
            include: {
              supplySku: {
                include: {
                  supplier: { select: { id: true, name: true } },
                },
              },
            },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(supplyPlan),
          entityLoadError: supplyPlan
            ? null
            : 'english_text。',
          supplyPlan,
        };
      }
      default:
        return {
          ...task,
          entityAvailable: false,
          entityLoadError: `textreviewenglish_text：${task.entityType}`,
        };
    }
  }

  /** Get review statistics for the organization. */
  async getStats(user: JwtPayload) {
    const orgId = this.requireOrg(user);

    const [
      pendingCount,
      approvedCount,
      rejectedCount,
      reworkCount,
      totalCount,
    ] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'PENDING' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'APPROVED' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'REJECTED' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'REWORK' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId },
        }),
      ]),
    );

    // Average score
    const avgResult = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.aggregate({
        where: {
          organizationId: orgId,
          score: { not: null },
        },
        _avg: { score: true },
      }),
    );

    // Average time to review (in hours) — raw query for date diff
    let avgReviewTimeHours: number | null = null;
    try {
      const result = await this.tenantDatabase.run(orgId, (tx) =>
        tx.$queryRawUnsafe<Array<{ avg_hours: number | null }>>(
          `SELECT AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")) / 3600) AS avg_hours
           FROM "review_tasks"
           WHERE "organizationId" = $1
             AND "reviewedAt" IS NOT NULL
             AND "createdAt" IS NOT NULL`,
          orgId,
        ),
      );
      avgReviewTimeHours = result[0]?.avg_hours ?? null;
    } catch {
      // Gracefully handle if column names differ
    }

    const approvalRate =
      totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

    return {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      rework: reworkCount,
      total: totalCount,
      approvalRate,
      avgScore: avgResult._avg.score,
      avgReviewTimeHours,
    };
  }

  /**
   * Update the original entity's status when a review task is approved.
   * For AGENT_RUN — no status change needed (already COMPLETED).
   * For IMAGE_GENERATION — update ImagePromptProject status.
   * Listing approvals use approveListingReview and never mark a local draft
   * as externally published.
   */
  private async updateOriginalEntityStatus(
    organizationId: string,
    task: {
      entityType: string;
      entityId: string;
    },
  ): Promise<void> {
    switch (task.entityType) {
      case 'IMAGE_GENERATION':
        await this.tenantDatabase.run(organizationId, (tx) =>
          tx.imagePromptProject.update({
            where: { id: task.entityId },
            data: { status: 'COMPLETED' },
          }),
        );
        break;
      // AGENT_RUN and PRODUCT_RESEARCH are already terminal
      default:
        break;
    }
  }

  private async buildProductResearchPreview(
    organizationId: string,
    reviewTaskId: string,
    report: {
      id: string;
      query: string;
      platform: string;
      summary: string | null;
      opportunities: Prisma.JsonValue | null;
      createdAt: Date;
    },
  ) {
    const [decisions, launches] = await Promise.all([
      this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productResearchCandidateDecision.findMany({
          where: { organizationId, reportId: report.id },
          select: {
            candidateIndex: true,
            status: true,
            reason: true,
            updatedAt: true,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productLaunch.findMany({
          where: { organizationId, reviewTaskId },
          select: {
            id: true,
            candidateId: true,
            productId: true,
            status: true,
            failureCode: true,
            failureMessage: true,
            imageProjectId: true,
            imageProject: {
              select: {
                id: true,
                generatedAssets: true,
                qaStatus: true,
                qaVersion: true,
                qaResult: true,
                qaCompletedAt: true,
              },
            },
            agentRunId: true,
            channelId: true,
            listingDraftId: true,
            publishReviewTaskId: true,
            approvedContentHash: true,
            publishApprovedAt: true,
            updatedAt: true,
          },
        }),
      ),
    ]);
    const decisionByIndex = new Map(
      decisions.map((decision) => [decision.candidateIndex, decision]),
    );
    const launchByCandidateId = new Map(
      launches.map((launch) => [launch.candidateId, launch]),
    );
    const opportunities = this.asRecord(report.opportunities);
    const priceRange = this.asRecord(opportunities.priceRange);
    const sourceEvidence = this.asRecord(opportunities.sourceEvidence);
    const relevance = this.asRecord(sourceEvidence.relevance);
    const sourceEvidenceItems = this.asArray(sourceEvidence.items)
      .map((item) => this.asRecord(item))
      .map((item) => ({
        id: this.asOptionalString(item.id),
        title: this.asOptionalString(item.title),
        url: this.asOptionalString(item.url),
        imageUrl: this.asOptionalString(item.imageUrl),
        snippet: this.asOptionalString(item.snippet),
        fetchedAt: this.asOptionalString(item.fetchedAt),
        priceRub: this.asFiniteNumber(item.priceRub),
      }))
      .filter((item) => item.title && item.url);
    const normalizeCandidateTitle = (value: string | null) =>
      (value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const sourceByTitle = new Map(
      sourceEvidenceItems.map((item) => [
        normalizeCandidateTitle(item.title),
        item,
      ]),
    );
    const candidates = this.asStringArray(opportunities.competitors).map(
      (name, index) => {
        const candidateId = `${report.id}:${index}`;
        const decision = decisionByIndex.get(index);
        const evidence =
          sourceByTitle.get(normalizeCandidateTitle(name)) ?? null;
        return {
          id: candidateId,
          candidateIndex: index,
          name,
          status:
            decision?.status === 'APPROVED'
              ? 'approved'
              : decision?.status === 'REJECTED'
                ? 'rejected'
                : 'pending',
          rejectionReason: decision?.reason ?? null,
          decidedAt: decision?.updatedAt ?? null,
          productUrl: evidence?.url ?? null,
          imageUrl: evidence?.imageUrl ?? null,
          priceRub: evidence?.priceRub ?? null,
          evidenceFetchedAt: evidence?.fetchedAt ?? null,
          evidenceReady: Boolean(evidence?.url && evidence?.imageUrl),
          launch: launchByCandidateId.get(candidateId) ?? null,
        };
      },
    );

    return {
      reportId: report.id,
      query: report.query,
      platform: report.platform,
      summary: report.summary,
      createdAt: report.createdAt,
      priceRange: {
        min: this.asFiniteNumber(priceRange.min),
        max: this.asFiniteNumber(priceRange.max),
        currency: this.asOptionalString(priceRange.currency),
      },
      rating: this.asFiniteNumber(opportunities.rating),
      sourceEvidence: {
        source: this.asOptionalString(sourceEvidence.source),
        provider: this.asOptionalString(sourceEvidence.provider),
        fetchedAt: this.asOptionalString(sourceEvidence.fetchedAt),
        searchQuery: this.asOptionalString(sourceEvidence.searchQuery),
        relevance: {
          strategy: this.asOptionalString(relevance.strategy),
          matchTerms: this.asStringArray(relevance.matchTerms),
        },
        items: sourceEvidenceItems,
      },
      candidates,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return this.asArray(value).filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  private asOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
