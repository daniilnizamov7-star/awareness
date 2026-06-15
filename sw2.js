const CACHE_NAME = 'osoznanie-v20';
const STATIC_ASSETS = ['/manifest.json', '/ayahs.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const res = await fetch('/index.html', { cache: 'no-store' });
        await cache.put('/index.html', res);
      } catch(e) {}
      await cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Запросы с ?v= — версионная проверка, всегда в сеть, не кэшировать
  if (url.searchParams.has('v')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // index.html — network-first
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // prayer-data.json — network-first
  if (url.pathname.includes('prayer-data.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => {
            c.put(e.request, res.clone());
            c.put('/api/prayer-data.json', clone);
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
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      });
    }).catch(() => caches.match('/index.html'))
  );
});