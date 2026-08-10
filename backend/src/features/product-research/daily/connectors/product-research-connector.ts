import type { ExternalCandidate } from '../contracts/external-candidate.contract.js';

export interface ConnectorCollectInput {
  organizationId: string;
  workspaceId: string | null;
  businessDate: string;
  timezone: string;
  candidateLimit: number;
  configSnapshot: Record<string, unknown>;
}

export interface ConnectorHealthResult {
  source: string;
  status:
    | 'HEALTHY'
    | 'DEGRADED'
    | 'FAILED'
    | 'DISABLED'
    | 'NOT_CONFIGURED'
    | 'CSV_ONLY';
  attempts: number;
  itemCount: number;
  requestedAt: Date;
  finishedAt: Date;
  lastSuccessAt?: Date | null;
  latencyMs: number;
  dataFreshnessSeconds?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ConnectorCollectResult {
  candidates: ExternalCandidate[];
  health: ConnectorHealthResult;
}

export interface ProductResearchConnector {
  readonly source: string;
  collect(input: ConnectorCollectInput): Promise<ConnectorCollectResult>;
}
