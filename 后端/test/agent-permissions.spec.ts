import { UnauthorizedException } from '@nestjs/common';
import {
  AgentPermissionLevel,
  AgentPermissionsService,
} from '../src/shared/agent-permissions/agent-permissions.service.js';
import { AgentKillSwitchController } from '../src/shared/agent-permissions/agent-kill-switch.controller.js';

function createController() {
  const response = {
    schemaVersion: 'organization-agent-control/v1',
    organizationId: 'org-1',
    orgId: 'org-1',
    state: 'RUNNING',
    paused: false,
    revision: 0,
    requestedAt: null,
    requestedBy: null,
    requestReason: null,
    intakeAllowed: true,
    schedulerAllowed: true,
    resumable: false,
    acknowledged: true,
    runs: {
      research: { pending: 0, running: 0, paused: 0, stopped: 0 },
      automation: { pending: 0, running: 0, paused: 0, stopped: 0 },
    },
    external: {
      productLaunch: {
        queued: 0,
        generatingImages: 0,
        submittingToOzon: 0,
        recovering: 0,
        pausedPreparation: 0,
      },
      submission: {
        claimed: 0,
        requestSent: 0,
        unknown: 0,
        reconciling: 0,
      },
    },
  };
  const control = {
    pause: jest.fn().mockResolvedValue(response),
    resume: jest.fn().mockResolvedValue(response),
    stop: jest.fn().mockResolvedValue(response),
    status: jest.fn().mockResolvedValue(response),
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
  const resumeDispatch = {
    schemaVersion: 'organization-agent-resume-dispatch/v1',
    controlRevision: 0,
    state: 'DISPATCHED',
    automation: { eligible: 0, ensured: 0, failed: [] },
    research: { eligible: 0, ensured: 0, unsupported: [], failed: [] },
    productLaunch: { eligible: 0, ensured: 0, failed: [] },
  };
  const resumeDispatcher = {
    dispatch: jest.fn().mockResolvedValue(resumeDispatch),
  };
  return {
    controller: new AgentKillSwitchController(
      control as any,
      permissions as any,
      config as any,
      resumeDispatcher as any,
    ),
    control,
    response,
    resumeDispatch,
    resumeDispatcher,
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
    const control = {
      getEffectiveState: jest.fn().mockResolvedValue('RUNNING'),
    };
    return {
      service: new AgentPermissionsService(prisma as any, control as any),
      prisma,
      control,
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

  it.each(['PAUSE_REQUESTED', 'STOP_REQUESTED'])(
    'rejects every action while durable organization state is %s',
    async (state) => {
      const { service, control } = createService();
      control.getEffectiveState.mockResolvedValue(state);

      await expect(service.check('org-1', 'product.research')).resolves.toEqual(
        {
          allowed: false,
          level: AgentPermissionLevel.READ_ONLY,
          requireConfirm: false,
        },
      );
    },
  );

  it('fails closed when durable control state cannot be read', async () => {
    const { service, control, prisma } = createService();
    control.getEffectiveState.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.check('org-1', 'product.research')).resolves.toEqual({
      allowed: false,
      level: AgentPermissionLevel.READ_ONLY,
      requireConfirm: false,
    });
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it.each(['PAUSE_REQUESTED', 'STOP_REQUESTED'])(
    'disables autonomy while organization control state is %s',
    async (state) => {
      const { service, control, prisma } = createService();
      control.getEffectiveState.mockResolvedValue(state);

      await expect(service.isAutonomyEnabled('org-1')).resolves.toBe(false);
      expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
    },
  );

  it('fails autonomy closed when control state cannot be read', async () => {
    const { service, control, prisma } = createService();
    control.getEffectiveState.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.isAutonomyEnabled('org-1')).resolves.toBe(false);
    expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
  });

  it('enables autonomy only when both control and autonomy flag allow it', async () => {
    const { service } = createService();

    await expect(service.isAutonomyEnabled('org-1')).resolves.toBe(true);
  });
});

describe('AgentKillSwitchController agent-facing endpoints', () => {
  const owner = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

  it('uses the current user organization for pause, resume, and status', async () => {
    const { controller, response, resumeDispatch, resumeDispatcher } =
      createController();

    await expect(controller.pause(owner)).resolves.toBe(response);
    await expect(controller.resume(owner)).resolves.toEqual({
      ...response,
      resumeDispatch,
    });
    expect(resumeDispatcher.dispatch).toHaveBeenCalledWith('org-1', 0);
    await expect(controller.status(owner)).resolves.toBe(response);
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
