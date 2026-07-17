import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type OrganizationAgentControl,
  type OrganizationAgentControlState,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';
import { BusinessException } from '../errors/exceptions.js';

export const ORGANIZATION_AGENT_CONTROL_SCHEMA_VERSION =
  'organization-agent-control/v1' as const;

type ControlCommand = 'pause' | 'resume' | 'stop';
type ControlAuditCommand = ControlCommand | 'reconcile-legacy';

type ControlAuditTransition = {
  command: ControlAuditCommand;
  actorId: string;
  before: LockedControl;
  after: LockedControl;
};

export interface OrganizationAgentControlCommand {
  organizationId: string;
  actorId: string;
  expectedRevision?: number;
  reason?: string;
}

export interface OrganizationAgentControlLock {
  state: OrganizationAgentControlState;
  revision: number;
}

type RunStatusCounts = {
  pending: number;
  running: number;
  paused: number;
  stopped: number;
};

type AgentControlRunCounts = {
  research: RunStatusCounts;
  automation: RunStatusCounts;
};

type ExternalWorkCounts = {
  productLaunch: {
    queued: number;
    generatingImages: number;
    submittingToOzon: number;
    recovering: number;
    pausedPreparation: number;
  };
  submission: {
    claimed: number;
    requestSent: number;
    unknown: number;
    reconciling: number;
  };
};

type AgentControlCounts = {
  runs: AgentControlRunCounts;
  external: ExternalWorkCounts;
};

export interface OrganizationAgentControlResponse {
  schemaVersion: typeof ORGANIZATION_AGENT_CONTROL_SCHEMA_VERSION;
  organizationId: string;
  /** @deprecated Use organizationId. Kept during the v1 response migration. */
  orgId: string;
  state: OrganizationAgentControlState;
  /** @deprecated Use state. Kept during the v1 response migration. */
  paused: boolean;
  revision: number;
  requestedAt: string | null;
  requestedBy: string | null;
  requestReason: string | null;
  intakeAllowed: boolean;
  /** Control-plane intent; scheduler enforcement is wired in a separate slice. */
  schedulerAllowed: boolean;
  resumable: boolean;
  /** Covers only the research and automation run families reported by v1. */
  acknowledged: boolean;
  runs: AgentControlRunCounts;
  external: ExternalWorkCounts;
}

