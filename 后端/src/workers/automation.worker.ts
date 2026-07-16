import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../shared/database/tenant-database-context.service.js';
import { ProductResearchService } from '../features/product-research/product-research.service.js';
import { NotificationEventsService } from '../features/notifications/notification-events.service.js';
import { ActionProposalsService } from '../features/notifications/action-proposals.service.js';
import { asOptionalString } from '../shared/utils/coerce.js';
import { ListingsService } from '../features/listings/listings.service.js';
import { ProfitCalculatorService } from '../features/profit-calculator/profit-calculator.service.js';
import { ImagePromptService } from '../features/image-prompt/image-prompt.service.js';
import { TasksService } from '../features/tasks/tasks.service.js';
import { ReviewService } from '../features/review/review.service.js';
import type { JwtPayload } from '../shared/auth/jwt.strategy.js';
import { AGENT_PROVIDER } from '../agents/agent.module.js';
import type { AgentProviderInterface } from '../agents/agent-provider.interface.js';
import { DailyProductResearchService } from '../features/product-research/daily/daily-product-research.service.js';
import { AutomationStepExecutionsService } from '../features/automation/automation-step-executions.service.js';
import { randomUUID } from 'node:crypto';
import {
  asyncLocalStorage,
  getCurrentRequestId,
  getCurrentTraceId,
  getCurrentTraceparent,
} from '../shared/middleware/request-id.middleware.js';
import {
  ensureTraceId,
  normalizeTraceId,
  parseTraceparent,
  traceparentForTraceId,
} from '../shared/observability/trace-context.js';

export interface AutomationJobData {
  automationRunId: string;
  organizationId: string;
  idempotencyKey?: string;
  trigger?: string;
  reason?: string;
  traceId?: string;
  traceparent?: string;
}

const AGENT_FAILURE_BACKOFF_BASE_MS = 15 * 60_000;
const AGENT_FAILURE_BACKOFF_MAX_MS = 4 * 60 * 60_000;

@Processor('automation-runs', { concurrency: 2 })
export class AutomationWorker extends WorkerHost {
  private readonly logger = new Logger(AutomationWorker.name);
  private readonly workerId = `automation-worker:${randomUUID()}`;

  constructor(
    _prisma: PrismaService,
    private readonly productResearch: ProductResearchService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    private readonly notificationEvents?: NotificationEventsService,
    @Optional()
    private readonly listings?: ListingsService,
    @Optional()
    private readonly profitCalculator?: ProfitCalculatorService,
    @Optional()
    private readonly imagePrompt?: ImagePromptService,
    @Optional()
    private readonly tasks?: TasksService,
    @Optional()
    private readonly reviewService?: ReviewService,
    @Optional()
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider?: AgentProviderInterface,
    @Optional()
    @InjectQueue('dead-letter')
    private readonly deadLetterQueue?: Queue,
    @Optional()
    private readonly dailyProductResearch?: DailyProductResearchService,
    @Optional()
    private readonly actionProposals?: ActionProposalsService,
    @Optional()
    private readonly stepExecutions?: AutomationStepExecutionsService,
  ) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<unknown> {
    const initialTraceId =
      normalizeTraceId(job.data.traceId) ??
      ensureTraceId(job.data.automationRunId);
    const initialTraceparent = this.traceparentForRun(
      initialTraceId,
      job.data.traceparent,
    );
    const attempt =
      Number.isInteger(job.attemptsMade) && job.attemptsMade >= 0
        ? job.attemptsMade + 1
        : 1;
    const store = new Map<string, string>([
      ['requestId', `${job.data.automationRunId}:attempt:${attempt}`],
      ['traceId', initialTraceId],
      ['traceparent', initialTraceparent],
      ['runId', job.data.automationRunId],
      ['tenantId', job.data.organizationId],
    ]);
    return asyncLocalStorage.run(store, () => this.processWithContext(job));
  }

