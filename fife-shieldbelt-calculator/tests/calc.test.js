/**
 * tests/calc.test.js
 * Ground-truth unit tests for calc.js.
 * Run with: node tests/calc.test.js  (or: npm test)
 *
 * All tests use 1000m length, £60/tCO₂e unless stated.
 * Placements: crossSlope. Windbreak: NS unless stated.
 *
 * NOTE on annualNetBenefit expected values:
 *   The Prompt 9 spec expected values for records 2–5 appear to include
 *   Dairy thermal regulation even when "GC" (General Cropping) is the
 *   specified farm type.  The correct values below are computed from the
 *   (3 Nov 2026) carbIncome is per km on ONCRA net tonnes (×0.64); expected values updated.
 *   v11 formula (3 Nov 2026 audit): carbIncome (hedges only) + water low case − nif;
 *   pollination, pest, thermal, windbreak and avoided costs are unvalidated scenarios, not counted.
 *   where all terms use the GC farm type.  A companion assertion verifies
 *   the Dairy-variant value matches the spec's stated figure.
 */

import {
  calculate,
  totalSeq50yr,
  cumulativeSeqTrajectory,
  scaleToLength,
  netIncomeForegone,
  pollinationValue,
  crewValue,
  annualCarbonIncome,
  pestRegulationValue,
  thermalRegulationValue,
  windbreakValue,
  avoidedCosts,
  sserUnits,
  parseWidth,
} from '../calc.js';
import { readFileSync } from 'fs';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const db   = JSON.parse(readFileSync('./data/fife_interventions_db_v12.json', 'utf8'));
const records = Array.isArray(db) ? db : db.interventions;
const byId = Object.fromEntries(records.map(r => [r.id, r]));

let passed = 0, failed = 0;

