/**
 * app.js — Fife Farm Resilience Calculator
 * Full application wiring: DB → calc → charts → DOM.
 * Implements the Problem→Solution engine, URL state, comparison modal,
 * service worker registration, and all event handlers.
 *
 * Author: NFCA / Fife ShieldBelt project
 */

import { dbReady, getByBiome, getById, getAll, BIOMES, FARM_TYPES } from './db.js';
import { calculate, fmt, fmtGBP, fmtCarbon, fmtSSER, parseWidth }   from './calc.js';
import { hBar, hStackedBar, lineChart, radarChart, htmlLegend, clearCharts } from './charts.js';
import {
  encodeSnapshotParam,
  decodeSnapshotParam,
  truncText,
} from './url-snapshot.js';

/**
 * Sister resilience-wide UX bridge. Keep null until that product exists —
 * the footer slot stays hidden so we never promise a dead link.
 * Set to an absolute URL to surface “Explore broader farm options elsewhere”.
 */
const RESILIENCE_WIDE_TOOL_URL = null;

// =============================================================================
// A. Domain constants
// =============================================================================

const BIOME_DISPLAY = {
  'Fife (East Neuk Coast)':         '🌊 East Neuk Coast',
  'Fife (Forth Urban Coast)':       '🏙 Forth Urban Coast',
  'Fife (Howe of Fife & Eden)':     '💧 Howe of Fife & Eden',
  'Fife (Lomond & Cleish Uplands)': '⛰ Lomond & Cleish Uplands',
  'Fife (North Fife Hills & Tay)':  '🌿 North Fife Hills & Tay',
  'Fife (West Fife Claylands)':     '🚜 West Fife Claylands',
};

const BIOME_CONTEXT = {
  'Fife (East Neuk Coast)':         { km: 330, value: '£820,000+', farmType: 'General Cropping / Soft Fruit', tagline: 'Highest-value location. Pollination premium drives the economics.' },
  'Fife (Forth Urban Coast)':       { km: 150, value: '£200,000+', farmType: 'Edge-of-Settlement',            tagline: 'Urban flood, air quality and community function.' },
  'Fife (Howe of Fife & Eden)':     { km: 280, value: '£450,000+', farmType: 'Arable / Potatoes',            tagline: 'NVZ compliance and flood buffering in the Eden catchment.' },
  'Fife (Lomond & Cleish Uplands)': { km: 550, value: '£350,000+', farmType: 'LFA Grazing',                  tagline: 'Largest capacity. Carbon at near-zero net cost.' },
  'Fife (North Fife Hills & Tay)':  { km: 220, value: '£300,000+', farmType: 'Cereals / Mixed',              tagline: 'Topsoil retention on Tay-facing slopes.' },
  'Fife (West Fife Claylands)':     { km: 400, value: '£400,000+', farmType: 'Dairy / Mixed',                tagline: 'Thermal regulation and compaction relief for dairy.' },
};

// URL slug ↔ BIOMES key
const BIOME_SLUG = {
  east_neuk:   BIOMES.EAST_NEUK,
  forth_urban: BIOMES.FORTH_URBAN,
  howe:        BIOMES.HOWE,
  lomond:      BIOMES.LOMOND,
  north_fife:  BIOMES.NORTH_FIFE,
  west_clay:   BIOMES.WEST_CLAY,
};
const SLUG_BIOME = Object.fromEntries(Object.entries(BIOME_SLUG).map(([k, v]) => [v, k]));

const FARM_SLUG = {
  cereals:          'Cereals',
  general_cropping: 'General Cropping',
  dairy:            'Dairy',
  lfa_grazing:      'LFA Grazing',
};
const SLUG_FARM = Object.fromEntries(Object.entries(FARM_SLUG).map(([k, v]) => [v, k]));

const CATEGORY_ICONS = {
  'Water':        '💧',
  'Soil':         '⛰',
  'Climate':      '🌤',
  'Biology':      '🐛',
  'Compliance':   '📋',
  'Social':       '🏙',
  'Economic':     '💷',
  'Livestock':    '🐑',
  'Biodiversity': '🌿',
  'Carbon':       '🌱',
};

// Colour palette for chart datasets
const CHART_COLORS = {
  carbon:   '#2d6a4f',
  crew:     '#52b788',
  pest:     '#b5830a',
  windbreak:'#1d4ed8',
  avoided:  '#9d174d',
  foregone: '#9b2226',
};

// Width → chart line colour
const WIDTH_COLOR = {
  '3m':  '#1d4ed8',
  '6m':  '#15803d',
  '12m': '#a16207',
  '20m': '#9d174d',
  '60m': '#0f4c3a',
};

// =============================================================================
// B. Application state
// =============================================================================

const state = {
  biome:                BIOMES.EAST_NEUK,
  variantId:            null,
  recommendedVariantId: null,
  farmType:             'General Cropping',
  placement:            'crossSlope',
  lengthM:              1000,
  creditPrice:          60,
  problemCode:          null,
  windbreakOrient:      'NS',
  // Journey gating: full outcomes only after problem OR explicit browse path
  browseMode:           false,
  outcomesUnlocked:     false,
  // P1 relevance filters for problem chips
  prioritiseFits:       true,
  includeDreelBurn:     false,
  recommendationMeta:   null, // { reasons, score } for active recommendation
  // Share-URL snapshot of problem + solution-map (advisor context)
  urlSnapshot:          null,
  // Derived (never set directly by user)
  biomeRecords:    [],
  currentRecord:   null,
  results:         null,
  lastResults:     null,
  activeProblem:   null,
};

/** Short biome labels used inside Applicable_Biomes strings */
const BIOME_SHORT = {
  [BIOMES.EAST_NEUK]:   'East Neuk Coast',
  [BIOMES.FORTH_URBAN]: 'Forth Urban Coast',
  [BIOMES.HOWE]:        'Howe of Fife & Eden',
  [BIOMES.LOMOND]:      'Lomond & Cleish Uplands',
  [BIOMES.NORTH_FIFE]:  'North Fife Hills & Tay',
  [BIOMES.WEST_CLAY]:   'West Fife Claylands',
};

const DREEL_BURN_LABEL = 'Dreel Burn Catchment';

/** Category → thin planning questions for advisor handoff */
const PLANNING_QUESTIONS_BY_CATEGORY = {
  Water: [
    'Where does water enter and leave the field margin in a wet event?',
    'Any SEPA designations, culverts, or neighbour downstream risk?',
    'Is tenancy / ownership clear on the proposed strip length?',
  ],
  Soil: [
    'Which slope / headland loses soil first after heavy rain?',
    'Any tile-drain outfalls or compaction pans to work around?',
    'What labour window exists for establishment this season?',
  ],
  Climate: [
    'Which fields suffer wind, frost hollows, or heat stress most?',
    'Does shelter need to protect livestock, crops, or both?',
    'Any planning or scheme constraints on taller canopy?',
  ],
  Biology: [
    'Where do pests / pollination shortfalls show up in yield maps?',
    'Can spraying windows leave space for beneficial insects?',
    'Any supermarket / assurance biodiversity requirements?',
  ],
  Compliance: [
    'Which NVZ, GAEC, or audit findings drive the urgency?',
    'What evidence would your advisor need for scheme claims?',
    'Are buffer widths already counted toward compliance?',
  ],
  Social: [
    'Where do trespass, spray-drift, or neighbour complaints concentrate?',
    'Any rights of way or edge-of-settlement design constraints?',
    'Who needs to be in the room for a boundary decision?',
  ],
  Economic: [
    'Is the goal cashflow, cost avoidance, or scheme income first?',
    'What length can you fund / grant-match without overstretching?',
    'Any carbon or nature-finance registration already started?',
  ],
  Livestock: [
    'Which paddocks need shade, shelter, or riparian exclusion?',
    'How will fencing and water points interact with the strip?',
    'Any welfare / assurance scheme standards to meet?',
  ],
  Biodiversity: [
    'What habitat gaps would an auditor or buyer flag today?',
    'Can standing deadwood or disease-hit trees be retained safely?',
    'Who locally coordinates pollinators, bats, or catchment groups?',
  ],
  Carbon: [
    'Do you need a baseline audit before registering credits?',
    'Is the margin eligible for WCC / similar additionality rules?',
    'Who will own and verify the carbon claim long-term?',
  ],
};

/** Category → advisor role hint for handoff MVP */
const ADVISOR_ROLE_BY_CATEGORY = {
  Water:        'a flood / catchment or land-drainage advisor',
  Soil:         'an agronomist or soils advisor',
  Climate:      'an agronomist or climate-adaptation advisor',
  Biology:      'an agronomist or integrated pest management advisor',
  Compliance:   'an NVZ / compliance or farm-environment advisor',
  Social:       'a community or land-agent advisor',
  Economic:     'a farm-business or nature-finance advisor',
  Livestock:    'a livestock / grazing advisor',
  Biodiversity: 'a nature / ecology advisor',
  Carbon:       'a nature-finance or carbon-scheme advisor',
};

function unlockOutcomes({ browse = false } = {}) {
  state.outcomesUnlocked = true;
  if (browse) state.browseMode = true;
}

function lockOutcomesUnlessBrowse() {
  // Keep charts after clearing a problem only if the browse path was already confirmed.
  if (state.problemCode) return;
  if (state.browseMode && state.outcomesUnlocked) return;
  state.outcomesUnlocked = false;
}

function shouldShowOutcomes() {
  // browseMode marks the escape-hatch path / URL flag; charts wait for outcomesUnlocked
  // (Confirm, Calculate, shared URL restore, or a selected problem).
  return state.outcomesUnlocked || !!state.problemCode;
}

function showEmptyOutcomes() {
  document.getElementById('results-empty')?.classList.remove('hidden');
  document.getElementById('results-content')?.classList.add('hidden');
  updateEmptyStateCopy();
}

/** Empty-state copy differs once the user is on the browse path but has not Confirmed yet. */
function updateEmptyStateCopy() {
  const body = document.getElementById('results-empty-body');
  if (!body) return;
  if (state.browseMode && !state.problemCode && !state.outcomesUnlocked) {
    body.innerHTML =
      'Browse path selected. Pick a location and ShieldBelt variant, then press ' +
      '<strong>Confirm selection</strong> (or <strong>Calculate Outcomes</strong>) to size the margin and show results. ' +
      'No variant is auto-sized until you confirm.';
    return;
  }
  body.innerHTML =
    'This calculator explores <strong>nature-based solutions on marginal land</strong> ' +
    '(ShieldBelt linear field margins)—not every farm fix. ' +
    'Select your biggest problem to see a recommended margin option and outcomes, ' +
    'or choose <em>I already know the intervention</em> to browse variants, then Confirm.';
}

// =============================================================================
// A. Problems data
// =============================================================================

let problemsData   = [];
let problemsByCode = {};

async function loadProblems() {
  try {
    const data = await fetch('data/problems_v2.json').then(r => r.json());
    problemsData   = Array.isArray(data) ? data : (data.problems ?? []);
    problemsByCode = Object.fromEntries(problemsData.map(p => [p.Problem_Code, p]));
  } catch (e) {
    console.warn('problems_v2.json not yet available — problem chips will not load.', e);
  }
}

// =============================================================================
// DB helpers
// =============================================================================

async function loadBiomeRecords(biome) {
  state.biomeRecords = await getByBiome(biome);
}

// =============================================================================
// Accordion
// =============================================================================

function initAccordions() {
  document.querySelectorAll('.step-accordion__trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const bodyId = btn.getAttribute('aria-controls');
      const body   = document.getElementById(bodyId);
      if (body) body.hidden = expanded;
    });
  });
}

function openStep(stepIndex) {
  const accordion = document.querySelector(`.step-accordion[data-step="${stepIndex}"]`);
  if (!accordion) return;
  const btn  = accordion.querySelector('.step-accordion__trigger');
  const body = accordion.querySelector('.step-accordion__body');
  if (btn)  btn.setAttribute('aria-expanded', 'true');
  if (body) body.hidden = false;
}

function closeStep(stepIndex) {
  const accordion = document.querySelector(`.step-accordion[data-step="${stepIndex}"]`);
  if (!accordion) return;
  const btn  = accordion.querySelector('.step-accordion__trigger');
  const body = accordion.querySelector('.step-accordion__body');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
  if (body) body.hidden = true;
}

