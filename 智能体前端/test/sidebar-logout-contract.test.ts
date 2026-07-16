import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebarSource = readFileSync(
  new URL('../src/components/sidebar/Sidebar.tsx', import.meta.url),
  'utf8',
);

test('the signed-in user area exposes an accessible logout action with pending and failure feedback', () => {
  assert.match(sidebarSource, /const \{ user, logout \} = useAuth\(\)/);
  assert.match(sidebarSource, /aria-label=["']退出登录["']/);
  assert.match(sidebarSource, />\s*退出登录\s*</);
  assert.match(sidebarSource, /await logout\(\)/);
  assert.match(sidebarSource, /disabled=\{logoutPending\}/);
  assert.match(sidebarSource, /正在退出/);
  assert.match(sidebarSource, /role=["']alert["']/);
});
