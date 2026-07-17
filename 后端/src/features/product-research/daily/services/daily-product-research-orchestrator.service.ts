import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type ProductResearchStage } from '@prisma/client';
import {
  OrganizationAgentControlService,
  type OrganizationAgentControlLock,
} from '../../../../shared/agent-control/organization-agent-control.service.js';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import {
  DAILY_RESEARCH_SCHEMA_VERSION,
  researchPricingModeSchema,
  type ResearchPricingMode,
} from '../contracts/daily-product-research.contract.js';
import {
  canonical1688OfferId,
  externalCandidateListSchema,
  type ExternalCandidate,
} from '../contracts/external-candidate.contract.js';
import { ConnectorRegistryService } from '../connectors/connector-registry.service.js';
import type {
  ConnectorCollectResult,
  ConnectorHealthResult,
} from '../connectors/product-research-connector.js';
import { DailyReportRendererService } from '../reports/daily-report-renderer.service.js';
import { ResearchArtifactStoreService } from '../reports/research-artifact-store.service.js';
import { ComplianceScannerService } from './compliance-scanner.service.js';
import { CompetitionAnalysisService } from './competition-analysis.service.js';
import {
  DemandAnalysisService,
  type DemandSignalInput,
} from './demand-analysis.service.js';
import { KeywordExpansionService } from './keyword-expansion.service.js';
import { NormalizationService } from './normalization.service.js';
import {
  ProfitCapacityService,
  type ProfitCalculationResult,
} from './profit-capacity.service.js';
import { TrustedProfitEconomicsPolicyService } from './trusted-profit-economics-policy.service.js';
import {
  RiskAnalysisService,
  type RiskFindingInput,
} from './risk-analysis.service.js';
import {
  ScoringService,
  type CandidateScoringInput,
  type ScoreComponent,
  type ScoringThresholds,
} from './scoring.service.js';
import { SupplierImageSearchEnrichmentService } from './supplier-image-search-enrichment.service.js';

const STAGES: ProductResearchStage[] = [
  'COLLECT',
  'NORMALIZE',
  'KEYWORDS',
  'DEMAND',
  'COMPETITION',
  'PROFIT',
  'RISK',
  'SCORE',
  'REPORT',
  'FEEDBACK',
];

const TRUSTED_ECONOMICS_MAX_EVIDENCE_AGE_SECONDS = 60 * 60;
const COLLECT_SNAPSHOT_SCHEMA_VERSION =
  'daily-product-research-collect-snapshot/v1' as const;
const SEMANTIC_CONCEPT_KEY_VERSION = 'semantic-concept-key/v4' as const;
// The BullMQ execution deadline is 30 minutes. Keeping the durable lease five
// minutes longer prevents a second delivery from entering while the first
// delivery is still allowed to run; every stage boundary renews this lease.
const DAILY_RESEARCH_EXECUTION_LEASE_MS = 35 * 60 * 1_000;

type DailyResearchExecutionFence = Readonly<{
  leaseOwner: string;
  executionEpoch: number;
}>;

type FeedbackCandidate = Readonly<{
  candidateId: string;
  finalScore: number;
  hardGateReasons: string[];
  reviewReason: 'ALL_GATES_PASSED' | 'MANUAL_PRICING_REQUIRED';
  manualPricingRequired: boolean;
}>;

class DailyResearchRunCancelledError extends Error {
  constructor() {
    super('DAILY_RESEARCH_RUN_CANCELLED');
    this.name = 'DailyResearchRunCancelledError';
  }
}

class DailyResearchExecutionFenceLostError extends Error {
  constructor() {
    super('DAILY_RESEARCH_EXECUTION_FENCE_LOST');
    this.name = 'DailyResearchExecutionFenceLostError';
  }
}

type DailyResearchControlStatus = 'PAUSED' | 'STOPPED';

class DailyResearchControlBoundaryError extends Error {
  constructor(
    readonly status: DailyResearchControlStatus,
    readonly controlRevision: number,
    readonly checkpointStage: ProductResearchStage | null,
    readonly checkpointedAt: Date | null,
  ) {
    super(`DAILY_RESEARCH_${status}`);
    this.name = 'DailyResearchControlBoundaryError';
  }
}

export function candidateBatchShortfall(
  requestedCandidateCount: number,
  processedCandidateCount: number,
) {
  const shortfall = Math.max(
    0,
    requestedCandidateCount - processedCandidateCount,
  );
  if (shortfall === 0) return null;
  return {
    code: 'EVIDENCE_INSUFFICIENT',
    requestedCandidateCount,
    processedCandidateCount,
    shortfall,
    message: `仅找到 ${processedCandidateCount}/${requestedCandidateCount} 个可验证候选，已保留真实证据且未添加占位商品。`,
  };
}

export function connectorEvidenceInsufficientSummary(
  results: ConnectorCollectResult[],
) {
  const partial = results.find(
    (result) => result.health.errorCode === 'EVIDENCE_INSUFFICIENT',
  );
  if (!partial) return null;
  const metadata = partial.health.metadata ?? {};
  const gap =
    metadata.evidenceGap &&
    typeof metadata.evidenceGap === 'object' &&
    !Array.isArray(metadata.evidenceGap)
      ? (metadata.evidenceGap as Record<string, unknown>)
      : {};
  const required = Number(gap.requiredIndependentSources);
  const found = Number(gap.maximumObservedIndependentSources);
  const partialEvidenceCount = Number(metadata.partialEvidenceCount);
  const attemptedProviders = Array.isArray(metadata.attemptedProviders)
    ? metadata.attemptedProviders
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 8)
    : [];
  const requiredIndependentSources =
    Number.isFinite(required) && required > 0 ? Math.trunc(required) : 2;
  const foundIndependentSources =
    Number.isFinite(found) && found >= 0 ? Math.trunc(found) : 0;
  return {
    code: 'EVIDENCE_INSUFFICIENT',
    requiredIndependentSources,
    foundIndependentSources,
    partialEvidenceCount:
      Number.isFinite(partialEvidenceCount) && partialEvidenceCount >= 0
        ? Math.trunc(partialEvidenceCount)
        : 0,
    attemptedProviders,
    message: `仅找到 ${foundIndependentSources}/${requiredIndependentSources} 个独立需求来源，已保留真实部分证据且未补造价格。`,
  };
}

type CandidateWork = {
  id: string;
  fingerprint: string;
  conceptKey: string;
  canonicalName: string;
  productType: string;
  material: string | null;
  primaryUse: string | null;
  customizationMethod: string | null;
  targetAudience: string | null;
  inputs: ExternalCandidate[];
  signals: DemandSignalInput[];
  demand?: ReturnType<DemandAnalysisService['analyze']>;
  competition?: ReturnType<CompetitionAnalysisService['analyze']>;
  profit?: ProfitCalculationResult | null;
  profitHardGateReasons?: string[];
  risk?: ReturnType<RiskAnalysisService['evaluate']>;
  keywords?: ReturnType<KeywordExpansionService['expand']>;
};

type NormalizationBatch = {
  candidates: CandidateWork[];
  backendHistoryExcludedCount: number;
  backendHistoricalSourcingOfferExcludedCount: number;
  backendDuplicateSourcingOfferCount: number;
};

