/* ════════════════ 消息与图片渲染 ════════════════ */

function addUserMsg(text, imageUrls, ts, opts) {
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'msg user';
  const imgs = (imageUrls || []).map(u => `<img src="${u}" alt="">`).join('');
  div.innerHTML = `<div class="ava">你</div>
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
  // 本地快照始终记录（含富文本卡片），切换会话/刷新后历史完整可见；
  // skipLocal 仅供历史恢复回放时使用，避免重复写入
  if (!(opts && (opts.skipLocal || opts.noPersist))) persistMsg({ role: 'agent', html });
  scrollBottom();
  return div;
}

/* 等待期轮播文案：把"卡住了"的观感变成"在干活" */
const THINKING_PHRASES = [
  '在琢磨你的产品和平台…', '在权衡几种方案…', '在过一遍平台规则…',
  '在组织语言…', '快好了，正在收尾…',
];
/* 清洗回复文本：去内部规划块、markdown 标题/分隔线 */
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

/* 打字机式逐字输出（打字时显示纯文本，收尾再渲染成干净 HTML） */
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
      <span class="it-idx">图 ${i + 1}</span>
      <span class="it-status">排队中</span>
      <div class="it-loading"><div class="it-spinner"></div><span>${esc(img.title || '')}</span></div>`;
    grid.appendChild(tile);
    S.cards[sceneId] = tile;
  });
  chatInner().appendChild(grid);
  scrollBottom();
  return grid;
}

/* ── 生成剧场：等待时把「转圈」演成摄影棚工作实况 ── */
const THEATER_LINES = [
  '🎬 正在布景搭台…', '💡 给产品打主光…', '🎨 调色板校准中…', '📐 调整机位构图…',
  '📸 按下快门…', '🪄 暗房精修润色…', '🔍 核对产品细节一致性…', '✨ 最后一遍质感抛光…',
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
      if (sp && st && st.textContent === '生成中') spans.push(sp);
    });
    if (!spans.length) { clearInterval(_theaterTimer); _theaterTimer = null; return; }
    spans.forEach((sp, i) => {
      sp.textContent = THEATER_LINES[(idx + i) % THEATER_LINES.length];
    });
    idx += 1;
  }, 2600);
}

/* ── 完工庆祝：全部出片时来一场彩带雨 ── */
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
  if (text === '生成中') ensureTheater();
}

/* ── 产品一致性徽章（语义 QA 分，低分高亮提醒重生成）── */
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
  badge.textContent = `一致性 ${Math.round(score)}`;
  badge.title = good ? '产品与参考图高度一致'
    : '产品一致性偏低，建议点「🔄」重新生成这张';
}

/* 画廊格子用 WebP 缩略图省流提速；放大/下载仍取原图。
   高分屏（2x/3x DPR）取更大缩略边长，避免拉伸发糊 */
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
      tbtn('👍', '喜欢这张（下一轮会多出这种感觉）', (e) => sendFeedback(img, 'like', e.target)),
      tbtn('👎', '不喜欢（下一轮避开这种方向）', (e) => sendFeedback(img, 'dislike', e.target)),
      tbtn('🧪', 'A/B 测试：生成多风格变体并排对比', () => runAbTest(img)),
      tbtn('🔄', '重新生成', () => regenerateImage(img, '')),
      tbtn('🎨', '换风格', (e) => openStyleMenu(e.target, img)),
      tbtn('✏️', '编辑提示词后重生成', () => openPromptEditor(img)),
      tbtn('🖌️', '圈选精准改图（框哪改哪）', () => openInpaintEditor(img, pic.dataset.full || pic.src)),
      tbtn('🅰️', '叠加卖点文案（成品图）', () => captionImage(img)),
      tbtn('🔍', '放大预览', () => openLightbox(pic.dataset.full || pic.src)),
      tbtn('⚖️', '对比原图（拖动滑块看蜕变）', () => openCompare(img, pic.dataset.full || pic.src)),
      tbtn('🖨️', '高清导出（1K~18K 分档）', (e) => openHdMenu(e.target, img)),
      tbtn('⬇️', '下载', () => downloadImage(pic.dataset.full || pic.src, img.scene_id)),
    );
    tile.appendChild(actions);
    applyTileFeedback(tile, img);
  }
  pic.dataset.full = url;
  pic.src = thumbUrl(url);
  pic.onclick = () => openLightbox(url);
  setTileStatus(sceneId, 'done', '✓ 完成');
  persistCard(img, url);
}

