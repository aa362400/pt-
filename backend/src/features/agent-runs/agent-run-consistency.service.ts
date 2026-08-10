import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AgentLifecycleStatus } from './agent-state-machine.js';

const REQUIRED_RATIO = 0.999;

@Injectable()
export class AgentRunConsistencyService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    @InjectQueue('agent-runs') private readonly queue: Queue,
  ) {}

  async inspect(user: JwtPayload, limit = 1_000) {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    const organizationId = user.orgId;
    const runs = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findMany({
        where: { organizationId },
        select: {
          id: true,
          status: true,
          lifecycleStatus: true,
          attempt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 5_000),
      }),
    );

    const mismatches = runs
      .map((run) => ({
        ...run,
        expectedLegacyStatus: this.expectedLegacyStatus(
          run.lifecycleStatus as AgentLifecycleStatus,
        ),
      }))
      .filter((run) => run.status !== run.expectedLegacyStatus);
    const matching = runs.length - mismatches.length;
    const stateRatio = runs.length === 0 ? 1 : matching / runs.length;

    const queueCandidates = runs
      .filter((run) =>
        ['ENQUEUING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(run.status),
      )
      .slice(0, 100);
    const queueEvidence = await Promise.all(
      queueCandidates.map(async (run) => {
        const jobId = `agent-run__${run.id}__attempt__${run.attempt}`;
        const job = await this.queue.getJob(jobId);
        return {
          runId: run.id,
          attempt: run.attempt,
          jobId,
          queueState: job ? await job.getState() : 'not_found',
        };
      }),
    );

    return {
      checkedAt: new Date().toISOString(),
      requiredRatio: REQUIRED_RATIO,
      state: {
        sampleSize: runs.length,
        matching,
        mismatchCount: mismatches.length,
        ratio: stateRatio,
        passed: stateRatio >= REQUIRED_RATIO,
        mismatches: mismatches.slice(0, 50),
      },
      queue: {
        sampleSize: queueEvidence.length,
        found: queueEvidence.filter((item) => item.queueState !== 'not_found')
          .length,
        evidence: queueEvidence,
      },
    };
  }

  private expectedLegacyStatus(status: AgentLifecycleStatus) {
    switch (status) {
      case AgentLifecycleStatus.CREATED:
        return 'PENDING';
      case AgentLifecycleStatus.RETRY_SCHEDULED:
        return 'RETRYING';
      case AgentLifecycleStatus.COMPLETED:
        return 'COMPLETED';
      case AgentLifecycleStatus.FAILED:
        return 'FAILED';
      case AgentLifecycleStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return 'RUNNING';
    }
  }
}