@Injectable()
export class DailyProductResearchOrchestratorService {
  private readonly logger = new Logger(
    DailyProductResearchOrchestratorService.name,
  );

  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly normalization: NormalizationService,
    private readonly keywords: KeywordExpansionService,
    private readonly demand: DemandAnalysisService,
    private readonly competition: CompetitionAnalysisService,
    private readonly profit: ProfitCapacityService,
    private readonly trustedProfitEconomics: TrustedProfitEconomicsPolicyService,
    private readonly compliance: ComplianceScannerService,
    private readonly risk: RiskAnalysisService,
    private readonly scoring: ScoringService,
    private readonly reportRenderer: DailyReportRendererService,
    private readonly artifactStore: ResearchArtifactStoreService,
    private readonly supplierImageSearch: SupplierImageSearchEnrichmentService,
    private readonly organizationControl: OrganizationAgentControlService,
  ) {}

  async execute(
    organizationId: string,
    researchRunId: string,
    signal?: AbortSignal,
    expectedControlRevision?: number,
    requestedLeaseOwner?: string,
  ) {
    const normalizedLeaseOwner = requestedLeaseOwner?.trim();
    if (normalizedLeaseOwner && normalizedLeaseOwner.length > 512) {
      throw new Error('DAILY_RESEARCH_EXECUTION_LEASE_OWNER_INVALID');
    }
    const leaseOwner = normalizedLeaseOwner || `daily-direct-${randomUUID()}`;
    signal?.throwIfAborted();
    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchRun.findFirst({
        where: { id: researchRunId, organizationId },
        include: { scoringVersion: true },
      }),
    );
    signal?.throwIfAborted();
    if (!run) throw new Error('DAILY_RESEARCH_RUN_NOT_FOUND');
    const runErrorSummary = this.record(run.errorSummary);
    const retryingEvidencePartial =
      run.status === 'PARTIAL' &&
      expectedControlRevision !== undefined &&
      runErrorSummary.code === 'EVIDENCE_INSUFFICIENT';
    if (
      ['COMPLETED', 'PARTIAL', 'CANCELLED', 'STOPPED'].includes(run.status) &&
      !retryingEvidencePartial
    ) {
      return { researchRunId: run.id, status: run.status, reused: true };
    }
    if (!run.scoringVersion)
      throw new Error('DAILY_RESEARCH_SCORING_VERSION_MISSING');
    this.logger.log(
      JSON.stringify({
        event: 'daily_research_run_started',
        runId: run.id,
        organizationId,
        trigger: run.trigger,
        attempt: run.attempt,
        candidateLimit: run.candidateLimit,
        topLimit: run.topLimit,
      }),
    );

    const workspaceProfile = run.workspaceId
      ? await this.tenantDatabase.run(organizationId, (tx) =>
          tx.storeAgentProfile.findUnique({
            where: { workspaceId: run.workspaceId! },
          }),
        )
      : null;
    signal?.throwIfAborted();
    const configSnapshot = this.record(run.configSnapshot);
    const parsedPricingMode = researchPricingModeSchema.safeParse(
      configSnapshot.pricingMode,
    );
    const pricingMode: ResearchPricingMode = parsedPricingMode.success
      ? parsedPricingMode.data
      : 'AUTO';
    const context = {
      organizationId,
      workspaceId: run.workspaceId,
      businessDate: run.businessDate.toISOString().slice(0, 10),
      timezone: run.scheduleTimezone,
      candidateLimit: run.candidateLimit,
      configSnapshot,
      forbiddenTerms: workspaceProfile?.forbiddenTerms ?? [],
    };

    const claimOutcome = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const control = await this.organizationControl.lockEffectiveState(
          tx,
          organizationId,
        );
        const current = await tx.productResearchRun.findFirst({
          where: { id: run.id, organizationId },
          select: {
            status: true,
            checkpointStage: true,
            checkpointedAt: true,
            controlRevision: true,
            leaseOwner: true,
            leaseExpiresAt: true,
            executionEpoch: true,
          },
        });
        if (!current) return { kind: 'CONFLICT' as const };
        const currentExecutionEpoch = Number.isInteger(current.executionEpoch)
          ? current.executionEpoch
          : 0;

        if (control.state !== 'RUNNING') {
          const parkedStatus = this.controlRunStatus(control);
          const parkedAt = new Date();
          const parked = await tx.productResearchRun.updateMany({
            where: {
              id: run.id,
              organizationId,
              executionEpoch: currentExecutionEpoch,
              OR: [
                { status: { in: ['PENDING', 'FAILED', 'PAUSED', 'PARTIAL'] } },
                {
                  status: 'RUNNING',
                  OR: [
                    { leaseExpiresAt: null },
                    { leaseExpiresAt: { lte: parkedAt } },
                  ],
                },
              ],
            },
            data: {
              status: parkedStatus,
              currentStage: null,
              controlRevision: control.revision,
              finishedAt: parkedStatus === 'STOPPED' ? new Date() : null,
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          });
          if (parked.count !== 1) return { kind: 'CONFLICT' as const };
          return {
            kind: 'CONTROL' as const,
            status: parkedStatus,
            controlRevision: control.revision,
            checkpointStage: current.checkpointStage,
            checkpointedAt: current.checkpointedAt,
          };
        }

        const retryCanAdoptCurrentControl =
          expectedControlRevision !== undefined &&
          expectedControlRevision <= current.controlRevision &&
          current.controlRevision <= control.revision &&
          ['RUNNING', 'FAILED', 'PARTIAL'].includes(current.status);
        if (
          expectedControlRevision !== undefined &&
          (expectedControlRevision !== current.controlRevision ||
            expectedControlRevision !== control.revision) &&
          !retryCanAdoptCurrentControl
        ) {
          return {
            kind: 'STALE_CONTROL_REVISION' as const,
            status: current.status,
            expectedControlRevision,
            persistedControlRevision: current.controlRevision,
            actualControlRevision: control.revision,
          };
        }

        const claimStartedAt = new Date();
        const claim = await tx.productResearchRun.updateMany({
          where: {
            id: run.id,
            organizationId,
            executionEpoch: currentExecutionEpoch,
            OR: [
              { status: { in: ['PENDING', 'FAILED', 'PAUSED', 'PARTIAL'] } },
              {
                status: 'RUNNING',
                OR: [
                  { leaseExpiresAt: null },
                  { leaseExpiresAt: { lte: claimStartedAt } },
                ],
              },
            ],
          },
          data: {
            status: 'RUNNING',
            startedAt: run.startedAt ?? claimStartedAt,
            finishedAt: null,
            currentStage: null,
            controlRevision: control.revision,
            errorSummary: Prisma.DbNull,
            leaseOwner,
            leaseExpiresAt: this.executionLeaseExpiry(claimStartedAt),
            executionEpoch: { increment: 1 },
          },
        });
        if (claim.count !== 1) return { kind: 'CONFLICT' as const };

        await Promise.all(
          STAGES.map((stage) =>
            tx.productResearchStageRun.upsert({
              where: {
                researchRunId_stage_attempt: {
                  researchRunId: run.id,
                  stage,
                  attempt: 0,
                },
              },
              create: {
                organizationId,
                researchRunId: run.id,
                stage,
                status: 'PENDING',
                attempt: 0,
              },
              update: {},
            }),
          ),
        );
        return {
          kind: 'CLAIMED' as const,
          replayFromCheckpoint:
            current.status === 'PARTIAL' ? null : current.checkpointStage,
          executionFence: {
            leaseOwner,
            executionEpoch: currentExecutionEpoch + 1,
          } satisfies DailyResearchExecutionFence,
        };
      },
    );
    if (claimOutcome.kind === 'CONTROL') {
      return this.controlResult(run.id, claimOutcome);
    }
    if (claimOutcome.kind === 'STALE_CONTROL_REVISION') {
      return this.staleControlRevisionResult(run.id, claimOutcome);
    }
    if (claimOutcome.kind !== 'CLAIMED') {
      const currentStatus = await this.currentRunStatus(organizationId, run.id);
      if (
        ['COMPLETED', 'PARTIAL', 'CANCELLED', 'PAUSED', 'STOPPED'].includes(
          currentStatus ?? '',
        )
      ) {
        return {
          researchRunId: run.id,
          status: currentStatus!,
          reused: true,
        };
      }
      throw new Error('DAILY_RESEARCH_RUN_CLAIM_CONFLICT');
    }

    const executionFence = claimOutcome.executionFence;
    try {
      signal?.throwIfAborted();
      const collectedSnapshot = claimOutcome.replayFromCheckpoint
        ? await this.loadCollectSnapshot(organizationId, run.id)
        : null;
      if (claimOutcome.replayFromCheckpoint && !collectedSnapshot) {
        throw new Error('DAILY_RESEARCH_COLLECT_SNAPSHOT_UNAVAILABLE');
      }
      const connectorResults = await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'COLLECT',
        signal,
        async () => {
          const historicalExclusions = collectedSnapshot
            ? null
            : await this.loadHistoricalDiscoveryExclusions(
                organizationId,
                run.id,
              );
          const results =
            collectedSnapshot ??
            (await this.connectorRegistry.collect({
              researchRunId: run.id,
              organizationId,
              workspaceId: run.workspaceId,
              businessDate: context.businessDate,
              timezone: context.timezone,
              candidateLimit: run.candidateLimit,
              configSnapshot,
              excludedConceptKeys: historicalExclusions?.conceptKeys ?? [],
              excludedSourcingOfferIds:
                historicalExclusions?.sourcingOfferIds ?? [],
              signal,
            }));
          await this.persistSourceHealth(
            organizationId,
            run.id,
            run.workspaceId,
            results.map((item) => item.health),
          );
          return results;
        },
      );
      let partialData = connectorResults.some((result) =>
        ['DEGRADED', 'FAILED'].includes(result.health.status),
      );
      const rawCandidates = connectorResults.flatMap(
        (result) => result.candidates,
      );

      let supplierPartial = false;
      const normalizationBatch = await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'NORMALIZE',
        signal,
        async () => {
          const normalized = await this.normalizeAndPersistBatch(
            organizationId,
            run.id,
            run.workspaceId,
            rawCandidates,
            run.candidateLimit,
          );
          if (this.sourceEnabled(configSnapshot, 'supplier_image_search')) {
            signal?.throwIfAborted();
            const supplierImageSearchConfig = this.record(
              configSnapshot.supplierImageSearch,
            );
            const configuredLimit = this.number(
              supplierImageSearchConfig.candidateLimit,
            );
            const candidateLimit =
              configuredLimit !== null &&
              Number.isInteger(configuredLimit) &&
              configuredLimit >= 1 &&
              configuredLimit <= 10
                ? configuredLimit
                : 10;
            const enrichment = await this.supplierImageSearch.enrichRun({
              organizationId,
              workspaceId: run.workspaceId,
              researchRunId: run.id,
              userId: run.createdBy,
              candidateLimit,
              signal,
              candidates: normalized.candidates.map((candidate) => ({
                candidateId: candidate.id,
                fingerprint: candidate.fingerprint,
                canonicalName: candidate.canonicalName,
                inputs: candidate.inputs,
              })),
            });
            await this.persistSourceHealth(
              organizationId,
              run.id,
              run.workspaceId,
              [enrichment.health],
            );
            supplierPartial = enrichment.partial;
            signal?.throwIfAborted();
          } else {
            await this.persistSourceHealth(
              organizationId,
              run.id,
              run.workspaceId,
              [this.disabledSupplierImageSearchHealth(configSnapshot)],
            );
          }
          return normalized;
        },
      );
      const work = normalizationBatch.candidates;
      const batchShortfall = candidateBatchShortfall(
        run.candidateLimit,
        work.length,
      );
      const evidenceInsufficient =
        connectorEvidenceInsufficientSummary(connectorResults);
      const partialErrorSummary = evidenceInsufficient ?? batchShortfall;
      partialData = partialData || batchShortfall !== null || supplierPartial;

      await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'KEYWORDS',
        signal,
        async () => {
          for (const candidate of work) {
            candidate.keywords = this.keywords.expand({
              canonicalName: candidate.canonicalName,
              productType: candidate.productType,
              material: candidate.material,
              primaryUse: candidate.primaryUse,
              customizationMethod: candidate.customizationMethod,
              targetAudience: candidate.targetAudience,
              forbiddenTerms: context.forbiddenTerms,
            });
          }
          await this.persistWorkSummary(organizationId, work, 'keywords');
          return { candidates: work.length };
        },
      );

      await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'DEMAND',
        signal,
        async () => {
          for (const candidate of work)
            candidate.demand = this.demand.analyze(candidate.signals);
          await this.tenantDatabase.run(organizationId, async (tx) => {
            for (const candidate of work) {
              await tx.productCandidate.update({
                where: { id: candidate.id },
                data: {
                  signalStrength: candidate.demand!.signalStrength,
                  confidenceScore: candidate.demand!.confidenceScore,
                  status:
                    candidate.demand!.signalStrength === 'INVALID'
                      ? 'REJECTED'
                      : 'ELIGIBLE',
                },
              });
            }
          });
          return { candidates: work.length };
        },
      );

      await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'COMPETITION',
        signal,
        async () => {
          for (const candidate of work)
            candidate.competition = this.competition.analyze(candidate.signals);
          await this.persistWorkSummary(organizationId, work, 'competition');
          return { candidates: work.length };
        },
      );

      await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'PROFIT',
        signal,
        async () => {
          for (const candidate of work) {
            if (pricingMode === 'MANUAL') {
              candidate.profit = null;
              candidate.profitHardGateReasons = ['MANUAL_PRICING_REQUIRED'];
            } else {
              const decision = this.calculateTrustedProfit(candidate.inputs);
              candidate.profit = decision.profit;
              candidate.profitHardGateReasons = decision.hardGateReasons;
            }
          }
          await this.persistWorkSummary(
            organizationId,
            work,
            'profit',
            pricingMode,
          );
          const reasonCounts = work
            .flatMap((candidate) => this.profitReasons(candidate))
            .reduce<Record<string, number>>((counts, reason) => {
              counts[reason] = (counts[reason] ?? 0) + 1;
              return counts;
            }, {});
          const verifiedCount = work.filter(
            (candidate) =>
              candidate.profit !== null &&
              candidate.profit !== undefined &&
              this.profitReasons(candidate).length === 0,
          ).length;
          return {
            candidates: work.length,
            pricingMode,
            verifiedCount,
            blockedCount: work.length - verifiedCount,
            reasonCounts,
          };
        },
      );

      await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'RISK',
        signal,
        async () => {
          await this.tenantDatabase.run(organizationId, async (tx) => {
            for (const candidate of work) {
              const supplied = candidate.inputs.flatMap((input) => input.risks);
              const findings = this.compliance.scan({
                texts: [
                  candidate.canonicalName,
                  candidate.productType,
                  candidate.material,
                  candidate.primaryUse,
                ],
                forbiddenTerms: context.forbiddenTerms,
                suppliedFindings: supplied,
              });
              candidate.risk = this.risk.evaluate(findings);
              if (findings.length > 0) {
                const proposed = findings.map((finding) => ({
                  organizationId,
                  workspaceId: run.workspaceId,
                  researchRunId: run.id,
                  candidateId: candidate.id,
                  riskType: finding.riskType,
                  severity: finding.severity,
                  ruleVersion: finding.ruleVersion,
                  matchedTerm: finding.matchedTerm ?? null,
                  evidence: (finding.evidencePayload ?? {
                    summary: finding.evidence,
                  }) as Prisma.InputJsonValue,
                  source: this.riskFindingSource(finding),
                  reviewStatus:
                    finding.severity === 'LOW'
                      ? ('AUTO' as const)
                      : ('NEEDS_REVIEW' as const),
                }));
                const existing = await tx.productRiskRecord.findMany({
                  where: { candidateId: candidate.id, organizationId },
                  select: {
                    riskType: true,
                    severity: true,
                    ruleVersion: true,
                    matchedTerm: true,
                    evidence: true,
                    source: true,
                    reviewStatus: true,
                  },
                });
                const existingKeys = new Set(
                  existing.map((row) => this.riskRecordKey(row)),
                );
                const novel = proposed.filter((row) => {
                  const key = this.riskRecordKey(row);
                  if (existingKeys.has(key)) return false;
                  existingKeys.add(key);
                  return true;
                });
                if (novel.length > 0) {
                  await tx.productRiskRecord.createMany({ data: novel });
                }
              }
            }
          });
          return { candidates: work.length };
        },
      );

      const ranked = await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'SCORE',
        signal,
        async () => {
          const inputs = work.map((candidate) =>
            this.toScoringInput(
              candidate,
              run.scoringVersion!.thresholds,
              pricingMode,
            ),
          );
          const ranking = this.scoring.rank(inputs, {
            topLimit: run.topLimit,
            weights: this.scoringWeights(run.scoringVersion!.weights),
            thresholds: this.decisionThresholds(run.scoringVersion!.thresholds),
          });
          await this.persistScores(
            organizationId,
            run.id,
            run.workspaceId,
            run.scoringVersion!.id,
            ranking,
          );
          return ranking;
        },
      );

      const report = await this.runStage(
        organizationId,
        run.id,
        executionFence,
        'REPORT',
        signal,
        async () =>
          this.createReportArtifacts({
            organizationId,
            runId: run.id,
            workspaceId: run.workspaceId,
            businessDate: context.businessDate,
            timezone: context.timezone,
            scoringVersionId: run.scoringVersion!.id,
            partialData,
            ranked,
            createdBy: run.createdBy,
          }),
      );
      const runtime = this.record(configSnapshot.runtime);
      const feedbackCandidates = this.feedbackCandidates(ranked);
      const shouldCreateFeedback =
        ['PILOT', 'GENERAL'].includes(String(runtime.mode)) &&
        feedbackCandidates.length > 0;
      if (shouldCreateFeedback) {
        await this.runStage(
          organizationId,
          run.id,
          executionFence,
          'FEEDBACK',
          signal,
          async () => {
            await this.createReviewTasksAndNotification(
              organizationId,
              run.id,
              run.createdBy,
              feedbackCandidates,
            );
            return {
              reviewCandidateCount: feedbackCandidates.length,
              manualPricingReviewCount: feedbackCandidates.filter(
                (item) => item.manualPricingRequired,
              ).length,
            };
          },
        );
      } else {
        signal?.throwIfAborted();
        await this.throwIfCancelled(organizationId, run.id);
        const feedbackBoundary = await this.markStage(
          organizationId,
          run.id,
          executionFence,
          'FEEDBACK',
          'SKIPPED',
          {
            reason: 'No FEEDBACK action is required for this run.',
          },
        );
        this.throwIfControlBoundary(feedbackBoundary);
        signal?.throwIfAborted();
        await this.throwIfCancelled(organizationId, run.id);
      }
      const status = partialData ? 'PARTIAL' : 'COMPLETED';
      const completion = await this.tenantDatabase.run(
        organizationId,
        async (tx) => {
          const control = await this.organizationControl.lockEffectiveState(
            tx,
            organizationId,
          );
          if (control.state !== 'RUNNING') {
            const parkedStatus = this.controlRunStatus(control);
            const current = await tx.productResearchRun.findFirst({
              where: { id: run.id, organizationId },
              select: {
                checkpointStage: true,
                checkpointedAt: true,
              },
            });
            const parked = await tx.productResearchRun.updateMany({
              where: {
                id: run.id,
                organizationId,
                status: 'RUNNING',
                leaseOwner: executionFence.leaseOwner,
                executionEpoch: executionFence.executionEpoch,
              },
              data: {
                status: parkedStatus,
                currentStage: null,
                controlRevision: control.revision,
                finishedAt: parkedStatus === 'STOPPED' ? new Date() : null,
                leaseOwner: null,
                leaseExpiresAt: null,
              },
            });
            return {
              kind: 'CONTROL' as const,
              count: parked.count,
              status: parkedStatus,
              controlRevision: control.revision,
              checkpointStage: current?.checkpointStage ?? null,
              checkpointedAt: current?.checkpointedAt ?? null,
            };
          }
          const updated = await tx.productResearchRun.updateMany({
            where: {
              id: run.id,
              organizationId,
              status: 'RUNNING',
              leaseOwner: executionFence.leaseOwner,
              executionEpoch: executionFence.executionEpoch,
            },
            data: {
              status,
              partialData,
              currentStage: null,
              finishedAt: new Date(),
              controlRevision: control.revision,
              leaseOwner: null,
              leaseExpiresAt: null,
              errorSummary: partialErrorSummary
                ? (partialErrorSummary as Prisma.InputJsonValue)
                : Prisma.DbNull,
            },
          });
          return { kind: 'COMPLETED' as const, count: updated.count };
        },
      );
      if (completion.kind === 'CONTROL' && completion.count === 1) {
        return this.controlResult(run.id, completion);
      }
      if (completion.count !== 1) {
        const currentStatus = await this.currentRunStatus(
          organizationId,
          run.id,
        );
        if (currentStatus === 'CANCELLED') {
          return this.cancelledResult(run.id);
        }
        if (currentStatus === 'COMPLETED' || currentStatus === 'PARTIAL') {
          return {
            researchRunId: run.id,
            status: currentStatus,
            reused: true,
          };
        }
        throw new DailyResearchExecutionFenceLostError();
      }
      this.logger.log(
        JSON.stringify({
          event: 'daily_research_run_completed',
          runId: run.id,
          organizationId,
          status,
          processedCount: work.length,
          passedCount: ranked.testNow.length,
          rejectedCount: ranked.rejected.length,
          partialData,
          shortfall: batchShortfall?.shortfall ?? 0,
        }),
      );
      return {
        researchRunId: run.id,
        status,
        report,
        summary: this.rankingSummary(ranked),
        reused: false,
      };
    } catch (error) {
      if (error instanceof DailyResearchControlBoundaryError) {
        return this.controlResult(run.id, error);
      }
      const caughtState = await this.currentRunState(organizationId, run.id);
      if (caughtState?.status === 'CANCELLED') {
        return this.cancelledResult(run.id);
      }
      if (
        caughtState?.status === 'PAUSED' ||
        caughtState?.status === 'STOPPED'
      ) {
        return this.controlResult(run.id, {
          status: caughtState.status,
          controlRevision: caughtState.controlRevision,
          checkpointStage: caughtState.checkpointStage,
          checkpointedAt: caughtState.checkpointedAt,
        });
      }
      if (error instanceof DailyResearchExecutionFenceLostError) {
        this.logger.warn(
          JSON.stringify({
            event: 'daily_research_execution_fence_lost',
            runId: run.id,
            organizationId,
          }),
        );
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Daily research failed';
      const failed = await this.tenantDatabase.run(
        organizationId,
        async (tx) => {
          const control = await this.organizationControl.lockEffectiveState(
            tx,
            organizationId,
          );
          if (control.state !== 'RUNNING') {
            const parkedStatus = this.controlRunStatus(control);
            const current = await tx.productResearchRun.findFirst({
              where: { id: run.id, organizationId },
              select: {
                checkpointStage: true,
                checkpointedAt: true,
              },
            });
            const parked = await tx.productResearchRun.updateMany({
              where: {
                id: run.id,
                organizationId,
                status: 'RUNNING',
                leaseOwner: executionFence.leaseOwner,
                executionEpoch: executionFence.executionEpoch,
              },
              data: {
                status: parkedStatus,
                currentStage: null,
                controlRevision: control.revision,
                finishedAt: parkedStatus === 'STOPPED' ? new Date() : null,
                leaseOwner: null,
                leaseExpiresAt: null,
              },
            });
            return {
              kind: 'CONTROL' as const,
              count: parked.count,
              status: parkedStatus,
              controlRevision: control.revision,
              checkpointStage: current?.checkpointStage ?? null,
              checkpointedAt: current?.checkpointedAt ?? null,
            };
          }
          const updated = await tx.productResearchRun.updateMany({
            where: {
              id: run.id,
              organizationId,
              status: 'RUNNING',
              leaseOwner: executionFence.leaseOwner,
              executionEpoch: executionFence.executionEpoch,
            },
            data: {
              status: 'FAILED',
              finishedAt: new Date(),
              currentStage: null,
              controlRevision: control.revision,
              leaseOwner: null,
              leaseExpiresAt: null,
              errorSummary: {
                code: 'DAILY_RESEARCH_PIPELINE_FAILED',
                message: message.slice(0, 500),
              },
            },
          });
          return { kind: 'FAILED' as const, count: updated.count };
        },
      );
      if (failed.kind === 'CONTROL' && failed.count === 1) {
        return this.controlResult(run.id, failed);
      }
      if (failed.count !== 1) {
        const current = await this.currentRunState(organizationId, run.id);
        if (current?.status === 'CANCELLED') {
          return this.cancelledResult(run.id);
        }
        if (current?.status === 'PAUSED' || current?.status === 'STOPPED') {
          return this.controlResult(run.id, {
            status: current.status,
            controlRevision: current.controlRevision,
            checkpointStage: current.checkpointStage,
            checkpointedAt: current.checkpointedAt,
          });
        }
        if (current?.status === 'COMPLETED' || current?.status === 'PARTIAL') {
          return {
            researchRunId: run.id,
            status: current.status,
            reused: true,
          };
        }
      }
      this.logger.error(
        JSON.stringify({
          event: 'daily_research_run_failed',
          runId: run.id,
          organizationId,
          errorCode: 'DAILY_RESEARCH_PIPELINE_FAILED',
          errorMessage: message.slice(0, 500),
        }),
      );
      throw error;
    }
  }

  private async runStage<T>(
    organizationId: string,
    runId: string,
    executionFence: DailyResearchExecutionFence,
    stage: ProductResearchStage,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    signal?.throwIfAborted();
    try {
      await this.throwIfCancelled(organizationId, runId);
    } catch (error) {
      if (error instanceof DailyResearchRunCancelledError) {
        await this.markStage(
          organizationId,
          runId,
          executionFence,
          stage,
          'SKIPPED',
          {
            reason: 'RUN_CANCELLED_BEFORE_STAGE_OPERATION',
          },
        );
      }
      throw error;
    }
    signal?.throwIfAborted();
    const stageStarted = await this.markStage(
      organizationId,
      runId,
      executionFence,
      stage,
      'RUNNING',
    );
    this.throwIfControlBoundary(stageStarted);
    if (!stageStarted.active) {
      throw new DailyResearchExecutionFenceLostError();
    }
    signal?.throwIfAborted();
    const started = Date.now();
    this.logger.log(
      JSON.stringify({
        event: 'daily_research_stage_started',
        runId,
        organizationId,
        stage,
      }),
    );
    let result: T;
    try {
      result = await operation();
      signal?.throwIfAborted();
    } catch (error) {
      const durationMs = Date.now() - started;
      const errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : 'Stage failed';
      const failedBoundary = await this.markStage(
        organizationId,
        runId,
        executionFence,
        stage,
        'FAILED',
        {
          durationMs,
          errorCode: 'STAGE_EXECUTION_FAILED',
          errorMessage,
        },
      );
      if (!failedBoundary.active) {
        throw new DailyResearchExecutionFenceLostError();
      }
      this.logger.error(
        JSON.stringify({
          event: 'daily_research_stage_failed',
          runId,
          organizationId,
          stage,
          durationMs,
          errorCode: 'STAGE_EXECUTION_FAILED',
          errorMessage,
        }),
      );
      this.throwIfControlBoundary(failedBoundary);
      throw error;
    }
    const durationMs = Date.now() - started;
    const persistedOutput =
      stage === 'COLLECT'
        ? this.collectSnapshot(result)
        : stage === 'NORMALIZE'
          ? this.normalizationOutputSummary(result)
          : this.outputSummary(result);
    const logOutput =
      stage === 'COLLECT' ? this.outputSummary(result) : persistedOutput;
    const completedBoundary = await this.markStage(
      organizationId,
      runId,
      executionFence,
      stage,
      'COMPLETED',
      {
        durationMs,
        output: persistedOutput,
      },
    );
    if (!completedBoundary.active) {
      throw new DailyResearchExecutionFenceLostError();
    }
    this.logger.log(
      JSON.stringify({
        event: 'daily_research_stage_completed',
        runId,
        organizationId,
        stage,
        durationMs,
        output: logOutput,
      }),
    );
    this.throwIfControlBoundary(completedBoundary);
    signal?.throwIfAborted();
    await this.throwIfCancelled(organizationId, runId);
    signal?.throwIfAborted();
    return result;
  }

  private async currentRunStatus(organizationId: string, runId: string) {
    return (await this.currentRunState(organizationId, runId))?.status ?? null;
  }

  private async currentRunState(organizationId: string, runId: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchRun.findFirst({
        where: { id: runId, organizationId },
        select: {
          status: true,
          checkpointStage: true,
          checkpointedAt: true,
          controlRevision: true,
        },
      }),
    );
  }

  private async throwIfCancelled(organizationId: string, runId: string) {
    if ((await this.currentRunStatus(organizationId, runId)) === 'CANCELLED') {
      throw new DailyResearchRunCancelledError();
    }
  }

  private cancelledResult(researchRunId: string) {
    return { researchRunId, status: 'CANCELLED' as const, reused: false };
  }

  private controlRunStatus(
    control: OrganizationAgentControlLock,
  ): DailyResearchControlStatus {
    return control.state === 'STOP_REQUESTED' ? 'STOPPED' : 'PAUSED';
  }

  private controlResult(
    researchRunId: string,
    input: {
      status: DailyResearchControlStatus;
      controlRevision: number;
      checkpointStage: ProductResearchStage | null;
      checkpointedAt: Date | null;
    },
  ) {
    return {
      researchRunId,
      status: input.status,
      reused: false,
      controlRevision: input.controlRevision,
      checkpointStage: input.checkpointStage,
      checkpointedAt: input.checkpointedAt?.toISOString() ?? null,
      resume:
        input.status === 'STOPPED'
          ? {
              supported: false,
              code: 'DAILY_RESEARCH_STOP_IS_NOT_RESUMABLE',
              checkpointStage: input.checkpointStage,
            }
          : {
              supported: true,
              strategy:
                input.checkpointStage === null
                  ? 'START_BEFORE_COLLECT'
                  : 'REPLAY_FROM_DURABLE_COLLECT_SNAPSHOT',
              checkpointStage: input.checkpointStage,
              ...(input.checkpointStage === null
                ? {}
                : {
                    message:
                      'Resume reuses the integrity-checked COLLECT evidence snapshot, then recomputes deterministic downstream stages.',
                  }),
            },
    };
  }

  private staleControlRevisionResult(
    researchRunId: string,
    input: {
      status: string;
      expectedControlRevision: number;
      persistedControlRevision: number;
      actualControlRevision: number;
    },
  ) {
    return {
      researchRunId,
      status: input.status,
      reused: false,
      staleControlRevision: true,
      code: 'DAILY_RESEARCH_STALE_CONTROL_REVISION' as const,
      expectedControlRevision: input.expectedControlRevision,
      persistedControlRevision: input.persistedControlRevision,
      actualControlRevision: input.actualControlRevision,
      message:
        'The queued job belongs to an obsolete organization-control revision and was not claimed.',
    };
  }

  private throwIfControlBoundary(input: {
    control: {
      status: DailyResearchControlStatus;
      controlRevision: number;
      checkpointStage: ProductResearchStage | null;
      checkpointedAt: Date | null;
    } | null;
  }) {
    if (!input.control) return;
    throw new DailyResearchControlBoundaryError(
      input.control.status,
      input.control.controlRevision,
      input.control.checkpointStage,
      input.control.checkpointedAt,
    );
  }

  private executionLeaseExpiry(from: Date): Date {
    return new Date(from.getTime() + DAILY_RESEARCH_EXECUTION_LEASE_MS);
  }

  private async markStage(
    organizationId: string,
    runId: string,
    executionFence: DailyResearchExecutionFence,
    stage: ProductResearchStage,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED',
    details: Record<string, unknown> = {},
  ) {
    const now = new Date();
    return this.tenantDatabase.run(organizationId, async (tx) => {
      const control = await this.organizationControl.lockEffectiveState(
        tx,
        organizationId,
      );
      const current = await tx.productResearchRun.findFirst({
        where: { id: runId, organizationId },
        select: {
          checkpointStage: true,
          checkpointedAt: true,
        },
      });
      const requestedControlStatus =
        control.state === 'RUNNING' ? null : this.controlRunStatus(control);
      const isCheckpointBoundary =
        status === 'COMPLETED' || status === 'SKIPPED';
      const runData: Prisma.ProductResearchRunUpdateManyMutationInput = {
        controlRevision: control.revision,
        currentStage: status === 'RUNNING' ? stage : null,
        leaseExpiresAt: this.executionLeaseExpiry(now),
      };
      if (isCheckpointBoundary) {
        runData.checkpointStage = stage;
        runData.checkpointedAt = now;
      }
      if (requestedControlStatus) {
        runData.status = requestedControlStatus;
        runData.currentStage = null;
        runData.finishedAt = requestedControlStatus === 'STOPPED' ? now : null;
        runData.leaseOwner = null;
        runData.leaseExpiresAt = null;
      }
      let activeRun = await tx.productResearchRun.updateMany({
        where: {
          id: runId,
          organizationId,
          status: 'RUNNING',
          leaseOwner: executionFence.leaseOwner,
          executionEpoch: executionFence.executionEpoch,
        },
        data: runData,
      });
      if (
        activeRun.count !== 1 &&
        status !== 'RUNNING' &&
        !requestedControlStatus
      ) {
        const cancelledRunData: Prisma.ProductResearchRunUpdateManyMutationInput =
          {
            currentStage: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          };
        if (isCheckpointBoundary) {
          cancelledRunData.checkpointStage = stage;
          cancelledRunData.checkpointedAt = now;
        }
        activeRun = await tx.productResearchRun.updateMany({
          where: {
            id: runId,
            organizationId,
            status: 'CANCELLED',
            leaseOwner: executionFence.leaseOwner,
            executionEpoch: executionFence.executionEpoch,
          },
          data: cancelledRunData,
        });
      }
      if (activeRun.count !== 1) {
        return { active: false, control: null };
      }
      const persistedStageStatus =
        status === 'RUNNING' && requestedControlStatus ? 'SKIPPED' : status;
      await tx.productResearchStageRun.update({
        where: {
          researchRunId_stage_attempt: {
            researchRunId: runId,
            stage,
            attempt: 0,
          },
        },
        data: {
          status: persistedStageStatus,
          startedAt: persistedStageStatus === 'RUNNING' ? now : undefined,
          finishedAt: persistedStageStatus !== 'RUNNING' ? now : undefined,
          outputSummary:
            details.output === undefined
              ? undefined
              : (details.output as Prisma.InputJsonValue),
          metrics: { durationMs: details.durationMs ?? null },
          errorCode:
            typeof details.errorCode === 'string' ? details.errorCode : null,
          errorMessage:
            typeof details.errorMessage === 'string'
              ? details.errorMessage
              : null,
        },
      });
      const checkpointStage = isCheckpointBoundary
        ? stage
        : (current?.checkpointStage ?? null);
      const checkpointedAt = isCheckpointBoundary
        ? now
        : (current?.checkpointedAt ?? null);
      return {
        active: activeRun.count === 1,
        control:
          requestedControlStatus && activeRun.count === 1
            ? {
                status: requestedControlStatus,
                controlRevision: control.revision,
                checkpointStage,
                checkpointedAt,
              }
            : null,
      };
    });
  }

  private async normalizeAndPersist(
    organizationId: string,
    runId: string,
    workspaceId: string | null,
    inputs: ExternalCandidate[],
    candidateLimit: number,
  ): Promise<CandidateWork[]> {
    return (
      await this.normalizeAndPersistBatch(
        organizationId,
        runId,
        workspaceId,
        inputs,
        candidateLimit,
      )
    ).candidates;
  }

  private async normalizeAndPersistBatch(
    organizationId: string,
    runId: string,
    workspaceId: string | null,
    inputs: ExternalCandidate[],
    candidateLimit: number,
  ): Promise<NormalizationBatch> {
    const groups = new Map<
      string,
      {
        normalized: ReturnType<NormalizationService['normalize']>;
        inputs: ExternalCandidate[];
      }
    >();
    const groupsByConceptKey = new Map<
      string,
      {
        normalized: ReturnType<NormalizationService['normalize']>;
        inputs: ExternalCandidate[];
      }
    >();
    for (const input of inputs) {
      const evidenceIdentityKey = this.normalization.evidenceIdentityKey(input);
      const normalized = this.normalization.normalize({
        ...input,
        // Explicit global concept groups join source observations, but the
        // candidate fingerprint remains semantic so plural-only concepts from
        // different Agent groups cannot become duplicate candidates.
        identityKey: input.evidenceGroupKey ? null : evidenceIdentityKey,
      });
      const existing =
        groups.get(normalized.fingerprint) ??
        groupsByConceptKey.get(normalized.conceptKey);
      if (existing) existing.inputs.push(input);
      else {
        const group = { normalized, inputs: [input] };
        groups.set(normalized.fingerprint, group);
        groupsByConceptKey.set(normalized.conceptKey, group);
      }
    }
    return this.tenantDatabase.run(organizationId, async (tx) => {
      // Daily research is deliberately serialized at BullMQ concurrency=1.
      // If that invariant changes, this query-before-upsert gate must be
      // replaced by a database-level organization concept registry.
      const historical = await tx.productCandidate.findMany({
        where: {
          organizationId,
          researchRunId: { not: runId },
          OR: [
            { researchRun: { status: { in: ['COMPLETED', 'PARTIAL'] } } },
            { scores: { some: {} } },
          ],
        },
        select: {
          id: true,
          fingerprint: true,
          canonicalName: true,
          productType: true,
          rawSummary: true,
        },
      });
      const historicalByFingerprint = new Map(
        historical.map((candidate) => [candidate.fingerprint, candidate]),
      );
      const historicalByConceptKey = new Map(
        historical.map((candidate) => [
          this.historicalConceptKey(candidate),
          candidate,
        ]),
      );
      const historicalSourcingOfferIds = new Set(
        historical.flatMap((candidate) =>
          this.historicalSourcingOfferIds(candidate.rawSummary),
        ),
      );
      const batchSourcingOfferIds = new Set<string>();
      const touchedHistoricalIds = new Set<string>();
      let backendHistoryExcludedCount = 0;
      let backendHistoricalSourcingOfferExcludedCount = 0;
      let backendDuplicateSourcingOfferCount = 0;
      const work: CandidateWork[] = [];
      for (const group of groups.values()) {
        if (work.length >= candidateLimit) break;
        const historicalMatch =
          historicalByFingerprint.get(group.normalized.fingerprint) ??
          historicalByConceptKey.get(group.normalized.conceptKey);
        if (historicalMatch) {
          backendHistoryExcludedCount += 1;
          if (!touchedHistoricalIds.has(historicalMatch.id)) {
            await tx.productCandidate.updateMany({
              where: { id: historicalMatch.id, organizationId },
              data: { lastSeenAt: new Date() },
            });
            touchedHistoricalIds.add(historicalMatch.id);
          }
          continue;
        }

        const filteredInputs = group.inputs.filter((input) => {
          if (input.source !== '1688_public_sourcing_lead') return true;
          const offerId = canonical1688OfferId(input.url);
          if (!offerId) return false;
          if (historicalSourcingOfferIds.has(offerId)) {
            backendHistoricalSourcingOfferExcludedCount += 1;
            return false;
          }
          if (batchSourcingOfferIds.has(offerId)) {
            backendDuplicateSourcingOfferCount += 1;
            return false;
          }
          batchSourcingOfferIds.add(offerId);
          return true;
        });
        if (filteredInputs.length === 0) continue;
        group.inputs = filteredInputs;
        const representative = group.inputs[0];
        const candidate = await tx.productCandidate.upsert({
          where: {
            researchRunId_fingerprint: {
              researchRunId: runId,
              fingerprint: group.normalized.fingerprint,
            },
          },
          create: {
            organizationId,
            workspaceId,
            researchRunId: runId,
            fingerprint: group.normalized.fingerprint,
            canonicalName: group.normalized.canonicalName,
            productType: group.normalized.productType,
            material: group.normalized.material,
            primaryUse: group.normalized.primaryUse,
            customizationMethod: group.normalized.customizationMethod,
            targetAudience: representative.targetAudience ?? null,
            market: representative.market ?? null,
            sourceCount: new Set(group.inputs.map((item) => item.source)).size,
            dataCompleteness: this.dataCompleteness(representative),
            rawSummary: {
              semanticConceptKey: group.normalized.conceptKey,
              semanticConceptKeyVersion: SEMANTIC_CONCEPT_KEY_VERSION,
              semanticConceptSource: {
                name: representative.name,
                productType: representative.productType,
              },
              sources: group.inputs.map((item) => item.source),
              evidence: group.inputs.map((item) => ({
                source: item.source,
                externalId: item.externalId ?? null,
                conceptKey: item.conceptKey ?? null,
                url: item.url ?? null,
                imageUrl: item.imageUrl ?? null,
                imageEvidenceUrl: item.imageEvidenceUrl ?? null,
                title: item.evidenceTitle ?? null,
                snippet: item.evidenceSnippet ?? null,
                query: item.evidenceQuery ?? null,
                scope: item.evidenceScope ?? null,
                sourcingQueryZh: item.sourcingQueryZh ?? null,
              })),
            },
          },
          update: {
            lastSeenAt: new Date(),
            sourceCount: new Set(group.inputs.map((item) => item.source)).size,
          },
        });
        const signals: DemandSignalInput[] = [];
        for (const sourceInput of group.inputs) {
          for (const signal of sourceInput.signals) {
            const sourceHash = createHash('sha256')
              .update(
                [
                  sourceInput.source,
                  sourceInput.externalId ?? '',
                  signal.metricName,
                  signal.fetchedAt,
                ].join('|'),
              )
              .digest('hex');
            await tx.productSignal.upsert({
              where: {
                candidateId_source_metricName_sourceHash: {
                  candidateId: candidate.id,
                  source: sourceInput.source,
                  metricName: signal.metricName,
                  sourceHash,
                },
              },
              create: {
                organizationId,
                workspaceId,
                researchRunId: runId,
                candidateId: candidate.id,
                source: sourceInput.source,
                provider: sourceInput.provider,
                externalId: sourceInput.externalId ?? null,
                url: sourceInput.url ?? null,
                market: sourceInput.market ?? null,
                metricName: signal.metricName,
                metricValue: signal.metricValue,
                unit: signal.unit ?? null,
                observedAt: new Date(signal.observedAt),
                fetchedAt: new Date(signal.fetchedAt),
                quality: signal.quality,
                sourceHash,
                rawData: {
                  schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
                  evidenceTitle: sourceInput.evidenceTitle ?? null,
                  evidenceSnippet: sourceInput.evidenceSnippet ?? null,
                  evidenceQuery: sourceInput.evidenceQuery ?? null,
                  evidenceScope: sourceInput.evidenceScope ?? null,
                  imageUrl: sourceInput.imageUrl ?? null,
                  imageEvidenceUrl: sourceInput.imageEvidenceUrl ?? null,
                },
              },
              update: {},
            });
            signals.push({
              source: sourceInput.source,
              metricName: signal.metricName,
              metricValue: signal.metricValue,
              quality: signal.quality,
            });
          }
        }
        work.push({
          id: candidate.id,
          fingerprint: candidate.fingerprint,
          conceptKey: group.normalized.conceptKey,
          canonicalName: candidate.canonicalName,
          productType: candidate.productType,
          material: candidate.material,
          primaryUse: candidate.primaryUse,
          customizationMethod: candidate.customizationMethod,
          targetAudience: candidate.targetAudience,
          inputs: group.inputs,
          signals,
        });
      }
      return {
        candidates: work,
        backendHistoryExcludedCount,
        backendHistoricalSourcingOfferExcludedCount,
        backendDuplicateSourcingOfferCount,
      };
    });
  }

  private async loadHistoricalDiscoveryExclusions(
    organizationId: string,
    runId: string,
  ): Promise<{ conceptKeys: string[]; sourcingOfferIds: string[] }> {
    const historical = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productCandidate.findMany({
        where: {
          organizationId,
          researchRunId: { not: runId },
          OR: [
            { researchRun: { status: { in: ['COMPLETED', 'PARTIAL'] } } },
            { scores: { some: {} } },
          ],
        },
        orderBy: { lastSeenAt: 'desc' },
        select: {
          canonicalName: true,
          productType: true,
          rawSummary: true,
        },
      }),
    );
    const conceptKeys = new Set<string>();
    const sourcingOfferIds = new Set<string>();
    for (const candidate of historical) {
      if (conceptKeys.size < 2_000) {
        conceptKeys.add(this.historicalConceptKey(candidate));
      }
      if (sourcingOfferIds.size < 5_000) {
        for (const offerId of this.historicalSourcingOfferIds(
          candidate.rawSummary,
        )) {
          if (sourcingOfferIds.size >= 5_000) break;
          sourcingOfferIds.add(offerId);
        }
      }
      if (conceptKeys.size >= 2_000 && sourcingOfferIds.size >= 5_000) break;
    }
    return {
      conceptKeys: [...conceptKeys],
      sourcingOfferIds: [...sourcingOfferIds],
    };
  }

  private historicalConceptKey(candidate: {
    canonicalName: string;
    productType: string;
    rawSummary: unknown;
  }): string {
    const summary = this.record(candidate.rawSummary);
    const persisted = summary.semanticConceptKey;
    if (
      summary.semanticConceptKeyVersion === SEMANTIC_CONCEPT_KEY_VERSION &&
      typeof persisted === 'string' &&
      persisted.trim()
    ) {
      return persisted.trim();
    }
    const source = this.record(summary.semanticConceptSource);
    const sourceName =
      typeof source.name === 'string' && source.name.trim()
        ? source.name
        : candidate.canonicalName;
    const sourceProductType =
      typeof source.productType === 'string' && source.productType.trim()
        ? source.productType
        : candidate.productType;
    return this.normalization.semanticConceptKey(sourceName, sourceProductType);
  }

  private historicalSourcingOfferIds(rawSummary: unknown): string[] {
    const evidence = this.record(rawSummary).evidence;
    if (!Array.isArray(evidence)) return [];
    const offerIds = new Set<string>();
    for (const value of evidence) {
      const row = this.record(value);
      if (row.source !== '1688_public_sourcing_lead') continue;
      const offerId = canonical1688OfferId(row.url);
      if (offerId) offerIds.add(offerId);
    }
    return [...offerIds];
  }

  private async persistSourceHealth(
    organizationId: string,
    runId: string,
    workspaceId: string | null,
    health: ConnectorHealthResult[],
  ) {
    await this.tenantDatabase.run(organizationId, async (tx) => {
      for (const item of health) {
        await tx.productResearchSourceHealth.upsert({
          where: {
            researchRunId_source: {
              researchRunId: runId,
              source: String(item.source),
            },
          },
          create: {
            organizationId,
            workspaceId,
            researchRunId: runId,
            source: String(item.source),
            status: item.status as never,
            attempts: Number(item.attempts ?? 0),
            requestedAt: item.requestedAt,
            finishedAt: item.finishedAt,
            lastSuccessAt: item.lastSuccessAt ?? null,
            itemCount: Number(item.itemCount ?? 0),
            latencyMs: Number(item.latencyMs ?? 0),
            dataFreshnessSeconds: item.dataFreshnessSeconds ?? null,
            errorCode: item.errorCode ?? null,
            errorMessage: item.errorMessage?.slice(0, 500) ?? null,
            metadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
          },
          update: {
            status: item.status as never,
            attempts: Number(item.attempts ?? 0),
            finishedAt: item.finishedAt,
            lastSuccessAt: item.lastSuccessAt ?? null,
            itemCount: Number(item.itemCount ?? 0),
            latencyMs: Number(item.latencyMs ?? 0),
            dataFreshnessSeconds: item.dataFreshnessSeconds ?? null,
            errorCode: item.errorCode ?? null,
            errorMessage: item.errorMessage?.slice(0, 500) ?? null,
            metadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  private calculateTrustedProfit(inputs: ExternalCandidate[]): {
    profit: ProfitCalculationResult | null;
    hardGateReasons: string[];
  } {
    // Discovery candidates are deliberately not economics evidence. Until the
    // append-only sale-price/rate/FX ledgers are connected, the trusted policy
    // receives no asserted evidence and reports the exact missing families.
    const decision = this.trustedProfitEconomics.deriveCalculationInput({
      evidence: {},
      rawCandidateCosts: inputs.flatMap((input) => input.costs),
      targetCurrency: 'RUB',
      maxEvidenceAgeSeconds: TRUSTED_ECONOMICS_MAX_EVIDENCE_AGE_SECONDS,
    });
    if (!decision.calculationInput) {
      return {
        profit: null,
        hardGateReasons: decision.hardGateReasons,
      };
    }
    return {
      profit: this.profit.calculate(decision.calculationInput),
      hardGateReasons: decision.hardGateReasons,
    };
  }

  private toScoringInput(
    candidate: CandidateWork,
    thresholdsValue: Prisma.JsonValue,
    pricingMode: ResearchPricingMode = 'AUTO',
  ): CandidateScoringInput {
    const thresholds = this.record(thresholdsValue);
    const ozonSampleCounts = candidate.signals
      .filter(
        (signal) =>
          signal.metricName === 'ozon_public_search_result_count' &&
          signal.metricValue !== null,
      )
      .map((signal) => Number(signal.metricValue))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const maximumOzonPublicSearchResults =
      this.number(thresholds.maximumOzonPublicSearchResults) ?? 2;
    const hasProductLink = candidate.inputs.some(
      (input) =>
        input.source !== 'ozon_public_search_sample' && Boolean(input.url),
    );
    const hasProductImage = candidate.inputs.some((input) =>
      Boolean(input.imageUrl),
    );
    const hardGateReasons = [
      ...(candidate.demand?.signalStrength === 'STRONG' ||
      candidate.demand?.signalStrength === 'MEDIUM'
        ? []
        : [`DEMAND_${candidate.demand?.signalStrength ?? 'INVALID'}`]),
      ...this.profitReasons(candidate),
      ...(candidate.risk?.hardGateReasons ?? []),
      ...(ozonSampleCounts.length === 0
        ? ['OZON_PUBLIC_SUPPLY_EVIDENCE_MISSING']
        : Math.min(...ozonSampleCounts) > maximumOzonPublicSearchResults
          ? ['OZON_PUBLIC_SUPPLY_NOT_LOW']
          : []),
      ...(hasProductLink ? [] : ['PRODUCT_LINK_EVIDENCE_MISSING']),
      ...(hasProductImage ? [] : ['PRODUCT_IMAGE_EVIDENCE_MISSING']),
    ];
    const grossMargin = this.number(candidate.profit?.grossMarginBeforeAds);
    const netMargin = this.number(candidate.profit?.netMarginAfterAds);
    const minimumGross =
      this.number(thresholds.minimumGrossMarginBeforeAds) ?? 0.45;
    const minimumNet = this.number(thresholds.minimumNetMarginAfterAds) ?? 0.18;
    if (grossMargin !== null && grossMargin < minimumGross)
      hardGateReasons.push('GROSS_MARGIN_BELOW_THRESHOLD');
    if (netMargin !== null && netMargin < minimumNet)
      hardGateReasons.push('NET_MARGIN_BELOW_THRESHOLD');
    const growthValues = candidate.signals
      .filter(
        (signal) =>
          signal.metricName === 'search_growth' && signal.metricValue !== null,
      )
      .map((signal) => Number(signal.metricValue))
      .filter(Number.isFinite);
    const growth = growthValues.length
      ? Math.max(
          0,
          Math.min(
            100,
            50 +
              growthValues.reduce((sum, value) => sum + value, 0) /
                growthValues.length,
          ),
        )
      : null;
    const severity = candidate.risk?.overallSeverity ?? 'LOW';
    const componentEvidence = candidate.inputs
      .map((input) => input.componentEvidence)
      .filter(
        (value): value is NonNullable<ExternalCandidate['componentEvidence']> =>
          Boolean(value),
      );
    const evidencedScore = (
      component: 'customization' | 'visual' | 'feasibility' | 'lifecycle',
    ) => {
      const scores = componentEvidence
        .map((evidence) => evidence[component]?.score)
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isFinite(value),
        );
      return scores.length === 0
        ? null
        : Math.round(
            (scores.reduce((sum, value) => sum + value, 0) / scores.length) *
              100,
          ) / 100;
    };
    return {
      candidateId: candidate.id,
      fingerprint: candidate.fingerprint,
      componentScores: {
        demand: candidate.demand?.confidenceScore ?? null,
        growth,
        competition: candidate.competition?.entryOpportunityScore ?? null,
        profit:
          netMargin === null
            ? null
            : Math.max(0, Math.min(100, netMargin * 200)),
        customization: evidencedScore('customization'),
        visual: evidencedScore('visual'),
        feasibility: evidencedScore('feasibility'),
        lifecycle: evidencedScore('lifecycle'),
        safety: severity === 'LOW' ? 100 : severity === 'MEDIUM' ? 50 : 0,
      },
      hardGateReasons: [...new Set(hardGateReasons)],
      confidenceScore: candidate.demand?.confidenceScore ?? 0,
      manualReviewEligible: pricingMode === 'MANUAL',
    };
  }

  private async persistScores(
    organizationId: string,
    runId: string,
    workspaceId: string | null,
    scoringVersionId: string,
    ranked: ReturnType<ScoringService['rank']>,
  ) {
    const all = [
      ...ranked.testNow,
      ...ranked.watch,
      ...ranked.hold,
      ...ranked.rejected,
    ];
    await this.tenantDatabase.run(organizationId, async (tx) => {
      for (const score of all) {
        await tx.productScore.upsert({
          where: {
            candidateId_scoringVersionId: {
              candidateId: score.candidateId,
              scoringVersionId,
            },
          },
          create: {
            organizationId,
            workspaceId,
            researchRunId: runId,
            candidateId: score.candidateId,
            scoringVersionId,
            componentScores: score.componentScores,
            rawTotal: score.rawTotal.toFixed(2),
            finalScore: score.finalScore.toFixed(2),
            hardGateStatus: score.hardGateReasons.length ? 'BLOCKED' : 'PASSED',
            hardGateReasons: score.hardGateReasons,
            confidenceScore: score.confidenceScore,
            missingDataPenalties: score.missingComponents,
            rank: score.rank,
            decision: score.decision,
            explanation: {
              missingComponents: score.missingComponents,
              manualReviewEligible: score.manualReviewEligible === true,
              schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
            },
          },
          update: {
            researchRunId: runId,
            componentScores: score.componentScores,
            rawTotal: score.rawTotal.toFixed(2),
            finalScore: score.finalScore.toFixed(2),
            hardGateStatus: score.hardGateReasons.length ? 'BLOCKED' : 'PASSED',
            hardGateReasons: score.hardGateReasons,
            confidenceScore: score.confidenceScore,
            missingDataPenalties: score.missingComponents,
            rank: score.rank,
            decision: score.decision,
            explanation: {
              missingComponents: score.missingComponents,
              manualReviewEligible: score.manualReviewEligible === true,
              schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
            },
          },
        });
        await tx.productCandidate.update({
          where: { id: score.candidateId },
          data: {
            status:
              score.decision === 'TEST_NOW'
                ? 'RECOMMENDED'
                : score.decision === 'WATCH'
                  ? 'WATCH'
                  : score.decision === 'HOLD'
                    ? 'HOLD'
                    : 'REJECTED',
          },
        });
      }
    });
  }

  private async createReportArtifacts(input: {
    organizationId: string;
    runId: string;
    workspaceId: string | null;
    businessDate: string;
    timezone: string;
    scoringVersionId: string;
    partialData: boolean;
    ranked: ReturnType<ScoringService['rank']>;
    createdBy: string;
  }) {
    const [candidates, sourceHealth, risks, stages] =
      await this.tenantDatabase.run(input.organizationId, (tx) =>
        Promise.all([
          tx.productCandidate.findMany({
            where: { researchRunId: input.runId },
            select: { id: true, canonicalName: true },
          }),
          tx.productResearchSourceHealth.findMany({
            where: { researchRunId: input.runId },
            orderBy: { source: 'asc' },
          }),
          tx.productRiskRecord.findMany({
            where: { researchRunId: input.runId },
            orderBy: { createdAt: 'asc' },
          }),
          tx.productResearchStageRun.findMany({
            where: { researchRunId: input.runId },
            orderBy: { createdAt: 'asc' },
          }),
        ]),
      );
    const names = new Map(
      candidates.map((candidate) => [candidate.id, candidate.canonicalName]),
    );
    const mapItems = (
      items: Array<{
        candidateId: string;
        finalScore: number;
        decision: string;
        hardGateReasons: string[];
        rank: number | null;
      }>,
    ) =>
      items.map((item) => ({
        candidateId: item.candidateId,
        canonicalName: names.get(item.candidateId) ?? 'unknown',
        finalScore: item.finalScore,
        decision: item.decision,
        rank: item.rank,
        hardGateReasons: item.hardGateReasons,
      }));
    const report = this.reportRenderer.render({
      businessDate: input.businessDate,
      timezone: input.timezone,
      runStatus: input.partialData ? 'PARTIAL' : 'COMPLETED',
      partialData: input.partialData,
      scoringVersion: input.scoringVersionId,
      sourceHealth: sourceHealth.map((item) => ({
        source: item.source,
        status: item.status,
      })),
      testNow: mapItems(input.ranked.testNow),
      watch: mapItems(input.ranked.watch),
      hold: mapItems(input.ranked.hold),
      rejected: mapItems(input.ranked.rejected),
    });
    const artifacts = [
      { type: 'TOP_MD', file: 'daily-top10.md', content: report.markdown },
      {
        type: 'TOP_JSON',
        file: 'daily-top10.json',
        content: this.json(report.topJson),
      },
      {
        type: 'WATCHLIST_JSON',
        file: 'watchlist.json',
        content: this.json({
          schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          items: mapItems(input.ranked.watch),
        }),
      },
      {
        type: 'REJECTED_JSON',
        file: 'rejected.json',
        content: this.json({
          schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          hold: mapItems(input.ranked.hold),
          rejected: mapItems(input.ranked.rejected),
        }),
      },
      {
        type: 'RISK_JSON',
        file: 'risk-report.json',
        content: this.json({
          schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          items: risks,
        }),
      },
      {
        type: 'SOURCE_HEALTH_JSON',
        file: 'source-health.json',
        content: this.json({
          schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          items: sourceHealth,
        }),
      },
      {
        type: 'RUN_LOG_JSON',
        file: 'run-log.json',
        content: this.json({
          schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
          stages,
        }),
      },
    ] as const;
    await this.tenantDatabase.run(input.organizationId, async (tx) => {
      for (const artifact of artifacts) {
        const stored = await this.artifactStore.write({
          organizationId: input.organizationId,
          runId: input.runId,
          fileName: artifact.file,
          content: artifact.content,
        });
        await tx.researchReportArtifact.upsert({
          where: {
            researchRunId_artifactType: {
              researchRunId: input.runId,
              artifactType: artifact.type,
            },
          },
          create: {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            researchRunId: input.runId,
            artifactType: artifact.type,
            schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
            ...stored,
          },
          update: { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION, ...stored },
        });
      }
      const summary = this.rankingSummary(input.ranked);
      await tx.productResearchReport.upsert({
        where: { researchRunId: input.runId },
        create: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          researchRunId: input.runId,
          query: `Daily product research ${input.businessDate}`,
          platform: 'MULTI',
          filters: { schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION },
          summary: input.ranked.testNow.length
            ? `${input.ranked.testNow.length} evidence-backed candidates require human review.`
            : 'No candidate passed all hard gates.',
          opportunities: {
            competitors: mapItems(input.ranked.testNow).map(
              (item) => item.canonicalName,
            ),
            dailyResearch: summary,
          },
          status: 'COMPLETED',
          createdBy: input.createdBy,
        },
        update: {
          status: 'COMPLETED',
          opportunities: {
            competitors: mapItems(input.ranked.testNow).map(
              (item) => item.canonicalName,
            ),
            dailyResearch: summary,
          },
        },
      });
    });
    return {
      artifactCount: artifacts.length,
      topCount: input.ranked.testNow.length,
    };
  }

  private async createReviewTasksAndNotification(
    organizationId: string,
    runId: string,
    userId: string,
    reviewCandidates: FeedbackCandidate[],
  ) {
    if (reviewCandidates.length === 0) return;
    await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        for (const item of reviewCandidates) {
          const existing = await tx.reviewTask.findFirst({
            where: {
              organizationId,
              entityType: 'PRODUCT_RESEARCH',
              entityId: item.candidateId,
              decisionEvidence: {
                path: ['researchRunId'],
                equals: runId,
              },
            },
          });
          if (!existing) {
            await tx.reviewTask.create({
              data: {
                organizationId,
                entityType: 'PRODUCT_RESEARCH',
                entityId: item.candidateId,
                score: item.finalScore,
                threshold: 80,
                autoApproved: false,
                approvalScope: {
                  action: item.manualPricingRequired
                    ? 'collect_manual_pricing_and_risk_evidence'
                    : 'create_internal_development_task',
                  externalStoreMutation: false,
                },
                decisionEvidence: {
                  researchRunId: runId,
                  candidateId: item.candidateId,
                  reviewReason: item.reviewReason,
                  manualPricingRequired: item.manualPricingRequired,
                  hardGateReasons: item.hardGateReasons,
                },
              },
            });
          }
        }
        const existingNotification = await tx.notification.findFirst({
          where: {
            organizationId,
            userId,
            type: 'APPROVAL_REQUIRED',
            metadata: { path: ['researchRunId'], equals: runId },
          },
        });
        if (existingNotification) return;
        const manualPricingReviewCount = reviewCandidates.filter(
          (item) => item.manualPricingRequired,
        ).length;
        const gatePassedReviewCount =
          reviewCandidates.length - manualPricingReviewCount;
        await tx.notification.create({
          data: {
            organizationId,
            userId,
            type: 'APPROVAL_REQUIRED',
            title: '每日选品结果等待人工审核',
            body:
              manualPricingReviewCount > 0
                ? `${reviewCandidates.length} 个候选等待人工审核，其中 ${manualPricingReviewCount} 个需要人工核价或补充风险证据；审核不会写入外部店铺。`
                : `${gatePassedReviewCount} 个候选通过证据、利润和风险门禁。批准仅创建内部开发任务，不会写入外部店铺。`,
            metadata: {
              kind: 'daily_product_research',
              researchRunId: runId,
              candidateIds: reviewCandidates.map((item) => item.candidateId),
              gatePassedReviewCount,
              manualPricingReviewCount,
              targetRoute: `/daily-product-research/runs/${runId}`,
              externalStoreMutation: false,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private feedbackCandidates(
    ranked: Pick<ReturnType<ScoringService['rank']>, 'testNow' | 'hold'>,
  ): FeedbackCandidate[] {
    const gatePassed = ranked.testNow.map((item) => ({
      candidateId: item.candidateId,
      finalScore: item.finalScore,
      hardGateReasons: [...item.hardGateReasons],
      reviewReason: 'ALL_GATES_PASSED' as const,
      manualPricingRequired: false,
    }));
    const manualPricing = ranked.hold
      .filter(
        (item) =>
          item.manualReviewEligible === true &&
          item.hardGateReasons.includes('MANUAL_PRICING_REQUIRED'),
      )
      .map((item) => ({
        candidateId: item.candidateId,
        finalScore: item.finalScore,
        hardGateReasons: [...item.hardGateReasons],
        reviewReason: 'MANUAL_PRICING_REQUIRED' as const,
        manualPricingRequired: true,
      }));
    return [...gatePassed, ...manualPricing];
  }

  private async persistWorkSummary(
    organizationId: string,
    work: CandidateWork[],
    field: 'keywords' | 'competition' | 'profit',
    pricingMode: ResearchPricingMode = 'AUTO',
  ) {
    await this.tenantDatabase.run(organizationId, async (tx) => {
      for (const candidate of work) {
        const existing = await tx.productCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
          select: { rawSummary: true },
        });
        const rawSummary = {
          ...this.record(existing.rawSummary),
          [field]: candidate[field],
        } as Record<string, unknown>;
        if (field === 'profit') {
          const hardGateReasons = this.profitReasons(candidate);
          rawSummary.profitReadiness = {
            status:
              pricingMode === 'MANUAL'
                ? 'MANUAL_REVIEW_REQUIRED'
                : candidate.profit && hardGateReasons.length === 0
                  ? 'VERIFIED'
                  : 'BLOCKED',
            pricingMode,
            hardGateReasons,
          };
        }
        await tx.productCandidate.update({
          where: { id: candidate.id },
          data: {
            rawSummary: rawSummary as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  private profitReasons(candidate: CandidateWork): string[] {
    const reasons = [
      ...(candidate.profitHardGateReasons ?? []),
      ...(candidate.profit?.hardGateReasons ?? []),
    ];
    if (reasons.length === 0 && !candidate.profit) {
      reasons.push('MISSING_VERIFIED_PROFIT');
    }
    return [...new Set(reasons)];
  }

  private dataCompleteness(input: ExternalCandidate): number {
    const fields = [
      input.name,
      input.productType,
      input.material,
      input.primaryUse,
      input.customizationMethod,
      input.targetAudience,
      input.salePrice,
    ];
    return (
      Math.round(
        (fields.filter(
          (value) => value !== null && value !== undefined && value !== '',
        ).length /
          fields.length) *
          100,
      ) / 100
    );
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private sourceEnabled(
    configSnapshot: Record<string, unknown>,
    source: string,
  ): boolean {
    return (
      Array.isArray(configSnapshot.enabledSources) &&
      configSnapshot.enabledSources.some((item) => item === source)
    );
  }

  private disabledSupplierImageSearchHealth(
    configSnapshot: Record<string, unknown>,
  ): ConnectorHealthResult {
    const now = new Date();
    const runtime = this.record(configSnapshot.runtime);
    const supplierConfig = this.record(configSnapshot.supplierImageSearch);
    const runtimeDisabled = runtime.realConnectorsAllowed === false;
    const errorMessage = runtimeDisabled
      ? '1688 供应商图片检索被当前运行模式禁用，本轮未调用供应商接口；公开搜索链接仅可作为采购线索，不能作为报价或采购成本证据。'
      : '1688 供应商图片检索未启用，本轮未调用供应商接口；公开搜索链接仅可作为采购线索，不能作为报价或采购成本证据。';

    return {
      source: 'supplier_image_search',
      status: 'DISABLED',
      attempts: 0,
      itemCount: 0,
      requestedAt: now,
      finishedAt: now,
      lastSuccessAt: null,
      latencyMs: 0,
      dataFreshnessSeconds: null,
      errorCode: runtimeDisabled
        ? 'SUPPLIER_IMAGE_SEARCH_RUNTIME_DISABLED'
        : 'SUPPLIER_IMAGE_SEARCH_DISABLED',
      errorMessage,
      metadata: {
        backendEnrichmentEnabled: supplierConfig.enabled === true,
        realConnectorsAllowed: runtime.realConnectorsAllowed === true,
        providerCallAttempted: false,
        evidenceKind: 'IMAGE_SEARCH_DISCOVERY_ONLY',
        canProvideVerifiedSupplierQuote: false,
        public1688LeadPolicy: 'LEAD_ONLY_NOT_QUOTE',
        messageZh: errorMessage,
      },
    };
  }

  private riskFindingSource(finding: RiskFindingInput): string {
    if (finding.riskType !== 'RISK_CLEARANCE_ATTESTED') {
      return finding.ruleVersion;
    }
    const attestation = this.record(
      this.record(finding.evidencePayload).attestation,
    );
    return typeof attestation.provider === 'string' &&
      attestation.provider.trim()
      ? attestation.provider.trim()
      : 'INVALID_RISK_CLEARANCE_PROVIDER';
  }

  private riskRecordKey(row: {
    riskType: string;
    severity: string;
    ruleVersion: string;
    matchedTerm: string | null;
    evidence: unknown;
    source: string | null;
    reviewStatus: string;
  }): string {
    return JSON.stringify(
      this.canonicalRiskValue({
        riskType: row.riskType,
        severity: row.severity,
        ruleVersion: row.ruleVersion,
        matchedTerm: row.matchedTerm,
        evidence: row.evidence,
        source: row.source,
        reviewStatus: row.reviewStatus,
      }),
    );
  }

  private canonicalRiskValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalRiskValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, item]) => [key, this.canonicalRiskValue(item)]),
      );
    }
    return value;
  }

  private number(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private scoringWeights(
    value: Prisma.JsonValue,
  ): Record<ScoreComponent, number> {
    const record = this.record(value);
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, Number(item)]),
    ) as Record<ScoreComponent, number>;
  }

  private decisionThresholds(value: Prisma.JsonValue): ScoringThresholds {
    const record = this.record(value);
    return {
      testNow: Number(record.testNow),
      watch: Number(record.watch),
      hold: Number(record.hold),
    };
  }

  private collectSnapshot(value: unknown): Prisma.InputJsonValue {
    const connectorResults = this.jsonValue(value);
    let itemCount = 0;
    if (Array.isArray(value)) {
      const items: unknown[] = value;
      for (const item of items) {
        const candidates = this.record(item).candidates;
        if (Array.isArray(candidates)) itemCount += candidates.length;
      }
    }
    return {
      schemaVersion: COLLECT_SNAPSHOT_SCHEMA_VERSION,
      itemCount,
      connectorResults,
      sha256: createHash('sha256')
        .update(this.canonicalJson(connectorResults), 'utf8')
        .digest('hex'),
    };
  }

  private async loadCollectSnapshot(
    organizationId: string,
    runId: string,
  ): Promise<ConnectorCollectResult[] | null> {
    const stage = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchStageRun.findUnique({
        where: {
          researchRunId_stage_attempt: {
            researchRunId: runId,
            stage: 'COLLECT',
            attempt: 0,
          },
        },
        select: { outputSummary: true },
      }),
    );
    const snapshot = this.record(stage?.outputSummary);
    if (snapshot.schemaVersion !== COLLECT_SNAPSHOT_SCHEMA_VERSION) return null;
    if (!Array.isArray(snapshot.connectorResults)) return null;
    if (typeof snapshot.sha256 !== 'string') return null;
    const actualHash = createHash('sha256')
      .update(this.canonicalJson(snapshot.connectorResults), 'utf8')
      .digest('hex');
    if (actualHash !== snapshot.sha256) {
      throw new Error('DAILY_RESEARCH_COLLECT_SNAPSHOT_INTEGRITY_FAILED');
    }

    const parsed: ConnectorCollectResult[] = [];
    for (const item of snapshot.connectorResults) {
      const record = this.record(item);
      const candidates = externalCandidateListSchema.safeParse(
        record.candidates,
      );
      const health = this.parseCollectHealth(record.health);
      if (!candidates.success || !health) {
        throw new Error('DAILY_RESEARCH_COLLECT_SNAPSHOT_INVALID');
      }
      parsed.push({ candidates: candidates.data, health });
    }
    return parsed;
  }

  private parseCollectHealth(value: unknown): ConnectorHealthResult | null {
    const health = this.record(value);
    const requestedAt = this.snapshotDate(health.requestedAt);
    const finishedAt = this.snapshotDate(health.finishedAt);
    const lastSuccessAt =
      health.lastSuccessAt === null || health.lastSuccessAt === undefined
        ? null
        : this.snapshotDate(health.lastSuccessAt);
    const attempts = this.number(health.attempts);
    const itemCount = this.number(health.itemCount);
    const latencyMs = this.number(health.latencyMs);
    const statuses: ConnectorHealthResult['status'][] = [
      'HEALTHY',
      'DEGRADED',
      'FAILED',
      'DISABLED',
      'NOT_CONFIGURED',
      'CSV_ONLY',
    ];
    if (
      typeof health.source !== 'string' ||
      !statuses.includes(health.status as ConnectorHealthResult['status']) ||
      !requestedAt ||
      !finishedAt ||
      (health.lastSuccessAt !== null &&
        health.lastSuccessAt !== undefined &&
        !lastSuccessAt) ||
      attempts === null ||
      itemCount === null ||
      latencyMs === null
    ) {
      return null;
    }
    return {
      source: health.source,
      status: health.status as ConnectorHealthResult['status'],
      attempts,
      itemCount,
      requestedAt,
      finishedAt,
      lastSuccessAt,
      latencyMs,
      dataFreshnessSeconds: this.number(health.dataFreshnessSeconds),
      errorCode: typeof health.errorCode === 'string' ? health.errorCode : null,
      errorMessage:
        typeof health.errorMessage === 'string' ? health.errorMessage : null,
      metadata: this.record(health.metadata),
    };
  }

  private snapshotDate(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private canonicalJson(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(
          ([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private outputSummary(value: unknown): Prisma.InputJsonValue {
    if (Array.isArray(value)) return { itemCount: value.length };
    if (value && typeof value === 'object') return this.jsonValue(value);
    if (
      value === null ||
      ['string', 'number', 'boolean'].includes(typeof value)
    ) {
      return { value: value as string | number | boolean | null };
    }
    return { value: typeof value === 'bigint' ? value.toString() : null };
  }

  private normalizationOutputSummary(value: unknown): Prisma.InputJsonValue {
    const batch = this.record(value);
    const candidates = batch.candidates;
    return {
      itemCount: Array.isArray(candidates) ? candidates.length : 0,
      backendHistoryExcludedCount:
        this.number(batch.backendHistoryExcludedCount) ?? 0,
      backendHistoricalSourcingOfferExcludedCount:
        this.number(batch.backendHistoricalSourcingOfferExcludedCount) ?? 0,
      backendDuplicateSourcingOfferCount:
        this.number(batch.backendDuplicateSourcingOfferCount) ?? 0,
    };
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    const parsed: unknown = JSON.parse(
      JSON.stringify(value, (_key: string, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    );
    return parsed as Prisma.InputJsonValue;
  }

  private json(value: unknown): string {
    return `${JSON.stringify(
      value,
      (_key: string, item: unknown) => {
        if (typeof item === 'bigint') return item.toString();
        if (item instanceof Prisma.Decimal) return item.toString();
        return item;
      },
      2,
    )}\n`;
  }

  private rankingSummary(ranked: ReturnType<ScoringService['rank']>) {
    return {
      testNow: ranked.testNow.length,
      watch: ranked.watch.length,
      hold: ranked.hold.length,
      rejected: ranked.rejected.length,
    };
  }
}
