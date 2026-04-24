/**
 * db.js — Fife Farm Resilience Calculator
 *
 * Data layer: fetches /data/fife_interventions_db_v9.json once per page load
 * and holds all 132 records in a plain JS array.  The service worker caches
 * the JSON so subsequent loads are instant (no network request).
 *
 * This replaces the previous IndexedDB implementation.  IndexedDB added
 * significant complexity (versionchange transactions, seeding races, private-
 * mode quirks) with no real benefit — the SW cache already provides fast
 * offline-capable asset storage.
 *
 * Public API is identical to the IndexedDB version so app.js is unchanged.
 */

// ---------------------------------------------------------------------------
// Domain constants
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

export const WIDTHS = ['3m', '6m', '12m', '20m', '60m'];

/** Allowed SSER gross units/km in v9 data (used by validateStore). */
export const SSER_TIERS = [8.4, 16.8, 24, 31.5, 34.8, 39, 40.2, 46.8, 62.4, 78, 108, 138, 150, 280, 806.4];

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/** @type {Object[]} */
let _records = [];

// ---------------------------------------------------------------------------
// dbReady — single fetch, populated once, awaited by app.js before any query
// ---------------------------------------------------------------------------

/**
 * Resolves when all 132 records are loaded into memory.
 * The service worker caches this file so subsequent page loads are instant.
 * @type {Promise<void>}
 */
export const dbReady = fetch('/data/fife_interventions_db_v9.json')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status} loading intervention data`);
    return res.json();
  })
  .then(json => {
    _records = Array.isArray(json) ? json : (json.interventions ?? []);
    console.info(`FifeShieldBelt: ${_records.length} records loaded`);
  })
  .catch(err => {
    console.error('FifeShieldBelt: failed to load intervention data:', err);
    // Re-throw so app.js catch block can handle the error state gracefully.
    throw err;
  });

// ---------------------------------------------------------------------------
// Public query API  (mirrors the old IndexedDB API — app.js unchanged)
// ---------------------------------------------------------------------------

/**
 * Return all 132 intervention records.
 * @returns {Promise<Object[]>}
 */
export async function getAll() {
  await dbReady;
  return _records.slice();
}

/**
 * Return all records for a given biome (should be 22).
 * @param {string} biomeName — one of the BIOMES values
 * @returns {Promise<Object[]>}
 */
export async function getByBiome(biomeName) {
  await dbReady;
  return _records.filter(r => r.biome === biomeName);
}

/**
 * Return a single record by its string id.
 * Resolves to undefined if not found.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export async function getById(id) {
  await dbReady;
  return _records.find(r => r.id === id);
}

/**
 * Return sorted list of unique biome names present in the data.
 * @returns {Promise<string[]>}
 */
export async function getBiomes() {
  await dbReady;
  return [...new Set(_records.map(r => r.biome))].sort();
}

// ---------------------------------------------------------------------------
// Validation helper (used by tests/calc.test.js)
// ---------------------------------------------------------------------------

/**
 * Validate loaded records against v2 schema rules.
 * Logs a summary; resolves to an array of error strings.
 * @returns {Promise<string[]>}
 */
export async function validateStore() {
  await dbReady;
  const errors = [];

  const VALID_WIDTHS   = new Set(WIDTHS);
  const VALID_SSER     = new Set(SSER_TIERS);
  const REQUIRED_FARMS = new Set(FARM_TYPES);
  const VALID_ID_RE    = /^[a-z0-9_]+$/;

  if (_records.length !== 132) {
    errors.push(`Record count: expected 132, got ${_records.length}`);
  }

  const biomeCounts = {};
  for (const r of _records) {
    biomeCounts[r.biome] = (biomeCounts[r.biome] ?? 0) + 1;
  }
  for (const [biome, count] of Object.entries(biomeCounts)) {
    if (count !== 22) errors.push(`Biome "${biome}": expected 22, got ${count}`);
  }

  for (const r of _records) {
    const p = `[${r.id ?? 'NO_ID'}]`;
    if (!r.id || !VALID_ID_RE.test(r.id))     errors.push(`${p} invalid id`);
    if (!VALID_WIDTHS.has(r.width))            errors.push(`${p} invalid width: ${r.width}`);
    if (typeof r.seq50yrTotal !== 'number')    errors.push(`${p} seq50yrTotal missing`);
    if (!r.farmImpacts)                        errors.push(`${p} farmImpacts missing`);
    if (!r.economicAssessment)                 errors.push(`${p} economicAssessment missing`);
    if (!r.advancedEcosystemServices)          errors.push(`${p} advancedEcosystemServices missing`);
    if (!r.registry)                           errors.push(`${p} registry missing`);
    const sser = r.registry?.sserGrossUnitsPerKm;
    if (typeof sser !== 'number' || !Number.isFinite(sser) || sser < 0) {
      errors.push(`${p} sserGrossUnitsPerKm invalid: ${sser}`);
    } else if (!VALID_SSER.has(sser)) {
      errors.push(`${p} sserGrossUnitsPerKm not in v9 tier list: ${sser}`);
    }
    for (const ft of REQUIRED_FARMS) {
      if (!r.farmImpacts?.[ft]) errors.push(`${p} farmImpacts missing "${ft}"`);
    }
  }

  if (errors.length === 0) {
    console.info('✅ FifeShieldBelt data validation passed — 132 records, all fields valid.');
  } else {
    console.warn(`⚠️ FifeShieldBelt data validation: ${errors.length} error(s).`);
    console.table(errors.map((e, i) => ({ '#': i + 1, error: e })));
  }
  return errors;
}
