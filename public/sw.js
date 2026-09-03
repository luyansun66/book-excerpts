// ─── 摘录 PWA — Service Worker ────────────────────────────────────────────────
// Cache-first for hashed static assets (immutable), network-first for navigation.
// Module scripts need special handling: the cached response must preserve the
// Content-Type header or Safari's module loader rejects it.

const CACHE_NAME = 'zhai-lu-v10';

// 安装时预缓存核心静态资源，确保离线首次打开不白屏
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest-pwa.json',
  '/icon.svg',
  '/icon-180.png',
  '/icon-512.png',
];

// 判断响应类型是否与请求目的匹配，避免把 Cloudflare 的 HTML 兜底
// 当成 JS/CSS/字体缓存（一旦缓存，页面会静默失败）。
function responseMatchesDestination(request, response) {
  if (!response || !response.ok) return false;
  const type = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
  switch (request.destination) {
    case 'script':
      return type.includes('javascript');
    case 'style':
      return type.includes('css');
    case 'font':
      return type.includes('font');
    case 'image':
      return type.includes('image/');
    default:
      return true;
  }
}

// 缓存写入永远不允许影响网络响应（iOS Cache API 达到配额会抛错）。
async function cacheResponse(request, response) {
  if (!responseMatchesDestination(request, response)) return;
  let copy;
  try {
    copy = response.clone();
  } catch {
    return;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, copy);
  } catch (err) {
    console.warn('[SW] cache write skipped:', err && err.message ? err.message : err);
  }
}

// 只返回类型正确的缓存；旧缓存里若混入了错误类型则删除后继续走网络。
async function findCached(request) {
  try {
    const cached = await caches.match(request);
    if (cached && responseMatchesDestination(request, cached)) return cached;
    if (cached) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(request).catch(() => {});
    }
  } catch {
    // ignore cache read errors and fall through to network
  }
  return undefined;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (url.origin !== location.origin || request.method !== 'GET') return;

  // ── Navigation (HTML documents) ────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          cacheResponse(request, response);
          return response;
        } catch {
          const cached = await findCached(request);
          if (cached) return cached;
          return caches.match('index.html');
        }
      })(),
    );
    return;
  }

  // ── Static assets (JS, CSS, images, fonts) ─────────────────────────────
  event.respondWith(
    (async () => {
      // Network-first for module scripts that might be stale in cache
      // (e.g. dynamically imported chunks). Falls back to cache on failure.
      if (request.destination === 'script' || request.destination === 'style') {
        try {
          const response = await fetch(request);
          cacheResponse(request, response);
          return response;
        } catch {
          const cached = await findCached(request);
          if (cached) return cached;
          throw new Error('No cached fallback for script/style');
        }
      }

      // ── Other assets (images, fonts, etc.) — cache-first ────────────────
      const cached = await findCached(request);
      if (cached) return cached;
      const response = await fetch(request);
      cacheResponse(request, response);
      return response;
    })(),
  );
});
