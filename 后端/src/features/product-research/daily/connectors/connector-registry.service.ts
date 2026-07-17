import { Injectable } from '@nestjs/common';
import { ManualImportConnector } from './manual-import.connector.js';
import { OzonEvidenceCacheConnector } from './ozon-evidence-cache.connector.js';
import { GlobalMarketplaceDiscoveryConnector } from './global-marketplace-discovery.connector.js';
import type {
  ConnectorCollectInput,
  ConnectorCollectResult,
  ProductResearchConnector,
} from './product-research-connector.js';

@Injectable()
export class ConnectorRegistryService {
  private readonly connectors: ProductResearchConnector[];

  constructor(
    manualImport: ManualImportConnector,
    ozonEvidenceCache: OzonEvidenceCacheConnector,
    globalMarketplaceDiscovery: GlobalMarketplaceDiscoveryConnector,
  ) {
    this.connectors = [
      manualImport,
      globalMarketplaceDiscovery,
      ozonEvidenceCache,
    ];
  }

  async collect(
    input: ConnectorCollectInput,
  ): Promise<ConnectorCollectResult[]> {
    input.signal?.throwIfAborted();
    const configuredSources = Array.isArray(input.configSnapshot.enabledSources)
      ? input.configSnapshot.enabledSources.filter(
          (source): source is string => typeof source === 'string',
        )
      : [];
    const enabled = new Set(configuredSources);
    const now = new Date();
    const disabled = this.connectors
      .filter((connector) => !enabled.has(connector.source))
      .map<ConnectorCollectResult>((connector) => ({
        candidates: [],
        health: {
          source: connector.source,
          status: 'DISABLED',
          attempts: 0,
          itemCount: 0,
          requestedAt: now,
          finishedAt: now,
          latencyMs: 0,
          metadata: {
            reason: 'Disabled by the immutable run configuration snapshot',
          },
        },
      }));
    const activeConnectors = this.connectors.filter((connector) =>
      enabled.has(connector.source),
    );
    const settled = await Promise.allSettled(
      activeConnectors.map((connector) => connector.collect(input)),
    );
    input.signal?.throwIfAborted();
    const collected = settled.map<ConnectorCollectResult>((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      const failedAt = new Date();
      return {
        candidates: [],
        health: {
          source: activeConnectors[index].source,
          status: 'FAILED',
          attempts: 1,
          itemCount: 0,
          requestedAt: failedAt,
          finishedAt: failedAt,
          latencyMs: 0,
          errorCode: 'CONNECTOR_COLLECTION_FAILED',
          errorMessage:
            result.reason instanceof Error
              ? result.reason.message.slice(0, 500)
              : 'Connector collection failed',
        },
      };
    });
    return [...collected, ...disabled];
  }
}
