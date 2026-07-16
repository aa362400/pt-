import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  CreateBusinessOutcomeDto,
  CreateMarketObservationDto,
  ListMarketObservationsQueryDto,
  MarketObservationItemDto,
  RecordOpportunityDecisionDto,
} from './market-observations.dto.js';
import { OpportunityScoringService } from './opportunity-scoring.service.js';

const MAX_CAPTURE_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'auth',
  'authorization',
  'session',
  'sid',
  'cookie',
]);

@Injectable()
export class MarketObservationsService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly scoring: OpportunityScoringService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtPayload, dto: CreateMarketObservationDto) {
    const orgId = requireOrg(user);
    if (dto.items.length === 0) {
      throw new BadRequestException(
        'No visible Ozon product evidence was provided',
      );
    }
    const capturedAt = new Date(dto.capturedAt);
    const age = Date.now() - capturedAt.getTime();
    if (age > MAX_CAPTURE_AGE_MS || age < -MAX_FUTURE_SKEW_MS) {
      throw new BadRequestException(
        'Capture timestamp is outside the accepted window',
      );
    }
    const pageUrl = this.ozonUrl(dto.pageUrl);
    if (dto.workspaceId) {
      const workspace = await this.tenantDatabase.run(orgId, (tx) =>
        tx.workspace.findFirst({
          where: { id: dto.workspaceId, organizationId: orgId },
          select: { id: true },
        }),
      );
      if (!workspace) throw new NotFoundException('Workspace not found');
    }
    const items = dto.items.map((item, index) =>
      this.sanitizeItem(item, index),
    );
    const confidence = this.batchConfidence(items, dto.confidence);
    const pageFingerprint = this.hash({
      source: dto.source,
      pageType: dto.pageType,
      pageUrl,
      query: this.text(dto.query, 500),
      category: this.text(dto.category, 300),
      items: items.map((item) => ({
        url: item.url,
        title: item.title,
        price: item.currentPrice,
      })),
    });
    const pageEvidence = {
      collectedBy: 'user_visible_browser_extension',
      rawHtmlStored: false,
      cookieStored: false,
      localStorageStored: false,
      itemCount: items.length,
      warnings: this.stringArray(dto.pageEvidence?.warnings, 20, 300),
    };

