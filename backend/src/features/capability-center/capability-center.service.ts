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
  category: 'text' | 'product' | 'text' | 'store' | 'Agent' | 'text';
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
    label: 'CEO Agent text AI team',
    category: 'Agent',
    summary: 'text CEO Agent english_text Agent text。',
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
    label: 'AI Agent text',
    category: 'Agent',
    summary: 'text Agent text、task、english_text 1-20 stageacceptance。',
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
    label: 'productenglish_text',
    category: 'product',
    summary: 'readlocal/Ozon product，textpassedenglish_textproduct。',
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
    label: 'orderssyncenglish_text',
    category: 'store',
    summary: 'syncenglish_text Ozon orders；english_texthumantext。',
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
    label: 'english_text SEO',
    category: 'text',
    summary: 'generation、english_textreview Listing text，publishenglish_text。',
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
    label: 'english_textimage',
    category: 'text',
    summary: 'textimageenglish_textrealgenerationtext，publishenglish_textvisualreview。',
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
    label: 'humanreviewtext',
    category: 'text',
    summary: 'textevidence、text、text、english_textpublish。',
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
    label: 'automatictextflow',
    category: 'text',
    summary: 'text Agent automatictext、english_text、english_text。',
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
    label: 'platformconnectionenglish_text',
    category: 'store',
    summary: 'connection Ozon、syncproductordersenglish_textevidence。',
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
    label: 'Ozon datatext',
    category: 'text',
    summary: 'textrealsyncproduct、orders、profitenglish_textdata。',
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
    label: 'teamenglish_text',
    category: 'text',
    summary: 'english_text、text、english_textsecuritytext。',
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
    label: 'customertext',
    category: 'store',
    summary: 'read Ozon english_text、productenglish_text；textyesreplytexthumantext。',
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
      'productenglish_text Ozon Premium Plus；english_text“english_text”english_text Premium Pro',
      'english_textreplytextyestextrealapprovaltextsuccessenglish_textevidenceenglish_textpassed',
    ],
  },
  {
    id: 'marketing',
    label: 'english_text',
    category: 'text',
    summary:
      'textconnection Ozon Performance API，readenglish_text，english_texthumantext。',
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
      'textconfigurationtext Ozon Performance client_id/client_secret textcompletedrealtextacceptance',
      'english_textyestextrealapprovaltextsuccessenglish_textevidenceenglish_textpassed',
    ],
  },
  {
    id: 'product-research',
    label: 'textproduct research',
    category: 'product',
    summary: 'realevidencetext、english_texthumanapproval。',
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
    label: 'english_text',
    category: 'text',
    summary: 'readtextsourceenglish_textevidence。',
    frontendPath: '/trend-radar',
    backendEndpoints: ['GET /trends', 'POST /trends/analyze'],
    agentPhaseIds: [3, 7, 9, 12, 14],
    risk: 'read_only',
  },
  {
    id: 'keywords',
    label: 'keywordstext',
    category: 'text',
    summary: 'textkeywordsenglish_textrealreporttext。',
    frontendPath: '/keyword-analysis',
    backendEndpoints: ['GET /keywords', 'POST /keywords'],
    agentPhaseIds: [3, 9, 10, 11, 12],
    risk: 'local_write',
  },
  {
    id: 'profit',
    label: 'profitenglish_text',
    category: 'product',
    summary: 'textrealcostfieldstextprofittext ROI text。',
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
    label: 'Ozon pricing',
    category: 'product',
    summary: 'english_textpricetextcategorycommission、ZTO english_textcostenglish_textpricing。',
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
    label: 'english_text',
    category: 'text',
    summary: 'text Ozon syncdataenglish_text。',
    frontendPath: '/competition',
    backendEndpoints: ['GET /products', 'GET /channels/orders'],
    agentPhaseIds: [7, 9, 12],
    risk: 'read_only',
  },
  {
    id: 'mcp',
    label: 'MCP text',
    category: 'Agent',
    summary: 'english_textconfiguration MCP text，english_text。',
    frontendPath: '/mcp-tools',
    backendEndpoints: ['GET /agent-proxy/actions', 'POST /agent-proxy/console'],
    agentPhaseIds: [2, 3, 10, 16, 17],
    risk: 'human_confirmation',
  },
  {
    id: 'audit',
    label: 'english_text',
    category: 'text',
    summary: 'textaudit record、failedenglish_text。',
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
    label: 'english_text',
    category: 'text',
    summary: 'textrealtext、english_text。',
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
    label: 'supply chaintext',
    category: 'product',
    summary: 'english_text、SKU english_text、english_texthumanenglish_text。',
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
          ? ['backendrealtextAPIenglish_text']
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
