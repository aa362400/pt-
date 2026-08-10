/* ════════════════ messagetextimagetext ════════════════ */

function addUserMsg(text, imageUrls, ts, opts) {
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'msg user';
  const imgs = (imageUrls || []).map(u => `<img src="${u}" alt="">`).join('');
  div.innerHTML = `<div class="ava">text</div>
    <div class="mwrap">
      <div class="bubble">${esc(text)}${imgs ? `<div class="user-imgs">${imgs}</div>` : ''}</div>
      <div class="mtime">${fmtTime(ts)}</div>
    </div>`;
  chatInner().appendChild(div);
  if (!(opts && (opts.skipLocal || opts.noPersist))) persistMsg({ role: 'user', text });
  scrollBottom();
  return div;
}

function addAgentMsg(html, opts) {
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.innerHTML = `<div class="ava">✦</div>
    <div class="mwrap">
      <div class="bubble">${html}</div>
      <div class="mtime">${fmtTime(opts && opts.ts)}</div>
    </div>`;
  chatInner().appendChild(div);
  // localenglish_text（english_text），english_text/english_text；
  // skipLocal english_text，english_textwrite
  if (!(opts && (opts.skipLocal || opts.noPersist))) persistMsg({ role: 'agent', html });
  scrollBottom();
  return div;
}

/* english_text：text"english_text"english_text"english_text" */
const THINKING_PHRASES = [
  'english_textplatform…', 'english_textplan…', 'english_textplatformtext…',
  'english_text…', 'english_text，english_text…',
];
/* textreplytext：english_text、markdown title/english_text */
function cleanAgentReplyText(text) {
  let s = String(text || '').replace(/\r\n/g, '\n').trim();
  s = s.replace(/^\s*[^\n]*LLM[^\n]*\n(?:\s*\d+\..*\n?)*(?:\s*\n)?/i, '');
  s = s.replace(/^\s*#{1,6}\s*/gm, '');
  s = s.replace(/^\s*-{3,}\s*$/gm, '');
  return s.trim();
}

function plainAgentReplyText(text) {
  return cleanAgentReplyText(text)
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
}

function formatAgentReplyHtml(text) {
  const safe = esc(cleanAgentReplyText(text));
  return safe
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function addThinking(text) {
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'thinking';
  div.innerHTML = `<span class="dots"><i></i><i></i><i></i></span><span>${esc(text)}</span>`;
  chatInner().appendChild(div);
  scrollBottom();
  let idx = 0;
  const timer = setInterval(() => {
    if (!div.isConnected) { clearInterval(timer); return; }
    const sp = div.querySelector('span:last-child');
    if (sp) sp.textContent = THINKING_PHRASES[idx++ % THINKING_PHRASES.length];
  }, 4000);
  return div;
}

/* english_textoutput（english_text，english_text HTML） */
function addAgentMsgTyped(text, opts) {
  const div = addAgentMsg('', { ...(opts || {}), skipLocal: true });
  const bubble = div.querySelector('.bubble');
  const full = cleanAgentReplyText(text);
  const typingText = plainAgentReplyText(full);
  let i = 0;
  const step = Math.max(2, Math.round(typingText.length / 80));
  const timer = setInterval(() => {
    i = Math.min(typingText.length, i + step);
    bubble.textContent = typingText.slice(0, i);
    scrollBottom();
    if (i >= typingText.length) {
      clearInterval(timer);
      const html = formatAgentReplyHtml(full);
      bubble.innerHTML = html;
      if (!(opts && (opts.skipLocal || opts.noPersist))) persistMsg({ role: 'agent', html });
    }
  }, 33);
  return div;
}

function addImageGrid(images) {
  hideEmpty();
  const grid = document.createElement('div');
  grid.className = 'image-grid';
  const count = Math.min(images.length, 9);
  grid.dataset.count = String(images.length);
  grid.classList.add(`count-${count}`);
  if (images.length === 1) grid.classList.add('solo');
  images.forEach((img, i) => {
    const sceneId = img.scene_id || img.id || `img_${i + 1}`;
    img.scene_id = sceneId;
    const tile = document.createElement('div');
    tile.className = 'img-tile';
    tile.dataset.sceneId = sceneId;
    tile.innerHTML = `
      <span class="it-idx">text ${i + 1}</span>
      <span class="it-status">english_text</span>
      <div class="it-loading"><div class="it-spinner"></div><span>${esc(img.title || '')}</span></div>`;
    grid.appendChild(tile);
    S.cards[sceneId] = tile;
  });
  chatInner().appendChild(grid);
  scrollBottom();
  return grid;
}

/* ── generationtext：english_text「text」english_text ── */
const THEATER_LINES = [
  '🎬 english_text…', '💡 english_text…', '🎨 english_text…', '📐 english_text…',
  '📸 english_text…', '🪄 english_text…', '🔍 english_textconsistency…', '✨ english_text…',
];
let _theaterTimer = null;
function ensureTheater() {
  if (_theaterTimer) return;
  let idx = 0;
  _theaterTimer = setInterval(() => {
    const spans = [];
    Object.values(S.cards).forEach(tile => {
      const st = tile.querySelector('.it-status');
      const sp = tile.querySelector('.it-loading span');
      if (sp && st && st.textContent === 'generationtext') spans.push(sp);
    });
    if (!spans.length) { clearInterval(_theaterTimer); _theaterTimer = null; return; }
    spans.forEach((sp, i) => {
      sp.textContent = THEATER_LINES[(idx + i) % THEATER_LINES.length];
    });
    idx += 1;
  }, 2600);
}

/* ── english_text：allenglish_text ── */
function confettiBurst() {
  const colors = ['#7A67FF', '#FFB84C', '#4CC9A8', '#FF6B8A', '#5AB2FF', '#F5E663'];
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999;overflow:hidden';
  if (!document.getElementById('confetti-css')) {
    const css = document.createElement('style');
    css.id = 'confetti-css';
    css.textContent = '@keyframes cf-fall{0%{transform:translateY(-8vh) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}';
    document.head.appendChild(css);
  }
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('div');
    const size = 6 + Math.random() * 8;
    p.style.cssText = `position:absolute;top:-20px;left:${Math.random() * 100}%;` +
      `width:${size}px;height:${size * 0.45}px;border-radius:2px;` +
      `background:${colors[i % colors.length]};opacity:${0.7 + Math.random() * 0.3};` +
      `animation:cf-fall ${2.2 + Math.random() * 1.8}s ${Math.random() * 0.9}s cubic-bezier(.2,.6,.4,1) forwards`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 5200);
}

function setTileStatus(sceneId, status, text) {
  const tile = S.cards[sceneId];
  if (!tile) return;
  const st = tile.querySelector('.it-status');
  if (st) { st.textContent = text; st.className = 'it-status ' + status; }
  if (text === 'generationtext') ensureTheater();
}

/* ── textconsistencytext（text QA text，english_textgeneration）── */
function setTileIdentity(sceneId, score) {
  const tile = S.cards[sceneId];
  if (tile == null || score == null) return;
  let badge = tile.querySelector('.it-identity');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'it-identity';
    badge.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:3;' +
      'padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;color:#fff';
    tile.appendChild(badge);
  }
  const good = score >= 75, mid = score >= 60;
  badge.style.background = good ? 'rgba(34,170,110,.92)'
    : mid ? 'rgba(240,160,40,.92)' : 'rgba(226,74,74,.94)';
  badge.textContent = `consistency ${Math.round(score)}`;
  badge.title = good ? 'english_text'
    : 'textconsistencytext，english_text「🔄」textgenerationtext';
}

