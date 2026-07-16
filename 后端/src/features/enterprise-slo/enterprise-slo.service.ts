import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { resolve } from 'node:path';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { readEnterpriseReadinessEvidence } from './enterprise-readiness-evidence.js';
import { JudgeGoldApprovalService } from './judge-gold-approval.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_DAYS = 14;
const TASK_SUCCESS_TARGET = 98;
const QUALITY_PASS_TARGET = 95;
const AUTONOMOUS_COMPLETION_TARGET = 80;
const SUGGESTION_ADOPTION_TARGET = 50;

type ReportStatus = 'observing' | 'passed' | 'failed';

export interface EnterpriseSloReportOptions {
  now?: Date;
  collectToday?: boolean;
  timezone?: string;
}

@Injectable()
export class EnterpriseSloService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EnterpriseSloService.name);
  private refreshTimer?: NodeJS.Timeout;
  private refreshImmediate?: NodeJS.Immediate;
  private refreshInFlight?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    @InjectQueue('agent-runs')
    private readonly agentRunsQueue?: Queue,
    @Optional()
    @InjectQueue('automation-runs')
    private readonly automationRunsQueue?: Queue,
    @Optional()
    @InjectQueue('platform-events')
    private readonly platformEventsQueue?: Queue,
    @Optional()
    private readonly judgeGold?: JudgeGoldApprovalService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.JEST_WORKER_ID) return;
    const refresh = () => this.startScheduledCollection();
    this.refreshImmediate = setImmediate(refresh);
    this.refreshImmediate.unref();
    this.refreshTimer = setInterval(refresh, 60 * 60 * 1000);
    this.refreshTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.refreshImmediate) clearImmediate(this.refreshImmediate);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.refreshInFlight;
  }

  private startScheduledCollection(): void {
    if (this.refreshInFlight) return;
    const collection = this.collectAllOrganizations()
      .then(() => undefined)
      .catch((error) =>
        this.logger.error(
          'Enterprise SLO collection failed',
          error instanceof Error ? error.message : String(error),
        ),
      )
      .finally(() => {
        if (this.refreshInFlight === collection) {
          this.refreshInFlight = undefined;
        }
      });
    this.refreshInFlight = collection;
  }

  async collectAllOrganizations(now = new Date()): Promise<number> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
    });
    for (const organization of organizations) {
      await this.collectCurrentAndPrevious(organization.id, now);
    }
    return organizations.length;
  }

  async collectCurrentAndPrevious(
    organizationId: string,
    now = new Date(),
    requestedTimezone?: string,
  ): Promise<void> {
    const previousDay = new Date(now.getTime() - DAY_MS);
    if (requestedTimezone) {
      await this.collectSnapshot(
        organizationId,
        previousDay,
        requestedTimezone,
      );
      await this.collectSnapshot(organizationId, now, requestedTimezone);
      return;
    }
    await this.collectSnapshot(organizationId, previousDay);
    await this.collectSnapshot(organizationId, now);
  }

  async getReadinessGates(organizationId: string, now = new Date()) {
    const evidencePath = resolve(
      process.cwd(),
      process.env.ENTERPRISE_READINESS_EVIDENCE_PATH ||
        '.agent-runtime/enterprise-readiness.json',
    );
    const evidence = await readEnterpriseReadinessEvidence(evidencePath, now);
    if (!this.judgeGold) return evidence;
    const judge = await this.judgeGold.getStatus(organizationId);
    if (!judge.gate) return evidence;
    const gates = { ...evidence.gates, judgeCalibration: judge.gate };
    const failures = Object.entries(gates)
      .filter(([, gate]) => gate?.status !== 'passed')
      .map(([name, gate]) => `${name}: ${gate?.message ?? 'missing evidence'}`);
    const claimAllowed =
      evidence.claimAllowed && !evidence.stale && failures.length === 0;
    return {
      ...evidence,
      status: claimAllowed ? ('passed' as const) : ('failed' as const),
      claimAllowed,
      gates,
      failures,
      message: claimAllowed
        ? '全部企业级硬门禁均由最新真实证据确认通过。'
        : '仍有企业级硬门禁未通过，禁止声明平台已完成企业级验收。',
    };
  }

  async collectSnapshot(
    organizationId: string,
    now = new Date(),
    requestedTimezone?: string,
  ) {
    const timezone =
      requestedTimezone ?? (await this.resolveTimezone(organizationId));
    const day = this.businessDay(now, timezone);
    const date = day.label;
    const finishedRange = { gte: day.start, lt: day.end };

    const [
      runs,
      reviews,
      suggestionsCreated,
      suggestionsAccepted,
      blockedUnauthorizedAttempts,
      unauthorizedExecutions,
      unresolvedDeadLetters,
      queueEvidence,
    ] = await Promise.all([
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.findMany({
          where: {
            organizationId,
            finishedAt: finishedRange,
            status: {
              in: [
                'COMPLETED',
                'FAILED',
                'CANCELLED',
                'TIMEOUT',
                'DEAD_LETTERED',
              ],
            },
          },
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            costAmount: true,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.reviewTask.findMany({
          where: {
            organizationId,
            reviewedAt: finishedRange,
            score: { not: null },
          },
          select: {
            status: true,
            score: true,
            threshold: true,
            entityType: true,
            entityId: true,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-autonomy.suggestion-created',
            createdAt: finishedRange,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-autonomy.suggestion-scheduled',
            createdAt: finishedRange,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-proxy.unauthorized',
            createdAt: finishedRange,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-proxy.unauthorized-executed',
            createdAt: finishedRange,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.deadLetterJob.count({
          where: { organizationId, inspectedAt: null },
        }),
      ),
      this.readQueueEvidence(),
    ]);

    const totalTasks = runs.length;
    const successfulRuns = runs.filter((run) => run.status === 'COMPLETED');
    const successfulTasks = successfulRuns.length;
    const taskSuccessRate = this.rate(successfulTasks, totalTasks);
    const runReviews =
      successfulRuns.length === 0
        ? []
        : await this.tenantDatabase.run(organizationId, (tx) =>
            tx.reviewTask.findMany({
              where: {
                organizationId,
                entityType: 'AGENT_RUN',
                entityId: { in: successfulRuns.map((run) => run.id) },
              },
              select: { entityId: true },
            }),
          );
    const reviewedRunIds = new Set(runReviews.map((review) => review.entityId));
    const autonomousCompletions = successfulRuns.filter(
      (run) => !reviewedRunIds.has(run.id),
    ).length;
    const autonomousCompletionRate = this.rate(
      autonomousCompletions,
      totalTasks,
    );
    const qualitySamples = reviews.length;
    const qualityPassed = reviews.filter(
      (review) =>
        review.status === 'APPROVED' &&
        review.score !== null &&
        review.score >= review.threshold,
    ).length;
    const qualityPassRate = this.rate(qualityPassed, qualitySamples);
    const suggestionAdoptionRate = this.rate(
      suggestionsAccepted,
      suggestionsCreated,
    );
    const latencies = runs
      .filter((run) => run.startedAt && run.finishedAt)
      .map((run) => run.finishedAt!.getTime() - run.startedAt!.getTime())
      .sort((left, right) => left - right);
    const p95LatencyMs = this.percentile95(latencies);
    const costValues = runs
      .filter((run) => run.costAmount !== null)
      .map((run) => Number(run.costAmount));
    const totalCost = costValues.reduce((sum, value) => sum + value, 0);
    const averageCost =
      costValues.length > 0 ? totalCost / costValues.length : null;
    const errorBudgetConsumed =
      taskSuccessRate === null
        ? null
        : this.round(
            ((100 - taskSuccessRate) / (100 - TASK_SUCCESS_TARGET)) * 100,
          );

    const missingEvidence: string[] = [];
    if (totalTasks === 0) missingEvidence.push('terminal_task_samples');
    if (qualitySamples === 0) missingEvidence.push('quality_review_samples');
    if (suggestionsCreated === 0) missingEvidence.push('suggestion_samples');
    if (p95LatencyMs === null) missingEvidence.push('latency_samples');
    if (costValues.length !== totalTasks) missingEvidence.push('cost_coverage');
    if (!queueEvidence.available) missingEvidence.push('queue_metrics');
    const dataComplete = missingEvidence.length === 0;
    const passed =
      dataComplete &&
      taskSuccessRate !== null &&
      taskSuccessRate >= TASK_SUCCESS_TARGET &&
      qualityPassRate !== null &&
      qualityPassRate >= QUALITY_PASS_TARGET &&
      autonomousCompletionRate !== null &&
      autonomousCompletionRate >= AUTONOMOUS_COMPLETION_TARGET &&
      suggestionAdoptionRate !== null &&
      suggestionAdoptionRate >= SUGGESTION_ADOPTION_TARGET &&
      unauthorizedExecutions === 0 &&
      unresolvedDeadLetters === 0 &&
      errorBudgetConsumed !== null &&
      errorBudgetConsumed <= 100;

    const data = {
      totalTasks,
      successfulTasks,
      taskSuccessRate,
      qualitySamples,
      qualityPassed,
      qualityPassRate,
      autonomousCompletions,
      autonomousCompletionRate,
      totalSuggestions: suggestionsCreated,
      acceptedSuggestions: suggestionsAccepted,
      suggestionAdoptionRate,
      unauthorizedActionCount: unauthorizedExecutions,
      blockedUnauthorizedAttemptCount: blockedUnauthorizedAttempts,
      p95LatencyMs,
      queueBacklog: queueEvidence.backlog,
      queueEvidenceAvailable: queueEvidence.available,
      unresolvedDeadLetters,
      totalCostAmount: new Prisma.Decimal(totalCost),
      costSampleCount: costValues.length,
      averageCostPerTask:
        averageCost === null ? null : new Prisma.Decimal(averageCost),
      errorBudgetConsumed,
      dataComplete,
      missingEvidence,
      passed,
      evidence: {
        source: 'database-and-bullmq',
        collectedAt: now.toISOString(),
        timezone,
        windowStart: day.start.toISOString(),
        windowEnd: day.end.toISOString(),
        queueCounts: queueEvidence.counts,
        blockedUnauthorizedAttempts,
        thresholds: this.thresholds(),
        costCurrency: 'provider-reported',
      } as Prisma.InputJsonValue,
    };

    const snapshot = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.enterpriseSloDailySnapshot.upsert({
        where: { organizationId_date: { organizationId, date } },
        create: { organizationId, date, ...data },
        update: data,
      }),
    );
    await this.syncDailyAlert(organizationId, date, {
      passed,
      dataComplete,
      missingEvidence,
      taskSuccessRate,
      qualityPassRate,
      autonomousCompletionRate,
      suggestionAdoptionRate,
      unauthorizedActionCount: unauthorizedExecutions,
      unresolvedDeadLetters,
    });
    return snapshot;
  }

  async getReport(
    organizationId: string,
    options: EnterpriseSloReportOptions = {},
  ) {
    const now = options.now ?? new Date();
    const timezone =
      options.timezone ?? (await this.resolveTimezone(organizationId));
    const currentDay = this.businessDay(now, timezone).label;
    if (options.collectToday !== false) {
      await this.collectCurrentAndPrevious(organizationId, now, timezone);
    }
    const lastCompletedDay = new Date(currentDay.getTime() - DAY_MS);
    const windowStart = new Date(
      lastCompletedDay.getTime() - (REQUIRED_DAYS - 1) * DAY_MS,
    );
    const snapshots = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.enterpriseSloDailySnapshot.findMany({
        where: {
          organizationId,
          date: { gte: windowStart, lte: currentDay },
        },
        orderBy: { date: 'desc' },
      }),
    );
    const completedSnapshots = snapshots.filter(
      (snapshot) =>
        snapshot.date >= windowStart && snapshot.date <= lastCompletedDay,
    );
    const currentSnapshot = snapshots.find(
      (snapshot) => this.dateKey(snapshot.date) === this.dateKey(currentDay),
    );
    const byDate = new Map(
      completedSnapshots.map((snapshot) => [
        this.dateKey(snapshot.date),
        snapshot,
      ]),
    );
    let consecutiveObservedDays = 0;
    let consecutivePassedDays = 0;
    for (let offset = 0; offset < REQUIRED_DAYS; offset += 1) {
      const expected = new Date(lastCompletedDay.getTime() - offset * DAY_MS);
      const snapshot = byDate.get(this.dateKey(expected));
      if (!snapshot) break;
      consecutiveObservedDays += 1;
      if (snapshot.passed && consecutivePassedDays === offset) {
        consecutivePassedDays += 1;
      }
    }
    const fullWindow = consecutiveObservedDays === REQUIRED_DAYS;
    const claimAllowed = fullWindow && consecutivePassedDays === REQUIRED_DAYS;
    const status: ReportStatus = fullWindow
      ? claimAllowed
        ? 'passed'
        : 'failed'
      : 'observing';

    return {
      status,
      claimAllowed,
      requiredDays: REQUIRED_DAYS,
      observedDays: completedSnapshots.length,
      consecutiveObservedDays,
      consecutivePassedDays,
      windowStart: windowStart.toISOString(),
      windowEnd: currentDay.toISOString(),
      timezone,
      thresholds: this.thresholds(),
      message: claimAllowed
        ? '连续 14 天真实证据达标，可声明企业 SLO 通过。'
        : fullWindow
          ? '连续 14 天窗口已形成，但至少一天未达标，禁止声明通过。'
          : `仍在真实观察期：连续采集 ${consecutiveObservedDays}/${REQUIRED_DAYS} 天，禁止提前显示通过。`,
      currentDay: currentSnapshot
        ? {
            ...currentSnapshot,
            totalCostAmount: currentSnapshot.totalCostAmount.toString(),
            averageCostPerTask:
              currentSnapshot.averageCostPerTask?.toString() ?? null,
          }
        : null,
      days: completedSnapshots.map((snapshot) => ({
        ...snapshot,
        totalCostAmount: snapshot.totalCostAmount.toString(),
        averageCostPerTask: snapshot.averageCostPerTask?.toString() ?? null,
      })),
    };
  }

  private async readQueueEvidence(): Promise<{
    available: boolean;
    backlog: number;
    counts: Record<string, Record<string, number>>;
  }> {
    const queues = [
      this.agentRunsQueue,
      this.automationRunsQueue,
      this.platformEventsQueue,
    ];
    if (queues.some((queue) => !queue)) {
      return { available: false, backlog: 0, counts: {} };
    }
    try {
      const results = await Promise.all(
        queues.map(async (queue) => ({
          name: queue!.name,
          counts: await queue!.getJobCounts('waiting', 'active', 'delayed'),
        })),
      );
      const counts = Object.fromEntries(
        results.map((result) => [result.name, result.counts]),
      );
      const backlog = results.reduce(
        (sum, result) =>
          sum +
          (result.counts.waiting ?? 0) +
          (result.counts.active ?? 0) +
          (result.counts.delayed ?? 0),
        0,
      );
      return { available: true, backlog, counts };
    } catch (error) {
      this.logger.warn(
        `Queue metrics unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { available: false, backlog: 0, counts: {} };
    }
  }

  private thresholds() {
    return {
      taskSuccessRate: TASK_SUCCESS_TARGET,
      qualityPassRate: QUALITY_PASS_TARGET,
      autonomousCompletionRate: AUTONOMOUS_COMPLETION_TARGET,
      suggestionAdoptionRate: SUGGESTION_ADOPTION_TARGET,
      unauthorizedActionCount: 0,
      unresolvedDeadLetters: 0,
      errorBudgetConsumedMax: 100,
    };
  }

  private async syncDailyAlert(
    organizationId: string,
    date: Date,
    evidence: {
      passed: boolean;
      dataComplete: boolean;
      missingEvidence: string[];
      taskSuccessRate: number | null;
      qualityPassRate: number | null;
      autonomousCompletionRate: number | null;
      suggestionAdoptionRate: number | null;
      unauthorizedActionCount: number;
      unresolvedDeadLetters: number;
    },
  ): Promise<void> {
    const dateKey = this.dateKey(date);
    const title = `企业 SLO 日证据 ${dateKey}`;
    await this.tenantDatabase.run(organizationId, async (tx) => {
      const existing = await tx.alert.findFirst({
        where: { organizationId, source: 'enterprise-slo', title },
        select: { id: true, status: true },
      });
      if (evidence.passed) {
        if (existing && existing.status !== 'RESOLVED') {
          await tx.alert.update({
            where: { id: existing.id },
            data: { status: 'RESOLVED', resolvedAt: new Date() },
          });
        }
        return;
      }
      const data = {
        organizationId,
        type: 'ACCOUNT_HEALTH' as const,
        severity: evidence.dataComplete
          ? ('CRITICAL' as const)
          : ('WARNING' as const),
        title,
        description: evidence.dataComplete
          ? '今日企业 SLO 指标未达标，禁止计入连续通过窗口。'
          : '今日企业 SLO 证据不完整，禁止计入连续通过窗口。',
        status: 'OPEN' as const,
        source: 'enterprise-slo',
        resolvedAt: null,
        metadata: {
          date: dateKey,
          ...evidence,
          thresholds: this.thresholds(),
        } as Prisma.InputJsonValue,
      };
      if (existing) {
        await tx.alert.update({ where: { id: existing.id }, data });
      } else {
        await tx.alert.create({ data });
      }
    });
  }

  private percentile95(values: number[]): number | null {
    if (values.length === 0) return null;
    return values[Math.max(0, Math.ceil(values.length * 0.95) - 1)];
  }

  private rate(numerator: number, denominator: number): number | null {
    if (denominator <= 0) return null;
    return this.round((numerator / denominator) * 100);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async resolveTimezone(organizationId: string): Promise<string> {
    const workspace = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.workspace.findFirst({
        where: { organizationId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { timezone: true },
      }),
    );
    return workspace?.timezone || 'Asia/Shanghai';
  }

  private businessDay(
    value: Date,
    timezone: string,
  ): {
    label: Date;
    start: Date;
    end: Date;
  } {
    const parts = this.localDateParts(value, timezone);
    const label = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const next = new Date(label.getTime() + DAY_MS);
    return {
      label,
      start: this.zonedMidnight(parts, timezone),
      end: this.zonedMidnight(
        {
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: next.getUTCDate(),
        },
        timezone,
      ),
    };
  }

  private localDateParts(value: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  private zonedMidnight(
    parts: { year: number; month: number; day: number },
    timezone: string,
  ): Date {
    const target = Date.UTC(parts.year, parts.month - 1, parts.day);
    let candidate = new Date(target);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      candidate = new Date(target - this.timezoneOffset(candidate, timezone));
    }
    return candidate;
  }

  private timezoneOffset(value: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const roundedInput = Math.floor(value.getTime() / 1000) * 1000;
    return representedAsUtc - roundedInput;
  }

  private dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
