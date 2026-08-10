import { ChannelsService } from '../src/features/channels/channels.service.js';
import { OzonSellerApiClient } from '../src/features/channels/ozon-seller-api.client.js';
import { OzonExternalWriteService } from '../src/features/channels/ozon-external-write.service.js';

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function tenantDatabaseFor(prisma: unknown) {
  return {
    run: jest.fn(
      (_organizationId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
    ),
  };
}

function createService() {
  const channel = {
    id: 'channel-1',
    workspaceId: 'workspace-1',
    provider: 'OZON',
    externalShopId: '12345',
    accessTokenEncrypted: 'encoded-credentials',
    refreshTokenEncrypted: null,
    syncStatus: 'SUCCESS',
    lastSyncedAt: new Date('2026-07-09T00:00:00.000Z'),
  };
  const prisma = {
    workspace: {
      findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      create: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    },
    channelConnection: {
      upsert: jest.fn().mockResolvedValue(channel),
      findFirst: jest.fn().mockResolvedValue(channel),
      update: jest.fn().mockResolvedValue(channel),
      findMany: jest.fn().mockResolvedValue([channel]),
      count: jest.fn().mockResolvedValue(1),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: `product-${data.asinOrExternalId}`,
          ...data,
        }),
      ),
      update: jest.fn(),
    },
    marketplaceOrder: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create, update }) =>
        Promise.resolve({
          id: `order-${create.externalPostingNumber}`,
          ...create,
          ...update,
        }),
      ),
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 1 },
        _sum: { totalAmount: 2500 },
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    notification: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'notification-refund-1',
          createdAt: new Date('2026-07-14T01:00:00.000Z'),
          ...data,
        }),
      ),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'notification-1',
          type: 'REPORT_READY',
          title: 'Ozon orderssynccompleted',
          body: 'realAPIenglish_text 1 text，write/text 1 text，text/text 1 text。',
          metadata: {
            kind: 'ozon_sync_result',
            provider: 'OZON',
            channelId: 'channel-1',
            syncType: 'orders',
            status: 'success',
            fetched: 1,
            synced: 1,
            changed: 1,
            warnings: [],
          },
          createdAt: new Date('2026-07-09T04:00:00.000Z'),
        },
        {
          id: 'notification-ignored',
          type: 'REPORT_READY',
          title: 'Other channel',
          body: null,
          metadata: { kind: 'ozon_sync_result', channelId: 'other' },
          createdAt: new Date('2026-07-09T03:00:00.000Z'),
        },
      ]),
    },
    storeMetricSnapshot: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation((operations: unknown[]) =>
        Promise.all(operations as Array<Promise<unknown>>),
      ),
  };
  const ozonCredentials = {
    encode: jest.fn().mockReturnValue('encoded-credentials'),
    decode: jest.fn().mockReturnValue({
      clientId: '12345',
      apiKey: 'secret-api-key',
    }),
    mask: jest.fn().mockReturnValue({
      clientId: '12345',
      apiKeyMasked: 'sec***key',
    }),
    rotate: jest.fn().mockReturnValue({
      changed: true,
      encoded: 'v2:key-2026-07:iv:tag:ciphertext',
      fromKeyId: null,
      toKeyId: 'key-2026-07',
    }),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const tenantDatabase = tenantDatabaseFor(prisma);
  const ozonClient = {
    verifyCredentials: jest.fn().mockResolvedValue({
      ok: true,
      total: 2,
      sampleCount: 1,
    }),
    listProductRefs: jest
      .fn()
      .mockResolvedValue([{ productId: 1001, offerId: 'OZON-SKU-1' }]),
    listAllProductRefs: jest
      .fn()
      .mockResolvedValue([{ productId: 1001, offerId: 'OZON-SKU-1' }]),
    getProductInfoList: jest.fn().mockResolvedValue([
      {
        productId: 1001,
        offerId: 'OZON-SKU-1',
        name: 'Ozon Test Product',
        price: '1299.50',
        currencyCode: 'RUB',
        images: ['https://cdn.example/1.jpg'],
        status: 'Продается',
        raw: {},
      },
    ]),
    listOrderPostings: jest.fn().mockResolvedValue({
      items: [
        {
          fulfillmentType: 'FBS',
          postingNumber: 'FBS-POSTING-1',
          orderId: '9001',
          status: 'awaiting_packaging',
          orderedAt: '2026-07-09T03:00:00.000Z',
          currencyCode: 'RUB',
          totalAmount: 2500,
          itemCount: 2,
          raw: { posting_number: 'FBS-POSTING-1' },
        },
      ],
      failures: [],
    }),
    probeOrderPostingEndpoint: jest
      .fn()
      .mockImplementation(
        async (_credentials: unknown, fulfillmentType: 'FBS' | 'FBO') => ({
          fulfillmentType,
          fetched: fulfillmentType === 'FBS' ? 1 : 0,
        }),
      ),
    listRfbsReturns: jest.fn().mockResolvedValue({
      items: [
        {
          returnId: 901,
          returnNumber: 'RET-1',
          postingNumber: 'RFBS-1',
          orderNumber: 'ORDER-1',
          createdAt: '2026-07-13T01:00:00.000Z',
          product: {
            name: 'Returned product',
            offerId: 'OFFER-1',
            sku: 1001,
            price: '1299.00',
            currencyCode: 'RUB',
          },
          state: {
            groupState: 'new',
            state: 'awaiting_decision',
            stateName: 'Awaiting decision',
          },
        },
      ],
      hasNext: false,
    }),
    getRfbsReturn: jest.fn().mockResolvedValue({
      returnId: 901,
      returnNumber: 'RET-1',
      postingNumber: 'RFBS-1',
      product: {
        name: 'Returned product',
        offerId: 'OFFER-1',
        sku: 1001,
        price: '1299.00',
        currencyCode: 'RUB',
      },
      availableActions: [{ id: 17, name: 'RETURN_MONEY' }],
      state: {
        state: 'awaiting_decision',
        stateName: 'Awaiting decision',
      },
      raw: {},
    }),
  };
  const actionProposals = {
    create: jest.fn().mockImplementation(async (input) => ({
      notification: {
        id: 'notification-refund-1',
        organizationId: input.organizationId,
        userId: input.approverId,
        type: input.type,
        title: input.title,
        body: input.body,
      },
      proposal: { id: 'proposal-refund-1', payloadHash: 'a'.repeat(64) },
    })),
  };

  return {
    service: new ChannelsService(
      prisma as any,
      tenantDatabase as any,
      ozonCredentials as any,
      ozonClient as any,
      actionProposals as any,
      undefined,
      audit as any,
    ),
    prisma,
    ozonCredentials,
    ozonClient,
    audit,
    tenantDatabase,
    actionProposals,
  };
}

