/* ════════════════ english_text ════════════════ */

const LS_KEY = 'xagent_sessions_v1';

function newSession() {
  // text UUID：session id textyesenglish_text，english_text
  S.sid = (crypto.randomUUID ? crypto.randomUUID()
    : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,
        c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  S.hasProduct = false; S.productProfile = null;
  S.images = []; S.cards = {}; S.lastParsed = null; S.tracking = false;
  S.feedback = {};
  chatInner().querySelectorAll('.msg,.image-grid,.plan-card,.set-toolbar,.thinking').forEach(n => n.remove());
  const e = $('emptyState'); if (e) e.style.display = '';
  localStorage.setItem('xagent_current_sid', S.sid);
  renderHistory();
  offerProfileReuse();
  offerInspiration();
}

/* ── english_text：english_text × english_textscene，english_text ── */
async function offerInspiration() {
  const empty = $('emptyState');
  if (!empty) return;
  try {
    const data = await (await fetch('/api/commerce-agent/inspiration')).json();
    const seenSugs = new Set();
    const sugs = (data.suggestions || []).filter(sg => {
      const key = `${sg.productName || ''}|${sg.sceneName || ''}`;
      if (seenSugs.has(key)) return false;
      seenSugs.add(key);
      return true;
    }).slice(0, 3);
    let box = empty.querySelector('.inspiration-box');
    if (box) box.remove();
    if (!sugs.length) return;
    box = document.createElement('div');
    box.className = 'inspiration-box';
    box.style.cssText = 'margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center';
    sugs.forEach(sg => {
      const cardBtn = document.createElement('button');
      cardBtn.style.cssText = 'display:flex;align-items:center;gap:10px;text-align:left;' +
        'padding:10px 16px;border-radius:16px;background:#fff;border:1px solid #ECECF4;' +
        'box-shadow:0 6px 18px rgba(31,31,42,.06);cursor:pointer;max-width:280px';
      cardBtn.innerHTML =
        (sg.thumb ? `<img src="${sg.thumb}" style="width:38px;height:38px;border-radius:10px;object-fit:cover">` : '<span style="font-size:22px">💡</span>') +
        `<span><b style="font-size:13px">${esc(sg.productName)}</b> × ${esc(sg.sceneName)}` +
        `<small style="display:block;color:#8B8B9A;margin-top:2px">${esc(sg.emotion || sg.use)} · english_text，english_text</small></span>`;
      cardBtn.onclick = async () => {
        await adoptProfile({ productName: sg.productName, sessionId: sg.sessionId });
        const input = $('promptInput');
        if (input) {
          input.value = `english_text「${sg.sceneName}」scenetext`;
          input.focus();
        }
      };
      box.appendChild(cardBtn);
    });
    const label = document.createElement('div');
    label.textContent = '💡 english_text — english_text：';
    label.style.cssText = 'width:100%;text-align:center;font-size:12.5px;color:#8B8B9A;margin-bottom:2px';
    box.prepend(label);
    empty.appendChild(box);
  } catch (e) { /* english_textflow */ }
}

/* ── english_text：english_text，english_text + english_text ── */
async function offerProfileReuse() {
  const empty = $('emptyState');
  if (!empty) return;
  let box = empty.querySelector('.profile-reuse');
  try {
    const data = await (await fetch('/api/commerce-agent/profiles')).json();
    const seenProfiles = new Set();
    const profiles = (data.profiles || []).filter(p => {
      if (!p.productName) return false;
      const key = `${p.productName}|${p.category || ''}`;
      if (seenProfiles.has(key)) return false;
      seenProfiles.add(key);
      return true;
    }).slice(0, 5);
    if (box) box.remove();
    if (!profiles.length) return;
    box = document.createElement('div');
    box.className = 'profile-reuse';
    box.style.cssText = 'margin-top:18px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center';
    const label = document.createElement('span');
    label.textContent = '📚 english_text：';
    label.style.cssText = 'font-size:12.5px;color:#8B8B9A';
    box.appendChild(label);
    profiles.forEach(p => {
      const b = document.createElement('button');
      b.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:99px;background:#F1EDFF;color:#5A48E0;font-size:12.5px;font-weight:600';
      b.innerHTML = (p.thumb ? `<img src="${p.thumb}" style="width:20px;height:20px;border-radius:50%;object-fit:cover">` : '') +
        esc(p.productName) + (p.category ? `<small style="opacity:.65"> · ${esc(p.category)}</small>` : '');
      b.onclick = () => adoptProfile(p);
      box.appendChild(b);
    });
    empty.appendChild(box);
  } catch (e) { /* english_textflow */ }
}

async function adoptProfile(p) {
  const th = addThinking(`english_text「${p.productName}」english_text…`);
  try {
    const resp = await postJson('/api/commerce-agent/adopt-profile', {
      csrf_token: S.csrf, sessionId: S.sid, sourceSessionId: p.sessionId,
    });
    th.remove();
    S.hasProduct = true;
    S.productProfile = resp.profile || null;
    addAgentMsg(
      `📚 english_text「<b>${esc(resp.productName)}</b>」（text ${resp.referenceImageCount} english_text）。` +
      'english_text，text「english_text 5 textlistingtext」。',
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

function historyAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

function fmtHistTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = t => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return fmtTime(ts);
  if (diffDays === 1) return 'text';
  return `${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** english_text（english_text），localStorage english_text */
async function renderHistory() {
  const wrap = $('historyList');
  let items = [];
  try {
    const data = await (await fetch('/api/sessions')).json();
    items = (data.sessions || [])
      .filter(x => x.message_count > 0)
      .slice(0, 40)
      .map(x => ({
        sid: x.session_id,
        title: x.title || `text ${x.session_id}`,
        ts: (x.updated_at || 0) * 1000,
        thumb: x.thumb || '',
      }));
  } catch (e) { /* english_textlocaltext */ }
  if (!items.length) items = historyAll();

  wrap.innerHTML = '';
  items.forEach(item => {
    const b = document.createElement('button');
    b.className = 'history-item' + (item.sid === S.sid ? ' on' : '');
    b.innerHTML = `
      <span class="hi-thumb">${item.thumb ? `<img src="${item.thumb}" alt="" loading="lazy">` : '✦'}</span>
      <span class="hi-text">${esc(item.title)}</span>
      <span class="hi-time">${fmtHistTime(item.ts)}</span>`;
    b.onclick = () => loadSession(item.sid);
    wrap.appendChild(b);
  });
}

/* english_textmessagetext（english_text，english_text） */
function persistMsg(entry) {
  const key = 'xagent_msgs_' + S.sid;
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  arr.push({ ...entry, ts: Date.now() });
  try { localStorage.setItem(key, JSON.stringify(arr.slice(-300))); } catch {}
}

/** messageenglish_text：text + english_text 60 text */
function msgKey(role, content) {
  const text = String(content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return role + '|' + text.slice(0, 60);
}

function persistCard(img, url) {
  const key = 'xagent_cards_' + S.sid;
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const i = arr.findIndex(x => x.scene_id === img.scene_id);
  const entry = { scene_id: img.scene_id, title: img.title || '', purpose: img.purpose || '', url, image: img };
  if (i >= 0) arr[i] = entry; else arr.push(entry);
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
}

async function loadSession(sid) {
  S.sid = sid;
  S.hasProduct = true; // english_textyestext
  S.images = []; S.cards = {}; S.lastParsed = null; S.tracking = false;
  S.feedback = {};
  localStorage.setItem('xagent_current_sid', sid);
  chatInner().querySelectorAll('.msg,.image-grid,.plan-card,.set-toolbar,.thinking').forEach(n => n.remove());
  hideEmpty();
  $('sidebar').classList.remove('open');

  // english_text，textlocalenglish_text（english_textlocal）→ english_text
  let restored = false;
  try {
    const data = await (await fetch(`/api/session/${sid}/messages`)).json();
    const msgs = data.messages || [];

    let localMsgs = [];
    try { localMsgs = JSON.parse(localStorage.getItem('xagent_msgs_' + sid) || '[]'); } catch {}

    const seen = new Set();
    const merged = [];
    msgs.forEach(m => {
      if (m.role !== 'user' && m.role !== 'observer') return;
      const role = m.role === 'observer' ? 'agent' : 'user';
      const key = msgKey(role, m.content);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ role, text: m.content, html: role === 'agent' ? formatAgentReplyHtml(m.content) : null,
                    ts: (m.ts || 0) * 1000 });
    });
    localMsgs.forEach(m => {
      const key = msgKey(m.role, m.html || m.text);
      if (seen.has(key)) return;
      seen.add(key);
      const content = m.html || m.text || '';
      const hasHtml = /<[a-z][\s\S]*>/i.test(content);
      const staleMarkdown = /LLM|\*\*|`/.test(content);
      const html = m.role === 'agent'
        ? ((hasHtml && !staleMarkdown) ? content : formatAgentReplyHtml(content))
        : null;
      merged.push({ role: m.role, text: m.text || '', html, ts: m.ts || 0 });
    });
    merged.sort((a, b) => a.ts - b.ts);
    merged.forEach(m => {
      if (m.role === 'user') addUserMsg(m.text, [], m.ts, { skipLocal: true });
      else addAgentMsg(m.html || esc(m.text), { skipLocal: true, ts: m.ts });
    });
    Object.entries(data.feedback || {}).forEach(([id, f]) => {
      if (f && f.verdict) S.feedback[id] = f.verdict;
    });
    const plan = data.listing_plan || [];
    if (plan.length) {
      S.images = plan;
      addImageGrid(plan);
      if (data.strategy) addPlanCard(data.strategy, plan);
      const idScores = data.identity_scores || {};
      (data.scenes || []).forEach(sc => {
        if (sc.status === 'done' && sc.filename) {
          const img = plan.find(p => (p.scene_id || p.id) === sc.scene_id) || sc;
          setTileImage(sc.scene_id, `/api/image/${sid}/${sc.filename}`, img);
          const stem = (sc.filename.split('/').pop() || '').replace(/\.[^.]+$/, '');
          const score = idScores[stem] != null ? idScores[stem] : idScores[sc.scene_id];
          if (score != null) setTileIdentity(sc.scene_id, score);
        } else {
          const img = plan.find(p => (p.scene_id || p.id) === sc.scene_id);
          if (img) setTileFailed(sc.scene_id, img);
        }
      });
    }
    restored = merged.length > 0 || plan.length > 0;
  } catch (e) { /* english_textlocaltext */ }

  if (!restored) {
    let msgs = [];
    try { msgs = JSON.parse(localStorage.getItem('xagent_msgs_' + sid) || '[]'); } catch {}
    msgs.forEach(m => {
      if (m.role === 'user') addUserMsg(m.text, [], m.ts, { skipLocal: true });
      else if (m.role === 'agent') addAgentMsg(m.html, { skipLocal: true, ts: m.ts });
    });
    let cards = [];
    try { cards = JSON.parse(localStorage.getItem('xagent_cards_' + sid) || '[]'); } catch {}
    if (cards.length) {
      const images = cards.map(c => c.image || { scene_id: c.scene_id, title: c.title, purpose: c.purpose });
      S.images = images;
      addImageGrid(images);
      cards.forEach(c => setTileImage(c.scene_id, c.url, c.image || c));
    }
  }
  // english_text：english_textstatustext
  if (!chatInner().querySelector('.msg,.image-grid')) {
    const e = $('emptyState'); if (e) e.style.display = '';
    S.hasProduct = false;
    offerProfileReuse();
  }
  renderHistory();
  scrollBottom();
}
