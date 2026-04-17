/**
 * sw.js — Service Worker for Fife ShieldBelt Calculator
 * Cache name: fife-shieldbelt-v2
 * Strategy: Cache-first for assets; network-first for data files.
 */

const CACHE_NAME = 'fife-shieldbelt-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/db.js',
  '/calc.js',
  '/charts.js',
  '/styles/main.css',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/data/fife_interventions_db_v2.json',
  '/data/problems.json',
];

// ── Install: pre-cache all listed assets ────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old cache versions ─────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for same-origin assets ────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first for data files (keep fresh when online)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});
