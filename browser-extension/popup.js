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
      meta.textContent = item.currentPrice !== undefined ? `${item.currentPrice} ${item.currency || 'RUB'}` : 'No verifiable price on this page';
      li.append(title, meta);
      return li;
    })
  );
  $('upload').disabled = payload.items.length === 0;
}

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('capture').addEventListener('click', async () => {
  status('Reading the currently visible page...');
  $('upload').disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(tab.url || '')) {
    status('Open an Ozon public product, search or category page first.', 'error');
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SHOPMATE_CAPTURE_VISIBLE_OZON' });
    if (!response?.ok) throw new Error(response?.error || 'Page parsing failed');
    preview(response.payload);
    status(response.payload.items.length ? 'Review the preview before submitting.' : 'No visible products found.', response.payload.items.length ? 'success' : 'error');
  } catch (error) {
    status(`Read failed: ${error.message || error}`, 'error');
  }
});

$('upload').addEventListener('click', async () => {
  if (!capturedPayload) return;
  const { apiBase = 'http://127.0.0.1:3000/api/v1', accessToken = '' } = await chrome.storage.local.get(['apiBase', 'accessToken']);
  if (!accessToken) {
    status('Local access token is not configured. Open connection settings.', 'error');
    return;
  }
  $('upload').disabled = true;
  status('Submitting to local ShopMate...');
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
    status(body.deduplicated ? 'This evidence was already submitted; no duplicate was written.' : 'Submitted successfully. Return to ShopMate to review and score it.', 'success');
  } catch (error) {
    status(`Submit failed: ${error.message || error}`, 'error');
    $('upload').disabled = false;
  }
});
