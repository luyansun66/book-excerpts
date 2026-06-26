// ─── Baidu OCR utility ───────────────────────────────────────────────────────
// Uses Baidu Accurate Basic OCR API for Chinese text recognition.

const API_KEY = 'ci8aC97iWSF6Gb6Dn5yCtfqM';
const SECRET_KEY = 'EhkbZQNmrQMh5wVl2DTwpo9pcyZ2swew';

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Get an access token (cached for 29 days) */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const resp = await fetch(
    'https://aip.baidubce.com/oauth/2.0/token' +
      `?grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}`,
    { method: 'POST' },
  );
  const data = await resp.json();
  if (!data.access_token) throw new Error('获取百度OCR token失败: ' + (data.error_description || '未知错误'));

  // Cache for 29 days (token expires in 30)
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 29 * 86400000 };
  return data.access_token;
}

/** Recognise text from an image using Baidu Accurate Basic OCR.
 *  @param imageData - base64-encoded image data (without the data: prefix)
 *  @returns The recognised text lines joined by newlines. */
export async function recognizeText(imageData: string): Promise<string> {
  const token = await getAccessToken();

  // Ensure no data URI prefix
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

  const resp = await fetch(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ image: base64 }),
    },
  );
  const data = await resp.json();

  if (data.error_code) {
    throw new Error(`OCR识别失败: ${data.error_msg || data.error_code}`);
  }

  const lines = (data.words_result || []).map((r: { words: string }) => r.words);
  return lines.join('\n');
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
