import { CapabilityCenterService } from '../src/features/capability-center/capability-center.service.js';

function roadmapReport() {
  return {
    generatedAt: '2026-07-12T00:00:00.000Z',
    source: 'backend-live',
    operationSafety: {
      connectedStoreChannels: 1,
      externalWriteAdapterConnected: true,
      highRiskActionMode: 'human_confirmation_required',
      approvalNotificationKind: 'high_risk_action_review',
      actions: [],
    },
    phases: Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      title: `phase-${index + 1}`,
      wave: 'test',
      priority: 'P0',
      status: index + 1 === 17 ? 'partial' : 'passed',
      visibleSurface: '',
      strictFinding: '',
      nextAction: '',
      evidence: [`phase-${index + 1}-evidence`],
      blockers: index + 1 === 17 ? ['external write coverage incomplete'] : [],
      linkedSurfaces: [],
    })),
  };
}

describe('CapabilityCenterService', () => {
  it('returns the shared capability registry without pretending missing adapters pass', async () => {
    const roadmap = {
      getRoadmap: jest.fn().mockResolvedValue(roadmapReport()),
    };
    const service = new CapabilityCenterService(roadmap as any);

    const result = await service.list({ sub: 'user-1', orgId: 'org-1' } as any);

    expect(result.items).toHaveLength(23);
    expect(result.items.find((item) => item.id === 'customer-service')).toEqual(
      expect.objectContaining({
        backendState: 'connected',
        overallState: 'partial',
      }),
    );
    expect(result.items.find((item) => item.id === 'marketing')).toEqual(
      expect.objectContaining({
        backendState: 'connected',
        overallState: 'partial',
      }),
    );
    expect(
      result.items.find((item) => item.id === 'product-management'),
    ).toEqual(
      expect.objectContaining({
        backendState: 'connected',
        overallState: 'partial',
      }),
    );
    expect(result.items.find((item) => item.id === 'supply-chain')).toEqual(
      expect.objectContaining({
        backendState: 'connected',
        overallState: 'partial',
      }),
    );
    expect(result.items.find((item) => item.id === 'ozon-pricing')).toEqual(
      expect.objectContaining({
        backendState: 'connected',
        overallState: 'passed',
        risk: 'read_only',
        blockers: [],
        evidence: expect.arrayContaining([
          expect.stringContaining('ozon_pricing_engine'),
          expect.stringContaining('80 categories'),
        ]),
      }),
    );
    expect(result.summary.total).toBe(23);
    expect(result.summary.missing).toBe(0);
  });
});
