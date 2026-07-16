import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OzonChannelAdapter,
  OzonChannelAdapterError,
} from '../src/features/channels/ozon-channel-adapter.service.js';

function fixture() {
  const credentials = {
    decode: jest.fn().mockResolvedValue({ clientId: 'client', apiKey: 'key' }),
  };
  const client = {
    getProductInfoList: jest.fn().mockResolvedValue([]),
    importProducts: jest.fn().mockResolvedValue({ taskId: 1, raw: {} }),
    getProductImportInfo: jest.fn().mockResolvedValue({ items: [], raw: {} }),
  };
  return {
    adapter: new OzonChannelAdapter(credentials as any, client as any),
    credentials,
    client,
  };
}

describe('OzonChannelAdapter', () => {
  it('keeps credential failures inside the protocol boundary', async () => {
    const { adapter, credentials, client } = fixture();
    credentials.decode.mockRejectedValueOnce(new Error('ciphertext invalid'));

    await expect(adapter.open('encrypted')).rejects.toEqual(
      expect.objectContaining<OzonChannelAdapterError>({
        category: 'CREDENTIALS_INVALID',
        retryable: false,
        outcomeUnknown: false,
      }),
    );
    expect(client.importProducts).not.toHaveBeenCalled();
  });

  it('classifies a definitive Ozon rejection without applying business policy', async () => {
    const { adapter, client } = fixture();
    client.importProducts.mockRejectedValueOnce(
      new BadRequestException({ message: 'invalid product payload' }),
    );
    const session = await adapter.open('encrypted');

    await expect(session.importProducts([])).rejects.toEqual(
      expect.objectContaining<OzonChannelAdapterError>({
        category: 'REQUEST_REJECTED',
        operation: 'PRODUCT_IMPORT',
        retryable: false,
        outcomeUnknown: false,
      }),
    );
  });

  it('marks a failed write transport as retryable with an unknown outcome', async () => {
    const { adapter, client } = fixture();
    client.importProducts.mockRejectedValueOnce(
      new ServiceUnavailableException('connection reset'),
    );
    const session = await adapter.open('encrypted');

    await expect(session.importProducts([])).rejects.toEqual(
      expect.objectContaining<OzonChannelAdapterError>({
        category: 'TEMPORARILY_UNAVAILABLE',
        operation: 'PRODUCT_IMPORT',
        retryable: true,
        outcomeUnknown: true,
      }),
    );
  });
});
