/* ════════════════ 初始化（事件绑定 + 首屏恢复）════════════════ */

const { parseEditCommand, parsePreciseEdit, looksLikeImageRequest } = window.AgentIntent;

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

/* 防御式绑定：单个元素缺失/报错不影响其他按钮 */
function on(id, evt, fn) {
  const el = $(id);
  if (!el) { console.warn('[init] 缺少元素 #' + id); return; }
  el.addEventListener(evt, fn);
}

function showFatal(message) {
  let bar = document.getElementById('fatalBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'fatalBar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#FFB25B;color:#4a2f00;font-size:13px;padding:8px 16px;text-align:center';
    document.body.appendChild(bar);
  }
  bar.textContent = '页面脚本出错：' + message + '（请按 Ctrl+F5 强制刷新；仍有问题请反馈这行文字）';
}

window.addEventListener('error', e => showFatal(e.message || '未知错误'));

(async function init() {
  try {
    await fetchCsrf().catch(() => {});
    const saved = localStorage.getItem('xagent_current_sid');
    if (saved) {
      await loadSession(saved).catch(() => newSession());
    } else {
      newSession();
    }
  } catch (e) { console.warn('[init] 会话恢复失败', e); }

  // 输入
  const input = $('promptInput');
  if (input) {
    input.addEventListener('input', () => { autoGrow(input); updateSendButtonState(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }
  updateSendButtonState();
  on('btnSend', 'click', handleSend);

  // 附件三通道：选择 / 拖拽 / 粘贴
  const pickFile = () => { const f = $('fileInput'); if (f) f.click(); };
  on('btnAttach', 'click', pickFile);
  on('btnHeroUpload', 'click', pickFile);
  on('chipUpload', 'click', pickFile);
  on('toolUpload', 'click', pickFile);
  on('fileInput', 'change', e => { addAttachments(e.target.files); e.target.value = ''; });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) addAttachments(e.dataTransfer.files);
  });
  document.addEventListener('paste', e => {
    const items = [...(e.clipboardData && e.clipboardData.items || [])];
    const files = items.filter(it => it.kind === 'file' && it.type.startsWith('image/'))
                       .map(it => it.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addAttachments(files); }
  });

  // 快捷按钮
  document.querySelectorAll('.chip[data-fill]').forEach(c => {
    c.addEventListener('click', () => {
      if (!input) return;
      input.value = c.dataset.fill; autoGrow(input); input.focus();
    });
  });

  // 智能工具
  on('toolInspiration', 'click', () => {
    addAgentMsg('💡 爆款灵感这样用：直接告诉我 <i>“帮我出 5 张 Temu 爆款上架图”</i> 或 <i>“参考 Etsy 热卖结构出一套”</i>——我只学爆款的结构与点击逻辑，画面全部原创，不会侵权。', { noPersist: true });
  });
  on('toolCompetitor', 'click', () => openCompetitorWatch());
  on('toolPool', 'click', () => openProductPool());
  on('toolAssets', 'click', async () => {
    let usageLine = '';
    try {
      const u = await (await fetch('/api/commerce-agent/usage/' + S.sid)).json();
      if (u.rounds > 0) {
        usageLine = `<br>📊 本会话已生成 <b>${u.images}</b> 张 / ${u.rounds} 轮，累计耗时 ${Math.round(u.seconds)} 秒。`;
      }
    } catch (e) { /* 用量查询失败不影响展示 */ }
    addAgentMsg(`🗂️ 本会话素材：<a href="/api/download/${S.sid}">下载全部生成图 (ZIP)</a>。上传的产品图会自动归档为本会话素材。${usageLine}`, { noPersist: true });
  });

  // 顶栏
  on('btnNewChat', 'click', newSession);
  on('tbTitle', 'click', newSession);
  on('btnToggleSidebar', 'click', () => $('sidebar').classList.toggle('open'));
  on('btnHistory', 'click', () => $('sidebar').classList.toggle('open'));
  on('btnDocs', 'click', () => {
    addAgentMsg(
      '📖 <b>怎么用我：</b><br>1️⃣ 上传产品图（选择 / 拖拽 / Ctrl+V 都行）<br>2️⃣ 一句话说需求：<i>“帮我出 5 张宠物纪念礼物上架图，适合 Etsy”</i><br>3️⃣ 我自动规划套图结构并逐张出图<br>4️⃣ 对任何一张说：<i>“第 2 张更温馨一点”</i>，或鼠标悬停单张重做 / 换风格 / 加文案 / 下载',
      { noPersist: true },
    );
  });
  on('btnSettings', 'click', () => { const p = $('settingsPop'); if (p) p.hidden = !p.hidden; });
  on('segQuality', 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('segQuality').querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    S.quality = b.dataset.v;
  });
  // MAX 思考模式（记住选择，跨会话生效）
  const segThink = $('segThink');
  if (segThink && S.thinkMode) {
    segThink.querySelectorAll('button').forEach(x =>
      x.classList.toggle('on', x.dataset.v === '1'));
  }
  on('segThink', 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    segThink.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    S.thinkMode = b.dataset.v === '1';
    localStorage.setItem('xagent_think_mode', S.thinkMode ? '1' : '0');
    addAgentMsg(S.thinkMode
      ? '🧠 已开启 <b>MAX 思考模式</b>：我会做更深的策略推演再回答/规划（响应会慢一点，但更透彻）。'
      : '已切回标准思考模式，响应更快。', { noPersist: true });
  });
  document.addEventListener('click', e => {
    const p = $('settingsPop');
    if (p && !p.hidden && !p.contains(e.target) && e.target.id !== 'btnSettings') p.hidden = true;
    const sidebar = $('sidebar');
    const hitTopbarMenu = e.target.closest && e.target.closest('#btnToggleSidebar,#btnHistory');
    if (sidebar && window.innerWidth <= 900 && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && !hitTopbarMenu) {
      sidebar.classList.remove('open');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const p = $('settingsPop');
    if (p) p.hidden = true;
    const sidebar = $('sidebar');
    if (sidebar) sidebar.classList.remove('open');
    document.querySelectorAll('.lightbox,.style-menu,.prompt-editor-mask').forEach(n => n.remove());
  });
})().catch(e => showFatal(e && e.message || String(e)));
