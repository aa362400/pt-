import { StoreAgentProfileService } from '../src/features/agent-memory/store-agent-profile.service.js';

const user = {
  sub: 'user-1',
  email: 'owner@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function createService() {
  const prisma = {
    workspace: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'workspace-1',
        organizationId: 'org-1',
        channelType: 'OZON',
      }),
    },
    storeAgentProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-1',
        workspaceId: 'workspace-1',
        targetCategories: ['Home storage', 'Kitchen'],
        forbiddenTerms: ['medical', 'brand-x'],
        minimumProfitMargin: 28,
        notes: 'Avoid fragile glass products.',
        updatedAt: new Date('2026-07-10T08:00:00.000Z'),
      }),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({
          id: 'profile-1',
          updatedAt: new Date('2026-07-10T09:00:00.000Z'),
          ...create,
        }),
      ),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };
  return {
    service: new StoreAgentProfileService(
      prisma as never,
      audit as never,
      tenantDatabase as never,
    ),
    prisma,
    audit,
  };
}

describe('StoreAgentProfileService', () => {
  it('returns a scoped, safe research context for the Ozon agent', async () => {
    const { service } = createService();

    await expect(
      service.buildResearchContext('org-1', 'workspace-1'),
    ).resolves.toEqual({
      workspaceId: 'workspace-1',
      targetCategories: ['Home storage', 'Kitchen'],
      forbiddenTerms: ['medical', 'brand-x'],
      minimumProfitMargin: 28,
      notes: 'Avoid fragile glass products.',
    });
  });

  it('upserts store rules only after confirming the workspace belongs to the caller org', async () => {
    const { service, prisma, audit } = createService();

    const saved = await service.upsertForWorkspace(user, 'workspace-1', {
      targetCategories: ['Home storage'],
      forbiddenTerms: ['medical'],
      minimumProfitMargin: 30,
      notes: 'No regulated goods.',
    });

    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: 'workspace-1', organizationId: 'org-1' },
      select: { id: true, channelType: true },
    });
    expect(prisma.storeAgentProfile.upsert).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
      create: expect.objectContaining({
        workspaceId: 'workspace-1',
        targetCategories: ['Home storage'],
        minimumProfitMargin: 30,
      }),
      update: expect.objectContaining({
        forbiddenTerms: ['medical'],
        notes: 'No regulated goods.',
      }),
    });
    expect(saved.workspaceId).toBe('workspace-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store-agent-profile.update',
        resourceId: 'workspace-1',
      }),
    );
  });
});