type LockedControl = Pick<
  OrganizationAgentControl,
  | 'organizationId'
  | 'state'
  | 'revision'
  | 'requestedAt'
  | 'requestedBy'
  | 'requestReason'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class OrganizationAgentControlService {
  private readonly logger = new Logger(OrganizationAgentControlService.name);

  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  pause(input: OrganizationAgentControlCommand) {
    return this.transition('pause', input);
  }

  resume(input: OrganizationAgentControlCommand) {
    return this.transition('resume', input);
  }

  stop(input: OrganizationAgentControlCommand) {
    return this.transition('stop', input);
  }

  async status(
    organizationId: string,
  ): Promise<OrganizationAgentControlResponse> {
    const snapshot = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const control = await tx.organizationAgentControl.upsert({
          where: { organizationId },
          create: { organizationId },
          update: {},
        });
        const legacy =
          control.state === 'RUNNING'
            ? await tx.featureFlag.findUnique({
                where: { name: this.legacyFlagName(organizationId) },
                select: { enabled: true },
              })
            : null;
        const effectiveControl: LockedControl = legacy?.enabled
          ? { ...control, state: 'PAUSE_REQUESTED' }
          : control;
        const counts = await this.countRuns(tx, organizationId);
        return { control: effectiveControl, counts };
      },
    );
    return this.response(snapshot.control, snapshot.counts);
  }

  async getEffectiveState(
    organizationId: string,
  ): Promise<OrganizationAgentControlState> {
    return this.tenantDatabase.run(organizationId, async (tx) => {
      const durable = await tx.organizationAgentControl.findUnique({
        where: { organizationId },
        select: { state: true },
      });
      if (durable && durable.state !== 'RUNNING') return durable.state;

      const legacy = await tx.featureFlag.findUnique({
        where: { name: this.legacyFlagName(organizationId) },
        select: { enabled: true },
      });
      if (legacy?.enabled) return 'PAUSE_REQUESTED';
      return durable?.state ?? 'RUNNING';
    });
  }

  /**
   * Locks the effective organization control state inside an existing tenant
   * transaction. Task intake must keep its claim mutations in that same
   * transaction so pause/stop and new work have one linearization point.
   */
  async lockEffectiveState(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<OrganizationAgentControlLock> {
    await tx.organizationAgentControl.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
    const [control] = await tx.$queryRaw<OrganizationAgentControlLock[]>`
      SELECT "state", "revision"
      FROM "organization_agent_controls"
      WHERE "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!control) {
      throw new Error('Organization agent control row was not created');
    }
    if (control.state !== 'RUNNING') {
      return { state: control.state, revision: control.revision };
    }

    const [legacy] = await tx.$queryRaw<Array<{ enabled: boolean }>>`
      SELECT "enabled"
      FROM "feature_flags"
      WHERE "name" = ${this.legacyFlagName(organizationId)}
      FOR UPDATE
    `;
    return legacy?.enabled
      ? { state: 'PAUSE_REQUESTED', revision: control.revision }
      : { state: control.state, revision: control.revision };
  }

  private async transition(
    command: ControlCommand,
    input: OrganizationAgentControlCommand,
  ): Promise<OrganizationAgentControlResponse> {
    const result = await this.runSerializableTransition(
      input.organizationId,
      async (tx) => {
        await tx.organizationAgentControl.upsert({
          where: { organizationId: input.organizationId },
          create: { organizationId: input.organizationId },
          update: {},
        });
        const [before] = await tx.$queryRaw<LockedControl[]>`
          SELECT
            "organizationId",
            "state",
            "revision",
            "requestedAt",
            "requestedBy",
            "requestReason",
            "createdAt",
            "updatedAt"
          FROM "organization_agent_controls"
          WHERE "organizationId" = ${input.organizationId}
          FOR UPDATE
        `;
        if (!before) {
          throw new Error('Organization agent control row was not created');
        }
        if (
          input.expectedRevision !== undefined &&
          input.expectedRevision !== before.revision
        ) {
          throw new BusinessException(
            'AGENT_CONTROL_REVISION_CONFLICT',
            `Expected revision ${input.expectedRevision} does not match current revision ${before.revision}`,
            HttpStatus.CONFLICT,
          );
        }

        const auditTransitions: ControlAuditTransition[] = [];
        const move = async (
          current: LockedControl,
          targetState: OrganizationAgentControlState,
          actorId: string,
          requestReason: string | null,
        ) => {
          const requestedAt = new Date();
          const updated = await tx.organizationAgentControl.updateMany({
            where: {
              organizationId: input.organizationId,
              state: current.state,
              revision: current.revision,
            },
            data: {
              state: targetState,
              revision: { increment: 1 },
              requestedAt,
              requestedBy: actorId,
              requestReason,
            },
          });
          if (updated.count !== 1) {
            throw new BusinessException(
              'AGENT_CONTROL_CAS_CONFLICT',
              'Organization control changed concurrently; reload status before retrying',
              HttpStatus.CONFLICT,
            );
          }
          return tx.organizationAgentControl.findUniqueOrThrow({
            where: { organizationId: input.organizationId },
          });
        };

        let after: OrganizationAgentControl = before;
        let reconciledLegacyPause = false;
        if (before.state === 'RUNNING') {
          const legacy = await tx.featureFlag.findUnique({
            where: { name: this.legacyFlagName(input.organizationId) },
            select: { enabled: true },
          });
          if (legacy?.enabled) {
            const imported = await move(
              before,
              'PAUSE_REQUESTED',
              'system:legacy-kill-switch',
              'Imported from legacy organization kill-switch',
            );
            auditTransitions.push({
              command: 'reconcile-legacy',
              actorId: 'system:legacy-kill-switch',
              before,
              after: imported,
            });
            after = imported;
            reconciledLegacyPause = true;
          }
        }

        const deferAfterReconcile =
          reconciledLegacyPause &&
          command !== 'pause' &&
          input.expectedRevision !== undefined;
        if (!deferAfterReconcile) {
          const targetState = this.targetState(command, after.state);
          if (targetState !== after.state) {
            const beforeCommand = after;
            after = await move(
              beforeCommand,
              targetState,
              input.actorId,
              this.reason(input.reason),
            );
            auditTransitions.push({
              command,
              actorId: input.actorId,
              before: beforeCommand,
              after,
            });
          }
        }

        await tx.featureFlag.upsert({
          where: { name: this.legacyFlagName(input.organizationId) },
          create: {
            name: this.legacyFlagName(input.organizationId),
            enabled: after.state !== 'RUNNING',
          },
          update: { enabled: after.state !== 'RUNNING' },
        });
        await this.reconcileUnclaimedRuns(
          tx,
          input.organizationId,
          after.state,
          after.revision,
        );
        const counts = await this.countRuns(tx, input.organizationId);
        return { after, auditTransitions, deferAfterReconcile, counts };
      },
    );

    for (const auditTransition of result.auditTransitions) {
      await this.auditTransition(
        auditTransition.command,
        auditTransition.actorId,
        auditTransition.before,
        auditTransition.after,
      );
    }
    if (result.deferAfterReconcile) {
      throw new BusinessException(
        'AGENT_CONTROL_REVISION_CONFLICT',
        `Expected revision ${input.expectedRevision} no longer matches current revision ${result.after.revision}`,
        HttpStatus.CONFLICT,
      );
    }
    return this.response(result.after, result.counts);
  }

  private targetState(
    command: ControlCommand,
    current: OrganizationAgentControlState,
  ): OrganizationAgentControlState {
    if (current === 'STOP_REQUESTED') {
      if (command === 'stop') return current;
      throw new BusinessException(
        'AGENT_CONTROL_STOPPED',
        'A stopped organization cannot be paused or resumed',
        HttpStatus.CONFLICT,
      );
    }
    if (command === 'pause') return 'PAUSE_REQUESTED';
    if (command === 'stop') return 'STOP_REQUESTED';
    return 'RUNNING';
  }

  private async countRuns(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<AgentControlCounts> {
    const statuses = ['PENDING', 'RUNNING', 'PAUSED', 'STOPPED'] as const;
    const research = await Promise.all(
      statuses.map((status) =>
        tx.productResearchRun.count({ where: { organizationId, status } }),
      ),
    );
    const automation = await Promise.all(
      statuses.map((status) =>
        tx.automationRun.count({
          where: { flow: { organizationId }, status },
        }),
      ),
    );
    const productLaunchStatuses = [
      'QUEUED',
      'GENERATING_IMAGES',
      'SUBMITTING_TO_OZON',
      'RECOVERING',
    ] as const;
    const productLaunch = await Promise.all(
      productLaunchStatuses.map((status) =>
        tx.productLaunch.count({ where: { organizationId, status } }),
      ),
    );
    const pausedPreparation = await tx.productLaunch.count({
      where: {
        organizationId,
        status: 'QUEUED',
        failureCode: 'PRODUCT_LAUNCH_PAUSED_BEFORE_PREPARATION',
      },
    });
    const submissionStatuses = [
      'CLAIMED',
      'REQUEST_SENT',
      'UNKNOWN',
      'RECONCILING',
    ] as const;
    const submission = await Promise.all(
      submissionStatuses.map((status) =>
        tx.externalSubmission.count({ where: { organizationId, status } }),
      ),
    );
    const counts = (values: number[]): RunStatusCounts => ({
      pending: values[0] ?? 0,
      running: values[1] ?? 0,
      paused: values[2] ?? 0,
      stopped: values[3] ?? 0,
    });
    return {
      runs: {
        research: counts(research),
        automation: counts(automation),
      },
      external: {
        productLaunch: {
          queued: productLaunch[0] ?? 0,
          generatingImages: productLaunch[1] ?? 0,
          submittingToOzon: productLaunch[2] ?? 0,
          recovering: productLaunch[3] ?? 0,
          pausedPreparation,
        },
        submission: {
          claimed: submission[0] ?? 0,
          requestSent: submission[1] ?? 0,
          unknown: submission[2] ?? 0,
          reconciling: submission[3] ?? 0,
        },
      },
    };
  }

  private async reconcileUnclaimedRuns(
    tx: Prisma.TransactionClient,
    organizationId: string,
    state: OrganizationAgentControlState,
    controlRevision: number,
  ): Promise<void> {
    if (state === 'RUNNING') return;
    const now = new Date();
    const stopped = state === 'STOP_REQUESTED';
    const status = stopped ? 'STOPPED' : 'PAUSED';

    await tx.productResearchRun.updateMany({
      where: {
        organizationId,
        status: stopped ? { in: ['PENDING', 'PAUSED'] } : 'PENDING',
      },
      data: {
        status,
        controlRevision,
        currentStage: null,
        checkpointedAt: now,
        finishedAt: stopped ? now : null,
      },
    });
    await tx.automationRun.updateMany({
      where: {
        flow: { organizationId },
        status: stopped ? { in: ['PENDING', 'PAUSED'] } : 'PENDING',
      },
      data: {
        status,
        controlRevision,
        checkpointedAt: now,
        finishedAt: stopped ? now : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (stopped) {
      await tx.productLaunch.updateMany({
        where: { organizationId, status: 'QUEUED' },
        data: {
          status: 'BLOCKED',
          confirmAutoPublish: false,
          failureCode: 'PRODUCT_LAUNCH_STOPPED_BEFORE_PREPARATION',
          failureMessage:
            'Organization stop blocked queued local product preparation.',
          completedAt: now,
        },
      });
    }
  }

  private response(
    control: LockedControl,
    counts: AgentControlCounts,
  ): OrganizationAgentControlResponse {
    const executionAllowed = control.state === 'RUNNING';
    return {
      schemaVersion: ORGANIZATION_AGENT_CONTROL_SCHEMA_VERSION,
      organizationId: control.organizationId,
      orgId: control.organizationId,
      state: control.state,
      paused: control.state !== 'RUNNING',
      revision: control.revision,
      requestedAt: control.requestedAt?.toISOString() ?? null,
      requestedBy: control.requestedBy,
      requestReason: control.requestReason,
      intakeAllowed: executionAllowed,
      schedulerAllowed: executionAllowed,
      resumable: control.state === 'PAUSE_REQUESTED',
      acknowledged: this.acknowledged(control.state, counts),
      runs: counts.runs,
      external: counts.external,
    };
  }

  private acknowledged(
    state: OrganizationAgentControlState,
    counts: AgentControlCounts,
  ) {
    const runs = counts.runs;
    const pending = runs.research.pending + runs.automation.pending;
    const running = runs.research.running + runs.automation.running;
    const paused = runs.research.paused + runs.automation.paused;
    const product = counts.external.productLaunch;
    const submission = counts.external.submission;
    const activeProductWork =
      product.generatingImages + product.submittingToOzon + product.recovering;
    const unresolvedSubmissions =
      submission.claimed +
      submission.requestSent +
      submission.unknown +
      submission.reconciling;
    if (state === 'RUNNING') {
      return paused === 0 && product.pausedPreparation === 0;
    }
    if (state === 'PAUSE_REQUESTED') {
      return pending + running + activeProductWork === 0;
    }
    return (
      pending +
        running +
        paused +
        product.queued +
        activeProductWork +
        unresolvedSubmissions ===
      0
    );
  }

  private async auditTransition(
    command: ControlAuditCommand,
    actorId: string,
    before: LockedControl,
    after: LockedControl,
  ) {
    try {
      await this.audit.appendStrict({
        organizationId: after.organizationId,
        actorId,
        action: `organization-agent-control.${command}`,
        resourceType: 'OrganizationAgentControl',
        resourceId: after.organizationId,
        before: this.auditState(before),
        after: this.auditState(after),
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'organization_agent_control_audit_failed',
          organizationId: after.organizationId,
          command,
          revision: after.revision,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }
  }

  private auditState(control: LockedControl) {
    return {
      state: control.state,
      revision: control.revision,
      requestedAt: control.requestedAt?.toISOString() ?? null,
      requestedBy: control.requestedBy,
      requestReason: control.requestReason,
    };
  }

  private reason(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async runSerializableTransition<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.tenantDatabase.run(organizationId, operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const conflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!conflict) throw error;
        if (attempt === maxAttempts) {
          throw new BusinessException(
            'AGENT_CONTROL_CAS_CONFLICT',
            'Organization control changed concurrently; reload status before retrying',
            HttpStatus.CONFLICT,
          );
        }
        const delayMs = 5 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new BusinessException(
      'AGENT_CONTROL_CAS_CONFLICT',
      'Organization control changed concurrently; reload status before retrying',
      HttpStatus.CONFLICT,
    );
  }

  private legacyFlagName(organizationId: string) {
    return `agent-paused-${organizationId}`;
  }
}
