import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AgentConnectionState = 'connected' | 'unavailable' | 'unconfigured';

export interface AgentHealthSnapshot {
  connection: AgentConnectionState;
  integration: 'enabled' | 'disabled' | 'unknown';
  mockMode: boolean | null;
  checkedAt: string;
  latencyMs: number | null;
  llm: {
    status:
      'available' | 'degraded' | 'quota_exhausted' | 'unavailable' | 'unknown';
    model: string | null;
    keyRole: string | null;
    fallbackActive: boolean;
    lastSuccessAt?: string | null;
    lastFailureAt?: string | null;
    lastErrorCode?: string | null;
  };
}

export type AiChannelState =
  | 'available'
  | 'degraded'
  | 'quota_exhausted'
  | 'unavailable'
  | 'unconfigured'
  | 'unknown';

export interface AiChannelSnapshot {
  status: AiChannelState;
  provider: string | null;
  model?: string | null;
  errorCode: string | null;
  message: string | null;
  latencyMs: number | null;
}

export interface AgentChannelHealthSnapshot {
  agentConnection: AgentConnectionState;
  overall: 'available' | 'degraded' | 'unavailable';
  checkedAt: string;
  cacheTtlSeconds: number;
  errorCode: string | null;
  llm: AiChannelSnapshot;
  image: AiChannelSnapshot;
  search: AiChannelSnapshot;
}

@Injectable()
export class AgentHealthService {
  constructor(private readonly configService: ConfigService) {}

