import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const contentScript = await readFile(new URL('content-script.js', root), 'utf8');
const popup = await readFile(new URL('popup.js', root), 'utf8');
const options = await readFile(new URL('options.js', root), 'utf8');

test('manifest uses only the minimum browser permissions', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'storage']);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.every((value) =>
    value.startsWith('https://ozon.ru/') ||
    value.startsWith('https://*.ozon.ru/') ||
    value.startsWith('http://127.0.0.1/') ||
    value.startsWith('http://localhost/'),
  ));
});

test('content script never reads credentials or browser storage', () => {
  for (const forbidden of [
    'document.cookie',
    'localStorage',
    'sessionStorage',
    'chrome.cookies',
    'outerHTML',
    'document.documentElement.innerHTML',
  ]) {
    assert.equal(contentScript.includes(forbidden), false, `forbidden access: ${forbidden}`);
  }
});

test('collection is bounded and only starts after the user clicks capture', () => {
  assert.match(contentScript, /const MAX_ITEMS = 100;/);
  assert.match(contentScript, /slice\(0, MAX_ITEMS\)/);
  assert.match(popup, /\$\('capture'\)\.addEventListener\('click'/);
  assert.match(popup, /SHOPMATE_CAPTURE_VISIBLE_OZON/);
  assert.doesNotMatch(contentScript, /\bfetch\s*\(/);
});

test('local test configuration rejects remote API destinations', () => {
  assert.match(options, /\['127\.0\.0\.1', 'localhost'\]/);
  assert.match(options, /parsed\.protocol !== 'http:'/);
  assert.match(popup, /请核对预览后再提交/);
});