// =============================================================================
// Biome selector
// =============================================================================

function populateBiomeSelector() {
  // Biome cards already in HTML; we just need to sync state → checked radio
  const radios = document.querySelectorAll('input[name="biome"]');
  radios.forEach(r => { r.checked = r.value === state.biome; });
}

function initBiomeSelector() {
  document.querySelectorAll('input[name="biome"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      state.biome = radio.value;
      setText('step-biome-summary', BIOME_DISPLAY[state.biome] || state.biome);
      await loadBiomeRecords(state.biome);
      populateVariantSelector();
      populateProblemChips();
      if (state.problemCode) {
        const rec = recommendVariant(state.problemCode, state.biomeRecords, state.farmType, { storeMeta: true });
        if (rec) {
          state.variantId = rec.id;
          state.recommendedVariantId = rec.id;
          syncVariantSelect();
        }
      }
      await applyVariantAndRecalc();
      closeStep(2); openStep(3); // Location → Farm Type
    });
  });
}

// =============================================================================
// Problem chips — relevance helpers (P1)
// =============================================================================

function isDreelBurnProblem(problem) {
  return String(problem?.Applicable_Biomes || '').includes(DREEL_BURN_LABEL);
}

function problemFitsBiome(problem, biome) {
  const raw = String(problem?.Applicable_Biomes || '').trim();
  if (!raw || /^all$/i.test(raw)) return true;
  if (isDreelBurnProblem(problem)) return false; // catchment lens, not a calculator biome
  const short = BIOME_SHORT[biome] || '';
  if (!short) return true;
  // Honour explicit NOT-primary notes (e.g. FLOOD_RIP vs East Neuk)
  const notPrimary = new RegExp(`NOT\\s+primary[^)]*${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (notPrimary.test(raw)) return false;
  return raw.includes(short);
}

function problemFitsFarmType(problem, farmType) {
  const raw = String(problem?.Applicable_Farm_Types || '').trim();
  if (!raw || /^all$/i.test(raw)) return true;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.includes(farmType)) return true;
  // Treat "Arable" / "Horticulture" / "Mixed" as soft matches for closest UI farm types
  if (farmType === 'Cereals' && parts.some(p => /Arable|Horticulture/i.test(p))) return true;
  if (farmType === 'General Cropping' && parts.some(p => /Arable|Horticulture|Mixed/i.test(p))) return true;
  if (farmType === 'Dairy' && parts.some(p => /Mixed/i.test(p))) return true;
  if (farmType === 'LFA Grazing' && parts.some(p => /Mixed/i.test(p))) return true;
  return false;
}

function problemRelevance(problem) {
  const dreel = isDreelBurnProblem(problem);
  const biomeOk = problemFitsBiome(problem, state.biome);
  const farmOk  = problemFitsFarmType(problem, state.farmType);
  let rank = 0;
  if (dreel) rank = state.includeDreelBurn ? 1 : -1;
  else if (biomeOk && farmOk) rank = 3;
  else if (biomeOk || farmOk) rank = 2;
  else rank = 0;
  return { dreel, biomeOk, farmOk, rank, isFit: rank >= 3 || (dreel && state.includeDreelBurn) };
}

function fitContextLabel() {
  const biome = (BIOME_DISPLAY[state.biome] || state.biome || '').replace(/^[^\w]*\s*/, '');
  return `${biome} · ${state.farmType}`;
}

function renderProblemFilterBar(container) {
  let bar = document.getElementById('problem-filter-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'problem-filter-bar';
    bar.className = 'problem-filter-bar';
    container.appendChild(bar);
  }
  bar.innerHTML = `
    <p class="problem-filter-bar__context" id="problem-fit-context">
      Fit badges use your <strong>current</strong> location &amp; farm type:
      <span class="problem-filter-bar__context-values">${fitContextLabel()}</span>
      <span class="problem-filter-bar__context-note">(defaults until you change steps 2–3)</span>
    </p>
    <label class="problem-filter-bar__opt">
      <input type="checkbox" id="filter-prioritise-fits" ${state.prioritiseFits ? 'checked' : ''} />
      Prioritise fits for location &amp; farm type
    </label>
    <label class="problem-filter-bar__opt">
      <input type="checkbox" id="filter-dreel-burn" ${state.includeDreelBurn ? 'checked' : ''} />
      Include Dreel Burn catchment
    </label>
  `;
  bar.querySelector('#filter-prioritise-fits')?.addEventListener('change', (e) => {
    state.prioritiseFits = e.target.checked;
    populateProblemChips();
  });
  bar.querySelector('#filter-dreel-burn')?.addEventListener('change', (e) => {
    state.includeDreelBurn = e.target.checked;
    populateProblemChips();
  });
}

function populateProblemChips() {
  const container = document.getElementById('problem-chips');
  if (!container) return;
  container.innerHTML = '';

  if (problemsData.length === 0) {
    container.innerHTML = '<p class="form-hint">Problem data not yet loaded — ensure data/problems_v2.json is available.</p>';
    return;
  }

  renderProblemFilterBar(container);

  // Group by Category; within each category, sort fits first when prioritising
  const grouped = {};
  for (const p of problemsData) {
    const rel = problemRelevance(p);
    if (state.prioritiseFits && rel.dreel && !state.includeDreelBurn) continue;
    if (state.prioritiseFits && !rel.dreel && rel.rank === 0) {
      // Keep poor fits visible but muted — do not hide entirely
    }
    (grouped[p.Category] = grouped[p.Category] || []).push({ problem: p, rel });
  }

  for (const [cat, items] of Object.entries(grouped)) {
    items.sort((a, b) => b.rel.rank - a.rel.rank);

    const header = document.createElement('div');
    header.className = 'problem-category-header';
    header.textContent = `${CATEGORY_ICONS[cat] || '●'} ${cat}`;
    container.appendChild(header);

    const row = document.createElement('div');
    row.className = 'problem-chips-row';

    for (const { problem: p, rel } of items) {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'problem-chip';
      btn.dataset.code = p.Problem_Code;
      if (rel.dreel) btn.dataset.lens = 'dreel';
      if (state.prioritiseFits && !rel.isFit) btn.classList.add('problem-chip--muted');
      if (rel.biomeOk && rel.farmOk && !rel.dreel) btn.classList.add('problem-chip--fit');

      const symptom = p.Stated_Symptom.length > 40
        ? p.Stated_Symptom.slice(0, 40) + '…'
        : p.Stated_Symptom;

      const badges = [];
      if (rel.dreel) {
        badges.push('<span class="problem-chip__badge problem-chip__badge--dreel">Dreel Burn</span>');
      } else {
        if (!rel.biomeOk) badges.push('<span class="problem-chip__badge">Other location</span>');
        if (!rel.farmOk)  badges.push('<span class="problem-chip__badge">Other farm type</span>');
        if (rel.biomeOk && rel.farmOk) badges.push('<span class="problem-chip__badge problem-chip__badge--fit">Fit</span>');
      }

      btn.setAttribute('aria-pressed', String(p.Problem_Code === state.problemCode));
      btn.title = [
        p.Stated_Symptom,
        `Biomes: ${p.Applicable_Biomes}`,
        `Farm types: ${p.Applicable_Farm_Types}`,
      ].join('\n');
      btn.innerHTML = `
        <span class="problem-chip__icon">${CATEGORY_ICONS[cat] || ''}</span>
        <span class="problem-chip__label">${symptom}</span>
        ${badges.length ? `<span class="problem-chip__badges">${badges.join('')}</span>` : ''}
      `;
      btn.addEventListener('click', () => handleProblemChipClick(p.Problem_Code));

      row.appendChild(btn);
    }
    container.appendChild(row);
  }

  if (state.problemCode) renderProblemClearBtn();
}

function renderProblemClearBtn() {
  let btn = document.getElementById('btn-clear-problem');
  if (btn) return;
  const container = document.getElementById('problem-chips');
  if (!container) return;
  btn = document.createElement('button');
  btn.id        = 'btn-clear-problem';
  btn.type      = 'button';
  btn.className = 'btn btn-ghost btn-sm';
  btn.style.cssText = 'width:100%;margin-bottom:8px;';
  btn.textContent = '✕ Clear problem filter';
  btn.addEventListener('click', handleClearProblem);
  const filterBar = document.getElementById('problem-filter-bar');
  if (filterBar) filterBar.insertAdjacentElement('afterend', btn);
  else container.insertAdjacentElement('afterbegin', btn);
}

async function handleProblemChipClick(code) {
  state.problemCode   = code;
  state.activeProblem = problemsByCode[code];
  unlockOutcomes();
  updateProblemChipUI(code);
  renderProblemClearBtn();
  setText('step-problem-summary', state.activeProblem?.Stated_Symptom?.slice(0, 30) + '…' || code);

  const rec = recommendVariant(code, state.biomeRecords, state.farmType, { storeMeta: true });
  if (rec) {
    state.variantId            = rec.id;
    state.recommendedVariantId = rec.id;
    syncVariantSelect();
  } else {
    state.recommendationMeta = null;
  }

  await applyVariantAndRecalc();
  closeStep(1); openStep(2); // Problem → Location
}

async function handleClearProblem() {
  state.problemCode   = null;
  state.activeProblem = null;
  state.recommendedVariantId = null;
  state.recommendationMeta = null;
  state.urlSnapshot = null;
  document.getElementById('btn-clear-problem')?.remove();
  setText('step-problem-summary', 'Not selected');
  updateProblemChipUI(null);
  const panel = document.getElementById('problem-panel');
  if (panel) panel.hidden = true;
  updatePrintBriefSnapshot(null);
  updateAdvisorHandoffCopy(null);
  lockOutcomesUnlessBrowse();
  if (shouldShowOutcomes() && state.results) renderResults(state.results);
  else showEmptyOutcomes();
}

/** Escape hatch: power users skip problem and browse ShieldBelt variants. */
function handleBrowseIntervention() {
  // Mark browse intent only — do not unlock charts or auto-size the first variant.
  // Confirm selection / Calculate Outcomes unlocks and sizes.
  state.browseMode = true;
  state.outcomesUnlocked = false;
  state.variantId = null;
  state.currentRecord = null;
  state.results = null;
  syncVariantSelect();
  renderVariantDetail(null);
  closeStep(1);
  openStep(2);
  openStep(4);
  showEmptyOutcomes();
}

function updateProblemChipUI(activeCode) {
  document.querySelectorAll('.problem-chip').forEach(btn => {
    const isActive = btn.dataset.code === activeCode;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.classList.toggle('problem-chip--selected', isActive);
  });
}

// =============================================================================
// Farm type selector
// =============================================================================

function populateFarmTypeSelector() {
  const radios = document.querySelectorAll('input[name="farm-type"]');
  radios.forEach(r => { r.checked = r.value === state.farmType; });
}

function initFarmTypeSelector() {
  document.querySelectorAll('input[name="farm-type"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      state.farmType = radio.value;
      setText('step-farmtype-summary', radio.value);
      populateProblemChips();
      if (state.problemCode) {
        const rec = recommendVariant(state.problemCode, state.biomeRecords, state.farmType, { storeMeta: true });
        if (rec) {
          state.variantId = rec.id;
          state.recommendedVariantId = rec.id;
          syncVariantSelect();
        }
      }
      await applyVariantAndRecalc();
      closeStep(3); openStep(4); // Farm Type → Variant
    });
  });
}

// =============================================================================
// Variant selector
// =============================================================================

function populateVariantSelector() {
  const sel = document.getElementById('variant-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (!state.biomeRecords.length) {
    sel.disabled = true;
    sel.innerHTML = '<option value="">— No variants for this location —</option>';
    return;
  }
  sel.disabled = false;
  sel.innerHTML = '<option value="">— Choose a variant —</option>';
  const widthEmoji = { '3m': '🔵', '6m': '🟢', '12m': '🟡', '20m': '🔴' };
  state.biomeRecords.forEach(r => {
    const opt       = document.createElement('option');
    opt.value       = r.id;
    opt.textContent = `${widthEmoji[r.width] || ''} ${r.width} · ${r.variant}`;
    sel.appendChild(opt);
  });
  sel.value = state.variantId || '';
  setText('variant-hint', 'Select a variant for this location.');
}

function syncVariantSelect() {
  const sel = document.getElementById('variant-select');
  if (sel) sel.value = state.variantId || '';
  if (state.variantId) {
    const rec = state.biomeRecords.find(r => r.id === state.variantId);
    if (rec) setText('step-variant-summary', `${rec.width} ${rec.variant}`);
  }
}

function initVariantSelector() {
  const sel = document.getElementById('variant-select');
  if (!sel) return;
  sel.addEventListener('change', async () => {
    state.variantId = sel.value || null;
    if (state.variantId) {
      const rec = state.biomeRecords.find(r => r.id === state.variantId);
      if (rec) setText('step-variant-summary', `${rec.width} ${rec.variant}`);
    }
    await applyVariantAndRecalc();
    // No auto-advance: user must press Confirm Selection
  });
}

function initConfirmVariant() {
  document.getElementById('btn-confirm-variant')?.addEventListener('click', () => {
    unlockOutcomes({ browse: !state.problemCode });
    closeStep(4);
    openStep(5); // Length; Assumptions (step 6) stays collapsed
    applyVariantAndRecalc();
  });
}

function renderVariantDetail(record) {
  const card = document.getElementById('variant-detail');
  if (!card) return;
  if (!record) { card.classList.add('hidden'); return; }

  card.classList.remove('hidden');
  setText('variant-detail-name', record.variant);

  const badge = document.getElementById('variant-detail-badge');
  if (badge) { badge.textContent = record.width; badge.dataset.width = record.width; }

  const desc = document.getElementById('variant-detail-desc');
  if (desc) desc.textContent = record.registry?.soilTypeCondition || record.bespokePlantingRegime || '';

  const tags = document.getElementById('variant-detail-tags');
  if (tags) {
    tags.innerHTML = '';
    const height = document.createElement('span');
    height.className = 'biome-tag biome-tag--light';
    height.textContent = record.assumedBiomassHeight;
    tags.appendChild(height);

    const sser = document.createElement('span');
    sser.className = 'biome-tag';
    sser.textContent = `SSER ${record.registry?.sserGrossUnitsPerKm ?? '—'}/km`;
    tags.appendChild(sser);
  }
}

// =============================================================================
// Strip length
// =============================================================================

function initStripLengthInput() {
  const input  = document.getElementById('strip-length');
  const slider = document.getElementById('strip-length-slider');
  const sliderDisplay = document.getElementById('strip-length-slider-display');
  if (!input) return;

  // FIX [input-validation]: track last valid value so non-numeric input reverts
  let lastValidLength = state.lengthM;
  let debounceTimer;

  function syncSlider(val) {
    if (!slider) return;
    const clamped = Math.min(Math.max(val, 100), 5000);
    slider.value = clamped;
    slider.setAttribute('aria-valuenow', clamped);
    if (sliderDisplay) sliderDisplay.textContent = val.toLocaleString('en-GB') + ' m';
  }

  const applyValue = async (val) => {
    clearInputError('strip-length');
    lastValidLength   = val;
    state.lengthM     = val;
    input.value       = val;
    syncSlider(val);
    updateLengthDerived();
    setText('step-length-summary', `${val.toLocaleString('en-GB')} m (${(val / 1000).toFixed(2)} km)`);
    await recalc();
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const raw = input.value.trim();
      const val = parseInt(raw, 10);
      if (!raw || isNaN(val) || !isFinite(val)) {
        input.value = lastValidLength;
        return;
      }
      if (val <= 0) {
        showInputError('strip-length', 'Enter a length greater than 0 m');
        return;
      }
      await applyValue(val);
    }, 300);
  });

  if (slider) {
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      if (sliderDisplay) sliderDisplay.textContent = val.toLocaleString('en-GB') + ' m';
      input.value = val;
    });
    slider.addEventListener('change', async () => {
      const val = parseInt(slider.value, 10);
      await applyValue(val);
    });
  }

  // Sync DOM to state on init (URL may have set a different value)
  input.value = state.lengthM;
  syncSlider(state.lengthM);
  updateLengthDerived();
}

function updateLengthDerived() {
  setText('strip-km', (state.lengthM / 1000).toFixed(2) + ' km');
  if (state.currentRecord) {
    const widthM = parseWidth(state.currentRecord.width);
    const ha     = ((widthM * state.lengthM) / 10000).toFixed(3);
    setText('strip-area', ha + ' ha');
  }
}

// =============================================================================
// Credit price slider
// =============================================================================

function initCreditPriceSlider() {
  const slider  = document.getElementById('credit-price');
  const display = document.getElementById('credit-price-display');
  if (!slider) return;

  const update = async () => {
    state.creditPrice = parseInt(slider.value, 10);
    if (display) display.textContent = '£' + state.creditPrice;
    slider.setAttribute('aria-valuenow', state.creditPrice);
    setText('step-price-summary', `Credit £${state.creditPrice} / tCO₂e`);
    await recalc();
  };

  // Sync DOM from state on init (URL restoration may have set a different value)
  slider.value = state.creditPrice;
  slider.setAttribute('aria-valuenow', state.creditPrice);
  if (display) display.textContent = '£' + state.creditPrice;

  slider.addEventListener('input',  update);
  slider.addEventListener('change', update);
}

// =============================================================================
// Placement toggle
// =============================================================================

function initPlacementToggle() {
  document.querySelectorAll('[data-placement]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.placement = btn.dataset.placement;
      document.querySelectorAll('[data-placement]').forEach(b => {
        b.classList.toggle('active', b.dataset.placement === state.placement);
      });
      await recalc();
    });
  });
}

// =============================================================================
// Windbreak orientation toggle
// =============================================================================

function initWindbreakToggle() {
  document.querySelectorAll('[data-orient]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.windbreakOrient = btn.dataset.orient;
      document.querySelectorAll('[data-orient]').forEach(b => {
        b.classList.toggle('active', b.dataset.orient === state.windbreakOrient);
      });
      await recalc();
    });
  });
}

// =============================================================================
// D. Problem → Variant matching
// =============================================================================

/**
 * Resolve a dot-path against a record.
 * Supports simple dotted paths; handles farmType substitution in key segments.
 */
function getNestedValue(record, path, farmType) {
  const parts = path.split('.');
  let cur = record;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part] !== undefined ? cur[part] : cur[farmType];
  }
  return cur;
}

/** Numeric value for routing triggers; nitrate falls back to deprecated nutrientRetention. */
function getTriggerMetric(record, path, farmType) {
  let v = getNestedValue(record, path, farmType);
  if (v === undefined && path.endsWith('.nitrateRetention')) {
    const legacy = path.replace(/\.nitrateRetention$/, '.nutrientRetention');
    v = getNestedValue(record, legacy, farmType);
  }
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Evaluate one routing clause (no OR). Returns true if satisfied.
 */
function evalRoutingClause(clause, record, farmType) {
  const c = clause.trim();
  if (!c) return false;
  if (c.includes(' >= ')) {
    const i = c.indexOf(' >= ');
    const path = c.slice(0, i).trim();
    const thresh = parseFloat(c.slice(i + 4).trim());
    const val = getTriggerMetric(record, path, farmType);
    return Number.isFinite(val) && Number.isFinite(thresh) && val >= thresh;
  }
  if (c.includes(' <= ')) {
    const i = c.indexOf(' <= ');
    const path = c.slice(0, i).trim();
    const thresh = parseFloat(c.slice(i + 4).trim());
    const val = getTriggerMetric(record, path, farmType);
    return Number.isFinite(val) && Number.isFinite(thresh) && val <= thresh;
  }
  if (c.includes(" contains '")) {
    const parts  = c.split(" contains '");
    const path   = parts[0].trim();
    const target = parts[1].replace(/'/g, '').trim();
    const val    = getNestedValue(record, path, farmType);
    return typeof val === 'string' && val.toLowerCase().includes(target.toLowerCase());
  }
  return false;
}

/**
 * Evaluate a routing trigger string against a record. Returns 0–30 pts.
 */
function evalRoutingTrigger(trigger, record, farmType) {
  if (!trigger) return 10;
  try {
    if (/\s+OR\s+/i.test(trigger)) {
      const clauses = trigger.split(/\s+OR\s+/i).map(s => s.trim()).filter(Boolean);
      for (const cl of clauses) {
        if (evalRoutingClause(cl, record, farmType)) return 30;
      }
      return 0;
    }
    if (trigger.includes(' >= ') || trigger.includes(' <= ') || trigger.includes(" contains '")) {
      return evalRoutingClause(trigger, record, farmType) ? 30 : 0;
    }
    return 10; // complex/unrecognised trigger → partial credit
  } catch {
    return 0;
  }
}

/**
 * Score one record against a problem; returns { score, reasons[] }.
 */
function scoreVariantForProblem(problem, record, farmType) {
  let score = 0;
  const reasons = [];
  const problemCode = problem.Problem_Code;
  const rawVariants = problem.Relevant_ShieldBelt_Variants;
  const targetVariants = (Array.isArray(rawVariants) ? rawVariants : [])
    .map(v => {
      const spaceIdx = v.indexOf(' ');
      return spaceIdx < 0
        ? { width: '', nameFrag: v.toLowerCase(), label: v }
        : { width: v.slice(0, spaceIdx), nameFrag: v.slice(spaceIdx + 1).toLowerCase(), label: v };
    });

  const vname = record.variant.toLowerCase();
  const width = record.width;

  // 1. Direct variant match (0–40 pts)
  let matchedLabel = null;
  let matchPts = 0;
  for (const tv of targetVariants) {
    const nameMatch  = vname.includes(tv.nameFrag);
    const widthMatch = width === tv.width;
    if (nameMatch && widthMatch) { matchPts = 40; matchedLabel = tv.label; break; }
    if (nameMatch)               { matchPts = 20; matchedLabel = tv.label; break; }
  }
  score += matchPts;
  if (matchedLabel && matchPts >= 40) {
    reasons.push(`Listed against this challenge (${matchedLabel})`);
  } else if (matchedLabel) {
    reasons.push(`Related listed option (${matchedLabel})`);
  }

  // 2. Routing trigger (0–30 pts)
  const triggerPts = evalRoutingTrigger(problem.Routing_Trigger, record, farmType);
  score += triggerPts;
  if (triggerPts >= 30) {
    reasons.push('Strongest match on the routing metric for this problem');
  } else if (triggerPts > 0) {
    reasons.push('Partial fit on the problem routing signal');
  }

  // 3. Farm type relevance (0–15 pts)
  const applicableFTs = String(problem.Applicable_Farm_Types || '').split(',').map(s => s.trim());
  if (applicableFTs.includes(farmType)) {
    score += 15;
    reasons.push(`Suited to ${farmType}`);
  } else if (/^all$/i.test(problem.Applicable_Farm_Types || '')) {
    score += 5;
  }

  // 4. SSER bonus (0–10 pts)
  const sser = record.registry?.sserGrossUnitsPerKm || 0;
  const sserPts = Math.min(sser / 100, 1) * 10;
  score += sserPts;
  if (sserPts >= 8) reasons.push('High nature-finance (SSER) density for the margin');

  // 5. Carbon bonus for carbon problems (0–5 pts)
  if (['CARBON_INCOME', 'CARBON_BASELINE'].includes(problemCode)) {
    const cPts = Math.min(record.seq50yrTotal / 900, 1) * 5;
    score += cPts;
    if (cPts >= 3) reasons.push('Strong 50-year carbon sequestration profile');
  }

  return { score, reasons: reasons.slice(0, 3) };
}

/**
 * Score and rank all records in a biome against a problem.
 * Returns the top-ranked record, or null.
 * Also stores recommendation meta (reasons) on state when requested.
 */
function recommendVariant(problemCode, biomeRecords, farmType, { storeMeta = false } = {}) {
  const problem = problemsByCode[problemCode];
  if (!problem || !biomeRecords.length) {
    if (storeMeta) state.recommendationMeta = null;
    return null;
  }

  const scored = biomeRecords.map(record => {
    const { score, reasons } = scoreVariantForProblem(problem, record, farmType);
    return { record, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0] || null;
  if (storeMeta) {
    state.recommendationMeta = top
      ? { reasons: top.reasons, score: top.score, variantId: top.record.id }
      : null;
  }
  return top?.record || null;
}

function explainRecommendation(problem, record) {
  if (!problem || !record) return [];
  if (
    state.recommendationMeta?.variantId === record.id &&
    Array.isArray(state.recommendationMeta.reasons) &&
    state.recommendationMeta.reasons.length
  ) {
    return state.recommendationMeta.reasons;
  }
  return scoreVariantForProblem(problem, record, state.farmType).reasons;
}

function buildPlanningQuestions(problem, record) {
  const base = PLANNING_QUESTIONS_BY_CATEGORY[problem?.Category]
    || [
      'Photos of the field margin and drainage context',
      'Tenancy / ownership constraints and labour window',
      'Any designations or scheme eligibility notes',
    ];
  const questions = base.slice(0, 3);
  if (record?.width) {
    questions.push(`Does a ${record.width} footprint fit this headland without severing a productive block?`);
  }
  return questions.slice(0, 4);
}

/** Returns top 3 alternate variants for "Also consider" section. */
function getAlternateVariants(problemCode, currentRecord) {
  if (!problemCode || !state.biomeRecords.length) return [];
  const allScored = state.biomeRecords.map(record => {
    let score = 0;
    const problem = problemsByCode[problemCode];
    if (problem) {
      const rawVariants = problem.Relevant_ShieldBelt_Variants;
      const tvs = (Array.isArray(rawVariants) ? rawVariants : []).map(v => {
        const si = v.indexOf(' ');
        return si < 0 ? { width: '', nameFrag: v.toLowerCase() }
          : { width: v.slice(0, si), nameFrag: v.slice(si + 1).toLowerCase() };
      });
      const vname = record.variant.toLowerCase();
      for (const tv of tvs) {
        if (vname.includes(tv.nameFrag) && record.width === tv.width) { score += 40; break; }
        if (vname.includes(tv.nameFrag))                               { score += 20; break; }
      }
      score += evalRoutingTrigger(problem.Routing_Trigger, record, state.farmType);
    }
    return { record, score };
  });
  allScored.sort((a, b) => b.score - a.score);
  return allScored
    .filter(s => s.record.id !== currentRecord?.id && s.score > 0)
    .slice(0, 3)
    .map(s => s.record);
}

// =============================================================================
// E. Problem result panel
// =============================================================================

function renderProblemPanel(problem, record, otherVariants = []) {
  const panel = document.getElementById('problem-panel');
  if (!panel || !problem) return;

  panel.hidden = false;
  const icon = CATEGORY_ICONS[problem.Category] || '●';

  // Determine "Recommended" vs "Selected"
  const isRecommended = !state.recommendedVariantId || record?.id === state.recommendedVariantId;
  const variantLabel  = isRecommended ? 'Recommended' : 'Selected';
  const variantChip   = record
    ? `<span class="badge-width" data-width="${record.width}">${record.width}</span>
       <strong>${record.variant}</strong>`
    : '<em class="text-muted">No variant matched</em>';

  const whyReasons = isRecommended ? explainRecommendation(problem, record) : [];
  const whyHTML = whyReasons.length
    ? `<div class="why-recommended" id="why-recommended">
         <div class="problem-panel__section-label">Why this option</div>
         <ul class="why-recommended__list">
           ${whyReasons.map(r => `<li>${r}</li>`).join('')}
         </ul>
       </div>`
    : '';

  const planningQs = buildPlanningQuestions(problem, record);
  const planningHTML = `
    <div class="planning-notes" id="planning-notes">
      <div class="problem-panel__section-label">Planning questions for your advisor</div>
      <ul class="planning-notes__list">
        ${planningQs.map(q => `<li>${q}</li>`).join('')}
      </ul>
    </div>`;

  // Related topics — no Solutions Directory promise
  const linkedKeys = Array.isArray(problem.Linked_Solution_Directory_Keys)
    ? problem.Linked_Solution_Directory_Keys
    : [];
  const pillsHTML = linkedKeys.map(k =>
    `<a class="solution-pill solution-pill--link" href="fife-shieldbelt-topics.html" title="Related topic (not sized in this calculator)">${k}</a>`
  ).join('');

  // "Also consider" — clickable ShieldBelt variant chips
  const alsoConsiderHTML = otherVariants.length
    ? `<div class="problem-panel__section-label">Also Consider</div>
       <div class="solution-pills" role="group" aria-label="Alternate ShieldBelt variants">
         ${otherVariants.map(v =>
           `<button type="button" class="solution-pill solution-pill--action"
              data-variant-id="${v.id}"
              title="Size this ShieldBelt variant">
              <span class="badge-width" data-width="${v.width}" style="font-size:0.7em">${v.width}</span> ${v.variant}
            </button>`
         ).join('')}
       </div>`
    : '';

  const communityStyle = problem.Solution_Community === 'None directly applicable.'
    ? 'style="color:var(--c-muted);font-style:italic;"'
    : '';

  const advisorRole = ADVISOR_ROLE_BY_CATEGORY[problem.Category]
    || 'an agronomist or nature-finance advisor';

  panel.innerHTML = `
    <div class="problem-panel__section-label" style="font-size:1rem;font-weight:700;color:var(--c-forest);margin-bottom:0.5rem;">Solution Summary</div>
    <div class="problem-panel__head">
      <span class="problem-panel__icon">${icon}</span>
      <div>
        <div class="problem-panel__code">${problem.Problem_Code}</div>
        <div class="problem-panel__symptom">${problem.Stated_Symptom}</div>
      </div>
    </div>

    <div class="problem-panel__section-label">Farmer Diagnosis</div>
    <blockquote class="problem-diagnosis">${problem.Farmer_Diagnosis_Copy}</blockquote>

    <div class="problem-panel__section-label">Field Margin Intervention</div>
    <div class="problem-panel__recommendation">
      ${variantLabel}: ${variantChip}
    </div>

    ${whyHTML}
    ${planningHTML}
    ${alsoConsiderHTML}

    <div class="problem-panel__section-label">Other responses often considered</div>
    <p class="solution-map__note text-sm text-muted">
      Advisors often weigh several response types. This app only sizes ShieldBelt linear margins
      (nature-based options on marginal land)—not the alternatives below.
    </p>
    <div class="solution-map">
      <div class="solution-map__row">
        <span class="solution-map__icon">🌱</span>
        <div class="solution-map__content">
          <span class="solution-map__label">Agronomic</span>
          <span class="solution-map__text">${problem.Solution_Agronomic}</span>
        </div>
      </div>
      <div class="solution-map__row">
        <span class="solution-map__icon">🏗</span>
        <div class="solution-map__content">
          <span class="solution-map__label">Infrastructure</span>
          <span class="solution-map__text">${problem.Solution_Infrastructure}</span>
        </div>
      </div>
      <div class="solution-map__row">
        <span class="solution-map__icon">📡</span>
        <div class="solution-map__content">
          <span class="solution-map__label">Precision Tech</span>
          <span class="solution-map__text">${problem.Solution_Precision_Tech}</span>
        </div>
      </div>
      <div class="solution-map__row">
        <span class="solution-map__icon">🤝</span>
        <div class="solution-map__content">
          <span class="solution-map__label">Community</span>
          <span class="solution-map__text" ${communityStyle}>${problem.Solution_Community}</span>
        </div>
      </div>
      <div class="solution-map__row">
        <span class="solution-map__icon">🚀</span>
        <div class="solution-map__content">
          <span class="solution-map__label">Emerging Tech</span>
          <span class="solution-map__text">${problem.Solution_Emerging_Tech_Landscaping}</span>
        </div>
      </div>
    </div>

    ${pillsHTML ? `
    <div class="problem-panel__section-label">Related topics (not sized here)</div>
    <div class="solution-pills">${pillsHTML}</div>
    ` : ''}

    <div class="problem-panel__section-label">Discuss with an advisor</div>
    <p class="advisor-hint text-sm">
      Bring this diagnosis and the sized ShieldBelt option to ${advisorRole}.
      Print a planning brief or share the scenario link below — it restores problem, diagnosis context, other-responses snapshot, location, farm type, and margin length.
    </p>
  `;

  // Wire clickable "Also consider" chips
  panel.querySelectorAll('[data-variant-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-variant-id');
      if (!id) return;
      state.variantId = id;
      syncVariantSelect();
      unlockOutcomes();
      await applyVariantAndRecalc();
    });
  });

  updateAdvisorHandoffCopy(problem);
  updatePrintBriefSnapshot(problem, record, whyReasons, planningQs, state.lastResults);
}

function updateAdvisorHandoffCopy(problem) {
  const el = document.getElementById('advisor-handoff-copy');
  if (!el) return;
  if (!problem) {
    el.textContent = 'Use this as a starting point for planning a ShieldBelt margin with an appropriate advisor. Copy the link to reopen this exact scenario.';
    return;
  }
  const role = ADVISOR_ROLE_BY_CATEGORY[problem.Category]
    || 'an agronomist or nature-finance advisor';
  el.textContent = `This is a planning start—not a prescription. Discuss the sized margin option with ${role}. The share link restores your problem, a short diagnosis & other-responses snapshot, location, farm type, variant, and length.`;
}

function placementLabel(placement) {
  return ({
    riparian: 'Riparian / watercourse edge',
    crossSlope: 'Cross-slope / contour',
    downSlope: 'Down-slope',
  })[placement] || placement;
}

function solutionMapRowsHtml(problem, snapshotMap = null) {
  const rows = [
    ['a', 'Agronomic', problem?.Solution_Agronomic, snapshotMap?.a],
    ['i', 'Infrastructure', problem?.Solution_Infrastructure, snapshotMap?.i],
    ['p', 'Precision Tech', problem?.Solution_Precision_Tech, snapshotMap?.p],
    ['c', 'Community', problem?.Solution_Community, snapshotMap?.c],
    ['e', 'Emerging Tech', problem?.Solution_Emerging_Tech_Landscaping, snapshotMap?.e],
  ];
  return rows.map(([, label, live, snap]) => {
    const text = truncText(live || snap || '—', 160);
    return `<div class="print-brief__map-row"><dt>${label}</dt><dd>${text}</dd></div>`;
  }).join('');
}

/** Populate print-only planning brief (P2 richer one-pager layout). */
function updatePrintBriefSnapshot(problem, record, whyReasons = [], planningQs = [], results = null) {
  const el = document.getElementById('print-brief-snapshot');
  const footerEl = document.getElementById('print-brief-footer');
  if (!el) return;

  const snap = state.urlSnapshot;
  const effectiveProblem = problem || (snap ? {
    Problem_Code: snap.code,
    Stated_Symptom: snap.s,
    Farmer_Diagnosis_Copy: snap.d,
    Category: snap.cat,
    Solution_Agronomic: snap.m?.a,
    Solution_Infrastructure: snap.m?.i,
    Solution_Precision_Tech: snap.m?.p,
    Solution_Community: snap.m?.c,
    Solution_Emerging_Tech_Landscaping: snap.m?.e,
  } : null);

  const r = results || state.lastResults;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const biomeLabel = BIOME_DISPLAY[state.biome] || state.biome;
  const variantLine = record
    ? `${record.width} · ${record.variant}`
    : 'No ShieldBelt variant matched yet';

  // Browse-without-problem: still print a sizing brief when outcomes exist
  if (!effectiveProblem && !r) {
    el.hidden = true;
    el.innerHTML = '';
    if (footerEl) footerEl.textContent = '';
    return;
  }

  const advisorRole = effectiveProblem
    ? (ADVISOR_ROLE_BY_CATEGORY[effectiveProblem.Category]
      || 'an agronomist or nature-finance advisor')
    : 'an agronomist or nature-finance advisor';
  const why = (whyReasons.length ? whyReasons : (problem ? explainRecommendation(problem, record) : []))
    .map(item => `<li>${item}</li>`).join('');
  const qs = (planningQs.length ? planningQs : (problem ? buildPlanningQuestions(problem, record) : []))
    .map(q => `<li>${q}</li>`).join('');
  const outcomesHtml = r ? `
    <div class="print-brief__block print-brief__outcomes">
      <strong>Sized outcomes (indicative)</strong>
      <dl class="print-brief__meta print-brief__meta--outcomes">
        <div><dt>Net agronomic</dt><dd>${fmtGBP(r.netAgronomicBenefit)}/yr</dd></div>
        <div><dt>25-yr carbon</dt><dd>${fmtGBP(r.seq25yrRevenue)}</dd></div>
        <div><dt>Wider ecosystem</dt><dd>${fmtGBP(r.widerEcoValue)}/yr</dd></div>
      </dl>
    </div>` : '';
  const mapHtml = effectiveProblem ? solutionMapRowsHtml(problem, snap?.m) : '';
  const problemMeta = effectiveProblem ? `
      <div><dt>Problem</dt><dd>${effectiveProblem.Problem_Code || '—'} — ${effectiveProblem.Stated_Symptom || '—'}</dd></div>
      <div><dt>Category</dt><dd>${effectiveProblem.Category || '—'}</dd></div>` : `
      <div><dt>Entry path</dt><dd>Browse by intervention (no problem selected)</dd></div>`;

  el.hidden = false;
  el.innerHTML = `
    <h2 class="print-brief__heading">ShieldBelt planning brief</h2>
    <p class="print-brief__lede">Nature-based options on marginal land — starting point for advisor discussion (not a prescription).</p>
    <dl class="print-brief__meta">
      ${problemMeta}
      <div><dt>Location</dt><dd>${biomeLabel}</dd></div>
      <div><dt>Farm type</dt><dd>${state.farmType}</dd></div>
      <div><dt>Sized margin</dt><dd>${variantLine} · ${state.lengthM.toLocaleString('en-GB')} m</dd></div>
      <div><dt>Placement</dt><dd>${placementLabel(state.placement)} · windbreak ${state.windbreakOrient}</dd></div>
      <div><dt>Credit price</dt><dd>£${state.creditPrice}/tCO₂e (assumption)</dd></div>
    </dl>
    ${effectiveProblem ? `<p class="print-brief__diagnosis"><strong>Diagnosis:</strong> ${effectiveProblem.Farmer_Diagnosis_Copy || '—'}</p>` : ''}
    ${why ? `<div class="print-brief__block"><strong>Why this ShieldBelt option</strong><ul>${why}</ul></div>` : ''}
    ${outcomesHtml}
    ${mapHtml ? `<div class="print-brief__block">
      <strong>Other responses often considered</strong>
      <p class="print-brief__note" style="margin-top:4px;">Context only — not sized in this calculator.</p>
      <dl class="print-brief__map">${mapHtml}</dl>
    </div>` : ''}
    ${qs ? `<div class="print-brief__block"><strong>Open questions</strong><ul>${qs}</ul></div>` : ''}
    <div class="print-brief__block">
      <strong>Bring to the meeting</strong>
      <ul>
        <li>Photos of the field margin and drainage context</li>
        <li>Tenancy / ownership constraints and labour window</li>
        <li>Any designations, NVZ, or scheme eligibility notes</li>
        <li>This brief and the sized outcomes above</li>
      </ul>
    </div>
    <p class="print-brief__advisor"><strong>Discuss with:</strong> ${advisorRole}.</p>
    <p class="print-brief__note">This calculator only sizes ShieldBelt linear margins (NbS on marginal land). Other farm responses stay as honest context—not calculable peers.</p>
    ${shareUrl ? `<p class="print-brief__share"><strong>Scenario link:</strong> <span class="print-brief__url">${shareUrl}</span></p>` : ''}
  `;

  if (footerEl) {
    footerEl.textContent = shareUrl
      ? `Scenario link: ${shareUrl}`
      : 'Fife Farm Resilience Calculator · NFCA';
  }
}

// =============================================================================
// G. renderResults — all 6 sections
// =============================================================================

function renderResults(results) {
  if (!results) return;

  if (!shouldShowOutcomes()) {
    showEmptyOutcomes();
    return;
  }

  document.getElementById('results-empty')?.classList.add('hidden');
  document.getElementById('results-content')?.classList.remove('hidden');

  const r = results;
  const c = state.currentRecord;

  // Print header date for planning brief
  const printHeader = document.querySelector('.print-header');
  if (printHeader) {
    printHeader.setAttribute('data-date', new Date().toLocaleDateString('en-GB'));
  }

  if (!state.activeProblem) updateAdvisorHandoffCopy(null);
  updatePrintBriefSnapshot(
    state.activeProblem,
    state.currentRecord,
    state.recommendationMeta?.reasons || [],
    [],
    r
  );

  flashStatBoxes();
  updateSSERWidthColor(r.width);

  // --- Header ---
  setText('results-title', r.variantName || '—');
  const metaEl = document.getElementById('results-meta');
  if (metaEl) metaEl.textContent = `${BIOME_DISPLAY[r.biome] || r.biome} · ${r.width} · ${state.lengthM.toLocaleString('en-GB')} m`;

  const tagsEl = document.getElementById('results-tags');
  if (tagsEl) {
    tagsEl.innerHTML = '';
    const wb = document.createElement('span');
    wb.className = 'badge-width'; wb.dataset.width = r.width; wb.textContent = r.width;
    tagsEl.appendChild(wb);
    const bt = document.createElement('span');
    bt.className = 'biome-tag'; bt.textContent = BIOME_DISPLAY[r.biome] || r.biome;
    tagsEl.appendChild(bt);
    if (state.activeProblem) {
      const pt = document.createElement('span');
      pt.className = 'biome-tag'; pt.style.background = 'var(--c-gold)';
      pt.textContent = `${CATEGORY_ICONS[state.activeProblem.Category] || ''} ${state.activeProblem.Problem_Code}`;
      tagsEl.appendChild(pt);
    }
  }

  // --- Stat boxes (3 key outcomes) ---
  setStatBox('stat-agro-benefit',
    fmtGBP(r.netAgronomicBenefit) + '/yr');
  const agroBox = document.getElementById('stat-agro-benefit')?.closest('.stat-box');
  if (agroBox) agroBox.classList.toggle('stat-box--negative', r.netAgronomicBenefit < 0);

  setStatBox('stat-25yr-carbon',
    fmtGBP(r.seq25yrRevenue));

  setStatBox('stat-wider-eco',
    fmtGBP(r.widerEcoValue) + '/yr');

  // Click-to-scroll for each stat box
  setupStatBoxScroll('stat-agro-box',   'section-avoided-costs');
  setupStatBoxScroll('stat-carbon-box', 'section-carbon');
  setupStatBoxScroll('stat-eco-box',    'section-wider-eco');

  updateLengthDerived();

  const setCanvasLabel = (id, desc) => {
    const el = document.getElementById(id);
    if (el) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', desc); }
  };

  // --- Section 1: Agronomic Services radar ---
  setCanvasLabel('chart-eco-radar', `Agronomic services radar chart for ${r.variantName}`);
  radarChart(
    'chart-eco-radar',
    ['Ecosystem\nHealth', 'Habitat', 'Soil Carbon', 'Agronomic\nYield', 'Pest Reg', 'Thermal'],
    [{
      label: r.variantName,
      color: '#52b788',
      values: [
        r.radarData.ecosystemHealth,
        r.radarData.habitatDistinctiveness,
        r.radarData.soilCarbonAndHealth,
        r.radarData.agronomicYield,
        Math.min((r.pestRegulationValue / (r.lengthM / 1000)) / 2, 100),
        Math.min((r.thermalRegulationValue / (r.lengthM / 1000)) / 2, 100),
      ],
    }],
    null
  );

  // Pest, thermal & pollination chips
  const ptChips = document.getElementById('pest-thermal-chips');
  if (ptChips) {
    ptChips.innerHTML = `
      <div class="crew-chip">
        <div class="crew-chip__value">${fmtGBP(r.pestRegulationValue)}</div>
        <div class="crew-chip__label">Pest regulation / yr</div>
      </div>
      <div class="crew-chip">
        <div class="crew-chip__value">${fmtGBP(r.thermalRegulationValue)}</div>
        <div class="crew-chip__label">Thermal regulation / yr</div>
      </div>
      <div class="crew-chip">
        <div class="crew-chip__value">${fmtGBP(r.pollinationValue)}</div>
        <div class="crew-chip__label">Pollination value / yr</div>
      </div>
    `;
  }

  // --- Section 2: Wider Ecosystem Services radar (v8: nitrate vs phosphorus separate) ---
  setCanvasLabel('chart-water-radar', `Water and catchment radar for ${r.variantName}`);
  radarChart(
    'chart-water-radar',
    ['Flood Control', 'Sediment Trap', 'Nitrate\nRetention', 'Phosphorus\nRetention', 'Catchment\nHydro', 'Water\nQuality'],
    [{
      label: r.variantName,
      color: '#2d6a4f',
      values: [
        r.sepaData.floodControl,
        r.sepaData.sedimentTrapping,
        r.sepaData.nitrateRetention,
        r.sepaData.phosphorusRetention,
        r.radarData.catchmentHydrology,
        r.radarData.waterQuality,
      ],
    }],
    null
  );

  const waterExtras = document.getElementById('water-sepa-extras');
  if (waterExtras) {
    const drought = r.sepaData.droughtResilience ?? 0;
    const dClamped = Math.min(100, Math.max(0, drought));
    let html = '<div class="results-section__title" style="font-size:0.78rem;margin-bottom:0.35rem;">Drought resilience (variant)</div>';
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:0.5rem;">`
      + `<div role="meter" aria-valuenow="${dClamped}" aria-valuemin="0" aria-valuemax="100" title="Tier-3 drought resilience score"`
      + ` style="flex:1;height:10px;background:var(--c-stone,#e8e4dc);border-radius:5px;overflow:hidden;">`
      + `<div style="width:${dClamped}%;height:100%;background:var(--c-w60m,#0f4c3a);"></div></div>`
      + `<span class="text-mono" style="min-width:2.5em;">${Math.round(drought)}</span><span class="text-xs text-muted">/ 100</span></div>`;
    if (state.placement === 'riparian' && r.sepaData.phosphorusRemobilisationRisk) {
      html += '<p class="text-xs" style="margin:0.35rem 0;color:#92400e;background:#fffbeb;padding:0.45rem 0.55rem;border-radius:6px;border-left:3px solid #f59e0b;">'
        + '⚠ <strong>Phosphorus remobilisation risk:</strong> High-organic woodland soils may increase dissolved reactive phosphorus in some conditions. '
        + 'A grass outer buffer (Zone 3) mitigates this risk.</p>';
    }
    if (state.biome === BIOMES.EAST_NEUK && drought < 50) {
      html += '<p class="text-xs text-muted" style="margin-top:0.35rem;">In the East Neuk, drought and summer low-flow is the primary water risk. '
        + 'Dense riparian woodland on small burns may increase evapotranspiration — upstream infiltration interventions (contour swales, alley cropping) '
        + 'are preferred for burn-drying contexts.</p>';
    }
    waterExtras.innerHTML = html;
  }

  // CREW sub-service chips + SSER + 50yr carbon
  const crewContainer = document.getElementById('crew-chips');
  if (crewContainer) {
    crewContainer.innerHTML = `
      <div class="crew-chip">
        <div class="crew-chip__value">${fmtGBP(r.crewBreakdown.airFiltration)}</div>
        <div class="crew-chip__label">Air filtration / yr</div>
      </div>
      <div class="crew-chip">
        <div class="crew-chip__value">${fmtGBP(r.crewBreakdown.catchmentHydrology)}</div>
        <div class="crew-chip__label">Catchment hydrology / yr</div>
      </div>
      <div class="crew-chip">
        <div class="crew-chip__value">${fmtGBP(r.crewBreakdown.waterPurification)}</div>
        <div class="crew-chip__label">Water purification / yr</div>
      </div>
    `;
  }
  const widerEcoExtra = document.getElementById('wider-eco-extra');
  if (widerEcoExtra) {
    widerEcoExtra.innerHTML = `
      <div class="crew-chip">
        <div class="crew-chip__value stat-box__value--leaf">${fmtSSER(r.sserUnitsTotal)}</div>
        <div class="crew-chip__label">Biodiversity Units (${fmt(r.sserPerKm, 2)}/km)</div>
      </div>
      <div class="crew-chip">
        <div class="crew-chip__value stat-box__value--leaf">${fmtCarbon(r.seq50yrTotal)}</div>
        <div class="crew-chip__label">50yr carbon total (tCO₂e/km)</div>
      </div>
    `;
  }

  // --- Section 3: Avoided costs ---
  setCanvasLabel('chart-avoided-costs', `Avoided costs chart for ${r.variantName}`);
  const ac = r.avoidedCostsBreakdown;
  hBar(
    'chart-avoided-costs',
    ['Flood control', 'Erosion avoided', 'Compaction avoided', 'Down erosion', 'Fuel savings'],
    [ac.floodControl, ac.avoidedErosion, ac.avoidedCompaction, ac.avoidedDownErosion, ac.avoidedFuelCosts],
    [CHART_COLORS.carbon, CHART_COLORS.crew, CHART_COLORS.pest, CHART_COLORS.windbreak, CHART_COLORS.avoided],
    null,
    v => fmtGBP(v),
    null
  );

  // Productivity Benefits (windbreak)
  setCanvasLabel('chart-windbreak', `Productivity benefits chart for ${r.variantName}`);
  const wb2 = r.windbreakBreakdown;
  hBar(
    'chart-windbreak',
    ['Yield bump', 'Water retention', 'Nutrient pump'],
    [wb2.yieldBump, wb2.waterRetention, wb2.nutrientPump],
    [CHART_COLORS.carbon, CHART_COLORS.crew, CHART_COLORS.pest],
    null,
    v => fmtGBP(v),
    null
  );

  // Income foregone row
  const ifrEl = document.getElementById('income-foregone-row');
  if (ifrEl) {
    ifrEl.innerHTML = `
      <div class="crew-chip" style="border-left:3px solid var(--c-negative,#9b2226);">
        <div class="crew-chip__value" style="color:var(--c-negative,#9b2226);">${fmtGBP(r.netIncomeForegone)}</div>
        <div class="crew-chip__label">Income foregone / yr</div>
      </div>
    `;
  }

  // --- Section 4: Carbon trajectory ---
  const xLabels = ['Yr5','Yr10','Yr15','Yr20','Yr25','Yr30','Yr35','Yr40','Yr45','Yr50'];
  setCanvasLabel('chart-carbon', `Carbon trajectory chart: 50-year cumulative sequestration for ${r.variantName}`);
  lineChart(
    'chart-carbon',
    xLabels,
    [{ label: `${r.width} ${r.variantName}`, color: WIDTH_COLOR[r.width] || '#2d6a4f', values: r.seqTrajectory }],
    'chart-carbon-legend'
  );
  setText('chart-carbon-total', `50yr total: ${fmtCarbon(r.seq50yrTotal)}`);

  // --- Agronomic notes ---
  const agro = document.getElementById('agronomic-notes');
  if (agro) {
    agro.innerHTML = [
      r.plantingRegime && `<p><strong>Planting:</strong> ${r.plantingRegime}</p>`,
      r.maintenanceRegime && `<p><strong>Maintenance:</strong> ${r.maintenanceRegime}</p>`,
      r.rootArchitecture && `<p><strong>Root architecture:</strong> ${r.rootArchitecture}</p>`,
      r.regulatoryAlignment && `<p><strong>Regulatory alignment:</strong> ${r.regulatoryAlignment}</p>`,
      r.additionality && `<p><strong>Additionality:</strong> ${r.additionality}</p>`,
    ].filter(Boolean).join('');
  }

  const bioEl = document.getElementById('biodiversity-impacts');
  if (bioEl) bioEl.textContent = r.biodiversityImpacts || '';

  // --- Problem / Solution panel ---
  if (state.activeProblem) {
    const otherVariants = getAlternateVariants(state.problemCode, c);
    renderProblemPanel(state.activeProblem, c, otherVariants);
  }

  // Encode URL
  encodeStateToURL();
}

