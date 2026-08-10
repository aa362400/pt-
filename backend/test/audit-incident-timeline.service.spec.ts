import { BadRequestException } from '@nestjs/common';
import { AuditLogsService } from '../src/features/audit-logs/audit-logs.service.js';

function createService(overrides?: {
  agentRuns?: unknown[];
  automationRuns?: unknown[];
  externalSubmissions?: unknown[];
  auditLogs?: unknown[];
}) {
  const tx = {
    agentRun: {
      findMany: jest.fn().mockResolvedValue(overrides?.agentRuns ?? []),
    },
    automationRun: {
      findMany: jest.fn().mockResolvedValue(overrides?.automationRuns ?? []),
    },
    externalSubmission: {
      findMany: jest
        .fn()
        .mockResolvedValue(overrides?.externalSubmissions ?? []),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue(overrides?.auditLogs ?? []),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      (_organizationId: string, operation: (client: typeof tx) => unknown) =>
        operation(tx),
    ),
  };
  return {
    service: new AuditLogsService(
      {} as any,
      {} as any,
      {} as any,
      tenantDatabase as any,
    ),
    tx,
  };
}

const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

describe('AuditLogsService incident timeline', () => {
  it('requires exactly one correlation selector', async () => {
    const { service } = createService();

    await expect(service.incidentTimeline(user, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.incidentTimeline(user, {
        agentRunId: 'run-1',
        traceId: 'trace-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('builds a customer-readable Agent transition timeline', async () => {
    const { service } = createService({
      agentRuns: [
        {
          id: 'run-1',
          traceId: 'trace-1',
          transitions: [
            {
              id: 'transition-1',
              eventType: 'ACTION_PROPOSED',
              fromStatus: 'RUNNING',
              toStatus: 'WAITING_APPROVAL',
              attempt: 1,
              createdAt: new Date('2026-07-15T01:00:00.000Z'),
            },
          ],
        },
      ],
    });

    const result = await service.incidentTimeline(user, {
      agentRunId: 'run-1',
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        eventCount: 1,
        hasExternalWrite: false,
        needsAttention: false,
      }),
    );
    expect(result.events[0]).toEqual(
      expect.objectContaining({
        source: 'AGENT',
        title: 'textriskenglish_texthumanapproval',
        detail: 'english_text → texthumanapproval，text 1 english_text',
      }),
    );
  });

  it('marks an ambiguous Ozon submission as requiring attention', async () => {
    const { service } = createService({
      externalSubmissions: [
        {
          id: 'submission-1',
          productLaunchId: 'launch-1',
          publishSnapshotId: 'snapshot-1',
          provider: 'OZON',
          operation: 'PRODUCT_PUBLISH',
          status: 'UNKNOWN',
          externalTaskId: null,
          externalProductId: null,
          failureCode: 'NETWORK_OUTCOME_UNKNOWN',
          failureMessage: 'platformenglish_text。',
          claimedAt: new Date('2026-07-15T01:01:00.000Z'),
          requestSentAt: new Date('2026-07-15T01:02:00.000Z'),
          responseReceivedAt: null,
          acknowledgedAt: null,
          resolvedAt: null,
          createdAt: new Date('2026-07-15T01:00:00.000Z'),
          updatedAt: new Date('2026-07-15T01:03:00.000Z'),
        },
      ],
    });

    const result = await service.incidentTimeline(user, {
      externalSubmissionId: 'submission-1',
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        status: 'NEEDS_ATTENTION',
        hasExternalWrite: true,
        needsAttention: true,
      }),
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'requestenglish_text Ozon' }),
        expect.objectContaining({
          title: 'Ozon english_texthumantext',
          severity: 'error',
        }),
      ]),
    );
  });
});
