import { SupplierImageSearchEnrichmentService } from '../src/features/product-research/daily/services/supplier-image-search-enrichment.service.js';
import { QueueJobTimeoutError } from '../src/shared/queue/queue-job-deadline.js';

function enrichmentInput(signal: AbortSignal) {
  return {
    organizationId: 'org-1',
    workspaceId: null,
    researchRunId: 'run-1',
    userId: 'user-1',
    candidateLimit: 1,
    candidates: [],
    signal,
  };
}

describe('SupplierImageSearchEnrichmentService deadline', () => {
  it('does not allocate work when the execution signal is already aborted', async () => {
    const controller = new AbortController();
    const timeoutError = new QueueJobTimeoutError(
      'daily-product-research',
      'daily-job-1',
      1_800_000,
    );
    controller.abort(timeoutError);
    const allocationService = { getOrCreate: jest.fn() };
    const service = new SupplierImageSearchEnrichmentService(
      { runSupplierImageSearch: jest.fn() } as never,
      { append: jest.fn() } as never,
      allocationService as never,
    );

    await expect(
      service.enrichRun(enrichmentInput(controller.signal)),
    ).rejects.toBe(timeoutError);
    expect(allocationService.getOrCreate).not.toHaveBeenCalled();
  });

  it('does not downgrade an execution abort into a supplier source failure', async () => {
    const controller = new AbortController();
    const timeoutError = new QueueJobTimeoutError(
      'daily-product-research',
      'daily-job-2',
      1_800_000,
    );
    const agentProvider = {
      runSupplierImageSearch: jest.fn(async () => {
        controller.abort(timeoutError);
        const abortError = new Error('supplier request aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }),
    };
    const evidenceStore = { append: jest.fn() };
    const allocationService = {
      getOrCreate: jest.fn().mockResolvedValue({
        schemaVersion: 'supplier-image-search-allocation/v1',
        candidateLimit: 1,
        consideredCandidateIds: ['candidate-1'],
        skippedNoSourceImageCandidateIds: [],
        skippedByBudgetCount: 0,
        entries: [
          {
            candidateId: 'candidate-1',
            source: 'temu_public_search',
            externalId: 'external-1',
            imageUrl: 'https://images.example.test/product.png',
            requestId: `dpr-sis-v1:${'a'.repeat(64)}`,
          },
        ],
      }),
    };
    const service = new SupplierImageSearchEnrichmentService(
      agentProvider as never,
      evidenceStore as never,
      allocationService as never,
    );

    await expect(
      service.enrichRun({
        ...enrichmentInput(controller.signal),
        candidates: [
          {
            candidateId: 'candidate-1',
            canonicalName: 'verified organizer',
            inputs: [],
          },
        ],
      }),
    ).rejects.toBe(timeoutError);
    expect(evidenceStore.append).not.toHaveBeenCalled();
  });
});
