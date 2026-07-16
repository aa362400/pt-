/* ════════════════ 会话与历史 ════════════════ */

const LS_KEY = 'xagent_sessions_v1';

function newSession() {
  // 完整 UUID：session id 同时是访问凭证，必须不可枚举
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

/* ── 今日灵感：老产品 × 没试过的高分场景，点一下就开工 ── */
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
        `<small style="display:block;color:#8B8B9A;margin-top:2px">${esc(sg.emotion || sg.use)} · 还没试过，点我开工</small></span>`;
      cardBtn.onclick = async () => {
        await adoptProfile({ productName: sg.productName, sessionId: sg.sessionId });
        const input = $('promptInput');
        if (input) {
          input.value = `出一张「${sg.sceneName}」场景图`;
          input.focus();
        }
      };
      box.appendChild(cardBtn);
    });
    const label = document.createElement('div');
    label.textContent = '💡 今日灵感 — 老产品还能这么拍：';
    label.style.cssText = 'width:100%;text-align:center;font-size:12.5px;color:#8B8B9A;margin-bottom:2px';
    box.prepend(label);
    empty.appendChild(box);
  } catch (e) { /* 灵感推荐不可用不影响主流程 */ }
}

/* ── 产品档案库：老产品免重复上传，直接复用档案 + 参考图 ── */
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
    label.textContent = '📚 老产品直接复用：';
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
  } catch (e) { /* 档案库不可用不影响主流程 */ }
}

async function adoptProfile(p) {
  const th = addThinking(`正在复用「${p.productName}」的产品档案与参考图…`);
  try {
    const resp = await postJson('/api/commerce-agent/adopt-profile', {
      csrf_token: S.csrf, sessionId: S.sid, sourceSessionId: p.sessionId,
    });
    th.remove();
    S.hasProduct = true;
    S.productProfile = resp.profile || null;
    addAgentMsg(
      `📚 已复用产品档案「<b>${esc(resp.productName)}</b>」（含 ${resp.referenceImageCount} 张产品参考图）。` +
      '直接说要出什么图就行，比如「帮我出 5 张上架套图」。',
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`档案没复用上（${esc(e.message)}），也可以直接重新上传产品图。`, { noPersist: true });
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
  if (diffDays === 1) return '昨天';
  return `${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** 历史列表以服务端记录为准（换浏览器不丢），localStorage 仅兜底 */
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
        title: x.title || `会话 ${x.session_id}`,
        ts: (x.updated_at || 0) * 1000,
        thumb: x.thumb || '',
      }));
  } catch (e) { /* 服务端不可用时退回本地记录 */ }
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

/* 每会话消息快照（含富文本卡片，历史恢复时与服务端记录合并） */
function persistMsg(entry) {
  const key = 'xagent_msgs_' + S.sid;
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  arr.push({ ...entry, ts: Date.now() });
  try { localStorage.setItem(key, JSON.stringify(arr.slice(-300))); } catch {}
}

/** 消息去重键：角色 + 去标签文本前 60 字 */
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
  S.hasProduct = true; // 历史会话默认已有产品
  S.images = []; S.cards = {}; S.lastParsed = null; S.tracking = false;
  S.feedback = {};
  localStorage.setItem('xagent_current_sid', sid);
  chatInner().querySelectorAll('.msg,.image-grid,.plan-card,.set-toolbar,.thinking').forEach(n => n.remove());
  hideEmpty();
  $('sidebar').classList.remove('open');

  // 优先从服务端恢复，并与本地快照合并（富文本卡片只存在本地）→ 历史完整可见
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
  } catch (e) { /* 服务端不可用时退回本地快照 */ }

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
  // 什么都没恢复出来：回到空状态首屏
  if (!chatInner().querySelector('.msg,.image-grid')) {
    const e = $('emptyState'); if (e) e.style.display = '';
    S.hasProduct = false;
    offerProfileReuse();
  }
  renderHistory();
  scrollBottom();
}
