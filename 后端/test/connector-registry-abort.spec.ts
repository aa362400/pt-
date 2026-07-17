import { ConnectorRegistryService } from '../src/features/product-research/daily/connectors/connector-registry.service.js';
import { QueueJobTimeoutError } from '../src/shared/queue/queue-job-deadline.js';

describe('ConnectorRegistryService cancellation', () => {
  it('propagates the shared abort reason instead of converting it into source health', async () => {
    const controller = new AbortController();
    const timeoutError = new QueueJobTimeoutError(
      'daily-product-research',
      'daily-job-1',
      1_800_000,
    );
    const manualImport = {
      source: 'manual_import',
      collect: jest.fn(async (input: { signal?: AbortSignal }) => {
        expect(input.signal).toBe(controller.signal);
        controller.abort(timeoutError);
        const abortError = new Error('connector aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }),
    };
    const registry = new ConnectorRegistryService(
      manualImport as never,
      { source: 'ozon_evidence_cache', collect: jest.fn() } as never,
      {
        source: 'global_marketplace_discovery',
        collect: jest.fn(),
      } as never,
    );

    await expect(
      registry.collect({
        researchRunId: 'run-1',
        organizationId: 'org-1',
        workspaceId: null,
        businessDate: '2026-07-16',
        timezone: 'Asia/Shanghai',
        candidateLimit: 10,
        configSnapshot: { enabledSources: ['manual_import'] },
        signal: controller.signal,
      }),
    ).rejects.toBe(timeoutError);
  });
});
