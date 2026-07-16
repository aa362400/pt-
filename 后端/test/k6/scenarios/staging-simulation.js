import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 VUs over 2 min
    { duration: '5m', target: 20 },   // Ramp to 20 VUs over 5 min
    { duration: '3m', target: 0 },    // Ramp down to 0 over 3 min
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  throw new Error('AUTH_TOKEN is required for authenticated staging load tests');
}

// Weighted endpoint mix so we can control percentages.
// Weights: health=30, products=20, create_agent=15, poll_agent=15, profile=10, dashboard=10
const ENDPOINTS = [
  { name: 'health', weight: 30 },
  { name: 'products', weight: 20 },
  { name: 'create_agent', weight: 15 },
  { name: 'poll_agent', weight: 15 },
  { name: 'profile', weight: 10 },
  { name: 'dashboard', weight: 10 },
];

// Weighted random pick
function pickEndpoint() {
  const totalWeight = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ep of ENDPOINTS) {
    r -= ep.weight;
    if (r <= 0) return ep.name;
  }
  return 'health';
}

// In-memory store for agent run IDs to poll
const agentRunIds = [];

export default function () {
  const endpoint = pickEndpoint();

  switch (endpoint) {
    case 'health':
      check(http.get(`${BASE_URL}/api/v1/health`), {
        'health status 200': (r) => r.status === 200,
      });
      break;

    case 'products':
      check(http.get(`${BASE_URL}/api/v1/products?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      }), {
        'products status 200': (r) => r.status === 200,
      });
      break;

    case 'create_agent': {
      const payload = JSON.stringify({
        agentType: 'PRODUCT_RESEARCHER',
        input: { productName: 'Test Product', marketplace: 'amazon.com' },
      });
      const resp = http.post(`${BASE_URL}/api/v1/agent-runs`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      });
      const ok = check(resp, {
        'agent created': (r) => r.status === 201 || r.status === 202 || r.status === 200,
      });
      if (ok) {
        try {
          const body = JSON.parse(resp.body);
          if (body.runId || body.id) {
            agentRunIds.push(body.runId || body.id);
            // Keep only the last 50 IDs to avoid unbounded growth
            if (agentRunIds.length > 50) agentRunIds.shift();
          }
        } catch (e) {
          // ignore parse errors
        }
      }
      break;
    }

    case 'poll_agent': {
      if (agentRunIds.length === 0) {
        // Nothing to poll — fall back to health
        check(http.get(`${BASE_URL}/api/v1/health`), {
          'health status 200 (fallback)': (r) => r.status === 200,
        });
      } else {
        const id = agentRunIds[Math.floor(Math.random() * agentRunIds.length)];
        const resp = http.get(`${BASE_URL}/api/v1/agent-runs/${id}`, {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        });
        check(resp, {
          'poll agent status 200': (r) => r.status === 200,
        });
      }
      break;
    }

    case 'profile': {
      const resp = http.get(`${BASE_URL}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      check(resp, {
        'profile status 200': (r) => r.status === 200,
      });
      break;
    }

    case 'dashboard': {
      const resp = http.get(`${BASE_URL}/api/v1/dashboard/counts`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      check(resp, {
        'dashboard counts status 200': (r) => r.status === 200,
      });
      break;
    }
  }

  // Random sleep between 0.5 and 3 seconds
  sleep(0.5 + Math.random() * 2.5);
}