describe('ChannelsService Ozon integration', () => {
  it('verifies Ozon credentials before creating a channel and never returns the API key', async () => {
    const { service, prisma, ozonCredentials, ozonClient } = createService();

    const result = await service.connectOzon(user, {
      clientId: '12345',
      apiKey: 'secret-api-key',
      workspaceName: 'Ozon RU',
    });

    expect(ozonClient.verifyCredentials).toHaveBeenCalledWith({
      clientId: '12345',
      apiKey: 'secret-api-key',
    });
    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        name: 'Ozon RU',
        channelType: 'OZON',
        marketplace: 'OZON_RU',
        currency: 'RUB',
      }),
      select: { id: true },
    });
    expect(ozonCredentials.encode).toHaveBeenCalledWith({
      clientId: '12345',
      apiKey: 'secret-api-key',
    });
    expect(prisma.channelConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_provider: {
            workspaceId: 'workspace-1',
            provider: 'OZON',
          },
        },
        create: expect.objectContaining({
          provider: 'OZON',
          accessTokenEncrypted: 'encoded-credentials',
          syncStatus: 'SUCCESS',
        }),
      }),
    );
    expect(result.channel).not.toHaveProperty('accessTokenEncrypted');
    expect(result.credentials).toEqual({
      clientId: '12345',
      apiKeyMasked: 'sec***key',
    });
    expect(result.initialSync).toEqual({
      status: 'success',
      fetched: 1,
      synced: 1,
    });
    expect(result.capabilities.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'product_catalog',
          status: 'connected',
        }),
        expect.objectContaining({
          key: 'price_update',
          status: 'human_confirmation_required',
        }),
        expect.objectContaining({ key: 'ads', status: 'not_connected' }),
      ]),
    );
  });

  it('syncs Ozon products into org-owned workspace products through read-only API data', async () => {
    const { service, prisma, ozonCredentials, ozonClient } = createService();

    const result = await service.syncProducts(user, 'channel-1', {
      limit: 10,
    });

    expect(ozonCredentials.decode).toHaveBeenCalledWith('encoded-credentials');
    expect(ozonClient.listAllProductRefs).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      { maxItems: 10 },
    );
    expect(ozonClient.getProductInfoList).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      [{ productId: 1001, offerId: 'OZON-SKU-1' }],
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        title: 'Ozon Test Product',
        sku: 'OZON-SKU-1',
        asinOrExternalId: '1001',
        price: 1299.5,
        currency: 'RUB',
        metadata: expect.objectContaining({
          source: 'ozon',
          channelId: 'channel-1',
          productId: 1001,
          offerId: 'OZON-SKU-1',
        }),
      }),
    });
    expect(result.synced).toBe(1);
    expect(result.items[0].title).toBe('Ozon Test Product');
  });

  it('updates the same Ozon product instead of creating a duplicate on a later sync', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany = jest.fn().mockResolvedValue([
      {
        id: 'existing-product-1',
        metadata: {
          source: 'ozon',
          channelId: 'channel-1',
          productId: 1001,
          offerId: 'OZON-SKU-1',
        },
      },
    ]);
    prisma.product.update.mockResolvedValue({
      id: 'existing-product-1',
      title: 'Ozon Test Product',
    });

    await service.syncProducts(user, 'channel-1', {});

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'existing-product-1' },
      data: expect.objectContaining({
        sku: 'OZON-SKU-1',
        asinOrExternalId: '1001',
      }),
    });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('syncs Ozon orders into marketplace orders and refreshes store metrics', async () => {
    const { service, prisma, ozonCredentials, ozonClient, tenantDatabase } =
      createService();
    let tenantContextDepth = 0;
    tenantDatabase.run.mockImplementation(
      async (_organizationId: string, operation: (tx: unknown) => unknown) => {
        tenantContextDepth += 1;
        try {
          return await operation(prisma);
        } finally {
          tenantContextDepth -= 1;
        }
      },
    );
    prisma.storeMetricSnapshot.findUnique.mockImplementation(async () => {
      if (tenantContextDepth === 0) {
        throw new Error('RLS context missing for store metric read');
      }
      return null;
    });
    prisma.storeMetricSnapshot.upsert.mockImplementation(async () => {
      if (tenantContextDepth === 0) {
        throw new Error('RLS context missing for store metric write');
      }
      return {};
    });

    const result = await service.syncOrders(user, 'channel-1', {
      since: '2026-07-09T00:00:00.000Z',
      to: '2026-07-10T00:00:00.000Z',
      limit: 50,
    });

    expect(ozonCredentials.decode).toHaveBeenCalledWith('encoded-credentials');
    expect(ozonClient.listOrderPostings).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      {
        since: '2026-07-09T00:00:00.000Z',
        to: '2026-07-10T00:00:00.000Z',
        limit: 50,
      },
    );
    expect(prisma.marketplaceOrder.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_provider_externalPostingNumber: {
          organizationId: 'org-1',
          provider: 'OZON',
          externalPostingNumber: 'FBS-POSTING-1',
        },
      },
      create: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        provider: 'OZON',
        fulfillmentType: 'FBS',
        externalOrderId: '9001',
        externalPostingNumber: 'FBS-POSTING-1',
        status: 'awaiting_packaging',
        totalAmount: 2500,
        itemCount: 2,
      }),
      update: expect.objectContaining({
        channelId: 'channel-1',
        status: 'awaiting_packaging',
        totalAmount: 2500,
      }),
    });
    expect(prisma.storeMetricSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          orders: 1,
          revenue: 2500,
        }),
      }),
    );
    expect(result.synced).toBe(1);
    expect(result.capabilities.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'order_sync',
          status: 'connected',
        }),
      ]),
    );
  });

  it('does not expose stored credentials from generic channel listing', async () => {
    const { service } = createService();

    const result = await service.findAll(user, { limit: 20 });

    expect(result.items[0]).not.toHaveProperty('accessTokenEncrypted');
    expect(result.items[0]).not.toHaveProperty('refreshTokenEncrypted');
  });

  it('rotates all organization Ozon credentials without exposing plaintext', async () => {
    const { service, prisma, ozonCredentials, audit } = createService();

    const result = await service.rotateOzonCredentials(user);

    expect(ozonCredentials.rotate).toHaveBeenCalledWith('encoded-credentials');
    expect(prisma.channelConnection.update).toHaveBeenCalledWith({
      where: { id: 'channel-1' },
      data: {
        accessTokenEncrypted: 'v2:key-2026-07:iv:tag:ciphertext',
      },
    });
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ozon.credentials.rotation.started',
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ozon.credentials.rotation.completed',
      }),
    );
    expect(result).toEqual({
      total: 1,
      rotated: 1,
      unchanged: 0,
      keyIds: ['key-2026-07'],
    });
    expect(JSON.stringify(result)).not.toContain('secret-api-key');
  });

  it('diagnoses Ozon product and order permissions and returns real sync logs', async () => {
    const { service, prisma, ozonCredentials, ozonClient } = createService();

    const result = await service.diagnoseOzon(user, 'channel-1');

    expect(ozonCredentials.decode).toHaveBeenCalledWith('encoded-credentials');
    expect(ozonClient.verifyCredentials).toHaveBeenCalledWith({
      clientId: '12345',
      apiKey: 'secret-api-key',
    });
    expect(ozonClient.listProductRefs).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      5,
    );
    expect(ozonClient.probeOrderPostingEndpoint).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      'FBS',
      expect.objectContaining({ limit: 5 }),
    );
    expect(ozonClient.probeOrderPostingEndpoint).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      'FBO',
      expect.objectContaining({ limit: 5 }),
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(result.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'credentials',
          status: 'ok',
          sampleCount: 1,
        }),
        expect.objectContaining({
          key: 'product_catalog',
          status: 'ok',
          fetched: 1,
        }),
        expect.objectContaining({
          key: 'fbs_orders',
          status: 'ok',
          fetched: 1,
        }),
        expect.objectContaining({
          key: 'fbo_orders',
          status: 'ok',
          fetched: 0,
        }),
      ]),
    );
    expect(result.syncLogs).toHaveLength(1);
    expect(result.syncLogs[0]).toEqual(
      expect.objectContaining({
        id: 'notification-1',
        syncType: 'orders',
        status: 'success',
        fetched: 1,
        synced: 1,
        changed: 1,
      }),
    );
  });

  it('lists and previews Ozon rFBS returns from read-only endpoints', async () => {
    const { service, ozonClient } = createService();

    const list = await service.listRfbsReturns(user, 'channel-1', {
      limit: 20,
      postingNumber: ' RFBS-1 ',
    });
    const detail = await service.getRfbsReturn(user, 'channel-1', '901');

    expect(ozonClient.listRfbsReturns).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      { limit: 20, postingNumber: 'RFBS-1' },
    );
    expect(list).toEqual(
      expect.objectContaining({
        source: 'Ozon Seller API /v2/returns/rfbs/list',
        channelId: 'channel-1',
        items: [expect.objectContaining({ returnId: 901 })],
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        source: 'Ozon Seller API /v2/returns/rfbs/get',
        item: expect.objectContaining({
          returnId: 901,
          fullRefundAvailable: true,
          availableActions: [{ id: 17, name: 'RETURN_MONEY' }],
        }),
      }),
    );
  });

  it('creates a guarded human approval request without mutating Ozon', async () => {
    const { service, ozonClient, audit, actionProposals } = createService();

    const result = await service.requestRfbsRefund(user, 'channel-1', '901', {
      confirmFullRefund: true,
      returnForBackWay: 0,
    });

    expect(actionProposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'APPROVAL_REQUIRED',
        context: expect.objectContaining({
          kind: 'high_risk_action_review',
          externalStoreMutation: 'blocked_until_human_confirmation',
        }),
        action: expect.objectContaining({
          name: 'ozon.order.refund',
          params: expect.objectContaining({
            returnId: 901,
            returnActionId: 17,
            refundScope: 'rfbs_full_return',
            confirmFullRefund: true,
          }),
        }),
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ozon.rfbs-refund.requested',
        after: expect.objectContaining({ externalMutation: false }),
      }),
    );
    expect(ozonClient).not.toHaveProperty('setRfbsReturnAction');
    expect(result).toEqual({
      status: 'pending_human_confirmation',
      notificationId: 'notification-refund-1',
      action: 'ozon.order.refund',
      returnId: 901,
      externalMutation: false,
    });
  });

  it('blocks a refund request when Ozon exposes no unambiguous refund action', async () => {
    const { service, ozonClient, actionProposals } = createService();
    ozonClient.getRfbsReturn.mockResolvedValueOnce({
      returnId: 901,
      product: {},
      availableActions: [{ id: 2, name: 'REJECT' }],
      state: { state: 'awaiting_decision' },
      raw: {},
    });

    await expect(
      service.requestRfbsRefund(user, 'channel-1', '901', {
        confirmFullRefund: true,
      }),
    ).rejects.toThrow('does not currently expose a full-refund action');
    expect(actionProposals.create).not.toHaveBeenCalled();
  });
});

