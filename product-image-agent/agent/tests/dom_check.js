/* text jsdom textrealtext，english_textyes UI english_text。
 * text test_dom_smoke.py text：BASE passedenglish_text DOM_CHECK_BASE text，
 * jsdom english_textpassed DOM_CHECK_JSDOM text（text .tmp-jsdom/node_modules/jsdom）。 */
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

  // english_text + init completed
  await sleep(2500);

  check('none JS texterror', jsErrors.length === 0, jsErrors.slice(0, 2).join(' ; '));
  check('AgentIntent english_text', !!window.AgentIntent);
  check('nonetexterrortext', !doc.getElementById('fatalBar'));

  const $ = id => doc.getElementById(id);
  const agentMsgs = () => doc.querySelectorAll('.msg.agent').length;

  // 1. english_text
  const before = agentMsgs();
  $('btnDocs').click();
  await sleep(100);
  check('📖 english_text', agentMsgs() === before + 1);

  // 2. text chip textinputtext
  const chip = doc.querySelector('.chip[data-fill]');
  chip.click();
  check('english_text', $('promptInput').value.includes('text'), $('promptInput').value);

  // 3. english_text
  $('btnSettings').click();
  await sleep(50);
  check('⚙️ english_text', !$('settingsPop').hidden);
  const seg = doc.querySelector('#segQuality button[data-v="premium"]');
  seg.click();
  await sleep(50);
  check('english_text', seg.classList.contains('on'));

  // 4. english_text
  const b2 = agentMsgs();
  $('toolInspiration').click();
  $('toolAssets').click();
  await sleep(100);
  check('english_text', agentMsgs() === b2 + 2);

  // 5. english_text（english_text）
  $('btnHistory').click();
  await sleep(50);
  const openedOnce = $('sidebar').classList.contains('open');
  $('btnHistory').click();
  check('🕘 english_text', openedOnce && !$('sidebar').classList.contains('open'));

  // 6. english_text
  $('btnNewChat').click();
  await sleep(100);
  check('＋ english_text', $('emptyState').style.display !== 'none');

  // 7. english_text（realtext /api/chat）
  $('promptInput').value = 'text';
  const b3 = doc.querySelectorAll('.msg.user').length;
  const agentBefore = agentMsgs();
  $('btnSend').click();
  await sleep(500);
  check('english_text（userenglish_text）', doc.querySelectorAll('.msg.user').length === b3 + 1);
  let replied = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (agentMsgs() > agentBefore) { replied = true; break; }
  }
  check('textyesreply', replied);

  // 8. english_text（textfileenglish_text）
  let pickTriggered = false;
  $('fileInput').addEventListener('click', () => { pickTriggered = true; });
  $('chipUpload').click();
  check('english_text（textfiletext）', pickTriggered);

  // 9. textrequesttextnoneenglish_text
  $('promptInput').value = 'english_text 3 textscenetext';
  const b4 = agentMsgs();
  $('btnSend').click();
  await sleep(1500);
  const lastAgent = [...doc.querySelectorAll('.msg.agent .bubble')].pop();
  check('textrequestyesresponse', agentMsgs() > b4, (lastAgent && lastAgent.textContent || '').slice(0, 40));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  window.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
