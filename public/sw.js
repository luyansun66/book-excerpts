// ─── 摘录 PWA — Service Worker ────────────────────────────────────────────────
// Cache-first for static assets (hashed filenames = immutable),
// network-first for navigation (always show latest, fallback to cache).

const CACHE_NAME = 'zhai-lu-v2';

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
