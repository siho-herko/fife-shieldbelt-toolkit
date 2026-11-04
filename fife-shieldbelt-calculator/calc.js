import { normaliseScenario, incrementalIncome, scenarioFunding } from './scenario.js';
/**
 * calc.js — Fife Landscape Resilience Calculator
 * Pure calculation engine — no DOM, no side effects.
 * All functions are deterministic given the same inputs and v2 record.
 *
 * v2 dimensions beyond v1:
 *   avoided costs, windbreak yield, pest regulation,
 *   thermal regulation, SSER biodiversity units,
 *   disaggregated CREW (air filtration / catchment hydrology / water purification)
 */

// ---------------------------------------------------------------------------
// Type documentation
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CalcInputs
 * @property {string} biome            - e.g. 'Fife (East Neuk Coast)'
 * @property {string} variantId        - DB record id
 * @property {string} farmType         - 'Cereals'|'General Cropping'|'Dairy'|'LFA Grazing'
 * @property {string} placement        - 'riparian'|'crossSlope'|'downSlope'
 * @property {number} lengthM          - Strip length in metres
 * @property {number} creditPrice      - £ per tCO₂e
 * @property {string} windbreakOrient  - 'NS'|'EW'
 * @property {string} [carbonRoute]    - 'oncra' (default: ONCRA units, gross × 0.64) | 'contribution' (hypothetical sponsorship in £/km/year, not tonnes sold)
 * @property {string} [grants]         - 'aecs' (default: AECS payments counted where the option could qualify) | 'none'
 */

/**
 * @typedef {Object} CalcResults — full schema defined in prompt spec
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/**
 * Parse a width string like '6m' to the numeric width in metres.
 * @param {string} widthStr
 * @returns {number}
 */
export function parseWidth(widthStr) {
  return parseInt(widthStr.replace('m', ''), 10);
}

/**
 * Scale a per-km value to the actual strip length.
 * @param {number} perKmValue
 * @param {number} lengthM
 * @returns {number}
 */
export function scaleToLength(perKmValue, lengthM) {
  return perKmValue * (lengthM / 1000);
}

/**
 * Safely read a number field; returns 0 for missing/null/NaN.
 * @param {*} v
 * @returns {number}
 */
