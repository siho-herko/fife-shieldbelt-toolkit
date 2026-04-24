/**
 * tests/content.test.js
 * Content integrity tests for data/problems_v2.json.
 * Run with: node tests/content.test.js
 */

import { readFileSync } from 'fs';

const problems = JSON.parse(readFileSync('./data/problems_v2.json', 'utf8'));
let passed = 0, failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log('\n=== Content Integrity Tests ===\n');

// ---------------------------------------------------------------------------
// 1. Record count
// ---------------------------------------------------------------------------
console.log('--- 1. Record counts ---');
assert(problems.length === 33,  '33 problems total');
assert(problems.filter(p => p.Applicable_Biomes !== 'Dreel Burn Catchment').length === 27,
  '27 phase-1 problems');
assert(problems.filter(p => p.Applicable_Biomes === 'Dreel Burn Catchment').length === 6,
  '6 phase-2 (Dreel Burn) problems');

// ---------------------------------------------------------------------------
// 2. All required fields present and non-empty
// ---------------------------------------------------------------------------
console.log('\n--- 2. Required fields ---');
const REQUIRED_FIELDS = [
  'Category', 'Problem_Code', 'Stated_Symptom', 'Agronomic_Root_Cause',
  'Applicable_Biomes', 'Applicable_Farm_Types', 'Routing_Trigger',
  'Farmer_Diagnosis_Copy', 'Solution_Agronomic', 'Solution_Infrastructure',
  'Solution_Precision_Tech', 'Solution_Community', 'Solution_Emerging_Tech_Landscaping',
];

for (const field of REQUIRED_FIELDS) {
  const missing = problems.filter(p => !p[field] || String(p[field]).trim() === '');
  assert(
    missing.length === 0,
    `All records have non-empty ${field}` +
      (missing.length ? ` (missing: ${missing.map(p => p.Problem_Code).join(', ')})` : '')
  );
}

// ---------------------------------------------------------------------------
// 3. Unique problem codes
// ---------------------------------------------------------------------------
console.log('\n--- 3. Unique codes ---');
const codes = problems.map(p => p.Problem_Code);
assert(new Set(codes).size === 33, 'All Problem_Codes unique');

// ---------------------------------------------------------------------------
// 4. At least one ShieldBelt variant per record
// ---------------------------------------------------------------------------
console.log('\n--- 4. Variant references ---');
const noVariants = problems.filter(p => !p.Relevant_ShieldBelt_Variants?.length);
assert(
  noVariants.length === 0,
  'All records have at least one variant' +
    (noVariants.length ? ` (missing: ${noVariants.map(p => p.Problem_Code).join(', ')})` : '')
);

// 5. Variant references have valid width prefixes
const VALID_WIDTHS = ['3m', '6m', '12m', '20m', '60m'];
for (const p of problems) {
  for (const v of (p.Relevant_ShieldBelt_Variants ?? [])) {
    const width = v.split(' ')[0];
    assert(
      VALID_WIDTHS.includes(width),
      `${p.Problem_Code}: variant "${v}" has valid width prefix`
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Diagnosis copy is substantive (not a placeholder)
// ---------------------------------------------------------------------------
console.log('\n--- 5. Copy quality ---');
const shortDiagnosis = problems.filter(p => p.Farmer_Diagnosis_Copy.length < 50);
assert(
  shortDiagnosis.length === 0,
  'All Farmer_Diagnosis_Copy > 50 chars' +
    (shortDiagnosis.length ? ` (short: ${shortDiagnosis.map(p => p.Problem_Code).join(', ')})` : '')
);

// ---------------------------------------------------------------------------
// 6. No raw HTML tags or HTML entities in farmer-facing copy
// ---------------------------------------------------------------------------
console.log('\n--- 6. No HTML in farmer-facing fields ---');
const HTML_PATTERN = /<[^>]+>|&(?!amp;|lt;|gt;)[a-z]+;/;
const FARMER_FACING = [
  'Farmer_Diagnosis_Copy', 'Solution_Agronomic', 'Solution_Infrastructure',
  'Solution_Precision_Tech', 'Solution_Community', 'Solution_Emerging_Tech_Landscaping',
];
for (const field of FARMER_FACING) {
  const withHtml = problems.filter(p => HTML_PATTERN.test(p[field]));
  assert(
    withHtml.length === 0,
    `No HTML in ${field}` +
      (withHtml.length ? ` (found in: ${withHtml.map(p => p.Problem_Code).join(', ')})` : '')
  );
}

// ---------------------------------------------------------------------------
// 7. 10 categories present
// ---------------------------------------------------------------------------
console.log('\n--- 7. Categories ---');
const cats = new Set(problems.map(p => p.Category));
assert(cats.size >= 10 && cats.size <= 12, `10–12 categories expected (found: ${cats.size})`);

// ---------------------------------------------------------------------------
// 8. Routing triggers reference known DB fields
// ---------------------------------------------------------------------------
console.log('\n--- 8. Routing triggers ---');
const KNOWN_DB_FIELDS = [
  'sepaMetrics', 'radarMetrics', 'farmImpacts', 'crewValuations',
  'carbonSequestration', 'agronomicWindProfile', 'assumedBiomassHeight', 'variant',
  'advancedEcosystemServices', 'registry', 'soilMetrics', 'biodivMetrics',
  'livestockMetrics', 'carbonMetrics', 'fioRisk', 'economicAssessment',
];
for (const p of problems) {
  const trigger = p.Routing_Trigger;
  // Extract the root field name: split on either '.' or whitespace
  const firstToken = trigger.split(/[.\s]/)[0];
  const isKnown    = KNOWN_DB_FIELDS.includes(firstToken)
    || firstToken === 'variant'
    || trigger.startsWith('variant contains');
  assert(isKnown, `${p.Problem_Code}: routing trigger field "${firstToken}" is recognised`);
}

// ---------------------------------------------------------------------------
// 9. Linked_Solution_Directory_Keys is always an array
// ---------------------------------------------------------------------------
console.log('\n--- 9. Schema types ---');
const notArray = problems.filter(p => !Array.isArray(p.Linked_Solution_Directory_Keys));
assert(
  notArray.length === 0,
  'All Linked_Solution_Directory_Keys are arrays' +
    (notArray.length ? ` (bad: ${notArray.map(p => p.Problem_Code).join(', ')})` : '')
);

// ---------------------------------------------------------------------------
// 10. No duplicate Problem_Codes within the same phase
// ---------------------------------------------------------------------------
console.log('\n--- 10. Phase uniqueness ---');
const phase1Codes = problems
  .filter(p => p.Applicable_Biomes !== 'Dreel Burn Catchment')
  .map(p => p.Problem_Code);
assert(new Set(phase1Codes).size === phase1Codes.length, 'Phase-1 codes all unique');

const phase2Codes = problems
  .filter(p => p.Applicable_Biomes === 'Dreel Burn Catchment')
  .map(p => p.Problem_Code);
assert(new Set(phase2Codes).size === phase2Codes.length, 'Phase-2 codes all unique');

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? '✓' : '✗'} ${passed} passed · ${failed} failed\n`);
if (failed > 0) process.exit(1);
