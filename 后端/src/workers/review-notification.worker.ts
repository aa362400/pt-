import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service.js';

export interface ReviewNotificationJobData {
  organizationId: string;
  userId: string;
  type: 'APPROVAL_REQUIRED' | 'REVIEW_COMPLETED';
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

/**
 * BullMQ worker for review-related notifications.
 *
 * This worker processes review notifications (approvals, rejections, rework requests)
 * and creates Notification records in the database. It also handles the assignment
 * of review tasks to appropriate users when the userId is not yet known.
 *
 * Queue: review-notifications (concurrency: 3)
 */
@Processor('review-notifications', { concurrency: 3 })
export class ReviewNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(ReviewNotificationWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ReviewNotificationJobData>): Promise<unknown> {
    const { organizationId, userId, type, title, body, metadata } = job.data;

    // If no specific userId is provided, find the first available reviewer
    // in the organization (admin or owner) as a fallback
    let targetUserId: string | null = userId;
    if (!targetUserId) {
      targetUserId = await this.resolveReviewer(organizationId);
    }

    if (!targetUserId) {
      this.logger.warn(
        `No reviewer found for organization ${organizationId}. Notification will be skipped.`,
      );
      await job.updateProgress(100);
      return {
        status: 'skipped',
        reason: 'No reviewer found in organization',
      };
    }

    const notification = await this.prisma.notification.create({
      data: {
        organizationId,
        userId: targetUserId,
        // NotificationType has no REVIEW_COMPLETED value — map it to SYSTEM.
        type: type === 'APPROVAL_REQUIRED' ? 'APPROVAL_REQUIRED' : 'SYSTEM',
        title,
        body: body ?? null,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await job.updateProgress(100);
    return {
      status: 'completed',
      notificationId: notification.id,
      targetUserId,
    };
  }

  /**
   * Resolve a reviewer user ID for the organization.
   * Prefers ADMIN role members; falls back to OWNER, then any active member.
   */
  private async resolveReviewer(
    organizationId: string,
  ): Promise<string | null> {
    // Try to find an ADMIN first
    const admin = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) return admin.userId;

    // Fall back to OWNER
    const owner = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        role: 'OWNER',
        status: 'ACTIVE',
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (owner) return owner.userId;

    // Fall back to any active member
    const member = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (member) return member.userId;

    return null;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Review-notification job ${job.id ?? 'unknown'} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Review-notification job ${job.id ?? 'unknown'} failed`, {
      error: error.message,
    });
  }
}
