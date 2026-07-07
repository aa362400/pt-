import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import {
  CreateFlowDto,
  ListFlowsQueryDto,
  UpdateFlowDto,
} from './automation.dto.js';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('automation-runs') private readonly queue: Queue,
  ) {}

  async create(user: JwtPayload, dto: CreateFlowDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    return this.prisma.automationFlow.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description,
        triggerType: dto.triggerType,
        triggerConfig: (dto.triggerConfig ?? {}) as Prisma.InputJsonValue,
        steps: (dto.steps ?? []) as Prisma.InputJsonValue,
        createdBy: user.sub,
      },
    });
  }

  async findAll(user: JwtPayload, query: ListFlowsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AutomationFlowWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationFlow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { runs: true } } },
      }),
      this.prisma.automationFlow.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const flow = await this.prisma.automationFlow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!flow) {
      throw new NotFoundException('Automation flow not found');
    }
    return flow;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateFlowDto) {
    const flow = await this.findOwned(requireOrg(user), id);
    return this.prisma.automationFlow.update({
      where: { id: flow.id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        triggerConfig:
          dto.triggerConfig !== undefined
            ? (dto.triggerConfig as Prisma.InputJsonValue)
            : undefined,
        steps:
          dto.steps !== undefined
            ? (dto.steps as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }

  /** Manually triggers a flow: creates an AutomationRun and enqueues it. */
  async trigger(user: JwtPayload, id: string) {
    const flow = await this.findOwned(requireOrg(user), id);
    const run = await this.prisma.automationRun.create({
      data: { flowId: flow.id },
    });
    await this.queue.add('run', { automationRunId: run.id });
    return run;
  }

  async listRuns(user: JwtPayload, id: string, query: ListFlowsQueryDto) {
    const flow = await this.findOwned(requireOrg(user), id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = { flowId: flow.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.automationRun.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async remove(user: JwtPayload, id: string) {
    const flow = await this.findOwned(requireOrg(user), id);
    await this.prisma.automationFlow.delete({ where: { id: flow.id } });
    return { id: flow.id };
  }
}
