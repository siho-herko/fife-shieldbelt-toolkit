/**
 * hedge-config.js — v12 hedgerow configurator (4 Nov 2026)
 *
 * Pure functions, no DOM. Used by:
 *   - scripts/build_v12.mjs  to write the curated presets (HV1–HV8) into data/fife_interventions_db_v12.json
 *   - app.js                 to rebuild a hedge record live when the user changes a toggle
 * so the presets and the configurator always give the same numbers.
 *
 * A hedge option is five choices (agreed with Si, 4 Nov 2026):
 *   form      double row (2 m) | triple row (3 m) | productive triple row (4.2 m, coppiced)
 *   species   species-rich (default) | native (hawthorn-led)
 *   trees     none | standard trees every 6–10 m
 *   stripM    3 | 6 | 8 | 10 | 12  (land out of production)
 *   position  field boundary | in-field contour | beside a watercourse
 *
 * Evidence labels: VERIFIED (primary source checked), CITED (secondary source), JUDGEMENT.
 * All outputs are screening estimates, not advice, not cash and not validated carbon units.
 */

// ---------------------------------------------------------------------------
// 1. Hedge carbon model (JS port of scripts/hedge_carbon_model.py v2, 3 Nov 2026)
// ---------------------------------------------------------------------------
export const C_TO_CO2 = 44 / 12;
/** VERIFIED Biffi et al. 2023 Sci Total Environ 892:164482, Table 3: AGB Mg C/ha at 4, 12, 39 yr; held flat after 39 yr. */
export const AGB_POINTS = [[0, 0], [4, 8.34], [12, 21.92], [39, 33.41]];
/** CITED Black et al. 2023 via Biffi 2023 s4.3: root:shoot 0.49, lower end for managed hedges. */
export const ROOT_SHOOT = 0.49;
/** VERIFIED Biffi et al. 2022 Table 4 (1.48 t C/ha/yr); JUDGEMENT plateau 29 t C/ha (Drexler & Don 2024 lower central). */
export const SOC_RATE = 1.48;
export const SOC_PLATEAU = 29.0;
/** JUDGEMENT: soil strip credited with the SOC surplus (the per-km convention in both Biffi papers). */
export const SOC_WIDTH_M = 1.5;
export const BAND_KEYS = ['yr_1_5', 'yr_6_10', 'yr_11_15', 'yr_16_20', 'yr_21_25',
  'yr_26_30', 'yr_31_35', 'yr_36_40', 'yr_41_45', 'yr_46_50'];

export function agbPerHa(t) {
  for (let i = 1; i < AGB_POINTS.length; i++) {
    const [t0, s0] = AGB_POINTS[i - 1];
    const [t1, s1] = AGB_POINTS[i];
    if (t <= t1) return s0 + (s1 - s0) * (t - t0) / (t1 - t0);
  }
  return AGB_POINTS[AGB_POINTS.length - 1][1];
}
export function socPerHa(t) { return Math.min(SOC_PLATEAU, SOC_RATE * t); }

/** t C per km by pool at age t. */
export function hedgeStocks(crownM, t) {
  const agb = agbPerHa(t) * crownM / 10;
  return { AGB: agb, BGB: ROOT_SHOOT * agb, SOC: socPerHa(t) * SOC_WIDTH_M / 10 };
}

const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const r10 = x => Math.round(x / 10) * 10;

/**
 * 50-year hedge carbon, tCO2e per km.
 * harvested = true (productive hedge cut for biochar feedstock): the land claim is soil + roots only,
 * because the biochar standard takes the harvested above-ground biomass (no tonne counted twice).
 */
export function hedgeCarbon(crownM, harvested = false) {
  const years = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  const tot = s => s.AGB + s.BGB + s.SOC;
  const claim = s => harvested ? s.BGB + s.SOC : tot(s);
  const bands = [], claimBands = [];
  for (let i = 1; i < years.length; i++) {
    const a = hedgeStocks(crownM, years[i - 1]), b = hedgeStocks(crownM, years[i]);
    bands.push(r2((tot(b) - tot(a)) * C_TO_CO2));
    claimBands.push(r2((claim(b) - claim(a)) * C_TO_CO2));
  }
  const s50 = hedgeStocks(crownM, 50);
  return {
    gross50: r1(tot(s50) * C_TO_CO2),
    claim50: r1(claim(s50) * C_TO_CO2),
    bands, claimBands,
    pools50: { AGB: r1(s50.AGB * C_TO_CO2), BGB: r1(s50.BGB * C_TO_CO2), SOC: r1(s50.SOC * C_TO_CO2) },
  };
}

// ---------------------------------------------------------------------------
// 2. Water: retention by strip width and indicative avoided-damage value (all v12 records)
// ---------------------------------------------------------------------------
/**
 * CITED Stutter, Costa & Ó hUallacháin 2021, Sci Total Environ 798:149238, Table 2, width-only fits:
 *   log10(110 − %retained) = a − b·log10(width m)
 * Width explains little (R² 8–15%); clay content and slope matter more. Plot-scale evidence.
 */
