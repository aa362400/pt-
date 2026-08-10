import {
  CanonicalCatalogService,
  type CanonicalProductV1,
} from '../src/features/marketplace-compiler/canonical-catalog.service.js';
import { MarketplaceCompilerService } from '../src/features/marketplace-compiler/marketplace-compiler.service.js';

const completeProduct: CanonicalProductV1 = {
  schemaVersion: 'canonical-product/v1',
  id: 'product-1',
  identity: {
    title: 'Portable tea set',
    sku: 'AGENT-TEA-1',
  },
  commercial: {
    price: 1800,
    currency: 'RUB',
    oldPrice: 2100,
    vat: '0.2',
  },
  logistics: {
    dimensions: {
      height: 10,
      width: 10,
      depth: 10,
      weight: 100,
      dimensionUnit: 'mm',
      weightUnit: 'g',
    },
  },
  media: {
    images: ['https://assets.example.com/products/tea-set-1.png'],
  },
  marketplaces: {
    ozon: {
      descriptionCategoryId: 17028922,
      attributes: [{ id: 85, complex_id: 0, values: [{ value: 'Brand' }] }],
      barcode: '4600000000000',
    },
  },
  provenance: {
    source: 'local-product-draft',
    sourceId: 'product-1',
    capturedAt: '2026-07-12T08:00:00.000Z',
  },
};

describe('MarketplaceCompilerService', () => {
  const compiler = new MarketplaceCompilerService();

  it('compiles one canonical product into a versioned Ozon import payload', () => {
    const result = compiler.compileOzon(completeProduct, { mode: 'PUBLISH' });

    expect(result).toEqual({
      status: 'VALID',
      target: 'OZON',
      schemaVersion: 'ozon-product-import/v1',
      payload: expect.objectContaining({
        name: 'Portable tea set',
        offerId: 'AGENT-TEA-1',
        descriptionCategoryId: 17028922,
        price: 1800,
        currencyCode: 'RUB',
        images: ['https://assets.example.com/products/tea-set-1.png'],
      }),
      errors: [],
      warnings: [],
      provenance: expect.objectContaining({
        sourceSchemaVersion: 'canonical-product/v1',
        sourceId: 'product-1',
      }),
    });
  });

  it('defers the image requirement during preflight and records that decision', () => {
    const product = {
      ...completeProduct,
      media: { images: [] },
    };

    const result = compiler.compileOzon(product, { mode: 'PREFLIGHT' });

    expect(result.status).toBe('VALID');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'MEDIA_REQUIRED_BEFORE_PUBLISH' }),
    );
  });

  it('returns structured errors and no payload when publish data is incomplete', () => {
    const product = {
      ...completeProduct,
      identity: { title: completeProduct.identity.title, sku: null },
      media: { images: ['http://insecure.example.com/image.png'] },
      marketplaces: {
        ozon: {
          descriptionCategoryId: null,
          attributes: [],
        },
      },
    } satisfies CanonicalProductV1;

    const result = compiler.compileOzon(product, { mode: 'PUBLISH' });

    expect(result.status).toBe('INVALID');
    expect(result.payload).toBeNull();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OFFER_ID_REQUIRED',
          path: 'identity.sku',
        }),
        expect.objectContaining({ code: 'CATEGORY_REQUIRED' }),
        expect.objectContaining({ code: 'ATTRIBUTES_REQUIRED' }),
        expect.objectContaining({ code: 'HTTPS_IMAGE_REQUIRED' }),
      ]),
    );
  });
});

describe('CanonicalCatalogService', () => {
  it('normalizes a local product record without inventing marketplace data', () => {
    const catalog = new CanonicalCatalogService();

    const product = catalog.fromLocalProduct({
      id: 'product-1',
      title: 'Portable tea set',
      sku: 'AGENT-TEA-1',
      price: 1800,
      currency: 'RUB',
      images: ['https://assets.example.com/products/tea-set-1.png'],
      updatedAt: new Date('2026-07-12T08:00:00.000Z'),
      metadata: {
        ozonPublication: {
          descriptionCategoryId: 17028922,
          attributes: [{ id: 85, values: [{ value: 'Brand' }] }],
          vat: '0.2',
          dimensions: { height: 10, width: 10, depth: 10, weight: 100 },
        },
      },
    });

    expect(product).toEqual(
      expect.objectContaining({
        schemaVersion: 'canonical-product/v1',
        provenance: {
          source: 'local-product-draft',
          sourceId: 'product-1',
          capturedAt: '2026-07-12T08:00:00.000Z',
        },
      }),
    );
    expect(product.marketplaces.ozon.descriptionCategoryId).toBe(17028922);
  });
});
