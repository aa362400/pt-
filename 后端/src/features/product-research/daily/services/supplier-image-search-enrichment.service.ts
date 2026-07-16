import { Inject, Injectable } from '@nestjs/common';
import { AGENT_PROVIDER } from '../../../../agents/agent.module.js';
import type {
  AgentProviderInterface,
  SupplierImageSearchResult,
} from '../../../../agents/agent-provider.interface.js';
import {
  supplierImageSearchEvidenceSchema,
  type SupplierImageSearchEvidence,
} from '../contracts/supplier-image-search-evidence.contract.js';
import type { ExternalCandidate } from '../contracts/external-candidate.contract.js';
import type { ConnectorHealthResult } from '../connectors/product-research-connector.js';
import {
  SupplierImageSearchAllocationService,
  type SupplierImageSearchAllocationEntry,
} from './supplier-image-search-allocation.service.js';
import { SupplierImageSearchEvidenceStoreService } from './supplier-image-search-evidence-store.service.js';

const SOURCE = 'supplier_image_search';
const MAX_CONCURRENCY = 3;
const MAX_SINGLE_REQUEST_MS = 3 * 60_000;
const BATCH_DEADLINE_MS = 13 * 60_000;

type CandidateOutcome =
  | {
      status: 'MATCHES';
      matchCount: number;
      fetchedAt: Date;
    }
  | {
      status: 'NO_RESULTS';
      matchCount: 0;
      fetchedAt: Date;
    }
  | { status: 'SKIPPED_BATCH_DEADLINE' }
  | { status: 'SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED' }
  | { status: 'SUPPLIER_IMAGE_SEARCH_FAILED' };

export interface SupplierImageSearchEnrichmentCandidate {
  candidateId: string;
  fingerprint?: string;
  canonicalName: string;
  inputs: readonly ExternalCandidate[];
}

export interface SupplierImageSearchEnrichmentInput {
  organizationId: string;
  workspaceId: string | null;
  researchRunId: string;
  userId: string;
  candidateLimit?: number;
  candidates: readonly SupplierImageSearchEnrichmentCandidate[];
}

export interface SupplierImageSearchEnrichmentSummary {
  source: typeof SOURCE;
  status: 'HEALTHY' | 'DEGRADED' | 'NOT_CONFIGURED';
  attemptedCount: number;
  successCount: number;
  storedCount: number;
  matchedCandidateCount: number;
  noResultsCount: number;
  matchCount: number;
  failureCount: number;
  notConfiguredCount: number;
  skippedNoSourceImageCount: number;
  skippedByBudgetCount: number;
  skippedByDeadlineCount: number;
  reasonCounts: Record<string, number>;
  partial: boolean;
  health: ConnectorHealthResult;
}

@Injectable()
export class SupplierImageSearchEnrichmentService {
  constructor(
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly evidenceStore: SupplierImageSearchEvidenceStoreService,
    private readonly allocationService: SupplierImageSearchAllocationService,
  ) {}

