// ─── 摘录 PWA — Service Worker ────────────────────────────────────────────────
// Cache-first for hashed static assets (immutable), network-first for navigation.
// Module scripts need special handling: the cached response must preserve the
// Content-Type header or Safari's module loader rejects it.

const CACHE_NAME = 'zhai-lu-v5';

self.addEventListener('install', (event) => {
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
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, copy);
          return response;
        } catch {
          const cached = await caches.match(request);
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
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw new Error('No cached fallback for script/style');
        }
      }

      // ── Other assets (images, fonts, etc.) — cache-first ────────────────
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) {
        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, copy);
      }
      return response;
    })(),
  );
});
