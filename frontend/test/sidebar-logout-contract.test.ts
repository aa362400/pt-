import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebarSource = readFileSync(
  new URL('../src/components/sidebar/Sidebar.tsx', import.meta.url),
  'utf8',
);

test('the signed-in user area exposes an accessible logout action with pending and failure feedback', () => {
  assert.match(sidebarSource, /const \{ user, logout \} = useAuth\(\)/);
  assert.match(sidebarSource, /aria-label=["']Sign out["']/);
  assert.match(sidebarSource, />\s*Sign out\s*</);
  assert.match(sidebarSource, /await logout\(\)/);
  assert.match(sidebarSource, /disabled=\{logoutPending\}/);
  assert.match(sidebarSource, /Signing out/);
  assert.match(sidebarSource, /role=["']alert["']/);
});
