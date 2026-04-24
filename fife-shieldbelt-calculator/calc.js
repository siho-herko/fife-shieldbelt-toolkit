/**
 * calc.js — Fife Farm Resilience Calculator
 * Pure calculation engine — no DOM, no side effects.
 * All functions are deterministic given the same inputs and v2 record.
 *
 * v2 dimensions beyond v1:
 *   avoided costs, windbreak yield, pest regulation,
 *   thermal regulation, SSER biodiversity units,
 *   disaggregated CREW (air filtration / catchment hydrology / water purification)
 *
 * Author: NFCA / Fife ShieldBelt project
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
 * Annual carbon income £/yr.
 * Formula: (seq50yrTotal / 50) × (widthM × lengthM / 10000) × creditPrice
 *
 * @param {Object} record
 * @param {number} lengthM
 * @param {number} creditPrice  £/tCO₂e
 * @returns {number} £/yr
 */
export function annualCarbonIncome(record, lengthM, creditPrice) {
  const widthM  = parseWidth(record.width);
  const areaHa  = (widthM * lengthM) / 10_000;
  const annRate = safeNum(record.seq50yrTotal) / 50;
  return annRate * areaHa * safeNum(creditPrice);
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

  // --- Identity ---
  const widthM  = parseWidth(record.width);
  const areaMHa = (widthM * lengthM) / 10_000;

  // --- Carbon ---
  const seq50 = totalSeq50yr(record);
  const seqTraj = cumulativeSeqTrajectory(record.carbonSequestration);
  const carbIncome = annualCarbonIncome(record, lengthM, creditPrice);

  // --- Agronomic ---
  const nif  = netIncomeForegone(record, farmType, lengthM);
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

  // --- Full value stack ---
  // 7 benefit streams: carbon + pollination + CREW + pest + thermal + windbreak + avoidedCosts
  const annualNetBenefit = carbIncome + poll + crewTotal + pest + thermal + wbVal + acVal - nif;

  // Derived summary metrics
  const netAgronomicBenefit = acVal + wbVal + poll + pest + thermal - nif;
  const seq25yrRevenue      = (seqTraj[4] ?? 0) * (lengthM / 1000) * creditPrice;
  const widerEcoValue       = crewTotal; // air filtration + catchment hydrology + water purification

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
    seq50yrTotal:       seq50,
    seqTrajectory:      seqTraj,
    annualCarbonIncome: carbIncome,

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
    netAgronomicBenefit,
    seq25yrRevenue,
    widerEcoValue,

    // Radar & SEPA
    radarData,
    sepaData,

    // Display strings
    plantingRegime,
    biomassHeight: record.assumedBiomassHeight ?? '',
    windProfile:   record.agronomicWindProfile ?? '',
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
 * Format SSER units to 2 d.p.
 * @param {number} n
 * @returns {string}
 */
export function fmtSSER(n) {
  return fmt(n, 2) + ' units';
}
