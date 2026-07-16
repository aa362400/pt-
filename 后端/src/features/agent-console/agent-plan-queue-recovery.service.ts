import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AgentConsoleService } from './agent-console.service.js';

const SCAN_INTERVAL_MS = 2_000;
const STALE_RUNNING_MS = 30_000;

@Injectable()
export class AgentPlanQueueRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AgentPlanQueueRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private activeScan?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly agentConsole: AgentConsoleService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.startScan(), SCAN_INTERVAL_MS);
    this.timer.unref();
    void this.startScan();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeScan;
  }

  private startScan(): Promise<void> {
    if (this.activeScan) return this.activeScan;
    const scan = this.recoverMissingJobs()
      .catch((error) => {
        this.logger.error(
          'Agent plan queue recovery scan failed',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (this.activeScan === scan) this.activeScan = undefined;
      });
    this.activeScan = scan;
    return scan;
  }

  async recoverMissingJobs(): Promise<void> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
    });
    const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
    for (const organization of organizations) {
      const plans = await this.tenantDatabase.run(organization.id, (tx) =>
        tx.agentPlan.findMany({
          where: {
            organizationId: organization.id,
            OR: [
              { status: 'QUEUED' },
              { status: 'RUNNING', updatedAt: { lt: staleBefore } },
            ],
          },
          select: {
            id: true,
            status: true,
            conversation: { select: { userId: true } },
          },
          orderBy: { updatedAt: 'asc' },
          take: 20,
        }),
      );
      for (const plan of plans) {
        try {
          const result = await this.agentConsole.ensurePlanJob({
            planId: plan.id,
            organizationId: organization.id,
            userId: plan.conversation.userId,
          });
          if (result === 'enqueued') {
            this.logger.warn(
              `Recovered missing queue job for Agent plan ${plan.id} (${plan.status})`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to recover Agent plan ${plan.id}`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  }
}
