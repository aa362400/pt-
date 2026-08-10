import { OzonSellerApiClient } from '../src/features/channels/ozon-seller-api.client.js';
import { OzonPerformanceApiClient } from '../src/features/channels/ozon-performance-api.client.js';
import { OzonCustomerServiceService } from '../src/features/channels/ozon-customer-service.service.js';
import { OzonExternalWriteService } from '../src/features/channels/ozon-external-write.service.js';

const credentials = { clientId: 'seller-1', apiKey: 'seller-key' };
const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('OzonSellerApiClient customer service', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads chats, questions and current v2 reviews with documented request bodies', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({
          chats: [{ chat: { chat_id: 'chat-1' } }],
          total_unread_count: 2,
          has_next: false,
        }),
      )
      .mockResolvedValueOnce(
        response({ questions: [{ id: 'question-1' }], has_next: false }),
      )
      .mockResolvedValueOnce(
        response({ reviews: [{ id: 'review-1' }], has_next: false }),
      );
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await expect(client.listCustomerChats(credentials)).resolves.toEqual(
      expect.objectContaining({ totalUnreadCount: 2 }),
    );
    await expect(client.listCustomerQuestions(credentials)).resolves.toEqual(
      expect.objectContaining({ questions: [{ id: 'question-1' }] }),
    );
    await expect(client.listCustomerReviews(credentials)).resolves.toEqual(
      expect.objectContaining({ reviews: [{ id: 'review-1' }] }),
    );

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api-seller.ozon.ru/v3/chat/list',
      'https://api-seller.ozon.ru/v1/question/list',
      'https://api-seller.ozon.ru/v2/review/list',
    ]);
    expect(
      JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)),
    ).toEqual({ filters: {}, limit: 20, sort_dir: 'DESC' });
  });

  it('uses the official write endpoints for approved customer responses', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ result: 'success' }));
    const client = new OzonSellerApiClient({
      get: jest.fn().mockReturnValue('https://api-seller.ozon.ru'),
    } as any);

    await client.sendCustomerChatMessage(credentials, {
      chatId: 'chat-1',
      text: 'Ответ',
    });
    await client.answerCustomerQuestion(credentials, {
      questionId: 'question-1',
      sku: 1001,
      text: 'Ответ',
    });
    await client.commentOnCustomerReview(credentials, {
      reviewId: 'review-1',
      text: 'Спасибо',
    });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api-seller.ozon.ru/v1/chat/send/message',
      'https://api-seller.ozon.ru/v1/question/answer/create',
      'https://api-seller.ozon.ru/v1/review/comment/create',
    ]);
  });
});

describe('OzonPerformanceApiClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('exchanges client credentials for a bearer token and reads campaigns', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({ access_token: 'token-1', expires_in: 1800 }),
      )
      .mockResolvedValueOnce(
        response({
          list: [
            {
              id: 'campaign-1',
              title: 'Search campaign',
              state: 'CAMPAIGN_STATE_RUNNING',
              weeklyBudget: '250000000',
            },
          ],
        }),
      );
    const client = new OzonPerformanceApiClient({
      get: jest.fn().mockReturnValue('https://api-performance.ozon.ru'),
    } as any);

    await expect(
      client.listCampaigns({ clientId: 'perf-1', clientSecret: 'secret' }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'campaign-1',
        weeklyBudget: 250,
      }),
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api-performance.ozon.ru/api/client/token',
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)),
    ).toEqual({
      client_id: 'perf-1',
      client_secret: 'secret',
      grant_type: 'client_credentials',
    });
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer token-1' }),
    );
  });

  it('converts a human RUB weekly budget to Ozon micro-rubles', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({ access_token: 'token-1', expires_in: 1800 }),
      )
      .mockResolvedValueOnce(response({ campaignId: 'campaign-1' }));
    const client = new OzonPerformanceApiClient({
      get: jest.fn().mockReturnValue('https://api-performance.ozon.ru'),
    } as any);

    await client.updateCampaignBudget(
      { clientId: 'perf-1', clientSecret: 'secret' },
      'campaign-1',
      125.5,
    );

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api-performance.ozon.ru/api/client/campaign/campaign-1',
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)),
    ).toEqual({ weeklyBudget: '125500000' });
  });
});

