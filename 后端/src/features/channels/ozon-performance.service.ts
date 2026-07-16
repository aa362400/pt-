import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import { OzonCredentialsService } from './ozon-credentials.service.js';
import { OzonPerformanceApiClient } from './ozon-performance-api.client.js';
import type {
  ConnectOzonPerformanceDto,
  OzonPerformanceOverviewQueryDto,
  RequestOzonCampaignActionDto,
} from './channels.dto.js';

@Injectable()
export class OzonPerformanceService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly credentials: OzonCredentialsService,
    private readonly client: OzonPerformanceApiClient,
    private readonly actionProposals: ActionProposalsService,
  ) {}

  async connect(user: JwtPayload, dto: ConnectOzonPerformanceDto) {
    const organizationId = requireOrg(user);
    const workspace = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.workspace.findFirst({
        where: { id: dto.workspaceId, organizationId },
        select: { id: true },
      }),
    );
    if (!workspace) throw new NotFoundException('工作区不存在');

    const performanceCredentials = {
      clientId: dto.clientId.trim(),
      clientSecret: dto.clientSecret.trim(),
    };
    const verification = await this.client.verifyCredentials(
      performanceCredentials,
    );
    const encoded = await this.credentials.encodePerformance(
      performanceCredentials,
    );
    const channel = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.upsert({
        where: {
          workspaceId_provider: {
            workspaceId: workspace.id,
            provider: 'OZON_PERFORMANCE',
          },
        },
        create: {
          workspaceId: workspace.id,
          provider: 'OZON_PERFORMANCE',
          externalShopId: performanceCredentials.clientId,
          accessTokenEncrypted: encoded,
          syncStatus: 'SUCCESS',
          lastSyncedAt: new Date(),
        },
        update: {
          externalShopId: performanceCredentials.clientId,
          accessTokenEncrypted: encoded,
          syncStatus: 'SUCCESS',
          lastSyncedAt: new Date(),
        },
      }),
    );
    return {
      channel: this.safeChannel(channel),
      verification,
      credentials: this.credentials.maskPerformance(performanceCredentials),
      docs: 'https://docs.ozon.ru/api/performance/',
      guardrails: {
        readsAutomatic: true,
        writesRequireHumanConfirmation: true,
      },
    };
  }

  async overview(user: JwtPayload, query: OzonPerformanceOverviewQueryDto) {
    const organizationId = requireOrg(user);
    const channel = await this.findPerformanceChannel(
      organizationId,
      query.workspaceId,
    );
    if (!channel) {
      return {
        connected: false,
        source: 'Ozon Performance API',
        docs: 'https://docs.ozon.ru/api/performance/',
        fetchedAt: new Date().toISOString(),
        campaigns: [],
        dailyStatistics: [],
        summary: {
          campaigns: 0,
          running: 0,
          spend: null,
          orders: null,
          revenue: null,
        },
        reason:
          '尚未配置独立的 Ozon Performance client_id/client_secret。Seller API Key 不能替代广告凭证。',
      };
    }
    const credentials = await this.credentials.decodePerformance(
      channel.accessTokenEncrypted,
    );
    const campaigns = await this.client.listCampaigns(credentials);
    let statistics: Array<Record<string, unknown>> = [];
    let statisticsError: string | null = null;
    try {
      statistics = await this.client.getDailyStatistics(credentials, {
        campaignIds: campaigns.slice(0, 10).map((item) => item.id),
        dateFrom: this.dateOnly(query.dateFrom),
        dateTo: this.dateOnly(query.dateTo),
      });
    } catch (error) {
      statisticsError = this.errorMessage(error);
    }

    return {
      connected: true,
      source: 'Ozon Performance API',
      docs: 'https://docs.ozon.ru/api/performance/',
      fetchedAt: new Date().toISOString(),
      channel: this.safeChannel(channel),
      campaigns,
      dailyStatistics: statistics,
      summary: {
        campaigns: campaigns.length,
        running: campaigns.filter(
          (item) => item.state === 'CAMPAIGN_STATE_RUNNING',
        ).length,
        spend: this.sumMetric(statistics, ['moneySpent', 'expense', 'spend']),
        orders: this.sumMetric(statistics, ['orders', 'ordersCount']),
        revenue: this.sumMetric(statistics, ['revenue', 'sales']),
      },
      statisticsError,
      guardrails: {
        readsAutomatic: true,
        writesRequireHumanConfirmation: true,
        directAutomaticMutation: false,
      },
    };
  }

  async requestCampaignAction(
    user: JwtPayload,
    campaignId: string,
    dto: RequestOzonCampaignActionDto,
  ) {
    const organizationId = requireOrg(user);
    const channel = await this.findOwnedPerformanceChannel(
      organizationId,
      dto.channelId,
    );
    if (
      dto.action === 'UPDATE_WEEKLY_BUDGET' &&
      dto.weeklyBudgetRub === undefined
    ) {
      throw new BadRequestException('修改周预算必须提供 weeklyBudgetRub');
    }
    const actionName =
      dto.action === 'ACTIVATE'
        ? 'ozon.ads.activate'
        : dto.action === 'DEACTIVATE'
          ? 'ozon.ads.deactivate'
          : 'ozon.ads.weekly_budget.update';
    const { notification } = await this.actionProposals.create({
      organizationId,
      requestedBy: user.sub,
      approverId: user.sub,
      source: 'ozon_performance',
      action: {
        label: 'Execute',
        name: actionName,
        params: {
          channelId: channel.id,
          workspaceId: channel.workspaceId,
          campaignId,
          ...(dto.weeklyBudgetRub !== undefined
            ? { weeklyBudgetRub: dto.weeklyBudgetRub }
            : {}),
        },
      },
      type: 'APPROVAL_REQUIRED',
      title: `请确认 Ozon 广告动作：${dto.action}`,
      body:
        `广告计划 ${campaignId} 的变更已被拦截。` +
        '只有在通知中心选择“执行”后才会写入 Ozon Performance API。',
      context: {
        kind: 'high_risk_action_review',
        source: 'ozon_performance',
        provider: 'OZON_PERFORMANCE',
        riskLevel: 'high',
        requiresConfirmation: true,
        externalStoreMutation: 'blocked_until_human_confirmation',
        action: {
          label: '执行',
          action: actionName,
          params: {
            channelId: channel.id,
            workspaceId: channel.workspaceId,
            campaignId,
            ...(dto.weeklyBudgetRub !== undefined
              ? { weeklyBudgetRub: dto.weeklyBudgetRub }
              : {}),
          },
        },
        execution: { status: 'pending_confirmation' },
        guardrails: [
          '广告投放与预算变更禁止自动执行',
          '通知中心明确确认后才能调用 Ozon Performance API',
        ],
      },
    });
    return {
      status: 'pending_human_confirmation',
      notificationId: notification.id,
      action: actionName,
      campaignId,
    };
  }

  private async findPerformanceChannel(
    organizationId: string,
    workspaceId?: string,
  ) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          provider: 'OZON_PERFORMANCE',
          syncStatus: { not: 'DISCONNECTED' },
          workspace: { organizationId },
          ...(workspaceId ? { workspaceId } : {}),
        },
        orderBy: { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
      }),
    );
  }

  private async findOwnedPerformanceChannel(
    organizationId: string,
    channelId: string,
  ) {
    const channel = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          id: channelId,
          provider: 'OZON_PERFORMANCE',
          workspace: { organizationId },
        },
      }),
    );
    if (!channel) throw new NotFoundException('Ozon 广告连接不存在');
    return channel;
  }

  private safeChannel(channel: {
    id: string;
    workspaceId: string;
    externalShopId: string | null;
    syncStatus: string;
    lastSyncedAt: Date | null;
  }) {
    return {
      id: channel.id,
      workspaceId: channel.workspaceId,
      externalShopId: channel.externalShopId,
      syncStatus: channel.syncStatus,
      lastSyncedAt: channel.lastSyncedAt,
    };
  }

  private dateOnly(value?: string) {
    return value ? value.slice(0, 10) : undefined;
  }

  private sumMetric(rows: Array<Record<string, unknown>>, keys: string[]) {
    let found = false;
    const total = rows.reduce((sum, row) => {
      for (const key of keys) {
        const value = this.number(row[key]);
        if (value !== undefined) {
          found = true;
          return sum + value;
        }
      }
      return sum;
    }, 0);
    return found ? Math.round(total * 100) / 100 : null;
  }

  private number(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
