import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

export type AgentToolRisk = 'READ_ONLY' | 'LOW' | 'HIGH';

export interface AgentToolDefinition {
  name: string;
  version: string;
  description: string;
  category: string;
  requiredLevel: number;
  riskLevel: AgentToolRisk;
  requiresHumanApproval: boolean;
  inputSchema: Record<string, unknown>;
}

interface ToolExecutionContext {
  organizationId: string;
  userId: string;
  input: Record<string, unknown>;
}

const TOOLS: AgentToolDefinition[] = [
  {
    name: 'system.health.read',
    version: '1.0.0',
    description: 'readenglish_textdataconnectionenglish_text，english_textwrite。',
    category: 'system',
    requiredLevel: 1,
    riskLevel: 'READ_ONLY',
    requiresHumanApproval: false,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'product.list',
    version: '1.0.0',
    description: 'readenglish_textproduct，english_text。',
    category: 'product',
    requiredLevel: 1,
    riskLevel: 'READ_ONLY',
    requiresHumanApproval: false,
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    name: 'market.observation.list',
    version: '1.0.0',
    description: 'readtextuserenglish_text Ozon publictextevidence。',
    category: 'research',
    requiredLevel: 1,
    riskLevel: 'READ_ONLY',
    requiresHumanApproval: false,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'opportunity.list',
    version: '1.0.0',
    description: 'readevidenceenglish_textproduct，textgenerationenglish_text。',
    category: 'research',
    requiredLevel: 1,
    riskLevel: 'READ_ONLY',
    requiresHumanApproval: false,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'automation.list',
    version: '1.0.0',
    description: 'readautomatictextflowenglish_textstatus。',
    category: 'automation',
    requiredLevel: 1,
    riskLevel: 'READ_ONLY',
    requiresHumanApproval: false,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'notification.list',
    version: '1.0.0',
    description: 'textreadenglish_textuserenglish_textnotification。',
    category: 'governance',
    requiredLevel: 1,
    riskLevel: 'READ_ONLY',
    requiresHumanApproval: false,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'listing.publish.propose',
    version: '1.0.0',
    description: 'textpublishapprovaltext；english_textwrite Ozon。',
    category: 'listing',
    requiredLevel: 4,
    riskLevel: 'HIGH',
    requiresHumanApproval: true,
    inputSchema: {
      type: 'object',
      required: ['listingDraftId'],
      properties: { listingDraftId: { type: 'string' } },
      additionalProperties: true,
    },
  },
];

@Injectable()
export class AgentToolRegistryService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  list(): AgentToolDefinition[] {
    return TOOLS.map((tool) => ({ ...tool }));
  }

  get(name: string): AgentToolDefinition {
    const tool = TOOLS.find((candidate) => candidate.name === name);
    if (!tool)
      throw new BadRequestException(`Agent tool is not registered: ${name}`);
    return tool;
  }

  async execute(context: ToolExecutionContext): Promise<unknown> {
    const tool = this.get(context.input.__toolName as string);
    if (tool.requiresHumanApproval) {
      throw new BadRequestException('High-risk tool must enter approval flow');
    }
    const input = { ...context.input };
    delete input.__toolName;
    const limit = this.limit(input.limit, 20, 50);
    return this.tenantDatabase.run(context.organizationId, async (tx) => {
      switch (tool.name) {
        case 'system.health.read':
          return this.systemHealth(tx, context.organizationId);
        case 'product.list':
          return tx.product.findMany({
            where: { workspace: { organizationId: context.organizationId } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true,
              workspaceId: true,
              title: true,
              sku: true,
              status: true,
              price: true,
              currency: true,
              createdAt: true,
            },
          });
        case 'market.observation.list':
          return tx.marketObservationBatch.findMany({
            where: { organizationId: context.organizationId },
            orderBy: { capturedAt: 'desc' },
            take: limit,
            include: { _count: { select: { items: true } } },
          });
        case 'opportunity.list':
          return tx.productOpportunity.findMany({
            where: { organizationId: context.organizationId },
            orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
            take: limit,
          });
        case 'automation.list':
          return tx.automationFlow.findMany({
            where: { organizationId: context.organizationId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true,
              name: true,
              status: true,
              triggerType: true,
              nextRunAt: true,
              createdAt: true,
            },
          });
        case 'notification.list':
          return tx.notification.findMany({
            where: {
              organizationId: context.organizationId,
              userId: context.userId,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true,
              type: true,
              title: true,
              body: true,
              readAt: true,
              createdAt: true,
            },
          });
        default:
          throw new BadRequestException(`No adapter for tool: ${tool.name}`);
      }
    });
  }

  private async systemHealth(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const [products, observations, opportunities, activeAutomations] =
      await Promise.all([
        tx.product.count({ where: { workspace: { organizationId } } }),
        tx.marketObservationBatch.count({ where: { organizationId } }),
        tx.productOpportunity.count({ where: { organizationId } }),
        tx.automationFlow.count({
          where: { organizationId, status: 'ACTIVE' },
        }),
      ]);
    return {
      database: 'available',
      checkedAt: new Date().toISOString(),
      counts: { products, observations, opportunities, activeAutomations },
    };
  }

  private limit(value: unknown, fallback: number, maximum: number): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
    return Math.max(1, Math.min(maximum, value));
  }
}
