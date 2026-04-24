/**
 * sw.js — Service Worker for Fife Farm Resilience Calculator
 * Strategy: Cache-first for assets; network-first for data files.
 * Bump SHIELDBELT_CACHE_VERSION in version.js on every deploy.
 */

importScripts('version.js');

const CACHE_NAME = 'fife-shieldbelt-' + SHIELDBELT_CACHE_VERSION;

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
  '/data/fife_interventions_db_v9.json',
  '/data/problems_v2.json',
];

// ── Install: pre-cache all listed assets ────────────────────────────────────
self.addEventListener('install', event => {
  // Take over immediately; do not wait for tabs to close (pairs with clients.claim in activate).
  self.skipWaiting();
  // FIX [sw-update]: use cache:'reload' so the SW always fetches fresh asset
  // bytes from the network, bypassing the browser's HTTP cache.  Without this,
  // cache.addAll() can silently store a previously-cached (stale) db.js inside
  // the new SW cache, perpetuating the old broken version.
  const freshRequests = PRECACHE.map(url => new Request(url, { cache: 'reload' }));
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(freshRequests))
  );
});

// ── Activate: delete old cache versions and claim all clients ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
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
