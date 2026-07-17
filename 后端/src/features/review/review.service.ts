import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import type { ReviewStatus, ReviewEntityType } from '@prisma/client';
import { isIP } from 'node:net';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { AgentMemoryService } from '../agent-memory/agent-memory.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  CreateReviewTaskDto,
  ReviewListQueryDto,
  UpdateManualPricingDto,
  UpdateReviewDto,
} from './review.dto.js';
import { ListingBundleService } from '../listings/listing-bundle.service.js';
import { ListingEvaluatorService } from '../listings/listing-evaluator.service.js';
import { SupplyChainService } from '../supply-chain/supply-chain.service.js';

const DAILY_PRODUCT_NAME_RULES: ReadonlyArray<
  readonly [readonly string[], string]
> = [
  [['double', 'layer', 'pencil', 'case'], '双层笔袋'],
  [['transparent', 'mesh', 'pencil', 'case'], '透明网格笔袋'],
  [['stackable', 'desk', 'organizer'], '可叠放桌面收纳盒'],
  [['desk', 'organizer', 'tray'], '桌面收纳托盘'],
  [['desk', 'mail', 'organizer'], '桌面信件收纳架'],
  [['luggage', 'tag', 'pu'], '聚氨酯行李牌'],
  [['dustpan', 'brush'], '迷你簸箕刷套装'],
  [['waste', 'bag', 'dispenser'], '宠物拾便袋盒'],
  [['poop', 'bag', 'holder'], '宠物拾便袋盒'],
  [['poop', 'bag'], '宠物拾便袋'],
  [['travel', 'storage', 'bag'], '旅行收纳袋'],
  [['shoe', 'storage', 'bag'], '鞋子收纳袋'],
  [['laundry', 'mesh', 'bag'], '洗衣网袋'],
  [['jewelry', 'storage', 'pouch'], '首饰收纳袋'],
  [['chair', 'leg', 'protector'], '椅脚保护套'],
  [['furniture', 'felt', 'pad'], '家具毛毡垫'],
  [['door', 'handle', 'bumper'], '门把手防撞垫'],
  [['door', 'handle', 'stopper'], '门把手防撞垫'],
  [['pencil', 'case'], '笔袋'],
  [['pencil', 'pouch'], '笔袋'],
  [['pencil', 'bag'], '笔袋'],
  [['passport', 'holder'], '护照夹'],
  [['plant', 'label'], '植物标签牌'],
  [['plant', 'support', 'clip'], '植物固定夹'],
  [['keyboard', 'cleaning', 'brush'], '键盘清洁刷'],
  [['screen', 'cleaning', 'brush'], '屏幕清洁刷'],
  [['toothpaste', 'squeezer'], '牙膏挤压器'],
  [['soap', 'mesh', 'pouch'], '香皂网袋'],
  [['eyeglass', 'case'], '眼镜盒'],
  [['earphone', 'pouch'], '耳机收纳袋'],
  [['badge', 'card', 'holder'], '证件卡套'],
  [['zipper', 'pull'], '拉链头'],
  [['crochet', 'marker'], '编织记号扣'],
  [['sewing', 'thread', 'organizer'], '缝纫线收纳盒'],
  [['bed', 'sheet', 'clip'], '床单固定夹'],
  [['curtain', 'clip'], '窗帘固定夹'],
  [['table', 'purse', 'hook'], '桌边包包挂钩'],
  [['wardrobe', 'divider'], '衣柜分类牌'],
  [['cable', 'label'], '线缆标签牌'],
  [['makeup', 'brush', 'protector'], '化妆刷保护套'],
  [['toothbrush', 'cap'], '牙刷保护套'],
  [['cable', 'strap'], '魔术贴扎带'],
  [['cable', 'organizer'], '理线夹'],
  [['cable', 'clip'], '理线夹'],
  [['drawer', 'divider'], '抽屉分隔条'],
  [['drawer', 'organizer'], '抽屉收纳盒'],
  [['seat', 'gap', 'organizer'], '汽车座椅缝隙收纳盒'],
  [['seat', 'gap', 'filler'], '汽车座椅缝隙塞'],
  [['pen', 'holder'], '笔筒'],
  [['pen', 'organizer'], '笔收纳盒'],
  [['desk', 'organizer'], '桌面收纳盒'],
  [['desk', 'holder'], '桌面收纳架'],
  [['luggage', 'tag'], '行李牌'],
  [['furniture', 'protector'], '家具防撞垫'],
  [['storage', 'pouch'], '收纳袋'],
];

const DAILY_SOURCE_LABELS: Readonly<Record<string, string>> = {
  aliexpress_public_search: '速卖通公开商品',
  amazon_public_search: '亚马逊公开商品',
  ebay_public_search: 'eBay 公开商品',
  etsy_public_search: 'Etsy 公开商品',
  google_shopping_public_sample: 'Google 购物公开商品',
  ozon_public_search_sample: 'Ozon 公开商品',
  temu_public_search: 'Temu 公开商品',
  walmart_public_search: '沃尔玛公开商品',
  wildberries_public_search: 'Wildberries 公开商品',
};

type DailyRawEvidence = {
  source: string;
  url: string | null;
  imageUrl: string | null;
  imageEvidenceUrl: string | null;
  displayNameZh: string | null;
  sourcingQueryZh: string | null;
};

const MANUAL_PRICING_AMOUNT_FIELDS = [
  'procurementCost',
  'domesticShippingCost',
  'internationalShippingCost',
  'warehousingCost',
  'packagingCost',
] as const;

const MANUAL_PRICING_RATE_FIELDS = [
  'ozonCommissionRatePercent',
  'paymentCollectionFeeRatePercent',
  'advertisingRatePercent',
  'refundLossRatePercent',
  'taxRatePercent',
  'fxBufferRatePercent',
] as const;

