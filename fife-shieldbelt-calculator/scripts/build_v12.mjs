#!/usr/bin/env node
/**
 * Build data/fife_interventions_db_v12.json from v11 (4 Nov 2026).
 *
 * Changes (decisions recorded in claude/hedgerow-variant-menu-v3-proposal-2026-11-04.md):
 *  - Hedges are specified by two widths: the hedge as managed and the strip taken out of production.
 *    The v11 hedges (2. Dense Wildlife Hedge, 3. Heritage Species Hedge) are replaced in every biome by the
 *    curated presets HV1-HV8 built with hedge-config.js, which the calculator also uses live for its toggles.
 *  - Income forgone for hedges follows the strip width (0.3-1.2 ha/km) instead of a flat 3 m.
 *  - Water values for every record use the Stutter et al. 2021 width regressions for sediment and total P;
 *    nitrate is no longer valued (width explains 8% of its variation). Delivery factors and prices unchanged.
 *  - Hedge biodiversity: SSE Biodiversity Toolkit v1.0 screening units (hedgerow and margin) per record.
 * Run from fife-shieldbelt-calculator/:  node scripts/build_v12.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PRESETS, buildHedgeRecord, templateFromV11, waterValues, WATER_BASIS, DEFAULT_PRESET } from '../hedge-config.js';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(HERE, 'data', 'fife_interventions_db_v11.json');
const OUT = path.join(HERE, 'data', 'fife_interventions_db_v12.json');

const db = JSON.parse(readFileSync(SRC, 'utf8'));
const byBiome = new Map();
for (const r of db.interventions) {
  if (!byBiome.has(r.biome)) byBiome.set(r.biome, []);
  byBiome.get(r.biome).push(r);
}

const templates = {};
const out = [];
const waterChanges = [];
for (const [biome, recs] of byBiome) {
  const dense = recs.find(r => r.variant === '2. Dense Wildlife Hedge');
  const heritage = recs.find(r => r.variant === '3. Heritage Species Hedge');
  if (!dense || !heritage) throw new Error(`hedge records missing for ${biome}`);
  const tpl = templateFromV11(dense, heritage);
  templates[biome] = tpl;
  for (const r0 of recs) {
    if (r0 === heritage) continue;
    if (r0 === dense) {
      for (const p of PRESETS) out.push(buildHedgeRecord(tpl, p));
      continue;
    }
    const r = structuredClone(r0);
    const w = parseInt(r.width, 10);
    const wv = waterValues(w);
    const cv = r.crewValuations;
    for (const pl of ['riparian', 'crossSlope', 'downSlope']) {
      if (biome === 'Fife (East Neuk Coast)') waterChanges.push({ variant: r.variant, width: r.width, placement: pl, v11: cv[pl + 'Total'], v12: wv[pl], v11High: cv[pl + 'TotalHigh'], v12High: wv[pl + 'High'] });
      cv.waterPurification[pl] = wv[pl];
      cv.waterPurification[pl + 'High'] = wv[pl + 'High'];
      cv[pl + 'Total'] = wv[pl];
      cv[pl + 'TotalHigh'] = wv[pl + 'High'];
    }
    cv.waterPurification.basis = WATER_BASIS;
    out.push(r);
  }
}

const md = db.metadata;
md.version = '12.3';
md.last_updated = '2026-11-04';
md.units['width'] = 'strip width in metres: land taken out of production (for hedges, the hedge width is hedgeConfig.hedgeWidthM)';
md.units['hedgeOutputs.biodiversity.hluPerKm'] = 'SSE Biodiversity Toolkit v1.0 hedgerow units per km (screening; Moderate and Good condition)';
md.units['hedgeOutputs.biodiversity.marginBuPerKm'] = 'SSE Biodiversity Toolkit v1.0 area units per km for the grass margin (screening)';
md.sources.waterValues = '4 Nov 2026 (v12): ' + WATER_BASIS;
md.sources.hedgeOptions = 'hedge-config.js v12 (4 Nov 2026): hedge width vs strip width (EFA greening guidance 2026; GAEC 7; AECS option pages dated 15 Dec 2025; '
  + 'MOREhedges); SSE Biodiversity Toolkit v1.0; Van Vooren et al. 2017; Cole et al. 2020; Stutter et al. 2021. Presets HV1-HV8 agreed 4 Nov 2026.';
md.hedgePresets = PRESETS.map(p => ({ code: p.code, name: p.name, form: p.form, species: p.species, trees: p.trees, stripM: p.stripM, position: p.position, summary: p.summary }));
md.hedgeDefaultPreset = DEFAULT_PRESET;
md.hedgeTemplates = templates;
md.notes = [...(md.notes || []),
  'v12 (4 Nov 2026): hedges replaced by the HV1-HV8 presets and a configurator (form, species, trees, strip width, position); water values rebuilt from Stutter et al. 2021 for all records; nitrate not valued.'];
db.interventions = out;
writeFileSync(OUT, JSON.stringify(db, null, 2) + '\n');
writeFileSync(path.join(HERE, 'scripts', 'v12-water-changes-east-neuk.json'), JSON.stringify(waterChanges, null, 1) + '\n');
console.log('wrote', OUT, out.length, 'records;', [...byBiome.keys()].length, 'biomes');
