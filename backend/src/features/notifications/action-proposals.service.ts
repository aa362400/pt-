import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AgentType, Prisma, type ActionProposal } from '@prisma/client';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { NotificationEventsService } from './notification-events.service.js';

export interface CreateActionProposalInput {
  organizationId: string;
  requestedBy: string;
  approverId: string;
  source: string;
  title: string;
  body?: string;
  type?: 'SYSTEM' | 'ALERT' | 'APPROVAL_REQUIRED';
  action: {
    label?: string;
    name: string;
    params: Record<string, unknown>;
  };
  context?: Record<string, unknown>;
  expiresAt?: Date;
  dedupeKey?: string;
}

type HashableProposal = Pick<
  ActionProposal,
  | 'organizationId'
  | 'notificationId'
  | 'requestedBy'
  | 'approverId'
  | 'source'
  | 'action'
  | 'params'
  | 'context'
  | 'expiresAt'
>;

export interface ApprovalExecutionGrant {
  token: string;
  proposalId: string;
  approvalDecisionId: string;
  action: string;
  capabilityScope: string;
  payloadHash: string;
  expiresAt: Date;
  idempotencyKey: string;
}

export type VerifiedApprovalExecution = Omit<
  ApprovalExecutionGrant,
  'token' | 'expiresAt'
> & {
  consumedAt: Date;
};

