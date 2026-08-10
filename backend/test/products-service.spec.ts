import { ProductsService } from '../src/features/products/products.service.js';

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function createService() {
  const existing = {
    id: 'product-1',
    workspaceId: 'workspace-1',
    title: 'Old title',
    sku: 'SKU-1',
    asinOrExternalId: 'EXT-1',
    images: [],
    cost: 0,
    price: 99,
    currency: 'RUB',
    status: 'ACTIVE',
    metadata: {
      source: 'ozon',
      channelId: 'channel-1',
      offerId: 'OZON-SKU-1',
      stock: 8,
      warehouseId: 987654,
    },
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
  };
  const prisma = {
    workspace: {
      findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...existing,
          ...data,
          title: data.title ?? existing.title,
          price: data.price ?? existing.price,
        }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    notification: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'notification-1',
          createdAt: new Date('2026-07-09T01:00:00.000Z'),
          readAt: null,
          ...data,
        }),
      ),
    },
    $transaction: jest
      .fn()
      .mockImplementation((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const eventBus = { emit: jest.fn().mockResolvedValue(undefined) };
  const notificationEvents = { publishCreated: jest.fn() };
  const tenantDatabase = {
    run: jest.fn(
      (_organizationId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
    ),
  };
  const actionProposals = {
    create: jest.fn().mockImplementation(async (input) => {
      const notification = {
        id: 'notification-1',
        organizationId: input.organizationId,
        userId: input.approverId,
        type: input.type,
        title: input.title,
        body: input.body,
        createdAt: new Date('2026-07-09T01:00:00.000Z'),
        readAt: null,
      };
      notificationEvents.publishCreated(notification);
      return {
        notification,
        proposal: { id: 'proposal-1', payloadHash: 'a'.repeat(64) },
      };
    }),
  };

  return {
    service: new ProductsService(
      prisma as any,
      audit as any,
      eventBus as any,
      tenantDatabase as any,
      actionProposals as any,
    ),
    prisma,
    audit,
    eventBus,
    notificationEvents,
    actionProposals,
  };
}

describe('ProductsService', () => {
  it('searches products by title, SKU, and external id', async () => {
    const { service, prisma } = createService();

    await service.findAll(user, { search: 'EXT-1', limit: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { title: { contains: 'EXT-1', mode: 'insensitive' } },
            { sku: { contains: 'EXT-1', mode: 'insensitive' } },
            {
              asinOrExternalId: {
                contains: 'EXT-1',
                mode: 'insensitive',
              },
            },
          ]),
        }),
      }),
    );
  });

  it('emits product.updated after a local product edit', async () => {
    const { service, audit, eventBus } = createService();

    const updated = await service.update(user, 'product-1', {
      title: 'Updated title',
      price: 123,
      metadata: {
        source: 'ozon',
        externalStoreMutation: 'not_executed',
      },
    });

    expect(updated.title).toBe('Updated title');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.update',
        resourceId: 'product-1',
      }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'product.updated',
        orgId: 'org-1',
        actorId: 'user-1',
        resourceType: 'Product',
        resourceId: 'product-1',
        data: expect.objectContaining({
          title: 'Updated title',
          workspaceId: 'workspace-1',
          externalStoreMutation: 'not_executed',
        }),
      }),
    );
  });

  it('creates a high-risk approval notification for an Ozon price change request without writing to Ozon', async () => {
    const {
      service,
      prisma,
      audit,
      eventBus,
      notificationEvents,
      actionProposals,
    } = createService();

    const result = await service.requestOzonChange(user, 'product-1', {
      action: 'ozon.price.update',
      price: 123.45,
      reason: 'gross marginenglish_text，english_text',
    });

    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        requestedBy: 'user-1',
        approverId: 'user-1',
        type: 'APPROVAL_REQUIRED',
        title: 'english_textproductenglish_text：Ozon text',
        context: expect.objectContaining({
          kind: 'high_risk_action_review',
          source: 'product_management_change_order',
          provider: 'OZON',
          externalStoreMutation: 'blocked_until_human_confirmation',
          execution: expect.objectContaining({
            status: 'pending_confirmation',
          }),
        }),
        action: expect.objectContaining({
          name: 'ozon.price.update',
          params: expect.objectContaining({
            productId: 'product-1',
            externalId: 'OZON-SKU-1',
            price: 123.45,
            currency: 'RUB',
          }),
        }),
      }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: {
        metadata: expect.objectContaining({
          pendingExternalSync: true,
          externalStoreMutation: 'pending_human_confirmation',
          latestChangeOrder: expect.objectContaining({
            notificationId: 'notification-1',
            action: 'ozon.price.update',
            status: 'pending_approval',
            requestedValue: 123.45,
          }),
        }),
      },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.ozon-change.request',
        resourceId: 'product-1',
      }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'product.ozon-change.requested',
        data: expect.objectContaining({
          action: 'ozon.price.update',
          externalStoreMutation: 'pending_human_confirmation',
        }),
      }),
    );
    expect(notificationEvents.publishCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notification-1' }),
    );
    expect(result.changeOrder).toEqual(
      expect.objectContaining({
        status: 'pending_approval',
        action: 'ozon.price.update',
        requestedValue: 123.45,
        externalExecution: 'blocked_until_human_confirmation',
      }),
    );
  });

  it('creates a high-risk approval notification for an Ozon stock change request with warehouse id', async () => {
    const { service, actionProposals } = createService();

    const result = await service.requestOzonChange(user, 'product-1', {
      action: 'ozon.stock.update',
      stock: 12,
      warehouseId: 987654,
      reason: 'english_text',
    });

    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'APPROVAL_REQUIRED',
        title: 'english_textproductenglish_text：Ozon textwrite',
        context: expect.objectContaining({
          kind: 'high_risk_action_review',
        }),
        action: expect.objectContaining({
          name: 'ozon.stock.update',
          params: expect.objectContaining({
            productId: 'product-1',
            stock: 12,
            warehouseId: 987654,
          }),
        }),
      }),
    );
    expect(result.changeOrder).toEqual(
      expect.objectContaining({
        status: 'pending_approval',
        action: 'ozon.stock.update',
        requestedValue: 12,
        externalExecution: 'blocked_until_human_confirmation',
      }),
    );
  });

  it('rejects Ozon write approval for non-Ozon local products', async () => {
    const { service, prisma, actionProposals } = createService();
    prisma.product.findFirst.mockResolvedValueOnce({
      id: 'product-2',
      workspaceId: 'workspace-1',
      title: 'Local product',
      sku: 'LOCAL-1',
      asinOrExternalId: null,
      images: [],
      cost: 0,
      price: 10,
      currency: 'RUB',
      status: 'DRAFT',
      metadata: { source: 'local' },
      createdAt: new Date('2026-07-09T00:00:00.000Z'),
    });

    await expect(
      service.requestOzonChange(user as any, 'product-2', {
        action: 'ozon.stock.update',
        stock: 12,
      }),
    ).rejects.toThrow(
      'Only Ozon-synced products can request Ozon write approval',
    );
    expect(actionProposals.create).not.toHaveBeenCalled();
  });
});
