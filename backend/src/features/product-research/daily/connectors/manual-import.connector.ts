import { Injectable } from '@nestjs/common';
import { externalCandidateListSchema } from '../contracts/external-candidate.contract.js';
import type {
  ConnectorCollectInput,
  ConnectorCollectResult,
  ProductResearchConnector,
} from './product-research-connector.js';

@Injectable()
export class ManualImportConnector implements ProductResearchConnector {
  readonly source = 'manual_import';

  collect(input: ConnectorCollectInput): Promise<ConnectorCollectResult> {
    const requestedAt = new Date();
    const raw = input.configSnapshot.inputCandidates;
    if (!Array.isArray(raw) || raw.length === 0) {
      const finishedAt = new Date();
      return Promise.resolve({
        candidates: [],
        health: {
          source: this.source,
          status: 'CSV_ONLY',
          attempts: 0,
          itemCount: 0,
          requestedAt,
          finishedAt,
          latencyMs: finishedAt.getTime() - requestedAt.getTime(),
          metadata: {
            message: 'No manual or CSV evidence was supplied for this run.',
          },
        },
      });
    }

    const candidates = externalCandidateListSchema
      .parse(raw)
      .slice(0, input.candidateLimit);
    const finishedAt = new Date();
    return Promise.resolve({
      candidates,
      health: {
        source: this.source,
        status: 'HEALTHY',
        attempts: 1,
        itemCount: candidates.length,
        requestedAt,
        finishedAt,
        lastSuccessAt: finishedAt,
        latencyMs: finishedAt.getTime() - requestedAt.getTime(),
        dataFreshnessSeconds: 0,
        metadata: { quality: 'MANUAL', schemaValidated: true },
      },
    });
  }
}