  async getSnapshot(): Promise<AgentHealthSnapshot> {
    const baseUrl = (
      this.configService.get<string>('AGENT_BASE_URL') ?? ''
    ).replace(/\/+$/, '');
    const apiKey = this.configService.get<string>('AGENT_API_KEY') ?? '';
    const checkedAt = new Date().toISOString();
    if (!baseUrl || !apiKey) {
      return this.fallback('unconfigured', checkedAt);
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/agent/health`, {
        headers: { 'X-Api-Key': apiKey },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return this.fallback('unavailable', checkedAt, Date.now() - startedAt);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const llm = this.asRecord(payload.llm);
      return {
        connection: 'connected',
        integration: payload.integration === 'enabled' ? 'enabled' : 'unknown',
        mockMode:
          typeof payload.mockMode === 'boolean' ? payload.mockMode : null,
        checkedAt,
        latencyMs: Date.now() - startedAt,
        llm: {
          status: this.asLlmStatus(llm.status),
          model: this.asOptionalString(llm.model) ?? null,
          keyRole: this.asOptionalString(llm.keyRole) ?? null,
          fallbackActive: llm.fallbackActive === true,
          lastSuccessAt: this.asOptionalString(llm.lastSuccessAt) ?? null,
          lastFailureAt: this.asOptionalString(llm.lastFailureAt) ?? null,
          lastErrorCode: this.asOptionalString(llm.lastErrorCode) ?? null,
        },
      };
    } catch {
      return this.fallback('unavailable', checkedAt, Date.now() - startedAt);
    }
  }

  async getChannelHealth(): Promise<AgentChannelHealthSnapshot> {
    const baseUrl = (
      this.configService.get<string>('AGENT_BASE_URL') ?? ''
    ).replace(/\/+$/, '');
    const apiKey = this.configService.get<string>('AGENT_API_KEY') ?? '';
    const checkedAt = new Date().toISOString();
    if (!baseUrl || !apiKey) {
      return this.channelFallback('unconfigured', checkedAt);
    }

    try {
      const response = await fetch(`${baseUrl}/api/v1/agent/health/channels`, {
        headers: { 'X-Api-Key': apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return this.channelFallback('unavailable', checkedAt);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      return {
        agentConnection: 'connected',
        overall: this.asOverallStatus(payload.overall),
        checkedAt: this.asOptionalString(payload.checkedAt) ?? checkedAt,
        cacheTtlSeconds:
          typeof payload.cacheTtlSeconds === 'number' &&
          Number.isFinite(payload.cacheTtlSeconds)
            ? Math.max(300, Math.trunc(payload.cacheTtlSeconds))
            : 300,
        errorCode: null,
        llm: this.asChannelSnapshot(payload.llm),
        image: this.asChannelSnapshot(payload.image),
        search: this.asChannelSnapshot(payload.search),
      };
    } catch {
      return this.channelFallback('unavailable', checkedAt);
    }
  }

  private fallback(
    connection: Extract<AgentConnectionState, 'unavailable' | 'unconfigured'>,
    checkedAt: string,
    latencyMs: number | null = null,
  ): AgentHealthSnapshot {
    return {
      connection,
      integration: connection === 'unconfigured' ? 'disabled' : 'unknown',
      mockMode: null,
      checkedAt,
      latencyMs,
      llm: {
        status: connection === 'unconfigured' ? 'unknown' : 'unavailable',
        model: null,
        keyRole: null,
        fallbackActive: false,
      },
    };
  }

  private channelFallback(
    connection: Extract<AgentConnectionState, 'unavailable' | 'unconfigured'>,
    checkedAt: string,
  ): AgentChannelHealthSnapshot {
    const channel: AiChannelSnapshot = {
      status: 'unknown',
      provider: null,
      errorCode: null,
      message:
        connection === 'unconfigured'
          ? 'Agent 通道尚未配置。'
          : 'Agent 运行时当前不可连接。',
      latencyMs: null,
    };
    return {
      agentConnection: connection,
      overall: 'unavailable',
      checkedAt,
      cacheTtlSeconds: 300,
      errorCode:
        connection === 'unconfigured'
          ? 'AGENT_RUNTIME_UNCONFIGURED'
          : 'AGENT_RUNTIME_UNAVAILABLE',
      llm: { ...channel },
      image: { ...channel },
      search: { ...channel },
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asLlmStatus(value: unknown): AgentHealthSnapshot['llm']['status'] {
    return value === 'available' ||
      value === 'degraded' ||
      value === 'quota_exhausted' ||
      value === 'unavailable'
      ? value
      : 'unknown';
  }

  private asOverallStatus(
    value: unknown,
  ): AgentChannelHealthSnapshot['overall'] {
    return value === 'available' || value === 'degraded'
      ? value
      : 'unavailable';
  }

  private asChannelSnapshot(value: unknown): AiChannelSnapshot {
    const channel = this.asRecord(value);
    return {
      status: this.asChannelStatus(channel.status),
      provider: this.asSafeLabel(channel.provider),
      model: this.asSafeLabel(channel.model),
      errorCode: this.asSafeErrorCode(channel.errorCode),
      message: this.asSafeMessage(channel.message),
      latencyMs:
        typeof channel.latencyMs === 'number' && Number.isFinite(channel.latencyMs)
          ? Math.max(0, Math.trunc(channel.latencyMs))
          : null,
    };
  }

  private asChannelStatus(value: unknown): AiChannelState {
    return value === 'available' ||
      value === 'degraded' ||
      value === 'quota_exhausted' ||
      value === 'unavailable' ||
      value === 'unconfigured'
      ? value
      : 'unknown';
  }

  private asSafeErrorCode(value: unknown): string | null {
    const normalized = this.asOptionalString(value);
    return normalized && /^[A-Z][A-Z0-9_]{2,80}$/.test(normalized)
      ? normalized
      : null;
  }

  private asSafeLabel(value: unknown): string | null {
    const normalized = this.asOptionalString(value);
    return normalized ? normalized.slice(0, 120) : null;
  }

  private asSafeMessage(value: unknown): string | null {
    const normalized = this.asOptionalString(value);
    return normalized
      ? normalized.replace(/[\r\n\t]+/g, ' ').slice(0, 240)
      : null;
  }
}
