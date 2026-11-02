/**
 * Unit tests for url-snapshot.js (P2 share-URL problem + solution-map encoding).
 */
import {
  truncText,
  buildSolutionMapSnapshot,
  buildScenarioSnapshot,
  encodeSnapshotParam,
  decodeSnapshotParam,
} from '../url-snapshot.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEqual(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)})`);
}

console.log('\n=== url-snapshot.js Tests ===\n');

console.log('truncText');
assertEqual(truncText('short'), 'short', 'leaves short strings alone');
assertEqual(truncText('  spaced  '), 'spaced', 'trims whitespace');
assert(truncText('x'.repeat(100), 20).endsWith('…'), 'truncates with ellipsis');
assertEqual(truncText(null), '', 'null → empty');

const sampleProblem = {
  Problem_Code: 'FLOOD_MARGIN',
  Category: 'Water',
  Stated_Symptom: 'Field margins pond after heavy rain and crop sits wet.',
  Farmer_Diagnosis_Copy: 'Water is lingering on the margin; a linear buffer may slow runoff and take pressure off the headland.',
  Solution_Agronomic: 'Improve soil structure and organic matter on headlands.',
  Solution_Infrastructure: 'Check drains and culvert capacity with a drainage engineer.',
  Solution_Precision_Tech: 'Soil moisture sensors on wet corners.',
  Solution_Community: 'None directly applicable.',
  Solution_Emerging_Tech_Landscaping: 'Nature-based floodplain reconnection where feasible.',
};

console.log('\nbuildSolutionMapSnapshot');
const map = buildSolutionMapSnapshot(sampleProblem);
assert(!!map && map.a.includes('soil structure'), 'encodes agronomic');
assert(map.i.includes('drains'), 'encodes infrastructure');
assert(map.c.includes('None directly'), 'encodes community');
assertEqual(buildSolutionMapSnapshot(null), null, 'null problem → null map');

console.log('\nbuildScenarioSnapshot');
const snap = buildScenarioSnapshot(sampleProblem);
assertEqual(snap.code, 'FLOOD_MARGIN', 'keeps problem code');
assertEqual(snap.cat, 'Water', 'keeps category');
assert(snap.s.includes('pond'), 'keeps symptom');
assert(snap.d.includes('linear buffer'), 'keeps diagnosis');
assert(!!snap.m?.a, 'embeds solution map');

console.log('\nencode / decode round-trip');
const encoded = encodeSnapshotParam(sampleProblem);
assert(typeof encoded === 'string' && encoded.length > 20, 'encodes to non-empty string');
assert(!encoded.includes('+') && !encoded.includes('/'), 'uses base64url alphabet');
const decoded = decodeSnapshotParam(encoded);
assertEqual(decoded.code, 'FLOOD_MARGIN', 'round-trip code');
assertEqual(decoded.cat, 'Water', 'round-trip category');
assert(decoded.s.includes('pond'), 'round-trip symptom');
assert(decoded.m.i.includes('drains'), 'round-trip map infrastructure');
assertEqual(decodeSnapshotParam(null), null, 'null param → null');
assertEqual(decodeSnapshotParam('!!!not-valid!!!'), null, 'garbage param → null');
assertEqual(encodeSnapshotParam(null), null, 'null problem → null encode');

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
