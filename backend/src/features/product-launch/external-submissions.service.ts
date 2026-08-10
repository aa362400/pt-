import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExternalSubmissionStatus, Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  hashPublishExecutionGrant,
  OZON_LISTING_PUBLISH_CAPABILITY,
} from './publish-execution-grant.js';

export interface SubmissionIdentity {
  organizationId: string;
  productLaunchId: string;
  publishSnapshotId: string;
  snapshotHash: string;
}

export interface ExternalPublishResult {
  status: string;
  taskId?: string | number | null;
  channelId?: string | null;
  externalProductId?: string | number | null;
  code?: string | null;
  message?: string | null;
}

interface LaunchClaim {
  claimToken: string;
  execution: Prisma.InputJsonValue;
}

@Injectable()
export class ExternalSubmissionsService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async prepare(input: SubmissionIdentity) {
    const idempotencyKey = this.idempotencyKey(input);
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const storedSnapshot = await tx.listingPublishSnapshot.findFirst({
        where: {
          id: input.publishSnapshotId,
          organizationId: input.organizationId,
          productLaunchId: input.productLaunchId,
          snapshotHash: input.snapshotHash,
          status: 'APPROVED',
        },
        select: { snapshot: true },
      });
      const payload = this.asRecord(
        this.asRecord(storedSnapshot?.snapshot).payload,
      );
      if (!storedSnapshot || Object.keys(payload).length === 0) {
        throw this.conflict(
          'EXTERNAL_SUBMISSION_SNAPSHOT_INVALID',
          'The approved snapshot payload was not found for this submission',
        );
      }
      const payloadHash = this.sha256(payload);
      let submission = await tx.externalSubmission.upsert({
        where: {
          organizationId_provider_idempotencyKey: {
            organizationId: input.organizationId,
            provider: 'OZON',
            idempotencyKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          productLaunchId: input.productLaunchId,
          publishSnapshotId: input.publishSnapshotId,
          provider: 'OZON',
          operation: 'PRODUCT_PUBLISH',
          idempotencyKey,
          requestHash: input.snapshotHash,
          payloadHash,
          request: {
            schemaVersion: 'external-submission/v2',
            publishSnapshotId: input.publishSnapshotId,
            snapshotHash: input.snapshotHash,
            payloadHash,
          },
        },
        update: {},
      });
      if (
        submission.productLaunchId !== input.productLaunchId ||
        submission.publishSnapshotId !== input.publishSnapshotId ||
        submission.requestHash !== input.snapshotHash ||
        (submission.payloadHash !== null &&
          submission.payloadHash !== payloadHash)
      ) {
        throw this.conflict(
          'EXTERNAL_SUBMISSION_IDENTITY_MISMATCH',
          'External submission identity does not match the approved snapshot',
        );
      }
      if (submission.payloadHash === null) {
        submission = await tx.externalSubmission.update({
          where: { id: submission.id },
          data: { payloadHash },
        });
      }
      return submission;
    });
  }

  async find(input: SubmissionIdentity) {
    return this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.externalSubmission.findFirst({
        where: {
          organizationId: input.organizationId,
          productLaunchId: input.productLaunchId,
          publishSnapshotId: input.publishSnapshotId,
          requestHash: input.snapshotHash,
        },
      }),
    );
  }

  async claimLaunchForSend(input: SubmissionIdentity, claim: LaunchClaim) {
    const prepared = await this.prepare(input);
    await this.tenantDatabase.run(input.organizationId, async (tx) => {
      const launchClaim = await tx.productLaunch.updateMany({
        where: {
          id: input.productLaunchId,
          organizationId: input.organizationId,
          status: 'QUEUED',
          confirmAutoPublish: true,
          imageGenerationApproved: true,
          selectedPublishSnapshotId: input.publishSnapshotId,
          approvedPublishSnapshotHash: input.snapshotHash,
        },
        data: {
          status: 'SUBMITTING_TO_OZON',
          startedAt: new Date(),
          completedAt: null,
          failureCode: null,
          failureMessage: null,
          execution: claim.execution,
        },
      });
      if (launchClaim.count !== 1) {
        throw this.conflict(
          'PRODUCT_LAUNCH_ALREADY_CLAIMED',
          'Product launch is no longer claimable for this approved snapshot',
        );
      }

      const submissionClaim = await tx.externalSubmission.updateMany({
        where: {
          id: prepared.id,
          status: { in: ['PREPARED', 'RETRYABLE_FAILED'] },
        },
        data: {
          status: 'CLAIMED',
          claimToken: claim.claimToken,
          claimedAt: new Date(),
          attemptCount: { increment: 1 },
          failureCode: null,
          failureMessage: null,
        },
      });
      if (submissionClaim.count !== 1) {
        throw this.conflict(
          'EXTERNAL_SUBMISSION_REQUIRES_RECONCILIATION',
          'External submission is already claimed or was previously sent',
        );
      }
    });
    return this.findRequired(input);
  }

  async markRequestStarted(
    input: SubmissionIdentity,
    claimToken: string,
    publishExecutionGrant: string,
  ) {
    const now = new Date();
    await this.tenantDatabase.run(input.organizationId, async (tx) => {
      const existing = await tx.externalSubmission.findFirst({
        where: {
          organizationId: input.organizationId,
          productLaunchId: input.productLaunchId,
          publishSnapshotId: input.publishSnapshotId,
          requestHash: input.snapshotHash,
          status: 'CLAIMED',
          claimToken,
        },
        select: { id: true },
      });
      if (!existing) {
        throw this.conflict(
          'EXTERNAL_SUBMISSION_CLAIM_LOST',
          'Only the active immutable submission claim can start a request',
        );
      }

      const grant = await tx.productLaunch.updateMany({
        where: {
          id: input.productLaunchId,
          organizationId: input.organizationId,
          status: 'SUBMITTING_TO_OZON',
          selectedPublishSnapshotId: input.publishSnapshotId,
          approvedPublishSnapshotHash: input.snapshotHash,
          publishExecutionGrantHash: hashPublishExecutionGrant(
            publishExecutionGrant,
          ),
          publishExecutionGrantScope: OZON_LISTING_PUBLISH_CAPABILITY,
          publishExecutionGrantSnapshotHash: input.snapshotHash,
          publishExecutionGrantExpiresAt: { gt: now },
          publishExecutionGrantConsumedAt: null,
        },
        data: { publishExecutionGrantConsumedAt: now },
      });
      if (grant.count !== 1) {
        throw this.conflict(
          'PUBLISH_EXECUTION_GRANT_INVALID',
          'The one-time publish grant is missing, expired, mismatched, or already consumed',
        );
      }

      const changed = await tx.externalSubmission.updateMany({
        where: {
          id: existing.id,
          status: 'CLAIMED',
          claimToken,
        },
        data: {
          status: 'REQUEST_SENT',
          requestSentAt: now,
        },
      });
      if (changed.count !== 1) {
        throw this.conflict(
          'EXTERNAL_SUBMISSION_CLAIM_LOST',
          'The immutable submission claim was lost before request dispatch',
        );
      }
    });
    return this.findRequired(input);
  }

  async markRetryableFailureBeforeDispatch(
    input: SubmissionIdentity,
    claimToken: string,
    error: unknown,
  ) {
    const existing = await this.findRequired(input);
    const message = this.errorMessage(error).slice(0, 2000);
    await this.tenantDatabase.run(input.organizationId, async (tx) => {
      const submission = await tx.externalSubmission.updateMany({
        where: {
          id: existing.id,
          status: 'CLAIMED',
          claimToken,
        },
        data: {
          status: 'RETRYABLE_FAILED',
          failureCode: 'EXTERNAL_SUBMISSION_NOT_DISPATCHED',
          failureMessage: message,
        },
      });
      if (submission.count !== 1) {
        throw this.conflict(
          'EXTERNAL_SUBMISSION_CLAIM_LOST',
          'Only the active claim can release a submission before dispatch',
        );
      }
      const launch = await tx.productLaunch.updateMany({
        where: {
          id: input.productLaunchId,
          organizationId: input.organizationId,
          status: 'SUBMITTING_TO_OZON',
          selectedPublishSnapshotId: input.publishSnapshotId,
          approvedPublishSnapshotHash: input.snapshotHash,
        },
        data: {
          status: 'QUEUED',
          failureCode: 'EXTERNAL_SUBMISSION_NOT_DISPATCHED',
          failureMessage: message,
        },
      });
      if (launch.count !== 1) {
        throw this.conflict(
          'PRODUCT_LAUNCH_CLAIM_LOST',
          'The product launch can no longer be released for retry',
        );
      }
    });
    return this.findRequired(input);
  }

  async recordResult(
    input: SubmissionIdentity,
    result: ExternalPublishResult,
    claimToken: string,
  ) {
    const existing = await this.findRequired(input);
    const changed = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.externalSubmission.updateMany({
        where: {
          id: existing.id,
          status: 'REQUEST_SENT',
          claimToken,
        },
        data: this.resultData(result, new Date()),
      }),
    );
    this.assertTransition(changed.count, 'EXTERNAL_SUBMISSION_CLAIM_LOST');
    return this.findRequired(input);
  }

  async recordUnknown(
    input: SubmissionIdentity,
    error: unknown,
    claimToken: string,
  ) {
    const existing = await this.findRequired(input);
    const changed = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.externalSubmission.updateMany({
        where: {
          id: existing.id,
          status: 'REQUEST_SENT',
          claimToken,
        },
        data: {
          status: 'UNKNOWN',
          failureCode: 'EXTERNAL_SUBMISSION_OUTCOME_UNKNOWN',
          failureMessage: this.errorMessage(error).slice(0, 2000),
          result: {
            schemaVersion: 'external-submission-result/v2',
            outcome: 'unknown',
            requiresReconciliation: true,
          },
        },
      }),
    );
    this.assertTransition(changed.count, 'EXTERNAL_SUBMISSION_CLAIM_LOST');
    return this.findRequired(input);
  }

  async beginReconciliation(
    input: SubmissionIdentity,
    evidence: Record<string, unknown>,
  ) {
    const existing = await this.findRequired(input);
    const changed = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.externalSubmission.updateMany({
        where: {
          id: existing.id,
          status: {
            in: ['CLAIMED', 'REQUEST_SENT', 'UNKNOWN', 'RECONCILING'],
          },
        },
        data: {
          status: 'RECONCILING',
          failureCode: 'EXTERNAL_SUBMISSION_RECONCILING',
          reconciliationResult: {
            ...evidence,
            checkedAt: new Date().toISOString(),
          },
        },
      }),
    );
    this.assertTransition(
      changed.count,
      'EXTERNAL_SUBMISSION_RECONCILIATION_NOT_ALLOWED',
    );
    return this.findRequired(input);
  }

  async recordReconciledResult(
    input: SubmissionIdentity,
    result: ExternalPublishResult,
    evidence: Record<string, unknown>,
  ) {
    const existing = await this.findRequired(input);
    const targetStatus = this.statusFromResult(result.status);
    if (existing.status === 'SUCCEEDED') {
      if (targetStatus === 'SUCCEEDED') return existing;
      throw this.conflict(
        'EXTERNAL_SUBMISSION_RECONCILIATION_NOT_ALLOWED',
        'A succeeded external submission cannot be downgraded by a later readback',
      );
    }
    const now = new Date();
    const allowedStatuses: ExternalSubmissionStatus[] = [
      'PREPARED',
      'CLAIMED',
      'REQUEST_SENT',
      'UNKNOWN',
      'RETRYABLE_FAILED',
      'RECONCILING',
    ];
    if (targetStatus === 'ACKNOWLEDGED' || targetStatus === 'SUCCEEDED') {
      allowedStatuses.push('ACKNOWLEDGED');
    }
    const changed = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.externalSubmission.updateMany({
        where: {
          id: existing.id,
          status: {
            in: allowedStatuses,
          },
        },
        data: {
          ...this.resultData(result, now),
          reconciliationResult: {
            ...evidence,
            resolvedAt: now.toISOString(),
            resultStatus: result.status,
          },
        },
      }),
    );
    this.assertTransition(
      changed.count,
      'EXTERNAL_SUBMISSION_RECONCILIATION_NOT_ALLOWED',
    );
    return this.findRequired(input);
  }

  private resultData(result: ExternalPublishResult, now: Date) {
    const status = this.statusFromResult(result.status);
    return {
      status,
      result: result as unknown as Prisma.InputJsonValue,
      externalTaskId:
        result.taskId === null || result.taskId === undefined
          ? null
          : String(result.taskId),
      externalProductId:
        result.externalProductId === null ||
        result.externalProductId === undefined
          ? null
          : String(result.externalProductId),
      failureCode:
        status === 'REJECTED' || status === 'UNKNOWN'
          ? (result.code ?? 'EXTERNAL_SUBMISSION_FAILED')
          : null,
      failureMessage:
        status === 'REJECTED' || status === 'UNKNOWN'
          ? (result.message ?? null)
          : null,
      responseReceivedAt: now,
      acknowledgedAt:
        status === 'ACKNOWLEDGED' || status === 'SUCCEEDED' ? now : null,
      resolvedAt: status === 'SUCCEEDED' || status === 'REJECTED' ? now : null,
    };
  }

  private async findRequired(input: SubmissionIdentity) {
    const submission = await this.find(input);
    if (!submission) {
      throw new NotFoundException('External submission ledger entry not found');
    }
    return submission;
  }

  private idempotencyKey(input: SubmissionIdentity): string {
    return `product-launch:${input.productLaunchId}:snapshot:${input.snapshotHash}`;
  }

  private statusFromResult(
    status: string,
  ): 'ACKNOWLEDGED' | 'SUCCEEDED' | 'REJECTED' | 'UNKNOWN' {
    if (status === 'ACTIVE_ON_OZON') return 'SUCCEEDED';
    if (status === 'SUBMITTED_TO_OZON') return 'ACKNOWLEDGED';
    if (status === 'FAILED' || status === 'BLOCKED') return 'REJECTED';
    return 'UNKNOWN';
  }

  private assertTransition(count: number, code: string): void {
    if (count !== 1) {
      throw this.conflict(
        code,
        'External submission state changed; stale worker result was rejected',
      );
    }
  }

  private conflict(code: string, message: string) {
    return Object.assign(new ConflictException(message), { code });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private sha256(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