// =============================================================================
// H. Compare Scenarios modal
// =============================================================================

/** Normalise a saved-scenario object (or partial) for charting. */
function normalizeCompareRow(s) {
  if (!s || typeof s !== 'object') return null;
  const label = String(s.label || 'Scenario').slice(0, 80);
  const n = (x) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  };
  const agro = n(s.agroNetBenefit ?? s.netAgronomicBenefit ?? s.netBenefit ?? 0);
  const carbon = n(s.carbonRevenue25 ?? s.seq25yrRevenue ?? 0);
  const eco = n(s.widerEcoValue ?? 0);
  return { label, agroNetBenefit: agro, carbonRevenue25: carbon, widerEcoValue: eco };
}

/** Rows for compare charts: saved scenarios, else current session if results exist. */
function buildCompareRows() {
  const saved = getSavedScenarios()
    .filter(x => x && typeof x === 'object')
    .map(normalizeCompareRow)
    .filter(Boolean);
  if (saved.length) return saved;
  if (state.lastResults) {
    return [normalizeCompareRow({
      label:           'Current session',
      agroNetBenefit:  state.lastResults.netAgronomicBenefit,
      carbonRevenue25: state.lastResults.seq25yrRevenue,
      widerEcoValue:   state.lastResults.widerEcoValue,
    })];
  }
  return [];
}

