import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { EventBusService } from '../../shared/events/event-bus.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import {
  CreateAlertDto,
  ListAlertsQueryDto,
  ListMetricsQueryDto,
  UpdateAlertStatusDto,
  UpsertMetricDto,
} from './store-monitoring.dto.js';

@Injectable()
export class StoreMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  private normalizeDate(iso: string): Date {
    const d = new Date(iso);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async upsertMetric(user: JwtPayload, dto: UpsertMetricDto) {
    const orgId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    const date = this.normalizeDate(dto.date);

    const data = {
      healthScore: dto.healthScore,
      orders: dto.orders ?? 0,
      revenue: dto.revenue ?? 0,
      conversionRate: dto.conversionRate,
      acos: dto.acos,
    };
    return this.prisma.storeMetricSnapshot.upsert({
      where: { workspaceId_date: { workspaceId: dto.workspaceId, date } },
      update: data,
      create: { workspaceId: dto.workspaceId, date, ...data },
    });
  }

  async listMetrics(user: JwtPayload, query: ListMetricsQueryDto) {
    const orgId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, orgId, query.workspaceId);

    return this.prisma.storeMetricSnapshot.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: this.normalizeDate(query.from) } : {}),
                ...(query.to ? { lte: this.normalizeDate(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
      take: 366,
    });
  }

  async createAlert(user: JwtPayload, dto: CreateAlertDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    const alert = await this.tenantDatabase.run(orgId, (tx) =>
      tx.alert.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          type: dto.type,
          severity: dto.severity ?? 'WARNING',
          title: dto.title,
          description: dto.description,
          source: 'manual',
        },
      }),
    );

    // Emit platform event based on alert type
    const eventTypeMap: Record<string, string> = {
      INVENTORY: 'alert.inventory_low',
      REVIEW_ALERT: 'alert.bad_review',
      PRICE_CHANGE: 'alert.price_change',
    };
    const eventType = eventTypeMap[dto.type];
    if (eventType) {
      await this.eventBus.emit({
        type: eventType,
        orgId,
        resourceType: 'Alert',
        resourceId: alert.id,
        data: {
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
        },
        timestamp: new Date().toISOString(),
      });
    }
    return alert;
  }

  async listAlerts(user: JwtPayload, query: ListAlertsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AlertWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
    };
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.alert.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.alert.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  async updateAlertStatus(
    user: JwtPayload,
    id: string,
    dto: UpdateAlertStatusDto,
  ) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const alert = await tx.alert.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!alert) {
        throw new NotFoundException('Alert not found');
      }
      return tx.alert.update({
        where: { id: alert.id },
        data: {
          status: dto.status,
          resolvedAt:
            dto.status === 'RESOLVED' || dto.status === 'DISMISSED'
              ? new Date()
              : null,
        },
      });
    });
  }
}