  async enrichRun(
    input: SupplierImageSearchEnrichmentInput,
  ): Promise<SupplierImageSearchEnrichmentSummary> {
    const requestedAt = new Date();
    const batchDeadlineAt = Date.now() + BATCH_DEADLINE_MS;
    const allocation = await this.allocationService.getOrCreate(input);
    const outcomes = new Array<CandidateOutcome>(allocation.entries.length);
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        if (Date.now() + MAX_SINGLE_REQUEST_MS > batchDeadlineAt) return;
        const index = nextIndex;
        nextIndex += 1;
        if (index >= allocation.entries.length) return;
        outcomes[index] = await this.enrichCandidate(
          input,
          allocation.entries[index],
        );
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENCY, allocation.entries.length) },
        worker,
      ),
    );
    const completedOutcomes = allocation.entries.map(
      (_entry, index): CandidateOutcome =>
        outcomes[index] ?? { status: 'SKIPPED_BATCH_DEADLINE' },
    );
    const finishedAt = new Date();

    const matched = completedOutcomes.filter(
      (outcome): outcome is Extract<CandidateOutcome, { status: 'MATCHES' }> =>
        outcome.status === 'MATCHES',
    );
    const noResults = completedOutcomes.filter(
      (
        outcome,
      ): outcome is Extract<CandidateOutcome, { status: 'NO_RESULTS' }> =>
        outcome.status === 'NO_RESULTS',
    );
    const skippedNoSourceImageCount =
      allocation.skippedNoSourceImageCandidateIds.length;
    const skippedByBudgetCount = allocation.skippedByBudgetCount;
    const skippedByDeadlineCount = this.countStatus(
      completedOutcomes,
      'SKIPPED_BATCH_DEADLINE',
    );
    const notConfiguredCount = this.countStatus(
      completedOutcomes,
      'SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED',
    );
    const failureCount = this.countStatus(
      completedOutcomes,
      'SUPPLIER_IMAGE_SEARCH_FAILED',
    );
    const successCount = matched.length + noResults.length;
    const attemptedCount = successCount + notConfiguredCount + failureCount;
    const matchCount = matched.reduce(
      (total, outcome) => total + outcome.matchCount,
      0,
    );
    const partial =
      skippedNoSourceImageCount > 0 ||
      skippedByDeadlineCount > 0 ||
      notConfiguredCount > 0 ||
      failureCount > 0;
    const status = this.sourceStatus({
      attemptedCount,
      notConfiguredCount,
      partial,
    });
    const reasonCounts = {
      ...(skippedNoSourceImageCount > 0
        ? { SKIPPED_NO_SOURCE_IMAGE: skippedNoSourceImageCount }
        : {}),
      ...(notConfiguredCount > 0
        ? { SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED: notConfiguredCount }
        : {}),
      ...(failureCount > 0
        ? { SUPPLIER_IMAGE_SEARCH_FAILED: failureCount }
        : {}),
      ...(skippedByBudgetCount > 0
        ? { SKIPPED_BY_BUDGET: skippedByBudgetCount }
        : {}),
      ...(skippedByDeadlineCount > 0
        ? { SKIPPED_BATCH_DEADLINE: skippedByDeadlineCount }
        : {}),
    };
    const successfulFetches = [...matched, ...noResults];
    const newestFetchedAt = successfulFetches.reduce<Date | null>(
      (newest, outcome) =>
        !newest || outcome.fetchedAt > newest ? outcome.fetchedAt : newest,
      null,
    );
    const errorCode =
      status === 'NOT_CONFIGURED'
        ? 'SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED'
        : status === 'DEGRADED'
          ? 'SUPPLIER_IMAGE_SEARCH_DEGRADED'
          : null;
    const health: ConnectorHealthResult = {
      source: SOURCE,
      status,
      attempts: attemptedCount,
      itemCount: matchCount,
      requestedAt,
      finishedAt,
      lastSuccessAt: successCount > 0 ? finishedAt : null,
      latencyMs: Math.max(0, finishedAt.getTime() - requestedAt.getTime()),
      dataFreshnessSeconds: newestFetchedAt
        ? Math.max(
            0,
            Math.floor(
              (finishedAt.getTime() - newestFetchedAt.getTime()) / 1000,
            ),
          )
        : null,
      errorCode,
      errorMessage:
        status === 'HEALTHY'
          ? null
          : 'Supplier image-search enrichment completed with unavailable candidate evidence.',
      metadata: {
        allocation,
        attemptedCount,
        successCount,
        storedCount: successCount,
        matchedCandidateCount: matched.length,
        noResultsCount: noResults.length,
        matchCount,
        failureCount,
        notConfiguredCount,
        skippedNoSourceImageCount,
        skippedByBudgetCount,
        skippedByDeadlineCount,
        reasonCounts,
      },
    };

    return {
      source: SOURCE,
      status,
      attemptedCount,
      successCount,
      storedCount: successCount,
      matchedCandidateCount: matched.length,
      noResultsCount: noResults.length,
      matchCount,
      failureCount,
      notConfiguredCount,
      skippedNoSourceImageCount,
      skippedByBudgetCount,
      skippedByDeadlineCount,
      reasonCounts,
      partial,
      health,
    };
  }

  private async enrichCandidate(
    run: Omit<SupplierImageSearchEnrichmentInput, 'candidates'>,
    allocation: SupplierImageSearchAllocationEntry,
  ): Promise<CandidateOutcome> {
    try {
      const result = await this.agentProvider.runSupplierImageSearch(
        {
          imageUrl: allocation.imageUrl,
          ...(allocation.imageKeywords
            ? { imageKeywords: allocation.imageKeywords }
            : {}),
        },
        {
          orgId: run.organizationId,
          ...(run.workspaceId ? { workspaceId: run.workspaceId } : {}),
          userId: run.userId,
          requestId: allocation.requestId,
        },
      );
      if (result.provenance.requestId !== allocation.requestId) {
        throw new Error('SUPPLIER_IMAGE_SEARCH_REQUEST_ID_MISMATCH');
      }
      const evidence = this.toEvidence(result);
      await this.evidenceStore.append({
        organizationId: run.organizationId,
        workspaceId: run.workspaceId,
        researchRunId: run.researchRunId,
        candidateId: allocation.candidateId,
        evidence,
      });
      const fetchedAt = new Date(evidence.fetchedAt);
      return evidence.outcome === 'MATCHES'
        ? {
            status: 'MATCHES',
            matchCount: evidence.providerResultCount,
            fetchedAt,
          }
        : { status: 'NO_RESULTS', matchCount: 0, fetchedAt };
    } catch (error) {
      return this.isNotConfigured(error)
        ? { status: 'SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED' }
        : { status: 'SUPPLIER_IMAGE_SEARCH_FAILED' };
    }
  }

  private toEvidence(
    result: SupplierImageSearchResult,
  ): SupplierImageSearchEvidence {
    return supplierImageSearchEvidenceSchema.parse({
      schemaVersion: 'supplier-image-search/v1',
      provider: result.provenance.provider,
      adapterVersion: result.provenance.adapterVersion,
      requestId: result.provenance.requestId,
      outcome: result.outcome,
      rawSnapshotSha256: result.provenance.rawSnapshotSha256,
      canonicalization: {
        version: result.imageEvidence.canonicalizationVersion,
        sourceOriginalSha256: result.imageEvidence.sourceOriginalSha256,
        sourceCanonicalSha256: result.imageEvidence.sourceCanonicalSha256,
        canonicalByteSize: result.imageEvidence.decodedSizeBytes,
        canonicalMimeType: result.imageEvidence.payloadMimeType,
        canonicalWidth: result.imageEvidence.width,
        canonicalHeight: result.imageEvidence.height,
        retrievalHashAlgorithm: result.imageEvidence.retrievalHashAlgorithm,
        retrievalHash: result.imageEvidence.retrievalHash,
      },
      providerResultCount: result.providerResultCount,
      normalizedOffers: result.offers,
      fetchedAt: result.provenance.fetchedAt,
    });
  }

  private sourceStatus(input: {
    attemptedCount: number;
    notConfiguredCount: number;
    partial: boolean;
  }): SupplierImageSearchEnrichmentSummary['status'] {
    if (
      input.attemptedCount > 0 &&
      input.notConfiguredCount === input.attemptedCount
    ) {
      return 'NOT_CONFIGURED';
    }
    return input.partial ? 'DEGRADED' : 'HEALTHY';
  }

  private countStatus(
    outcomes: readonly CandidateOutcome[],
    status: CandidateOutcome['status'],
  ): number {
    return outcomes.filter((outcome) => outcome.status === status).length;
  }

  private isNotConfigured(error: unknown): boolean {
    const record =
      error && typeof error === 'object'
        ? (error as Record<string, unknown>)
        : null;
    const diagnostics =
      record?.diagnostics && typeof record.diagnostics === 'object'
        ? (record.diagnostics as Record<string, unknown>)
        : null;
    const code =
      typeof diagnostics?.code === 'string'
        ? diagnostics.code
        : error instanceof Error
          ? error.message
          : '';
    return [
      'SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED',
      'SUPPLIER_IMAGE_SEARCH_REAL_PROVIDER_REQUIRED',
    ].includes(code);
  }
}
