import { Injectable } from '@nestjs/common';

export const CANONICAL_PRODUCT_SCHEMA_VERSION = 'canonical-product/v1' as const;

export interface CanonicalProductV1 {
  schemaVersion: typeof CANONICAL_PRODUCT_SCHEMA_VERSION;
  id: string;
  identity: {
    title: string;
    sku: string | null;
  };
  commercial: {
    price: number | null;
    currency: string;
    oldPrice: number | null;
    vat: string | null;
  };
  logistics: {
    dimensions: {
      height: number | null;
      width: number | null;
      depth: number | null;
      weight: number | null;
      dimensionUnit: string;
      weightUnit: string;
    };
  };
  media: {
    images: string[];
  };
  marketplaces: {
    ozon: {
      descriptionCategoryId: number | null;
      attributes: Array<Record<string, unknown>>;
      offerId?: string;
      barcode?: string;
    };
  };
  provenance: {
    source: 'local-product-draft';
    sourceId: string;
    capturedAt: string;
  };
}

export interface LocalProductRecord {
  id: string;
  title: string;
  sku: string | null;
  price: unknown;
  currency: string;
  images: string[];
  metadata: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

@Injectable()
export class CanonicalCatalogService {
  fromLocalProduct(product: LocalProductRecord): CanonicalProductV1 {
    const publication = this.asRecord(
      this.asRecord(product.metadata).ozonPublication,
    );
    const dimensions = this.asRecord(publication.dimensions);

    return {
      schemaVersion: CANONICAL_PRODUCT_SCHEMA_VERSION,
      id: product.id,
      identity: {
        title: product.title.trim(),
        sku: this.asOptionalString(product.sku),
      },
      commercial: {
        price: this.asPositiveNumber(product.price),
        currency:
          this.asOptionalString(publication.currencyCode) ??
          product.currency.trim(),
        oldPrice: this.asPositiveNumber(publication.oldPrice),
        vat: this.asOptionalString(publication.vat),
      },
      logistics: {
        dimensions: {
          height: this.asPositiveNumber(dimensions.height),
          width: this.asPositiveNumber(dimensions.width),
          depth: this.asPositiveNumber(dimensions.depth),
          weight: this.asPositiveNumber(dimensions.weight),
          dimensionUnit:
            this.asOptionalString(dimensions.dimensionUnit) ?? 'mm',
          weightUnit: this.asOptionalString(dimensions.weightUnit) ?? 'g',
        },
      },
      media: {
        images: product.images.filter(
          (image): image is string => typeof image === 'string',
        ),
      },
      marketplaces: {
        ozon: {
          descriptionCategoryId: this.asPositiveInteger(
            publication.descriptionCategoryId,
          ),
          attributes: this.asRecordArray(publication.attributes),
          ...(this.asOptionalString(publication.offerId)
            ? { offerId: this.asOptionalString(publication.offerId)! }
            : {}),
          ...(this.asOptionalString(publication.barcode)
            ? { barcode: this.asOptionalString(publication.barcode)! }
            : {}),
        },
      },
      provenance: {
        source: 'local-product-draft',
        sourceId: product.id,
        capturedAt: this.recordedAt(product),
      },
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private recordedAt(product: LocalProductRecord): string {
    const recordedAt = product.updatedAt ?? product.createdAt;
    if (!recordedAt) {
      throw new Error('Canonical product provenance timestamp is required.');
    }
    return new Date(recordedAt).toISOString();
  }

  private asRecordArray(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private asOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private asPositiveNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
  }

  private asPositiveInteger(value: unknown): number | null {
    const numberValue = this.asPositiveNumber(value);
    return numberValue !== null && Number.isInteger(numberValue)
      ? numberValue
      : null;
  }
}
