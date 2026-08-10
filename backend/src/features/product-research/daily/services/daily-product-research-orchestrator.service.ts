import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type ProductResearchStage } from '@prisma/client';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import { DAILY_RESEARCH_SCHEMA_VERSION } from '../contracts/daily-product-research.contract.js';
import type { ExternalCandidate } from '../contracts/external-candidate.contract.js';
import { ConnectorRegistryService } from '../connectors/connector-registry.service.js';
import type { ConnectorHealthResult } from '../connectors/product-research-connector.js';
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
import { RiskAnalysisService } from './risk-analysis.service.js';
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

type CandidateWork = {
  id: string;
  fingerprint: string;
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
  ) {}

  async execute(organizationId: string, researchRunId: string) {
    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchRun.findFirst({
        where: { id: researchRunId, organizationId },
        include: { scoringVersion: true },
      }),
    );
    if (!run) throw new Error('DAILY_RESEARCH_RUN_NOT_FOUND');
    if (['COMPLETED', 'PARTIAL', 'CANCELLED'].includes(run.status)) {
      return { researchRunId: run.id, status: run.status, reused: true };
    }
    if (!run.scoringVersion)
      throw new Error('DAILY_RESEARCH_SCORING_VERSION_MISSING');

    const workspaceProfile = run.workspaceId
      ? await this.tenantDatabase.run(organizationId, (tx) =>
          tx.storeAgentProfile.findUnique({
            where: { workspaceId: run.workspaceId! },
          }),
        )
      : null;
    const configSnapshot = this.record(run.configSnapshot);
    const context = {
      organizationId,
      workspaceId: run.workspaceId,
      businessDate: run.businessDate.toISOString().slice(0, 10),
      timezone: run.scheduleTimezone,
      candidateLimit: run.candidateLimit,
      configSnapshot,
      forbiddenTerms: workspaceProfile?.forbiddenTerms ?? [],
    };

    await this.tenantDatabase.run(organizationId, async (tx) => {
      await tx.productResearchRun.update({
        where: { id: run.id },
        data: {
          status: 'RUNNING',
          startedAt: run.startedAt ?? new Date(),
          errorSummary: Prisma.DbNull,
        },
      });
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
    });

    try {
      const connectorResults = await this.runStage(
        organizationId,
        run.id,
        'COLLECT',
        async () => {
          const results = await this.connectorRegistry.collect({
            organizationId,
            workspaceId: run.workspaceId,
            businessDate: context.businessDate,
            timezone: context.timezone,
            candidateLimit: run.candidateLimit,
            configSnapshot,
          });
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
      const rawCandidates = connectorResults
        .flatMap((result) => result.candidates)
        .slice(0, run.candidateLimit);

      const work = await this.runStage(
        organizationId,
        run.id,
        'NORMALIZE',
        () =>
          this.normalizeAndPersist(
            organizationId,
            run.id,
            run.workspaceId,
            rawCandidates,
          ),
      );

      if (this.sourceEnabled(configSnapshot, 'supplier_image_search')) {
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
          candidates: work.map((candidate) => ({
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
        partialData = partialData || enrichment.partial;
      }

      await this.runStage(organizationId, run.id, 'KEYWORDS', async () => {
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
      });

      await this.runStage(organizationId, run.id, 'DEMAND', async () => {
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
      });

      await this.runStage(organizationId, run.id, 'COMPETITION', async () => {
        for (const candidate of work)
          candidate.competition = this.competition.analyze(candidate.signals);
        await this.persistWorkSummary(organizationId, work, 'competition');
        return { candidates: work.length };
      });

      await this.runStage(organizationId, run.id, 'PROFIT', async () => {
        for (const candidate of work) {
          const decision = this.calculateTrustedProfit(candidate.inputs);
          candidate.profit = decision.profit;
          candidate.profitHardGateReasons = decision.hardGateReasons;
        }
        await this.persistWorkSummary(organizationId, work, 'profit');
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
          verifiedCount,
          blockedCount: work.length - verifiedCount,
          reasonCounts,
        };
      });

      await this.runStage(organizationId, run.id, 'RISK', async () => {
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
            await tx.productRiskRecord.deleteMany({
              where: { candidateId: candidate.id },
            });
            if (findings.length > 0) {
              await tx.productRiskRecord.createMany({
                data: findings.map((finding) => ({
                  organizationId,
                  workspaceId: run.workspaceId,
                  researchRunId: run.id,
                  candidateId: candidate.id,
                  riskType: finding.riskType,
                  severity: finding.severity,
                  ruleVersion: finding.ruleVersion,
                  matchedTerm: finding.matchedTerm ?? null,
                  evidence: { summary: finding.evidence },
                  source: finding.ruleVersion,
                  reviewStatus:
                    finding.severity === 'LOW' ? 'AUTO' : 'NEEDS_REVIEW',
                })),
              });
            }
          }
        });
        return { candidates: work.length };
      });

      const ranked = await this.runStage(
        organizationId,
        run.id,
        'SCORE',
        async () => {
          const inputs = work.map((candidate) =>
            this.toScoringInput(candidate, run.scoringVersion!.thresholds),
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
        'REPORT',
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
      await this.markStage(organizationId, run.id, 'FEEDBACK', 'SKIPPED', {
        reason:
          'Feedback is ingested from later business events, not fabricated during research.',
      });
      const status = partialData ? 'PARTIAL' : 'COMPLETED';
      await this.tenantDatabase.run(organizationId, (tx) =>
        tx.productResearchRun.update({
          where: { id: run.id },
          data: {
            status,
            partialData,
            currentStage: null,
            finishedAt: new Date(),
          },
        }),
      );
      const runtime = this.record(configSnapshot.runtime);
      if (['PILOT', 'GENERAL'].includes(String(runtime.mode))) {
        await this.createReviewTasksAndNotification(
          organizationId,
          run.id,
          run.createdBy,
          ranked.testNow,
        );
      }
      return {
        researchRunId: run.id,
        status,
        report,
        summary: this.rankingSummary(ranked),
        reused: false,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Daily research failed';
      await this.tenantDatabase.run(organizationId, (tx) =>
        tx.productResearchRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorSummary: {
              code: 'DAILY_RESEARCH_PIPELINE_FAILED',
              message: message.slice(0, 500),
            },
          },
        }),
      );
      this.logger.error(`Daily research run ${run.id} failed: ${message}`);
      throw error;
    }
  }

  private async runStage<T>(
    organizationId: string,
    runId: string,
    stage: ProductResearchStage,
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.markStage(organizationId, runId, stage, 'RUNNING');
    const started = Date.now();
    try {
      const result = await operation();
      await this.markStage(organizationId, runId, stage, 'COMPLETED', {
        durationMs: Date.now() - started,
        output: this.outputSummary(result),
      });
      return result;
    } catch (error) {
      await this.markStage(organizationId, runId, stage, 'FAILED', {
        durationMs: Date.now() - started,
        errorCode: 'STAGE_EXECUTION_FAILED',
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : 'Stage failed',
      });
      throw error;
    }
  }

  private async markStage(
    organizationId: string,
    runId: string,
    stage: ProductResearchStage,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED',
    details: Record<string, unknown> = {},
  ) {
    const now = new Date();
    await this.tenantDatabase.run(organizationId, async (tx) => {
      await tx.productResearchRun.update({
        where: { id: runId },
        data: { currentStage: status === 'RUNNING' ? stage : undefined },
      });
      await tx.productResearchStageRun.update({
        where: {
          researchRunId_stage_attempt: {
            researchRunId: runId,
            stage,
            attempt: 0,
          },
        },
        data: {
          status,
          startedAt: status === 'RUNNING' ? now : undefined,
          finishedAt: status !== 'RUNNING' ? now : undefined,
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
    });
  }

  private async normalizeAndPersist(
    organizationId: string,
    runId: string,
    workspaceId: string | null,
    inputs: ExternalCandidate[],
  ): Promise<CandidateWork[]> {
    const groups = new Map<
      string,
      {
        normalized: ReturnType<NormalizationService['normalize']>;
        inputs: ExternalCandidate[];
      }
    >();
    for (const input of inputs) {
      const normalized = this.normalization.normalize({
        ...input,
        identityKey: this.normalization.evidenceIdentityKey(input),
      });
      const existing = groups.get(normalized.fingerprint);
      if (existing) existing.inputs.push(input);
      else groups.set(normalized.fingerprint, { normalized, inputs: [input] });
    }
    return this.tenantDatabase.run(organizationId, async (tx) => {
      const work: CandidateWork[] = [];
      for (const group of groups.values()) {
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
              sources: group.inputs.map((item) => item.source),
              evidence: group.inputs.map((item) => ({
                source: item.source,
                url: item.url ?? null,
                imageUrl: item.imageUrl ?? null,
                imageEvidenceUrl: item.imageEvidenceUrl ?? null,
                title: item.evidenceTitle ?? null,
                snippet: item.evidenceSnippet ?? null,
                query: item.evidenceQuery ?? null,
                scope: item.evidenceScope ?? null,
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
      return work;
    });
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
              schemaVersion: DAILY_RESEARCH_SCHEMA_VERSION,
            },
          },
          update: {},
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
          opportunities: { dailyResearch: summary },
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
    testNow: Array<{ candidateId: string; finalScore: number }>,
  ) {
    if (testNow.length === 0) return;
    await this.tenantDatabase.run(organizationId, async (tx) => {
      for (const item of testNow) {
        const existing = await tx.reviewTask.findFirst({
          where: {
            organizationId,
            entityType: 'PRODUCT_RESEARCH',
            entityId: item.candidateId,
            status: 'PENDING',
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
                action: 'create_internal_development_task',
                externalStoreMutation: false,
              },
              decisionEvidence: {
                researchRunId: runId,
                candidateId: item.candidateId,
              },
            },
          });
        }
      }
      await tx.notification.create({
        data: {
          organizationId,
          userId,
          type: 'APPROVAL_REQUIRED',
          title: 'textproduct researchenglish_texthumanreview',
          body: `${testNow.length} english_textpassedevidence、profittextrisktext。english_texttask，textwritetextstore。`,
          metadata: {
            kind: 'daily_product_research',
            researchRunId: runId,
            candidateIds: testNow.map((item) => item.candidateId),
            targetRoute: `/daily-product-research/runs/${runId}`,
            externalStoreMutation: false,
          },
        },
      });
    });
  }

  private async persistWorkSummary(
    organizationId: string,
    work: CandidateWork[],
    field: 'keywords' | 'competition' | 'profit',
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
              candidate.profit && hardGateReasons.length === 0
                ? 'VERIFIED'
                : 'BLOCKED',
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
