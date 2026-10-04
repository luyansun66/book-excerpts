// 百度 OCR 的「取票口」：只负责换 access_token，识别本身由浏览器直连百度完成。
//
// 为什么不顺手把识别也代理了（这是踩过坑之后的选择）：
// 函数跑在 Cloudflare 边缘，回源百度要跨太平洋。实测同一张 956KB 的整页图 ——
//   浏览器直连百度（从 luyansun.top 的页面发起）  948 / 803 / 863 ms
//   经 Cloudflare 边缘回源百度                    16.0 / 16.3 / 19.0 s
// 相差 19 倍（那条跨境链路有效吞吐只有 ~50KB/s）。所以识别这一步必须由浏览器直接发起，
// 服务端只保留「换票」—— 这样既不用每月人工换票，又不用付那 19 倍延迟。
//
// 代价要说清楚：token 会暴露给访问者（谁都能调这个接口，或在开发者工具里看到浏览器发给
// 百度的 URL）。能拿它刷我们的额度，但改不了账号、看不到任何用户数据。这和 2026-09 之前
// 「token 直接编进 JS 产物」的暴露程度一样。
//
// 环境变量（Cloudflare Pages 项目 Settings → Environment variables）：
//   BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY

interface TokenEnv {
  BAIDU_OCR_API_KEY?: string;
  BAIDU_OCR_SECRET_KEY?: string;
}

interface TokenContext {
  request: Request;
  env?: TokenEnv;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const TOKEN_TIMEOUT_MS = 10000;
/** 提前一小时换票：免得刚好在到期那一刻发出的请求拿到一张已经作废的票。 */
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

/** 模块作用域缓存只在同一个 isolate 内有效，实例被回收后自然重取，因此不必持久化。 */
let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<{ token: string; expiresAt: number }> | null = null;

/** 仅供测试：清掉模块级票缓存，让每个用例都从「手上没票」开始。 */
export function resetTokenCache(): void {
  tokenCache = null;
  tokenInFlight = null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // 票本身必须现取现用：一旦被缓存层兜住，客户端就会拿到已经作废的票。
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function fetchToken(env: TokenEnv): Promise<{ token: string; expiresAt: number }> {
  const apiKey = env.BAIDU_OCR_API_KEY;
  const secretKey = env.BAIDU_OCR_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error('OCR 未配置：请设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 后重新部署。');
  }

  const url =
    `${TOKEN_URL}?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
  const resp = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });
  const data = (await resp.json().catch(() => null)) as TokenResponse | null;

  if (!data?.access_token) {
    const reason = data?.error_description || data?.error || `HTTP ${resp.status}`;
    throw new Error(`换取百度访问令牌失败：${reason}`);
  }

  // 百度不给 expires_in 时按 30 天算（它默认就是这个值）
  const ttlMs = (data.expires_in ?? 2592000) * 1000;
  return { token: data.access_token, expiresAt: Date.now() + ttlMs };
}

export async function onRequestGet(context: TokenContext): Promise<Response> {
  const env = context.env ?? {};

  const stillFresh =
    tokenCache !== null && tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now();
  if (stillFresh) return json({ token: tokenCache!.token, expiresAt: tokenCache!.expiresAt });

  try {
    // 冷启动时可能有多个请求同时进来，用一个 in-flight promise 挡住重复换票。
    // 缓存写入放在 then 里而不是另起支链 —— 旁支没人接，换票失败会变成 unhandled rejection。
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
    const result = await tokenInFlight;
    return json({ token: result.token, expiresAt: result.expiresAt });
  } catch (e) {
    return json({ error: (e as Error)?.message || '换取百度访问令牌失败' }, 500);
  }
}
