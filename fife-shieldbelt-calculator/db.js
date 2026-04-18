/**
 * db.js — Fife ShieldBelt Calculator
 * IndexedDB layer: seeds from fife_interventions_db_v2.json on first load,
 * then serves all intervention lookups from the local store.
 *
 * DB_VERSION = 2 forces onupgradeneeded in any browser that cached v1.
 *
 * Author: NFCA / Fife ShieldBelt project
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME    = 'FifeShieldBelt';
const DB_VERSION = 3;   // FIX [cloudflare/indexeddb]: bumped from 2→3 to force re-seed
const STORE      = 'interventions';

// ---------------------------------------------------------------------------
// Domain constants — exported for use throughout the app
// ---------------------------------------------------------------------------

export const BIOMES = {
  EAST_NEUK:   'Fife (East Neuk Coast)',
  FORTH_URBAN: 'Fife (Forth Urban Coast)',
  HOWE:        'Fife (Howe of Fife & Eden)',
  LOMOND:      'Fife (Lomond & Cleish Uplands)',
  NORTH_FIFE:  'Fife (North Fife Hills & Tay)',
  WEST_CLAY:   'Fife (West Fife Claylands)',
};

export const FARM_TYPES = ['Cereals', 'General Cropping', 'Dairy', 'LFA Grazing'];

export const WIDTHS = ['3m', '6m', '12m', '20m'];

/** The 9 discrete SSER tier values used across all 35 variants */
export const SSER_TIERS = [3.96, 5.28, 7.92, 10.56, 11.88, 15.84, 19.8, 23.76, 39.6];

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** @type {IDBDatabase|null} */
let _db = null;

// ---------------------------------------------------------------------------
// Core open / seed
// ---------------------------------------------------------------------------

/**
 * Open the IndexedDB, creating and seeding it if this is a fresh install
 * or a DB_VERSION upgrade. Resolves to the open IDBDatabase.
 *
 * FIX [cloudflare/indexeddb]: The onupgradeneeded event handler must be
 * synchronous.  IndexedDB's versionchange transaction auto-commits as soon as
 * the synchronous handler returns, so any async/await or fetch() inside it
 * will be executing against a closed transaction — causing silent failures
 * (no records stored, app stalls at loading screen).
 *
 * Correct pattern: pre-fetch seed data BEFORE calling indexedDB.open(),
 * then seed synchronously inside onupgradeneeded using the data already in memory.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);

  // Step 1 — pre-fetch seed data so it is available synchronously during
  // onupgradeneeded.  On returning visits the service worker serves this
  // from cache (~instant).  On first visit it downloads once, then caches.
  return fetch('/data/fife_interventions_db_v2.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching interventions DB`);
      return res.json();
    })
    .then(json => {
      const seedRecords = Array.isArray(json) ? json : (json.interventions ?? []);
      console.info(`FifeShieldBelt: fetched ${seedRecords.length} seed records`);
      return _openIndexedDB(seedRecords);
    })
    .catch(fetchErr => {
      // Fetch failed (offline, first load).  Try to open the DB anyway —
      // it may already be seeded from a previous visit.
      console.warn('FifeShieldBelt: seed fetch failed, opening DB without re-seed:', fetchErr);
      return _openIndexedDB([]);
    });
}

/**
 * Internal: open (and optionally seed) the IndexedDB with pre-fetched records.
 * onupgradeneeded is synchronous — no async, no await.
 *
 * @param {Object[]} seedRecords  Already-fetched records (may be [] on offline re-open)
 * @returns {Promise<IDBDatabase>}
 */
