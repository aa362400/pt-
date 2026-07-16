import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { CreateSopDto, ListSopsQueryDto, UpdateSopDto } from './sops.dto.js';

@Injectable()
export class SopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async create(user: JwtPayload, dto: CreateSopDto) {
    const orgId = requireOrg(user);
    const sop = await this.tenantDatabase.run(orgId, (transaction) =>
      transaction.sop.create({
        data: {
          organizationId: orgId,
          title: dto.title,
          description: dto.description,
          steps: (dto.steps ?? []) as Prisma.InputJsonValue,
          createdBy: user.sub,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'sop.create',
      resourceType: 'Sop',
      resourceId: sop.id,
      after: { title: sop.title },
    });
    return sop;
  }

  async findAll(user: JwtPayload, query: ListSopsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.SopWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.tenantDatabase.run(orgId, (transaction) =>
      Promise.all([
        transaction.sop.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { creator: { select: { id: true, name: true } } },
        }),
        transaction.sop.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const sop = await this.tenantDatabase.run(orgId, (transaction) =>
      transaction.sop.findFirst({
        where: { id, organizationId: orgId },
      }),
    );
    if (!sop) {
      throw new NotFoundException('SOP not found');
    }
    return sop;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateSopDto) {
    const orgId = requireOrg(user);
    const sop = await this.findOwned(orgId, id);
    if (sop.status === 'PUBLISHED' && dto.steps) {
      throw new BadRequestException(
        'Published SOPs are immutable; archive it first',
      );
    }
    const before = { title: sop.title, status: sop.status };
    const updated = await this.tenantDatabase.run(orgId, (transaction) =>
      transaction.sop.update({
        where: { id: sop.id },
        data: {
          title: dto.title,
          description: dto.description,
          steps:
            dto.steps !== undefined
              ? (dto.steps as Prisma.InputJsonValue)
              : undefined,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'sop.update',
      resourceType: 'Sop',
      resourceId: sop.id,
      before,
      after: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  async publish(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const sop = await this.findOwned(orgId, id);
    if (sop.status === 'PUBLISHED') {
      throw new BadRequestException('SOP is already published');
    }
    const updated = await this.tenantDatabase.run(orgId, (transaction) =>
      transaction.sop.update({
        where: { id: sop.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'sop.publish',
      resourceType: 'Sop',
      resourceId: sop.id,
      after: { title: updated.title },
    });
    return updated;
  }

  async archive(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const sop = await this.findOwned(orgId, id);
    const updated = await this.tenantDatabase.run(orgId, (transaction) =>
      transaction.sop.update({
        where: { id: sop.id },
        data: { status: 'ARCHIVED' },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'sop.archive',
      resourceType: 'Sop',
      resourceId: sop.id,
      before: { title: sop.title, status: sop.status },
      after: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const sop = await this.findOwned(orgId, id);
    await this.tenantDatabase.run(orgId, (transaction) =>
      transaction.sop.delete({ where: { id: sop.id } }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'sop.delete',
      resourceType: 'Sop',
      resourceId: sop.id,
      before: { title: sop.title },
    });
    return { id: sop.id };
  }
}
