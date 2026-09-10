/* sw.js — makes Anchor work fully offline after the first load.
   The app has no backend and never makes network calls, so this is a plain
   cache-first service worker over a fixed list of files.

   WHEN YOU SHIP CHANGES: bump CACHE (e.g. anchor-v4). On the next launch the
   new worker installs, wipes the old cache, and the page reloads itself once
   with the fresh files. */

const CACHE = 'anchor-v11';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './core/version.js',
  './core/storage.js',
  './core/utils.js',
  './core/ui.js',
  './core/shell.js',
  './modules/finance.js',
  './modules/family.js',
  './modules/personal.js',
  './modules/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Lets the app show which build the worker is serving (Settings → About).
self.addEventListener('message', (event) => {
  if (event.data === 'version') {
    const reply = { type: 'version', cache: CACHE };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // Cache same-origin successful responses so late-added files stick too.
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline and not cached: for navigations, fall back to the app shell.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