function paintCompareCharts(rows) {
  try {
    const wrap = document.getElementById('modal-compare-charts');
    const modal = document.getElementById('modal-compare');
    let vv = 400;
    if (typeof window !== 'undefined') {
      const vvW = window.visualViewport?.width;
      const inner = window.innerWidth;
      const client = document.documentElement?.clientWidth;
      vv = [vvW, inner, client].find(x => typeof x === 'number' && x > 16) ?? inner ?? 400;
    }
    // Cap by viewport and dialog inner width (modal is max 700px — do not hard-cap at 520
    // or laptop charts stay narrow). Mobile still clamps via mw when the sheet is narrow.
    const DIALOG_CHART_MAX = 660;
    let capW = Math.max(200, Math.min(Math.floor(vv) - 32, DIALOG_CHART_MAX));
    const mw = modal?.getBoundingClientRect?.().width;
    if (mw && mw > 24) {
      capW = Math.min(capW, Math.max(200, Math.floor(mw) - 40));
    }
    // Target width = chart column width (use full wrap — avoid raw-12 leaving empty margins).
    let targetW = capW;
    if (wrap) {
      const rw = wrap.getBoundingClientRect().width;
      const cw = wrap.clientWidth;
      let raw = rw > 8 ? Math.floor(rw) : (cw > 8 ? cw : 0);
      if (raw <= 8) raw = capW;
      targetW = Math.min(capW, Math.max(200, raw));
    }
    const chartOpts = {
      minFallbackWidth:      targetW,
      maxCanvasWidth:        capW,
      hideXAxisTickLabels:   true,
    };

    const labels = rows.map(r => r.label);
    const green  = '#2d6a4f';
    const gold   = '#b5830a';
    const teal   = '#52b788';

    hBar(
      'chart-compare-agro',
      labels,
      rows.map(r => r.agroNetBenefit),
      labels.map(() => green),
      null,
      v => fmtGBP(v) + '/yr',
      null,
      chartOpts
    );

    hBar(
      'chart-compare-carbon',
      labels,
      rows.map(r => r.carbonRevenue25),
      labels.map(() => gold),
      null,
      v => fmtGBP(v),
      null,
      chartOpts
    );

    hBar(
      'chart-compare-eco',
      labels,
      rows.map(r => r.widerEcoValue),
      labels.map(() => teal),
      null,
      v => fmtGBP(v) + '/yr',
      null,
      chartOpts
    );
  } catch (e) {
    console.error('paintCompareCharts', e);
  }
}

