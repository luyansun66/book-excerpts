// ─── OCR 识别模块 ─────────────────────────────────────────────────────────────
// 主引擎：百度 OCR API（通过本地代理服务器 /api/ocr）
// 后备引擎：Tesseract.js（离线或代理不可用时自动降级）

import type { Worker } from 'tesseract.js';

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

let tesseractWorker: Worker | null = null;
let tesseractPromise: Promise<Worker> | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (tesseractWorker) return tesseractWorker;

  if (!tesseractPromise) {
    tesseractPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      // chi_sim+eng：同时加载中文简体与英文（标点、数字需要 eng）
      const w = await createWorker('chi_sim+eng', 1, {
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

      // PSM.AUTO 让 Tesseract 自动检测文本布局
      // SINGLE_BLOCK 对不规则裁剪区域效果不好
      tesseractWorker = w;
      return w;
    })();
  }

  return tesseractPromise;
}

/** Tesseract.js 后备识别 — 只做必要的图片处理，不做激进锐化 */
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

  // 去行首全是非中文的噪声行（Tesseract 偶尔把阴影识别为 ASCII 乱码）
  result = result.replace(/^[^一-鿿\n]{4,}\s*/gm, '');

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
