import {
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
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  CreateReviewTaskDto,
  ReviewListQueryDto,
  UpdateReviewDto,
} from './review.dto.js';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('review-notifications')
    private readonly reviewNotificationQueue: Queue,
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
    const autoApproved = score !== null && score >= threshold;

    const reviewTask = await this.prisma.reviewTask.create({
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
      },
    });

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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reviewTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reviewTask.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Get a single review task (org-scoped). */
  async findOne(user: JwtPayload, id: string) {
    const orgId = this.requireOrg(user);
    const task = await this.prisma.reviewTask.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!task) {
      throw new NotFoundException('Review task not found');
    }
    return task;
  }

  /**
   * Update review task — approve, reject, or request rework.
   * Logs an audit trail entry.
   */
  async update(user: JwtPayload, id: string, dto: UpdateReviewDto) {
    const orgId = this.requireOrg(user);
    const task = await this.prisma.reviewTask.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!task) {
      throw new NotFoundException('Review task not found');
    }

    const before = { status: task.status, notes: task.notes };

    const updated = await this.prisma.reviewTask.update({
      where: { id: task.id },
      data: {
        status: dto.status as 'APPROVED' | 'REJECTED' | 'REWORK',
        notes: dto.notes ?? task.notes,
        reviewedAt: new Date(),
        assignedTo: user.sub,
      },
    });

    // Log audit trail
    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: user.sub,
        action: `REVIEW_${dto.status}`,
        resourceType: 'REVIEW_TASK',
        resourceId: task.id,
        before: before,
        after: {
          status: updated.status,
          notes: updated.notes,
          reviewedAt: updated.reviewedAt,
        },
      },
    });

    // If approved, update the original entity status (if applicable)
    if (dto.status === 'APPROVED') {
      await this.updateOriginalEntityStatus(task);
    }

    // If rejected or rework, notify the original entity creator
    if (dto.status === 'REJECTED' || dto.status === 'REWORK') {
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

  /** Get review statistics for the organization. */
  async getStats(user: JwtPayload) {
    const orgId = this.requireOrg(user);

    const [
      pendingCount,
      approvedCount,
      rejectedCount,
      reworkCount,
      totalCount,
    ] = await this.prisma.$transaction([
      this.prisma.reviewTask.count({
        where: { organizationId: orgId, status: 'PENDING' },
      }),
      this.prisma.reviewTask.count({
        where: { organizationId: orgId, status: 'APPROVED' },
      }),
      this.prisma.reviewTask.count({
        where: { organizationId: orgId, status: 'REJECTED' },
      }),
      this.prisma.reviewTask.count({
        where: { organizationId: orgId, status: 'REWORK' },
      }),
      this.prisma.reviewTask.count({
        where: { organizationId: orgId },
      }),
    ]);

    // Average score
    const avgResult = await this.prisma.reviewTask.aggregate({
      where: {
        organizationId: orgId,
        score: { not: null },
      },
      _avg: { score: true },
    });

    // Average time to review (in hours) — raw query for date diff
    let avgReviewTimeHours: number | null = null;
    try {
      const result = await this.prisma.$queryRawUnsafe<
        Array<{ avg_hours: number | null }>
      >(
        `SELECT AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")) / 3600) AS avg_hours
         FROM "review_tasks"
         WHERE "organizationId" = $1
           AND "reviewedAt" IS NOT NULL
           AND "createdAt" IS NOT NULL`,
        orgId,
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
   * For LISTING_DRAFT — update listing status to PUBLISHED.
   */
  private async updateOriginalEntityStatus(task: {
    entityType: string;
    entityId: string;
  }): Promise<void> {
    switch (task.entityType) {
      case 'IMAGE_GENERATION':
        await this.prisma.imagePromptProject.update({
          where: { id: task.entityId },
          data: { status: 'COMPLETED' },
        });
        break;
      case 'LISTING_DRAFT':
        await this.prisma.listingDraft.update({
          where: { id: task.entityId },
          data: { status: 'PUBLISHED' },
        });
        break;
      // AGENT_RUN and PRODUCT_RESEARCH are already terminal
      default:
        break;
    }
  }
}
