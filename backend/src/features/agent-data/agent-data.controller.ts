import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { ListingStatus, Prisma } from '@prisma/client';
import { Public } from '../../shared/auth/public.decorator.js';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { CapabilityCenterService } from '../capability-center/capability-center.service.js';

function takeLimit(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual);
  const expectedBuf = Buffer.from(expected);
  return (
    actualBuf.length === expectedBuf.length &&
    timingSafeEqual(actualBuf, expectedBuf)
  );
}

@Public()
@Controller('agent-data')
export class AgentDataController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly capabilityCenter: CapabilityCenterService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  private authorize(
    apiKey: string | undefined,
    orgId: string | undefined,
  ): string {
    const expected = this.configService.get<string>('AGENT_API_KEY') ?? '';
    if (!expected) {
      throw new ServiceUnavailableException('Agent data API is disabled');
    }
    if (!apiKey || !safeEqual(apiKey, expected)) {
      throw new UnauthorizedException('Invalid agent API key');
    }
    const cleanOrgId = (orgId ?? '').trim();
    if (!cleanOrgId) {
      throw new BadRequestException('orgId is required');
    }
    return cleanOrgId;
  }

  @Get('health')
  // Keep authorization failures as rejected promises for internal clients.
  // eslint-disable-next-line @typescript-eslint/require-await
  async health(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    return { status: 'ok', source: 'platform', orgId: organizationId };
  }

  @Get('capabilities')
  async capabilities(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const report = await this.capabilityCenter.list({
      sub: 'platform-agent',
      email: 'platform-agent@shopmate.local',
      orgId: organizationId,
      role: 'OWNER',
    });
    return { ...report, source: 'platform' as const };
  }

  @Get('listings')
  async listListings(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const normalizedStatus = status
      ? (status.trim().toUpperCase() as ListingStatus)
      : undefined;
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.listingDraft.findMany({
        where: {
          organizationId,
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        take: takeLimit(limit, 50, 100),
      }),
    );
    return { source: 'platform', items };
  }

  @Get('product-research')
  async listResearchReports(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.productResearchReport.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: takeLimit(limit, 20, 100),
      }),
    );
    return { source: 'platform', items };
  }

  @Get('keywords')
  async listKeywordReports(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.keywordReport.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: takeLimit(limit, 20, 100),
      }),
    );
    return { source: 'platform', items };
  }

  @Get('review')
  async listReviewTasks(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const normalizedStatus = status ? status.trim().toUpperCase() : undefined;
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.reviewTask.findMany({
        where: {
          organizationId,
          ...(normalizedStatus ? { status: normalizedStatus as never } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: takeLimit(limit, 50, 100),
      }),
    );
    return { source: 'platform', items };
  }

  @Get('trends')
  async listTrends(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const text = (category ?? '').trim();
    const where: Prisma.TrendInsightWhereInput = {
      organizationId,
      ...(text
        ? {
            OR: [
              { category: { contains: text, mode: 'insensitive' } },
              { keyword: { contains: text, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.trendInsight.findMany({
        where,
        orderBy: { observedAt: 'desc' },
        take: takeLimit(limit, 10, 50),
      }),
    );
    return { source: 'platform', items };
  }

  @Get('products')
  async searchProducts(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const text = (search ?? '').trim();
    const where: Prisma.ProductWhereInput = {
      workspace: { organizationId },
      ...(text
        ? {
            OR: [
              { title: { contains: text, mode: 'insensitive' } },
              { sku: { contains: text, mode: 'insensitive' } },
              { asinOrExternalId: { contains: text, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: takeLimit(limit, 10, 50),
      }),
    );
    return { source: 'platform', items };
  }

  @Get('store-monitoring/summary')
  async storeSummary(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const snapshots = await this.prisma.storeMetricSnapshot.findMany({
      where: {
        workspace: {
          organizationId,
          ...(workspaceId ? { id: workspaceId } : {}),
        },
      },
      orderBy: { date: 'desc' },
      take: 5,
    });
    return { source: 'platform', snapshots };
  }

  @Get('store-monitoring/alerts')
  async listAlerts(
    @Headers('x-api-key') apiKey: string | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.authorize(apiKey, orgId);
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.alert.findMany({
        where: {
          organizationId,
          status: 'OPEN',
          ...(severity
            ? { severity: severity.trim().toUpperCase() as never }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: takeLimit(limit, 20, 100),
      }),
    );
    return {
      source: 'platform',
      items: items.map((item) => ({
        ...item,
        message: item.description ?? item.title,
      })),
    };
  }
}
