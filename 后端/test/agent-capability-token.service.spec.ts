import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AgentCapabilityTokenService } from '../src/features/agent-proxy/agent-capability-token.service.js';

describe('AgentCapabilityTokenService', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createService() {
    const prisma = {
      agentCapabilityToken: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'cap-1',
          ...data,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: now,
        })),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'cap-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      },
    };
    const service = new AgentCapabilityTokenService(
      prisma as unknown as ConstructorParameters<
        typeof AgentCapabilityTokenService
      >[0],
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as unknown as ConstructorParameters<
        typeof AgentCapabilityTokenService
      >[1],
    );
    return { service, prisma };
  }

  it('issues an action-scoped token but persists only its SHA-256 hash', async () => {
    const { service, prisma } = createService();

    const issued = await service.issue({
      organizationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'workspace-1',
      actions: ['commerce.profit.calculate'],
      ttlSeconds: 300,
      description: 'Local agent test token',
    });

    expect(issued.token).toMatch(/^acp_[A-Za-z0-9_-]{40,}$/);
    expect(issued.expiresAt).toEqual(new Date('2026-07-13T12:05:00.000Z'));
    const data = prisma.agentCapabilityToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.tokenHash).not.toContain(issued.token);
    expect(JSON.stringify(data)).not.toContain(issued.token);
  });

  it('rejects expired and revoked capability tokens', async () => {
    const { service, prisma } = createService();
    prisma.agentCapabilityToken.findUnique
      .mockResolvedValueOnce({
        id: 'expired',
        organizationId: 'org-1',
        workspaceId: null,
        actorId: 'user-1',
        actions: ['profit.analyze'],
        expiresAt: new Date('2026-07-13T11:59:59.000Z'),
        revokedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'revoked',
        organizationId: 'org-1',
        workspaceId: null,
        actorId: 'user-1',
        actions: ['profit.analyze'],
        expiresAt: new Date('2026-07-13T12:05:00.000Z'),
        revokedAt: new Date('2026-07-13T11:00:00.000Z'),
      });

    const context = {
      rawToken: 'acp_test-token',
      organizationId: 'org-1',
      action: 'profit.analyze',
    };
    await expect(service.validate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.validate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enforces organization, workspace and action scopes', async () => {
    const { service, prisma } = createService();
    prisma.agentCapabilityToken.findUnique.mockResolvedValue({
      id: 'cap-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      actorId: 'user-1',
      actions: ['commerce.profit.calculate'],
      expiresAt: new Date('2026-07-13T12:05:00.000Z'),
      revokedAt: null,
    });

    await expect(
      service.validate({
        rawToken: 'acp_test-token',
        organizationId: 'org-2',
        workspaceId: 'workspace-1',
        action: 'commerce.profit.calculate',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.validate({
        rawToken: 'acp_test-token',
        organizationId: 'org-1',
        workspaceId: 'workspace-2',
        action: 'commerce.profit.calculate',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.validate({
        rawToken: 'acp_test-token',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        action: 'ozon.price.update',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
