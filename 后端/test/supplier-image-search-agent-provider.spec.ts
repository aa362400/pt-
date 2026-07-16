import { HttpAgentProvider } from '../src/agents/http-agent.provider.js';
import { MockAgentProvider } from '../src/agents/mock-agent.provider.js';

const REQUEST_ID = 'dpr-sis-v1:0123456789abcdef';
const CONTEXT = {
  orgId: 'org-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  requestId: REQUEST_ID,
};

function matchesResult() {
  return {
    outcome: 'MATCHES',
    providerResultCount: 1,
    offers: [
      {
        offerId: '7234567890123',
        subject: 'Supplier image match',
        detailUrl: 'https://detail.1688.com/offer/7234567890123.html',
        imageUrl: 'https://cbu01.alicdn.com/example.jpg',
        distributionFreePostage: true,
        displayPriceEvidence: {
          price: '10.50',
          consignPrice: '10.50',
          multipleConsignPrice: '9.80',
          evidenceUse: 'DISPLAY_ONLY',
          verifiedProcurementCost: false,
        },
      },
    ],
    imageEvidence: {
      canonicalizationVersion: 'supplier-image-search-payload/v2',
      sourceOriginalSha256: 'a'.repeat(64),
      sourceCanonicalSha256: 'b'.repeat(64),
      decodedSizeBytes: 123_456,
      payloadMimeType: 'image/png',
      width: 1200,
      height: 1200,
      retrievalHashAlgorithm: 'DHASH64',
      retrievalHash: '0123456789abcdef',
      retrievalOnly: true,
    },
    provenance: {
      adapterVersion: 'supplier-image-search-adapter/v1',
      provider: 'documented-1688-image-search',
      requestId: REQUEST_ID,
      fetchedAt: '2026-07-16T03:30:00.000000Z',
      rawSnapshotSha256: 'c'.repeat(64),
    },
  };
}

function providerWithRemoteResult(result: unknown) {
  const provider = new HttpAgentProvider({
    get: jest.fn((key: string) => {
      if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
      if (key === 'AGENT_API_KEY') return 'test-key';
      return undefined;
    }),
  } as never);
  const runRemoteTask = jest.fn().mockResolvedValue(result);
  (
    provider as unknown as {
      runRemoteTask: typeof runRemoteTask;
    }
  ).runRemoteTask = runRemoteTask;
  return { provider, runRemoteTask };
}

describe('HttpAgentProvider supplier image search', () => {
  it('dispatches the real task with the precommitted request context', async () => {
    const result = matchesResult();
    const { provider, runRemoteTask } = providerWithRemoteResult(result);
    const input = {
      imageUrl: 'https://images.example.test/product.png',
      imageKeywords: 'portable organizer',
    };

    await expect(
      provider.runSupplierImageSearch(input, CONTEXT),
    ).resolves.toEqual(result);
    expect(runRemoteTask).toHaveBeenCalledWith(
      'supplier_image_search',
      input,
      CONTEXT,
      { pollTimeoutMs: 3 * 60_000 },
    );
  });

  it('accepts a truthful NO_RESULTS response', async () => {
    const noResults = {
      ...matchesResult(),
      outcome: 'NO_RESULTS',
      providerResultCount: 0,
      offers: [],
    };
    const { provider } = providerWithRemoteResult(noResults);

    await expect(
      provider.runSupplierImageSearch(
        { imageBase64: 'data:image/png;base64,YQ==' },
        CONTEXT,
      ),
    ).resolves.toEqual(noResults);
  });

  it('rejects a response whose provenance is not bound to the request', async () => {
    const mismatch = matchesResult();
    mismatch.provenance.requestId = 'different-request';
    const { provider } = providerWithRemoteResult(mismatch);

    await expect(
      provider.runSupplierImageSearch(
        { imageUrl: 'https://images.example.test/product.png' },
        CONTEXT,
      ),
    ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_REQUEST_ID_MISMATCH');
  });

  it.each([
    {
      label: 'both image inputs',
      input: {
        imageUrl: 'https://images.example.test/product.png',
        imageBase64: 'data:image/png;base64,YQ==',
      },
    },
    { label: 'neither image input', input: {} },
  ])('rejects $label before dispatch', async ({ input }) => {
    const { provider, runRemoteTask } =
      providerWithRemoteResult(matchesResult());

    await expect(
      provider.runSupplierImageSearch(input as never, CONTEXT),
    ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_INPUT_INVALID');
    expect(runRemoteTask).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'extra raw response body',
      mutate: (value: ReturnType<typeof matchesResult>) =>
        Object.assign(value, { rawBody: '{"secret":"must-not-cross"}' }),
    },
    {
      label: 'canonical local path',
      mutate: (value: ReturnType<typeof matchesResult>) =>
        Object.assign(value.imageEvidence, {
          canonicalPath: 'C:/private/product.png',
        }),
    },
    {
      label: 'non-HTTPS offer URL',
      mutate: (value: ReturnType<typeof matchesResult>) => {
        value.offers[0].detailUrl = 'http://detail.1688.com/offer/1.html';
      },
    },
  ])('rejects $label', async ({ mutate }) => {
    const invalid = matchesResult();
    mutate(invalid);
    const { provider } = providerWithRemoteResult(invalid);

    await expect(
      provider.runSupplierImageSearch(
        { imageUrl: 'https://images.example.test/product.png' },
        CONTEXT,
      ),
    ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_RESULT_INVALID');
  });
});

describe('MockAgentProvider supplier image search', () => {
  it('fails closed instead of fabricating supplier evidence', async () => {
    const provider = new MockAgentProvider();

    await expect(
      provider.runSupplierImageSearch(
        { imageUrl: 'https://images.example.test/product.png' },
        CONTEXT,
      ),
    ).rejects.toThrow('SUPPLIER_IMAGE_SEARCH_REAL_PROVIDER_REQUIRED');
  });
});
