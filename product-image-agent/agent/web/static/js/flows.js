/* ════════════════ textflow ════════════════ */

function handleSend() {
  const input = $('promptInput');
  const text = input.value.trim();
  const files = [...S.attachments];
  if (!text && !files.length) return;

  input.value = '';
  autoGrow(input);
  clearAttachments();
  updateSendButtonState();

  const imgUrls = files.map(f => URL.createObjectURL(f));
  addUserMsg(text || '📷 english_text', imgUrls);

  // flowenglish_text，english_text：generation/english_text
  const job = async () => {
    if (files.length) {
      await flowUpload(files, text);
      return;
    }
    const precise = parsePreciseEdit(text);
    const edit = parseEditCommand(text);
    if (precise && S.images.length) {
      await flowPreciseEdit(text);
    } else if (edit && S.images.length) {
      await flowEdit(edit);
    } else if (looksLikeImageRequest(text)) {
      if (S.generating) {
        addAgentMsg('english_textgenerationtext，english_text——english_text「generation」english_text；english_text、text、english_text。', { noPersist: true });
        return;
      }
      await flowGenerate(text);
    } else {
      await flowChat(text);
    }
  };
  job().catch(e => {
    addAgentMsg(`english_text（${esc(e.message)}），english_text，english_text。`);
  });
}

/* ── english_text：automaticenglish_text（textfailedenglish_text）── */
async function flowUpload(files, text) {
  const th = addThinking('english_text…');
  try {
    await apiChat({ message: '', images: files });
  } catch (e) {
    th.remove();
    addAgentMsg(
      `imageenglish_textsuccess（${esc(e.message)}）。<br>` +
      `text：① english_textimage<b>english_text</b>；② <b>Ctrl+V text</b>text；③ text 📎 english_text。imageenglish_text ${MAX_UPLOAD_MB}MB。`
    );
    return;
  }
  S.hasProduct = true;

  // automaticenglish_text（textfailedenglish_text）
  let profile = null;
  let analysisReply = '';
  try {
    const resp = await apiChat({ message: 'english_text' });
    if (resp.status === 'task_dispatched') {
      th.querySelector('span:last-child').textContent = 'english_textplatform、english_textlistingenglish_text…';
      const done = await pollTask();
      profile = done.profile || null;
      analysisReply = done.message || done.final_reply || '';
      if (analysisReply === 'completed') analysisReply = '';
    } else if (resp.reply) {
      analysisReply = resp.reply;
    }
  } catch (e) { /* english_textfailed */ }
  th.remove();
  S.productProfile = profile;

  if (analysisReply) {
    // english_textrealtextreply（LLM/textgeneration），english_text
    addAgentMsg(formatAgentReplyHtml(analysisReply));
  } else {
    const name = profile && (profile.product_name_cn || profile.product_name) || 'english_text';
    const cat = profile && (profile.category_cn || profile.category) || '';
    addAgentMsg(
      `english_text：<b>${esc(name)}</b>${cat ? `（${esc(cat)}）` : ''}。<br>` +
      `english_text：<b>english_text、english_textplatform、english_text</b>，english_textlistingtext。`
    );
  }
  renderHistory();

  // english_text → english_text
  if (text && looksLikeImageRequest(text)) {
    await flowGenerate(text);
  }
}

