/* ============================================================
 * 前端消息路由 — Message Router
 *
 * 意图解析与套图策略已在服务端（/api/commerce-agent/parse|plan）。
 * 前端只负责两件小事：
 *   1. 判断一句话是「出图请求」还是普通聊天
 *   2. 识别针对某张图的改图指令（"第 2 张更温馨一点"）
 *
 * 注意：必须用 IIFE 包裹，避免顶层函数名污染全局作用域，
 * 与 main.js 的解构常量重名导致整个脚本报错失效。
 * ============================================================ */

(function () {
  const CN_NUM = { '一':1,'两':2,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };

  function toNumber(s) {
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    let n = 0;
    for (const ch of s) n = n * (ch === '十' ? 10 : 1) + (CN_NUM[ch] || 0);
    return n || 1;
  }

  /** 判断消息是不是出图请求（否则当聊天/改图指令处理） */
  function looksLikeImageRequest(text) {
    return /出|生成|来|做|要|帮我|图|画|create|generate|image/i.test(text || '');
  }

  /** 识别针对某张图的改图指令，如“第 2 张更温馨一点”，返回 {imageIndex, instruction} */
  function parseEditCommand(text) {
    const t = text || '';
    const m = t.match(/第\s*([0-9一两二三四五六七八九十]+)\s*张/);
    if (!m) return null;
    return { imageIndex: toNumber(m[1]), instruction: t };
  }

  /** 识别精准局部改图/回退指令（与整图重做区分）：
   *  「把第三张杯子上的 logo 去掉」「背景换成米白色」「恢复上一版」 */
  function parsePreciseEdit(text) {
    const t = text || '';
    if (/(重做|重新生成|再来一版|换个风格|换一版|重新出|再生成)/.test(t)) return null;
    const restore = /(恢复|换回|退回|还原|撤销)[^。，,]*(上一版|原来|之前|原图|修改)/.test(t);
    const precise = /(去掉|去除|删掉|删除|移除|擦掉|抹掉|修掉|遮住|调亮|调暗)/.test(t)
      || /把.{1,30}(换成|改成|变成|放大|缩小|挪到|移到)/.test(t);
    if (!restore && !precise) return null;
    return { message: t, restore };
  }

  window.AgentIntent = { parseEditCommand, parsePreciseEdit, looksLikeImageRequest };
})();
