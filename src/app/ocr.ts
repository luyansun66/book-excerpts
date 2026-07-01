// ─── OCR 识别模块 ─────────────────────────────────────────────────────────────
// Tesseract.js 单引擎（适配 GitHub Pages 纯静态部署）。
// 预热策略：App 启动时后台初始化 Worker，提前下载语言包，减少用户等待。

import { createWorker, PSM } from 'tesseract.js';

let worker: import('tesseract.js').Worker | null = null;
let workerReady = false;
let warmupStarted = false;

// Worker 使用计数：Tesseract 的 WASM 内部状态会在多次识别后退化，
// 达到上限后自动重建 Worker，确保识别精度不下降。
let callCount = 0;
const MAX_CALLS = 3;

// ─── 预热 ─────────────────────────────────────────────────────────────────────

/** 在后台提前初始化 Tesseract Worker，下载语言包。
 *  不设硬超时，失败后静默重试。
 *  App 启动时调用一次即可。 */
export function warmup(): void {
  if (warmupStarted) return;
  warmupStarted = true;
  console.debug('[OCR] 预热：后台初始化 Tesseract Worker…');
  initWorker().then(
    () => console.debug('[OCR] 预热完成：语言包已就绪'),
    (e) => console.warn('[OCR] 预热失败（用户点击识别时会重试）:', e.message),
  );
}

// ─── Worker 初始化 ────────────────────────────────────────────────────────────

async function initWorker(): Promise<void> {
  // 清理旧 worker
  if (worker) {
    try { await worker.terminate(); } catch { /* ignore */ }
    worker = null;
    workerReady = false;
  }

  const w = await createWorker('chi_sim', 1, {
    gzip: true,
    logger: (m) => {
      if (m.status === 'loading tesseract core') console.debug('[OCR] 加载核心引擎…');
      if (m.status === 'loading language traineddata') {
        console.debug(`[OCR] 下载语言包… ${Math.round(m.progress * 100)}%`);
      }
      if (m.status === 'recognizing text') {
        console.debug(`[OCR] 识别中… ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  // PSM.AUTO：自动检测文本布局，适应各种裁剪形状
  await w.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: '300',
  });

  worker = w;
  workerReady = true;
}

/** 获取 Worker，如果未就绪则等待初始化（最多 120 秒）。
 *  Worker 使用 MAX_CALLS 次后自动重建，防止 WASM 内部状态退化。 */
async function getWorker(timeoutMs = 120000): Promise<import('tesseract.js').Worker> {
  // 达到使用上限 → 回收旧 Worker（重建由下方初始化逻辑处理）
  if (callCount >= MAX_CALLS && worker) {
    console.debug(`[OCR] 回收 Worker（已达 ${MAX_CALLS} 次上限），重建中…`);
    try { await worker.terminate(); } catch { /* ignore */ }
    worker = null;
    workerReady = false;
    callCount = 0;
    warmupStarted = false; // 允许 initWorker 重新执行完整初始化
  }

  if (workerReady && worker) return worker;

  // 启动初始化（如果还未开始）
  if (!warmupStarted) {
    warmupStarted = true;
    initWorker(); // 不 await，在下方等待
  }

  // 等待 Worker 就绪，带超时
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (workerReady && worker) return worker;
    await new Promise((r) => setTimeout(r, 200));
  }

  // 超时后尝试强制初始化一次
  if (!workerReady) {
    await initWorker();
    if (workerReady && worker) return worker;
  }

  throw new Error('初始化超时，请检查网络后重试');
}

// ─── 图片预处理 ───────────────────────────────────────────────────────────────

/** 预处理：白边 + 灰度化。输出 PNG 无损格式。 */
async function preprocessImage(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('图片加载失败'));
    i.src = dataUrl;
  });

  const padPx = Math.max(40, Math.round(Math.min(img.width, img.height) * 0.05));
  const cw = img.width + padPx * 2;
  const ch = img.height + padPx * 2;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, padPx, padPx);

  // 灰度化
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = gray;
    d[i + 1] = gray;
    d[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

// ─── 后处理 ───────────────────────────────────────────────────────────────────

/** 清理中文间多余空格和乱码行。 */
function cleanChineseText(text: string): string {
  let result = text;

  // 去中文间空格
  result = result.replace(
    /([一-鿿豈-﫿㐀-䶿])\s+(?=[一-鿿豈-﫿㐀-䶿])/g,
    '$1',
  );

  // 去中文前后的多余空格
  result = result.replace(/\s+([，。、；：！？）】」』」⨪])/g, '$1');
  result = result.replace(/([（【「『「])\s+/g, '$1');

  // 去行首全是非中文的噪声行
  result = result.replace(/^[^一-鿿\n]{4,}\s*/gm, '');

  // 去行尾多余空格
  result = result.replace(/[ \t]+$/gm, '');

  return result.trim();
}

// ─── 公共 API ───────────────────────────────────────────────────────────────

/** 识别图片中的文字。 */
export async function recognizeText(imageData: string): Promise<string> {
  // 预处理：白边 + 灰度
  const processed = await preprocessImage(imageData);

  try {
    const w = await getWorker();
    const { data } = await w.recognize(processed);
    callCount++; // 记录使用次数，达到上限后自动回收 Worker
    const text = cleanChineseText(data.text);

    if (!text) throw new Error('未能识别出任何文字，请检查图片是否清晰');
    return text;
  } catch (e: any) {
    // Worker 出问题时重置，下次调用重新初始化
    if (worker) {
      try { worker.terminate(); } catch { /* ignore */ }
      worker = null;
      workerReady = false;
    }
    throw new Error(`OCR识别失败: ${e?.message || e}`);
  }
}

/** 拍照并识别。 */
export async function captureAndRecognize(): Promise<string> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';

  const file: File = await new Promise((resolve, reject) => {
    input.onchange = () => {
      if (input.files && input.files[0]) resolve(input.files[0]);
      else reject(new Error('未选择图片'));
    };
    input.onerror = () => reject(new Error('拍照失败'));
    input.click();
  });

  const compressed = await compressImage(file, 2000);
  return recognizeText(compressed);
}

/** 缩放图片到最长边 maxW，输出 JPEG data URL。 */
export function compressImage(file: File, maxW: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      if (h > maxW) {
        w = Math.round((w * maxW) / h);
        h = maxW;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 终止 Worker。 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    try { await worker.terminate(); } catch { /* ignore */ }
    worker = null;
    workerReady = false;
    warmupStarted = false;
  }
}
