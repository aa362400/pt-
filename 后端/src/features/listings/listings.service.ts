import {
  Inject,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { AGENT_PROVIDER } from '../../agents/agent.module.js';
import type { AgentProviderInterface } from '../../agents/agent-provider.interface.js';
import {
  GenerateListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';
import {
  LISTING_BUNDLE_SCHEMA_VERSION,
  ListingBundleService,
} from './listing-bundle.service.js';
import { ListingEvaluatorService } from './listing-evaluator.service.js';

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
  ) {}

  /** Generates listing copy via the agent provider and stores it as a draft. */
  async generate(user: JwtPayload, dto: GenerateListingDto) {
    return this.generateDraft(user, dto);
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
    return this.generateDraft(user, dto, productLaunchId);
  }

  async attachMediaForReview(
    user: JwtPayload,
    id: string,
    images: Array<{ url: string; sceneId?: string; filename?: string }>,
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
    const usableImages = images.filter((image) =>
      /^https:\/\//i.test(image.url.trim()),
    );
    if (usableImages.length === 0) {
      throw new UnprocessableEntityException({
        code: 'LISTING_MEDIA_REQUIRED',
        message: 'At least one HTTPS image is required for listing review.',
      });
    }
    bundle.mediaMapping = usableImages.map((image, index) => ({
      role: index === 0 ? 'primary' : 'gallery',
      assetUrl: image.url.trim(),
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
          status: 'IN_REVIEW',
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
      },
    });
    return updated;
  }

  private async generateDraft(
    user: JwtPayload,
    dto: GenerateListingDto,
    productLaunchId?: string,
  ) {
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

    const generationInput = {
      productName: dto.productName,
      description: dto.description,
      keywords: dto.keywords ?? [],
      platform: dto.platform,
      tone: dto.tone,
    };
    const result = await this.agentProvider.runListingGeneration(
      generationInput,
      {
        orgId,
        userId: user.sub,
        workspaceId: dto.workspaceId,
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

    const draft = await this.tenantDatabase.run(orgId, (tx) =>
      tx.listingDraft.create({
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
            result.price !== undefined ? { suggestedPrice: result.price } : {},
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
      }),
    );
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
}
