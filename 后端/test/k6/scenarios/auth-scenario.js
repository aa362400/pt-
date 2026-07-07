import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Generate a unique email per VU iteration to avoid conflicts
function randomEmail() {
  const ts = Date.now();
  const vu = __VU;
  const iter = __ITER;
  return `loadtest-${vu}-${iter}-${ts}@shopmate-test.example`;
}

const PASSWORD = 'TestPass123!';

export default function () {
  const email = randomEmail();

  // ── 1. Register ───────────────────────────────────────
  const registerPayload = JSON.stringify({
    name: `Load Tester ${__VU}-${__ITER}`,
    email,
    password: PASSWORD,
  });

  const registerResp = http.post(`${BASE_URL}/auth/register`, registerPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const registerOk = check(registerResp, {
    'register returns 201': (r) => r.status === 201,
    'register returns access token': (r) => {
      try {
        return JSON.parse(r.body).accessToken !== undefined;
      } catch {
        return false;
      }
    },
  });

  // If registration failed (e.g. duplicate), try login
  let accessToken;
  let refreshToken;

  if (registerOk) {
    const body = JSON.parse(registerResp.body);
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  } else {
    // ── 2. Login (fallback) ─────────────────────────────
    const loginPayload = JSON.stringify({
      email,
      password: PASSWORD,
    });

    const loginResp = http.post(`${BASE_URL}/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(loginResp, {
      'login returns 200': (r) => r.status === 200,
    });

    if (loginResp.status === 200) {
      const body = JSON.parse(loginResp.body);
      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
    } else {
      // Cannot proceed without a token
      sleep(1);
      return;
    }
  }

  // ── 3. Get User Profile ─────────────────────────────
  const profileResp = http.get(`${BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  check(profileResp, {
    'profile returns 200': (r) => r.status === 200,
    'profile has user id': (r) => {
      try {
        return JSON.parse(r.body).id !== undefined;
      } catch {
        return false;
      }
    },
  });

  // ── 4. Refresh Token ─────────────────────────────────
  const refreshPayload = JSON.stringify({
    refreshToken,
  });

  const refreshResp = http.post(`${BASE_URL}/auth/refresh`, refreshPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(refreshResp, {
    'refresh returns 200': (r) => r.status === 200,
    'refresh returns new access token': (r) => {
      try {
        return JSON.parse(r.body).accessToken !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
