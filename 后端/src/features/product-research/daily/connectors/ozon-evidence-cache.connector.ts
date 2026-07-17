import { Injectable } from '@nestjs/common';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import type { ExternalCandidate } from '../contracts/external-candidate.contract.js';
import type {
  ConnectorCollectInput,
  ConnectorCollectResult,
  ProductResearchConnector,
} from './product-research-connector.js';

@Injectable()
export class OzonEvidenceCacheConnector implements ProductResearchConnector {
  readonly source = 'ozon_verified_evidence_cache';

  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async collect(input: ConnectorCollectInput): Promise<ConnectorCollectResult> {
    const requestedAt = new Date();
    const since = new Date(requestedAt.getTime() - 7 * 24 * 60 * 60_000);
    const reports = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.productResearchReport.findMany({
        where: {
          organizationId: input.organizationId,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          platform: { equals: 'OZON', mode: 'insensitive' },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          query: true,
          summary: true,
          opportunities: true,
          createdAt: true,
        },
      }),
    );

    const candidates: ExternalCandidate[] = [];
    for (const report of reports) {
      const opportunities = this.record(report.opportunities);
      const evidence = this.record(opportunities.sourceEvidence);
      const evidenceItems = Array.isArray(evidence.items) ? evidence.items : [];
      if (
        !this.isReusableEvidence(
          report.query,
          report.summary,
          opportunities,
          evidence,
        )
      )
        continue;
      const fetchedAt =
        this.iso(evidence.fetchedAt) ?? report.createdAt.toISOString();
      for (const rawItem of evidenceItems) {
        if (candidates.length >= input.candidateLimit) break;
        const item = this.record(rawItem);
        const title = this.text(item.title);
        const url = this.httpUrl(item.url);
        if (!title || !url) continue;
        const itemFetchedAt = this.iso(item.fetchedAt) ?? fetchedAt;
        const priceRub = this.positiveNumber(item.priceRub);
        candidates.push({
          source: 'ozon_public_listings',
          provider:
            this.text(evidence.provider) ?? 'verified_public_evidence_cache',
          externalId: this.text(item.id),
          url,
          market: 'RU',
          name: title,
          productType: report.query,
          material: null,
          primaryUse: null,
          customizationMethod: null,
          targetAudience: null,
          salePrice: priceRub === null ? null : priceRub.toFixed(2),
          currency: priceRub === null ? null : 'RUB',
          costs: [],
          platformFeeRate: null,
          paymentFeeRate: null,
          adRate: null,
          refundRate: null,
          signals: [
            {
              metricName: 'price',
              metricValue: priceRub === null ? null : priceRub.toFixed(2),
              unit: 'RUB',
              observedAt: itemFetchedAt,
              fetchedAt: itemFetchedAt,
              quality: priceRub === null ? 'UNKNOWN' : 'VERIFIED',
            },
          ],
          risks: [],
        });
      }
    }

    const finishedAt = new Date();
    const newestEvidence = candidates
      .flatMap((candidate) =>
        candidate.signals.map((signal) => new Date(signal.fetchedAt).getTime()),
      )
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0];
    return {
      candidates,
      health: {
        source: this.source,
        status: candidates.length > 0 ? 'DEGRADED' : 'NOT_CONFIGURED',
        attempts: 1,
        itemCount: candidates.length,
        requestedAt,
        finishedAt,
        lastSuccessAt: candidates.length > 0 ? finishedAt : null,
        latencyMs: finishedAt.getTime() - requestedAt.getTime(),
        dataFreshnessSeconds:
          newestEvidence === undefined
            ? null
            : Math.max(
                0,
                Math.floor((finishedAt.getTime() - newestEvidence) / 1000),
              ),
        errorCode: candidates.length > 0 ? null : 'NO_VERIFIED_OZON_EVIDENCE',
        errorMessage:
          candidates.length > 0
            ? null
            : 'No verified Ozon public evidence was available in the last 7 days.',
        metadata: {
          realtime: false,
          sourceKind: 'previously_verified_evidence_cache',
          message:
            candidates.length > 0
              ? 'Cached verified Ozon public evidence was reused with its original timestamps.'
              : 'No verified Ozon public evidence was available in the last 7 days.',
        },
      },
    };
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private iso(value: unknown): string | null {
    const text = this.text(value);
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private httpUrl(value: unknown): string | null {
    const text = this.text(value);
    if (!text) return null;
    try {
      const url = new URL(text);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  private positiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private isReusableEvidence(
    query: string,
    summary: string | null,
    opportunities: Record<string, unknown>,
    evidence: Record<string, unknown>,
  ): boolean {
    const items = Array.isArray(evidence.items) ? evidence.items : [];
    const prices = items
      .map((item) => this.positiveNumber(this.record(item).priceRub))
      .filter((price): price is number => price !== null);
    const priceRange = this.record(opportunities.priceRange);
    const priceMin = this.positiveNumber(priceRange.min);
    const priceMax = this.positiveNumber(priceRange.max);
    const competitors = Array.isArray(opportunities.competitors)
      ? opportunities.competitors.filter(
          (item): item is string => typeof item === 'string' && !!item.trim(),
        )
      : [];
    const evidenceCompetitors = Array.isArray(evidence.competitors)
      ? evidence.competitors.filter(
          (item): item is string => typeof item === 'string' && !!item.trim(),
        )
      : [];

    return (
      evidence.source === 'ozon_public_listings' &&
      this.iso(evidence.fetchedAt) !== null &&
      typeof summary === 'string' &&
      summary.trim().length >= 30 &&
      items.length >= 2 &&
      items.every((item) => {
        const source = this.record(item);
        const price = source.priceRub;
        const url = this.httpUrl(source.url);
        return (
          this.text(source.title) !== null &&
          url !== null &&
          /^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(url) &&
          this.iso(source.fetchedAt) !== null &&
          (price === null ||
            price === undefined ||
            this.positiveNumber(price) !== null)
        );
      }) &&
      prices.length >= 2 &&
      priceMin !== null &&
      priceMax !== null &&
      priceRange.currency === 'RUB' &&
      priceMin === Math.min(...prices) &&
      priceMax === Math.max(...prices) &&
      competitors.length >= 2 &&
      (evidenceCompetitors.length === 0 ||
        competitors.every((competitor) =>
          evidenceCompetitors.includes(competitor),
        )) &&
      this.hasTranslatedQueryTerms(query, evidence, items)
    );
  }

  private hasTranslatedQueryTerms(
    query: string,
    evidence: Record<string, unknown>,
    items: unknown[],
  ): boolean {
    if (!/[\u3400-\u9fff]/.test(query.trim())) return true;
    const relevance = this.record(evidence.relevance);
    const searchQuery = this.text(evidence.searchQuery);
    const matchTerms = Array.isArray(relevance.matchTerms)
      ? relevance.matchTerms
          .filter((term): term is string => typeof term === 'string')
          .map((term) => term.trim().toLocaleLowerCase())
          .filter(Boolean)
      : [];
    if (
      relevance.strategy !== 'translated_query_terms' ||
      !searchQuery ||
      searchQuery === query.trim() ||
      matchTerms.length === 0
    )
      return false;
    return items.every((item) => {
      const source = this.record(item);
      const text = [source.title, source.snippet, source.url]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLocaleLowerCase();
      return matchTerms.every((term) => text.includes(term));
    });
  }
}
