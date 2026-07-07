import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import { AGENT_PROVIDER } from '../../agents/agent.module.js';
import type { AgentProviderInterface } from '../../agents/agent-provider.interface.js';
import {
  CreateSessionDto,
  ListSessionsQueryDto,
  PostMessageDto,
} from './assistant.dto.js';

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
  ) {}

  async createSession(user: JwtPayload, dto: CreateSessionDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    return this.prisma.assistantSession.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        userId: user.sub,
        title: dto.title,
        contextType: dto.contextType ?? 'GENERAL',
      },
    });
  }

  async listSessions(user: JwtPayload, query: ListSessionsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = { organizationId: orgId, userId: user.sub };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.assistantSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.assistantSession.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwnedSession(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const session = await this.prisma.assistantSession.findFirst({
      where: { id, organizationId: orgId, userId: user.sub },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async getSession(user: JwtPayload, id: string) {
    const session = await this.findOwnedSession(user, id);
    const messages = await this.prisma.assistantMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    return { ...session, messages };
  }

  /**
   * Stores the user message, asks the configured agent provider for a reply
   * (HTTP provider when AGENT_BASE_URL is set, mock otherwise) and stores the
   * assistant message. Returns both messages.
   */
  async postMessage(user: JwtPayload, sessionId: string, dto: PostMessageDto) {
    const session = await this.findOwnedSession(user, sessionId);

    const userMessage = await this.prisma.assistantMessage.create({
      data: { sessionId: session.id, role: 'USER', content: dto.content },
    });

    let replyText: string;
    let failed = false;
    try {
      replyText = await this.agentProvider.runAssistant({
        assistantId: session.contextType,
        threadId: session.id,
        prompt: dto.content,
        workspaceId: session.workspaceId ?? '',
        orgId: session.organizationId,
        userId: user.sub,
      });
    } catch (error) {
      failed = true;
      replyText = `Assistant is temporarily unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    const assistantMessage = await this.prisma.assistantMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: replyText,
        metadata: { failed },
      },
    });

    return { userMessage, assistantMessage };
  }

  async removeSession(user: JwtPayload, id: string) {
    const session = await this.findOwnedSession(user, id);
    await this.prisma.assistantSession.delete({ where: { id: session.id } });
    return { id: session.id };
  }
}
