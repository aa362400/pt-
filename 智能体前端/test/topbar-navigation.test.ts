import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  navigationItems,
  searchNavigation,
} from '../src/lib/navigation.ts';

const sidebarSource = readFileSync(
  new URL('../src/components/sidebar/Sidebar.tsx', import.meta.url),
  'utf8',
);
const topbarSource = readFileSync(
  new URL('../src/components/topbar/TopBar.tsx', import.meta.url),
  'utf8',
);

test('topbar search uses the same Chinese route catalog as the sidebar', () => {
  assert.ok(
    navigationItems.some(
      (item) => item.label === '审批中心' && item.path === '/review',
    ),
  );
  assert.deepEqual(searchNavigation('审批'), [
    { label: '审批中心', path: '/review' },
  ]);
});

test('sidebar renders the shared navigation catalog instead of a duplicate route list', () => {
  assert.match(
    sidebarSource,
    /import \{ navigationItems \} from ['"]\.\.\/\.\.\/lib\/navigation['"];/,
  );
  assert.match(sidebarSource, /navigationItems\.map\(\(item\) =>/);
  assert.doesNotMatch(sidebarSource, /const navItems\s*=\s*\[/);
});

test('global search is a controlled combobox that navigates by selection or Enter', () => {
  assert.match(topbarSource, /const \[searchQuery, setSearchQuery\] = useState\(''\)/);
  assert.match(topbarSource, /const searchResults = searchNavigation\(searchQuery\)/);
  assert.match(topbarSource, /<form[^>]+onSubmit=\{handleSearchSubmit\}/);
  assert.match(topbarSource, /role="combobox"/);
  assert.match(topbarSource, /value=\{searchQuery\}/);
  assert.match(topbarSource, /onChange=\{handleSearchChange\}/);
  assert.match(topbarSource, /onClick=\{\(\) => openSearchResult\(item\.path\)\}/);
  assert.match(topbarSource, /没有找到匹配的功能/);
});

test('current organization and Ozon platform are status labels, not dead buttons', () => {
  assert.match(topbarSource, /aria-label="当前组织"/);
  assert.match(topbarSource, /aria-label="当前平台：Ozon"/);
  assert.doesNotMatch(topbarSource, /<button[^>]*>\s*Jieke Design Studio/);
  assert.doesNotMatch(topbarSource, /<button[^>]*>\s*Ozon\s*<\/button>/);
});

test('mark-all-read reports failures in Chinese and never fakes local read state', () => {
  assert.match(topbarSource, /const \[notificationError, setNotificationError\]/);
  assert.match(topbarSource, /const \[markAllPending, setMarkAllPending\]/);
  assert.match(
    topbarSource,
    /try \{[\s\S]*await notificationsApi\.markAllAsRead\(\);[\s\S]*setNotifications\([\s\S]*\} catch \{[\s\S]*全部标记已读失败，通知状态未更改/,
  );
  assert.match(topbarSource, /disabled=\{markAllPending \|\| unread === 0\}/);
  assert.match(topbarSource, /notificationError \? <p role="alert"/);
});