/* ── textflow：english_text → text → text → english_text ── */
async function flowGenerate(text) {
  if (!S.hasProduct) {
    // textyesenglish_text：textbackend LLM english_text
    // （backendstatusenglish_text，LLM english_textreplyenglish_text、english_text）
    await flowChat(text);
    return;
  }

  // 1. text（english_text）
  const th1 = addThinking('english_textplatform、english_textimagetext。');
  let parsed;
  try {
    parsed = await postJson('/api/commerce-agent/parse', { message: text, sessionId: S.sid });
  } finally { th1.remove(); }

  // 「text N english_text」：english_textplatform、english_textscene
  if (S.lastParsed) {
    const sameStyle = /english_text|english_text?text|english_text?text|english_text/.test(text);
    if (!parsed.platformExplicit && S.lastParsed.platformExplicit) {
      parsed.platforms = S.lastParsed.platforms;
      parsed.platform = S.lastParsed.platform;
      parsed.platformExplicit = true;
    }
    if (sameStyle) {
      if (!parsed.audienceId && S.lastParsed.audienceId) {
        parsed.audienceId = S.lastParsed.audienceId;
        parsed.audience = S.lastParsed.audience;
      }
      if (!parsed.occasionId && S.lastParsed.occasionId) {
        parsed.occasionId = S.lastParsed.occasionId;
        parsed.giftScene = S.lastParsed.giftScene;
      }
      parsed.isGift = parsed.isGift || S.lastParsed.isGift;
    }
  }
  S.lastParsed = parsed;

  // 2. text（english_text：LLM textrealenglish_text，templatetext）
  const th2 = addThinking('english_text。');
  let plan;
  try {
    plan = await postJson('/api/commerce-agent/plan', {
      parsed, sessionId: S.sid, thinkMode: S.thinkMode,
    });
  } finally { th2.remove(); }

  // 3. english_textreply（english_text LLM english_text，templateenglish_text）+ imagetext + english_text
  const sceneWord = parsed.giftScene || parsed.productType || 'text';
  const creative = plan.strategy.creativeDirection
    ? `<br>english_text：<b>${esc(plan.strategy.creativeDirection)}</b>。`
    : '';
  addAgentMsg(
    `english_text，textgeneration <b>${plan.images.length} text</b>text <b>${esc(plan.strategy.platform)}</b> text` +
    `${esc(sceneWord)}listingtext，text${esc(plan.strategy.structure)}。${creative}` +
    `${plan.strategy.llmPlanned ? '<br><small style="color:#7A67FF">✨ english_textscene：background、text、english_textyes AI english_text，english_text</small>' : ''}` +
    `${parsed.countSource === 'default' ? '<br><small style="color:#8B8B9A">english_text，textcross-border e-commercetextplantext，english_text。</small>' : ''}`
  );

  S.images = plan.images;
  S.cards = {};
  addImageGrid(plan.images);
  addPlanCard(plan.strategy, plan.images);

  await dispatchAndPoll(plan.images, false, { message: text, strategy: plan.strategy });
}

/* ── english_text：english_text ── */
async function flowEdit(edit) {
  const idx = edit.imageIndex - 1;
  const img = S.images[idx];
  if (!img) {
    addAgentMsg(`english_text ${S.images.length} text，english_text ${edit.imageIndex} text。english_textyestext？`);
    return;
  }
  addAgentMsg(`text，english_text<b>text ${edit.imageIndex} text</b>（${esc(img.title || '')}），english_text。`);
  await regenerateImage(img, edit.instruction, true);
}

/* ── english_text：english_text → backendenglish_text → english_text → automaticacceptance ── */
async function flowPreciseEdit(text) {
  const th = addThinking('english_text…');
  try {
    const resp = await postJson('/api/commerce-agent/chat-edit', {
      csrf_token: S.csrf, sessionId: S.sid, message: text,
    });
    th.remove();

    if (resp.needClarify) {
      const list = (resp.candidates || [])
        .map(c => `<li>text ${c.index} text：${esc(c.title || c.imageId)}</li>`).join('');
      addAgentMsg(`english_textyesenglish_text？<ul>${list}</ul>english_text「text N text」english_text。`, { noPersist: true });
      return;
    }
    if (resp.restored) {
      setTileImage(resp.imageId, resp.url, S.images.find(x => (x.id || x.scene_id) === resp.imageId) || {});
      addAgentMsg(
        `↩️ english_text${resp.remainingVersions > 0 ? `（english_text「english_text」english_text，text ${resp.remainingVersions} english_text）` : ''}。`,
        { noPersist: true },
      );
      return;
    }

    const img = S.images.find(x => (x.id || x.scene_id) === resp.imageId
      || x.scene_id === resp.sceneId) || {};
    setTileImage(resp.sceneId || resp.imageId, resp.url, img);

    let verdict = '';
    if (resp.verify) {
      verdict = resp.verify.passed
        ? `<br>✅ english_textacceptancetext：english_text，english_text${resp.verify.notes ? `（${esc(resp.verify.notes)}）` : ''}。`
        : `<br>⚠️ english_text${esc(resp.verify.notes || 'english_text')}——english_text「text」text「english_text」。`;
    }
    addAgentMsg(
      `🖌️ <b>${esc(resp.title || 'english_text')}</b> english_text` +
      `${resp.mocked ? '（english_text：textconfigurationtext Key，english_text）' : ''}` +
      `——${resp.located ? `textvisualenglish_text「${esc(resp.targetDesc)}」english_text，` : ''}english_text。` +
      verdict +
      `<br><small style="color:#8B8B9A">english_text「english_text」text。</small>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_textsuccess（${esc(e.message)}）。english_text（text「text 2 text logo text」），english_text 🖌️ english_text。`, { noPersist: true });
  }
}

