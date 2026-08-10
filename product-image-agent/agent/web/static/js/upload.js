/* ════════════════ 附件（选择 / 拖拽 / 粘贴 三通道）════════════════ */

function clearAttachments() {
  S.attachments = [];
  $('attachPreview').innerHTML = '';
  updateSendButtonState();
}

function addAttachments(files) {
  const problems = [];
  [...files].forEach(f => {
    if (!f.type.startsWith('image/')) { problems.push(`「${f.name}」不是图片文件`); return; }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { problems.push(`「${f.name}」超过 ${MAX_UPLOAD_MB}MB`); return; }
    if (S.attachments.length >= MAX_UPLOAD_COUNT) { problems.push(`一次最多 ${MAX_UPLOAD_COUNT} 张`); return; }
    S.attachments.push(f);
  });
  if (problems.length) {
    addAgentMsg(`有些文件我收不了：${esc(problems.join('；'))}。支持 jpg / png / webp，单张 ≤ ${MAX_UPLOAD_MB}MB。`, { noPersist: true });
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
