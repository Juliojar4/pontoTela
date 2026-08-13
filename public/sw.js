const CACHE = 'dooh-media-v1';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/uploads/')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;                 // ja em cache -> serve offline
        try {
          const resp = await fetch(e.request);
          cache.put(e.request, resp.clone());      // baixa e guarda
          return resp;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
  }
});
