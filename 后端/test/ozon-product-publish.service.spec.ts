import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OzonProductPublishService } from '../src/features/channels/ozon-product-publish.service.js';
import { CanonicalCatalogService } from '../src/features/marketplace-compiler/canonical-catalog.service.js';
import { MarketplaceCompilerService } from '../src/features/marketplace-compiler/marketplace-compiler.service.js';
import { OzonChannelAdapter } from '../src/features/channels/ozon-channel-adapter.service.js';
import { OzonPublishPolicyService } from '../src/features/channels/ozon-publish-policy.service.js';

function createService(options?: { publication?: Record<string, unknown> }) {
  const product = {
    id: 'product-1',
    workspaceId: 'workspace-1',
    title: 'Portable tea set',
    sku: 'AGENT-TEA-1',
    price: 1800,
    currency: 'RUB',
    images: ['https://assets.example.com/products/tea-set-1.png'],
    metadata: {
      source: 'agent-product-research',
      ...(options?.publication ? { ozonPublication: options.publication } : {}),
    },
    updatedAt: new Date('2026-07-12T08:00:00.000Z'),
    workspace: {
      id: 'workspace-1',
      organizationId: 'org-1',
      channelType: 'OZON',
    },
  };
  const channel = {
    id: 'channel-1',
    workspaceId: 'workspace-1',
    provider: 'OZON',
    syncStatus: 'SUCCESS',
    accessTokenEncrypted: 'encrypted',
  };
  const prisma: any = {
    product: { findFirst: jest.fn().mockResolvedValue(product) },
    channelConnection: { findFirst: jest.fn().mockResolvedValue(channel) },
  };
  const credentials = {
    decode: jest.fn().mockReturnValue({ clientId: '1', apiKey: 'key' }),
  };
  const ozonClient = {
    importProducts: jest
      .fn()
      .mockResolvedValue({ taskId: 42, raw: { result: { task_id: 42 } } }),
    getProductImportInfo: jest.fn().mockResolvedValue({
      items: [{ offerId: 'AGENT-TEA-1', productId: 1001, errors: [], raw: {} }],
      raw: { result: { items: [] } },
    }),
    getProductInfoList: jest
      .fn()
      .mockResolvedValue([
        { productId: 1001, offerId: 'AGENT-TEA-1', status: 'active', raw: {} },
      ]),
  };
  const publishSnapshots = {
    loadApproved: jest.fn().mockResolvedValue({
      id: 'snapshot-1',
      snapshotHash: 'c'.repeat(64),
      snapshot: {
        channelId: 'channel-1',
        payload: {
          attributes: [
            { id: 85, complex_id: 0, values: [{ value: 'Approved Brand' }] },
          ],
          descriptionCategoryId: 17028922,
          dimensionUnit: 'mm',
          height: 10,
          width: 10,
          depth: 10,
          weight: 100,
          weightUnit: 'g',
          images: ['https://assets.example.com/approved.png'],
          name: 'Approved immutable title',
          offerId: 'APPROVED-SKU-1',
          price: 1999,
          vat: '0.2',
          currencyCode: 'RUB',
        },
        compilation: { schemaVersion: 'ozon-product-import/v1' },
      },
    }),
  };
  return {
    service: new OzonProductPublishService(
      prisma,
      new OzonChannelAdapter(credentials as any, ozonClient as any),
      new OzonPublishPolicyService(
        new CanonicalCatalogService(),
        new MarketplaceCompilerService(),
      ),
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
      publishSnapshots as any,
    ),
    prisma,
    credentials,
    ozonClient,
    publishSnapshots,
  };
}

