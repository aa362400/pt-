import { InjectQueue } from '@nestjs/bullmq';
import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';
import { OrganizationAgentControlService } from './organization-agent-control.service.js';

const RESUME_DISPATCH_SCHEMA_VERSION =
  'organization-agent-resume-dispatch/v1' as const;
const RESUME_RECONCILE_INTERVAL_MS = 5_000;
const PUBLISH_GRANT_RETRY_MIN_REMAINING_MS = 2 * 60_000;

type DispatchFailure = {
  runId: string;
  code: 'QUEUE_ADD_FAILED' | 'PUBLISH_REAPPROVAL_REQUIRED';
};

export interface OrganizationAgentResumeDispatchReport {
  schemaVersion: typeof RESUME_DISPATCH_SCHEMA_VERSION;
  controlRevision: number;
  state: 'DISPATCHED' | 'CONTROL_CHANGED';
  automation: {
    eligible: number;
    ensured: number;
    failed: DispatchFailure[];
  };
  research: {
    eligible: number;
    ensured: number;
    unsupported: Array<{
      runId: string;
      code: 'EXACT_RESUME_CHECKPOINT_UNAVAILABLE';
    }>;
    failed: DispatchFailure[];
  };
  productLaunch: {
    eligible: number;
    ensured: number;
    failed: DispatchFailure[];
  };
}