function assert(condition, label, expected, actual) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}  expected: ${expected}  got: ${actual}`);
    failed++;
  }
}

function near(a, b, tol = 0.10) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// Helper: build CalcInputs from record + overrides
// ---------------------------------------------------------------------------

function inputs(record, overrides = {}) {
  return {
    biome:           record.biome,
    variantId:       record.id,
    farmType:        'General Cropping',
    placement:       'crossSlope',
    lengthM:         1000,
    creditPrice:     60,
    windbreakOrient: 'NS',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Retrieve test records
// ---------------------------------------------------------------------------

const r1 = byId['fife_east_neuk_coast__1_grass_silt_buffer'];
const r2 = byId['fife_east_neuk_coast__9_distillery_foraging_strip'];
const r3 = byId['fife_east_neuk_coast__19_coastal_erosion_wood'];
const r4 = byId['fife_west_fife_claylands__15_livestock_shade_trees'];
const r5 = byId['fife_east_neuk_coast__hv1_fence_line_hedge'];

console.log('\n=== Fife Farm Resilience calc.js Tests ===\n');

// ---------------------------------------------------------------------------
// Record presence check
// ---------------------------------------------------------------------------

console.log('--- Record presence ---');
assert(!!r1, 'r1: fife_east_neuk_coast__1_grass_silt_buffer found');
assert(!!r2, 'r2: fife_east_neuk_coast__9_distillery_foraging_strip found');
assert(!!r3, 'r3: fife_east_neuk_coast__19_coastal_erosion_wood found');
assert(!!r4, 'r4: fife_west_fife_claylands__15_livestock_shade_trees found');
assert(!!r5, 'r5: fife_east_neuk_coast__hv1_fence_line_hedge found (v12 HV1)');

// ---------------------------------------------------------------------------
// Section A — scaleToLength (no record needed)
// ---------------------------------------------------------------------------

console.log('\n--- A. scaleToLength ---');
assert(scaleToLength(1000, 500)  === 500,  'scaleToLength: half km',  500,  scaleToLength(1000, 500));
assert(scaleToLength(1000, 2000) === 2000, 'scaleToLength: 2km',     2000, scaleToLength(1000, 2000));
assert(scaleToLength(1000, 0)   === 0,    'scaleToLength: zero length', 0, scaleToLength(1000, 0));

// ---------------------------------------------------------------------------
// Section B — cumulativeSeqTrajectory
// ---------------------------------------------------------------------------

console.log('\n--- B. cumulativeSeqTrajectory ---');
const trajInput = { yr_1_5:51, yr_6_10:51, yr_11_15:12.75,
  yr_16_20:12.75, yr_21_25:0, yr_26_30:0, yr_31_35:0, yr_36_40:0, yr_41_45:0, yr_46_50:0 };
const traj = cumulativeSeqTrajectory(trajInput);
assert(traj.length === 10, 'trajectory: 10 values',    10,   traj.length);
assert(traj[0] === 51,     'trajectory: first value',  51,   traj[0]);
assert(traj[1] === 102,    'trajectory: second value', 102,  traj[1]);
assert(near(traj[9], 127.5, 0.01), 'trajectory: final = 127.5', 127.5, traj[9]);
for (let i = 1; i < traj.length; i++) {
  assert(traj[i] >= traj[i - 1], `trajectory: non-decreasing at index ${i}`);
}

// ---------------------------------------------------------------------------
// Section C — Record 1: Grass Silt Buffer (3m)
// ---------------------------------------------------------------------------

console.log('\n--- C. Record 1: Grass Silt Buffer — East Neuk Coast (3m) ---');
assert(totalSeq50yr(r1) === 8.4,
  'r1: totalSeq50yr = 8.4', 8.4, totalSeq50yr(r1));

const r1_carbIncome = annualCarbonIncome(r1, 1000, 60);
assert(r1_carbIncome === 0,
  'r1: annualCarbonIncome = 0 (v11: unsubstantiated carbon scenario excluded)', 0, r1_carbIncome);

assert(pollinationValue(r1, 'General Cropping', 1000) === 0,
  'r1: pollinationValue GC = £0.00');

// v10: 0.3 ha/km × GM £988.50/ha (SAC FMH Feb 2026) × 0.7 edge factor = £207.6 → £210
assert(near(netIncomeForegone(r1, 'General Cropping', 1000), 210, 0.01),
  'r1: netIncomeForegone GC ≈ £210', 210, netIncomeForegone(r1, 'General Cropping', 1000));

// v10 (3 Nov 2026): water values rebuilt from CREW unit values (see build_v10.py)
// v11: water low case (Defra sediment £0.054/kg): 10 ha × (25×.05×1.37 + .7×.15×46.61 + 200×.5×.054) × 0.5 = £60
// v12: Stutter et al. 2021 retention at 3 m (sediment 76%, TP 55%); N not valued:
//      10 ha × (200×.758×.054 + .7×.547×46.61) × 0.5 = £130
assert(near(crewValue(r1, 'crossSlope', 1000), 130, 0.01),
  'r1: crewValue crossSlope ≈ £130 (v12 low case)', 130, crewValue(r1, 'crossSlope', 1000));

assert(pestRegulationValue(r1, 'General Cropping', 1000) === 0,
  'r1: pestRegulationValue GC = £0.00');

assert(thermalRegulationValue(r1, 'Dairy', 1000) === 0,
  'r1: thermalRegulationValue Dairy = £0.00');

assert(near(windbreakValue(r1, 'NS', 1000), 484.00, 0.01),
  'r1: windbreakValue NS ≈ £484.00', 484.00, windbreakValue(r1, 'NS', 1000));

assert(near(windbreakValue(r1, 'EW', 1000), 399.00, 0.01),
  'r1: windbreakValue EW ≈ £399.00', 399.00, windbreakValue(r1, 'EW', 1000));

assert(near(avoidedCosts(r1, 'crossSlope', 1000), 2529.00, 0.01),
  'r1: avoidedCosts crossSlope ≈ £2529.00', 2529.00, avoidedCosts(r1, 'crossSlope', 1000));

assert(sserUnits(r1, 1000) === 0,
  'r1: sserUnits(1000) = 0 (unsubstantiated scenario)', 0, sserUnits(r1, 1000));

const r1_net = calculate(inputs(r1), r1).annualNetBenefit;
// v11: illustrative combined value = carbon (0) + water low case (60) − income forgone (210)
assert(near(r1_net, -80, 1.00),
  'r1: annualNetBenefit GC crossSlope NS ≈ −£80 (v12: water 130 − forgone 210)', -80, r1_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section D — Record 2: Distillery Foraging Strip (6m)
// ---------------------------------------------------------------------------

console.log('\n--- D. Record 2: Distillery Foraging Strip — East Neuk Coast (6m) ---');

assert(annualCarbonIncome(r2, 1000, 60) === 0,
  'r2: annualCarbonIncome = 0 (unsubstantiated)', 0, annualCarbonIncome(r2, 1000, 60));

assert(near(pollinationValue(r2, 'General Cropping', 1000), 1200.00, 0.01),
  'r2: pollinationValue GC ≈ £1200.00', 1200.00, pollinationValue(r2, 'General Cropping', 1000));

assert(near(pestRegulationValue(r2, 'General Cropping', 1000), 150.00, 0.01),
  'r2: pestRegulationValue GC ≈ £150.00', 150.00, pestRegulationValue(r2, 'General Cropping', 1000));

assert(near(thermalRegulationValue(r2, 'Dairy', 1000), 250.00, 0.01),
  'r2: thermalRegulationValue Dairy ≈ £250.00', 250.00, thermalRegulationValue(r2, 'Dairy', 1000));

assert(near(windbreakValue(r2, 'NS', 1000), 1016, 0.01),
  'r2: windbreakValue NS ≈ £1016.00', 1016, windbreakValue(r2, 'NS', 1000));

assert(near(avoidedCosts(r2, 'crossSlope', 1000), 1600, 0.01),
  'r2: avoidedCosts crossSlope ≈ £1600.00', 1600, avoidedCosts(r2, 'crossSlope', 1000));

assert(sserUnits(r2, 1000) === 0,
  'r2: sserUnits(1000) = 0 (unsubstantiated)', 0, sserUnits(r2, 1000));

// v4 DB: includes windbreak + avoided-cost components for this variant at 1000m.
const r2_net = calculate(inputs(r2), r2).annualNetBenefit;
assert(near(r2_net, -270, 1.00),
  'r2: annualNetBenefit GC crossSlope NS ≈ −£270 (v12: water 150 − forgone 420)', -270, r2_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section E — Record 3: Coastal Erosion Wood (20m)
// ---------------------------------------------------------------------------

console.log('\n--- E. Record 3: Coastal Erosion Wood — East Neuk Coast (20m) ---');

assert(annualCarbonIncome(r3, 1000, 60) === 0,
  'r3: annualCarbonIncome = 0 (unsubstantiated)', 0, annualCarbonIncome(r3, 1000, 60));

assert(sserUnits(r3, 1000) === 0,
  'r3: sserUnits(1000) = 0 (unsubstantiated)', 0, sserUnits(r3, 1000));

assert(near(windbreakValue(r3, 'NS', 1000), 1344.00, 0.01),
  'r3: windbreakValue NS ≈ £1344.00', 1344.00, windbreakValue(r3, 'NS', 1000));

assert(near(windbreakValue(r3, 'EW', 1000), 528.00, 0.01),
  'r3: windbreakValue EW ≈ £528.00', 528.00, windbreakValue(r3, 'EW', 1000));

assert(near(avoidedCosts(r3, 'crossSlope', 1000), 2529.00, 0.01),
  'r3: avoidedCosts crossSlope ≈ £2529.00', 2529.00, avoidedCosts(r3, 'crossSlope', 1000));

// v4 DB: ground truth from calculate() for GC crossSlope NS at 1000m.
const r3_net = calculate(inputs(r3), r3).annualNetBenefit;
assert(near(r3_net, -1200, 1.00),
  'r3: annualNetBenefit GC crossSlope NS ≈ −£1200 (v12: water 180 − forgone 1380)', -1200, r3_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section F — Record 4: Livestock Shade Trees (12m, West Fife Claylands)
// ---------------------------------------------------------------------------

console.log('\n--- F. Record 4: Livestock Shade Trees — West Fife Claylands (12m) ---');

assert(annualCarbonIncome(r4, 1000, 60) === 0,
  'r4: annualCarbonIncome = 0 (unsubstantiated)', 0, annualCarbonIncome(r4, 1000, 60));

assert(near(thermalRegulationValue(r4, 'Dairy', 1000), 250.00, 0.01),
  'r4: thermalRegulationValue Dairy ≈ £250.00', 250.00, thermalRegulationValue(r4, 'Dairy', 1000));

assert(sserUnits(r4, 1000) === 0,
  'r4: sserUnits(1000) = 0 (unsubstantiated)', 0, sserUnits(r4, 1000));

// v4 DB: full calculate() ground truth for GC crossSlope NS at 1000m.
const r4_net = calculate(inputs(r4), r4).annualNetBenefit;
assert(near(r4_net, -660, 1.00),
  'r4: annualNetBenefit GC crossSlope NS ≈ −£660 (v12 water)', -660, r4_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section G — Record 5: Dense Wildlife Hedge (3m) — windbreak NS vs EW
// ---------------------------------------------------------------------------

console.log('\n--- G. Record 5: Dense Wildlife Hedge — East Neuk Coast (3m) ---');

assert(near(windbreakValue(r5, 'NS', 1000), 1344.00, 0.01),
  'r5: windbreakValue NS ≈ £1344.00', 1344.00, windbreakValue(r5, 'NS', 1000));

assert(near(windbreakValue(r5, 'EW', 1000), 528.00, 0.01),
  'r5: windbreakValue EW ≈ £528.00', 528.00, windbreakValue(r5, 'EW', 1000));

assert(windbreakValue(r5, 'NS', 1000) > windbreakValue(r5, 'EW', 1000),
  'r5: NS windbreak > EW windbreak');

assert(near(sserUnits(r5, 1000), 33.6, 0.01),
  'r5: sserUnits(1000) = 52.5 × 0.64 = 33.6 (hedge model v2)', 33.6, sserUnits(r5, 1000));

// annualNetBenefit for GC (v10): carbon income per km on net tonnes, set 3 hedge profile:
// carbIncome = (53.4/50) × 1 km × 0.64 × £60 = 41.01; NIF GC 3 m = £210
const r5_net = calculate(inputs(r5), r5).annualNetBenefit;
// v12 (HV1 Fence-line hedge, 2 m hedge in a 3 m strip): 52.5/50 × 0.64 × £60 = £40.32 carbon + £130 water (low) − £210 forgone = −£39.68
assert(near(r5_net, -39.68, 1.00),
  'r5: annualNetBenefit GC crossSlope NS ≈ −£39.68', -39.68, r5_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section H — No NaN anywhere for a record at downSlope placement
// ---------------------------------------------------------------------------

console.log('\n--- H. No NaN / Infinity in calculate() ---');

const zeroInputs = {
  farmType: 'LFA Grazing', placement: 'downSlope',
  lengthM: 1000, creditPrice: 60, windbreakOrient: 'NS',
  biome: r1.biome, variantId: r1.id,
};
const zeroResult = calculate(zeroInputs, r1);
for (const [k, v] of Object.entries(zeroResult)) {
  if (typeof v === 'number') {
    assert(!isNaN(v),      `No NaN in zeroResult.${k}`, 'finite', v);
    assert(isFinite(v),    `No Infinity in zeroResult.${k}`, 'finite', v);
  }
}

// Also verify creditPrice = 0 gives zero carbon income (no NaN)
const zeroPriceResult = calculate({ ...inputs(r1), creditPrice: 0 }, r1);
assert(zeroPriceResult.annualCarbonIncome === 0,
  'creditPrice=0 → annualCarbonIncome = 0', 0, zeroPriceResult.annualCarbonIncome);
assert(!isNaN(zeroPriceResult.annualNetBenefit),
  'creditPrice=0 → annualNetBenefit is not NaN');

// ---------------------------------------------------------------------------
// Section I — Scaling linearity at extreme lengths
// ---------------------------------------------------------------------------

console.log('\n--- I. Scaling linearity ---');

const r1_500  = sserUnits(r1, 500);
const r1_1000 = sserUnits(r1, 1000);
const r1_2000 = sserUnits(r1, 2000);
assert(near(r1_500 * 2, r1_1000, 0.0001),  'sserUnits: linear scaling (500m × 2 = 1000m)');
assert(near(r1_1000 * 2, r1_2000, 0.0001), 'sserUnits: linear scaling (1000m × 2 = 2000m)');

const r1_windNS_500  = windbreakValue(r1, 'NS', 500);
const r1_windNS_1000 = windbreakValue(r1, 'NS', 1000);
assert(near(r1_windNS_500 * 2, r1_windNS_1000, 0.01),
  'windbreakValue: linear scaling at 500m vs 1000m');

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

// --- J. v11 audit corrections (3 Nov 2026) ---
console.log('\n--- J. v11 audit corrections ---');
{
  const heritage = db.interventions.find(r => r.id === 'fife_east_neuk_coast__hv3_wide_wildlife_hedge');
  assert(near(totalSeq50yr(r5), 52.5, 0.05), 'v11: Dense hedge 50yr gross = 52.5 tCO2e/km (model v2)', 52.5, totalSeq50yr(r5));
  assert(near(totalSeq50yr(heritage), 70.7, 0.05), 'v11: Heritage hedge 50yr gross = 70.7 tCO2e/km (3 m crown)', 70.7, totalSeq50yr(heritage));
  const c1 = calculate(inputs(r1), r1);
  assert(c1.seq25yrRevenue === 0 && c1.seq50yrNet === 0 && c1.carbonSubstantiated === false,
    'v11: unsubstantiated carbon → no 25yr value, no net units');
  assert(near(c1.unvalidatedScenarioValue, c1.pollinationValue + c1.pestRegulationValue + c1.thermalRegulationValue + c1.windbreakValue + c1.avoidedCosts, 0.01),
    'v11: scenario values reported separately', c1.unvalidatedScenarioValue);
  assert(near(c1.netAgronomicBenefit, -c1.netIncomeForegone, 0.01), 'v11: farm headline = −income forgone only');
  assert(near(c1.widerEcoValueHigh, 510, 0.01), 'v12: water high case (CREW £0.55/kg sediment) crossSlope 3 m = £510', 510, c1.widerEcoValueHigh);
  for (const L of [0, 100, 1000, 2000]) {
    const c = calculate({ ...inputs(r5), lengthM: L }, r5);
    assert(near(c.seq50yrTotalPerKm, 52.5, 0.05), `v11: per-km total independent of length (${L} m)`);
    assert(near(c.seq50yrTotalInstalled, 52.5 * L / 1000, 0.01), `v11: installed total scales with length (${L} m)`, 52.5 * L / 1000, c.seq50yrTotalInstalled);
    assert(near(c.seq50yrNetInstalled, 52.5 * 0.64 * L / 1000, 0.01), `v11: installed net scales with length (${L} m)`);
    assert(Number.isFinite(c.annualNetBenefit), `v11: finite combined value at ${L} m`);
  }
  for (const r of db.interventions) {
    const s = JSON.stringify(r);
    assert(!/ONCRA Verified|Credit Union|Biodiversity Net Gain|Nitrate Credits|SSER units/.test(s), `v11: no unsupported credit/verification claims in ${r.id}`);
  }
}

console.log(`\n${failed === 0 ? '✓' : '✗'} ${passed} passed · ${failed} failed\n`);
if (failed > 0) process.exit(1);
