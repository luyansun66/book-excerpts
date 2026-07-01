// ─── OCR 识别模块 ─────────────────────────────────────────────────────────────
// 主引擎：百度 OCR API（通过本地代理服务器 /api/ocr）
// 后备引擎：Tesseract.js（离线或代理不可用时自动降级）

import type { Worker } from 'tesseract.js';

// ─── 百度 OCR（主引擎）─────────────────────────────────────────────────────

/** 通过本地代理服务器调用百度 OCR API。
 *  返回识别文本，或抛出异常。 */
async function recognizeBaidu(base64Image: string): Promise<string> {
  const resp = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
    signal: AbortSignal.timeout(30000), // 30 秒超时
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

let tesseractWorker: Worker | null = null;
let tesseractPromise: Promise<Worker> | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (tesseractWorker) return tesseractWorker;

  if (!tesseractPromise) {
    tesseractPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const w = await createWorker('chi_sim', 1, {
        gzip: true,
        logger: (m) => {
          if (m.status === 'loading language traineddata') {
            console.debug(`[OCR后备] 下载语言包… ${Math.round(m.progress * 100)}%`);
          }
          if (m.status === 'recognizing text') {
            console.debug(`[OCR后备] 识别中… ${Math.round(m.progress * 100)}%`);
          }
        },
        errorHandler: (err) => {
          console.error('[OCR后备 Worker 错误]', err);
        },
      });

      await w.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        user_defined_dpi: '300',
      });

      tesseractWorker = w;
      return w;
    })();
  }

  return tesseractPromise;
}

/** Tesseract.js 后备识别 */
async function recognizeFallback(imageData: string): Promise<string> {
  const w = await getTesseractWorker();

  // 预处理：白边 + 灰度 + 锐化
  const processed = await preprocessForTesseract(imageData);
  const { data } = await w.recognize(processed);
  return cleanFallbackText(data.text);
}

/** 为 Tesseract 预处理图片：白边 + 灰度 + 锐化 */
async function preprocessForTesseract(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });

  const pad = 20;
  const cw = img.width + pad * 2;
  const ch = img.height + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  // 白边
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, pad, pad, img.width, img.height);

  // 灰度
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
  }

  // 锐化
  sharpen(pixels, cw, ch);

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** 3×3 sharpen kernel */
function sharpen(pixels: Uint8ClampedArray, width: number, height: number): void {
  const src = new Uint8ClampedArray(pixels);
  const k = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let v = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const si = ((y + ky) * width + (x + kx)) * 4;
          const ki = (ky + 1) * 3 + (kx + 1);
          v += src[si] * k[ki];
        }
      }
      const di = (y * width + x) * 4;
      const val = Math.min(255, Math.max(0, Math.round(v)));
      pixels[di] = val;
      pixels[di + 1] = val;
      pixels[di + 2] = val;
    }
  }
}

/** Tesseract 后备识别结果后处理 */
function cleanFallbackText(text: string): string {
  let result = text;

  // 去中文间空格
  result = result.replace(
    /([一-鿿豈-﫿㐀-䶿])\s+(?=[一-鿿豈-﫿㐀-䶿])/g,
    '$1',
  );

  // 去重标点
  result = result.replace(
    /([一-鿿])([，。、；：！？])(?:[，。、；：！？])+(?=[一-鿿])/g,
    '$1$2',
  );

  // 去行首 ASCII 乱码
  result = result.replace(/^[^一-鿿\n]{2,}\s*/gm, '');

  // 去中文前后的多余空格
  result = result.replace(/\s+([　-〿＀-￯])/g, '$1');
  result = result.replace(/([　-〿＀-￯])\s+/g, '$1');

  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

// ─── 公共 API ───────────────────────────────────────────────────────────────

/** 识别图片中的文字。
 *  优先使用百度 OCR API，失败时自动降级到 Tesseract.js。
 *  @param imageData - JPEG/PNG data URL
 *  @returns 识别文本（含标点符号） */
export async function recognizeText(imageData: string): Promise<string> {
  // 从 data URL 中提取纯 base64（百度 OCR 需要）
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

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
    const text = await recognizeFallback(imageData);
    if (!text) throw new Error('未能识别出任何文字');
    console.debug(`[OCR] 后备识别成功: ${text.length} 字`);
    return text;
  } catch (e: any) {
    console.error('[OCR] 后备引擎也失败:', e.message);
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

/** 缩放图片到最长边 maxW，输出彩色 JPEG data URL。 */
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

      // 输出彩色 JPEG（百度 OCR 需要完整色彩信息）
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
    await tesseractWorker.terminate();
    tesseractWorker = null;
    tesseractPromise = null;
  }
}