let compareModalResizeObserver = null;
let compareModalResizeTimer    = null;
let compareModalVvHandler      = null;

function detachCompareModalResizeObserver() {
  if (compareModalResizeObserver) {
    compareModalResizeObserver.disconnect();
    compareModalResizeObserver = null;
  }
  if (compareModalVvHandler && typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', compareModalVvHandler);
    compareModalVvHandler = null;
  }
  clearTimeout(compareModalResizeTimer);
  compareModalResizeTimer = null;
}

function attachCompareModalResizeObserver(rows) {
  detachCompareModalResizeObserver();
  const wrap = document.getElementById('modal-compare-charts');
  const modal = document.getElementById('modal-compare');
  const paint = () => paintCompareCharts(rows);

  if (typeof window !== 'undefined' && window.visualViewport) {
    compareModalVvHandler = () => {
      clearTimeout(compareModalResizeTimer);
      compareModalResizeTimer = setTimeout(paint, 50);
    };
    window.visualViewport.addEventListener('resize', compareModalVvHandler, { passive: true });
  }

  if (typeof ResizeObserver === 'undefined') return;
  compareModalResizeObserver = new ResizeObserver(() => {
    clearTimeout(compareModalResizeTimer);
    compareModalResizeTimer = setTimeout(paint, 60);
  });
  if (wrap) compareModalResizeObserver.observe(wrap);
  if (modal) compareModalResizeObserver.observe(modal);
}

