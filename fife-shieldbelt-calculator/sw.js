/**
 * sw.js — Service Worker for Fife Landscape Resilience Calculator
 * Strategy: Cache-first for assets; network-first for data files.
 * Bump SHIELDBELT_CACHE_VERSION in version.js on every deploy.
 * Release marker (keep in sync with version.js so SW byte-diff always fires): 1.9.0
 *
 * Retired Pages origin: on fife-shieldbelt-toolkit.pages.dev only, this script
 * clears Cache Storage, unregisters, and sends open windows to the Worker host.
 * Cache version is intentionally not bumped for that host-check change.
 */

importScripts('version.js');

const RETIRED_PAGES_HOST = 'fife-shieldbelt-toolkit.pages.dev';
const NEW_CALCULATOR_ORIGIN = 'https://resilience-calculator.trigrammatic.com';

function isRetiredPagesHost(hostname) {
  return hostname === RETIRED_PAGES_HOST;
}

function retireNavigateUrl(clientUrl) {
  const u = new URL(clientUrl);
  return NEW_CALCULATOR_ORIGIN + u.pathname + u.search + u.hash;
}

async function retireOldPagesOrigin() {
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
  const windowClients = await self.clients.matchAll({ type: 'window' });
  await Promise.all(
    windowClients.map(client => client.navigate(retireNavigateUrl(client.url)))
  );
}

// ── Retired Pages host: clear SW + caches, then send visitors to the new origin ─
if (isRetiredPagesHost(self.location.hostname)) {
  self.addEventListener('install', () => {
    self.skipWaiting();
  });

  self.addEventListener('activate', event => {
    event.waitUntil(retireOldPagesOrigin());
  });
} else {
  const CACHE_NAME = 'fife-shieldbelt-' + SHIELDBELT_CACHE_VERSION;

  const PRECACHE = [
    '/',
    '/index.html',
    '/app.js',
    '/db.js',
    '/calc.js',
    '/scenario.js',
    '/hedge-config.js',
    '/charts.js',
    '/url-snapshot.js',
    '/styles/main.css',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
    '/images/funders/heritage-fund-stamp-gd-en.png',
    '/images/funders/scotgov-naturescot-lockup.png',
    '/data/fife_interventions_db_v12.json',
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
}
