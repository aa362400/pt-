import { ProductLaunchRecoveryService } from '../src/features/product-launch/product-launch-recovery.service.js';

const organizationId = 'org-1';
const now = new Date('2026-07-16T12:00:00.000Z');
const staleUpdatedAt = new Date('2026-07-16T11:50:00.000Z');

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

function createHarness(readback: 'ACTIVE_ON_OZON' | 'SUBMITTED_TO_OZON') {
  let launch: Record<string, any> = {
    id: 'launch-1',
    organizationId,
    productId: 'product-1',
    requestedBy: 'user-1',
    imageProjectId: 'image-project-1',
    selectedPublishSnapshotId: 'snapshot-1',
    approvedPublishSnapshotHash: 'a'.repeat(64),
    status: 'RECOVERING',
    failureCode: 'OZON_ACTIVATION_PENDING',
    failureMessage: 'Waiting for Ozon activation readback',
    completedAt: null,
    updatedAt: staleUpdatedAt,
  };
  let submission: Record<string, any> = {
    id: 'submission-1',
    organizationId,
    productLaunchId: launch.id,
    publishSnapshotId: launch.selectedPublishSnapshotId,
    requestHash: launch.approvedPublishSnapshotHash,
    status: 'ACKNOWLEDGED',
    externalTaskId: '42',
    updatedAt: staleUpdatedAt,
  };

  const tx = {
    productLaunch: {
      findMany: jest.fn(({ where }: any) => {
        const staleBefore = where.updatedAt?.lte as Date | undefined;
        const due =
          matchesStatus(launch.status, where.status) &&
          (!staleBefore || launch.updatedAt <= staleBefore);
        return Promise.resolve(
          due
            ? [
                {
                  ...launch,
                  externalSubmissions: [{ ...submission }],
                },
              ]
            : [],
        );
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        if (
          launch.id !== where.id ||
          launch.organizationId !== where.organizationId ||
          !matchesStatus(launch.status, where.status)
        ) {
          return Promise.resolve({ count: 0 });
        }
        launch = { ...launch, ...data, updatedAt: now };
        return Promise.resolve({ count: 1 });
      }),
    },
    externalSubmission: {
      findMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve([{ ...submission }])),
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...submission })),
    },
    listingPublishSnapshot: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    product: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    organization: {
      findMany: jest.fn().mockResolvedValue([{ id: organizationId }]),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (
        _organizationId: string,
        operation: (client: typeof tx) => unknown,
      ) => operation(tx),
    ),
  };
  const ozonPublisher = {
    preflightSnapshot: jest.fn().mockResolvedValue({
      status: readback,
      channelId: 'ozon-channel-1',
      taskId: 42,
      externalProductId: 777,
      externalStatus: readback === 'ACTIVE_ON_OZON' ? 'ONLINE' : 'PROCESSING',
      evidence: { source: 'ozon_offer_readback' },
    }),
    publishSnapshot: jest.fn(),
  };
  const externalSubmissions = {
    find: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...submission })),
    beginReconciliation: jest.fn().mockResolvedValue(undefined),
    recordReconciledResult: jest.fn(
      async (_identity: unknown, result: { status: string }) => {
        submission = {
          ...submission,
          status:
            result.status === 'ACTIVE_ON_OZON' ? 'SUCCEEDED' : 'ACKNOWLEDGED',
          updatedAt: now,
        };
        return { ...submission };
      },
    ),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'PRODUCT_LAUNCH_RECOVERY_STALE_AFTER_MS' ? 300_000 : undefined,
    ),
  };
  const actionProposals = {
    reconcileApprovedProductLaunchOutcome: jest.fn().mockResolvedValue({
      updated: true,
      proposalId: 'approval-item-1',
    }),
  };
  const service = new ProductLaunchRecoveryService(
    prisma as any,
    tenantDatabase as any,
    ozonPublisher as any,
    externalSubmissions as any,
    actionProposals as any,
    config as any,
  );

  return {
    service,
    tx,
    ozonPublisher,
    externalSubmissions,
    actionProposals,
    currentLaunch: () => ({ ...launch }),
    currentSubmission: () => ({ ...submission }),
  };
}

describe('ProductLaunchRecoveryService', () => {
  it('turns a stale acknowledged Ozon submission ACTIVE from readback and never imports it again', async () => {
    const {
      service,
      tx,
      ozonPublisher,
      externalSubmissions,
      actionProposals,
      currentLaunch,
      currentSubmission,
    } = createHarness('ACTIVE_ON_OZON');

    await service.scan(now);
    await service.scan(now);

    expect(tx.productLaunch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          status: 'RECOVERING',
          updatedAt: { lte: new Date('2026-07-16T11:55:00.000Z') },
        }),
      }),
    );
    expect(ozonPublisher.preflightSnapshot).toHaveBeenCalledTimes(1);
    expect(ozonPublisher.preflightSnapshot).toHaveBeenCalledWith({
      organizationId,
      snapshotId: 'snapshot-1',
      expectedSnapshotHash: 'a'.repeat(64),
    });
    expect(externalSubmissions.recordReconciledResult).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        productLaunchId: 'launch-1',
        publishSnapshotId: 'snapshot-1',
      }),
      expect.objectContaining({ status: 'ACTIVE_ON_OZON' }),
      expect.objectContaining({ source: 'ozon_offer_readback' }),
    );
    expect(currentLaunch()).toEqual(
      expect.objectContaining({
        status: 'ACTIVE_ON_OZON',
        completedAt: now,
        failureCode: null,
        failureMessage: null,
      }),
    );
    expect(currentSubmission()).toEqual(
      expect.objectContaining({ status: 'SUCCEEDED' }),
    );
    expect(
      actionProposals.reconcileApprovedProductLaunchOutcome,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        productLaunchId: 'launch-1',
        status: 'EXECUTED',
        result: expect.objectContaining({ status: 'ACTIVE_ON_OZON' }),
      }),
    );
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
  });

  it('keeps a submitted-but-not-active launch retryable without issuing a duplicate import', async () => {
    const {
      service,
      ozonPublisher,
      externalSubmissions,
      currentLaunch,
      currentSubmission,
    } = createHarness('SUBMITTED_TO_OZON');

    await service.scan(now);
    await service.scan(new Date('2026-07-16T12:01:00.000Z'));

    expect(ozonPublisher.preflightSnapshot).toHaveBeenCalledTimes(1);
    expect(externalSubmissions.recordReconciledResult).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: 'SUBMITTED_TO_OZON' }),
      expect.objectContaining({ source: 'ozon_offer_readback' }),
    );
    expect(currentLaunch()).toEqual(
      expect.objectContaining({
        status: 'RECOVERING',
        completedAt: null,
        failureCode: 'OZON_ACTIVATION_PENDING',
      }),
    );
    expect(currentSubmission()).toEqual(
      expect.objectContaining({ status: 'ACKNOWLEDGED' }),
    );
    expect(ozonPublisher.publishSnapshot).not.toHaveBeenCalled();
  });
});
