import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { EventBusService } from '../../shared/events/event-bus.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  CreateProductDto,
  ListProductsQueryDto,
  RequestOzonProductChangeDto,
  UpdateProductDto,
} from './products.dto.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventBus: EventBusService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly actionProposals: ActionProposalsService,
  ) {}

  async create(user: JwtPayload, dto: CreateProductDto) {
    const orgId = requireOrg(user);
    const product = await this.tenantDatabase.run(orgId, async (tx) => {
      const workspace = await tx.workspace.findFirst({
        where: { id: dto.workspaceId, organizationId: orgId },
        select: { id: true },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      return tx.product.create({
        data: {
          workspaceId: dto.workspaceId,
          title: dto.title,
          sku: dto.sku,
          asinOrExternalId: dto.asinOrExternalId,
          images: dto.images ?? [],
          cost: dto.cost ?? 0,
          price: dto.price ?? 0,
          currency: dto.currency ?? 'USD',
          status: dto.status ?? 'DRAFT',
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.create',
      resourceType: 'Product',
      resourceId: product.id,
      after: { title: product.title, workspaceId: product.workspaceId },
    });
    await this.eventBus.emit({
      type: 'product.created',
      orgId,
      actorId: user.sub,
      resourceType: 'Product',
      resourceId: product.id,
      data: { title: product.title, workspaceId: product.workspaceId },
      timestamp: new Date().toISOString(),
    });
    return product;
  }

  async findAll(user: JwtPayload, query: ListProductsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProductWhereInput = {
      workspace: { organizationId: orgId },
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              {
                asinOrExternalId: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.product.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const product = await this.tenantDatabase.run(orgId, (tx) =>
      tx.product.findFirst({
        where: { id, workspace: { organizationId: orgId } },
      }),
    );
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateProductDto) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    const before = {
      title: existing.title,
      status: existing.status,
      price: existing.price,
    };
    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.product.update({
        where: { id: existing.id },
        data: {
          title: dto.title,
          sku: dto.sku,
          asinOrExternalId: dto.asinOrExternalId,
          images: dto.images,
          cost: dto.cost,
          price: dto.price,
          currency: dto.currency,
          status: dto.status,
          metadata:
            dto.metadata !== undefined
              ? (dto.metadata as Prisma.InputJsonValue)
              : undefined,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.update',
      resourceType: 'Product',
      resourceId: existing.id,
      before,
      after: {
        title: updated.title,
        status: updated.status,
        price: updated.price,
      },
    });
    await this.eventBus.emit({
      type: 'product.updated',
      orgId,
      actorId: user.sub,
      resourceType: 'Product',
      resourceId: existing.id,
      data: {
        title: updated.title,
        workspaceId: updated.workspaceId,
        status: updated.status,
        price: updated.price,
        externalStoreMutation: 'not_executed',
      },
      timestamp: new Date().toISOString(),
    });
    return updated;
  }

  async requestOzonChange(
    user: JwtPayload,
    id: string,
    dto: RequestOzonProductChangeDto,
  ) {
    const orgId = requireOrg(user);
    const product = await this.findOwned(orgId, id);
    const metadata = this.asRecord(product.metadata);
    if (metadata.source !== 'ozon') {
      throw new BadRequestException(
        'Only Ozon-synced products can request Ozon write approval',
      );
    }

    const externalId =
      this.asOptionalString(metadata.offerId) ??
      this.asOptionalString(metadata.productId) ??
      product.asinOrExternalId ??
      product.sku;
    if (!externalId) {
      throw new BadRequestException(
        'Ozon product external id is missing; cannot request write approval',
      );
    }

    const requestedValue =
      dto.action === 'ozon.price.update' ? dto.price : dto.stock;
    if (requestedValue === undefined) {
      throw new BadRequestException(
        dto.action === 'ozon.price.update'
          ? 'price is required for Ozon price approval'
          : 'stock is required for Ozon stock approval',
      );
    }
    const warehouseId = this.asNumber(
      dto.warehouseId ?? metadata.warehouseId ?? metadata.warehouse_id,
    );
    if (
      dto.action === 'ozon.stock.update' &&
      (!warehouseId || !Number.isInteger(warehouseId) || warehouseId <= 0)
    ) {
      throw new BadRequestException(
        'warehouseId is required for Ozon stock approval',
      );
    }

    const label =
      dto.action === 'ozon.price.update' ? 'Ozon text' : 'Ozon textwrite';
    const { notification } = await this.actionProposals.create({
      organizationId: orgId,
      requestedBy: user.sub,
      approverId: user.sub,
      source: 'product_management_change_order',
      action: {
        label: 'Execute',
        name: dto.action,
        params: {
          productId: product.id,
          workspaceId: product.workspaceId,
          title: product.title,
          externalId,
          offerId: metadata.offerId,
          ozonProductId: metadata.productId,
          ...(dto.action === 'ozon.price.update'
            ? { price: dto.price, currency: product.currency }
            : { stock: dto.stock, warehouseId }),
          reason: dto.reason ?? null,
        },
      },
      type: 'APPROVAL_REQUIRED',
      title: `english_textproductenglish_text：${label}`,
      body:
        `product“${product.title}”text${label}。english_textwrite，textnotificationenglish_text“text”text“english_text”。` +
        'english_textnonetextwrite Ozon realstore。',
      context: {
        kind: 'high_risk_action_review',
        source: 'product_management_change_order',
        riskLevel: 'high',
        requiresConfirmation: true,
        workspaceId: product.workspaceId,
        productId: product.id,
        productTitle: product.title,
        provider: 'OZON',
        externalStoreMutation: 'blocked_until_human_confirmation',
        changeOrder: {
          status: 'pending_approval',
          requestedAt: new Date().toISOString(),
          requestedBy: user.sub,
          reason: dto.reason ?? null,
          current: {
            price: this.asNumber(product.price),
            currency: product.currency,
            stock: this.asNumber(metadata.stock),
            warehouseId:
              this.asNumber(metadata.warehouseId ?? metadata.warehouse_id) ??
              null,
          },
          requested: {
            ...(dto.action === 'ozon.price.update'
              ? { price: dto.price, currency: product.currency }
              : { stock: dto.stock, warehouseId }),
          },
        },
        action: {
          label: 'text',
          action: dto.action,
          params: {
            productId: product.id,
            workspaceId: product.workspaceId,
            title: product.title,
            externalId,
            offerId: metadata.offerId,
            ozonProductId: metadata.productId,
            ...(dto.action === 'ozon.price.update'
              ? { price: dto.price, currency: product.currency }
              : { stock: dto.stock, warehouseId }),
            reason: dto.reason ?? null,
          },
        },
        execution: {
          status: 'pending_confirmation',
          externalStoreMutation: 'blocked_until_human_confirmation',
        },
        guardrails: [
          'textnoneenglish_text Ozon realstoreproduct',
          'notificationenglish_textrealtextwriteenglish_text',
          'english_textwriteenglish_textsuccess',
        ],
      },
    });

    const updatedMetadata = {
      ...metadata,
      pendingExternalSync: true,
      externalStoreMutation: 'pending_human_confirmation',
      latestChangeOrder: {
        notificationId: notification.id,
        action: dto.action,
        status: 'pending_approval',
        requestedAt: new Date().toISOString(),
        requestedValue,
      },
    };
    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.product.update({
        where: { id: product.id },
        data: { metadata: updatedMetadata },
      }),
    );

    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.ozon-change.request',
      resourceType: 'Product',
      resourceId: product.id,
      before: {
        price: product.price,
        metadata,
      },
      after: {
        notificationId: notification.id,
        action: dto.action,
        requestedValue,
      },
    });
    await this.eventBus.emit({
      type: 'product.ozon-change.requested',
      orgId,
      actorId: user.sub,
      resourceType: 'Product',
      resourceId: product.id,
      data: {
        title: product.title,
        workspaceId: product.workspaceId,
        action: dto.action,
        notificationId: notification.id,
        externalStoreMutation: 'pending_human_confirmation',
      },
      timestamp: new Date().toISOString(),
    });
    return {
      product: updated,
      notification,
      changeOrder: {
        status: 'pending_approval',
        action: dto.action,
        requestedValue,
        externalExecution: 'blocked_until_human_confirmation',
      },
    };
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.product.delete({ where: { id: existing.id } }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.delete',
      resourceType: 'Product',
      resourceId: existing.id,
      before: { title: existing.title },
    });
    return { id: existing.id };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
