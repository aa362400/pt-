import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../../../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../../../../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../../../../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../../../../shared/tenancy/org-scope.js';
import type {
  CreateProductFeedbackDto,
  ProductFeedbackSummaryQueryDto,
} from '../../daily-product-research.dto.js';
import {
  buildProductPerformance,
  type ProductFeedbackFact,
} from './product-feedback-metrics.js';

@Injectable()
export class ProductResearchFeedbackService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  async createFeedback(
    user: JwtPayload,
    candidateId: string,
    dto: CreateProductFeedbackDto,
  ) {
    const organizationId = requireOrg(user);
    const result = await this.tenantDatabase.run(organizationId, async (tx) => {
      const candidate = await tx.productCandidate.findFirst({
        where: { id: candidateId, organizationId },
        select: { id: true, workspaceId: true },
      });
      if (!candidate)
        throw new NotFoundException('Product candidate not found');
      if (!candidate.workspaceId)
        throw new BadRequestException('Candidate workspace is required');
      const existing = await tx.productFeedback.findFirst({
        where: {
          organizationId,
          source: dto.source,
          externalReference: dto.externalReference,
          eventType: dto.eventType,
        },
      });
      if (existing) return { reused: true, feedback: existing };
      const metadata: Prisma.InputJsonObject = {
        ...(dto.metadata ?? {}),
        quality:
          dto.quality ?? (dto.source === 'MANUAL' ? 'MANUAL' : 'VERIFIED'),
        actorId: user.sub,
        ...(dto.reasonCode ? { reasonCode: dto.reasonCode } : {}),
        ...(dto.note ? { note: dto.note } : {}),
      };
      const feedback = await tx.productFeedback.create({
        data: {
          organizationId,
          workspaceId: candidate.workspaceId,
          candidateId,
          productId: dto.productId,
          listingDraftId: dto.listingDraftId,
          productLaunchId: dto.productLaunchId,
          eventType: dto.eventType,
          eventAt: new Date(dto.eventAt),
          value: dto.value,
          currency: dto.currency,
          source: dto.source,
          externalReference: dto.externalReference,
          metadata,
        },
      });
      return { reused: false, feedback };
    });
    if (!result.reused)
      await this.audit.log({
        organizationId,
        actorId: user.sub,
        action: 'daily-product-research.feedback.create',
        resourceType: 'ProductCandidate',
        resourceId: candidateId,
        after: {
          feedbackId: result.feedback.id,
          eventType: dto.eventType,
          source: dto.source,
          externalReference: dto.externalReference,
        },
      });
    return result;
  }

  async getPerformance(user: JwtPayload, candidateId: string) {
    const organizationId = requireOrg(user);
    const candidate = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productCandidate.findFirst({
        where: { id: candidateId, organizationId },
        select: {
          id: true,
          createdAt: true,
          feedback: { orderBy: { eventAt: 'asc' } },
        },
      }),
    );
    if (!candidate) throw new NotFoundException('Product candidate not found');
    return {
      candidateId,
      ...buildProductPerformance({
        candidateCreatedAt: candidate.createdAt,
        facts: candidate.feedback.map((fact) => this.toFact(fact)),
      }),
    };
  }

  async getSummary(user: JwtPayload, query: ProductFeedbackSummaryQueryDto) {
    const organizationId = requireOrg(user);
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 30 * 86_400_000);
    const to = query.to ? new Date(query.to) : new Date();
    if (to.getTime() < from.getTime())
      throw new BadRequestException('to must be on or after from');
    if (to.getTime() - from.getTime() > 366 * 86_400_000)
      throw new BadRequestException(
        'Feedback summary range cannot exceed 366 days',
      );
    const facts = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productFeedback.findMany({
        where: {
          organizationId,
          ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
          eventAt: { gte: from, lte: to },
        },
        orderBy: { eventAt: 'asc' },
      }),
    );
    const eventCounts = facts.reduce<Record<string, number>>((counts, fact) => {
      counts[fact.eventType] = (counts[fact.eventType] ?? 0) + 1;
      return counts;
    }, {});
    const candidateIds = new Set(facts.map((fact) => fact.candidateId));
    const performance = buildProductPerformance({
      candidateCreatedAt: from,
      facts: facts.map((fact) => this.toFact(fact)),
      now: to,
    });
    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      workspaceId: query.workspaceId ?? null,
      candidateCount: candidateIds.size,
      eventCount: facts.length,
      eventCounts,
      coverage: performance.coverage,
      financials: performance.financials,
      notice:
        'Summary contains immutable returned facts only. Missing channels and costs are not estimated.',
    };
  }

  private toFact(fact: {
    eventType: string;
    eventAt: Date;
    value: { toNumber(): number } | null;
    currency: string | null;
    metadata: unknown;
  }): ProductFeedbackFact {
    return {
      eventType: fact.eventType,
      eventAt: fact.eventAt,
      value: fact.value?.toNumber() ?? null,
      currency: fact.currency,
      metadata:
        fact.metadata &&
        typeof fact.metadata === 'object' &&
        !Array.isArray(fact.metadata)
          ? (fact.metadata as Record<string, unknown>)
          : {},
    };
  }
}
