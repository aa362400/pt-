/* ════════════════ 核心流程 ════════════════ */

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
  addUserMsg(text || '📷 上传了产品图', imgUrls);

  // 流程后台跑，聊天框始终可用：生成/分析期间照样能继续对话
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
        addAgentMsg('上一批图还在生成中，我先记下这个需求——等这批点亮后再说一次「生成」就开工；期间你可以随时聊天、改图、问问题。', { noPersist: true });
        return;
      }
      await flowGenerate(text);
    } else {
      await flowChat(text);
    }
  };
  job().catch(e => {
    addAgentMsg(`我这边遇到一点阻塞（${esc(e.message)}），你的需求我已经记住了，可以直接再发一次。`);
  });
}

/* ── 上传产品图：自动分析产品（含失败重试提示）── */
async function flowUpload(files, text) {
  const th = addThinking('我正在认识这款产品…');
  try {
    await apiChat({ message: '', images: files });
  } catch (e) {
    th.remove();
    addAgentMsg(
      `图片上传没成功（${esc(e.message)}）。<br>` +
      `可以：① 直接把图片<b>拖进聊天</b>；② <b>Ctrl+V 粘贴</b>截图；③ 点 📎 重新选择。图片请小于 ${MAX_UPLOAD_MB}MB。`
    );
    return;
  }
  S.hasProduct = true;

  // 自动触发产品分析（分析失败不阻断出图）
  let profile = null;
  let analysisReply = '';
  try {
    const resp = await apiChat({ message: '分析一下' });
    if (resp.status === 'task_dispatched') {
      th.querySelector('span:last-child').textContent = '我正在判断它适合的平台、人群和上架图方向…';
      const done = await pollTask();
      profile = done.profile || null;
      analysisReply = done.message || done.final_reply || '';
      if (analysisReply === '完成') analysisReply = '';
    } else if (resp.reply) {
      analysisReply = resp.reply;
    }
  } catch (e) { /* 忽略分析失败 */ }
  th.remove();
  S.productProfile = profile;

  if (analysisReply) {
    // 用观察者对这款产品的真实分析回复（LLM/档案生成），不甩预设话术
    addAgentMsg(formatAgentReplyHtml(analysisReply));
  } else {
    const name = profile && (profile.product_name_cn || profile.product_name) || '这款产品';
    const cat = profile && (profile.category_cn || profile.category) || '';
    addAgentMsg(
      `我已经看懂了：<b>${esc(name)}</b>${cat ? `（${esc(cat)}）` : ''}。<br>` +
      `直接告诉我：<b>出几张、卖什么平台、送给谁</b>，我就按这款产品定制上架图。`
    );
  }
  renderHistory();

  // 上传时顺带说了需求 → 直接出图
  if (text && looksLikeImageRequest(text)) {
    await flowGenerate(text);
  }
}

