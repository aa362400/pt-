import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  governMemoryPayload,
  isMemoryUsable,
  memoryGovernanceFrom,
} from './agent-memory-governance.js';

export interface RecordWorkMemoryInput {
  organizationId: string;
  workspaceId?: string | null;
  agentRunId?: string | null;
  productId?: string | null;
  productName?: string | null;
  taskType: string;
  status: string;
  score?: number | null;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  durationSeconds?: number;
  result?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string | null;
  validUntil?: string | null;
}

export interface QueryWorkMemoryInput {
  organizationId: string;
  workspaceId?: string;
  productName?: string;
  taskType?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface LearnFromReviewInput {
  organizationId: string;
  workspaceId?: string | null;
  sourceReviewTaskId?: string | null;
  taskType?: string | null;
  entityType?: string | null;
  score?: number | null;
  notes: string;
}

export interface UpdateReviewOutcomeInput {
  organizationId: string;
  agentRunId: string;
  reviewStatus: string;
  reviewNotes?: string | null;
}

export interface ComputeReadinessInput {
  organizationId: string;
  date?: string;
  totalTasks?: number;
  successfulTasks?: number;
  autonomousCompletions?: number;
  memoryQaTotal?: number;
  memoryQaCorrect?: number;
}

@Injectable()
export class AgentMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async recordWorkMemory(input: RecordWorkMemoryInput) {
    this.requireOrg(input.organizationId);
    if (!input.taskType) {
      throw new BadRequestException('taskType is required');
    }
    if (!input.status) {
      throw new BadRequestException('status is required');
    }

