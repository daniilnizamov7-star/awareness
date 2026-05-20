const CACHE_NAME = 'osoznanie-v14';
const ASSETS = ['/manifest.json', '/ayahs.json', '/api/prayer-data.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // НЕ делаем skipWaiting здесь — ждём команды от страницы
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => clients.claim())
  );
});

// Получаем команду от страницы — активируемся немедленно
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // index.html — network-first
  if (url.endsWith('/') || url.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // prayer-data.json — network-first
  if (url.includes('prayer-data.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, res.clone());
            cache.put('/api/prayer-data.json', clone);
          });
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(r => r || caches.match('/api/prayer-data.json'))
        )
    );
    return;
  }

  // Остальное — cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      });
    }).catch(() => caches.match('/index.html'))
  );
});