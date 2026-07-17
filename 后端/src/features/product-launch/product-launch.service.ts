import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { FilesService } from '../files/files.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { ProductResearchService } from '../product-research/product-research.service.js';
import {
  ConfirmProductLaunchDto,
  ConfirmProductPublishDto,
  type ProductPreparationMode,
} from './product-launch.dto.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { ListingPublishSnapshotService } from './listing-publish-snapshot.service.js';
import { ExternalSubmissionsService } from './external-submissions.service.js';
import { ListingSandboxService } from '../listing-sandbox/listing-sandbox.service.js';
import { issuePublishExecutionGrant } from './publish-execution-grant.js';
import {
  attestRecentPublishStepUp,
  type PublishStepUpAttestation,
} from './publish-step-up.js';
import { CandidateEconomicsPublishProofService } from './candidate-economics-publish-proof.service.js';

@Injectable()
export class ProductLaunchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productResearch: ProductResearchService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    @InjectQueue('product-launches') private readonly queue: Queue,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly publishSnapshots: ListingPublishSnapshotService,
    private readonly externalSubmissions: ExternalSubmissionsService,
    private readonly listingSandbox: ListingSandboxService,
    private readonly candidateEconomicsProof: CandidateEconomicsPublishProofService,
  ) {}

  async findOne(user: JwtPayload, productLaunchId: string) {
    const organizationId = this.requireOrg(user);
    const launch = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productLaunch.findFirst({
        where: { id: productLaunchId, organizationId },
        select: {
          id: true,
          reviewTaskId: true,
          candidateId: true,
          researchCandidateId: true,
          status: true,
          imageGenerationApproved: true,
          imageProjectId: true,
          listingDraftId: true,
          approvedContentHash: true,
          selectedPublishSnapshotId: true,
          publishApprovedAt: true,
          publishExecutionGrantHash: true,
          publishExecutionGrantScope: true,
          publishExecutionGrantSnapshotHash: true,
          publishExecutionGrantExpiresAt: true,
          publishExecutionGrantConsumedAt: true,
          failureCode: true,
          failureMessage: true,
          updatedAt: true,
        },
      }),
    );
    if (!launch) throw new NotFoundException('Product launch not found');
    return { launch };
  }

  async confirm(
    user: JwtPayload,
    reviewTaskId: string,
    dto: ConfirmProductLaunchDto,
  ) {
    const organizationId = this.requireOrg(user);
    const preparationMode: ProductPreparationMode =
      dto.preparationMode ?? 'PUBLISH_READY';
    if (dto.confirmImageGeneration !== true) {
      throw new BadRequestException(
        'An explicit confirmation is required before generating local assets',
      );
    }
    const reviewTask = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.reviewTask.findFirst({
        where: { id: reviewTaskId, organizationId },
      }),
    );
    if (!reviewTask) {
      throw new NotFoundException('Review task not found');
    }
    if (reviewTask.entityType !== 'PRODUCT_RESEARCH') {
      throw new BadRequestException(
        'Only product research reviews can start a product launch',
      );
    }
    if (reviewTask.status === 'REJECTED') {
      throw new BadRequestException(
        'Rejected review tasks cannot start a product launch',
      );
    }
    const isDailyCandidate = reviewTask.entityId === dto.candidateId;
    if (
      !isDailyCandidate &&
      !dto.candidateId.startsWith(`${reviewTask.entityId}:`)
    ) {
      throw new BadRequestException(
        'Candidate does not belong to this review report',
      );
    }
    if (!isDailyCandidate && preparationMode === 'CREATIVE_ONLY') {
      throw new BadRequestException({
        code: 'CREATIVE_ONLY_DAILY_CANDIDATE_REQUIRED',
        message: '仅本地图片与商品资料准备只适用于每日选品候选。',
      });
    }
    if (
      isDailyCandidate &&
      preparationMode === 'PUBLISH_READY' &&
      (!dto.economicsEvaluationId || !dto.economicsEvaluationHash)
    ) {
      throw new BadRequestException({
        code: 'PRODUCT_LAUNCH_ECONOMICS_PROOF_REQUIRED',
        message:
          'A daily research candidate launch requires one exact economics evaluation ID and content hash.',
      });
    }
    if (
      isDailyCandidate &&
      preparationMode === 'CREATIVE_ONLY' &&
      (dto.economicsEvaluationId ||
        dto.economicsEvaluationHash ||
        dto.ozonPublication)
    ) {
      throw new BadRequestException({
        code: 'CREATIVE_ONLY_PUBLISH_INPUT_FORBIDDEN',
        message:
          '仅本地准备不能携带利润证明或 Ozon 发布字段；核价与风控通过后再单独进入发布流程。',
      });
    }
    if (
      isDailyCandidate &&
      preparationMode === 'CREATIVE_ONLY' &&
      !dto.workspaceId
    ) {
      throw new BadRequestException({
        code: 'CREATIVE_ONLY_WORKSPACE_REQUIRED',
        message: '请选择一个有效的 Ozon 工作区后再生成本地图片和商品资料。',
      });
    }
    if (
      !isDailyCandidate &&
      (dto.economicsEvaluationId || dto.economicsEvaluationHash)
    ) {
      throw new BadRequestException({
        code: 'PRODUCT_LAUNCH_ECONOMICS_PROOF_NOT_APPLICABLE',
        message:
          'Economics proof fields are only accepted for an exact daily research candidate review.',
      });
    }

    const existingLaunch = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.productLaunch.findFirst({
          where: {
            organizationId,
            reviewTaskId,
            candidateId: dto.candidateId,
          },
        }),
    );
    if (
      existingLaunch &&
      existingLaunch.status !== 'FAILED' &&
      existingLaunch.status !== 'BLOCKED'
    ) {
      const existingExecution = this.asRecord(existingLaunch.execution);
      const existingPreparationMode =
        this.asPreparationMode(existingExecution.preparationMode) ??
        'PUBLISH_READY';
      if (
        isDailyCandidate &&
        (existingLaunch.researchCandidateId !== dto.candidateId ||
          existingLaunch.economicsEvaluationId !== dto.economicsEvaluationId ||
          existingLaunch.economicsEvaluationHash !==
            dto.economicsEvaluationHash ||
          existingLaunch.referenceAssetId !== dto.referenceAssetId ||
          existingPreparationMode !== preparationMode)
      ) {
        throw new BadRequestException({
          code: 'PRODUCT_LAUNCH_IDEMPOTENCY_CONFLICT',
          message:
            'This review already has a launch bound to different candidate, economics, or reference-asset evidence.',
        });
      }
      return {
        launch: existingLaunch,
        externalStoreMutation:
          existingLaunch.status === 'AWAITING_PUBLISH_APPROVAL'
            ? 'awaiting_publish_approval'
            : existingLaunch.status === 'ACTIVE_ON_OZON'
              ? 'ozon_active'
              : existingLaunch.status === 'SUBMITTED_TO_OZON'
                ? 'submitted_to_ozon'
                : 'local_assets_preparation_in_progress',
      };
    }

    const referenceAsset = await this.files.getOwned(
      user,
      dto.referenceAssetId,
    );
    const referenceAssetSha256 = referenceAsset.sha256;
    if (
      referenceAsset.purpose !== 'PRODUCT_IMAGE' ||
      !referenceAsset.mimeType.startsWith('image/') ||
      !referenceAssetSha256
    ) {
      throw new BadRequestException(
        'A verified PRODUCT_IMAGE reference asset is required before generation',
      );
    }

    if (isDailyCandidate) {
      if (preparationMode === 'CREATIVE_ONLY') {
        return this.confirmDailyCreativeOnly({
          user,
          organizationId,
          reviewTask,
          dto,
          referenceAsset: {
            ...referenceAsset,
            sha256: referenceAssetSha256,
          },
          existingLaunch,
        });
      }
      return this.confirmDailyCandidate({
        user,
        organizationId,
        reviewTask,
        dto,
        referenceAsset: {
          ...referenceAsset,
          sha256: referenceAssetSha256,
        },
        existingLaunch,
      });
    }

    const approval = await this.productResearch.approveCandidate(
      user,
      dto.candidateId,
      { workspaceId: dto.workspaceId },
    );
    const product = approval.product as { id?: string; metadata?: unknown };
    if (!product.id) {
      throw new ServiceUnavailableException(
        'The approved candidate did not return a local product draft',
      );
    }

    const candidateIndex = this.candidateIndex(dto.candidateId);
    const now = new Date().toISOString();
    const preparationAttemptId = randomUUID();
    const metadata = this.asRecord(product.metadata);
    const productMetadata = {
      ...metadata,
      ...(dto.ozonPublication ? { ozonPublication: dto.ozonPublication } : {}),
      visualReference: {
        assetId: referenceAsset.id,
        sha256: referenceAsset.sha256,
      },
      externalStoreMutation: 'local_assets_preparation_queued',
      latestProductLaunch: {
        reviewTaskId,
        candidateId: dto.candidateId,
        status: 'QUEUED',
        confirmedAt: now,
        confirmedBy: user.sub,
      },
    };

    const updatedProduct = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.product.update({
        where: { id: product.id },
        data: { metadata: productMetadata as Prisma.InputJsonValue },
      }),
    );
    const launch = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.productLaunch.upsert({
          where: {
            reviewTaskId_candidateId: {
              reviewTaskId,
              candidateId: dto.candidateId,
            },
          },
          create: {
            organizationId,
            reviewTaskId,
            reportId: reviewTask.entityId,
            candidateId: dto.candidateId,
            candidateIndex,
            productId: product.id,
            referenceAssetId: referenceAsset.id,
            referenceAssetSha256: referenceAsset.sha256,
            status: 'QUEUED',
            imageGenerationApproved: true,
            confirmAutoPublish: false,
            requestedBy: user.sub,
            execution: {
              preparationAttemptId,
              preparationConfirmedAt: now,
              imageGeneration: 'not_started',
              listingGeneration: 'not_started',
              ozonSubmission: 'not_started',
            },
          },
          update: {
            productId: product.id,
            referenceAssetId: referenceAsset.id,
            referenceAssetSha256: referenceAsset.sha256,
            requestedBy: user.sub,
            status: 'QUEUED',
            imageGenerationApproved: true,
            confirmAutoPublish: false,
            listingDraftId: null,
            publishReviewTaskId: null,
            approvedContentHash: null,
            selectedPublishSnapshotId: null,
            approvedPublishSnapshotHash: null,
            publishApprovedBy: null,
            publishApprovedAt: null,
            publishExecutionGrantHash: null,
            publishExecutionGrantScope: null,
            publishExecutionGrantSnapshotHash: null,
            publishExecutionGrantExpiresAt: null,
            publishExecutionGrantConsumedAt: null,
            failureCode: null,
            failureMessage: null,
            completedAt: null,
            execution: {
              preparationAttemptId,
              preparationConfirmedAt: now,
              imageGeneration: 'not_started',
              listingGeneration: 'not_started',
              ozonSubmission: 'not_started',
            },
          },
        }),
    );

    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.reviewTask.update({
        where: { id: reviewTask.id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          assignedTo: user.sub,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'product-launch.preparation-confirmed',
      resourceType: 'ProductLaunch',
      resourceId: launch.id,
      before: { reviewStatus: reviewTask.status },
      after: {
        reviewTaskId,
        candidateId: dto.candidateId,
        productId: product.id,
        referenceAssetId: referenceAsset.id,
        referenceAssetSha256: referenceAsset.sha256,
        status: launch.status,
        imageGenerationApproved: true,
        confirmAutoPublish: false,
        externalStoreMutation: 'local_assets_preparation_queued',
      },
    });

    try {
      await this.queue.add(
        'product-launch',
        { productLaunchId: launch.id, organizationId, preparationAttemptId },
        {
          jobId: `product-launch-${launch.id}-prepare-${preparationAttemptId}`,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productLaunch.update({
          where: { id: launch.id },
          data: {
            status: 'FAILED',
            failureCode: 'QUEUE_UNAVAILABLE',
            failureMessage: message,
            completedAt: new Date(),
          },
        }),
      );
      throw new ServiceUnavailableException(
        'The launch was recorded but its background worker is unavailable',
      );
    }

    return {
      launch,
      product: updatedProduct,
      externalStoreMutation: 'local_assets_preparation_queued',
    };
  }

  private async confirmDailyCreativeOnly(input: {
    user: JwtPayload;
    organizationId: string;
    reviewTask: {
      id: string;
      entityId: string;
      status: string;
      decisionEvidence: Prisma.JsonValue;
    };
    dto: ConfirmProductLaunchDto;
    referenceAsset: {
      id: string;
      workspaceId?: string | null;
      sha256: string;
    };
    existingLaunch: { productId: string | null } | null;
  }) {
    const { user, organizationId, reviewTask, dto, referenceAsset } = input;
    const workspaceId = dto.workspaceId!;
    const now = new Date();
    const preparationAttemptId = randomUUID();
    const allowedCreativeOnlyGates = new Set([
      'MANUAL_PRICING_REQUIRED',
      'RISK_EVIDENCE_MISSING',
    ]);

    const prepared = await this.tenantDatabase.run(
      organizationId,
      async (transaction) => {
        const [candidate, workspace] = await Promise.all([
          transaction.productCandidate.findFirst({
            where: { id: dto.candidateId, organizationId },
            include: {
              signals: { select: { source: true } },
              risks: {
                select: {
                  riskType: true,
                  severity: true,
                  reviewStatus: true,
                },
              },
              scores: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  rank: true,
                  decision: true,
                  hardGateStatus: true,
                  hardGateReasons: true,
                },
              },
            },
          }),
          transaction.workspace.findFirst({
            where: {
              id: workspaceId,
              organizationId,
              status: 'ACTIVE',
              channelType: 'OZON',
            },
            select: { id: true, currency: true },
          }),
        ]);
        if (!candidate) {
          throw new NotFoundException('Daily research candidate not found');
        }
        if (!workspace) {
          throw new BadRequestException({
            code: 'CREATIVE_ONLY_WORKSPACE_INVALID',
            message: '所选工作区不存在、未启用或不是 Ozon 工作区。',
          });
        }
        const decisionEvidence = this.asRecord(reviewTask.decisionEvidence);
        if (
          !['PENDING', 'REWORK'].includes(reviewTask.status) ||
          reviewTask.entityId !== candidate.id ||
          decisionEvidence.candidateId !== candidate.id ||
          decisionEvidence.researchRunId !== candidate.researchRunId
        ) {
          throw new BadRequestException({
            code: 'CREATIVE_ONLY_REVIEW_BINDING_INVALID',
            message: '审核任务没有绑定当前候选、研究批次或可处理状态。',
          });
        }
        if (candidate.workspaceId && candidate.workspaceId !== workspace.id) {
          throw new BadRequestException({
            code: 'CREATIVE_ONLY_WORKSPACE_BINDING_INVALID',
            message: '该候选已绑定其他工作区，不能改用当前工作区生成资料。',
          });
        }
        if (referenceAsset.workspaceId !== workspace.id) {
          throw new BadRequestException({
            code: 'CREATIVE_ONLY_REFERENCE_WORKSPACE_INVALID',
            message: '参考图必须上传并绑定到所选 Ozon 工作区。',
          });
        }

        const score = candidate.scores[0] ?? null;
        const unsupportedGates = (score?.hardGateReasons ?? []).filter(
          (reason) => !allowedCreativeOnlyGates.has(reason),
        );
        const unsafeRisks = candidate.risks.filter(
          (risk) =>
            !['RISK_EVIDENCE_MISSING', 'RISK_CLEARANCE_ATTESTED'].includes(
              risk.riskType,
            ),
        );
        const signalSources = new Set(
          candidate.signals
            .map((signal) => signal.source.trim())
            .filter(Boolean),
        );
        if (
          !score ||
          !['HOLD', 'RECOMMENDED'].includes(candidate.status) ||
          signalSources.size < 2 ||
          unsupportedGates.length > 0 ||
          unsafeRisks.length > 0
        ) {
          throw new BadRequestException({
            code: 'CREATIVE_ONLY_SAFETY_GATE_FAILED',
            message:
              '该候选未通过本地创意准备的基础需求或禁限售门禁，不能消耗图片生成额度。',
            details: {
              candidateStatus: candidate.status,
              signalSourceCount: signalSources.size,
              unsupportedGates,
              unsafeRiskTypes: unsafeRisks.map((risk) => risk.riskType),
            },
          });
        }

        const rank = score.rank;
        const candidateIndex =
          typeof rank === 'number' && Number.isInteger(rank) && rank > 0
            ? rank - 1
            : 0;
        const productMetadata = {
          source: 'daily-product-research',
          approvalStatus: 'approved_for_creative_only',
          pricingStatus: 'DATA_INSUFFICIENT',
          publishable: false,
          externalStoreMutation: 'not_executed',
          researchRunId: candidate.researchRunId,
          researchCandidateId: candidate.id,
          candidateFingerprint: candidate.fingerprint,
          candidateSummary: candidate.rawSummary ?? null,
          visualReference: {
            assetId: referenceAsset.id,
            sha256: referenceAsset.sha256,
          },
          latestProductLaunch: {
            reviewTaskId: reviewTask.id,
            candidateId: candidate.id,
            preparationMode: 'CREATIVE_ONLY',
            status: 'QUEUED',
            confirmedAt: now.toISOString(),
            confirmedBy: user.sub,
          },
        };
        const claimedLaunch = await transaction.productLaunch.upsert({
          where: {
            reviewTaskId_candidateId: {
              reviewTaskId: reviewTask.id,
              candidateId: candidate.id,
            },
          },
          create: {
            organizationId,
            reviewTaskId: reviewTask.id,
            reportId: candidate.researchRunId,
            candidateId: candidate.id,
            candidateIndex,
            researchCandidateId: candidate.id,
            economicsEvaluationId: null,
            economicsEvaluationHash: null,
            referenceAssetId: referenceAsset.id,
            referenceAssetSha256: referenceAsset.sha256,
            status: 'QUEUED',
            imageGenerationApproved: true,
            confirmAutoPublish: false,
            requestedBy: user.sub,
            execution: {
              preparationMode: 'CREATIVE_ONLY',
              workspaceId: workspace.id,
              pricingStatus: 'DATA_INSUFFICIENT',
              publishable: false,
              preparationAttemptId,
              preparationConfirmedAt: now.toISOString(),
              imageGeneration: 'not_started',
              listingGeneration: 'not_started',
              ozonSubmission: 'not_authorized',
            },
          },
          update: {},
        });
        const existingProduct = claimedLaunch.productId
          ? await transaction.product.findFirst({
              where: {
                id: claimedLaunch.productId,
                workspaceId: workspace.id,
              },
            })
          : null;
        const product = existingProduct
          ? await transaction.product.update({
              where: { id: existingProduct.id },
              data: {
                title: candidate.canonicalName,
                cost: 0,
                price: 0,
                currency: workspace.currency,
                status: 'DRAFT',
                metadata: {
                  ...this.asRecord(existingProduct.metadata),
                  ...productMetadata,
                },
              },
            })
          : await transaction.product.create({
              data: {
                workspaceId: workspace.id,
                title: candidate.canonicalName,
                sku: `DAILY-${candidate.id.slice(-20).toUpperCase()}`,
                images: [],
                cost: 0,
                price: 0,
                currency: workspace.currency,
                status: 'DRAFT',
                metadata: productMetadata,
              },
            });
        const launch = await transaction.productLaunch.update({
          where: { id: claimedLaunch.id },
          data: {
            reportId: candidate.researchRunId,
            candidateIndex,
            researchCandidateId: candidate.id,
            economicsEvaluationId: null,
            economicsEvaluationHash: null,
            productId: product.id,
            referenceAssetId: referenceAsset.id,
            referenceAssetSha256: referenceAsset.sha256,
            requestedBy: user.sub,
            status: 'QUEUED',
            imageGenerationApproved: true,
            confirmAutoPublish: false,
            imageProjectId: null,
            agentRunId: null,
            listingDraftId: null,
            publishReviewTaskId: null,
            approvedContentHash: null,
            selectedPublishSnapshotId: null,
            approvedPublishSnapshotHash: null,
            publishApprovedBy: null,
            publishApprovedAt: null,
            publishExecutionGrantHash: null,
            publishExecutionGrantScope: null,
            publishExecutionGrantSnapshotHash: null,
            publishExecutionGrantExpiresAt: null,
            publishExecutionGrantConsumedAt: null,
            failureCode: null,
            failureMessage: null,
            startedAt: null,
            completedAt: null,
            execution: {
              preparationMode: 'CREATIVE_ONLY',
              workspaceId: workspace.id,
              pricingStatus: 'DATA_INSUFFICIENT',
              publishable: false,
              preparationAttemptId,
              preparationConfirmedAt: now.toISOString(),
              imageGeneration: 'not_started',
              listingGeneration: 'not_started',
              ozonSubmission: 'not_authorized',
            },
          },
        });
        await transaction.reviewTask.update({
          where: { id: reviewTask.id },
          data: {
            assignedTo: user.sub,
            decisionEvidence: {
              ...decisionEvidence,
              creativePreparation: {
                schemaVersion: 'creative-only-preparation/v1',
                productLaunchId: launch.id,
                workspaceId: workspace.id,
                referenceAssetId: referenceAsset.id,
                referenceAssetSha256: referenceAsset.sha256,
                state: 'QUEUED',
                requestedAt: now.toISOString(),
                requestedBy: user.sub,
                publishable: false,
              },
            },
          },
        });
        return { candidate, product, launch };
      },
    );

    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'product-launch.daily-candidate-creative-preparation-confirmed',
      resourceType: 'ProductLaunch',
      resourceId: prepared.launch.id,
      before: { reviewStatus: reviewTask.status },
      after: {
        reviewTaskId: reviewTask.id,
        researchRunId: prepared.candidate.researchRunId,
        candidateId: prepared.candidate.id,
        productId: prepared.product.id,
        workspaceId,
        referenceAssetId: referenceAsset.id,
        referenceAssetSha256: referenceAsset.sha256,
        status: prepared.launch.status,
        preparationMode: 'CREATIVE_ONLY',
        pricingStatus: 'DATA_INSUFFICIENT',
        publishable: false,
        externalStoreMutation: 'not_executed',
      },
    });

    try {
      await this.queue.add(
        'product-launch',
        {
          productLaunchId: prepared.launch.id,
          organizationId,
          preparationAttemptId,
        },
        {
          jobId: `product-launch-${prepared.launch.id}-prepare-${preparationAttemptId}`,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productLaunch.update({
          where: { id: prepared.launch.id },
          data: {
            status: 'FAILED',
            failureCode: 'QUEUE_UNAVAILABLE',
            failureMessage: message,
            completedAt: new Date(),
          },
        }),
      );
      throw new ServiceUnavailableException(
        '本地图片与商品资料任务已记录，但任务队列暂时不可用。',
      );
    }

    return {
      launch: prepared.launch,
      product: prepared.product,
      externalStoreMutation: 'local_creative_preparation_queued',
    };
  }

  private async confirmDailyCandidate(input: {
    user: JwtPayload;
    organizationId: string;
    reviewTask: {
      id: string;
      entityId: string;
      status: string;
      decisionEvidence: Prisma.JsonValue;
    };
    dto: ConfirmProductLaunchDto;
    referenceAsset: {
      id: string;
      workspaceId?: string | null;
      sha256: string;
    };
    existingLaunch: { productId: string | null } | null;
  }) {
    const { user, organizationId, reviewTask, dto, referenceAsset } = input;
    const now = new Date();
    const preparationAttemptId = randomUUID();
    const prepared = await this.tenantDatabase.run(
      organizationId,
      async (transaction) => {
        const candidate = await transaction.productCandidate.findFirst({
          where: {
            id: dto.candidateId,
            organizationId,
          },
          include: {
            scores: {
              where: { decision: 'TEST_NOW' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { rank: true },
            },
          },
        });
        if (!candidate) {
          throw new NotFoundException('Daily research candidate not found');
        }
        const decisionEvidence = this.asRecord(reviewTask.decisionEvidence);
        if (
          reviewTask.entityId !== candidate.id ||
          decisionEvidence.candidateId !== candidate.id ||
          decisionEvidence.researchRunId !== candidate.researchRunId
        ) {
          throw new BadRequestException({
            code: 'PRODUCT_LAUNCH_REVIEW_BINDING_INVALID',
            message:
              'The review task does not bind this exact daily research candidate and run.',
          });
        }
        if (
          !candidate.workspaceId ||
          (dto.workspaceId && dto.workspaceId !== candidate.workspaceId) ||
          (referenceAsset.workspaceId &&
            referenceAsset.workspaceId !== candidate.workspaceId)
        ) {
          throw new BadRequestException({
            code: 'PRODUCT_LAUNCH_WORKSPACE_BINDING_INVALID',
            message:
              'The candidate, requested workspace, and reference asset must belong to one explicit workspace.',
          });
        }

        const proof = await this.candidateEconomicsProof.requireInTransaction(
          transaction,
          {
            organizationId,
            workspaceId: candidate.workspaceId,
            candidateId: candidate.id,
            evaluationId: dto.economicsEvaluationId,
            expectedContentHash: dto.economicsEvaluationHash,
            at: now,
          },
        );
        if (
          proof.candidateId !== candidate.id ||
          proof.researchRunId !== candidate.researchRunId
        ) {
          throw new BadRequestException({
            code: 'PRODUCT_LAUNCH_ECONOMICS_PROOF_INVALID',
            message:
              'The verified economics proof does not belong to this candidate and research run.',
          });
        }
        const procurement = this.asRecord(proof.componentBreakdown.procurement);
        const procurementAmount = this.positiveMoneyString(procurement.amount);
        const salePrice = this.positiveMoneyString(proof.salePrice);
        if (!procurementAmount || !salePrice) {
          throw new BadRequestException({
            code: 'PRODUCT_LAUNCH_ECONOMICS_PROOF_INVALID',
            message:
              'The verified economics proof has no positive exact procurement cost or sale price.',
          });
        }

        const productMetadata = {
          source: 'daily-product-research',
          approvalStatus: 'approved_for_local_preparation',
          externalStoreMutation: 'local_assets_preparation_queued',
          researchRunId: candidate.researchRunId,
          researchCandidateId: candidate.id,
          candidateFingerprint: candidate.fingerprint,
          candidateSummary: candidate.rawSummary ?? null,
          economicsProof: {
            evaluationId: proof.evaluationId,
            contentHash: proof.contentHash,
            inputSetHash: proof.inputSetHash,
            validUntil: proof.validUntil,
            currency: proof.currency,
            salePrice: proof.salePrice,
            totalCost: proof.totalCost,
            risk: proof.risk,
          },
          ...(dto.ozonPublication
            ? { ozonPublication: dto.ozonPublication }
            : {}),
          visualReference: {
            assetId: referenceAsset.id,
            sha256: referenceAsset.sha256,
          },
          latestProductLaunch: {
            reviewTaskId: reviewTask.id,
            candidateId: candidate.id,
            status: 'QUEUED',
            confirmedAt: now.toISOString(),
            confirmedBy: user.sub,
          },
        };

        const rank = candidate.scores[0]?.rank;
        const candidateIndex =
          typeof rank === 'number' && Number.isInteger(rank) && rank > 0
            ? rank - 1
            : 0;
        const claimedLaunch = await transaction.productLaunch.upsert({
          where: {
            reviewTaskId_candidateId: {
              reviewTaskId: reviewTask.id,
              candidateId: candidate.id,
            },
          },
          create: {
            organizationId,
            reviewTaskId: reviewTask.id,
            reportId: candidate.researchRunId,
            candidateId: candidate.id,
            candidateIndex,
            researchCandidateId: candidate.id,
            economicsEvaluationId: proof.evaluationId,
            economicsEvaluationHash: proof.contentHash,
            referenceAssetId: referenceAsset.id,
            referenceAssetSha256: referenceAsset.sha256,
            status: 'QUEUED',
            imageGenerationApproved: true,
            confirmAutoPublish: false,
            requestedBy: user.sub,
            execution: {
              preparationAttemptId,
              preparationConfirmedAt: now.toISOString(),
              economicsEvaluationId: proof.evaluationId,
              economicsEvaluationHash: proof.contentHash,
              imageGeneration: 'not_started',
              listingGeneration: 'not_started',
              ozonSubmission: 'not_started',
            },
          },
          update: {},
        });
        if (
          claimedLaunch.productId &&
          claimedLaunch.status !== 'FAILED' &&
          claimedLaunch.status !== 'BLOCKED'
        ) {
          if (
            claimedLaunch.researchCandidateId !== candidate.id ||
            claimedLaunch.economicsEvaluationId !== proof.evaluationId ||
            claimedLaunch.economicsEvaluationHash !== proof.contentHash ||
            claimedLaunch.referenceAssetId !== referenceAsset.id
          ) {
            throw new BadRequestException({
              code: 'PRODUCT_LAUNCH_IDEMPOTENCY_CONFLICT',
              message:
                'A concurrent launch already bound this review to different immutable evidence.',
            });
          }
          const product = await transaction.product.findFirst({
            where: {
              id: claimedLaunch.productId,
              workspaceId: candidate.workspaceId,
            },
          });
          if (!product) {
            throw new ServiceUnavailableException(
              'The existing daily candidate launch has no owned product draft',
            );
          }
          return {
            candidate,
            proof,
            product,
            launch: claimedLaunch,
            enqueueRequired: false as const,
          };
        }

        const existingProduct = claimedLaunch.productId
          ? await transaction.product.findFirst({
              where: {
                id: claimedLaunch.productId,
                workspaceId: candidate.workspaceId,
              },
            })
          : null;
        const productCreateData = {
          workspaceId: candidate.workspaceId,
          title: candidate.canonicalName,
          sku: `DAILY-${candidate.id.slice(-20).toUpperCase()}`,
          images: [] as string[],
          cost: procurementAmount,
          price: salePrice,
          currency: proof.currency,
          status: 'DRAFT' as const,
          metadata: productMetadata as unknown as Prisma.InputJsonValue,
        };
        const product = existingProduct
          ? await transaction.product.update({
              where: { id: existingProduct.id },
              data: {
                title: candidate.canonicalName,
                cost: procurementAmount,
                price: salePrice,
                currency: proof.currency,
                status: 'DRAFT',
                metadata: {
                  ...this.asRecord(existingProduct.metadata),
                  ...productMetadata,
                } as unknown as Prisma.InputJsonValue,
              },
            })
          : await transaction.product.create({ data: productCreateData });
        const launch = await transaction.productLaunch.update({
          where: { id: claimedLaunch.id },
          data: {
            reportId: candidate.researchRunId,
            candidateIndex,
            researchCandidateId: candidate.id,
            economicsEvaluationId: proof.evaluationId,
            economicsEvaluationHash: proof.contentHash,
            productId: product.id,
            referenceAssetId: referenceAsset.id,
            referenceAssetSha256: referenceAsset.sha256,
            requestedBy: user.sub,
            status: 'QUEUED',
            imageGenerationApproved: true,
            confirmAutoPublish: false,
            listingDraftId: null,
            publishReviewTaskId: null,
            approvedContentHash: null,
            selectedPublishSnapshotId: null,
            approvedPublishSnapshotHash: null,
            publishApprovedBy: null,
            publishApprovedAt: null,
            publishExecutionGrantHash: null,
            publishExecutionGrantScope: null,
            publishExecutionGrantSnapshotHash: null,
            publishExecutionGrantExpiresAt: null,
            publishExecutionGrantConsumedAt: null,
            failureCode: null,
            failureMessage: null,
            completedAt: null,
            execution: {
              preparationAttemptId,
              preparationConfirmedAt: now.toISOString(),
              economicsEvaluationId: proof.evaluationId,
              economicsEvaluationHash: proof.contentHash,
              imageGeneration: 'not_started',
              listingGeneration: 'not_started',
              ozonSubmission: 'not_started',
            },
          },
        });
        await transaction.reviewTask.update({
          where: { id: reviewTask.id },
          data: {
            status: 'APPROVED',
            reviewedAt: now,
            assignedTo: user.sub,
            decisionEvidence: {
              ...decisionEvidence,
              type: 'daily-product-candidate-launch/v1',
              researchRunId: candidate.researchRunId,
              candidateId: candidate.id,
              economicsEvaluationId: proof.evaluationId,
              economicsEvaluationHash: proof.contentHash,
              approvedAt: now.toISOString(),
              approvedBy: user.sub,
            },
          },
        });
        return {
          candidate,
          proof,
          product,
          launch,
          enqueueRequired: true as const,
        };
      },
    );

    if (!prepared.enqueueRequired) {
      return {
        launch: prepared.launch,
        product: prepared.product,
        economicsProof: {
          evaluationId: prepared.proof.evaluationId,
          contentHash: prepared.proof.contentHash,
          validUntil: prepared.proof.validUntil,
        },
        externalStoreMutation: 'local_assets_preparation_in_progress',
      };
    }

    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'product-launch.daily-candidate-preparation-confirmed',
      resourceType: 'ProductLaunch',
      resourceId: prepared.launch.id,
      before: { reviewStatus: reviewTask.status },
      after: {
        reviewTaskId: reviewTask.id,
        researchRunId: prepared.candidate.researchRunId,
        candidateId: prepared.candidate.id,
        productId: prepared.product.id,
        economicsEvaluationId: prepared.proof.evaluationId,
        economicsEvaluationHash: prepared.proof.contentHash,
        referenceAssetId: referenceAsset.id,
        referenceAssetSha256: referenceAsset.sha256,
        status: prepared.launch.status,
        externalStoreMutation: 'local_assets_preparation_queued',
      },
    });

    try {
      await this.queue.add(
        'product-launch',
        {
          productLaunchId: prepared.launch.id,
          organizationId,
          preparationAttemptId,
        },
        {
          jobId: `product-launch-${prepared.launch.id}-prepare-${preparationAttemptId}`,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productLaunch.update({
          where: { id: prepared.launch.id },
          data: {
            status: 'FAILED',
            failureCode: 'QUEUE_UNAVAILABLE',
            failureMessage: message,
            completedAt: new Date(),
          },
        }),
      );
      throw new ServiceUnavailableException(
        'The launch was recorded but its background worker is unavailable',
      );
    }

    return {
      launch: prepared.launch,
      product: prepared.product,
      economicsProof: {
        evaluationId: prepared.proof.evaluationId,
        contentHash: prepared.proof.contentHash,
        validUntil: prepared.proof.validUntil,
      },
      externalStoreMutation: 'local_assets_preparation_queued',
    };
  }

  async confirmPublish(
    user: JwtPayload,
    productLaunchId: string,
    dto: ConfirmProductPublishDto,
    approvalContext?: { approvedAt: Date },
  ) {
    if (dto.confirmPublish !== true) {
      throw new BadRequestException(
        'A separate explicit confirmation is required before publishing to Ozon',
      );
    }
    const approvedAt = approvalContext?.approvedAt ?? new Date();
    const publishStepUp = this.preflightPublishConfirmation(user, approvedAt);
    const organizationId = this.requireOrg(user);
    const launch = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.productLaunch.findFirst({
          where: { id: productLaunchId, organizationId },
        }),
    );
    if (!launch) {
      throw new NotFoundException('Product launch not found');
    }
    if (launch.status !== 'AWAITING_PUBLISH_APPROVAL') {
      throw new BadRequestException(
        'Product launch is not awaiting a separate publish approval',
      );
    }
    if (!launch.listingDraftId || !launch.publishReviewTaskId) {
      throw new BadRequestException(
        'Prepared launch has no listing draft or listing review task',
      );
    }

    const [listing, reviewTask] = await Promise.all([
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.listingDraft.findFirst({
          where: { id: launch.listingDraftId!, organizationId },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.reviewTask.findFirst({
          where: {
            id: launch.publishReviewTaskId!,
            organizationId,
            entityType: 'LISTING_DRAFT',
            entityId: launch.listingDraftId!,
          },
        }),
      ),
    ]);
    if (
      !listing ||
      listing.status !== 'APPROVED' ||
      !listing.contentHash ||
      !listing.approvalHash
    ) {
      throw new BadRequestException(
        'Listing must be explicitly approved before publish confirmation',
      );
    }
    const evaluation = this.asRecord(listing.evaluationResult);
    const decision = this.asRecord(reviewTask?.decisionEvidence);
    if (
      evaluation.outcome !== 'QUALIFIED' ||
      reviewTask?.status !== 'APPROVED' ||
      decision.type !== 'listing-approval/v2' ||
      decision.evaluatorOutcome !== 'QUALIFIED' ||
      decision.approvedContentSha256 !== listing.contentHash ||
      decision.approvedListingSha256 !== listing.approvalHash
    ) {
      throw new BadRequestException(
        'Listing approval evidence does not match the current complete listing hash',
      );
    }

    const publishSnapshot = await this.publishSnapshots.captureApproved({
      organizationId,
      productLaunchId: launch.id,
      listingDraftId: listing.id,
      reviewTaskId: reviewTask.id,
      approvedBy: user.sub,
      approvedAt,
    });
    const sandboxReport = await this.listingSandbox.evaluate({
      organizationId,
      snapshotId: publishSnapshot.id,
      actorId: user.sub,
    });
    await this.listingSandbox.assertPublishable({
      organizationId,
      snapshotId: publishSnapshot.id,
      actorRole: user.role ?? 'VIEWER',
    });
    await this.externalSubmissions.prepare({
      organizationId,
      productLaunchId: launch.id,
      publishSnapshotId: publishSnapshot.id,
      snapshotHash: publishSnapshot.snapshotHash,
    });
    const publishGrant = issuePublishExecutionGrant(
      publishSnapshot.snapshotHash,
    );
    const execution = this.asRecord(launch.execution);
    const updated = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.productLaunch.update({
          where: { id: launch.id },
          data: {
            status: 'QUEUED',
            confirmAutoPublish: true,
            approvedContentHash: listing.contentHash,
            selectedPublishSnapshotId: publishSnapshot.id,
            approvedPublishSnapshotHash: publishSnapshot.snapshotHash,
            publishApprovedBy: user.sub,
            publishApprovedAt: approvedAt,
            publishExecutionGrantHash: publishGrant.tokenHash,
            publishExecutionGrantScope: publishGrant.capabilityScope,
            publishExecutionGrantSnapshotHash: publishGrant.snapshotHash,
            publishExecutionGrantExpiresAt: publishGrant.expiresAt,
            publishExecutionGrantConsumedAt: null,
            failureCode: null,
            failureMessage: null,
            completedAt: null,
            execution: {
              ...execution,
              publishStepUp,
              publishConfirmedAt: approvedAt.toISOString(),
              publishConfirmedBy: user.sub,
              approvedContentHash: listing.contentHash,
              approvedListingHash: listing.approvalHash,
              publishSnapshotId: publishSnapshot.id,
              publishSnapshotHash: publishSnapshot.snapshotHash,
              publishExecutionGrantScope: publishGrant.capabilityScope,
              publishExecutionGrantExpiresAt:
                publishGrant.expiresAt.toISOString(),
              ozonSubmission: 'queued',
            } as unknown as Prisma.InputJsonValue,
          },
        }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'product-launch.publish-confirmed',
      resourceType: 'ProductLaunch',
      resourceId: launch.id,
      before: { status: launch.status, confirmAutoPublish: false },
      after: {
        status: updated.status,
        confirmAutoPublish: true,
        listingDraftId: listing.id,
        approvedContentHash: listing.contentHash,
        approvedListingHash: listing.approvalHash,
        publishSnapshotId: publishSnapshot.id,
        publishSnapshotHash: publishSnapshot.snapshotHash,
        sandboxReportId: sandboxReport.id,
        sandboxStatus: sandboxReport.status,
        sandboxRiskLevel: sandboxReport.riskLevel,
        publishExecutionGrantScope: publishGrant.capabilityScope,
        publishExecutionGrantExpiresAt: publishGrant.expiresAt.toISOString(),
      },
    });

    const publishJobId = `product-launch-${launch.id}-publish-${publishSnapshot.snapshotHash}`;
    const publishJobData = {
      productLaunchId: launch.id,
      organizationId,
      publishExecutionGrant: publishGrant.token,
    };
    try {
      await this.queue.add('product-launch', publishJobData, {
        jobId: publishJobId,
      });
    } catch {
      // queue.add can succeed in Redis while its response is lost. Never roll
      // back the durable approval here: a worker may already have claimed or
      // even dispatched the immutable submission. The stable job ID lets us
      // confirm the ambiguous outcome; otherwise the durable queue watchdog
      // will either recover the job or require a new explicit approval.
      let queueJobConfirmed = false;
      try {
        queueJobConfirmed = Boolean(await this.queue.getJob(publishJobId));
      } catch {
        // Redis is still unavailable. Keep the QUEUED ledger untouched for the
        // watchdog instead of guessing that the add did not happen.
      }
      if (queueJobConfirmed) {
        await this.audit.log({
          organizationId,
          actorId: user.sub,
          action: 'product-launch.publish-queue-add-reconciled',
          resourceType: 'ProductLaunch',
          resourceId: launch.id,
          after: {
            jobId: publishJobId,
            status: 'queued_after_ambiguous_add',
          },
        });
      } else {
        throw new ServiceUnavailableException(
          'Publish approval is durable but queue delivery is awaiting reconciliation',
        );
      }
    }

    return {
      status: 'approved_pending_external_adapter' as const,
      launch: this.redactPublishGrant(updated),
      publishSnapshot: {
        id: publishSnapshot.id,
        hash: publishSnapshot.snapshotHash,
        target: publishSnapshot.target,
      },
      sandboxReport: {
        id: sandboxReport.id,
        status: sandboxReport.status,
        riskLevel: sandboxReport.riskLevel,
        blocking: sandboxReport.blocking,
      },
      externalStoreMutation: 'publish_queued_after_separate_confirmation',
    };
  }

  preflightPublishConfirmation(
    user: JwtPayload,
    approvedAt = new Date(),
  ): PublishStepUpAttestation {
    const publishStepUp = attestRecentPublishStepUp(user, approvedAt);
    if (!publishStepUp) {
      throw new ForbiddenException({
        code: 'PUBLISH_STEP_UP_REQUIRED',
        message:
          'Publishing to Ozon requires password plus a TOTP verification completed within the last five minutes.',
      });
    }
    return publishStepUp;
  }

  private requireOrg(user: JwtPayload): string {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    return user.orgId;
  }

  private candidateIndex(candidateId: string): number {
    const separator = candidateId.lastIndexOf(':');
    const value = Number(candidateId.slice(separator + 1));
    if (separator < 1 || !Number.isInteger(value) || value < 0) {
      throw new BadRequestException('Candidate ID has an invalid format');
    }
    return value;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private asPreparationMode(value: unknown): ProductPreparationMode | null {
    return value === 'CREATIVE_ONLY' || value === 'PUBLISH_READY'
      ? value
      : null;
  }

  private positiveMoneyString(value: unknown): string | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric > 0 ? normalized : null;
  }

  private redactPublishGrant<T extends Record<string, unknown>>(launch: T) {
    const { publishExecutionGrantHash: _grantHash, ...safeLaunch } = launch;
    return safeLaunch;
  }
}