    try {
      const batch = await this.tenantDatabase.run(orgId, (tx) =>
        tx.marketObservationBatch.create({
          data: {
            organizationId: orgId,
            userId: user.sub,
            workspaceId: dto.workspaceId,
            source: dto.source,
            pageType: dto.pageType,
            pageUrl,
            query: this.text(dto.query, 500),
            category: this.text(dto.category, 300),
            capturedAt,
            locale: this.text(dto.locale, 40),
            pageTitle: this.text(dto.pageTitle, 500),
            pageFingerprint,
            parserVersion: dto.parserVersion,
            extensionVersion: this.text(dto.extensionVersion, 40),
            rawEvidence: pageEvidence,
            confidence,
            requiresReview: confidence < 0.65,
            items: {
              create: items.map((item) => ({
                organizationId: orgId,
                ...item,
                rawEvidence: {
                  source: 'visible_page',
                  capturedAt: capturedAt.toISOString(),
                  parserVersion: dto.parserVersion,
                },
                evidenceHash: this.hash({
                  item,
                  capturedAt: capturedAt.toISOString(),
                  parserVersion: dto.parserVersion,
                }),
              })),
            },
          },
          include: { items: { orderBy: { position: 'asc' } } },
        }),
      );
      await this.audit.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'market-observation.collected',
        resourceType: 'MarketObservationBatch',
        resourceId: batch.id,
        after: {
          source: batch.source,
          pageType: batch.pageType,
          pageUrl: batch.pageUrl,
          itemCount: batch.items.length,
          confidence: batch.confidence,
          requiresReview: batch.requiresReview,
        },
      });
      return batch;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.tenantDatabase.run(orgId, (tx) =>
          tx.marketObservationBatch.findFirst({
            where: { organizationId: orgId, pageFingerprint, capturedAt },
            include: { items: { orderBy: { position: 'asc' } } },
          }),
        );
        if (existing) return { ...existing, deduplicated: true };
      }
      throw error;
    }
  }

  async list(user: JwtPayload, query: ListMarketObservationsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.marketObservationBatch.findMany({
          where: { organizationId: orgId },
          orderBy: { capturedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { _count: { select: { items: true } } },
        }),
        tx.marketObservationBatch.count({ where: { organizationId: orgId } }),
      ]),
    );
    return { items, total, page, limit };
  }

  async get(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const batch = await this.tenantDatabase.run(orgId, (tx) =>
      tx.marketObservationBatch.findFirst({
        where: { id, organizationId: orgId },
        include: { items: { orderBy: { position: 'asc' } } },
      }),
    );
    if (!batch) throw new NotFoundException('Market observation not found');
    return batch;
  }

  async scoreBatch(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const batch = await this.get(user, id);
    if (batch.requiresReview || batch.confidence < 0.65) {
      throw new ConflictException(
        'Observation confidence is below 0.65; human evidence review is required before scoring',
      );
    }
    const opportunities = [];
    for (const item of batch.items) {
      const result = this.scoring.score({
        ...item,
        evidenceConfidence: batch.confidence,
      });
      const saved = await this.tenantDatabase.run(orgId, async (tx) => {
        const existing = await tx.productOpportunity.findFirst({
          where: {
            organizationId: orgId,
            observationItemId: item.id,
            scoringVersion: this.scoring.version,
          },
        });
        const data = {
          organizationId: orgId,
          workspaceId: batch.workspaceId,
          observationItemId: item.id,
          title: item.title,
          externalId: item.externalId,
          sourceUrl: item.url,
          score: result.score,
          decision: result.decision,
          dimensions: result.dimensions,
          reasons: result.reasons,
          risks: result.risks,
          missingEvidence: result.missingEvidence,
          sources: [
            {
              batchId: batch.id,
              observationItemId: item.id,
              url: item.url,
              imageUrl: item.imageUrl,
              capturedAt: batch.capturedAt.toISOString(),
              evidenceHash: item.evidenceHash,
            },
          ],
          scoringVersion: this.scoring.version,
          evidenceConfidence: batch.confidence,
          createdBy: user.sub,
        } satisfies Prisma.ProductOpportunityUncheckedCreateInput;
        return existing
          ? tx.productOpportunity.update({
              where: { id: existing.id },
              data: {
                score: data.score,
                decision: data.decision,
                dimensions: data.dimensions,
                reasons: data.reasons,
                risks: data.risks,
                missingEvidence: data.missingEvidence,
                sources: data.sources,
                evidenceConfidence: data.evidenceConfidence,
              },
            })
          : tx.productOpportunity.create({ data });
      });
      opportunities.push(saved);
    }
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'market-observation.scored',
      resourceType: 'MarketObservationBatch',
      resourceId: batch.id,
      after: {
        scoringVersion: this.scoring.version,
        opportunityCount: opportunities.length,
      },
    });
    return {
      batchId: batch.id,
      scoringVersion: this.scoring.version,
      items: opportunities,
    };
  }

  async listOpportunities(
    user: JwtPayload,
    query: ListMarketObservationsQueryDto,
  ) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.productOpportunity.findMany({
          where: { organizationId: orgId },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.productOpportunity.count({ where: { organizationId: orgId } }),
      ]),
    );
    return { items, total, page, limit };
  }

  async decideOpportunity(
    user: JwtPayload,
    id: string,
    dto: RecordOpportunityDecisionDto,
  ) {
    const orgId = requireOrg(user);
    const existing = await this.tenantDatabase.run(orgId, (tx) =>
      tx.productOpportunity.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!existing) throw new NotFoundException('Opportunity not found');
    const opportunity = await this.tenantDatabase.run(orgId, (tx) =>
      tx.productOpportunity.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          decision: dto.reason
            ? `${dto.status}: ${this.text(dto.reason, 2_000)}`
            : dto.status,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-opportunity.human-decision',
      resourceType: 'ProductOpportunity',
      resourceId: opportunity.id,
      before: { status: existing.status, decision: existing.decision },
      after: { status: opportunity.status, decision: opportunity.decision },
    });
    return opportunity;
  }

  async recordOutcome(
    user: JwtPayload,
    opportunityId: string,
    dto: CreateBusinessOutcomeDto,
  ) {
    const orgId = requireOrg(user);
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException('periodEnd must be later than periodStart');
    }
    const opportunity = await this.tenantDatabase.run(orgId, (tx) =>
      tx.productOpportunity.findFirst({
        where: { id: opportunityId, organizationId: orgId },
      }),
    );
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    if (
      dto.source === 'OZON_READBACK' &&
      Object.keys(dto.evidence).length === 0
    ) {
      throw new BadRequestException('Ozon readback outcome requires evidence');
    }
    const outcome = await this.tenantDatabase.run(orgId, (tx) =>
      tx.businessOutcome.create({
        data: {
          organizationId: orgId,
          workspaceId: opportunity.workspaceId,
          opportunityId,
          productId: dto.productId,
          listingDraftId: dto.listingDraftId,
          publishSnapshotId: dto.publishSnapshotId,
          source: dto.source,
          periodStart,
          periodEnd,
          metrics: dto.metrics as Prisma.InputJsonValue,
          evidence: dto.evidence as Prisma.InputJsonValue,
          confidence: dto.confidence,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'business-outcome.recorded',
      resourceType: 'BusinessOutcome',
      resourceId: outcome.id,
      after: {
        opportunityId,
        source: outcome.source,
        confidence: outcome.confidence,
      },
    });
    return outcome;
  }

  private sanitizeItem(item: MarketObservationItemDto, index: number) {
    const title = this.text(item.title, 500);
    if (!title)
      throw new BadRequestException(
        `Item ${index + 1} title is empty after sanitization`,
      );
    return {
      externalId: this.text(item.externalId, 160),
      offerId: this.text(item.offerId, 160),
      title,
      url: this.ozonUrl(item.url),
      imageUrl: item.imageUrl ? this.safeHttpsUrl(item.imageUrl) : undefined,
      brand: this.text(item.brand, 160),
      category: this.text(item.category, 240),
      sellerName: this.text(item.sellerName, 240),
      currentPrice: item.currentPrice,
      originalPrice: item.originalPrice,
      currency: this.text(item.currency, 8)?.toUpperCase(),
      rating: item.rating,
      reviewCount: item.reviewCount,
      displayedSalesText: this.text(item.displayedSalesText, 160),
      position: item.position ?? index + 1,
      badges: this.stringArray(item.badges, 20, 80),
      deliveryText: this.text(item.deliveryText, 300),
      promotionText: this.text(item.promotionText, 300),
      sponsored: item.sponsored,
    };
  }

  private batchConfidence(
    items: Array<ReturnType<MarketObservationsService['sanitizeItem']>>,
    client?: number,
  ) {
    const values = items.map((item) => {
      let score = 0.45;
      if (item.currentPrice !== undefined) score += 0.15;
      if (item.imageUrl) score += 0.08;
      if (item.rating !== undefined) score += 0.08;
      if (item.externalId || item.offerId) score += 0.08;
      if (item.reviewCount !== undefined) score += 0.06;
      if (item.position !== undefined) score += 0.05;
      if (item.currency) score += 0.05;
      return Math.min(1, score);
    });
    const server =
      values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.round(Math.min(server, client ?? server) * 10_000) / 10_000;
  }

  private ozonUrl(value: string): string {
    const url = this.url(value);
    const host = url.hostname.toLowerCase();
    if (host !== 'ozon.ru' && !host.endsWith('.ozon.ru')) {
      throw new BadRequestException(
        'Only public ozon.ru page URLs are accepted',
      );
    }
    return this.cleanUrl(url);
  }

  private safeHttpsUrl(value: string): string {
    return this.cleanUrl(this.url(value));
  }

  private url(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Evidence URL is invalid');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BadRequestException(
        'Evidence URL must use HTTPS without credentials',
      );
    }
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      throw new BadRequestException('Private network URLs are not accepted');
    }
    return url;
  }

  private cleanUrl(url: URL): string {
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()))
        url.searchParams.delete(key);
    }
    return url.toString();
  }

  private text(value: unknown, max: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, max) : undefined;
  }

  private stringArray(
    value: unknown,
    maxItems: number,
    maxLength: number,
  ): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, maxItems)
      .map((item) => this.text(item, maxLength))
      .filter((item): item is string => Boolean(item));
  }

  private hash(value: unknown): string {
    return createHash('sha256')
      .update(this.canonical(value), 'utf8')
      .digest('hex');
  }

  private canonical(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((v) => this.canonical(v)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonical(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value ?? null);
  }
}