function safeNum(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Carbon
// ---------------------------------------------------------------------------

/**
 * Read the pre-computed 50-year sequestration total from the record.
 * (v2: do not re-sum periods — use the pre-computed field.)
 * @param {Object} record
 * @returns {number} tCO₂e per km over 50 years
 */
export function totalSeq50yr(record) {
  return safeNum(record.seq50yrTotal);
}

/**
 * Build a 10-element array of *cumulative* sequestration values,
 * one per 5-year period, suitable for the trajectory line chart.
 * Each value is the running total through that period (tCO₂e/km).
 *
 * @param {Object} carbonSequestration  - record.carbonSequestration
 * @returns {number[]} length 10
 */
export function cumulativeSeqTrajectory(carbonSequestration) {
  const keys = [
    'yr_1_5', 'yr_6_10', 'yr_11_15', 'yr_16_20', 'yr_21_25',
    'yr_26_30', 'yr_31_35', 'yr_36_40', 'yr_41_45', 'yr_46_50',
  ];
  let running = 0;
  return keys.map((k) => {
    running += safeNum(carbonSequestration?.[k]);
    return running;
  });
}

/**
 * ONCRA net factor: ILLUSTRATIVE default scenario, not a validated or guaranteed factor.
 * 20% default GHG deduction (no project LCA), then 20% default buffer (15% holding + 5% collective)
 * → 0.8 × 0.8 = 0.64 of gross removal. A Category 3 risk rating raises the buffer to 35% (→ 0.52).
 * Rules VERIFIED — ONCRA LSC Protocol v2 §2.1.6; Guidelines (27 Mar 2026) §5.6, §8.3.1.8.
 */
export const ONCRA_NET_FACTOR = 0.64;

/**
 * Carbon value routes (v12.1, 4 Nov 2026).
 *  oncra:        ONCRA Land Stored Carbon units, illustrative net = gross × 0.64 (contribution claims only for Potential Units).
 *  contribution: separately negotiated sponsorship in £/km/year, without assigning a sale price to gross tonnes.
 *                Intervention reporting needs its own net-impact assessment. VERIFIED (GHG Protocol LSR Standard v1.1, Box 1.1, Box 5.1, Req 7): removals on field-edge
 *                hedgerows cannot currently enter a company's physical scope 3 inventory; intervention reporting (Ch 16)
 *                is reported separately and does not count toward inventory targets.
 */
export const CARBON_ROUTES = {
  oncra:        { factor: ONCRA_NET_FACTOR, label: 'ONCRA units (gross × 0.64)' },
  contribution: { factor: 0, label: 'Hypothetical sponsorship (£/km/year; no tonnes sold)' },
};
export function carbonRouteFactor(route) {
  return (CARBON_ROUTES[route] ?? CARBON_ROUTES.oncra).factor;
}

/**
 * True unless the record's carbon is flagged as an unsubstantiated scenario (v11 data).
 * Only hedge variants carry a documented (provisional, literature lower-end) carbon model.
 * @param {Object} record
 * @returns {boolean}
 */
export function carbonSubstantiated(record) {
  const st = record?.carbonSource?.status;
  return !st || st === 'provisional-literature';
}

/**
 * Annual carbon income £/yr, on net (creditable) tonnes.
 * seq50yrTotal is gross tCO₂e per km over 50 years.
 * Formula: (seq50yrTotal / 50) × (lengthM / 1000) × netFactor × creditPrice
 *
 * (Fixed 3 Nov 2026: previously multiplied by strip area in ha, treating a
 *  per-km figure as per-ha.)
 *
 * @param {Object} record
 * @param {number} lengthM
 * @param {number} creditPrice  £/tCO₂e
 * @param {number} [netFactor=ONCRA_NET_FACTOR]
 * @returns {number} £/yr
 */
export function annualCarbonIncome(record, lengthM, creditPrice, netFactor = ONCRA_NET_FACTOR) {
  // Illustrative 50-year average value, not a payment schedule. Zero where carbon is unsubstantiated.
  if (!carbonSubstantiated(record)) return 0;
  const annRate = safeNum(record.seq50yrTotal) / 50;
  return annRate * (safeNum(lengthM) / 1000) * safeNum(netFactor) * safeNum(creditPrice);
}

// ---------------------------------------------------------------------------
// Agronomic
// ---------------------------------------------------------------------------

/**
 * Net income foregone £/yr for the chosen farm type, scaled to strip length.
 * Source: record.farmImpacts[farmType].netIncomeForegone (per km)
 *
 * @param {Object} record
 * @param {string} farmType
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function netIncomeForegone(record, farmType, lengthM) {
  const perKm = safeNum(record.farmImpacts?.[farmType]?.netIncomeForegone);
  return scaleToLength(perKm, lengthM);
}

/**
 * Pollination value £/yr for the chosen farm type, scaled to strip length.
 * Source: record.farmImpacts[farmType].pollinationValue (per km)
 *
 * @param {Object} record
 * @param {string} farmType
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function pollinationValue(record, farmType, lengthM) {
  const perKm = safeNum(record.farmImpacts?.[farmType]?.pollinationValue);
  return scaleToLength(perKm, lengthM);
}

// ---------------------------------------------------------------------------
// CREW ecosystem services
// ---------------------------------------------------------------------------

/**
 * Total CREW value £/yr for the chosen placement, scaled to strip length.
 * Uses the top-level placement total fields (riparianTotal etc.).
 *
 * @param {Object} record
 * @param {'riparian'|'crossSlope'|'downSlope'} placement
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function crewValue(record, placement, lengthM) {
  const keyMap = {
    riparian:   'riparianTotal',
    crossSlope: 'crossSlopeTotal',
    downSlope:  'downSlopeTotal',
  };
  const perKm = safeNum(record.crewValuations?.[keyMap[placement]]);
  return scaleToLength(perKm, lengthM);
}

/**
 * Disaggregated CREW breakdown for the chosen placement.
 * Each of the three sub-services scaled to strip length.
 *
 * @param {Object} record
 * @param {'riparian'|'crossSlope'|'downSlope'} placement
 * @param {number} lengthM
 * @returns {{ airFiltration: number, catchmentHydrology: number, waterPurification: number }}
 */
export function crewBreakdown(record, placement, lengthM) {
  const cv = record.crewValuations ?? {};
  return {
    airFiltration:      scaleToLength(safeNum(cv.airFiltration?.[placement]),      lengthM),
    catchmentHydrology: scaleToLength(safeNum(cv.catchmentHydrology?.[placement]), lengthM),
    waterPurification:  scaleToLength(safeNum(cv.waterPurification?.[placement]),  lengthM),
  };
}

// ---------------------------------------------------------------------------
// Advanced ecosystem services (v2)
// ---------------------------------------------------------------------------

/**
 * Pest regulation £/yr — scaled to strip length.
 * Source: record.advancedEcosystemServices.pestRegulation[farmType]
 *
 * @param {Object} record
 * @param {string} farmType
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function pestRegulationValue(record, farmType, lengthM) {
  const perKm = safeNum(record.advancedEcosystemServices?.pestRegulation?.[farmType]);
  return scaleToLength(perKm, lengthM);
}

/**
 * Thermal regulation £/yr — scaled to strip length.
 * Source: record.advancedEcosystemServices.thermalRegulation[farmType]
 *
 * @param {Object} record
 * @param {string} farmType
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function thermalRegulationValue(record, farmType, lengthM) {
  const perKm = safeNum(record.advancedEcosystemServices?.thermalRegulation?.[farmType]);
  return scaleToLength(perKm, lengthM);
}

/**
 * Windbreak total yield benefit £/yr — scaled to strip length.
 * Sums yieldBump + waterRetention + nutrientPump from
 * record.economicAssessment.windbreakNS or .windbreakEW.
 *
 * @param {Object} record
 * @param {'NS'|'EW'} orientation
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function windbreakValue(record, orientation, lengthM) {
  const key = orientation === 'EW' ? 'windbreakEW' : 'windbreakNS';
  const wb  = record.economicAssessment?.[key] ?? {};
  const perKm = safeNum(wb.yieldBump) + safeNum(wb.waterRetention) + safeNum(wb.nutrientPump);
  return scaleToLength(perKm, lengthM);
}

/**
 * Windbreak detailed breakdown — each component scaled to strip length.
 *
 * @param {Object} record
 * @param {'NS'|'EW'} orientation
 * @param {number} lengthM
 * @returns {{ yieldBump: number, waterRetention: number, nutrientPump: number }}
 */
export function windbreakBreakdown(record, orientation, lengthM) {
  const key = orientation === 'EW' ? 'windbreakEW' : 'windbreakNS';
  const wb  = record.economicAssessment?.[key] ?? {};
  return {
    yieldBump:      scaleToLength(safeNum(wb.yieldBump),      lengthM),
    waterRetention: scaleToLength(safeNum(wb.waterRetention), lengthM),
    nutrientPump:   scaleToLength(safeNum(wb.nutrientPump),   lengthM),
  };
}

/**
 * Avoided costs total £/yr for chosen placement — scaled to strip length.
 * Sums all 5 components from record.economicAssessment[placement].
 *
 * @param {Object} record
 * @param {'riparian'|'crossSlope'|'downSlope'} placement
 * @param {number} lengthM
 * @returns {number} £/yr
 */
export function avoidedCosts(record, placement, lengthM) {
  const ea = record.economicAssessment?.[placement] ?? {};
  const perKm = safeNum(ea.floodControl)
              + safeNum(ea.avoidedErosion)
              + safeNum(ea.avoidedCompaction)
              + safeNum(ea.avoidedDownErosion)
              + safeNum(ea.avoidedFuelCosts);
  return scaleToLength(perKm, lengthM);
}

/**
 * Avoided costs detailed breakdown — each component scaled to strip length.
 *
 * @param {Object} record
 * @param {'riparian'|'crossSlope'|'downSlope'} placement
 * @param {number} lengthM
 * @returns {{ floodControl, avoidedErosion, avoidedCompaction, avoidedDownErosion, avoidedFuelCosts }}
 */
export function avoidedCostsBreakdown(record, placement, lengthM) {
  const ea = record.economicAssessment?.[placement] ?? {};
  return {
    floodControl:       scaleToLength(safeNum(ea.floodControl),       lengthM),
    avoidedErosion:     scaleToLength(safeNum(ea.avoidedErosion),     lengthM),
    avoidedCompaction:  scaleToLength(safeNum(ea.avoidedCompaction),  lengthM),
    avoidedDownErosion: scaleToLength(safeNum(ea.avoidedDownErosion), lengthM),
    avoidedFuelCosts:   scaleToLength(safeNum(ea.avoidedFuelCosts),   lengthM),
  };
}

// ---------------------------------------------------------------------------
// SSER biodiversity units (v2)
// ---------------------------------------------------------------------------

/**
 * SSER biodiversity units for this strip length.
 * Formula: record.registry.sserGrossUnitsPerKm × (lengthM / 1000)
 *
 * @param {Object} record
 * @param {number} lengthM
 * @returns {number}
 */
export function sserUnits(record, lengthM) {
  return safeNum(record.registry?.sserGrossUnitsPerKm) * (lengthM / 1000);
}

// ---------------------------------------------------------------------------
// Master calculate()
// ---------------------------------------------------------------------------

/**
 * Run the complete calculation pipeline.
 * Returns the full results object matching the v2 spec schema.
 *
 * @param {CalcInputs} inputs
 * @param {Object}     record  - Full v2 intervention record from IndexedDB
 * @returns {CalcResults}
 */
export function calculate(inputs, record) {
  const { farmType, placement, lengthM, creditPrice, windbreakOrient } = inputs;
  const carbonRoute = CARBON_ROUTES[inputs.carbonRoute] ? inputs.carbonRoute : 'oncra';
  const grantsOn    = inputs.grants !== 'none';
  const routeFactor = carbonRouteFactor(carbonRoute);

  // --- Identity ---
  const widthM  = parseWidth(record.width);
  const areaMHa = (widthM * lengthM) / 10_000;

  // --- Carbon ---
  const seq50 = totalSeq50yr(record);
  const seqTraj = cumulativeSeqTrajectory(record.carbonSequestration);
  const scenario = normaliseScenario(inputs.scenario);
  const salesFactor = scenario.soldPercent / 100;
  const routeAllowed = carbonRoute !== 'oncra' || scenario.grantInterpretation !== 'excluded';
  const carbIncome = !carbonSubstantiated(record) || !routeAllowed ? 0 : carbonRoute === 'contribution'
    ? scenario.sponsorshipPerKm * lengthM / 1000 * salesFactor
    : annualCarbonIncome(record, lengthM, creditPrice, routeFactor) * salesFactor * (1-scenario.salesFeePercent/100);

  // --- Agronomic ---
  const nif  = incrementalIncome(record, inputs);
  const poll = pollinationValue(record, farmType, lengthM);
  const netAgronomicImpact = poll - nif;

  // --- Advanced ecosystem services ---
  const pest    = pestRegulationValue(record, farmType, lengthM);
  const thermal = thermalRegulationValue(record, farmType, lengthM);
  const fioEff  = safeNum(record.advancedEcosystemServices?.fioTrappingEfficiency);
  const wbVal   = windbreakValue(record, windbreakOrient, lengthM);
  const wbBd    = windbreakBreakdown(record, windbreakOrient, lengthM);
  const acVal   = avoidedCosts(record, placement, lengthM);
  const acBd    = avoidedCostsBreakdown(record, placement, lengthM);

  // --- CREW ---
  const crewTotal = crewValue(record, placement, lengthM);
  const crewPerKm = safeNum(
    record.crewValuations?.[ { riparian: 'riparianTotal', crossSlope: 'crossSlopeTotal', downSlope: 'downSlopeTotal' }[placement] ]
  );
  const crewBd = crewBreakdown(record, placement, lengthM);

  // --- SSER ---
  const sserTotal = sserUnits(record, lengthM);
  const sserPerKm = safeNum(record.registry?.sserGrossUnitsPerKm);

  // --- Value summary (v11, 3 Nov 2026 audit corrections) ---
  // Counted: illustrative carbon value (documented hedge model only), indicative water-quality value
  // (low case), less income forgone. NOT counted: pollination, pest regulation, thermal, windbreak and
  // avoided-cost values, which are unvalidated scenarios (no field-scale evidence for Fife), shown separately.
  // This is an illustrative combined value, not cash income: it excludes establishment, maintenance,
  // MRV, registry fees and discounting.
  const carbonOk = carbonSubstantiated(record);
  const unvalidatedScenarioValue = poll + pest + thermal + wbVal + acVal;
  // v12.1 (Si, 4 Nov 2026): AECS annual payments the option could attract are counted, so the app shows the ONCRA + AECS
  // stack. They apply during a 5-year agreement; the 30-year view and the additionality test are in fundingStack().
  const stack = fundingStack(record, { ...inputs, carbonRoute, grants: grantsOn ? 'aecs' : 'none' });
  const aecsAnnual = stack ? stack.annual.aecs : 0;
  const annualNetBenefit = carbIncome + crewTotal + aecsAnnual - nif;      // kept name for compatibility
  const illustrativeCombinedValue = annualNetBenefit;

  // Derived summary metrics
  const netAgronomicBenefit = -nif;                           // sourced farm cost only
  const seq25yrRevenue = stack ? stack.schedule.filter(row => row.year <= 25).reduce((sum,row) => sum + row.carbon, 0) : 0;
  const widerEcoValue       = crewTotal; // water purification, low case (flood storage and air not valued in v11)
  const hiKey = { riparian: 'riparianTotalHigh', crossSlope: 'crossSlopeTotalHigh', downSlope: 'downSlopeTotalHigh' }[placement];
  const widerEcoValueHigh   = scaleToLength(safeNum(record.crewValuations?.[hiKey] ?? record.crewValuations?.[{ riparian: 'riparianTotal', crossSlope: 'crossSlopeTotal', downSlope: 'downSlopeTotal' }[placement]]), lengthM);

  // --- Radar (placement-specific) ---
  const rm = record.radarMetrics ?? {};
  const placementRadar = rm[placement] ?? {};
  const radarData = {
    ecosystemHealth:        safeNum(rm.ecosystemHealth),
    habitatDistinctiveness: safeNum(rm.habitatDistinctiveness),
    soilCarbonAndHealth:    safeNum(rm.soilCarbonAndHealth),
    agronomicYield:         safeNum(rm.agronomicYield),
    catchmentHydrology:     safeNum(placementRadar.catchmentHydrology),
    waterQuality:           safeNum(placementRadar.waterQuality),
  };

  // --- SEPA (placement-specific + variant-level drought on sepaMetrics root) ---
  const sm = record.sepaMetrics?.[placement] ?? {};
  const rootSepa = record.sepaMetrics ?? {};
  const nitrateScore = sm.nitrateRetention != null ? safeNum(sm.nitrateRetention) : safeNum(sm.nutrientRetention);
  const phosphorusScore = sm.phosphorusRetention != null ? safeNum(sm.phosphorusRetention) : 0;
  const sepaData = {
    floodControl:      safeNum(sm.floodControl),
    sedimentTrapping:  safeNum(sm.sedimentTrapping),
    nutrientRetention: safeNum(sm.nutrientRetention),
    nitrateRetention:  nitrateScore,
    phosphorusRetention: phosphorusScore,
    phosphorusRemobilisationRisk: !!sm.phosphorusRemobilisationRisk,
    droughtResilience: safeNum(rootSepa.droughtResilience),
  };

  // --- Display strings ---
  const plantingRegime = (record.registry?.plantingRegime || '').trim()
    || (record.bespokePlantingRegime || '');

  return {
    // Identity
    variantName:   record.variant,
    biome:         record.biome,
    width:         record.width,
    widthM,
    lengthM,
    areaMHa,

    // Carbon
    // Per-km quantities (documented contract) and installed-length quantities (explicit)
    carbonSubstantiated: carbonOk,
    carbonStatus:       record.carbonSource?.status ?? 'unspecified',
    seq50yrTotal:       seq50,                                   // tCO2e per km, gross
    seq50yrNet:         carbonOk ? seq50 * ONCRA_NET_FACTOR : 0, // tCO2e per km, illustrative net
    seq50yrTotalPerKm:  seq50,
    seq50yrTotalInstalled: seq50 * (lengthM / 1000),
    seq50yrNetInstalled:   carbonOk ? seq50 * (lengthM / 1000) * ONCRA_NET_FACTOR : 0,
    seqTrajectory:      seqTraj,
    annualCarbonIncome: carbIncome,
    carbonRoute,
    carbonRouteFactor:  routeFactor,
    grantsIncluded:     grantsOn,
    aecsAnnual,
    fundingStack:       stack,

    // Agronomic
    netIncomeForegone:  nif,
    pollinationValue:   poll,
    netAgronomicImpact,

    // Advanced ecosystem services
    pestRegulationValue:    pest,
    thermalRegulationValue: thermal,
    fioTrappingEfficiency:  fioEff,
    windbreakValue:         wbVal,
    avoidedCosts:           acVal,
    avoidedCostsBreakdown:  acBd,
    windbreakBreakdown:     wbBd,

    // CREW
    crewValuePerKm: crewPerKm,
    crewValueTotal: crewTotal,
    crewBreakdown:  crewBd,

    // Biodiversity registry
    sserUnitsTotal:       sserTotal,
    sserPerKm,
    biodiversityImpacts:  record.registry?.biodiversityImpacts  ?? '',
    rootArchitecture:     record.registry?.rootArchitecture     ?? '',
    maintenanceRegime:    record.registry?.maintenanceRegime    ?? '',
    regulatoryAlignment:  record.registry?.regulatoryAlignment  ?? '',
    additionality:        record.registry?.additionality        ?? '',

    // Full value stack
    annualNetBenefit,
    illustrativeCombinedValue,
    unvalidatedScenarioValue,
    netAgronomicBenefit,
    seq25yrRevenue,
    widerEcoValue,
    widerEcoValueHigh,

    // Radar & SEPA
    radarData,
    sepaData,

    // Display strings
    plantingRegime,
    biomassHeight: record.assumedBiomassHeight ?? '',
    windProfile:   record.agronomicWindProfile ?? '',

    // Hedge configurator outputs (v12; null for non-hedge records)
    hedge: hedgeSummary(record, lengthM),
  };
}

// ---------------------------------------------------------------------------
// Funding stack and illustrative additionality test (v12.1)
// ---------------------------------------------------------------------------

/** Financial scenario rate, not the Treasury social discount rate or an evidenced private hurdle. */
export const STACK_YEARS = 30;
export const STACK_DISCOUNT = 0.035;
export const fundingStack = scenarioFunding;

/**
 * Hedge-specific outputs for a v12 hedge record, scaled to the installed length where stated.
 * AECS enters the selected conditional funding scenario, subject to parcel and policy assumptions.
 * Margin soil carbon remains an excluded placeholder pending an evidenced design.
 * @param {Object} record
 * @param {number} lengthM
 * @returns {Object|null}
 */
export function hedgeSummary(record, lengthM) {
  const cfg = record?.hedgeConfig;
  const out = record?.hedgeOutputs;
  if (!cfg || !out) return null;
  const km = safeNum(lengthM) / 1000;
  const bio = out.biodiversity ?? {};
  const geo = out.geometry ?? {};
  return {
    preset:        cfg.preset,
    form:          cfg.form,
    species:       cfg.species,
    trees:         cfg.trees,
    position:      cfg.position,
    hedgeWidthM:   safeNum(cfg.hedgeWidthM),
    stripM:        safeNum(cfg.stripM),
    rows:          safeNum(cfg.rows),
    configNotes:   cfg.configNotes ?? [],
    landTakeHa:    safeNum(geo.landTakeHaPerKm) * km,
    layout:        geo.layout ?? '',
    aecsStripPayableM:      safeNum(geo.aecsStrip?.payableM),
    aecsStripGbpPerKm:      safeNum(geo.aecsStrip?.gbpPerKm),
    aecsStripGbpInstalled:  safeNum(geo.aecsStrip?.gbpPerKm) * km,
    aecsStripOption:        geo.aecsStrip?.option ?? '',
    aecsStripNote:          geo.aecsStrip?.note ?? '',
    sseHedgeType:           bio.hedgeType ?? '',
    sseDistinctiveness:     bio.distinctiveness ?? '',
    hluPerKm:               { moderate: safeNum(bio.hluPerKm?.moderate), good: safeNum(bio.hluPerKm?.good) },
    hluInstalled:           { moderate: safeNum(bio.hluPerKm?.moderate) * km, good: safeNum(bio.hluPerKm?.good) * km },
    marginBuPerKm:          bio.marginBuPerKm ?? {},
    marginBuInstalled:      Object.fromEntries(Object.entries(bio.marginBuPerKm ?? {}).map(([k, v]) => [k, safeNum(v) * km])),
    yearsToTarget:          bio.yearsToTarget ?? {},
    carbonGross50PerKm:     safeNum(out.carbonGross50),
    carbonClaim50PerKm:     safeNum(out.carbonClaim50),
    marginSoilCarbonPerKm:  out.marginSoilCarbonScenario ?? null,
    waterRetentionPct:      out.waterRetentionPct ?? {},
    speciesTradeoff:        out.speciesTradeoff ?? null,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a number with thousand-separators and fixed decimal places.
 * @param {number} n
 * @param {number} [dp=1]
 * @returns {string}
 */
export function fmt(n, dp = 1) {
  return safeNum(n).toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/**
 * Format a sterling amount (£) rounded to the nearest pound.
 * @param {number} n
 * @returns {string}
 */
export function fmtGBP(n) {
  return '£' + Math.round(safeNum(n)).toLocaleString('en-GB');
}

/**
 * Format a carbon quantity to 1 d.p. with tCO₂e suffix.
 * @param {number} n
 * @returns {string}
 */
export function fmtCarbon(n) {
  return fmt(n, 1) + ' tCO₂e';
}

/**
 * Format estimated ONCRA net units (tCO₂e) to 1 d.p.
 * (Field name sser* kept for compatibility; "SSER" is not an ONCRA unit.)
 * @param {number} n
 * @returns {string}
 */
export function fmtSSER(n) {
  return fmt(n, 1) + ' tCO₂e net';
}
