// 百度 OCR 的服务端代理：浏览器只负责发图片，密钥和 access_token 都留在服务端。
//
// 为什么不在前端直接调百度：access_token 只有 30 天寿命，纯前端方案到期就得人工换票 +
// 重新部署，而且 token 会被打进构建产物 —— 谁都能搜出来拿你的额度去刷。放到 Function 里
// 之后，换票、缓存、失效重试都在服务端完成，前端不再持有任何凭据。
//
// 环境变量（Cloudflare Pages 项目 Settings → Environment variables）：
//   BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY
// 本地开发时把同样两个名字写进 .env.local 即可，vite.config.ts 里的中间件会读它们并调用
// 同一个 onRequestPost，因此 npm run dev 不需要额外起 wrangler。

interface OcrEnv {
  BAIDU_OCR_API_KEY?: string;
  BAIDU_OCR_SECRET_KEY?: string;
}

interface OcrContext {
  request: Request;
  env?: OcrEnv;
}

interface BaiduOcrResponse {
  error_code?: number;
  error_msg?: string;
  words_result?: { words: string }[];
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const OCR_BASE = 'https://aip.baidubce.com/rest/2.0/ocr/v1';
/** 先试高精度版，失败再退到通用版；和以前前端那套降级顺序保持一致。 */
const ENDPOINTS = [`${OCR_BASE}/accurate_basic`, `${OCR_BASE}/general_basic`];
const REQUEST_TIMEOUT_MS = 15000;
/** 提前一小时换票：免得刚好在到期那一刻进来的请求拿到一张已经作废的票。 */
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;
/** 百度要求 base64 编码后不超过 4M；这里按 3M 卡，比较的就是 base64 字符串本身的长度。 */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** 百度认为「票不能用」的错误码：110 无效、111 过期。 */
const TOKEN_ERROR_CODES = new Set([110, 111]);

/** 常见错误码给一句人话；没收录的原样透出，免得瞎猜反而误导排查。 */
const ERROR_HINTS: Record<number, string> = {
  17: '今日调用量已达上限',
  18: '请求过于频繁（超出 QPS 限制）',
  19: '接口调用量已用尽',
  100: '请求参数不对',
  216101: '没有收到图片数据',
  216201: '图片格式不支持',
  216202: '图片体积超出接口限制',
  282000: '百度侧服务异常，请稍后重试',
};

/** 带上 HTTP 状态码的错误：handler 直接拿它回响应，不用再判断错误类型。 */
class OcrError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** 模块作用域缓存只在同一个 isolate 内有效，实例被回收后自然重取，因此不必持久化。 */
let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<{ token: string; expiresAt: number }> | null = null;

/** 仅供测试：清掉模块级票缓存，让每个用例都从「手上没票」开始。 */
export function resetTokenCache(): void {
  tokenCache = null;
  tokenInFlight = null;
}



function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function fetchToken(env: OcrEnv): Promise<{ token: string; expiresAt: number }> {
  const apiKey = env.BAIDU_OCR_API_KEY;
  const secretKey = env.BAIDU_OCR_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new OcrError(
      500,
      'OCR 未配置：请设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 后重新部署。',
    );
  }

  const url =
    `${TOKEN_URL}?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
  const resp = await fetchWithTimeout(url, { method: 'POST' });
  const data = (await resp.json().catch(() => null)) as TokenResponse | null;

  if (!data?.access_token) {
    const reason = data?.error_description || data?.error || `HTTP ${resp.status}`;
    throw new OcrError(502, `OCR 换取访问令牌失败：${reason}`);
  }

  // 百度不给 expires_in 时按 30 天算（它默认就是这个值）
  const ttlMs = (data.expires_in ?? 2592000) * 1000;
  return { token: data.access_token, expiresAt: Date.now() + ttlMs };
}

async function getToken(env: OcrEnv, force = false): Promise<string> {
  const stillFresh =
    tokenCache !== null && tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now();
  if (stillFresh && !force) return tokenCache!.token;

  if (force) {
    // 票失效是罕见路径，直接换一张新的，不参与下面的去重
    tokenCache = await fetchToken(env);
    return tokenCache.token;
  }

  // 冷启动时可能有多个请求同时进来，用一个 in-flight promise 挡住重复换票。
  // 缓存写入放在 then 里而不是另起一条支链 —— 旁支没人接，换票失败时会变成
  // unhandled rejection（Node 会直接把它打成一条报错日志）。
  if (!tokenInFlight) {
    tokenInFlight = fetchToken(env)
      .then((result) => {
        tokenCache = result;
        return result;
      })
      .finally(() => {
        tokenInFlight = null;
      });
  }
  return (await tokenInFlight).token;
}

async function callBaidu(
  token: string,
  image: string,
  endpoint: string,
): Promise<BaiduOcrResponse> {
  const resp = await fetchWithTimeout(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: `image=${encodeURIComponent(image)}`,
  });
  return (await resp.json().catch(() => ({}))) as BaiduOcrResponse;
}

interface RecognizeResult {
  words?: string[];
  error?: string;
  /** 票失效了，调用方该换张新票把两条接口重走一遍。 */
  retryWithNewToken?: boolean;
}

async function recognizeOnce(
  env: OcrEnv,
  image: string,
  forceNewToken: boolean,
): Promise<RecognizeResult> {
  const token = await getToken(env, forceNewToken);
  let lastError = '未能识别出任何文字';

  for (const endpoint of ENDPOINTS) {
    const data = await callBaidu(token, image, endpoint);

    if (data.error_code) {
      if (TOKEN_ERROR_CODES.has(data.error_code)) return { retryWithNewToken: true };
      lastError = ERROR_HINTS[data.error_code] ?? `[${data.error_code}] ${data.error_msg ?? ''}`;
      continue;
    }

    const words = (data.words_result ?? []).map((r) => r.words).filter(Boolean);
    if (words.length) return { words };
    lastError = '未能识别出任何文字';
  }

  return { error: lastError };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context: OcrContext): Promise<Response> {
  const env = context.env ?? {};

  let image = '';
  try {
    const body = (await context.request.json()) as { image?: string } | null;
    image = (body?.image ?? '').replace(/^data:image\/\w+;base64,/, '');
  } catch {
    return json({ error: '请求体不是合法的 JSON' }, 400);
  }

  if (!image) return json({ error: '没有收到图片数据' }, 400);
  if (image.length > MAX_IMAGE_BYTES) {
    return json({ error: '图片太大，请裁剪后重试' }, 413);
  }

  try {
    let result = await recognizeOnce(env, image, false);
    if (result.retryWithNewToken) result = await recognizeOnce(env, image, true);

    if (result.retryWithNewToken) {
      return json({ error: 'OCR 服务鉴权失败，请检查百度 OCR 的 API Key / Secret Key' }, 502);
    }
    if (result.error) return json({ error: `OCR 识别失败：${result.error}` }, 502);
    return json({ words: result.words ?? [] });
  } catch (e) {
    if (e instanceof OcrError) return json({ error: e.message }, e.status);
    const name = (e as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return json({ error: 'OCR 识别超时，请检查网络后重试' }, 504);
    }
    return json({ error: `OCR 识别失败：${(e as Error)?.message || e}` }, 502);
  }
}
