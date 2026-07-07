import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { $Enums, type NotificationType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import type {
  CreateNotificationDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  UpdateNotificationDto,
} from './notifications.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtPayload, dto: CreateNotificationDto) {
    const orgId = requireOrg(user);
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: user.sub,
        type: dto.type as NotificationType,
        title: dto.title,
        body: dto.body ?? null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.create',
      resourceType: 'Notification',
      resourceId: notification.id,
      after: { title: notification.title, type: notification.type },
    });
    return notification;
  }

  async findAll(user: JwtPayload, query: ListNotificationsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.NotificationWhereInput = {
      organizationId: orgId,
      ...(query.userId ? { userId: query.userId } : { userId: user.sub }),
      ...(query.type ? { type: query.type as NotificationType } : {}),
      ...(query.read === 'true'
        ? { readAt: { not: null } }
        : query.read === 'false'
          ? { readAt: null }
          : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateNotificationDto) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    const before = { title: existing.title, type: existing.type };
    const updated = await this.prisma.notification.update({
      where: { id: existing.id },
      data: {
        type: dto.type as NotificationType | undefined,
        title: dto.title,
        body: dto.body,
        metadata:
          dto.metadata !== undefined
            ? (dto.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.update',
      resourceType: 'Notification',
      resourceId: existing.id,
      before,
      after: { title: updated.title, type: updated.type },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    await this.prisma.notification.delete({ where: { id: existing.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.delete',
      resourceType: 'Notification',
      resourceId: existing.id,
      before: { title: existing.title },
    });
    return { id: existing.id };
  }

  async markAsRead(user: JwtPayload, dto: MarkReadDto) {
    const orgId = requireOrg(user);
    const where: Prisma.NotificationWhereInput = {
      organizationId: orgId,
      userId: user.sub,
      readAt: null,
    };
    if (dto.ids && dto.ids.length > 0) {
      where.id = { in: dto.ids };
    }
    const result = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.mark-read',
      resourceType: 'Notification',
      resourceId: `batch-${dto.ids?.length ?? 'all'}`,
      before: { count: result.count },
      after: { readAt: new Date().toISOString() },
    });
    return { count: result.count };
  }

  async unreadCount(user: JwtPayload) {
    const orgId = requireOrg(user);
    const count = await this.prisma.notification.count({
      where: {
        organizationId: orgId,
        userId: user.sub,
        readAt: null,
      },
    });
    return { count };
  }
}
