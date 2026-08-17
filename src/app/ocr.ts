// ─── 百度 OCR（直接从浏览器调用）─────────────────────────────────────────────
// 跨域说明：百度 OCR API 使用 Content-Type: application/x-www-form-urlencoded,
// 属于「简单请求」，浏览器跨域不需要预检（preflight），GitHub Pages 可直接调用。
//
// Token 通过 Vite 环境变量注入（只有 VITE_ 前缀会暴露给客户端）：
//   - 本地开发：复制 .env.example 为 .env.local 并填写（已被 .gitignore 忽略）
//   - GitHub Pages：在仓库 Secrets 中配置，构建时由 .github/workflows/deploy.yml 注入
//
// 注意：纯前端静态站无法真正隐藏密钥，生产环境建议改用服务端代理刷新 token。

const API_BASE = 'https://aip.baidubce.com/rest/2.0/ocr/v1';
const ACCESS_TOKEN = import.meta.env.VITE_OCR_ACCESS_TOKEN ?? '';
const TOKEN_EXPIRES = parseTokenExpiry();

const ENDPOINTS = [
  `${API_BASE}/accurate_basic`,
  `${API_BASE}/general_basic`,
];

/** 读取 token 到期时间：优先使用显式配置，否则解析百度 token 自带的时间戳。 */
function parseTokenExpiry(): number {
  const explicit = import.meta.env.VITE_OCR_TOKEN_EXPIRES;
  if (explicit) {
    const parsed = Date.parse(String(explicit));
    if (!Number.isNaN(parsed)) return parsed;
  }

  // 百度 access_token 格式：24.<token>.<expires_in>.<expire_ts>.<scope>
  const parts = ACCESS_TOKEN.split('.');
  if (parts.length >= 4) {
    const expiresAt = Number(parts[3]) * 1000;
    if (!Number.isNaN(expiresAt) && expiresAt > 0) return expiresAt;
  }

  return 0; // 未知到期时间 → 交由接口错误处理
}

// ─── 公共 API ───────────────────────────────────────────────────────────────

/** 识别图片中的文字。 */
export async function recognizeText(imageData: string): Promise<string> {
  if (!ACCESS_TOKEN) {
    throw new Error('OCR 未配置：请设置 VITE_OCR_ACCESS_TOKEN（参考 .env.example）后重新构建。');
  }

  // 检查 token 是否过期
  if (TOKEN_EXPIRES > 0 && Date.now() > TOKEN_EXPIRES) {
    throw new Error(
      'OCR 服务 Token 已过期，请刷新 VITE_OCR_ACCESS_TOKEN 后重新构建部署。',
    );
  }

  // 提取 base64
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

  // 尝试 accurate_basic → 失败降级到 general_basic
  let lastError = '';
  for (const endpoint of ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}?access_token=${ACCESS_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `image=${encodeURIComponent(base64)}`,
        signal: AbortSignal.timeout(15000),
      });

      const data = await resp.json();

      // 调试：打印百度返回的行数
      // 百度 API 错误
      if (data.error_code) {
        if (data.error_code === 110 || data.error_code === 111) {
          throw new Error('OCR 服务 Token 已过期，请刷新 VITE_OCR_ACCESS_TOKEN 后重新构建部署。');
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

  return recognizeText(await compressImage(file, 2000));
}

/** 缩放图片到最长边 maxW，输出 JPEG data URL。
 *  使用 createImageBitmap 正确处理 EXIF 方向（手机拍照方向标记）。 */
export async function compressImage(file: File, maxW: number): Promise<string> {
  // createImageBitmap 能正确解析 EXIF 方向
  let img: HTMLImageElement | ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    // 降级：部分浏览器不支持 createImageBitmap
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('图片加载失败'));
      i.src = URL.createObjectURL(file);
    });
  }

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

  if ('close' in img) img.close(); // 释放 ImageBitmap 内存
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function terminateWorker(): Promise<void> {
  // 百度 OCR 无 Worker，本函数保留为接口兼容
}
