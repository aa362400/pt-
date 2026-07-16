import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyLoginResponse,
  type LoginResponse,
} from '../src/api/auth-session.ts';

test('classifies a two-factor challenge without accepting empty session tokens', () => {
  const response: LoginResponse = {
    accessToken: '',
    refreshToken: '',
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
    },
    requiresTwoFactor: true,
    tempToken: 'temporary-token',
  };

  assert.deepEqual(classifyLoginResponse(response), {
    kind: 'two-factor-required',
    tempToken: 'temporary-token',
  });
});

test('classifies a completed login only when both session tokens are present', () => {
  const response: LoginResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
    },
  };

  assert.deepEqual(classifyLoginResponse(response), {
    kind: 'authenticated',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  });
});

test('rejects malformed login responses instead of storing an empty session', () => {
  const response: LoginResponse = {
    accessToken: '',
    refreshToken: '',
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
    },
  };

  assert.throws(
    () => classifyLoginResponse(response),
    /登录响应缺少有效凭据/,
  );
});
