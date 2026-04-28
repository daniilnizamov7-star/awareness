const CACHE_NAME = 'osoznanie-v5';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Удаляем все старые кэши
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Для index.html — всегда сеть, кэш только если нет интернета
  if (e.request.url.endsWith('/') || e.request.url.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // Обновляем кэш свежей версией
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Для остального — кэш сначала (иконки, манифест)
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});