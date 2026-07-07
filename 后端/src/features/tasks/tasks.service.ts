import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './tasks.dto.js';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertAssigneeInOrg(orgId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId: orgId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException(
        'Assignee is not an active member of this organization',
      );
    }
  }

  async create(user: JwtPayload, dto: CreateTaskDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    if (dto.assigneeId) {
      await this.assertAssigneeInOrg(orgId, dto.assigneeId);
    }
    const task = await this.prisma.teamTask.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        priority: dto.priority ?? 'MEDIUM',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        createdBy: user.sub,
      },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'task.create',
      resourceType: 'Task',
      resourceId: task.id,
      after: { title: task.title, priority: task.priority },
    });
    return task;
  }

  async findAll(user: JwtPayload, query: ListTasksQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TeamTaskWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.teamTask.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.teamTask.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const task = await this.prisma.teamTask.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async findOne(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const task = await this.prisma.teamTask.findFirst({
      where: { id, organizationId: orgId },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(user: JwtPayload, id: string, dto: UpdateTaskDto) {
    const orgId = requireOrg(user);
    const task = await this.findOwned(orgId, id);
    if (dto.assigneeId) {
      await this.assertAssigneeInOrg(orgId, dto.assigneeId);
    }
    const before = {
      title: task.title,
      status: task.status,
      priority: task.priority,
    };
    const updated = await this.prisma.teamTask.update({
      where: { id: task.id },
      data: {
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        priority: dto.priority,
        status: dto.status,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'task.update',
      resourceType: 'Task',
      resourceId: task.id,
      before,
      after: {
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
      },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const task = await this.findOwned(orgId, id);
    await this.prisma.teamTask.delete({ where: { id: task.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'task.delete',
      resourceType: 'Task',
      resourceId: task.id,
      before: { title: task.title },
    });
    return { id: task.id };
  }
}