/* english_text WebP english_text；text/english_text。
   english_text（2x/3x DPR）english_text，english_text */
function thumbUrl(url) {
  if (!url || !url.startsWith('/api/image/')) return url;
  const dpr = window.devicePixelRatio || 1;
  const edge = dpr > 2.2 ? 1440 : (dpr > 1.3 ? 960 : 480);
  return url + (url.includes('?') ? '&' : '?') + 'thumb=' + edge;
}

function setTileImage(sceneId, url, img) {
  const tile = S.cards[sceneId];
  if (!tile) return;
  const loading = tile.querySelector('.it-loading');
  if (loading) loading.remove();
  let pic = tile.querySelector('img');
  if (!pic) {
    pic = document.createElement('img');
    pic.loading = 'lazy';
    tile.insertBefore(pic, tile.firstChild);
    const name = document.createElement('div');
    name.className = 'it-name';
    name.textContent = img.title || '';
    tile.appendChild(name);
    const actions = document.createElement('div');
    actions.className = 'it-actions';
    actions.append(
      tbtn('👍', 'english_text（english_text）', (e) => sendFeedback(img, 'like', e.target)),
      tbtn('👎', 'english_text（english_text）', (e) => sendFeedback(img, 'dislike', e.target)),
      tbtn('🧪', 'A/B text：generationenglish_text', () => runAbTest(img)),
      tbtn('🔄', 'textgeneration', () => regenerateImage(img, '')),
      tbtn('🎨', 'english_text', (e) => openStyleMenu(e.target, img)),
      tbtn('✏️', 'english_textgeneration', () => openPromptEditor(img)),
      tbtn('🖌️', 'english_text（english_text）', () => openInpaintEditor(img, pic.dataset.full || pic.src)),
      tbtn('🅰️', 'english_text（english_text）', () => captionImage(img)),
      tbtn('🔍', 'english_text', () => openLightbox(pic.dataset.full || pic.src)),
      tbtn('⚖️', 'english_text（english_text）', () => openCompare(img, pic.dataset.full || pic.src)),
      tbtn('🖨️', 'english_text（1K~18K text）', (e) => openHdMenu(e.target, img)),
      tbtn('⬇️', 'text', () => downloadImage(pic.dataset.full || pic.src, img.scene_id)),
    );
    tile.appendChild(actions);
    applyTileFeedback(tile, img);
  }
  pic.dataset.full = url;
  pic.src = thumbUrl(url);
  pic.onclick = () => openLightbox(url);
  setTileStatus(sceneId, 'done', '✓ completed');
  persistCard(img, url);
}

function setTileFailed(sceneId, img) {
  const tile = S.cards[sceneId];
  if (!tile) return;
  const loading = tile.querySelector('.it-loading');
  if (loading) {
    loading.innerHTML = `<span>generationenglish_text，english_text</span>`;
    const retry = document.createElement('button');
    retry.textContent = '🔄 textgeneration';
    retry.style.cssText = 'padding:6px 13px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12px';
    retry.onclick = () => regenerateImage(img, '');
    loading.appendChild(retry);
  }
  setTileStatus(sceneId, 'failed', 'textcompleted');
}

/* ── text/english_text（english_text LLM text）── */
function feedbackId(img) { return img.id || img.scene_id; }

function applyTileFeedback(tile, img) {
  const v = S.feedback[feedbackId(img)] || S.feedback[img.scene_id];
  tile.querySelectorAll('.it-actions button').forEach(b => {
    if (b.textContent !== '👍' && b.textContent !== '👎') return;
    const active = (v === 'like' && b.textContent === '👍') ||
                   (v === 'dislike' && b.textContent === '👎');
    b.style.background = active ? (v === 'like' ? '#22AA6E' : '#E24A4A') : '';
    b.style.opacity = (v && !active) ? '.45' : '';
  });
}

