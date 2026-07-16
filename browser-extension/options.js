const apiBase = document.getElementById('apiBase');
const accessToken = document.getElementById('accessToken');
const status = document.getElementById('status');

chrome.storage.local.get(['apiBase', 'accessToken']).then((value) => {
  apiBase.value = value.apiBase || 'http://127.0.0.1:3000/api/v1';
  accessToken.value = value.accessToken || '';
});

document.getElementById('save').addEventListener('click', async () => {
  let parsed;
  try {
    parsed = new URL(apiBase.value.trim());
  } catch {
    status.textContent = 'API 地址格式无效。';
    status.className = 'status error';
    return;
  }
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
    status.textContent = '本地测试版只允许 http://127.0.0.1 或 http://localhost。';
    status.className = 'status error';
    return;
  }
  await chrome.storage.local.set({
    apiBase: apiBase.value.trim().replace(/\/$/, ''),
    accessToken: accessToken.value.trim()
  });
  status.textContent = '设置已保存。';
  status.className = 'status success';
});

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('accessToken');
  accessToken.value = '';
  status.textContent = '令牌已清除。';
  status.className = 'status success';
});