export const RETENTION_FITS = {
  sed: { a: 1.63, b: 0.20 },   // R² 13%
  P:   { a: 1.91, b: 0.35 },   // R² 15%
  N:   { a: 2.2,  b: 0.43 },   // R² 8%  (shown, not valued)
};
export function retention(widthM, key) {
  const f = RETENTION_FITS[key];
  const pct = 110 - Math.pow(10, f.a - f.b * Math.log10(widthM));
  return Math.max(0, Math.min(95, pct)) / 100;
}
/** JUDGEMENT loads (v11): 10 ha of contributing arable per km; 200 kg sediment and 0.7 kg P per ha per yr. */
export const WATER_LOADS = { contribHaPerKm: 10, sedKgHa: 200, pKgHa: 0.7 };
/** Low: Defra IA Defra1819 Table 22 (sediment £0.054/kg, 2014 prices). High: CREW CRW2024/04 (£0.55/kg). P £46.61/kg CREW. */
export const WATER_PRICES = { low: { sed: 0.054, P: 46.61 }, high: { sed: 0.55, P: 46.61 } };
/** JUDGEMENT (v11): share of the load that reaches the strip by placement. */
export const DELIVERY = { riparian: 1.0, crossSlope: 0.5, downSlope: 0.1 };

/** £/km/yr by placement, low and high case, rounded to £10. Nitrate is not valued (width does not reliably drive it). */
export function waterValues(widthM) {
  const sed = retention(widthM, 'sed'), P = retention(widthM, 'P');
  const out = { retention: { sediment: Math.round(sed * 100), phosphorus: Math.round(P * 100), nitrate: Math.round(retention(widthM, 'N') * 100) } };
  for (const [pl, d] of Object.entries(DELIVERY)) {
    for (const [cs, pr] of Object.entries(WATER_PRICES)) {
      const v = WATER_LOADS.contribHaPerKm * (WATER_LOADS.sedKgHa * sed * pr.sed + WATER_LOADS.pKgHa * P * pr.P) * d;
      out[pl + (cs === 'high' ? 'High' : '')] = r10(v);
    }
  }
  return out;
}
export const WATER_BASIS = 'Indicative avoided pollution damage (v12): 10 ha of arable per km; 200 kg sediment and 0.7 kg P per ha per yr; '
  + 'retention by strip width from Stutter et al. 2021 Table 2 width-only regressions (CITED; width explains only 13-15% of variation); '
  + 'delivery 1.0 riparian, 0.5 cross-slope, 0.1 down-slope (JUDGEMENT). Low case: sediment GBP0.054/kg (Defra IA Defra1819 Table 22); '
  + 'high case: GBP0.55/kg (CREW CRW2024/04); P GBP46.61/kg (CREW). Nitrate not valued. Not cash income; site estimate needed.';

// ---------------------------------------------------------------------------
// 3. Options
// ---------------------------------------------------------------------------
export const FORMS = {
  double: {
    label: 'Double row', short: '2 m double row', rows: 2, crownM: 2.0, heightM: 2.5, plantsPerM: 6, harvested: false,
    planting: 'Double staggered row, 6 plants/m (AECS minimum), rows about 40 cm apart.',
    maintenance: 'Year 1: mulch and weed control. Year 2: cut back hard to 45-60 cm to thicken the base. Then trim 1 Dec to end Feb on a 2-3 year rotation, never the same length every year, raising the cut about 10 cm each time; managed at about 2 m wide and 2-2.5 m tall.',
    roots: 'Two rows of fibrous hawthorn and blackthorn roots binding the topsoil, with hazel and holly rooting deeper.',
  },
  triple: {
    label: 'Triple row', short: '3 m triple row', rows: 3, crownM: 3.0, heightM: 3.0, plantsPerM: 8, harvested: false,
    planting: 'Triple staggered row, 8 plants/m (as in the Productive Hedge specification), rows about 40 cm apart. AECS asks for double-staggered rows at 6 plants/m: RPID to confirm a triple row qualifies.',
    maintenance: 'As the double row, but allowed to grow out to about 3 m wide and 2.5-3 m tall; trim on a 3-year rotation or lay at 10-15 years.',
    roots: 'Three rows give a denser root mat across a wider band, which supports infiltration and surface-flow interception (hedge width drives surface nitrogen interception: Van Vooren et al. 2017).',
  },
  productive: {
    label: 'Productive triple row', short: '4.2 m productive triple row', rows: 3, crownM: 4.2, heightM: 3.6, plantsPerM: 8, harvested: true,
    planting: 'Triple staggered row, 8 plants/m, about 4.2 m wide and 3.6 m tall (Productive Hedge specification 040226). Hazel, hawthorn and native willow, with other native species.',
    maintenance: 'Coppiced or laid in sections on a 10-15 year cycle for biochar feedstock; never more than a third of a farm\'s productive hedge cut in one winter; cut 1 Dec to end Feb.',
    roots: 'Coppice stools keep their root systems after cutting; three rows give the densest root mat of the options.',
  },
};

