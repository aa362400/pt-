/* ============================================================
 * textstatusenglish_text — textyesenglish_text（text script english_text）
 * english_text：intent.js → state.js → api.js → render.js → upload.js
 *           → flows.js → session.js → boot.js
 * ============================================================ */

const S = {
  sid: '',
  csrf: '',
  busy: false,
  hasProduct: false,          // english_textyesnotextyesenglish_text
  productProfile: null,       // backendenglish_text
  attachments: [],            // english_text File
  images: [],                 // english_text（backend plan english_text images）
  cards: {},                  // scene_id -> tile DOM
  quality: 'standard',
  thinkMode: localStorage.getItem('xagent_think_mode') === '1',  // MAX english_text
  lastParsed: null,           // english_text（text「text N english_text」）
  tracking: false,            // yesnotextyesenglish_text
  generating: false,          // yesnoyestextgenerationenglish_text（english_text）
  feedback: {},               // imageId -> 'like' | 'dislike'（english_text）
};

const MAX_UPLOAD_MB = 15;
const MAX_UPLOAD_COUNT = 9;

const $ = id => document.getElementById(id);
const chatInner = () => $('chatInner');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function esc(t) { return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fmtTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function hideEmpty() { const e = $('emptyState'); if (e) e.style.display = 'none'; }

function scrollBottom() {
  const sc = $('chatScroll');
  requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
}

function updateSendButtonState() {
  const btn = $('btnSend');
  const input = $('promptInput');
  if (!btn || !input) return;
  const inactive = !input.value.trim() && !S.attachments.length;
  btn.classList.toggle('is-disabled', inactive);
  btn.setAttribute('aria-disabled', inactive ? 'true' : 'false');
}
