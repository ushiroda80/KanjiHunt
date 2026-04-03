// v4 — clears all old caches from kanji-hunt.html era
const CACHE_NAME = 'kanji-hunt-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// No offline caching — pass all requests through
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
