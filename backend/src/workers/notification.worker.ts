import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import type { NotificationType, Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../shared/database/tenant-database-context.service.js';
import { NotificationEventsService } from '../features/notifications/notification-events.service.js';

export interface NotificationJobData {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

@Processor('notifications', { concurrency: 5 })
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    private readonly notificationEvents?: NotificationEventsService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<unknown> {
    const { organizationId, userId, type, title, body, metadata } = job.data;

    const notification = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.notification.create({
        data: {
          organizationId,
          userId,
          type,
          title,
          body: body ?? null,
          metadata: (metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      }),
    );

    await job.updateProgress(100);
    this.notificationEvents?.publishCreated(notification);
    return { status: 'completed', notificationId: notification.id };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Notification job ${job.id ?? 'unknown'} failed`, {
      error: error.message,
    });
  }
}
