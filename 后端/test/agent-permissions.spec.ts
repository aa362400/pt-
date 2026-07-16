import { UnauthorizedException } from '@nestjs/common';
import {
  AgentPermissionLevel,
  AgentPermissionsService,
} from '../src/shared/agent-permissions/agent-permissions.service.js';
import { AgentKillSwitchController } from '../src/shared/agent-permissions/agent-kill-switch.controller.js';

function createController() {
  const prisma = {
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const permissions = {
    check: jest.fn().mockResolvedValue({
      allowed: true,
      level: 1,
      requireConfirm: false,
    }),
    isAutonomyEnabled: jest.fn().mockResolvedValue(true),
    listActions: jest.fn().mockReturnValue([{ name: 'product.research' }]),
  };
  const config = { get: jest.fn().mockReturnValue('agent-secret') };
  return {
    controller: new AgentKillSwitchController(
      prisma as any,
      permissions as any,
      config as any,
    ),
  };
}

describe('AgentPermissionsService LinkfoxSkill actions', () => {
  function createService(plan = 'PRO') {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ plan }),
      },
      featureFlag: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.name === 'agent-autonomy'
                ? { name: 'agent-autonomy', enabled: true, orgIds: [] }
                : null,
            ),
          ),
      },
    };
    return {
      service: new AgentPermissionsService(prisma as any),
      prisma,
    };
  }

  it('registers LinkfoxSkill read-only discovery actions', () => {
    const { service } = createService();

    expect(service.listActions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'linkfoxskill.version',
          permissionLevel: AgentPermissionLevel.READ_ONLY,
        }),
        expect.objectContaining({
          name: 'linkfoxskill.agentlist',
          permissionLevel: AgentPermissionLevel.READ_ONLY,
        }),
        expect.objectContaining({
          name: 'linkfoxskill.search',
          permissionLevel: AgentPermissionLevel.READ_ONLY,
        }),
      ]),
    );
  });

  it('registers TEMU price-check MCP as a read-only analysis action', async () => {
    const { service } = createService();

    expect(service.listActions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'temu.price_check',
          permissionLevel: AgentPermissionLevel.READ_ONLY,
        }),
      ]),
    );
    await expect(service.check('org-1', 'temu.price_check')).resolves.toEqual({
      allowed: true,
      level: AgentPermissionLevel.READ_ONLY,
      requireConfirm: false,
    });
  });

  it('keeps Ozon pricing read-only without a human write confirmation', async () => {
    const { service } = createService();

    await expect(
      service.check('org-1', 'ozon.pricing.calculate'),
    ).resolves.toEqual({
      allowed: true,
      level: AgentPermissionLevel.READ_ONLY,
      requireConfirm: false,
    });
  });

  it('registers the complete cross-border MCP tool suite with safe permission levels', () => {
    const { service } = createService();
    const actions = new Map(
      service.listActions().map((action) => [action.name, action]),
    );
    for (const name of [
      'commerce.profit.calculate',
      'commerce.keywords.analyze',
      'temu.pricing.calculate',
      'commerce.risk.check',
      'listing.quality.score',
    ]) {
      expect(actions.get(name)?.permissionLevel).toBe(
        AgentPermissionLevel.READ_ONLY,
      );
    }
    for (const name of [
      'commerce.image_prompts.generate',
      'commerce.csv.export',
      'amazon.title.optimize',
    ]) {
      expect(actions.get(name)?.permissionLevel).toBe(
        AgentPermissionLevel.DRAFT,
      );
    }
  });

  it('requires human confirmation for LinkfoxSkill install and update actions', async () => {
    const { service } = createService();

    await expect(
      service.check('org-1', 'linkfoxskill.install'),
    ).resolves.toEqual({
      allowed: true,
      level: AgentPermissionLevel.PUBLISH,
      requireConfirm: true,
    });
    await expect(
      service.check('org-1', 'linkfoxskill.update'),
    ).resolves.toEqual({
      allowed: true,
      level: AgentPermissionLevel.PUBLISH,
      requireConfirm: true,
    });
  });

  it('allows local LinkfoxSkill management on FREE plans only through confirmation', async () => {
    const { service } = createService('FREE');

    await expect(
      service.check('org-1', 'linkfoxskill.install'),
    ).resolves.toEqual({
      allowed: true,
      level: AgentPermissionLevel.PUBLISH,
      requireConfirm: true,
    });
  });

  it('rejects every action while the organization kill switch is enabled', async () => {
    const { service, prisma } = createService();
    prisma.featureFlag.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.name === 'agent-paused-org-1'
          ? { name: where.name, enabled: true, orgIds: [] }
          : null,
      ),
    );

    await expect(service.check('org-1', 'product.research')).resolves.toEqual({
      allowed: false,
      level: AgentPermissionLevel.READ_ONLY,
      requireConfirm: false,
    });
  });
});

describe('AgentKillSwitchController agent-facing endpoints', () => {
  const owner = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

  it('uses the current user organization for pause, resume, and status', async () => {
    const { controller } = createController();

    await expect(controller.pause(owner)).resolves.toEqual({
      paused: true,
      orgId: 'org-1',
    });
    await expect(controller.resume(owner)).resolves.toEqual({
      paused: false,
      orgId: 'org-1',
    });
    await expect(controller.status(owner)).resolves.toEqual({
      paused: false,
      orgId: 'org-1',
    });
  });

  it('requires the service token before listing agent actions', async () => {
    const { controller } = createController();

    await expect(controller.actions('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.actions('agent-secret')).resolves.toEqual([
      { name: 'product.research' },
    ]);
  });

  it('requires the service token before checking action permissions', async () => {
    const { controller } = createController();

    await expect(
      controller.checkAction('', 'org-1', 'product.research'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.checkAction('agent-secret', 'org-1', 'product.research'),
    ).resolves.toEqual({
      allowed: true,
      level: 1,
      requireConfirm: false,
      reason: undefined,
    });
  });
});
