// ─── Baidu OCR utility ───────────────────────────────────────────────────────
// Uses Baidu Accurate Basic OCR API for Chinese text recognition.

const API_KEY = 'ci8aC97iWSF6Gb6Dn5yCtfqM';
const SECRET_KEY = 'EhkbZQNmrQMh5wVl2DTwpo9pcyZ2swew';

// Pre-generated access token (valid 30 days, refreshed via curl when needed).
// Baidu's OAuth token endpoint lacks CORS headers so it cannot be called
// from the browser — the token must be obtained server-side.
const EMBEDDED_TOKEN = '24.29b40977b0651bae0e1adc775812c3b0.2592000.1785040642.282335-123829048';
const TOKEN_EXPIRES_AT = Date.parse('2026-07-22T00:00:00Z'); // ~30 days from now

let cachedToken: string | null = null;

/** Get a Baidu access token. Falls back to the embedded token if the
 *  OAuth endpoint is unreachable (e.g. from a browser due to missing CORS). */
async function getAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (EMBEDDED_TOKEN && Date.now() < TOKEN_EXPIRES_AT) {
    cachedToken = EMBEDDED_TOKEN;
    return cachedToken;
  }

  // Try fetching a fresh token (may fail in browser due to CORS)
  try {
    const resp = await fetch(
      'https://aip.baidubce.com/oauth/2.0/token' +
        `?grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}`,
      { method: 'POST' },
    );
    const data = await resp.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      return data.access_token;
    }
  } catch { /* fall through to embedded token */ }

  if (EMBEDDED_TOKEN) return EMBEDDED_TOKEN;
  throw new Error('无法获取百度OCR access token');
}

/** Recognise text from an image using Baidu OCR.
 *  First tries accurate_basic, falls back to general_basic.
 *  @param imageData - data URL or raw base64
 *  @returns The recognised text lines joined by newlines. */
export async function recognizeText(imageData: string): Promise<string> {
  const token = await getAccessToken();

  // Strip data URI prefix
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

  // Use manual URL encoding (URLSearchParams can fail with very large payloads)
  const body = 'image=' + encodeURIComponent(base64);

  const endpoints = [
    'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic',
    'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
  ];

  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(`${endpoint}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data = await resp.json();

      if (data.error_code) {
        lastError = `[${data.error_code}] ${data.error_msg || ''}`;
        continue;
      }

      const lines = (data.words_result || []).map((r: { words: string }) => r.words);
      return lines.join('\n');
    } catch (e: any) {
      lastError = `网络错误: ${e?.message || e}`;
      continue;
    }
  }

  throw new Error(`OCR识别失败: ${lastError}`);
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

  // Compress and resize image before sending
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
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
