import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import { AGENT_PROVIDER } from '../../agents/agent.module.js';
import type { AgentProviderInterface } from '../../agents/agent-provider.interface.js';
import { ProductsService } from '../products/products.service.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { AgentMemoryService } from '../agent-memory/agent-memory.service.js';
import { StoreAgentProfileService } from '../agent-memory/store-agent-profile.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  ApproveResearchCandidateDto,
  CreateResearchReportDto,
  ListResearchCandidatesQueryDto,
  RejectResearchCandidateDto,
  ListResearchReportsQueryDto,
} from './product-research.dto.js';

type ApprovedCandidateProduct = {
  id: string;
  workspaceId: string;
  title: string;
  sku: string | null;
  asinOrExternalId: string | null;
  images: string[];
  price: Prisma.Decimal;
  currency: string;
  status: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type ResearchReportForCandidate = {
  id: string;
  workspaceId: string | null;
  query: string;
  platform: string;
  summary: string | null;
  opportunities: Prisma.JsonValue | null;
  createdAt: Date;
};

type ParsedPriceRange = {
  min: number | null;
  max: number | null;
};

type CandidateDecision = {
  reportId: string;
  candidateIndex: number;
  workspaceId: string | null;
  status: 'APPROVED' | 'REJECTED';
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const NON_CJK_RESEARCH_QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'find',
  'for',
  'in',
  'item',
  'items',
  'market',
  'marketplace',
  'of',
  'on',
  'or',
  'ozon',
  'product',
  'products',
  'qa',
  'research',
  'search',
  'test',
  'the',
  'to',
  'verification',
  'verify',
  'with',
]);

export interface AutomaticProductResearchInput {
  organizationId: string;
  actorId: string;
  workspaceId?: string | null;
  query: string;
  platform: string;
  source: string;
  automationFlowId?: string;
  automationRunId?: string;
}

export type AutomaticProductResearchResult =
  | {
      reportId: string;
      candidateCount: number;
      notificationId: string | null;
      reviewTaskId: string | null;
    }
  | {
      reportId: null;
      candidateCount: 0;
      notificationId: string;
      reviewTaskId: string;
      agentRunId: string;
      status: 'pending_review';
    };

