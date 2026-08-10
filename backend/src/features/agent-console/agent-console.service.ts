import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { AssistantService } from '../assistant/assistant.service.js';
import { AgentAutonomyService } from '../agent-autonomy/agent-autonomy.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import {
  AgentConversationMessageDto,
  CreateAgentConversationDto,
  CreateAgentPlanDto,
  ListAgentConversationsQueryDto,
} from './agent-console.dto.js';
import {
  AgentToolRegistryService,
  type AgentToolDefinition,
} from './agent-tool-registry.service.js';

export interface EffectiveAgentToolPolicy {
  level: number;
  allowedTools: string[];
  deniedTools: string[];
  highRiskApproval: boolean;
}

export interface AgentPlanJobData {
  planId: string;
  organizationId: string;
  userId: string;
}

export function assertAgentToolAccess(
  policy: EffectiveAgentToolPolicy,
  conversationLevel: number,
  tool: AgentToolDefinition,
) {
  const level = Math.min(policy.level, conversationLevel);
  if (level === 0 || level < tool.requiredLevel) {
    throw new BadRequestException(
      `Autonomy L${level} cannot use ${tool.name}; L${tool.requiredLevel} is required`,
    );
  }
  if (policy.deniedTools.includes(tool.name)) {
    throw new BadRequestException(`Tool is denied by policy: ${tool.name}`);
  }
  if (
    policy.allowedTools.length > 0 &&
    !policy.allowedTools.includes(tool.name)
  ) {
    throw new BadRequestException(
      `Tool is not in the policy allowlist: ${tool.name}`,
    );
  }
  if (tool.riskLevel === 'HIGH' && !policy.highRiskApproval) {
    throw new BadRequestException(
      'High-risk tools are disabled because approval enforcement is off',
    );
  }
}

