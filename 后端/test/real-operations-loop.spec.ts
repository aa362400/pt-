import { BadRequestException, ConflictException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertAgentToolAccess } from '../src/features/agent-console/agent-console.service.js';
import { AgentToolRegistryService } from '../src/features/agent-console/agent-tool-registry.service.js';
import { MarketObservationsService } from '../src/features/market-observations/market-observations.service.js';
import { OpportunityScoringService } from '../src/features/market-observations/opportunity-scoring.service.js';

describe('real operations loop', () => {
  const registry = new AgentToolRegistryService({
    run: jest.fn(),
  } as never);

  it('blocks all tools at L0 and permits only compatible L1 reads', () => {
    const readTool = registry.get('product.list');
    const publishTool = registry.get('listing.publish.propose');
    expect(() =>
      assertAgentToolAccess(
        { level: 0, allowedTools: [], deniedTools: [], highRiskApproval: true },
        0,
        readTool,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAgentToolAccess(
        { level: 1, allowedTools: [], deniedTools: [], highRiskApproval: true },
        1,
        readTool,
      ),
    ).not.toThrow();
    expect(() =>
      assertAgentToolAccess(
        { level: 1, allowedTools: [], deniedTools: [], highRiskApproval: true },
        1,
        publishTool,
      ),
    ).toThrow(BadRequestException);
  });

  it('requires approval enforcement for every registered high-risk tool', () => {
    const highRisk = registry
      .list()
      .filter((tool) => tool.riskLevel === 'HIGH');
    expect(highRisk.length).toBeGreaterThan(0);
    expect(highRisk.every((tool) => tool.requiresHumanApproval)).toBe(true);
  });

  it('scopes notification reads to the current user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const tenantDatabase = {
      run: jest.fn(
        async (_orgId: string, operation: (tx: unknown) => unknown) =>
          operation({ notification: { findMany } }),
      ),
    };
    const service = new AgentToolRegistryService(tenantDatabase as never);
    await service.execute({
      organizationId: 'org-1',
      userId: 'user-1',
      input: { __toolName: 'notification.list' },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', userId: 'user-1' },
      }),
    );
  });

  it('keeps margin and supply risk unknown without real cost evidence', () => {
    const result = new OpportunityScoringService().score({
      currentPrice: 1_499,
      originalPrice: 1_999,
      rating: 4.7,
      reviewCount: 500,
      displayedSalesText: 'Популярный товар',
      position: 3,
      sponsored: false,
      title: 'Автомобильный вентилятор',
      imageUrl: 'https://cdn.example.com/image.jpg',
      brand: null,
      sellerName: 'Seller',
      deliveryText: 'Доставка завтра',
      promotionText: null,
      externalId: '123',
      evidenceConfidence: 0.9,
    });
    expect(result.dimensions.marginPotential).toBe('unknown');
    expect(result.dimensions.supplyChainRisk).toBe('unknown');
    expect(result.missingEvidence).toContain('product_cost');
    expect(result.decision).toBe('MANUAL_REVIEW_RECOMMENDED');
  });

  it('rejects non-Ozon URLs before persistence', async () => {
    const tenantDatabase = { run: jest.fn() };
    const service = new MarketObservationsService(
      tenantDatabase as never,
      new OpportunityScoringService(),
      { log: jest.fn() } as never,
    );
    await expect(
      service.create(
        { sub: 'user-1', email: 'a@example.com', orgId: 'org-1' },
        {
          source: 'OZON_PUBLIC_PAGE',
          pageType: 'SEARCH',
          pageUrl: 'https://example.com/search',
          capturedAt: new Date().toISOString(),
          parserVersion: 'ozon-parser/v1',
          items: [
            {
              title: 'Product',
              url: 'https://www.ozon.ru/product/1',
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantDatabase.run).not.toHaveBeenCalled();
  });

  it('blocks scoring when collector evidence confidence is too low', async () => {
    const batch = {
      id: 'batch-1',
      organizationId: 'org-1',
      confidence: 0.6,
      requiresReview: true,
      items: [],
    };
    const tenantDatabase = {
      run: jest.fn(
        async (_orgId: string, operation: (tx: unknown) => unknown) =>
          operation({
            marketObservationBatch: {
              findFirst: jest.fn().mockResolvedValue(batch),
            },
          }),
      ),
    };
    const service = new MarketObservationsService(
      tenantDatabase as never,
      new OpportunityScoringService(),
      { log: jest.fn() } as never,
    );
    await expect(
      service.scoreBatch(
        { sub: 'user-1', email: 'a@example.com', orgId: 'org-1' },
        'batch-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enables and forces RLS for every new tenant table', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260714223000_add_real_operations_loop',
        'migration.sql',
      ),
      'utf8',
    );
    for (const table of [
      'agent_autonomy_policies',
      'agent_plans',
      'agent_tool_executions',
      'market_observation_batches',
      'market_observation_items',
      'product_opportunities',
      'business_outcomes',
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
  });
});