function closeCompareModal() {
  detachCompareModalResizeObserver();
  const modal = document.getElementById('modal-compare');
  if (!modal) return;
  try {
    if (modal.open) modal.close();
  } catch (_) { /* ignore */ }
  modal.hidden = true;
  modal.classList.remove('modal-compare--open');
}

function openComparisonModal() {
  detachCompareModalResizeObserver();

  const modal = document.getElementById('modal-compare');
  if (!modal) return;

  modal.hidden = false;
  if (typeof modal.showModal === 'function') {
    try {
      modal.showModal();
    } catch (_) {
      modal.classList.add('modal-compare--open');
    }
  } else {
    modal.classList.add('modal-compare--open');
  }

  const rows       = buildCompareRows();
  const chartsEl   = document.getElementById('modal-compare-charts');
  const emptyEl    = document.getElementById('modal-compare-empty');
  const descEl     = document.getElementById('modal-compare-desc');

  if (!rows.length) {
    if (chartsEl) chartsEl.style.display = 'none';
    if (emptyEl)  emptyEl.style.display  = '';
    if (descEl) {
      descEl.textContent = '';
      descEl.hidden = true;
    }
    return;
  }

  if (chartsEl) chartsEl.style.display = '';
  if (emptyEl)  emptyEl.style.display  = 'none';
  if (descEl) {
    descEl.textContent = '';
    descEl.hidden = true;
  }

  // Dialog must layout before canvas width is known — paint after layout + delayed repaints.
  // iOS Safari often reports 0×0 for in-dialog nodes until after reflow / address bar settle.
  const paint = () => paintCompareCharts(rows);
  void modal.offsetWidth;
  queueMicrotask(paint);
  setTimeout(paint, 0);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      paint();
      setTimeout(paint, 120);
      setTimeout(paint, 400);
      setTimeout(paint, 750);
    });
  });

  attachCompareModalResizeObserver(rows);
}

function initModal() {
  const btn   = document.getElementById('btn-compare-scenarios');
  const modal = document.getElementById('modal-compare');
  const close = document.getElementById('btn-close-modal');
  if (!modal) return;

  modal.addEventListener('close', detachCompareModalResizeObserver);

  btn?.addEventListener('click', openComparisonModal);
  close?.addEventListener('click', closeCompareModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) closeCompareModal();
  });
}

// =============================================================================
// I. URL state encoding / decoding
// =============================================================================

