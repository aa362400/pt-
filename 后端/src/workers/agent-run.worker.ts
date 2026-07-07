import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import type { AgentType } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service.js';
import { AGENT_PROVIDER } from '../agents/agent.module.js';
import type { AgentProviderInterface } from '../agents/agent-provider.interface.js';
import { ReviewService } from '../features/review/review.service.js';
import { asString, asOptionalString } from '../shared/utils/coerce.js';

export interface AgentRunJobData {
  agentRunId: string;
}

@Processor('agent-runs', { concurrency: 3 })
export class AgentRunWorker extends WorkerHost {
  private readonly logger = new Logger(AgentRunWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly reviewService: ReviewService,
    @InjectQueue('agent-runs') private readonly agentRunQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<AgentRunJobData>): Promise<unknown> {
    const { agentRunId } = job.data;
    this.logger.log(`Processing agent-run ${agentRunId} (job ${job.id})`);

    const run = await this.prisma.agentRun.findUnique({
      where: { id: agentRunId },
    });
    if (!run) {
      throw new Error(`AgentRun ${agentRunId} not found`);
    }

    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      const input = (run.input ?? {}) as Record<string, unknown>;
      const output = await this.dispatch(run.agentType, input, {
        orgId: run.organizationId,
        workspaceId: run.workspaceId ?? '',
        userId: run.userId,
      });

      const outputObj = output as Record<string, unknown> | null;

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          output: outputObj as object,
          finishedAt: new Date(),
        },
      });
      await job.updateProgress(100);

      // ── Consistency scoring integration ──────
      await this.handleConsistencyScoring(run, outputObj);
      // ──────────────────────────────────────────

      return { status: 'completed', agentRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorCode: 'AGENT_ERROR',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Evaluate consistency score from agent output and create a review task.
   *
   * - If the output includes a `consistencyScore` field (0-100), use it.
   * - Otherwise generate a simulated score based on agent type.
   * - Scores >= threshold → auto-approved.
   * - Scores < threshold → creates a PENDING review task + notification.
   * - Scores < 30 → also enqueues an auto-regeneration job.
   */
  private async handleConsistencyScoring(
    run: {
      id: string;
      organizationId: string;
      userId: string;
      agentType: string;
    },
    output: Record<string, unknown> | null,
  ): Promise<void> {
    // Extract consistency score from output, or simulate one
    let score: number | null = null;
    if (output && typeof output.consistencyScore === 'number') {
      score = output.consistencyScore;
    } else {
      // Generate a simulated score based on agent type
      score = this.simulateConsistencyScore(run.agentType as AgentType);
    }

    // Create the review task
    const reviewResult = await this.reviewService.createFromAgentRun(
      run.organizationId,
      {
        entityType: 'AGENT_RUN',
        entityId: run.id,
        score,
        threshold: 60,
      },
    );

    this.logger.log(
      `Review task ${reviewResult.id} created for agent-run ${run.id}: ` +
        `score=${score}, status=${reviewResult.status}, autoApproved=${reviewResult.autoApproved}`,
    );

    // If score is very low (< 30) and we haven't regenerated too many times,
    // enqueue an auto-regeneration job
    if (score !== null && score < 30) {
      // Check how many auto-regenerations have already been done
      const existingTasks = await this.prisma.reviewTask.findMany({
        where: {
          entityType: 'AGENT_RUN',
          entityId: run.id,
          autoRegenerations: { gt: 0 },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      const currentRegens = existingTasks[0]?.autoRegenerations ?? 0;
      if (currentRegens < 3) {
        this.logger.warn(
          `Low consistency score (${score}) for agent-run ${run.id}. ` +
            `Enqueuing auto-regeneration (attempt ${currentRegens + 1}/3).`,
        );

        // Increment autoRegenerations on the review task
        await this.prisma.reviewTask.update({
          where: { id: reviewResult.id },
          data: { autoRegenerations: { increment: 1 } },
        });

        // Re-enqueue the same agent run
        await this.agentRunQueue.add('run', { agentRunId: run.id });
      } else {
        this.logger.warn(
          `Max auto-regenerations (3) reached for agent-run ${run.id}. Flagging for urgent review.`,
        );
      }
    }
  }

  /**
   * Generate a simulated consistency score based on agent type.
   * In production this would be replaced by a real NLP/text quality model.
   */
  private simulateConsistencyScore(agentType: AgentType): number {
    // Higher base scores for structured agents, lower for creative ones
    const baseScores: Partial<Record<AgentType, number>> = {
      PRODUCT_RESEARCHER: 75,
      KEYWORD_EXPLORER: 80,
      PROFIT_ANALYST: 78,
      ADVERTISING_STRATEGIST: 72,
      IMAGE_CREATIVE: 60,
      CONTENT_WRITER: 65,
      LISTING_OPTIMIZER: 70,
      CUSTOMER_INSIGHT: 68,
      GENERAL_ASSISTANT: 85,
    };

    const base = baseScores[agentType] ?? 70;
    // Add +/- 15 random variance
    const variance = Math.round((Math.random() - 0.5) * 30);
    return Math.max(0, Math.min(100, base + variance));
  }

  private async dispatch(
    agentType: AgentType,
    input: Record<string, unknown>,
    ctx: { orgId: string; workspaceId: string; userId: string },
  ): Promise<unknown> {
    switch (agentType) {
      case 'IMAGE_CREATIVE':
        return this.agentProvider.runImageGeneration({
          productName: asString(input.productName),
          imageBase64: asOptionalString(input.imageBase64),
          imageUrl: asOptionalString(input.imageUrl),
          sceneCount: Number(input.sceneCount ?? 5),
          platforms: Array.isArray(input.platforms)
            ? input.platforms.map((p) => asString(p))
            : undefined,
          message: asOptionalString(input.message),
        });
      case 'PRODUCT_RESEARCHER':
        return this.agentProvider.runProductResearch({
          productName: asString(input.productName),
          marketplace: asString(input.marketplace, 'amazon.com'),
          locale: asOptionalString(input.locale),
        });
      case 'LISTING_OPTIMIZER':
      case 'CONTENT_WRITER':
        return this.agentProvider.runListingGeneration({
          productName: asString(input.productName),
          description: asOptionalString(input.description),
          keywords: Array.isArray(input.keywords)
            ? input.keywords.map((k) => asString(k))
            : [],
          platform:
            (input.platform as 'amazon' | 'shopify' | 'etsy' | 'ebay') ??
            'amazon',
          tone: asOptionalString(input.tone),
        });
      case 'KEYWORD_EXPLORER':
        return this.agentProvider.runKeywordAnalysis({
          seedKeywords: Array.isArray(input.seedKeywords)
            ? input.seedKeywords.map((k) => asString(k))
            : [],
          marketplace: asString(input.marketplace, 'amazon.com'),
          locale: asOptionalString(input.locale),
        });
      case 'ADVERTISING_STRATEGIST':
      case 'PROFIT_ANALYST':
      case 'CUSTOMER_INSIGHT':
        return this.agentProvider.runTrendAnalysis({
          category: asString(input.category, 'general'),
          marketplace: asString(input.marketplace, 'amazon.com'),
          timeframe: asOptionalString(input.timeframe),
        });
      case 'GENERAL_ASSISTANT':
      default: {
        const reply = await this.agentProvider.runAssistant({
          assistantId: asString(input.assistantId, 'general'),
          threadId: asOptionalString(input.threadId),
          prompt: asString(input.prompt),
          workspaceId: ctx.workspaceId,
          orgId: ctx.orgId,
          userId: ctx.userId,
        });
        return { reply };
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Agent-run job ${job.id ?? 'unknown'} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Agent-run job ${job.id ?? 'unknown'} failed`, {
      error: error.message,
    });
  }
}
