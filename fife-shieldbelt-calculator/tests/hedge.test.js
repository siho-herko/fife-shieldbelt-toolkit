/**
 * tests/hedge.test.js — v12 hedge configurator (hedge-config.js) and v12 data integrity.
 * Run with: node tests/hedge.test.js
 */
import { readFileSync } from 'fs';
import {
  hedgeCarbon, waterValues, retention, sseUnits, geometry, normaliseConfig, minStripM, buildHedgeRecord,
  PRESETS, DEFAULT_PRESET, configKey, parseConfigKey, presetForConfig, incomeForgone, marginSoilCarbon,
} from '../hedge-config.js';
import { calculate, hedgeSummary } from '../calc.js';

const db = JSON.parse(readFileSync('./data/fife_interventions_db_v12.json', 'utf8'));
const recs = db.interventions;
const profiles = JSON.parse(readFileSync('./scripts/hedge-carbon-profiles.json', 'utf8'));
let passed = 0, failed = 0;
function assert(c, label, exp, act) {
  if (c) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}${exp !== undefined ? `  expected: ${exp}  got: ${act}` : ''}`); failed++; }
}
const near = (a, b, t = 0.05) => Math.abs(a - b) <= t;
const cfg = (o = {}) => ({ form: 'double', species: 'speciesRich', trees: 'none', stripM: 6, position: 'boundary', ...o });

console.log('\n=== v12 hedge configurator tests ===\n');

console.log('--- 1. Carbon: JS port reproduces hedge_carbon_model.py v2 ---');
for (const [name, crown, harvested] of [['Dense Wildlife Hedge', 2, false], ['Heritage Species Hedge', 3, false], ['Productive Hedge (4.2 m, scenario)', 4.2, true]]) {
  const p = profiles[name], k = hedgeCarbon(crown, harvested);
  assert(near(k.gross50, p.gross_50yr_tCO2e_per_km), `${crown} m crown gross 50 yr = ${p.gross_50yr_tCO2e_per_km}`, p.gross_50yr_tCO2e_per_km, k.gross50);
  assert(k.bands.every((b, i) => near(b, p.bands_tCO2e_per_km[i], 0.011)), `${crown} m crown 5-yr bands match the Python ledger`);
  assert(near(k.pools50.AGB, p.pools_50yr_tCO2e_per_km.AGB) && near(k.pools50.SOC, p.pools_50yr_tCO2e_per_km.SOC), `${crown} m crown pools match`);
  if (harvested) assert(near(k.claim50, p.feedstock_scenario_50yr_tCO2e_per_km), `productive claim (soil + roots) = ${p.feedstock_scenario_50yr_tCO2e_per_km}`, p.feedstock_scenario_50yr_tCO2e_per_km, k.claim50);
}
assert(near(hedgeCarbon(4.2, true).claimBands.reduce((a, b) => a + b, 0), 41.2, 0.1), 'productive claim bands sum to the claim');

console.log('\n--- 2. Water (Stutter et al. 2021 width-only fits) ---');
assert(Math.round(retention(3, 'sed') * 100) === 76 && Math.round(retention(3, 'P') * 100) === 55, '3 m: sediment 76%, TP 55%');
assert(Math.round(retention(12, 'sed') * 100) === 84 && Math.round(retention(12, 'P') * 100) === 76, '12 m: sediment 84%, TP 76%');
const w3 = waterValues(3);
assert(w3.crossSlope === 130 && w3.riparian === 260 && w3.crossSlopeHigh === 510, '3 m: £130 cross-slope, £260 riparian, £510 high', '130/260/510', `${w3.crossSlope}/${w3.riparian}/${w3.crossSlopeHigh}`);
assert([3, 6, 8, 10, 12, 20, 60].every((w, i, a) => i === 0 || waterValues(w).riparian >= waterValues(a[i - 1]).riparian), 'water value never falls as the strip widens');

console.log('\n--- 3. SSE Biodiversity Toolkit v1.0 units ---');
assert(near(sseUnits(cfg()).hluPerKm.moderate, 6.70, 0.005), 'species-rich: 6.70 HLU/km at Moderate');
assert(near(sseUnits(cfg({ species: 'native' })).hluPerKm.moderate, 3.35, 0.005), 'native: 3.35 HLU/km (half)');
assert(near(sseUnits(cfg({ trees: 'standards' })).hluPerKm.moderate, 9.24, 0.005), 'species-rich with trees: 9.24 (High, connectivity 1.1)');
assert(near(sseUnits(cfg({ species: 'native', trees: 'standards' })).hluPerKm.moderate, 5.60, 0.005), 'native with trees: 5.60 (Medium, 10 yrs)');
assert(near(sseUnits(cfg()).marginBuPerKm.arableMargin, 0.93, 0.005), 'HV2 margin: 0.93 BU/km as arable margin');
assert(sseUnits(cfg({ stripM: 10 })).hluPerKm.moderate === sseUnits(cfg()).hluPerKm.moderate, 'strip width does not change hedge units');

console.log('\n--- 4. Geometry, rules and grants ---');
assert(geometry(cfg()).aecsStrip.payableM === 3 && geometry(cfg()).aecsStrip.gbpPerKm === 149, 'HV2: 3 m Grass Strips payable, £149/km/yr');
assert(geometry(cfg({ form: 'triple' })).aecsStrip.payableM === 0, 'HV3 (3 m hedge, 6 m strip): 2.5 m beyond the line, so nothing payable');
assert(geometry(cfg({ stripM: 12, position: 'watercourse' })).aecsStrip.payableM === 8, 'HV7: 8 m Water Margins payable');
assert(geometry(cfg({ form: 'productive', stripM: 8 })).aecsStrip.gbpPerKm === 0, 'HV8: no AECS (Si, 21 Oct)');
assert(minStripM('double', 'boundary') === 3 && minStripM('triple', 'boundary') === 6 && minStripM('double', 'watercourse') === 6, 'minimum strips: 3 / 6 / 6 m');
let n = normaliseConfig(cfg({ form: 'triple', position: 'watercourse', stripM: 12 }));
assert(n.cfg.form === 'double' && n.notes.length === 1, 'beside water: triple row becomes double, with a note');
n = normaliseConfig(cfg({ form: 'triple', stripM: 3 }));
assert(n.cfg.stripM === 6 && /widened/.test(n.notes[0]), 'too-narrow strip is widened, with a note');
n = normaliseConfig(cfg({ form: 'productive', species: 'native', trees: 'standards', stripM: 8 }));
assert(n.cfg.species === 'speciesRich' && n.cfg.trees === 'none', 'productive hedge: fixed mix, no standard trees');
assert(incomeForgone(6)['General Cropping'].netIncomeForegone === 420 && incomeForgone(3)['Cereals'].netIncomeForegone === 200, 'income forgone follows strip width (6 m GC £420; 3 m cereals £200)');
assert(near(marginSoilCarbon(cfg()).low, 11.2, 0.01), 'HV2 margin soil carbon scenario 11.2 tCO2e/km (not counted)');
const k = configKey(cfg({ trees: 'standards', stripM: 8, position: 'contour', form: 'triple' }));
assert(JSON.stringify(parseConfigKey(k)) === JSON.stringify(cfg({ trees: 'standards', stripM: 8, position: 'contour', form: 'triple' })), 'config key round-trips');
assert(parseConfigKey('triple-foo-none-6-boundary') === null && parseConfigKey('double-speciesRich-none-7-boundary') === null, 'invalid config keys rejected');

console.log('\n--- 5. Presets ---');
assert(PRESETS.length === 8 && PRESETS.map(p => p.code).join() === 'HV1,HV2,HV3,HV4,HV5,HV6,HV7,HV8', 'eight presets HV1-HV8');
assert(PRESETS.every(p => p.species === 'speciesRich'), 'all presets species-rich (native is a calculator toggle only)');
assert(DEFAULT_PRESET === 'HV2' && PRESETS.find(p => p.isDefault)?.code === 'HV2', 'HV2 is the programme default');
assert(PRESETS.every(p => configKey(normaliseConfig(p).cfg) === configKey(p)), 'every preset is already a valid configuration');
assert(PRESETS.find(p => p.code === 'HV8').form === 'productive' && PRESETS.find(p => p.code === 'HV6').form === 'triple' && PRESETS.find(p => p.code === 'HV7').form === 'double', 'HV8 productive triple, HV6 triple, HV7 double');
assert(presetForConfig(cfg({ trees: 'standards' }))?.code === 'HV4', 'HV2 + trees toggle = HV4');

console.log('\n--- 6. v12 data integrity ---');
assert(recs.length === 168, '168 records', 168, recs.length);
const byBiome = {};
for (const r of recs) (byBiome[r.biome] ??= []).push(r);
assert(Object.keys(byBiome).length === 6 && Object.values(byBiome).every(a => a.length === 28), '6 biomes × 28 records');
assert(!recs.some(r => /Dense Wildlife|Heritage Species/.test(r.variant)), 'v11 hedges removed');
assert(new Set(recs.map(r => r.id)).size === 168, 'ids unique');
for (const [biome, list] of Object.entries(byBiome)) {
  const tpl = db.metadata.hedgeTemplates[biome];
  for (const p of PRESETS) {
    const stored = list.find(r => r.hedgeConfig?.preset === p.code);
    const built = buildHedgeRecord(tpl, p);
    assert(stored && JSON.stringify(stored) === JSON.stringify(built), `${biome} ${p.code}: stored preset = live configurator output`);
  }
}
assert(recs.every(r => Math.abs(r.registry.sserGrossUnitsPerKm - (r.carbonSource?.status === 'unsubstantiated-scenario' ? 0 : r.seq50yrTotal * 0.64)) <= 0.01), 'net units = gross × 0.64 (hedges) or 0');
assert(recs.every(r => ['3m', '6m', '8m', '10m', '12m', '20m', '60m'].includes(r.width)), 'all widths valid');

console.log('\n--- 7. calc.js integration ---');
const hv2 = recs.find(r => r.id === 'fife_east_neuk_coast__hv2_hedge_and_margin');
const base = { farmType: 'General Cropping', placement: 'crossSlope', lengthM: 2000, creditPrice: 70, windbreakOrient: 'NS' };
const res = calculate(base, hv2);
assert(res.hedge && res.hedge.preset === 'HV2' && res.hedge.stripM === 6, 'hedge summary present for HV2');
assert(near(res.hedge.aecsStripGbpInstalled, 298, 0.5) && near(res.hedge.hluInstalled.moderate, 13.4, 0.01), '2 km: AECS strip £298/yr, 13.4 HLU');
const expected = 52.5 / 50 * 0.64 * 70 * 2 + 150 * 2 - 420 * 2;
assert(near(res.annualNetBenefit, expected, 0.5), 'AECS strip payment is not counted in the combined value', expected.toFixed(2), res.annualNetBenefit.toFixed(2));
assert(calculate(base, recs.find(r => r.variant.startsWith('1.'))).hedge === null && hedgeSummary({}, 1000) === null, 'no hedge summary for non-hedge records');
const custom = buildHedgeRecord(db.metadata.hedgeTemplates['Fife (East Neuk Coast)'], cfg({ species: 'native', stripM: 10 }));
assert(custom.hedgeConfig.preset === null && /Custom hedge/.test(custom.variant) && custom.width === '10m', 'custom hedge record: label and width');
assert(/Not AECS-compliant/.test(custom.registry.regulatoryAlignment) && custom.hedgeOutputs.speciesTradeoff, 'native mix shows its trade-offs');
const hv8 = calculate(base, recs.find(r => r.id === 'fife_east_neuk_coast__hv8_productive_hedge'));
assert(near(hv8.seq50yrTotal, 41.2) && near(hv8.hedge.carbonGross50PerKm, 92.6), 'HV8 counts soil and roots (41.2), shows 92.6 gross');

console.log(`\n${failed ? '✗' : '✓'} ${passed} passed · ${failed} failed\n`);
if (failed) process.exit(1);
