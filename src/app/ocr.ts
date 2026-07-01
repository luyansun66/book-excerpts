// ─── OCR 识别模块 ─────────────────────────────────────────────────────────────
// 主引擎：百度 OCR API（通过本地代理服务器 /api/ocr）
// 后备引擎：Tesseract.js（离线或代理不可用时自动降级）
//
// Tesseract.js 在首次使用时需要下载约 10MB 语言包（chi_sim+eng），
// 下载完成后会缓存到 IndexedDB，后续离线也可用。

import { createWorker } from 'tesseract.js';

// ─── 百度 OCR（主引擎）─────────────────────────────────────────────────────

/** 通过本地代理服务器调用百度 OCR API。 */
async function recognizeBaidu(base64Image: string): Promise<string> {
  const resp = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(errBody.error || `服务器错误 (${resp.status})`);
  }

  const data = await resp.json();
  if (!data.text) {
    throw new Error('百度 OCR 返回结果为空');
  }

  return data.text;
}

// ─── Tesseract.js（后备引擎）────────────────────────────────────────────────

// ─── Tesseract.js（后备引擎）────────────────────────────────────────────────
// 所有 CDN 路径使用 tesseract.js 内置默认值（不手动指定），避免版本不匹配。
// 语言仅用 chi_sim（中文简体，~2MB），不使用 chi_sim+eng 因为 + 号在 CDN URL 中会 400。

let tesseractWorker: import('tesseract.js').Worker | null = null;
let tesseractReady = false;

async function getTesseractWorker(): Promise<import('tesseract.js').Worker> {
  // 如果已有可用 worker 直接返回
  if (tesseractWorker && tesseractReady) return tesseractWorker;

  // 清理旧 worker
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch {}
    tesseractWorker = null;
    tesseractReady = false;
  }

  // 不设任何 CDN 路径，全用 tesseract.js 默认值
  // 首次需下载 ~2MB 中文语言包，成功后缓存到 IndexedDB
  const workerPromise = createWorker('chi_sim', 1, {
    gzip: true,
    logger: (m) => {
      if (m.status === 'loading tesseract core') {
        console.debug('[OCR] 加载核心引擎…');
      }
      if (m.status === 'loading language traineddata') {
        console.debug(`[OCR] 下载语言包… ${Math.round(m.progress * 100)}%`);
      }
      if (m.status === 'recognizing text') {
        console.debug(`[OCR] 识别中… ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  // 60 秒超时（移动端下载 ~2MB 语言包可能需要较长时间）
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('初始化超时（60秒），请检查网络后重试')), 60000);
  });

  const w = await Promise.race([workerPromise, timeoutPromise]);
  tesseractWorker = w;
  tesseractReady = true;
  return w;
}

/** Tesseract.js 后备识别 */
async function recognizeFallback(imageData: string): Promise<string> {
  const w = await getTesseractWorker();
  const { data } = await w.recognize(imageData);
  return cleanFallbackText(data.text);
}

/** Tesseract 识别结果后处理 — 清理中文间多余空格和乱码行 */
function cleanFallbackText(text: string): string {
  let result = text;

  // 去中文间空格（Tesseract 经常在汉字间插入空格）
  result = result.replace(
    /([一-鿿豈-﫿㐀-䶿])\s+(?=[一-鿿豈-﫿㐀-䶿])/g,
    '$1',
  );

  // 去中文前后的多余空格
  result = result.replace(/\s+([，。、；：！？）】」』」])/g, '$1');
  result = result.replace(/([（【「『「])\s+/g, '$1');

  // 去行首全是非中文的噪声行
  result = result.replace(/^[^一-鿿\n]{4,}\s*/gm, '');

  return result.trim();
}

// ─── 图片预处理 ────────────────────────────────────────────────────────────

/** 预处理：白边 + 灰度化。输出 PNG 无损格式。 */
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

  // 白色背景 + 居中绘制
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

// ─── 公共 API ───────────────────────────────────────────────────────────────

/** 识别图片中的文字。
 *  优先使用百度 OCR API，失败时自动降级到 Tesseract.js。 */
export async function recognizeText(imageData: string): Promise<string> {
  // 预处理：白边 + 灰度
  const processed = await preprocessImage(imageData);
  const base64 = processed.replace(/^data:image\/\w+;base64,/, '');

  // 先试百度 OCR
  try {
    console.debug('[OCR] 调用百度 OCR…');
    const text = await recognizeBaidu(base64);
    console.debug(`[OCR] 百度识别成功: ${text.length} 字`);
    return text;
  } catch (e: any) {
    console.warn('[OCR] 百度 OCR 失败，切换到后备引擎:', e.message);
  }

  // 降级到 Tesseract.js
  try {
    console.debug('[OCR] Tesseract.js 后备识别…');
    const text = await recognizeFallback(processed);
    if (!text) throw new Error('未能识别出任何文字');
    console.debug(`[OCR] 后备识别成功: ${text.length} 字`);
    return text;
  } catch (e: any) {
    console.error('[OCR] 后备引擎也失败:', e.message);
    // 如果 worker 出问题，重置以便下次重试
    if (tesseractWorker) {
      try { tesseractWorker.terminate(); } catch {}
      tesseractWorker = null;
      tesseractReady = false;
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

/** 终止后备引擎的 Worker。 */
export async function terminateWorker(): Promise<void> {
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch {}
    tesseractWorker = null;
    tesseractReady = false;
  }
}
