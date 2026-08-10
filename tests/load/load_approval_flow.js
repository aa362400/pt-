import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const approvalConflicts = new Rate('approval_conflicts');
const approvalUnexpectedFailures = new Rate('approval_unexpected_failures');
const approvalDecisionDuration = new Trend('approval_decision_duration_ms', true);

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const APPROVAL_IDS = (__ENV.APPROVAL_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const DECISION = (__ENV.APPROVAL_DECISION || 'request-changes').toLowerCase();
const ALLOW_WRITES = __ENV.LOAD_TEST_ALLOW_WRITES === '1';
const ALLOW_APPROVAL_MUTATIONS = __ENV.LOAD_TEST_ALLOW_APPROVAL_MUTATIONS === '1';
const ALLOW_REMOTE = __ENV.LOAD_TEST_ALLOW_REMOTE === '1';

export const options = {
  scenarios: {
    concurrent_safe_review: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS || 4),
      iterations: Number(__ENV.ITERATIONS || 2),
      maxDuration: __ENV.MAX_DURATION || '2m',
    },
  },
  thresholds: {
    approval_unexpected_failures: ['rate<0.01'],
    approval_decision_duration_ms: ['p(95)<1500'],
  },
};

function isLoopback(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i.test(url);
}

function headers() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
    'X-Load-Test': 'shopmate-approval-concurrency',
  };
}

export function setup() {
  if (!ALLOW_WRITES || !ALLOW_APPROVAL_MUTATIONS) {
    fail('Refusing to mutate approvals. Set LOAD_TEST_ALLOW_WRITES=1 and LOAD_TEST_ALLOW_APPROVAL_MUTATIONS=1.');
  }
  if (!AUTH_TOKEN) {
    fail('AUTH_TOKEN is required and must belong to a dedicated OWNER/ADMIN load-test account.');
  }
  if (!APPROVAL_IDS.length) {
    fail('APPROVAL_IDS must contain disposable local or staging approval IDs.');
  }
  if (!['request-changes', 'reject'].includes(DECISION)) {
    fail('Only request-changes or reject are allowed. approve and override are intentionally blocked.');
  }
  if (!isLoopback(BASE_URL) && !ALLOW_REMOTE) {
    fail('Remote targets are blocked. Set LOAD_TEST_ALLOW_REMOTE=1 only for an approved staging environment.');
  }

  const ready = http.get(`${BASE_URL}/api/v1/ready`, {
    headers: { 'X-Load-Test': 'shopmate-approval-preflight' },
  });
  if (ready.status !== 200) {
    fail(`Readiness preflight failed with HTTP ${ready.status}.`);
  }
}

export default function () {
  const approvalId = APPROVAL_IDS[(__VU + __ITER) % APPROVAL_IDS.length];
  const reason = `Concurrent approval load test ${DECISION}, VU=${__VU}, ITER=${__ITER}, using one-time test data only.`;
  const response = http.post(
    `${BASE_URL}/api/v1/approval-items/${approvalId}/${DECISION}`,
    JSON.stringify({ reason }),
    { headers: headers(), tags: { operation: `approval_${DECISION}` } },
  );
  approvalDecisionDuration.add(response.timings.duration);

  const conflict = [400, 409].includes(response.status);
  const expected = [200, 201, 400, 409].includes(response.status);
  approvalConflicts.add(conflict);
  approvalUnexpectedFailures.add(!expected);
  check(response, {
    'decision applied or OCC/state conflict returned': () => expected,
    'no external execution endpoint used': () => DECISION !== 'approve' && DECISION !== 'override',
  });

  const readback = http.get(`${BASE_URL}/api/v1/approval-items/${approvalId}`, {
    headers: headers(),
    tags: { operation: 'approval_readback' },
  });
  check(readback, { 'approval readback succeeds': (item) => item.status === 200 });
  sleep(Number(__ENV.ITERATION_SLEEP_SECONDS || 0.25));
}
