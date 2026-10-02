// ─── 翻页的轻触觉反馈 ─────────────────────────────────────────────────────────
//
// Web 上没有统一的触觉接口，只能按平台退让：
//   · Android Chrome 有 navigator.vibrate，是真的会震；
//   · 桌面浏览器两者皆无，静默跳过。
//
// 这里原先还有一档 iOS / 桌面的退让：用 WebAudio 发一段 20ms、1750Hz 的方波 tick，
// 想靠扬声器的瞬态冒充"咔"的一下。实际听感很刺耳，已经删掉，等找到合适的声音再补。
//
// 补音效时注意：AudioContext 必须在某次用户手势里创建/恢复（Safari 的自动播放策略），
// 所以要在这里重新加一个预热入口，并在 Rolodex 的 pointerdown 里调用 —— primeHaptics()
// 就是为此留的挂点，目前是空的。
//
// 整段逻辑失败都不该影响翻页 —— 所以全部吞异常。

/**
 * 预留给以后的翻页音效（AudioContext 的解锁时机）。
 * 现在没有音频要预热，保持空实现，调用点留在 Rolodex 的 pointerdown 里。
 */
export function primeHaptics(): void {
  // 有意为空：等新的音效方案落地后在这里解锁 AudioContext。
}

/** 翻过一张卡时叫一下。目前只有 Android 的震动，其它平台静默。 */
export function flipHaptic(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(8);
  } catch {
    /* 忽略 */
  }
}
