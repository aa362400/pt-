/**
 * OpenTelemetry bootstrap. Imported FIRST in main.ts so auto-instrumentation
 * patches modules before the application loads them.
 *
 * Disabled unless OTEL_ENABLED=1 (avoids exporter noise in dev/test).
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

if (process.env.OTEL_ENABLED === '1') {
  const sdk = new NodeSDK({
    serviceName: 'shopmate-backend',
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown().catch(() => {}));
  process.on('SIGINT', () => void sdk.shutdown().catch(() => {}));

  console.log('OpenTelemetry tracing enabled (OTEL_ENABLED=1)');
}
