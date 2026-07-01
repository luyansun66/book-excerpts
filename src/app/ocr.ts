// ─── 百度 OCR（直接从浏览器调用）─────────────────────────────────────────────
// 跨域说明：百度 OCR API 使用 Content-Type: application/x-www-form-urlencoded,
// 属于「简单请求」，浏览器跨域不需要预检（preflight），GitHub Pages 可直接调用。
//
// Token 管理：内嵌 access_token，有效期 30 天。过期后终端执行以下命令刷新：
//   curl 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=ci8aC97iWSF6Gb6Dn5yCtfqM&client_secret=EhkbZQNmrQMh5wVl2DTwpo9pcyZ2swew'

const API_BASE = 'https://aip.baidubce.com/rest/2.0/ocr/v1';
const ACCESS_TOKEN = '24.29b40977b0651bae0e1adc775812c3b0.2592000.1785040642.282335-123829048';
const TOKEN_EXPIRES = Date.parse('2026-07-22T00:00:00Z'); // token 到期日

const ENDPOINTS = [
  `${API_BASE}/accurate_basic`,
  `${API_BASE}/general_basic`,
];

// ─── 公共 API ───────────────────────────────────────────────────────────────

/** 识别图片中的文字。 */
export async function recognizeText(imageData: string): Promise<string> {
  // 检查 token 是否过期
  if (Date.now() > TOKEN_EXPIRES) {
    throw new Error(
      'OCR 服务 Token 已过期，请运行以下命令刷新：\n' +
      "curl 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=ci8aC97iWSF6Gb6Dn5yCtfqM&client_secret=EhkbZQNmrQMh5wVl2DTwpo9pcyZ2swew'",
    );
  }

  // 给图片四周加白边，防止边缘文字被裁断
  const padded = await addPadding(imageData, 80);
  const base64 = padded.replace(/^data:image\/\w+;base64,/, '');

  // 尝试 accurate_basic → 失败降级到 general_basic
  let lastError = '';
  for (const endpoint of ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}?access_token=${ACCESS_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `image=${encodeURIComponent(base64)}&detect_direction=true`,
        signal: AbortSignal.timeout(15000),
      });

      const data = await resp.json();

      // 百度 API 错误
      if (data.error_code) {
        if (data.error_code === 110 || data.error_code === 111) {
          throw new Error('OCR 服务 Token 已过期，请运行刷新命令更新');
        }
        lastError = `[${data.error_code}] ${data.error_msg || ''}`;
        continue;
      }

      const lines = (data.words_result || []).map((r: { words: string }) => r.words);
      if (lines.length > 0) return lines.join('\n');

      lastError = '未能识别出任何文字';
    } catch (e: any) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new Error('OCR 识别超时，请检查网络后重试');
      }
      // Token 过期错误直接抛出，不继续降级
      if ((e.message || '').includes('Token 已过期')) throw e;
      lastError = `请求失败: ${e?.message || e}`;
      continue;
    }
  }

  throw new Error(`OCR 识别失败: ${lastError}`);
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

  return recognizeText(await compressImage(file, 3000));
}

/** 给图片四周加白边，防止文字紧贴边缘被百度 OCR 忽略。 */
async function addPadding(dataUrl: string, px: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('图片加载失败'));
    i.src = dataUrl;
  });
  const cw = img.width + px * 2;
  const ch = img.height + px * 2;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, px, px);
  return canvas.toDataURL('image/jpeg', 0.92);
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

export async function terminateWorker(): Promise<void> {
  // 百度 OCR 无 Worker，本函数保留为接口兼容
}