describe('OzonProductPublishService', () => {
  it('blocks incomplete Ozon configuration before an image generation worker can run', async () => {
    const { service, ozonClient } = createService();

    const result = await service.preflightProduct({
      organizationId: 'org-1',
      productId: 'product-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        code: 'OZON_IMPORT_CONFIGURATION_INCOMPLETE',
      }),
    );
    expect(ozonClient.importProducts).not.toHaveBeenCalled();
  });

  it('blocks the launch before any Ozon write when mandatory import data is missing', async () => {
    const { service, ozonClient } = createService();

    const result = await service.publishProduct({
      organizationId: 'org-1',
      productId: 'product-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        code: 'OZON_IMPORT_CONFIGURATION_INCOMPLETE',
      }),
    );
    expect(ozonClient.importProducts).not.toHaveBeenCalled();
  });

  it('submits a configured product to Ozon and reports an active readback only after the API confirms it', async () => {
    const { service, credentials, ozonClient } = createService({
      publication: {
        descriptionCategoryId: 17028922,
        attributes: [{ id: 85, complex_id: 0, values: [{ value: 'Brand' }] }],
        vat: '0.2',
        dimensions: { height: 10, width: 10, depth: 10, weight: 100 },
      },
    });

    const result = await service.publishProduct({
      organizationId: 'org-1',
      productId: 'product-1',
    });

    expect(credentials.decode).toHaveBeenCalledWith('encrypted');
    expect(ozonClient.importProducts).toHaveBeenCalledWith(
      { clientId: '1', apiKey: 'key' },
      [
        expect.objectContaining({
          descriptionCategoryId: 17028922,
          offerId: 'AGENT-TEA-1',
          price: 1800,
          images: ['https://assets.example.com/products/tea-set-1.png'],
        }),
      ],
    );
    expect(ozonClient.getProductImportInfo).toHaveBeenCalledWith(
      { clientId: '1', apiKey: 'key' },
      42,
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'ACTIVE_ON_OZON',
        channelId: 'channel-1',
        taskId: 42,
        externalProductId: 1001,
      }),
    );
  });

  it('publishes the exact approved snapshot without re-reading mutable Product data', async () => {
    const { service, prisma, ozonClient, publishSnapshots } = createService();
    ozonClient.getProductImportInfo.mockResolvedValue({
      items: [
        {
          offerId: 'APPROVED-SKU-1',
          productId: 1001,
          errors: [],
          raw: {},
        },
      ],
      raw: { result: { items: [] } },
    });

    await service.publishSnapshot({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      expectedSnapshotHash: 'c'.repeat(64),
    });

    expect(publishSnapshots.loadApproved).toHaveBeenCalledWith({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      expectedSnapshotHash: 'c'.repeat(64),
    });
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
    expect(ozonClient.importProducts).toHaveBeenCalledWith(
      { clientId: '1', apiKey: 'key' },
      [
        expect.objectContaining({
          name: 'Approved immutable title',
          offerId: 'APPROVED-SKU-1',
          price: 1999,
          images: ['https://assets.example.com/approved.png'],
        }),
      ],
    );
  });

  it('opens the submission ledger immediately before the real Ozon write', async () => {
    const { service, ozonClient } = createService();
    const beforeDispatch = jest.fn().mockResolvedValue(undefined);

    await service.publishSnapshot(
      {
        organizationId: 'org-1',
        snapshotId: 'snapshot-1',
        expectedSnapshotHash: 'c'.repeat(64),
      },
      { beforeDispatch },
    );

    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(beforeDispatch.mock.invocationCallOrder[0]).toBeLessThan(
      ozonClient.importProducts.mock.invocationCallOrder[0],
    );
  });

  it('reconciles an approved snapshot by offerId before any duplicate Ozon write', async () => {
    const { service, ozonClient } = createService();
    ozonClient.getProductInfoList.mockResolvedValueOnce([
      {
        productId: 1001,
        offerId: 'APPROVED-SKU-1',
        status: 'active',
        raw: {},
      },
    ]);

    const result = await service.preflightSnapshot({
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      expectedSnapshotHash: 'c'.repeat(64),
    });

    expect(ozonClient.getProductInfoList).toHaveBeenCalledWith(
      { clientId: '1', apiKey: 'key' },
      [{ offerId: 'APPROVED-SKU-1' }],
    );
    expect(ozonClient.importProducts).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'ACTIVE_ON_OZON',
        externalProductId: 1001,
        evidence: expect.objectContaining({ source: 'ozon_offer_readback' }),
      }),
    );
  });

  it('rethrows an unavailable Ozon transport because the write outcome is unknown', async () => {
    const { service, ozonClient } = createService();
    ozonClient.getProductInfoList.mockResolvedValueOnce([]);
    ozonClient.importProducts.mockRejectedValueOnce(
      new ServiceUnavailableException('connection reset after dispatch'),
    );

    await expect(
      service.publishSnapshot({
        organizationId: 'org-1',
        snapshotId: 'snapshot-1',
        expectedSnapshotHash: 'c'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('records a definitive Ozon 4xx validation rejection as failed', async () => {
    const { service, ozonClient } = createService();
    ozonClient.getProductInfoList.mockResolvedValueOnce([]);
    ozonClient.importProducts.mockRejectedValueOnce(
      new BadRequestException('invalid product payload'),
    );

    await expect(
      service.publishSnapshot({
        organizationId: 'org-1',
        snapshotId: 'snapshot-1',
        expectedSnapshotHash: 'c'.repeat(64),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'FAILED',
        code: 'OZON_IMPORT_REJECTED',
      }),
    );
  });
});
