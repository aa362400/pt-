import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const runCreateFailures = new Rate('run_create_failures');
const timelineFailures = new Rate('timeline_failures');
const runCreateDuration = new Trend('run_create_duration_ms', true);
const timelineDuration = new Trend('timeline_duration_ms', true);

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const AGENT_TYPE = __ENV.LOAD_TEST_AGENT_TYPE || 'GENERAL_ASSISTANT';
const ALLOW_WRITES = __ENV.LOAD_TEST_ALLOW_WRITES === '1';
const ALLOW_MODEL_COST = __ENV.LOAD_TEST_ALLOW_MODEL_COST === '1';
const ALLOW_REMOTE = __ENV.LOAD_TEST_ALLOW_REMOTE === '1';
const ENABLE_CANCEL = __ENV.LOAD_TEST_ENABLE_CANCEL === '1';

export const options = {
  scenarios: {
    create_and_read_timeline: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 2),
      duration: __ENV.DURATION || '30s',
      gracefulStop: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    run_create_failures: ['rate<0.01'],
    timeline_failures: ['rate<0.02'],
    run_create_duration_ms: ['p(95)<2000'],
    timeline_duration_ms: ['p(95)<1000'],
  },
};

function isLoopback(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i.test(url);
}

function headers() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
    'X-Load-Test': 'shopmate-agent-run-create',
  };
}

function parseJson(response) {
  try {
    return response.json();
  } catch (_) {
    return null;
  }
}

export function setup() {
  if (!ALLOW_WRITES) {
    fail('Refusing to create Agent runs. Set LOAD_TEST_ALLOW_WRITES=1 explicitly.');
  }
  if (!ALLOW_MODEL_COST) {
    fail('Agent runs may consume paid model quota. Set LOAD_TEST_ALLOW_MODEL_COST=1 explicitly.');
  }
  if (!AUTH_TOKEN) {
    fail('AUTH_TOKEN is required. Use a dedicated local load-test account.');
  }
  if (!isLoopback(BASE_URL) && !ALLOW_REMOTE) {
    fail('Remote targets are blocked. Set LOAD_TEST_ALLOW_REMOTE=1 only for an approved staging environment.');
  }

  const ready = http.get(`${BASE_URL}/api/v1/ready`, {
    headers: { 'X-Load-Test': 'shopmate-agent-run-create-preflight' },
  });
  if (ready.status !== 200) {
    fail(`Readiness preflight failed with HTTP ${ready.status}.`);
  }
  return { startedAt: new Date().toISOString() };
}

export default function () {
  const requestId = `k6-run-${__VU}-${__ITER}-${Date.now()}`;
  const payload = JSON.stringify({
    agentType: AGENT_TYPE,
    clientRequestId: requestId,
    input: {
      prompt: 'Load-test lifecycle request. Return a short health acknowledgement only.',
      loadTest: true,
      requestId,
    },
  });

  const created = http.post(`${BASE_URL}/api/v1/agent-runs`, payload, {
    headers: headers(),
    tags: { operation: 'agent_run_create' },
  });
  runCreateDuration.add(created.timings.duration);
  const createOk = check(created, {
    'run create accepted': (response) => [200, 201, 202].includes(response.status),
  });
  runCreateFailures.add(!createOk);
  if (!createOk) {
    sleep(1);
    return;
  }

  const body = parseJson(created);
  const runId = body && (body.id || body.runId);
  if (!runId) {
    runCreateFailures.add(true);
    return;
  }

  const timeline = http.get(`${BASE_URL}/api/v1/agent-runs/${runId}/timeline`, {
    headers: headers(),
    tags: { operation: 'agent_run_timeline' },
  });
  timelineDuration.add(timeline.timings.duration);
  const timelineOk = check(timeline, {
    'timeline readable': (response) => response.status === 200,
  });
  timelineFailures.add(!timelineOk);

  if (ENABLE_CANCEL) {
    const cancelled = http.post(
      `${BASE_URL}/api/v1/agent-runs/${runId}/cancel`,
      JSON.stringify({ requestId: `k6-cancel-${requestId}` }),
      { headers: headers(), tags: { operation: 'agent_run_cancel' } },
    );
    check(cancelled, {
      'cancel is accepted or already terminal': (response) =>
        [200, 400, 409].includes(response.status),
    });
  }

  sleep(Number(__ENV.ITERATION_SLEEP_SECONDS || 0.5));
}