function encodeStateToURL() {
  const p = new URLSearchParams({
    biome:   SLUG_BIOME[state.biome]     || 'east_neuk',
    farm:    SLUG_FARM[state.farmType]   || 'general_cropping',
    length:  state.lengthM,
    price:   state.creditPrice,
    orient:  state.windbreakOrient,
    placement: state.placement,
  });
  if (state.variantId) {
    const num = state.variantId.match(/\d+/)?.[0];
    if (num) p.set('variant', num);
  }
  if (state.problemCode) p.set('problem', state.problemCode);
  // Compact problem + solution-map snapshot for advisor share clarity (P2)
  const problemForSnap = state.activeProblem
    || (state.problemCode && problemsByCode[state.problemCode])
    || null;
  if (problemForSnap) {
    const snap = encodeSnapshotParam(problemForSnap);
    if (snap) {
      p.set('snap', snap);
      state.urlSnapshot = decodeSnapshotParam(snap);
    }
  }
  // Snapshot flags so advisors reopen the same problem-aware scenario
  if (state.browseMode && !state.problemCode) p.set('browse', '1');
  if (state.recommendedVariantId && state.variantId === state.recommendedVariantId) {
    p.set('rec', '1');
  }
  if (state.includeDreelBurn) p.set('dreel', '1');

  const url = `${window.location.pathname}?${p.toString()}`;
  window.history.replaceState({}, '', url);
}

function restoreStateFromURL() {
  const p = new URLSearchParams(window.location.search);

  // FIX [url-robustness]: validate all URL params — silently use defaults for invalid values
  const rawBiome = p.get('biome');
  if (rawBiome && BIOME_SLUG[rawBiome]) state.biome = BIOME_SLUG[rawBiome];

  const rawFarm = p.get('farm');
  if (rawFarm && FARM_SLUG[rawFarm]) state.farmType = FARM_SLUG[rawFarm];

  const rawLength = parseInt(p.get('length'), 10);
  if (p.has('length') && isFinite(rawLength) && rawLength > 0) state.lengthM = rawLength;

  const rawPrice = parseInt(p.get('price'), 10);
  if (p.has('price') && isFinite(rawPrice) && rawPrice >= 0) state.creditPrice = rawPrice;

  if (p.has('orient'))   state.windbreakOrient = p.get('orient') === 'EW' ? 'EW' : 'NS';
  if (p.has('placement'))state.placement       = ['riparian','crossSlope','downSlope'].includes(p.get('placement')) ? p.get('placement') : 'crossSlope';

  // FIX [url-robustness]: only restore problem if it exists in our data set
  const rawProblem = p.get('problem');
  if (rawProblem && problemsByCode[rawProblem]) state.problemCode = rawProblem;

  // Restore encoded diagnosis + solution-map snapshot (even if problem code missing)
  const decodedSnap = decodeSnapshotParam(p.get('snap'));
  if (decodedSnap) {
    state.urlSnapshot = decodedSnap;
    if (!state.problemCode && decodedSnap.code && problemsByCode[decodedSnap.code]) {
      state.problemCode = decodedSnap.code;
    }
  }

  if (p.has('variant'))  state._urlVariantNum  = p.get('variant'); // resolved after records load
  if (p.get('browse') === '1') state.browseMode = true;
  if (p.get('dreel') === '1') state.includeDreelBurn = true;
}

// =============================================================================
// Loading screen
// =============================================================================

function showLoadingScreen() {
  let el = document.getElementById('loading-screen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-screen';
    el.innerHTML = `
      <div class="loading-screen__inner">
        <div class="loading-screen__logo">NFCA</div>
        <div class="loading-screen__title">Farm Resilience Calculator</div>
        <div class="loading-screen__spinner"></div>
        <div class="loading-screen__msg">Loading intervention data…</div>
      </div>
    `;
    document.body.appendChild(el);
  }
  el.hidden = false;
}

function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => {
      el.hidden = true;
      el.style.display = 'none'; // override display:flex from CSS — hidden attr alone isn't enough
      el.style.opacity = '';
    }, 350);
  }
}

// =============================================================================
// Service worker
// =============================================================================

let updateBannerShown = false;

function showUpdateBannerOnce() {
  if (updateBannerShown || document.getElementById('update-banner')) return;
  updateBannerShown = true;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.className = 'update-banner__text';
  span.textContent = 'A new version of the Farm Resilience Calculator is available.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'update-banner__btn';
  btn.textContent = 'Update now';
  btn.addEventListener('click', () => {
    window.location.reload();
  });
  banner.append(span, btn);
  document.body.appendChild(banner);
}

function wireWaitingWorker(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      showUpdateBannerOnce();
    }
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!navigator.serviceWorker.controller) return;
    if (hadControllerAtLoad) showUpdateBannerOnce();
  });

  try {
    const reg = await navigator.serviceWorker.register('sw.js');

    if (reg.waiting && navigator.serviceWorker.controller) {
      showUpdateBannerOnce();
    }

    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) wireWaitingWorker(w);
    });

    if (reg.installing) wireWaitingWorker(reg.installing);

    setInterval(() => {
      reg.update().catch(() => {});
    }, 60 * 60 * 1000);
  } catch (_) {
    /* offline or SW blocked */
  }
}

let toastHideTimer = null;

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    // pointer-events:none so the toast never blocks taps on the FAB / bottom nav after save
    toast.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:var(--c-forest);color:#fff;padding:10px 20px;border-radius:8px;
      font-size:0.875rem;z-index:400;transition:opacity 0.3s,visibility 0.3s;
      pointer-events:none;max-width:min(92vw,420px);text-align:center;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.visibility = 'visible';
  toast.style.opacity = '1';
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.visibility = 'hidden';
    toastHideTimer = null;
  }, 2500);
}

// =============================================================================
// Saved scenarios (localStorage)
// =============================================================================

const MAX_SCENARIOS = 5;

function saveScenario(label, st, results) {
  const scenarios = getSavedScenarios();
  // FIX [security/xss]: cap label at 80 chars; rendered with textContent not innerHTML
  const rawLabel  = label || `${results.variantName} — ${results.biome.replace('Fife (', '').replace(')', '')}`;
  const safeLabel = String(rawLabel).slice(0, 80);
  const entry = {
    id:              Date.now(),
    label:           safeLabel,
    url:             window.location.href,
    netBenefit:      results.annualNetBenefit,
    sserUnits:       results.sserUnitsTotal,
    agroNetBenefit:  results.netAgronomicBenefit,
    carbonRevenue25: results.seq25yrRevenue,
    widerEcoValue:   results.widerEcoValue,
    savedAt:         new Date().toISOString(),
  };
  scenarios.unshift(entry);
  if (scenarios.length > MAX_SCENARIOS) scenarios.pop();
  localStorage.setItem('shieldbelt_scenarios', JSON.stringify(scenarios));
  renderSavedScenarios();
  showToast('Scenario saved');
}

function getSavedScenarios() {
  try { return JSON.parse(localStorage.getItem('shieldbelt_scenarios') || '[]'); }
  catch { return []; }
}

function deleteScenario(id) {
  const scenarios = getSavedScenarios().filter(s => s.id !== id);
  localStorage.setItem('shieldbelt_scenarios', JSON.stringify(scenarios));
  renderSavedScenarios();
}

// FIX [security/xss]: render scenario labels with textContent only —
// labels come from localStorage and could contain script injection attempts.
function renderSavedScenarios() {
  const panel = document.getElementById('saved-scenarios-panel');
  if (!panel) return;
  const scenarios = getSavedScenarios();
  if (!scenarios.length) { panel.hidden = true; return; }
  panel.hidden = false;

  panel.innerHTML = '';  // clear first

  const title = document.createElement('div');
  title.className   = 'saved-scenarios__title';
  title.textContent = '💾 Saved Scenarios';
  panel.appendChild(title);

  for (const s of scenarios) {
    const row = document.createElement('div');
    row.className = 'saved-scenario';

    const labelEl = document.createElement('div');
    labelEl.className   = 'saved-scenario__label';
    labelEl.textContent = s.label;   // safe — never innerHTML

    const metaEl = document.createElement('div');
    metaEl.className   = 'saved-scenario__meta';
    metaEl.textContent = `${fmtGBP(s.netBenefit)}/yr · ${fmt(s.sserUnits, 2)} SSER`;

    const loadA = document.createElement('a');
    loadA.className   = 'saved-scenario__load btn btn-ghost btn-sm';
    loadA.href        = s.url;   // safe URL (was window.location.href at save time)
    loadA.textContent = 'Load ↗';
    loadA.rel         = 'noopener';

    const delBtn = document.createElement('button');
    delBtn.className = 'saved-scenario__delete btn btn-ghost btn-sm';
    delBtn.type      = 'button';
    delBtn.textContent = 'Delete';
    delBtn.setAttribute('aria-label', `Delete saved scenario: ${s.label}`);
    delBtn.addEventListener('click', () => {
      deleteScenario(s.id);
      showToast('Scenario removed');
    });

    row.append(labelEl, metaEl, loadA, delBtn);
    panel.appendChild(row);
  }
}

// =============================================================================
// Mobile drawer
// =============================================================================

function initMobileDrawer() {
  const btn         = document.getElementById('btn-mobile-drawer');
  const closeBtn    = document.getElementById('btn-close-drawer');
  const gotoBtn     = document.getElementById('btn-drawer-goto-outputs');
  const adjustTop   = document.getElementById('btn-adjust-inputs-top');
  const adjustBot   = document.getElementById('btn-adjust-inputs-bottom');
  const panel       = document.querySelector('.panel-left');
  const backdrop    = document.getElementById('drawer-backdrop');
  if (!panel) return;

  const openDrawer = () => {
    panel.classList.add('drawer-open');
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = '&#8594; Go to Outputs';
    }
    // Re-measure after overlay layout (charts can pick up correct width once view stabilises)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (state.results) renderResults(state.results);
      });
    });
  };

  const closeDrawer = () => {
    panel.classList.remove('drawer-open');
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '&#9881; Adjust inputs';
    }
  };

  const gotoOutputs = () => {
    closeDrawer();
    // Scroll to the results panel on mobile
    const results = document.getElementById('results-content') ||
                    document.getElementById('results-empty');
    if (results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (state.results) renderResults(state.results);
      });
    });
  };

  // Floating bottom button: open drawer when closed, go to outputs when open
  btn?.addEventListener('click', () => {
    if (panel.classList.contains('drawer-open')) {
      gotoOutputs();
    } else {
      openDrawer();
    }
  });

  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  gotoBtn?.addEventListener('click', gotoOutputs);
  adjustTop?.addEventListener('click', openDrawer);
  adjustBot?.addEventListener('click', openDrawer);

  // On mobile, "Calculate Outcomes" should close the drawer and show results
  document.getElementById('btn-calculate')?.addEventListener('click', () => {
    if (panel.classList.contains('drawer-open')) {
      // Small delay so the calculation can render before we scroll to results
      setTimeout(gotoOutputs, 120);
    }
  });
}

// =============================================================================
// Scroll-to-results (mobile)
// =============================================================================