@Injectable()
export class ActionProposalsService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
    private readonly notificationEvents: NotificationEventsService,
  ) {}

  async list(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    status?: ActionProposal['status'];
    skip?: number;
    take?: number;
  }) {
    const elevated = this.isElevatedReviewer(input.actorRole);
    const proposals = await this.tenantDatabase.run(
      input.organizationId,
      (tx) =>
        tx.actionProposal.findMany({
          where: {
            organizationId: input.organizationId,
            ...(elevated ? {} : { approverId: input.actorId }),
            ...(input.status ? { status: input.status } : {}),
          },
          include: {
            notification: true,
            decisions: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { createdAt: 'desc' },
          skip: Math.max(0, input.skip ?? 0),
          take: Math.min(100, Math.max(1, input.take ?? 20)),
        }),
    );
    return proposals.map((proposal) =>
      this.withoutExecutionGrantHash(proposal),
    );
  }

  async findById(input: {
    organizationId: string;
    proposalId: string;
    actorId: string;
    actorRole: string;
  }) {
    const proposal = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.actionProposal.findFirst({
        where: {
          id: input.proposalId,
          organizationId: input.organizationId,
        },
        include: {
          notification: true,
          decisions: { orderBy: { createdAt: 'desc' } },
        },
      }),
    );
    if (!proposal) throw new NotFoundException('Approval item not found');
    this.assertReviewerAccess(proposal, input.actorId, input.actorRole);
    this.assertIntegrity(proposal);
    return this.withoutExecutionGrantHash(proposal);
  }

  async recordReviewDecision(input: {
    organizationId: string;
    proposalId: string;
    actorId: string;
    actorRole: string;
    decision: 'REJECT' | 'REQUEST_CHANGES';
    reason: string;
    sandboxReportId?: string;
  }) {
    const reason = input.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'A specific review reason of at least 5 characters is required',
      );
    }
    const decidedAt = new Date();
    const targetStatus =
      input.decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
    const result = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const proposal = await tx.actionProposal.findFirst({
          where: {
            id: input.proposalId,
            organizationId: input.organizationId,
          },
          include: { notification: true },
        });
        if (!proposal) throw new NotFoundException('Approval item not found');
        this.assertReviewerAccess(proposal, input.actorId, input.actorRole);
        this.assertIntegrity(proposal);
        const transitioned = await tx.actionProposal.updateMany({
          where: {
            id: proposal.id,
            organizationId: input.organizationId,
            status: 'PENDING',
          },
          data: {
            status: targetStatus,
            activeDedupeSlot: null,
            decidedAt,
            result: {
              status: targetStatus.toLowerCase(),
              reason,
            },
          },
        });
        if (transitioned.count !== 1) {
          throw new BadRequestException(
            'Approval item is already being processed or has been decided',
          );
        }
        const decision = await tx.approvalDecision.create({
          data: {
            organizationId: input.organizationId,
            actionProposalId: proposal.id,
            decision: input.decision,
            actorId: input.actorId,
            actorRole: input.actorRole,
            reason,
            payloadHash: proposal.payloadHash,
            sandboxReportId: input.sandboxReportId ?? null,
            metadata: {
              proposalStatus: targetStatus,
              decidedAt: decidedAt.toISOString(),
            },
          },
        });
        await this.recordDecisionFeedback(tx, proposal, decision);
        const metadata = this.jsonRecord(proposal.notification.metadata);
        const notification = await tx.notification.update({
          where: { id: proposal.notificationId },
          data: {
            readAt: proposal.notification.readAt ?? decidedAt,
            metadata: {
              ...metadata,
              decision: {
                status: targetStatus.toLowerCase(),
                reason,
                actorId: input.actorId,
                decidedAt: decidedAt.toISOString(),
                actionProposalId: proposal.id,
              },
            },
          },
        });
        return { proposal, decision, notification, status: targetStatus };
      },
    );
    await this.audit.appendStrict({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: `approval-item.${input.decision.toLowerCase()}`,
      resourceType: 'ActionProposal',
      resourceId: input.proposalId,
      after: {
        decisionId: result.decision.id,
        status: result.status,
        reason,
        payloadHash: result.proposal.payloadHash,
        sandboxReportId: input.sandboxReportId ?? null,
      },
    });
    this.notificationEvents.publishUpdated(result.notification);
    return result;
  }

  async claimExecutionById(input: {
    organizationId: string;
    proposalId: string;
    actorId: string;
    actorRole: string;
    reason?: string;
    sandboxReportId?: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const outcome = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const proposal = await tx.actionProposal.findFirst({
          where: {
            id: input.proposalId,
            organizationId: input.organizationId,
          },
          include: { notification: true },
        });
        if (!proposal) throw new NotFoundException('Approval item not found');
        this.assertReviewerAccess(proposal, input.actorId, input.actorRole);
        this.assertIntegrity(proposal);
        if (!['PENDING', 'CHANGES_REQUESTED'].includes(proposal.status)) {
          throw new BadRequestException(
            'Approval item is already being processed or has been decided',
          );
        }
        const isOverride = proposal.status === 'CHANGES_REQUESTED';
        if (
          isOverride &&
          (!this.isElevatedReviewer(input.actorRole) ||
            !input.sandboxReportId ||
            (input.reason?.trim().length ?? 0) < 10)
        ) {
          throw new BadRequestException(
            'A sandbox override requires an administrator, report ID, and a specific reason',
          );
        }
        if (proposal.expiresAt <= now) {
          await tx.actionProposal.updateMany({
            where: {
              id: proposal.id,
              organizationId: input.organizationId,
              status: proposal.status,
            },
            data: {
              status: 'EXPIRED',
              activeDedupeSlot: null,
              decidedAt: now,
              error: 'Action proposal expired before approval',
            },
          });
          return { expired: true as const, proposal };
        }
        const decisionId = randomUUID();
        const executionGrant = this.issueExecutionGrant(
          proposal,
          decisionId,
          now,
        );
        const transitioned = await tx.actionProposal.updateMany({
          where: {
            id: proposal.id,
            organizationId: input.organizationId,
            status: proposal.status,
          },
          data: {
            status: 'EXECUTING',
            claimedAt: now,
            lastHeartbeatAt: now,
            executionAttempt: { increment: 1 },
            executionGrantHash: this.hashGrantToken(executionGrant.token),
            executionGrantScope: executionGrant.capabilityScope,
            executionGrantDecisionId: decisionId,
            executionGrantExpiresAt: executionGrant.expiresAt,
            executionGrantConsumedAt: null,
          },
        });
        if (transitioned.count !== 1) {
          throw new BadRequestException(
            'Approval item is already being processed or has been decided',
          );
        }
        const decision = await tx.approvalDecision.create({
          data: {
            id: decisionId,
            organizationId: input.organizationId,
            actionProposalId: proposal.id,
            decision: isOverride ? 'OVERRIDE' : 'APPROVE',
            actorId: input.actorId,
            actorRole: input.actorRole,
            reason: input.reason?.trim() || null,
            payloadHash: proposal.payloadHash,
            sandboxReportId: input.sandboxReportId ?? null,
            metadata: {
              proposalStatus: 'EXECUTING',
              capabilityScope: executionGrant.capabilityScope,
              executionGrantExpiresAt: executionGrant.expiresAt.toISOString(),
              idempotencyKey: executionGrant.idempotencyKey,
              [isOverride ? 'overriddenAt' : 'approvedAt']: now.toISOString(),
            },
          },
        });
        await this.recordDecisionFeedback(tx, proposal, decision);
        return {
          expired: false as const,
          proposal,
          decision,
          executionGrant,
        };
      },
    );
    if (outcome.expired) {
      throw new BadRequestException('Action proposal has expired');
    }
    await this.audit.appendStrict({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action:
        outcome.decision.decision === 'OVERRIDE'
          ? 'approval-item.override-intent'
          : 'approval-item.approve-intent',
      resourceType: 'ActionProposal',
      resourceId: input.proposalId,
      after: {
        decisionId: outcome.decision.id,
        payloadHash: outcome.proposal.payloadHash,
        sandboxReportId: input.sandboxReportId ?? null,
        executionState: 'EXECUTING',
        capabilityScope: outcome.executionGrant.capabilityScope,
        executionGrantExpiresAt: outcome.executionGrant.expiresAt.toISOString(),
        idempotencyKey: outcome.executionGrant.idempotencyKey,
      },
    });
    return {
      ...outcome.proposal,
      status: 'EXECUTING' as const,
      claimedAt: now,
      approvalDecision: outcome.decision,
      executionGrant: outcome.executionGrant,
    };
  }

  async create(input: CreateActionProposalInput) {
    const expiresAt =
      input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60_000);
    const context = this.jsonRecord(input.context);
    const params = this.jsonRecord(input.action.params);
    const dedupeKey =
      input.dedupeKey?.trim() ||
      this.computeDedupeKey({
        organizationId: input.organizationId,
        approverId: input.approverId,
        source: input.source,
        action: input.action.name,
        params,
        context,
      });
    const active = await this.findActive(input.organizationId, dedupeKey);
    if (active) {
      return { proposal: active, notification: active.notification };
    }

    const proposalId = randomUUID();
    const notificationId = randomUUID();
    const hashable: HashableProposal = {
      organizationId: input.organizationId,
      notificationId,
      requestedBy: input.requestedBy,
      approverId: input.approverId,
      source: input.source,
      action: input.action.name,
      params,
      context,
      expiresAt,
    } as HashableProposal;
    const payloadHash = this.computePayloadHash(hashable);

    let created;
    try {
      created = await this.tenantDatabase.run(
        input.organizationId,
        async (tx) => {
          const notification = await tx.notification.create({
            data: {
              id: notificationId,
              organizationId: input.organizationId,
              userId: input.approverId,
              type: input.type ?? 'APPROVAL_REQUIRED',
              title: input.title,
              body: input.body ?? null,
              metadata: {
                kind: this.presentationKind(context),
                source: input.source,
                riskLevel: this.presentationRiskLevel(context),
                requiresConfirmation: true,
                actionProposalId: proposalId,
                action: {
                  label: input.action.label ?? '执行',
                  name: input.action.name,
                },
                proposal: {
                  status: 'PENDING',
                  payloadHash,
                  expiresAt: expiresAt.toISOString(),
                },
              } satisfies Prisma.InputJsonObject,
            },
          });
          const proposal = await tx.actionProposal.create({
            data: {
              id: proposalId,
              organizationId: input.organizationId,
              notificationId,
              requestedBy: input.requestedBy,
              approverId: input.approverId,
              source: input.source,
              action: input.action.name,
              params,
              context,
              payloadHash,
              dedupeKey,
              version: 1,
              activeDedupeSlot: 'ACTIVE',
              status: 'PENDING',
              expiresAt,
            },
          });
          return { notification, proposal };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.findActive(
          input.organizationId,
          dedupeKey,
        );
        if (concurrent) {
          return {
            proposal: concurrent,
            notification: concurrent.notification,
          };
        }
      }
      throw error;
    }

    await this.audit.log({
      organizationId: input.organizationId,
      actorId: input.requestedBy,
      action: 'action-proposal.create',
      resourceType: 'ActionProposal',
      resourceId: created.proposal.id,
      after: {
        notificationId: created.notification.id,
        approverId: input.approverId,
        source: input.source,
        action: input.action.name,
        payloadHash,
        dedupeKey,
        expiresAt: expiresAt.toISOString(),
      },
    });
    this.notificationEvents.publishCreated(created.notification);
    return created;
  }

  async findForNotification(input: {
    organizationId: string;
    approverId: string;
    notificationId: string;
  }) {
    return this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.actionProposal.findFirst({
        where: {
          organizationId: input.organizationId,
          approverId: input.approverId,
          notificationId: input.notificationId,
        },
      }),
    );
  }

  async claimExecution(input: {
    organizationId: string;
    approverId: string;
    notificationId: string;
    actorRole?: string;
    reason?: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const outcome = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const proposal = await tx.actionProposal.findFirst({
          where: {
            organizationId: input.organizationId,
            approverId: input.approverId,
            notificationId: input.notificationId,
          },
          include: { notification: true },
        });
        if (!proposal) {
          throw new BadRequestException(
            'Notification has no trusted action proposal; regenerate the request',
          );
        }
        this.assertIntegrity(proposal);
        if (proposal.expiresAt <= now) {
          await tx.actionProposal.updateMany({
            where: {
              id: proposal.id,
              organizationId: input.organizationId,
              status: 'PENDING',
            },
            data: {
              status: 'EXPIRED',
              activeDedupeSlot: null,
              decidedAt: now,
              error: 'Action proposal expired before approval',
            },
          });
          return { expired: true as const, proposal };
        }
        const decisionId = randomUUID();
        const executionGrant = this.issueExecutionGrant(
          proposal,
          decisionId,
          now,
        );
        const transitioned = await tx.actionProposal.updateMany({
          where: {
            id: proposal.id,
            organizationId: input.organizationId,
            status: 'PENDING',
          },
          data: {
            status: 'EXECUTING',
            claimedAt: now,
            lastHeartbeatAt: now,
            executionAttempt: { increment: 1 },
            executionGrantHash: this.hashGrantToken(executionGrant.token),
            executionGrantScope: executionGrant.capabilityScope,
            executionGrantDecisionId: decisionId,
            executionGrantExpiresAt: executionGrant.expiresAt,
            executionGrantConsumedAt: null,
          },
        });
        if (transitioned.count !== 1) {
          throw new BadRequestException(
            'Action proposal is already being processed or has been decided',
          );
        }
        const decision = await tx.approvalDecision.create({
          data: {
            id: decisionId,
            organizationId: input.organizationId,
            actionProposalId: proposal.id,
            decision: 'APPROVE',
            actorId: input.approverId,
            actorRole: input.actorRole ?? 'APPROVER',
            reason: input.reason?.trim() || null,
            payloadHash: proposal.payloadHash,
            metadata: {
              proposalStatus: 'EXECUTING',
              approvedAt: now.toISOString(),
              capabilityScope: executionGrant.capabilityScope,
              executionGrantExpiresAt: executionGrant.expiresAt.toISOString(),
              idempotencyKey: executionGrant.idempotencyKey,
            },
          },
        });
        await this.recordDecisionFeedback(tx, proposal, decision);
        return {
          expired: false as const,
          proposal,
          decision,
          executionGrant,
        };
      },
    );
    if (outcome.expired) {
      throw new BadRequestException('Action proposal has expired');
    }
    await this.audit.appendStrict({
      organizationId: input.organizationId,
      actorId: input.approverId,
      action: 'approval-item.approve-intent',
      resourceType: 'ActionProposal',
      resourceId: outcome.proposal.id,
      after: {
        decisionId: outcome.decision.id,
        payloadHash: outcome.proposal.payloadHash,
        executionState: 'EXECUTING',
        capabilityScope: outcome.executionGrant.capabilityScope,
        executionGrantExpiresAt: outcome.executionGrant.expiresAt.toISOString(),
        idempotencyKey: outcome.executionGrant.idempotencyKey,
      },
    });
    return {
      ...outcome.proposal,
      status: 'EXECUTING' as const,
      claimedAt: now,
      approvalDecision: outcome.decision,
      executionGrant: outcome.executionGrant,
    };
  }

  async consumeExecutionGrant(input: {
    organizationId: string;
    proposalId: string;
    approvalDecisionId: string;
    action: string;
    payloadHash: string;
    token: string;
    capabilityScope: string;
    now?: Date;
  }): Promise<VerifiedApprovalExecution> {
    const now = input.now ?? new Date();
    const expectedScope = this.capabilityScope(input.action);
    if (
      !input.token.startsWith('apt_') ||
      input.capabilityScope !== expectedScope
    ) {
      throw this.invalidExecutionGrant();
    }
    const tokenHash = this.hashGrantToken(input.token);
    const consumed = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const decision = await tx.approvalDecision.findFirst({
          where: {
            id: input.approvalDecisionId,
            organizationId: input.organizationId,
            actionProposalId: input.proposalId,
            payloadHash: input.payloadHash,
            decision: { in: ['APPROVE', 'OVERRIDE'] },
          },
          select: { id: true, actorId: true },
        });
        if (!decision) throw this.invalidExecutionGrant();
        const result = await tx.actionProposal.updateMany({
          where: {
            id: input.proposalId,
            organizationId: input.organizationId,
            status: 'EXECUTING',
            action: input.action,
            payloadHash: input.payloadHash,
            executionGrantHash: tokenHash,
            executionGrantScope: expectedScope,
            executionGrantDecisionId: input.approvalDecisionId,
            executionGrantExpiresAt: { gt: now },
            executionGrantConsumedAt: null,
          },
          data: { executionGrantConsumedAt: now },
        });
        if (result.count !== 1) throw this.invalidExecutionGrant();
        return decision;
      },
    );
    const verified: VerifiedApprovalExecution = {
      proposalId: input.proposalId,
      approvalDecisionId: consumed.id,
      action: input.action,
      capabilityScope: expectedScope,
      payloadHash: input.payloadHash,
      idempotencyKey: this.executionIdempotencyKey(
        input.proposalId,
        input.payloadHash,
      ),
      consumedAt: now,
    };
    await this.audit.appendStrict({
      organizationId: input.organizationId,
      actorId: consumed.actorId,
      action: 'approval-execution-grant.consume',
      resourceType: 'ActionProposal',
      resourceId: input.proposalId,
      after: {
        approvalDecisionId: consumed.id,
        action: input.action,
        capabilityScope: expectedScope,
        payloadHash: input.payloadHash,
        idempotencyKey: verified.idempotencyKey,
        consumedAt: now.toISOString(),
      },
    });
    return verified;
  }

  private issueExecutionGrant(
    proposal: Pick<
      ActionProposal,
      'id' | 'action' | 'payloadHash' | 'expiresAt'
    >,
    approvalDecisionId: string,
    now: Date,
  ): ApprovalExecutionGrant {
    const expiresAt = new Date(
      Math.min(proposal.expiresAt.getTime(), now.getTime() + 5 * 60_000),
    );
    return {
      token: `apt_${randomBytes(32).toString('base64url')}`,
      proposalId: proposal.id,
      approvalDecisionId,
      action: proposal.action,
      capabilityScope: this.capabilityScope(proposal.action),
      payloadHash: proposal.payloadHash,
      expiresAt,
      idempotencyKey: this.executionIdempotencyKey(
        proposal.id,
        proposal.payloadHash,
      ),
    };
  }

  private capabilityScope(action: string): string {
    return `action:${action}`;
  }

  private executionIdempotencyKey(
    proposalId: string,
    payloadHash: string,
  ): string {
    return `approval:${proposalId}:${payloadHash}`;
  }

  private hashGrantToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private invalidExecutionGrant(): BadRequestException {
    return new BadRequestException({
      code: 'APPROVAL_EXECUTION_GRANT_INVALID',
      message:
        'Approval execution grant is invalid, expired, already consumed, or outside its capability scope',
    });
  }

  private withoutExecutionGrantHash<
    T extends { executionGrantHash?: string | null },
  >(proposal: T): Omit<T, 'executionGrantHash'> {
    const { executionGrantHash: _executionGrantHash, ...safe } = proposal;
    return safe;
  }

  async dismiss(input: {
    organizationId: string;
    approverId: string;
    notificationId: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const proposal = await this.findForNotification(input);
    if (!proposal) return null;
    this.assertIntegrity(proposal);
    const dismissed = await this.transition(
      input.organizationId,
      proposal.id,
      'PENDING',
      {
        status: 'DISMISSED',
        activeDedupeSlot: null,
        decidedAt: now,
        result: { status: 'dismissed' },
      },
    );
    if (!dismissed) {
      throw new BadRequestException(
        'Action proposal is already being processed or has been decided',
      );
    }
    return { ...proposal, status: 'DISMISSED' as const, decidedAt: now };
  }

  async completeExecution(input: {
    organizationId: string;
    proposalId: string;
    status: 'APPROVED' | 'EXECUTED' | 'FAILED';
    result: unknown;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const completed = await this.transition(
      input.organizationId,
      input.proposalId,
      'EXECUTING',
      {
        status: input.status,
        activeDedupeSlot: null,
        result: this.jsonValue(input.result),
        decidedAt: now,
        executedAt: input.status === 'EXECUTED' ? now : null,
      },
    );
    if (!completed) {
      throw new BadRequestException('Action proposal execution state changed');
    }
    return this.requireTerminalState(
      input.organizationId,
      input.proposalId,
      input.status,
    );
  }

  async reconcileApprovedProductLaunchOutcome(input: {
    organizationId: string;
    productLaunchId: string;
    status: 'EXECUTED' | 'FAILED';
    result: unknown;
    now?: Date;
  }): Promise<{ updated: boolean; proposalId: string | null }> {
    const proposal = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.actionProposal.findFirst({
        where: {
          organizationId: input.organizationId,
          action: 'product-launch.confirm-publish',
          status: 'APPROVED',
          params: {
            path: ['productLaunchId'],
            equals: input.productLaunchId,
          },
        },
      }),
    );
    if (!proposal) {
      return { updated: false, proposalId: null };
    }

    const now = input.now ?? new Date();
    const transition = await this.tenantDatabase.run(
      input.organizationId,
      (tx) =>
        tx.actionProposal.updateMany({
          where: {
            id: proposal.id,
            organizationId: input.organizationId,
            status: 'APPROVED',
          },
          data: {
            status: input.status,
            result: this.jsonValue(input.result),
            error:
              input.status === 'FAILED'
                ? this.errorDetails(input.result).message
                : null,
            executedAt: input.status === 'EXECUTED' ? now : null,
          },
        }),
    );
    if (transition.count !== 1) {
      return { updated: false, proposalId: proposal.id };
    }

    await this.audit.log({
      organizationId: input.organizationId,
      actorId: 'system',
      action: 'action-proposal.external-result-reconciled',
      resourceType: 'ActionProposal',
      resourceId: proposal.id,
      before: { status: 'APPROVED' },
      after: {
        status: input.status,
        productLaunchId: input.productLaunchId,
      },
    });
    return { updated: true, proposalId: proposal.id };
  }

  private async recordDecisionFeedback(
    tx: Prisma.TransactionClient,
    proposal: {
      id: string;
      organizationId: string;
      action: string;
      context: Prisma.JsonValue;
    },
    decision: {
      id: string;
      decision: string;
      actorId: string;
      actorRole: string;
      reason: string | null;
      sandboxReportId: string | null;
    },
  ): Promise<void> {
    const context = this.jsonRecord(proposal.context);
    const candidateRunId = this.optionalText(context.agentRunId);
    const run = candidateRunId
      ? await tx.agentRun.findFirst({
          where: {
            id: candidateRunId,
            organizationId: proposal.organizationId,
          },
          select: { id: true, agentType: true },
        })
      : null;
    const contextAgentType = this.optionalText(context.agentType);
    const agentType = run?.agentType ?? this.asAgentType(contextAgentType);
    const signalType =
      decision.decision === 'APPROVE' || decision.decision === 'OVERRIDE'
        ? 'APPROVAL_APPROVED'
        : decision.decision === 'REQUEST_CHANGES'
          ? 'APPROVAL_CHANGES_REQUESTED'
          : 'APPROVAL_REJECTED';
    await tx.feedbackSignal.create({
      data: {
        organizationId: proposal.organizationId,
        runId: run?.id,
        approvalId: proposal.id,
        listingId: this.optionalText(context.listingDraftId),
        snapshotId: this.optionalText(context.publishSnapshotId),
        agentType,
        signalType,
        source: 'APPROVAL_SERVICE',
        externalReference: decision.id,
        value: {
          decision: decision.decision,
          actorId: decision.actorId,
          actorRole: decision.actorRole,
          reason: decision.reason,
          action: proposal.action,
          sandboxReportId: decision.sandboxReportId,
        },
      },
    });
  }

  private asAgentType(value: string | null): AgentType | undefined {
    return value && Object.values(AgentType).includes(value as AgentType)
      ? (value as AgentType)
      : undefined;
  }

  private optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  async failExecution(input: {
    organizationId: string;
    proposalId: string;
    error: unknown;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const details = this.errorDetails(input.error);
    const sandboxBlocked = details.code === 'LISTING_SANDBOX_BLOCKED';
    const nextStatus = sandboxBlocked ? 'CHANGES_REQUESTED' : 'FAILED';
    const failed = await this.transition(
      input.organizationId,
      input.proposalId,
      'EXECUTING',
      {
        status: nextStatus,
        activeDedupeSlot: sandboxBlocked ? 'ACTIVE' : null,
        decidedAt: now,
        error: details.message,
        result: sandboxBlocked ? this.jsonRecord(details) : undefined,
      },
    );
    if (!failed) {
      throw new BadRequestException('Action proposal execution state changed');
    }
    return this.requireTerminalState(
      input.organizationId,
      input.proposalId,
      nextStatus,
    );
  }

  computePayloadHash(
    proposal: Omit<HashableProposal, 'params' | 'context'> & {
      params: unknown;
      context: unknown;
    },
  ): string {
    const canonical = this.canonicalize({
      version: 1,
      organizationId: proposal.organizationId,
      notificationId: proposal.notificationId,
      requestedBy: proposal.requestedBy,
      approverId: proposal.approverId,
      source: proposal.source,
      action: proposal.action,
      params: proposal.params,
      context: proposal.context,
      expiresAt: proposal.expiresAt.toISOString(),
    });
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  computeDedupeKey(input: {
    organizationId: string;
    approverId: string;
    source: string;
    action: string;
    params: unknown;
    context: unknown;
  }): string {
    const canonical = this.canonicalize({
      version: 1,
      organizationId: input.organizationId,
      approverId: input.approverId,
      source: input.source,
      action: input.action,
      params: input.params,
      context: input.context,
    });
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  async recoverStaleExecutions(input: {
    organizationId: string;
    staleBefore: Date;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.actionProposal.updateMany({
        where: {
          organizationId: input.organizationId,
          status: 'EXECUTING',
          claimedAt: { lt: input.staleBefore },
        },
        data: {
          status: 'UNKNOWN',
          activeDedupeSlot: 'ACTIVE',
          decidedAt: now,
          error:
            'Execution worker stopped before a terminal result was recorded; manual reconciliation is required',
          result: {
            status: 'unknown',
            requiresReconciliation: true,
            recoveredAt: now.toISOString(),
          },
        },
      }),
    );
    if (result.count > 0) {
      await this.audit.log({
        organizationId: input.organizationId,
        actorId: 'system',
        action: 'action-proposal.stale-execution-recovered',
        resourceType: 'ActionProposal',
        resourceId: 'batch',
        after: {
          count: result.count,
          status: 'UNKNOWN',
          staleBefore: input.staleBefore.toISOString(),
        },
      });
    }
    return { recovered: result.count, status: 'UNKNOWN' as const };
  }

  async heartbeatExecution(input: {
    organizationId: string;
    proposalId: string;
    now?: Date;
  }) {
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.actionProposal.updateMany({
        where: {
          id: input.proposalId,
          organizationId: input.organizationId,
          status: 'EXECUTING',
        },
        data: { lastHeartbeatAt: input.now ?? new Date() },
      }),
    );
    return { updated: result.count === 1 };
  }

  private async findActive(organizationId: string, dedupeKey: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.actionProposal.findFirst({
        where: {
          organizationId,
          dedupeKey,
          activeDedupeSlot: 'ACTIVE',
          status: { in: ['PENDING', 'EXECUTING', 'UNKNOWN'] },
        },
        include: { notification: true },
      }),
    );
  }

  private async requireTerminalState(
    organizationId: string,
    proposalId: string,
    expectedStatus: 'APPROVED' | 'EXECUTED' | 'FAILED' | 'CHANGES_REQUESTED',
  ): Promise<ActionProposal> {
    const proposal = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.actionProposal.findFirst({
        where: { id: proposalId, organizationId },
      }),
    );
    if (!proposal || proposal.status !== expectedStatus) {
      throw new BadRequestException(
        'Action proposal terminal state could not be verified',
      );
    }
    return proposal;
  }

  private assertIntegrity(proposal: ActionProposal) {
    if (this.computePayloadHash(proposal) !== proposal.payloadHash) {
      throw new BadRequestException(
        'Action proposal integrity verification failed',
      );
    }
  }

  private async transition(
    organizationId: string,
    proposalId: string,
    fromStatus: ActionProposal['status'],
    data: Prisma.ActionProposalUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.actionProposal.updateMany({
        where: { id: proposalId, organizationId, status: fromStatus },
        data,
      }),
    );
    return result.count === 1;
  }

  private presentationKind(context: Record<string, unknown>): string {
    return typeof context.kind === 'string'
      ? context.kind
      : 'action_proposal_review';
  }

  private presentationRiskLevel(context: Record<string, unknown>): string {
    return typeof context.riskLevel === 'string' ? context.riskLevel : 'high';
  }

  private assertReviewerAccess(
    proposal: Pick<ActionProposal, 'approverId'>,
    actorId: string,
    actorRole: string,
  ) {
    if (
      proposal.approverId !== actorId &&
      !this.isElevatedReviewer(actorRole)
    ) {
      throw new ForbiddenException(
        'Approval item is not assigned to the current reviewer',
      );
    }
  }

  private isElevatedReviewer(role: string): boolean {
    return role === 'OWNER' || role === 'ADMIN';
  }

  private errorDetails(error: unknown): Record<string, unknown> & {
    code: string;
    message: string;
  } {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const details =
        response && typeof response === 'object' && !Array.isArray(response)
          ? { ...(response as Record<string, unknown>) }
          : {};
      const responseMessage = details.message;
      return {
        ...details,
        code:
          typeof details.code === 'string'
            ? details.code
            : `HTTP_${error.getStatus()}`,
        message:
          typeof responseMessage === 'string' ? responseMessage : error.message,
      };
    }
    return {
      code: 'UNKNOWN_EXECUTION_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private jsonRecord(value: unknown): Prisma.InputJsonObject {
    const normalized = this.canonicalize(value);
    return normalized &&
      typeof normalized === 'object' &&
      !Array.isArray(normalized)
      ? normalized
      : {};
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    const normalized = this.canonicalize(value);
    return (normalized ?? null) as Prisma.InputJsonValue;
  }

  private canonicalize(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value))
      return value.map((item) => this.canonicalize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalize(item)]),
      );
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    throw new TypeError('Unsupported action proposal payload value');
  }
}
