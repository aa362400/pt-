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
  ) {}

  async confirm(
    user: JwtPayload,
    reviewTaskId: string,
    dto: ConfirmProductLaunchDto,
  ) {
    const organizationId = this.requireOrg(user);
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
    if (!dto.candidateId.startsWith(`${reviewTask.entityId}:`)) {
      throw new BadRequestException(
        'Candidate does not belong to this review report',
      );
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
    if (
      referenceAsset.purpose !== 'PRODUCT_IMAGE' ||
      !referenceAsset.mimeType.startsWith('image/') ||
      !referenceAsset.sha256
    ) {
      throw new BadRequestException(
        'A verified PRODUCT_IMAGE reference asset is required before generation',
      );
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
        { productLaunchId: launch.id, organizationId },
        { jobId: `product-launch:${launch.id}:prepare` },
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

    try {
      await this.queue.add(
        'product-launch',
        {
          productLaunchId: launch.id,
          organizationId,
          publishExecutionGrant: publishGrant.token,
        },
        {
          jobId: `product-launch:${launch.id}:publish:${publishSnapshot.snapshotHash}`,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.tenantDatabase.run(organizationId, (transaction) =>
        transaction.productLaunch.update({
          where: { id: launch.id },
          data: {
            status: 'AWAITING_PUBLISH_APPROVAL',
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
            failureCode: 'QUEUE_UNAVAILABLE',
            failureMessage: message,
          },
        }),
      );
      throw new ServiceUnavailableException(
        'Publish approval was recorded but the background worker is unavailable',
      );
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

  private redactPublishGrant<T extends Record<string, unknown>>(launch: T) {
    const { publishExecutionGrantHash: _grantHash, ...safeLaunch } = launch;
    return safeLaunch;
  }
}
