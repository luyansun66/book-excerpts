// ─── OCR 识别模块 ─────────────────────────────────────────────────────────────
// Tesseract.js 单引擎（适配 GitHub Pages 纯静态部署）。
// 预热策略：App 启动时后台初始化 Worker，提前下载语言包。
// 单个 Worker 贯穿整个会话，不回收重建（重建会导致 CDN 重新下载语言包，
// 且 Tesseract.js 内部对语言下载失败的错误被吞掉，Worker 无中文能力）。
// 当识别退化时（空结果或乱码），调用 reinitialize() 重置内部状态，快速且不依赖网络。

import { createWorker, PSM } from 'tesseract.js';

let worker: import('tesseract.js').Worker | null = null;
let workerReady = false;
let warmupStarted = false;
let warmupPromise: Promise<void> | null = null;

// ─── 预热 ─────────────────────────────────────────────────────────────────────

export function warmup(): void {
  if (warmupStarted) return;
  warmupStarted = true;
  console.debug('[OCR] 预热中…');
  warmupPromise = initWorker();
  warmupPromise.then(
    () => console.debug('[OCR] 预热完成'),
    (e) => console.warn('[OCR] 预热失败:', e.message),
  );
}

// ─── Worker 初始化 ────────────────────────────────────────────────────────────

async function initWorker(): Promise<void> {
  if (worker) {
    try { await worker.terminate(); } catch { /* ignore */ }
    worker = null;
    workerReady = false;
  }

  const w = await createWorker('chi_sim', 1, {
    gzip: true,
    logger: (m) => {
      if (m.status === 'loading tesseract core') console.debug('[OCR] 核心引擎…');
      if (m.status === 'loading language traineddata') {
        console.debug(`[OCR] 下载语言包… ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  await w.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: '300',
  });

  // 验证 Worker 语言模型可用
  const testResult = await w.recognize('data:image/png;base64,');
  if (!testResult?.data?.text && testResult?.data?.text !== '') {
    console.warn('[OCR] Worker 创建后语言不可用，重试…');
    await w.terminate();
    return initWorker(); // 重试
  }

  worker = w;
  workerReady = true;
}

async function getWorker(timeoutMs = 120000): Promise<import('tesseract.js').Worker> {
  if (workerReady && worker) return worker;

  if (warmupPromise) {
    // 预热已发起，等待它完成
    await warmupPromise;
    if (workerReady && worker) return worker;
  }

  // 未预热或预热失败 → 直接初始化
  await initWorker();
  if (workerReady && worker) return worker;

  throw new Error('初始化超时，请检查网络后重试');
}

// ─── 图片预处理 ───────────────────────────────────────────────────────────────

async function preprocessImage(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('图片加载失败'));
    i.src = dataUrl;
  });

  const padPx = Math.max(40, Math.round(Math.min(img.width, img.height) * 0.03));
  const cw = img.width + padPx * 2;
  const ch = img.height + padPx * 2;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, padPx, padPx);

  const imageData = ctx.getImageData(0, 0, cw, ch);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = gray;
    d[i + 1] = gray;
    d[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.9);
}

// ─── 后处理 ───────────────────────────────────────────────────────────────────

function cleanChineseText(text: string): string {
  let result = text;

  result = result.replace(
    /([一-鿿豈-﫿㐀-䶿])\s+(?=[一-鿿豈-﫿㐀-䶿])/g, '$1',
  );
  result = result.replace(/\s+([，。、；：！？）】」』」⨪])/g, '$1');
  result = result.replace(/([（【「『「])\s+/g, '$1');
  result = result.replace(/^[^一-鿿\n]{4,}\s*/gm, '');
  result = result.replace(/[ \t]+$/gm, '');

  return result.trim();
}

/** 判断文本是否正常：至少包含一些中文字符。 */
function hasChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

// ─── 公共 API ───────────────────────────────────────────────────────────────

export async function recognizeText(imageData: string): Promise<string> {
  const processed = await preprocessImage(imageData);

  let w = await getWorker();

  // 首次调用或前次失败后的重试
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await w.recognize(processed);
      let text = cleanChineseText(data.text || '');

      // 如果结果为空或没有中文 → 可能是 Worker 内部状态退化
      if (text && hasChinese(text)) {
        return text;
      }

      // 退化或空 → reinitialize 重置内部模型（从 IndexedDB 缓存加载，不依赖网络）
      console.debug('[OCR] 结果异常，尝试 reinitialize 后重试…');
      w = await w.reinitialize('chi_sim', 1);
      await w.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: '300',
      });
      continue;
    } catch (e: any) {
      // 识别抛异常 → 终止 Worker，下次调用重新创建
      console.warn('[OCR] 识别异常，重置 Worker:', e.message);
      try { await w.terminate(); } catch { /* ignore */ }
      w = await initWorker().then(() => worker!);
      if (!w) throw new Error(`OCR识别失败: ${e?.message || e}`);
      continue;
    }
  }

  throw new Error('OCR识别失败: 未能识别出任何文字，请检查图片是否清晰');
}

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

export async function terminateWorker(): Promise<void> {
  if (worker) {
    try { await worker.terminate(); } catch { /* ignore */ }
    worker = null;
    workerReady = false;
    warmupStarted = false;
    warmupPromise = null;
  }
}
