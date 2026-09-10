interface CoverContext {
  request: Request;
}

const ALLOWED_HOSTS = new Set(['books.google.com', 'covers.openlibrary.org']);

// 豆瓣图床是分片的（img1…img9.doubanio.com），而且按 Referer 拦人：
// 不带 Referer 请求会得到 418，带上才返回图片。
const DOUBAN_IMG_HOST = /^img\d+\.doubanio\.com$/;
const DOUBAN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://book.douban.com/',
};

/** 有的图床「没有封面」时不给 404，而是给一张 1×1 的透明 GIF（43 字节）。
 *  原样透传的话前端会拿到一张「合法但看不见」的图，看起来就是一片空白，
 *  比明确的空封面框更像故障；这里统一转成 404，让前端只处理一种情况。 */
const TINY_PLACEHOLDER_BYTES = 1024;

export async function onRequestGet(context: CoverContext): Promise<Response> {
  const url = new URL(context.request.url);
  const rawUrl = url.searchParams.get('url');

  if (!rawUrl) {
    return new Response('missing url', { status: 400 });
  }

  let remote: URL;
  try {
    remote = new URL(rawUrl);
  } catch {
    return new Response('invalid url', { status: 400 });
  }

  const isDouban = DOUBAN_IMG_HOST.test(remote.hostname);
  if (!ALLOWED_HOSTS.has(remote.hostname) && !isDouban) {
    return new Response('forbidden host', { status: 400 });
  }

  if (remote.protocol === 'http:') {
    remote.protocol = 'https:';
  }

  const upstream = await fetch(remote.toString(), {
    headers: { Accept: 'image/*', ...(isDouban ? DOUBAN_HEADERS : {}) },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('cover fetch failed', { status: 502 });
  }

  const contentType = upstream.headers.get('Content-Type') ?? 'image/jpeg';
  const declaredLength = Number(upstream.headers.get('Content-Length') ?? '0');

  if (
    contentType.startsWith('image/gif') &&
    declaredLength > 0 &&
    declaredLength < TINY_PLACEHOLDER_BYTES
  ) {
    return new Response('no cover', { status: 404 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
