const CACHE_NAME = 'safegait-v2-ultra-lite'; // Changez v1 par v2 ici
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force la nouvelle version immédiatement
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});