/* ── product researchtext：english_text → english_text ── */
async function flowOpportunity(request) {
  const payload = (request && typeof request === 'object') ? request : { idea: request };
  const idea = payload.idea || '';
  const th = addThinking('english_textproduct researchenglish_text…');
  try {
    const resp = await postJson('/api/commerce-agent/opportunity', {
      csrf_token: S.csrf,
      sessionId: S.sid,
      idea,
      raw_idea: payload.raw_idea || payload.rawIdea || payload.raw_message || idea,
    });
    th.remove();
    const c = resp.card || {};
    const score = c.opportunity_score || 0;
    const scoreColor = score >= 70 ? '#2EA36B' : score >= 50 ? '#D98E04' : '#E24A4A';
    const list = (arr) => (arr || []).map(esc).join('、') || '—';
    addAgentMsg(
      `🔍 <b>product researchenglish_text · ${esc(c.product_name || idea)}</b><br>` +
      `<span style="font-size:22px;font-weight:800;color:${scoreColor}">${score}</span>` +
      `<small> /100 english_text</small>　text <b>${esc(c.competition_level || 'text')}</b>` +
      `　text <b>${esc(c.difficulty_level || 'text')}</b>　profit <b>${esc(c.profit_potential || 'text')}</b><br>` +
      `<b>textplatform：</b>${list(c.platforms)}<br>` +
      `<b>english_text：</b>${list(c.target_audience)}　<b>textscene：</b>${list(c.gift_scenes)}<br>` +
      `<b>english_text：</b>${list(c.custom_elements)}<br>` +
      (c.hot_reason ? `<b>english_text：</b>${esc(c.hot_reason)}<br>` : '') +
      `<b>english_text：</b>${list(c.variant_suggestions)}<br>` +
      `<b>⚠️ risktext：</b>${list(c.risk_notes)}<br>` +
      (c.suggested_price ? `<b>textprice：</b>$${c.suggested_price}<br>` : '') +
      `<b>text：</b>${esc(c.verdict || '')}` +
      `<br><small style="color:#8B8B9A">text「english_text」english_text；english_textlistingtext。</small>`,
      { noPersist: true },
    );
    S.lastOpportunityCard = c;
  } catch (e) {
    th.remove();
    addAgentMsg(`product researchenglish_textsuccess（${esc(e.message)}），english_text，text「english_text」。`, { noPersist: true });
  }
}