export const SPECIES = {
  speciesRich: {
    label: 'Species-rich', aecsCompliant: true, sseHedgeType: 'Species-rich native hedgerow',
    mix: '60% hawthorn plus at least 4 other native woody species, e.g. 10% blackthorn, 10% hazel, 5% holly, 5% dog rose, 5% guelder rose, 5% crab apple. '
      + 'Local provenance, from the NatureScot native list. It meets the AECS rule of at least three native flowering species (AECS guidance gives 60-80% hawthorn as a typical, '
      + 'not required, mix) and gives at least 4 woody species in every 30 m, which counts as species-rich in Scotland.',
  },
  native: {
    label: 'Native (hawthorn-led)', aecsCompliant: true, sseHedgeType: 'Native hedgerow',
    mix: 'Hawthorn-led with three native flowering species, e.g. 80% hawthorn, 10% blackthorn, 10% hazel; local provenance. Three species is the AECS minimum (VERIFIED, Planting or Replanting of Hedges, 15 Dec 2025).',
    tradeoff: 'About half the SSE hedgerow units of a species-rich hedge and lower habitat value. It only just meets the AECS minimum of three native flowering species: fewer species would not qualify.',
  },
};

export const TREES = {
  none: { label: 'No trees', withTrees: false },
  standards: {
    label: 'Standard trees', withTrees: true,
    planting: 'A native standard tree every 6-10 m (MOREhedges asks for one every 6 m), e.g. oak, rowan, gean, crab apple; tagged and left uncut when trimming.',
  },
};

export const POSITIONS = {
  boundary:    { label: 'Field boundary', placement: null },
  contour:     { label: 'In-field contour', placement: 'crossSlope' },
  watercourse: { label: 'Beside a watercourse', placement: 'riparian' },
};

export const STRIP_WIDTHS = [3, 6, 8, 10, 12];

/**
 * Curated presets (species-rich by default; agreed with Si 4 Nov 2026). HV2 is the programme default.
 * The native mix is a toggle in the calculator only; it is not a preset.
 */
export const PRESETS = [
  { code: 'HV1', name: 'Fence-line hedge', form: 'double', species: 'speciesRich', trees: 'none', stripM: 3, position: 'boundary',
    summary: 'The narrowest option: a 2 m double-row hedge on the boundary with the GAEC 7 2 m strip on the field side.' },
  { code: 'HV2', name: 'Hedge and margin', form: 'double', species: 'speciesRich', trees: 'none', stripM: 6, position: 'boundary', isDefault: true,
    summary: 'Recommended default: a 2 m double-row hedge with a 4 m grass margin on the field side, 3 m of it beyond the GAEC 2 m line.' },
  { code: 'HV3', name: 'Wide wildlife hedge', form: 'triple', species: 'speciesRich', trees: 'none', stripM: 6, position: 'boundary',
    summary: 'A 3 m triple-row hedge with a grass margin. Add standard trees with the trees toggle.' },
  { code: 'HV4', name: 'Hedge with trees', form: 'double', species: 'speciesRich', trees: 'standards', stripM: 6, position: 'boundary',
    summary: 'HV2 with a native standard tree every 6-10 m: the highest SSE hedgerow distinctiveness.' },
  { code: 'HV5', name: 'Hedge and wide margin', form: 'double', species: 'speciesRich', trees: 'none', stripM: 10, position: 'boundary',
    summary: 'A 2 m double-row hedge with an 8 m tussocky or flower-rich margin; suits the foot of a slope.' },
  { code: 'HV6', name: 'Contour hedge', form: 'triple', species: 'speciesRich', trees: 'none', stripM: 8, position: 'contour',
    summary: 'An in-field hedge on the contour with a grass margin on the upslope side. Triple row by default on slopes and in NVZ catchments; double row via the toggle.' },
  { code: 'HV7', name: 'Riparian hedge and water margin', form: 'double', species: 'speciesRich', trees: 'none', stripM: 12, position: 'watercourse',
    summary: 'A double-row hedge set back from the bank behind a grass water margin. Double row only beside water, so the grass zone can trap sediment.' },
  { code: 'HV8', name: 'Productive hedge', form: 'productive', species: 'speciesRich', trees: 'none', stripM: 8, position: 'boundary',
    summary: 'A 4.2 m triple-row hedge coppiced for biochar feedstock. The land carbon claim is soil and roots only. Does not rely on AECS.' },
];
export const DEFAULT_PRESET = 'HV2';

export function presetByCode(code) { return PRESETS.find(p => p.code === code) || null; }
export function configKey(c) { return [c.form, c.species, c.trees, c.stripM, c.position].join('-'); }
export function presetForConfig(c) { return PRESETS.find(p => configKey(p) === configKey(c)) || null; }

/** Parse a URL/config key (inverse of configKey); returns null if invalid. */
export function parseConfigKey(s) {
  const [form, species, trees, strip, position] = String(s || '').split('-');
  const c = { form, species, trees, stripM: Number(strip), position };
  if (!FORMS[form] || !SPECIES[species] || !TREES[trees] || !STRIP_WIDTHS.includes(c.stripM) || !POSITIONS[position]) return null;
  return c;
}

