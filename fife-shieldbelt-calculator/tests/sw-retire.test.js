/**
 * tests/sw-retire.test.js
 * Host-aware Pages retirement: cleanup SW only on the exact old hostname;
 * normal cache SW on every other host. Run with: node tests/sw-retire.test.js
 */
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import vm from 'vm';

let passed = 0;
let failed = 0;

function check(cond, label) {
  try {
    assert.ok(cond, label);
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function checkEqual(actual, expected, label) {
  try {
    assert.equal(actual, expected, label);
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

const RETIRED_HOST = 'fife-shieldbelt-toolkit.pages.dev';
const NEW_ORIGIN = 'https://resilience-calculator.trigrammatic.com';
const CACHE_VERSION = '1.9.0';

const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const versionSource = readFileSync(new URL('../version.js', import.meta.url), 'utf8');
const headersSource = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const redirectsSource = readFileSync(new URL('../_redirects', import.meta.url), 'utf8');

console.log('\n=== Service worker retire-host tests ===\n');

console.log('--- Source / config contracts ---');
check(
  !/^\s*\/\*\s+https:\/\/resilience-calculator\.trigrammatic\.com\//m.test(redirectsSource),
  '_redirects has no /* catch-all to resilience-calculator (Worker loop)'
);
check(
  /SHIELDBELT_CACHE_VERSION\s*=\s*'1\.9\.0'/.test(versionSource),
  'version.js cache stays at 1.9.0 (not bumped for host-check)'
);
check(
  swSource.includes("Release marker") && swSource.includes('1.9.0'),
  'sw.js release marker still 1.9.0'
);
check(
  !swSource.includes("self.addEventListener('fetch'")
    || swSource.indexOf("isRetiredPagesHost(self.location.hostname)")
      < swSource.indexOf("self.addEventListener('fetch'"),
  'fetch handler is only registered on the non-retired branch'
);
check(
  /\/sw\.js\n(?:[^\n]*\n)*?\s*Cache-Control:\s*[^\n]*\bno-cache\b/.test(headersSource),
  '_headers serves /sw.js with Cache-Control including no-cache'
);
check(
  appSource.includes("location.hostname === 'fife-shieldbelt-toolkit.pages.dev'"),
  'app.js registration skips SW on retired Pages host'
);
check(
  appSource.includes("location.replace(")
    && appSource.includes("'https://resilience-calculator.trigrammatic.com'"),
  'app.js redirects retired host to resilience-calculator.trigrammatic.com'
);

/**
 * Load sw.js under a stubbed ServiceWorkerGlobalScope for the given hostname.
 * Returns listeners + mocks so activate/install can be driven in unit tests.
 */
function loadServiceWorker(hostname) {
  const cacheStore = new Map();
  const deletedCaches = [];
  const navigations = [];
  let unregistered = false;
  let claimed = false;
  let skipWaitingCalled = false;
  const listeners = { install: [], activate: [], fetch: [] };

  const cachesApi = {
    keys: async () => [...cacheStore.keys()],
    delete: async (key) => {
      deletedCaches.push(key);
      return cacheStore.delete(key);
    },
    open: async (name) => {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      const bucket = cacheStore.get(name);
      return {
        addAll: async () => {},
        put: async (req, res) => { bucket.set(String(req), res); },
        match: async () => undefined,
      };
    },
    match: async () => undefined,
  };

  const windowClients = [
    {
      url: `https://${hostname}/plan?biome=east_neuk&farm=general_cropping#out`,
      navigate: async (dest) => {
        navigations.push(dest);
        return null;
      },
    },
  ];

  const selfObj = {
    location: { hostname, origin: `https://${hostname}`, href: `https://${hostname}/` },
    skipWaiting: () => { skipWaitingCalled = true; },
    clients: {
      claim: async () => { claimed = true; },
      matchAll: async () => windowClients,
    },
    registration: {
      unregister: async () => { unregistered = true; return true; },
    },
    addEventListener: (type, handler) => {
      if (listeners[type]) listeners[type].push(handler);
    },
  };

  // Seed a stale cache as a returning visitor would have.
  cacheStore.set('fife-shieldbelt-1.8.0', new Map());
  cacheStore.set(`fife-shieldbelt-${CACHE_VERSION}`, new Map());

  const context = {
    self: selfObj,
    caches: cachesApi,
    importScripts: () => {
      // version.js is evaluated into the same scope
      vm.runInContext(versionSource, context);
    },
    Request: class Request {
      constructor(url, init = {}) {
        this.url = url;
        this.cache = init.cache;
      }
    },
    URL,
    Promise,
    Map,
    console,
    SHIELDBELT_CACHE_VERSION: undefined,
  };
  context.self = new Proxy(selfObj, {
    get(target, prop, receiver) {
      if (prop === 'location' || prop === 'clients' || prop === 'registration'
          || prop === 'skipWaiting' || prop === 'addEventListener') {
        return Reflect.get(target, prop, receiver);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  // Bind addEventListener / skipWaiting through self
  vm.createContext(context);
  // Re-assign after createContext so self stays identity-stable
  context.self = selfObj;
  context.caches = cachesApi;

  vm.runInContext(swSource, context);

  return {
    listeners,
    deletedCaches,
    navigations,
    get unregistered() { return unregistered; },
    get claimed() { return claimed; },
    get skipWaitingCalled() { return skipWaitingCalled; },
    cacheStore,
    async runInstall() {
      const event = {
        waitUntil: (p) => { event._promise = Promise.resolve(p); },
        _promise: Promise.resolve(),
      };
      for (const handler of listeners.install) handler(event);
      await event._promise;
    },
    async runActivate() {
      const pending = [];
      const event = {
        waitUntil: (p) => { pending.push(Promise.resolve(p)); },
      };
      for (const handler of listeners.activate) handler(event);
      await Promise.all(pending);
    },
  };
}

console.log('\n--- Host selection: retired Pages hostname ---');
{
  const sw = loadServiceWorker(RETIRED_HOST);
  checkEqual(sw.listeners.install.length, 1, 'retired host registers install listener');
  checkEqual(sw.listeners.activate.length, 1, 'retired host registers activate listener');
  checkEqual(sw.listeners.fetch.length, 0, 'retired host does not register fetch listener');

  await sw.runInstall();
  check(sw.skipWaitingCalled, 'retired install calls skipWaiting()');

  await sw.runActivate();
  check(sw.deletedCaches.includes('fife-shieldbelt-1.8.0'), 'activate deletes old cache names');
  check(sw.deletedCaches.includes(`fife-shieldbelt-${CACHE_VERSION}`), 'activate deletes current cache names');
  checkEqual(sw.cacheStore.size, 0, 'all CacheStorage entries removed');
  check(sw.claimed, 'activate calls clients.claim()');
  check(sw.unregistered, 'activate unregisters this registration');
  checkEqual(
    sw.navigations[0],
    `${NEW_ORIGIN}/plan?biome=east_neuk&farm=general_cropping#out`,
    'window client navigates to new origin keeping path, query and hash'
  );
}

console.log('\n--- Host selection: normal hosts keep cache SW ---');
for (const host of [
  'resilience-calculator.trigrammatic.com',
  'localhost',
  '127.0.0.1',
  'example.com',
  'fife-shieldbelt-toolkit.siho.workers.dev',
]) {
  const sw = loadServiceWorker(host);
  checkEqual(sw.listeners.fetch.length, 1, `${host}: registers fetch listener`);
  checkEqual(sw.listeners.install.length, 1, `${host}: registers install listener`);
  checkEqual(sw.listeners.activate.length, 1, `${host}: registers activate listener`);

  await sw.runActivate();
  check(!sw.unregistered, `${host}: does not unregister`);
  checkEqual(sw.navigations.length, 0, `${host}: does not navigate clients away`);
  // Normal activate deletes only non-current caches
  check(
    sw.deletedCaches.includes('fife-shieldbelt-1.8.0')
      && !sw.deletedCaches.includes(`fife-shieldbelt-${CACHE_VERSION}`),
    `${host}: activate only drops non-current cache keys`
  );
  check(sw.cacheStore.has(`fife-shieldbelt-${CACHE_VERSION}`), `${host}: keeps current cache`);
}

console.log('\n--- Exact hostname match (no suffix / subdomain tricks) ---');
{
  const nearMiss = loadServiceWorker('preview.fife-shieldbelt-toolkit.pages.dev');
  checkEqual(nearMiss.listeners.fetch.length, 1, 'subdomain of pages.dev uses normal SW');
  checkEqual(nearMiss.navigations.length, 0, 'subdomain is not auto-navigated at load');
  await nearMiss.runActivate();
  check(!nearMiss.unregistered, 'subdomain does not unregister');
}

console.log('\n--- Page registration redirect shape (source contract) ---');
{
  // Mirror the app.js replace target construction for a few URL shapes.
  function pageRedirect(hostname, pathname, search, hash) {
    if (hostname !== RETIRED_HOST) return null;
    return NEW_ORIGIN + pathname + search + hash;
  }
  checkEqual(
    pageRedirect(RETIRED_HOST, '/', '?biome=east_neuk', ''),
    `${NEW_ORIGIN}/?biome=east_neuk`,
    'root + query preserved'
  );
  checkEqual(
    pageRedirect(RETIRED_HOST, '/index.html', '?problem=DROUGHT_BURN&snap=abc', '#brief'),
    `${NEW_ORIGIN}/index.html?problem=DROUGHT_BURN&snap=abc#brief`,
    'path + query + hash preserved'
  );
  checkEqual(
    pageRedirect('resilience-calculator.trigrammatic.com', '/', '?x=1', ''),
    null,
    'new host does not redirect'
  );
  checkEqual(pageRedirect('localhost', '/', '', ''), null, 'localhost does not redirect');
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
