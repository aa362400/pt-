import { AutomationStepExecutionsService } from '../src/features/automation/automation-step-executions.service.js';

type ControlState = 'RUNNING' | 'PAUSE_REQUESTED' | 'STOP_REQUESTED';

const createHarness = (input: {
  controlState: ControlState;
  controlRevision: number;
  run: {
    status: string;
    controlRevision: number;
    checkpointStepIndex?: number | null;
    leaseExpiresAt?: Date | null;
  };
}) => {
  const tx = {
    automationRun: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'run-1',
        checkpointStepIndex: null,
        leaseExpiresAt: null,
        ...input.run,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    automationStepExecution: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      (_organizationId: string, operation: (client: typeof tx) => unknown) =>
        operation(tx),
    ),
  };
  const control = {
    lockEffectiveState: jest.fn().mockResolvedValue({
      state: input.controlState,
      revision: input.controlRevision,
    }),
  };
  const service = new (AutomationStepExecutionsService as any)(
    tenantDatabase,
    control,
  ) as AutomationStepExecutionsService;
  return { service, tenantDatabase, control, tx };
};

describe('AutomationStepExecutionsService durable control gate', () => {
  it.each([
    ['PAUSE_REQUESTED', 'PAUSED', 'paused'],
    ['STOP_REQUESTED', 'STOPPED', 'stopped'],
  ] as const)(
    'acknowledges a queued PENDING run when control is %s',
    async (controlState, persistedStatus, outcome) => {
      const now = new Date('2026-07-16T12:00:00.000Z');
      const { service, control, tx } = createHarness({
        controlState,
        controlRevision: 4,
        run: { status: 'PENDING', controlRevision: 3 },
      });

      await expect(
        service.claimRun({
          organizationId: 'org-1',
          automationRunId: 'run-1',
          leaseOwner: 'worker-1',
          expectedControlRevision: 3,
          now,
        }),
      ).resolves.toEqual({
        outcome,
        controlRevision: 4,
        checkpointStepIndex: null,
      });

      expect(control.lockEffectiveState).toHaveBeenCalledWith(tx, 'org-1');
      expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'run-1',
          flow: { organizationId: 'org-1' },
          status: 'PENDING',
          controlRevision: 3,
        },
        data: expect.objectContaining({
          status: persistedStatus,
          controlRevision: 4,
          leaseOwner: null,
          leaseExpiresAt: null,
          checkpointedAt: now,
        }),
      });
    },
  );

  it('resumes a PAUSED run under the current RUNNING revision', async () => {
    const now = new Date('2026-07-16T12:01:00.000Z');
    const { service, tx } = createHarness({
      controlState: 'RUNNING',
      controlRevision: 6,
      run: {
        status: 'PAUSED',
        controlRevision: 5,
        checkpointStepIndex: 2,
      },
    });

    await expect(
      service.claimRun({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        leaseOwner: 'worker-1',
        expectedControlRevision: 5,
        now,
      }),
    ).resolves.toEqual({
      outcome: 'claimed',
      controlRevision: 6,
      checkpointStepIndex: 2,
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        flow: { organizationId: 'org-1' },
        status: 'PAUSED',
        controlRevision: 5,
      },
      data: expect.objectContaining({
        status: 'RUNNING',
        controlRevision: 6,
        leaseOwner: 'worker-1',
        attempt: { increment: 1 },
      }),
    });
  });

  it('claims a PAUSED run after the resume dispatcher advances its revision', async () => {
    const { service, tx } = createHarness({
      controlState: 'RUNNING',
      controlRevision: 7,
      run: {
        status: 'PAUSED',
        controlRevision: 7,
        checkpointStepIndex: 2,
      },
    });

    await expect(
      service.claimRun({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        leaseOwner: 'worker-1',
        expectedControlRevision: 7,
      }),
    ).resolves.toEqual({
      outcome: 'claimed',
      controlRevision: 7,
      checkpointStepIndex: 2,
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PAUSED',
          controlRevision: 7,
        }),
        data: expect.objectContaining({
          status: 'RUNNING',
          controlRevision: 7,
        }),
      }),
    );
  });

  it('fails closed when a PENDING claim carries a stale control revision', async () => {
    const { service, tx } = createHarness({
      controlState: 'RUNNING',
      controlRevision: 8,
      run: { status: 'PENDING', controlRevision: 7 },
    });

    await expect(
      service.claimRun({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        leaseOwner: 'worker-1',
        expectedControlRevision: 7,
      }),
    ).resolves.toEqual({
      outcome: 'stale',
      controlRevision: 8,
      checkpointStepIndex: null,
    });
    expect(tx.automationRun.updateMany).not.toHaveBeenCalled();
  });

  it('does not steal an active RUNNING lease while acknowledging STOP', async () => {
    const { service, tx } = createHarness({
      controlState: 'STOP_REQUESTED',
      controlRevision: 9,
      run: {
        status: 'RUNNING',
        controlRevision: 8,
        leaseExpiresAt: new Date('2026-07-16T12:10:00.000Z'),
      },
    });

    await expect(
      service.claimRun({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        leaseOwner: 'worker-2',
        expectedControlRevision: 8,
        now: new Date('2026-07-16T12:05:00.000Z'),
      }),
    ).resolves.toEqual({
      outcome: 'unavailable',
      controlRevision: 9,
      checkpointStepIndex: null,
    });
    expect(tx.automationRun.updateMany).not.toHaveBeenCalled();
  });

  it('acknowledges PAUSE at the next step boundary without claiming the step', async () => {
    const now = new Date('2026-07-16T12:06:00.000Z');
    const { service, control, tx } = createHarness({
      controlState: 'PAUSE_REQUESTED',
      controlRevision: 10,
      run: {
        status: 'RUNNING',
        controlRevision: 9,
        checkpointStepIndex: 1,
      },
    });

    await expect(
      service.claimStep({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        stepKey: 'second',
        stepIndex: 1,
        action: 'product.research',
        leaseOwner: 'worker-1',
        expectedControlRevision: 9,
        expectedCheckpointStepIndex: 1,
        now,
      }),
    ).resolves.toEqual({
      outcome: 'paused',
      controlRevision: 10,
      checkpointStepIndex: 1,
    });
    expect(control.lockEffectiveState).toHaveBeenCalledWith(tx, 'org-1');
    expect(tx.automationStepExecution.updateMany).not.toHaveBeenCalled();
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        flow: { organizationId: 'org-1' },
        status: 'RUNNING',
        leaseOwner: 'worker-1',
        controlRevision: 9,
        checkpointStepIndex: 1,
      },
      data: {
        status: 'PAUSED',
        controlRevision: 10,
        checkpointedAt: now,
        finishedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });

  it('claims the next step only after CASing the run boundary', async () => {
    const now = new Date('2026-07-16T12:07:00.000Z');
    const { service, tx } = createHarness({
      controlState: 'RUNNING',
      controlRevision: 12,
      run: {
        status: 'RUNNING',
        controlRevision: 12,
        checkpointStepIndex: 2,
      },
    });

    await expect(
      service.claimStep({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        stepKey: 'third',
        stepIndex: 2,
        action: 'product.research',
        leaseOwner: 'worker-1',
        expectedControlRevision: 12,
        expectedCheckpointStepIndex: 2,
        now,
      }),
    ).resolves.toEqual({
      outcome: 'claimed',
      controlRevision: 12,
      checkpointStepIndex: 2,
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        flow: { organizationId: 'org-1' },
        status: 'RUNNING',
        leaseOwner: 'worker-1',
        controlRevision: 12,
        checkpointStepIndex: 2,
      },
      data: {
        controlRevision: 12,
        leaseExpiresAt: new Date('2026-07-16T12:17:00.000Z'),
      },
    });
  });

  it('commits a finished step and PAUSED checkpoint in one transaction', async () => {
    const now = new Date('2026-07-16T12:02:00.000Z');
    const { service, tenantDatabase, tx } = createHarness({
      controlState: 'PAUSE_REQUESTED',
      controlRevision: 10,
      run: { status: 'RUNNING', controlRevision: 9 },
    });

    await expect(
      service.finishStep({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        stepKey: 'research',
        stepIndex: 1,
        leaseOwner: 'worker-1',
        expectedControlRevision: 9,
        expectedCheckpointStepIndex: 1,
        result: { status: 'completed' },
        now,
      }),
    ).resolves.toEqual({
      outcome: 'paused',
      controlRevision: 10,
      checkpointStepIndex: 2,
    });

    expect(tenantDatabase.run).toHaveBeenCalledTimes(1);
    expect(tx.automationStepExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'RUNNING',
          leaseOwner: 'worker-1',
        }),
      }),
    );
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        flow: { organizationId: 'org-1' },
        status: 'RUNNING',
        leaseOwner: 'worker-1',
        controlRevision: 9,
        checkpointStepIndex: 1,
      },
      data: {
        status: 'PAUSED',
        checkpointStepIndex: 2,
        checkpointedAt: now,
        controlRevision: 10,
        finishedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });

  it('advances the checkpoint and lease when control remains RUNNING', async () => {
    const now = new Date('2026-07-16T12:02:30.000Z');
    const { service, tx } = createHarness({
      controlState: 'RUNNING',
      controlRevision: 10,
      run: { status: 'RUNNING', controlRevision: 10 },
    });

    await expect(
      service.finishStep({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        stepKey: 'research',
        stepIndex: 2,
        leaseOwner: 'worker-1',
        expectedControlRevision: 10,
        expectedCheckpointStepIndex: 2,
        result: { status: 'completed' },
        now,
      }),
    ).resolves.toEqual({
      outcome: 'continue',
      controlRevision: 10,
      checkpointStepIndex: 3,
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        flow: { organizationId: 'org-1' },
        status: 'RUNNING',
        leaseOwner: 'worker-1',
        controlRevision: 10,
        checkpointStepIndex: 2,
      },
      data: {
        status: 'RUNNING',
        checkpointStepIndex: 3,
        checkpointedAt: now,
        controlRevision: 10,
        leaseExpiresAt: new Date('2026-07-16T12:12:30.000Z'),
      },
    });
  });

  it('checkpoints the completed step before acknowledging STOPPED', async () => {
    const now = new Date('2026-07-16T12:02:45.000Z');
    const { service, tx } = createHarness({
      controlState: 'STOP_REQUESTED',
      controlRevision: 11,
      run: { status: 'RUNNING', controlRevision: 10 },
    });

    await expect(
      service.finishStep({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        stepKey: 'research',
        stepIndex: 0,
        leaseOwner: 'worker-1',
        expectedControlRevision: 10,
        expectedCheckpointStepIndex: null,
        result: { status: 'completed' },
        now,
      }),
    ).resolves.toEqual({
      outcome: 'stopped',
      controlRevision: 11,
      checkpointStepIndex: 1,
    });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'STOPPED',
          checkpointStepIndex: 1,
          controlRevision: 11,
          finishedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        }),
      }),
    );
  });

  it('checks the control lock again before completing a run', async () => {
    const now = new Date('2026-07-16T12:03:00.000Z');
    const { service, tx } = createHarness({
      controlState: 'STOP_REQUESTED',
      controlRevision: 12,
      run: { status: 'RUNNING', controlRevision: 11 },
    });

    await expect(
      service.finishRun({
        organizationId: 'org-1',
        automationRunId: 'run-1',
        leaseOwner: 'worker-1',
        expectedControlRevision: 11,
        status: 'COMPLETED',
        result: { steps: [] },
        now,
      } as never),
    ).resolves.toEqual({ outcome: 'stopped', controlRevision: 12 });
    expect(tx.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        flow: { organizationId: 'org-1' },
        status: 'RUNNING',
        leaseOwner: 'worker-1',
        controlRevision: 11,
      },
      data: {
        status: 'STOPPED',
        controlRevision: 12,
        checkpointedAt: now,
        finishedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });

  it('releases only the RUNNING lease at the expected control revision', async () => {
    const { service, tx } = createHarness({
      controlState: 'RUNNING',
      controlRevision: 14,
      run: { status: 'RUNNING', controlRevision: 14 },
    });

    await service.releaseRun({
      organizationId: 'org-1',
      automationRunId: 'run-1',
      leaseOwner: 'worker-1',
      expectedControlRevision: 14,
      finalAttempt: false,
      error: new Error('temporary'),
    });

    expect(tx.automationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'run-1',
          flow: { organizationId: 'org-1' },
          status: 'RUNNING',
          leaseOwner: 'worker-1',
          controlRevision: 14,
        },
      }),
    );
  });
});