// ---------------------------------------------------------------------------
// 4. Geometry, rules and grants (JUDGEMENT on VERIFIED scheme rules; RPID to confirm)
// ---------------------------------------------------------------------------
/**
 * Smallest allowed strip for a form and position.
 *  boundary:    hedge centre half a crown from the boundary; GAEC 7 keeps cultivation 2 m from the centre → crown/2 + 2.
 *  contour:     in-field, so GAEC 7 applies on both sides → at least 4 m; a 6 m strip is the smallest offered.
 *  watercourse: 2 m GBR strip from the bank + hedge + 2 m GAEC on the field side → at least 6 m offered.
 */
export function minStripM(form, position) {
  const crown = FORMS[form].crownM;
  const need = position === 'boundary' ? crown / 2 + 2 : position === 'contour' ? 2 + crown / 2 + 2 : 2 + crown + 2;
  return STRIP_WIDTHS.find(w => w >= need) ?? STRIP_WIDTHS[STRIP_WIDTHS.length - 1];
}

/**
 * Make a configuration valid. Returns { cfg, notes } where notes explain any change.
 * Rules: beside water, double row only (Cole et al. 2020: keep woody density low so the grass zone traps sediment);
 * the productive hedge has a fixed species mix and no standard trees (it is coppiced).
 */
export function normaliseConfig(input) {
  const cfg = { ...input };
  const notes = [];
  if (!FORMS[cfg.form]) cfg.form = 'double';
  if (!SPECIES[cfg.species]) cfg.species = 'speciesRich';
  if (!TREES[cfg.trees]) cfg.trees = 'none';
  if (!POSITIONS[cfg.position]) cfg.position = 'boundary';
  if (!STRIP_WIDTHS.includes(cfg.stripM)) cfg.stripM = 6;
  if (cfg.position === 'watercourse' && cfg.form !== 'double') {
    cfg.form = 'double';
    notes.push('Beside a watercourse the hedge is double row only, so the grass margin does the sediment trapping (Cole et al. 2020).');
  }
  if (cfg.form === 'productive') {
    if (cfg.species !== 'speciesRich') { cfg.species = 'speciesRich'; notes.push('The productive hedge uses its own mixed native species list.'); }
    if (cfg.trees !== 'none') { cfg.trees = 'none'; notes.push('Standard trees are not used in a coppiced productive hedge.'); }
  }
  const min = minStripM(cfg.form, cfg.position);
  if (cfg.stripM < min) {
    notes.push(`Strip widened to ${min} m: the smallest that fits this hedge and keeps GAEC 7 (no cultivation within 2 m of the hedge centre).`);
    cfg.stripM = min;
  }
  return { cfg, notes };
}

/** AECS area option rate, £/ha/yr (Grass Strips in Arable Fields; Water Margins in Arable Fields). VERIFIED 3 Nov 2026 (pages dated 15 Dec 2025). */
export const AECS_STRIP_RATE = 495.62;

export function geometry(cfg) {
  const f = FORMS[cfg.form];
  const crown = f.crownM, w = cfg.stripM;
  let marginM, payableM, option, layout;
  if (cfg.position === 'boundary') {
    marginM = w - crown;
    payableM = w - crown / 2 - 2;
    option = 'Grass Strips in Arable Fields (target areas only; paid only beyond 2 m from the hedge centre)';
    layout = `Hedge centre ${crown / 2} m from the boundary; ${r1(marginM)} m of grass margin on the field side.`;
  } else if (cfg.position === 'contour') {
    marginM = w - crown;
    payableM = w - 2 - 2;
    option = 'Grass Strips in Arable Fields (target areas only; paid only beyond 2 m from the hedge centre)';
    layout = `Hedge centre 2 m from the downslope edge (GAEC 7); ${r1(w - 2 - crown / 2)} m of grass margin on the upslope side.`;
  } else {
    marginM = w - crown;
    payableM = w - 2 - crown;
    option = 'Water Margins in Arable Fields (paid beyond the 2 m GBR strip; minimum 3, 6 or 12 m by water body)';
    layout = `Measured from the top of the bank: 2 m GBR strip, then the grass water margin, then the hedge set back with 2 m of GAEC strip on the field side.`;
  }
  payableM = payableM >= 3 ? r1(payableM) : 0;
  const gbpPerKm = cfg.form === 'productive' ? 0 : Math.round(payableM / 10 * AECS_STRIP_RATE);
  return {
    hedgeWidthM: crown, stripM: w, marginM: r1(marginM), layout,
    landTakeHaPerKm: r2(w / 10),
    aecsStrip: { option, payableM: cfg.form === 'productive' ? 0 : payableM, gbpPerKm,
      note: cfg.form === 'productive' ? 'Not used: the productive hedge offer does not rely on AECS (programme decision, October 2026).'
        : payableM ? 'Counted in the totals when grants are included. Not guaranteed: AECS is competitive and targeted, RPID must confirm the geometry, and the ONCRA grants question (Guidelines s4.2.1, s8.2.2) applies.'
          : 'None: the margin beyond the 2 m line is under the 3 m minimum.' },
  };
}

