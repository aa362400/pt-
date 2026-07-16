import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ExternalSubmissionsService } from '../src/features/product-launch/external-submissions.service.js';

function matchesStatus(actual: string, expected: unknown): boolean {
  if (typeof expected === 'string') return actual === expected;
  if (
    expected &&
    typeof expected === 'object' &&
    'in' in expected &&
    Array.isArray((expected as { in: unknown[] }).in)
  ) {
    return (expected as { in: unknown[] }).in.includes(actual);
  }
  return true;
}

function createService() {
  const publishExecutionGrant = 'plg_test-grant';
  let submission: Record<string, any> | null = null;
  let launch: Record<string, any> = {
    id: 'launch-1',
    organizationId: 'org-1',
    status: 'QUEUED',
    confirmAutoPublish: true,
    imageGenerationApproved: true,
    selectedPublishSnapshotId: 'snapshot-1',
    approvedPublishSnapshotHash: 'a'.repeat(64),
    publishExecutionGrantHash: createHash('sha256')
      .update(publishExecutionGrant)
      .digest('hex'),
    publishExecutionGrantScope: 'action:ozon.listing.publish',
    publishExecutionGrantSnapshotHash: 'a'.repeat(64),
    publishExecutionGrantExpiresAt: new Date(Date.now() + 60_000),
    publishExecutionGrantConsumedAt: null,
  };
  const snapshot = {
    id: 'snapshot-1',
    organizationId: 'org-1',
    productLaunchId: 'launch-1',
    snapshotHash: 'a'.repeat(64),
    snapshot: {
      schemaVersion: 'listing-publish-snapshot/v1',
      payload: {
        offerId: 'APPROVED-SKU-1',
        name: 'Approved product',
        price: 1999,
        images: ['https://assets.example.com/approved.png'],
      },
    },
  };

  const externalTable = {
    upsert: jest.fn(({ create }: any) => {
      submission ??= {
        id: 'submission-1',
        status: 'PREPARED',
        attemptCount: 0,
        claimToken: null,
        ...create,
      };
      return Promise.resolve({ ...submission });
    }),
    findFirst: jest.fn(({ where }: any) =>
      Promise.resolve(
        submission &&
          submission.organizationId === where.organizationId &&
          submission.publishSnapshotId === where.publishSnapshotId
          ? { ...submission }
          : null,
      ),
    ),
    updateMany: jest.fn(({ where, data }: any) => {
      if (
        !submission ||
        submission.id !== where.id ||
        !matchesStatus(submission.status, where.status) ||
        (where.claimToken !== undefined &&
          submission.claimToken !== where.claimToken)
      ) {
        return Promise.resolve({ count: 0 });
      }
      submission = {
        ...submission,
        ...data,
        attemptCount:
          typeof data.attemptCount?.increment === 'number'
            ? submission.attemptCount + data.attemptCount.increment
            : submission.attemptCount,
      };
      return Promise.resolve({ count: 1 });
    }),
    update: jest.fn(({ data }: any) => {
      submission = { ...submission, ...data };
      return Promise.resolve({ ...submission });
    }),
  };
  const launchTable = {
    updateMany: jest.fn(({ where, data }: any) => {
      if (
        launch.id !== where.id ||
        launch.organizationId !== where.organizationId ||
        !matchesStatus(launch.status, where.status) ||
        (where.confirmAutoPublish !== undefined &&
          launch.confirmAutoPublish !== where.confirmAutoPublish) ||
        (where.imageGenerationApproved !== undefined &&
          launch.imageGenerationApproved !== where.imageGenerationApproved) ||
        (where.selectedPublishSnapshotId !== undefined &&
          launch.selectedPublishSnapshotId !==
            where.selectedPublishSnapshotId) ||
        (where.approvedPublishSnapshotHash !== undefined &&
          launch.approvedPublishSnapshotHash !==
            where.approvedPublishSnapshotHash) ||
        (where.publishExecutionGrantHash !== undefined &&
          launch.publishExecutionGrantHash !==
            where.publishExecutionGrantHash) ||
        (where.publishExecutionGrantScope !== undefined &&
          launch.publishExecutionGrantScope !==
            where.publishExecutionGrantScope) ||
        (where.publishExecutionGrantSnapshotHash !== undefined &&
          launch.publishExecutionGrantSnapshotHash !==
            where.publishExecutionGrantSnapshotHash) ||
        (where.publishExecutionGrantConsumedAt === null &&
          launch.publishExecutionGrantConsumedAt !== null) ||
        (where.publishExecutionGrantExpiresAt?.gt instanceof Date &&
          (!(launch.publishExecutionGrantExpiresAt instanceof Date) ||
            launch.publishExecutionGrantExpiresAt <=
              where.publishExecutionGrantExpiresAt.gt))
      ) {
        return Promise.resolve({ count: 0 });
      }
      launch = { ...launch, ...data };
      return Promise.resolve({ count: 1 });
    }),
  };
  const snapshotTable = {
    findFirst: jest.fn(({ where }: any) =>
      Promise.resolve(
        snapshot.id === where.id &&
          snapshot.organizationId === where.organizationId &&
          snapshot.productLaunchId === where.productLaunchId &&
          snapshot.snapshotHash === where.snapshotHash
          ? snapshot
          : null,
      ),
    ),
  };
  const tenantDatabase = {
    run: jest.fn(
      async (_organizationId: string, operation: (tx: any) => unknown) => {
        const beforeSubmission = submission ? { ...submission } : null;
        const beforeLaunch = { ...launch };
        try {
          return await operation({
            externalSubmission: externalTable,
            productLaunch: launchTable,
            listingPublishSnapshot: snapshotTable,
          });
        } catch (error) {
          submission = beforeSubmission;
          launch = beforeLaunch;
          throw error;
        }
      },
    ),
  };
  return {
    service: new ExternalSubmissionsService(tenantDatabase as any),
    externalTable,
    launchTable,
    currentSubmission: () => submission,
    currentLaunch: () => launch,
    publishExecutionGrant,
    setSubmission: (value: Record<string, any>) => {
      submission = { ...value };
    },
  };
}

