import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  navigationGroups,
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
    /navigationGroups,[\s\S]{0,100}from ["']\.\.\/\.\.\/lib\/navigation["'];/,
  );
  assert.match(sidebarSource, /navigationGroups\.map\(\(group\) =>/);
  assert.match(sidebarSource, /group\.items\.map\(\(item\) =>/);
  assert.doesNotMatch(sidebarSource, /const navItems\s*=\s*\[/);
});

test('journey navigation has five groups and no more than sixteen items visible by default', () => {
  assert.equal(navigationGroups.length, 5);
  assert.equal(navigationGroups.at(-1)?.label, '设置与管理');
  assert.equal(navigationGroups.at(-1)?.defaultCollapsed, true);
  const visibleByDefault = navigationGroups
    .filter((group) => !group.defaultCollapsed)
    .reduce((total, group) => total + group.items.length, 0);
  assert.ok(visibleByDefault <= 16);
});

test('global search keeps legacy pages that were removed from the sidebar', () => {
  assert.deepEqual(searchNavigation('商品调研'), [
    { label: '商品调研', path: '/product-research' },
  ]);
  assert.deepEqual(searchNavigation('公开选品'), [
    { label: 'Ozon 公开选品', path: '/ozon-observations' },
  ]);
  assert.deepEqual(searchNavigation('利润计算'), [
    { label: '利润计算', path: '/profit-calculator' },
  ]);
});

test('sidebar collapse state is accessible and remembered locally', () => {
  assert.match(sidebarSource, /aria-expanded=\{!collapsed\}/);
  assert.match(sidebarSource, /window\.localStorage\.getItem\(NAVIGATION_GROUP_STORAGE_KEY\)/);
  assert.match(sidebarSource, /window\.localStorage\.setItem\(/);
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