/* ── 主流程：一句话 → 解析 → 策略 → 逐张出图 ── */
async function flowGenerate(text) {
  if (!S.hasProduct) {
    // 没有产品图时不甩固定话术：交给后端 LLM 按上下文自然回应
    // （后端状态守卫会引导上传，LLM 模式下的回复不重样、能接住追问）
    await flowChat(text);
    return;
  }

  // 1. 理解（服务端解析）
  const th1 = addThinking('我正在判断平台、人群和图片数量。');
  let parsed;
  try {
    parsed = await postJson('/api/commerce-agent/parse', { message: text, sessionId: S.sid });
  } finally { th1.remove(); }

  // 「再出 N 张同风格」：沿用上一轮的平台、人群与礼物场景
  if (S.lastParsed) {
    const sameStyle = /同风格|同样的?风格|一样的?风格|风格不变/.test(text);
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

  // 2. 策略（服务端规划：LLM 按真实产品定制，模板兜底）
  const th2 = addThinking('我正在按你的产品定制每张图的创意与提示词。');
  let plan;
  try {
    plan = await postJson('/api/commerce-agent/plan', {
      parsed, sessionId: S.sid, thinkMode: S.thinkMode,
    });
  } finally { th2.remove(); }

  // 3. 一条理解回复（优先用 LLM 的创意方向，模板只兜底）+ 图片网格 + 套图用途卡
  const sceneWord = parsed.giftScene || parsed.productType || '产品';
  const creative = plan.strategy.creativeDirection
    ? `<br>创意方向：<b>${esc(plan.strategy.creativeDirection)}</b>。`
    : '';
  addAgentMsg(
    `已理解你的需求，为你生成 <b>${plan.images.length} 张</b>适合 <b>${esc(plan.strategy.platform)}</b> 的` +
    `${esc(sceneWord)}上架图，包括${esc(plan.strategy.structure)}。${creative}` +
    `${plan.strategy.llmPlanned ? '<br><small style="color:#7A67FF">✨ 已按你的产品逐张定制场景：背景、道具、光线都是 AI 导演现挑的，整套不重样</small>' : ''}` +
    `${parsed.countSource === 'default' ? '<br><small style="color:#8B8B9A">你没说数量，我按跨境电商最佳方案定的，可随时改。</small>' : ''}`
  );

  S.images = plan.images;
  S.cards = {};
  addImageGrid(plan.images);
  addPlanCard(plan.strategy, plan.images);

  await dispatchAndPoll(plan.images, false, { message: text, strategy: plan.strategy });
}

/* ── 改图指令：只改指定那张 ── */
async function flowEdit(edit) {
  const idx = edit.imageIndex - 1;
  const img = S.images[idx];
  if (!img) {
    addAgentMsg(`本轮一共 ${S.images.length} 张图，我没找到第 ${edit.imageIndex} 张。告诉我具体是哪张？`);
    return;
  }
  addAgentMsg(`收到，我只调整<b>第 ${edit.imageIndex} 张</b>（${esc(img.title || '')}），其他图保持不变。`);
  await regenerateImage(img, edit.instruction, true);
}

/* ── 精准局部改图：一句话 → 后端定位哪张图哪个物体 → 局部重绘 → 自动验收 ── */
async function flowPreciseEdit(text) {
  const th = addThinking('我在定位你说的那张图和那个位置…');
  try {
    const resp = await postJson('/api/commerce-agent/chat-edit', {
      csrf_token: S.csrf, sessionId: S.sid, message: text,
    });
    th.remove();

    if (resp.needClarify) {
      const list = (resp.candidates || [])
        .map(c => `<li>第 ${c.index} 张：${esc(c.title || c.imageId)}</li>`).join('');
      addAgentMsg(`你说的可能是这几张里的哪一张？<ul>${list}</ul>直接说「第 N 张」我就开工。`, { noPersist: true });
      return;
    }
    if (resp.restored) {
      setTileImage(resp.imageId, resp.url, S.images.find(x => (x.id || x.scene_id) === resp.imageId) || {});
      addAgentMsg(
        `↩️ 已恢复上一版${resp.remainingVersions > 0 ? `（再说一次「恢复上一版」还能继续回退，剩 ${resp.remainingVersions} 个历史版本）` : ''}。`,
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
        ? `<br>✅ 我自己验收过了：改动已生效，其余区域和产品都没被波及${resp.verify.notes ? `（${esc(resp.verify.notes)}）` : ''}。`
        : `<br>⚠️ 自检发现${esc(resp.verify.notes || '效果可能不到位')}——不满意直接说「再改」或「恢复上一版」。`;
    }
    addAgentMsg(
      `🖌️ <b>${esc(resp.title || '这张图')}</b> 已精准修改` +
      `${resp.mocked ? '（演示模式：未配置生图 Key，实际未修改）' : ''}` +
      `——${resp.located ? `我用视觉定位找到了「${esc(resp.targetDesc)}」的准确位置，` : ''}只动了目标区域。` +
      verdict +
      `<br><small style="color:#8B8B9A">随时可以说「恢复上一版」回退。</small>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`精准改图没成功（${esc(e.message)}）。可以换个说法（比如「把第 2 张的 logo 去掉」），或点图上的 🖌️ 手动圈选。`, { noPersist: true });
  }
}

/* ── 选品雷达：产品想法 → 机会评分卡 ── */
async function flowOpportunity(request) {
  const payload = (request && typeof request === 'object') ? request : { idea: request };
  const idea = payload.idea || '';
  const th = addThinking('我在按跨境选品逻辑评估这个产品…');
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
      `🔍 <b>选品机会卡 · ${esc(c.product_name || idea)}</b><br>` +
      `<span style="font-size:22px;font-weight:800;color:${scoreColor}">${score}</span>` +
      `<small> /100 机会评分</small>　竞争 <b>${esc(c.competition_level || '中')}</b>` +
      `　制作 <b>${esc(c.difficulty_level || '中')}</b>　利润 <b>${esc(c.profit_potential || '中')}</b><br>` +
      `<b>适合平台：</b>${list(c.platforms)}<br>` +
      `<b>目标人群：</b>${list(c.target_audience)}　<b>礼物场景：</b>${list(c.gift_scenes)}<br>` +
      `<b>可定制元素：</b>${list(c.custom_elements)}<br>` +
      (c.hot_reason ? `<b>热卖原因：</b>${esc(c.hot_reason)}<br>` : '') +
      `<b>改款建议：</b>${list(c.variant_suggestions)}<br>` +
      `<b>⚠️ 风险提醒：</b>${list(c.risk_notes)}<br>` +
      (c.suggested_price
        ? `<b>证据定价：</b>${esc(c.suggested_price)} ${esc(c.price_currency || '')}<br>`
        : '<b>定价：</b>数据不足（待完整成本与费用证据）<br>') +
      `<b>结论：</b>${esc(c.verdict || '')}` +
      `<br><small style="color:#8B8B9A">说「加入新品池」可以把它记入新品池；发产品图可以直接出上架图。</small>`,
      { noPersist: true },
    );
    S.lastOpportunityCard = c;
  } catch (e) {
    th.remove();
    addAgentMsg(`选品评估没成功（${esc(e.message)}），换个说法再试试，比如「宠物出生花挂件能不能做」。`, { noPersist: true });
  }
}

/* ── 一键上架资料包：文案MD+CSV+图Prompt+风险报告+成图 合一 zip ── */
async function flowExportBundle() {
  const th = addThinking('我在打包上架资料（文案+标签+Prompt+风险报告+成图）…');
  try {
    const resp = await postJson('/api/commerce-agent/export-bundle', {
      csrf_token: S.csrf, sessionId: S.sid,
    });
    th.remove();
    const riskBadge = resp.publishable === true
      ? `<span style="color:#1F8A57">风险门禁：PASS（证据：${esc(resp.evidenceStatus || 'ATTESTED')}）</span>`
      : `<span style="color:#E24A4A">⚠️ 风险门禁：${esc(resp.decision || 'BLOCK')}（证据：${esc(resp.evidenceStatus || 'MISSING')}；禁止自动上架）</span>`;
    addAgentMsg(
      `📦 <b>上架资料包已就绪</b>（${resp.imageCount} 张成图 + ${resp.files.length} 份文档）<br>` +
      `<b>标题：</b>${esc(resp.title)}<br>` +
      `<b>Etsy 标签：</b>${(resp.tags || []).map(esc).join(' · ')}<br>` +
      `${riskBadge}<br>` +
      `<a href="${resp.url}" target="_blank" style="font-weight:700">⬇️ 下载资料包 zip</a>` +
      `<br><small style="color:#8B8B9A">包含：${resp.files.map(esc).join('、')}、images/</small>`,
      { noPersist: true },
    );
  } catch (e) {
    th.remove();
    addAgentMsg(`资料包没打成（${esc(e.message)}）。先确认这轮已经出过图，再说一次「资料包」。`, { noPersist: true });
  }
}

/* ── 普通聊天（回复打字机逐字输出）── */
async function flowChat(text) {
  // 一键资料包：出过图后说「资料包/打包上架资料」直接打包
  if (/(资料包|打包.*(资料|上架)|上架包|一键打包)/.test(text) && S.images.length) {
    await flowExportBundle();
    return;
  }
  // 刚出过机会卡时说「加入新品池」→ 直接入池，不再绕 LLM
  if (/加入新品池|入池|加到新品池/.test(text) && S.lastOpportunityCard) {
    const c = S.lastOpportunityCard;
    try {
      const resp = await postJson('/api/commerce-agent/product-pool', {
        csrf_token: S.csrf, action: 'add',
        name: c.product_name || c.idea || '未命名新品',
        category: (c.platforms || []).slice(0, 2).join('/'),
        targetPrice: c.suggested_price ?? null,
        notes: (c.verdict || '').slice(0, 200),
      });
      addAgentMsg(`✅ 已加入新品池（当前 ${resp.total}/${resp.capacity} 位）。`, { noPersist: true });
    } catch (e) {
      addAgentMsg(`入池没成功（${esc(e.message)}）。`, { noPersist: true });
    }
    return;
  }
  const th = addThinking('我在想…');
  try {
    const resp = await apiChat({ message: text });
    th.remove();
    if (resp.edit_request && resp.edit_request.message && S.images.length) {
      // 后端 LLM 识别出这是改图指令（前端正则没接住的说法）
      await flowPreciseEdit(resp.edit_request.message);
      return;
    }
    if (resp.opportunity_request && resp.opportunity_request.idea) {
      // 后端识别出这是选品评估请求 → 机会评分卡通道
      if (resp.reply) addAgentMsg(formatAgentReplyHtml(resp.reply), { noPersist: true });
      await flowOpportunity(resp.opportunity_request);
      return;
    }
    addAgentMsgTyped(resp.reply || '收到。你可以直接告诉我：出几张、卖什么、送给谁。');
    if (resp.status === 'task_dispatched') {
      // 聊天里触发的分析/搜索等后台任务：等结果回来把最终回复也贴出来，
      // 否则用户只看到"已派发"，成果永远不出现（像没干活）
      const th2 = addThinking('执行智能体在干活，我盯着进度…');
      try {
        const done = await pollTask();
        th2.remove();
        if (done.profile) { S.productProfile = done.profile; S.hasProduct = true; }
        const finalText = done.message || done.final_reply || '';
        if (finalText && finalText !== '完成') addAgentMsg(formatAgentReplyHtml(finalText));
        else if (done.status === 'error') addAgentMsg(`任务没跑成（${esc(done.error || '未知原因')}），可以再说一次。`, { noPersist: true });
      } catch (e2) { th2.remove(); }
    }
  } catch (e) {
    th.remove();
    throw e;
  }
}

/* ── 单张重做 / 换风格 / 提示词覆盖（服务端 regenerate）──
 * 出图在后台进行，不锁聊天框：期间可以继续聊天或追加需求。 */
async function regenerateImage(img, instruction, _legacyLock, promptOverride) {
  try {
    if (instruction) addAgentMsg(`好，这张按「${esc(instruction)}」重做一版，创意方向保持不变。`, { noPersist: true });
    if (promptOverride) addAgentMsg('收到，按你编辑后的提示词重新生成这张。', { noPersist: true });
    const tile = S.cards[img.scene_id];
    if (tile) {
      const pic = tile.querySelector('img');
      if (pic) pic.style.opacity = '.35';
      if (!tile.querySelector('.it-loading')) {
        const ld = document.createElement('div');
        ld.className = 'it-loading';
        ld.innerHTML = '<div class="it-spinner"></div><span>正在重新创作…</span>';
        tile.appendChild(ld);
      }
      setTileStatus(img.scene_id, '', '生成中');
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
    addAgentMsg(`这张没能启动重做（${esc(e.message)}）。稍等几秒再点一次「🔄」。`, { noPersist: true });
  }
}

/* ── 派发整套生成 + 后台跟踪逐张点亮（不锁聊天框）── */
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
    addAgentMsg(`任务没能启动（${esc(e.message)}）。稍等几秒再试一次就好。`);
    return;
  }
  if (resp.mockMode) {
    addAgentMsg('当前未配置生图 API Key，我先用<b>情绪概念预览图</b>走完整流程（不是最终商品成片）；在 agent/.env 配置 <b>OPENAI_IMAGE_API_KEY</b> 后即可生成真实图片。', { noPersist: true });
  }
  // 出图在后台进行：聊天框立即可用，期间可以继续聊天
  trackImages(images, isPartial).catch(() => {});
}

/** 跟踪任务（SSE 优先、轮询兜底）并把每张图的状态点亮到独立格子 */
async function trackImages(images, isPartial) {
  if (S.tracking) return;   // 同一会话同时只跑一条跟踪链
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
      setTileStatus(sceneId, '', '生成中');
    }
  });
}

/* ── 🚀 一键交付全托管：体检 → 自动修图 → 尺寸包 + 2K 高清包 → 交付清单 ── */
async function runFullService() {
  if (S.fullServiceRunning) return;
  S.fullServiceRunning = true;

  const steps = [
    ['check', '🩺 上架前体检'],
    ['fix', '🔄 风险图自动重生'],
    ['plat', '📦 平台尺寸包'],
    ['hd', '🖼️ 2K 高清包'],
    ['done', '🎁 打包交付'],
  ];
  const card = document.createElement('div');
  card.className = 'plan-card';
  card.innerHTML = `<div class="pc-head"><span class="pc-check">🚀</span> 一键交付全托管 — 你去喝杯咖啡，交付我来</div>
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
    // 1. 体检
    mark('check', 'doing');
    let compliance = null;
    try {
      compliance = await postJson('/api/commerce-agent/compliance', {
        csrf_token: S.csrf, sessionId: S.sid,
      });
      mark('check', 'ok', `${compliance.passed}/${compliance.totalChecks} 项通过`);
    } catch (e) { mark('check', 'warn', esc(e.message)); }

    // 2. 风险图自动重生（限 3 张以内，避免一轮跑太久）
    const bad = ((compliance && compliance.images) || []).filter(im => !im.passed);
    if (!bad.length) {
      mark('fix', 'ok', '全部合规，无需修图');
    } else if (bad.length > 3) {
      mark('fix', 'warn', `${bad.length} 张有风险，数量较多建议逐张处理`);
    } else {
      mark('fix', 'doing', `${bad.length} 张`);
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
            instruction: `按平台合规要求修正：${issues}`.slice(0, 200), image: img,
          });
          setTileStatus(img.scene_id, '', '生成中');
          const done = await watchCommerceTask(p => applyImageStates(p.images, [img]));
          applyImageStates(done.images, [img]);
          fixed++;
        } catch (_) { /* 单张失败不阻断交付 */ }
      }
      mark('fix', fixed === bad.length ? 'ok' : 'warn', `重生 ${fixed}/${bad.length} 张`);
    }

    // 3. 平台尺寸包
    mark('plat', 'doing');
    let plat = null;
    try {
      plat = await postJson('/api/commerce-agent/export-platforms', {
        csrf_token: S.csrf, sessionId: S.sid,
      });
      mark('plat', 'ok', `${plat.fileCount} 张`);
    } catch (e) { mark('plat', 'warn', esc(e.message)); }

    // 4. 2K 高清包
    mark('hd', 'doing');
    let hd = null;
    try {
      hd = await postJson('/api/commerce-agent/export-resolution-pack', {
        csrf_token: S.csrf, sessionId: S.sid, tier: '2k',
      });
      mark('hd', 'ok', `${hd.fileCount} 张`);
    } catch (e) { mark('hd', 'warn', esc(e.message)); }

    // 5. 交付
    mark('done', 'ok');
    confettiBurst();
    const links = [
      plat ? `<a href="${plat.url}">📦 平台尺寸包 zip</a>` : '',
      hd ? `<a href="${hd.url}">🖼️ 2K 高清包 zip</a>` : '',
      `<a href="/api/download/${S.sid}">📥 全部原图 zip</a>`,
    ].filter(Boolean).join('　');
    addAgentMsg(
      `🎁 <b>交付完成！</b>${compliance ? `合规体检 ${compliance.passed}/${compliance.totalChecks} 项通过，` : ''}` +
      `打包如下：<br>${links}<br>直接转发给运营就能上架 ✨`,
      { noPersist: true },
    );
  } finally {
    S.fullServiceRunning = false;
  }
}

async function trackImagesInner(images, isPartial) {
  images.forEach(s => setTileStatus(s.scene_id, '', '生成中'));

  const done = await watchCommerceTask(p => applyImageStates(p.images, images));

  // 最终结果兜底
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
    addAgentMsg(`图片生成遇到阻塞（${esc(done.error || '未知原因')}），我保留了你的创意方向，把鼠标放到图片上点「🔄」即可重新生成。`);
    return;
  }
  if (!isPartial) {
    addSetToolbar(doneCount, images.length, done.elapsed);
    addAgentMsg(
      doneCount === images.length
        ? '全部完成 ✨ 把鼠标放到任意一张图上，可以单独「重新生成 / 换风格 / ✏️改提示词 / 🅰️加卖点文案 / 🖨️18K导出 / 下载」。<br>聊天框随时可用：<i>“第 2 张更温馨一点”</i>、<i>“再出 3 张同风格”</i>，或随便聊聊你的产品。'
        : `完成了 ${doneCount}/${images.length} 张，没完成的我保留了创意方向，点图上的「🔄」就能补上。`
    );
  } else {
    addAgentMsg('这张重做好了 ✨ 不满意可以继续换风格。', { noPersist: true });
  }
  renderHistory();
}