/* ── textlistingenglish_text：textMD+CSV+textPrompt+riskreport+text text zip ── */
async function flowExportBundle() {
  const th = addThinking('english_textlistingtext（text+text+Prompt+riskreport+text）…');
  try {
    const resp = await postJson('/api/commerce-agent/export-bundle', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const riskBadge = resp.riskLevel === 'text'
      ? '<span style="color:#E24A4A">⚠️ risktext：text（english_text risk_report.md，english_text）</span>'
      : `risktext：${esc(resp.riskLevel)}`;
    addAgentMsg(
      `📦 <b>listingenglish_text</b>（${resp.imageCount} english_text + ${resp.files.length} english_text）<br>` +
      `<b>title：</b>${esc(resp.title)}<br>` +
      `<b>Etsy text：</b>${(resp.tags || []).map(esc).join(' · ')}<br>` +
      `${riskBadge}<br>` +
      `<a href="${resp.url}" target="_blank" style="font-weight:700">⬇️ english_text zip</a>` +
      `<br><small style="color:#8B8B9A">text：${resp.files.map(esc).join('、')}、images/</small>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`english_text（${esc(e.message)}）。english_text，english_text「english_text」。`, { noPersist: true });
  }
}

/* ── english_text（replyenglish_textoutput）── */
async function flowChat(text) {
  // english_text：english_text「english_text/textlistingtext」english_text
  if (/(english_text|text.*(text|listing)|listingtext|english_text)/.test(text) && S.images.length) {
    await flowExportBundle();
    return;
  }
  // english_text「english_text」→ english_text，english_text LLM
  if (/english_text|text|english_text/.test(text) && S.lastOpportunityCard) {
    const c = S.lastOpportunityCard;
    try {
      const resp = await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'add',
        name: c.product_name || c.idea || 'english_text',
        category: (c.platforms || []).slice(0, 2).join('/'),
        targetPrice: c.suggested_price || 0,
        notes: (c.verdict || '').slice(0, 200),
      });
      addAgentMsg(`✅ english_text（text ${resp.total}/${resp.capacity} text）。`, { noPersist: true });
    } catch (e) {
      addAgentMsg(`english_textsuccess（${esc(e.message)}）。`, { noPersist: true });
    }
    return;
  }
  const th = addThinking('english_text…');
  try {
    const resp = await apiChat({ message: text });
    th.remove();
    if (resp.edit_request && resp.edit_request.message && S.images.length) {
      // backend LLM english_textyesenglish_text（frontendenglish_text）
      await flowPreciseEdit(resp.edit_request.message);
      return;
    }
    if (resp.opportunity_request && resp.opportunity_request.idea) {
      // backendenglish_textyesproduct researchtextrequest → english_text
      if (resp.reply) addAgentMsg(formatAgentReplyHtml(resp.reply), { noPersist: true });
      await flowOpportunity(resp.opportunity_request);
      return;
    }
    addAgentMsgTyped(resp.reply || 'text。english_text：english_text、english_text、english_text。');
    if (resp.status === 'task_dispatched') {
      // english_text/searchenglish_texttask：english_textreplyenglish_text，
      // notextuserenglish_text"english_text"，english_text（english_text）
      const th2 = addThinking('textagentenglish_text，english_text…');
      try {
        const done = await pollTask();
        th2.remove();
        if (done.profile) { S.productProfile = done.profile; S.hasProduct = true; }
        const finalText = done.message || done.final_reply || '';
        if (finalText && finalText !== 'completed') addAgentMsg(formatAgentReplyHtml(finalText));
        else if (done.status === 'error') addAgentMsg(`taskenglish_text（${esc(done.error || 'english_text')}），english_text。`, { noPersist: true });
      } catch (e2) { th2.remove(); }
    }
  } catch (e) {
    th.remove();
    throw e;
  }
}

/* ── english_text / english_text / english_text（english_text regenerate）──
 * english_text，english_text：english_text。 */
async function regenerateImage(img, instruction, _legacyLock, promptOverride) {
  try {
    if (instruction) addAgentMsg(`text，english_text「${esc(instruction)}」english_text，english_text。`, { noPersist: true });
    if (promptOverride) addAgentMsg('text，english_textgenerationtext。', { noPersist: true });
    const tile = S.cards[img.scene_id];
    if (tile) {
      const pic = tile.querySelector('img');
      if (pic) pic.style.opacity = '.35';
      if (!tile.querySelector('.it-loading')) {
        const ld = document.createElement('div');
        ld.className = 'it-loading';
        ld.innerHTML = '<div class="it-spinner"></div><span>english_text…</span>';
        tile.appendChild(ld);
      }
      setTileStatus(img.scene_id, '', 'generationtext');
    } else {
      addImageGrid([img]);
    }
    const resp = await postJson('/api/commerce-agent/regenerate', {
      csrf_token: S.csrf, sessionId: S.sid,
      imageId: img.id || img.scene_id, instruction: instruction || '',
      prompt: promptOverride || '', image: promptOverride ? { ...img, prompt: promptOverride } : img,
    });
    if (resp.image && resp.image.prompt) {
      const i = S.images.findIndex(x => x.scene_id === img.scene_id);
      if (i >= 0) S.images[i] = { ...S.images[i], prompt: resp.image.prompt };
      if (i >= 0) img.prompt = resp.image.prompt;
    }
    trackImages([img], true).catch(() => {});
  } catch (e) {
    setTileFailed(img.scene_id, img);
    addAgentMsg(`english_text（${esc(e.message)}）。english_text「🔄」。`, { noPersist: true });
  }
}

/* ── english_textgeneration + english_text（english_text）── */
async function dispatchAndPoll(images, isPartial, meta) {
  let resp;
  try {
    resp = await postJson('/api/commerce-agent/generate', {
      csrf_token: S.csrf, sessionId: S.sid, images, quality: S.quality,
      message: (meta && meta.message) || '',
      strategy: (meta && meta.strategy) || undefined,
    });
  } catch (e) {
    images.forEach(s => setTileFailed(s.scene_id, s));
    addAgentMsg(`taskenglish_text（${esc(e.message)}）。english_text。`);
    return;
  }
  if (resp.mockMode) {
    addAgentMsg('english_textconfigurationtext API Key，english_text<b>english_text</b>english_textflow（textyestextproducttext）；text agent/.env configuration <b>OPENAI_IMAGE_API_KEY</b> english_textgenerationrealimage。', { noPersist: true });
  }
  // english_text：english_text，english_text
  trackImages(images, isPartial).catch(() => {});
}

/** texttask（SSE text、english_text）english_textstatusenglish_text */
async function trackImages(images, isPartial) {
  if (S.tracking) return;   // english_text
  S.tracking = true;
  S.generating = true;
  try {
    await trackImagesInner(images, isPartial);
  } finally {
    S.tracking = false;
    S.generating = false;
  }
}

function applyImageStates(imageStates, images) {
  (imageStates || []).forEach(ps => {
    const sceneId = ps.sceneId || ps.id;
    if (!S.cards[sceneId]) return;
    if (ps.status === 'done' && ps.url) {
      const img = images.find(x => x.scene_id === sceneId) || S.images.find(x => x.scene_id === sceneId) || ps;
      setTileImage(sceneId, ps.url, img);
      if (ps.identityScore != null) setTileIdentity(sceneId, ps.identityScore);
    } else if (ps.status === 'generating') {
      setTileStatus(sceneId, '', 'generationtext');
    }
  });
}

/* ── 🚀 english_text：text → automatictext → english_text + 2K english_text → english_text ── */
async function runFullService() {
  if (S.fullServiceRunning) return;
  S.fullServiceRunning = true;

  const steps = [
    ['check', '🩺 listingenglish_text'],
    ['fix', '🔄 risktextautomatictext'],
    ['plat', '📦 platformenglish_text'],
    ['hd', '🖼️ 2K english_text'],
    ['done', '🎁 english_text'],
  ];
  const card = document.createElement('div');
  card.className = 'plan-card';
  card.innerHTML = `<div class="pc-head"><span class="pc-check">🚀</span> english_text — english_text，english_text</div>
    <div class="pc-body">${steps.map(([k, label]) =>
      `<div data-step="${k}" style="padding:4px 0;font-size:13px;color:#8B8B9A">○ ${label}</div>`).join('')}</div>`;
  chatInner().appendChild(card);
  scrollBottom();
  const mark = (k, state, extra) => {
    const row = card.querySelector(`[data-step=${k}]`);
    if (!row) return;
    const label = steps.find(s => s[0] === k)[1] + (extra ? ` — ${extra}` : '');
    if (state === 'doing') { row.style.color = '#7A67FF'; row.innerHTML = `◌ ${label}`; }
    else if (state === 'ok') { row.style.color = '#22AA6E'; row.innerHTML = `✓ ${label}`; }
    else { row.style.color = '#E2A44A'; row.innerHTML = `△ ${label}`; }
  };

  try {
    // 1. text
    mark('check', 'doing');
    let compliance = null;
    try {
      compliance = await postJson('/api/commerce-agent/compliance', {
        csrf_token: S.csrf, sessionId: S.sid,
      });
      mark('check', 'ok', `${compliance.passed}/${compliance.totalChecks} textpassed`);
    } catch (e) { mark('check', 'warn', esc(e.message)); }

    // 2. risktextautomatictext（text 3 english_text，english_text）
    const bad = ((compliance && compliance.images) || []).filter(im => !im.passed);
    if (!bad.length) {
      mark('fix', 'ok', 'alltext，noneenglish_text');
    } else if (bad.length > 3) {
      mark('fix', 'warn', `${bad.length} textyesrisk，english_text`);
    } else {
      mark('fix', 'doing', `${bad.length} text`);
      let fixed = 0;
      for (const im of bad) {
        const img = S.images.find(x => (x.scene_id || x.id) === im.imageId
          || im.imageId.startsWith(x.scene_id || '')) || { scene_id: im.imageId, id: im.imageId };
        const issues = im.checks.filter(c => !c.passed)
          .map(c => c.issues.join('；')).join('；');
        try {
          await postJson('/api/commerce-agent/regenerate', {
            csrf_token: S.csrf, sessionId: S.sid,
            imageId: img.id || img.scene_id,
            instruction: `textplatformenglish_text：${issues}`.slice(0, 200), image: img,
          });
          setTileStatus(img.scene_id, '', 'generationtext');
          const done = await watchCommerceTask(p => applyImageStates(p.images, [img]));
          applyImageStates(done.images, [img]);
          fixed++;
        } catch (_) { /* textfailedenglish_text */ }
      }
      mark('fix', fixed === bad.length ? 'ok' : 'warn', `text ${fixed}/${bad.length} text`);
    }

    // 3. platformenglish_text
    mark('plat', 'doing');
    let plat = null;
    try {
      plat = await postJson('/api/commerce-agent/export-platforms', {
        csrf_token: S.csrf, sessionId: S.sid,
      });
      mark('plat', 'ok', `${plat.fileCount} text`);
    } catch (e) { mark('plat', 'warn', esc(e.message)); }

    // 4. 2K english_text
    mark('hd', 'doing');
    let hd = null;
    try {
      hd = await postJson('/api/commerce-agent/export-resolution-pack', {
        csrf_token: S.csrf, sessionId: S.sid, tier: '2k',
      });
      mark('hd', 'ok', `${hd.fileCount} text`);
    } catch (e) { mark('hd', 'warn', esc(e.message)); }

    // 5. text
    mark('done', 'ok');
    confettiBurst();
    const links = [
      plat ? `<a href="${plat.url}">📦 platformenglish_text zip</a>` : '',
      hd ? `<a href="${hd.url}">🖼️ 2K english_text zip</a>` : '',
      `<a href="/api/download/${S.sid}">📥 alltext zip</a>`,
    ].filter(Boolean).join('　');
    addAgentMsg(
      `🎁 <b>textcompleted！</b>${compliance ? `english_text ${compliance.passed}/${compliance.totalChecks} textpassed，` : ''}` +
      `english_text：<br>${links}<br>english_textlisting ✨`,
      { noPersist: true },
    );
  } finally {
    S.fullServiceRunning = false;
  }
}

async function trackImagesInner(images, isPartial) {
  images.forEach(s => setTileStatus(s.scene_id, '', 'generationtext'));

  const done = await watchCommerceTask(p => applyImageStates(p.images, images));

  // english_text
  const finalImages = done.images || [];
  let doneCount = 0;
  images.forEach(s => {
    const fs = finalImages.find(x => (x.sceneId || x.id) === s.scene_id);
    if (fs && fs.status === 'done' && fs.url) {
      setTileImage(s.scene_id, fs.url + '?t=' + Date.now(), s);
      if (fs.identityScore != null) setTileIdentity(s.scene_id, fs.identityScore);
      doneCount++;
    } else {
      const tile = S.cards[s.scene_id];
      if (tile && !tile.querySelector('img')) setTileFailed(s.scene_id, s);
      else if (tile) doneCount++;
    }
  });

  if (done.status === 'failed') {
    addAgentMsg(`imagegenerationenglish_text（${esc(done.error || 'english_text')}），english_text，english_textimagetext「🔄」english_textgeneration。`);
    return;
  }
  if (!isPartial) {
    addSetToolbar(doneCount, images.length, done.elapsed);
    addAgentMsg(
      doneCount === images.length
        ? 'allcompleted ✨ english_text，english_text「textgeneration / english_text / ✏️english_text / 🅰️english_text / 🖨️18Ktext / text」。<br>english_text：<i>“text 2 english_text”</i>、<i>“text 3 english_text”</i>，english_text。'
        : `completedtext ${doneCount}/${images.length} text，textcompletedenglish_text，english_text「🔄」english_text。`
    );
  } else {
    addAgentMsg('english_text ✨ english_text。', { noPersist: true });
  }
  renderHistory();
}