function _openIndexedDB(seedRecords) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // -----------------------------------------------------------------------
    // Schema creation / migration — MUST be synchronous
    // -----------------------------------------------------------------------
    req.onupgradeneeded = (event) => {            // NOT async
      const db     = event.target.result;
      const oldVer = event.oldVersion;

      // Drop the old store when upgrading from a previous version
      if (oldVer > 0 && db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }

      // Create the interventions store keyed on 'id'
      const store = db.createObjectStore(STORE, { keyPath: 'id' });

      // Index on biome for fast getByBiome() queries
      store.createIndex('by_biome', 'biome', { unique: false });

      // Seed synchronously — all puts happen within the still-open
      // versionchange transaction, before it auto-commits on return.
      if (seedRecords.length) {
        const tx = event.target.transaction;
        for (const record of seedRecords) {
          tx.objectStore(STORE).put(record);
        }
        console.info(`FifeShieldBelt DB v${DB_VERSION} seeded: ${seedRecords.length} records`);
      } else {
        console.warn('FifeShieldBelt DB upgrade ran but no seed records were available.');
      }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };
      console.info('FifeShieldBelt DB: loaded v' + DB_VERSION);
      resolve(_db);
    };

    req.onerror = (event) => {
      console.error('FifeShieldBelt DB open error:', event.target.error);
      reject(event.target.error);
    };

    req.onblocked = () => {
      console.warn('FifeShieldBelt DB upgrade blocked — close other tabs and reload.');
    };
  });
}

/**
 * dbReady — Promise that resolves once the DB is open and seeded.
 * app.js awaits this before any first calculation.
 */
export const dbReady = openDB();

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Return the open DB instance, throwing if openDB() has not yet been awaited.
 * @returns {IDBDatabase}
 */
function requireDB() {
  if (!_db) throw new Error('FifeShieldBelt DB is not open yet — await dbReady first.');
  return _db;
}

/**
 * Wrap an IDBRequest in a Promise.
 * @template T
 * @param {IDBRequest} req
 * @returns {Promise<T>}
 */
function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

/**
 * Return all 120 intervention records.
 * @returns {Promise<Object[]>}
 */
export async function getAll() {
  const db  = requireDB();
  const tx  = db.transaction(STORE, 'readonly');
  return promisify(tx.objectStore(STORE).getAll());
}

/**
 * Return all records for a given biome (should be 20).
 * @param {string} biomeName — one of the BIOMES values
 * @returns {Promise<Object[]>}
 */
export async function getByBiome(biomeName) {
  const db    = requireDB();
  const tx    = db.transaction(STORE, 'readonly');
  const index = tx.objectStore(STORE).index('by_biome');
  return promisify(index.getAll(biomeName));
}

/**
 * Return a single record by its string id.
 * Resolves to undefined if not found.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export async function getById(id) {
  const db = requireDB();
  const tx = db.transaction(STORE, 'readonly');
  return promisify(tx.objectStore(STORE).get(id));
}

/**
 * Return the list of unique biome names present in the store.
 * @returns {Promise<string[]>}
 */
