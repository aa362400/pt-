import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { CapabilityCenterService } from '../capability-center/capability-center.service.js';
import { LaunchEnterpriseObjectiveDto } from './enterprise-team.dto.js';

const SPECIALISTS = [
  {
    id: 'product',
    name: 'Product Agent',
    title: 'AI 产品经理',
    runtimeAgentType: 'PRODUCT_RESEARCHER',
    capabilityIds: ['product-research', 'trend-radar', 'competition'],
    responsibilities: ['趋势发现', '蓝海分析', '竞品研究', '爆款评分'],
  },
  {
    id: 'profit',
    name: 'Profit Agent',
    title: 'AI 利润分析师',
    runtimeAgentType: 'PROFIT_ANALYST',
    capabilityIds: ['profit'],
    responsibilities: ['成本核算', '平台费用', '物流费用', '利润与 ROI'],
  },
  {
    id: 'listing',
    name: 'Listing Agent',
    title: 'AI 刊登专员',
    runtimeAgentType: 'LISTING_OPTIMIZER',
    capabilityIds: ['listing'],
    responsibilities: ['标题', '五点描述', '标签', '多语言 Listing'],
  },
  {
    id: 'creative',
    name: 'Creative Agent',
    title: 'AI 设计师',
    runtimeAgentType: 'IMAGE_CREATIVE',
    capabilityIds: ['image'],
    responsibilities: ['主图', '场景图', '信息图', '视觉 QA'],
  },
  {
    id: 'seo',
    name: 'SEO Agent',
    title: 'AI SEO 专员',
    runtimeAgentType: 'KEYWORD_EXPLORER',
    capabilityIds: ['keywords', 'trend-radar'],
    responsibilities: ['搜索词', '长尾词', '竞争分析', '排名优化'],
  },
  {
    id: 'ads',
    name: 'Ads Agent',
    title: 'AI 广告投手',
    runtimeAgentType: 'ADVERTISING_STRATEGIST',
    capabilityIds: ['marketing'],
    responsibilities: ['PPC 分析', 'ROAS 优化', '预算建议', '投放策略'],
  },
  {
    id: 'data',
    name: 'Data Agent',
    title: 'AI 数据分析师',
    runtimeAgentType: 'GENERAL_ASSISTANT',
    capabilityIds: ['analytics'],
    responsibilities: ['销售分析', '利润分析', '生命周期', 'AI 日报'],
  },
  {
    id: 'customer',
    name: 'Customer Agent',
    title: 'AI 客服',
    runtimeAgentType: 'CUSTOMER_INSIGHT',
    capabilityIds: ['customer-service'],
    responsibilities: ['多语言客服', '售前咨询', '售后处理', '差评分析'],
  },
  {
    id: 'supply',
    name: 'Supply Agent',
    title: 'AI 供应链专员',
    runtimeAgentType: 'PLANNER',
    capabilityIds: ['supply-chain'],
    responsibilities: ['供应商管理', '成本优化', '库存预测', '供应链风险'],
  },
] as const;

@Injectable()
export class EnterpriseTeamService {
  constructor(
    private readonly agentRuns: AgentRunsService,
    private readonly capabilities: CapabilityCenterService,
  ) {}

  async team(user: JwtPayload) {
    const report = await this.capabilities.list(user);
    const byId = new Map(report.items.map((item) => [item.id, item]));
    const specialists = SPECIALISTS.map((specialist) => {
      const related = specialist.capabilityIds
        .map((id) => byId.get(id))
        .filter(Boolean);
      const blocked = related.some((item) => item?.overallState === 'missing');
      const partial = related.some((item) => item?.overallState !== 'passed');
      return {
        ...specialist,
        state: blocked ? 'blocked' : partial ? 'partial' : 'available',
        blockers: related.flatMap((item) => item?.blockers ?? []).slice(0, 4),
      };
    });
    return {
      generatedAt: report.generatedAt,
      ceo: {
        id: 'ceo',
        name: 'CEO Agent',
        runtimeAgentType: 'PLANNER',
        responsibilities: [
          '目标拆解',
          '专业 Agent 协作',
          '工具调用计划',
          '结果验证与经验沉淀',
        ],
      },
      specialists,
      operationSafety: report.operationSafety,
    };
  }

  async launch(user: JwtPayload, dto: LaunchEnterpriseObjectiveDto) {
    const team = await this.team(user);
    const requested = dto.specialistIds?.length
      ? dto.specialistIds
      : team.specialists
          .filter((item) => item.state !== 'blocked')
          .map((item) => item.id);
    const selected = team.specialists.filter((item) =>
      requested.includes(item.id),
    );
    const unknown = requested.filter(
      (id) => !team.specialists.some((item) => item.id === id),
    );
    if (unknown.length)
      throw new BadRequestException(
        `Unknown specialists: ${unknown.join(', ')}`,
      );
    const blocked = selected.filter((item) => item.state === 'blocked');
    if (blocked.length)
      throw new BadRequestException(
        `Connector not ready: ${blocked.map((item) => item.name).join(', ')}`,
      );

    const run = await this.agentRuns.create(user, {
      agentType: 'PLANNER',
      workspaceId: dto.workspaceId,
      clientRequestId: `enterprise:${user.orgId}:${Date.now()}`,
      input: {
        goal: dto.goal.trim(),
        taskType: 'plan_and_execute',
        orchestrationMode: 'enterprise_ceo',
        specialists: selected.map((item) => ({
          id: item.id,
          name: item.name,
          runtimeAgentType: item.runtimeAgentType,
          responsibilities: item.responsibilities,
        })),
        guardrails: {
          readOnlyMayAutoExecute: true,
          localDraftMayAutoCreate: true,
          externalWritesRequireHumanConfirmation: true,
          unavailableConnectorsMustBlock: true,
        },
      },
    });
    return {
      run,
      selectedSpecialists: selected.map((item) => item.id),
      blockedSpecialists: blocked.map((item) => item.id),
    };
  }
}