describe('OzonSellerApiClient product references', () => {
  const credentials = { clientId: 'client-id', apiKey: 'api-key' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters blank product refs returned by Ozon product list', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          result: {
            items: [
              { product_id: 0, offer_id: '' },
              { product_id: 1001, offer_id: '' },
              { offer_id: 'OZON-SKU-1' },
            ],
          },
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(client.listProductRefs(credentials, 50)).resolves.toEqual([
      { productId: 1001, offerId: undefined },
      { productId: undefined, offerId: 'OZON-SKU-1' },
    ]);
  });

  it('reads every Ozon product page and stops at the terminal cursor', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            result: {
              items: [{ product_id: 1001, offer_id: 'SKU-1' }],
              last_id: 'next-page',
            },
          }),
        ),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            result: {
              items: [{ product_id: 1002, offer_id: 'SKU-2' }],
              last_id: '',
            },
          }),
        ),
      } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.listAllProductRefs(credentials, { maxItems: 100 }),
    ).resolves.toEqual([
      { productId: 1001, offerId: 'SKU-1' },
      { productId: 1002, offerId: 'SKU-2' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)),
    ).toEqual({
      filter: { visibility: 'ALL' },
      limit: 99,
      last_id: 'next-page',
    });
  });

  it('uses only product_id when requesting Ozon product details with mixed refs', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ result: { items: [] } })),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await client.getProductInfoList(credentials, [
      { productId: 1001, offerId: 'OZON-SKU-1' },
    ]);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(JSON.parse(String(request.body))).toEqual({ product_id: [1001] });
  });

  it('maps top-level Ozon product info items', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [
            {
              id: 1001,
              offer_id: 'OZON-SKU-1',
              name: 'Ozon Product',
              price: '1299.50',
              currency_code: 'RUB',
              images: ['https://cdn.example/1.jpg'],
              status: { state_name: 'Продается' },
            },
          ],
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.getProductInfoList(credentials, [{ productId: 1001 }]),
    ).resolves.toEqual([
      expect.objectContaining({
        productId: 1001,
        offerId: 'OZON-SKU-1',
        name: 'Ozon Product',
        price: '1299.50',
        currencyCode: 'RUB',
        images: ['https://cdn.example/1.jpg'],
      }),
    ]);
  });

  it('maps Ozon FBS order postings from the official posting list shape', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            postings: [
              {
                posting_number: 'FBS-1',
                order_id: 9001,
                status: 'awaiting_packaging',
                in_process_at: '2026-07-09T03:00:00.000Z',
                products: [
                  {
                    offer_id: 'SKU-1',
                    price: '1000.50',
                    quantity: 2,
                    currency_code: 'RUB',
                  },
                ],
              },
            ],
            cursor: '',
            has_next: false,
          }),
        ),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify({ postings: [], cursor: '', has_next: false }),
          ),
      } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.listOrderPostings(credentials, {
        since: '2026-07-09T00:00:00.000Z',
        to: '2026-07-10T00:00:00.000Z',
        limit: 50,
      }),
    ).resolves.toEqual({
      failures: [],
      items: [
        expect.objectContaining({
          fulfillmentType: 'FBS',
          postingNumber: 'FBS-1',
          orderId: '9001',
          status: 'awaiting_packaging',
          totalAmount: 2001,
          itemCount: 2,
          currencyCode: 'RUB',
        }),
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v4/posting/fbs/list',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api-seller.ozon.ru/v3/posting/fbo/list',
    );
  });

  it('probes a single Ozon order endpoint for diagnostics', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          postings: [
            {
              posting_number: 'FBO-1',
              status: 'delivered',
              products: [{ price: '700', quantity: 1 }],
            },
          ],
          cursor: '',
          has_next: false,
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.probeOrderPostingEndpoint(credentials, 'FBO', {
        since: '2026-07-09T00:00:00.000Z',
        to: '2026-07-10T00:00:00.000Z',
        limit: 5,
      }),
    ).resolves.toEqual({ fulfillmentType: 'FBO', fetched: 1 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v3/posting/fbo/list',
    );
  });

  it('posts approved price updates to the guarded Ozon import prices endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          result: [
            {
              product_id: 1001,
              offer_id: 'OZON-SKU-1',
              updated: true,
              errors: [],
            },
          ],
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.updateProductPrices(credentials, [
        {
          productId: 1001,
          offerId: 'OZON-SKU-1',
          price: 1299.5,
          currencyCode: 'RUB',
        },
      ]),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          productId: 1001,
          offerId: 'OZON-SKU-1',
          updated: true,
          errors: [],
        }),
      ],
      failures: [],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v1/product/import/prices',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      prices: [
        {
          product_id: 1001,
          offer_id: 'OZON-SKU-1',
          price: '1299.5',
          currency_code: 'RUB',
        },
      ],
    });
  });

  it('posts approved stock updates to the guarded Ozon stocks endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          result: [
            {
              product_id: 1001,
              offer_id: 'OZON-SKU-1',
              warehouse_id: 987654,
              updated: true,
              errors: [],
            },
          ],
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.updateProductStocks(credentials, [
        {
          productId: 1001,
          offerId: 'OZON-SKU-1',
          warehouseId: 987654,
          stock: 12,
        },
      ]),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          productId: 1001,
          offerId: 'OZON-SKU-1',
          warehouseId: 987654,
          updated: true,
          errors: [],
        }),
      ],
      failures: [],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v2/products/stocks',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      stocks: [
        {
          product_id: 1001,
          offer_id: 'OZON-SKU-1',
          warehouse_id: 987654,
          stock: 12,
        },
      ],
    });
  });

  it('lists rFBS returns without exposing buyer personal data', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          returns: [
            {
              return_id: 901,
              return_number: 'RET-1',
              posting_number: 'RFBS-1',
              order_number: 'ORDER-1',
              created_at: '2026-07-13T01:00:00.000Z',
              client_name: 'must-not-leak',
              product: {
                name: 'Returned product',
                offer_id: 'OFFER-1',
                sku: 1001,
                price: '1299.00',
                currency_code: 'RUB',
              },
              state: {
                group_state: 'new',
                state: 'awaiting_decision',
                state_name: 'Awaiting decision',
              },
            },
          ],
          has_next: false,
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    const result = await client.listRfbsReturns(credentials, {
      limit: 20,
      postingNumber: 'RFBS-1',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v2/returns/rfbs/list',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      filter: { posting_number: 'RFBS-1' },
      last_id: 0,
      limit: 20,
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          returnId: 901,
          postingNumber: 'RFBS-1',
          product: expect.objectContaining({ offerId: 'OFFER-1' }),
        }),
      ],
      hasNext: false,
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('reads an rFBS return and submits the currently available full-refund action', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            returns: {
              available_actions: [{ id: 17, name: 'RETURN_MONEY' }],
              posting_number: 'RFBS-1',
              return_number: 'RET-1',
              state: {
                state: 'awaiting_decision',
                state_name: 'Awaiting decision',
              },
            },
          }),
        ),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(''),
      } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(client.getRfbsReturn(credentials, 901)).resolves.toEqual(
      expect.objectContaining({
        returnId: 901,
        postingNumber: 'RFBS-1',
        availableActions: [{ id: 17, name: 'RETURN_MONEY' }],
        state: expect.objectContaining({ state: 'awaiting_decision' }),
      }),
    );
    await expect(
      client.setRfbsReturnAction(credentials, {
        returnId: 901,
        actionId: 17,
        returnForBackWay: 0,
      }),
    ).resolves.toEqual({ accepted: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v2/returns/rfbs/get',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      return_id: 901,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api-seller.ozon.ru/v1/returns/rfbs/action/set',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      id: 17,
      return_for_back_way: 0,
      return_id: 901,
    });
  });

  it('reads Ozon product stocks for external write verification', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          result: {
            items: [
              {
                product_id: 1001,
                offer_id: 'OZON-SKU-1',
                stocks: [
                  {
                    warehouse_id: 987654,
                    present: 12,
                  },
                ],
              },
            ],
          },
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(
      client.getProductStocks(credentials, [
        { productId: 1001, offerId: 'OZON-SKU-1' },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        productId: 1001,
        offerId: 'OZON-SKU-1',
        warehouseId: 987654,
        stock: 12,
      }),
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api-seller.ozon.ru/v4/product/info/stocks',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      filter: {
        visibility: 'ALL',
        product_id: [1001],
      },
      limit: 1,
    });
  });
});

