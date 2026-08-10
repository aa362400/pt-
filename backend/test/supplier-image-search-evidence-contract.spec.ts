import { supplierImageSearchEvidenceSchema } from '../src/features/product-research/daily/contracts/supplier-image-search-evidence.contract.js';

const SHA = {
  raw: 'a'.repeat(64),
  original: 'b'.repeat(64),
  canonical: 'c'.repeat(64),
};

interface NormalizedOfferFixture {
  offerId: string;
  subject: string | null;
  detailUrl: string | null;
  imageUrl: string | null;
  distributionFreePostage: boolean | null;
  displayPriceEvidence: {
    price: string | null;
    consignPrice: string | null;
    multipleConsignPrice: string | null;
    evidenceUse: 'DISPLAY_ONLY';
    verifiedProcurementCost: false;
  };
}

function normalizedOffer(index = 1): NormalizedOfferFixture {
  return {
    offerId: String(123456789000000000n + BigInt(index)),
    subject: `Display-only image search result ${index}`,
    detailUrl: `https://detail.1688.com/offer/${index}.html`,
    imageUrl: `https://cbu01.alicdn.com/img/offer-${index}.png`,
    distributionFreePostage: index % 2 === 0,
    displayPriceEvidence: {
      price: '¥18.50 text',
      consignPrice: 'CNY 19.00 / text',
      multipleConsignPrice: '3english_text：¥17.80',
      evidenceUse: 'DISPLAY_ONLY',
      verifiedProcurementCost: false,
    },
  };
}

function imageSearchEvidence() {
  return {
    schemaVersion: 'supplier-image-search/v1',
    provider: 'documented-1688-image-search',
    adapterVersion: 'supplier-image-search-adapter/v1',
    requestId: 'image-search-request-20260716-001',
    outcome: 'MATCHES',
    rawSnapshotSha256: SHA.raw,
    canonicalization: {
      version: 'supplier-image-canonical/v1',
      sourceOriginalSha256: SHA.original,
      sourceCanonicalSha256: SHA.canonical,
      canonicalByteSize: 128_000,
      canonicalMimeType: 'image/png',
      canonicalWidth: 1200,
      canonicalHeight: 1200,
      retrievalHashAlgorithm: 'DHASH64',
      retrievalHash: '0123456789abcdef',
    },
    providerResultCount: 1,
    normalizedOffers: [normalizedOffer()],
    fetchedAt: '2026-07-16T03:30:00.000Z',
  };
}