const MANUAL_PRICING_REQUIRED_FIELDS = [
  'currency',
  ...MANUAL_PRICING_AMOUNT_FIELDS,
  ...MANUAL_PRICING_RATE_FIELDS,
  'notes',
  'riskEvidence',
] as const;

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('review-notifications')
    private readonly reviewNotificationQueue: Queue,
    private readonly agentMemory: AgentMemoryService,
    private readonly listingBundles: ListingBundleService,
    private readonly listingEvaluator: ListingEvaluatorService,
    private readonly supplyChain: SupplyChainService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrg(user: JwtPayload): string {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    return user.orgId;
  }

  /**
   * Create a review task after an agent run completes.
   * Called from worker context (no JwtPayload available).
   */
  async createFromAgentRun(
    orgId: string,
    dto: CreateReviewTaskDto,
  ): Promise<{
    id: string;
    status: string;
    autoApproved: boolean;
    score: number | null;
    threshold: number;
  }> {
    const score = dto.score ?? null;
    const threshold = dto.threshold ?? 60;
    const approvalScope =
      dto.entityType === 'LISTING_DRAFT'
        ? await this.captureListingApprovalScope(orgId, dto.entityId)
        : {};
    // Product research candidates always require a human to inspect the
    // source evidence and explicitly authorize the image/publishing flow.
    const autoApproved =
      dto.entityType !== 'PRODUCT_RESEARCH' &&
      dto.entityType !== 'LISTING_DRAFT' &&
      score !== null &&
      score >= threshold;

    const reviewTask = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.create({
        data: {
          organizationId: orgId,
          entityType: dto.entityType as
            | 'AGENT_RUN'
            | 'IMAGE_GENERATION'
            | 'LISTING_DRAFT'
            | 'PRODUCT_RESEARCH',
          entityId: dto.entityId,
          status: autoApproved ? 'APPROVED' : 'PENDING',
          score,
          threshold,
          autoApproved,
          autoRegenerations: 0,
          approvalScope: approvalScope as Prisma.InputJsonValue,
        },
      }),
    );

    if (score !== null && score < threshold) {
      await this.learnFromLowScoreReview(orgId, {
        id: reviewTask.id,
        entityType: reviewTask.entityType,
        score,
        threshold,
      });
    }

    // If score is very low (< 30) trigger urgent review notification
    if (score !== null && score < 30) {
      await this.reviewNotificationQueue.add('notification', {
        organizationId: orgId,
        userId: '',
        type: 'APPROVAL_REQUIRED',
        title: 'Low consistency score — review required',
        body: `Review task ${reviewTask.id} for ${dto.entityType} ${dto.entityId} scored ${score} (below threshold ${threshold}).`,
        metadata: {
          reviewTaskId: reviewTask.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          score,
          threshold,
          urgent: true,
        },
      });
    }

    // If below threshold but not urgent, still create approval notification
    if (!autoApproved && (score === null || score >= 30)) {
      await this.reviewNotificationQueue.add('notification', {
        organizationId: orgId,
        userId: '',
        type: 'APPROVAL_REQUIRED',
        title: 'Content pending review',
        body: `Review task ${reviewTask.id} for ${dto.entityType} ${dto.entityId} requires approval.`,
        metadata: {
          reviewTaskId: reviewTask.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          score,
          threshold,
          urgent: false,
        },
      });
    }

    return {
      id: reviewTask.id,
      status: reviewTask.status,
      autoApproved: reviewTask.autoApproved,
      score: reviewTask.score,
      threshold: reviewTask.threshold,
    };
  }

  /** List review tasks with org-scoped filtering. */
  async findAll(user: JwtPayload, query: ReviewListQueryDto) {
    const orgId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ReviewTaskWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status as ReviewStatus } : {}),
      ...(query.entityType
        ? { entityType: query.entityType as ReviewEntityType }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.reviewTask.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.reviewTask.count({ where }),
      ]),
    );

    return {
      items: await Promise.all(
        items.map((item) => this.enrichReviewTask(orgId, item)),
      ),
      total,
      page,
      limit,
    };
  }

  /** Get a single review task (org-scoped). */
  async findOne(user: JwtPayload, id: string) {
    const orgId = this.requireOrg(user);
    const task = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!task) {
      throw new NotFoundException('Review task not found');
    }
    return this.enrichReviewTask(orgId, task);
  }

  async updateManualPricing(
    user: JwtPayload,
    id: string,
    dto: UpdateManualPricingDto,
  ) {
    const organizationId = this.requireOrg(user);
    const result = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const task = await tx.reviewTask.findFirst({
          where: { id, organizationId },
        });
        if (!task) {
          throw new NotFoundException('Review task not found');
        }
        if (task.entityType !== 'PRODUCT_RESEARCH') {
          throw new BadRequestException({
            code: 'MANUAL_PRICING_NOT_APPLICABLE',
            message: '人工核价只能用于选品审核任务。',
          });
        }
        if (!['PENDING', 'REWORK'].includes(task.status)) {
          throw new BadRequestException({
            code: 'MANUAL_PRICING_REVIEW_CLOSED',
            message: '该审核任务已关闭，不能再修改核价证据。',
          });
        }

        const decisionEvidence = this.asRecord(task.decisionEvidence);
        if (decisionEvidence.manualPricingRequired !== true) {
          throw new BadRequestException({
            code: 'MANUAL_PRICING_NOT_REQUIRED',
            message: '该任务没有进入人工核价流程。',
          });
        }

        const previous = this.asRecord(decisionEvidence.manualPricing);
        const nextValues: Record<string, string | number | null> = {};
        for (const field of MANUAL_PRICING_AMOUNT_FIELDS) {
          nextValues[field] = this.manualPricingNumber(
            dto[field],
            previous[field],
            1_000_000_000,
          );
        }
        for (const field of MANUAL_PRICING_RATE_FIELDS) {
          nextValues[field] = this.manualPricingNumber(
            dto[field],
            previous[field],
            100,
          );
        }
        nextValues.currency = this.manualPricingCurrency(
          dto.currency,
          previous.currency,
        );
        nextValues.notes = this.manualPricingText(dto.notes, previous.notes);
        nextValues.riskEvidence = this.manualPricingText(
          dto.riskEvidence,
          previous.riskEvidence,
        );

        const missingFields = MANUAL_PRICING_REQUIRED_FIELDS.filter(
          (field) => nextValues[field] === null,
        );
        if (dto.action === 'SUBMIT_COMPLETE' && missingFields.length > 0) {
          throw new BadRequestException({
            code: 'MANUAL_PRICING_INCOMPLETE',
            message: '核价资料不完整，不能提交为“核价已补充”。',
            missingFields,
          });
        }
        if (
          dto.action === 'SUBMIT_INCOMPLETE' &&
          (typeof nextValues.notes !== 'string' ||
            nextValues.notes.trim().length < 5)
        ) {
          throw new BadRequestException({
            code: 'MANUAL_PRICING_INCOMPLETE_REASON_REQUIRED',
            message: '提交“仍需补充”时，请填写至少 5 个字符的备注。',
          });
        }

        const now = new Date().toISOString();
        const previousRevision = this.asFiniteNumber(previous.revision);
        const state =
          dto.action === 'SUBMIT_COMPLETE'
            ? 'COMPLETE'
            : dto.action === 'SUBMIT_INCOMPLETE'
              ? 'INCOMPLETE'
              : 'DRAFT';
        const manualPricing = {
          schemaVersion: 'manual-pricing-evidence/v1',
          state,
          revision:
            previousRevision !== null &&
            Number.isInteger(previousRevision) &&
            previousRevision >= 0
              ? previousRevision + 1
              : 1,
          ...nextValues,
          missingFields,
          updatedBy: user.sub,
          updatedAt: now,
          ...(dto.action === 'SAVE_DRAFT'
            ? {}
            : { submittedBy: user.sub, submittedAt: now }),
        };
        const nextDecisionEvidence = {
          ...decisionEvidence,
          manualPricing,
        };
        const updated = await tx.reviewTask.update({
          where: { id: task.id },
          data: {
            assignedTo: user.sub,
            decisionEvidence: nextDecisionEvidence,
          },
        });
        return { updated, previous, manualPricing };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const action =
      dto.action === 'SUBMIT_COMPLETE'
        ? 'MANUAL_PRICING_COMPLETE_SUBMITTED'
        : dto.action === 'SUBMIT_INCOMPLETE'
          ? 'MANUAL_PRICING_INCOMPLETE_SUBMITTED'
          : 'MANUAL_PRICING_DRAFT_SAVED';
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action,
      resourceType: 'REVIEW_TASK',
      resourceId: id,
      before: { manualPricing: result.previous },
      after: { manualPricing: result.manualPricing },
    });
    return this.enrichReviewTask(organizationId, result.updated);
  }

  /**
   * Update review task — approve, reject, or request rework.
   * Logs an audit trail entry.
   */
  async update(user: JwtPayload, id: string, dto: UpdateReviewDto) {
    const orgId = this.requireOrg(user);
    const task = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!task) {
      throw new NotFoundException('Review task not found');
    }

    if (task.entityType === 'PRODUCT_RESEARCH' && dto.status === 'APPROVED') {
      throw new BadRequestException(
        'Product research approval requires explicit product launch confirmation',
      );
    }
    if (task.entityType === 'AGENT_RUN' && dto.status === 'APPROVED') {
      const agentRun = await this.tenantDatabase.run(orgId, (tx) =>
        tx.agentRun.findFirst({
          where: { id: task.entityId, organizationId: orgId },
          select: { status: true, errorCode: true },
        }),
      );
      if (!agentRun) {
        throw new NotFoundException('Agent run not found');
      }
      if (agentRun.status !== 'COMPLETED') {
        throw new BadRequestException({
          code: 'AGENT_RUN_NOT_APPROVABLE',
          message:
            '失败或未完成的智能体任务不能标记为通过，请选择“驳回”或“要求重做”。',
          agentRunStatus: agentRun.status,
          errorCode: agentRun.errorCode,
        });
      }
    }
    if (task.entityType === 'LISTING_DRAFT' && dto.status === 'APPROVED') {
      return this.approveListingReview(user, task, dto.notes);
    }
    if (task.entityType === 'SUPPLY_PLAN') {
      await this.supplyChain.decide(user, task.entityId, {
        decision: dto.status === 'APPROVED' ? 'APPROVE' : 'REJECT',
        reason: dto.notes,
      });
      return this.findOne(user, task.id);
    }

    const before = { status: task.status, notes: task.notes };

    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.update({
        where: { id: task.id },
        data: {
          status: dto.status as 'APPROVED' | 'REJECTED' | 'REWORK',
          notes: dto.notes ?? task.notes,
          reviewedAt: new Date(),
          assignedTo: user.sub,
        },
      }),
    );

    // Log audit trail
    await this.audit.appendStrict({
      organizationId: orgId,
      actorId: user.sub,
      action: `REVIEW_${dto.status}`,
      resourceType: 'REVIEW_TASK',
      resourceId: task.id,
      before,
      after: {
        status: updated.status,
        notes: updated.notes,
        reviewedAt: updated.reviewedAt,
      },
    });

    await this.updateWorkMemoryReviewOutcome(orgId, {
      entityType: updated.entityType,
      entityId: updated.entityId,
      status: updated.status,
      notes: updated.notes,
    });

    // If approved, update the original entity status (if applicable)
    if (dto.status === 'APPROVED') {
      await this.updateOriginalEntityStatus(orgId, task);
    }

    // If rejected or rework, notify the original entity creator
    if (dto.status === 'REJECTED' || dto.status === 'REWORK') {
      await this.learnFromRejectedReview(orgId, {
        id: updated.id,
        entityType: updated.entityType,
        score: updated.score,
        notes: updated.notes,
      });
      await this.reviewNotificationQueue.add('notification', {
        organizationId: orgId,
        userId: '',
        type: 'APPROVAL_REQUIRED',
        title:
          dto.status === 'REJECTED'
            ? 'Content rejected — needs revision'
            : 'Rework requested',
        body: `Review task ${task.id} for ${task.entityType} ${task.entityId} was ${dto.status.toLowerCase()}.${dto.notes ? ` Notes: ${dto.notes}` : ''}`,
        metadata: {
          reviewTaskId: task.id,
          entityType: task.entityType,
          entityId: task.entityId,
          action: dto.status,
          notes: dto.notes,
        },
      });
    }

    return updated;
  }

  private async captureListingApprovalScope(
    organizationId: string,
    listingDraftId: string,
  ): Promise<Record<string, unknown>> {
    const listing = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingDraft.findFirst({
        where: { id: listingDraftId, organizationId },
        select: {
          id: true,
          schemaVersion: true,
          bundle: true,
          contentHash: true,
          approvalHash: true,
        },
      }),
    );
    if (!listing) {
      throw new NotFoundException('Listing draft not found');
    }
    const bundle = this.listingBundles.parseStoredBundle(listing.bundle);
    if (!bundle || !listing.contentHash || !listing.approvalHash) {
      throw new BadRequestException({
        code: 'LISTING_SCOPE_UNAVAILABLE',
        message:
          'Listing must have valid content and complete approval hashes before review.',
      });
    }
    const computedHash = this.listingBundles.computeOutputSha256(bundle);
    const approvalHash = this.listingBundles.computeApprovalSha256(bundle);
    if (
      computedHash !== listing.contentHash ||
      computedHash !== bundle.provenance.outputSha256 ||
      approvalHash !== listing.approvalHash
    ) {
      throw new BadRequestException({
        code: 'LISTING_PROVENANCE_INVALID',
        message: 'Listing content does not match its recorded provenance hash.',
      });
    }
    return {
      type: 'listing-content/v2',
      listingDraftId: listing.id,
      contentSha256: computedHash,
      listingSha256: approvalHash,
      schemaVersion: listing.schemaVersion,
      capturedAt: new Date().toISOString(),
    };
  }

  private async approveListingReview(
    user: JwtPayload,
    task: {
      id: string;
      organizationId: string;
      entityId: string;
      notes: string | null;
      status: ReviewStatus;
    },
    notes?: string,
  ) {
    const organizationId = this.requireOrg(user);
    return this.prisma.$transaction(async (tx) => {
      const currentTask = await tx.reviewTask.findFirst({
        where: {
          id: task.id,
          organizationId,
          entityType: 'LISTING_DRAFT',
        },
      });
      if (!currentTask) {
        throw new NotFoundException('Review task not found');
      }
      const scope = this.asRecord(currentTask.approvalScope);
      const scopeHash = this.asOptionalString(scope.contentSha256);
      const scopeListingHash = this.asOptionalString(scope.listingSha256);
      if (
        scope.type !== 'listing-content/v2' ||
        scope.listingDraftId !== currentTask.entityId ||
        !scopeHash ||
        !scopeListingHash
      ) {
        throw new BadRequestException({
          code: 'LISTING_APPROVAL_SCOPE_MISSING',
          message:
            'Review task is not bound to a complete listing approval hash.',
        });
      }

      const listing = await tx.listingDraft.findFirst({
        where: { id: currentTask.entityId, organizationId },
      });
      if (!listing) {
        throw new NotFoundException('Listing draft not found');
      }
      if (
        listing.contentHash !== scopeHash ||
        listing.approvalHash !== scopeListingHash
      ) {
        throw new BadRequestException({
          code: 'LISTING_CHANGED_AFTER_REVIEW',
          message:
            'Listing changed after review creation. Create a new review task.',
        });
      }
      const bundle = this.listingBundles.parseStoredBundle(listing.bundle);
      if (!bundle) {
        throw new BadRequestException({
          code: 'LISTING_BUNDLE_INVALID',
          message: 'Stored Listing Bundle failed runtime validation.',
        });
      }
      const computedHash = this.listingBundles.computeOutputSha256(bundle);
      const computedListingHash =
        this.listingBundles.computeApprovalSha256(bundle);
      if (
        computedHash !== scopeHash ||
        bundle.provenance.outputSha256 !== scopeHash ||
        computedListingHash !== scopeListingHash
      ) {
        throw new BadRequestException({
          code: 'LISTING_CHANGED_AFTER_REVIEW',
          message: 'Listing provenance no longer matches the reviewed content.',
        });
      }

      const approvedAt = new Date();
      const approval = {
        approved: true as const,
        approvedBy: user.sub,
        approvedAt: approvedAt.toISOString(),
      };
      const evaluation = this.listingEvaluator.evaluate(bundle, { approval });
      if (evaluation.outcome !== 'QUALIFIED') {
        throw new BadRequestException({
          code: 'LISTING_NOT_QUALIFIED',
          message: 'Listing still has blocking or review requirements.',
          evaluation,
        });
      }

      const listingUpdate = await tx.listingDraft.updateMany({
        where: {
          id: listing.id,
          organizationId,
          contentHash: scopeHash,
          approvalHash: scopeListingHash,
        },
        data: {
          status: 'APPROVED',
          evaluationResult: evaluation as unknown as Prisma.InputJsonValue,
          score: evaluation.score,
        },
      });
      if (listingUpdate.count !== 1) {
        throw new BadRequestException({
          code: 'LISTING_CHANGED_DURING_APPROVAL',
          message: 'Listing changed during approval. No approval was recorded.',
        });
      }

      const decisionEvidence = {
        type: 'listing-approval/v2',
        approvedContentSha256: scopeHash,
        approvedListingSha256: scopeListingHash,
        approvedBy: user.sub,
        approvedAt: approvedAt.toISOString(),
        evaluatorVersion: evaluation.evaluatorVersion,
        evaluatorOutcome: evaluation.outcome,
        evaluatorScore: evaluation.score,
      };
      const updated = await tx.reviewTask.update({
        where: { id: currentTask.id },
        data: {
          status: 'APPROVED',
          notes: notes ?? currentTask.notes,
          reviewedAt: approvedAt,
          assignedTo: user.sub,
          score: evaluation.score,
          decisionEvidence: decisionEvidence,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.sub,
          action: 'REVIEW_APPROVED',
          resourceType: 'REVIEW_TASK',
          resourceId: currentTask.id,
          before: { status: currentTask.status, notes: currentTask.notes },
          after: {
            status: 'APPROVED',
            notes: updated.notes,
            reviewedAt: approvedAt,
            decisionEvidence,
          },
        },
      });
      return updated;
    });
  }

  private async updateWorkMemoryReviewOutcome(
    orgId: string,
    task: {
      entityType: string;
      entityId: string;
      status: string;
      notes: string | null;
    },
  ): Promise<void> {
    if (task.entityType !== 'AGENT_RUN') {
      return;
    }
    try {
      await this.agentMemory.updateReviewOutcome({
        organizationId: orgId,
        agentRunId: task.entityId,
        reviewStatus: task.status,
        reviewNotes: task.notes,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update work memory review outcome for ${task.entityId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async learnFromRejectedReview(
    orgId: string,
    task: {
      id: string;
      entityType: string;
      score: number | null;
      notes: string | null;
    },
  ): Promise<void> {
    const notes = task.notes?.trim();
    if (!notes) {
      return;
    }
    await this.writeExperienceCard({
      orgId,
      sourceReviewTaskId: task.id,
      entityType: task.entityType,
      score: task.score,
      notes,
    });
  }

  private async learnFromLowScoreReview(
    orgId: string,
    task: {
      id: string;
      entityType: string;
      score: number;
      threshold: number;
    },
  ): Promise<void> {
    await this.writeExperienceCard({
      orgId,
      sourceReviewTaskId: `${task.id}:low-score`,
      entityType: task.entityType,
      score: task.score,
      notes: `Low consistency score ${task.score} below threshold ${task.threshold}.`,
    });
  }

  private async writeExperienceCard(input: {
    orgId: string;
    sourceReviewTaskId: string;
    entityType: string;
    score: number | null;
    notes: string;
  }): Promise<void> {
    try {
      await this.agentMemory.learnFromReview({
        organizationId: input.orgId,
        sourceReviewTaskId: input.sourceReviewTaskId,
        taskType: this.taskTypeFromEntity(input.entityType),
        entityType: input.entityType,
        score: input.score,
        notes: input.notes,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write review learning card for ${input.sourceReviewTaskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private taskTypeFromEntity(entityType: string): string {
    switch (entityType) {
      case 'IMAGE_GENERATION':
        return 'IMAGE_CREATIVE';
      case 'LISTING_DRAFT':
        return 'LISTING_OPTIMIZER';
      case 'PRODUCT_RESEARCH':
        return 'PRODUCT_RESEARCHER';
      default:
        return 'GENERAL_ASSISTANT';
    }
  }

  private async enrichReviewTask<
    T extends {
      id: string;
      entityType: string;
      entityId: string;
      organizationId: string;
    },
  >(orgId: string, task: T) {
    switch (task.entityType) {
      case 'AGENT_RUN': {
        const agentRun = await this.tenantDatabase.run(orgId, (tx) =>
          tx.agentRun.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(agentRun),
          entityLoadError: agentRun
            ? null
            : '关联 AgentRun 不存在或不属于当前组织。',
          agentRun,
        };
      }
      case 'IMAGE_GENERATION': {
        const imageProject = await this.tenantDatabase.run(orgId, (tx) =>
          tx.imagePromptProject.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(imageProject),
          entityLoadError: imageProject
            ? null
            : '关联图片项目不存在或不属于当前组织。',
          imageProject,
        };
      }
      case 'LISTING_DRAFT': {
        const listingDraft = await this.tenantDatabase.run(orgId, (tx) =>
          tx.listingDraft.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(listingDraft),
          entityLoadError: listingDraft
            ? null
            : '关联 Listing 草稿不存在或不属于当前组织。',
          listingDraft,
        };
      }
      case 'PRODUCT_RESEARCH': {
        const productResearch = await this.tenantDatabase.run(orgId, (tx) =>
          tx.productResearchReport.findFirst({
            where: { id: task.entityId, organizationId: orgId },
          }),
        );
        const dailyCandidate = productResearch
          ? null
          : await this.tenantDatabase.run(orgId, (tx) =>
              tx.productCandidate.findFirst({
                where: { id: task.entityId, organizationId: orgId },
                include: {
                  researchRun: {
                    select: {
                      id: true,
                      businessDate: true,
                      scheduleTimezone: true,
                      status: true,
                    },
                  },
                  signals: {
                    orderBy: [{ source: 'asc' }, { fetchedAt: 'desc' }],
                  },
                  risks: { orderBy: { createdAt: 'asc' } },
                  scores: { orderBy: { createdAt: 'desc' }, take: 1 },
                  economicsEvaluations: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                      id: true,
                      contentHash: true,
                      inputSetHash: true,
                      status: true,
                      decision: true,
                      currency: true,
                      salePrice: true,
                      grossMarginBeforeAds: true,
                      netProfitAfterAds: true,
                      netMarginAfterAds: true,
                      totalCost: true,
                      hardGateReasons: true,
                      validFrom: true,
                      validUntil: true,
                      calculatorVersion: true,
                      createdAt: true,
                    },
                  },
                  productLaunches: {
                    where: { reviewTaskId: task.id },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              }),
            );
        const productResearchPreview = productResearch
          ? await this.buildProductResearchPreview(
              orgId,
              task.entityId,
              productResearch,
            )
          : null;
        const dailyProductResearchPreview = dailyCandidate
          ? this.buildDailyProductResearchPreview(dailyCandidate)
          : null;
        const entityAvailable = Boolean(productResearch || dailyCandidate);
        return {
          ...task,
          entityAvailable,
          entityLoadError: entityAvailable
            ? null
            : '关联选品报告或每日候选不存在，或不属于当前组织。',
          productResearch,
          productResearchPreview:
            productResearchPreview ??
            dailyProductResearchPreview?.productResearchPreview ??
            null,
          dailyProductCandidate: dailyCandidate,
          dailyProductResearchPreview,
        };
      }
      case 'SUPPLY_PLAN': {
        const supplyPlan = await this.tenantDatabase.run(orgId, (transaction) =>
          transaction.replenishmentPlan.findFirst({
            where: { id: task.entityId, organizationId: orgId },
            include: {
              supplySku: {
                include: {
                  supplier: { select: { id: true, name: true } },
                },
              },
            },
          }),
        );
        return {
          ...task,
          entityAvailable: Boolean(supplyPlan),
          entityLoadError: supplyPlan
            ? null
            : '关联补货计划不存在或不属于当前组织。',
          supplyPlan,
        };
      }
      default:
        return {
          ...task,
          entityAvailable: false,
          entityLoadError: `未知审核实体类型：${task.entityType}`,
        };
    }
  }

  /** Get review statistics for the organization. */
  async getStats(user: JwtPayload) {
    const orgId = this.requireOrg(user);

    const [
      pendingCount,
      approvedCount,
      rejectedCount,
      reworkCount,
      totalCount,
    ] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'PENDING' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'APPROVED' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'REJECTED' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId, status: 'REWORK' },
        }),
        tx.reviewTask.count({
          where: { organizationId: orgId },
        }),
      ]),
    );

    // Average score
    const avgResult = await this.tenantDatabase.run(orgId, (tx) =>
      tx.reviewTask.aggregate({
        where: {
          organizationId: orgId,
          score: { not: null },
        },
        _avg: { score: true },
      }),
    );

    // Average time to review (in hours) — raw query for date diff
    let avgReviewTimeHours: number | null = null;
    try {
      const result = await this.tenantDatabase.run(orgId, (tx) =>
        tx.$queryRawUnsafe<Array<{ avg_hours: number | null }>>(
          `SELECT AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")) / 3600) AS avg_hours
           FROM "review_tasks"
           WHERE "organizationId" = $1
             AND "reviewedAt" IS NOT NULL
             AND "createdAt" IS NOT NULL`,
          orgId,
        ),
      );
      avgReviewTimeHours = result[0]?.avg_hours ?? null;
    } catch {
      // Gracefully handle if column names differ
    }

    const approvalRate =
      totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

    return {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      rework: reworkCount,
      total: totalCount,
      approvalRate,
      avgScore: avgResult._avg.score,
      avgReviewTimeHours,
    };
  }

  /**
   * Update the original entity's status when a review task is approved.
   * For AGENT_RUN — no status change needed (already COMPLETED).
   * For IMAGE_GENERATION — update ImagePromptProject status.
   * Listing approvals use approveListingReview and never mark a local draft
   * as externally published.
   */
  private async updateOriginalEntityStatus(
    organizationId: string,
    task: {
      entityType: string;
      entityId: string;
    },
  ): Promise<void> {
    switch (task.entityType) {
      case 'IMAGE_GENERATION':
        await this.tenantDatabase.run(organizationId, (tx) =>
          tx.imagePromptProject.update({
            where: { id: task.entityId },
            data: { status: 'COMPLETED' },
          }),
        );
        break;
      // AGENT_RUN and PRODUCT_RESEARCH are already terminal
      default:
        break;
    }
  }

  private buildDailyProductResearchPreview(candidate: {
    id: string;
    organizationId: string;
    workspaceId: string | null;
    researchRunId: string;
    canonicalName: string;
    productType: string;
    material: string | null;
    primaryUse: string | null;
    status: string;
    confidenceScore: number | null;
    dataCompleteness: number;
    rawSummary: Prisma.JsonValue | null;
    researchRun: {
      id: string;
      businessDate: Date;
      scheduleTimezone: string;
      status: string;
    };
    signals: Array<{
      id: string;
      source: string;
      provider: string;
      url: string | null;
      fetchedAt: Date;
      metricValue: Prisma.Decimal | null;
    }>;
    risks: Array<{
      riskType: string;
      severity: string;
      ruleVersion: string;
      reviewStatus: string;
      createdAt: Date;
    }>;
    scores: Array<{
      finalScore: Prisma.Decimal;
      hardGateStatus: string;
      hardGateReasons: string[];
      rank: number | null;
      decision: string;
      createdAt: Date;
    }>;
    economicsEvaluations: Array<{
      id: string;
      contentHash: string;
      inputSetHash: string;
      status: string;
      decision: string;
      currency: string;
      salePrice: Prisma.Decimal | null;
      grossMarginBeforeAds: Prisma.Decimal | null;
      netProfitAfterAds: Prisma.Decimal | null;
      netMarginAfterAds: Prisma.Decimal | null;
      totalCost: Prisma.Decimal | null;
      hardGateReasons: string[];
      validFrom: Date;
      validUntil: Date;
      calculatorVersion: string;
      createdAt: Date;
    }>;
    productLaunches: Array<Record<string, unknown>>;
  }) {
    const now = Date.now();
    const evaluation = candidate.economicsEvaluations.find(
      (item) =>
        item.status === 'VERIFIED' &&
        item.decision === 'PASS' &&
        item.hardGateReasons.length === 0 &&
        item.salePrice !== null &&
        Number(item.salePrice) > 0 &&
        item.validFrom.getTime() <= now &&
        item.validUntil.getTime() > now,
    );
    const launch = candidate.productLaunches[0] ?? null;
    const latestFetchedAt = candidate.signals.reduce<Date | null>(
      (latest, item) =>
        !latest || item.fetchedAt.getTime() > latest.getTime()
          ? item.fetchedAt
          : latest,
      null,
    );
    const rawEvidence = this.dailyRawEvidence(candidate.rawSummary);
    const displayName = this.dailyProductDisplayName(
      candidate,
      rawEvidence,
      candidate.rawSummary,
    );
    const safeSignalUrls = new Set(
      candidate.signals.flatMap((item) => {
        const url = this.safePublicHttpsUrl(item.url);
        return url ? [url] : [];
      }),
    );
    const imageEvidenceCandidates = rawEvidence.filter(
      (
        item,
      ): item is DailyRawEvidence & {
        imageUrl: string;
        imageEvidenceUrl: string;
      } => Boolean(item.imageUrl && item.imageEvidenceUrl),
    );
    const primaryImageEvidence =
      imageEvidenceCandidates.find((item) =>
        safeSignalUrls.has(item.imageEvidenceUrl),
      ) ??
      imageEvidenceCandidates[0] ??
      null;
    const sourceEvidenceItems = this.dailySourceEvidenceItems({
      candidateId: candidate.id,
      displayName,
      signals: candidate.signals,
      rawEvidence,
      primaryImageEvidence,
      latestFetchedAt,
    });
    const rank = candidate.scores[0]?.rank;
    const productResearchPreview = {
      reportId: candidate.researchRunId,
      query: displayName,
      platform: 'MULTI',
      summary:
        '每日真实选品候选。只有绑定仍在有效期内且已通过核验的利润评估，并由服务端重新通过风险审核后，才允许进入本地图片与商品资料准备。',
      createdAt: candidate.researchRun.businessDate,
      priceRange: {
        min: evaluation?.salePrice ? Number(evaluation.salePrice) : null,
        max: evaluation?.salePrice ? Number(evaluation.salePrice) : null,
        currency: evaluation?.currency ?? null,
      },
      rating: candidate.scores[0]
        ? Number(candidate.scores[0].finalScore)
        : null,
      sourceEvidence: {
        source: 'daily_product_research_signals',
        provider: null,
        fetchedAt: latestFetchedAt,
        searchQuery: displayName,
        relevance: {
          strategy: 'daily_candidate_exact_binding',
          matchTerms: [displayName],
        },
        items: sourceEvidenceItems,
      },
      candidates: [
        {
          id: candidate.id,
          candidateIndex: typeof rank === 'number' && rank > 0 ? rank - 1 : 0,
          name: displayName,
          status: launch ? 'approved' : 'pending',
          rejectionReason: null,
          decidedAt: null,
          productUrl:
            primaryImageEvidence?.imageEvidenceUrl ??
            sourceEvidenceItems[0]?.url ??
            null,
          imageUrl: primaryImageEvidence?.imageUrl ?? null,
          priceRub: evaluation?.salePrice ? Number(evaluation.salePrice) : null,
          evidenceFetchedAt: latestFetchedAt,
          evidenceReady: Boolean(evaluation),
          economicsEvaluationId: evaluation?.id ?? null,
          economicsEvaluationHash: evaluation?.contentHash ?? null,
          economicsValidUntil: evaluation?.validUntil ?? null,
          launch,
        },
      ],
    };
    return {
      kind: 'daily_product_candidate',
      candidateId: candidate.id,
      researchRunId: candidate.researchRunId,
      workspaceId: candidate.workspaceId,
      canonicalName: candidate.canonicalName,
      displayName,
      productType: candidate.productType,
      material: candidate.material,
      primaryUse: candidate.primaryUse,
      status: candidate.status,
      confidenceScore: candidate.confidenceScore,
      dataCompleteness: candidate.dataCompleteness,
      rawSummary: candidate.rawSummary,
      run: candidate.researchRun,
      signalCount: candidate.signals.length,
      signalSources: [...new Set(candidate.signals.map((item) => item.source))],
      riskSummary: candidate.risks.map((risk) => ({
        riskType: risk.riskType,
        severity: risk.severity,
        ruleVersion: risk.ruleVersion,
        reviewStatus: risk.reviewStatus,
        createdAt: risk.createdAt,
      })),
      latestScore: candidate.scores[0] ?? null,
      economicsProofPointer: evaluation
        ? {
            evaluationId: evaluation.id,
            contentHash: evaluation.contentHash,
            inputSetHash: evaluation.inputSetHash,
            status: evaluation.status,
            decision: evaluation.decision,
            currency: evaluation.currency,
            salePrice: evaluation.salePrice?.toString() ?? null,
            grossMarginBeforeAds:
              evaluation.grossMarginBeforeAds?.toString() ?? null,
            netProfitAfterAds: evaluation.netProfitAfterAds?.toString() ?? null,
            netMarginAfterAds: evaluation.netMarginAfterAds?.toString() ?? null,
            totalCost: evaluation.totalCost?.toString() ?? null,
            calculatorVersion: evaluation.calculatorVersion,
            validFrom: evaluation.validFrom,
            validUntil: evaluation.validUntil,
          }
        : null,
      launch,
      productResearchPreview,
    };
  }

  private dailyRawEvidence(value: unknown): DailyRawEvidence[] {
    const summary = this.asRecord(value);
    return this.asArray(summary.evidence).flatMap((item) => {
      const record = this.asRecord(item);
      const source = this.asOptionalString(record.source)?.trim() ?? null;
      if (!source || source.length > 128) return [];
      return [
        {
          source,
          url: this.safePublicHttpsUrl(record.url),
          imageUrl: this.safePublicHttpsUrl(record.imageUrl),
          imageEvidenceUrl: this.safePublicHttpsUrl(record.imageEvidenceUrl),
          displayNameZh: this.controlledChineseProductName(
            record.displayNameZh,
          ),
          sourcingQueryZh: this.controlledChineseProductName(
            record.sourcingQueryZh,
          ),
        },
      ];
    });
  }

  private dailyProductDisplayName(
    candidate: { canonicalName: string; productType: string },
    evidence: DailyRawEvidence[],
    rawSummary: unknown,
  ): string {
    const summaryDisplayName = this.controlledChineseProductName(
      this.asRecord(rawSummary).displayNameZh,
    );
    if (summaryDisplayName) return summaryDisplayName;

    const evidenceDisplayName = evidence.find(
      (item) => item.displayNameZh !== null,
    )?.displayNameZh;
    if (evidenceDisplayName) return evidenceDisplayName;

    const mappedName = this.dailyMappedProductName(candidate);
    if (mappedName) return mappedName;

    const controlledName = evidence.find(
      (item) => item.sourcingQueryZh !== null,
    )?.sourcingQueryZh;
    if (controlledName) return controlledName;

    return '中文名称待确认';
  }

  private dailyMappedProductName(candidate: {
    canonicalName: string;
    productType: string;
  }): string | null {
    const tokens = new Set(
      `${candidate.canonicalName} ${candidate.productType}`
        .toLocaleLowerCase('en-US')
        .match(/[a-z0-9]+/g) ?? [],
    );
    for (const [requiredTokens, label] of DAILY_PRODUCT_NAME_RULES) {
      if (requiredTokens.every((token) => tokens.has(token))) return label;
    }
    return null;
  }

  private controlledChineseProductName(value: unknown): string | null {
    if (typeof value !== 'string' || this.hasControlCharacter(value)) {
      return null;
    }
    const text = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (
      text.length === 0 ||
      text.length > 40 ||
      !/[\u3400-\u9fff]/u.test(text) ||
      /[a-z]/iu.test(text) ||
      text.includes('<') ||
      text.includes('>')
    ) {
      return null;
    }
    return text;
  }

  private dailySourceEvidenceItems(input: {
    candidateId: string;
    displayName: string;
    signals: Array<{
      id: string;
      source: string;
      url: string | null;
      fetchedAt: Date;
    }>;
    rawEvidence: DailyRawEvidence[];
    primaryImageEvidence:
      | (DailyRawEvidence & {
          imageUrl: string;
          imageEvidenceUrl: string;
        })
      | null;
    latestFetchedAt: Date | null;
  }) {
    const seenUrls = new Set<string>();
    const items: Array<{
      id: string;
      title: string;
      url: string;
      imageUrl: string | null;
      snippet: null;
      fetchedAt: Date | null;
      priceRub: null;
    }> = input.signals.flatMap((signal) => {
      const url = this.safePublicHttpsUrl(signal.url);
      if (!url || seenUrls.has(url)) return [];
      seenUrls.add(url);
      const matchingImageEvidence = input.rawEvidence.find(
        (item) =>
          item.imageUrl !== null &&
          item.imageEvidenceUrl !== null &&
          item.imageEvidenceUrl === url,
      );
      return [
        {
          id: signal.id,
          title: `${input.displayName} · ${this.dailySourceLabel(signal.source)}`,
          url,
          imageUrl: matchingImageEvidence?.imageUrl ?? null,
          snippet: null,
          fetchedAt: signal.fetchedAt,
          priceRub: null,
        },
      ];
    });

    const primary = input.primaryImageEvidence;
    if (primary && !seenUrls.has(primary.imageEvidenceUrl)) {
      items.unshift({
        id: `${input.candidateId}:image-evidence`,
        title: `${input.displayName} · 图片来源证据`,
        url: primary.imageEvidenceUrl,
        imageUrl: primary.imageUrl,
        snippet: null,
        fetchedAt: input.latestFetchedAt,
        priceRub: null,
      });
    }
    return items;
  }

  private dailySourceLabel(source: string): string {
    return DAILY_SOURCE_LABELS[source] ?? '外部公开来源';
  }

  private safePublicHttpsUrl(value: unknown): string | null {
    if (typeof value !== 'string' || this.hasControlCharacter(value)) {
      return null;
    }
    const text = value.trim();
    if (text.length === 0 || text.length > 4096) {
      return null;
    }
    try {
      const parsed = new URL(text);
      if (
        parsed.protocol !== 'https:' ||
        !parsed.hostname ||
        parsed.username.length > 0 ||
        parsed.password.length > 0 ||
        (parsed.port.length > 0 && parsed.port !== '443')
      ) {
        return null;
      }
      const hostname = parsed.hostname
        .replace(/^\[|\]$/gu, '')
        .replace(/\.+$/u, '')
        .toLocaleLowerCase('en-US');
      if (!this.isPublicUrlHostname(hostname)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private isPublicUrlHostname(hostname: string): boolean {
    const ipVersion = isIP(hostname);
    if (ipVersion === 4) return this.isPublicIpv4(hostname);
    if (ipVersion === 6) return this.isPublicIpv6(hostname);

    if (
      hostname.length > 253 ||
      !hostname.includes('.') ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.home') ||
      hostname.endsWith('.home.arpa')
    ) {
      return false;
    }
    return hostname
      .split('.')
      .every(
        (label) =>
          label.length > 0 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
      );
  }

  private isPublicIpv4(hostname: string): boolean {
    const octets = hostname.split('.').map(Number);
    if (
      octets.length !== 4 ||
      octets.some((value) => !Number.isInteger(value))
    ) {
      return false;
    }
    const [first, second, third] = octets;
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }

  private isPublicIpv6(hostname: string): boolean {
    const normalized = hostname.toLocaleLowerCase('en-US');
    return (
      /^[23][0-9a-f]{0,3}:/u.test(normalized) &&
      !normalized.startsWith('2001:db8:')
    );
  }

  private hasControlCharacter(value: string): boolean {
    return [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    });
  }

  private async buildProductResearchPreview(
    organizationId: string,
    reviewTaskId: string,
    report: {
      id: string;
      query: string;
      platform: string;
      summary: string | null;
      opportunities: Prisma.JsonValue | null;
      createdAt: Date;
    },
  ) {
    const [decisions, launches] = await Promise.all([
      this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productResearchCandidateDecision.findMany({
          where: { organizationId, reportId: report.id },
          select: {
            candidateIndex: true,
            status: true,
            reason: true,
            updatedAt: true,
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productLaunch.findMany({
          where: { organizationId, reviewTaskId },
          select: {
            id: true,
            candidateId: true,
            productId: true,
            status: true,
            failureCode: true,
            failureMessage: true,
            imageProjectId: true,
            imageProject: {
              select: {
                id: true,
                generatedAssets: true,
                qaStatus: true,
                qaVersion: true,
                qaResult: true,
                qaCompletedAt: true,
              },
            },
            agentRunId: true,
            channelId: true,
            listingDraftId: true,
            publishReviewTaskId: true,
            approvedContentHash: true,
            publishApprovedAt: true,
            updatedAt: true,
          },
        }),
      ),
    ]);
    const decisionByIndex = new Map(
      decisions.map((decision) => [decision.candidateIndex, decision]),
    );
    const launchByCandidateId = new Map(
      launches.map((launch) => [launch.candidateId, launch]),
    );
    const opportunities = this.asRecord(report.opportunities);
    const priceRange = this.asRecord(opportunities.priceRange);
    const sourceEvidence = this.asRecord(opportunities.sourceEvidence);
    const relevance = this.asRecord(sourceEvidence.relevance);
    const sourceEvidenceItems = this.asArray(sourceEvidence.items)
      .map((item) => this.asRecord(item))
      .map((item) => ({
        id: this.asOptionalString(item.id),
        title: this.asOptionalString(item.title),
        url: this.asOptionalString(item.url),
        imageUrl: this.asOptionalString(item.imageUrl),
        snippet: this.asOptionalString(item.snippet),
        fetchedAt: this.asOptionalString(item.fetchedAt),
        priceRub: this.asFiniteNumber(item.priceRub),
      }))
      .filter((item) => item.title && item.url);
    const normalizeCandidateTitle = (value: string | null) =>
      (value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const sourceByTitle = new Map(
      sourceEvidenceItems.map((item) => [
        normalizeCandidateTitle(item.title),
        item,
      ]),
    );
    const candidates = this.asStringArray(opportunities.competitors).map(
      (name, index) => {
        const candidateId = `${report.id}:${index}`;
        const decision = decisionByIndex.get(index);
        const evidence =
          sourceByTitle.get(normalizeCandidateTitle(name)) ?? null;
        return {
          id: candidateId,
          candidateIndex: index,
          name,
          status:
            decision?.status === 'APPROVED'
              ? 'approved'
              : decision?.status === 'REJECTED'
                ? 'rejected'
                : 'pending',
          rejectionReason: decision?.reason ?? null,
          decidedAt: decision?.updatedAt ?? null,
          productUrl: evidence?.url ?? null,
          imageUrl: evidence?.imageUrl ?? null,
          priceRub: evidence?.priceRub ?? null,
          evidenceFetchedAt: evidence?.fetchedAt ?? null,
          evidenceReady: Boolean(evidence?.url && evidence?.imageUrl),
          launch: launchByCandidateId.get(candidateId) ?? null,
        };
      },
    );

    return {
      reportId: report.id,
      query: report.query,
      platform: report.platform,
      summary: report.summary,
      createdAt: report.createdAt,
      priceRange: {
        min: this.asFiniteNumber(priceRange.min),
        max: this.asFiniteNumber(priceRange.max),
        currency: this.asOptionalString(priceRange.currency),
      },
      rating: this.asFiniteNumber(opportunities.rating),
      sourceEvidence: {
        source: this.asOptionalString(sourceEvidence.source),
        provider: this.asOptionalString(sourceEvidence.provider),
        fetchedAt: this.asOptionalString(sourceEvidence.fetchedAt),
        searchQuery: this.asOptionalString(sourceEvidence.searchQuery),
        relevance: {
          strategy: this.asOptionalString(relevance.strategy),
          matchTerms: this.asStringArray(relevance.matchTerms),
        },
        items: sourceEvidenceItems,
      },
      candidates,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return this.asArray(value).filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  private asOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private manualPricingNumber(
    next: unknown,
    previous: unknown,
    maximum: number,
  ): number | null {
    const candidate = next === undefined ? previous : next;
    const value = this.asFiniteNumber(candidate);
    return value !== null && value >= 0 && value <= maximum ? value : null;
  }

  private manualPricingCurrency(
    next: unknown,
    previous: unknown,
  ): string | null {
    const candidate = next === undefined ? previous : next;
    return typeof candidate === 'string' && /^[A-Z]{3}$/u.test(candidate.trim())
      ? candidate.trim()
      : null;
  }

  private manualPricingText(next: unknown, previous: unknown): string | null {
    const candidate = next === undefined ? previous : next;
    return typeof candidate === 'string' && candidate.trim().length > 0
      ? candidate.trim()
      : null;
  }
}