describe('OzonCustomerServiceService source isolation', () => {
  it('keeps chat data visible when premium question/review sources reject', async () => {
    const channel = {
      id: 'channel-1',
      workspaceId: 'workspace-1',
      externalShopId: 'seller-1',
      accessTokenEncrypted: 'encrypted',
      syncStatus: 'SUCCESS',
      lastSyncedAt: new Date('2026-07-14T00:00:00.000Z'),
    };
    const prisma = {
      channelConnection: { findFirst: jest.fn().mockResolvedValue(channel) },
    };
    const tenantDatabase = {
      run: jest.fn(
        (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
          operation(prisma),
      ),
    };
    const client = {
      listCustomerChats: jest.fn().mockResolvedValue({
        chats: [
          {
            chat: {
              chat_id: 'chat-1',
              chat_type: 'Buyer_Seller',
              chat_status: 'OPENED',
            },
            unread_count: 1,
          },
        ],
        totalUnreadCount: 1,
      }),
      listCustomerQuestions: jest
        .fn()
        .mockRejectedValue(new Error('Premium Plus required')),
      listCustomerReviews: jest
        .fn()
        .mockRejectedValue(new Error('Review subscription required')),
    };
    const service = new OzonCustomerServiceService(
      tenantDatabase as any,
      { decode: jest.fn().mockResolvedValue(credentials) } as any,
      client as any,
    );

    const result = await service.overview(user, { limit: 30 });

    expect(result.chats).toHaveLength(1);
    expect(result.sources.chats.status).toBe('connected');
    expect(result.sources.questions.status).toBe('unavailable');
    expect(result.sources.reviews.status).toBe('unavailable');
  });
});

describe('Ozon approved external mutations', () => {
  const notification = {
    organizationId: 'org-1',
    userId: 'user-1',
    title: 'approval',
  };

  function createService(provider: 'OZON' | 'OZON_PERFORMANCE') {
    const channel = {
      id: 'channel-1',
      workspaceId: 'workspace-1',
      provider,
      accessTokenEncrypted: 'encrypted',
      syncStatus: 'SUCCESS',
    };
    const prisma = {
      channelConnection: { findFirst: jest.fn().mockResolvedValue(channel) },
    };
    const tenantDatabase = {
      run: jest.fn(
        (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
          operation(prisma),
      ),
    };
    const sellerClient = {
      sendCustomerChatMessage: jest
        .fn()
        .mockResolvedValue({ result: 'success' }),
      answerCustomerQuestion: jest.fn(),
      commentOnCustomerReview: jest.fn(),
    };
    const performanceClient = {
      activateCampaign: jest.fn(),
      deactivateCampaign: jest.fn(),
      updateCampaignBudget: jest
        .fn()
        .mockResolvedValue({ campaignId: 'campaign-1' }),
    };
    const audit = { appendStrict: jest.fn().mockResolvedValue(undefined) };
    const service = new OzonExternalWriteService(
      {} as any,
      {
        decode: jest.fn().mockResolvedValue(credentials),
        decodePerformance: jest
          .fn()
          .mockResolvedValue({ clientId: 'perf-1', clientSecret: 'secret' }),
      } as any,
      sellerClient as any,
      audit as any,
      tenantDatabase as any,
      performanceClient as any,
    );
    return { service, sellerClient, performanceClient, audit };
  }

  it('sends an approved chat reply and records strict before/after audit evidence', async () => {
    const { service, sellerClient, audit } = createService('OZON');

    await expect(
      service.executeApprovedCustomerServiceAction(notification, {
        action: 'ozon.chat.send_message',
        params: { channelId: 'channel-1', targetId: 'chat-1', text: 'Ответ' },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'executed' }));

    expect(sellerClient.sendCustomerChatMessage).toHaveBeenCalledWith(
      credentials,
      { chatId: 'chat-1', text: 'Ответ' },
    );
    expect(audit.appendStrict).toHaveBeenCalledTimes(2);
  });

  it('updates an approved weekly budget through the Performance adapter', async () => {
    const { service, performanceClient, audit } =
      createService('OZON_PERFORMANCE');

    await expect(
      service.executeApprovedAdsAction(notification, {
        action: 'ozon.ads.weekly_budget.update',
        params: {
          channelId: 'channel-1',
          campaignId: 'campaign-1',
          weeklyBudgetRub: 125.5,
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'executed' }));

    expect(performanceClient.updateCampaignBudget).toHaveBeenCalledWith(
      { clientId: 'perf-1', clientSecret: 'secret' },
      'campaign-1',
      125.5,
    );
    expect(audit.appendStrict).toHaveBeenCalledTimes(2);
  });
});