// ---------------------------------------------------------------------------
// 4b. Funding stack inputs for the illustrative additionality test (v12.1, 4 Nov 2026)
// ---------------------------------------------------------------------------
/**
 * AECS rates VERIFIED on ruralpayments.org (checked 21 Oct and 3 Nov 2026): Planting or Replanting of Hedges
 * £5.40/m capital (page 15 Dec 2025); Creation of Hedgerows £1.20/m/yr (15 Dec 2025); stock fence £5.50/m per side
 * (14 Nov 2025). Agreements run 5 years; AECS is competitive and targeted, so no payment is guaranteed.
 */
export const AECS = { hedgePlantingCapitalPerM: 5.40, creationOfHedgerowsPerMYr: 1.20, stockFenceCapitalPerMSide: 5.50, agreementYears: 5 };

/**
 * Establishment cost build-up, JUDGEMENT from claude/productive-hedge-farmer-cost.md (21 Oct 2026; arable no-fence
 * offer case: bare-root plants at 55% of Scotplants retail, spiral guard and cane, contractor planting, mulch, 3 years'
 * aftercare). Reproduces the £14.52/m offer cost at 8 plants/m. Contractor quotes are needed before external use.
 */
export const COST = { plantEach: 0.771, guardEach: 0.35, labourEach: 0.35, aftercareEach: 0.1875, mulchPerM: 1.00, standardsPerM: 0.25, stockFencePerMSide: 9.15 };

/** £ per metre, excluding fencing (fencing depends on farm type and is added in calc.js). */
export function establishmentCostPerM(cfg) {
  const f = FORMS[cfg.form];
  const perPlant = COST.plantEach + COST.guardEach + COST.labourEach + COST.aftercareEach;
  const trees = TREES[cfg.trees].withTrees || cfg.form === 'productive' ? COST.standardsPerM : 0;
  return r2(f.plantsPerM * perPlant + COST.mulchPerM + trees);
}

/** Stock-fence sides assumed for livestock farm types (JUDGEMENT): one on a boundary (the other side is the existing boundary), two elsewhere. */
export function fenceSides(cfg, livestock) {
  if (!livestock) return 0;
  return cfg.position === 'boundary' ? 1 : 2;
}

/** AECS payments per km that this configuration could attract (eligibility is never confirmed here). */
export function aecsPayments(cfg) {
  const geo = geometry(cfg);
  const productive = cfg.form === 'productive';
  const hedgeEligible = !productive && SPECIES[cfg.species].aecsCompliant;
  return {
    hedgeEligible,
    hedgeReason: productive ? 'Not used: the productive hedge offer is programme-funded and does not rely on AECS (October 2026).'
      : hedgeEligible ? 'Planting or Replanting of Hedges (capital) with Creation of Hedgerows (annual, 5-year agreement).'
        : 'Hedge options not available: the mix does not meet the AECS rule of at least three native flowering species.',
    plantingCapitalPerKm: hedgeEligible ? Math.round(AECS.hedgePlantingCapitalPerM * 1000) : 0,
    fenceCapitalPerKmPerSide: hedgeEligible ? Math.round(AECS.stockFenceCapitalPerMSide * 1000) : 0,
    hedgeAnnualPerKm: hedgeEligible ? Math.round(AECS.creationOfHedgerowsPerMYr * 1000) : 0,
    stripAnnualPerKm: geo.aecsStrip.gbpPerKm,
    stripOption: geo.aecsStrip.option,
    agreementYears: AECS.agreementYears,
  };
}

// ---------------------------------------------------------------------------
// 5. Biodiversity units: SSE Biodiversity Toolkit v1.0 (what SPEN follows now)
// ---------------------------------------------------------------------------
/** VERIFIED SSE Toolkit v1.0 Habitat Matrix / Metric_Creation. Distinctiveness score; years to Moderate and Good. */
export const SSE_HEDGE = {
  'Native hedgerow':                         { band: 'Low',    score: 2, yrsModerate: 5,  yrsGood: 12 },
  'Species-rich native hedgerow':            { band: 'Medium', score: 4, yrsModerate: 5,  yrsGood: 12 },
  'Native hedgerow with trees':              { band: 'Medium', score: 4, yrsModerate: 10, yrsGood: 20 },
  'Species-rich native hedgerow with trees': { band: 'High',   score: 6, yrsModerate: 10, yrsGood: 20 },
};
/** VERIFIED SSE Toolkit Table 5: 3.5%/yr time discount; Table 4 difficulty Low = 1.0; connectivity medium (1.1) for High distinctiveness (s2.8). */
const discount = yrs => Math.round(Math.pow(1 - 0.035, yrs) * 1000) / 1000;  // the toolkit tabulates to 3 dp (0.965, 0.837, 0.700, 0.490)
const COND = { Moderate: 2, Good: 3 };

