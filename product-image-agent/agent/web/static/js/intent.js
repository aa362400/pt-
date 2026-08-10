/* ============================================================
 * frontendmessagetext — Message Router
 *
 * english_text（/api/commerce-agent/parse|plan）。
 * frontendenglish_text：
 *   1. english_textyes「textrequest」textyesenglish_text
 *   2. english_text（"text 2 english_text"）
 *
 * text：english_text IIFE text，english_text，
 * text main.js english_text。
 * ============================================================ */

(function () {
  const CN_NUM = { 'text':1,'text':2,'text':2,'text':3,'text':4,'text':5,'text':6,'text':7,'text':8,'text':9,'text':10 };

  function toNumber(s) {
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    let n = 0;
    for (const ch of s) n = n * (ch === 'text' ? 10 : 1) + (CN_NUM[ch] || 0);
    return n || 1;
  }

  /** textmessageyestextyestextrequest（noenglish_text/english_text） */
  function looksLikeImageRequest(text) {
    return /text|generation|text|text|text|text|text|text|create|generate|image/i.test(text || '');
  }

  /** english_text，text“text 2 english_text”，text {imageIndex, instruction} */
  function parseEditCommand(text) {
    const t = text || '';
    const m = t.match(/text\s*([0-9english_text]+)\s*text/);
    if (!m) return null;
    return { imageIndex: toNumber(m[1]), instruction: t };
  }

  /** english_text/english_text（english_text）：
   *  「english_text logo text」「backgroundenglish_text」「english_text」 */
  function parsePreciseEdit(text) {
    const t = text || '';
    if (/(text|textgeneration|english_text|english_text|english_text|english_text|textgeneration)/.test(t)) return null;
    const restore = /(text|text|text|text|text)[^。，,]*(english_text|text|text|text|text)/.test(t);
    const precise = /(text|text|text|text|text|text|text|text|text|text|text)/.test(t)
      || /text.{1,30}(text|text|text|text|text|text|text)/.test(t);
    if (!restore && !precise) return null;
    return { message: t, restore };
  }

  window.AgentIntent = { parseEditCommand, parsePreciseEdit, looksLikeImageRequest };
})();