const prepared = {
  organizationId: 'org-1',
  productLaunchId: 'launch-1',
  publishSnapshotId: 'snapshot-1',
  snapshotHash: 'a'.repeat(64),
};

describe('ExternalSubmissionsService', () => {
  it('saves a separate payload hash for the immutable approved request', async () => {
    const { service, currentSubmission } = createService();

    await service.prepare(prepared);

    expect(currentSubmission()).toEqual(
      expect.objectContaining({
        requestHash: prepared.snapshotHash,
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(currentSubmission()?.payloadHash).not.toBe(prepared.snapshotHash);
  });

  it('atomically claims both ProductLaunch and its immutable submission', async () => {
    const { service, currentLaunch, currentSubmission } = createService();
    await service.prepare(prepared);

    await service.claimLaunchForSend(prepared, {
      claimToken: 'claim-a',
      execution: { ozonSubmission: 'claimed' },
    });

    expect(currentLaunch()).toEqual(
      expect.objectContaining({ status: 'SUBMITTING_TO_OZON' }),
    );
    expect(currentSubmission()).toEqual(
      expect.objectContaining({
        status: 'CLAIMED',
        claimToken: 'claim-a',
        attemptCount: 1,
      }),
    );
  });

  it('rolls back the ProductLaunch claim when the submission claim loses the race', async () => {
    const { service, currentLaunch, setSubmission } = createService();
    setSubmission({
      id: 'submission-1',
      organizationId: 'org-1',
      productLaunchId: 'launch-1',
      publishSnapshotId: 'snapshot-1',
      requestHash: prepared.snapshotHash,
      payloadHash: null,
      provider: 'OZON',
      idempotencyKey: `product-launch:launch-1:snapshot:${prepared.snapshotHash}`,
      status: 'CLAIMED',
      claimToken: 'winner',
      attemptCount: 1,
    });

    await expect(
      service.claimLaunchForSend(prepared, {
        claimToken: 'loser',
        execution: { ozonSubmission: 'claimed' },
      }),
    ).rejects.toMatchObject({
      code: 'EXTERNAL_SUBMISSION_REQUIRES_RECONCILIATION',
    });

    expect(currentLaunch().status).toBe('QUEUED');
  });

  it('allows only the active claim token to record a response', async () => {
    const { service, currentSubmission, publishExecutionGrant } =
      createService();
    await service.prepare(prepared);
    await service.claimLaunchForSend(prepared, {
      claimToken: 'claim-a',
      execution: { ozonSubmission: 'claimed' },
    });
    await service.markRequestStarted(
      prepared,
      'claim-a',
      publishExecutionGrant,
    );

    await expect(
      service.recordResult(
        prepared,
        { status: 'SUBMITTED_TO_OZON', taskId: 42 },
        'stale-claim',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(currentSubmission()).toEqual(
      expect.objectContaining({
        status: 'REQUEST_SENT',
      }),
    );
    expect(currentSubmission()).not.toHaveProperty('externalTaskId');
  });

  it('moves an ambiguous request through reconciliation without sending again', async () => {
    const { service, currentSubmission, publishExecutionGrant } =
      createService();
    await service.prepare(prepared);
    await service.claimLaunchForSend(prepared, {
      claimToken: 'claim-a',
      execution: { ozonSubmission: 'claimed' },
    });
    await service.markRequestStarted(
      prepared,
      'claim-a',
      publishExecutionGrant,
    );
    await service.recordUnknown(
      prepared,
      new Error('connection reset'),
      'claim-a',
    );
    await service.beginReconciliation(prepared, {
      source: 'ozon_offer_readback',
      found: false,
    });

    expect(currentSubmission()).toEqual(
      expect.objectContaining({
        status: 'RECONCILING',
        reconciliationResult: expect.objectContaining({ found: false }),
      }),
    );

    await service.recordReconciledResult(
      prepared,
      {
        status: 'SUBMITTED_TO_OZON',
        externalProductId: 1001,
        channelId: 'channel-1',
      },
      { source: 'ozon_offer_readback', found: true },
    );

    expect(currentSubmission()).toEqual(
      expect.objectContaining({
        status: 'ACKNOWLEDGED',
        externalProductId: '1001',
        reconciliationResult: expect.objectContaining({ found: true }),
      }),
    );
  });

  it('promotes an acknowledged submission to succeeded on an active readback idempotently', async () => {
    const { service, currentSubmission, publishExecutionGrant } =
      createService();
    await service.prepare(prepared);
    await service.claimLaunchForSend(prepared, {
      claimToken: 'claim-a',
      execution: { ozonSubmission: 'claimed' },
    });
    await service.markRequestStarted(
      prepared,
      'claim-a',
      publishExecutionGrant,
    );
    await service.recordResult(
      prepared,
      { status: 'SUBMITTED_TO_OZON', taskId: 42 },
      'claim-a',
    );

    const activeReadback = {
      status: 'ACTIVE_ON_OZON',
      taskId: 42,
      externalProductId: 1001,
      channelId: 'channel-1',
    };
    const evidence = { source: 'ozon_offer_readback', found: true };
    await service.recordReconciledResult(prepared, activeReadback, evidence);
    await service.recordReconciledResult(prepared, activeReadback, evidence);

    expect(currentSubmission()).toEqual(
      expect.objectContaining({
        status: 'SUCCEEDED',
        externalTaskId: '42',
        externalProductId: '1001',
        failureCode: null,
        failureMessage: null,
        reconciliationResult: expect.objectContaining({
          source: 'ozon_offer_readback',
          found: true,
          resultStatus: 'ACTIVE_ON_OZON',
        }),
      }),
    );
  });

  it('atomically rejects an invalid publish execution grant before request dispatch', async () => {
    const { service, currentLaunch, currentSubmission } = createService();
    await service.prepare(prepared);
    await service.claimLaunchForSend(prepared, {
      claimToken: 'claim-a',
      execution: { ozonSubmission: 'claimed' },
    });

    await expect(
      service.markRequestStarted(prepared, 'claim-a', 'plg_wrong'),
    ).rejects.toMatchObject({ code: 'PUBLISH_EXECUTION_GRANT_INVALID' });

    expect(currentLaunch().publishExecutionGrantConsumedAt).toBeNull();
    expect(currentSubmission()?.status).toBe('CLAIMED');
  });

  it('consumes the exact publish execution grant once and rejects replay', async () => {
    const { service, currentLaunch, publishExecutionGrant } = createService();
    await service.prepare(prepared);
    await service.claimLaunchForSend(prepared, {
      claimToken: 'claim-a',
      execution: { ozonSubmission: 'claimed' },
    });

    await service.markRequestStarted(
      prepared,
      'claim-a',
      publishExecutionGrant,
    );
    expect(currentLaunch().publishExecutionGrantConsumedAt).toBeInstanceOf(
      Date,
    );

    await expect(
      service.markRequestStarted(prepared, 'claim-a', publishExecutionGrant),
    ).rejects.toMatchObject({ code: 'PUBLISH_EXECUTION_GRANT_INVALID' });
  });
});
