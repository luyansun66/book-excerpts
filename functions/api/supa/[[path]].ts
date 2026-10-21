// /api/supa/* —— 把 Supabase 收到本站域名下，前端不再直连 *.supabase.co。
//
// 为什么需要这一层：登录和云同步原先由浏览器直连 supabase.co。这条跨境链路在国内不是
// 「通 / 不通」，而是「看设备、看网络」—— 2026-10 的反馈就是同一个人手机能登、电脑报
// Failed to fetch，而页面本身（Cloudflare Pages 上的 luyansun.top）打得开，所以用户看到的
// 是「能进 App，一点登录就失败」。改成走本站域名后，登录/同步只需要「能打开本站」这一条
// 链路，不再额外要求设备能连上 supabase.co。
//
// 代价（写清楚，别当成免费）：
//   - 多一跳：用户 → Cloudflare 边缘 → Supabase。这些请求/响应都是几 KB 的 JSON
//     （token、PostgREST 查询），是常量延迟；且 Supabase 对外本来就在 Cloudflare 上，
//     不是 /api/ocr-token 那种「边缘回源百度要跨太平洋」的形态。
//   - 每个请求都算一次 Functions 调用（免费额度 10 万次/天）。
//   - Realtime（WebSocket）不走这里，目前也没在用；哪天要用得单独想办法。
//
// 安全性：这不是开放代理 —— 目标固定为本项目的 Supabase 域名，且只放行 Supabase 自己的
// API 前缀。anon key 本来就公开（早已编进 JS 产物），所以这里没有新增暴露面。
//
// 本地开发由 vite.config.ts 里的中间件接到同一个函数上，和 /api/ocr-token 的做法一致：
// 本地和线上共用一份转发逻辑，不会出现「线上能登、本地不能」这种只在一边复现的问题。

const SUPABASE_ORIGIN = 'https://vnbudeahnuysdbqxtzgk.supabase.co';
const PROXY_PREFIX = '/api/supa';
const UPSTREAM_TIMEOUT_MS = 20000;

/** 只放行 Supabase 自己的 API；白名单之外一律 404，免得这个口子被当成通用代理使。 */
const ALLOWED_PATH = /^\/(auth|rest|storage|functions|realtime)\/v1(\/|$)/;

/** 逐跳首部：只描述「浏览器 ↔ 我们」这一段，转给上游只会添乱。 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

interface ProxyContext {
  request: Request;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequest(context: ProxyContext): Promise<Response> {
  return proxyToSupabase(context.request);
}

/** 转发逻辑本身单独导出：本地 dev / preview 的中间件复用同一份实现。 */
export async function proxyToSupabase(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(PROXY_PREFIX.length);

  if (!ALLOWED_PATH.test(path)) {
    return json({ error: `不支持的路径：${path}` }, 404);
  }

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    // 上游不需要知道「用户从哪个页面发起」；顺带不让本站域名漏进 Supabase 的日志。
    if (lower === 'host' || lower === 'origin' || lower === 'referer') continue;
    headers.set(name, value);
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body;
    // Node 的 fetch（本地 dev 中间件走这条）转发流式请求体时必须声明 duplex，Workers 忽略它
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(SUPABASE_ORIGIN + path + url.search, init);
  } catch (e) {
    const reason = (e as Error)?.message || '未知错误';
    return json({ error: `连不上 Supabase：${reason}` }, 500);
  }

  // 502/503/504 在自定义域名上会被 Cloudflare 换成它自己的品牌错误页（README 里记过这个坑），
  // 用户侧就只剩一句「HTTP 502」，Supabase 的原话全丢。统一降级成 500，把正文留下来。
  if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: `Supabase 返回 ${upstream.status}`, detail: detail.slice(0, 500) }, 500);
  }

  // 状态码和正文原样透传：supabase-js 靠状态码 + 正文里的 error/msg 判断成败
  // （「密码错了」是 400 invalid_credentials），这里改一下就会变成另一个错误。
  return new Response(upstream.body, upstream);
}
