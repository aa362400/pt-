import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OzonPerformanceCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OzonPerformanceCampaign {
  id: string;
  title: string;
  state: string;
  paymentType?: string;
  budget?: number;
  dailyBudget?: number;
  weeklyBudget?: number;
  raw: Record<string, unknown>;
}

@Injectable()
export class OzonPerformanceApiClient {
  constructor(private readonly configService: ConfigService) {}

  async verifyCredentials(credentials: OzonPerformanceCredentials) {
    const token = await this.getAccessToken(credentials);
    const campaigns = await this.listCampaignsWithToken(token, {
      page: 1,
      pageSize: 1,
    });
    return {
      ok: true,
      expiresIn: token.expiresIn,
      campaignSampleCount: campaigns.length,
    };
  }

  async listCampaigns(
    credentials: OzonPerformanceCredentials,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<OzonPerformanceCampaign[]> {
    const token = await this.getAccessToken(credentials);
    return this.listCampaignsWithToken(token, options);
  }

  async getDailyStatistics(
    credentials: OzonPerformanceCredentials,
    options: {
      campaignIds?: string[];
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<Array<Record<string, unknown>>> {
    const token = await this.getAccessToken(credentials);
    const query = new URLSearchParams();
    for (const campaignId of options.campaignIds ?? []) {
      query.append('campaignIds', campaignId);
    }
    if (options.dateFrom) query.set('dateFrom', options.dateFrom);
    if (options.dateTo) query.set('dateTo', options.dateTo);
    const response = await this.request<unknown>(
      `/api/client/statistics/daily/json${query.size ? `?${query}` : ''}`,
      { method: 'GET' },
      token.accessToken,
    );
    if (Array.isArray(response)) {
      return response.map((item) => this.asRecord(item));
    }
    const record = this.asRecord(response);
    const rows = record.rows ?? record.list ?? record.items;
    return Array.isArray(rows)
      ? rows.map((item) => this.asRecord(item))
      : [record].filter((item) => Object.keys(item).length > 0);
  }

  async activateCampaign(
    credentials: OzonPerformanceCredentials,
    campaignId: string,
  ) {
    return this.mutateCampaign(credentials, campaignId, 'activate', {});
  }

  async deactivateCampaign(
    credentials: OzonPerformanceCredentials,
    campaignId: string,
  ) {
    return this.mutateCampaign(credentials, campaignId, 'deactivate', {});
  }

  async updateCampaignBudget(
    credentials: OzonPerformanceCredentials,
    campaignId: string,
    weeklyBudgetRub: number,
  ) {
    if (!Number.isFinite(weeklyBudgetRub) || weeklyBudgetRub < 0) {
      throw new BadRequestException(
        'Ozon campaign weekly budget must be a non-negative RUB amount',
      );
    }
    const token = await this.getAccessToken(credentials);
    return this.request<Record<string, unknown>>(
      `/api/client/campaign/${encodeURIComponent(campaignId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          weeklyBudget: String(Math.round(weeklyBudgetRub * 1_000_000)),
        }),
      },
      token.accessToken,
    );
  }

  private async mutateCampaign(
    credentials: OzonPerformanceCredentials,
    campaignId: string,
    action: 'activate' | 'deactivate',
    body: Record<string, unknown>,
  ) {
    const token = await this.getAccessToken(credentials);
    return this.request<Record<string, unknown>>(
      `/api/client/campaign/${encodeURIComponent(campaignId)}/${action}`,
      { method: 'POST', body: JSON.stringify(body) },
      token.accessToken,
    );
  }

  private async listCampaignsWithToken(
    token: { accessToken: string; expiresIn: number },
    options: { page?: number; pageSize?: number },
  ) {
    const query = new URLSearchParams({
      page: String(Math.max(options.page ?? 1, 1)),
      pageSize: String(Math.min(Math.max(options.pageSize ?? 100, 1), 100)),
    });
    const response = await this.request<Record<string, unknown>>(
      `/api/client/campaign?${query}`,
      { method: 'GET' },
      token.accessToken,
    );
    return this.asArray(response.list).map((item) =>
      this.mapCampaign(this.asRecord(item)),
    );
  }

  private async getAccessToken(credentials: OzonPerformanceCredentials) {
    const response = await this.request<Record<string, unknown>>(
      '/api/client/token',
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: 'client_credentials',
        }),
      },
    );
    const accessToken = this.asOptionalString(response.access_token);
    if (!accessToken) {
      throw new BadRequestException(
        'Ozon Performance API did not return an access token',
      );
    }
    return {
      accessToken,
      expiresIn: this.asNumber(response.expires_in) ?? 0,
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    bearerToken?: string,
  ): Promise<T> {
    const baseUrl = this.configService
      .get<string>(
        'OZON_PERFORMANCE_API_BASE_URL',
        'https://api-performance.ozon.ru',
      )
      .replace(/\/+$/, '');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Ozon Performance API is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      parsed = { message: text.slice(0, 500) };
    }
    if (!response.ok) {
      const body = this.asRecord(parsed);
      throw new BadRequestException({
        message: `Ozon Performance API rejected request (${response.status})`,
        details: {
          code: this.asOptionalString(body.code),
          message:
            this.asOptionalString(body.message) ??
            this.asOptionalString(body.error),
        },
      });
    }
    return parsed as T;
  }

  private mapCampaign(item: Record<string, unknown>): OzonPerformanceCampaign {
    return {
      id: this.asOptionalString(item.id) ?? '',
      title: this.asOptionalString(item.title) ?? '未命名广告计划',
      state: this.asOptionalString(item.state) ?? 'CAMPAIGN_STATE_UNKNOWN',
      paymentType: this.asOptionalString(item.paymentType),
      budget: this.microRubles(item.budget),
      dailyBudget: this.microRubles(item.dailyBudget),
      weeklyBudget: this.microRubles(item.weeklyBudget),
      raw: item,
    };
  }

  private microRubles(value: unknown) {
    const numeric = this.asNumber(value);
    return numeric === undefined ? undefined : numeric / 1_000_000;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    return undefined;
  }
}
