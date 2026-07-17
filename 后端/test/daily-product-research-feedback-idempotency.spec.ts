import { Prisma } from '@prisma/client';
import { DailyProductResearchOrchestratorService } from '../src/features/product-research/daily/services/daily-product-research-orchestrator.service.js';

type ReviewRow = {
  organizationId: string;
  entityType: string;
  entityId: string;
  status: string;
  decisionEvidence: { researchRunId?: string };
};

type NotificationRow = {
  organizationId: string;
  userId: string;
  type: string;
  metadata: { researchRunId?: string };
};

function feedbackFixture(input: { failFirstNotification?: boolean } = {}) {
  const reviews: ReviewRow[] = [];
  const notifications: NotificationRow[] = [];
  let notificationAttempts = 0;
  const tx = {
    reviewTask: {
      findFirst: jest.fn(async ({ where }) =>
        reviews.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.entityType === where.entityType &&
            row.entityId === where.entityId &&
            row.decisionEvidence.researchRunId ===
              where.decisionEvidence?.equals,
        ),
      ),
      create: jest.fn(async ({ data }) => {
        const row = { ...data, status: 'PENDING' } as ReviewRow;
        reviews.push(row);
        return row;
      }),
    },
    notification: {
      findFirst: jest.fn(async ({ where }) =>
        notifications.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.userId === where.userId &&
            row.type === where.type &&
            row.metadata.researchRunId === where.metadata?.equals,
        ),
      ),
      create: jest.fn(async ({ data }) => {
        notificationAttempts += 1;
        if (input.failFirstNotification && notificationAttempts === 1) {
          throw new Error('notification insert failed');
        }
        notifications.push(data as NotificationRow);
        return data;
      }),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (
        _organizationId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => {
        const reviewSnapshot = reviews.slice();
        const notificationSnapshot = notifications.slice();
        try {
          return await operation(tx);
        } catch (error) {
          reviews.splice(0, reviews.length, ...reviewSnapshot);
          notifications.splice(
            0,
            notifications.length,
            ...notificationSnapshot,
          );
          throw error;
        }
      },
    ),
  };
  const service = new DailyProductResearchOrchestratorService(
    tenantDatabase as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const feedback = service as unknown as {
    createReviewTasksAndNotification(
      organizationId: string,
      runId: string,
      userId: string,
      reviewCandidates: Array<{
        candidateId: string;
        finalScore: number;
        hardGateReasons: string[];
        reviewReason: 'ALL_GATES_PASSED' | 'MANUAL_PRICING_REQUIRED';
        manualPricingRequired: boolean;
      }>,
    ): Promise<void>;
  };
  const execute = () =>
    feedback.createReviewTasksAndNotification('org-1', 'run-1', 'user-1', [
      {
        candidateId: 'candidate-1',
        finalScore: 92,
        hardGateReasons: [],
        reviewReason: 'ALL_GATES_PASSED',
        manualPricingRequired: false,
      },
      {
        candidateId: 'candidate-2',
        finalScore: 67,
        hardGateReasons: ['MANUAL_PRICING_REQUIRED'],
        reviewReason: 'MANUAL_PRICING_REQUIRED',
        manualPricingRequired: true,
      },
    ]);
  return {
    execute,
    tenantDatabase,
    tx,
    reviews,
    notifications,
    service,
  };
}

describe('daily product research FEEDBACK idempotency', () => {
  it('routes manual-pricing HOLD candidates into review without admitting ordinary low-score HOLD candidates', () => {
    const fixture = feedbackFixture();
    const service = fixture.service as unknown as {
      feedbackCandidates(ranked: {
        testNow: Array<Record<string, unknown>>;
        hold: Array<Record<string, unknown>>;
      }): Array<Record<string, unknown>>;
    };

    expect(
      service.feedbackCandidates({
        testNow: [
          {
            candidateId: 'candidate-ready',
            finalScore: 91,
            hardGateReasons: [],
            manualReviewEligible: false,
          },
        ],
        hold: [
          {
            candidateId: 'candidate-manual-price',
            finalScore: 67,
            hardGateReasons: [
              'MANUAL_PRICING_REQUIRED',
              'RISK_EVIDENCE_MISSING',
            ],
            manualReviewEligible: true,
          },
          {
            candidateId: 'candidate-low-score',
            finalScore: 52,
            hardGateReasons: [],
            manualReviewEligible: true,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        candidateId: 'candidate-ready',
        reviewReason: 'ALL_GATES_PASSED',
      }),
      expect.objectContaining({
        candidateId: 'candidate-manual-price',
        reviewReason: 'MANUAL_PRICING_REQUIRED',
        manualPricingRequired: true,
      }),
    ]);
  });

  it('deduplicates review tasks and the notification by researchRunId on retry', async () => {
    const fixture = feedbackFixture();

    await fixture.execute();
    await fixture.execute();

    expect(fixture.reviews).toHaveLength(2);
    expect(fixture.notifications).toHaveLength(1);
    expect(fixture.tx.reviewTask.create).toHaveBeenCalledTimes(2);
    expect(fixture.tx.notification.create).toHaveBeenCalledTimes(1);
    expect(fixture.tx.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'candidate-2',
        approvalScope: expect.objectContaining({
          action: 'collect_manual_pricing_and_risk_evidence',
          externalStoreMutation: false,
        }),
        decisionEvidence: expect.objectContaining({
          reviewReason: 'MANUAL_PRICING_REQUIRED',
          manualPricingRequired: true,
        }),
      }),
    });
    expect(fixture.tx.reviewTask.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        decisionEvidence: { path: ['researchRunId'], equals: 'run-1' },
      }),
    });
    expect(fixture.tx.notification.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        metadata: { path: ['researchRunId'], equals: 'run-1' },
      }),
    });
    expect(fixture.tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });

  it('rolls back partially created review tasks when notification creation fails', async () => {
    const fixture = feedbackFixture({ failFirstNotification: true });

    await expect(fixture.execute()).rejects.toThrow(
      'notification insert failed',
    );
    expect(fixture.reviews).toEqual([]);
    expect(fixture.notifications).toEqual([]);

    await fixture.execute();

    expect(fixture.reviews).toHaveLength(2);
    expect(fixture.notifications).toHaveLength(1);
  });
});