async function sendFeedback(img, verdict, btn) {
  const id = feedbackId(img);
  const cur = S.feedback[id];
  const next = (cur === verdict) ? 'clear' : verdict;
  try {
    await postJson('/api/commerce-agent/feedback', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, verdict: next,
    });
    if (next === 'clear') delete S.feedback[id];
    else S.feedback[id] = next;
    const tile = btn && btn.closest('.img-tile');
    if (tile) applyTileFeedback(tile, img);
    if (next === 'like') {
      addAgentMsg('👍 english_text，english_text。', { noPersist: true });
    } else if (next === 'dislike') {
      addAgentMsg('👎 text，english_text。', { noPersist: true });
    }
  } catch (e) {
    addAgentMsg(`english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

function tbtn(icon, title, onClick) {
  const b = document.createElement('button');
  b.textContent = icon;
  b.title = title;
  b.onclick = onClick;
  return b;
}

const RESTYLE_PRESETS = [
  { label: 'english_text', instruction: 'english_text' },
  { label: 'english_text', instruction: 'text，backgroundenglish_text' },
  { label: 'english_text', instruction: 'english_text' },
  { label: 'english_text', instruction: 'english_text，backgroundenglish_text' },
];

function openStyleMenu(anchor, img) {
  document.querySelectorAll('.style-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'style-menu';
  menu.style.cssText = 'position:fixed;z-index:80;background:#fff;border:1px solid #ECECF4;border-radius:14px;box-shadow:0 12px 40px rgba(31,31,42,.16);padding:6px;display:flex;flex-direction:column;gap:2px';
  RESTYLE_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:12.5px;text-align:left';
    b.onmouseenter = () => b.style.background = '#F1EDFF';
    b.onmouseleave = () => b.style.background = '';
    b.onclick = () => { menu.remove(); regenerateImage(img, p.instruction); };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 150) + 'px';
  menu.style.top = Math.max(10, rect.top - menu.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
  }), 0);
}

/* ── english_text（english_text：english_text + english_text + english_text）── */
function addPlanCard(strategy, images) {
  hideEmpty();
  const card = document.createElement('div');
  card.className = 'plan-card';
  const lis = images.map((img, i) => {
    const sc = img.scene;
    const sceneLine = sc && (sc.background || (sc.props || []).length)
      ? `<small style="display:block;color:#7A67FF;margin-top:2px">🎬 ${esc(sc.background || '')}` +
        `${(sc.props || []).length ? ' · text: ' + sc.props.map(esc).join('、') : ''}` +
        `${sc.lighting ? ' · ' + esc(sc.lighting) : ''}</small>`
      : '';
    return `<li><span class="li-n">${i + 1}</span><span><b>${esc(img.title)}</b>：<small>${esc(img.purpose || '')}</small>${sceneLine}</span></li>`;
  }).join('');
  const prompts = images.map((img, i) =>
    `text ${i + 1} · ${img.title}\n${img.prompt}`).join('\n\n');
  card.innerHTML = `
    <div class="pc-head"><span class="pc-check">✓</span> english_text</div>
    <div class="pc-body">
      <ol>${lis}</ol>
      <div class="creative-box">
        <div class="cb-title">english_text</div>
        <div class="cb-text">${esc(strategy.creativeDirection || '')}</div>
        <button class="cb-btn">✨ textplan</button>
      </div>
    </div>
    <details class="pc-prompts"><summary>english_text</summary><pre>${esc(prompts)}</pre></details>
    <div class="pc-risk">⚠️ ${esc(strategy.riskReminder || '')}</div>`;
  card.querySelector('.cb-btn').onclick = () => {
    const input = $('promptInput');
    input.value = 'text 1 text ';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  chatInner().appendChild(card);
  scrollBottom();
  return card;
}

/* ── english_textgeneration（text LLM english_textuser）── */
function openPromptEditor(img) {
  document.querySelectorAll('.prompt-editor-mask').forEach(m => m.remove());
  const mask = document.createElement('div');
  mask.className = 'prompt-editor-mask';
  mask.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(31,31,42,.45);display:flex;align-items:center;justify-content:center;padding:20px';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(31,31,42,.25);max-width:640px;width:100%;padding:20px;display:flex;flex-direction:column;gap:12px';
  panel.innerHTML = `
    <div style="font-weight:700;font-size:15px">✏️ text「${esc(img.title || img.scene_id)}」english_text</div>
    <div style="font-size:12.5px;color:#8B8B9A">english_text，english_textgenerationenglish_text（english_text）。</div>
    <textarea style="width:100%;min-height:180px;border:1px solid #ECECF4;border-radius:12px;padding:12px;font-size:13px;line-height:1.6;resize:vertical;font-family:inherit"></textarea>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button data-act="cancel" style="padding:9px 18px;border-radius:99px;background:#F4F4F8;font-size:13px">text</button>
      <button data-act="save" style="padding:9px 18px;border-radius:99px;background:#7A67FF;color:#fff;font-size:13px">english_textgeneration</button>
    </div>`;
  const ta = panel.querySelector('textarea');
  ta.value = img.prompt || '';
  panel.querySelector('[data-act=cancel]').onclick = () => mask.remove();
  panel.querySelector('[data-act=save]').onclick = () => {
    const v = ta.value.trim();
    mask.remove();
    if (!v || v === img.prompt) return;
    regenerateImage(img, '', false, v);
  };
  mask.onclick = e => { if (e.target === mask) mask.remove(); };
  mask.appendChild(panel);
  document.body.appendChild(mask);
  ta.focus();
}

/* ── english_text（1K/2K/3K/4K/8K/18K text）── */
const HD_TIERS = [
  ['1k', '1K · 1024px text/english_text'],
  ['2k', '2K · 2048px platformtext'],
  ['3k', '3K · 3072px english_text'],
  ['4k', '4K · 4096px english_text'],
  ['8k', '8K · 8192px english_text'],
  ['18k', '18K · 18000px english_text'],
];

function openHdMenu(anchor, img) {
  document.querySelectorAll('.style-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'style-menu';
  menu.style.cssText = 'position:fixed;z-index:80;background:#fff;border:1px solid #ECECF4;border-radius:14px;box-shadow:0 12px 40px rgba(31,31,42,.16);padding:8px;display:flex;flex-direction:column;gap:2px;min-width:200px';
  HD_TIERS.forEach(([tier, label]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'text-align:left;padding:8px 12px;border-radius:10px;background:transparent;font-size:12.5px;cursor:pointer;border:none';
    btn.onmouseenter = () => btn.style.background = '#F4F2FF';
    btn.onmouseleave = () => btn.style.background = 'transparent';
    btn.onclick = () => { menu.remove(); exportHd(img, tier); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
  menu.style.top = Math.max(10, rect.top - menu.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
  }), 0);
}

async function exportHd(img, tier) {
  const id = img.scene_id || img.id;
  const t = (tier || '18k').toUpperCase();
  const th = addThinking(`english_text ${t} english_text（AI text/english_text + text，english_text 1 text）…`);
  try {
    const resp = await postJson('/api/commerce-agent/export-hd', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, tier: tier || '18k',
    });
    th.remove();
    const mb = (resp.bytes / 1024 / 1024).toFixed(1);
    const engine = resp.upscaler === 'realesrgan' ? 'AI text' : 'english_text';
    addAgentMsg(
      `🖨️ ${t} english_text（${engine}）：<b>${resp.width}×${resp.height}</b>（${mb}MB）。` +
      `<a href="${resp.url}" download="${esc(id)}_${esc(tier || '18k')}.jpg">english_text</a>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`${t} english_textsuccess（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── english_text（allenglish_text + zip）── */
function openHdPackMenu(anchor) {
  document.querySelectorAll('.style-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'style-menu';
  menu.style.cssText = 'position:fixed;z-index:80;background:#fff;border:1px solid #ECECF4;border-radius:14px;box-shadow:0 12px 40px rgba(31,31,42,.16);padding:8px;display:flex;flex-direction:column;gap:2px;min-width:200px';
  HD_TIERS.forEach(([tier, label]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'text-align:left;padding:8px 12px;border-radius:10px;background:transparent;font-size:12.5px;cursor:pointer;border:none';
    btn.onmouseenter = () => btn.style.background = '#F4F2FF';
    btn.onmouseleave = () => btn.style.background = 'transparent';
    btn.onclick = () => { menu.remove(); exportResolutionPack(tier); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
  menu.style.top = Math.max(10, rect.top - menu.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
  }), 0);
}

async function exportResolutionPack(tier) {
  const t = tier.toUpperCase();
  const th = addThinking(`english_text ${t} english_text（text/english_text）…`);
  try {
    const resp = await postJson('/api/commerce-agent/export-resolution-pack', {
      csrf_token: S.csrf, sessionId: S.sid, tier,
    });
    th.remove();
    const engine = resp.upscaler === 'realesrgan' ? 'AI text' : 'english_text';
    let html = `🖼️ ${t} english_text（${engine}，text ${resp.targetEdge}px）：text <b>${resp.fileCount}</b> text。` +
      `<a href="${resp.url}">text zip</a>`;
    if ((resp.failed || []).length) {
      html += `<br>⚠️ ${resp.failed.length} english_textfailed：` +
        resp.failed.map(f => esc(f.image)).join('、');
    }
    addAgentMsg(html, { noPersist: true });
  } catch (e) {
    th.remove();
    addAgentMsg(`${t} english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── english_text（LLM text + text，english_textlistingenglish_text）── */
async function captionImage(img) {
  const id = img.scene_id || img.id;
  const isPoster = String(id).startsWith('scene_11');
  const tip = isPoster
    ? 'english_text（textautomaticenglish_text；「title | texttitle | english_text」english_text）：'
    : 'english_text（english_textautomatictext；「title | texttitle」english_text）：';
  const custom = prompt(tip, '');
  if (custom === null) return;
  const th = addThinking(isPoster ? 'english_text…' : 'textgenerationenglish_text…');
  try {
    const resp = await postJson('/api/commerce-agent/caption', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, text: custom || '',
      layout: isPoster ? 'poster' : '',
    });
    th.remove();
    const icon = resp.layout === 'poster' ? '🪧 english_text' : '🅰️ english_text';
    const ctaText = resp.cta ? `，CTA: ${esc(resp.cta)}` : '';
    addAgentMsg(
      `${icon}textgeneration（text：<b>${esc(resp.headline)}</b>${resp.subline ? ' / ' + esc(resp.subline) : ''}${ctaText}）：<br>` +
      `<img src="${resp.url}" style="max-width:260px;border-radius:12px;margin-top:8px;cursor:zoom-in" onclick="openLightbox('${resp.url}')"><br>` +
      `<a href="${resp.url}" download="${esc(id)}_${resp.layout}.jpg">english_text</a>` +
      (resp.layout === 'poster' ? '　💡 text「🖨️ english_text」4K/8K english_text' : ''),
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_textsuccess（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── textplatformenglish_text（textplatformlistingtext zip）── */
async function exportPlatformPack() {
  const th = addThinking('english_textplatformlistingenglish_text…');
  try {
    const resp = await postJson('/api/commerce-agent/export-platforms', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const lines = (resp.platforms || [])
      .map(p => `${esc(p.name)}（${esc(p.size)}）× ${p.count}`).join('、');
    addAgentMsg(
      `📦 platformenglish_text：${lines}，text <b>${resp.fileCount}</b> text。` +
      `<a href="${resp.url}">text zip</a>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`platformenglish_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── A/B text：english_text，english_text ── */
async function runAbTest(img) {
  if (S.generating) return;
  const id = img.id || img.scene_id;
  const th = addThinking('textgeneration A/B english_text（english_text / text / text）…');
  let resp;
  try {
    resp = await postJson('/api/commerce-agent/ab-test', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, variants: 3,
    });
  } catch (e) {
    th.remove();
    addAgentMsg(`A/B english_text（${esc(e.message)}），english_text。`, { noPersist: true });
    return;
  }

  const card = document.createElement('div');
  card.className = 'plan-card ab-card';
  card.innerHTML = `<div class="pc-head"><span class="pc-check">🧪</span> A/B text · ${esc(img.title || id)} — text「english_text」english_text</div>
    <div class="pc-body"><div class="ab-row" style="display:flex;gap:12px;flex-wrap:wrap"></div></div>`;
  const row = card.querySelector('.ab-row');
  const slots = {};
  (resp.variants || []).forEach(v => {
    const slot = document.createElement('div');
    slot.style.cssText = 'flex:1;min-width:150px;max-width:220px;text-align:center';
    slot.innerHTML = `<div class="ab-img" style="aspect-ratio:1;border-radius:12px;background:#F4F4F8;display:flex;align-items:center;justify-content:center;overflow:hidden"><div class="it-spinner"></div></div>
      <div style="font-size:12px;color:#8B8B9A;margin:6px 0 4px">plan ${esc(v.label)} · ${esc(v.labelCn)}</div>`;
    row.appendChild(slot);
    slots[v.sceneId] = { slot, v };
  });
  th.remove();
  chatInner().appendChild(card);
  scrollBottom();

  const done = await watchCommerceTask(data => {
    (data.images || []).forEach(im => {
      const s = slots[im.sceneId];
      if (s && im.status === 'done' && im.url && !s.filled) fillAbSlot(s, im, img, id, card);
    });
  });
  (done.images || []).forEach(im => {
    const s = slots[im.sceneId];
    if (s && im.status === 'done' && im.url && !s.filled) fillAbSlot(s, im, img, id, card);
  });
  const failed = Object.values(slots).filter(s => !s.filled);
  failed.forEach(s => {
    s.slot.querySelector('.ab-img').innerHTML = '<span style="font-size:12px;color:#8B8B9A">generationfailed</span>';
  });
}

function fillAbSlot(s, im, img, imageId, card) {
  s.filled = true;
  const box = s.slot.querySelector('.ab-img');
  box.innerHTML = `<img src="${thumbUrl(im.url)}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in">`;
  box.querySelector('img').onclick = () => openLightbox(im.url);
  const pick = document.createElement('button');
  pick.textContent = 'english_text';
  pick.style.cssText = 'padding:6px 18px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px';
  pick.onclick = async () => {
    try {
      const r = await postJson('/api/commerce-agent/ab-pick', {
        csrf_token: S.csrf, sessionId: S.sid, imageId, winnerSceneId: im.sceneId,
      });
      setTileImage(img.scene_id, r.url, img);
      card.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '.4'; });
      pick.textContent = '✓ english_text';
      pick.style.opacity = '1';
      addAgentMsg(`🧪 textplan ${esc(s.v.label)} english_text，english_text。`, { noPersist: true });
    } catch (e) {
      addAgentMsg(`english_textsuccess（${esc(e.message)}），english_text。`, { noPersist: true });
    }
  };
  s.slot.appendChild(pick);
}

/* ── english_text（localenglish_text + english_text + zip）── */
const LOCALE_MARKETS = [
  ['us', '🇺🇸 text'], ['uk', '🇬🇧 text'], ['de', '🇩🇪 text'], ['fr', '🇫🇷 text'],
  ['es', '🇪🇸 english_text'], ['jp', '🇯🇵 text'], ['kr', '🇰🇷 text'], ['sa', '🇸🇦 text'],
  ['sea', '🌏 english_text'],
];

function openLocalizeMenu(anchor) {
  document.querySelectorAll('.style-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'style-menu';
  menu.style.cssText = 'position:fixed;z-index:80;background:#fff;border:1px solid #ECECF4;border-radius:14px;box-shadow:0 12px 40px rgba(31,31,42,.16);padding:10px;display:flex;flex-direction:column;gap:6px;min-width:190px';
  const picked = new Set(['us']);
  LOCALE_MARKETS.forEach(([code, label]) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12.5px;padding:3px 6px;cursor:pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = picked.has(code);
    cb.onchange = () => cb.checked ? picked.add(code) : picked.delete(code);
    row.append(cb, document.createTextNode(label));
    menu.appendChild(row);
  });
  const go = document.createElement('button');
  go.textContent = 'generationenglish_text';
  go.style.cssText = 'margin-top:4px;padding:8px 16px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px';
  go.onclick = () => { menu.remove(); exportLocalizedPack([...picked]); };
  menu.appendChild(go);
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 210) + 'px';
  menu.style.top = Math.max(10, rect.top - menu.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
  }), 0);
}

async function exportLocalizedPack(markets) {
  if (!markets.length) return;
  const th = addThinking('textgenerationenglish_textlocalenglish_text…');
  try {
    const resp = await postJson('/api/commerce-agent/localized-pack', {
      csrf_token: S.csrf, sessionId: S.sid, markets,
    });
    th.remove();
    const lines = (resp.markets || [])
      .map(m => `<b>${esc(m.marketName)}</b>：${esc(m.headline)}（CTA: ${esc(m.cta)}）${m.rtl ? ' · RTL' : ''}`)
      .join('<br>');
    addAgentMsg(
      `🌍 english_text（textsource：${esc(resp.source)}）：<br>${lines}<br>` +
      `english_text copy.json + localenglish_text。<a href="${resp.url}">text zip</a>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_textgeneration（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── listingenglish_text（text/text/english_text/english_text/text）── */
async function runComplianceCheck() {
  const th = addThinking('english_textplatformlistingenglish_text（text/english_text/english_text/text）…');
  try {
    const resp = await postJson('/api/commerce-agent/compliance', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const bad = (resp.images || []).filter(im => !im.passed);
    let html = `🩺 english_textcompleted：<b>${resp.passed}/${resp.totalChecks}</b> textpassed` +
      `（platform：${(resp.platforms || []).join('、')}）。`;
    if (!bad.length) {
      html += ' allimageenglish_textlisting ✅';
    } else {
      html += `<br>yes <b>${bad.length}</b> english_textrisk：`;
      html += bad.map(im => {
        const issues = im.checks.filter(c => !c.passed)
          .map(c => `<li><b>${esc(c.platformName)}</b>：${c.issues.map(esc).join('；')}</li>`)
          .join('');
        return `<div style="margin-top:6px"><b>${esc(im.imageId)}</b><ul style="margin:4px 0 0 18px">${issues}</ul></div>`;
      }).join('');
      html += '<br>💡 text/english_text「textgenerationtext，textbackground、english_text」。';
    }
    addAgentMsg(html, { noPersist: true });
  } catch (e) {
    th.remove();
    addAgentMsg(`english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── 🖌️ english_text：english_text + english_text，english_text ── */
function openInpaintEditor(img, fullUrl) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';
  const box = document.createElement('div');
  box.style.cssText = 'position:relative;width:min(72vw,640px);aspect-ratio:1;background:#111;border-radius:14px;overflow:hidden;cursor:crosshair';
  box.innerHTML = `<img src="${fullUrl.split('?')[0]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">` +
    `<div class="sel" style="position:absolute;border:2px dashed #7A67FF;background:rgba(122,103,255,.18);display:none;pointer-events:none"></div>`;
  const sel = box.querySelector('.sel');
  let rect = null, dragging = false, sx = 0, sy = 0;
  const pos = e => {
    const r = box.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [Math.max(0, Math.min(r.width, cx)) / r.width,
            Math.max(0, Math.min(r.height, cy)) / r.height];
  };
  const start = e => { [sx, sy] = pos(e); dragging = true; sel.style.display = 'block'; };
  const move = e => {
    if (!dragging) return;
    const [x, y] = pos(e);
    rect = [Math.min(sx, x), Math.min(sy, y), Math.abs(x - sx), Math.abs(y - sy)];
    sel.style.left = rect[0] * 100 + '%'; sel.style.top = rect[1] * 100 + '%';
    sel.style.width = rect[2] * 100 + '%'; sel.style.height = rect[3] * 100 + '%';
  };
  const end = () => { dragging = false; };
  box.onmousedown = start; box.onmousemove = move; box.onmouseup = end;
  box.ontouchstart = start; box.ontouchmove = move; box.ontouchend = end;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;width:min(72vw,640px)';
  row.innerHTML = `<input class="ip-text" placeholder="english_text，english_text，text「english_text」" style="flex:1;padding:10px 14px;border-radius:12px;border:none;font-size:13px">
    <button class="ip-go" style="padding:10px 22px;border-radius:99px;background:#7A67FF;color:#fff;font-size:13px;font-weight:700">🖌️ english_text</button>`;
  const hint = document.createElement('div');
  hint.style.cssText = 'color:#fff;font-size:12.5px;opacity:.8';
  hint.textContent = '💡 english_text（english_text，text「english_text」automatictext）；english_text';
  lb.append(box, row, hint);
  lb.onclick = e => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
  row.querySelector('.ip-text').focus();

  row.querySelector('.ip-go').onclick = async () => {
    const instruction = row.querySelector('.ip-text').value.trim();
    if (!instruction) { row.querySelector('.ip-text').focus(); return; }
    if (rect && (rect[2] < 0.02 || rect[3] < 0.02)) rect = null;
    lb.remove();
    const th = addThinking('english_text，english_text…');
    try {
      const resp = await postJson('/api/commerce-agent/inpaint', {
        csrf_token: S.csrf, sessionId: S.sid,
        imageId: img.scene_id || img.id, instruction, rect: rect || undefined,
      });
      th.remove();
      setTileImage(img.scene_id, resp.url, img);
      addAgentMsg(
        `🖌️ english_textcompleted${resp.mocked ? '（english_text：textconfigurationtext Key，english_text）' : ''}` +
        `——english_text${rect ? 'english_text' : 'english_text'}，english_text。english_text。`,
        { noPersist: true },
      );
    } catch (e) {
      th.remove();
      addAgentMsg(`english_textsuccess（${esc(e.message)}），english_text。`, { noPersist: true });
    }
  };
}

/* ── Before/After english_text（text vs text，english_text）── */
async function openCompare(img, generatedUrl) {
  if (!S.originalsCache) {
    try {
      const r = await fetch(`/api/originals/${S.sid}`);
      S.originalsCache = (await r.json()).originals || [];
    } catch (_) { S.originalsCache = []; }
  }
  const orig = S.originalsCache[0];
  if (!orig) {
    addAgentMsg('english_textyesenglish_text，english_text——english_text 🙂', { noPersist: true });
    return;
  }

  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px';
  const box = document.createElement('div');
  box.style.cssText = 'position:relative;width:min(78vw,720px);aspect-ratio:1;background:#111;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.5)';
  box.innerHTML =
    `<img src="${generatedUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">` +
    `<div class="cmp-top" style="position:absolute;inset:0;clip-path:inset(0 50% 0 0)">` +
      `<img src="${orig.url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#111">` +
    `</div>` +
    `<div class="cmp-line" style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:#fff;box-shadow:0 0 8px rgba(0,0,0,.6)"></div>` +
    `<span style="position:absolute;top:12px;left:12px;padding:4px 12px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:700">📷 text</span>` +
    `<span style="position:absolute;top:12px;right:12px;padding:4px 12px;border-radius:99px;background:rgba(122,103,255,.85);color:#fff;font-size:12px;font-weight:700">✨ AI text</span>`;
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = '50';
  slider.style.cssText = 'width:min(78vw,720px);accent-color:#7A67FF';
  const top = box.querySelector('.cmp-top');
  const line = box.querySelector('.cmp-line');
  slider.oninput = () => {
    top.style.clipPath = `inset(0 ${100 - slider.value}% 0 0)`;
    line.style.left = slider.value + '%';
  };
  const hint = document.createElement('div');
  hint.style.cssText = 'color:#fff;font-size:13px;opacity:.85';
  hint.textContent = `${img.title || ''} — english_text「text → english_text」english_text`;
  lb.append(box, slider, hint);
  lb.onclick = (e) => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
}

/* ── 🔭 textmonitoring：english_text + english_text ── */
async function openCompetitorWatch() {
  let watches = [];
  try {
    watches = (await (await fetch('/api/commerce-agent/competitor-watch')).json()).watches || [];
  } catch (_) { /* english_text */ }

  const card = document.createElement('div');
  card.className = 'plan-card';
  const rows = watches.map(w =>
    `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(w.url)}">🔗 ${esc(w.name || w.url)}</span>
      <button data-del="${esc(w.url)}" style="padding:2px 10px;border-radius:99px;background:#FBEAEA;color:#C0392B;font-size:11.5px">text</button>
    </div>`).join('') || '<div style="font-size:12.5px;color:#8B8B9A;padding:4px 0">textyesmonitoringenglish_text，english_text。</div>';
  card.innerHTML = `<div class="pc-head"><span class="pc-check">🔭</span> textmonitoring（${watches.length}/10）</div>
    <div class="pc-body">${rows}
      <div style="display:flex;gap:8px;margin-top:8px">
        <input class="cw-url" placeholder="english_textproducttext https://…" style="flex:1;padding:8px 12px;border:1px solid #ECECF4;border-radius:10px;font-size:12.5px">
        <button class="cw-add" style="padding:8px 16px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px">text</button>
        <button class="cw-report" style="padding:8px 16px;border-radius:99px;background:#22AA6E;color:#fff;font-size:12.5px">📋 generationtext</button>
      </div></div>`;
  card.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    try {
      await postJson('/api/commerce-agent/competitor-watch', {
        csrf_token: S.csrf, action: 'remove', url: b.dataset.del,
      });
      card.remove(); openCompetitorWatch();
    } catch (e) { addAgentMsg(`textfailed（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelector('.cw-add').onclick = async () => {
    const url = card.querySelector('.cw-url').value.trim();
    if (!url) return;
    try {
      await postJson('/api/commerce-agent/competitor-watch', {
        csrf_token: S.csrf, action: 'add', url,
      });
      card.remove(); openCompetitorWatch();
    } catch (e) { addAgentMsg(`textfailed（${esc(e.message)}）。`, { noPersist: true }); }
  };
  card.querySelector('.cw-report').onclick = () => runCompetitorReport();
  chatInner().appendChild(card);
  hideEmpty();
  scrollBottom();
}

async function runCompetitorReport() {
  const th = addThinking('english_text，english_texttitletext…');
  try {
    const resp = await postJson('/api/commerce-agent/competitor-report', {
      csrf_token: S.csrf,
    });
    th.remove();
    const rows = (resp.items || []).map(it => {
      const status = !it.ok ? `<span style="color:#E2A44A">⚠️ ${esc(it.note || 'textfailed')}</span>`
        : it.changes.length ? it.changes.map(c => `<span style="color:#E24A4A">🔔 ${esc(c)}</span>`).join('<br>')
        : `<span style="color:#22AA6E">✓ nonetext${it.note ? '（' + esc(it.note) + '）' : ''}</span>`;
      return `<div style="padding:6px 0;border-bottom:1px dashed #ECECF4"><b>${esc(it.name)}</b><br><small>${status}</small></div>`;
    }).join('');
    addAgentMsg(
      `🔭 <b>textmonitoringreport</b>（${(resp.items || []).length} english_text，${resp.changedCount} textyestext）：<br>${rows}` +
      `${resp.changedCount ? '<br>💡 textyesenglish_text，english_text「english_text」。' : ''}`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`textreportenglish_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── 🚀 english_text：20 english_text + FBA english_text ── */
const POOL_STATUSES = ['text', 'english_text', 'english_text', 'textlisting', 'textlisting'];

async function openProductPool() {
  let data = { items: [], total: 0, capacity: 20 };
  try {
    data = await (await fetch('/api/commerce-agent/product-pool')).json();
  } catch (_) { /* english_text */ }

  const card = document.createElement('div');
  card.className = 'plan-card';
  const rows = (data.items || []).map(it => {
    const fba = it.fba || {};
    const opts = POOL_STATUSES.map(s =>
      `<option ${s === it.status ? 'selected' : ''}>${s}</option>`).join('');
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12.5px;border-bottom:1px dashed #ECECF4">
      <span style="flex:1"><b>${esc(it.name)}</b>${it.category ? ` <small style="color:#8B8B9A">· ${esc(it.category)}</small>` : ''}
        ${fba.launchDate ? `<small style="display:block;color:#7A67FF">🚀 FBA ${esc(fba.launchDate)} · text ${fba.firstBatchUnits || '?'} text</small>` : ''}</span>
      <select data-status="${it.id}" style="padding:3px 6px;border-radius:8px;border:1px solid #ECECF4;font-size:11.5px">${opts}</select>
      <button data-fba="${it.id}" style="padding:2px 8px;border-radius:99px;background:#F1EDFF;color:#5A48E0;font-size:11.5px">FBA</button>
      <button data-del="${it.id}" style="padding:2px 8px;border-radius:99px;background:#FBEAEA;color:#C0392B;font-size:11.5px">text</button>
    </div>`;
  }).join('') || '<div style="font-size:12.5px;color:#8B8B9A;padding:4px 0">english_textyestext，english_text。</div>';

  card.innerHTML = `<div class="pc-head"><span class="pc-check">🚀</span> english_text（${data.total}/${data.capacity}）— 7 text FBA english_text</div>
    <div class="pc-body">${rows}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <input class="pp-name" placeholder="english_text" style="flex:2;min-width:120px;padding:8px 12px;border:1px solid #ECECF4;border-radius:10px;font-size:12.5px">
        <input class="pp-cat" placeholder="category" style="flex:1;min-width:70px;padding:8px 12px;border:1px solid #ECECF4;border-radius:10px;font-size:12.5px">
        <button class="pp-add" style="padding:8px 16px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px">text</button>
        <a href="/api/commerce-agent/product-pool/csv" style="padding:8px 16px;border-radius:99px;background:#22AA6E;color:#fff;font-size:12.5px;text-decoration:none">📋 english_text CSV</a>
      </div></div>`;

  const refresh = () => { card.remove(); openProductPool(); };
  card.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'remove', id: b.dataset.del,
      });
      refresh();
    } catch (e) { addAgentMsg(`textfailed（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => {
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'update', id: sel.dataset.status,
        patch: { status: sel.value },
      });
    } catch (e) { addAgentMsg(`statusenglish_text（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelectorAll('[data-fba]').forEach(b => b.onclick = async () => {
    const date = prompt('FBA textlistingtext（text 2026-07-25）：', '2026-07-25');
    if (date === null) return;
    const units = prompt('english_text（text）：', '100');
    if (units === null) return;
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'update', id: b.dataset.fba,
        patch: { fba: { launchDate: date, firstBatchUnits: parseInt(units, 10) || 0 } },
      });
      refresh();
    } catch (e) { addAgentMsg(`FBA english_text（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelector('.pp-add').onclick = async () => {
    const name = card.querySelector('.pp-name').value.trim();
    if (!name) return;
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'add', name,
        category: card.querySelector('.pp-cat').value.trim(),
      });
      refresh();
    } catch (e) { addAgentMsg(`textfailed（${esc(e.message)}）。`, { noPersist: true }); }
  };
  chatInner().appendChild(card);
  hideEmpty();
  scrollBottom();
}

/* ── 🛒 english_text：text + imageenglish_text ── */
async function createListingPack() {
  const th = addThinking('english_texttitle、english_textkeywords，english_text…');
  try {
    const resp = await postJson('/api/commerce-agent/listing-pack', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const bullets = (resp.bullets || []).map(b => `<li>${esc(b)}</li>`).join('');
    const platTitles = (resp.platformTitles || []).map(t =>
      `<small style="display:block">${t.passed ? '✅' : '⚠️'} <b>${esc(t.platform)}</b>：${esc(t.title)}（${t.title.length} text）</small>`).join('');
    addAgentMsg(
      `🛒 <b>english_text</b>（${resp.source === 'llm' ? 'AI text' : 'templatetext'}，text ${resp.imageCount} text + listing.csv/json）：<br>` +
      `<b>title：</b>${esc(resp.title)}<br>` +
      `${platTitles ? `<b>textplatform ≤75 english_text：</b><br>${platTitles}` : ''}` +
      `<b>english_text：</b><ul style="margin:4px 0 4px 18px">${bullets}</ul>` +
      `<b>keywords：</b><small>${(resp.keywords || []).map(esc).join('、')}</small><br>` +
      `<a href="${resp.url}">english_text zip</a> — imageenglish_textlisting`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── 📈 english_text：english_text，english_text ── */
async function runCtrScore() {
  const th = addThinking('english_text"english_text"english_text…');
  try {
    const resp = await postJson('/api/commerce-agent/ctr-score', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const rows = (resp.images || []).map((im, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const color = im.score >= 75 ? '#22AA6E' : im.score >= 60 ? '#E2A44A' : '#E24A4A';
      const why = (im.reasons || []).join('；');
      const tip = (im.tips || []).length ? `<br><small style="color:#8B8B9A">💡 ${im.tips.map(esc).join('；')}</small>` : '';
      return `<div style="padding:6px 0;border-bottom:1px dashed #ECECF4">${medal} <b>${esc(im.imageId)}</b> ` +
        `<span style="color:${color};font-weight:700">${im.score == null ? '—' : im.score + ' text'}</span>` +
        `${why ? `<br><small>${esc(why)}</small>` : ''}${tip}</div>`;
    }).join('');
    addAgentMsg(
      `📈 <b>english_text</b>（english_text/text/text/english_text/backgroundenglish_text）：<br>${rows}<br>` +
      `<small style="color:#8B8B9A">english_text 🥇 textplatformtext；english_text「🔄」english_text。</small>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

/* ── 📖 english_text：english_text ── */
async function createAlbum() {
  const th = addThinking('english_text…');
  try {
    const resp = await postJson('/api/commerce-agent/album', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    addAgentMsg(
      `📖 english_text — english_text+english_text，` +
      `<a href="${resp.url}" target="_blank">english_text</a>，english_textcustomer/english_text，english_text ✨`,
      { noPersist: true },
    );
    window.open(resp.url, '_blank');
  } catch (e) {
    th.remove();
    addAgentMsg(`english_text（${esc(e.message)}），english_text。`, { noPersist: true });
  }
}

function openLightbox(url) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${url}">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}

function downloadImage(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = (name || 'image') + '.jpg';
  document.body.appendChild(a); a.click(); a.remove();
}

function addSetToolbar(doneCount, total, elapsed) {
  if (doneCount === total && doneCount > 0) confettiBurst();
  const bar = document.createElement('div');
  bar.className = 'set-toolbar';
  const timing = elapsed ? `text ${Math.round(elapsed)} text，` : '';
  const saved = doneCount > 0
    ? `${timing}english_text ¥200~500 text，english_text <b>¥${(doneCount * 350).toLocaleString()}</b>。`
    : '';
  bar.innerHTML = `<span>✨ textcompleted <b>${doneCount}/${total}</b> text。${saved}english_text，english_text「english_text」。</span>
    <a href="javascript:void(0)" data-act="full-service" style="font-weight:700">🚀 english_text</a>
    <a href="/api/download/${S.sid}">📥 textall (ZIP)</a>
    <a href="javascript:void(0)" data-act="hd-pack">🖼️ english_text (1K~18K)</a>
    <a href="javascript:void(0)" data-act="platform-pack">📦 platformenglish_text</a>
    <a href="javascript:void(0)" data-act="compliance">🩺 listingenglish_text</a>
    <a href="javascript:void(0)" data-act="ctr">📈 english_text</a>
    <a href="javascript:void(0)" data-act="listing">🛒 english_text</a>
    <a href="javascript:void(0)" data-act="localize">🌍 english_text</a>
    <a href="javascript:void(0)" data-act="album">📖 english_text</a>`;
  bar.querySelector('[data-act=full-service]').onclick = () => runFullService();
  bar.querySelector('[data-act=listing]').onclick = () => createListingPack();
  bar.querySelector('[data-act=ctr]').onclick = () => runCtrScore();
  bar.querySelector('[data-act=album]').onclick = () => createAlbum();
  bar.querySelector('[data-act=hd-pack]').onclick = (e) => openHdPackMenu(e.target);
  bar.querySelector('[data-act=platform-pack]').onclick = () => exportPlatformPack();
  bar.querySelector('[data-act=compliance]').onclick = () => runComplianceCheck();
  bar.querySelector('[data-act=localize]').onclick = (e) => openLocalizeMenu(e.target);
  chatInner().appendChild(bar);
  scrollBottom();
}