function setTileFailed(sceneId, img) {
  const tile = S.cards[sceneId];
  if (!tile) return;
  const loading = tile.querySelector('.it-loading');
  if (loading) {
    loading.innerHTML = `<span>生成遇到阻塞，创意方向已保留</span>`;
    const retry = document.createElement('button');
    retry.textContent = '🔄 重新生成';
    retry.style.cssText = 'padding:6px 13px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12px';
    retry.onclick = () => regenerateImage(img, '');
    loading.appendChild(retry);
  }
  setTileStatus(sceneId, 'failed', '未完成');
}

/* ── 喜欢/不喜欢反馈（偏好会注入下一轮 LLM 规划）── */
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
      addAgentMsg('👍 记住了，下一轮会多出这种感觉的图。', { noPersist: true });
    } else if (next === 'dislike') {
      addAgentMsg('👎 明白，下一轮会避开这种方向。', { noPersist: true });
    }
  } catch (e) {
    addAgentMsg(`反馈没记上（${esc(e.message)}），稍后再点一次。`, { noPersist: true });
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
  { label: '更温馨', instruction: '更温馨一点' },
  { label: '高级白底', instruction: '白底，背景简单一点' },
  { label: '圣诞礼物风', instruction: '改成圣诞礼物' },
  { label: '突出产品', instruction: '产品放大，背景简单一点' },
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

/* ── 套图用途卡（对齐设计稿：勾选头 + 编号用途 + 创意方向）── */
function addPlanCard(strategy, images) {
  hideEmpty();
  const card = document.createElement('div');
  card.className = 'plan-card';
  const lis = images.map((img, i) => {
    const sc = img.scene;
    const sceneLine = sc && (sc.background || (sc.props || []).length)
      ? `<small style="display:block;color:#7A67FF;margin-top:2px">🎬 ${esc(sc.background || '')}` +
        `${(sc.props || []).length ? ' · 道具: ' + sc.props.map(esc).join('、') : ''}` +
        `${sc.lighting ? ' · ' + esc(sc.lighting) : ''}</small>`
      : '';
    return `<li><span class="li-n">${i + 1}</span><span><b>${esc(img.title)}</b>：<small>${esc(img.purpose || '')}</small>${sceneLine}</span></li>`;
  }).join('');
  const prompts = images.map((img, i) =>
    `图 ${i + 1} · ${img.title}\n${img.prompt}`).join('\n\n');
  card.innerHTML = `
    <div class="pc-head"><span class="pc-check">✓</span> 已为你规划本套图的用途</div>
    <div class="pc-body">
      <ol>${lis}</ol>
      <div class="creative-box">
        <div class="cb-title">创意方向</div>
        <div class="cb-text">${esc(strategy.creativeDirection || '')}</div>
        <button class="cb-btn">✨ 调整方案</button>
      </div>
    </div>
    <details class="pc-prompts"><summary>查看每张图的英文提示词</summary><pre>${esc(prompts)}</pre></details>
    <div class="pc-risk">⚠️ ${esc(strategy.riskReminder || '')}</div>`;
  card.querySelector('.cb-btn').onclick = () => {
    const input = $('promptInput');
    input.value = '第 1 张 ';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  chatInner().appendChild(card);
  scrollBottom();
  return card;
}

/* ── 编辑提示词后重生成（把 LLM 规划的可控性交给用户）── */
function openPromptEditor(img) {
  document.querySelectorAll('.prompt-editor-mask').forEach(m => m.remove());
  const mask = document.createElement('div');
  mask.className = 'prompt-editor-mask';
  mask.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(31,31,42,.45);display:flex;align-items:center;justify-content:center;padding:20px';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(31,31,42,.25);max-width:640px;width:100%;padding:20px;display:flex;flex-direction:column;gap:12px';
  panel.innerHTML = `
    <div style="font-weight:700;font-size:15px">✏️ 编辑「${esc(img.title || img.scene_id)}」的英文提示词</div>
    <div style="font-size:12.5px;color:#8B8B9A">直接改下面的英文提示词，保存后按你的版本重新生成这张图（其他图不受影响）。</div>
    <textarea style="width:100%;min-height:180px;border:1px solid #ECECF4;border-radius:12px;padding:12px;font-size:13px;line-height:1.6;resize:vertical;font-family:inherit"></textarea>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button data-act="cancel" style="padding:9px 18px;border-radius:99px;background:#F4F4F8;font-size:13px">取消</button>
      <button data-act="save" style="padding:9px 18px;border-radius:99px;background:#7A67FF;color:#fff;font-size:13px">保存并重新生成</button>
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

/* ── 高清导出（1K/2K/3K/4K/8K/18K 分档）── */
const HD_TIERS = [
  ['1k', '1K · 1024px 网页/详情页'],
  ['2k', '2K · 2048px 平台主图'],
  ['3k', '3K · 3072px 高清主图'],
  ['4k', '4K · 4096px 宣传物料'],
  ['8k', '8K · 8192px 大幅宣传'],
  ['18k', '18K · 18000px 打印级'],
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
  const th = addThinking(`正在导出 ${t} 高清版本（AI 超分/分级放大 + 锐化，大档位约需 1 分钟）…`);
  try {
    const resp = await postJson('/api/commerce-agent/export-hd', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, tier: tier || '18k',
    });
    th.remove();
    const mb = (resp.bytes / 1024 / 1024).toFixed(1);
    const engine = resp.upscaler === 'realesrgan' ? 'AI 超分' : '分级放大';
    addAgentMsg(
      `🖨️ ${t} 高清已就绪（${engine}）：<b>${resp.width}×${resp.height}</b>（${mb}MB）。` +
      `<a href="${resp.url}" download="${esc(id)}_${esc(tier || '18k')}.jpg">点击下载</a>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`${t} 导出没成功（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 整批高清包（全部图统一放大到指定档位 + zip）── */
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
  const th = addThinking(`正在把整批图放大到 ${t} 并打包（图多/档高时需要几分钟）…`);
  try {
    const resp = await postJson('/api/commerce-agent/export-resolution-pack', {
      csrf_token: S.csrf, sessionId: S.sid, tier,
    });
    th.remove();
    const engine = resp.upscaler === 'realesrgan' ? 'AI 超分' : '分级放大';
    let html = `🖼️ ${t} 高清包已就绪（${engine}，长边 ${resp.targetEdge}px）：共 <b>${resp.fileCount}</b> 张。` +
      `<a href="${resp.url}">下载 zip</a>`;
    if ((resp.failed || []).length) {
      html += `<br>⚠️ ${resp.failed.length} 张导出失败：` +
        resp.failed.map(f => esc(f.image)).join('、');
    }
    addAgentMsg(html, { noPersist: true });
  } catch (e) {
    th.remove();
    addAgentMsg(`${t} 高清包没打成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 主图卖点文案叠加（LLM 文案 + 排版，出可直接上架的成品图）── */
async function captionImage(img) {
  const id = img.scene_id || img.id;
  const isPoster = String(id).startsWith('scene_11');
  const tip = isPoster
    ? '海报文案（留空自动写大促文案；「标题 | 副标题 | 按钮文字」可分段）：'
    : '要叠加的卖点文案（留空让我按产品自动写；「标题 | 副标题」可分两行）：';
  const custom = prompt(tip, '');
  if (custom === null) return;
  const th = addThinking(isPoster ? '正在写大促文案并排版成投放海报…' : '正在生成卖点文案并排版到图上…');
  try {
    const resp = await postJson('/api/commerce-agent/caption', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, text: custom || '',
      layout: isPoster ? 'poster' : '',
    });
    th.remove();
    const icon = resp.layout === 'poster' ? '🪧 成品海报' : '🅰️ 成品图';
    const ctaText = resp.cta ? `，CTA: ${esc(resp.cta)}` : '';
    addAgentMsg(
      `${icon}已生成（文案：<b>${esc(resp.headline)}</b>${resp.subline ? ' / ' + esc(resp.subline) : ''}${ctaText}）：<br>` +
      `<img src="${resp.url}" style="max-width:260px;border-radius:12px;margin-top:8px;cursor:zoom-in" onclick="openLightbox('${resp.url}')"><br>` +
      `<a href="${resp.url}" download="${esc(id)}_${resp.layout}.jpg">下载成品</a>` +
      (resp.layout === 'poster' ? '　💡 配合「🖨️ 高清导出」4K/8K 档即可直接投放' : ''),
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`文案叠加没成功（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 一键平台尺寸包（各平台上架尺寸 zip）── */
async function exportPlatformPack() {
  const th = addThinking('正在按各平台上架尺寸裁切打包…');
  try {
    const resp = await postJson('/api/commerce-agent/export-platforms', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const lines = (resp.platforms || [])
      .map(p => `${esc(p.name)}（${esc(p.size)}）× ${p.count}`).join('、');
    addAgentMsg(
      `📦 平台尺寸包已就绪：${lines}，共 <b>${resp.fileCount}</b> 张。` +
      `<a href="${resp.url}">下载 zip</a>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`平台尺寸包没打成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── A/B 测试：同一张图多风格变体并排对比，点谁谁上位 ── */
async function runAbTest(img) {
  if (S.generating) return;
  const id = img.id || img.scene_id;
  const th = addThinking('正在生成 A/B 风格变体（原方向 / 暖调 / 明快）…');
  let resp;
  try {
    resp = await postJson('/api/commerce-agent/ab-test', {
      csrf_token: S.csrf, sessionId: S.sid, imageId: id, variants: 3,
    });
  } catch (e) {
    th.remove();
    addAgentMsg(`A/B 测试没启动（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
    return;
  }

  const card = document.createElement('div');
  card.className = 'plan-card ab-card';
  card.innerHTML = `<div class="pc-head"><span class="pc-check">🧪</span> A/B 测试 · ${esc(img.title || id)} — 点「选这版」替换正式图</div>
    <div class="pc-body"><div class="ab-row" style="display:flex;gap:12px;flex-wrap:wrap"></div></div>`;
  const row = card.querySelector('.ab-row');
  const slots = {};
  (resp.variants || []).forEach(v => {
    const slot = document.createElement('div');
    slot.style.cssText = 'flex:1;min-width:150px;max-width:220px;text-align:center';
    slot.innerHTML = `<div class="ab-img" style="aspect-ratio:1;border-radius:12px;background:#F4F4F8;display:flex;align-items:center;justify-content:center;overflow:hidden"><div class="it-spinner"></div></div>
      <div style="font-size:12px;color:#8B8B9A;margin:6px 0 4px">方案 ${esc(v.label)} · ${esc(v.labelCn)}</div>`;
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
    s.slot.querySelector('.ab-img').innerHTML = '<span style="font-size:12px;color:#8B8B9A">生成失败</span>';
  });
}

function fillAbSlot(s, im, img, imageId, card) {
  s.filled = true;
  const box = s.slot.querySelector('.ab-img');
  box.innerHTML = `<img src="${thumbUrl(im.url)}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in">`;
  box.querySelector('img').onclick = () => openLightbox(im.url);
  const pick = document.createElement('button');
  pick.textContent = '选这版';
  pick.style.cssText = 'padding:6px 18px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px';
  pick.onclick = async () => {
    try {
      const r = await postJson('/api/commerce-agent/ab-pick', {
        csrf_token: S.csrf, sessionId: S.sid, imageId, winnerSceneId: im.sceneId,
      });
      setTileImage(img.scene_id, r.url, img);
      card.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '.4'; });
      pick.textContent = '✓ 已上位';
      pick.style.opacity = '1';
      addAgentMsg(`🧪 已把方案 ${esc(s.v.label)} 设为正式图，这个方向也记入了你的偏好。`, { noPersist: true });
    } catch (e) {
      addAgentMsg(`替换没成功（${esc(e.message)}），再点一次试试。`, { noPersist: true });
    }
  };
  s.slot.appendChild(pick);
}

/* ── 多语言一键出海包（本地化文案 + 多语种主图 + zip）── */
const LOCALE_MARKETS = [
  ['us', '🇺🇸 美国'], ['uk', '🇬🇧 英国'], ['de', '🇩🇪 德国'], ['fr', '🇫🇷 法国'],
  ['es', '🇪🇸 西语区'], ['jp', '🇯🇵 日本'], ['kr', '🇰🇷 韩国'], ['sa', '🇸🇦 中东'],
  ['sea', '🌏 东南亚'],
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
  go.textContent = '生成出海包';
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
  const th = addThinking('正在生成各市场本地化文案并排版多语种主图…');
  try {
    const resp = await postJson('/api/commerce-agent/localized-pack', {
      csrf_token: S.csrf, sessionId: S.sid, markets,
    });
    th.remove();
    const lines = (resp.markets || [])
      .map(m => `<b>${esc(m.marketName)}</b>：${esc(m.headline)}（CTA: ${esc(m.cta)}）${m.rtl ? ' · RTL' : ''}`)
      .join('<br>');
    addAgentMsg(
      `🌍 出海包已就绪（文案来源：${esc(resp.source)}）：<br>${lines}<br>` +
      `每个市场含多语种文案 copy.json + 本地化主图。<a href="${resp.url}">下载 zip</a>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`出海包没生成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 上架前合规体检（白底/占比/分辨率/宽高比/体积）── */
async function runComplianceCheck() {
  const th = addThinking('正在按平台上架规则逐图体检（白底/产品占比/分辨率/体积）…');
  try {
    const resp = await postJson('/api/commerce-agent/compliance', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const bad = (resp.images || []).filter(im => !im.passed);
    let html = `🩺 合规体检完成：<b>${resp.passed}/${resp.totalChecks}</b> 项通过` +
      `（平台：${(resp.platforms || []).join('、')}）。`;
    if (!bad.length) {
      html += ' 全部图片可直接上架 ✅';
    } else {
      html += `<br>有 <b>${bad.length}</b> 张图存在风险：`;
      html += bad.map(im => {
        const issues = im.checks.filter(c => !c.passed)
          .map(c => `<li><b>${esc(c.platformName)}</b>：${c.issues.map(esc).join('；')}</li>`)
          .join('');
        return `<div style="margin-top:6px"><b>${esc(im.imageId)}</b><ul style="margin:4px 0 0 18px">${issues}</ul></div>`;
      }).join('');
      html += '<br>💡 白底/占比问题可以对该图说「重生成这张，纯白背景、产品占比更大」。';
    }
    addAgentMsg(html, { noPersist: true });
  } catch (e) {
    th.remove();
    addAgentMsg(`合规体检没跑成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 🖌️ 圈选精准改图：框住区域 + 一句话，只改框内 ── */
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
  row.innerHTML = `<input class="ip-text" placeholder="框住要改的区域，然后说改成什么样，如「把这里的杯子换成蓝色」" style="flex:1;padding:10px 14px;border-radius:12px;border:none;font-size:13px">
    <button class="ip-go" style="padding:10px 22px;border-radius:99px;background:#7A67FF;color:#fff;font-size:13px;font-weight:700">🖌️ 只改这里</button>`;
  const hint = document.createElement('div');
  hint.style.cssText = 'color:#fff;font-size:12.5px;opacity:.8';
  hint.textContent = '💡 拖动框选区域（不框则按指令里的方位词，如「左上角」自动定位）；框外像素保持不动';
  lb.append(box, row, hint);
  lb.onclick = e => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
  row.querySelector('.ip-text').focus();

  row.querySelector('.ip-go').onclick = async () => {
    const instruction = row.querySelector('.ip-text').value.trim();
    if (!instruction) { row.querySelector('.ip-text').focus(); return; }
    if (rect && (rect[2] < 0.02 || rect[3] < 0.02)) rect = null;
    lb.remove();
    const th = addThinking('正在只重绘你圈的区域，其余像素保持不动…');
    try {
      const resp = await postJson('/api/commerce-agent/inpaint', {
        csrf_token: S.csrf, sessionId: S.sid,
        imageId: img.scene_id || img.id, instruction, rect: rect || undefined,
      });
      th.remove();
      setTileImage(img.scene_id, resp.url, img);
      addAgentMsg(
        `🖌️ 局部改图完成${resp.mocked ? '（演示模式：未配置生图 Key，实际未修改）' : ''}` +
        `——只动了${rect ? '你圈选的区域' : '指令定位的区域'}，其余保持原样。不满意可再圈再改。`,
        { noPersist: true },
      );
    } catch (e) {
      th.remove();
      addAgentMsg(`局部改图没成功（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
    }
  };
}

/* ── Before/After 对比滑块（原图 vs 成图，拖动看蜕变）── */
async function openCompare(img, generatedUrl) {
  if (!S.originalsCache) {
    try {
      const r = await fetch(`/api/originals/${S.sid}`);
      S.originalsCache = (await r.json()).originals || [];
    } catch (_) { S.originalsCache = []; }
  }
  const orig = S.originalsCache[0];
  if (!orig) {
    addAgentMsg('这个会话没有找到原始上传图，没法对比——直接欣赏成图吧 🙂', { noPersist: true });
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
    `<span style="position:absolute;top:12px;left:12px;padding:4px 12px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:700">📷 原图</span>` +
    `<span style="position:absolute;top:12px;right:12px;padding:4px 12px;border-radius:99px;background:rgba(122,103,255,.85);color:#fff;font-size:12px;font-weight:700">✨ AI 成图</span>`;
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
  hint.textContent = `${img.title || ''} — 拖动滑块看「实拍 → 广告大片」的蜕变`;
  lb.append(box, slider, hint);
  lb.onclick = (e) => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
}

/* ── 🔭 竞品监控：清单管理 + 按需周报 ── */
async function openCompetitorWatch() {
  let watches = [];
  try {
    watches = (await (await fetch('/api/commerce-agent/competitor-watch')).json()).watches || [];
  } catch (_) { /* 列表拉不到也照常展示管理卡 */ }

  const card = document.createElement('div');
  card.className = 'plan-card';
  const rows = watches.map(w =>
    `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(w.url)}">🔗 ${esc(w.name || w.url)}</span>
      <button data-del="${esc(w.url)}" style="padding:2px 10px;border-radius:99px;background:#FBEAEA;color:#C0392B;font-size:11.5px">移除</button>
    </div>`).join('') || '<div style="font-size:12.5px;color:#8B8B9A;padding:4px 0">还没有监控任何竞品，贴一个链接开始。</div>';
  card.innerHTML = `<div class="pc-head"><span class="pc-check">🔭</span> 竞品监控（${watches.length}/10）</div>
    <div class="pc-body">${rows}
      <div style="display:flex;gap:8px;margin-top:8px">
        <input class="cw-url" placeholder="粘贴竞品商品链接 https://…" style="flex:1;padding:8px 12px;border:1px solid #ECECF4;border-radius:10px;font-size:12.5px">
        <button class="cw-add" style="padding:8px 16px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px">添加</button>
        <button class="cw-report" style="padding:8px 16px;border-radius:99px;background:#22AA6E;color:#fff;font-size:12.5px">📋 生成周报</button>
      </div></div>`;
  card.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    try {
      await postJson('/api/commerce-agent/competitor-watch', {
        csrf_token: S.csrf, action: 'remove', url: b.dataset.del,
      });
      card.remove(); openCompetitorWatch();
    } catch (e) { addAgentMsg(`移除失败（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelector('.cw-add').onclick = async () => {
    const url = card.querySelector('.cw-url').value.trim();
    if (!url) return;
    try {
      await postJson('/api/commerce-agent/competitor-watch', {
        csrf_token: S.csrf, action: 'add', url,
      });
      card.remove(); openCompetitorWatch();
    } catch (e) { addAgentMsg(`添加失败（${esc(e.message)}）。`, { noPersist: true }); }
  };
  card.querySelector('.cw-report').onclick = () => runCompetitorReport();
  chatInner().appendChild(card);
  hideEmpty();
  scrollBottom();
}

async function runCompetitorReport() {
  const th = addThinking('正在逐个抓取竞品页，比对主图与标题变化…');
  try {
    const resp = await postJson('/api/commerce-agent/competitor-report', {
      csrf_token: S.csrf,
    });
    th.remove();
    const rows = (resp.items || []).map(it => {
      const status = !it.ok ? `<span style="color:#E2A44A">⚠️ ${esc(it.note || '抓取失败')}</span>`
        : it.changes.length ? it.changes.map(c => `<span style="color:#E24A4A">🔔 ${esc(c)}</span>`).join('<br>')
        : `<span style="color:#22AA6E">✓ 无变化${it.note ? '（' + esc(it.note) + '）' : ''}</span>`;
      return `<div style="padding:6px 0;border-bottom:1px dashed #ECECF4"><b>${esc(it.name)}</b><br><small>${status}</small></div>`;
    }).join('');
    addAgentMsg(
      `🔭 <b>竞品监控报告</b>（${(resp.items || []).length} 个竞品，${resp.changedCount} 个有动作）：<br>${rows}` +
      `${resp.changedCount ? '<br>💡 竞品有新动作时，可以对我说「参考这个方向出一版」。' : ''}`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`竞品报告没跑成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 🚀 新品池：20 个新品位 + FBA 上新计划 ── */
const POOL_STATUSES = ['候选', '开发中', '打样中', '待上架', '已上架'];

async function openProductPool() {
  let data = { items: [], total: 0, capacity: 20 };
  try {
    data = await (await fetch('/api/commerce-agent/product-pool')).json();
  } catch (_) { /* 拉不到也展示空池 */ }

  const card = document.createElement('div');
  card.className = 'plan-card';
  const rows = (data.items || []).map(it => {
    const fba = it.fba || {};
    const opts = POOL_STATUSES.map(s =>
      `<option ${s === it.status ? 'selected' : ''}>${s}</option>`).join('');
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12.5px;border-bottom:1px dashed #ECECF4">
      <span style="flex:1"><b>${esc(it.name)}</b>${it.category ? ` <small style="color:#8B8B9A">· ${esc(it.category)}</small>` : ''}
        ${fba.launchDate ? `<small style="display:block;color:#7A67FF">🚀 FBA ${esc(fba.launchDate)} · 首批 ${fba.firstBatchUnits || '?'} 件</small>` : ''}</span>
      <select data-status="${it.id}" style="padding:3px 6px;border-radius:8px;border:1px solid #ECECF4;font-size:11.5px">${opts}</select>
      <button data-fba="${it.id}" style="padding:2px 8px;border-radius:99px;background:#F1EDFF;color:#5A48E0;font-size:11.5px">FBA</button>
      <button data-del="${it.id}" style="padding:2px 8px;border-radius:99px;background:#FBEAEA;color:#C0392B;font-size:11.5px">删</button>
    </div>`;
  }).join('') || '<div style="font-size:12.5px;color:#8B8B9A;padding:4px 0">池子还是空的，把候选新品加进来。</div>';

  card.innerHTML = `<div class="pc-head"><span class="pc-check">🚀</span> 新品池（${data.total}/${data.capacity}）— 7 月底 FBA 扶持窗口</div>
    <div class="pc-body">${rows}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <input class="pp-name" placeholder="新品名称" style="flex:2;min-width:120px;padding:8px 12px;border:1px solid #ECECF4;border-radius:10px;font-size:12.5px">
        <input class="pp-cat" placeholder="类目" style="flex:1;min-width:70px;padding:8px 12px;border:1px solid #ECECF4;border-radius:10px;font-size:12.5px">
        <button class="pp-add" style="padding:8px 16px;border-radius:99px;background:#7A67FF;color:#fff;font-size:12.5px">添加</button>
        <a href="/api/commerce-agent/product-pool/csv" style="padding:8px 16px;border-radius:99px;background:#22AA6E;color:#fff;font-size:12.5px;text-decoration:none">📋 导出计划 CSV</a>
      </div></div>`;

  const refresh = () => { card.remove(); openProductPool(); };
  card.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'remove', id: b.dataset.del,
      });
      refresh();
    } catch (e) { addAgentMsg(`删除失败（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => {
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'update', id: sel.dataset.status,
        patch: { status: sel.value },
      });
    } catch (e) { addAgentMsg(`状态没改成（${esc(e.message)}）。`, { noPersist: true }); }
  });
  card.querySelectorAll('[data-fba]').forEach(b => b.onclick = async () => {
    const date = prompt('FBA 目标上架日（如 2026-07-25）：', '2026-07-25');
    if (date === null) return;
    const units = prompt('首批发货量（件）：', '100');
    if (units === null) return;
    try {
      await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'update', id: b.dataset.fba,
        patch: { fba: { launchDate: date, firstBatchUnits: parseInt(units, 10) || 0 } },
      });
      refresh();
    } catch (e) { addAgentMsg(`FBA 计划没存上（${esc(e.message)}）。`, { noPersist: true }); }
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
    } catch (e) { addAgentMsg(`添加失败（${esc(e.message)}）。`, { noPersist: true }); }
  };
  chatInner().appendChild(card);
  hideEmpty();
  scrollBottom();
}

/* ── 🛒 一键铺货包：文案 + 图片一次交付 ── */
async function createListingPack() {
  const th = addThinking('正在写标题、五点描述和关键词，连图一起打包…');
  try {
    const resp = await postJson('/api/commerce-agent/listing-pack', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const bullets = (resp.bullets || []).map(b => `<li>${esc(b)}</li>`).join('');
    const platTitles = (resp.platformTitles || []).map(t =>
      `<small style="display:block">${t.passed ? '✅' : '⚠️'} <b>${esc(t.platform)}</b>：${esc(t.title)}（${t.title.length} 字符）</small>`).join('');
    addAgentMsg(
      `🛒 <b>铺货包已就绪</b>（${resp.source === 'llm' ? 'AI 撰写' : '模板初稿'}，含 ${resp.imageCount} 张图 + listing.csv/json）：<br>` +
      `<b>标题：</b>${esc(resp.title)}<br>` +
      `${platTitles ? `<b>各平台 ≤75 字符版：</b><br>${platTitles}` : ''}` +
      `<b>五点描述：</b><ul style="margin:4px 0 4px 18px">${bullets}</ul>` +
      `<b>关键词：</b><small>${(resp.keywords || []).map(esc).join('、')}</small><br>` +
      `<a href="${resp.url}">下载铺货包 zip</a> — 图片和文案直接复制上架`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`铺货包没打成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 📈 主图点击率预估：谁更能被点开，排个座次 ── */
async function runCtrScore() {
  const th = addThinking('正在按买家"扫一眼"的视角评估每张图的点击吸引力…');
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
        `<span style="color:${color};font-weight:700">${im.score == null ? '—' : im.score + ' 分'}</span>` +
        `${why ? `<br><small>${esc(why)}</small>` : ''}${tip}</div>`;
    }).join('');
    addAgentMsg(
      `📈 <b>点击率预估</b>（主体占比/居中/对比/清晰度/背景干净度综合）：<br>${rows}<br>` +
      `<small style="color:#8B8B9A">建议把 🥇 设为平台主图；分低的图可点「🔄」按提示重生。</small>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`点击率预估没跑成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
  }
}

/* ── 📖 品牌画册：整套成图拼成杂志级分享页 ── */
async function createAlbum() {
  const th = addThinking('正在把整套图排版成品牌画册…');
  try {
    const resp = await postJson('/api/commerce-agent/album', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    addAgentMsg(
      `📖 品牌画册已排好版 — 杂志级封面+全套作品集，` +
      `<a href="${resp.url}" target="_blank">点击打开</a>，直接转发链接给客户/合伙人，体面感拉满 ✨`,
      { noPersist: true },
    );
    window.open(resp.url, '_blank');
  } catch (e) {
    th.remove();
    addAgentMsg(`画册没排成（${esc(e.message)}），稍后再试一次。`, { noPersist: true });
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
  const timing = elapsed ? `耗时 ${Math.round(elapsed)} 秒，` : '';
  const saved = doneCount > 0
    ? `${timing}按棚拍单张 ¥200~500 计，这轮大约帮你省下 <b>¥${(doneCount * 350).toLocaleString()}</b>。`
    : '';
  bar.innerHTML = `<span>✨ 本轮完成 <b>${doneCount}/${total}</b> 张。${saved}想调整任何一张，直接说「第几张怎么改」。</span>
    <a href="javascript:void(0)" data-act="full-service" style="font-weight:700">🚀 一键交付</a>
    <a href="/api/download/${S.sid}">📥 下载全部 (ZIP)</a>
    <a href="javascript:void(0)" data-act="hd-pack">🖼️ 高清包 (1K~18K)</a>
    <a href="javascript:void(0)" data-act="platform-pack">📦 平台尺寸包</a>
    <a href="javascript:void(0)" data-act="compliance">🩺 上架前体检</a>
    <a href="javascript:void(0)" data-act="ctr">📈 点击率预估</a>
    <a href="javascript:void(0)" data-act="listing">🛒 铺货包</a>
    <a href="javascript:void(0)" data-act="localize">🌍 出海包</a>
    <a href="javascript:void(0)" data-act="album">📖 品牌画册</a>`;
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
