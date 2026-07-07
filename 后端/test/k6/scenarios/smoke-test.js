import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Health endpoint (public)
  const healthResp = http.get(`${BASE_URL}/health`);
  check(healthResp, {
    'health returns 200': (r) => r.status === 200,
    'health body has status ok': (r) => {
      try {
        return JSON.parse(r.body).status === 'ok';
      } catch {
        return false;
      }
    },
  });

  // Readiness endpoint (public)
  const readyResp = http.get(`${BASE_URL}/ready`);
  check(readyResp, {
    'ready returns 200 or 503': (r) => r.status === 200 || r.status === 503,
  });

  // Public API docs / swagger (if available)
  const swaggerResp = http.get(`${BASE_URL}/api`);
  check(swaggerResp, {
    'swagger returns 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);
}