export async function getBiomes() {
  const db     = requireDB();
  const tx     = db.transaction(STORE, 'readonly');
  const index  = tx.objectStore(STORE).index('by_biome');
  const biomes = [];

  return new Promise((resolve, reject) => {
    const req = index.openKeyCursor(null, 'nextunique');
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        biomes.push(cursor.key);
        cursor.continue();
      } else {
        resolve(biomes.sort());
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Validation helpers (dev / testing use)
// ---------------------------------------------------------------------------

/**
 * Validate that every record in the store satisfies the v2 schema rules.
 * Logs a summary table to the console; resolves to an array of error strings.
 * @returns {Promise<string[]>}
 */
export async function validateStore() {
  const records = await getAll();
  const errors  = [];

  const VALID_WIDTHS   = new Set(WIDTHS);
  const VALID_SSER     = new Set(SSER_TIERS);
  const REQUIRED_FARMS = new Set(FARM_TYPES);
  const VALID_ID_RE    = /^[a-z0-9_]+$/;

  // Check record count
  if (records.length !== 120) {
    errors.push(`Record count: expected 120, got ${records.length}`);
  }

  // Check per-biome counts
  const biomeCounts = {};
  for (const r of records) {
    biomeCounts[r.biome] = (biomeCounts[r.biome] ?? 0) + 1;
  }
  for (const [biome, count] of Object.entries(biomeCounts)) {
    if (count !== 20) errors.push(`Biome "${biome}": expected 20 records, got ${count}`);
  }

  for (const r of records) {
    const prefix = `[${r.id ?? 'NO_ID'}]`;

    // id
    if (!r.id || !VALID_ID_RE.test(r.id)) {
      errors.push(`${prefix} invalid id (must be lowercase+underscores)`);
    }

    // width
    if (!VALID_WIDTHS.has(r.width)) {
      errors.push(`${prefix} invalid width: "${r.width}"`);
    }

    // carbonSequestration
    const cs = r.carbonSequestration ?? {};
    const csPeriods = ['yr_1_5','yr_6_10','yr_11_15','yr_16_20','yr_21_25',
                       'yr_26_30','yr_31_35','yr_36_40','yr_41_45','yr_46_50'];
    let csSum = 0;
    for (const key of csPeriods) {
      if (typeof cs[key] !== 'number' || cs[key] < 0) {
        errors.push(`${prefix} carbonSequestration.${key} invalid`);
      } else {
        csSum += cs[key];
      }
    }

    // seq50yrTotal cross-check (within floating-point tolerance)
    if (typeof r.seq50yrTotal !== 'number') {
      errors.push(`${prefix} seq50yrTotal missing`);
    } else if (Math.abs(r.seq50yrTotal - csSum) > 0.01) {
      errors.push(`${prefix} seq50yrTotal mismatch: stored ${r.seq50yrTotal}, computed ${csSum.toFixed(2)}`);
    }

    // sepaMetrics — all scores 0–100
    for (const placement of ['riparian','crossSlope','downSlope']) {
      const sm = r.sepaMetrics?.[placement] ?? {};
      for (const metric of ['floodControl','sedimentTrapping','nutrientRetention']) {
        const v = sm[metric];
        if (typeof v !== 'number' || v < 0 || v > 100) {
          errors.push(`${prefix} sepaMetrics.${placement}.${metric} out of range`);
        }
      }
    }

    // crewValuations totals ≥ 0
    for (const key of ['riparianTotal','crossSlopeTotal','downSlopeTotal']) {
      if (typeof r.crewValuations?.[key] !== 'number' || r.crewValuations[key] < 0) {
        errors.push(`${prefix} crewValuations.${key} invalid`);
      }
    }

    // crewValuations sub-objects
    for (const subKey of ['airFiltration','catchmentHydrology','waterPurification']) {
      if (!r.crewValuations?.[subKey]) {
        errors.push(`${prefix} crewValuations.${subKey} missing`);
      }
    }

    // farmImpacts — all 4 farm types
    for (const ft of REQUIRED_FARMS) {
      const fi = r.farmImpacts?.[ft];
      if (!fi) {
        errors.push(`${prefix} farmImpacts missing farm type "${ft}"`);
      } else {
        for (const field of ['pollinationValue','grossIncomeForegone','netIncomeForegone']) {
          if (typeof fi[field] !== 'number') {
            errors.push(`${prefix} farmImpacts.${ft}.${field} not a number`);
          }
        }
      }
    }

    // economicAssessment
    if (!r.economicAssessment) {
      errors.push(`${prefix} economicAssessment missing`);
    }

    // advancedEcosystemServices
    const aes = r.advancedEcosystemServices;
    if (!aes) {
      errors.push(`${prefix} advancedEcosystemServices missing`);
    } else {
      const fio = aes.fioTrappingEfficiency;
      if (typeof fio !== 'number' || fio < 0 || fio > 100) {
        errors.push(`${prefix} fioTrappingEfficiency out of range`);
      }
    }

    // registry — 11 required fields
    const REGISTRY_KEYS = [
      'soilTypeCondition','plantingRegime','maintenanceRegime','rootArchitecture',
      'biodiversityImpacts','waterImpacts','carbonAgronomicAssumptions',
      'agronomicUtility','regulatoryAlignment','additionality','sserGrossUnitsPerKm',
    ];
    for (const key of REGISTRY_KEYS) {
      if (r.registry?.[key] === undefined) {
        errors.push(`${prefix} registry.${key} missing`);
      }
    }
    if (!VALID_SSER.has(r.registry?.sserGrossUnitsPerKm)) {
      errors.push(`${prefix} registry.sserGrossUnitsPerKm not a valid tier: ${r.registry?.sserGrossUnitsPerKm}`);
    }
  }

  if (errors.length === 0) {
    console.info('✅ FifeShieldBelt DB v2 validation passed — 120 records, all fields valid.');
  } else {
    console.warn(`⚠️ FifeShieldBelt DB v2 validation: ${errors.length} error(s) found.`);
    console.table(errors.map((e, i) => ({ '#': i + 1, error: e })));
  }

  return errors;
}
