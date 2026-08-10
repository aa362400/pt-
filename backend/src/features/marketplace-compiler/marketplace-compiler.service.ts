import { Injectable } from '@nestjs/common';
import type { OzonProductImportInput } from '../channels/ozon-seller-api.client.js';
import {
  CANONICAL_PRODUCT_SCHEMA_VERSION,
  type CanonicalProductV1,
} from './canonical-catalog.service.js';

export type MarketplaceCompileMode = 'PREFLIGHT' | 'PUBLISH';

export interface MarketplaceCompilationIssue {
  code: string;
  path: string;
  message: string;
}

interface OzonCompilationBase {
  target: 'OZON';
  schemaVersion: 'ozon-product-import/v1';
  errors: MarketplaceCompilationIssue[];
  warnings: MarketplaceCompilationIssue[];
  provenance: {
    sourceSchemaVersion: typeof CANONICAL_PRODUCT_SCHEMA_VERSION;
    sourceId: string;
    capturedAt: string;
    compiledAt: string;
  };
}

export type OzonCompilationResult =
  | (OzonCompilationBase & {
      status: 'VALID';
      payload: OzonProductImportInput;
    })
  | (OzonCompilationBase & {
      status: 'INVALID';
      payload: null;
    });

@Injectable()
export class MarketplaceCompilerService {
  compileOzon(
    product: CanonicalProductV1,
    options: { mode: MarketplaceCompileMode },
  ): OzonCompilationResult {
    const errors: MarketplaceCompilationIssue[] = [];
    const warnings: MarketplaceCompilationIssue[] = [];
    const ozon = product.marketplaces.ozon;
    const dimensions = product.logistics.dimensions;
    const offerId = ozon.offerId ?? product.identity.sku;
    const httpsImages = product.media.images.filter((image) =>
      /^https:\/\//i.test(image),
    );

    this.require(
      errors,
      product.schemaVersion === CANONICAL_PRODUCT_SCHEMA_VERSION,
      'CANONICAL_SCHEMA_UNSUPPORTED',
      'schemaVersion',
      'Canonical product schema version is not supported.',
    );
    this.require(
      errors,
      product.identity.title.length > 0,
      'TITLE_REQUIRED',
      'identity.title',
      'Product title is required.',
    );
    this.require(
      errors,
      Boolean(offerId),
      'OFFER_ID_REQUIRED',
      'identity.sku',
      'Ozon offer_id or local SKU is required.',
    );
    this.require(
      errors,
      Boolean(ozon.descriptionCategoryId),
      'CATEGORY_REQUIRED',
      'marketplaces.ozon.descriptionCategoryId',
      'Ozon description category ID is required.',
    );
    this.require(
      errors,
      ozon.attributes.length > 0,
      'ATTRIBUTES_REQUIRED',
      'marketplaces.ozon.attributes',
      'At least one Ozon category attribute is required.',
    );
    this.require(
      errors,
      Boolean(product.commercial.price),
      'PRICE_REQUIRED',
      'commercial.price',
      'A positive sale price is required.',
    );
    this.require(
      errors,
      product.commercial.currency.length > 0,
      'CURRENCY_REQUIRED',
      'commercial.currency',
      'Currency is required.',
    );
    this.require(
      errors,
      Boolean(product.commercial.vat),
      'VAT_REQUIRED',
      'commercial.vat',
      'Ozon VAT rate is required.',
    );

    for (const field of ['height', 'width', 'depth', 'weight'] as const) {
      this.require(
        errors,
        Boolean(dimensions[field]),
        'DIMENSIONS_REQUIRED',
        `logistics.dimensions.${field}`,
        `A positive ${field} value is required.`,
      );
    }

    if (options.mode === 'PUBLISH') {
      this.require(
        errors,
        httpsImages.length > 0,
        'HTTPS_IMAGE_REQUIRED',
        'media.images',
        'At least one publicly accessible HTTPS image is required.',
      );
    } else if (httpsImages.length === 0) {
      warnings.push({
        code: 'MEDIA_REQUIRED_BEFORE_PUBLISH',
        path: 'media.images',
        message:
          'HTTPS media is deferred during preflight but required to publish.',
      });
    }

    const provenance = {
      sourceSchemaVersion: product.schemaVersion,
      sourceId: product.provenance.sourceId,
      capturedAt: product.provenance.capturedAt,
      compiledAt: new Date().toISOString(),
    };
    if (errors.length > 0) {
      return {
        status: 'INVALID',
        target: 'OZON',
        schemaVersion: 'ozon-product-import/v1',
        payload: null,
        errors,
        warnings,
        provenance,
      };
    }

    return {
      status: 'VALID',
      target: 'OZON',
      schemaVersion: 'ozon-product-import/v1',
      payload: {
        attributes: ozon.attributes,
        descriptionCategoryId: ozon.descriptionCategoryId!,
        dimensionUnit: dimensions.dimensionUnit,
        height: dimensions.height!,
        width: dimensions.width!,
        depth: dimensions.depth!,
        weight: dimensions.weight!,
        weightUnit: dimensions.weightUnit,
        images: httpsImages,
        name: product.identity.title,
        offerId: offerId!,
        price: product.commercial.price!,
        vat: product.commercial.vat!,
        ...(ozon.barcode ? { barcode: ozon.barcode } : {}),
        ...(product.commercial.oldPrice
          ? { oldPrice: product.commercial.oldPrice }
          : {}),
        currencyCode: product.commercial.currency,
      },
      errors,
      warnings,
      provenance,
    };
  }

  private require(
    issues: MarketplaceCompilationIssue[],
    condition: boolean,
    code: string,
    path: string,
    message: string,
  ): void {
    if (!condition) {
      issues.push({ code, path, message });
    }
  }
}
