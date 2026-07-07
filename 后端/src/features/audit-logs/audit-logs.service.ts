import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import type {
  CreateAuditLogDto,
  ListAuditLogsQueryDto,
} from './audit-logs.dto.js';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtPayload, dto: CreateAuditLogDto) {
    const orgId = requireOrg(user);
    return this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: user.sub,
        action: dto.action,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        before: dto.before as Prisma.InputJsonValue | undefined,
        after: dto.after as Prisma.InputJsonValue | undefined,
        ip: dto.ip,
        userAgent: dto.userAgent,
      },
    });
  }

  async findAll(user: JwtPayload, query: ListAuditLogsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }
    return log;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }
}