@Injectable()
export class ProductResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    private readonly notificationEvents?: NotificationEventsService,
    @Optional()
    private readonly storeProfiles?: StoreAgentProfileService,
    @Optional()
    private readonly agentMemory?: AgentMemoryService,
  ) {}

  /** Runs research via the agent provider and persists the report. */
  async create(user: JwtPayload, dto: CreateResearchReportDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const storeContext = await this.buildStoreContext(orgId, dto.workspaceId);
    let result: Awaited<
      ReturnType<AgentProviderInterface['runProductResearch']>
    >;
    let sourceEvidence: Record<string, unknown>;
    let competitors: string[];
    try {
      result = await this.agentProvider.runProductResearch({
        productName: dto.query,
        marketplace: dto.platform,
        ...(storeContext ? { storeContext } : {}),
      });
      sourceEvidence = this.requireVerifiableOzonEvidence(result, dto.query);
      competitors = this.filterCandidatesForStore(
        result.competitors,
        storeContext,
      );
    } catch (error) {
      const review = await this.createResearchFailureReview({
        organizationId: orgId,
        actorId: user.sub,
        workspaceId: dto.workspaceId,
        query: dto.query,
        platform: dto.platform,
        source: 'manual_research',
        error,
      });
      throw new UnprocessableEntityException(
        `Ozon product researchevidencetext，textgenerationreport；english_texthumanreviewtask ${review.reviewTaskId}。`,
      );
    }

    const report = await this.tenantDatabase.run(orgId, (tx) =>
      tx.productResearchReport.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          query: dto.query,
          platform: dto.platform,
          summary: result.summary,
          opportunities: {
            competitors,
            priceRange: result.priceRange,
            rating: result.rating,
            sourceEvidence,
            runtime: result.runtime ?? {},
            storeContext: storeContext ?? {},
          } as Prisma.InputJsonValue,
          status: 'COMPLETED',
          createdBy: user.sub,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.create',
      resourceType: 'ProductResearch',
      resourceId: report.id,
      after: { query: report.query, platform: report.platform },
    });
    if (competitors.length === 0) {
      return { ...report, reviewTaskId: null };
    }

    const reviewTask = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.create({
        data: {
          organizationId: orgId,
          entityType: 'PRODUCT_RESEARCH',
          entityId: report.id,
          status: 'PENDING',
          autoApproved: false,
          autoRegenerations: 0,
        },
      }),
    );
    const notification = await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.create({
        data: {
          organizationId: orgId,
          userId: user.sub,
          type: 'APPROVAL_REQUIRED',
          title: `agentproduct researchgeneration ${competitors.length} english_text，textreview`,
          body: `「${report.query}」textgenerationenglish_text，texthumanreviewenglish_text。`,
          metadata: {
            kind: 'product_research_candidates_approval',
            source: 'manual_research',
            reportId: report.id,
            reviewTaskId: reviewTask.id,
            workspaceId: report.workspaceId,
            platform: report.platform,
            candidateCount: competitors.length,
            targetRoute: '/review',
            guardrails: [
              'textproductenglish_texthumanreviewenglish_text',
              'english_textgenerationimagetextwrite Ozon',
              'english_textgenerationimagetext Ozon publishflow',
            ],
          },
        },
      }),
    );
    this.notificationEvents?.publishCreated(notification);
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.review-created',
      resourceType: 'ReviewTask',
      resourceId: reviewTask.id,
      after: { reportId: report.id, candidateCount: competitors.length },
    });
    return { ...report, reviewTaskId: reviewTask.id };
  }

  /**
   * Runs an autonomous product-selection pass and creates a real approval
   * notification for the human operator. This is the backend chain the UI
   * reads; it does not mark candidates approved or publish to a store.
   */
  async runAutomaticSelection(
    input: AutomaticProductResearchInput,
  ): Promise<AutomaticProductResearchResult> {
    if (input.workspaceId) {
      await assertWorkspaceInOrg(
        this.prisma,
        input.organizationId,
        input.workspaceId,
      );
    }

    const storeContext = await this.buildStoreContext(
      input.organizationId,
      input.workspaceId,
    );
    let result: Awaited<
      ReturnType<AgentProviderInterface['runProductResearch']>
    >;
    let sourceEvidence: Record<string, unknown>;
    let competitors: string[];
    try {
      result = await this.agentProvider.runProductResearch(
        {
          productName: input.query,
          marketplace: input.platform,
          ...(storeContext ? { storeContext } : {}),
        },
        {
          orgId: input.organizationId,
          userId: input.actorId,
          workspaceId: input.workspaceId ?? undefined,
        },
      );
      sourceEvidence = this.requireVerifiableOzonEvidence(result, input.query);
      competitors = this.filterCandidatesForStore(
        result.competitors,
        storeContext,
      );
    } catch (error) {
      return this.createResearchFailureReview({
        organizationId: input.organizationId,
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        query: input.query,
        platform: input.platform,
        source: input.source,
        automationFlowId: input.automationFlowId,
        automationRunId: input.automationRunId,
        error,
      });
    }

    const report = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.productResearchReport.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId ?? null,
          query: input.query,
          platform: input.platform,
          summary: result.summary,
          opportunities: {
            competitors,
            priceRange: result.priceRange,
            rating: result.rating,
            sourceEvidence,
            runtime: result.runtime ?? {},
            storeContext: storeContext ?? {},
            ...this.compactJsonRecord({
              source: input.source,
              automationFlowId: input.automationFlowId,
              automationRunId: input.automationRunId,
            }),
          } as Prisma.InputJsonValue,
          status: 'COMPLETED',
          createdBy: input.actorId,
        },
      }),
    );

    await this.audit.log({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'product-research.automatic-selection',
      resourceType: 'ProductResearch',
      resourceId: report.id,
      after: {
        query: report.query,
        platform: report.platform,
        source: input.source,
        automationFlowId: input.automationFlowId,
        automationRunId: input.automationRunId,
      },
    });

    if (competitors.length === 0) {
      return {
        reportId: report.id,
        candidateCount: 0,
        notificationId: null,
        reviewTaskId: null,
      };
    }

    const reviewTask = await this.tenantDatabase.run(
      input.organizationId,
      (tx) =>
        tx.reviewTask.create({
          data: {
            organizationId: input.organizationId,
            entityType: 'PRODUCT_RESEARCH',
            entityId: report.id,
            status: 'PENDING',
            autoApproved: false,
            autoRegenerations: 0,
          },
        }),
    );

    const notification = await this.tenantDatabase.run(
      input.organizationId,
      (tx) =>
        tx.notification.create({
          data: {
            organizationId: input.organizationId,
            userId: input.actorId,
            type: 'APPROVAL_REQUIRED',
            title: `agentautomaticproduct researchgeneration ${competitors.length} english_text，textreview`,
            body:
              `automaticenglish_textcompleted「${input.query}」product researchtext。` +
              'texthumanreviewenglish_text、english_text；english_textgenerationimageenglish_text Ozon。',
            metadata: this.compactJsonRecord({
              kind: 'product_research_candidates_approval',
              source: input.source,
              reportId: report.id,
              reviewTaskId: reviewTask.id,
              workspaceId: input.workspaceId ?? null,
              platform: input.platform,
              candidateCount: competitors.length,
              automationFlowId: input.automationFlowId,
              automationRunId: input.automationRunId,
              targetRoute: '/review',
              guardrails: [
                'textproductenglish_texthumanreviewenglish_text',
                'english_textgenerationimagetextwrite Ozon',
                'english_textgenerationimagetext Ozon publishflow',
              ],
            }) as Prisma.InputJsonValue,
          },
        }),
    );
    this.notificationEvents?.publishCreated(notification);

    await this.audit.log({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'product-research.candidates-notification-created',
      resourceType: 'Notification',
      resourceId: notification.id,
      after: {
        reportId: report.id,
        candidateCount: competitors.length,
      },
    });

    return {
      reportId: report.id,
      candidateCount: competitors.length,
      notificationId: notification.id,
      reviewTaskId: reviewTask.id,
    };
  }

  private async createResearchFailureReview(input: {
    organizationId: string;
    actorId: string;
    workspaceId?: string | null;
    query: string;
    platform: string;
    source: string;
    automationFlowId?: string;
    automationRunId?: string;
    error: unknown;
  }): Promise<
    Extract<AutomaticProductResearchResult, { status: 'pending_review' }>
  > {
    const failureCode = this.researchFailureCode(input.error);
    const failureReason = this.researchFailureReason(input.error);
    const currentStep = [
      'RESEARCH_EVIDENCE_UNVERIFIABLE',
      'RESEARCH_OUTPUT_VERIFICATION_FAILED',
    ].includes(failureCode)
      ? 'VERIFICATION_FAILED'
      : 'FATAL_ERROR';
    const occurredAt = new Date();
    const created = await this.tenantDatabase.run(
      input.organizationId,
      async (tx) => {
        const agentRun = await tx.agentRun.create({
          data: {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId ?? null,
            userId: input.actorId,
            agentType: 'PRODUCT_RESEARCHER',
            status: 'FAILED',
            lifecycleStatus: 'FAILED',
            currentStep,
            input: {
              productName: input.query,
              marketplace: input.platform,
              source: input.source,
              reviewRequired: true,
            },
            progress: {
              status: 'failed',
              stage: 'evidence',
              message: failureReason,
              at: occurredAt.toISOString(),
              remoteDiagnostics: this.researchFailureDiagnostics(input.error),
            } as Prisma.InputJsonValue,
            errorCode: failureCode,
            errorMessage: this.researchFailureMessage(
              input.error,
              failureReason,
            ),
            finishedAt: occurredAt,
          },
        });
        const reviewTask = await tx.reviewTask.create({
          data: {
            organizationId: input.organizationId,
            entityType: 'AGENT_RUN',
            entityId: agentRun.id,
            status: 'PENDING',
            autoApproved: false,
            autoRegenerations: 1,
            notes: `${failureReason} english_textwriteproduct researchreport，texthumantextdataenglish_text。`,
          },
        });
        const notification = await tx.notification.create({
          data: {
            organizationId: input.organizationId,
            userId: input.actorId,
            type: 'APPROVAL_REQUIRED',
            title: 'Ozon product researchevidencetext，texthumanreview',
            body: `${failureReason} english_texthumanreviewtask，textgenerationproduct researchreport。`,
            metadata: this.compactJsonRecord({
              kind: 'product_research_evidence_review',
              reviewTaskId: reviewTask.id,
              agentRunId: agentRun.id,
              workspaceId: input.workspaceId ?? null,
              platform: input.platform,
              query: input.query,
              source: input.source,
              automationFlowId: input.automationFlowId,
              automationRunId: input.automationRunId,
              targetRoute: '/review',
              externalStoreMutation: 'not_executed',
            }) as Prisma.InputJsonValue,
          },
        });
        return { agentRun, reviewTask, notification };
      },
    );
    this.notificationEvents?.publishCreated(created.notification);
    await this.audit.log({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'product-research.evidence-review-created',
      resourceType: 'ReviewTask',
      resourceId: created.reviewTask.id,
      after: {
        agentRunId: created.agentRun.id,
        notificationId: created.notification.id,
        errorCode: failureCode,
        externalStoreMutation: 'not_executed',
      },
    });
    return {
      reportId: null,
      candidateCount: 0,
      notificationId: created.notification.id,
      reviewTaskId: created.reviewTask.id,
      agentRunId: created.agentRun.id,
      status: 'pending_review',
    };
  }

  async findAll(user: JwtPayload, query: ListResearchReportsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProductResearchReportWhereInput = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.search
        ? { query: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.productResearchReport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { creator: { select: { id: true, name: true } } },
        }),
        tx.productResearchReport.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const report = await this.tenantDatabase.run(orgId, (tx) =>
      tx.productResearchReport.findFirst({
        where: { id, organizationId: orgId },
      }),
    );
    if (!report) {
      throw new NotFoundException('Research report not found');
    }
    return report;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async findCandidates(
    user: JwtPayload,
    query: ListResearchCandidatesQueryDto,
  ) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? 'pending';
    const search = query.search?.trim().toLowerCase();

    if (query.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, query.workspaceId);
    }

    const [reports, approvedProducts, decisions] = await Promise.all([
      this.tenantDatabase.run(orgId, (tx) =>
        tx.productResearchReport.findMany({
          where: {
            organizationId: orgId,
            ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            workspaceId: true,
            query: true,
            platform: true,
            summary: true,
            opportunities: true,
            createdAt: true,
          },
        }),
      ),
      this.findApprovedCandidateProducts(orgId),
      this.tenantDatabase.run(orgId, (transaction) =>
        transaction.productResearchCandidateDecision.findMany({
          where: {
            organizationId: orgId,
          },
          select: {
            reportId: true,
            candidateIndex: true,
            workspaceId: true,
            status: true,
            reason: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ),
    ]);

    const approvedByKey = new Map(
      approvedProducts.map((product) => [
        this.approvedProductCandidateKey(product),
        product,
      ]),
    );
    const decisionsByKey = new Map(
      (decisions as CandidateDecision[]).map((decision) => [
        this.candidateKey(decision.reportId, decision.candidateIndex),
        decision,
      ]),
    );

    const candidates = reports
      .flatMap((report) =>
        this.hasVerifiableOzonEvidence(
          report.opportunities,
          report.summary,
          report.query,
        )
          ? this.reportToCandidates(report, approvedByKey, decisionsByKey)
          : [],
      )
      .filter((candidate) => {
        if (status === 'pending' && candidate.status !== 'pending') {
          return false;
        }
        if (status === 'approved' && candidate.status !== 'approved') {
          return false;
        }
        if (status === 'rejected' && candidate.status !== 'rejected') {
          return false;
        }
        if (!search) {
          return true;
        }
        return (
          candidate.name.toLowerCase().includes(search) ||
          candidate.query.toLowerCase().includes(search)
        );
      });

    return {
      items: candidates.slice((page - 1) * limit, page * limit),
      total: candidates.length,
      page,
      limit,
    };
  }

  async ensureCandidateReview(user: JwtPayload, candidateId: string) {
    const organizationId = requireOrg(user);
    const parsed = this.parseCandidateId(candidateId);
    const report = await this.findReportForCandidate(
      organizationId,
      parsed.reportId,
    );
    if (
      !this.hasVerifiableOzonEvidence(
        report.opportunities,
        report.summary,
        report.query,
      )
    ) {
      throw new BadRequestException(
        'Research candidate cannot enter review without verifiable Ozon evidence',
      );
    }
    if (!this.getCandidateFromReport(report, parsed.index)) {
      throw new NotFoundException('Research candidate not found');
    }
    const decision = await this.findCandidateDecision(
      organizationId,
      report.id,
      parsed.index,
    );
    if (decision?.status === 'REJECTED') {
      throw new BadRequestException(
        'Rejected research candidates cannot re-enter review',
      );
    }

    const existing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.reviewTask.findFirst({
        where: {
          organizationId,
          entityType: 'PRODUCT_RESEARCH',
          entityId: report.id,
          status: { in: ['PENDING', 'REWORK'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    if (existing) {
      return { reviewTaskId: existing.id, reused: true };
    }

    const reviewTask = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.reviewTask.create({
        data: {
          organizationId,
          entityType: 'PRODUCT_RESEARCH',
          entityId: report.id,
          status: 'PENDING',
          autoApproved: false,
          autoRegenerations: 0,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'product-research.candidate.review-created',
      resourceType: 'ReviewTask',
      resourceId: reviewTask.id,
      after: {
        reportId: report.id,
        candidateId,
        externalStoreMutation: 'not_executed',
      },
    });
    return { reviewTaskId: reviewTask.id, reused: false };
  }

  async approveCandidate(
    user: JwtPayload,
    candidateId: string,
    dto: ApproveResearchCandidateDto,
  ) {
    const orgId = requireOrg(user);
    const parsed = this.parseCandidateId(candidateId);
    const report = await this.findReportForCandidate(orgId, parsed.reportId);
    if (
      !this.hasVerifiableOzonEvidence(
        report.opportunities,
        report.summary,
        report.query,
      )
    ) {
      throw new BadRequestException(
        'Research candidate cannot be approved without verifiable Ozon evidence',
      );
    }
    const candidate = this.getCandidateFromReport(report, parsed.index);
    if (!candidate) {
      throw new NotFoundException('Research candidate not found');
    }
    const priorDecision = await this.findCandidateDecision(
      orgId,
      report.id,
      parsed.index,
    );
    if (priorDecision?.status === 'REJECTED') {
      throw new BadRequestException(
        'Rejected research candidates cannot be approved without a new research run',
      );
    }

    const approvedProducts = await this.findApprovedCandidateProducts(orgId);
    const existing = approvedProducts.find(
      (product) =>
        this.approvedProductCandidateKey(product) ===
        this.candidateKey(report.id, parsed.index),
    );
    if (existing) {
      return {
        candidate: this.reportToCandidate(
          report,
          parsed.index,
          candidate,
          existing,
        ),
        product: existing,
        action: {
          status: 'already_approved',
          externalStoreMutation: 'not_executed',
        },
      };
    }

    const workspace = await this.resolveApprovalWorkspace(
      orgId,
      report,
      dto.workspaceId,
    );
    const priceRange = this.extractPriceRange(report.opportunities);
    const rating = this.extractRating(report.opportunities);
    const now = new Date().toISOString();
    const product = await this.products.create(user, {
      workspaceId: workspace.id,
      title: candidate,
      sku: `AGENT-${report.id.slice(-6).toUpperCase()}-${parsed.index + 1}`,
      asinOrExternalId: undefined,
      images: [],
      cost: 0,
      price: this.averagePrice(priceRange),
      currency: workspace.currency,
      status: 'DRAFT',
      metadata: {
        source: 'agent-product-research',
        approvalStatus: 'approved',
        externalStoreMutation: 'not_executed',
        researchReportId: report.id,
        candidateId: this.candidateKey(report.id, parsed.index),
        candidateIndex: parsed.index,
        candidateName: candidate,
        query: report.query,
        platform: report.platform,
        approvedAt: now,
        approvedBy: user.sub,
        agentEvidence: {
          summary: report.summary ?? null,
          priceRange,
          rating,
          sourceEvidence: this.asRecord(report.opportunities).sourceEvidence,
        },
        guardrails: [
          'english_textlocal DRAFT product',
          'textautomaticpublishenglish_textplatform',
          'text、text、text、ordersenglish_texthumantext',
        ],
      },
    });
    const decision = await this.recordCandidateDecision({
      organizationId: orgId,
      reportId: report.id,
      workspaceId: workspace.id,
      candidateIndex: parsed.index,
      status: 'APPROVED',
      actorId: user.sub,
      reason: null,
    });

    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.candidate.approve',
      resourceType: 'ProductResearchCandidate',
      resourceId: this.candidateKey(report.id, parsed.index),
      after: {
        productId: product.id,
        researchReportId: report.id,
        candidateIndex: parsed.index,
        workspaceId: workspace.id,
        externalStoreMutation: 'not_executed',
      },
    });

    return {
      candidate: this.reportToCandidate(
        report,
        parsed.index,
        candidate,
        product,
        decision,
      ),
      product,
      action: {
        status: 'approved_local_draft',
        externalStoreMutation: 'not_executed',
      },
    };
  }

  async rejectCandidate(
    user: JwtPayload,
    candidateId: string,
    dto: RejectResearchCandidateDto,
  ) {
    const orgId = requireOrg(user);
    const parsed = this.parseCandidateId(candidateId);
    const report = await this.findReportForCandidate(orgId, parsed.reportId);
    if (
      !this.hasVerifiableOzonEvidence(
        report.opportunities,
        report.summary,
        report.query,
      )
    ) {
      throw new BadRequestException(
        'Research candidate cannot be rejected without verifiable Ozon evidence',
      );
    }
    const candidate = this.getCandidateFromReport(report, parsed.index);
    if (!candidate) {
      throw new NotFoundException('Research candidate not found');
    }
    const approvedProducts = await this.findApprovedCandidateProducts(orgId);
    const existing = approvedProducts.find(
      (product) =>
        this.approvedProductCandidateKey(product) ===
        this.candidateKey(report.id, parsed.index),
    );
    if (existing) {
      throw new BadRequestException(
        'An approved local draft cannot be rejected as a pending candidate',
      );
    }

    const reason = dto.reason.trim();
    const decision = await this.recordCandidateDecision({
      organizationId: orgId,
      reportId: report.id,
      workspaceId: report.workspaceId,
      candidateIndex: parsed.index,
      status: 'REJECTED',
      actorId: user.sub,
      reason,
    });
    await this.agentMemory?.learnFromReview({
      organizationId: orgId,
      workspaceId: report.workspaceId,
      sourceReviewTaskId: `product-research:${this.candidateKey(report.id, parsed.index)}`,
      taskType: 'product_research',
      entityType: 'PRODUCT_RESEARCH',
      notes: `Candidate "${candidate}" rejected: ${reason}`,
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.candidate.reject',
      resourceType: 'ProductResearchCandidate',
      resourceId: this.candidateKey(report.id, parsed.index),
      after: {
        researchReportId: report.id,
        candidateIndex: parsed.index,
        reason,
        externalStoreMutation: 'not_executed',
      },
    });

    return {
      candidate: this.reportToCandidate(
        report,
        parsed.index,
        candidate,
        undefined,
        decision,
      ),
      action: {
        status: 'rejected',
        externalStoreMutation: 'not_executed',
      },
    };
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const report = await this.findOwned(orgId, id);
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.productResearchReport.delete({ where: { id: report.id } }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.delete',
      resourceType: 'ProductResearch',
      resourceId: report.id,
      before: { query: report.query },
    });
    return { id: report.id };
  }

  private async findReportForCandidate(
    orgId: string,
    reportId: string,
  ): Promise<ResearchReportForCandidate> {
    const report = await this.tenantDatabase.run(orgId, (tx) =>
      tx.productResearchReport.findFirst({
        where: { id: reportId, organizationId: orgId },
        select: {
          id: true,
          workspaceId: true,
          query: true,
          platform: true,
          summary: true,
          opportunities: true,
          createdAt: true,
        },
      }),
    );
    if (!report) {
      throw new NotFoundException('Research report not found');
    }
    return report;
  }

  private async resolveApprovalWorkspace(
    orgId: string,
    report: ResearchReportForCandidate,
    requestedWorkspaceId?: string,
  ) {
    if (requestedWorkspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, requestedWorkspaceId);
      const workspace = await this.tenantDatabase.run(orgId, (tx) =>
        tx.workspace.findFirst({
          where: { id: requestedWorkspaceId, organizationId: orgId },
          select: { id: true, currency: true },
        }),
      );
      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }
      return workspace;
    }

    if (report.workspaceId) {
      const reportWorkspaceId = report.workspaceId;
      const workspace = await this.tenantDatabase.run(orgId, (tx) =>
        tx.workspace.findFirst({
          where: { id: reportWorkspaceId, organizationId: orgId },
          select: { id: true, currency: true },
        }),
      );
      if (workspace) {
        return workspace;
      }
    }

    const ozonWorkspace = await this.tenantDatabase.run(orgId, (tx) =>
      tx.workspace.findFirst({
        where: {
          organizationId: orgId,
          channelType: 'OZON',
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, currency: true },
      }),
    );
    if (ozonWorkspace) {
      return ozonWorkspace;
    }

    const fallbackWorkspace = await this.tenantDatabase.run(orgId, (tx) =>
      tx.workspace.findFirst({
        where: { organizationId: orgId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, currency: true },
      }),
    );
    if (!fallbackWorkspace) {
      throw new BadRequestException(
        'No workspace is available for approved product candidate',
      );
    }
    return fallbackWorkspace;
  }

  private async findApprovedCandidateProducts(
    orgId: string,
  ): Promise<ApprovedCandidateProduct[]> {
    const products = await this.tenantDatabase.run(orgId, (tx) =>
      tx.product.findMany({
        where: {
          workspace: { organizationId: orgId },
        },
        select: {
          id: true,
          workspaceId: true,
          title: true,
          sku: true,
          asinOrExternalId: true,
          images: true,
          price: true,
          currency: true,
          status: true,
          metadata: true,
          createdAt: true,
        },
      }),
    );
    return products.filter((product) => {
      const metadata = this.asRecord(product.metadata);
      return metadata.source === 'agent-product-research';
    });
  }

  private async findCandidateDecision(
    organizationId: string,
    reportId: string,
    candidateIndex: number,
  ): Promise<CandidateDecision | undefined> {
    const decisions = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.productResearchCandidateDecision.findMany({
          where: { organizationId, reportId, candidateIndex },
          select: {
            reportId: true,
            candidateIndex: true,
            workspaceId: true,
            status: true,
            reason: true,
            createdAt: true,
            updatedAt: true,
          },
          take: 1,
        }),
    );
    return decisions[0];
  }

  private async recordCandidateDecision(input: {
    organizationId: string;
    reportId: string;
    workspaceId: string | null;
    candidateIndex: number;
    status: 'APPROVED' | 'REJECTED';
    reason: string | null;
    actorId: string;
  }): Promise<CandidateDecision> {
    const decision = await this.tenantDatabase.run(
      input.organizationId,
      (transaction) =>
        transaction.productResearchCandidateDecision.upsert({
          where: {
            organizationId_reportId_candidateIndex: {
              organizationId: input.organizationId,
              reportId: input.reportId,
              candidateIndex: input.candidateIndex,
            },
          },
          create: input,
          update: {
            workspaceId: input.workspaceId,
            status: input.status,
            reason: input.reason,
            actorId: input.actorId,
          },
          select: {
            reportId: true,
            candidateIndex: true,
            workspaceId: true,
            status: true,
            reason: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    );
    return decision;
  }

  private async buildStoreContext(
    organizationId: string,
    workspaceId?: string | null,
  ): Promise<Record<string, unknown> | undefined> {
    const [profile, experienceCards] = await Promise.all([
      this.storeProfiles?.buildResearchContext(organizationId, workspaceId) ??
        Promise.resolve(null),
      this.agentMemory?.getExperienceCards({
        organizationId,
        workspaceId: workspaceId ?? undefined,
        taskType: 'product_research',
        limit: 10,
      }) ?? Promise.resolve([]),
    ]);
    const reviewLessons = experienceCards
      .map((card) => this.asOptionalString(this.asRecord(card).lesson))
      .filter((lesson): lesson is string => Boolean(lesson));
    if (!profile && reviewLessons.length === 0) {
      return undefined;
    }
    return {
      ...(profile ?? {}),
      reviewLessons,
    };
  }

  private filterCandidatesForStore(
    competitors: string[],
    storeContext?: Record<string, unknown>,
  ): string[] {
    const forbiddenTerms = Array.isArray(storeContext?.forbiddenTerms)
      ? storeContext.forbiddenTerms
          .filter((term): term is string => typeof term === 'string')
          .map((term) => term.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const seen = new Set<string>();
    return competitors.filter((candidate) => {
      const name = candidate.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return !forbiddenTerms.some((term) => key.includes(term));
    });
  }

  private reportToCandidates(
    report: ResearchReportForCandidate,
    approvedByKey: Map<string, ApprovedCandidateProduct>,
    decisionsByKey: Map<string, CandidateDecision>,
  ) {
    if (
      !this.hasVerifiableOzonEvidence(
        report.opportunities,
        report.summary,
        report.query,
      )
    ) {
      return [];
    }
    return this.extractCompetitors(report.opportunities).map((name, index) => {
      const approvedProduct = approvedByKey.get(
        this.candidateKey(report.id, index),
      );
      const decision = decisionsByKey.get(this.candidateKey(report.id, index));
      return this.reportToCandidate(
        report,
        index,
        name,
        approvedProduct,
        decision,
      );
    });
  }

  private reportToCandidate(
    report: ResearchReportForCandidate,
    index: number,
    name: string,
    approvedProduct?: ApprovedCandidateProduct,
    decision?: CandidateDecision,
  ) {
    const rejected = !approvedProduct && decision?.status === 'REJECTED';
    return {
      id: this.candidateKey(report.id, index),
      reportId: report.id,
      candidateIndex: index,
      name,
      query: report.query,
      platform: report.platform,
      workspaceId: report.workspaceId,
      status: approvedProduct ? 'approved' : rejected ? 'rejected' : 'pending',
      approvedProductId: approvedProduct?.id ?? null,
      rejectionReason: rejected ? (decision?.reason ?? null) : null,
      rejectedAt: rejected ? (decision?.updatedAt.toISOString() ?? null) : null,
      priceRange: this.extractPriceRange(report.opportunities),
      rating: this.extractRating(report.opportunities),
      createdAt: report.createdAt.toISOString(),
    };
  }

  private getCandidateFromReport(
    report: ResearchReportForCandidate,
    index: number,
  ): string | undefined {
    return this.extractCompetitors(report.opportunities)[index];
  }

  private parseCandidateId(candidateId: string) {
    const decoded = decodeURIComponent(candidateId);
    const parts = decoded.split(':');
    if (parts.length !== 2 || !parts[0]) {
      throw new BadRequestException('Research candidate id is invalid');
    }
    const index = Number(parts[1]);
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Research candidate index is invalid');
    }
    return { reportId: parts[0], index };
  }

  private candidateKey(reportId: string, index: number): string {
    return `${reportId}:${index}`;
  }

  private approvedProductCandidateKey(
    product: Pick<ApprovedCandidateProduct, 'metadata'>,
  ): string {
    const metadata = this.asRecord(product.metadata);
    const reportId = this.asOptionalString(metadata.researchReportId);
    const candidateIndex = this.asNumber(metadata.candidateIndex);
    if (!reportId || candidateIndex === null) {
      return '';
    }
    return this.candidateKey(reportId, candidateIndex);
  }

  private extractCompetitors(opportunities: Prisma.JsonValue | null): string[] {
    const payload = this.asRecord(opportunities);
    const competitors = payload.competitors;
    if (!Array.isArray(competitors)) {
      return [];
    }
    return competitors
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private extractPriceRange(
    opportunities: Prisma.JsonValue | null,
  ): ParsedPriceRange {
    const payload = this.asRecord(opportunities);
    const priceRange = this.asRecord(payload.priceRange);
    return {
      min: this.asNumber(priceRange.min),
      max: this.asNumber(priceRange.max),
    };
  }

  private extractRating(opportunities: Prisma.JsonValue | null): number | null {
    return this.asNumber(this.asRecord(opportunities).rating);
  }

  private averagePrice(priceRange: ParsedPriceRange): number {
    const min = priceRange.min;
    const max = priceRange.max;
    if (min !== null && max !== null && max >= min) {
      return Math.round(((min + max) / 2) * 100) / 100;
    }
    if (min !== null) {
      return min;
    }
    if (max !== null) {
      return max;
    }
    return 0;
  }

  private researchFailureCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = this.researchFailureDiagnostics(error);
    if (diagnostics?.code === 'AGENT_JOB_STORE_UNAVAILABLE') {
      return 'AGENT_JOB_STORE_UNAVAILABLE';
    }
    if (diagnostics?.code === 'AGENT_OUTPUT_VERIFICATION_FAILED') {
      return 'RESEARCH_OUTPUT_VERIFICATION_FAILED';
    }
    if (
      typeof diagnostics?.code === 'string' &&
      diagnostics.code.startsWith('RESEARCH_EVIDENCE_')
    ) {
      return 'RESEARCH_EVIDENCE_UNVERIFIABLE';
    }
    return /ozon evidence|verifiable ozon evidence|observed rub prices/i.test(
      message,
    )
      ? 'RESEARCH_EVIDENCE_UNVERIFIABLE'
      : 'RESEARCH_AGENT_FAILED';
  }

  private researchFailureReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = this.researchFailureDiagnostics(error);
    if (diagnostics?.code === 'AGENT_JOB_STORE_UNAVAILABLE') {
      return 'agenttaskenglish_text，taskenglish_text。';
    }
    if (diagnostics?.code === 'AGENT_OUTPUT_VERIFICATION_FAILED') {
      const issues = Array.isArray(diagnostics.issues)
        ? diagnostics.issues.filter(
            (issue): issue is string => typeof issue === 'string',
          )
        : [];
      return issues.length > 0
        ? `agentoutputtextpassedenglish_text：${issues.join('；')}。`
        : 'agentoutputtextpassedenglish_text。';
    }
    if (diagnostics?.code === 'RESEARCH_EVIDENCE_PRICES_INSUFFICIENT') {
      return 'Ozon publicproductsourceenglish_text RUB text，textgenerationreport。';
    }
    if (diagnostics?.code === 'RESEARCH_EVIDENCE_SOURCES_INSUFFICIENT') {
      return 'english_text Ozon publicproductsource，textgenerationreport。';
    }
    if (diagnostics?.code === 'RESEARCH_SEARCH_PROVIDER_UNAVAILABLE') {
      return 'Ozon publicevidencesearchenglish_textconfiguration，textgenerationreport。';
    }
    if (diagnostics?.code === 'RESEARCH_SEARCH_FAILED') {
      return 'Ozon publicevidencesearchfailed，textgenerationreport。';
    }
    if (/observed rub prices/i.test(message)) {
      return 'english_text Ozon english_textevidence。';
    }
    if (
      /two public ozon listing sources|two public ozon sources/i.test(message)
    ) {
      return 'english_text Ozon publicproductsource。';
    }
    if (/ozon evidence|verifiable ozon evidence/i.test(message)) {
      return 'Ozon textevidencetextpassedenglish_text。';
    }
    return 'agenttextgenerationenglish_text Ozon english_text。';
  }

  private researchFailureDiagnostics(
    error: unknown,
  ): Record<string, unknown> | null {
    if (!error || typeof error !== 'object') {
      return null;
    }
    const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
    return diagnostics &&
      typeof diagnostics === 'object' &&
      !Array.isArray(diagnostics)
      ? (diagnostics as Record<string, unknown>)
      : null;
  }

  private researchFailureMessage(error: unknown, fallback: string): string {
    const diagnostics = this.researchFailureDiagnostics(error);
    const issues = Array.isArray(diagnostics?.issues)
      ? diagnostics.issues.filter(
          (issue): issue is string => typeof issue === 'string',
        )
      : [];
    if (issues.length === 0) {
      return fallback;
    }
    return `${fallback} english_text：${issues.join('；')}。`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private hasValidOptionalOzonPrice(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }
    const price = this.asNumber(value);
    return price !== null && price > 0;
  }

  private requireVerifiableOzonEvidence(
    result: {
      summary?: string;
      competitors?: string[];
      sourceEvidence?: {
        source: string;
        fetchedAt: string;
        competitors?: string[];
        items: Array<{
          title: string;
          url: string;
          imageUrl?: string | null;
          fetchedAt: string;
          priceRub?: number | null;
        }>;
      };
      priceRange: { min: number; max: number; currency?: string };
    },
    query?: string,
  ): Record<string, unknown> {
    const evidence = result.sourceEvidence;
    const evidenceRecord = this.asRecord(evidence);
    const items = evidence?.items ?? [];
    const observedPrices = items
      .map((item) => Number(item.priceRub ?? Number.NaN))
      .filter((price) => Number.isFinite(price) && price > 0);
    const hasValidItems =
      evidence?.source === 'ozon_public_listings' &&
      typeof evidence.fetchedAt === 'string' &&
      evidence.fetchedAt.length > 0 &&
      items.length >= 2 &&
      items.every(
        (item) =>
          typeof item.title === 'string' &&
          item.title.trim().length > 0 &&
          typeof item.url === 'string' &&
          /^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(item.url) &&
          typeof item.fetchedAt === 'string' &&
          item.fetchedAt.length > 0 &&
          this.hasValidOptionalOzonPrice(item.priceRub),
      );
    const hasValidPriceRange =
      Number.isFinite(result.priceRange.min) &&
      Number.isFinite(result.priceRange.max) &&
      result.priceRange.min > 0 &&
      result.priceRange.max >= result.priceRange.min &&
      result.priceRange.currency === 'RUB';
    const hasEvidenceDerivedPriceRange =
      observedPrices.length >= 2 &&
      result.priceRange.min === Math.min(...observedPrices) &&
      result.priceRange.max === Math.max(...observedPrices);
    const hasValidSummary =
      typeof result.summary === 'string' && result.summary.trim().length >= 30;
    const evidenceCompetitors = evidence?.competitors;
    const hasEvidenceBoundCompetitors =
      !Array.isArray(evidenceCompetitors) ||
      (Array.isArray(result.competitors) &&
        result.competitors.length >= 2 &&
        result.competitors.every(
          (competitor) =>
            typeof competitor === 'string' &&
            evidenceCompetitors.includes(competitor),
        ));
    const hasQueryRelevantListings = this.hasQueryRelevantOzonListings(
      evidenceRecord,
      query,
    );

    if (
      !hasValidItems ||
      !hasValidPriceRange ||
      !hasEvidenceDerivedPriceRange ||
      !hasValidSummary ||
      !hasEvidenceBoundCompetitors ||
      !hasQueryRelevantListings
    ) {
      throw new BadRequestException(
        'Product research requires verifiable Ozon evidence before a report can be created',
      );
    }
    return evidence;
  }

  private hasVerifiableOzonEvidence(
    opportunities: Prisma.JsonValue | null,
    summary?: string | null,
    query?: string | null,
  ): boolean {
    const payload = this.asRecord(opportunities);
    const evidence = this.asRecord(payload.sourceEvidence);
    const items = Array.isArray(evidence.items) ? evidence.items : [];
    const priceRange = this.asRecord(payload.priceRange);
    const observedPrices = items
      .map((item) => this.asNumber(this.asRecord(item).priceRub))
      .filter((price): price is number => price !== null && price > 0);
    const priceMin = this.asNumber(priceRange.min);
    const priceMax = this.asNumber(priceRange.max);
    const competitors = this.extractCompetitors(opportunities);
    const evidenceCompetitors = Array.isArray(evidence.competitors)
      ? evidence.competitors.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    const hasQueryRelevantListings = this.hasQueryRelevantOzonListings(
      evidence,
      query,
    );
    return (
      evidence.source === 'ozon_public_listings' &&
      typeof evidence.fetchedAt === 'string' &&
      items.length >= 2 &&
      items.every((item) => {
        const source = this.asRecord(item);
        return (
          typeof source.title === 'string' &&
          source.title.trim().length > 0 &&
          typeof source.url === 'string' &&
          /^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(source.url) &&
          typeof source.fetchedAt === 'string' &&
          source.fetchedAt.length > 0 &&
          this.hasValidOptionalOzonPrice(source.priceRub)
        );
      }) &&
      priceMin !== null &&
      priceMax !== null &&
      priceMin > 0 &&
      priceMax >= priceMin &&
      priceRange.currency === 'RUB' &&
      observedPrices.length >= 2 &&
      priceMin === Math.min(...observedPrices) &&
      priceMax === Math.max(...observedPrices) &&
      typeof summary === 'string' &&
      summary.trim().length >= 30 &&
      competitors.length >= 2 &&
      (evidenceCompetitors.length === 0 ||
        competitors.every((competitor) =>
          evidenceCompetitors.includes(competitor),
        )) &&
      hasQueryRelevantListings
    );
  }

  private hasQueryRelevantOzonListings(
    evidence: Record<string, unknown>,
    query?: string | null,
  ): boolean {
    const queryText = typeof query === 'string' ? query.trim() : '';
    if (!queryText) {
      return false;
    }
    if (/[\u3400-\u9fff]/.test(queryText)) {
      return this.hasTranslatedOzonTerms(evidence, queryText);
    }

    const queryTerms = this.researchRelevanceTerms(queryText, true);
    const items = Array.isArray(evidence.items) ? evidence.items : [];
    if (queryTerms.length === 0 || items.length < 2) {
      return false;
    }

    const minimumMatchesPerListing = Math.max(
      1,
      Math.ceil(queryTerms.length / 2),
    );
    const relevantItemTerms = items
      .map((item) => {
        const source = this.asRecord(item);
        const matchedTerms = Array.isArray(source.matchedTerms)
          ? source.matchedTerms.filter(
              (term): term is string => typeof term === 'string',
            )
          : [];
        return this.researchRelevanceTerms(
          [source.title, source.snippet, ...matchedTerms]
            .filter((value): value is string => typeof value === 'string')
            .join(' '),
          false,
        );
      })
      .filter(
        (itemTerms) =>
          queryTerms.filter((queryTerm) =>
            itemTerms.some((itemTerm) =>
              this.researchRelevanceTermMatches(queryTerm, itemTerm),
            ),
          ).length >= minimumMatchesPerListing,
      );

    return (
      relevantItemTerms.length >= 2 &&
      queryTerms.every((queryTerm) =>
        relevantItemTerms.some((itemTerms) =>
          itemTerms.some((itemTerm) =>
            this.researchRelevanceTermMatches(queryTerm, itemTerm),
          ),
        ),
      )
    );
  }

  private researchRelevanceTerms(value: string, excludeStopWords: boolean) {
    return Array.from(
      new Set(
        (
          value
            .normalize('NFKC')
            .toLocaleLowerCase()
            .match(/[\p{L}\p{N}]+/gu) ?? []
        )
          .filter((term) => term.length >= 2)
          .filter(
            (term) =>
              !excludeStopWords || !NON_CJK_RESEARCH_QUERY_STOP_WORDS.has(term),
          ),
      ),
    );
  }

  private researchRelevanceTermMatches(
    queryTerm: string,
    itemTerm: string,
  ): boolean {
    if (queryTerm === itemTerm) {
      return true;
    }
    return (
      queryTerm.length >= 4 &&
      itemTerm.length >= 4 &&
      (queryTerm.startsWith(itemTerm) || itemTerm.startsWith(queryTerm))
    );
  }

  private hasTranslatedOzonTerms(
    evidence: Record<string, unknown>,
    query?: string | null,
  ): boolean {
    const queryText = typeof query === 'string' ? query.trim() : '';
    if (!/[\u3400-\u9fff]/.test(queryText)) {
      return true;
    }
    const relevance = this.asRecord(evidence.relevance);
    const searchQuery = this.asOptionalString(evidence.searchQuery);
    const matchTerms = Array.isArray(relevance.matchTerms)
      ? relevance.matchTerms
          .filter((term): term is string => typeof term === 'string')
          .map((term) => term.trim().toLocaleLowerCase())
          .filter(Boolean)
      : [];
    const items = Array.isArray(evidence.items) ? evidence.items : [];
    if (
      relevance.strategy !== 'translated_query_terms' ||
      !searchQuery ||
      searchQuery === queryText ||
      matchTerms.length === 0 ||
      items.length < 2
    ) {
      return false;
    }
    return items.every((item) => {
      const source = this.asRecord(item);
      const text = [source.title, source.snippet, source.url]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLocaleLowerCase();
      return matchTerms.every((term) => text.includes(term));
    });
  }

  private compactJsonRecord(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    );
  }
}
