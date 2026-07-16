import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  scriptDir,
  '..',
  '..',
  'docs',
  'performance',
  'agent-roadmap-local-capacity.json',
);
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1').replace(/\/$/, '');
const concurrency = Number(process.env.CAPACITY_CONCURRENCY || 10);
const requests = Number(process.env.CAPACITY_REQUESTS || 80);
const p95ThresholdMs = Number(process.env.CAPACITY_P95_MS || 1000);
const endpoints = ['/api/v1/health', '/api/v1/ready'];
const durations = [];
const resultsByStatus = {};
let failures = 0;
let nextRequest = 0;

async function worker() {
  while (nextRequest < requests) {
    const index = nextRequest++;
    const endpoint = endpoints[index % endpoints.length];
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      const elapsed = performance.now() - startedAt;
      durations.push(elapsed);
      const status = String(response.status);
      resultsByStatus[status] = (resultsByStatus[status] || 0) + 1;
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      durations.push(performance.now() - startedAt);
      failures += 1;
      resultsByStatus.error = (resultsByStatus.error || 0) + 1;
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, requests) }, () => worker()),
);
durations.sort((left, right) => left - right);
const percentile = (value) => {
  if (durations.length === 0) return null;
  return Math.round(durations[Math.ceil(durations.length * value) - 1]);
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  target: baseUrl,
  scenario: 'agent-roadmap-local-capacity',
  scope: 'local-gateway-smoke-only',
  concurrency,
  requests,
  failures,
  p50Ms: percentile(0.5),
  p95Ms: percentile(0.95),
  p99Ms: percentile(0.99),
  maxMs: durations.length ? Math.round(durations.at(-1)) : null,
  thresholds: { failures: 0, p95Ms: p95ThresholdMs },
  passed: failures === 0 && (percentile(0.95) ?? Infinity) <= p95ThresholdMs,
  endpoints,
  resultsByStatus,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