describe('OzonExternalWriteService', () => {
  it('executes an approved price update only after Ozon readback matches', async () => {
    const product = {
      id: 'product-1',
      workspaceId: 'workspace-1',
      title: 'Ozon Test Product',
      price: 999,
      currency: 'RUB',
      metadata: {
        source: 'ozon',
        channelId: 'channel-1',
        productId: 1001,
        offerId: 'OZON-SKU-1',
        latestChangeOrder: { status: 'pending_approval' },
      },
    };
    const channel = {
      id: 'channel-1',
      workspaceId: 'workspace-1',
      provider: 'OZON',
      accessTokenEncrypted: 'encoded-credentials',
      syncStatus: 'SUCCESS',
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(product),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...product,
            ...data,
          }),
        ),
      },
      channelConnection: {
        findFirst: jest.fn().mockResolvedValue(channel),
      },
    };
    const ozonCredentials = {
      decode: jest.fn().mockReturnValue({
        clientId: '12345',
        apiKey: 'secret-api-key',
      }),
    };
    const ozonClient = {
      updateProductPrices: jest.fn().mockResolvedValue({
        items: [
          {
            productId: 1001,
            offerId: 'OZON-SKU-1',
            updated: true,
            errors: [],
          },
        ],
        failures: [],
      }),
      getProductInfoList: jest.fn().mockResolvedValue([
        {
          productId: 1001,
          offerId: 'OZON-SKU-1',
          price: '1299.5',
          currencyCode: 'RUB',
          images: [],
          raw: {},
        },
      ]),
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      ozonCredentials as any,
      ozonClient as any,
      { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any,
      tenantDatabaseFor(prisma) as any,
    );

    const result = await service.executeApprovedPriceUpdate(
      { organizationId: 'org-1', userId: 'user-1', title: 'Approve price' },
      {
        action: 'ozon.price.update',
        params: {
          productId: 'product-1',
          price: 1299.5,
          currency: 'RUB',
        },
      },
    );

    expect(result.status).toBe('executed');
    expect(ozonCredentials.decode).toHaveBeenCalledWith('encoded-credentials');
    expect(ozonClient.updateProductPrices).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      [
        {
          productId: 1001,
          offerId: 'OZON-SKU-1',
          price: 1299.5,
          currencyCode: 'RUB',
        },
      ],
    );
    expect(ozonClient.getProductInfoList).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      [{ productId: 1001, offerId: 'OZON-SKU-1' }],
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        price: 1299.5,
        currency: 'RUB',
        metadata: expect.objectContaining({
          pendingExternalSync: false,
          externalStoreMutation: 'executed',
          latestChangeOrder: expect.objectContaining({ status: 'executed' }),
          lastExternalWrite: expect.objectContaining({
            provider: 'OZON',
            action: 'ozon.price.update',
            status: 'verified',
          }),
        }),
      }),
    });
  });

  it('executes an approved stock update only after Ozon stock readback matches', async () => {
    const product = {
      id: 'product-1',
      workspaceId: 'workspace-1',
      title: 'Ozon Test Product',
      price: 999,
      currency: 'RUB',
      metadata: {
        source: 'ozon',
        channelId: 'channel-1',
        productId: 1001,
        offerId: 'OZON-SKU-1',
        warehouseId: 987654,
        stock: 8,
        latestChangeOrder: { status: 'pending_approval' },
      },
    };
    const channel = {
      id: 'channel-1',
      workspaceId: 'workspace-1',
      provider: 'OZON',
      accessTokenEncrypted: 'encoded-credentials',
      syncStatus: 'SUCCESS',
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(product),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...product,
            ...data,
          }),
        ),
      },
      channelConnection: {
        findFirst: jest.fn().mockResolvedValue(channel),
      },
    };
    const ozonCredentials = {
      decode: jest.fn().mockReturnValue({
        clientId: '12345',
        apiKey: 'secret-api-key',
      }),
    };
    const ozonClient = {
      updateProductStocks: jest.fn().mockResolvedValue({
        items: [
          {
            productId: 1001,
            offerId: 'OZON-SKU-1',
            warehouseId: 987654,
            updated: true,
            errors: [],
          },
        ],
        failures: [],
      }),
      getProductStocks: jest.fn().mockResolvedValue([
        {
          productId: 1001,
          offerId: 'OZON-SKU-1',
          warehouseId: 987654,
          stock: 12,
          raw: {},
        },
      ]),
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      ozonCredentials as any,
      ozonClient as any,
      { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any,
      tenantDatabaseFor(prisma) as any,
    );

    const result = await service.executeApprovedStockUpdate(
      { organizationId: 'org-1', userId: 'user-1', title: 'Approve stock' },
      {
        action: 'ozon.stock.update',
        params: {
          productId: 'product-1',
          stock: 12,
          warehouseId: 987654,
        },
      },
    );

    expect(result.status).toBe('executed');
    expect(ozonClient.updateProductStocks).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      [
        {
          productId: 1001,
          offerId: 'OZON-SKU-1',
          warehouseId: 987654,
          stock: 12,
        },
      ],
    );
    expect(ozonClient.getProductStocks).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'secret-api-key' },
      [{ productId: 1001, offerId: 'OZON-SKU-1' }],
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          stock: 12,
          warehouseId: 987654,
          pendingExternalSync: false,
          externalStoreMutation: 'executed',
          latestChangeOrder: expect.objectContaining({ status: 'executed' }),
          lastExternalWrite: expect.objectContaining({
            provider: 'OZON',
            action: 'ozon.stock.update',
            status: 'verified',
            requestedStock: 12,
            readbackStock: 12,
          }),
        }),
      }),
    });
  });

  it('records failure instead of success when Ozon readback does not match', async () => {
    const product = {
      id: 'product-1',
      workspaceId: 'workspace-1',
      title: 'Ozon Test Product',
      price: 999,
      currency: 'RUB',
      metadata: {
        source: 'ozon',
        channelId: 'channel-1',
        productId: 1001,
        offerId: 'OZON-SKU-1',
      },
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(product),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...product,
            ...data,
          }),
        ),
      },
      channelConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-1',
          workspaceId: 'workspace-1',
          provider: 'OZON',
          accessTokenEncrypted: 'encoded-credentials',
          syncStatus: 'SUCCESS',
        }),
      },
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      {
        decode: jest.fn().mockReturnValue({ clientId: '12345', apiKey: 'k' }),
      } as any,
      {
        updateProductPrices: jest.fn().mockResolvedValue({
          items: [{ productId: 1001, offerId: 'OZON-SKU-1', updated: true }],
          failures: [],
        }),
        getProductInfoList: jest.fn().mockResolvedValue([
          {
            productId: 1001,
            offerId: 'OZON-SKU-1',
            price: '1000',
            currencyCode: 'RUB',
            images: [],
            raw: {},
          },
        ]),
      } as any,
      { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any,
      tenantDatabaseFor(prisma) as any,
    );

    const result = await service.executeApprovedPriceUpdate(
      { organizationId: 'org-1', userId: 'user-1', title: 'Approve price' },
      {
        action: 'ozon.price.update',
        params: { productId: 'product-1', price: 1299.5, currency: 'RUB' },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'external_execution_failed',
        externalExecution: expect.objectContaining({
          status: 'readback_mismatch',
        }),
      }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          pendingExternalSync: true,
          externalStoreMutation: 'verification_failed',
          latestChangeOrder: expect.objectContaining({ status: 'failed' }),
        }),
      }),
    });
  });

  it('does not call Ozon when the pre-write hash-chain audit cannot be persisted', async () => {
    const product = {
      id: 'product-1',
      workspaceId: 'workspace-1',
      title: 'Ozon Test Product',
      price: 999,
      currency: 'RUB',
      metadata: {
        source: 'ozon',
        channelId: 'channel-1',
        productId: 1001,
        offerId: 'OZON-SKU-1',
      },
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(product),
        update: jest.fn(),
      },
      channelConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-1',
          workspaceId: 'workspace-1',
          provider: 'OZON',
          accessTokenEncrypted: 'encoded-credentials',
          syncStatus: 'SUCCESS',
        }),
      },
    };
    const ozonClient = {
      updateProductPrices: jest.fn(),
      getProductInfoList: jest.fn(),
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      {
        decode: jest.fn().mockReturnValue({ clientId: '12345', apiKey: 'k' }),
      } as any,
      ozonClient as any,
      {
        appendStrict: jest
          .fn()
          .mockRejectedValue(new Error('audit unavailable')),
      } as any,
      tenantDatabaseFor(prisma) as any,
    );

    await expect(
      service.executeApprovedPriceUpdate(
        { organizationId: 'org-1', userId: 'user-1', title: 'Approve price' },
        {
          action: 'ozon.price.update',
          params: { productId: 'product-1', price: 1299.5, currency: 'RUB' },
        },
      ),
    ).rejects.toThrow('audit unavailable');
    expect(ozonClient.updateProductPrices).not.toHaveBeenCalled();
    expect(ozonClient.getProductInfoList).not.toHaveBeenCalled();
  });

  it('executes an approved rFBS full refund only when Ozon readback changes', async () => {
    const channel = {
      id: 'channel-1',
      workspaceId: 'workspace-1',
      provider: 'OZON',
      accessTokenEncrypted: 'encoded-credentials',
      syncStatus: 'SUCCESS',
    };
    const prisma = {
      channelConnection: { findFirst: jest.fn().mockResolvedValue(channel) },
    };
    const before = {
      returnId: 901,
      postingNumber: 'RFBS-1',
      returnNumber: 'RET-1',
      availableActions: [{ id: 17, name: 'RETURN_MONEY' }],
      state: { state: 'awaiting_decision', stateName: 'Awaiting decision' },
      raw: {},
    };
    const after = {
      ...before,
      availableActions: [],
      state: {
        state: 'money_returned',
        stateName: 'Money returned',
        moneyReturnStateName: 'Refund completed',
      },
    };
    const ozonClient = {
      getRfbsReturn: jest
        .fn()
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after),
      setRfbsReturnAction: jest.fn().mockResolvedValue({ accepted: true }),
    };
    const audit = {
      appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      {
        decode: jest.fn().mockReturnValue({ clientId: '12345', apiKey: 'k' }),
      } as any,
      ozonClient as any,
      audit as any,
      tenantDatabaseFor(prisma) as any,
    );

    const result = await service.executeApprovedOrderRefund(
      { organizationId: 'org-1', userId: 'user-1', title: 'Approve refund' },
      {
        action: 'ozon.order.refund',
        params: {
          channelId: 'channel-1',
          returnId: 901,
          refundScope: 'rfbs_full_return',
          confirmFullRefund: true,
          returnForBackWay: 0,
        },
      },
    );

    expect(ozonClient.setRfbsReturnAction).toHaveBeenCalledWith(
      { clientId: '12345', apiKey: 'k' },
      { returnId: 901, actionId: 17, returnForBackWay: 0 },
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ozon.external-write.order-refund.started',
        resourceId: '901',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'executed',
        action: 'ozon.order.refund',
        externalExecution: expect.objectContaining({
          status: 'refund_verified',
          returnId: 901,
        }),
      }),
    );
  });

  it('blocks an approved refund when its scope acknowledgement is missing', async () => {
    const prisma = {
      channelConnection: { findFirst: jest.fn() },
    };
    const ozonClient = {
      getRfbsReturn: jest.fn(),
      setRfbsReturnAction: jest.fn(),
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      { decode: jest.fn() } as any,
      ozonClient as any,
      { appendStrict: jest.fn() } as any,
      tenantDatabaseFor(prisma) as any,
    );

    const result = await service.executeApprovedOrderRefund(
      { organizationId: 'org-1', userId: 'user-1', title: 'Approve refund' },
      {
        action: 'ozon.order.refund',
        params: { channelId: 'channel-1', returnId: 901 },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'external_execution_failed',
        externalExecution: expect.objectContaining({
          status: 'invalid_request',
        }),
      }),
    );
    expect(ozonClient.getRfbsReturn).not.toHaveBeenCalled();
    expect(ozonClient.setRfbsReturnAction).not.toHaveBeenCalled();
  });

  it('does not mark a refund executed when the Ozon return readback is unchanged', async () => {
    const channel = {
      id: 'channel-1',
      workspaceId: 'workspace-1',
      provider: 'OZON',
      accessTokenEncrypted: 'encoded-credentials',
      syncStatus: 'SUCCESS',
    };
    const unchanged = {
      returnId: 901,
      availableActions: [{ id: 17, name: 'RETURN_MONEY' }],
      state: { state: 'awaiting_decision' },
      raw: {},
    };
    const prisma = {
      channelConnection: { findFirst: jest.fn().mockResolvedValue(channel) },
    };
    const ozonClient = {
      getRfbsReturn: jest.fn().mockResolvedValue(unchanged),
      setRfbsReturnAction: jest.fn().mockResolvedValue({ accepted: true }),
    };
    const service = new OzonExternalWriteService(
      prisma as any,
      {
        decode: jest.fn().mockReturnValue({ clientId: '12345', apiKey: 'k' }),
      } as any,
      ozonClient as any,
      { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any,
      tenantDatabaseFor(prisma) as any,
    );

    const result = await service.executeApprovedOrderRefund(
      { organizationId: 'org-1', userId: 'user-1', title: 'Approve refund' },
      {
        action: 'ozon.order.refund',
        params: {
          channelId: 'channel-1',
          returnId: 901,
          refundScope: 'rfbs_full_return',
          confirmFullRefund: true,
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'external_execution_failed',
        externalExecution: expect.objectContaining({
          status: 'readback_mismatch',
          mutationAccepted: true,
        }),
      }),
    );
  });
});
