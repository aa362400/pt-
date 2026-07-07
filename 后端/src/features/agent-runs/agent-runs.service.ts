import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { AgentRun, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { CreateAgentRunDto, ListAgentRunsQueryDto } from './agent-runs.dto.js';

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('agent-runs') private readonly queue: Queue,
  ) {}

  private requireOrg(user: JwtPayload): string {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    return user.orgId;
  }

  async create(user: JwtPayload, dto: CreateAgentRunDto): Promise<AgentRun> {
    const orgId = this.requireOrg(user);

    const run = await this.prisma.agentRun.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId ?? null,
        userId: user.sub,
        agentType: dto.agentType,
        status: 'PENDING',
        input: dto.input as Prisma.InputJsonValue,
      },
    });

    await this.queue.add('run', { agentRunId: run.id });
    return run;
  }

  async findAll(
    user: JwtPayload,
    query: ListAgentRunsQueryDto,
  ): Promise<{
    items: AgentRun[];
    total: number;
    page: number;
    limit: number;
  }> {
    const orgId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentRun.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.agentRun.count({ where: { organizationId: orgId } }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(user: JwtPayload, id: string): Promise<AgentRun> {
    const orgId = this.requireOrg(user);
    const run = await this.prisma.agentRun.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }
    return run;
  }

  async remove(user: JwtPayload, id: string): Promise<{ id: string }> {
    const orgId = this.requireOrg(user);
    const run = await this.prisma.agentRun.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }
    await this.prisma.agentRun.delete({ where: { id: run.id } });
    return { id: run.id };
  }
}