function scrollToResults() {
  if (window.innerWidth < 768) {
    const el = document.getElementById('results-content');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// =============================================================================
// Biome context card
// =============================================================================

function renderBiomeContextCard(biome) {
  const ctx = BIOME_CONTEXT[biome];

  // Populate both the accordion card (mobile) and the output-panel banner (all layouts)
  const accordionEl = document.getElementById('biome-context-card');
  const outputEl    = document.getElementById('biome-info-output');

  if (accordionEl) {
    if (!ctx) { accordionEl.hidden = true; }
    else {
      accordionEl.hidden = false;
      accordionEl.innerHTML = buildBiomeCardHTML(biome, ctx);
    }
  }

  if (outputEl) {
    outputEl.innerHTML = ctx ? buildBiomeCardHTML(biome, ctx) : '';
  }
}

function buildBiomeCardHTML(biome, ctx) {
  return `
    <div class="biome-context-card">
      <div class="biome-context-card__name">${biome}</div>
      <div class="biome-context-card__tagline">${ctx.tagline}</div>
      <div class="biome-context-card__stats">
        <span><strong>${ctx.km}</strong> km capacity</span>
        <span><strong>${ctx.value}</strong>/yr potential</span>
        <span><em>${ctx.farmType}</em></span>
      </div>
    </div>
  `;
}

// =============================================================================
// Stat box flash animation
// =============================================================================

function setupStatBoxScroll(boxId, targetId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  // Only attach once
  if (box.dataset.scrollBound) return;
  box.dataset.scrollBound = '1';
  const activate = () => {
    const target = document.getElementById(targetId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  box.addEventListener('click', activate);
  box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(); });
}

function flashStatBoxes() {
  document.querySelectorAll('.stat-box').forEach(el => {
    el.classList.remove('stat-box--flash');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('stat-box--flash');
  });
}

// =============================================================================
// SSER width colour on stat box
// =============================================================================

function updateSSERWidthColor(width) {
  const el = document.getElementById('stat-sser-value')?.closest('.stat-box');
  if (!el) return;
  const map = {
    '3m': 'var(--c-w3m)', '6m': 'var(--c-w6m)', '12m': 'var(--c-w12m)', '20m': 'var(--c-w20m)', '60m': 'var(--c-w60m)',
  };
  el.style.borderColor = map[width] || '';
}

function handleReset() {
  Object.assign(state, {
    biome: BIOMES.EAST_NEUK, variantId: null, farmType: 'General Cropping',
    placement: 'crossSlope', lengthM: 1000, creditPrice: 60,
    problemCode: null, windbreakOrient: 'NS',
    browseMode: false, outcomesUnlocked: false,
    recommendationMeta: null, urlSnapshot: null,
    biomeRecords: [], currentRecord: null, results: null, lastResults: null, activeProblem: null,
  });

  // Reset form controls
  const lenInput = document.getElementById('strip-length');
  if (lenInput) lenInput.value = 1000;
  const slider = document.getElementById('credit-price');
  if (slider) { slider.value = 60; }
  const display = document.getElementById('credit-price-display');
  if (display) display.textContent = '£60';
  setText('step-price-summary', 'Credit £60 / tCO₂e');
  setText('step-problem-summary', 'Not selected');

  document.querySelectorAll('input[name="biome"]').forEach(r => { r.checked = r.value === BIOMES.EAST_NEUK; });
  document.querySelectorAll('input[name="farm-type"]').forEach(r => { r.checked = r.value === 'General Cropping'; });

  clearCharts();
  showEmptyOutcomes();
  document.getElementById('problem-panel') && (document.getElementById('problem-panel').hidden = true);
  document.getElementById('btn-clear-problem')?.remove();
  updateProblemChipUI(null);
  updateAdvisorHandoffCopy(null);
  updatePrintBriefSnapshot(null);

  // Return to problem-first entry
  closeStep(2); closeStep(3); closeStep(4); closeStep(5); closeStep(6);
  openStep(1);

  window.history.replaceState({}, '', window.location.pathname);
}

// =============================================================================
// Core recalc
// =============================================================================

async function applyVariantAndRecalc() {
  // Auto-pick the first location variant only once outcomes are unlocked (problem path,
  // Confirm / Calculate, or shared URL). Browse-before-Confirm keeps the placeholder.
  if (!state.variantId && state.biomeRecords.length && shouldShowOutcomes()) {
    state.variantId = state.biomeRecords[0]?.id || null;
    syncVariantSelect();
  }
  if (!state.variantId) {
    renderBiomeContextCard(state.biome);
    renderVariantDetail(null);
    if (!shouldShowOutcomes()) showEmptyOutcomes();
    return;
  }

  state.currentRecord = await getById(state.variantId);
  if (!state.currentRecord) return;

  renderBiomeContextCard(state.biome);
  renderVariantDetail(state.currentRecord);
  updateLengthDerived();
  await recalc();
  if (shouldShowOutcomes()) scrollToResults();
}

async function recalc() {
  if (!state.currentRecord) return;

  // FIX [input-validation]: abort and show error if inputs are invalid
  if (!validateInputs(state)) return;

  const inputs = {
    biome:           state.biome,
    variantId:       state.variantId,
    farmType:        state.farmType,
    placement:       state.placement,
    lengthM:         state.lengthM,
    creditPrice:     state.creditPrice,
    windbreakOrient: state.windbreakOrient,
  };

  state.results     = calculate(inputs, state.currentRecord);
  state.lastResults = state.results;
  if (shouldShowOutcomes()) {
    renderResults(state.results);
    encodeStateToURL();
  } else {
    showEmptyOutcomes();
  }
}

function copyShareLink() {
  encodeStateToURL();
  // Refresh brief so printed/shared URL matches the encoded snap
  if (state.activeProblem) {
    updatePrintBriefSnapshot(
      state.activeProblem,
      state.currentRecord,
      state.recommendationMeta?.reasons || [],
      [],
      state.lastResults
    );
  }
  const href = window.location.href;
  navigator.clipboard.writeText(href)
    .then(() => showToast('Advisor link copied — includes problem, diagnosis & margin scenario'))
    .catch(() => showToast('Copy failed — copy the address bar URL instead'));
}

/** Quick mailto handoff — no partner destination; opens the user's email client with the scenario URL. */
function emailScenarioLink() {
  if (!shouldShowOutcomes()) {
    showToast('Select a problem or confirm a variant first');
    return;
  }
  encodeStateToURL();
  const href = window.location.href;
  const symptom = state.activeProblem?.Stated_Symptom?.slice(0, 80) || 'ShieldBelt margin scenario';
  const subject = encodeURIComponent(`Fife ShieldBelt planning scenario — ${symptom}`);
  const body = encodeURIComponent(
    `Here is a ShieldBelt (NbS on marginal land) scenario from the Fife Farm Resilience Calculator.\n\n` +
    `Open this link to restore the problem, diagnosis snapshot, location, farm type, variant, and strip length:\n\n` +
    `${href}\n\n` +
    `This is a planning start for discussion — not a grant or implementation quote.`
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function printPlanningBrief() {
  if (!shouldShowOutcomes()) {
    showToast('Select a problem or confirm a variant first');
    return;
  }
  // Ensure URL encodes current scenario before print/share
  encodeStateToURL();
  updatePrintBriefSnapshot(
    state.activeProblem,
    state.currentRecord,
    state.recommendationMeta?.reasons || [],
    [],
    state.lastResults
  );
  const printHeader = document.querySelector('.print-header');
  if (printHeader) {
    printHeader.setAttribute('data-date', new Date().toLocaleDateString('en-GB'));
  }
  window.print();
}

/** Show optional bridge only when RESILIENCE_WIDE_TOOL_URL is set. */
function renderResilienceWideBridge() {
  const el = document.getElementById('resilience-wide-bridge');
  if (!el) return;
  if (!RESILIENCE_WIDE_TOOL_URL) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <a class="resilience-wide-bridge__link" href="${RESILIENCE_WIDE_TOOL_URL}"
       target="_blank" rel="noopener noreferrer">
      Explore broader farm options elsewhere
    </a>
    <span class="resilience-wide-bridge__note text-sm text-muted">
      Separate resilience-wide tool — this calculator stays focused on ShieldBelt margins.
    </span>
  `;
}

// =============================================================================
// Utility
// =============================================================================

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setStatBox(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// FIX [input-validation]: show/clear inline field errors
function showInputError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.setAttribute('aria-invalid', 'true');
  let errEl = document.getElementById(fieldId + '-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.id        = fieldId + '-error';
    errEl.className = 'input-error';
    errEl.setAttribute('role', 'alert');
    errEl.setAttribute('aria-live', 'assertive');
    field.insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = message;
}

function clearInputError(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) field.removeAttribute('aria-invalid');
  document.getElementById(fieldId + '-error')?.remove();
}

// FIX [input-validation]: guard against zero/negative length, NaN credit price
function validateInputs(st) {
  let valid = true;
  if (!st.lengthM || st.lengthM <= 0 || !isFinite(st.lengthM)) {
    showInputError('strip-length', 'Enter a length greater than 0 m');
    valid = false;
  } else {
    clearInputError('strip-length');
  }
  return valid;
}

function syncBiomeRadio() {
  document.querySelectorAll('input[name="biome"]').forEach(r => {
    r.checked = r.value === state.biome;
  });
  setText('step-biome-summary', BIOME_DISPLAY[state.biome] || state.biome);
}

// =============================================================================
// K. Initialisation
// =============================================================================

// FIX [performance/loading-screen]: showLoadingScreen() is called synchronously
// BEFORE the first await, so the loading overlay paints within the first frame.
// This satisfies the <200ms loading screen requirement on Slow 3G connections.
async function init() {
  showLoadingScreen();  // synchronous — runs before any await below

  try {
    await dbReady;
    await loadProblems();

    restoreStateFromURL();
    await loadBiomeRecords(state.biome);

    // Sync initial form state from state object
    populateBiomeSelector();
    populateFarmTypeSelector();
    populateProblemChips();
    populateVariantSelector();

    // Resolve URL variant number if present
    if (state._urlVariantNum) {
      const match = state.biomeRecords.find(r =>
        r.variant.startsWith(state._urlVariantNum + '.')
      );
      if (match) state.variantId = match.id;
      delete state._urlVariantNum;
    }

    // Resolve problem→variant recommendation; unlock if URL carried a journey entry
    if (state.problemCode) {
      state.activeProblem = problemsByCode[state.problemCode] || null;
      const rec = recommendVariant(state.problemCode, state.biomeRecords, state.farmType, { storeMeta: true });
      if (rec && !state.variantId) state.variantId = rec.id;
      if (rec) state.recommendedVariantId = rec.id;
      updateProblemChipUI(state.problemCode);
      if (state.activeProblem) renderProblemClearBtn();
      unlockOutcomes();
    } else if (state._urlVariantNum || state.variantId || state.browseMode) {
      // Shared / bookmarked variant link = explicit browse path
      unlockOutcomes({ browse: true });
    }

    // Initialise all controls and event handlers
    initAccordions();
    initBiomeSelector();
    initFarmTypeSelector();
    initVariantSelector();
    initConfirmVariant();
    initStripLengthInput();
    initCreditPriceSlider();
    initPlacementToggle();
    initWindbreakToggle();
    initModal();

    document.getElementById('btn-browse-intervention')?.addEventListener('click', handleBrowseIntervention);

    document.getElementById('btn-calculate')?.addEventListener('click', async () => {
      unlockOutcomes({ browse: !state.problemCode });
      await applyVariantAndRecalc();
    });
    document.getElementById('btn-reset')?.addEventListener('click', handleReset);

    document.getElementById('btn-share-advisor')?.addEventListener('click', copyShareLink);
    document.getElementById('btn-email-scenario')?.addEventListener('click', emailScenarioLink);
    document.getElementById('btn-print-brief')?.addEventListener('click', printPlanningBrief);

    document.getElementById('btn-save-scenario')?.addEventListener('click', () => {
      if (state.lastResults) saveScenario(null, state, state.lastResults);
    });

    initMobileDrawer();
    renderSavedScenarios();
    renderBiomeContextCard(state.biome);
    renderResilienceWideBridge();

    // FIX [print/canvas]: re-render charts synchronously before printing so
    // canvas bitmaps are committed — some browsers clear canvas before print.
    window.addEventListener('beforeprint', () => {
      if (state.results && shouldShowOutcomes()) {
        encodeStateToURL();
        renderResults(state.results);
      }
    });

    // FIX [iOS PWA]: IndexedDB on iOS PWA may be evicted after 7 days inactivity
    if (window.navigator.standalone === true) {
      const banner = document.createElement('div');
      banner.className = 'ios-standalone-tip';
      banner.textContent = 'Tip: open occasionally to keep your saved data.';
      document.querySelector('.app-header__inner')?.appendChild(banner);
    }

    // Prepare variant/calc data; only show full outcomes when journey is unlocked
    await applyVariantAndRecalc();
    updateEmptyStateCopy();

    if (window.ResizeObserver) {
      const resultsContainer = document.getElementById('results-panel');
      let resizeTimer;
      if (resultsContainer) {
        let lastKnownWidth = resultsContainer.clientWidth;
        const ro = new ResizeObserver(() => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            // Only re-render if width actually changed (keyboard show/hide often only changes height on iOS)
            const newWidth = resultsContainer.clientWidth;
            if (newWidth !== lastKnownWidth && state.results && shouldShowOutcomes()) {
              lastKnownWidth = newWidth;
              renderResults(state.results);
            }
          }, 150);
        });
        ro.observe(resultsContainer);
      }
    }

    // Problem-first: open Biggest Problem by default
    openStep(1);

  } catch (err) {
    console.error('ShieldBelt init failed:', err);
  } finally {
    hideLoadingScreen();
    registerServiceWorker();
  }
}

document.addEventListener('DOMContentLoaded', init);
