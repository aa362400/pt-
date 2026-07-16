let capturedPayload = null;

const $ = (id) => document.getElementById(id);

function status(message, tone = '') {
  $('status').textContent = message;
  $('status').className = `status ${tone}`;
}

function preview(payload) {
  capturedPayload = payload;
  $('summary').classList.remove('hidden');
  $('pageTitle').textContent = payload.pageTitle || payload.pageUrl;
  $('itemCount').textContent = String(payload.items.length);
  $('confidence').textContent = `${Math.round(payload.confidence * 100)}%`;
  $('preview').replaceChildren(
    ...payload.items.slice(0, 8).map((item) => {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.title;
      const meta = document.createElement('span');
      meta.textContent = item.currentPrice !== undefined ? `${item.currentPrice} ${item.currency || 'RUB'}` : '页面未提供可验证价格';
      li.append(title, meta);
      return li;
    })
  );
  $('upload').disabled = payload.items.length === 0;
}

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('capture').addEventListener('click', async () => {
  status('正在读取当前可见页面…');
  $('upload').disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(tab.url || '')) {
    status('请先打开 Ozon 公开商品、搜索或类目页面。', 'error');
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SHOPMATE_CAPTURE_VISIBLE_OZON' });
    if (!response?.ok) throw new Error(response?.error || '页面解析失败');
    preview(response.payload);
    status(response.payload.items.length ? '请核对预览后再提交。' : '没有找到可见商品。', response.payload.items.length ? 'success' : 'error');
  } catch (error) {
    status(`读取失败：${error.message || error}`, 'error');
  }
});

$('upload').addEventListener('click', async () => {
  if (!capturedPayload) return;
  const { apiBase = 'http://127.0.0.1:3000/api/v1', accessToken = '' } = await chrome.storage.local.get(['apiBase', 'accessToken']);
  if (!accessToken) {
    status('尚未配置本地访问令牌，请打开连接设置。', 'error');
    return;
  }
  $('upload').disabled = true;
  status('正在提交到本地 ShopMate…');
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/market-observations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(capturedPayload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
    status(body.deduplicated ? '该证据已提交过，未重复写入。' : '提交成功，可回到 ShopMate 查看和评分。', 'success');
  } catch (error) {
    status(`提交失败：${error.message || error}`, 'error');
    $('upload').disabled = false;
  }
});
