import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  AgentRoadmapService,
  type AgentRoadmapPhase,
  type AgentRoadmapStatus,
} from '../agent-roadmap/agent-roadmap.service.js';

export type CapabilityRisk =
  'read_only' | 'local_write' | 'human_confirmation' | 'not_connected';

export interface PlatformCapability {
  id: string;
  label: string;
  category: '运营' | '商品' | '内容' | '店铺' | 'Agent' | '治理';
  summary: string;
  frontendPath: string;
  operationPath?: string;
  backendEndpoints: string[];
  agentPhaseIds: number[];
  risk: CapabilityRisk;
  frontendState: 'connected';
  backendState: 'connected' | 'not_connected';
  agentState: AgentRoadmapStatus;
  overallState: AgentRoadmapStatus;
  evidence: string[];
  blockers: string[];
}

interface CapabilityDefinition extends Omit<
  PlatformCapability,
  | 'frontendState'
  | 'backendState'
  | 'agentState'
  | 'overallState'
  | 'evidence'
  | 'blockers'
> {
  backendConnected?: boolean;
  inheritPhaseBlockers?: boolean;
  localBlockers?: string[];
  localEvidence?: string[];
  agentStateOverride?: AgentRoadmapStatus;
}

const CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'enterprise-team',
    label: 'CEO Agent 与 AI 团队',
    category: 'Agent',
    summary: '由 CEO Agent 拆解企业目标并协调专业 Agent 执行。',
    frontendPath: '/enterprise-team',
    backendEndpoints: [
      'GET /enterprise-team',
      'POST /enterprise-team/objectives',
    ],
    agentPhaseIds: [11, 12, 15, 16, 20],
    risk: 'human_confirmation',
  },
  {
    id: 'agent-center',
    label: 'AI Agent 中心',
    category: 'Agent',
    summary: '查看 Agent 健康、任务、权限和 1-20 阶段验收。',
    frontendPath: '/agent-roadmap',
    operationPath: '/agent-roadmap/operations',
    backendEndpoints: [
      'GET /agent-roadmap',
      'GET /agent-proxy/health',
      'GET /agent-proxy/actions',
    ],
    agentPhaseIds: [1, 2, 3, 4, 5, 10, 16, 17, 18, 19, 20],
    risk: 'read_only',
  },
  {
    id: 'product-management',
    label: '商品管理与编辑',
    category: '商品',
    summary: '读取本地/Ozon 商品，并通过受控申请修改商品。',
    frontendPath: '/products',
    operationPath: '/products/operations',
    backendEndpoints: [
      'GET /products',
      'PATCH /products/:id',
      'POST /products/:id/ozon-change-request',
    ],
    agentPhaseIds: [9, 10, 16, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'orders',
    label: '订单同步与处理',
    category: '店铺',
    summary: '同步并查看 Ozon 订单；退款等写操作必须人工确认。',
    frontendPath: '/orders',
    operationPath: '/orders/operations',
    backendEndpoints: [
      'GET /channels/orders',
      'POST /channels/:id/sync-orders',
    ],
    agentPhaseIds: [9, 16, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'listing',
    label: '刊登与 SEO',
    category: '内容',
    summary: '生成、编辑和审核 Listing 草稿，发布保持单独确认。',
    frontendPath: '/listing-generator',
    operationPath: '/listing-generator/operations',
    backendEndpoints: [
      'GET /listings',
      'POST /listings/generate',
      'PATCH /listings/:id',
    ],
    agentPhaseIds: [3, 10, 11, 12, 16, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'image',
    label: '内容与图片',
    category: '内容',
    summary: '管理图片项目和真实生成资产，发布前保留视觉审核。',
    frontendPath: '/image-prompt',
    operationPath: '/image-prompt/operations',
    backendEndpoints: [
      'GET /image-prompt',
      'POST /image-prompt',
      'PATCH /image-prompt/:id',
    ],
    agentPhaseIds: [3, 10, 12, 16],
    risk: 'human_confirmation',
  },
  {
    id: 'review',
    label: '人工审核中心',
    category: '治理',
    summary: '预览证据、批准、驳回、重做和受控发布。',
    frontendPath: '/review',
    operationPath: '/review/operations',
    backendEndpoints: [
      'GET /review',
      'GET /review/stats',
      'PATCH /review/:id',
      'POST /review/product-launch/:launchId/publish',
    ],
    agentPhaseIds: [7, 12, 16, 17, 19],
    risk: 'human_confirmation',
  },
  {
    id: 'automation',
    label: '自动化流程',
    category: '运营',
    summary: '管理 Agent 自动化流、运行记录、恢复和去重。',
    frontendPath: '/automation',
    operationPath: '/automation/operations',
    backendEndpoints: [
      'GET /automation/flows',
      'POST /automation/flows/:id/trigger',
      'POST /automation/flows/:id/recover',
    ],
    agentPhaseIds: [5, 11, 13, 14, 15, 16, 20],
    risk: 'human_confirmation',
  },
  {
    id: 'platform',
    label: '平台连接与诊断',
    category: '店铺',
    summary: '连接 Ozon、同步商品订单并查看诊断证据。',
    frontendPath: '/store-monitor',
    operationPath: '/store-monitor/operations',
    backendEndpoints: [
      'GET /channels',
      'POST /channels/ozon/connect',
      'GET /channels/:id/diagnostics',
    ],
    agentPhaseIds: [9, 10, 13, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'analytics',
    label: 'Ozon 数据分析',
    category: '运营',
    summary: '查看真实同步商品、订单、利润和趋势数据。',
    frontendPath: '/market',
    operationPath: '/market/operations',
    backendEndpoints: [
      'GET /dashboard/trends',
      'GET /dashboard/hot-products',
      'GET /dashboard/profit-summary',
    ],
    agentPhaseIds: [7, 8, 9, 12],
    risk: 'read_only',
  },
  {
    id: 'team',
    label: '团队与设置',
    category: '治理',
    summary: '管理组织成员、角色、工作区和安全设置。',
    frontendPath: '/team',
    operationPath: '/team/operations',
    backendEndpoints: [
      'GET /organizations/current',
      'GET /organizations/members',
      'PATCH /organizations/members/:id',
    ],
    agentPhaseIds: [4, 16],
    risk: 'human_confirmation',
  },
  {
    id: 'customer-service',
    label: '客户服务',
    category: '店铺',
    summary: '读取 Ozon 买家聊天、商品问答和评价；所有回复必须人工确认。',
    frontendPath: '/customer-service',
    operationPath: '/customer-service/operations',
    backendEndpoints: [
      'GET /channels/ozon/customer-service/overview',
      'GET /channels/ozon/customer-service/chats/:chatId/history',
      'POST /channels/ozon/customer-service/targets/:targetId/action-request',
    ],
    agentPhaseIds: [17],
    risk: 'human_confirmation',
    inheritPhaseBlockers: false,
    localBlockers: [
      '商品问答需要 Ozon Premium Plus；评价需要“管理评价”订阅或 Premium Pro',
      '客服外部回复只有在真实审批执行成功并留存审计证据后才能判定通过',
    ],
  },
  {
    id: 'marketing',
    label: '营销广告',
    category: '运营',
    summary:
      '独立连接 Ozon Performance API，读取计划与统计，变更必须人工确认。',
    frontendPath: '/marketing',
    backendEndpoints: [
      'POST /channels/ozon-performance/connect',
      'GET /channels/ozon-performance/overview',
      'POST /channels/ozon-performance/campaigns/:campaignId/action-request',
    ],
    agentPhaseIds: [17],
    risk: 'human_confirmation',
    inheritPhaseBlockers: false,
    localBlockers: [
      '需要配置独立 Ozon Performance client_id/client_secret 并完成真实只读验收',
      '广告变更只有在真实审批执行成功并留存审计证据后才能判定通过',
    ],
  },
  {
    id: 'product-research',
    label: '智能选品',
    category: '商品',
    summary: '真实证据调研、候选创建和人工审批。',
    frontendPath: '/product-research',
    backendEndpoints: [
      'GET /product-research',
      'GET /product-research/candidates',
      'POST /product-research/candidates/:id/review',
    ],
    agentPhaseIds: [3, 7, 9, 11, 12, 14, 16],
    risk: 'human_confirmation',
  },
  {
    id: 'trend-radar',
    label: '趋势雷达',
    category: '运营',
    summary: '读取带来源和抓取时间的趋势证据。',
    frontendPath: '/trend-radar',
    backendEndpoints: ['GET /trends', 'POST /trends/analyze'],
    agentPhaseIds: [3, 7, 9, 12, 14],
    risk: 'read_only',
  },
  {
    id: 'keywords',
    label: '关键词分析',
    category: '内容',
    summary: '运行关键词分析并保留真实报告记录。',
    frontendPath: '/keyword-analysis',
    backendEndpoints: ['GET /keywords', 'POST /keywords'],
    agentPhaseIds: [3, 9, 10, 11, 12],
    risk: 'local_write',
  },
  {
    id: 'profit',
    label: '利润计算器',
    category: '商品',
    summary: '基于真实成本字段保存利润和 ROI 测算。',
    frontendPath: '/profit-calculator',
    backendEndpoints: [
      'GET /profit-calculator',
      'POST /profit-calculator/calculate',
    ],
    agentPhaseIds: [7, 10, 12],
    risk: 'local_write',
  },
  {
    id: 'ozon-pricing',
    label: 'Ozon 核价',
    category: '商品',
    summary: '按导入售价表的类目佣金、ZTO 物流和成本规则确定性核价。',
    frontendPath: '/ozon-pricing',
    backendEndpoints: [
      'GET /profit-calculator/ozon/categories',
      'POST /profit-calculator/ozon/calculate',
      'POST /profit-calculator/ozon/batch',
      'POST /agent-proxy/console (ozon.pricing.calculate)',
    ],
    agentPhaseIds: [10, 12],
    risk: 'read_only',
    inheritPhaseBlockers: false,
    agentStateOverride: 'passed',
    localEvidence: [
      'MCP tool ozon_pricing_engine is registered and covered by transport tests',
      'Workbook SHA-256 A27BA46D5FF5332B23BBDE3CDA359DA90007C4AAF4B73B351ACBE4D164B39FF7',
      '80 categories, 3 ZTO services, 18 freight tiers, batch limit 100',
      'Read-only calculation writes tenant audit evidence and never changes Ozon prices',
    ],
  },
  {
    id: 'competition',
    label: '竞品分析',
    category: '运营',
    summary: '使用 Ozon 同步数据进行竞品与价格质量检查。',
    frontendPath: '/competition',
    backendEndpoints: ['GET /products', 'GET /channels/orders'],
    agentPhaseIds: [7, 9, 12],
    risk: 'read_only',
  },
  {
    id: 'mcp',
    label: 'MCP 工具',
    category: 'Agent',
    summary: '查看和调用已配置 MCP 工具，写操作受权限闸控制。',
    frontendPath: '/mcp-tools',
    backendEndpoints: ['GET /agent-proxy/actions', 'POST /agent-proxy/console'],
    agentPhaseIds: [2, 3, 10, 16, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'audit',
    label: '审计与死信',
    category: '治理',
    summary: '查看审计记录、失败原因和恢复轨迹。',
    frontendPath: '/audit-logs',
    backendEndpoints: [
      'GET /audit-logs',
      'GET /admin/dead-letters',
      'POST /admin/dead-letters/:id/replay',
    ],
    agentPhaseIds: [4, 5, 8, 16, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'billing',
    label: '套餐与用量',
    category: '治理',
    summary: '查看真实套餐、用量和账单记录。',
    frontendPath: '/billing',
    backendEndpoints: [
      'GET /billing/plan',
      'GET /billing/usage',
      'GET /billing/invoices',
    ],
    agentPhaseIds: [4, 16],
    risk: 'human_confirmation',
  },
  {
    id: 'supply-chain',
    label: '供应链管理',
    category: '商品',
    summary: '管理供应商、SKU 采购参数、确定性库存预测和人工批准的补货计划。',
    frontendPath: '/supply-chain',
    backendEndpoints: [
      'GET /supply-chain',
      'POST /supply-chain/suppliers',
      'POST /supply-chain/skus',
      'POST /supply-chain/plans/generate',
      'POST /supply-chain/plans/:id/request-approval',
    ],
    agentPhaseIds: [17],
    risk: 'human_confirmation',
  },
];

@Injectable()
export class CapabilityCenterService {
  constructor(private readonly roadmap: AgentRoadmapService) {}

  async list(user: JwtPayload) {
    const report = await this.roadmap.getRoadmap(user);
    const phases = new Map(report.phases.map((phase) => [phase.id, phase]));
    const items = CAPABILITIES.map((definition) =>
      this.resolve(definition, phases),
    );
    return {
      generatedAt: report.generatedAt,
      source: 'backend-live' as const,
      operationSafety: report.operationSafety,
      summary: {
        total: items.length,
        passed: items.filter((item) => item.overallState === 'passed').length,
        partial: items.filter((item) => item.overallState === 'partial').length,
        backendOnly: items.filter((item) => item.overallState === 'backend')
          .length,
        missing: items.filter((item) => item.overallState === 'missing').length,
      },
      items,
    };
  }

  private resolve(
    definition: CapabilityDefinition,
    phases: Map<number, AgentRoadmapPhase>,
  ): PlatformCapability {
    const {
      backendConnected,
      inheritPhaseBlockers,
      localBlockers,
      localEvidence,
      agentStateOverride,
      ...publicDefinition
    } = definition;
    const related = definition.agentPhaseIds
      .map((id) => phases.get(id))
      .filter((phase): phase is AgentRoadmapPhase => Boolean(phase));
    const backendState =
      backendConnected === false ? 'not_connected' : 'connected';
    const agentState =
      agentStateOverride ?? this.weakest(related.map((phase) => phase.status));
    const overallState: AgentRoadmapStatus =
      backendState === 'not_connected' ? 'missing' : agentState;
    return {
      ...publicDefinition,
      frontendState: 'connected',
      backendState,
      agentState,
      overallState,
      evidence: [
        ...(localEvidence ?? []),
        ...related.flatMap((phase) => phase.evidence.slice(0, 2)),
      ].slice(0, 6),
      blockers: [
        ...(backendState === 'not_connected'
          ? ['后端真实业务接口尚未接入']
          : []),
        ...(localBlockers ?? []),
        ...(inheritPhaseBlockers === false
          ? []
          : related.flatMap((phase) => phase.blockers).slice(0, 6)),
      ],
    };
  }

  private weakest(statuses: AgentRoadmapStatus[]): AgentRoadmapStatus {
    if (statuses.length === 0) return 'backend';
    const rank: Record<AgentRoadmapStatus, number> = {
      passed: 3,
      partial: 2,
      backend: 1,
      missing: 0,
    };
    return statuses.reduce(
      (current, status) => (rank[status] < rank[current] ? status : current),
      'passed',
    );
  }
}
