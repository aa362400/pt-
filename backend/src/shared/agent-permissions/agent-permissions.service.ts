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
      description: 'text TEMU textpricing MCP，textpricingtext、gross profitenglish_textrisktext',
    },
    'temu.pricing.calculate': {
      name: 'temu.pricing.calculate',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'TEMU pricing、english_text、textprofitenglish_text',
    },
    'ozon.pricing.calculate': {
      name: 'ozon.pricing.calculate',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description:
        'english_textpriceenglish_text Ozon textprice、text、commissiontextparcel compliancestatus',
    },
    'commerce.profit.calculate': {
      name: 'commerce.profit.calculate',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'english_text MCP textprofit、profittext、english_textprice',
    },
    'commerce.keywords.analyze': {
      name: 'commerce.keywords.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'english_text MCP generationenglish_textkeywordstext',
    },
    'commerce.image_prompts.generate': {
      name: 'commerce.image_prompts.generate',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: 'generation 1-9 textlistingtext Prompt english_text',
    },
    'commerce.csv.export': {
      name: 'commerce.csv.export',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: 'english_text Listing dataenglish_textlocal UTF-8 CSV file',
    },
    'commerce.risk.check': {
      name: 'commerce.risk.check',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'texttitle、english_textplatformrisktext',
    },
    'amazon.title.optimize': {
      name: 'amazon.title.optimize',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: 'text Amazon titletextgeneration Item Highlights text',
    },
    'listing.quality.score': {
      name: 'listing.quality.score',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'textprofit、risk、evidenceenglish_text Listing english_text',
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
      description: 'read LinkfoxSkill CLI text',
    },
    'linkfoxskill.agentlist': {
      name: 'linkfoxskill.agentlist',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'read LinkfoxSkill english_text Agent text',
    },
    'linkfoxskill.search': {
      name: 'linkfoxskill.search',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'search LinkFox e-commerceenglish_text',
    },
    'linkfoxskill.install': {
      name: 'linkfoxskill.install',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text LinkFox english_textlocal Agent，texthumantext',
    },
    'linkfoxskill.update': {
      name: 'linkfoxskill.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'textlocal LinkFox text，texthumantext',
    },
    'product.research': {
      name: 'product.research',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'english_text',
    },
    'keyword.analyze': {
      name: 'keyword.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'keywordstext',
    },
    'trend.analyze': {
      name: 'trend.analyze',
      permissionLevel: AgentPermissionLevel.READ_ONLY,
      description: 'english_text',
    },
    'listing.draft': {
      name: 'listing.draft',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: 'generation Listing text',
    },
    'image.generate': {
      name: 'image.generate',
      permissionLevel: AgentPermissionLevel.DRAFT,
      description: 'generationimage',
    },
    'product.update': {
      name: 'product.update',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: 'english_text',
    },
    'store.product.update': {
      name: 'store.product.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'textrealstoreproduct',
    },
    'task.create': {
      name: 'task.create',
      permissionLevel: AgentPermissionLevel.MODIFY,
      description: 'texttask',
    },
    'listing.publish': {
      name: 'listing.publish',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'publish Listing',
    },
    'order.process': {
      name: 'order.process',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'textorders',
    },
    'order.refund': {
      name: 'order.refund',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'textorderstext',
    },
    'price.adjust': {
      name: 'price.adjust',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'textrealstoretext',
    },
    'ads.campaign.update': {
      name: 'ads.campaign.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'english_text',
    },
    'payment.execute': {
      name: 'payment.execute',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'english_text',
    },
    'ozon.product.update': {
      name: 'ozon.product.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon realstoreproduct',
    },
    'ozon.listing.publish': {
      name: 'ozon.listing.publish',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'publish Listing text Ozon',
    },
    'ozon.price.update': {
      name: 'ozon.price.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon realstoretext',
    },
    'ozon.stock.update': {
      name: 'ozon.stock.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon realstoretext',
    },
    'ozon.order.refund': {
      name: 'ozon.order.refund',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon orderstext',
    },
    'ozon.ads.update': {
      name: 'ozon.ads.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon english_text',
    },
    'ozon.chat.send_message': {
      name: 'ozon.chat.send_message',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon textmessage',
    },
    'ozon.question.answer': {
      name: 'ozon.question.answer',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon producttext',
    },
    'ozon.review.comment': {
      name: 'ozon.review.comment',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'reply Ozon producttext',
    },
    'ozon.ads.activate': {
      name: 'ozon.ads.activate',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon english_text',
    },
    'ozon.ads.deactivate': {
      name: 'ozon.ads.deactivate',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon english_text',
    },
    'ozon.ads.weekly_budget.update': {
      name: 'ozon.ads.weekly_budget.update',
      permissionLevel: AgentPermissionLevel.PUBLISH,
      description: 'text Ozon english_text',
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