export function sseHedgeType(cfg) {
  const base = SPECIES[cfg.species].sseHedgeType;
  return TREES[cfg.trees].withTrees ? base + ' with trees' : base;
}

/**
 * Screening units per km (JUDGEMENT on the toolkit's rules): within the impact's local authority area (spatial 1.0),
 * low strategic significance (1.0), creation difficulty Low (1.0), new hedge with baseline 0.
 * Margin units: mapped to the hedge centre line (England practice, to confirm); baseline cereal cropland (Low, 2).
 */
export function sseUnits(cfg) {
  const t = sseHedgeType(cfg), h = SSE_HEDGE[t];
  const conn = h.band === 'High' ? 1.1 : 1.0;
  const hlu = c => r2(h.score * COND[c] * discount(c === 'Good' ? h.yrsGood : h.yrsModerate) * conn);
  const crown = FORMS[cfg.form].crownM;
  const marginHa = (cfg.position === 'boundary' ? cfg.stripM - crown / 2 : cfg.stripM) / 10;
  const arable = 4 * 1 * discount(1) - 2;          // arable field margin, condition fixed N/A (1), 1 yr to target
  const grassMod = 4 * 2 * discount(5) - 2;        // other neutral grassland, Moderate, 5 yrs
  const grassGood = 4 * 3 * discount(10) - 2;      // other neutral grassland, Good, 10 yrs
  return {
    hedgeType: t, distinctiveness: `${h.band} (${h.score})`,
    hluPerKm: { moderate: hlu('Moderate'), good: hlu('Good') },
    yearsToTarget: { moderate: h.yrsModerate, good: h.yrsGood },
    marginHaPerKm: r2(marginHa),
    marginBuPerKm: { arableMargin: r2(marginHa * arable), grasslandModerate: r2(marginHa * grassMod), grasslandGood: r2(marginHa * grassGood) },
    basis: 'SSE Biodiversity Toolkit v1.0 (VERIFIED rules; JUDGEMENT inputs): within the local authority area, low strategic significance and connectivity, '
      + 'difficulty Low, Moderate or Good condition. Strategic significance from a mapped Fife nature network would add up to x1.15. '
      + 'Margin units count only if an ecologist accepts the habitat type; the SPBM consultation version counts margins but not hedges.',
  };
}

// ---------------------------------------------------------------------------
// 6. Income forgone and margin soil carbon
// ---------------------------------------------------------------------------
/** SAC Farm Management Handbook (Feb 2026 updates) gross margins £/ha, as in v11; ×0.7 edge factor (JUDGEMENT). */
export const GROSS_MARGIN = { 'Cereals': 953.33, 'General Cropping': 988.5, 'Dairy': 3633, 'LFA Grazing': 685.3 };
export const EDGE_FACTOR = 0.7;

export function incomeForgone(stripM) {
  const out = {};
  for (const [ft, gm] of Object.entries(GROSS_MARGIN)) {
    const gross = gm * stripM / 10;
    out[ft] = { grossIncomeForegone: r10(gross), netIncomeForegone: r10(gross * EDGE_FACTOR) };
  }
  return out;
}

/**
 * JUDGEMENT placeholder, NOT a sourced derivation (provenance traced 4 Nov 2026):
 *  - 28 tCO2e/ha/50 yr is the grass-strip soil figure inherited from the April 2026 v9 dataset (no recorded source);
 *  - 50 is the central value suggested in evidence review pass 2 (3 Nov 2026), which cited Poeplau et al. 2011
 *    (Global Change Biol 17:2415) from a search snippet only; the paper was not opened.
 * Primary cross-check (VERIFIED 4 Nov 2026): Drexler & Don 2024 (Geoderma 445:116878) measured the grassy hedgerow
 * edge at +22 ± 22 Mg C/ha vs cropland, 0-100 cm, at hedges of mean age 60 yr (median 35): about 81 tCO2e/ha, or about
 * 67 tCO2e/ha scaled linearly to 50 yr. So 28-50 sits at the low end. Scenario only, not counted.
 */
export function marginSoilCarbon(cfg) {
  const ha = Math.max(0, cfg.stripM - FORMS[cfg.form].crownM) / 10;
  return { low: r1(28 * ha), central: r1(50 * ha),
    note: 'Grass margin soil carbon scenario: 28-50 tCO2e/ha over 50 years (JUDGEMENT placeholder; a measured German study found about +22 t C/ha, roughly 80 tCO2e/ha, in grassy hedge edges at 0-100 cm: Drexler & Don 2024). Not counted: needs a measured margin soil stratum in the ONCRA design.' };
}

// ---------------------------------------------------------------------------
// 7. Build a full calculator record for a configuration
// ---------------------------------------------------------------------------
/**
 * @param {Object} template  per-biome template: { biome, slug, soilTypeCondition, agronomicWindProfile, scenario: { double, triple } }
 *                          scenario blocks carry the unvalidated v11 scenario fields (pollination, windbreak, avoided costs, pest,
 *                          thermal, SEPA and radar scores), which calc.js shows separately and never counts.
 * @param {Object} input    configuration (form, species, trees, stripM, position)
 */
