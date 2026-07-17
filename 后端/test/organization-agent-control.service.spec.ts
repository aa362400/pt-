import { HttpStatus } from '@nestjs/common';
import { Prisma, type OrganizationAgentControlState } from '@prisma/client';
import { OrganizationAgentControlService } from '../src/shared/agent-control/organization-agent-control.service.js';

type ControlRow = {
  organizationId: string;
  state: OrganizationAgentControlState;
  revision: number;
  requestedAt: Date | null;
  requestedBy: string | null;
  requestReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function fixture(input?: {
  state?: OrganizationAgentControlState;
  revision?: number;
  legacyPaused?: boolean;
  research?: Partial<
    Record<'PENDING' | 'RUNNING' | 'PAUSED' | 'STOPPED', number>
  >;
  automation?: Partial<
    Record<'PENDING' | 'RUNNING' | 'PAUSED' | 'STOPPED', number>
  >;
  productLaunch?: Partial<
    Record<
      'QUEUED' | 'GENERATING_IMAGES' | 'SUBMITTING_TO_OZON' | 'RECOVERING',
      number
    >
  >;
  externalSubmission?: Partial<
    Record<'CLAIMED' | 'REQUEST_SENT' | 'UNKNOWN' | 'RECONCILING', number>
  >;
}) {
  const now = new Date('2026-07-16T11:30:00.000Z');
  let control: ControlRow | null = input?.state
    ? {
        organizationId: 'org-1',
        state: input.state,
        revision: input.revision ?? 0,
        requestedAt: now,
        requestedBy: 'user-0',
        requestReason: 'existing request',
        createdAt: now,
        updatedAt: now,
      }
    : null;
  let legacyPaused = input?.legacyPaused ?? false;
  const research = {
    PENDING: 0,
    RUNNING: 0,
    PAUSED: 0,
    STOPPED: 0,
    ...input?.research,
  };
  const automation = {
    PENDING: 0,
    RUNNING: 0,
    PAUSED: 0,
    STOPPED: 0,
    ...input?.automation,
  };
  const productLaunch = {
    QUEUED: 0,
    GENERATING_IMAGES: 0,
    SUBMITTING_TO_OZON: 0,
    RECOVERING: 0,
    ...input?.productLaunch,
  };
  const externalSubmission = {
    CLAIMED: 0,
    REQUEST_SENT: 0,
    UNKNOWN: 0,
    RECONCILING: 0,
    ...input?.externalSubmission,
  };

  const tx = {
    organizationAgentControl: {
      upsert: jest.fn(async () => {
        control ??= {
          organizationId: 'org-1',
          state: 'RUNNING',
          revision: 0,
          requestedAt: null,
          requestedBy: null,
          requestReason: null,
          createdAt: now,
          updatedAt: now,
        };
        return control;
      }),
      findUniqueOrThrow: jest.fn(async () => control),
      findUnique: jest.fn(async () => control),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            organizationId: string;
            state: OrganizationAgentControlState;
            revision: number;
          };
          data: {
            state: OrganizationAgentControlState;
            revision: { increment: number };
            requestedAt: Date;
            requestedBy: string;
            requestReason: string | null;
          };
        }) => {
          if (
            !control ||
            control.organizationId !== where.organizationId ||
            control.state !== where.state ||
            control.revision !== where.revision
          ) {
            return { count: 0 };
          }
          control = {
            ...control,
            state: data.state,
            revision: control.revision + data.revision.increment,
            requestedAt: data.requestedAt,
            requestedBy: data.requestedBy,
            requestReason: data.requestReason,
            updatedAt: data.requestedAt,
          };
          return { count: 1 };
        },
      ),
    },
    featureFlag: {
      findUnique: jest.fn(async () => ({ enabled: legacyPaused })),
      upsert: jest.fn(async ({ create, update }: any) => {
        legacyPaused = Boolean(update.enabled ?? create.enabled);
        return { enabled: legacyPaused };
      }),
    },
    productResearchRun: {
      count: jest.fn(async ({ where }: any) => research[where.status]),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const statuses = Array.isArray(where.status?.in)
          ? where.status.in
          : [where.status];
        const count = statuses.reduce(
          (sum: number, status: keyof typeof research) =>
            sum + (research[status] ?? 0),
          0,
        );
        for (const status of statuses as Array<keyof typeof research>) {
          research[status] = 0;
        }
        research[data.status as keyof typeof research] += count;
        return { count };
      }),
    },
    automationRun: {
      count: jest.fn(async ({ where }: any) => automation[where.status]),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const statuses = Array.isArray(where.status?.in)
          ? where.status.in
          : [where.status];
        const count = statuses.reduce(
          (sum: number, status: keyof typeof automation) =>
            sum + (automation[status] ?? 0),
          0,
        );
        for (const status of statuses as Array<keyof typeof automation>) {
          automation[status] = 0;
        }
        automation[data.status as keyof typeof automation] += count;
        return { count };
      }),
    },
    productLaunch: {
      count: jest.fn(async ({ where }: any) => {
        if (where.failureCode) {
          return where.failureCode ===
            'PRODUCT_LAUNCH_PAUSED_BEFORE_PREPARATION'
            ? productLaunch.QUEUED
            : 0;
        }
        return productLaunch[where.status as keyof typeof productLaunch] ?? 0;
      }),
      updateMany: jest.fn(async ({ where }: any) => {
        const count = productLaunch[where.status as keyof typeof productLaunch];
        if (where.status === 'QUEUED') productLaunch.QUEUED = 0;
        return { count };
      }),
    },
    externalSubmission: {
      count: jest.fn(
        async ({ where }: any) =>
          externalSubmission[where.status as keyof typeof externalSubmission] ??
          0,
      ),
    },
    $queryRaw: jest.fn(async () => (control ? [control] : [])),
  };
  const tenantDatabase = {
    run: jest.fn(
      async (
        _organizationId: string,
        operation: (client: typeof tx) => unknown,
      ) => operation(tx),
    ),
  };
  const audit = { appendStrict: jest.fn().mockResolvedValue(undefined) };
  const service = new OrganizationAgentControlService(
    tenantDatabase as never,
    audit as never,
  );

  return {
    service,
    tx,
    audit,
    state: () => control,
    legacyPaused: () => legacyPaused,
  };
}

