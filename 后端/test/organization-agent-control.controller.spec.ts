import { UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrganizationAgentControlCommandDto } from '../src/shared/agent-control/organization-agent-control.dto.js';
import { AgentKillSwitchController } from '../src/shared/agent-permissions/agent-kill-switch.controller.js';

const controlResponse = {
  schemaVersion: 'organization-agent-control/v1' as const,
  organizationId: 'org-1',
  orgId: 'org-1',
  state: 'RUNNING' as const,
  paused: false,
  revision: 4,
  requestedAt: '2026-07-16T11:30:00.000Z',
  requestedBy: 'user-1',
  requestReason: 'Operator command',
  intakeAllowed: true,
  schedulerAllowed: true,
  resumable: false,
  acknowledged: true,
  runs: {
    research: { pending: 0, running: 0, paused: 0, stopped: 0 },
    automation: { pending: 0, running: 0, paused: 0, stopped: 0 },
  },
};

function fixture() {
  const control = {
    pause: jest.fn().mockResolvedValue(controlResponse),
    resume: jest.fn().mockResolvedValue(controlResponse),
    stop: jest.fn().mockResolvedValue(controlResponse),
    status: jest.fn().mockResolvedValue(controlResponse),
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
  const resumeDispatcher = {
    dispatch: jest.fn().mockResolvedValue({
      schemaVersion: 'organization-agent-resume-dispatch/v1',
      controlRevision: 4,
      state: 'DISPATCHED',
      automation: { eligible: 0, ensured: 0, failed: [] },
      research: { eligible: 0, ensured: 0, unsupported: [], failed: [] },
      productLaunch: { eligible: 0, ensured: 0, failed: [] },
    }),
  };
  return {
    controller: new AgentKillSwitchController(
      control as never,
      permissions as never,
      config as never,
      resumeDispatcher as never,
    ),
    control,
    permissions,
    resumeDispatcher,
  };
}

describe('AgentKillSwitchController durable contract', () => {
  const owner = {
    sub: 'user-1',
    orgId: 'org-1',
    role: 'OWNER',
  } as never;

  it('keeps pause/resume/status and adds stop with the same response contract', async () => {
    const { controller, control, resumeDispatcher } = fixture();
    const dto = {
      expectedRevision: 4,
      reason: 'Operator command',
    };

    await expect(controller.pause(owner, dto)).resolves.toBe(controlResponse);
    await expect(controller.resume(owner, dto)).resolves.toMatchObject({
      ...controlResponse,
      resumeDispatch: expect.objectContaining({ state: 'DISPATCHED' }),
    });
    await expect(controller.stop(owner, dto)).resolves.toBe(controlResponse);
    await expect(controller.status(owner)).resolves.toBe(controlResponse);

    for (const operation of [control.pause, control.resume, control.stop]) {
      expect(operation).toHaveBeenCalledWith({
        organizationId: 'org-1',
        actorId: 'user-1',
        expectedRevision: 4,
        reason: 'Operator command',
      });
    }
    expect(control.status).toHaveBeenCalledWith('org-1');
    expect(resumeDispatcher.dispatch).toHaveBeenCalledWith('org-1', 4);
  });

  it('accepts an omitted command body for backward compatibility', async () => {
    const { controller, control } = fixture();

    await expect(controller.pause(owner)).resolves.toBe(controlResponse);
    expect(control.pause).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorId: 'user-1',
      expectedRevision: undefined,
      reason: undefined,
    });
  });

  it('validates revision and reason at the HTTP boundary', async () => {
    const invalid = plainToInstance(OrganizationAgentControlCommandDto, {
      expectedRevision: -1.5,
      reason: 'x'.repeat(501),
    });
    const errors = await validate(invalid);

    expect(errors.map((error) => error.property).sort()).toEqual([
      'expectedRevision',
      'reason',
    ]);
  });

  it('rejects a bad service token without reflecting it in the error', async () => {
    const { controller } = fixture();
    const supplied = 'do-not-reflect-this-token';

    try {
      await controller.actions(supplied);
      throw new Error('Expected actions to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as Error).message).not.toContain(supplied);
    }
  });
});
