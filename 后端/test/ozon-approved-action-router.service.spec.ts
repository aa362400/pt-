import { OzonApprovedActionRouterService } from '../src/features/notifications/ozon-approved-action-router.service.js';

const notification = {
  organizationId: 'org-1',
  userId: 'user-1',
  title: 'Approve Ozon action',
};

function execution(action: string) {
  return {
    proposalId: 'proposal-1',
    approvalDecisionId: 'decision-1',
    action,
    capabilityScope: `action:${action}`,
    payloadHash: 'a'.repeat(64),
    idempotencyKey: `approval:proposal-1:${'a'.repeat(64)}`,
  };
}

function createService() {
  const externalWrite = {
    executeApprovedPriceUpdate: jest.fn().mockResolvedValue({
      status: 'executed',
      action: 'ozon.price.update',
      externalExecution: { status: 'verified', provider: 'OZON' },
    }),
    executeApprovedStockUpdate: jest.fn(),
    executeApprovedOrderRefund: jest.fn().mockResolvedValue({
      status: 'executed',
      action: 'ozon.order.refund',
      externalExecution: { status: 'refund_verified', provider: 'OZON' },
    }),
    executeApprovedCustomerServiceAction: jest.fn(),
    executeApprovedAdsAction: jest.fn().mockResolvedValue({
      status: 'executed',
      action: 'ozon.ads.weekly_budget.update',
      externalExecution: { status: 'verified', provider: 'OZON_PERFORMANCE' },
    }),
  };
  return {
    service: new OzonApprovedActionRouterService(externalWrite as any),
    externalWrite,
  };
}

describe('OzonApprovedActionRouterService', () => {
  it('does not expose mutable-product publication aliases outside ProductLaunch', () => {
    const { service } = createService();

    for (const action of [
      'store.product.update',
      'listing.publish',
      'ozon.product.update',
      'ozon.listing.publish',
    ]) {
      expect(service.supports(action)).toBe(false);
    }
  });

  it('rejects a consumed grant whose capability scope does not match the requested action', async () => {
    const { service, externalWrite } = createService();

    const result = await service.execute(
      notification,
      {
        action: 'ozon.stock.update',
        params: { productId: 'product-1', stock: 5 },
      },
      { provider: 'OZON' },
      execution('ozon.price.update'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'external_execution_failed',
        externalExecution: expect.objectContaining({
          status: 'capability_scope_mismatch',
        }),
      }),
    );
    expect(externalWrite.executeApprovedStockUpdate).not.toHaveBeenCalled();
  });

  it('routes a generic price adjustment to the guarded Ozon price adapter', async () => {
    const { service, externalWrite } = createService();

    const result = await service.execute(
      notification,
      {
        action: 'price.adjust',
        params: { productId: 'product-1', price: 1299.5 },
      },
      { provider: 'OZON' },
      execution('price.adjust'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'executed',
        action: 'ozon.price.update',
      }),
    );
    expect(externalWrite.executeApprovedPriceUpdate).toHaveBeenCalledWith(
      notification,
      {
        action: 'ozon.price.update',
        params: { productId: 'product-1', price: 1299.5 },
      },
    );
  });

  it('fails closed when a removed publication alias reaches execute directly', async () => {
    const { service, externalWrite } = createService();

    const result = await service.execute(
      notification,
      {
        action: 'listing.publish',
        params: { productId: 'product-1' },
      },
      {},
      execution('listing.publish'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'external_execution_failed',
        action: 'listing.publish',
        externalExecution: expect.objectContaining({
          status: 'action_not_supported',
          reason: expect.stringContaining('ProductLaunch'),
        }),
      }),
    );
    expect(externalWrite.executeApprovedPriceUpdate).not.toHaveBeenCalled();
  });

  it('normalizes Ozon ads and refund actions to guarded adapters', async () => {
    const { service, externalWrite } = createService();

    const adsResult = await service.execute(
      notification,
      {
        action: 'ads.campaign.update',
        params: { campaignId: 'campaign-1', weeklyBudgetRub: 5000 },
      },
      { provider: 'OZON_PERFORMANCE' },
      execution('ads.campaign.update'),
    );

    expect(adsResult).toEqual(
      expect.objectContaining({
        status: 'executed',
        action: 'ozon.ads.weekly_budget.update',
      }),
    );
    expect(externalWrite.executeApprovedAdsAction).toHaveBeenCalledWith(
      notification,
      expect.objectContaining({ action: 'ozon.ads.weekly_budget.update' }),
    );
    const refundResult = await service.execute(
      notification,
      {
        action: 'order.refund',
        params: {
          channelId: 'channel-1',
          returnId: 901,
          refundScope: 'rfbs_full_return',
          confirmFullRefund: true,
        },
      },
      { provider: 'OZON' },
      execution('order.refund'),
    );

    expect(refundResult).toEqual(
      expect.objectContaining({
        status: 'executed',
        action: 'ozon.order.refund',
      }),
    );
    expect(externalWrite.executeApprovedOrderRefund).toHaveBeenCalledWith(
      notification,
      expect.objectContaining({
        action: 'ozon.order.refund',
      }),
    );
    expect(service.supports('order.refund')).toBe(true);
    expect(service.supports('ozon.order.refund')).toBe(true);
  });
});
