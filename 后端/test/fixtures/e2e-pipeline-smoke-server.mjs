import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const requestLog = process.env.E2E_SMOKE_TEST_REQUEST_LOG;
const hash = 'b'.repeat(64);

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (requestLog) {
    appendFileSync(
      requestLog,
      `${request.method} ${url.pathname}${url.search}\n`,
    );
  }
  const route = `${request.method} ${url.pathname}`;
  const responses = new Map([
    [
      'POST /api/v1/auth/login',
      { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
    ],
    [
      'GET /api/v1/auth/me',
      { id: 'mock-owner', orgId: 'mock-organization', role: 'OWNER' },
    ],
    [
      'GET /api/v1/workspaces',
      {
        items: [
          {
            id: 'mock-ozon-workspace',
            name: 'Mock Ozon',
            status: 'ACTIVE',
            channelType: 'OZON',
          },
        ],
      },
    ],
    [
      'GET /api/v1/files',
      {
        items: [
          {
            id: 'mock-reference-asset',
            workspaceId: 'mock-ozon-workspace',
            purpose: 'PRODUCT_IMAGE',
            sha256: hash,
          },
        ],
      },
    ],
    [
      'POST /api/v1/daily-product-research/runs/manual',
      { run: { id: 'mock-research-run', status: 'PENDING' }, reused: false },
    ],
    [
      'GET /api/v1/daily-product-research/runs/mock-research-run',
      {
        run: {
          id: 'mock-research-run',
          status: 'COMPLETED',
          stages: [{ status: 'COMPLETED' }],
          _count: { candidates: 1 },
        },
      },
    ],
    [
      'GET /api/v1/daily-product-research/runs/mock-research-run/candidates',
      {
        items: [
          {
            id: 'mock-candidate',
            workspaceId: 'mock-ozon-workspace',
            status: 'RECOMMENDED',
            confidenceScore: 91,
            economicsEvaluations: [
              {
                id: 'mock-economics',
                contentHash: hash,
                status: 'VERIFIED',
                decision: 'PASS',
                hardGateReasons: [],
              },
            ],
          },
        ],
      },
    ],
    [
      'GET /api/v1/review',
      {
        items: [
          {
            id: 'mock-review-task',
            entityId: 'mock-candidate',
            decisionEvidence: { researchRunId: 'mock-research-run' },
          },
        ],
      },
    ],
    [
      'POST /api/v1/review/mock-review-task/product-launch',
      { launch: { id: 'mock-product-launch', status: 'QUEUED' } },
    ],
    [
      'GET /api/v1/review/product-launch/mock-product-launch',
      {
        launch: {
          id: 'mock-product-launch',
          status: 'AWAITING_PUBLISH_APPROVAL',
          imageProjectId: 'mock-image-project',
          listingDraftId: 'mock-listing-draft',
        },
      },
    ],
  ]);
  const payload = responses.get(route);
  if (!payload)
    return json(response, 404, { code: 'TEST_ROUTE_NOT_FOUND', route });
  return json(response, 200, payload);
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`PORT:${address.port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
