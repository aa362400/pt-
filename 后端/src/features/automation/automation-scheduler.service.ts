import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { BusinessTimeService } from '../product-research/daily/services/business-time.service.js';
import { resolveTraceContext } from '../../shared/observability/trace-context.js';

const OZON_STORE_OPERATOR_FLOW_NAME = '[智能体自动运营] Ozon 选品巡检';

@Injectable()
export class AutomationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private interval?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('automation-runs') private readonly queue: Queue,
    private readonly config: ConfigService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    private readonly businessTime?: BusinessTimeService,
  ) {}

  onModuleInit(): void {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const intervalMs = this.config.get<number>(
      'AUTOMATION_SCHEDULER_INTERVAL_MS',
      30_000,
    );
    if (nodeEnv === 'test' || intervalMs <= 0) {
      return;
    }

    this.startupTimer = setTimeout(
      () => {
        void this.run('startup');
      },
      Math.min(10_000, Math.max(2_000, Math.floor(intervalMs / 5))),
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

  async run(reason: 'startup' | 'interval' | 'manual'): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureConnectedStoreOperatorFlows();
      await this.enqueueDueFlows(reason);
    } finally {
      this.running = false;
    }
  }

  private async ensureConnectedStoreOperatorFlows(): Promise<void> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const channels = (
      await Promise.all(
        organizations.map((organization) =>
          this.tenantDatabase.run(organization.id, (tx) =>
            tx.channelConnection.findMany({
              where: {
                provider: 'OZON',
                syncStatus: 'SUCCESS',
                workspace: { organizationId: organization.id },
              },
              include: {
                workspace: {
                  select: {
                    id: true,
                    organizationId: true,
                    name: true,
                    marketplace: true,
                  },
                },
              },
              take: 50,
            }),
          ),
        ),
      )
    ).flat();

    for (const channel of channels) {
      const actor = await this.resolveOperatorActor(
        channel.workspace.organizationId,
      );
      if (!actor) {
        this.logger.warn(
          `Skip store operator flow for ${channel.id}: no active owner/admin`,
        );
        continue;
      }

      const existing = await this.tenantDatabase.run(
        channel.workspace.organizationId,
        (tx) =>
          tx.automationFlow.findFirst({
            where: {
              organizationId: channel.workspace.organizationId,
              workspaceId: channel.workspace.id,
              name: OZON_STORE_OPERATOR_FLOW_NAME,
            },
          }),
      );

      const existingConfig = this.asRecord(existing?.triggerConfig);
      const intervalMinutes =
        this.asPositiveNumber(existingConfig.intervalMinutes) ?? 240;
      const triggerConfig = {
        ...existingConfig,
        source: 'connected_store_operator',
        provider: 'OZON',
        channelId: channel.id,
        intervalMinutes,
        continuous: true,
        researchPipeline: 'daily_evidence_first_v1',
        defaultResearchQuery: `${channel.workspace.name} Ozon 高潜新品机会`,
        platform: 'OZON',
      };
      const steps = [
        {
          key: 'continuous-global-product-research',
          action: 'product.research.daily',
          mode: 'automatic',
          continuous: true,
          platform: 'OZON',
        },
      ] as Prisma.InputJsonValue;

      if (existing) {
        const existingSteps = Array.isArray(existing.steps)
          ? existing.steps.map((step) => this.asRecord(step))
          : [];
        const needsPipelineReconciliation =
          existingConfig.continuous !== true ||
          !existingSteps.some(
            (step) =>
              step.action === 'product.research.daily' &&
              step.continuous === true,
          ) ||
          existingSteps.some((step) => step.action === 'product.research');
        if (
          needsPipelineReconciliation ||
          (existing.status === 'ACTIVE' && !existing.nextRunAt)
        ) {
          await this.tenantDatabase.run(
            channel.workspace.organizationId,
            (tx) =>
              tx.automationFlow.update({
                where: { id: existing.id },
                data: {
                  ...(needsPipelineReconciliation
                    ? {
                        description:
                          '绑定 Ozon 店铺后由后端自动创建。持续运行真实全球选品与 Ozon 低供给证据流水线，候选进入审核后才允许外部写入。',
                        triggerConfig,
                        steps,
                      }
                    : {}),
                  ...(existing.status === 'ACTIVE' &&
                  (!existing.nextRunAt || needsPipelineReconciliation)
                    ? { nextRunAt: new Date() }
                    : {}),
                },
              }),
          );
        }
        continue;
      }

      await this.tenantDatabase.run(channel.workspace.organizationId, (tx) =>
        tx.automationFlow.create({
          data: {
            organizationId: channel.workspace.organizationId,
            workspaceId: channel.workspace.id,
            name: OZON_STORE_OPERATOR_FLOW_NAME,
            description:
              '绑定 Ozon 店铺后由后端自动创建。持续运行真实全球选品与 Ozon 低供给证据流水线，候选进入审核后才允许外部写入。',
            status: 'ACTIVE',
            triggerType: 'SCHEDULE',
            triggerConfig,
            steps,
            nextRunAt: new Date(),
            createdBy: actor.userId,
          },
        }),
      );
    }
  }

  private async enqueueDueFlows(reason: string): Promise<void> {
    const now = new Date();
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const { id: organizationId } of organizations) {
      const flows = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.automationFlow.findMany({
          where: {
            organizationId,
            status: 'ACTIVE',
            triggerType: 'SCHEDULE',
            nextRunAt: { lte: now },
          },
          orderBy: { nextRunAt: 'asc' },
          take: 200,
        }),
      );

      for (const flow of this.prioritizeDueFlows(flows)) {
        const traceContext = resolveTraceContext();
        const scheduledFor = (flow.nextRunAt ?? now).toISOString();
        const idempotencyKey = `schedule:${flow.id}:${scheduledFor}`;
        const triggerReason = `Scheduled automation (${reason}) for ${scheduledFor}`;
        let run: { id: string } | null;
        try {
          run = await this.tenantDatabase.run(organizationId, async (tx) => {
            const existing = await tx.automationRun.findUnique({
              where: {
                flowId_idempotencyKey: {
                  flowId: flow.id,
                  idempotencyKey,
                },
              },
              select: { id: true },
            });
            if (existing) return null;
            const activeRun = await tx.automationRun.findFirst({
              where: {
                flowId: flow.id,
                status: { in: ['PENDING', 'RUNNING'] },
              },
              select: { id: true },
            });
            if (activeRun) return null;
            if (await this.retireCompletedOneShotFlow(tx, flow)) return null;

            const nextRunAt = this.computeNextRunAt(flow.triggerConfig, now);
            const created = await tx.automationRun.create({
              data: {
                flowId: flow.id,
                traceId: traceContext.traceId,
                idempotencyKey,
                triggerSource: 'schedule',
                triggerReason,
                requestedBy: flow.createdBy,
                jobSnapshot: {
                  organizationId,
                  flowId: flow.id,
                  trigger: 'schedule',
                  reason: triggerReason,
                  schedulerReason: reason,
                  scheduledFor,
                  idempotencyKey,
                  traceId: traceContext.traceId,
                  traceparent: traceContext.traceparent,
                  requestedBy: flow.createdBy,
                  policy: {
                    externalStoreMutation: 'not_executed',
                    externalSideEffects: 'approval_token_required',
                  },
                },
              },
            });
            await tx.automationFlow.update({
              where: { id: flow.id },
              data: { nextRunAt },
            });
            return created;
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            this.logger.debug(
              `Scheduled run ${idempotencyKey} was claimed by another scheduler`,
            );
            continue;
          }
          throw error;
        }
        if (!run) continue;

        try {
          await this.queue.add(
            'run',
            {
              automationRunId: run.id,
              organizationId,
              trigger: 'schedule',
              reason: triggerReason,
              idempotencyKey,
              traceId: traceContext.traceId,
              traceparent: traceContext.traceparent,
            },
            {
              priority: this.queuePriority(flow),
              jobId: `automation-run-${run.id}`,
            },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await this.tenantDatabase.run(organizationId, (tx) =>
            tx.automationRun.updateMany({
              where: { id: run.id, status: 'PENDING' },
              data: {
                status: 'FAILED',
                finishedAt: new Date(),
                error: { message, stage: 'schedule_enqueue' },
              },
            }),
          );
          this.logger.error(
            `Failed to enqueue scheduled automation run ${run.id}`,
            { error: message },
          );
        }
      }
    }
  }

  private prioritizeDueFlows<
    T extends {
      name: string;
      triggerConfig: Prisma.JsonValue;
      nextRunAt: Date | null;
      workspaceId: string | null;
    },
  >(flows: T[]): T[] {
    return [...flows].sort((left, right) => {
      const priorityDiff = this.queuePriority(left) - this.queuePriority(right);
      if (priorityDiff !== 0) return priorityDiff;

      const leftTime = left.nextRunAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextRunAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  }

  private queuePriority(flow: {
    name: string;
    triggerConfig: Prisma.JsonValue;
    workspaceId: string | null;
  }): number {
    if (this.isConnectedStoreOperatorFlow(flow)) {
      return 0;
    }
    if (flow.workspaceId) {
      return 1;
    }
    return 2;
  }

  private isConnectedStoreOperatorFlow(flow: {
    name: string;
    triggerConfig: Prisma.JsonValue;
  }): boolean {
    const config = this.asRecord(flow.triggerConfig);
    return (
      config.source === 'connected_store_operator' ||
      flow.name === OZON_STORE_OPERATOR_FLOW_NAME
    );
  }

  private async retireCompletedOneShotFlow(
    tx: Prisma.TransactionClient,
    flow: {
      id: string;
      triggerType: string;
      triggerConfig: Prisma.JsonValue;
    },
  ): Promise<boolean> {
    if (!this.isOneShotScheduledFlow(flow)) {
      return false;
    }

    const latestTerminalRun = await tx.automationRun.findFirst({
      where: {
        flowId: flow.id,
        status: { in: ['COMPLETED', 'PARTIAL', 'FAILED'] },
      },
      orderBy: { startedAt: 'desc' },
      select: { status: true, error: true, finishedAt: true },
    });
    if (!latestTerminalRun) {
      return false;
    }

    const config = this.asRecord(flow.triggerConfig);
    await tx.automationFlow.update({
      where: { id: flow.id },
      data: {
        status: latestTerminalRun.status === 'FAILED' ? 'ERROR' : 'PAUSED',
        nextRunAt: null,
        triggerConfig: {
          ...config,
          completedOneShotAt:
            latestTerminalRun.finishedAt?.toISOString() ??
            new Date().toISOString(),
          terminalRunStatus: latestTerminalRun.status,
          terminalRunError: latestTerminalRun.error ?? null,
        },
      },
    });
    return true;
  }

  private isOneShotScheduledFlow(flow: {
    triggerType: string;
    triggerConfig: Prisma.JsonValue;
  }): boolean {
    if (flow.triggerType !== 'SCHEDULE') {
      return false;
    }

    const config = this.asRecord(flow.triggerConfig);
    if (config.once === true || config.repeat === false) {
      return true;
    }

    const hasExplicitInterval =
      this.asPositiveNumber(config.intervalMs) !== null ||
      this.asPositiveNumber(config.intervalMinutes) !== null ||
      this.asPositiveNumber(config.everyMinutes) !== null;
    return (
      Boolean(config.dueAt) && !hasExplicitInterval && config.repeat !== true
    );
  }

  private computeNextRunAt(
    triggerConfig: Prisma.JsonValue,
    from: Date,
  ): Date | null {
    const config = this.asRecord(triggerConfig);
    if (typeof config.dailyAt === 'string') {
      const timezone =
        typeof config.timezone === 'string' ? config.timezone : 'Asia/Shanghai';
      return (
        this.businessTime ?? new BusinessTimeService()
      ).nextDailyOccurrence(from, timezone, config.dailyAt);
    }
    const intervalMs = this.asPositiveNumber(config.intervalMs);
    if (intervalMs !== null) {
      return new Date(from.getTime() + intervalMs);
    }

    const intervalMinutes =
      this.asPositiveNumber(config.intervalMinutes) ??
      this.asPositiveNumber(config.everyMinutes);
    if (intervalMinutes !== null) {
      return new Date(from.getTime() + intervalMinutes * 60_000);
    }

    const runOnce = config.once === true || config.repeat === false;
    if (runOnce) {
      return null;
    }

    if (config.dueAt && config.repeat !== true) {
      return null;
    }

    return new Date(from.getTime() + 60 * 60_000);
  }

  private async resolveOperatorActor(
    organizationId: string,
  ): Promise<{ userId: string } | null> {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.membership.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
        },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      }),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asPositiveNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
  }
}
