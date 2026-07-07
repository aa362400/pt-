import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';

export interface AuditEntry {
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

/**
 * Writes immutable audit trail records. Failures are logged but never
 * propagated — auditing must not break the business operation itself.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          before: (entry.before ?? undefined) as Prisma.InputJsonValue,
          after: (entry.after ?? undefined) as Prisma.InputJsonValue,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log (${entry.action} ${entry.resourceType}/${entry.resourceId})`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
