import { randomUUID } from 'node:crypto';
import { Inject, Logger, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service.js';
import { AuditService } from '../shared/audit/audit.service.js';
import { AGENT_PROVIDER } from '../agents/agent.module.js';
import type { AgentProviderInterface } from '../agents/agent-provider.interface.js';
import { OzonProductPublishService } from '../features/channels/ozon-product-publish.service.js';
import type { OzonProductPublishResult } from '../features/channels/ozon-product-publish.service.js';
import { NotificationEventsService } from '../features/notifications/notification-events.service.js';
import { ListingsService } from '../features/listings/listings.service.js';
import { ReviewService } from '../features/review/review.service.js';
import { FilesService } from '../features/files/files.service.js';
import { VisualQaService } from '../features/image-prompt/visual-qa.service.js';
import type { JwtPayload } from '../shared/auth/jwt.strategy.js';
import { TenantDatabaseContextService } from '../shared/database/tenant-database-context.service.js';
import { ExternalSubmissionsService } from '../features/product-launch/external-submissions.service.js';
import { ListingSandboxService } from '../features/listing-sandbox/listing-sandbox.service.js';
import { ActionProposalsService } from '../features/notifications/action-proposals.service.js';
import {
  hashPublishExecutionGrant,
  OZON_LISTING_PUBLISH_CAPABILITY,
} from '../features/product-launch/publish-execution-grant.js';
import {
  AgentPermissionLevel,
  AgentPermissionsService,
} from '../shared/agent-permissions/agent-permissions.service.js';
import { readRecentPublishStepUp } from '../features/product-launch/publish-step-up.js';

export interface ProductLaunchJobData {
  productLaunchId: string;
  organizationId: string;
  publishExecutionGrant?: string;
}

@Processor('product-launches', { concurrency: 1 })
export class ProductLaunchWorker extends WorkerHost {
  private readonly logger = new Logger(ProductLaunchWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly ozonPublisher: OzonProductPublishService,
    private readonly audit: AuditService,
    private readonly listings: ListingsService,
    private readonly review: ReviewService,
    private readonly files: FilesService,
    private readonly visualQa: VisualQaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly externalSubmissions: ExternalSubmissionsService,
    private readonly listingSandbox: ListingSandboxService,
    private readonly actionProposals: ActionProposalsService,
    private readonly agentPermissions: AgentPermissionsService,
    @Optional()
    private readonly notificationEvents?: NotificationEventsService,
  ) {
    super();
  }

  async process(job: Job<ProductLaunchJobData>): Promise<unknown> {
    if (!job.data.organizationId) {
      throw new Error('Product launch job is missing organizationId');
    }
    const launch = await this.tenantDatabase.run(
      job.data.organizationId,
      (transaction) =>
        transaction.productLaunch.findFirst({
          where: {
            id: job.data.productLaunchId,
            organizationId: job.data.organizationId,
          },
          include: {
            product: {
              select: {
                id: true,
                workspaceId: true,
                title: true,
                sku: true,
                status: true,
                images: true,
                metadata: true,
              },
            },
          },
        }),
    );
    if (!launch) {
      this.logger.warn(
        `Skipping missing product launch ${job.data.productLaunchId}`,
      );
      return { status: 'skipped', reason: 'not_found' };
    }
    if (!launch.imageGenerationApproved) {
      return this.failLaunch(
        launch,
        'IMAGE_GENERATION_APPROVAL_REQUIRED',
        'Product launch has no explicit approval for local asset generation.',
      );
    }
    const product = launch.product;
    if (!product && !launch.confirmAutoPublish) {
      return this.failLaunch(
        launch,
        'LOCAL_DRAFT_NOT_FOUND',
        'The confirmed candidate has no local product draft.',
      );
    }
    if (launch.status === 'ACTIVE_ON_OZON') {
      return {
        status: launch.status.toLowerCase(),
        productLaunchId: launch.id,
      };
    }
    if (
      launch.status === 'AWAITING_PUBLISH_APPROVAL' &&
      !launch.confirmAutoPublish
    ) {
      return {
        status: 'AWAITING_PUBLISH_APPROVAL',
        productLaunchId: launch.id,
        listingDraftId: launch.listingDraftId,
        publishReviewTaskId: launch.publishReviewTaskId,
      };
    }

    try {
      const submissionIdentity = launch.confirmAutoPublish
        ? {
            organizationId: launch.organizationId,
            productLaunchId: launch.id,
            publishSnapshotId: launch.selectedPublishSnapshotId!,
            snapshotHash: launch.approvedPublishSnapshotHash!,
          }
        : null;
      if (launch.confirmAutoPublish) {
        this.assertPublishApproval(launch, job.data.publishExecutionGrant);
        this.assertPublishStepUp(launch);
        const permission = await this.agentPermissions.check(
          launch.organizationId,
          'ozon.listing.publish',
        );
        if (
          !permission.allowed ||
          permission.level < AgentPermissionLevel.PUBLISH ||
          !permission.requireConfirm
        ) {
          throw this.launchError(
            'AGENT_PUBLISH_PERMISSION_DENIED',
            'Ozon publication is blocked by the organization kill switch or subscription policy.',
          );
        }
        await this.assertExclusiveOzonStoreOwnership({
          organizationId: launch.organizationId,
          snapshotId: launch.selectedPublishSnapshotId!,
        });
        await this.listingSandbox.assertPublishable({
          organizationId: launch.organizationId,
          snapshotId: launch.selectedPublishSnapshotId!,
          actorRole: 'ADMIN',
        });
        await this.externalSubmissions.prepare(submissionIdentity!);
      }
      const preflight = launch.confirmAutoPublish
        ? await this.ozonPublisher.preflightSnapshot({
            organizationId: launch.organizationId,
            snapshotId: launch.selectedPublishSnapshotId!,
            expectedSnapshotHash: launch.approvedPublishSnapshotHash!,
          })
        : await this.ozonPublisher.preflightProduct({
            organizationId: launch.organizationId,
            productId: product!.id,
          });
      if (preflight) {
        if (
          submissionIdentity &&
          (preflight.status === 'ACTIVE_ON_OZON' ||
            preflight.status === 'SUBMITTED_TO_OZON')
        ) {
          await this.externalSubmissions.recordReconciledResult(
            submissionIdentity,
            preflight,
            {
              source:
                typeof preflight.evidence?.source === 'string'
                  ? preflight.evidence.source
                  : 'ozon_preflight',
              found:
                preflight.status === 'ACTIVE_ON_OZON' ||
                preflight.status === 'SUBMITTED_TO_OZON',
            },
          );
        }
        await this.persistPublishOutcome(
          launch,
          launch.imageProjectId,
          preflight,
        );
        return {
          status: preflight.status,
          productLaunchId: launch.id,
          productId: launch.product?.id ?? launch.productId,
          taskId: preflight.taskId,
        };
      }

      if (!launch.confirmAutoPublish) {
        const imageProject = await this.ensureImages(launch);
        const prepared = await this.ensureListingAndReview(
          launch,
          imageProject,
        );
        await this.tenantDatabase.run(launch.organizationId, (transaction) =>
          transaction.productLaunch.update({
            where: { id: launch.id },
            data: {
              status: 'AWAITING_PUBLISH_APPROVAL',
              imageProjectId: imageProject.id,
              agentRunId: imageProject.agentRunId,
              listingDraftId: prepared.listing.id,
              publishReviewTaskId: prepared.reviewTask.id,
              confirmAutoPublish: false,
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
              execution: {
                imageGeneration: 'completed',
                imageProjectId: imageProject.id,
                imageCount: imageProject.generatedAssets.length,
                listingGeneration: 'completed',
                listingDraftId: prepared.listing.id,
                listingReviewTaskId: prepared.reviewTask.id,
                ozonSubmission: 'awaiting_separate_approval',
              },
            },
          }),
        );
        const productMetadata = this.asRecord(product!.metadata);
        const candidateEvidence = this.asRecord(productMetadata.agentEvidence);
        await this.actionProposals.create({
          organizationId: launch.organizationId,
          requestedBy: launch.requestedBy,
          approverId: launch.requestedBy,
          source: 'product-launch-worker',
          title: '商品图片和 Listing 已准备，等待发布审批',
          body: '请核对商品图、商品链接、Listing、利润与沙箱规则。批准后才会进入 Ozon 发布队列。',
          type: 'APPROVAL_REQUIRED',
          action: {
            label: '确认发布到 Ozon',
            name: 'product-launch.confirm-publish',
            params: { productLaunchId: launch.id },
          },
          context: {
            kind: 'product_launch_publish_review',
            agentRunId: imageProject.agentRunId,
            agentType: 'IMAGE_CREATIVE',
            riskLevel: 'high',
            provider: 'OZON',
            resourceType: 'ProductLaunch',
            resourceId: launch.id,
            listingDraftId: prepared.listing.id,
            reviewTaskId: prepared.reviewTask.id,
            targetRoute: `/review?task=${prepared.reviewTask.id}`,
            preview: {
              productTitle: product!.title,
              productImages: Array.isArray(product!.images)
                ? product!.images
                : [],
              productUrl:
                candidateEvidence.productUrl ??
                candidateEvidence.sourceUrl ??
                productMetadata.productUrl ??
                productMetadata.sourceUrl ??
                null,
            },
          },
          dedupeKey: `product-launch:${launch.id}:publish-approval`,
        });
        return {
          status: 'AWAITING_PUBLISH_APPROVAL',
          productLaunchId: launch.id,
          productId: product!.id,
          listingDraftId: prepared.listing.id,
          publishReviewTaskId: prepared.reviewTask.id,
        };
      }

      const existingSubmission = await this.externalSubmissions.find(
        submissionIdentity!,
      );
      if (
        existingSubmission?.status !== 'PREPARED' &&
        existingSubmission?.status !== 'RETRYABLE_FAILED'
      ) {
        if (
          existingSubmission &&
          ['CLAIMED', 'REQUEST_SENT', 'UNKNOWN', 'RECONCILING'].includes(
            existingSubmission.status,
          )
        ) {
          await this.externalSubmissions.beginReconciliation(
            submissionIdentity!,
            {
              source: 'ozon_offer_readback',
              found: false,
              previousStatus: existingSubmission.status,
            },
          );
          await this.markLaunchReconciliationRequired(
            launch,
            'EXTERNAL_SUBMISSION_REQUIRES_RECONCILIATION',
            `External submission ${existingSubmission.status} requires readback before any retry.`,
          );
        }
        return {
          status: 'RECONCILIATION_REQUIRED',
          productLaunchId: launch.id,
          productId: launch.product?.id ?? launch.productId,
          submissionStatus: existingSubmission?.status ?? 'missing',
        };
      }

      const claimToken = randomUUID();
      await this.externalSubmissions.claimLaunchForSend(submissionIdentity!, {
        claimToken,
        execution: {
          ...this.asRecord(launch.execution),
          imageGeneration: 'completed',
          imageProjectId: launch.imageProjectId,
          listingDraftId: launch.listingDraftId,
          approvedContentHash: launch.approvedContentHash,
          publishSnapshotId: launch.selectedPublishSnapshotId,
          publishSnapshotHash: launch.approvedPublishSnapshotHash,
          ozonSubmission: 'claimed',
          claimToken,
        },
      });
      let requestStarted = false;
      let publish: OzonProductPublishResult;
      try {
        publish = await this.ozonPublisher.publishSnapshot(
          {
            organizationId: launch.organizationId,
            snapshotId: launch.selectedPublishSnapshotId!,
            expectedSnapshotHash: launch.approvedPublishSnapshotHash!,
          },
          {
            beforeDispatch: async () => {
              await this.externalSubmissions.markRequestStarted(
                submissionIdentity!,
                claimToken,
                job.data.publishExecutionGrant ?? '',
              );
              requestStarted = true;
            },
          },
        );
      } catch (error) {
        if (!requestStarted) {
          await this.externalSubmissions.markRetryableFailureBeforeDispatch(
            submissionIdentity!,
            claimToken,
            error,
          );
          throw Object.assign(
            error instanceof Error ? error : new Error(String(error)),
            { code: 'EXTERNAL_SUBMISSION_NOT_DISPATCHED' },
          );
        }
        await this.externalSubmissions.recordUnknown(
          submissionIdentity!,
          error,
          claimToken,
        );
        throw Object.assign(
          error instanceof Error ? error : new Error(String(error)),
          { code: 'EXTERNAL_SUBMISSION_OUTCOME_UNKNOWN' },
        );
      }
      if (!requestStarted) {
        await this.externalSubmissions.markRetryableFailureBeforeDispatch(
          submissionIdentity!,
          claimToken,
          publish.message ?? publish.code ?? 'Ozon request was not dispatched',
        );
        await this.persistPublishOutcome(
          launch,
          launch.imageProjectId,
          publish,
        );
        return {
          status: publish.status,
          productLaunchId: launch.id,
          productId: launch.product?.id ?? launch.productId,
          taskId: publish.taskId,
        };
      }
      await this.externalSubmissions.recordResult(
        submissionIdentity!,
        publish,
        claimToken,
      );
      await this.persistPublishOutcome(launch, launch.imageProjectId, publish);
      return {
        status: publish.status,
        productLaunchId: launch.id,
        productId: launch.product?.id ?? launch.productId,
        taskId: publish.taskId,
      };
    } catch (error) {
      const code = this.failureCode(error);
      const message = this.errorMessage(error);
      if (code === 'EXTERNAL_SUBMISSION_OUTCOME_UNKNOWN') {
        await this.markLaunchReconciliationRequired(launch, code, message);
        throw error;
      }
      if (code === 'EXTERNAL_SUBMISSION_NOT_DISPATCHED') {
        throw error;
      }
      if (
        code === 'EXTERNAL_SUBMISSION_REQUIRES_RECONCILIATION' ||
        code === 'PRODUCT_LAUNCH_ALREADY_CLAIMED' ||
        code === 'EXTERNAL_SUBMISSION_CLAIM_LOST'
      ) {
        return {
          status: 'RECONCILIATION_REQUIRED',
          productLaunchId: launch.id,
          productId: launch.product?.id ?? launch.productId,
          code,
        };
      }
      await this.failLaunch(launch, code, message);
      throw error;
    }
  }

  private async markLaunchReconciliationRequired(
    launch: {
      id: string;
      organizationId: string;
      requestedBy: string;
      imageProjectId: string | null;
      listingDraftId: string | null;
      selectedPublishSnapshotId: string | null;
      approvedPublishSnapshotHash: string | null;
      execution: Prisma.JsonValue;
    },
    code: string,
    message: string,
  ) {
    await this.tenantDatabase.run(launch.organizationId, (transaction) =>
      transaction.productLaunch.updateMany({
        where: {
          id: launch.id,
          organizationId: launch.organizationId,
          status: { in: ['QUEUED', 'SUBMITTING_TO_OZON', 'RECOVERING'] },
          selectedPublishSnapshotId: launch.selectedPublishSnapshotId,
          approvedPublishSnapshotHash: launch.approvedPublishSnapshotHash,
        },
        data: {
          status: 'RECOVERING',
          failureCode: code,
          failureMessage: message,
          completedAt: null,
          execution: {
            ...this.asRecord(launch.execution),
            imageGeneration: 'completed',
            imageProjectId: launch.imageProjectId,
            listingDraftId: launch.listingDraftId,
            publishSnapshotId: launch.selectedPublishSnapshotId,
            publishSnapshotHash: launch.approvedPublishSnapshotHash,
            ozonSubmission: 'unknown_requires_reconciliation',
          },
        },
      }),
    );
    await this.audit.log({
      organizationId: launch.organizationId,
      actorId: launch.requestedBy,
      action: 'product-launch.reconciliation-required',
      resourceType: 'ProductLaunch',
      resourceId: launch.id,
      after: { code, message },
    });
  }

  private async ensureListingAndReview(
    launch: {
      id: string;
      organizationId: string;
      requestedBy: string;
      publishReviewTaskId: string | null;
      product: {
        id: string;
        workspaceId: string;
        title: string;
        metadata: Prisma.JsonValue;
      } | null;
    },
    imageProject: {
      generatedAssets: Array<{
        url: string;
        sceneId?: string;
        filename?: string;
      }>;
    },
  ) {
    if (!launch.product) {
      throw this.launchError(
        'LOCAL_DRAFT_NOT_FOUND',
        'Local product draft is missing.',
      );
    }
    const user: JwtPayload = {
      sub: launch.requestedBy,
      email: 'product-launch-worker@shopmate.local',
      orgId: launch.organizationId,
      role: 'OWNER',
    };
    const metadata = this.asRecord(launch.product.metadata);
    const agentEvidence = this.asRecord(metadata.agentEvidence);
    const description =
      typeof agentEvidence.summary === 'string'
        ? agentEvidence.summary
        : undefined;
    const draft = await this.listings.generateForProductLaunch(
      user,
      {
        workspaceId: launch.product.workspaceId,
        productId: launch.product.id,
        productName: launch.product.title,
        ...(description ? { description } : {}),
        keywords: [],
        platform: 'ozon',
        tone: 'professional',
      },
      launch.id,
    );
    const listing = await this.listings.attachMediaForReview(
      user,
      draft.id,
      imageProject.generatedAssets,
    );
    const existingReview = await this.tenantDatabase.run(
      launch.organizationId,
      (tx) =>
        launch.publishReviewTaskId
          ? tx.reviewTask.findFirst({
              where: {
                id: launch.publishReviewTaskId,
                organizationId: launch.organizationId,
                entityType: 'LISTING_DRAFT',
                entityId: listing.id,
              },
            })
          : tx.reviewTask.findFirst({
              where: {
                organizationId: launch.organizationId,
                entityType: 'LISTING_DRAFT',
                entityId: listing.id,
                status: { in: ['PENDING', 'REWORK', 'APPROVED'] },
              },
              orderBy: { createdAt: 'desc' },
            }),
    );
    const reviewTask =
      existingReview ??
      (await this.review.createFromAgentRun(launch.organizationId, {
        entityType: 'LISTING_DRAFT',
        entityId: listing.id,
        score: listing.score ?? undefined,
      }));
    return { listing, reviewTask };
  }

  private assertPublishApproval(
    launch: {
      organizationId: string;
      listingDraftId: string | null;
      publishReviewTaskId: string | null;
      approvedContentHash: string | null;
      selectedPublishSnapshotId: string | null;
      approvedPublishSnapshotHash: string | null;
      publishApprovedBy: string | null;
      publishApprovedAt: Date | null;
      imageProjectId: string | null;
      publishExecutionGrantHash: string | null;
      publishExecutionGrantScope: string | null;
      publishExecutionGrantSnapshotHash: string | null;
      publishExecutionGrantExpiresAt: Date | null;
      publishExecutionGrantConsumedAt: Date | null;
    },
    publishExecutionGrant?: string,
  ): void {
    if (
      !launch.listingDraftId ||
      !launch.publishReviewTaskId ||
      !launch.approvedContentHash ||
      !launch.selectedPublishSnapshotId ||
      !launch.approvedPublishSnapshotHash ||
      !launch.publishApprovedBy ||
      !launch.publishApprovedAt ||
      !launch.imageProjectId ||
      !publishExecutionGrant ||
      !launch.publishExecutionGrantHash ||
      launch.publishExecutionGrantHash !==
        hashPublishExecutionGrant(publishExecutionGrant) ||
      launch.publishExecutionGrantScope !== OZON_LISTING_PUBLISH_CAPABILITY ||
      launch.publishExecutionGrantSnapshotHash !==
        launch.approvedPublishSnapshotHash ||
      !launch.publishExecutionGrantExpiresAt ||
      launch.publishExecutionGrantExpiresAt.getTime() <= Date.now() ||
      launch.publishExecutionGrantConsumedAt !== null
    ) {
      throw this.launchError(
        'PUBLISH_EXECUTION_GRANT_INVALID',
        'Separate publish approval or its one-time execution grant is incomplete, expired, mismatched, or consumed.',
      );
    }
  }

  private assertPublishStepUp(launch: {
    publishApprovedBy: string | null;
    publishApprovedAt: Date | null;
    execution: Prisma.JsonValue;
  }): void {
    const execution = this.asRecord(launch.execution);
    const stepUp = readRecentPublishStepUp(
      execution.publishStepUp,
      launch.publishApprovedBy ?? '',
      launch.publishApprovedAt ?? new Date(0),
    );
    if (!stepUp) {
      throw this.launchError(
        'PUBLISH_STEP_UP_REQUIRED',
        'The durable publish approval does not contain a recent password and TOTP step-up for its approving actor.',
      );
    }
  }

  private async ensureImages(launch: {
    id: string;
    organizationId: string;
    reviewTaskId: string;
    requestedBy: string;
    referenceAssetId: string | null;
    referenceAssetSha256: string | null;
    product: {
      id: string;
      workspaceId: string;
      title: string;
      images: string[];
      metadata: Prisma.JsonValue;
    } | null;
  }) {
    if (!launch.product) {
      throw this.launchError(
        'LOCAL_DRAFT_NOT_FOUND',
        'Local product draft is missing.',
      );
    }
    const product = launch.product;
    if (!launch.referenceAssetId || !launch.referenceAssetSha256) {
      throw this.launchError(
        'IMAGE_REFERENCE_REQUIRED',
        'An immutable reference image is required before image generation.',
      );
    }
    const reference = await this.files.readImageDataUrl(
      {
        sub: launch.requestedBy,
        email: '',
        role: 'MEMBER',
        orgId: launch.organizationId,
      },
      launch.referenceAssetId,
    );
    if (reference.asset.sha256 !== launch.referenceAssetSha256) {
      throw this.launchError(
        'IMAGE_REFERENCE_CHANGED',
        'The reference image hash no longer matches the approved launch evidence.',
      );
    }
    const agentRun = await this.tenantDatabase.run(
      launch.organizationId,
      (transaction) =>
        transaction.agentRun.create({
          data: {
            organizationId: launch.organizationId,
            workspaceId: product.workspaceId,
            userId: launch.requestedBy,
            agentType: 'IMAGE_CREATIVE',
            status: 'RUNNING',
            startedAt: new Date(),
            input: {
              source: 'product_launch_worker',
              productLaunchId: launch.id,
              productId: product.id,
              productName: product.title,
              reviewTaskId: launch.reviewTaskId,
              referenceAssetId: launch.referenceAssetId,
              referenceAssetSha256: launch.referenceAssetSha256,
            },
          },
          select: { id: true },
        }),
    );
    await this.tenantDatabase.run(launch.organizationId, (transaction) =>
      transaction.productLaunch.update({
        where: { id: launch.id },
        data: {
          status: 'GENERATING_IMAGES',
          agentRunId: agentRun.id,
          startedAt: new Date(),
          failureCode: null,
          failureMessage: null,
          execution: {
            imageGeneration: 'running',
            ozonSubmission: 'not_started',
          },
        },
      }),
    );
    try {
      const result = await this.agentProvider.runImageGeneration(
        {
          productName: launch.product.title,
          imageBase64: reference.dataUrl,
          sceneCount: 5,
          platforms: ['ozon'],
          message:
            'Generate truthful product listing images after explicit human approval.',
        },
        {
          orgId: launch.organizationId,
          userId: launch.requestedBy,
          workspaceId: launch.product.workspaceId,
          agentRunId: agentRun.id,
        },
      );
      if (result.mockMode) {
        throw this.launchError(
          'IMAGE_PROVIDER_MOCK_NOT_ALLOWED',
          'Image provider returned mockMode=true; mock output cannot be used for a product launch.',
        );
      }
      const images = result.images.filter(
        (image) => typeof image.url === 'string' && image.url.trim().length > 0,
      );
      if (images.length === 0) {
        throw this.launchError(
          'IMAGE_GENERATION_EMPTY',
          'Image provider completed without usable image URLs.',
        );
      }
      const visualQa = this.visualQa.evaluate({
        platform: 'ozon',
        requestedSceneCount: 5,
        reference: {
          assetId: launch.referenceAssetId,
          sha256: launch.referenceAssetSha256,
        },
        generation: { ...result, images },
      });
      const imageProject = await this.tenantDatabase.run(
        launch.organizationId,
        (tx) =>
          tx.imagePromptProject.create({
            data: {
              organizationId: launch.organizationId,
              workspaceId: product.workspaceId,
              productId: product.id,
              referenceAssetId: launch.referenceAssetId,
              title: `${product.title} product launch images`,
              prompt: 'Generated after explicit product launch confirmation.',
              generatedAssets: images as unknown as Prisma.InputJsonValue,
              qaStatus: visualQa.outcome,
              qaVersion: visualQa.schemaVersion,
              qaResult: visualQa as unknown as Prisma.InputJsonValue,
              qaCompletedAt: new Date(visualQa.evaluatedAt),
              settings: {
                source: 'product_launch_worker',
                productLaunchId: launch.id,
                agentRunId: agentRun.id,
                sessionId: result.sessionId,
                consistencyScore: result.consistencyScore ?? null,
                consistencyPassed: result.consistencyPassed ?? null,
                compliancePassed: result.compliancePassed ?? null,
                externalConsistencyStatus:
                  result.externalConsistencyStatus ?? null,
                referenceAssetId: launch.referenceAssetId,
                referenceAssetSha256: launch.referenceAssetSha256,
                downloadUrl: result.downloadUrl ?? null,
              },
              status: visualQa.outcome === 'PASSED' ? 'COMPLETED' : 'FAILED',
              createdBy: launch.requestedBy,
            },
            select: { id: true, generatedAssets: true },
          }),
      );
      if (visualQa.outcome !== 'PASSED') {
        await this.tenantDatabase.run(launch.organizationId, (transaction) =>
          transaction.productLaunch.update({
            where: { id: launch.id },
            data: {
              imageProjectId: imageProject.id,
              execution: {
                imageGeneration: 'failed_visual_qa',
                imageProjectId: imageProject.id,
                visualQa,
                ozonSubmission: 'not_started',
              } as unknown as Prisma.InputJsonValue,
            },
          }),
        );
        throw this.launchError(
          'VISUAL_QA_FAILED',
          'Generated images failed the independent visual QA gate.',
        );
      }
      const metadata = this.asRecord(product.metadata);
      await this.tenantDatabase.run(launch.organizationId, (transaction) =>
        transaction.product.update({
          where: { id: product.id },
          data: {
            images: images.map((image) => image.url),
            metadata: {
              ...metadata,
              externalStoreMutation: 'pending_ozon_submission',
              latestProductLaunch: {
                reviewTaskId: launch.reviewTaskId,
                agentRunId: agentRun.id,
                status: 'SUBMITTING_TO_OZON',
                imageProjectId: imageProject.id,
                imageCount: images.length,
              },
            },
          },
        }),
      );
      await this.tenantDatabase.run(launch.organizationId, (transaction) =>
        transaction.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: 'COMPLETED',
            output: { ...result, visualQa } as unknown as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        }),
      );
      return {
        id: imageProject.id,
        agentRunId: agentRun.id,
        generatedAssets: images,
        visualQa,
      };
    } catch (error) {
      await this.tenantDatabase.run(launch.organizationId, (transaction) =>
        transaction.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: 'FAILED',
            errorCode: this.failureCode(error),
            errorMessage: this.errorMessage(error),
            finishedAt: new Date(),
          },
        }),
      );
      throw error;
    }
  }

  private async persistPublishOutcome(
    launch: {
      id: string;
      organizationId: string;
      requestedBy: string;
      product: {
        id: string;
        metadata: Prisma.JsonValue;
      } | null;
      execution: Prisma.JsonValue;
    },
    imageProjectId: string | null,
    publish: OzonProductPublishResult,
  ) {
    const finishedAt = new Date();
    const status = publish.status;
    const isFailure = status === 'FAILED' || status === 'BLOCKED';
    const launchStatus = status === 'SUBMITTED_TO_OZON' ? 'RECOVERING' : status;
    const isTerminal =
      launchStatus === 'ACTIVE_ON_OZON' ||
      launchStatus === 'FAILED' ||
      launchStatus === 'BLOCKED';
    await this.tenantDatabase.run(launch.organizationId, (transaction) =>
      transaction.productLaunch.update({
        where: { id: launch.id },
        data: {
          status: launchStatus,
          imageProjectId,
          channelId: publish.channelId ?? null,
          failureCode: isFailure
            ? (publish.code ?? 'OZON_PUBLISH_FAILED')
            : null,
          failureMessage: isFailure
            ? (publish.message ?? 'Ozon publish failed.')
            : null,
          completedAt: isTerminal ? finishedAt : null,
          execution: {
            ...this.asRecord(launch.execution),
            imageGeneration: imageProjectId ? 'completed' : 'not_started',
            imageProjectId,
            ozonSubmission: status,
            channelId: publish.channelId ?? null,
            taskId: publish.taskId ?? null,
            externalProductId: publish.externalProductId ?? null,
            externalStatus: publish.externalStatus ?? null,
            evidence: publish.evidence ?? {},
          } as Prisma.InputJsonValue,
        },
      }),
    );
    if (launch.product) {
      const product = launch.product;
      const metadata = this.asRecord(product.metadata);
      await this.tenantDatabase.run(launch.organizationId, (tx) =>
        tx.product.update({
          where: { id: product.id },
          data: {
            ...(status === 'ACTIVE_ON_OZON' ? { status: 'ACTIVE' } : {}),
            ...(publish.externalProductId
              ? { asinOrExternalId: String(publish.externalProductId) }
              : {}),
            metadata: {
              ...metadata,
              externalStoreMutation:
                status === 'ACTIVE_ON_OZON'
                  ? 'ozon_active'
                  : status === 'SUBMITTED_TO_OZON'
                    ? 'submitted_to_ozon'
                    : status === 'BLOCKED'
                      ? 'ozon_submission_blocked'
                      : 'ozon_submission_failed',
              latestProductLaunch: {
                launchId: launch.id,
                status: launchStatus,
                imageProjectId,
                channelId: publish.channelId ?? null,
                taskId: publish.taskId ?? null,
                externalProductId: publish.externalProductId ?? null,
                externalStatus: publish.externalStatus ?? null,
                failureCode: publish.code ?? null,
                failureMessage: publish.message ?? null,
                updatedAt: finishedAt.toISOString(),
              },
            },
          },
        }),
      );
    }
    await this.audit.log({
      organizationId: launch.organizationId,
      actorId: launch.requestedBy,
      action: 'product-launch.ozon-result',
      resourceType: 'ProductLaunch',
      resourceId: launch.id,
      after: {
        status: launchStatus,
        externalStatus: status,
        channelId: publish.channelId ?? null,
        taskId: publish.taskId ?? null,
        externalProductId: publish.externalProductId ?? null,
        failureCode: publish.code ?? null,
      },
    });
    if (status === 'ACTIVE_ON_OZON' || isFailure) {
      try {
        await this.actionProposals.reconcileApprovedProductLaunchOutcome({
          organizationId: launch.organizationId,
          productLaunchId: launch.id,
          status: status === 'ACTIVE_ON_OZON' ? 'EXECUTED' : 'FAILED',
          result: publish,
          now: finishedAt,
        });
      } catch (error) {
        this.logger.error(
          `Ozon result was persisted but approval status reconciliation failed for ${launch.id}`,
          this.errorMessage(error),
        );
      }
    }
    await this.notifyLaunchState(launch, publish);
  }

  private async failLaunch(
    launch: {
      id: string;
      organizationId: string;
      requestedBy: string;
      productId: string | null;
      execution: Prisma.JsonValue;
    },
    code: string,
    message: string,
  ) {
    await this.tenantDatabase.run(launch.organizationId, (transaction) =>
      transaction.productLaunch.update({
        where: { id: launch.id },
        data: {
          status: 'FAILED',
          failureCode: code,
          failureMessage: message,
          completedAt: new Date(),
          execution: {
            ...this.asRecord(launch.execution),
            imageGeneration: 'failed',
            ozonSubmission:
              code === 'EXTERNAL_SUBMISSION_OUTCOME_UNKNOWN' ||
              code === 'EXTERNAL_SUBMISSION_REQUIRES_RECONCILIATION'
                ? 'unknown_requires_reconciliation'
                : 'not_started',
            failureCode: code,
            failureMessage: message,
          },
        },
      }),
    );
    await this.audit.log({
      organizationId: launch.organizationId,
      actorId: launch.requestedBy,
      action: 'product-launch.failed',
      resourceType: 'ProductLaunch',
      resourceId: launch.id,
      after: { code, message, productId: launch.productId },
    });
    await this.createNotification(
      launch.organizationId,
      launch.requestedBy,
      '商品图片生成或上架失败',
      message,
      { launchId: launch.id, status: 'FAILED', code },
    );
    throw this.launchError(code, message);
  }

  private async notifyLaunchState(
    launch: {
      id: string;
      organizationId: string;
      requestedBy: string;
    },
    publish: OzonProductPublishResult,
  ) {
    const title =
      publish.status === 'ACTIVE_ON_OZON'
        ? '商品已在 Ozon 进入可售状态'
        : publish.status === 'SUBMITTED_TO_OZON'
          ? '商品已提交至 Ozon，等待平台处理'
          : publish.status === 'BLOCKED'
            ? '商品上架被 Ozon 前置条件阻断'
            : '商品提交 Ozon 失败';
    await this.createNotification(
      launch.organizationId,
      launch.requestedBy,
      title,
      publish.message ?? null,
      {
        launchId: launch.id,
        status: publish.status,
        code: publish.code ?? null,
        channelId: publish.channelId ?? null,
        taskId: publish.taskId ?? null,
        targetRoute: '/review',
      },
    );
  }

  private async createNotification(
    organizationId: string,
    userId: string,
    title: string,
    body: string | null,
    metadata: Record<string, unknown>,
  ) {
    const notification = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.notification.create({
        data: {
          organizationId,
          userId,
          type: 'REPORT_READY',
          title,
          body,
          metadata: {
            kind: 'product_launch_state',
            ...metadata,
          },
        },
      }),
    );
    this.notificationEvents?.publishCreated(notification);
  }

  private launchError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
  }

  private async assertExclusiveOzonStoreOwnership(input: {
    organizationId: string;
    snapshotId: string;
  }): Promise<void> {
    const snapshot = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.listingPublishSnapshot.findFirst({
        where: {
          id: input.snapshotId,
          organizationId: input.organizationId,
          status: 'APPROVED',
        },
        select: { snapshot: true },
      }),
    );
    const channelId = this.asRecord(snapshot?.snapshot).channelId;
    if (typeof channelId !== 'string' || !channelId.trim()) {
      throw this.launchError(
        'OZON_STORE_IDENTITY_UNVERIFIED',
        'The approved publish snapshot does not identify its Ozon channel.',
      );
    }
    const currentChannels = await this.tenantDatabase.run(
      input.organizationId,
      (tx) =>
        tx.channelConnection.findMany({
          where: {
            id: channelId,
            provider: 'OZON',
            syncStatus: 'SUCCESS',
          },
          select: { id: true, externalShopId: true },
          take: 1,
        }),
    );
    const externalShopId = currentChannels[0]?.externalShopId?.trim();
    if (!externalShopId) {
      throw this.launchError(
        'OZON_STORE_IDENTITY_UNVERIFIED',
        'The selected Ozon channel has no verified external shop identity.',
      );
    }

    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const matches = (
      await Promise.all(
        organizations.map((organization) =>
          this.tenantDatabase.run(organization.id, (tx) =>
            tx.channelConnection.findMany({
              where: {
                provider: 'OZON',
                externalShopId,
                syncStatus: 'SUCCESS',
              },
              select: { id: true },
              take: 2,
            }),
          ),
        ),
      )
    ).flat();
    if (new Set(matches.map((channel) => channel.id)).size !== 1) {
      throw this.launchError(
        'OZON_STORE_OWNERSHIP_AMBIGUOUS',
        'The same Ozon seller is connected to multiple organizations; external publication is blocked until one canonical owner remains.',
      );
    }
  }

  private failureCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && code.length > 0) return code;
    }
    return 'PRODUCT_LAUNCH_FAILED';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
