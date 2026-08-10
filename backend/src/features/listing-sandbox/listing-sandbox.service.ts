import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  ListingSandboxRuleEngine,
  type ListingSandboxRuleHit,
} from './listing-sandbox-rule-engine.js';

@Injectable()
export class ListingSandboxService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly ruleEngine: ListingSandboxRuleEngine,
    private readonly audit: AuditService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    snapshotId: string;
    actorId: string;
  }) {
    const outcome = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const snapshot = await tx.listingPublishSnapshot.findFirst({
          where: {
            id: input.snapshotId,
            organizationId: input.organizationId,
            status: { in: ['APPROVED', 'BLOCKED'] },
          },
          include: {
            productLaunch: { select: { agentRunId: true } },
          },
        });
        if (!snapshot) {
          throw new NotFoundException(
            'Approved listing publish snapshot was not found',
          );
        }
        this.assertSnapshotIntegrity(snapshot.snapshot, snapshot.snapshotHash);

        const existing = await tx.listingSandboxReport.findFirst({
          where: {
            organizationId: input.organizationId,
            publishSnapshotId: snapshot.id,
          },
          include: { ruleHits: { orderBy: { createdAt: 'asc' } } },
        });
        if (existing) {
          if (existing.snapshotHash !== snapshot.snapshotHash) {
            throw new BadRequestException(
              'Sandbox report hash does not match the immutable snapshot',
            );
          }
          return { report: existing, created: false };
        }

        const evaluation = this.ruleEngine.evaluate({
          ...this.record(snapshot.snapshot),
          snapshotHash: snapshot.snapshotHash,
        });
        const report = await tx.listingSandboxReport.create({
          data: {
            organizationId: input.organizationId,
            publishSnapshotId: snapshot.id,
            snapshotHash: snapshot.snapshotHash,
            target: snapshot.target,
            policyVersion: evaluation.policyVersion,
            status: evaluation.status,
            riskLevel: evaluation.riskLevel,
            blocking: evaluation.blocking,
            evaluatedAt: new Date(evaluation.evaluatedAt),
            summary: this.jsonValue({
              decision: evaluation.decision,
              overallScore: evaluation.overallScore,
              thresholds: evaluation.thresholds,
              dimensions: evaluation.dimensions,
              hardBlockCodes: evaluation.hardBlockCodes,
              softBlockCodes: evaluation.softBlockCodes,
              hitCount: evaluation.hits.length,
              blockingHitCount: evaluation.hits.filter((hit) => hit.blocking)
                .length,
              hitCodes: evaluation.hits.map((hit) => hit.code),
            }),
          },
        });
        if (evaluation.hits.length > 0) {
          await tx.policyRuleHit.createMany({
            data: evaluation.hits.map((hit) =>
              this.ruleHitData(input.organizationId, report.id, hit),
            ),
          });
        }
        await tx.listingPublishSnapshot.update({
          where: { id: snapshot.id },
          data: { status: evaluation.blocking ? 'BLOCKED' : 'APPROVED' },
        });
        const agentRun = snapshot.productLaunch.agentRunId
          ? await tx.agentRun.findFirst({
              where: {
                id: snapshot.productLaunch.agentRunId,
                organizationId: input.organizationId,
              },
              select: { id: true, agentType: true },
            })
          : null;
        await tx.feedbackSignal.create({
          data: {
            organizationId: input.organizationId,
            runId: agentRun?.id,
            listingId: snapshot.listingDraftId,
            snapshotId: snapshot.id,
            agentType: agentRun?.agentType,
            signalType: 'SANDBOX_EVALUATED',
            source: 'LISTING_SANDBOX',
            externalReference: report.id,
            value: this.jsonValue({
              status: evaluation.status,
              riskLevel: evaluation.riskLevel,
              blocking: evaluation.blocking,
              decision: evaluation.decision,
              overallScore: evaluation.overallScore,
              dimensions: evaluation.dimensions,
              hardBlockCodes: evaluation.hardBlockCodes,
              softBlockCodes: evaluation.softBlockCodes,
              policyVersion: evaluation.policyVersion,
              hitCodes: evaluation.hits.map((hit) => hit.code),
            }),
          },
        });
        if (evaluation.blocking) {
          await tx.feedbackSignal.create({
            data: {
              organizationId: input.organizationId,
              runId: agentRun?.id,
              listingId: snapshot.listingDraftId,
              snapshotId: snapshot.id,
              agentType: agentRun?.agentType,
              signalType: 'SANDBOX_BLOCKED',
              source: 'LISTING_SANDBOX',
              externalReference: `${report.id}:blocked`,
              value: this.jsonValue({
                riskLevel: evaluation.riskLevel,
                decision: evaluation.decision,
                overallScore: evaluation.overallScore,
                dimensions: evaluation.dimensions,
                blockingHitCodes: evaluation.hits
                  .filter((hit) => hit.blocking)
                  .map((hit) => hit.code),
              }),
            },
          });
        }
        return {
          created: true,
          report: {
            ...report,
            ruleHits: evaluation.hits.map((hit) => ({
              ruleCode: hit.code,
              category: hit.category,
              severity: hit.severity,
              blocking: hit.blocking,
              message: hit.message,
              evidence: hit.evidence,
            })),
          },
        };
      },
    );

    if (outcome.created) {
      await this.audit.appendStrict({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'listing-sandbox.evaluated',
        resourceType: 'ListingPublishSnapshot',
        resourceId: input.snapshotId,
        after: {
          reportId: outcome.report.id,
          snapshotHash: outcome.report.snapshotHash,
          policyVersion: outcome.report.policyVersion,
          status: outcome.report.status,
          riskLevel: outcome.report.riskLevel,
          blocking: outcome.report.blocking,
          summary: outcome.report.summary,
          hitCodes: outcome.report.ruleHits.map(
            (hit: { ruleCode: string }) => hit.ruleCode,
          ),
        },
      });
    }
    return outcome.report;
  }

  async getReport(organizationId: string, reportId: string) {
    const report = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingSandboxReport.findFirst({
        where: { id: reportId, organizationId },
        include: {
          ruleHits: { orderBy: { createdAt: 'asc' } },
          publishSnapshot: {
            select: {
              id: true,
              productLaunchId: true,
              listingDraftId: true,
              snapshotHash: true,
              status: true,
            },
          },
        },
      }),
    );
    if (!report)
      throw new NotFoundException('Listing sandbox report not found');
    return report;
  }

  async findForSnapshot(organizationId: string, snapshotId: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingSandboxReport.findFirst({
        where: { organizationId, publishSnapshotId: snapshotId },
        include: { ruleHits: { orderBy: { createdAt: 'asc' } } },
      }),
    );
  }

  async assertPublishable(input: {
    organizationId: string;
    snapshotId: string;
    actorRole: string;
  }) {
    const report = await this.findForSnapshot(
      input.organizationId,
      input.snapshotId,
    );
    if (!report) {
      throw new BadRequestException({
        code: 'LISTING_SANDBOX_REQUIRED',
        message: 'Listing sandbox evaluation is required before publishing.',
      });
    }
    if (report.status === 'BLOCKED' || report.blocking) {
      throw new BadRequestException({
        code: 'LISTING_SANDBOX_BLOCKED',
        message: 'Listing sandbox blocked this publish snapshot.',
        reportId: report.id,
        riskLevel: report.riskLevel,
        hits: report.ruleHits.map((hit) => ({
          code: hit.ruleCode,
          message: hit.message,
          severity: hit.severity,
        })),
      });
    }
    if (
      report.status === 'REVIEW_REQUIRED' &&
      !['OWNER', 'ADMIN'].includes(input.actorRole)
    ) {
      throw new ForbiddenException(
        'A reviewer is required for this medium-risk listing',
      );
    }
    return report;
  }

  async override(input: {
    organizationId: string;
    reportId: string;
    actorId: string;
    actorRole: string;
    reason: string;
  }) {
    if (!['OWNER', 'ADMIN'].includes(input.actorRole)) {
      throw new ForbiddenException(
        'Only a tenant administrator can override a blocked listing',
      );
    }
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException(
        'Override reason must contain at least 10 characters',
      );
    }
    const overriddenAt = new Date();
    const result = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const report = await tx.listingSandboxReport.findFirst({
          where: { id: input.reportId, organizationId: input.organizationId },
          include: { ruleHits: { orderBy: { createdAt: 'asc' } } },
        });
        if (!report) {
          throw new NotFoundException('Listing sandbox report not found');
        }
        if (report.status === 'OVERRIDDEN') return report;
        if (report.status !== 'BLOCKED') {
          throw new BadRequestException(
            'Only a blocked sandbox report can be overridden',
          );
        }
        const summary = this.record(report.summary);
        const hardBlockCodes = Array.isArray(summary.hardBlockCodes)
          ? summary.hardBlockCodes.filter(
              (code): code is string => typeof code === 'string',
            )
          : report.ruleHits
              .filter((hit) => hit.blocking)
              .map((hit) => hit.ruleCode);
        if (hardBlockCodes.length > 0) {
          throw new BadRequestException({
            code: 'LISTING_SANDBOX_HARD_BLOCK_IMMUTABLE',
            message:
              'Hard publication blocks cannot be overridden. Correct the evidence and create a new immutable snapshot.',
            hardBlockCodes,
          });
        }
        const updated = await tx.listingSandboxReport.update({
          where: { id: report.id },
          data: {
            status: 'OVERRIDDEN',
            blocking: false,
            overriddenBy: input.actorId,
            overrideReason: reason,
            overriddenAt,
          },
        });
        await tx.listingPublishSnapshot.update({
          where: { id: report.publishSnapshotId },
          data: { status: 'APPROVED' },
        });
        return { ...updated, ruleHits: report.ruleHits };
      },
    );

    await this.audit.appendStrict({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'listing-sandbox.overridden',
      resourceType: 'ListingSandboxReport',
      resourceId: input.reportId,
      before: { status: 'BLOCKED', blocking: true },
      after: {
        status: 'OVERRIDDEN',
        blocking: false,
        actorRole: input.actorRole,
        reason,
        snapshotHash: result.snapshotHash,
      },
    });
    return result;
  }

  private ruleHitData(
    organizationId: string,
    reportId: string,
    hit: ListingSandboxRuleHit,
  ): Prisma.PolicyRuleHitCreateManyInput {
    return {
      organizationId,
      sandboxReportId: reportId,
      ruleCode: hit.code,
      category: hit.category,
      severity: hit.severity,
      blocking: hit.blocking,
      message: hit.message,
      evidence: hit.evidence as Prisma.InputJsonObject,
    };
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertSnapshotIntegrity(value: unknown, expectedHash: string) {
    const actual = createHash('sha256')
      .update(this.stableJson(value))
      .digest('hex');
    if (actual !== expectedHash) {
      throw new BadRequestException({
        code: 'PUBLISH_SNAPSHOT_HASH_MISMATCH',
        message: 'Immutable publish snapshot hash verification failed.',
      });
    }
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
