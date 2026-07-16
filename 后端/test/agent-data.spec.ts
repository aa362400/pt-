import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AgentDataController } from '../src/features/agent-data/agent-data.controller.js';

function createController() {
  const prisma = {
    listingDraft: { findMany: jest.fn().mockResolvedValue([]) },
    productResearchReport: { findMany: jest.fn().mockResolvedValue([]) },
    keywordReport: { findMany: jest.fn().mockResolvedValue([]) },
    reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
    trendInsight: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    storeMetricSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    alert: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const config = { get: jest.fn().mockReturnValue('agent-secret') };
  const capabilityCenter = {
    list: jest.fn().mockResolvedValue({
      generatedAt: '2026-07-12T00:00:00.000Z',
      source: 'backend-live',
      items: [],
    }),
  };
  return {
    controller: new AgentDataController(
      prisma as any,
      config as any,
      capabilityCenter as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (tx: typeof prisma) => unknown,
          ) => operation(prisma),
        ),
      } as any,
    ),
    prisma,
    capabilityCenter,
  };
}

describe('AgentDataController', () => {
  it('rejects missing service token', async () => {
    const { controller } = createController();

    await expect(controller.health('', 'org-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('requires orgId for every internal read', async () => {
    const { controller } = createController();

    await expect(controller.health('agent-secret', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('scopes listing data by org and normalizes published status', async () => {
    const { controller, prisma } = createController();

    await controller.listListings('agent-secret', 'org-1', 'published', '5');

    expect(prisma.listingDraft.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'PUBLISHED' },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    });
  });

  it('scopes product search through workspace organization', async () => {
    const { controller, prisma } = createController();

    await controller.searchProducts('agent-secret', 'org-1', 'mat', '3');

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        workspace: { organizationId: 'org-1' },
        OR: [
          { title: { contains: 'mat', mode: 'insensitive' } },
          { sku: { contains: 'mat', mode: 'insensitive' } },
          { asinOrExternalId: { contains: 'mat', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
  });

  it('exposes the shared capability registry to the authenticated agent', async () => {
    const { controller, capabilityCenter } = createController();

    const result = await controller.capabilities('agent-secret', 'org-1');

    expect(capabilityCenter.list).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', role: 'OWNER' }),
    );
    expect(result.source).toBe('platform');
  });
});
