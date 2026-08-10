/* ════════════════ english_text（HTTP + SSE） ════════════════ */

async function fetchCsrf() {
  const r = await fetch('/api/csrf-token');
  S.csrf = (await r.json()).csrf_token;
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.csrf_token) S.csrf = j.csrf_token;
  if (!r.ok) throw new Error(j.error || 'requestfailed');
  return j;
}

async function apiChat(fields) {
  const fd = new FormData();
  fd.append('csrf_token', S.csrf);
  fd.append('session_id', S.sid);
  if (S.thinkMode) fd.append('think_mode', '1');
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (k === 'images') v.forEach(f => fd.append('images', f));
    else fd.append(k, v);
  });
  const r = await fetch('/api/chat', { method: 'POST', body: fd });
  const j = await r.json();
  if (j.csrf_token) S.csrf = j.csrf_token;
  if (!r.ok) throw new Error(j.error || 'requestfailed');
  return j;
}

/** SSE english_text（english_text，english_text）；english_text null english_text */
function streamCommerceTask(onProgress) {
  if (typeof EventSource === 'undefined') return null;
  return new Promise(resolve => {
    let es;
    try {
      es = new EventSource('/api/commerce-agent/stream/' + S.sid);
    } catch (e) { resolve(null); return; }
    let gotAny = false;
    const timer = setTimeout(() => {
      if (!gotAny) { es.close(); resolve(null); }   // textnonetext：english_text
    }, 8000);
    es.onmessage = ev => {
      gotAny = true;
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.status === 'processing') { onProgress && onProgress(data); return; }
      clearTimeout(timer);
      es.close();
      resolve(data);
    };
    es.onerror = () => {
      clearTimeout(timer);
      es.close();
      resolve(null);                                 // connectionfailed：english_text
    };
  });
}

/** english_texttask（SSE english_text） */
async function pollCommerceTask(onProgress) {
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    let data;
    try {
      data = await (await fetch('/api/commerce-agent/tasks/' + S.sid)).json();
    } catch (e) { await sleep(1500); continue; }
    if (data.csrf_token) S.csrf = data.csrf_token;
    if (data.status === 'processing') {
      onProgress && onProgress(data);
      await sleep(1200);
      continue;
    }
    return data;
  }
  return { status: 'failed', error: 'generationtext' };
}

/** text SSE，failedautomaticenglish_text */
async function watchCommerceTask(onProgress) {
  const viaSse = await streamCommerceTask(onProgress);
  if (viaSse) return viaSse;
  return pollCommerceTask(onProgress);
}

/** english_texttasktext（english_text /api/task/:id） */
async function pollTask() {
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    let data;
    try {
      data = await (await fetch('/api/task/' + S.sid)).json();
    } catch (e) { await sleep(1500); continue; }
    if (data.csrf_token) S.csrf = data.csrf_token;
    if (data.status === 'running') { await sleep(1200); continue; }
    return data;
  }
  return { status: 'failed', error: 'english_text' };
}
