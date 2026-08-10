/* ════════════════ english_text（english_text + english_text）════════════════ */

const { parseEditCommand, parsePreciseEdit, looksLikeImageRequest } = window.AgentIntent;

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

/* english_text：english_text/english_text */
function on(id, evt, fn) {
  const el = $(id);
  if (!el) { console.warn('[init] english_text #' + id); return; }
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
  bar.textContent = 'english_text：' + message + '（text Ctrl+F5 english_text；textyesenglish_text）';
}

window.addEventListener('error', e => showFatal(e.message || 'texterror'));

(async function init() {
  try {
    await fetchCsrf().catch(() => {});
    const saved = localStorage.getItem('xagent_current_sid');
    if (saved) {
      await loadSession(saved).catch(() => newSession());
    } else {
      newSession();
    }
  } catch (e) { console.warn('[init] english_textfailed', e); }

  // input
  const input = $('promptInput');
  if (input) {
    input.addEventListener('input', () => { autoGrow(input); updateSendButtonState(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }
  updateSendButtonState();
  on('btnSend', 'click', handleSend);

  // english_text：text / text / text
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

  // english_text
  document.querySelectorAll('.chip[data-fill]').forEach(c => {
    c.addEventListener('click', () => {
      if (!input) return;
      input.value = c.dataset.fill; autoGrow(input); input.focus();
    });
  });

  // english_text
  on('toolInspiration', 'click', () => {
    addAgentMsg('💡 english_text：english_text <i>“english_text 5 text Temu textlistingtext”</i> text <i>“text Etsy english_text”</i>——english_text，textalltext，english_text。', { noPersist: true });
  });
  on('toolCompetitor', 'click', () => openCompetitorWatch());
  on('toolPool', 'click', () => openProductPool());
  on('toolAssets', 'click', async () => {
    let usageLine = '';
    try {
      const u = await (await fetch('/api/commerce-agent/usage/' + S.sid)).json();
      if (u.rounds > 0) {
        usageLine = `<br>📊 english_textgeneration <b>${u.images}</b> text / ${u.rounds} text，english_text ${Math.round(u.seconds)} text。`;
      }
    } catch (e) { /* english_textfailedenglish_text */ }
    addAgentMsg(`🗂️ english_text：<a href="/api/download/${S.sid}">textallgenerationtext (ZIP)</a>。english_textautomaticenglish_text。${usageLine}`, { noPersist: true });
  });

  // text
  on('btnNewChat', 'click', newSession);
  on('tbTitle', 'click', newSession);
  on('btnToggleSidebar', 'click', () => $('sidebar').classList.toggle('open'));
  on('btnHistory', 'click', () => $('sidebar').classList.toggle('open'));
  on('btnDocs', 'click', () => {
    addAgentMsg(
      '📖 <b>english_text：</b><br>1️⃣ english_text（text / text / Ctrl+V text）<br>2️⃣ english_text：<i>“english_text 5 english_textlistingtext，text Etsy”</i><br>3️⃣ textautomaticenglish_text<br>4️⃣ english_text：<i>“text 2 english_text”</i>，english_text / english_text / english_text / text',
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
  // MAX english_text（english_text，english_text）
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
      ? '🧠 english_text <b>MAX english_text</b>：english_text/text（responseenglish_text，english_text）。'
      : 'english_text，responsetext。', { noPersist: true });
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
