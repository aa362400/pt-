import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

export interface PlanLimits {
  maxProducts: number;
  maxAgentRuns: number;
  maxMembers: number;
  maxStorageMB: number;
  maxWorkspaces: number;
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

export type ResourceType =
  'products' | 'agentRuns' | 'members' | 'storage' | 'workspaces';

@Injectable()
export class MeteringService {
  private readonly PLAN_LIMITS: Record<string, PlanLimits> = {
    FREE: {
      maxProducts: 10,
      maxAgentRuns: 50,
      maxMembers: 1,
      maxStorageMB: 100,
      maxWorkspaces: 1,
    },
    STARTER: {
      maxProducts: 100,
      maxAgentRuns: 500,
      maxMembers: 5,
      maxStorageMB: 1000,
      maxWorkspaces: 3,
    },
    PROFESSIONAL: {
      maxProducts: 1000,
      maxAgentRuns: 5000,
      maxMembers: 20,
      maxStorageMB: 10000,
      maxWorkspaces: 10,
    },
    ENTERPRISE: {
      maxProducts: -1,
      maxAgentRuns: -1,
      maxMembers: -1,
      maxStorageMB: -1,
      maxWorkspaces: -1,
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  getPlanLimits(plan: string): PlanLimits | null {
    return this.PLAN_LIMITS[plan] ?? null;
  }

  async checkQuota(orgId: string, resource: ResourceType): Promise<QuotaCheck> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    const planName = (org?.plan ?? 'FREE') as string;
    const limits = this.PLAN_LIMITS[planName];
    if (!limits) {
      return { allowed: true, used: 0, limit: -1 };
    }

    const limitKey =
      `max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof PlanLimits;
    const limit = limits[limitKey];
    if (limit === -1) {
      return { allowed: true, used: 0, limit: -1 };
    }

    const used = await this.countUsage(orgId, resource);
    return { allowed: used < limit, used, limit };
  }

  private async countUsage(
    orgId: string,
    resource: ResourceType,
  ): Promise<number> {
    switch (resource) {
      case 'products':
        return this.tenantDatabase.run(orgId, (tx) =>
          tx.product.count({
            where: {
              workspace: { organizationId: orgId },
              status: { not: 'DELETED' },
            },
          }),
        );

      case 'agentRuns': {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return this.tenantDatabase.run(orgId, (tx) =>
          tx.agentRun.count({
            where: {
              organizationId: orgId,
              createdAt: { gte: oneMonthAgo },
            },
          }),
        );
      }

      case 'members':
        return this.tenantDatabase.run(orgId, (tx) =>
          tx.membership.count({
            where: { organizationId: orgId, status: 'ACTIVE' },
          }),
        );

      case 'storage': {
        const result = await this.tenantDatabase.run(orgId, (tx) =>
          tx.fileAsset.aggregate({
            where: { organizationId: orgId },
            _sum: { size: true },
          }),
        );
        const totalBytes = result._sum.size ?? 0;
        // Convert bytes to MB (1 MB = 1024 * 1024 bytes)
        return Math.floor(totalBytes / (1024 * 1024));
      }

      case 'workspaces':
        return this.tenantDatabase.run(orgId, (tx) =>
          tx.workspace.count({
            where: { organizationId: orgId },
          }),
        );

      default:
        return 0;
    }
  }
}
