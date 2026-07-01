// ─── Tesseract.js OCR utility ───────────────────────────────────────────────────
// Browser-based OCR using Tesseract.js. No API keys, no network requests
// (after initial language data download). Works offline.

import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;
let workerPromise: Promise<Worker> | null = null;

/** Get or create the singleton Tesseract worker.
 *  Lazy-initialised with Chinese Simplified + English. */
async function getWorker(): Promise<Worker> {
  if (worker) return worker;

  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('chi_sim+eng', 1, {
        logger: (m) => {
          // Surface progress to the caller if they set up a handler.
          // The existing UI uses a simple loading state (ocrLoading),
          // so no direct progress wiring is needed here yet.
          if (m.status === 'loading tesseract core') console.debug('[OCR] loading core…');
          if (m.status === 'initializing tesseract') console.debug('[OCR] initializing…');
          if (m.status === 'loading language traineddata') console.debug(`[OCR] loading language data… ${Math.round(m.progress * 100)}%`);
          if (m.status === 'initializing api') console.debug('[OCR] initializing API…');
          if (m.status === 'recognizing text') console.debug(`[OCR] recognizing… ${Math.round(m.progress * 100)}%`);
        },
      });
      worker = w;
      return w;
    })();
  }

  return workerPromise;
}

/** Recognise text from a base64 image data URL using Tesseract.js.
 *  @param imageData - JPEG/PNG data URL (e.g. from canvas.toDataURL)
 *  @returns The recognised text, trimmed. */
export async function recognizeText(imageData: string): Promise<string> {
  const w = await getWorker();

  // Strip "data:image/…;base64," prefix — Tesseract.js handles raw base64 too,
  // but passing the full data URL is cleaner and well-supported.
  const { data } = await w.recognize(imageData);
  return data.text.trim();
}

/** Take a photo (or pick from gallery) and recognise text.
 *  Returns the recognised text, or throws on error. */
export async function captureAndRecognize(): Promise<string> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // prefer rear camera

  const file: File = await new Promise((resolve, reject) => {
    input.onchange = () => {
      if (input.files && input.files[0]) resolve(input.files[0]);
      else reject(new Error('未选择图片'));
    };
    input.onerror = () => reject(new Error('拍照失败'));
    input.click();
  });

  // Compress and resize image before sending to OCR
  const compressed = await compressImage(file, 1280);
  const text = await recognizeText(compressed);
  return text;
}

/** Resize image to at most maxW on the longest side, return JPEG base64. */
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
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/** Terminate the OCR worker (call on page unload / app unmount).
 *  After termination, the next recogniseText call will create a fresh worker. */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerPromise = null;
  }
}
