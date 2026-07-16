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
}
