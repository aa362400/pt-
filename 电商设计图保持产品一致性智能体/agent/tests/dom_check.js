/* 用 jsdom 加载真实页面，模拟点击验证所有 UI 功能可用。
 * 由 test_dom_smoke.py 调起：BASE 通过环境变量 DOM_CHECK_BASE 传入，
 * jsdom 依赖目录通过 DOM_CHECK_JSDOM 传入（默认 .tmp-jsdom/node_modules/jsdom）。 */
const path = require('path');
const jsdomDir = process.env.DOM_CHECK_JSDOM ||
  path.join(__dirname, '..', '..', '.tmp-jsdom', 'node_modules', 'jsdom');
const { JSDOM, VirtualConsole } = require(jsdomDir);

const BASE = process.env.DOM_CHECK_BASE || 'http://127.0.0.1:8123';
let failures = 0;
const jsErrors = [];

function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures++;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const html = await (await fetch(BASE + '/')).text();

  const vc = new VirtualConsole();
  vc.on('jsdomError', e => jsErrors.push(String(e.message || e)));
  vc.on('error', (...a) => jsErrors.push(a.join(' ')));

  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  const doc = window.document;

  // 等脚本加载 + init 完成
  await sleep(2500);

  check('无 JS 运行错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' ; '));
  check('AgentIntent 已加载', !!window.AgentIntent);
  check('无致命错误横幅', !doc.getElementById('fatalBar'));

  const $ = id => doc.getElementById(id);
  const agentMsgs = () => doc.querySelectorAll('.msg.agent').length;

  // 1. 使用说明按钮
  const before = agentMsgs();
  $('btnDocs').click();
  await sleep(100);
  check('📖 使用说明可点', agentMsgs() === before + 1);

  // 2. 快捷 chip 填充输入框
  const chip = doc.querySelector('.chip[data-fill]');
  chip.click();
  check('快捷按钮可点', $('promptInput').value.includes('主图'), $('promptInput').value);

  // 3. 设置弹层
  $('btnSettings').click();
  await sleep(50);
  check('⚙️ 设置可点', !$('settingsPop').hidden);
  const seg = doc.querySelector('#segQuality button[data-v="premium"]');
  seg.click();
  await sleep(50);
  check('画质切换可点', seg.classList.contains('on'));

  // 4. 智能工具
  const b2 = agentMsgs();
  $('toolInspiration').click();
  $('toolAssets').click();
  await sleep(100);
  check('智能工具可点', agentMsgs() === b2 + 2);

  // 5. 侧栏切换（移动端按钮）
  $('btnHistory').click();
  await sleep(50);
  const openedOnce = $('sidebar').classList.contains('open');
  $('btnHistory').click();
  check('🕘 历史开合可点', openedOnce && !$('sidebar').classList.contains('open'));

  // 6. 新建对话
  $('btnNewChat').click();
  await sleep(100);
  check('＋ 新建对话可点', $('emptyState').style.display !== 'none');

  // 7. 发送一条普通聊天（真实走 /api/chat）
  $('promptInput').value = '你好';
  const b3 = doc.querySelectorAll('.msg.user').length;
  const agentBefore = agentMsgs();
  $('btnSend').click();
  await sleep(500);
  check('发送按钮可点（用户气泡出现）', doc.querySelectorAll('.msg.user').length === b3 + 1);
  let replied = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (agentMsgs() > agentBefore) { replied = true; break; }
  }
  check('聊天有回复', replied);

  // 8. 上传按钮（触发文件选择器不报错即可）
  let pickTriggered = false;
  $('fileInput').addEventListener('click', () => { pickTriggered = true; });
  $('chipUpload').click();
  check('上传按钮可点（触发文件选择）', pickTriggered);

  // 9. 出图请求在无产品图时给引导
  $('promptInput').value = '帮我出 3 张场景图';
  const b4 = agentMsgs();
  $('btnSend').click();
  await sleep(1500);
  const lastAgent = [...doc.querySelectorAll('.msg.agent .bubble')].pop();
  check('出图请求有响应', agentMsgs() > b4, (lastAgent && lastAgent.textContent || '').slice(0, 40));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  window.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
