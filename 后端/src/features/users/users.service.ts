import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { HousekeepingService } from '../../shared/housekeeping/housekeeping.service.js';
import {
  ListMembersQueryDto,
  UpdateProfileDto,
  ExportDataDto,
} from './users.dto.js';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  locale: true,
  timezone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly housekeeping: HousekeepingService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async me(user: JwtPayload) {
    const orgId = requireOrg(user);
    const profile = await this.tenantDatabase.run(orgId, (tx) =>
      tx.user.findUnique({
        where: { id: user.sub },
        select: {
          ...PUBLIC_USER_SELECT,
          memberships: {
            where: { status: 'ACTIVE' },
            select: {
              role: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  plan: true,
                },
              },
            },
          },
        },
      }),
    );
    if (!profile) {
      throw new NotFoundException('User not found');
    }
    return profile;
  }

  async updateMe(user: JwtPayload, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: user.sub },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        locale: dto.locale,
        timezone: dto.timezone,
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  /** Lists users of the caller's organization (via active memberships). */
  async listOrgUsers(user: JwtPayload, query: ListMembersQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = {
      organizationId: orgId,
      status: 'ACTIVE' as const,
      ...(query.search
        ? {
            user: {
              OR: [
                {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  email: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.membership.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: PUBLIC_USER_SELECT },
          },
        }),
        tx.membership.count({ where }),
      ]),
    );

    return { items, total, page, limit };
  }

  /**
   * Permanently delete the current user's account and all associated data (GDPR).
   * Optionally supports a 30-day grace period via scheduled deletion in future iterations.
   */
  async deleteMyAccount(userId: string, orgId: string): Promise<void> {
    await this.housekeeping.deleteUserData(userId, orgId);
  }

  /**
   * Export all user data as structured JSON (GDPR right to data portability).
   */
  async exportMyData(
    userId: string,
    orgId: string,
    scope: ExportDataDto['scope'] = 'all',
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    const orgFilter = { createdBy: userId, organizationId: orgId };

    // Basic profile data is always included
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        locale: true,
        timezone: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    data.profile = user;

    if (scope === 'basic') {
      return data;
    }

    // Memberships
    data.memberships = await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.findMany({
        where: { userId, organizationId: orgId },
        select: {
          role: true,
          status: true,
          createdAt: true,
          organization: {
            select: { id: true, name: true, slug: true, plan: true },
          },
        },
      }),
    );

    if (scope === 'all' || scope === 'agent-runs') {
      data.agentRuns = await this.tenantDatabase.run(orgId, (tx) =>
        tx.agentRun.findMany({
          where: { userId, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        }),
      );
    }

    if (scope === 'all' || scope === 'listings') {
      data.listingDrafts = await this.tenantDatabase.run(orgId, (tx) =>
        tx.listingDraft.findMany({
          where: orgFilter,
          orderBy: { createdAt: 'desc' },
          take: 1000,
        }),
      );
    }

    if (scope === 'all') {
      // Assistant sessions
      data.assistantSessions = await this.tenantDatabase.run(orgId, (tx) =>
        tx.assistantSession.findMany({
          where: { userId, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 500,
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 500,
            },
          },
        }),
      );

      // Keyword reports
      data.keywordReports = await this.tenantDatabase.run(orgId, (tx) =>
        tx.keywordReport.findMany({
          where: orgFilter,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Product research reports
      data.productResearchReports = await this.tenantDatabase.run(orgId, (tx) =>
        tx.productResearchReport.findMany({
          where: orgFilter,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Image prompt projects
      data.imagePromptProjects = await this.tenantDatabase.run(orgId, (tx) =>
        tx.imagePromptProject.findMany({
          where: orgFilter,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Profit calculations
      data.profitCalculations = await this.tenantDatabase.run(orgId, (tx) =>
        tx.profitCalculation.findMany({
          where: orgFilter,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Notifications
      data.notifications = await this.tenantDatabase.run(orgId, (tx) =>
        tx.notification.findMany({
          where: { userId, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Team tasks (created)
      data.createdTasks = await this.tenantDatabase.run(orgId, (tx) =>
        tx.teamTask.findMany({
          where: { createdBy: userId, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Team tasks (assigned)
      data.assignedTasks = await this.tenantDatabase.run(orgId, (tx) =>
        tx.teamTask.findMany({
          where: { assigneeId: userId, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );

      // Prompt templates created
      data.promptTemplates = await this.tenantDatabase.run(orgId, (tx) =>
        tx.promptTemplate.findMany({
          where: orgFilter,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );
    }

    return data;
  }
}
