import { BadRequestException } from '@nestjs/common';
import { ReviewService } from '../src/features/review/review.service.js';

const reviewer = {
  sub: 'reviewer-1',
  email: 'reviewer@example.com',
  orgId: 'org-1',
  role: 'OWNER',
} as any;

const completeEvidence = {
  action: 'SUBMIT_COMPLETE' as const,
  currency: 'CNY',
  procurementCost: 12.5,
  domesticShippingCost: 1.2,
  internationalShippingCost: 4.8,
  ozonCommissionRatePercent: 18,
  paymentCollectionFeeRatePercent: 2.5,
  warehousingCost: 0.8,
  advertisingRatePercent: 10,
  refundLossRatePercent: 4,
  taxRatePercent: 6,
  packagingCost: 0.6,
  fxBufferRatePercent: 3,
  notes: '已按供应商当日报价和当前物流方案人工录入。',
  riskEvidence: '供应商报价单编号 Q-20260717，物流方案记录 L-17。',
};

function createService(options?: {
  decisionEvidence?: Record<string, unknown>;
  entityType?: string;
  status?: string;
}) {
  let task: any = {
    id: 'review-1',
    organizationId: 'org-1',
    entityType: options?.entityType ?? 'PRODUCT_RESEARCH',
    entityId: 'candidate-1',
    status: options?.status ?? 'PENDING',
    score: 82,
    threshold: 80,
    autoApproved: false,
    autoRegenerations: 0,
    notes: null,
    assignedTo: null,
    approvalScope: {
      action: 'collect_manual_pricing_and_risk_evidence',
      externalStoreMutation: false,
    },
    decisionEvidence: options?.decisionEvidence ?? {
      researchRunId: 'run-1',
      candidateId: 'candidate-1',
      manualPricingRequired: true,
      hardGateReasons: ['MANUAL_PRICING_REQUIRED'],
    },
    reviewedAt: null,
    createdAt: new Date('2026-07-17T02:00:00.000Z'),
  };
  const prisma: any = {
    reviewTask: {
      findFirst: jest.fn(async () => task),
      update: jest.fn(async ({ data }) => {
        task = { ...task, ...data };
        return task;
      }),
    },
    productResearchReport: { findFirst: jest.fn().mockResolvedValue(null) },
    productCandidate: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const audit = {
    appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const service = new (ReviewService as any)(
    prisma,
    { add: jest.fn() },
    { updateReviewOutcome: jest.fn(), learnFromReview: jest.fn() },
    undefined,
    undefined,
    undefined,
    {
      run: jest.fn(
        (_organizationId: string, operation: (tx: unknown) => unknown) =>
          operation(prisma),
      ),
    },
    audit,
  ) as ReviewService;
  return { service, prisma, audit, getTask: () => task };
}

describe('ReviewService manual pricing evidence', () => {
  it('saves a partial draft as traceable evidence without approving or publishing', async () => {
    const { service, prisma, audit, getTask } = createService();

    const result = await service.updateManualPricing(reviewer, 'review-1', {
      action: 'SAVE_DRAFT',
      currency: 'CNY',
      procurementCost: 12.5,
      notes: '等待物流商补充国际运输报价。',
    });

    expect(result.status).toBe('PENDING');
    expect(getTask().decisionEvidence).toEqual(
      expect.objectContaining({
        researchRunId: 'run-1',
        manualPricingRequired: true,
        manualPricing: expect.objectContaining({
          schemaVersion: 'manual-pricing-evidence/v1',
          state: 'DRAFT',
          revision: 1,
          currency: 'CNY',
          procurementCost: 12.5,
          missingFields: expect.arrayContaining([
            'internationalShippingCost',
            'riskEvidence',
          ]),
          updatedBy: 'reviewer-1',
        }),
      }),
    );
    expect(prisma.reviewTask.update).toHaveBeenCalledWith({
      where: { id: 'review-1' },
      data: expect.objectContaining({
        assignedTo: 'reviewer-1',
        decisionEvidence: expect.any(Object),
      }),
    });
    expect(prisma.reviewTask.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MANUAL_PRICING_DRAFT_SAVED',
        resourceId: 'review-1',
      }),
    );
  });

  it('fails closed when a complete submission omits any required cost or evidence field', async () => {
    const { internationalShippingCost: _omitted, ...incomplete } =
      completeEvidence;
    const { service, prisma, audit } = createService();

    await expect(
      service.updateManualPricing(reviewer, 'review-1', incomplete),
    ).rejects.toMatchObject<Partial<BadRequestException>>({
      response: expect.objectContaining({
        code: 'MANUAL_PRICING_INCOMPLETE',
        missingFields: expect.arrayContaining(['internationalShippingCost']),
      }),
    });
    expect(prisma.reviewTask.update).not.toHaveBeenCalled();
    expect(audit.appendStrict).not.toHaveBeenCalled();
  });

  it('records a complete human submission but never approves the task or triggers publication', async () => {
    const { service, prisma, audit, getTask } = createService();

    const result = await service.updateManualPricing(
      reviewer,
      'review-1',
      completeEvidence,
    );

    expect(result.status).toBe('PENDING');
    expect(getTask().reviewedAt).toBeNull();
    expect(getTask().decisionEvidence.manualPricing).toEqual(
      expect.objectContaining({
        state: 'COMPLETE',
        revision: 1,
        currency: 'CNY',
        internationalShippingCost: 4.8,
        ozonCommissionRatePercent: 18,
        missingFields: [],
        submittedBy: 'reviewer-1',
        submittedAt: expect.any(String),
      }),
    );
    expect(prisma.reviewTask.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: expect.anything(),
          reviewedAt: expect.anything(),
        }),
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MANUAL_PRICING_COMPLETE_SUBMITTED' }),
    );
  });

  it('records an explicit still-incomplete submission with the server-computed missing fields', async () => {
    const { service, getTask, audit } = createService();

    await service.updateManualPricing(reviewer, 'review-1', {
      action: 'SUBMIT_INCOMPLETE',
      currency: 'CNY',
      procurementCost: 12.5,
      notes: '国际物流和 Ozon 类目费率仍待确认。',
    });

    expect(getTask().decisionEvidence.manualPricing).toEqual(
      expect.objectContaining({
        state: 'INCOMPLETE',
        missingFields: expect.arrayContaining([
          'internationalShippingCost',
          'ozonCommissionRatePercent',
        ]),
        submittedBy: 'reviewer-1',
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MANUAL_PRICING_INCOMPLETE_SUBMITTED',
      }),
    );
  });

  it.each([
    {
      label: 'not a product research task',
      options: { entityType: 'AGENT_RUN' },
      code: 'MANUAL_PRICING_NOT_APPLICABLE',
    },
    {
      label: 'manual pricing was not requested',
      options: { decisionEvidence: { manualPricingRequired: false } },
      code: 'MANUAL_PRICING_NOT_REQUIRED',
    },
    {
      label: 'review is already closed',
      options: { status: 'APPROVED' },
      code: 'MANUAL_PRICING_REVIEW_CLOSED',
    },
  ])('rejects evidence mutation when $label', async ({ options, code }) => {
    const { service, prisma } = createService(options);

    await expect(
      service.updateManualPricing(reviewer, 'review-1', {
        action: 'SAVE_DRAFT',
        notes: 'test',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(prisma.reviewTask.update).not.toHaveBeenCalled();
  });
});
