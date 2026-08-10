import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { ChannelsService } from './channels.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

@Injectable()
export class OzonOrderSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OzonOrderSyncWorker.name);
  private interval?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly config: ConfigService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  onModuleInit(): void {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const intervalMs = this.config.get<number>(
      'OZON_ORDER_SYNC_INTERVAL_MS',
      300_000,
    );
    if (nodeEnv === 'test' || intervalMs <= 0) {
      return;
    }

    this.startupTimer = setTimeout(
      () => {
        void this.run('startup');
      },
      Math.min(30_000, Math.max(5_000, Math.floor(intervalMs / 10))),
    );
    this.startupTimer.unref?.();

    this.interval = setInterval(() => {
      void this.run('interval');
    }, intervalMs);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
    }
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async run(reason: 'startup' | 'interval'): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const organizations = await this.prisma.organization.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      for (const organization of organizations) {
        const channels = await this.tenantDatabase.run(organization.id, (tx) =>
          tx.channelConnection.findMany({
            where: {
              provider: 'OZON',
              syncStatus: 'SUCCESS',
              workspace: { organizationId: organization.id },
            },
            include: {
              workspace: {
                select: {
                  organizationId: true,
                },
              },
            },
            orderBy: {
              lastSyncedAt: { sort: 'asc', nulls: 'first' },
            },
            take: 50,
          }),
        );

        for (const channel of channels) {
          const actor = await this.resolveNotificationActor(
            channel.workspace.organizationId,
          );
          if (!actor) {
            this.logger.warn(
              `Skip Ozon order sync for ${channel.id}: no active owner/admin`,
            );
            continue;
          }

          try {
            await this.channelsService.syncOrders(actor, channel.id, {
              limit: 100,
            });
          } catch (error) {
            this.logger.warn(
              `Ozon order sync failed for ${channel.id} during ${reason}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async resolveNotificationActor(
    organizationId: string,
  ): Promise<JwtPayload | null> {
    const membership = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.membership.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
    );
    if (!membership) return null;
    return {
      sub: membership.userId,
      email: membership.user.email,
      role: membership.role,
      orgId: organizationId,
    };
  }
}
