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
    input.signal?.throwIfAborted();
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
        ...(input.excludedConceptKeys?.length
          ? { excludedConceptKeys: input.excludedConceptKeys }
          : {}),
        ...(input.excludedSourcingOfferIds?.length
          ? { excludedSourcingOfferIds: input.excludedSourcingOfferIds }
          : {}),
      },
      {
        orgId: input.organizationId,
        workspaceId: input.workspaceId ?? undefined,
        requestId: `daily-product-research:${input.researchRunId}:global-product-discovery`,
      },
      { signal: input.signal },
    );
    input.signal?.throwIfAborted();
    const normalized = this.discardUnsafeOptionalImageUrls(result.candidates);
    const candidates = externalCandidateListSchema.parse(normalized.candidates);
    const finishedAt = new Date();
    const conceptCount = Number(result.conceptCount ?? 0);
    const shortfall = Math.max(0, input.candidateLimit - conceptCount);
    const failures = Array.isArray(result.searchFailures)
      ? result.searchFailures
      : [];
    const budgetExhausted = result.budgetExhausted === true;
    const status =
      failures.length > 0 ||
      shortfall > 0 ||
      normalized.discardedOptionalImageUrlCount > 0
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
        errorCode: budgetExhausted
          ? 'DISCOVERY_BUDGET_EXHAUSTED'
          : candidates.length === 0
            ? 'NO_VERIFIED_GLOBAL_CANDIDATES'
            : failures.length > 0
              ? 'PARTIAL_SEARCH_FAILURE'
              : shortfall > 0
                ? 'CANDIDATE_SHORTFALL'
                : normalized.discardedOptionalImageUrlCount > 0
                  ? 'UNSAFE_OPTIONAL_IMAGE_URL_DISCARDED'
                  : null,
        errorMessage: budgetExhausted
          ? `Global discovery stopped at its ${Number(result.budgetSeconds ?? 0)} second execution budget; retained only evidence verified before the deadline.`
          : candidates.length === 0
            ? 'No concept had explicit purchase-intent evidence from two independent marketplaces.'
            : failures.length > 0
              ? `${failures.length} public searches failed; retained candidates still passed evidence validation.`
              : shortfall > 0
                ? `Verified ${conceptCount} of ${input.candidateLimit} requested unique product concepts; no placeholder candidates were added.`
                : normalized.discardedOptionalImageUrlCount > 0
                  ? `${normalized.discardedOptionalImageUrlCount} unsafe optional image URL field(s) were discarded; core marketplace evidence still passed strict validation.`
                  : null,
        metadata: {
          provider: result.provider ?? 'unknown',
          fetchedAt: result.fetchedAt ?? null,
          requestedConceptCount: input.candidateLimit,
          conceptCount,
          shortfall,
          rawEvidenceCount: result.rawEvidenceCount ?? candidates.length,
          discoveryEvidenceCount: result.discoveryEvidenceCount ?? null,
          sourcingLeadCount: result.sourcingLeadCount ?? 0,
          excludedByLightSmallScreen: result.excludedByLightSmallScreen ?? 0,
          duplicateConceptCount: result.duplicateConceptCount ?? 0,
          excludedByHistoryCount: result.excludedByHistoryCount ?? 0,
          duplicateSourcingOfferCount: result.duplicateSourcingOfferCount ?? 0,
          sourcingSearchAttemptCount: result.sourcingSearchAttemptCount ?? 0,
          sourcingUnmappedConceptCount:
            result.sourcingUnmappedConceptCount ?? 0,
          sourcingNoResultCount: result.sourcingNoResultCount ?? 0,
          sourcingInvalidUrlCount: result.sourcingInvalidUrlCount ?? 0,
          sourcingTermMismatchCount: result.sourcingTermMismatchCount ?? 0,
          expansionRounds: result.expansionRounds ?? 0,
          exhaustedSources: result.exhaustedSources ?? shortfall > 0,
          budgetExhausted,
          budgetSeconds: result.budgetSeconds ?? null,
          budgetElapsedMs: result.budgetElapsedMs ?? null,
          searchAttempts: result.searchAttempts ?? 0,
          searchSuccesses: result.searchSuccesses ?? 0,
          discardedOptionalImageUrlCount:
            normalized.discardedOptionalImageUrlCount,
          optionalImageUrlPolicy:
            'DISCARD_UNSAFE_FIELD_KEEP_STRICTLY_VALIDATED_CANDIDATE',
          methodology: result.methodology ?? {},
          externalStoreMutation: false,
        },
      },
    };
  }

  private optionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private discardUnsafeOptionalImageUrls(candidates: unknown[]): {
    candidates: unknown[];
    discardedOptionalImageUrlCount: number;
  } {
    let discardedOptionalImageUrlCount = 0;
    const normalizedCandidates = candidates.map((candidate) => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      ) {
        return candidate;
      }
      const record = candidate as Record<string, unknown>;
      const unsafeImageUrl =
        record.imageUrl !== null &&
        record.imageUrl !== undefined &&
        !this.isSafeHttpUrl(record.imageUrl);
      const unsafeImageEvidenceUrl =
        record.imageEvidenceUrl !== null &&
        record.imageEvidenceUrl !== undefined &&
        !this.isSafeHttpUrl(record.imageEvidenceUrl);
      if (!unsafeImageUrl && !unsafeImageEvidenceUrl) {
        return candidate;
      }
      discardedOptionalImageUrlCount += 1;
      const {
        imageUrl: _discardedImageUrl,
        imageEvidenceUrl: _discardedImageEvidenceUrl,
        ...strictCandidate
      } = record;
      return strictCandidate;
    });
    return {
      candidates: normalizedCandidates,
      discardedOptionalImageUrlCount,
    };
  }

  private isSafeHttpUrl(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
}