export function buildHedgeRecord(template, input) {
  const { cfg, notes } = normaliseConfig(input);
  const f = FORMS[cfg.form], sp = SPECIES[cfg.species], tr = TREES[cfg.trees], pos = POSITIONS[cfg.position];
  const preset = presetForConfig(cfg);
  const scen = template.scenario[cfg.form === 'double' ? 'double' : 'triple'];
  const carbon = hedgeCarbon(f.crownM, f.harvested);
  const water = waterValues(cfg.stripM);
  const geo = geometry(cfg);
  const sse = sseUnits(cfg);
  const msc = marginSoilCarbon(cfg);
  const ifo = incomeForgone(cfg.stripM);
  const seq = f.harvested ? carbon.claim50 : carbon.gross50;
  const bands = f.harvested ? carbon.claimBands : carbon.bands;

  const label = preset ? `${preset.code}. ${preset.name}`
    : `Custom hedge (${f.label.toLowerCase()}, ${f.harvested ? 'productive mix' : sp.label.toLowerCase()}, ${tr.withTrees ? 'with trees' : 'no trees'}, ${pos.label.toLowerCase()})`;
  const id = `${template.slug}__${preset ? preset.code.toLowerCase() + '_' + preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'hedge_custom_' + configKey(cfg).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

  const mix = f.harvested ? 'Hazel, hawthorn and native willow (willow-led only on wet ground; alder 10-20% at most), with other native species; local provenance.' : sp.mix;
  const planting = [f.planting, mix, tr.withTrees ? tr.planting : ''].filter(Boolean).join(' ');

  const farmImpacts = {};
  for (const ft of Object.keys(GROSS_MARGIN)) {
    farmImpacts[ft] = { pollinationValue: scen.farmImpacts?.[ft]?.pollinationValue ?? 0, ...ifo[ft] };
  }

  const crewValuations = JSON.parse(JSON.stringify(scen.crewValuations));
  for (const pl of Object.keys(DELIVERY)) {
    crewValuations.waterPurification[pl] = water[pl];
    crewValuations.waterPurification[pl + 'High'] = water[pl + 'High'];
    crewValuations[pl + 'Total'] = water[pl];
    crewValuations[pl + 'TotalHigh'] = water[pl + 'High'];
  }
  crewValuations.waterPurification.basis = WATER_BASIS;

  const radarMetrics = JSON.parse(JSON.stringify(scen.radarMetrics));
  radarMetrics.habitatDistinctiveness = Math.round(SSE_HEDGE[sse.hedgeType].score / 6 * 100);

  const aecsHedge = f.harvested
    ? 'AECS hedge options not relied on: the productive hedge offer does not use AECS (programme decision, October 2026), and harvest timing would have to fit the option rules.'
    : sp.aecsCompliant
      ? 'Possible AECS route (rates checked 3 Nov 2026; pages dated 15 Dec 2025): Planting or Replanting of Hedges (capital GBP5.40/m) with Creation of Hedgerows (GBP1.20/m/yr). Item requirements: double-staggered rows at 6 plants/m and at least three different native flowering species (AECS guidance gives 60-80% hawthorn as a typical mix, not a requirement); livestock fencing at least 1 m from the centre line. Other conditions include in-bye land linked to habitat, no breeding-wader fields, and trimming outside 1 Mar-31 Aug (GAEC 7), not the same length every year.'
      : 'Not AECS-compliant: AECS hedge planting needs at least three different native flowering species.';
  const stripGrant = geo.aecsStrip.payableM
    ? ` Strip: ${geo.aecsStrip.option}, about ${geo.aecsStrip.payableM} m payable, about GBP${geo.aecsStrip.gbpPerKm}/km/yr at GBP${AECS_STRIP_RATE}/ha/yr.`
    : '';
  const trees = tr.withTrees ? ' MOREhedges (Woodland Trust) may fund up to 75% of costs for 100-250 m per season where the hedge links to woodland, with a tree every 6 m and a 30-year term; do not double-fund with AECS.' : '';

  return {
    id,
    biome: template.biome,
    variant: label,
    width: `${cfg.stripM}m`,
    assumedBiomassHeight: `${f.heightM}m`,
    bespokePlantingRegime: planting,
    agronomicWindProfile: template.agronomicWindProfile,
    hedgeConfig: { ...cfg, preset: preset?.code ?? null, hedgeWidthM: f.crownM, rows: f.rows, plantsPerM: f.plantsPerM, configNotes: notes },
    hedgeOutputs: {
      geometry: geo,
      biodiversity: sse,
      marginSoilCarbonScenario: msc,
      waterRetentionPct: water.retention,
      carbonGross50: carbon.gross50,
      carbonClaim50: seq,
      speciesTradeoff: sp.tradeoff ?? null,
      funding: { establishmentCostPerM: establishmentCostPerM(cfg), aecs: aecsPayments(cfg), gbrStripM: cfg.position === 'watercourse' ? 2 : 0 },
    },
    carbonSequestration: Object.fromEntries(BAND_KEYS.map((k, i) => [k, bands[i]])),
    sepaMetrics: JSON.parse(JSON.stringify(scen.sepaMetrics)),
    crewValuations,
    radarMetrics,
    farmImpacts,
    economicAssessment: JSON.parse(JSON.stringify(scen.economicAssessment)),
    advancedEcosystemServices: JSON.parse(JSON.stringify(scen.advancedEcosystemServices)),
    registry: {
      soilTypeCondition: template.soilTypeCondition,
      plantingRegime: planting,
      maintenanceRegime: f.maintenance + ' Margin: low-productivity grass mix with at least four flowering species; no fertiliser or sprays; cut after 15 August with cuttings removed. Do not plant on peat deeper than 30 cm or in fields used by breeding waders.',
      rootArchitecture: f.roots,
      biodiversityImpacts: `${sse.hedgeType} (SSE distinctiveness ${sse.distinctiveness}). Screening SSE units: ${sse.hluPerKm.moderate}-${sse.hluPerKm.good} hedgerow units/km at Moderate-Good condition`
        + ` (${sse.yearsToTarget.moderate}-${sse.yearsToTarget.good} years to target), plus ${sse.marginBuPerKm.arableMargin} area units/km for the margin as an arable field margin`
        + ` (${sse.marginBuPerKm.grasslandModerate}-${sse.marginBuPerKm.grasslandGood} if accepted as neutral grassland).`
        + (sp.tradeoff ? ' ' + sp.tradeoff : ''),
      waterImpacts: `${cfg.stripM} m strip: indicative retention of about ${water.retention.sediment}% of sediment and ${water.retention.phosphorus}% of total phosphorus reaching it (Stutter et al. 2021 width-only fits; soil and slope matter more). `
        + (cfg.position === 'contour' ? 'On the contour, the upslope grass zone traps sediment before the hedge (zoned buffer, Cole et al. 2020).' : cfg.position === 'watercourse' ? 'Beside water, the grass zone does the sediment work; the hedge adds shade and some nitrate uptake.' : 'Best value where the strip lies across the flow path.'),
      carbonAgronomicAssumptions: `Carbon profile: provisional lower-end literature estimate (hedge_carbon_model.py v2 / hedge-config.js). ${f.crownM} m crown; 50-year gross ${carbon.gross50} tCO2e/km `
        + `(biomass ${carbon.pools50.AGB}, roots ${carbon.pools50.BGB}, soil ${carbon.pools50.SOC}). `
        + (f.harvested ? `Coppiced for biochar feedstock, so the land claim is soil and roots only: ${carbon.claim50} tCO2e/km; the harvested biomass is accounted under a biochar standard, never both. ` : '')
        + (tr.withTrees ? 'Standard trees are not counted (no substantiated model). ' : '')
        + `Grass margin soil carbon is not counted (scenario ${msc.low}-${msc.central} tCO2e/km). Not validated; site soil measurement replaces the soil term.`,
      agronomicUtility: geo.layout,
      regulatoryAlignment: aecsHedge + stripGrant + trees + ' GAEC 7 applies. Eligibility is not confirmed for any site. Using a grant may affect ONCRA eligibility (Guidelines 27 Mar 2026 s4.2.1, s8.2.2): a written ONCRA ruling is needed before grants and carbon units are combined.',
      additionality: 'Not assessed. ONCRA financial additionality (Guidelines s8.2.1) and regulatory additionality (s8.2.2), including the government-grant clause (s4.2.1), are unresolved for this activity and need a written ONCRA ruling. Any biodiversity or water benefit claim needs a measured baseline and verification.',
      sserGrossUnitsPerKm: r2(seq * 0.64),
    },
    seq50yrTotal: seq,
    carbonSource: {
      status: 'provisional-literature',
      model: 'hedge_carbon_model.py v2 (3 Nov 2026), hedge-config.js v12',
      crown_m: f.crownM, soc_width_m: SOC_WIDTH_M, harvested: f.harvested,
      gross_50yr_tCO2e_per_km: carbon.gross50,
      pools_50yr_tCO2e_per_km: carbon.pools50,
    },
  };
}

/** Per-biome template from a v11 Dense (double) and Heritage (triple) record. Used by the build script. */
export function templateFromV11(dense, heritage) {
  const pick = r => ({
    farmImpacts: Object.fromEntries(Object.entries(r.farmImpacts).map(([k, v]) => [k, { pollinationValue: v.pollinationValue }])),
    crewValuations: r.crewValuations, radarMetrics: r.radarMetrics, sepaMetrics: r.sepaMetrics,
    economicAssessment: r.economicAssessment, advancedEcosystemServices: r.advancedEcosystemServices,
  });
  return {
    biome: dense.biome,
    slug: dense.id.split('__')[0],
    soilTypeCondition: 'Arable and mixed field boundaries, in-field contours and burn sides; check drains, services, peat depth and breeding waders before planting.',
    agronomicWindProfile: dense.agronomicWindProfile,
    scenario: { double: pick(dense), triple: pick(heritage) },
  };
}
