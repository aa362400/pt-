import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { CapabilityCenterService } from '../capability-center/capability-center.service.js';
import { LaunchEnterpriseObjectiveDto } from './enterprise-team.dto.js';

const SPECIALISTS = [
  {
    id: 'product',
    name: 'Product Agent',
    title: 'AI english_text',
    runtimeAgentType: 'PRODUCT_RESEARCHER',
    capabilityIds: ['product-research', 'trend-radar', 'competition'],
    responsibilities: ['english_text', 'english_text', 'english_text', 'english_text'],
  },
  {
    id: 'profit',
    name: 'Profit Agent',
    title: 'AI profitenglish_text',
    runtimeAgentType: 'PROFIT_ANALYST',
    capabilityIds: ['profit'],
    responsibilities: ['costtext', 'platformtext', 'english_text', 'profittext ROI'],
  },
  {
    id: 'listing',
    name: 'Listing Agent',
    title: 'AI english_text',
    runtimeAgentType: 'LISTING_OPTIMIZER',
    capabilityIds: ['listing'],
    responsibilities: ['title', 'english_text', 'text', 'english_text Listing'],
  },
  {
    id: 'creative',
    name: 'Creative Agent',
    title: 'AI english_text',
    runtimeAgentType: 'IMAGE_CREATIVE',
    capabilityIds: ['image'],
    responsibilities: ['text', 'scenetext', 'english_text', 'visual QA'],
  },
  {
    id: 'seo',
    name: 'SEO Agent',
    title: 'AI SEO text',
    runtimeAgentType: 'KEYWORD_EXPLORER',
    capabilityIds: ['keywords', 'trend-radar'],
    responsibilities: ['searchtext', 'english_text', 'english_text', 'english_text'],
  },
  {
    id: 'ads',
    name: 'Ads Agent',
    title: 'AI english_text',
    runtimeAgentType: 'ADVERTISING_STRATEGIST',
    capabilityIds: ['marketing'],
    responsibilities: ['PPC text', 'ROAS text', 'english_text', 'english_text'],
  },
  {
    id: 'data',
    name: 'Data Agent',
    title: 'AI dataenglish_text',
    runtimeAgentType: 'GENERAL_ASSISTANT',
    capabilityIds: ['analytics'],
    responsibilities: ['english_text', 'profittext', 'english_text', 'AI text'],
  },
  {
    id: 'customer',
    name: 'Customer Agent',
    title: 'AI text',
    runtimeAgentType: 'CUSTOMER_INSIGHT',
    capabilityIds: ['customer-service'],
    responsibilities: ['english_text', 'english_text', 'english_text', 'english_text'],
  },
  {
    id: 'supply',
    name: 'Supply Agent',
    title: 'AI supply chaintext',
    runtimeAgentType: 'PLANNER',
    capabilityIds: ['supply-chain'],
    responsibilities: ['english_text', 'costtext', 'english_text', 'supply chainrisk'],
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
          'english_text',
          'text Agent text',
          'english_text',
          'english_text',
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
