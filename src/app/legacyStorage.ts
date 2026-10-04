// ─── 一次性清理：遗留的 OCR 票 ────────────────────────────────────────────────
//
// 2026-10 有过一版客户端缓存：把百度 access_token 连同到期时间写进 localStorage
// （键 ocr-access-token），省掉每次冷启动跨境取票的那一下。后来撤了 —— 不想把一张
// 30 天寿命的明文票长期留在用户浏览器里。但已经写进去的那份不会自己消失，所以启动时
// 删一次。
//
// 票最长活 30 天，2026-11 之后不可能再有残留：那时这个文件和 main.tsx 里的调用都能删。

const LEGACY_OCR_TOKEN_KEY = 'ocr-access-token';

export function clearLegacyOcrToken(): void {
  try {
    localStorage.removeItem(LEGACY_OCR_TOKEN_KEY);
  } catch {
    /* 隐私模式等碰不到 localStorage 的场景，本来也不会有残留 */
  }
}