    const governed = governMemoryPayload({
      productName: input.productName ?? null,
      reviewNotes: input.reviewNotes ?? null,
      result: input.result ?? null,
      metadata: input.metadata ?? {},
    });
    const validUntil = this.optionalFutureDate(input.validUntil);
    const value = governed.value;
    return this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentWorkMemory.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId ?? null,
          agentRunId: input.agentRunId ?? null,
          productId: input.productId ?? null,
          productName: value.productName,
          taskType: input.taskType,
          status: input.status,
          score: input.score ?? null,
          reviewStatus: input.reviewStatus ?? null,
          reviewNotes: value.reviewNotes,
          durationSeconds: input.durationSeconds ?? 0,
          result:
            value.result !== undefined && value.result !== null
              ? this.toInputJsonObject(value.result)
              : undefined,
          metadata: {
            ...this.toInputJsonObject(value.metadata),
            governance: {
              sourceType: input.sourceType?.trim() || 'agent_run',
              sourceId: input.sourceId ?? input.agentRunId ?? null,
              version: 1,
              contentHash: governed.contentHash,
              trustStatus: governed.trustStatus,
              validFrom: new Date().toISOString(),
              validUntil: validUntil?.toISOString() ?? null,
              reasons: governed.reasons,
              redactions: governed.redactions,
            },
          },
        },
      }),
    );
  }

  async queryWorkMemory(input: QueryWorkMemoryInput): Promise<{
    items: unknown[];
    answer: string;
  }> {
    this.requireOrg(input.organizationId);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    const createdAt: Prisma.DateTimeFilter = {};
    if (input.from) {
      createdAt.gte = new Date(input.from);
    }
    if (input.to) {
      createdAt.lte = new Date(input.to);
    }

    const where: Prisma.AgentWorkMemoryWhereInput = {
      organizationId: input.organizationId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.productName
        ? {
            productName: {
              contains: input.productName,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(input.taskType ? { taskType: input.taskType } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const candidates = await this.tenantDatabase.run(
      input.organizationId,
      (tx) =>
        tx.agentWorkMemory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: Math.min(limit * 3, 300),
        }),
    );
    const items = candidates
      .filter((item) =>
        isMemoryUsable(
          memoryGovernanceFrom((item as Record<string, unknown>).metadata),
        ),
      )
      .slice(0, limit);

    return {
      items,
      answer: this.formatWorkHistoryAnswer(items),
    };
  }

  async learnFromReview(input: LearnFromReviewInput) {
    this.requireOrg(input.organizationId);
    const notes = input.notes?.trim();
    if (!notes) {
      throw new BadRequestException('review notes are required');
    }

    const governed = governMemoryPayload({ notes });
    const governedNotes = governed.value.notes;
    const category = this.categorizeExperience(
      governedNotes,
      input.entityType ?? '',
    );
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      if (input.sourceReviewTaskId) {
        const existing = await tx.agentExperienceCard.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceReviewTaskId: input.sourceReviewTaskId,
          },
        });
        if (existing) {
          const existingGovernance = memoryGovernanceFrom(existing.evidence);
          if (
            !existingGovernance?.contentHash ||
            existingGovernance.contentHash === governed.contentHash
          ) {
            return existing;
          }
          governed.trustStatus = 'quarantined';
          governed.reasons.push('source_content_conflict');
        }
      }
      return tx.agentExperienceCard.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId ?? null,
          sourceReviewTaskId: input.sourceReviewTaskId ?? null,
          taskType: input.taskType ?? null,
          entityType: input.entityType ?? null,
          category,
          title: this.experienceTitle(category, governedNotes),
          lesson: this.experienceLesson(governedNotes),
          scoreImpact: input.score ?? null,
          evidence: {
            notes: governedNotes,
            score: input.score ?? null,
            sourceReviewTaskId: input.sourceReviewTaskId ?? null,
            governance: {
              sourceType: 'human_review',
              sourceId: input.sourceReviewTaskId ?? null,
              version: 1,
              contentHash: governed.contentHash,
              trustStatus: governed.trustStatus,
              validFrom: new Date().toISOString(),
              validUntil: null,
              reasons: governed.reasons,
              redactions: governed.redactions,
            },
          },
        },
      });
    });
  }

  async updateReviewOutcome(input: UpdateReviewOutcomeInput) {
    this.requireOrg(input.organizationId);
    if (!input.agentRunId) {
      throw new BadRequestException('agentRunId is required');
    }
    if (!input.reviewStatus) {
      throw new BadRequestException('reviewStatus is required');
    }

    return this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentWorkMemory.updateMany({
        where: {
          organizationId: input.organizationId,
          agentRunId: input.agentRunId,
        },
        data: {
          reviewStatus: input.reviewStatus,
          reviewNotes: input.reviewNotes ?? null,
        },
      }),
    );
  }

  async getExperienceCards(input: {
    organizationId: string;
    workspaceId?: string;
    taskType?: string;
    category?: string;
    limit?: number;
  }) {
    this.requireOrg(input.organizationId);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const items = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentExperienceCard.findMany({
        where: {
          organizationId: input.organizationId,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input.taskType ? { taskType: input.taskType } : {}),
          ...(input.category ? { category: input.category } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit * 3, 150),
      }),
    );
    return items
      .filter((item) =>
        isMemoryUsable(
          memoryGovernanceFrom((item as Record<string, unknown>).evidence),
        ),
      )
      .slice(0, limit);
  }

  async computeReadiness(input: ComputeReadinessInput): Promise<{
    passed: boolean;
    metrics: {
      taskSuccessRate: number;
      suggestionAdoptionRate: number;
      autonomousCompletionRate: number;
      memoryQueryAccuracy: number;
      unauthorizedActionCount: number;
    };
  }> {
    this.requireOrg(input.organizationId);
    const date = this.startOfDay(
      input.date ? new Date(input.date) : new Date(),
    );
    const dayRange = {
      gte: date,
      lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
    };

    const memoryDayWhere: Prisma.AgentWorkMemoryWhereInput = {
      organizationId: input.organizationId,
      createdAt: dayRange,
    };
    const memoryCounts = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => ({
        totalTasks:
          input.totalTasks ??
          (await tx.agentWorkMemory.count({ where: memoryDayWhere })),
        successfulTasks:
          input.successfulTasks ??
          (await tx.agentWorkMemory.count({
            where: {
              ...memoryDayWhere,
              status: { in: ['COMPLETED', 'SUCCEEDED', 'SUCCESS'] },
            },
          })),
      }),
    );
    const { totalTasks, successfulTasks } = memoryCounts;

    const [totalSuggestions, acceptedSuggestions, unauthorizedActionCount] =
      await this.tenantDatabase.run(input.organizationId, (tx) =>
        Promise.all([
          tx.auditLog.count({
            where: {
              organizationId: input.organizationId,
              action: 'agent-autonomy.suggestion-created',
              createdAt: dayRange,
            },
          }),
          tx.auditLog.count({
            where: {
              organizationId: input.organizationId,
              action: 'agent-autonomy.suggestion-scheduled',
              createdAt: dayRange,
            },
          }),
          tx.auditLog.count({
            where: {
              organizationId: input.organizationId,
              action: 'agent-proxy.unauthorized',
              createdAt: dayRange,
            },
          }),
        ]),
      );

    const autonomousCompletions = input.autonomousCompletions ?? 0;
    const memoryQaTotal = input.memoryQaTotal ?? 0;
    const memoryQaCorrect = input.memoryQaCorrect ?? 0;

    const metrics = {
      taskSuccessRate: this.rate(successfulTasks, totalTasks),
      suggestionAdoptionRate: this.rate(acceptedSuggestions, totalSuggestions),
      autonomousCompletionRate: this.rate(autonomousCompletions, totalTasks),
      memoryQueryAccuracy: this.rate(memoryQaCorrect, memoryQaTotal),
      unauthorizedActionCount,
    };
    const passed =
      metrics.taskSuccessRate >= 98 &&
      metrics.suggestionAdoptionRate >= 50 &&
      metrics.autonomousCompletionRate >= 80 &&
      metrics.memoryQueryAccuracy === 100 &&
      metrics.unauthorizedActionCount === 0;

    await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.agentAutonomyDailyMetric.upsert({
        where: {
          organizationId_date: {
            organizationId: input.organizationId,
            date,
          },
        },
        create: {
          organizationId: input.organizationId,
          date,
          ...metrics,
          totalTasks,
          successfulTasks,
          totalSuggestions,
          acceptedSuggestions,
          autonomousCompletions,
          memoryQaTotal,
          memoryQaCorrect,
          passed,
        },
        update: {
          ...metrics,
          totalTasks,
          successfulTasks,
          totalSuggestions,
          acceptedSuggestions,
          autonomousCompletions,
          memoryQaTotal,
          memoryQaCorrect,
          passed,
        },
      }),
    );

    return { passed, metrics };
  }

  private formatWorkHistoryAnswer(
    items: Array<Record<string, unknown>>,
  ): string {
    if (items.length === 0) {
      return 'No matching work memory records found.';
    }
    return items
      .map((item) => {
        const display = (value: unknown): string | undefined => {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            return String(value);
          }
          return undefined;
        };
        const date =
          item.createdAt instanceof Date
            ? item.createdAt.toISOString().slice(0, 10)
            : (display(item.createdAt) ?? '').slice(0, 10);
        const productName = display(item.productName);
        const taskType = display(item.taskType) ?? 'unknown';
        const status = display(item.status) ?? 'unknown';
        const score = display(item.score);
        const reviewStatus = display(item.reviewStatus);
        return [
          date,
          productName ? `product=${productName}` : undefined,
          `task=${taskType}`,
          `status=${status}`,
          score ? `score=${score}` : undefined,
          reviewStatus ? `review=${reviewStatus}` : undefined,
        ]
          .filter(Boolean)
          .join(' ');
      })
      .join('\n');
  }

  private toInputJsonObject(
    value: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) {
      const converted = this.toInputJsonValue(item);
      if (converted !== undefined) result[key] = converted;
    }
    return result;
  }

  private toInputJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | null | undefined {
    if (value === null) return null;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      const result: Array<Prisma.InputJsonValue | null> = [];
      for (const item of value) {
        const converted = this.toInputJsonValue(item);
        if (converted !== undefined) result.push(converted);
      }
      return result;
    }
    if (value && typeof value === 'object') {
      return this.toInputJsonObject(value as Record<string, unknown>);
    }
    return undefined;
  }

  private categorizeExperience(notes: string, entityType: string): string {
    const text = notes.toLowerCase();
    if (
      ['shadow', 'background', 'lighting', 'color', 'style', 'image'].some(
        (item) => text.includes(item),
      )
    ) {
      return 'style';
    }
    if (
      ['policy', 'forbidden', 'trademark', 'patent', 'compliance'].some(
        (item) => text.includes(item),
      )
    ) {
      return 'risk';
    }
    if (entityType === 'IMAGE_GENERATION') {
      return 'style';
    }
    return 'product';
  }

  private experienceTitle(category: string, notes: string): string {
    return `${category}: ${notes.slice(0, 80)}`;
  }

  private experienceLesson(notes: string): string {
    return `Avoid repeating this failure: ${notes}`;
  }

  private rate(numerator: number, denominator: number): number {
    if (denominator <= 0) {
      return 0;
    }
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  private startOfDay(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private requireOrg(organizationId: string): void {
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
  }

  private optionalFutureDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date <= new Date()) {
      throw new BadRequestException('validUntil must be a future ISO date');
    }
    return date;
  }
}
