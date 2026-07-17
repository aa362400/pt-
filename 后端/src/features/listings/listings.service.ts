import {
  BadRequestException,
  ConflictException,
  Inject,
  Optional,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ListingDraft, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { AGENT_PROVIDER } from '../../agents/agent.module.js';
import type {
  AgentProviderInterface,
  ListingGenerationInput,
  ListingPricingEvidence,
} from '../../agents/agent-provider.interface.js';
import {
  GenerateListingDto,
  AttachListingRiskClearanceDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';
import {
  LISTING_BUNDLE_SCHEMA_VERSION,
  ListingBundleService,
} from './listing-bundle.service.js';
import { ListingEvaluatorService } from './listing-evaluator.service.js';
import { ListingRiskClearanceService } from './listing-risk-clearance.service.js';
import { CommerceMcpClientService } from '../../shared/commerce-mcp/commerce-mcp-client.service.js';
import { CommerceMcpTrustService } from '../../shared/commerce-mcp/commerce-mcp-trust.service.js';

const LISTING_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const LISTING_GENERATION_LEASE_MS = 20 * 60_000;
const LISTING_GENERATION_RETRY_WAIT_MS = 30_000;
const LISTING_GENERATION_POLL_INTERVAL_MS = 100;

interface ListingGenerationClaim {
  id: string;
  claimToken: string;
  requestHash: string;
  agentRequestId: string;
}

type ListingGenerationAcquisition =
  | { kind: 'CLAIMED'; claim: ListingGenerationClaim }
  | { kind: 'COMPLETED'; draft: ListingDraft };

@Injectable()
export class ListingsService {
  constructor(
    _prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly listingBundle: ListingBundleService,
    private readonly listingEvaluator: ListingEvaluatorService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    private readonly listingRisk?: ListingRiskClearanceService,
    @Optional()
    private readonly commerceMcp?: CommerceMcpClientService,
    @Optional()
    private readonly commerceMcpTrust?: CommerceMcpTrustService,
  ) {}

  /** Generates listing copy via the agent provider and stores it as a draft. */
  async generate(
    user: JwtPayload,
    dto: GenerateListingDto,
    idempotencyKey?: string,
  ): Promise<ListingDraft> {
    if (idempotencyKey === undefined) {
      return this.generateDraft(user, dto);
    }
    const normalizedKey = idempotencyKey.trim();
    if (!LISTING_IDEMPOTENCY_KEY_PATTERN.test(normalizedKey)) {
      throw new BadRequestException({
        code: 'LISTING_IDEMPOTENCY_KEY_INVALID',
        message:
          'Idempotency-Key must contain 16-128 letters, numbers, dots, underscores, colons, or hyphens.',
      });
    }
    return this.generateIdempotent(user, dto, normalizedKey);
  }

  private async generateIdempotent(
    user: JwtPayload,
    dto: GenerateListingDto,
    idempotencyKey: string,
  ): Promise<ListingDraft> {
    const organizationId = requireOrg(user);
    const idempotencyKeyHash =
      this.listingBundle.computeInputSha256(idempotencyKey);
    const requestHash = this.listingBundle.computeInputSha256({
      workspaceId: dto.workspaceId,
      productId: dto.productId ?? null,
      productName: dto.productName,
      description: dto.description ?? null,
      keywords: dto.keywords ?? [],
      platform: dto.platform,
      tone: dto.tone ?? null,
    });
    const agentRequestId = `listing-generation:${this.listingBundle.computeInputSha256(
      {
        userId: user.sub,
        idempotencyKeyHash,
      },
    )}`;
    const acquisition = await this.acquireGenerationRequest({
      organizationId,
      userId: user.sub,
      idempotencyKeyHash,
      requestHash,
      agentRequestId,
    });
    if (acquisition.kind === 'COMPLETED') {
      return acquisition.draft;
    }

    try {
      return await this.generateDraft(
        user,
        dto,
        undefined,
        undefined,
        acquisition.claim,
      );
    } catch (error) {
      await this.markGenerationRequestFailed(
        organizationId,
        acquisition.claim,
      ).catch(() => undefined);
      throw error;
    }
  }

  private async acquireGenerationRequest(input: {
    organizationId: string;
    userId: string;
    idempotencyKeyHash: string;
    requestHash: string;
    agentRequestId: string;
  }): Promise<ListingGenerationAcquisition> {
    const waitDeadline = Date.now() + LISTING_GENERATION_RETRY_WAIT_MS;
    const initialClaimToken = randomUUID();
    let row = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.listingGenerationRequest.upsert({
        where: {
          organizationId_userId_idempotencyKeyHash: {
            organizationId: input.organizationId,
            userId: input.userId,
            idempotencyKeyHash: input.idempotencyKeyHash,
          },
        },
        create: {
          organizationId: input.organizationId,
          userId: input.userId,
          idempotencyKeyHash: input.idempotencyKeyHash,
          requestHash: input.requestHash,
          status: 'IN_PROGRESS',
          claimToken: initialClaimToken,
          leaseExpiresAt: new Date(Date.now() + LISTING_GENERATION_LEASE_MS),
        },
        update: {},
      }),
    );

    while (true) {
      if (row.requestHash !== input.requestHash) {
        throw new ConflictException({
          code: 'LISTING_IDEMPOTENCY_CONFLICT',
          message:
            'The Idempotency-Key was already used for a different listing generation request.',
        });
      }
      if (row.status === 'COMPLETED') {
        return {
          kind: 'COMPLETED',
          draft: await this.findIdempotentGenerationResult(
            input.organizationId,
            row.listingDraftId,
          ),
        };
      }
      if (
        row.status === 'IN_PROGRESS' &&
        row.claimToken === initialClaimToken
      ) {
        return {
          kind: 'CLAIMED',
          claim: {
            id: row.id,
            claimToken: row.claimToken,
            requestHash: input.requestHash,
            agentRequestId: input.agentRequestId,
          },
        };
      }

      const now = new Date();
      const canReclaim =
        row.status === 'FAILED' ||
        (row.status === 'IN_PROGRESS' && row.leaseExpiresAt <= now);
      if (canReclaim) {
        const replacementClaimToken = randomUUID();
        const reclaimed = await this.tenantDatabase.run(
          input.organizationId,
          (tx) =>
            tx.listingGenerationRequest.updateMany({
              where: {
                id: row.id,
                organizationId: input.organizationId,
                requestHash: input.requestHash,
                status: row.status,
                claimToken: row.claimToken,
                ...(row.status === 'IN_PROGRESS'
                  ? { leaseExpiresAt: { lte: now } }
                  : {}),
              },
              data: {
                status: 'IN_PROGRESS',
                claimToken: replacementClaimToken,
                attempt: { increment: 1 },
                leaseExpiresAt: new Date(
                  Date.now() + LISTING_GENERATION_LEASE_MS,
                ),
                listingDraftId: null,
                failureCode: null,
              },
            }),
        );
        if (reclaimed.count === 1) {
          return {
            kind: 'CLAIMED',
            claim: {
              id: row.id,
              claimToken: replacementClaimToken,
              requestHash: input.requestHash,
              agentRequestId: input.agentRequestId,
            },
          };
        }
      } else if (row.status !== 'IN_PROGRESS') {
        throw new ConflictException({
          code: 'LISTING_IDEMPOTENCY_STATE_INVALID',
          message: 'The listing generation request is in an invalid state.',
        });
      }

      const remainingMs = waitDeadline - Date.now();
      if (remainingMs <= 0) {
        throw new ConflictException({
          code: 'LISTING_GENERATION_IN_PROGRESS',
          message:
            'The same listing generation request is still running. Retry with the same Idempotency-Key.',
        });
      }
      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.min(LISTING_GENERATION_POLL_INTERVAL_MS, remainingMs),
        ),
      );
      const refreshed = await this.tenantDatabase.run(
        input.organizationId,
        (tx) =>
          tx.listingGenerationRequest.findUnique({
            where: {
              organizationId_userId_idempotencyKeyHash: {
                organizationId: input.organizationId,
                userId: input.userId,
                idempotencyKeyHash: input.idempotencyKeyHash,
              },
            },
          }),
      );
      if (!refreshed) {
        throw new ConflictException({
          code: 'LISTING_IDEMPOTENCY_RECORD_MISSING',
          message: 'The listing generation retry record is unavailable.',
        });
      }
      row = refreshed;
    }
  }

  private async findIdempotentGenerationResult(
    organizationId: string,
    listingDraftId: string | null,
  ): Promise<ListingDraft> {
    if (!listingDraftId) {
      throw new ConflictException({
        code: 'LISTING_IDEMPOTENCY_RESULT_UNAVAILABLE',
        message: 'The original listing draft is no longer available.',
      });
    }
    const draft = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingDraft.findFirst({
        where: { id: listingDraftId, organizationId },
      }),
    );
    if (!draft) {
      throw new ConflictException({
        code: 'LISTING_IDEMPOTENCY_RESULT_UNAVAILABLE',
        message: 'The original listing draft is no longer available.',
      });
    }
    return draft;
  }

  private async markGenerationRequestFailed(
    organizationId: string,
    claim: ListingGenerationClaim,
  ): Promise<void> {
    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingGenerationRequest.updateMany({
        where: {
          id: claim.id,
          organizationId,
          requestHash: claim.requestHash,
          status: 'IN_PROGRESS',
          claimToken: claim.claimToken,
        },
        data: {
          status: 'FAILED',
          failureCode: 'GENERATION_FAILED',
          leaseExpiresAt: new Date(),
        },
      }),
    );
  }

  async generateForProductLaunch(
    user: JwtPayload,
    dto: GenerateListingDto,
    productLaunchId: string,
  ) {
    const orgId = requireOrg(user);
    const existing = await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.findFirst({
        where: { productLaunchId, organizationId: orgId },
      }),
    );
    if (existing) {
      return existing;
    }
    const pricingEvidence = await this.tenantDatabase.run(orgId, async (tx) => {
      const launch = await tx.productLaunch.findFirst({
        where: { id: productLaunchId, organizationId: orgId },
        select: {
          economicsEvaluationId: true,
          economicsEvaluationHash: true,
          economicsEvaluation: {
            select: {
              id: true,
              contentHash: true,
              inputSetHash: true,
              status: true,
              decision: true,
              salePrice: true,
              currency: true,
              validFrom: true,
              validUntil: true,
              calculatorVersion: true,
              hardGateReasons: true,
            },
          },
        },
      });
      if (!launch) throw new NotFoundException('Product launch not found');
      if (
        !launch.economicsEvaluationId &&
        !launch.economicsEvaluationHash &&
        !launch.economicsEvaluation
      ) {
        return undefined;
      }
      const evaluation = launch.economicsEvaluation;
      if (
        !evaluation ||
        evaluation.id !== launch.economicsEvaluationId ||
        evaluation.contentHash !== launch.economicsEvaluationHash ||
        evaluation.status !== 'VERIFIED' ||
        evaluation.decision !== 'PASS' ||
        evaluation.hardGateReasons.length > 0 ||
        evaluation.salePrice === null ||
        Number(evaluation.salePrice) <= 0 ||
        evaluation.validFrom.getTime() > Date.now() ||
        evaluation.validUntil.getTime() <= Date.now()
      ) {
        throw new UnprocessableEntityException({
          code: 'LISTING_PRICING_EVIDENCE_INVALID',
          message:
            'The product launch economics proof is incomplete, stale, or not VERIFIED/PASS.',
        });
      }
      return {
        id: evaluation.id,
        status: 'VERIFIED',
        decision: 'PASS',
        salePrice: evaluation.salePrice.toString(),
        currency: evaluation.currency as 'RUB' | 'USD',
        validFrom: evaluation.validFrom.toISOString(),
        validUntil: evaluation.validUntil.toISOString(),
        calculatorVersion: evaluation.calculatorVersion,
        inputSetHash: evaluation.inputSetHash,
        contentHash: evaluation.contentHash,
      } satisfies ListingPricingEvidence;
    });
    return this.generateDraft(user, dto, productLaunchId, pricingEvidence);
  }

  async attachMediaForReview(
    user: JwtPayload,
    id: string,
    images: Array<{
      url: string;
      sha256?: string;
      sceneId?: string;
      filename?: string;
    }>,
    mode: 'PUBLISH_REVIEW' | 'CREATIVE_DRAFT' = 'PUBLISH_REVIEW',
  ) {
    const orgId = requireOrg(user);
    const draft = await this.findOwned(orgId, id);
    if (draft.status === 'APPROVED' || draft.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Approved or published listing media cannot be changed in place.',
      );
    }
    const bundle = this.listingBundle.parseStoredBundle(draft.bundle);
    if (!bundle || !draft.contentHash) {
      throw new UnprocessableEntityException({
        code: 'LISTING_BUNDLE_INVALID',
        message: 'Listing has no valid bundle or content hash.',
      });
    }
    const computedHash = this.listingBundle.computeOutputSha256(bundle);
    if (
      computedHash !== draft.contentHash ||
      computedHash !== bundle.provenance.outputSha256
    ) {
      throw new UnprocessableEntityException({
        code: 'LISTING_PROVENANCE_INVALID',
        message: 'Listing content does not match its provenance hash.',
      });
    }
    if (
      images.some(
        (image) =>
          !this.isAllowedListingImageUrl(image.url.trim(), mode) ||
          !/^[a-f0-9]{64}$/.test(image.sha256?.trim().toLowerCase() ?? ''),
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'LISTING_IMAGE_HASH_REQUIRED',
        message:
          mode === 'CREATIVE_DRAFT'
            ? 'Every creative draft image must use HTTPS or the controlled same-origin Agent route and include its verified SHA-256 digest.'
            : 'Every listing image must use HTTPS and include its verified SHA-256 digest.',
      });
    }
    const usableImages = images;
    if (usableImages.length === 0) {
      throw new UnprocessableEntityException({
        code: 'LISTING_MEDIA_REQUIRED',
        message: 'At least one HTTPS image is required for listing review.',
      });
    }
    bundle.mediaMapping = usableImages.map((image, index) => ({
      role: index === 0 ? 'primary' : 'gallery',
      assetUrl: image.url.trim(),
      assetSha256: image.sha256!.trim().toLowerCase(),
      ...(image.sceneId ? { sceneId: image.sceneId } : {}),
      ...(image.filename ? { filename: image.filename } : {}),
    }));
    const evaluation = this.listingEvaluator.evaluate(bundle);
    if (evaluation.outcome === 'BLOCKED') {
      throw new UnprocessableEntityException({
        code: 'LISTING_EVALUATION_BLOCKED',
        message: 'Listing failed evaluation after media mapping.',
        evaluation,
      });
    }
    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.update({
        where: { id: draft.id },
        data: {
          bundle: bundle as unknown as Prisma.InputJsonValue,
          evaluationResult: evaluation as unknown as Prisma.InputJsonValue,
          approvalHash: this.listingBundle.computeApprovalSha256(bundle),
          score: evaluation.score,
          status: mode === 'CREATIVE_DRAFT' ? 'DRAFT' : 'IN_REVIEW',
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.media.attach',
      resourceType: 'Listing',
      resourceId: draft.id,
      before: { status: draft.status },
      after: {
        status: updated.status,
        imageCount: usableImages.length,
        evaluationOutcome: evaluation.outcome,
        mode,
      },
    });
    return updated;
  }

  private isAllowedListingImageUrl(
    url: string,
    mode: 'PUBLISH_REVIEW' | 'CREATIVE_DRAFT',
  ): boolean {
    if (/^https:\/\//i.test(url)) return true;
    return (
      mode === 'CREATIVE_DRAFT' &&
      /^\/agent\/api\/image\/[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(
        url,
      ) &&
      !url.includes('..') &&
      !url.includes('\\')
    );
  }

  async attachRiskClearance(
    user: JwtPayload,
    id: string,
    dto: AttachListingRiskClearanceDto,
  ) {
    if (!this.listingRisk || !this.commerceMcp || !this.commerceMcpTrust) {
      throw new UnprocessableEntityException({
        code: 'LISTING_RISK_VERIFIER_UNAVAILABLE',
        message: 'The trusted listing risk verifier is not configured.',
      });
    }
    const organizationId = requireOrg(user);
    const draft = await this.findOwned(organizationId, id);
    if (draft.status === 'APPROVED' || draft.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Approved or published listing risk evidence cannot be changed in place.',
      );
    }
    const bundle = this.listingBundle.parseStoredBundle(draft.bundle);
    if (!bundle || !draft.contentHash) {
      throw new UnprocessableEntityException({
        code: 'LISTING_BUNDLE_INVALID',
        message: 'Listing has no valid immutable bundle.',
      });
    }
    const computedHash = this.listingBundle.computeOutputSha256(bundle);
    if (
      computedHash !== draft.contentHash ||
      computedHash !== bundle.provenance.outputSha256
    ) {
      throw new UnprocessableEntityException({
        code: 'LISTING_PROVENANCE_INVALID',
        message: 'Listing content does not match its provenance hash.',
      });
    }
    const subject = this.listingRisk.subject({
      organizationId,
      listingDraftId: draft.id,
      bundle,
    });
    const trust = await this.commerceMcpTrust.assertTrusted();
    const clearanceEnvelope = this.asRecord(dto.clearanceEvidence);
    const clearanceEvidence = this.asRecord(
      clearanceEnvelope.clearanceEvidence ?? clearanceEnvelope,
    );
    const attestation = this.asRecord(clearanceEvidence.attestation);
    const screeningResult = await this.commerceMcp.callTool('check_risk', {
      ...subject.subject,
      clearanceEvidence: attestation,
    });
    const checkedAt = new Date();
    const finalRiskClearance = this.listingRisk.build({
      organizationId,
      listingDraftId: draft.id,
      bundle,
      clearanceEvidence,
      screeningResult,
      mcpManifestHash: trust.manifest.manifestHash,
      mcpExecutableHash: trust.manifest.executableHash,
      at: checkedAt,
    });
    const evaluationResult = {
      ...this.asRecord(draft.evaluationResult),
      finalRiskClearance,
    };
    const updated = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingDraft.update({
        where: { id: draft.id },
        data: {
          evaluationResult:
            evaluationResult as unknown as Prisma.InputJsonValue,
        },
      }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'listing.risk-clearance.attach',
      resourceType: 'Listing',
      resourceId: draft.id,
      after: {
        subjectHash: finalRiskClearance.subjectHash,
        evidenceHash: finalRiskClearance.evidenceHash,
        provider: finalRiskClearance.provider,
        ruleset: finalRiskClearance.ruleset,
        expiresAt: finalRiskClearance.expiresAt,
        mcpManifestHash: finalRiskClearance.screening.mcpManifestHash,
        mcpExecutableHash: finalRiskClearance.screening.mcpExecutableHash,
      },
    });
    return {
      listing: updated,
      riskClearance: finalRiskClearance,
      externalStoreMutation: 'not_executed',
    };
  }

  private async generateDraft(
    user: JwtPayload,
    dto: GenerateListingDto,
    productLaunchId?: string,
    pricingEvidence?: ListingPricingEvidence,
    generationClaim?: ListingGenerationClaim,
  ): Promise<ListingDraft> {
    const orgId = requireOrg(user);
    await this.tenantDatabase.run(orgId, async (tx) => {
      const workspace = await tx.workspace.findFirst({
        where: { id: dto.workspaceId, organizationId: orgId },
        select: { id: true },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, workspace: { organizationId: orgId } },
          select: { id: true },
        });
        if (!product) throw new NotFoundException('Product not found');
      }
    });

    const generationInput: ListingGenerationInput = {
      productName: dto.productName,
      description: dto.description,
      keywords: dto.keywords ?? [],
      platform: dto.platform,
      tone: dto.tone,
      ...(pricingEvidence ? { pricingEvidence } : {}),
    };
    const result = await this.agentProvider.runListingGeneration(
      generationInput,
      {
        orgId,
        userId: user.sub,
        workspaceId: dto.workspaceId,
        ...(generationClaim
          ? { requestId: generationClaim.agentRequestId }
          : {}),
      },
    );
    const built = this.listingBundle.build({
      request: generationInput,
      agentResult: result,
      ...(dto.productId ? { productId: dto.productId } : {}),
    });
    if (built.status === 'INVALID') {
      throw new UnprocessableEntityException({
        code: 'LISTING_BUNDLE_INVALID',
        message: 'Agent listing output failed the Listing Bundle contract.',
        validation: built.validation,
      });
    }
    const { bundle, validation } = built;
    const evaluation = this.listingEvaluator.evaluate(bundle);
    if (evaluation.outcome === 'BLOCKED') {
      throw new UnprocessableEntityException({
        code: 'LISTING_EVALUATION_BLOCKED',
        message: 'Listing failed the independent quality evaluation.',
        evaluation,
      });
    }

    const draft = await this.tenantDatabase.run(orgId, async (tx) => {
      const created = await tx.listingDraft.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          productId: dto.productId,
          ...(productLaunchId ? { productLaunchId } : {}),
          platform: dto.platform,
          title: bundle.content.title,
          bullets: bundle.content.bullets,
          description: bundle.content.description,
          seoTags: bundle.seo.keywords,
          attributes:
            typeof result.price === 'number' &&
            result.pricingStatus === 'EVIDENCE_BACKED' &&
            result.pricingEvidence
              ? {
                  suggestedPrice: result.price,
                  priceCurrency: result.priceCurrency,
                  pricingStatus: result.pricingStatus,
                  economicsEvaluationId: result.pricingEvidence.id,
                }
              : {
                  pricingStatus: 'DATA_INSUFFICIENT',
                  pricingMissingFields: result.pricingMissingFields,
                },
          schemaVersion: LISTING_BUNDLE_SCHEMA_VERSION,
          bundle: bundle as unknown as Prisma.InputJsonValue,
          validationResult: validation as unknown as Prisma.InputJsonValue,
          evaluationResult: evaluation as unknown as Prisma.InputJsonValue,
          provenance: bundle.provenance,
          contentHash: bundle.provenance.outputSha256,
          approvalHash: this.listingBundle.computeApprovalSha256(bundle),
          score: evaluation.score,
          createdBy: user.sub,
        },
      });
      if (generationClaim) {
        const completed = await tx.listingGenerationRequest.updateMany({
          where: {
            id: generationClaim.id,
            organizationId: orgId,
            requestHash: generationClaim.requestHash,
            status: 'IN_PROGRESS',
            claimToken: generationClaim.claimToken,
          },
          data: {
            status: 'COMPLETED',
            listingDraftId: created.id,
            failureCode: null,
          },
        });
        if (completed.count !== 1) {
          throw new ConflictException({
            code: 'LISTING_GENERATION_CLAIM_LOST',
            message:
              'The listing generation claim expired before its result could be stored.',
          });
        }
      }
      return created;
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.create',
      resourceType: 'Listing',
      resourceId: draft.id,
      after: {
        title: draft.title,
        platform: draft.platform,
        schemaVersion: draft.schemaVersion,
        validationStatus: validation.status,
        evaluationOutcome: evaluation.outcome,
        evaluationScore: evaluation.score,
      },
    });
    return draft;
  }

  async findAll(user: JwtPayload, query: ListListingsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ListingDraftWhereInput = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.listingDraft.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            product: { select: { id: true, title: true } },
            creator: { select: { id: true, name: true } },
          },
        }),
        tx.listingDraft.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const draft = await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!draft) {
      throw new NotFoundException('Listing draft not found');
    }
    return draft;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateListingDto) {
    const orgId = requireOrg(user);
    const draft = await this.findOwned(orgId, id);
    if (draft.status === 'APPROVED' || draft.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Approved or published listings are immutable; create a new revision for review.',
      );
    }
    if (dto.status === 'APPROVED' || dto.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Approved and published states can only be set by their controlled workflows.',
      );
    }
    const contentChanged =
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.bullets !== undefined ||
      dto.seoTags !== undefined;
    const revision = contentChanged
      ? this.listingBundle.revise({
          draft,
          patch: {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description }
              : {}),
            ...(dto.bullets !== undefined ? { bullets: dto.bullets } : {}),
            ...(dto.seoTags !== undefined ? { seoTags: dto.seoTags } : {}),
          },
          actorId: user.sub,
        })
      : null;
    if (revision?.status === 'INVALID') {
      throw new UnprocessableEntityException({
        code: 'LISTING_BUNDLE_INVALID',
        message: 'Listing edit failed the Listing Bundle contract.',
        validation: revision.validation,
      });
    }
    const evaluation =
      revision?.status === 'VALID'
        ? this.listingEvaluator.evaluate(revision.bundle)
        : null;
    if (evaluation?.outcome === 'BLOCKED') {
      throw new UnprocessableEntityException({
        code: 'LISTING_EVALUATION_BLOCKED',
        message: 'Listing edit failed the independent quality evaluation.',
        evaluation,
      });
    }
    const before = { title: draft.title, status: draft.status };
    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.update({
        where: { id: draft.id },
        data: {
          title: dto.title,
          bullets: dto.bullets,
          description: dto.description,
          seoTags: dto.seoTags,
          status: dto.status,
          ...(revision?.status === 'VALID'
            ? {
                bundle: revision.bundle as unknown as Prisma.InputJsonValue,
                validationResult:
                  revision.validation as unknown as Prisma.InputJsonValue,
                evaluationResult:
                  evaluation as unknown as Prisma.InputJsonValue,
                provenance: revision.bundle.provenance,
                contentHash: revision.bundle.provenance.outputSha256,
                approvalHash: this.listingBundle.computeApprovalSha256(
                  revision.bundle,
                ),
                score: evaluation?.score,
              }
            : {}),
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.update',
      resourceType: 'Listing',
      resourceId: draft.id,
      before,
      after: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const draft = await this.findOwned(orgId, id);
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.delete({ where: { id: draft.id } }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.delete',
      resourceType: 'Listing',
      resourceId: draft.id,
      before: { title: draft.title },
    });
    return { id: draft.id };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
