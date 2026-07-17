import { HttpAgentProvider } from '../src/agents/http-agent.provider.js';

function providerWithRemoteResult(remoteResult: Record<string, unknown>) {
  const provider = new HttpAgentProvider({
    get: jest.fn((key: string) => {
      if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
      if (key === 'AGENT_API_KEY') return 'test-key';
      return undefined;
    }),
  } as any);
  jest.spyOn(provider as any, 'runRemoteTask').mockResolvedValue(remoteResult);
  return provider;
}

const listingCopy = {
  title: 'Portable desk organizer for everyday home office use',
  description: 'A compact organizer for small desk accessories.',
  bulletPoints: ['Compact', 'Practical', 'Easy to clean'],
  keywords: ['desk organizer', 'office storage', 'small item holder'],
};

describe('HttpAgentProvider listing pricing evidence boundary', () => {
  it('drops an Agent price that has no verified economics evidence', async () => {
    const provider = providerWithRemoteResult({
      ...listingCopy,
      price: 29.99,
      priceCurrency: 'USD',
      pricingStatus: 'DATA_INSUFFICIENT',
      pricingEvidence: null,
      pricingMissingFields: ['pricingEvidence'],
      publishable: true,
      requiresHumanReview: false,
    });

    const result = await provider.runListingGeneration({
      productName: 'Desk organizer',
      keywords: [],
      platform: 'ozon',
    });

    expect(result).toMatchObject({
      price: null,
      priceCurrency: null,
      pricingStatus: 'DATA_INSUFFICIENT',
      pricingEvidence: null,
      pricingMissingFields: ['pricingEvidence'],
      publishable: false,
      requiresHumanReview: true,
    });
  });

  it('preserves a positive price only with a PASS verified economics reference', async () => {
    const evidence = {
      id: 'economics-evaluation-1',
      status: 'VERIFIED',
      decision: 'PASS',
      salePrice: '1299.0000',
      currency: 'RUB',
      validFrom: '2026-07-16T00:00:00.000Z',
      validUntil: '2099-07-17T00:00:00.000Z',
      calculatorVersion: 'candidate-economics-calculator/v1',
      inputSetHash: 'a'.repeat(64),
      contentHash: 'b'.repeat(64),
    };
    const provider = providerWithRemoteResult({
      ...listingCopy,
      price: 1299,
      priceCurrency: 'RUB',
      pricingStatus: 'EVIDENCE_BACKED',
      pricingEvidence: evidence,
      pricingMissingFields: [],
      publishable: false,
      requiresHumanReview: true,
    });

    const result = await provider.runListingGeneration({
      productName: 'Desk organizer',
      keywords: [],
      platform: 'ozon',
    });

    expect(result.price).toBe(1299);
    expect(result.priceCurrency).toBe('RUB');
    expect(result.pricingStatus).toBe('EVIDENCE_BACKED');
    expect(result.pricingEvidence).toEqual(evidence);
    expect(result.publishable).toBe(false);
    expect(result.requiresHumanReview).toBe(true);
  });
});