@Injectable()
export class OrganizationAgentControlResumeDispatcherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    OrganizationAgentControlResumeDispatcherService.name,
  );
  private timer?: NodeJS.Timeout;
  private activeScan?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly control: OrganizationAgentControlService,
    @InjectQueue('automation-runs') private readonly automationQueue: Queue,
    @InjectQueue('daily-product-research')
    private readonly researchQueue: Queue,
    @InjectQueue('product-launches') private readonly productLaunchQueue: Queue,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.startReconciliation(),
      RESUME_RECONCILE_INTERVAL_MS,
    );
    this.timer.unref?.();
    void this.startReconciliation();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeScan;
  }

  startReconciliation(): Promise<void> {
    if (this.activeScan) return this.activeScan;
    const scan = this.reconcileMissingJobs()
      .catch(() => {
        this.logger.error('Agent-control resume reconciliation scan failed');
      })
      .finally(() => {
        if (this.activeScan === scan) this.activeScan = undefined;
      });
    this.activeScan = scan;
    return scan;
  }

  async reconcileMissingJobs(): Promise<void> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const organization of organizations) {
      try {
        const control = await this.tenantDatabase.run(organization.id, (tx) =>
          tx.organizationAgentControl.findUnique({
            where: { organizationId: organization.id },
            select: { state: true, revision: true },
          }),
        );
        if (!control) continue;
        if (control.state === 'RUNNING') {
          await this.dispatch(organization.id, control.revision);
        } else {
          await this.parkExpiredResearchLeasesForControl(
            organization.id,
            control.state,
            control.revision,
          );
        }
      } catch {
        this.logger.error(
          'Agent-control resume reconciliation failed for one organization',
        );
      }
    }
  }

  private async parkExpiredResearchLeasesForControl(
    organizationId: string,
    expectedState: 'PAUSE_REQUESTED' | 'STOP_REQUESTED',
    expectedControlRevision: number,
  ): Promise<number> {
    const expiredBefore = new Date();
    return this.tenantDatabase.run(organizationId, async (tx) => {
      const control = await this.control.lockEffectiveState(tx, organizationId);
      if (
        control.state !== expectedState ||
        control.revision !== expectedControlRevision
      ) {
        return 0;
      }

      const expiredRuns = await tx.productResearchRun.findMany({
        where: {
          organizationId,
          status: 'RUNNING',
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: expiredBefore } },
          ],
        },
        select: {
          id: true,
          currentStage: true,
          leaseOwner: true,
          leaseExpiresAt: true,
          executionEpoch: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 100,
      });

      const targetStatus =
        control.state === 'STOP_REQUESTED' ? 'STOPPED' : 'PAUSED';
      let parked = 0;
      for (const run of expiredRuns) {
        const transitionedAt = new Date();
        const updated = await tx.productResearchRun.updateMany({
          where: {
            id: run.id,
            organizationId,
            status: 'RUNNING',
            leaseOwner: run.leaseOwner,
            leaseExpiresAt: run.leaseExpiresAt,
            executionEpoch: run.executionEpoch,
          },
          data: {
            status: targetStatus,
            currentStage: null,
            controlRevision: control.revision,
            leaseOwner: null,
            leaseExpiresAt: null,
            finishedAt: targetStatus === 'STOPPED' ? transitionedAt : null,
          },
        });
        if (updated.count !== 1) continue;

        if (run.currentStage) {
          await tx.productResearchStageRun.updateMany({
            where: {
              organizationId,
              researchRunId: run.id,
              stage: run.currentStage,
              attempt: 0,
              status: 'RUNNING',
            },
            data: {
              status: 'FAILED',
              finishedAt: transitionedAt,
              errorCode: 'DAILY_RESEARCH_EXECUTION_LEASE_EXPIRED',
              errorMessage:
                'The execution lease expired before the organization control transition reached a safe stage boundary.',
            },
          });
        }
        parked += 1;
        this.logger.warn(
          JSON.stringify({
            event: 'daily_research_expired_lease_parked',
            organizationId,
            researchRunId: run.id,
            status: targetStatus,
            controlRevision: control.revision,
            executionEpoch: run.executionEpoch,
          }),
        );
      }
      return parked;
    });
  }

  async dispatch(
    organizationId: string,
    expectedControlRevision: number,
  ): Promise<OrganizationAgentResumeDispatchReport> {
    const publishQueueStaleBefore = new Date(Date.now() - 60_000);
    const researchLeaseExpiredBefore = new Date();
    const snapshot = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const control = await this.control.lockEffectiveState(
          tx,
          organizationId,
        );
        if (
          control.state !== 'RUNNING' ||
          control.revision !== expectedControlRevision
        ) {
          return {
            changed: true as const,
            revision: control.revision,
            automation: [],
            research: [],
            unsupported: [],
            productLaunch: [],
            publishQueue: [],
          };
        }

        const [automationRuns, researchRuns, productLaunches] =
          await Promise.all([
            tx.automationRun.findMany({
              where: {
                flow: { organizationId },
                status: { in: ['PENDING', 'PAUSED'] },
              },
              select: {
                id: true,
                status: true,
                idempotencyKey: true,
                triggerSource: true,
                triggerReason: true,
                traceId: true,
                jobSnapshot: true,
                controlRevision: true,
                flow: {
                  select: {
                    workspaceId: true,
                    name: true,
                    triggerConfig: true,
                  },
                },
              },
              orderBy: { startedAt: 'asc' },
            }),
            tx.productResearchRun.findMany({
              where: {
                organizationId,
                OR: [
                  { status: { in: ['PENDING', 'PAUSED'] } },
                  {
                    status: 'RUNNING',
                    OR: [
                      { leaseExpiresAt: null },
                      {
                        leaseExpiresAt: {
                          lte: researchLeaseExpiredBefore,
                        },
                      },
                    ],
                  },
                ],
              },
              select: {
                id: true,
                status: true,
                trigger: true,
                workspaceId: true,
                checkpointStage: true,
                controlRevision: true,
                leaseOwner: true,
                leaseExpiresAt: true,
                executionEpoch: true,
              },
              orderBy: { createdAt: 'asc' },
            }),
            tx.productLaunch.findMany({
              where: {
                organizationId,
                status: 'QUEUED',
                OR: [
                  { confirmAutoPublish: false },
                  {
                    confirmAutoPublish: true,
                    updatedAt: { lte: publishQueueStaleBefore },
                  },
                ],
              },
              select: {
                id: true,
                execution: true,
                failureCode: true,
                confirmAutoPublish: true,
                approvedPublishSnapshotHash: true,
                publishExecutionGrantHash: true,
                publishExecutionGrantExpiresAt: true,
                externalSubmissions: { select: { status: true } },
              },
              orderBy: { createdAt: 'asc' },
              take: 100,
            }),
          ]);

        const automation = [] as typeof automationRuns;
        for (const run of automationRuns) {
          const updated = await tx.automationRun.updateMany({
            where: {
              id: run.id,
              flow: { organizationId },
              status: run.status,
              controlRevision: run.controlRevision,
            },
            data: { controlRevision: control.revision },
          });
          if (updated.count === 1) {
            automation.push({ ...run, controlRevision: control.revision });
          }
        }

        const research = [] as typeof researchRuns;
        for (const run of researchRuns) {
          const updated =
            run.status === 'RUNNING'
              ? await tx.productResearchRun.updateMany({
                  where: {
                    id: run.id,
                    organizationId,
                    status: 'RUNNING',
                    controlRevision: run.controlRevision,
                    checkpointStage: run.checkpointStage,
                    leaseOwner: run.leaseOwner,
                    leaseExpiresAt: run.leaseExpiresAt,
                    executionEpoch: run.executionEpoch,
                  },
                  data: {
                    status: 'PENDING',
                    currentStage: null,
                    controlRevision: control.revision,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                  },
                })
              : await tx.productResearchRun.updateMany({
                  where: {
                    id: run.id,
                    organizationId,
                    status: run.status,
                    controlRevision: run.controlRevision,
                    checkpointStage: run.checkpointStage,
                  },
                  data: {
                    controlRevision: control.revision,
                  },
                });
          if (updated.count === 1) {
            research.push({
              ...run,
              controlRevision: control.revision,
            });
          }
        }
        const productLaunch = productLaunches.flatMap((launch) => {
          if (launch.confirmAutoPublish) return [];
          const execution = this.record(launch.execution);
          const preparationAttemptId =
            typeof execution.preparationAttemptId === 'string'
              ? execution.preparationAttemptId.trim()
              : '';
          return preparationAttemptId
            ? [{ ...launch, preparationAttemptId }]
            : [];
        });
        const publishQueue = productLaunches.filter(
          (launch) =>
            launch.confirmAutoPublish &&
            launch.externalSubmissions.every((submission) =>
              ['PREPARED', 'RETRYABLE_FAILED'].includes(submission.status),
            ),
        );
        return {
          changed: false as const,
          revision: control.revision,
          automation,
          research,
          unsupported: [],
          productLaunch,
          publishQueue,
        };
      },
    );

    if (snapshot.changed) {
      return this.emptyReport(snapshot.revision, 'CONTROL_CHANGED');
    }

    const automationFailed: DispatchFailure[] = [];
    let automationEnsured = 0;
    await Promise.all(
      snapshot.automation.map(async (run) => {
        const jobSnapshot = this.record(run.jobSnapshot);
        try {
          await this.ensureQueueJob(
            this.automationQueue,
            'run',
            {
              automationRunId: run.id,
              organizationId,
              idempotencyKey: run.idempotencyKey,
              trigger: run.status === 'PAUSED' ? 'resume' : run.triggerSource,
              reason:
                run.status === 'PAUSED'
                  ? 'Organization agent control resumed'
                  : (run.triggerReason ?? 'Recovered missing queue job'),
              traceId: run.traceId ?? undefined,
              traceparent:
                typeof jobSnapshot.traceparent === 'string'
                  ? jobSnapshot.traceparent
                  : undefined,
              controlRevision: run.controlRevision,
            },
            {
              priority: this.automationPriority(run.flow),
              jobId: `automation-run-${run.id}-control-${run.controlRevision}`,
            },
          );
          automationEnsured += 1;
        } catch {
          automationFailed.push({ runId: run.id, code: 'QUEUE_ADD_FAILED' });
        }
      }),
    );

    const researchFailed: DispatchFailure[] = [];
    let researchEnsured = 0;
    await Promise.all(
      snapshot.research.map(async (run) => {
        try {
          const jobId = `daily-product-research-${run.id}-control-${run.controlRevision}`;
          await this.ensureQueueJob(
            this.researchQueue,
            'run',
            {
              schemaVersion: 'daily-product-research/v1',
              researchRunId: run.id,
              organizationId,
              workspaceId: run.workspaceId,
              trigger:
                run.status === 'PAUSED' || run.status === 'RUNNING'
                  ? 'RETRY'
                  : run.trigger,
              controlRevision: run.controlRevision,
            },
            {
              jobId,
            },
          );
          researchEnsured += 1;
          if (run.status === 'RUNNING') {
            this.logger.warn(
              JSON.stringify({
                event: 'daily_research_expired_lease_requeued',
                organizationId,
                researchRunId: run.id,
                controlRevision: run.controlRevision,
                executionEpoch: run.executionEpoch,
                jobId,
              }),
            );
          }
        } catch {
          researchFailed.push({ runId: run.id, code: 'QUEUE_ADD_FAILED' });
        }
      }),
    );

    const productLaunchFailed: DispatchFailure[] = [];
    let productLaunchEnsured = 0;
    await Promise.all(
      snapshot.productLaunch.map(async (launch) => {
        try {
          await this.ensureQueueJob(
            this.productLaunchQueue,
            'product-launch',
            {
              productLaunchId: launch.id,
              organizationId,
              preparationAttemptId: launch.preparationAttemptId,
              controlRevision: snapshot.revision,
            },
            {
              jobId:
                launch.failureCode ===
                'PRODUCT_LAUNCH_PAUSED_BEFORE_PREPARATION'
                  ? `product-launch-${launch.id}-prepare-${launch.preparationAttemptId}-control-${snapshot.revision}`
                  : `product-launch-${launch.id}-prepare-${launch.preparationAttemptId}`,
            },
          );
          productLaunchEnsured += 1;
        } catch {
          productLaunchFailed.push({
            runId: launch.id,
            code: 'QUEUE_ADD_FAILED',
          });
        }
      }),
    );
    await Promise.all(
      snapshot.publishQueue.map(async (launch) => {
        try {
          const outcome = await this.reconcilePublishQueueJob(
            organizationId,
            launch,
          );
          if (outcome === 'ENSURED') {
            productLaunchEnsured += 1;
          } else {
            productLaunchFailed.push({
              runId: launch.id,
              code: 'PUBLISH_REAPPROVAL_REQUIRED',
            });
          }
        } catch {
          productLaunchFailed.push({
            runId: launch.id,
            code: 'QUEUE_ADD_FAILED',
          });
        }
      }),
    );

    return {
      schemaVersion: RESUME_DISPATCH_SCHEMA_VERSION,
      controlRevision: snapshot.revision,
      state: 'DISPATCHED',
      automation: {
        eligible: snapshot.automation.length,
        ensured: automationEnsured,
        failed: automationFailed,
      },
      research: {
        eligible: snapshot.research.length,
        ensured: researchEnsured,
        unsupported: snapshot.unsupported,
        failed: researchFailed,
      },
      productLaunch: {
        eligible: snapshot.productLaunch.length + snapshot.publishQueue.length,
        ensured: productLaunchEnsured,
        failed: productLaunchFailed,
      },
    };
  }

  private emptyReport(
    controlRevision: number,
    state: 'CONTROL_CHANGED',
  ): OrganizationAgentResumeDispatchReport {
    return {
      schemaVersion: RESUME_DISPATCH_SCHEMA_VERSION,
      controlRevision,
      state,
      automation: { eligible: 0, ensured: 0, failed: [] },
      research: { eligible: 0, ensured: 0, unsupported: [], failed: [] },
      productLaunch: { eligible: 0, ensured: 0, failed: [] },
    };
  }

  private automationPriority(flow: {
    workspaceId: string | null;
    name: string;
    triggerConfig: unknown;
  }) {
    const config = this.record(flow.triggerConfig);
    if (
      config.source === 'connected_store_operator' ||
      flow.name === '[智能体自动运营] Ozon 选品巡检'
    ) {
      return 0;
    }
    return flow.workspaceId ? 1 : 2;
  }

  private async ensureQueueJob(
    queue: Queue,
    name: string,
    data: Record<string, unknown>,
    options: JobsOptions,
  ): Promise<void> {
    const jobId = options.jobId;
    if (typeof jobId !== 'string' || !jobId) {
      throw new Error('Durable queue reconciliation requires a stable job id');
    }
    const existing = await queue.getJob(jobId);
    if (!existing) {
      await queue.add(name, data, options);
      return;
    }
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed') {
      try {
        await existing.updateData(data);
        await existing.retry(state, {
          resetAttemptsMade: true,
          resetAttemptsStarted: true,
        });
        return;
      } catch {
        await this.confirmJobAfterRetryRace(queue, name, data, options);
        return;
      }
    }
    if (state !== 'unknown') return;

    try {
      await existing.remove();
    } catch {
      // A peer may have retried the job or a worker may have claimed it.
    }
    await this.confirmJobAfterRetryRace(queue, name, data, options);
  }

  private async reconcilePublishQueueJob(
    organizationId: string,
    launch: {
      id: string;
      approvedPublishSnapshotHash: string | null;
      publishExecutionGrantHash: string | null;
      publishExecutionGrantExpiresAt: Date | null;
    },
  ): Promise<'ENSURED' | 'REAPPROVAL_REQUIRED'> {
    const snapshotHash = launch.approvedPublishSnapshotHash;
    if (!snapshotHash) {
      return (await this.rollbackMissingPublishJob(organizationId, launch))
        ? 'REAPPROVAL_REQUIRED'
        : 'ENSURED';
    }
    const jobId = `product-launch-${launch.id}-publish-${snapshotHash}`;
    let job = await this.productLaunchQueue.getJob(jobId);
    if (!job) {
      return (await this.rollbackMissingPublishJob(organizationId, launch))
        ? 'REAPPROVAL_REQUIRED'
        : 'ENSURED';
    }

    let state = await job.getState();
    const grant = this.record(job.data).publishExecutionGrant;
    const grantValid =
      typeof grant === 'string' &&
      typeof launch.publishExecutionGrantHash === 'string' &&
      createHash('sha256').update(grant).digest('hex') ===
        launch.publishExecutionGrantHash &&
      launch.publishExecutionGrantExpiresAt !== null &&
      launch.publishExecutionGrantExpiresAt.getTime() >
        Date.now() + PUBLISH_GRANT_RETRY_MIN_REMAINING_MS;

    if (grantValid && (state === 'completed' || state === 'failed')) {
      try {
        await job.retry(state, {
          resetAttemptsMade: true,
          resetAttemptsStarted: true,
        });
        return 'ENSURED';
      } catch {
        job = await this.productLaunchQueue.getJob(jobId);
        if (!job) {
          return (await this.rollbackMissingPublishJob(organizationId, launch))
            ? 'REAPPROVAL_REQUIRED'
            : 'ENSURED';
        }
        state = await job.getState();
        if (!['completed', 'failed', 'unknown'].includes(state)) {
          return 'ENSURED';
        }
      }
    } else if (grantValid && state !== 'unknown') {
      return 'ENSURED';
    }

    try {
      await job.remove();
    } catch {
      const current = await this.productLaunchQueue.getJob(jobId);
      if (current) {
        const currentState = await current.getState();
        if (!['completed', 'failed', 'unknown'].includes(currentState)) {
          return 'ENSURED';
        }
      }
    }
    return (await this.rollbackMissingPublishJob(organizationId, launch))
      ? 'REAPPROVAL_REQUIRED'
      : 'ENSURED';
  }

  private async rollbackMissingPublishJob(
    organizationId: string,
    launch: {
      id: string;
      approvedPublishSnapshotHash: string | null;
      publishExecutionGrantHash: string | null;
    },
  ): Promise<boolean> {
    const updated = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productLaunch.updateMany({
        where: {
          id: launch.id,
          organizationId,
          status: 'QUEUED',
          confirmAutoPublish: true,
          approvedPublishSnapshotHash: launch.approvedPublishSnapshotHash,
          publishExecutionGrantHash: launch.publishExecutionGrantHash,
          externalSubmissions: {
            none: {
              status: {
                in: [
                  'CLAIMED',
                  'REQUEST_SENT',
                  'UNKNOWN',
                  'RECONCILING',
                  'SUCCEEDED',
                ],
              },
            },
          },
        },
        data: {
          status: 'AWAITING_PUBLISH_APPROVAL',
          confirmAutoPublish: false,
          approvedContentHash: null,
          selectedPublishSnapshotId: null,
          approvedPublishSnapshotHash: null,
          publishApprovedBy: null,
          publishApprovedAt: null,
          publishExecutionGrantHash: null,
          publishExecutionGrantScope: null,
          publishExecutionGrantSnapshotHash: null,
          publishExecutionGrantExpiresAt: null,
          publishExecutionGrantConsumedAt: null,
          failureCode: 'PUBLISH_QUEUE_JOB_MISSING_REAPPROVAL_REQUIRED',
          failureMessage:
            'The publish queue job or execution grant was unavailable; explicit publish approval is required again.',
        },
      }),
    );
    if (updated.count === 1) {
      this.logger.warn(
        JSON.stringify({
          event: 'product_launch_publish_reapproval_required',
          organizationId,
          productLaunchId: launch.id,
        }),
      );
    }
    return updated.count === 1;
  }

  private async confirmJobAfterRetryRace(
    queue: Queue,
    name: string,
    data: Record<string, unknown>,
    options: JobsOptions,
  ): Promise<void> {
    const jobId = options.jobId as string;
    const current = await queue.getJob(jobId);
    if (!current) {
      await queue.add(name, data, options);
      return;
    }
    const state = await current.getState();
    if (state !== 'completed' && state !== 'failed' && state !== 'unknown') {
      return;
    }
    if (state === 'completed' || state === 'failed') {
      await current.updateData(data);
      await current.retry(state, {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
      return;
    }
    throw new Error('Orphaned queue job could not be reconciled');
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
