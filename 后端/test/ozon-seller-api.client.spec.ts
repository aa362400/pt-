import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OzonSellerApiClient } from '../src/features/channels/ozon-seller-api.client.js';

describe('OzonSellerApiClient response classification', () => {
  const originalFetch = global.fetch;
  const credentials = { clientId: 'client-id', apiKey: 'api-key' };
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it.each([408, 429, 500, 503])(
    'classifies HTTP %i as unavailable because a write outcome may be unknown',
    async (status) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status,
        text: jest.fn().mockResolvedValue('{"message":"temporary"}'),
      }) as typeof fetch;
      const client = new OzonSellerApiClient(config as any);

      await expect(
        client.verifyCredentials(credentials),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it('keeps a definitive HTTP 400 response as a bad request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('{"message":"invalid payload"}'),
    }) as typeof fetch;
    const client = new OzonSellerApiClient(config as any);

    await expect(client.verifyCredentials(credentials)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('OzonSellerApiClient order posting pagination', () => {
  const credentials = { clientId: 'client-id', apiKey: 'api-key' };
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('reads the new FBS and FBO cursor endpoints, follows top-level cursors, and deduplicates postings', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const cursor = body.cursor;
        let responseBody: Record<string, unknown>;

        if (url.endsWith('/v4/posting/fbs/list') && cursor === '') {
          responseBody = {
            postings: [
              {
                posting_number: 'FBS-1',
                status: 'awaiting_packaging',
                products: [{ price: '100', quantity: 1 }],
              },
            ],
            cursor: 'fbs-page-2',
            has_next: true,
          };
        } else if (
          url.endsWith('/v4/posting/fbs/list') &&
          cursor === 'fbs-page-2'
        ) {
          responseBody = {
            postings: [
              {
                posting_number: 'FBS-1',
                status: 'awaiting_packaging',
                products: [{ price: '100', quantity: 1 }],
              },
              {
                posting_number: 'FBS-2',
                status: 'awaiting_delivery',
                products: [{ price: '200', quantity: 1 }],
              },
            ],
            cursor: '',
            has_next: false,
          };
        } else if (url.endsWith('/v3/posting/fbo/list') && cursor === '') {
          responseBody = {
            postings: [
              {
                posting_number: 'FBO-1',
                status: 'delivered',
                products: [{ price: '300', quantity: 1 }],
              },
            ],
            cursor: '',
            has_next: false,
          };
        } else {
          throw new Error(`Unexpected Ozon request: ${url} ${String(cursor)}`);
        }

        return {
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify(responseBody)),
        } as unknown as Response;
      });
    const client = new OzonSellerApiClient(config as any);

    await expect(
      client.listOrderPostings(credentials, {
        since: '2026-07-15T00:00:00.000Z',
        to: '2026-07-16T00:00:00.000Z',
        limit: 50,
      }),
    ).resolves.toEqual({
      failures: [],
      items: [
        expect.objectContaining({
          fulfillmentType: 'FBS',
          postingNumber: 'FBS-1',
        }),
        expect.objectContaining({
          fulfillmentType: 'FBS',
          postingNumber: 'FBS-2',
        }),
        expect.objectContaining({
          fulfillmentType: 'FBO',
          postingNumber: 'FBO-1',
        }),
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        'https://api-seller.ozon.ru/v4/posting/fbs/list',
        'https://api-seller.ozon.ru/v3/posting/fbo/list',
      ]),
    );
    const secondFbsRequest = fetchMock.mock.calls.find(([url, init]) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return (
        String(url).endsWith('/v4/posting/fbs/list') &&
        body.cursor === 'fbs-page-2'
      );
    });
    expect(secondFbsRequest).toBeDefined();
  });

  it('rejects a repeated Ozon posting cursor instead of looping forever', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          postings: [],
          cursor: 'same-cursor',
          has_next: true,
        }),
      ),
    } as unknown as Response);
    const client = new OzonSellerApiClient(config as any);

    await expect(
      client.probeOrderPostingEndpoint(credentials, 'FBS', {
        since: '2026-07-15T00:00:00.000Z',
        to: '2026-07-16T00:00:00.000Z',
        limit: 5,
      }),
    ).rejects.toThrow('repeated cursor');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After before retrying a rate-limited read-only order request', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: jest.fn((name: string) =>
            name.toLowerCase() === 'retry-after' ? '2' : null,
          ),
        },
        text: jest.fn().mockResolvedValue('{"message":"rate limited"}'),
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
    const client = new OzonSellerApiClient(config as any);

    const result = client.probeOrderPostingEndpoint(credentials, 'FBO', {
      since: '2026-07-15T00:00:00.000Z',
      to: '2026-07-16T00:00:00.000Z',
      limit: 5,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({
      fulfillmentType: 'FBO',
      fetched: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