async function errorCode(operation: Promise<unknown>) {
  try {
    await operation;
    return null;
  } catch (error) {
    const exception = error as {
      getStatus(): number;
      getResponse(): { code: string };
    };
    return {
      status: exception.getStatus(),
      code: exception.getResponse().code,
    };
  }
}

describe('OrganizationAgentControlService', () => {
  it('locks the durable control row before allowing scheduler or worker intake', async () => {
    const { service, tx, state } = fixture({
      state: 'RUNNING',
      revision: 9,
    });
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([state()])
      .mockResolvedValueOnce([{ enabled: false }]);

    await expect(
      service.lockEffectiveState(tx as never, 'org-1'),
    ).resolves.toEqual({ state: 'RUNNING', revision: 9 });
    expect(tx.organizationAgentControl.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      create: { organizationId: 'org-1' },
      update: {},
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.$queryRaw.mock.calls[0])).toContain('FOR UPDATE');
    expect(JSON.stringify(tx.$queryRaw.mock.calls[1])).toContain('FOR UPDATE');
  });

  it('projects a locked legacy pause and does not report RUNNING intake', async () => {
    const { service, tx, state } = fixture({
      state: 'RUNNING',
      revision: 3,
      legacyPaused: true,
    });
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([state()])
      .mockResolvedValueOnce([{ enabled: true }]);

    await expect(
      service.lockEffectiveState(tx as never, 'org-1'),
    ).resolves.toEqual({ state: 'PAUSE_REQUESTED', revision: 3 });
  });

  it('pauses RUNNING with one CAS revision, dual-writes legacy state, and records audit', async () => {
    const { service, state, legacyPaused, audit } = fixture({
      research: { RUNNING: 1 },
    });

    const response = await service.pause({
      organizationId: 'org-1',
      actorId: 'user-1',
      expectedRevision: 0,
      reason: 'Pause after the current safe stage',
    });

    expect(response).toMatchObject({
      schemaVersion: 'organization-agent-control/v1',
      organizationId: 'org-1',
      orgId: 'org-1',
      state: 'PAUSE_REQUESTED',
      paused: true,
      revision: 1,
      requestedBy: 'user-1',
      requestReason: 'Pause after the current safe stage',
      intakeAllowed: false,
      schedulerAllowed: false,
      resumable: true,
      acknowledged: false,
      runs: {
        research: { pending: 0, running: 1, paused: 0, stopped: 0 },
        automation: { pending: 0, running: 0, paused: 0, stopped: 0 },
      },
    });
    expect(response.requestedAt).toEqual(expect.any(String));
    expect(state()?.revision).toBe(1);
    expect(legacyPaused()).toBe(true);
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization-agent-control.pause',
        before: expect.objectContaining({ state: 'RUNNING', revision: 0 }),
        after: expect.objectContaining({
          state: 'PAUSE_REQUESTED',
          revision: 1,
        }),
      }),
    );
  });

  it('atomically parks pending research and automation when pause is requested', async () => {
    const { service, tx } = fixture({
      research: { PENDING: 2, RUNNING: 1 },
      automation: { PENDING: 1, RUNNING: 1 },
    });

    await expect(
      service.pause({ organizationId: 'org-1', actorId: 'user-1' }),
    ).resolves.toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 1,
      acknowledged: false,
      runs: {
        research: { pending: 0, running: 1, paused: 2, stopped: 0 },
        automation: { pending: 0, running: 1, paused: 1, stopped: 0 },
      },
    });
    expect(tx.productResearchRun.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'PAUSED',
        controlRevision: 1,
        checkpointedAt: expect.any(Date),
      }),
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        flow: { organizationId: 'org-1' },
        status: 'PENDING',
      },
      data: expect.objectContaining({
        status: 'PAUSED',
        controlRevision: 1,
        checkpointedAt: expect.any(Date),
      }),
    });
  });

  it('atomically terminalizes pending and paused work when stop is requested', async () => {
    const { service, tx } = fixture({
      state: 'PAUSE_REQUESTED',
      revision: 4,
      research: { PENDING: 1, PAUSED: 2, RUNNING: 1 },
      automation: { PENDING: 2, PAUSED: 1, RUNNING: 1 },
      productLaunch: { QUEUED: 2 },
      externalSubmission: { REQUEST_SENT: 1 },
    });

    await expect(
      service.stop({ organizationId: 'org-1', actorId: 'user-1' }),
    ).resolves.toMatchObject({
      state: 'STOP_REQUESTED',
      revision: 5,
      acknowledged: false,
      runs: {
        research: { pending: 0, running: 1, paused: 0, stopped: 3 },
        automation: { pending: 0, running: 1, paused: 0, stopped: 3 },
      },
      external: {
        productLaunch: expect.objectContaining({ queued: 0 }),
        submission: expect.objectContaining({ requestSent: 1 }),
      },
    });
    expect(tx.productResearchRun.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        status: { in: ['PENDING', 'PAUSED'] },
      },
      data: expect.objectContaining({
        status: 'STOPPED',
        controlRevision: 5,
        finishedAt: expect.any(Date),
      }),
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        flow: { organizationId: 'org-1' },
        status: { in: ['PENDING', 'PAUSED'] },
      },
      data: expect.objectContaining({
        status: 'STOPPED',
        controlRevision: 5,
        finishedAt: expect.any(Date),
      }),
    });
    expect(tx.productLaunch.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'QUEUED' },
      data: expect.objectContaining({
        status: 'BLOCKED',
        failureCode: 'PRODUCT_LAUNCH_STOPPED_BEFORE_PREPARATION',
        completedAt: expect.any(Date),
      }),
    });
  });

  it('keeps an identical command idempotent without incrementing revision or auditing', async () => {
    const { service, state, audit, tx } = fixture({
      state: 'PAUSE_REQUESTED',
      revision: 7,
    });

    const response = await service.pause({
      organizationId: 'org-1',
      actorId: 'user-1',
      expectedRevision: 7,
    });

    expect(response).toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 7,
      acknowledged: true,
    });
    expect(state()?.revision).toBe(7);
    expect(tx.organizationAgentControl.updateMany).not.toHaveBeenCalled();
    expect(audit.appendStrict).not.toHaveBeenCalled();
  });

  it('rejects every stale expectedRevision before state or legacy projection changes', async () => {
    const { service, tx, audit } = fixture({
      state: 'PAUSE_REQUESTED',
      revision: 4,
    });

    await expect(
      errorCode(
        service.resume({
          organizationId: 'org-1',
          actorId: 'user-1',
          expectedRevision: 3,
        }),
      ),
    ).resolves.toEqual({
      status: HttpStatus.CONFLICT,
      code: 'AGENT_CONTROL_REVISION_CONFLICT',
    });
    expect(tx.featureFlag.upsert).not.toHaveBeenCalled();
    expect(audit.appendStrict).not.toHaveBeenCalled();
  });

  it('rejects a stale expectedRevision even when the requested state is already effective', async () => {
    const { service, tx, audit } = fixture({
      state: 'PAUSE_REQUESTED',
      revision: 8,
    });

    await expect(
      errorCode(
        service.pause({
          organizationId: 'org-1',
          actorId: 'user-1',
          expectedRevision: 7,
        }),
      ),
    ).resolves.toEqual({
      status: HttpStatus.CONFLICT,
      code: 'AGENT_CONTROL_REVISION_CONFLICT',
    });
    expect(tx.featureFlag.upsert).not.toHaveBeenCalled();
    expect(audit.appendStrict).not.toHaveBeenCalled();
  });

  it('stops a paused organization and never permits STOP_REQUESTED to resume', async () => {
    const { service, state, legacyPaused, audit } = fixture({
      state: 'PAUSE_REQUESTED',
      revision: 2,
    });

    await expect(
      service.stop({
        organizationId: 'org-1',
        actorId: 'user-1',
        expectedRevision: 2,
        reason: 'Safe terminal stop',
      }),
    ).resolves.toMatchObject({
      state: 'STOP_REQUESTED',
      revision: 3,
      resumable: false,
      acknowledged: true,
    });
    expect(state()?.state).toBe('STOP_REQUESTED');
    expect(legacyPaused()).toBe(true);
    expect(audit.appendStrict).toHaveBeenCalledTimes(1);

    for (const operation of [
      service.pause.bind(service),
      service.resume.bind(service),
    ]) {
      await expect(
        errorCode(
          operation({
            organizationId: 'org-1',
            actorId: 'user-1',
            expectedRevision: 3,
          }),
        ),
      ).resolves.toEqual({
        status: HttpStatus.CONFLICT,
        code: 'AGENT_CONTROL_STOPPED',
      });
    }
    expect(state()?.state).toBe('STOP_REQUESTED');
  });

  it('fails a lost CAS instead of reporting a transition that did not commit', async () => {
    const { service, tx, audit } = fixture();
    tx.organizationAgentControl.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      errorCode(
        service.pause({
          organizationId: 'org-1',
          actorId: 'user-1',
        }),
      ),
    ).resolves.toEqual({
      status: HttpStatus.CONFLICT,
      code: 'AGENT_CONTROL_CAS_CONFLICT',
    });
    expect(audit.appendStrict).not.toHaveBeenCalled();
  });

  it('retries a serializable conflict and maps exhausted conflicts to HTTP 409', async () => {
    const retryable = new Prisma.PrismaClientKnownRequestError(
      'Transaction write conflict',
      { code: 'P2034', clientVersion: '6.19.3' },
    );
    const recovered = fixture();
    recovered.tx.organizationAgentControl.upsert.mockRejectedValueOnce(
      retryable,
    );

    await expect(
      recovered.service.pause({
        organizationId: 'org-1',
        actorId: 'user-1',
      }),
    ).resolves.toMatchObject({ state: 'PAUSE_REQUESTED', revision: 1 });
    expect(recovered.tx.organizationAgentControl.upsert).toHaveBeenCalledTimes(
      2,
    );

    const exhausted = fixture();
    exhausted.tx.organizationAgentControl.upsert.mockRejectedValue(retryable);
    await expect(
      errorCode(
        exhausted.service.pause({
          organizationId: 'org-1',
          actorId: 'user-1',
        }),
      ),
    ).resolves.toEqual({
      status: HttpStatus.CONFLICT,
      code: 'AGENT_CONTROL_CAS_CONFLICT',
    });
  });

  it('imports a rolling legacy pause before resume so revision and audit cannot be bypassed', async () => {
    const { service, state, legacyPaused, audit } = fixture({
      state: 'RUNNING',
      revision: 4,
      legacyPaused: true,
    });

    await expect(
      errorCode(
        service.resume({
          organizationId: 'org-1',
          actorId: 'user-1',
          expectedRevision: 4,
          reason: 'Resume after inspection',
        }),
      ),
    ).resolves.toEqual({
      status: HttpStatus.CONFLICT,
      code: 'AGENT_CONTROL_REVISION_CONFLICT',
    });
    expect(state()).toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 5,
    });
    expect(legacyPaused()).toBe(true);
    expect(audit.appendStrict).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actorId: 'system:legacy-kill-switch',
        action: 'organization-agent-control.reconcile-legacy',
        before: expect.objectContaining({ state: 'RUNNING', revision: 4 }),
        after: expect.objectContaining({
          state: 'PAUSE_REQUESTED',
          revision: 5,
        }),
      }),
    );

    await expect(
      service.resume({
        organizationId: 'org-1',
        actorId: 'user-1',
        expectedRevision: 5,
        reason: 'Resume after inspection',
      }),
    ).resolves.toMatchObject({
      state: 'RUNNING',
      revision: 6,
      paused: false,
      requestedBy: 'user-1',
      requestReason: 'Resume after inspection',
    });
    expect(state()).toMatchObject({ state: 'RUNNING', revision: 6 });
    expect(legacyPaused()).toBe(false);
    expect(audit.appendStrict).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorId: 'user-1',
        action: 'organization-agent-control.resume',
        before: expect.objectContaining({
          state: 'PAUSE_REQUESTED',
          revision: 5,
        }),
        after: expect.objectContaining({ state: 'RUNNING', revision: 6 }),
      }),
    );
  });

  it('imports a rolling legacy pause once while keeping the pause command idempotent', async () => {
    const { service, state, audit } = fixture({
      state: 'RUNNING',
      revision: 10,
      legacyPaused: true,
    });

    await expect(
      service.pause({
        organizationId: 'org-1',
        actorId: 'user-1',
        expectedRevision: 10,
      }),
    ).resolves.toMatchObject({ state: 'PAUSE_REQUESTED', revision: 11 });
    expect(state()).toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 11,
    });
    expect(audit.appendStrict).toHaveBeenCalledTimes(1);
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization-agent-control.reconcile-legacy',
      }),
    );

    await expect(
      service.pause({
        organizationId: 'org-1',
        actorId: 'user-1',
        expectedRevision: 11,
      }),
    ).resolves.toMatchObject({ state: 'PAUSE_REQUESTED', revision: 11 });
    expect(audit.appendStrict).toHaveBeenCalledTimes(1);
  });

  it('returns the committed control state when audit persistence fails', async () => {
    const { service, audit, state } = fixture();
    audit.appendStrict.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.pause({
        organizationId: 'org-1',
        actorId: 'user-1',
      }),
    ).resolves.toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 1,
    });
    expect(state()?.state).toBe('PAUSE_REQUESTED');
  });

  it('uses durable non-running state first and lets a rolling legacy pause tighten RUNNING', async () => {
    const durable = fixture({ state: 'STOP_REQUESTED', revision: 9 });
    durable.tx.featureFlag.findUnique.mockResolvedValueOnce({ enabled: true });
    await expect(durable.service.getEffectiveState('org-1')).resolves.toBe(
      'STOP_REQUESTED',
    );
    expect(durable.tx.featureFlag.findUnique).not.toHaveBeenCalled();

    const rollingLegacyPause = fixture({ state: 'RUNNING', revision: 4 });
    rollingLegacyPause.tx.featureFlag.findUnique.mockResolvedValueOnce({
      enabled: true,
    });
    await expect(
      rollingLegacyPause.service.getEffectiveState('org-1'),
    ).resolves.toBe('PAUSE_REQUESTED');

    const legacy = fixture();
    legacy.tx.organizationAgentControl.findUnique.mockResolvedValueOnce(null);
    legacy.tx.featureFlag.findUnique.mockResolvedValueOnce({ enabled: true });
    await expect(legacy.service.getEffectiveState('org-1')).resolves.toBe(
      'PAUSE_REQUESTED',
    );
  });

  it('reports a rolling legacy pause instead of exposing RUNNING status', async () => {
    const rollingLegacyPause = fixture({ state: 'RUNNING', revision: 4 });
    rollingLegacyPause.tx.featureFlag.findUnique.mockResolvedValueOnce({
      enabled: true,
    });

    await expect(
      rollingLegacyPause.service.status('org-1'),
    ).resolves.toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 4,
      paused: true,
      intakeAllowed: false,
      schedulerAllowed: false,
      resumable: true,
    });

    const legacyOnly = fixture();
    legacyOnly.tx.featureFlag.findUnique.mockResolvedValueOnce({
      enabled: true,
    });
    await expect(legacyOnly.service.status('org-1')).resolves.toMatchObject({
      state: 'PAUSE_REQUESTED',
      revision: 0,
      paused: true,
      intakeAllowed: false,
    });
  });
});
