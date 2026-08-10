/* ════════════════ text（text / text / text english_text）════════════════ */

function clearAttachments() {
  S.attachments = [];
  $('attachPreview').innerHTML = '';
  updateSendButtonState();
}

function addAttachments(files) {
  const problems = [];
  [...files].forEach(f => {
    if (!f.type.startsWith('image/')) { problems.push(`「${f.name}」textyesimagefile`); return; }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { problems.push(`「${f.name}」text ${MAX_UPLOAD_MB}MB`); return; }
    if (S.attachments.length >= MAX_UPLOAD_COUNT) { problems.push(`english_text ${MAX_UPLOAD_COUNT} text`); return; }
    S.attachments.push(f);
  });
  if (problems.length) {
    addAgentMsg(`yestextfileenglish_text：${esc(problems.join('；'))}。text jpg / png / webp，text ≤ ${MAX_UPLOAD_MB}MB。`, { noPersist: true });
  }
  renderAttachPreview();
}

function renderAttachPreview() {
  const wrap = $('attachPreview');
  wrap.innerHTML = '';
  S.attachments.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'ap-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    const x = document.createElement('button');
    x.className = 'ap-x'; x.textContent = '×';
    x.onclick = () => { S.attachments.splice(i, 1); renderAttachPreview(); updateSendButtonState(); };
    item.appendChild(img); item.appendChild(x);
    wrap.appendChild(item);
  });
  updateSendButtonState();
}
