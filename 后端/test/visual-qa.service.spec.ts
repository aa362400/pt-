import { VisualQaService } from '../src/features/image-prompt/visual-qa.service.js';

describe('VisualQaService', () => {
  const service = new VisualQaService();

  it('passes only when the reference, provider QA, compliance and media facts are complete', () => {
    const result = service.evaluate({
      platform: 'ozon',
      requestedSceneCount: 2,
      reference: {
        assetId: 'asset-1',
        sha256: 'a'.repeat(64),
      },
      generation: {
        sessionId: 'session-1',
        mockMode: false,
        consistencyScore: 92,
        consistencyPassed: true,
        compliancePassed: true,
        externalConsistencyStatus: 'passed',
        externalConsistencyScore: 94,
        externalConsistencyIssues: [],
        profile: { material: 'ceramic', shape: 'cylindrical' },
        images: [
          {
            sceneId: 'primary',
            filename: 'primary.png',
            url: 'https://assets.example.com/primary.png',
            width: 1200,
            height: 1200,
            mimeType: 'image/png',
            sha256: 'b'.repeat(64),
            byteSize: 240_000,
          },
          {
            sceneId: 'detail',
            filename: 'detail.png',
            url: 'https://assets.example.com/detail.png',
            width: 1200,
            height: 1200,
            mimeType: 'image/png',
            sha256: 'c'.repeat(64),
            byteSize: 260_000,
          },
        ],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        schemaVersion: 'visual-qa/v1',
        outcome: 'PASSED',
        score: 100,
      }),
    );
    expect(result.checks.every((check) => check.status !== 'FAIL')).toBe(true);
  });

  it('fails closed when visual evidence is missing, duplicated, insecure or below threshold', () => {
    const result = service.evaluate({
      platform: 'ozon',
      requestedSceneCount: 2,
      reference: { assetId: '', sha256: '' },
      generation: {
        sessionId: '',
        mockMode: false,
        consistencyScore: 64,
        consistencyPassed: false,
        compliancePassed: false,
        externalConsistencyStatus: 'failed',
        externalConsistencyScore: 35,
        externalConsistencyIssues: ['shape changed'],
        profile: null,
        images: [
          {
            sceneId: 'primary',
            filename: 'primary.png',
            url: 'http://assets.example.com/primary.png',
            width: 320,
            height: 320,
            mimeType: 'image/png',
            sha256: 'd'.repeat(64),
            byteSize: 10_000,
          },
          {
            sceneId: 'primary',
            filename: 'copy.png',
            url: 'http://assets.example.com/primary.png',
            width: 320,
            height: 320,
            mimeType: 'image/png',
            sha256: 'd'.repeat(64),
            byteSize: 10_000,
          },
        ],
      },
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.score).toBeLessThan(80);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REFERENCE_ASSET_REQUIRED',
          status: 'FAIL',
        }),
        expect.objectContaining({
          code: 'CONSISTENCY_QA_FAILED',
          status: 'FAIL',
        }),
        expect.objectContaining({
          code: 'PLATFORM_COMPLIANCE_FAILED',
          status: 'FAIL',
        }),
        expect.objectContaining({
          code: 'GENERATED_MEDIA_DUPLICATED',
          status: 'FAIL',
        }),
        expect.objectContaining({
          code: 'GENERATED_MEDIA_NOT_PUBLIC_HTTPS',
          status: 'FAIL',
        }),
      ]),
    );
  });

  it('accepts only the controlled same-origin Agent route for local creative review', () => {
    const baseGeneration = {
      sessionId: 'session-local-1',
      mockMode: false,
      consistencyScore: 92,
      consistencyPassed: true,
      compliancePassed: true,
      externalConsistencyStatus: 'passed' as const,
      externalConsistencyScore: 94,
      externalConsistencyIssues: [],
      profile: { material: 'plastic', shape: 'rectangular' },
      images: [
        {
          sceneId: 'primary',
          filename: 'primary.png',
          url: '/agent/api/image/session-local-1/primary.png',
          width: 1200,
          height: 1200,
          mimeType: 'image/png',
          sha256: 'e'.repeat(64),
          byteSize: 240_000,
        },
      ],
    };
    const localResult = service.evaluate({
      platform: 'ozon',
      requestedSceneCount: 1,
      deliveryMode: 'LOCAL_REVIEW',
      reference: { assetId: 'asset-local-1', sha256: 'a'.repeat(64) },
      generation: baseGeneration,
    });
    const marketplaceResult = service.evaluate({
      platform: 'ozon',
      requestedSceneCount: 1,
      deliveryMode: 'MARKETPLACE_REVIEW',
      reference: { assetId: 'asset-local-1', sha256: 'a'.repeat(64) },
      generation: baseGeneration,
    });
    const arbitraryHttpResult = service.evaluate({
      platform: 'ozon',
      requestedSceneCount: 1,
      deliveryMode: 'LOCAL_REVIEW',
      reference: { assetId: 'asset-local-1', sha256: 'a'.repeat(64) },
      generation: {
        ...baseGeneration,
        images: [
          {
            ...baseGeneration.images[0],
            url: 'http://localhost/agent/api/image/session-local-1/primary.png',
          },
        ],
      },
    });

    expect(localResult.outcome).toBe('PASSED');
    expect(localResult.policy.deliveryMode).toBe('LOCAL_REVIEW');
    expect(marketplaceResult.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GENERATED_MEDIA_NOT_PUBLIC_HTTPS',
          status: 'FAIL',
        }),
      ]),
    );
    expect(arbitraryHttpResult.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GENERATED_MEDIA_NOT_PUBLIC_HTTPS',
          status: 'FAIL',
        }),
      ]),
    );
  });
});
