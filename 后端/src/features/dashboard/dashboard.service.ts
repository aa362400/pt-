import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import type { DashboardParamsDto } from './dashboard.dto.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getCounts(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const orgFilter = { organizationId: orgId };
    const wsFilter = workspaceId ? { workspaceId } : {};

    const productWhere = workspaceId
      ? { workspaceId }
      : { workspace: { organizationId: orgId } };
    const notArchived = { status: { not: 'ARCHIVED' as const } };

    const [
      productCount,
      listingCount,
      agentRunCount,
      activeTaskCount,
      notificationCount,
      alertCount,
    ] = await Promise.all([
      this.prisma.product.count({ where: { ...productWhere, ...notArchived } }),
      this.prisma.listingDraft.count({ where: wsFilter }),
      this.prisma.agentRun.count({
        where: { ...orgFilter, ...wsFilter },
      }),
      this.prisma.teamTask.count({
        where: {
          ...orgFilter,
          ...wsFilter,
          status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] },
        },
      }),
      this.prisma.notification.count({
        where: { ...orgFilter, userId: user.sub, readAt: null },
      }),
      this.prisma.alert.count({
        where: { ...orgFilter, ...wsFilter, status: 'OPEN' },
      }),
    ]);

    return {
      products: productCount,
      listings: listingCount,
      agentRuns: agentRunCount,
      activeTasks: activeTaskCount,
      unreadNotifications: notificationCount,
      openAlerts: alertCount,
    };
  }

  async getRecentActivity(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const wsFilter = workspaceId ? { workspaceId } : {};

    const [recentAgentRuns, recentNotifications, recentAuditLogs] =
      await Promise.all([
        this.prisma.agentRun.findMany({
          where: { organizationId: orgId, ...wsFilter },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            agentType: true,
            status: true,
            createdAt: true,
          },
        }),
        this.prisma.notification.findMany({
          where: { organizationId: orgId, userId: user.sub },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            title: true,
            readAt: true,
            createdAt: true,
          },
        }),
        this.prisma.auditLog.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            action: true,
            resourceType: true,
            resourceId: true,
            createdAt: true,
          },
        }),
      ]);

    return {
      recentAgentRuns,
      recentNotifications,
      recentAuditLogs,
    };
  }

  async getTrendSummaries(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const wsFilter = workspaceId ? { workspaceId } : {};

    const [recentTrends, topKeywords] = await Promise.all([
      this.prisma.trendInsight.findMany({
        where: { organizationId: orgId, ...wsFilter },
        orderBy: { observedAt: 'desc' },
        take: 10,
      }),
      this.prisma.trendInsight.groupBy({
        by: ['keyword'],
        where: { organizationId: orgId, ...wsFilter },
        _max: { score: true },
        _count: true,
        orderBy: { _max: { score: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      recentTrends,
      topKeywords: topKeywords.map((k) => ({
        keyword: k.keyword,
        maxScore: k._max.score,
        occurrences: k._count,
      })),
    };
  }
}
