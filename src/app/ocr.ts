// ─── 拍照识别：浏览器直连百度 ────────────────────────────────────────────────
//
// 分工：本站的 /api/ocr-token 只换 access_token（服务端缓存、自动续期），识别请求由浏览器
// 直接发往百度。为什么不让服务端代发 —— 实测同一张 956KB 的整页图：
//   浏览器直连百度  948 / 803 / 863 ms
//   经 Cloudflare 回源百度  16.0 / 16.3 / 19.0 s
// 19 倍差距来自跨境链路（边缘机房在境外，回源百度只有 ~50KB/s）。细节见
// functions/api/ocr-token.ts 顶部的说明。

const OCR_ENDPOINT = 'https://aip.baidubce.com/rest/2.0/ocr/v1';
/** 先试高精度版，识别不出再退到通用版。 */
const OCR_PATHS = ['accurate_basic', 'general_basic'];
const TOKEN_FETCH_TIMEOUT_MS = 10000;
const OCR_TIMEOUT_MS = 20000;
/** 和票一起拿到的到期时间提前一分钟当过期，避免卡在边界上。 */
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;
/** 百度认为「票不能用」的错误码：110 无效、111 过期。 */
const TOKEN_ERROR_CODES = new Set([110, 111]);

/** 常见错误码给一句人话；没收录的把百度原文附上，免得瞎猜反而误导排查。 */
const ERROR_HINTS: Record<number, string> = {
  17: '今日识别额度已用完，请明天再试',
  18: '识别请求太频繁，请稍后重试',
  19: '识别额度已用完',
  100: '请求参数不对',
  216101: '没有收到图片数据',
  216201: '图片格式不支持',
  216202: '图片太大，请裁剪后重试',
  282000: '百度服务异常，请稍后重试',
};

interface BaiduOcrResponse {
  error_code?: number;
  error_msg?: string;
  words_result?: { words: string }[];
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * AbortSignal.timeout 要 Safari 16.4+ / Chrome 103+。老浏览器上直接不传 signal（放弃超时
 * 保护），好过整个识别功能直接报错不可用。
 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** 取票。force 为真时忽略本地缓存 —— 用来处理「票在百度那边被判失效」的情况。 */
async function getToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
    return tokenCache.token;
  }

  let resp: Response;
  try {
    resp = await fetch('/api/ocr-token', { cache: 'no-store', signal: timeoutSignal(TOKEN_FETCH_TIMEOUT_MS) });
  } catch {
    throw new Error('无法连接识别服务，请检查网络后重试');
  }

  const data = (await resp.json().catch(() => null)) as
    | { token?: string; expiresAt?: number; error?: string }
    | null;
  if (!resp.ok || !data?.token) {
    throw new Error(data?.error || `获取识别凭证失败（HTTP ${resp.status}）`);
  }

  tokenCache = { token: data.token, expiresAt: data.expiresAt ?? Date.now() + 30 * 24 * 3600 * 1000 };
  return tokenCache.token;
}

interface AttemptResult {
  words?: string[];
  error?: string;
  /** 票被判失效，调用方该换张新票重来一次。 */
  tokenInvalid?: boolean;
}

async function recognizeOnce(token: string, image: string): Promise<AttemptResult> {
  let lastError = '未能识别出任何文字';

  for (const path of OCR_PATHS) {
    let resp: Response;
    try {
      resp = await fetch(`${OCR_ENDPOINT}/${path}?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `image=${encodeURIComponent(image)}`,
        signal: timeoutSignal(OCR_TIMEOUT_MS),
      });
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        return { error: '识别服务响应超时，请重试' };
      }
      return { error: '无法连接识别服务，请检查网络后重试' };
    }

    const data = (await resp.json().catch(() => ({}))) as BaiduOcrResponse;

    if (data.error_code) {
      if (TOKEN_ERROR_CODES.has(data.error_code)) return { tokenInvalid: true };
      lastError = ERROR_HINTS[data.error_code] ?? `[${data.error_code}] ${data.error_msg ?? ''}`;
      continue;
    }

    const words = (data.words_result ?? []).map((r) => r.words).filter(Boolean);
    if (words.length) return { words };
    lastError = '未能识别出任何文字';
  }

  return { error: lastError };
}

/**
 * 识别图片中的文字。imageData 可以是 data URL，也可以是一段纯 base64。
 * 成功时按行返回识别结果；失败抛出的 Error.message 已经是能直接给用户看的中文。
 */
export async function recognizeText(imageData: string): Promise<string> {
  const image = imageData.replace(/^data:image\/\w+;base64,/, '');

  let result = await recognizeOnce(await getToken(), image);
  // 票可能在有效期内被百度作废（换了 Key、并发换票等），换一张重来一次而不是直接抛给用户
  if (result.tokenInvalid) result = await recognizeOnce(await getToken(true), image);

  if (result.tokenInvalid) throw new Error('识别凭证无效，请检查百度 OCR 的 API Key / Secret Key');
  if (result.error) throw new Error(result.error);
  return (result.words ?? []).join('\n');
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
