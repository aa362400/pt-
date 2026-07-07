import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Sleep between 0.5 and 3 seconds
function randomSleep() {
  sleep(0.5 + Math.random() * 2.5);
}

export default function () {
  // ── Login to get token ──────────────────────────────
  const loginPayload = JSON.stringify({
    email: __ENV.TEST_EMAIL || 'loadtest@shopmate-test.example',
    password: __ENV.TEST_PASSWORD || 'TestPass123!',
  });

  const loginResp = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const loginOk = check(loginResp, {
    'login returns 200': (r) => r.status === 200,
  });

  if (!loginOk) {
    // If login fails, try registering first
    const registerPayload = JSON.stringify({
      name: `API Tester ${__VU}`,
      email: `api-loadtest-${__VU}@shopmate-test.example`,
      password: 'TestPass123!',
    });

    const registerResp = http.post(`${BASE_URL}/auth/register`, registerPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(registerResp, {
      'register returns 201 for new user': (r) => r.status === 201,
    });

    if (registerResp.status !== 201) {
      randomSleep();
      return;
    }
  }

  // Re-login after possible registration
  const finalLoginResp = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const finalLoginOk = check(finalLoginResp, {
    'final login returns 200': (r) => r.status === 200,
  });

  if (!finalLoginOk) {
    randomSleep();
    return;
  }

  const token = JSON.parse(finalLoginResp.body).accessToken;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  // ── 1. List Products ────────────────────────────────
  {
    const resp = http.get(`${BASE_URL}/products?page=1&limit=20`, {
      headers: authHeaders,
    });
    check(resp, {
      'list products returns 200': (r) => r.status === 200,
      'list products has items array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items) && typeof body.total === 'number';
        } catch {
          return false;
        }
      },
    });
    randomSleep();
  }

  // ── 2. List Listings ────────────────────────────────
  {
    const resp = http.get(`${BASE_URL}/listings?page=1&limit=20`, {
      headers: authHeaders,
    });
    check(resp, {
      'list listings returns 200': (r) => r.status === 200,
      'list listings has expected shape': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items) && typeof body.total === 'number';
        } catch {
          return false;
        }
      },
    });
    randomSleep();
  }

  // ── 3. Get Dashboard Counts ─────────────────────────
  {
    const resp = http.get(`${BASE_URL}/dashboard/counts`, {
      headers: authHeaders,
    });
    check(resp, {
      'dashboard counts returns 200': (r) => r.status === 200,
      'dashboard has counts object': (r) => {
        try {
          const body = JSON.parse(r.body);
          return (
            typeof body.products === 'number' &&
            typeof body.listings === 'number' &&
            typeof body.agentRuns === 'number'
          );
        } catch {
          return false;
        }
      },
    });
    randomSleep();
  }

  // ── 4. List Keywords ────────────────────────────────
  {
    const resp = http.get(`${BASE_URL}/keywords?page=1&limit=20`, {
      headers: authHeaders,
    });
    check(resp, {
      'list keywords returns 200': (r) => r.status === 200,
    });
    randomSleep();
  }

  // ── 5. Get Trends ───────────────────────────────────
  {
    const resp = http.get(`${BASE_URL}/trends?page=1&limit=20`, {
      headers: authHeaders,
    });
    check(resp, {
      'list trends returns 200': (r) => r.status === 200,
      'list trends has items array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
    });
    randomSleep();
  }

  // ── 6. Get Dashboard Recent Activity ────────────────
  {
    const resp = http.get(`${BASE_URL}/dashboard/recent-activity`, {
      headers: authHeaders,
    });
    check(resp, {
      'recent activity returns 200': (r) => r.status === 200,
    });
    randomSleep();
  }

  // ── 7. List Team Tasks ──────────────────────────────
  {
    const resp = http.get(`${BASE_URL}/tasks?page=1&limit=20`, {
      headers: authHeaders,
    });
    check(resp, {
      'list tasks returns 200': (r) => r.status === 200,
    });
    randomSleep();
  }

  // ── 8. List Notifications ───────────────────────────
  {
    const resp = http.get(`${BASE_URL}/notifications?page=1&limit=20`, {
      headers: authHeaders,
    });
    check(resp, {
      'list notifications returns 200': (r) => r.status === 200,
    });
    randomSleep();
  }
}
