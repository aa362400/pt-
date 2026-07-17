import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authContextSource = readFileSync(
  new URL('../src/auth/AuthContext.tsx', import.meta.url),
  'utf8',
);
const teamSettingsSource = readFileSync(
  new URL('../src/pages-v2/TeamSettingsV2.tsx', import.meta.url),
  'utf8',
);

test('signed-in display name comes from the current server profile, not a stale local cache', () => {
  assert.match(authContextSource, /usersApi\.getMe\(\)/);
  assert.match(authContextSource, /name: profile\.name \?\? '用户'/);
  assert.doesNotMatch(authContextSource, /cachedUser\?\.name \?\?/);
});

test('team settings exposes a real Chinese account-name editor', () => {
  assert.match(teamSettingsSource, /账户显示名称/);
  assert.match(teamSettingsSource, /await updateProfile\(profileName\.trim\(\)\)/);
  assert.match(teamSettingsSource, /保存账户名称/);
  assert.match(teamSettingsSource, /value=\{profileName\}/);
});
