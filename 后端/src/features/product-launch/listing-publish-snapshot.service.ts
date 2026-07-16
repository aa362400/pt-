import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ListingBundleService } from '../listings/listing-bundle.service.js';
import {
  CanonicalCatalogService,
  type CanonicalProductV1,
} from '../marketplace-compiler/canonical-catalog.service.js';
import { MarketplaceCompilerService } from '../marketplace-compiler/marketplace-compiler.service.js';
import type { OzonProductImportInput } from '../channels/ozon-seller-api.client.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

const LEGACY_LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION =
  'listing-publish-snapshot/v1' as const;
export const LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION =
  'listing-publish-snapshot/v2' as const;

const commonPublishSnapshotBodySchema = z.object({
  target: z.literal('OZON'),
  organizationId: z.string().min(1),
  productLaunchId: z.string().min(1),
  listingDraftId: z.string().min(1),
  reviewTaskId: z.string().min(1),
  productId: z.string().min(1),
  channelId: z.string().min(1),
  listingApprovalHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime(),
  canonicalProduct: z.record(z.string(), z.unknown()),
  payload: z
    .object({
      name: z.string().min(1),
      offerId: z.string().min(1),
      price: z.number().positive(),
      images: z.array(z.string().url()).min(1),
    })
    .passthrough(),
  compilation: z.record(z.string(), z.unknown()),
});

const economicsSchema = z.object({
  currency: z.string().min(1),
  price: z.number().positive(),
  cost: z.number().positive(),
  shippingCost: z.number().positive(),
  platformFeeRate: z.number().positive().max(1),
  withdrawalFeeRate: z.number().min(0).max(1),
  netProfit: z.number().finite(),
  marginRate: z.number().finite(),
  source: z.object({
    cost: z.literal('product.cost'),
    shippingCost: z.literal(
      'product.metadata.ozonPublication.shippingCost',
    ),
    platformFeeRate: z.literal(
      'product.metadata.ozonPublication.platformFeeRate',
    ),
    withdrawalFeeRate: z.literal(
      'product.metadata.ozonPublication.withdrawalFeeRate',
    ),
  }),
});

const safetyEvidenceSchema = z.object({
  image: z.record(z.string(), z.unknown()),
  content: z.record(z.string(), z.unknown()),
  pricing: z.record(z.string(), z.unknown()),
  attributes: z.record(z.string(), z.unknown()),
  channel: z.record(z.string(), z.unknown()),
  approval: z.record(z.string(), z.unknown()),
  externalResponse: z.record(z.string(), z.unknown()),
});

const legacyPublishSnapshotBodySchema = commonPublishSnapshotBodySchema.extend({
  schemaVersion: z.literal(LEGACY_LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION),
  economics: economicsSchema.optional(),
});

const currentPublishSnapshotBodySchema = commonPublishSnapshotBodySchema.extend(
  {
    schemaVersion: z.literal(LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION),
    economics: economicsSchema,
    safetyEvidence: safetyEvidenceSchema,
  },
);

const supportedPublishSnapshotBodySchema = z.union([
  currentPublishSnapshotBodySchema,
  legacyPublishSnapshotBodySchema,
]);

export type ListingPublishSnapshotBody = Omit<
  z.infer<typeof currentPublishSnapshotBodySchema>,
  'canonicalProduct' | 'payload'
> & {
  canonicalProduct: CanonicalProductV1;
  payload: OzonProductImportInput;
};

