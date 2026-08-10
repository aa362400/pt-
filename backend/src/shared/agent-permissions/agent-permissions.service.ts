import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

export enum AgentPermissionLevel {
  READ_ONLY = 1, // Analysis only
  DRAFT = 2, // Generate drafts, no publishing
  MODIFY = 3, // Modify business data + post-report
  PUBLISH = 4, // Publish / paid actions + human confirm required
}

export interface AgentAction {
  name: string;
  permissionLevel: AgentPermissionLevel;
  description: string;
}

@Injectable()
export class AgentPermissionsService {
  private readonly logger = new Logger(AgentPermissionsService.name);

  // Define allowed actions for the agent
  private readonly ACTION_REGISTRY: Record<string, AgentAction> = {
    'profit.analyze': {
      name: 'profit.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'Analyze product margin and profit',
    },
    'temu.price_check': {
      name: 'temu.price_check',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '调用 TEMU 影子核价 MCP，预测核价率、毛利空间和风险项',
    },
    'temu.pricing.calculate': {
      name: 'temu.pricing.calculate',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'TEMU 核价、保本价、目标利润和申报价反推',
    },
    'ozon.pricing.calculate': {
      name: 'ozon.pricing.calculate',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description:
        '依据已导入售价表计算 Ozon 目标售价、物流、佣金和包裹合规状态',
    },
    'commerce.profit.calculate': {
      name: 'commerce.profit.calculate',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '调用跨境 MCP 计算利润、利润率、保本价和建议售价',
    },
    'commerce.keywords.analyze': {
      name: 'commerce.keywords.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '调用跨境 MCP 生成结构化关键词建议',
    },
    'commerce.image_prompts.generate': {
      name: 'commerce.image_prompts.generate',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: '生成 1-9 张上架图 Prompt 草稿和产品锁定规则',
    },
    'commerce.csv.export': {
      name: 'commerce.csv.export',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: '把结构化 Listing 数据导出为本地 UTF-8 CSV 文件',
    },
    'commerce.risk.check': {
      name: 'commerce.risk.check',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '检查标题、描述和标签中的侵权及平台风险词',
    },
    'amazon.title.optimize': {
      name: 'amazon.title.optimize',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: '压缩 Amazon 标题并生成 Item Highlights 草稿',
    },
    'listing.quality.score': {
      name: 'listing.quality.score',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '基于利润、风险、证据和内容完整度执行 Listing 质量门禁',
    },
    'notification.suggest': {
      name: 'notification.suggest',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: 'Create proactive agent suggestion notifications',
    },
    'task.schedule': {
      name: 'task.schedule',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: 'Schedule an accepted agent suggestion',
    },
    'operator.prepare_listing_batch': {
      name: 'operator.prepare_listing_batch',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: 'Prepare a product batch for listing review',
    },
    'linkfoxskill.version': {
      name: 'linkfoxskill.version',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '读取 LinkfoxSkill CLI 版本',
    },
    'linkfoxskill.agentlist': {
      name: 'linkfoxskill.agentlist',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '读取 LinkfoxSkill 支持的 Agent 列表',
    },
    'linkfoxskill.search': {
      name: 'linkfoxskill.search',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '搜索 LinkFox 电商技能市场',
    },
    'linkfoxskill.install': {
      name: 'linkfoxskill.install',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '安装 LinkFox 技能到本地 Agent，必须人工确认',
    },
    'linkfoxskill.update': {
      name: 'linkfoxskill.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '更新本地 LinkFox 技能，必须人工确认',
    },
    'product.research': {
      name: 'product.research',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '产品调研分析',
    },
    'keyword.analyze': {
      name: 'keyword.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '关键词分析',
    },
    'trend.analyze': {
      name: 'trend.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: '趋势分析',
    },
    'listing.draft': {
      name: 'listing.draft',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: '生成 Listing 草稿',
    },
    'image.generate': {
      name: 'image.generate',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: '生成图片',
    },
    'product.update': {
      name: 'product.update',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: '修改产品信息',
    },
    'store.product.update': {
      name: 'store.product.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '修改真实店铺商品',
    },
    'task.create': {
      name: 'task.create',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: '创建任务',
    },
    'listing.publish': {
      name: 'listing.publish',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '发布 Listing',
    },
    'order.process': {
      name: 'order.process',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '处理订单',
    },
    'order.refund': {
      name: 'order.refund',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '处理订单退款',
    },
    'price.adjust': {
      name: 'price.adjust',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '调整真实店铺价格',
    },
    'ads.campaign.update': {
      name: 'ads.campaign.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '调整广告投放',
    },
    'payment.execute': {
      name: 'payment.execute',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '执行付费操作',
    },
    'ozon.product.update': {
      name: 'ozon.product.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '修改 Ozon 真实店铺商品',
    },
    'ozon.listing.publish': {
      name: 'ozon.listing.publish',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '发布 Listing 到 Ozon',
    },
    'ozon.price.update': {
      name: 'ozon.price.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '调整 Ozon 真实店铺价格',
    },
    'ozon.stock.update': {
      name: 'ozon.stock.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '调整 Ozon 真实店铺库存',
    },
    'ozon.order.refund': {
      name: 'ozon.order.refund',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '处理 Ozon 订单退款',
    },
    'ozon.ads.update': {
      name: 'ozon.ads.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '调整 Ozon 广告投放',
    },
    'ozon.chat.send_message': {
      name: 'ozon.chat.send_message',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '发送 Ozon 买家消息',
    },
    'ozon.question.answer': {
      name: 'ozon.question.answer',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '回答 Ozon 商品问题',
    },
    'ozon.review.comment': {
      name: 'ozon.review.comment',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '回复 Ozon 商品评价',
    },
    'ozon.ads.activate': {
      name: 'ozon.ads.activate',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '启用 Ozon 广告计划',
    },
    'ozon.ads.deactivate': {
      name: 'ozon.ads.deactivate',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '停用 Ozon 广告计划',
    },
    'ozon.ads.weekly_budget.update': {
      name: 'ozon.ads.weekly_budget.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: '修改 Ozon 广告周预算',
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  /** Check if agent is allowed to perform an action for a given org */
  async check(
    orgId: string,
    actionName: string,
  ): Promise<{
    allowed: boolean;
    level: AgentPermissionLevel;
    requireConfirm: boolean;
  }> {
    const action = this.ACTION_REGISTRY[actionName];
    if (!action)
      return {
        allowed: false,
        level: AgentPermissionLevel.READ_ONLY,
        requireConfirm: false,
      };

    const killSwitch = await this.prisma.featureFlag.findUnique({
      where: { name: `agent-paused-${orgId}` },
      select: { enabled: true },
    });
    if (killSwitch?.enabled) {
      return {
        allowed: false,
        level: AgentPermissionLevel.READ_ONLY,
        requireConfirm: false,
      };
    }

    // Check org-level feature flag
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    if (!org)
      return {
        allowed: false,
        level: AgentPermissionLevel.READ_ONLY,
        requireConfirm: false,
      };

    // FREE plan: only READ_ONLY allowed
    if (
      org.plan === 'FREE' &&
      action.permissionLevel > AgentPermissionLevel.READ_ONLY &&
      !this.isLocalAgentManagementAction(actionName)
    ) {
      return {
        allowed: false,
        level: AgentPermissionLevel.READ_ONLY,
        requireConfirm: false,
      };
    }

    // Publish and paid operations always require human confirmation.
    const requireConfirm =
      action.permissionLevel >= AgentPermissionLevel.PUBLISH ||
      this.isHardConfirmationAction(actionName);

    return { allowed: true, level: action.permissionLevel, requireConfirm };
  }

  private isHardConfirmationAction(actionName: string): boolean {
    if (actionName === 'ozon.pricing.calculate') {
      return false;
    }
    return (
      actionName === 'listing.publish' ||
      actionName === 'store.product.update' ||
      actionName === 'price.adjust' ||
      actionName === 'order.refund' ||
      actionName === 'payment.execute' ||
      actionName.endsWith('.publish') ||
      actionName.startsWith('ads.') ||
      actionName.startsWith('order.') ||
      actionName.startsWith('price.') ||
      actionName.startsWith('payment.') ||
      actionName.startsWith('ozon.') ||
      actionName === 'linkfoxskill.install' ||
      actionName === 'linkfoxskill.update'
    );
  }

  private isLocalAgentManagementAction(actionName: string): boolean {
    return (
      actionName === 'linkfoxskill.install' ||
      actionName === 'linkfoxskill.update'
    );
  }

  /** List all available actions with their permission levels */
  listActions(): AgentAction[] {
    return Object.values(this.ACTION_REGISTRY);
  }

  /** Allowlist of orgIds where agent autonomy is enabled */
  async isAutonomyEnabled(orgId: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { name: 'agent-autonomy' },
    });
    if (!flag || !flag.enabled) return false;
    return flag.orgIds.length === 0 || flag.orgIds.includes(orgId);
  }
}
