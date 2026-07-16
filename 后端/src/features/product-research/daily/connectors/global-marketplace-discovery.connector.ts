import { Inject, Injectable } from '@nestjs/common';
import { AGENT_PROVIDER } from '../../../../agents/agent.module.js';
import type { AgentProviderInterface } from '../../../../agents/agent-provider.interface.js';
import { externalCandidateListSchema } from '../contracts/external-candidate.contract.js';
import type {
  ConnectorCollectInput,
  ConnectorCollectResult,
  ProductResearchConnector,
} from './product-research-connector.js';

@Injectable()
export class GlobalMarketplaceDiscoveryConnector implements ProductResearchConnector {
  readonly source = 'global_marketplace_discovery';

  constructor(
    @Inject(AGENT_PROVIDER)
    private readonly agent: AgentProviderInterface,
  ) {}

  async collect(input: ConnectorCollectInput): Promise<ConnectorCollectResult> {
    const requestedAt = new Date();
    const explorationKey = this.optionalText(
      input.configSnapshot.explorationKey,
    );
    const seedQueries = Array.isArray(input.configSnapshot.seedQueries)
      ? input.configSnapshot.seedQueries
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const result = await this.agent.runGlobalProductDiscovery(
      {
        businessDate: input.businessDate,
        candidateLimit: input.candidateLimit,
        ...(seedQueries.length > 0 ? { seedQueries } : {}),
        ...(explorationKey ? { explorationKey } : {}),
      },
      {
        orgId: input.organizationId,
        workspaceId: input.workspaceId ?? undefined,
      },
    );
    const candidates = externalCandidateListSchema.parse(result.candidates);
    const finishedAt = new Date();
    const conceptCount = Number(result.conceptCount ?? 0);
    const failures = Array.isArray(result.searchFailures)
      ? result.searchFailures
      : [];
    const status =
      failures.length > 0
        ? 'DEGRADED'
        : candidates.length > 0
          ? 'HEALTHY'
          : 'DEGRADED';
    return {
      candidates,
      health: {
        source: this.source,
        status,
        attempts: Number(result.searchAttempts ?? 1),
        itemCount: conceptCount,
        requestedAt,
        finishedAt,
        lastSuccessAt: candidates.length > 0 ? finishedAt : null,
        latencyMs: finishedAt.getTime() - requestedAt.getTime(),
        dataFreshnessSeconds: 0,
        errorCode:
          candidates.length > 0
            ? failures.length > 0
              ? 'PARTIAL_SEARCH_FAILURE'
              : null
            : 'NO_VERIFIED_GLOBAL_CANDIDATES',
        errorMessage:
          candidates.length > 0
            ? failures.length > 0
              ? `${failures.length} public searches failed; retained candidates still passed evidence validation.`
              : null
            : 'No concept had explicit purchase-intent evidence from two independent marketplaces.',
        metadata: {
          provider: result.provider ?? 'unknown',
          fetchedAt: result.fetchedAt ?? null,
          conceptCount,
          searchAttempts: result.searchAttempts ?? 0,
          searchSuccesses: result.searchSuccesses ?? 0,
          methodology: result.methodology ?? {},
          externalStoreMutation: false,
        },
      },
    };
  }

  private optionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : undefined;
  }
}
