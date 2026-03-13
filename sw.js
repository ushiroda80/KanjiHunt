const CACHE_NAME = 'kanji-hunt-v2.29.0';
const CACHE_URLS = [
  './',
  './kanji-hunt.html',
  './manifest.json',
  './icon-512.svg',
];

// Install: cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first for API calls, cache first for app shell
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Always go to network for API calls
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('fonts.googleapis.com')) {
    return;
  }
  
  // Cache first for app shell
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
