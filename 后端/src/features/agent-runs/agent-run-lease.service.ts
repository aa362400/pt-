import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

export interface AgentRunLeaseInput {
  organizationId: string;
  runId: string;
  ownerId: string;
  ttlMs: number;
  now?: Date;
}

@Injectable()
export class AgentRunLeaseService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async acquire(input: AgentRunLeaseInput): Promise<boolean> {
    const now = input.now ?? new Date();
    const leaseUntil = new Date(now.getTime() + input.ttlMs);
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const updated = await tx.agentRunLease.updateMany({
        where: {
          runId: input.runId,
          organizationId: input.organizationId,
          OR: [{ ownerId: input.ownerId }, { leaseUntil: { lte: now } }],
        },
        data: {
          ownerId: input.ownerId,
          heartbeatAt: now,
          leaseUntil,
          version: { increment: 1 },
        },
      });
      if (updated.count === 1) return true;

      try {
        await tx.agentRunLease.create({
          data: {
            runId: input.runId,
            organizationId: input.organizationId,
            ownerId: input.ownerId,
            heartbeatAt: now,
            leaseUntil,
          },
        });
        return true;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return false;
        }
        throw error;
      }
    });
  }

  async heartbeat(input: AgentRunLeaseInput): Promise<boolean> {
    const now = input.now ?? new Date();
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentRunLease.updateMany({
        where: {
          runId: input.runId,
          organizationId: input.organizationId,
          ownerId: input.ownerId,
          leaseUntil: { gt: now },
        },
        data: {
          heartbeatAt: now,
          leaseUntil: new Date(now.getTime() + input.ttlMs),
          version: { increment: 1 },
        },
      }),
    );
    return result.count === 1;
  }

  async release(input: Omit<AgentRunLeaseInput, 'ttlMs' | 'now'>) {
    return this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentRunLease.deleteMany({
        where: {
          runId: input.runId,
          organizationId: input.organizationId,
          ownerId: input.ownerId,
        },
      }),
    );
  }
}