@Injectable()
export class AgentConsoleService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly assistant: AssistantService,
    private readonly autonomy: AgentAutonomyService,
    private readonly tools: AgentToolRegistryService,
    private readonly actionProposals: ActionProposalsService,
    private readonly audit: AuditService,
    @InjectQueue('agent-plans') private readonly planQueue: Queue,
  ) {}

  async createConversation(user: JwtPayload, dto: CreateAgentConversationDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      const workspace = await this.tenantDatabase.run(orgId, (tx) =>
        tx.workspace.findFirst({
          where: { id: dto.workspaceId, organizationId: orgId },
          select: { id: true },
        }),
      );
      if (!workspace) throw new NotFoundException('Workspace not found');
    }
    const effective = await this.autonomy.getEffectivePolicy(orgId, user.sub);
    const requestedLevel = dto.autonomyLevel ?? effective.level;
    if (requestedLevel > effective.level) {
      throw new BadRequestException(
        'Conversation autonomy cannot exceed the effective policy',
      );
    }
    return this.tenantDatabase.run(orgId, (tx) =>
      tx.assistantSession.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          userId: user.sub,
          title: dto.title,
          contextType: dto.contextType ?? 'GENERAL',
          autonomyLevel: requestedLevel,
          allowedDomains: dto.allowedDomains ?? [],
          context: (dto.context ?? {}) as Prisma.InputJsonValue,
        },
      }),
    );
  }

  listConversations(user: JwtPayload, query: ListAgentConversationsQueryDto) {
    return this.assistant.listSessions(user, query);
  }

  getConversation(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const conversation = await tx.assistantSession.findFirst({
        where: { id, organizationId: orgId, userId: user.sub },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          plans: {
            orderBy: { createdAt: 'desc' },
            include: { executions: { orderBy: { createdAt: 'asc' } } },
          },
        },
      });
      if (!conversation) throw new NotFoundException('Conversation not found');
      return conversation;
    });
  }

  postMessage(user: JwtPayload, id: string, dto: AgentConversationMessageDto) {
    return this.assistant.postMessage(user, id, dto);
  }

  async createPlan(
    user: JwtPayload,
    conversationId: string,
    dto: CreateAgentPlanDto,
  ) {
    const orgId = requireOrg(user);
    if (dto.steps.length === 0) {
      throw new BadRequestException('At least one registered tool is required');
    }
    const conversation = await this.findOwnedConversation(
      orgId,
      user.sub,
      conversationId,
    );
    const definitions = dto.steps.map((step) => this.tools.get(step.toolName));
    const policy = await this.autonomy.getEffectivePolicy(orgId, user.sub);
    for (const definition of definitions) {
      assertAgentToolAccess(policy, conversation.autonomyLevel, definition);
    }
    const plan = await this.tenantDatabase.run(orgId, async (tx) => {
      const created = await tx.agentPlan.create({
        data: {
          organizationId: orgId,
          conversationId,
          goal: dto.goal,
          plan: {
            version: '1.0.0',
            steps: dto.steps.map((step, index) => ({
              index,
              toolName: step.toolName,
              input: step.input ?? {},
            })),
          } as Prisma.InputJsonValue,
        },
      });
      for (let index = 0; index < dto.steps.length; index += 1) {
        const step = dto.steps[index];
        const definition = definitions[index];
        const input = step.input ?? {};
        const inputHash = this.hash(input);
        await tx.agentToolExecution.create({
          data: {
            organizationId: orgId,
            planId: created.id,
            toolName: definition.name,
            toolVersion: definition.version,
            riskLevel: definition.riskLevel,
            idempotencyKey: this.hash({
              orgId,
              planId: created.id,
              index,
              inputHash,
            }),
            inputHash,
            input: input as Prisma.InputJsonValue,
          },
        });
      }
      return tx.agentPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: { executions: { orderBy: { createdAt: 'asc' } } },
      });
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'agent-console.plan-created',
      resourceType: 'AgentPlan',
      resourceId: plan.id,
      after: { goal: plan.goal, tools: definitions.map((tool) => tool.name) },
    });
    return plan;
  }

  async executePlan(user: JwtPayload, planId: string) {
    const orgId = requireOrg(user);
    const plan = await this.findOwnedPlan(orgId, user.sub, planId);
    if (plan.status === 'COMPLETED') return plan;
    if (['QUEUED', 'RUNNING'].includes(plan.status)) return plan;
    if (['CANCELLED', 'PAUSED', 'WAITING_FOR_APPROVAL'].includes(plan.status)) {
      throw new ConflictException(`Plan is ${plan.status.toLowerCase()}`);
    }

    const transitioned = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.updateMany({
        where: {
          id: plan.id,
          organizationId: orgId,
          status: { in: ['PLANNED', 'FAILED'] },
        },
        data: { status: 'QUEUED', error: Prisma.JsonNull },
      }),
    );
    if (transitioned.count !== 1) {
      return this.findOwnedPlan(orgId, user.sub, plan.id);
    }

    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'agent-console.plan-enqueued',
      resourceType: 'AgentPlan',
      resourceId: plan.id,
      after: { status: 'QUEUED', jobId: this.planJobId(plan.id) },
    });
    await this.ensurePlanJob({
      planId: plan.id,
      organizationId: orgId,
      userId: user.sub,
    });
    return this.findOwnedPlan(orgId, user.sub, plan.id);
  }

  async resumePlan(user: JwtPayload, planId: string) {
    const orgId = requireOrg(user);
    const plan = await this.findOwnedPlan(orgId, user.sub, planId);
    if (plan.status !== 'PAUSED') {
      throw new ConflictException('Only a paused plan can be resumed');
    }
    const transitioned = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.updateMany({
        where: { id: plan.id, organizationId: orgId, status: 'PAUSED' },
        data: { status: 'QUEUED', error: Prisma.JsonNull },
      }),
    );
    if (transitioned.count !== 1) {
      return this.findOwnedPlan(orgId, user.sub, plan.id);
    }
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'agent-console.plan-resumed',
      resourceType: 'AgentPlan',
      resourceId: plan.id,
      after: { status: 'QUEUED', jobId: this.planJobId(plan.id) },
    });
    await this.ensurePlanJob({
      planId: plan.id,
      organizationId: orgId,
      userId: user.sub,
    });
    return this.findOwnedPlan(orgId, user.sub, plan.id);
  }

  async ensurePlanJob(
    data: AgentPlanJobData,
  ): Promise<'existing' | 'enqueued'> {
    const jobId = this.planJobId(data.planId);
    const existing = await this.planQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (!['completed', 'failed'].includes(state)) return 'existing';
      await existing.remove();
    }
    await this.planQueue.add('execute', data, { jobId });
    return 'enqueued';
  }

  async runQueuedPlan(data: AgentPlanJobData) {
    const user: JwtPayload = {
      sub: data.userId,
      email: '',
      orgId: data.organizationId,
    };
    const orgId = data.organizationId;
    const plan = await this.findOwnedPlan(orgId, user.sub, data.planId);
    if (
      ['COMPLETED', 'CANCELLED', 'PAUSED', 'WAITING_FOR_APPROVAL'].includes(
        plan.status,
      )
    ) {
      return plan;
    }
    if (!['QUEUED', 'RUNNING', 'FAILED'].includes(plan.status)) {
      throw new ConflictException(`Plan cannot run from status ${plan.status}`);
    }

    const claimed = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.updateMany({
        where: {
          id: plan.id,
          organizationId: orgId,
          status: { in: ['QUEUED', 'RUNNING', 'FAILED'] },
        },
        data: { status: 'RUNNING', error: Prisma.JsonNull },
      }),
    );
    if (claimed.count !== 1) {
      return this.findOwnedPlan(orgId, user.sub, plan.id);
    }

    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'agent-console.plan-started',
      resourceType: 'AgentPlan',
      resourceId: plan.id,
      after: { status: 'RUNNING' },
    });
    const policy = await this.autonomy.getEffectivePolicy(orgId, user.sub);

    for (const execution of plan.executions) {
      if (
        execution.status === 'COMPLETED' ||
        execution.status === 'WAITING_FOR_APPROVAL'
      ) {
        continue;
      }
      const controlStatus = await this.currentPlanStatus(orgId, plan.id);
      if (['PAUSED', 'CANCELLED'].includes(controlStatus)) {
        return this.findOwnedPlan(orgId, user.sub, plan.id);
      }
      const definition = this.tools.get(execution.toolName);
      try {
        assertAgentToolAccess(
          policy,
          plan.conversation.autonomyLevel,
          definition,
        );
        const input = this.record(execution.input);
        if (definition.requiresHumanApproval) {
          const { proposal, notification } = await this.actionProposals.create({
            organizationId: orgId,
            requestedBy: user.sub,
            approverId: user.sub,
            source: 'agent_console',
            title: `智能体请求人工确认：${definition.name}`,
            body: '该动作可能写入外部平台。当前仅创建审批提案，未执行外部写入。',
            action: { label: '执行', name: definition.name, params: input },
            context: {
              kind: 'agent_tool_approval',
              riskLevel: definition.riskLevel,
              planId: plan.id,
              toolExecutionId: execution.id,
              externalStoreMutation: 'blocked_until_human_confirmation',
            },
            dedupeKey: execution.idempotencyKey,
          });
          await this.tenantDatabase.run(orgId, (tx) =>
            Promise.all([
              tx.agentToolExecution.update({
                where: { id: execution.id },
                data: {
                  status: 'WAITING_FOR_APPROVAL',
                  output: {
                    proposalId: proposal.id,
                    notificationId: notification.id,
                  },
                  finishedAt: new Date(),
                },
              }),
              tx.agentPlan.updateMany({
                where: {
                  id: plan.id,
                  organizationId: orgId,
                  status: 'RUNNING',
                },
                data: { status: 'WAITING_FOR_APPROVAL' },
              }),
            ]),
          );
          await this.audit.log({
            organizationId: orgId,
            actorId: user.sub,
            action: 'agent-console.plan-awaiting-approval',
            resourceType: 'AgentPlan',
            resourceId: plan.id,
            after: { toolName: definition.name, proposalId: proposal.id },
          });
          return this.findOwnedPlan(orgId, user.sub, plan.id);
        }

        await this.tenantDatabase.run(orgId, (tx) =>
          tx.agentToolExecution.update({
            where: { id: execution.id },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
              error: Prisma.JsonNull,
            },
          }),
        );
        const output = await this.tools.execute({
          organizationId: orgId,
          userId: user.sub,
          input: { ...input, __toolName: definition.name },
        });
        await this.tenantDatabase.run(orgId, (tx) =>
          tx.agentToolExecution.update({
            where: { id: execution.id },
            data: {
              status: 'COMPLETED',
              output: output as Prisma.InputJsonValue,
              finishedAt: new Date(),
            },
          }),
        );
        const statusAfterTool = await this.currentPlanStatus(orgId, plan.id);
        if (['PAUSED', 'CANCELLED'].includes(statusAfterTool)) {
          return this.findOwnedPlan(orgId, user.sub, plan.id);
        }
      } catch (error) {
        const serialized = {
          code:
            error instanceof BadRequestException
              ? 'TOOL_POLICY_REJECTED'
              : 'TOOL_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        };
        await this.tenantDatabase.run(orgId, (tx) =>
          Promise.all([
            tx.agentToolExecution.update({
              where: { id: execution.id },
              data: {
                status: 'FAILED',
                error: serialized,
                finishedAt: new Date(),
              },
            }),
            tx.agentPlan.updateMany({
              where: { id: plan.id, organizationId: orgId, status: 'RUNNING' },
              data: { status: 'FAILED', error: serialized },
            }),
          ]),
        );
        await this.audit.log({
          organizationId: orgId,
          actorId: user.sub,
          action: 'agent-console.plan-failed',
          resourceType: 'AgentPlan',
          resourceId: plan.id,
          after: { toolName: definition.name, error: serialized },
        });
        throw error;
      }
    }

    const completed = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.updateMany({
        where: { id: plan.id, organizationId: orgId, status: 'RUNNING' },
        data: {
          status: 'COMPLETED',
          result: { completedAt: new Date().toISOString() },
        },
      }),
    );
    if (completed.count === 1) {
      await this.audit.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'agent-console.plan-completed',
        resourceType: 'AgentPlan',
        resourceId: plan.id,
        after: { status: 'COMPLETED' },
      });
    }
    return this.findOwnedPlan(orgId, user.sub, plan.id);
  }

  async setPlanStatus(
    user: JwtPayload,
    planId: string,
    status: 'PAUSED' | 'CANCELLED',
  ) {
    const orgId = requireOrg(user);
    const plan = await this.findOwnedPlan(orgId, user.sub, planId);
    if (plan.status === status) return plan;
    if (['COMPLETED', 'WAITING_FOR_APPROVAL'].includes(plan.status)) {
      throw new ConflictException(`${plan.status} plan cannot be changed here`);
    }
    const allowed =
      status === 'PAUSED'
        ? ['QUEUED', 'RUNNING']
        : ['PLANNED', 'QUEUED', 'RUNNING', 'FAILED', 'PAUSED'];
    if (!allowed.includes(plan.status)) {
      throw new ConflictException(
        `Plan cannot become ${status} from ${plan.status}`,
      );
    }
    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.updateMany({
        where: { id: plan.id, organizationId: orgId, status: plan.status },
        data: { status },
      }),
    );
    if (updated.count !== 1) {
      return this.findOwnedPlan(orgId, user.sub, plan.id);
    }
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action:
        status === 'PAUSED'
          ? 'agent-console.plan-paused'
          : 'agent-console.plan-cancelled',
      resourceType: 'AgentPlan',
      resourceId: plan.id,
      before: { status: plan.status },
      after: { status },
    });
    return this.findOwnedPlan(orgId, user.sub, plan.id);
  }

  async retryExecution(user: JwtPayload, executionId: string) {
    const orgId = requireOrg(user);
    const execution = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentToolExecution.findFirst({
        where: {
          id: executionId,
          organizationId: orgId,
          plan: { conversation: { userId: user.sub } },
        },
        include: { plan: true },
      }),
    );
    if (!execution) throw new NotFoundException('Tool execution not found');
    if (execution.status !== 'FAILED') {
      throw new ConflictException('Only failed execution can be retried');
    }
    await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.agentToolExecution.update({
          where: { id: execution.id },
          data: {
            status: 'PLANNED',
            error: Prisma.JsonNull,
            output: Prisma.JsonNull,
            startedAt: null,
            finishedAt: null,
          },
        }),
        tx.agentPlan.update({
          where: { id: execution.planId },
          data: { status: 'PLANNED', error: Prisma.JsonNull },
        }),
      ]),
    );
    return this.executePlan(user, execution.planId);
  }

  listTools() {
    return { items: this.tools.list() };
  }

  private async findOwnedConversation(
    orgId: string,
    userId: string,
    id: string,
  ) {
    const conversation = await this.tenantDatabase.run(orgId, (tx) =>
      tx.assistantSession.findFirst({
        where: { id, organizationId: orgId, userId },
      }),
    );
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async findOwnedPlan(orgId: string, userId: string, id: string) {
    const plan = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.findFirst({
        where: {
          id,
          organizationId: orgId,
          conversation: { userId },
        },
        include: {
          conversation: true,
          executions: { orderBy: { createdAt: 'asc' } },
        },
      }),
    );
    if (!plan) throw new NotFoundException('Agent plan not found');
    return plan;
  }

  private async currentPlanStatus(orgId: string, id: string): Promise<string> {
    const plan = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentPlan.findFirst({
        where: { id, organizationId: orgId },
        select: { status: true },
      }),
    );
    if (!plan) throw new NotFoundException('Agent plan not found');
    return plan.status;
  }

  private planJobId(planId: string): string {
    return `agent-plan__${planId}`;
  }

  private hash(value: unknown): string {
    return createHash('sha256')
      .update(this.canonical(value), 'utf8')
      .digest('hex');
  }

  private canonical(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((v) => this.canonical(v)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonical(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value ?? null);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