describe('supplier image-search evidence contract', () => {
  it('preserves every legal Agent offer field and uses array order as rank', () => {
    const value = imageSearchEvidence();
    value.providerResultCount = 2;
    value.normalizedOffers = [normalizedOffer(2), normalizedOffer(1)];

    const parsed = supplierImageSearchEvidenceSchema.parse(value);

    expect(parsed.normalizedOffers).toEqual(value.normalizedOffers);
    expect(parsed.normalizedOffers.map((offer) => offer.offerId)).toEqual([
      '123456789000000002',
      '123456789000000001',
    ]);
    expect(parsed.normalizedOffers[0]).not.toHaveProperty('resultRank');
  });

  it('accepts nullable subject, URLs, postage and display-price strings', () => {
    const value = imageSearchEvidence();
    value.normalizedOffers[0] = {
      offerId: '123456789000000001',
      subject: null,
      detailUrl: null,
      imageUrl: null,
      distributionFreePostage: null,
      displayPriceEvidence: {
        price: null,
        consignPrice: null,
        multipleConsignPrice: null,
        evidenceUse: 'DISPLAY_ONLY',
        verifiedProcurementCost: false,
      },
    };

    expect(
      supplierImageSearchEvidenceSchema.parse(value).normalizedOffers[0],
    ).toEqual(value.normalizedOffers[0]);
  });

  it.each(['', '123456789012345678901234567890123', 'offer-123', ' 123 '])(
    'rejects offerId outside the Agent decimal-string boundary: %j',
    (offerId) => {
      const value = imageSearchEvidence();
      value.normalizedOffers[0].offerId = offerId;

      expect(supplierImageSearchEvidenceSchema.safeParse(value).success).toBe(
        false,
      );
    },
  );

  it('preserves subject text but enforces the Agent 1..1000 length boundary', () => {
    const spaced = imageSearchEvidence();
    spaced.normalizedOffers[0].subject = '  supplier title  ';
    const empty = imageSearchEvidence();
    empty.normalizedOffers[0].subject = '';
    const atLimit = imageSearchEvidence();
    atLimit.normalizedOffers[0].subject = 'x'.repeat(1000);
    const aboveLimit = imageSearchEvidence();
    aboveLimit.normalizedOffers[0].subject = 'x'.repeat(1001);

    expect(
      supplierImageSearchEvidenceSchema.parse(spaced).normalizedOffers[0]
        .subject,
    ).toBe('  supplier title  ');
    expect(supplierImageSearchEvidenceSchema.safeParse(empty).success).toBe(
      false,
    );
    expect(supplierImageSearchEvidenceSchema.safeParse(atLimit).success).toBe(
      true,
    );
    expect(
      supplierImageSearchEvidenceSchema.safeParse(aboveLimit).success,
    ).toBe(false);
  });

  it.each(['detailUrl', 'imageUrl'] as const)(
    'accepts null but rejects unsafe %s values',
    (field) => {
      const nullable = imageSearchEvidence();
      nullable.normalizedOffers[0][field] = null;
      expect(
        supplierImageSearchEvidenceSchema.safeParse(nullable).success,
      ).toBe(true);

      for (const unsafe of [
        'http://detail.1688.com/offer/123.html',
        'https://user:password@detail.1688.com/offer/123.html',
        'https://detail.1688.com/offer/123.html?access_token=secret',
        'https://detail.1688.com/offer/123.html?api%5Fkey=secret',
      ]) {
        const value = imageSearchEvidence();
        value.normalizedOffers[0][field] = unsafe;
        expect(supplierImageSearchEvidenceSchema.safeParse(value).success).toBe(
          false,
        );
      }
    },
  );

  it.each(['detailUrl', 'imageUrl'] as const)(
    'enforces the Agent 4096-character limit for %s',
    (field) => {
      const prefix = 'https://detail.1688.com/';
      const atLimit = imageSearchEvidence();
      atLimit.normalizedOffers[0][field] =
        prefix + 'a'.repeat(4096 - prefix.length);
      const aboveLimit = imageSearchEvidence();
      aboveLimit.normalizedOffers[0][field] =
        prefix + 'a'.repeat(4097 - prefix.length);

      expect(supplierImageSearchEvidenceSchema.safeParse(atLimit).success).toBe(
        true,
      );
      expect(
        supplierImageSearchEvidenceSchema.safeParse(aboveLimit).success,
      ).toBe(false);
    },
  );

  it.each(['detailUrl', 'imageUrl'] as const)(
    'rejects encoded query keys but permits benign encoded values in %s',
    (field) => {
      const encodedKey = imageSearchEvidence();
      encodedKey.normalizedOffers[0][field] =
        'https://detail.1688.com/offer/123.html?benign%5Fkey=value';
      const encodedValue = imageSearchEvidence();
      encodedValue.normalizedOffers[0][field] =
        'https://detail.1688.com/offer/123.html?q=hello%20world';

      expect(
        supplierImageSearchEvidenceSchema.safeParse(encodedKey).success,
      ).toBe(false);
      expect(
        supplierImageSearchEvidenceSchema.safeParse(encodedValue).success,
      ).toBe(true);
    },
  );

  it('trims arbitrary nonempty display-price strings without parsing money', () => {
    const value = imageSearchEvidence();
    value.normalizedOffers[0].displayPriceEvidence = {
      price: '  text ¥18.5/text  ',
      consignPrice: '  text / contact supplier  ',
      multipleConsignPrice: '  2english_text，english_text  ',
      evidenceUse: 'DISPLAY_ONLY',
      verifiedProcurementCost: false,
    };

    const parsed = supplierImageSearchEvidenceSchema.parse(value);

    expect(parsed.normalizedOffers[0].displayPriceEvidence).toEqual({
      price: 'text ¥18.5/text',
      consignPrice: 'text / contact supplier',
      multipleConsignPrice: '2english_text，english_text',
      evidenceUse: 'DISPLAY_ONLY',
      verifiedProcurementCost: false,
    });
  });

  it.each(['price', 'consignPrice', 'multipleConsignPrice'] as const)(
    'requires %s to be null or a trimmed nonempty string of at most 128 characters',
    (field) => {
      const nullable = imageSearchEvidence();
      nullable.normalizedOffers[0].displayPriceEvidence[field] = null;
      expect(
        supplierImageSearchEvidenceSchema.safeParse(nullable).success,
      ).toBe(true);

      for (const invalid of ['   ', 'x'.repeat(129), 18.5]) {
        const value = imageSearchEvidence() as unknown as {
          normalizedOffers: Array<{
            displayPriceEvidence: Record<string, unknown>;
          }>;
        };
        value.normalizedOffers[0].displayPriceEvidence[field] = invalid;
        expect(supplierImageSearchEvidenceSchema.safeParse(value).success).toBe(
          false,
        );
      }
    },
  );

  it.each([
    {
      field: 'evidenceUse',
      value: 'PROCUREMENT_COST',
    },
    {
      field: 'verifiedProcurementCost',
      value: true,
    },
  ])('locks display price evidence field $field', ({ field, value }) => {
    const payload = imageSearchEvidence() as unknown as {
      normalizedOffers: Array<{
        displayPriceEvidence: Record<string, unknown>;
      }>;
    };
    payload.normalizedOffers[0].displayPriceEvidence[field] = value;

    expect(supplierImageSearchEvidenceSchema.safeParse(payload).success).toBe(
      false,
    );
  });

  it.each(['offerUrl', 'title', 'resultRank', 'procurementCost', 'currency'])(
    'rejects legacy or unknown normalized offer field %s',
    (field) => {
      const payload = imageSearchEvidence() as unknown as {
        normalizedOffers: Array<Record<string, unknown>>;
      };
      payload.normalizedOffers[0][field] = 'must-not-persist';

      expect(supplierImageSearchEvidenceSchema.safeParse(payload).success).toBe(
        false,
      );
    },
  );

  it.each(['minimumAmount', 'maximumAmount', 'displayText', 'currency'])(
    'rejects legacy or unknown display-price field %s',
    (field) => {
      const payload = imageSearchEvidence() as unknown as {
        normalizedOffers: Array<{
          displayPriceEvidence: Record<string, unknown>;
        }>;
      };
      payload.normalizedOffers[0].displayPriceEvidence[field] =
        'must-not-persist';

      expect(supplierImageSearchEvidenceSchema.safeParse(payload).success).toBe(
        false,
      );
    },
  );

  it('accepts at most 50 normalized offers', () => {
    const fifty = imageSearchEvidence();
    fifty.normalizedOffers = Array.from({ length: 50 }, (_, index) =>
      normalizedOffer(index + 1),
    );
    fifty.providerResultCount = 50;
    const fiftyOne = {
      ...fifty,
      providerResultCount: 51,
      normalizedOffers: [...fifty.normalizedOffers, normalizedOffer(51)],
    };

    expect(supplierImageSearchEvidenceSchema.safeParse(fifty).success).toBe(
      true,
    );
    expect(supplierImageSearchEvidenceSchema.safeParse(fiftyOne).success).toBe(
      false,
    );
  });

  it('aligns providerResultCount with the Agent maximum of 500', () => {
    const atLimit = imageSearchEvidence();
    atLimit.providerResultCount = 500;
    const aboveLimit = imageSearchEvidence();
    aboveLimit.providerResultCount = 501;

    expect(supplierImageSearchEvidenceSchema.safeParse(atLimit).success).toBe(
      true,
    );
    expect(
      supplierImageSearchEvidenceSchema.safeParse(aboveLimit).success,
    ).toBe(false);
  });

  it('enforces the documented 3 MiB canonical provider payload limit', () => {
    const atLimit = imageSearchEvidence();
    atLimit.canonicalization.canonicalByteSize = 3 * 1024 * 1024;
    const aboveLimit = imageSearchEvidence();
    aboveLimit.canonicalization.canonicalByteSize = 3 * 1024 * 1024 + 1;

    expect(supplierImageSearchEvidenceSchema.safeParse(atLimit).success).toBe(
      true,
    );
    expect(
      supplierImageSearchEvidenceSchema.safeParse(aboveLimit).success,
    ).toBe(false);
  });

  it.each([
    ['canonicalPath', 'C:/secret/source.png'],
    ['token', 'secret-token'],
    ['rawBody', '{"secret":"value"}'],
  ])('rejects forbidden or unknown top-level field %s', (field, value) => {
    const payload = {
      ...imageSearchEvidence(),
      [field]: value,
    };

    expect(supplierImageSearchEvidenceSchema.safeParse(payload).success).toBe(
      false,
    );
  });

  it('preserves a real NO_RESULTS response only with zero count and no offers', () => {
    const payload = {
      ...imageSearchEvidence(),
      outcome: 'NO_RESULTS',
      providerResultCount: 0,
      normalizedOffers: [],
    };

    expect(supplierImageSearchEvidenceSchema.safeParse(payload).success).toBe(
      true,
    );
  });

  it.each([
    {
      label: 'MATCHES without offers',
      mutate: () => ({
        ...imageSearchEvidence(),
        providerResultCount: 0,
        normalizedOffers: [],
      }),
    },
    {
      label: 'NO_RESULTS with a provider count',
      mutate: () => ({
        ...imageSearchEvidence(),
        outcome: 'NO_RESULTS',
        providerResultCount: 1,
        normalizedOffers: [],
      }),
    },
    {
      label: 'NO_RESULTS with a normalized offer',
      mutate: () => ({
        ...imageSearchEvidence(),
        outcome: 'NO_RESULTS',
        providerResultCount: 0,
      }),
    },
  ])('rejects inconsistent outcome shape: $label', ({ mutate }) => {
    expect(supplierImageSearchEvidenceSchema.safeParse(mutate()).success).toBe(
      false,
    );
  });
});
