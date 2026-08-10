import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';

export interface HousekeepingReport {
  expiredTokensRemoved: number;
  oldSessionsArchived: number;
  oldAgentRunsCleaned: number;
  oldNotificationsCleaned: number;
  expiredImageProjectsCleaned: number;
}

@Injectable()
export class HousekeepingService {
  private readonly logger = new Logger(HousekeepingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  /**
   * Run all data retention cleanup tasks.
   * Intended to be called by a cron job (e.g., daily at 3 AM).
   * Idempotent — safe to run repeatedly.
   */
  async runCleanup(orgId?: string): Promise<HousekeepingReport> {
    const report: HousekeepingReport = {
      expiredTokensRemoved: 0,
      oldSessionsArchived: 0,
      oldAgentRunsCleaned: 0,
      oldNotificationsCleaned: 0,
      expiredImageProjectsCleaned: 0,
    };

    const now = new Date();

    // 1. Remove expired password reset tokens (> 24h old)
    const passwordResetThreshold = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    );
    // Tokens are user-scoped (no orgId), so this is a global sweep.
    const { count: removedPasswordReset } =
      await this.prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: passwordResetThreshold },
          usedAt: null,
        },
      });
    report.expiredTokensRemoved += removedPasswordReset;

    // 2. Remove expired email verification tokens (> 48h old)
    const emailVerifyThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const { count: removedEmailVerify } =
      await this.prisma.emailVerificationToken.deleteMany({
        where: {
          expiresAt: { lt: emailVerifyThreshold },
          usedAt: null,
        },
      });
    report.expiredTokensRemoved += removedEmailVerify;

    // 3. Archive sessions inactive > 90 days (no recent messages)
    const sessionThreshold90 = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    );
    const sessionOrganizations = orgId
      ? [{ id: orgId }]
      : await this.prisma.organization.findMany({ select: { id: true } });
    let oldSessionsArchived = 0;
    for (const organization of sessionOrganizations) {
      oldSessionsArchived += await this.tenantDatabase.run(
        organization.id,
        async (tx) => {
          const oldSessions = await tx.assistantSession.findMany({
            where: {
              organizationId: organization.id,
              status: 'ACTIVE',
              createdAt: { lt: sessionThreshold90 },
              messages: {
                none: {
                  createdAt: { gte: sessionThreshold90 },
                },
              },
            },
            select: { id: true },
          });
          if (oldSessions.length > 0) {
            await tx.assistantSession.updateMany({
              where: {
                organizationId: organization.id,
                id: { in: oldSessions.map((session) => session.id) },
              },
              data: { status: 'ARCHIVED' },
            });
          }
          return oldSessions.length;
        },
      );
    }
    report.oldSessionsArchived = oldSessionsArchived;

    // 4. Soft-delete agent runs older than 180 days (completed/failed only)
    const agentRunThreshold = new Date(
      now.getTime() - 180 * 24 * 60 * 60 * 1000,
    );
    // AgentRun doesn't have a soft-delete flag, so we delete completed/failed runs past threshold
    const agentRunOrganizations = orgId
      ? [{ id: orgId }]
      : await this.prisma.organization.findMany({ select: { id: true } });
    let cleanedAgentRuns = 0;
    for (const organization of agentRunOrganizations) {
      const result = await this.tenantDatabase.run(organization.id, (tx) =>
        tx.agentRun.deleteMany({
          where: {
            organizationId: organization.id,
            createdAt: { lt: agentRunThreshold },
            status: { in: ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'] },
          },
        }),
      );
      cleanedAgentRuns += result.count;
    }
    report.oldAgentRunsCleaned = cleanedAgentRuns;

    // 5. Clean up notifications older than 90 days
    const notificationThreshold = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    );
    let cleanedNotifications = 0;
    for (const organization of agentRunOrganizations) {
      const result = await this.tenantDatabase.run(organization.id, (tx) =>
        tx.notification.deleteMany({
          where: {
            organizationId: organization.id,
            createdAt: { lt: notificationThreshold },
          },
        }),
      );
      cleanedNotifications += result.count;
    }
    report.oldNotificationsCleaned = cleanedNotifications;

    // 6. Archive image prompt projects > 30 days in DRAFT status
    const imageProjectThreshold = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    // Set DRAFT projects older than 30 days to FAILED status (archival signal)
    // since there's no ARCHIVED status in ImageProjectStatus enum
    let expiredImageProjects = 0;
    for (const organization of agentRunOrganizations) {
      const result = await this.tenantDatabase.run(organization.id, (tx) =>
        tx.imagePromptProject.updateMany({
          where: {
            organizationId: organization.id,
            status: 'DRAFT',
            createdAt: { lt: imageProjectThreshold },
          },
          data: { status: 'FAILED' },
        }),
      );
      expiredImageProjects += result.count;
    }
    report.expiredImageProjectsCleaned = expiredImageProjects;

    this.logger.log(`Housekeeping run complete: ${JSON.stringify(report)}`);

    return report;
  }

  /**
   * Permanently delete all data for a specific user (GDPR deletion).
   * Anonymizes the user record rather than hard-deleting it to preserve
   * referential integrity (audit logs, knowledge docs, etc.).
   */
  async deleteUserData(userId: string, orgId: string): Promise<void> {
    // Guard: the target user must be a member of the caller's organization.
    // Without this check an admin could wipe tokens/sessions of any user
    // in the system by guessing their ID.
    const membership = await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.findFirst({
        where: { userId, organizationId: orgId },
        select: { id: true },
      }),
    );
    if (!membership) {
      throw new NotFoundException('User is not a member of your organization');
    }

    this.logger.log(`Starting GDPR data deletion for user ${userId}`);

    // 1. Delete authentication tokens
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.prisma.passwordResetToken.deleteMany({ where: { userId } });
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });

    // 2. Delete assistant sessions and their messages (cascade)
    await this.tenantDatabase.run(orgId, async (tx) => {
      const sessions = await tx.assistantSession.findMany({
        where: { userId, organizationId: orgId },
        select: { id: true },
      });
      if (sessions.length === 0) return;
      const sessionIds = sessions.map((session) => session.id);
      await tx.assistantMessage.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.assistantSession.deleteMany({
        where: { organizationId: orgId, id: { in: sessionIds } },
      });
    });

    // 3. Delete agent runs
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentRun.deleteMany({ where: { userId, organizationId: orgId } }),
    );

    // 4. Delete notifications
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.deleteMany({
        where: { userId, organizationId: orgId },
      }),
    );

    // 5. Delete user-created content: listing drafts, keyword reports, research reports
    // ListingDraft has workspaceId as required, so we scope by org + creator
    const userListings = await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.findMany({
        where: { createdBy: userId, organizationId: orgId },
        select: { id: true },
      }),
    );
    if (userListings.length > 0) {
      await this.tenantDatabase.run(orgId, (tx) =>
        tx.listingDraft.deleteMany({
          where: {
            organizationId: orgId,
            id: { in: userListings.map((listing) => listing.id) },
          },
        }),
      );
    }

    await this.tenantDatabase.run(orgId, (tx) =>
      tx.keywordReport.deleteMany({
        where: { createdBy: userId, organizationId: orgId },
      }),
    );

    await this.tenantDatabase.run(orgId, (tx) =>
      tx.productResearchReport.deleteMany({
        where: { createdBy: userId, organizationId: orgId },
      }),
    );

    // 6. Delete image projects and profit calculations
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.imagePromptProject.deleteMany({
        where: { createdBy: userId, organizationId: orgId },
      }),
    );

    await this.tenantDatabase.run(orgId, (tx) =>
      tx.profitCalculation.deleteMany({
        where: { createdBy: userId, organizationId: orgId },
      }),
    );

    // 7. Unassign team tasks where user is assignee
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.teamTask.updateMany({
        where: { assigneeId: userId, organizationId: orgId },
        data: { assigneeId: null },
      }),
    );

    // 8. Remove user's membership(s) from the organization
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.deleteMany({ where: { userId, organizationId: orgId } }),
    );

    // 9. Anonymize user
    await this.anonymizeUser(userId);

    this.logger.log(
      `GDPR data deletion complete for user ${userId} in org ${orgId}`,
    );
  }

  /**
   * Anonymize user data per GDPR right to erasure.
   * The user record remains to preserve referential integrity
   * (audit logs, knowledge docs, tasks they created, etc.).
   */
  private async anonymizeUser(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted User',
        email: `deleted-${userId.replace(/[^a-zA-Z0-9]/g, '')}@anonymous`,
        avatarUrl: null,
        passwordHash: '',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        status: 'DELETED',
        emailVerifiedAt: null,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      },
    });
  }
}
