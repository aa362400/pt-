import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

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

  constructor(private readonly prisma: PrismaService) {}

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
    const passwordResetThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const passwordResetWhere: Record<string, unknown> = {
      expiresAt: { lt: passwordResetThreshold },
      usedAt: null,
    };
    if (orgId) {
      // password reset tokens don't have orgId directly, skip org filter
    }
    const { count: removedPasswordReset } =
      await this.prisma.passwordResetToken.deleteMany({
        where: passwordResetWhere as any,
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
    const sessionOrgFilter: Record<string, unknown> = orgId
      ? { organizationId: orgId }
      : {};
    const oldSessions = await this.prisma.assistantSession.findMany({
      where: {
        ...sessionOrgFilter,
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
      await this.prisma.assistantSession.updateMany({
        where: { id: { in: oldSessions.map((s) => s.id) } },
        data: { status: 'ARCHIVED' },
      });
    }
    report.oldSessionsArchived = oldSessions.length;

    // 4. Soft-delete agent runs older than 180 days (completed/failed only)
    const agentRunThreshold = new Date(
      now.getTime() - 180 * 24 * 60 * 60 * 1000,
    );
    const agentRunOrgFilter: Record<string, unknown> = orgId
      ? { organizationId: orgId }
      : {};
    // AgentRun doesn't have a soft-delete flag, so we delete completed/failed runs past threshold
    const { count: cleanedAgentRuns } =
      await this.prisma.agentRun.deleteMany({
        where: {
          ...agentRunOrgFilter,
          createdAt: { lt: agentRunThreshold },
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'] },
        },
      });
    report.oldAgentRunsCleaned = cleanedAgentRuns;

    // 5. Clean up notifications older than 90 days
    const notificationThreshold = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    );
    const notificationOrgFilter: Record<string, unknown> = orgId
      ? { organizationId: orgId }
      : {};
    const { count: cleanedNotifications } =
      await this.prisma.notification.deleteMany({
        where: {
          ...notificationOrgFilter,
          createdAt: { lt: notificationThreshold },
        },
      });
    report.oldNotificationsCleaned = cleanedNotifications;

    // 6. Archive image prompt projects > 30 days in DRAFT status
    const imageProjectThreshold = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    const imageProjectOrgFilter: Record<string, unknown> = orgId
      ? { organizationId: orgId }
      : {};
    // Set DRAFT projects older than 30 days to FAILED status (archival signal)
    // since there's no ARCHIVED status in ImageProjectStatus enum
    const { count: expiredImageProjects } =
      await this.prisma.imagePromptProject.updateMany({
        where: {
          ...imageProjectOrgFilter,
          status: 'DRAFT',
          createdAt: { lt: imageProjectThreshold },
        },
        data: { status: 'FAILED' },
      });
    report.expiredImageProjectsCleaned = expiredImageProjects;

    this.logger.log(
      `Housekeeping run complete: ${JSON.stringify(report)}`,
    );

    return report;
  }

  /**
   * Permanently delete all data for a specific user (GDPR deletion).
   * Anonymizes the user record rather than hard-deleting it to preserve
   * referential integrity (audit logs, knowledge docs, etc.).
   */
  async deleteUserData(userId: string, orgId: string): Promise<void> {
    this.logger.log(`Starting GDPR data deletion for user ${userId}`);

    // 1. Delete authentication tokens
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.prisma.passwordResetToken.deleteMany({ where: { userId } });
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });

    // 2. Delete assistant sessions and their messages (cascade)
    const sessions = await this.prisma.assistantSession.findMany({
      where: { userId },
      select: { id: true },
    });
    if (sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);
      await this.prisma.assistantMessage.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await this.prisma.assistantSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }

    // 3. Delete agent runs
    await this.prisma.agentRun.deleteMany({ where: { userId } });

    // 4. Delete notifications
    await this.prisma.notification.deleteMany({ where: { userId } });

    // 5. Delete user-created content: listing drafts, keyword reports, research reports
    const orgFilter = { createdBy: userId, organizationId: orgId };

    // ListingDraft has workspaceId as required, so we scope by org + creator
    const userListings = await this.prisma.listingDraft.findMany({
      where: { createdBy: userId, organizationId: orgId },
      select: { id: true },
    });
    if (userListings.length > 0) {
      await this.prisma.listingDraft.deleteMany({
        where: { id: { in: userListings.map((l) => l.id) } },
      });
    }

    await this.prisma.keywordReport.deleteMany({
      where: { createdBy: userId, organizationId: orgId },
    });

    await this.prisma.productResearchReport.deleteMany({
      where: { createdBy: userId, organizationId: orgId },
    });

    // 6. Delete image projects and profit calculations
    await this.prisma.imagePromptProject.deleteMany({
      where: { createdBy: userId, organizationId: orgId },
    });

    await this.prisma.profitCalculation.deleteMany({
      where: { createdBy: userId, organizationId: orgId },
    });

    // 7. Unassign team tasks where user is assignee
    await this.prisma.teamTask.updateMany({
      where: { assigneeId: userId, organizationId: orgId },
      data: { assigneeId: null },
    });

    // 8. Remove user's membership(s) from the organization
    await this.prisma.membership.deleteMany({
      where: { userId, organizationId: orgId },
    });

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