@Injectable()
export class ListingPublishSnapshotService {
  constructor(
    private readonly listingBundles: ListingBundleService,
    private readonly catalog: CanonicalCatalogService,
    private readonly compiler: MarketplaceCompilerService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async captureApproved(input: {
    organizationId: string;
    productLaunchId: string;
    listingDraftId: string;
    reviewTaskId: string;
    approvedBy: string;
    approvedAt: Date;
  }) {
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const existing = await tx.listingPublishSnapshot.findFirst({
        where: {
          organizationId: input.organizationId,
          productLaunchId: input.productLaunchId,
          status: 'APPROVED',
          schemaVersion: LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        this.verifyStored(existing.snapshot, existing.snapshotHash);
        return existing;
      }

      const [listing, reviewTask, launch] = await Promise.all([
        tx.listingDraft.findFirst({
          where: {
            id: input.listingDraftId,
            organizationId: input.organizationId,
          },
        }),
        tx.reviewTask.findFirst({
          where: {
            id: input.reviewTaskId,
            organizationId: input.organizationId,
            entityType: 'LISTING_DRAFT',
            entityId: input.listingDraftId,
          },
        }),
        tx.productLaunch.findFirst({
          where: {
            id: input.productLaunchId,
            organizationId: input.organizationId,
          },
          select: {
            id: true,
            listingDraftId: true,
            publishReviewTaskId: true,
            imageProjectId: true,
          },
        }),
      ]);
      if (!listing || !reviewTask || !launch) {
        throw this.snapshotError(
          'PUBLISH_APPROVAL_NOT_FOUND',
          'The approved listing or its review evidence was not found.',
        );
      }
      if (
        (typeof launch.listingDraftId === 'string' &&
          launch.listingDraftId !== listing.id) ||
        (typeof launch.publishReviewTaskId === 'string' &&
          launch.publishReviewTaskId !== reviewTask.id)
      ) {
        throw this.snapshotError(
          'PUBLISH_APPROVAL_BINDING_INVALID',
          'The launch is not bound to the exact listing and review being published.',
        );
      }
      const bundle = this.listingBundles.parseStoredBundle(listing.bundle);
      const evaluation = this.asRecord(listing.evaluationResult);
      const decision = this.asRecord(reviewTask.decisionEvidence);
      if (!bundle || !listing.contentHash || !listing.approvalHash) {
        throw this.snapshotError(
          'PUBLISH_APPROVAL_INCOMPLETE',
          'The listing is missing a valid bundle or approval hash.',
        );
      }
      const contentHash = this.listingBundles.computeOutputSha256(bundle);
      const approvalHash = this.listingBundles.computeApprovalSha256(bundle);
      if (
        listing.status !== 'APPROVED' ||
        reviewTask.status !== 'APPROVED' ||
        evaluation.outcome !== 'QUALIFIED' ||
        decision.type !== 'listing-approval/v2' ||
        contentHash !== listing.contentHash ||
        contentHash !== bundle.provenance.outputSha256 ||
        approvalHash !== listing.approvalHash ||
        decision.approvedListingSha256 !== approvalHash ||
        decision.evaluatorOutcome !== 'QUALIFIED'
      ) {
        throw this.snapshotError(
          'PUBLISH_APPROVAL_INVALID',
          'The listing no longer matches the exact content approved for publishing.',
        );
      }
      if (bundle.platform.trim().toLowerCase() !== 'ozon') {
        throw this.snapshotError(
          'PUBLISH_TARGET_INVALID',
          'Only an approved Ozon listing can create an Ozon publish snapshot.',
        );
      }
      if (!listing.productId) {
        throw this.snapshotError(
          'PUBLISH_PRODUCT_NOT_FOUND',
          'The approved listing is not bound to a local product.',
        );
      }

      const product = await tx.product.findFirst({
        where: {
          id: listing.productId,
          workspace: { organizationId: input.organizationId },
        },
        select: {
          id: true,
          workspaceId: true,
          title: true,
          sku: true,
          cost: true,
          price: true,
          currency: true,
          images: true,
          metadata: true,
          createdAt: true,
        },
      });
      if (!product) {
        throw this.snapshotError(
          'PUBLISH_PRODUCT_NOT_FOUND',
          'The local product bound to the approved listing was not found.',
        );
      }
      const channel = await tx.channelConnection.findFirst({
        where: {
          workspaceId: product.workspaceId,
          provider: 'OZON',
          syncStatus: 'SUCCESS',
          workspace: { organizationId: input.organizationId },
        },
        select: { id: true, syncStatus: true },
      });
      if (!channel) {
        throw this.snapshotError(
          'OZON_CHANNEL_NOT_CONNECTED',
          'No healthy Ozon channel is connected to this workspace.',
        );
      }

      const [imageProject, storeProfile, recentSubmissions, priorSnapshots] =
        await Promise.all([
          launch.imageProjectId
            ? tx.imagePromptProject.findFirst({
                where: {
                  id: launch.imageProjectId,
                  organizationId: input.organizationId,
                  productId: product.id,
                },
                select: {
                  id: true,
                  qaStatus: true,
                  qaVersion: true,
                  qaResult: true,
                  qaCompletedAt: true,
                  settings: true,
                },
              })
            : Promise.resolve(null),
          tx.storeAgentProfile.findUnique({
            where: { workspaceId: product.workspaceId },
            select: { minimumProfitMargin: true },
          }),
          tx.externalSubmission.findMany({
            where: {
              organizationId: input.organizationId,
              provider: 'OZON',
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              productLaunchId: true,
              publishSnapshotId: true,
              requestHash: true,
              status: true,
              failureCode: true,
            },
          }),
          tx.listingPublishSnapshot.findMany({
            where: {
              organizationId: input.organizationId,
              productId: product.id,
              productLaunchId: { not: input.productLaunchId },
              status: 'APPROVED',
            },
            orderBy: { approvedAt: 'desc' },
            take: 10,
            select: { snapshot: true, snapshotHash: true, approvedAt: true },
          }),
        ]);

      const approvedImages = bundle.mediaMapping
        .map((item) => item.assetUrl)
        .filter(
          (value): value is string =>
            typeof value === 'string' && /^https:\/\//i.test(value),
        );
      const canonicalProduct = this.catalog.fromLocalProduct({
        ...product,
        title: bundle.content.title,
        price: bundle.commercial.suggestedPrice ?? product.price,
        images: approvedImages,
      });
      const compilation = this.compiler.compileOzon(canonicalProduct, {
        mode: 'PUBLISH',
      });
      if (compilation.status !== 'VALID') {
        throw this.snapshotError(
          'PUBLISH_SNAPSHOT_COMPILATION_FAILED',
          'The approved listing cannot be compiled into a valid Ozon request.',
          { errors: compilation.errors, warnings: compilation.warnings },
        );
      }

      const publication = this.asRecord(
        this.asRecord(product.metadata).ozonPublication,
      );
      const price = Number(compilation.payload.price);
      const cost = this.positiveNumber(product.cost);
      const shippingCost = this.positiveNumber(
        publication.shippingCost,
      );
      const platformFeeRate = this.rate(publication.platformFeeRate);
      const withdrawalFeeRate = this.rate(
        publication.withdrawalFeeRate,
      );
      const missingEconomics = [
        ...(cost === null ? ['product.cost'] : []),
        ...(shippingCost === null
          ? ['product.metadata.ozonPublication.shippingCost']
          : []),
        ...(platformFeeRate === null || platformFeeRate <= 0
          ? ['product.metadata.ozonPublication.platformFeeRate']
          : []),
        ...(withdrawalFeeRate === null
          ? ['product.metadata.ozonPublication.withdrawalFeeRate']
          : []),
      ];
      if (
        cost === null ||
        shippingCost === null ||
        platformFeeRate === null ||
        platformFeeRate <= 0 ||
        withdrawalFeeRate === null
      ) {
        throw this.snapshotError(
          'PUBLISH_ECONOMICS_INVALID',
          'Verified positive product cost, shipping cost, and explicit Ozon fee rates are required before publication.',
          { missingEconomics },
        );
      }
      const netProfit = this.roundMoney(
        price -
          cost -
          shippingCost -
          price * platformFeeRate -
          price * withdrawalFeeRate,
      );
      const marginRate = this.roundRate(netProfit / price);
      const imageQaResult = this.asRecord(imageProject?.qaResult);
      const imageSettings = this.asRecord(imageProject?.settings);
      const qaOutcome =
        this.nonEmptyString(imageQaResult.outcome) ??
        this.nonEmptyString(imageProject?.qaStatus);
      const qaScore = this.finiteNumber(imageQaResult.score);
      const consistencyScore = this.finiteNumber(
        imageSettings.consistencyScore,
      );
      const severeImageMismatch =
        (qaOutcome !== null && qaOutcome.toUpperCase() !== 'PASSED') ||
        imageSettings.consistencyPassed === false ||
        imageSettings.compliancePassed === false ||
        (consistencyScore !== null && consistencyScore < 60);
      const sourceEvidence = this.competitorEvidence(product.metadata);
      const previousApprovedPrice = this.previousApprovedPrice(priorSnapshots);
      const evaluatorScore =
        this.finiteNumber(evaluation.score) ??
        this.finiteNumber((listing as { score?: unknown }).score);
      const failedSubmissionStatuses = new Set([
        'CLAIMED',
        'REQUEST_SENT',
        'REJECTED',
        'UNKNOWN',
        'RETRYABLE_FAILED',
        'RECONCILING',
      ]);
      const recentFailureCount = recentSubmissions.filter((submission) =>
        failedSubmissionStatuses.has(String(submission.status)),
      ).length;
      const duplicateSubmission = recentSubmissions.some(
        (submission) =>
          submission.productLaunchId === input.productLaunchId &&
          !['PREPARED', 'RETRYABLE_FAILED'].includes(String(submission.status)),
      );
      const severeWarning = this.severeCompilerWarning(compilation.warnings);
      const firstWarning = Array.isArray(compilation.warnings)
        ? compilation.warnings[0]
        : undefined;
      const warningCode = this.nonEmptyString(this.asRecord(firstWarning).code);

      const snapshot: ListingPublishSnapshotBody = {
        schemaVersion: LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION,
        target: 'OZON',
        organizationId: input.organizationId,
        productLaunchId: input.productLaunchId,
        listingDraftId: listing.id,
        reviewTaskId: reviewTask.id,
        productId: product.id,
        channelId: channel.id,
        listingApprovalHash: approvalHash,
        approvedBy: input.approvedBy,
        approvedAt: input.approvedAt.toISOString(),
        canonicalProduct,
        payload: compilation.payload,
        compilation: {
          status: compilation.status,
          target: compilation.target,
          schemaVersion: compilation.schemaVersion,
          errors: compilation.errors,
          warnings: compilation.warnings,
          provenance: compilation.provenance,
        },
        economics: {
          currency: canonicalProduct.commercial.currency,
          price,
          cost,
          shippingCost,
          platformFeeRate,
          withdrawalFeeRate,
          netProfit,
          marginRate,
          source: {
            cost: 'product.cost',
            shippingCost:
              'product.metadata.ozonPublication.shippingCost',
            platformFeeRate:
              'product.metadata.ozonPublication.platformFeeRate',
            withdrawalFeeRate:
              'product.metadata.ozonPublication.withdrawalFeeRate',
          },
        },
        safetyEvidence: {
          image: {
            source: 'image_prompt_projects.visual_qa',
            imageProjectId: imageProject?.id ?? null,
            qaOutcome,
            qaScore,
            consistencyScore,
            severeMismatch: severeImageMismatch,
            qaVersion: imageProject?.qaVersion ?? null,
            qaCompletedAt: imageProject?.qaCompletedAt?.toISOString() ?? null,
            referenceAssetSha256:
              this.nonEmptyString(imageSettings.referenceAssetSha256) ?? null,
          },
          content: {
            source: 'listing_drafts.evaluationResult',
            evaluatorOutcome: evaluation.outcome ?? null,
            evaluatorScore,
            approvalHashMatches: true,
            contentHash,
            listingApprovalHash: approvalHash,
          },
          pricing: {
            source: sourceEvidence.source,
            fetchedAt: sourceEvidence.fetchedAt,
            competitorEvidenceCount: sourceEvidence.count,
            previousApprovedPrice,
            minimumMarginRate: storeProfile?.minimumProfitMargin ?? null,
          },
          attributes: {
            source: 'marketplace_compiler',
            compilerStatus: compilation.status,
            requiredFieldsComplete:
              compilation.status === 'VALID' && compilation.errors.length === 0,
            errorCount: compilation.errors.length,
            warningCount: compilation.warnings.length,
            compilerSchemaVersion: compilation.schemaVersion,
          },
          channel: {
            source: 'channel_connections_and_external_submissions',
            channelId: channel.id,
            syncStatus: channel.syncStatus,
            recentSubmissionCount: recentSubmissions.length,
            recentFailureCount,
          },
          approval: {
            source: 'review_tasks.decisionEvidence',
            reviewTaskId: reviewTask.id,
            reviewStatus: reviewTask.status,
            decisionType: decision.type ?? null,
            evaluatorOutcome: decision.evaluatorOutcome ?? null,
            approvalHashMatches: true,
            approvedBy: input.approvedBy,
            approvedAt: input.approvedAt.toISOString(),
            capabilityScope: 'action:ozon.listing.publish',
            executionGrantRequired: true,
          },
          externalResponse: {
            source: 'local_pre_dispatch_ledger',
            phase: 'PRE_DISPATCH',
            duplicateSubmission,
            severeWarning,
            warningCode,
            trustScore: null,
          },
        },
      };
      const snapshotHash = this.sha256(snapshot);
      return tx.listingPublishSnapshot.create({
        data: {
          organizationId: input.organizationId,
          productLaunchId: input.productLaunchId,
          listingDraftId: listing.id,
          reviewTaskId: reviewTask.id,
          productId: product.id,
          channelId: channel.id,
          target: 'OZON',
          schemaVersion: LISTING_PUBLISH_SNAPSHOT_SCHEMA_VERSION,
          listingApprovalHash: approvalHash,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          snapshotHash,
          status: 'APPROVED',
          approvedBy: input.approvedBy,
          approvedAt: input.approvedAt,
        },
      });
    });
  }

  async loadApproved(input: {
    organizationId: string;
    snapshotId: string;
    expectedSnapshotHash: string;
  }) {
    const stored = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.listingPublishSnapshot.findFirst({
        where: {
          id: input.snapshotId,
          organizationId: input.organizationId,
        },
      }),
    );
    if (!stored) {
      throw this.snapshotError(
        'PUBLISH_SNAPSHOT_NOT_FOUND',
        'The approved publish snapshot was not found.',
      );
    }
    if (
      stored.snapshotHash !== input.expectedSnapshotHash ||
      stored.status !== 'APPROVED'
    ) {
      throw this.snapshotError(
        'PUBLISH_SNAPSHOT_NOT_APPROVED',
        'The publish snapshot is not the currently approved immutable snapshot.',
      );
    }
    const snapshot = this.verifyStored(stored.snapshot, stored.snapshotHash);
    return { ...stored, snapshot };
  }

