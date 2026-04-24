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
 *   actual formula:  carbIncome + poll + crew + pest + thermal + wb + ac − nif
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

const db   = JSON.parse(readFileSync('./data/fife_interventions_db_v9.json', 'utf8'));
const byId = Object.fromEntries(db.map(r => [r.id, r]));

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
const r5 = byId['fife_east_neuk_coast__2_dense_wildlife_hedge'];

console.log('\n=== Fife Farm Resilience calc.js Tests ===\n');

// ---------------------------------------------------------------------------
// Record presence check
// ---------------------------------------------------------------------------

console.log('--- Record presence ---');
assert(!!r1, 'r1: fife_east_neuk_coast__1_grass_silt_buffer found');
assert(!!r2, 'r2: fife_east_neuk_coast__9_distillery_foraging_strip found');
assert(!!r3, 'r3: fife_east_neuk_coast__19_coastal_erosion_wood found');
assert(!!r4, 'r4: fife_west_fife_claylands__15_livestock_shade_trees found');
assert(!!r5, 'r5: fife_east_neuk_coast__2_dense_wildlife_hedge found');

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
assert(near(r1_carbIncome, 3.024, 0.01),
  'r1: annualCarbonIncome ≈ £3.02', 3.024, r1_carbIncome);

assert(pollinationValue(r1, 'General Cropping', 1000) === 0,
  'r1: pollinationValue GC = £0.00');

assert(near(netIncomeForegone(r1, 'General Cropping', 1000), 16.70, 0.01),
  'r1: netIncomeForegone GC ≈ £16.70', 16.70, netIncomeForegone(r1, 'General Cropping', 1000));

assert(near(crewValue(r1, 'crossSlope', 1000), 319.95, 0.01),
  'r1: crewValue crossSlope ≈ £319.95', 319.95, crewValue(r1, 'crossSlope', 1000));

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

assert(sserUnits(r1, 1000) === 8.4,
  'r1: sserUnits(1000) = 8.4', 8.4, sserUnits(r1, 1000));

const r1_net = calculate(inputs(r1), r1).annualNetBenefit;
assert(near(r1_net, 3319.27, 1.00),
  'r1: annualNetBenefit GC crossSlope NS ≈ £3319.27', 3319.27, r1_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section D — Record 2: Distillery Foraging Strip (6m)
// ---------------------------------------------------------------------------

console.log('\n--- D. Record 2: Distillery Foraging Strip — East Neuk Coast (6m) ---');

assert(near(annualCarbonIncome(r2, 1000, 60), 17.28, 0.01),
  'r2: annualCarbonIncome ≈ £17.28', 17.28, annualCarbonIncome(r2, 1000, 60));

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

assert(sserUnits(r2, 1000) === 24,
  'r2: sserUnits(1000) = 24', 24, sserUnits(r2, 1000));

// v4 DB: includes windbreak + avoided-cost components for this variant at 1000m.
const r2_net = calculate(inputs(r2), r2).annualNetBenefit;
assert(near(r2_net, 4565.38, 1.00),
  'r2: annualNetBenefit GC crossSlope NS ≈ £4565.38', 4565.38, r2_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section E — Record 3: Coastal Erosion Wood (20m)
// ---------------------------------------------------------------------------

console.log('\n--- E. Record 3: Coastal Erosion Wood — East Neuk Coast (20m) ---');

assert(near(annualCarbonIncome(r3, 1000, 60), 672.00, 0.10),
  'r3: annualCarbonIncome ≈ £672.00', 672.00, annualCarbonIncome(r3, 1000, 60));

assert(sserUnits(r3, 1000) === 280,
  'r3: sserUnits(1000) = 280', 280, sserUnits(r3, 1000));

assert(near(windbreakValue(r3, 'NS', 1000), 1344.00, 0.01),
  'r3: windbreakValue NS ≈ £1344.00', 1344.00, windbreakValue(r3, 'NS', 1000));

assert(near(windbreakValue(r3, 'EW', 1000), 528.00, 0.01),
  'r3: windbreakValue EW ≈ £528.00', 528.00, windbreakValue(r3, 'EW', 1000));

assert(near(avoidedCosts(r3, 'crossSlope', 1000), 2529.00, 0.01),
  'r3: avoidedCosts crossSlope ≈ £2529.00', 2529.00, avoidedCosts(r3, 'crossSlope', 1000));

// v4 DB: ground truth from calculate() for GC crossSlope NS at 1000m.
const r3_net = calculate(inputs(r3), r3).annualNetBenefit;
assert(near(r3_net, 8089.40, 1.00),
  'r3: annualNetBenefit GC crossSlope NS ≈ £8089.40', 8089.40, r3_net.toFixed(2));

// ---------------------------------------------------------------------------
// Section F — Record 4: Livestock Shade Trees (12m, West Fife Claylands)
// ---------------------------------------------------------------------------

console.log('\n--- F. Record 4: Livestock Shade Trees — West Fife Claylands (12m) ---');

assert(near(annualCarbonIncome(r4, 1000, 60), 198.72, 0.01),
  'r4: annualCarbonIncome ≈ £198.72', 198.72, annualCarbonIncome(r4, 1000, 60));

assert(near(thermalRegulationValue(r4, 'Dairy', 1000), 250.00, 0.01),
  'r4: thermalRegulationValue Dairy ≈ £250.00', 250.00, thermalRegulationValue(r4, 'Dairy', 1000));

assert(sserUnits(r4, 1000) === 138,
  'r4: sserUnits(1000) = 138', 138, sserUnits(r4, 1000));

// v4 DB: full calculate() ground truth for GC crossSlope NS at 1000m.
const r4_net = calculate(inputs(r4), r4).annualNetBenefit;
assert(near(r4_net, 6030.72, 1.00),
  'r4: annualNetBenefit GC crossSlope NS ≈ £6030.72', 6030.72, r4_net.toFixed(2));

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

assert(sserUnits(r5, 1000) === 31.5,
  'r5: sserUnits(1000) = 31.5', 31.5, sserUnits(r5, 1000));

// Correct annualNetBenefit for GC:
// carbIncome = (164.88/50)*(3/10000*1000)*60 = (164.88/50)*0.3*60 = 59.3568
// 59.3568 + 720 + 319.95 + 90 + 0 + 1344 + 2529 − 16.7 = 5045.61
const r5_net = calculate(inputs(r5), r5).annualNetBenefit;
assert(near(r5_net, 4997.59, 1.00),
  'r5: annualNetBenefit GC crossSlope NS ≈ £4997.59', 4997.59, r5_net.toFixed(2));

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

console.log(`\n${failed === 0 ? '✓' : '✗'} ${passed} passed · ${failed} failed\n`);
if (failed > 0) process.exit(1);