  private async processWithContext(
    job: Job<AutomationJobData>,
  ): Promise<unknown> {
    const { automationRunId, organizationId } = job.data;
    this.logger.log(
      `Processing automation run ${automationRunId} (job ${job.id})`,
    );

    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.automationRun.findFirst({
        where: {
          id: automationRunId,
          flow: { organizationId },
        },
        include: {
          flow: {
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  channelType: true,
                  marketplace: true,
                },
              },
            },
          },
        },
      }),
    );
    if (!run) {
      throw new Error(`AutomationRun ${automationRunId} not found`);
    }
    if (
      job.data.idempotencyKey &&
      run.idempotencyKey !== job.data.idempotencyKey
    ) {
      throw new Error(
        `AutomationRun ${automationRunId} idempotency key does not match the queued snapshot`,
      );
    }
    if (
      !job.data.idempotencyKey &&
      run.triggerSource &&
      run.triggerSource !== 'legacy'
    ) {
      throw new Error(
        `AutomationRun ${automationRunId} is missing its queued idempotency key`,
      );
    }

    const traceId =
      normalizeTraceId(run.traceId) ??
      normalizeTraceId(job.data.traceId) ??
      ensureTraceId(run.id);
    const traceparent = this.traceparentForRun(traceId, job.data.traceparent);
    const store = asyncLocalStorage.getStore();
    store?.set('traceId', traceId);
    store?.set('traceparent', traceparent);
    store?.set('runId', run.id);
    store?.set('tenantId', organizationId);
    store?.set('idempotencyKey', run.idempotencyKey);

    const stepExecutions = this.requireStepExecutions();
    if (stepExecutions) {
      const claimed = await stepExecutions.claimRun({
        organizationId,
        automationRunId: run.id,
        leaseOwner: this.workerId,
      });
      if (!claimed) {
        this.logger.warn(
          `Automation run ${automationRunId} is already claimed or terminal`,
        );
        return { status: 'already_claimed', automationRunId };
      }
    } else {
      await this.tenantDatabase.run(organizationId, (tx) =>
        tx.automationRun.update({
          where: { id: run.id },
          data: { status: 'RUNNING' },
        }),
      );
    }

    try {
      const steps = Array.isArray(run.flow.steps)
        ? (run.flow.steps as Array<Record<string, unknown>>)
        : [];
      const results: Array<Record<string, unknown>> = [];
      const resultsByKey = new Map<string, Record<string, unknown>>();
      const terminalSteps = new Map<string, Record<string, unknown>>();
      if (stepExecutions) {
        const persisted = await stepExecutions.loadTerminalSteps(
          organizationId,
          run.id,
        );
        for (const execution of persisted) {
          terminalSteps.set(execution.stepKey, this.asRecord(execution.result));
        }
      }

      for (const [index, step] of steps.entries()) {
        const key = asOptionalString(step.key) ?? `step-${index + 1}`;
        const persistedResult = terminalSteps.get(key);
        if (persistedResult) {
          const result = { ...persistedResult, key };
          results.push(result);
          resultsByKey.set(key, result);
          await job.updateProgress(
            Math.round(((index + 1) / Math.max(steps.length, 1)) * 100),
          );
          continue;
        }
        const dependsOn = this.asStringArray(step.dependsOn);
        const dependencyResults = dependsOn
          .map((dependency) => resultsByKey.get(dependency))
          .filter((result): result is Record<string, unknown> => !!result);
        const blocked =
          dependencyResults.length !== dependsOn.length ||
          dependencyResults.some((result) => result.status !== 'completed');
        const action = asOptionalString(step.action) ?? 'unknown';
        if (stepExecutions) {
          const claimed = await stepExecutions.claimStep({
            organizationId,
            automationRunId: run.id,
            stepKey: key,
            stepIndex: index,
            action,
            leaseOwner: this.workerId,
          });
          if (!claimed) {
            throw new Error(`Automation step ${key} is already claimed`);
          }
        }

        let result: Record<string, unknown>;
        try {
          result = blocked
            ? {
                key,
                step: index + 1,
                action,
                status: 'blocked_by_dependency',
                dependsOn,
              }
            : await this.executeStep(
                run,
                { ...step, __dependencyResults: dependencyResults },
                index,
              );
          result.key = key;
          if (stepExecutions) {
            await stepExecutions.finishStep({
              organizationId,
              automationRunId: run.id,
              stepKey: key,
              leaseOwner: this.workerId,
              result,
            });
          }
        } catch (error) {
          if (stepExecutions) {
            await stepExecutions.failStep({
              organizationId,
              automationRunId: run.id,
              stepKey: key,
              leaseOwner: this.workerId,
              error,
            });
          }
          throw error;
        }
        results.push(result);
        resultsByKey.set(key, result);
        await job.updateProgress(
          Math.round(((index + 1) / Math.max(steps.length, 1)) * 100),
        );
      }

      const completedSteps = results.filter(
        (result) => result.status === 'completed',
      ).length;
      const runStatus =
        results.length > 0 && completedSteps < results.length
          ? 'PARTIAL'
          : 'COMPLETED';
      const successRate =
        results.length === 0
          ? 0
          : Math.round((completedSteps / results.length) * 1000) / 10;

      if (stepExecutions) {
        await stepExecutions.finishRun({
          organizationId,
          automationRunId: run.id,
          leaseOwner: this.workerId,
          status: runStatus,
          result: { steps: results },
        });
      } else {
        await this.tenantDatabase.run(organizationId, (tx) =>
          tx.automationRun.update({
            where: { id: run.id },
            data: {
              status: runStatus,
              finishedAt: new Date(),
              result: { steps: results } as Prisma.InputJsonValue,
            },
          }),
        );
      }
      await this.applySuccessfulRunState(run, successRate);
      await this.notifyAutonomousDraftCompletion(run, results);

      return { status: 'completed', automationRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalAttempt = !this.willRetry(job);
      if (stepExecutions) {
        await stepExecutions.releaseRun({
          organizationId,
          automationRunId: run.id,
          leaseOwner: this.workerId,
          finalAttempt,
          error,
        });
      } else {
        await this.tenantDatabase.run(organizationId, (tx) =>
          tx.automationRun.update({
            where: { id: run.id },
            data: finalAttempt
              ? {
                  status: 'FAILED',
                  finishedAt: new Date(),
                  error: { message },
                }
              : {
                  // BullMQ will retry this job. Do not present it as a terminal
                  // customer-facing failure while retry capacity remains.
                  status: 'PENDING',
                  finishedAt: null,
                  error: Prisma.DbNull,
                },
          }),
        );
      }
      if (finalAttempt) {
        await this.applyFinalFailureState(run, message);
        await this.notifyStoreOperatorFailure(run, message);
      }
      throw error;
    }
  }

  private requireStepExecutions(): AutomationStepExecutionsService | undefined {
    if (this.stepExecutions) return this.stepExecutions;
    if (process.env.NODE_ENV === 'test') return undefined;
    throw new Error('Automation step execution ledger is not registered');
  }

  private async executeStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
        workspace?: {
          id: string;
          name: string;
          channelType: string;
          marketplace: string | null;
        } | null;
      };
    },
    step: Record<string, unknown>,
    index: number,
  ): Promise<Record<string, unknown>> {
    const action = asOptionalString(step.action) ?? 'unknown';
    if (action === 'product.research.daily') {
      if (!this.dailyProductResearch) {
        return {
          step: index + 1,
          action,
          status: 'waiting_adapter',
          reason: 'Daily product research service is not registered.',
        };
      }
      const triggerConfig = this.asRecord(run.flow.triggerConfig);
      const continuous =
        triggerConfig.continuous === true || step.continuous === true;
      const queued = await this.dailyProductResearch.startFromAutomation({
        organizationId: run.flow.organizationId,
        workspaceId:
          asOptionalString(step.workspaceId) ?? run.flow.workspaceId ?? null,
        actorId: run.flow.createdBy,
        automationRunId: run.id,
        timezone:
          typeof triggerConfig.timezone === 'string'
            ? triggerConfig.timezone
            : 'Asia/Shanghai',
        ...(continuous ? { explorationKey: run.id } : {}),
      });
      return {
        step: index + 1,
        action,
        status: 'completed',
        researchRunId: queued.run.id,
        reused: queued.reused,
        externalStoreMutation: false,
      };
    }
    if (action === 'product.research' || action === 'product_research') {
      return this.executeProductResearchStep(run, step, index, action);
    }

    if (
      action === 'listing.draft' ||
      action === 'listing.generate' ||
      action === 'listing_generation' ||
      action === 'generate_listing'
    ) {
      return this.executeListingStep(run, step, index, action);
    }

    if (
      action === 'profit.analyze' ||
      action === 'profit.calculate' ||
      action === 'profit_calculation'
    ) {
      return this.executeProfitStep(run, step, index, action);
    }

    if (action === 'task.create' || action === 'create_task') {
      return this.executeTaskStep(run, step, index, action);
    }

    if (action === 'image.prompt' || action === 'image_prompt') {
      return this.executeImagePromptStep(run, step, index, action);
    }

    if (
      action === 'image.generate' ||
      action === 'image_generation' ||
      action === 'generate_images'
    ) {
      return this.executeImageGenerationStep(run, step, index, action);
    }

    if (
      action === 'listing.publish' ||
      step.requiresConfirmation === true ||
      step.mode === 'manual_confirmation'
    ) {
      return {
        step: index + 1,
        action,
        status: 'pending_confirmation',
        reason: 'This step requires human confirmation before store write.',
      };
    }

    return {
      step: index + 1,
      action,
      status: 'waiting_adapter',
      reason:
        'No real execution adapter is registered for this automation step yet.',
    };
  }

  private async executeProductResearchStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
        workspace?: {
          id: string;
          name: string;
          channelType: string;
          marketplace: string | null;
        } | null;
      };
    },
    step: Record<string, unknown>,
    index: number,
    action: string,
  ): Promise<Record<string, unknown>> {
    const targets = await this.resolveResearchTargets(run, step);
    const platform = this.resolvePlatform(run, step);
    const workspaceId =
      asOptionalString(step.workspaceId) ?? run.flow.workspaceId ?? undefined;

    const reports = [];
    for (const target of targets) {
      reports.push(
        await this.productResearch.runAutomaticSelection({
          organizationId: run.flow.organizationId,
          actorId: run.flow.createdBy,
          workspaceId,
          query: target.query,
          platform,
          source: 'automation_worker',
          automationFlowId: run.flow.id,
          automationRunId: run.id,
        }),
      );
    }

    return {
      step: index + 1,
      action,
      status: reports.some(
        (report) => 'status' in report && report.status === 'pending_review',
      )
        ? 'pending_review'
        : 'completed',
      reportIds: reports
        .map((report) => report.reportId)
        .filter((id): id is string => typeof id === 'string'),
      notificationIds: reports
        .map((report) => report.notificationId)
        .filter((id): id is string => typeof id === 'string'),
      reviewTaskIds: reports.reduce<string[]>((ids, report) => {
        if ('status' in report && report.status === 'pending_review') {
          ids.push(report.reviewTaskId);
        }
        return ids;
      }, []),
      candidateCount: reports.reduce(
        (total, report) => total + report.candidateCount,
        0,
      ),
    };
  }

  private async executeListingStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
        workspace?: {
          id: string;
          name: string;
          channelType: string;
          marketplace: string | null;
        } | null;
      };
    },
    step: Record<string, unknown>,
    index: number,
    action: string,
  ): Promise<Record<string, unknown>> {
    if (!this.listings) {
      return this.waitingAdapter(
        index,
        action,
        'ListingsService is not registered.',
      );
    }

    const productId = asOptionalString(step.productId);
    const product = await this.resolveProduct(run, productId);
    const workspaceId = this.resolveWorkspaceId(run, step, product);
    if (!workspaceId) {
      return this.missingInput(
        index,
        action,
        'workspaceId is required to create a listing draft.',
      );
    }

    const dependencyResults = Array.isArray(step.__dependencyResults)
      ? (step.__dependencyResults as Array<Record<string, unknown>>)
      : [];
    const reportIds = dependencyResults.flatMap((result) =>
      this.asStringArray(result.reportIds),
    );
    const researchReports = reportIds.length
      ? await this.tenantDatabase.run(run.flow.organizationId, (tx) =>
          tx.productResearchReport.findMany({
            where: {
              id: { in: reportIds },
              organizationId: run.flow.organizationId,
            },
            select: { summary: true, opportunities: true, platform: true },
            take: 10,
          }),
        )
      : [];
    const researchDescription = researchReports.length
      ? JSON.stringify(
          researchReports.map((report) => ({
            summary: report.summary,
            opportunities: report.opportunities,
            platform: report.platform,
          })),
        ).slice(0, 8_000)
      : undefined;
    const researchKeywords = researchReports
      .flatMap((report) => {
        const summary = this.asRecord(report.summary);
        return this.asStringArray(summary.keywords);
      })
      .slice(0, 30);

    const draft = await this.listings.generate(this.automationUser(run), {
      workspaceId,
      productId,
      productName: this.resolveProductName(run, step, product),
      description:
        asOptionalString(step.description) ??
        asOptionalString(step.context) ??
        researchDescription,
      keywords:
        this.asStringArray(step.keywords).length > 0
          ? this.asStringArray(step.keywords)
          : researchKeywords,
      platform: this.resolveListingPlatform(run, step),
      tone: asOptionalString(step.tone) ?? 'professional',
    });

    const reviewTask = await this.reviewService?.createFromAgentRun(
      run.flow.organizationId,
      {
        entityType: 'LISTING_DRAFT',
        entityId: draft.id,
      },
    );

    return {
      step: index + 1,
      action,
      status: 'completed',
      listingDraftId: draft.id,
      reviewTaskId: reviewTask?.id,
      requiresHumanApproval: true,
    };
  }

  private async executeProfitStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
      };
    },
    step: Record<string, unknown>,
    index: number,
    action: string,
  ): Promise<Record<string, unknown>> {
    if (!this.profitCalculator) {
      return this.waitingAdapter(
        index,
        action,
        'ProfitCalculatorService is not registered.',
      );
    }

    const productId = asOptionalString(step.productId);
    const product = await this.resolveProduct(run, productId);
    const explicitSalePrice = this.asNumber(step.salePrice ?? step.price);
    const productSalePrice = this.asNumber(product?.price);
    const salePrice =
      explicitSalePrice ??
      (productSalePrice && productSalePrice > 0 ? productSalePrice : null);
    const productCost =
      this.asNumber(step.productCost ?? step.cost) ??
      this.asNumber(product?.cost);

    if (salePrice === null || productCost === null) {
      return this.missingInput(
        index,
        action,
        'salePrice and productCost are required for a real profit calculation.',
      );
    }

    const calculation = await this.profitCalculator.calculate(
      this.automationUser(run),
      {
        workspaceId: this.resolveWorkspaceId(run, step, product) ?? undefined,
        productId,
        salePrice,
        productCost,
        packagingCost: this.asNumber(step.packagingCost) ?? undefined,
        shippingCost: this.asNumber(step.shippingCost) ?? undefined,
        platformFee: this.asNumber(step.platformFee) ?? undefined,
        paymentFee: this.asNumber(step.paymentFee) ?? undefined,
        adCost: this.asNumber(step.adCost) ?? undefined,
        storageCost: this.asNumber(step.storageCost) ?? undefined,
        otherCost: this.asNumber(step.otherCost) ?? undefined,
        currency:
          asOptionalString(step.currency) ??
          asOptionalString(product?.currency) ??
          'USD',
      },
    );

    return {
      step: index + 1,
      action,
      status: 'completed',
      profitCalculationId: calculation.id,
      estimatedProfit: Number(calculation.estimatedProfit),
      profitMargin: calculation.profitMargin,
      roi: calculation.roi,
    };
  }

  private async executeTaskStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
      };
    },
    step: Record<string, unknown>,
    index: number,
    action: string,
  ): Promise<Record<string, unknown>> {
    if (!this.tasks) {
      return this.waitingAdapter(
        index,
        action,
        'TasksService is not registered.',
      );
    }

    const task = await this.tasks.create(this.automationUser(run), {
      title:
        asOptionalString(step.title) ??
        asOptionalString(step.name) ??
        `自动化待办：${run.flow.name}`,
      description:
        asOptionalString(step.description) ??
        `由自动化运行 ${run.id} 创建，来源流程：${run.flow.name}`,
      workspaceId:
        asOptionalString(step.workspaceId) ?? run.flow.workspaceId ?? undefined,
      assigneeId: asOptionalString(step.assigneeId),
      priority: this.resolveTaskPriority(step.priority),
      dueAt: asOptionalString(step.dueAt),
    });

    return {
      step: index + 1,
      action,
      status: 'completed',
      taskId: task.id,
    };
  }

  private async executeImagePromptStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
        workspace?: {
          id: string;
          name: string;
          channelType: string;
          marketplace: string | null;
        } | null;
      };
    },
    step: Record<string, unknown>,
    index: number,
    action: string,
  ): Promise<Record<string, unknown>> {
    if (!this.imagePrompt || !this.agentProvider) {
      return this.waitingAdapter(
        index,
        action,
        'Image prompt service or agent provider is not registered.',
      );
    }

    const productId = asOptionalString(step.productId);
    const product = await this.resolveProduct(run, productId);
    const productName = this.resolveProductName(run, step, product);
    const generated = await this.agentProvider.runImagePrompt(
      {
        productName,
        description: asOptionalString(step.description),
        style: asOptionalString(step.style),
        platform: this.resolvePlatform(run, step),
      },
      this.agentContext(run),
    );
    const project = await this.imagePrompt.create(this.automationUser(run), {
      title: asOptionalString(step.title) ?? `${productName} 图片提示词`,
      prompt: generated.negativePrompt
        ? `${generated.prompt}\nNegative prompt: ${generated.negativePrompt}`
        : generated.prompt,
      productId,
      workspaceId: this.resolveWorkspaceId(run, step, product) ?? undefined,
    });
    const reviewTask = await this.reviewService?.createFromAgentRun(
      run.flow.organizationId,
      {
        entityType: 'IMAGE_GENERATION',
        entityId: project.id,
      },
    );

    return {
      step: index + 1,
      action,
      status: 'completed',
      imageProjectId: project.id,
      reviewTaskId: reviewTask?.id,
      generatedPrompt: true,
      requiresHumanApproval: true,
    };
  }

  private async executeImageGenerationStep(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
        workspace?: {
          id: string;
          name: string;
          channelType: string;
          marketplace: string | null;
        } | null;
      };
    },
    step: Record<string, unknown>,
    index: number,
    action: string,
  ): Promise<Record<string, unknown>> {
    if (!this.imagePrompt || !this.agentProvider) {
      return this.waitingAdapter(
        index,
        action,
        'Image service or agent provider is not registered.',
      );
    }

    const productId = asOptionalString(step.productId);
    const product = await this.resolveProduct(run, productId);
    const productName = this.resolveProductName(run, step, product);
    const result = await this.agentProvider.runImageGeneration(
      {
        productName,
        imageBase64: asOptionalString(step.imageBase64),
        imageUrl: asOptionalString(step.imageUrl),
        sceneCount: this.asNumber(step.sceneCount) ?? undefined,
        platforms: this.asStringArray(step.platforms),
        message:
          asOptionalString(step.message) ?? asOptionalString(step.prompt),
      },
      this.agentContext(run),
    );

    if (result.mockMode) {
      return {
        step: index + 1,
        action,
        status: 'waiting_real_provider',
        reason:
          'Image provider returned mockMode=true; mock images were not accepted as completed work.',
      };
    }

    const project = await this.imagePrompt.create(this.automationUser(run), {
      title: asOptionalString(step.title) ?? `${productName} 图片生成`,
      prompt: asOptionalString(step.prompt) ?? asOptionalString(step.message),
      productId,
      workspaceId: this.resolveWorkspaceId(run, step, product) ?? undefined,
    });
    await this.tenantDatabase.run(run.flow.organizationId, (tx) =>
      tx.imagePromptProject.update({
        where: { id: project.id },
        data: {
          status: 'COMPLETED',
          generatedAssets: result.images as unknown as Prisma.InputJsonValue,
          settings: {
            source: 'automation_worker',
            automationRunId: run.id,
            sessionId: result.sessionId,
            consistencyScore: result.consistencyScore ?? null,
            downloadUrl: result.downloadUrl,
          },
        },
      }),
    );
    const reviewTask = await this.reviewService?.createFromAgentRun(
      run.flow.organizationId,
      {
        entityType: 'IMAGE_GENERATION',
        entityId: project.id,
        score: result.consistencyScore ?? undefined,
      },
    );

    return {
      step: index + 1,
      action,
      status: 'completed',
      imageProjectId: project.id,
      reviewTaskId: reviewTask?.id,
      imageCount: result.images.length,
      consistencyScore: result.consistencyScore ?? null,
      requiresHumanApproval: true,
    };
  }

  private async resolveResearchTargets(
    run: {
      flow: {
        organizationId: string;
        workspaceId: string | null;
        name: string;
        triggerConfig: Prisma.JsonValue;
      };
    },
    step: Record<string, unknown>,
  ): Promise<Array<{ query: string }>> {
    const productIds = this.asStringArray(step.productIds);
    if (productIds.length > 0) {
      const products = await this.tenantDatabase.run(
        run.flow.organizationId,
        (tx) =>
          tx.product.findMany({
            where: {
              id: { in: productIds },
              workspace: { organizationId: run.flow.organizationId },
            },
            select: { title: true },
          }),
      );
      if (products.length > 0) {
        return products.map((product) => ({ query: product.title }));
      }
    }

    const triggerConfig = this.asRecord(run.flow.triggerConfig);
    const query =
      asOptionalString(step.query) ??
      asOptionalString(step.productName) ??
      asOptionalString(step.niche) ??
      asOptionalString(triggerConfig.query) ??
      asOptionalString(triggerConfig.defaultResearchQuery) ??
      `${run.flow.name} 自动选品机会`;
    return [{ query }];
  }

  private automationUser(run: {
    flow: { organizationId: string; createdBy: string };
  }): JwtPayload {
    return {
      sub: run.flow.createdBy,
      email: 'automation@system.local',
      orgId: run.flow.organizationId,
    };
  }

  private agentContext(run: {
    id: string;
    flow: {
      organizationId: string;
      workspaceId: string | null;
      createdBy: string;
    };
  }) {
    const traceId = getCurrentTraceId() ?? ensureTraceId(run.id);
    return {
      orgId: run.flow.organizationId,
      userId: run.flow.createdBy,
      workspaceId: run.flow.workspaceId ?? undefined,
      requestId: getCurrentRequestId() ?? run.id,
      traceId,
      traceparent: getCurrentTraceparent() ?? traceparentForTraceId(traceId),
    };
  }

  private traceparentForRun(traceId: string, value?: unknown): string {
    const parsed = parseTraceparent(value);
    return parsed?.traceId === traceId
      ? parsed.traceparent
      : traceparentForTraceId(traceId);
  }

  private async resolveProduct(
    run: {
      flow: {
        organizationId: string;
      };
    },
    productId?: string,
  ): Promise<{
    id: string;
    title: string;
    workspaceId: string;
    price: unknown;
    cost: unknown;
    currency: string;
  } | null> {
    if (!productId) {
      return null;
    }
    return this.tenantDatabase.run(run.flow.organizationId, (tx) =>
      tx.product.findFirst({
        where: {
          id: productId,
          workspace: { organizationId: run.flow.organizationId },
        },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          price: true,
          cost: true,
          currency: true,
        },
      }),
    );
  }

  private resolveWorkspaceId(
    run: {
      flow: {
        workspaceId: string | null;
      };
    },
    step: Record<string, unknown>,
    product?: { workspaceId: string } | null,
  ): string | null {
    return (
      asOptionalString(step.workspaceId) ??
      product?.workspaceId ??
      run.flow.workspaceId ??
      null
    );
  }

  private resolveProductName(
    run: {
      flow: {
        name: string;
        triggerConfig: Prisma.JsonValue;
      };
    },
    step: Record<string, unknown>,
    product?: { title: string } | null,
  ): string {
    const config = this.asRecord(run.flow.triggerConfig);
    return (
      asOptionalString(step.productName) ??
      asOptionalString(step.title) ??
      asOptionalString(step.name) ??
      asOptionalString(step.query) ??
      product?.title ??
      asOptionalString(config.productName) ??
      asOptionalString(config.defaultProductName) ??
      `${run.flow.name} 自动化商品`
    );
  }

  private resolveListingPlatform(
    run: Parameters<AutomationWorker['resolvePlatform']>[0],
    step: Record<string, unknown>,
  ): string {
    return this.resolvePlatform(run, step).toLowerCase();
  }

  private resolveTaskPriority(
    value: unknown,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
    const priority = asOptionalString(value)?.toUpperCase();
    if (
      priority === 'LOW' ||
      priority === 'MEDIUM' ||
      priority === 'HIGH' ||
      priority === 'URGENT'
    ) {
      return priority;
    }
    return 'MEDIUM';
  }

  private waitingAdapter(
    index: number,
    action: string,
    reason: string,
  ): Record<string, unknown> {
    return {
      step: index + 1,
      action,
      status: 'waiting_adapter',
      reason,
    };
  }

  private missingInput(
    index: number,
    action: string,
    reason: string,
  ): Record<string, unknown> {
    return {
      step: index + 1,
      action,
      status: 'missing_input',
      reason,
    };
  }

  private resolvePlatform(
    run: {
      flow: {
        triggerConfig: Prisma.JsonValue;
        workspace?: {
          channelType: string;
          marketplace: string | null;
        } | null;
      };
    },
    step: Record<string, unknown>,
  ): string {
    const triggerConfig = this.asRecord(run.flow.triggerConfig);
    return (
      asOptionalString(step.platform) ??
      asOptionalString(step.marketplace) ??
      asOptionalString(triggerConfig.platform) ??
      asOptionalString(triggerConfig.provider) ??
      asOptionalString(triggerConfig.marketplace) ??
      run.flow.workspace?.marketplace ??
      run.flow.workspace?.channelType ??
      'marketplace'
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => asOptionalString(item))
      .filter((item): item is string => !!item);
  }

  private asNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private willRetry(job: Job<AutomationJobData>): boolean {
    const attempts =
      typeof job.opts.attempts === 'number' && job.opts.attempts > 0
        ? job.opts.attempts
        : 1;
    return job.attemptsMade + 1 < attempts;
  }

  private async applySuccessfulRunState(
    run: {
      flowId: string;
      flow: {
        organizationId: string;
        triggerType?: string;
        triggerConfig: Prisma.JsonValue;
        name: string;
      };
    },
    successRate: number,
  ): Promise<void> {
    const now = new Date();
    const triggerConfig = this.asRecord(run.flow.triggerConfig);
    const isStoreOperator = this.isConnectedStoreOperatorFlow(run.flow);
    const isOneShot = this.isOneShotScheduledFlow(run.flow);

    await this.tenantDatabase.run(run.flow.organizationId, (tx) =>
      tx.automationFlow.update({
        where: { id: run.flowId },
        data: {
          lastRunAt: now,
          successRate,
          ...(isOneShot ? { status: 'PAUSED', nextRunAt: null } : {}),
          ...(isStoreOperator
            ? {
                triggerConfig: {
                  ...triggerConfig,
                  lastSuccessAt: now.toISOString(),
                  lastFailureAt: null,
                  lastFailureMessage: null,
                  lastFailureClass: null,
                  agentProviderFailureStreak: 0,
                  agentProviderBackoffUntil: null,
                },
              }
            : {}),
        },
      }),
    );
  }

  private async applyFinalFailureState(
    run: {
      flow: {
        id: string;
        organizationId: string;
        status?: string;
        triggerType?: string;
        triggerConfig: Prisma.JsonValue;
        nextRunAt?: Date | null;
        name: string;
      };
    },
    message: string,
  ): Promise<void> {
    const triggerConfig = this.asRecord(run.flow.triggerConfig);
    const failureRecord = {
      ...triggerConfig,
      lastFailureAt: new Date().toISOString(),
      lastFailureMessage: message,
      lastFailureClass: this.classifyFailure(message),
    };

    if (this.isOneShotScheduledFlow(run.flow)) {
      await this.tenantDatabase.run(run.flow.organizationId, (tx) =>
        tx.automationFlow.update({
          where: { id: run.flow.id },
          data: {
            status: 'ERROR',
            nextRunAt: null,
            successRate: 0,
            triggerConfig: failureRecord,
          },
        }),
      );
      return;
    }

    if (this.isConnectedStoreOperatorFlow(run.flow)) {
      const previousStreak = this.asNumber(
        triggerConfig.agentProviderFailureStreak,
      );
      const failureStreak =
        this.classifyFailure(message) === 'agent_provider_unreachable'
          ? (previousStreak ?? 0) + 1
          : 1;
      const backoffMs = Math.min(
        AGENT_FAILURE_BACKOFF_BASE_MS * 2 ** Math.max(failureStreak - 1, 0),
        AGENT_FAILURE_BACKOFF_MAX_MS,
      );
      const retryAt = this.maxDate(
        run.flow.nextRunAt ?? null,
        new Date(Date.now() + backoffMs),
      );

      await this.tenantDatabase.run(run.flow.organizationId, (tx) =>
        tx.automationFlow.update({
          where: { id: run.flow.id },
          data: {
            status: 'ACTIVE',
            nextRunAt: retryAt,
            successRate: 0,
            triggerConfig: {
              ...failureRecord,
              agentProviderFailureStreak: failureStreak,
              agentProviderBackoffUntil: retryAt.toISOString(),
            },
          },
        }),
      );
    }
  }

  private classifyFailure(message: string): string {
    return /fetch failed|agent api|agent task|httperror|bad gateway|timeout|timed out|econn|enotfound|unreachable/i.test(
      message,
    )
      ? 'agent_provider_unreachable'
      : 'automation_step_failed';
  }

  private isOneShotScheduledFlow(flow: {
    triggerType?: string;
    triggerConfig: Prisma.JsonValue;
  }): boolean {
    if (flow.triggerType !== 'SCHEDULE') {
      return false;
    }
    const config = this.asRecord(flow.triggerConfig);
    if (config.once === true || config.repeat === false) {
      return true;
    }
    const hasExplicitInterval =
      this.asNumber(config.intervalMs) !== null ||
      this.asNumber(config.intervalMinutes) !== null ||
      this.asNumber(config.everyMinutes) !== null;
    return (
      Boolean(config.dueAt) && !hasExplicitInterval && config.repeat !== true
    );
  }

  private maxDate(left: Date | null, right: Date): Date {
    if (!left || Number.isNaN(left.getTime())) {
      return right;
    }
    return left.getTime() > right.getTime() ? left : right;
  }

  private async notifyAutonomousDraftCompletion(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
      };
    },
    results: Array<Record<string, unknown>>,
  ): Promise<void> {
    const trigger = this.asRecord(run.flow.triggerConfig);
    if (trigger.source !== 'agent_autonomy_auto_draft') return;

    const research = results.find((item) => item.action === 'product.research');
    const listing = results.find((item) => item.action === 'listing.draft');
    const listingReady = listing?.status === 'completed';
    const researchReady = research?.status === 'completed';
    const productName = asOptionalString(trigger.productName) ?? run.flow.name;
    const notification = await this.tenantDatabase.run(
      run.flow.organizationId,
      (tx) =>
        tx.notification.create({
          data: {
            organizationId: run.flow.organizationId,
            userId: run.flow.createdBy,
            type: listingReady ? 'APPROVAL_REQUIRED' : 'ALERT',
            title: listingReady
              ? `商品调研与 Listing 草稿已完成：${productName}`
              : researchReady
                ? `商品调研已完成，但 Listing 草稿未生成：${productName}`
                : `真实调研证据不足，未生成 Listing 草稿：${productName}`,
            body: listingReady
              ? '草稿已进入人工审核；当前没有发布或修改真实店铺。'
              : '请在审核中心查看原因；未执行任何外部店铺写入。',
            metadata: {
              kind: listingReady
                ? 'autonomous_draft_ready'
                : 'autonomous_draft_blocked',
              flowId: run.flow.id,
              automationRunId: run.id,
              productId: asOptionalString(trigger.productId),
              reportIds: this.asStringArray(research?.reportIds),
              listingDraftId: asOptionalString(listing?.listingDraftId),
              reviewTaskId: asOptionalString(listing?.reviewTaskId),
              targetRoute: '/review',
              externalStoreMutation: 'not_executed',
            },
          },
        }),
    );
    this.notificationEvents?.publishCreated(notification);
  }

  private async notifyStoreOperatorFailure(
    run: {
      id: string;
      flow: {
        id: string;
        organizationId: string;
        workspaceId: string | null;
        createdBy: string;
        name: string;
        triggerConfig: Prisma.JsonValue;
      };
    },
    message: string,
  ): Promise<void> {
    if (!this.isConnectedStoreOperatorFlow(run.flow)) {
      return;
    }
    if (!this.actionProposals) {
      throw new Error('Action proposal service is unavailable');
    }

    await this.actionProposals.create({
      organizationId: run.flow.organizationId,
      requestedBy: run.flow.createdBy,
      approverId: run.flow.createdBy,
      source: 'automation_worker',
      action: {
        label: 'Recover and retry',
        name: 'automation.recover',
        params: {
          flowId: run.flow.id,
          failedRunId: run.id,
        },
      },
      type: 'ALERT',
      title: `智能体自动运营失败：${run.flow.name}`,
      body: `自动运营已经启动，但调用真实智能体失败：${message}`,
      context: {
        kind: 'automation_run_failed',
        flowId: run.flow.id,
        automationRunId: run.id,
        workspaceId: run.flow.workspaceId,
        targetRoute: '/automation',
        source: 'automation_worker',
        externalStoreMutation: 'not_executed',
        action: {
          label: '恢复并重试',
          action: 'automation.recover',
          params: {
            flowId: run.flow.id,
            failedRunId: run.id,
          },
        },
      },
    });
  }

  private isConnectedStoreOperatorFlow(flow: {
    name: string;
    triggerConfig: Prisma.JsonValue;
  }): boolean {
    const config = this.asRecord(flow.triggerConfig);
    return (
      config.source === 'connected_store_operator' ||
      flow.name.includes('[智能体自动运营]')
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Automation job ${job.id ?? 'unknown'} completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<AutomationJobData> | undefined,
    error: Error,
  ): Promise<void> {
    this.logger.error(`Automation job ${job?.id ?? 'unknown'} failed`, {
      error: error.message,
    });
    if (!job || !this.deadLetterQueue || !this.hasExhaustedAttempts(job)) {
      return;
    }

    const run = await this.tenantDatabase.run(job.data.organizationId, (tx) =>
      tx.automationRun.findFirst({
        where: {
          id: job.data.automationRunId,
          flow: { organizationId: job.data.organizationId },
        },
        select: {
          flow: {
            select: { organizationId: true },
          },
        },
      }),
    );

    try {
      await this.deadLetterQueue.add('record', {
        originalQueue: 'automation-runs',
        originalJobId: String(job.id ?? ''),
        originalData: job.data,
        failedReason: error.message,
        failedAttempts: job.attemptsMade,
        organizationId: run?.flow.organizationId ?? job.data.organizationId,
      });
    } catch (deadLetterError) {
      this.logger.error('Failed to enqueue automation dead letter', {
        error:
          deadLetterError instanceof Error
            ? deadLetterError.message
            : String(deadLetterError),
      });
    }
  }

  private hasExhaustedAttempts(job: Job<AutomationJobData>): boolean {
    const attempts =
      typeof job.opts.attempts === 'number' && job.opts.attempts > 0
        ? job.opts.attempts
        : 1;
    return job.attemptsMade >= attempts;
  }
}