  private verifyStored(value: unknown, expectedHash: string) {
    const actualHash = this.sha256(value);
    if (actualHash !== expectedHash) {
      throw this.snapshotError(
        'PUBLISH_SNAPSHOT_HASH_MISMATCH',
        'The immutable publish snapshot no longer matches its stored hash.',
      );
    }
    const parsed = supportedPublishSnapshotBodySchema.safeParse(value);
    if (!parsed.success) {
      throw this.snapshotError(
        'PUBLISH_SNAPSHOT_SCHEMA_INVALID',
        'The stored publish snapshot does not match the supported schema.',
        { issues: parsed.error.issues },
      );
    }
    return parsed.data as unknown as ListingPublishSnapshotBody;
  }

  private sha256(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private nonNegativeNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private positiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private finiteNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private competitorEvidence(metadata: unknown): {
    source: string;
    fetchedAt: string | null;
    count: number;
  } {
    const agentEvidence = this.asRecord(this.asRecord(metadata).agentEvidence);
    const sourceEvidence = this.asRecord(agentEvidence.sourceEvidence);
    const sourceFetchedAt = this.nonEmptyString(sourceEvidence.fetchedAt);
    const items = Array.isArray(sourceEvidence.items)
      ? sourceEvidence.items
      : [];
    const count = items.filter((raw) => {
      const item = this.asRecord(raw);
      const url = this.nonEmptyString(item.url);
      const price =
        this.finiteNumber(item.priceRub) ??
        this.finiteNumber(item.rubPrice) ??
        this.finiteNumber(item.price);
      const fetchedAt = this.nonEmptyString(item.fetchedAt) ?? sourceFetchedAt;
      return (
        url !== null &&
        /^https:\/\/(?:www\.)?ozon\.ru\//i.test(url) &&
        price !== null &&
        price > 0 &&
        fetchedAt !== null &&
        !Number.isNaN(Date.parse(fetchedAt))
      );
    }).length;
    return {
      source:
        this.nonEmptyString(sourceEvidence.source) ??
        'product.metadata.agentEvidence.sourceEvidence',
      fetchedAt:
        sourceFetchedAt !== null && !Number.isNaN(Date.parse(sourceFetchedAt))
          ? sourceFetchedAt
          : null,
      count,
    };
  }

  private previousApprovedPrice(
    snapshots: Array<{ snapshot: unknown }>,
  ): number | null {
    for (const stored of snapshots) {
      const body = this.asRecord(stored.snapshot);
      const economics = this.asRecord(body.economics);
      const payload = this.asRecord(body.payload);
      const price =
        this.finiteNumber(economics.price) ?? this.finiteNumber(payload.price);
      if (price !== null && price > 0) return price;
    }
    return null;
  }

  private severeCompilerWarning(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    return value.some((raw) => {
      const warning = this.asRecord(raw);
      const severity = this.nonEmptyString(warning.severity)?.toUpperCase();
      const code = this.nonEmptyString(warning.code)?.toUpperCase();
      return (
        ['BLOCKED', 'CRITICAL', 'ERROR', 'HIGH'].includes(severity ?? '') ||
        (code?.includes('SEVERE') ?? false)
      );
    });
  }

  private rate(value: unknown): number | null {
    const parsed = this.nonNegativeNumber(value);
    return parsed !== null && parsed <= 1 ? parsed : null;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundRate(value: number): number {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  }

  private snapshotError(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new BadRequestException({ code, message, ...(details ?? {}) });
  }
}
