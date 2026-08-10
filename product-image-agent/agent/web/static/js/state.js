/* ============================================================
 * 全局状态与基础工具 — 所有模块共享（经典 script 全局作用域）
 * 加载顺序：intent.js → state.js → api.js → render.js → upload.js
 *           → flows.js → session.js → boot.js
 * ============================================================ */

const S = {
  sid: '',
  csrf: '',
  busy: false,
  hasProduct: false,          // 会话里是否已有产品图
  productProfile: null,       // 后端分析出的产品档案
  attachments: [],            // 待发送的 File
  images: [],                 // 当前一轮套图计划（后端 plan 返回的 images）
  cards: {},                  // scene_id -> tile DOM
  quality: 'standard',
  thinkMode: localStorage.getItem('xagent_think_mode') === '1',  // MAX 思考模式
  lastParsed: null,           // 上一轮识别结果（支持「再出 N 张同风格」）
  tracking: false,            // 是否已有出图轮询在后台进行
  generating: false,          // 是否有整批生成在后台进行（期间聊天不受限）
  feedback: {},               // imageId -> 'like' | 'dislike'（下一轮规划注入偏好）
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
