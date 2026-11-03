#!/usr/bin/env python3
"""
Build fife_interventions_db_v11.json from v10 (3 Nov 2026, audit corrections).

Changes (audit finding numbers from shieldbelt-independent-audit-2026-11-03.md):
  #1-3, #5, #14-15  Hedge carbon replaced by hedge_carbon_model.py v2 (pool stock model, t C -> tCO2e
                    once, SOC stock curve, explicit crown / soil widths, no layering bump).
  #10, #13, #17, #20-22  Non-hedge carbon kept only as an isolated 'unsubstantiated scenario'
                    (carbonSource.status); calc.js excludes it from carbon value and net units.
                    Unverifiable '15% deduction', WCC-curve and GDD-calibration claims withdrawn.
  #6, #9, #23       'ONCRA Verified', 'Nitrate Credit Union', 'Biodiversity Net Gain', nitrate credits
                    and SSER unit claims removed.
  #8, #35           regulatoryAlignment rewritten per family from verified scheme pages (3 Nov 2026);
                    additionality rewritten: ONCRA tests unresolved, grants clause needs a ruling.
  #25, #27, #29     Water: low case (Defra 2014 sediment GBP0.054/kg) used in totals; CREW high case kept
                    as *High fields; flood-storage and air values set to 0 in totals (not evidenced for
                    every strip), v10 values preserved under *_v10Scenario.
  #36 (data side)   Alder-as-nitrate-solution text corrected (UKFS riparian guide 2024 p.19).
Run from fife-shieldbelt-calculator/:  python3 scripts/build_v11.py
"""
import json, pathlib, re, copy

HERE = pathlib.Path(__file__).resolve().parent.parent
SRC = HERE / "data" / "fife_interventions_db_v10.json"
OUT = HERE / "data" / "fife_interventions_db_v11.json"
PROFILES = HERE / "scripts" / "hedge-carbon-profiles.json"
BANDS = ["yr_1_5", "yr_6_10", "yr_11_15", "yr_16_20", "yr_21_25",
         "yr_26_30", "yr_31_35", "yr_36_40", "yr_41_45", "yr_46_50"]
NET_FACTOR = 0.64  # illustrative ONCRA default scenario (LSC v2 s2.1.6; Guidelines s5.6); 0.52 if Category 3 (s8.3.1.8)

# ---- Water (see build_v10.py for the CREW high case) -------------------------------------------
GBP_PER_KG_LOW = {"N": 1.37, "P": 46.61, "sed": 0.054}   # sediment: Defra IA Defra1819 Table 22 (2014 prices)
GBP_PER_KG_HIGH = {"N": 1.37, "P": 46.61, "sed": 0.55}   # CREW CRW2024/04 p26 fn 11 (2024 prices)
CONTRIB_HA_PER_KM = 10.0
LOAD = {"N": 25.0, "P": 0.7, "sed": 200.0}
RETENTION = {"3m": {"N": .05, "P": .15, "sed": .50}, "6m": {"N": .15, "P": .25, "sed": .65},
             "12m": {"N": .30, "P": .40, "sed": .75}, "20m": {"N": .40, "P": .50, "sed": .85},
             "60m": {"N": .70, "P": .70, "sed": .90}}
DELIVERY = {"riparian": 1.0, "crossSlope": 0.5, "downSlope": 0.1}

def water(width, pl, prices):
    eff = RETENTION[width]
    return round(sum(CONTRIB_HA_PER_KM * LOAD[k] * eff[k] * prices[k] for k in LOAD) * DELIVERY[pl] / 10) * 10

# ---- Text --------------------------------------------------------------------------------------
def vnum(variant):
    return int(variant.split(".")[0])

REG = {
    "hedge": ("Possible AECS route (rates checked 3 Nov 2026; pages dated 15 Dec 2025): Planting or Replanting of Hedges "
              "(capital GBP5.40/m) with Creation of Hedgerows (GBP1.20/m/yr) or Management or Restoration (GBP0.11/m/yr). "
              "Conditions include a double row of at least 6 plants/m, 60-80% hawthorn, NatureScot native species (beech and "
              "sycamore only by exception), in-bye land linked to habitat, no breeding-wader fields, and trimming 1 Dec-end Feb "
              "but not the same length every year. GAEC 7 applies. Eligibility is not confirmed for any site."),
    "margin": ("Possible AECS route: Water Margins in Arable Fields (page updated 15 Dec 2025): minimum 3 m on small channels, "
               "6 m on wider channels, 12 m at still water; payment only beyond the 2 m strip already required next to "
               "watercourses (GBR 20). Eligibility is not confirmed for any site."),
    "ditch": ("No grant route confirmed. Works in or next to a watercourse may need SEPA authorisation; the 2 m GBR 20 "
              "strip is a baseline requirement, not additional."),
    "shrub": ("No grant route confirmed. FGS woodland creation excludes short-rotation coppice and energy crops "
              "(FGS Woodland Creation page, 6 Oct 2025). Native-only planting applies inside riparian buffers (UKFS)."),
    "wood": ("Possible FGS woodland creation route where the strip meets option rules (page 6 Oct 2025): e.g. Small or Farm "
             "Woodland needs at least 15 m width and 0.25-5 ha blocks, so 12 m strips do not qualify; the Native Broadleaves "
             "minimum width is to be confirmed with Scottish Forestry. UKFS applies. The Woodland Carbon Code applies only to "
             "woodland meeting its own eligibility rules. Eligibility is not confirmed for any site."),
    "agrof": ("Possible FGS Agroforestry route (page 27 Feb 2025): 0.5-15 ha per business, 150-200 or 300-400 trees/ha, "
              "listed species. Not an AECS option. Eligibility is not confirmed for any site."),
}
FAMILY = {1: "margin", 2: "hedge", 3: "hedge", 4: "margin", 5: "margin", 6: "shrub", 7: "ditch", 8: "shrub", 9: "shrub",
          10: "shrub", 11: "ditch", 12: "wood", 13: "wood", 14: "agrof", 15: "agrof", 16: "ditch", 17: "shrub",
          18: "wood", 19: "wood", 20: "wood", 21: "wood", 22: "wood"}
GRANT_NOTE = (" Using a grant may affect ONCRA eligibility (Guidelines 27 Mar 2026 s4.2.1, s8.2.2): a written ONCRA ruling "
              "is needed before grants and carbon units are combined.")
ADDITIONALITY = ("Not assessed. ONCRA financial additionality (Guidelines s8.2.1) and regulatory additionality (s8.2.2), "
                 "including the government-grant clause (s4.2.1), are unresolved for this activity and need a written ONCRA "
                 "ruling. Any biodiversity or water benefit claim needs a measured baseline and verification.")
NONHEDGE_CARBON = ("Carbon profile: unsubstantiated scenario carried over from v9 (Apr 2026). No reproducible derivation or "
                   "source ledger exists. Earlier claims that it follows Woodland Carbon Code curves, includes a 15% "
                   "deduction, or is calibrated by growth degree days could not be verified and are not relied on. "
                   "Shown for comparison only; excluded from carbon value and net units pending reconstruction.")

SENTENCE_SUBS = [  # (regex, replacement) applied to registry and CREW narrative strings
    (r"\s*ONCRA Verified / Nitrate Credit Union eligible\.", ""),
    (r"Safe stand-off from tile drain runs verified at standard 1m spacing\.", "Keep 1 m or more from tile drain runs; check drain layout on site."),
    (r"High Filter: Verified N-uptake via rapid biomass accumulation, extracting leached nitrates directly from the upper groundwater\.",
     "Nitrate uptake: rapid willow growth takes up some leached nitrate; nitrate leaves the site only if cut stems are removed."),
    (r"Nitrate Credits: Direct monetization of nutrient removal\.", "No nitrate credit market exists for this in Scotland; nutrient benefits are shown as indicative avoided damage only."),
    (r"Generates Nitrate Credits via verified N-uptake and denitrification\.", "No nitrate credit market exists for this in Scotland."),
    (r"Generates Nitrate Credits via N/P extraction\.", "No nitrate credit market exists for this in Scotland."),
    (r"Generates Nitrate Credits \(£\)\.", "No nitrate credit market exists for this in Scotland."),
    (r"Generates ONCRA SSER units from combined above-ground, soil carbon, and biochar amendment pathways\.",
     "Carbon: any land-stored carbon claim would cover soil and roots only; harvested wood used for biochar is accounted under a biochar standard, never both."),
    (r"Estimated additional permanence: 0\.5-2\.0 tCO2e/ha/yr via biochar soil pathway\.", "Biochar applied to this land must be kept out of any soil carbon sampling for land-stored carbon."),
    (r"Feature is managed as a permanent nitrate interception buffer\.", "Managed as a long-term nitrate interception buffer."),
    (r"Alder is NOT harvested — permanent canopy maintained for maximum N-fixation\.",
     "Keep alder a minor component (10-20%): it fixes nitrogen and can add nitrate (UKFS riparian woodland guide 2024, p.19)."),
    (r"Deep Lateral N-Fixers: Alder hosts Frankia alni actinobacteria in root nodules throughout the shallow and mid-depth soil profile \(0–60cm\), fixing 40–150 kg atmospheric nitrogen per hectare per year\.",
     "Alder roots host nitrogen-fixing Frankia; fixed nitrogen can raise nitrate leaching (UKFS 2024 p.19), so alder is kept to 10-20% in nitrate-targeted strips."),
    (r"Zone 1 — Deep Lateral N-Fixers: Alder root nodules fix 40–150 kg N/ha/yr via Frankia alni\.",
     "Zone 1: alder roots fix nitrogen, which can raise nitrate; keep alder to 10-20% where nitrate is the target."),
    (r"Alder Frankia N-fixation enriches bund soils\.", "Alder fixes nitrogen; keep it a minor component where nitrate is a concern."),
    (r"Frankia bacteria fixes N\.", "Note: N-fixing species can add nitrate."),
    (r"Maximum purification: Alder Frankia N-fixation cycles atmospheric N, Willow deep roots pump subsurface nitrate\. In NVZ context this is the highest water quality intervention in the database\.",
     "Willow-led planting takes up nitrate; alder adds nitrogen and should be a minor component. Benefit depends on drainage routing."),
    (r"High N-Sink: Deep roots intercept leached nitrates, acting as a permanent, long-term sequestration sponge for field runoff\.",
     "Nitrate interception: roots take up some leached nitrate; effect depends on whether drains bypass the strip."),
    (r"SEPA NFM alignment: modelled peak flow reduction 20–40% at field scale\.", "Peak-flow effects are site-specific and unquantified here."),
    (r"Reduces risk of SEPA enforcement action\.", "Can help meet General Binding Rules on diffuse pollution; it does not replace them."),
    (r"Zone 2 managed under FGS Riparian Woodland covenant — zero intervention except safety pruning\.", "Zone 2 managed with minimal intervention except safety pruning."),
    (r"Zone 1 permanently unmanaged under FGS Riparian Woodland covenant;", "Zone 1 left largely unmanaged;"),
    (r"FGS capital grants and Zone 2 timber income are the primary financial mitigation mechanisms\.", "Grant support and timber income are possible but not confirmed."),
    (r"documented 5–15% improvement in growing season thermal accumulation, equating to 3–7 additional maturation days for winter cereals\.",
     "a possible lee-zone warming effect (unquantified for Fife; scenario only)."),
    (r"Maximum windbreak shelter from full-height Zone 2 canopy: documented 5–15% yield uplift in adjacent arable fields within 20× canopy height of shelter\.",
     "Shelter effects on yield vary: a synthesis of 60 studies found lower yields within about 2 tree heights and small gains further out (Van Vooren et al. 2017)."),
    (r"Peak flow attenuation documented at 10-40% at reach scale for mature riparian woodland \(Riverwoods 2022\)\.", "Peak-flow attenuation is site-specific (Riverwoods for Scotland 2022)."),
    (r"Carbon: fuel substitution credit accrues to energy system \(not land carbon account\)\.", "Carbon: fuel use is a substitution benefit in the energy system, not a land carbon removal."),
]

def fix_text(s):
    for pat, rep in SENTENCE_SUBS:
        s = re.sub(pat, rep, s)
    return re.sub(r"\s{2,}", " ", s).strip()

def walk_fix(o):
    if isinstance(o, dict):
        return {k: walk_fix(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk_fix(v) for v in o]
    if isinstance(o, str):
        return fix_text(o)
    return o

def agronomic_tail(txt):
    i = txt.find("Agronomic Profile:")
    return (" " + txt[i:]) if i >= 0 else ""

def main():
    db = json.loads(SRC.read_text())
    prof = json.loads(PROFILES.read_text())
    hedge_map = {"Dense Wildlife Hedge": prof["Dense Wildlife Hedge"], "Heritage Species Hedge": prof["Heritage Species Hedge"]}
    out = []
    for r0 in db["interventions"]:
        r = walk_fix(copy.deepcopy(r0))
        n = vnum(r["variant"]); name = r["variant"].split(". ", 1)[1]
        reg = r["registry"]
        if name in hedge_map:
            p = hedge_map[name]; g = p["geometry"]
            r["carbonSequestration"] = dict(zip(BANDS, p["bands_tCO2e_per_km"]))
            r["seq50yrTotal"] = p["gross_50yr_tCO2e_per_km"]
            r["carbonSource"] = {"status": "provisional-literature", "model": "hedge_carbon_model.py v2 (3 Nov 2026)",
                                 "crown_m": g["crown_m"], "soc_width_m": g["soc_m"],
                                 "pools_50yr_tCO2e_per_km": p["pools_50yr_tCO2e_per_km"]}
            reg["carbonAgronomicAssumptions"] = (
                f"Carbon profile: provisional lower-end literature estimate (hedge_carbon_model.py v2, 3 Nov 2026). Stocks per km, "
                f"gross vs pre-planting baseline: above-ground biomass from Biffi et al. 2023 Table 3 (t C/ha) over a {g['crown_m']:g} m crown; "
                f"roots at 0.49 x above-ground (Black et al. 2023 via Biffi 2023, lower end for managed hedges); soil surplus 0-50 cm "
                f"accruing at 1.48 t C/ha/yr (Biffi et al. 2022 Table 4) to a 29 t C/ha plateau over a 1.5 m soil strip (Drexler & Don 2024; Biffi et al. 2025). "
                f"Converted to CO2 once (x44/12). Interval removals are differences in stock. No layering uplift. Assumes trimming on a 2-3 year "
                f"rotation as AECS requires. 50-year gross {p['gross_50yr_tCO2e_per_km']} tCO2e/km (biomass {p['pools_50yr_tCO2e_per_km']['AGB']}, roots "
                f"{p['pools_50yr_tCO2e_per_km']['BGB']}, soil {p['pools_50yr_tCO2e_per_km']['SOC']}). If cut for biochar feedstock, the land claim is soil and roots only "
                f"({p['feedstock_scenario_50yr_tCO2e_per_km']} tCO2e/km). Not validated; site soil measurement replaces the soil term." + agronomic_tail(reg.get("carbonAgronomicAssumptions", "")))
            reg["sserGrossUnitsPerKm"] = round(p["gross_50yr_tCO2e_per_km"] * NET_FACTOR, 2)
        else:
            r["carbonSource"] = {"status": "unsubstantiated-scenario", "model": "v9 indicative profile (Apr 2026); no derivation"}
            reg["carbonAgronomicAssumptions"] = NONHEDGE_CARBON + agronomic_tail(reg.get("carbonAgronomicAssumptions", ""))
            reg["sserGrossUnitsPerKm"] = 0.0
        reg["regulatoryAlignment"] = REG[FAMILY[n]] + GRANT_NOTE
        reg["additionality"] = ADDITIONALITY
        # Water: low case in totals, high case kept
        cv = r["crewValuations"]; w = r["width"]
        cv["catchmentHydrology_v10Scenario"] = {k: cv["catchmentHydrology"][k] for k in ("riparian", "crossSlope", "downSlope")}
        cv["airFiltration_v10Scenario"] = {k: cv["airFiltration"][k] for k in ("riparian", "crossSlope", "downSlope")}
        for pl in ("riparian", "crossSlope", "downSlope"):
            lo, hi = water(w, pl, GBP_PER_KG_LOW), water(w, pl, GBP_PER_KG_HIGH)
            cv["waterPurification"][pl] = lo
            cv["waterPurification"][pl + "High"] = hi
            cv["catchmentHydrology"][pl] = 0.0
            cv["airFiltration"][pl] = 0.0
            cv[pl + "Total"] = float(lo)
            cv[pl + "TotalHigh"] = float(hi)
        cv["waterPurification"]["basis"] = ("Indicative avoided pollution damage: assumed loads (10 ha/km; 25 kg N, 0.7 kg P, 200 kg sediment per ha/yr) x "
                                            "retention by width x delivery. Low case uses Defra's sediment value (GBP0.054/kg, IA Defra1819 Table 22, 2014 prices); "
                                            "high case uses CREW CRW2024/04 (GBP0.55/kg). N GBP1.37/kg and P GBP46.61/kg from CREW. Not cash income; site estimate needed.")
        cv["catchmentHydrology"]["basis"] = "Not valued: flood-storage value needs a storage effect and a receptor at risk (CREW pp24-26). v10 scenario kept in catchmentHydrology_v10Scenario."
        cv["airFiltration"]["basis"] = "Not valued: air-quality value needs exposure modelling (CREW Table 11). v10 scenario kept in airFiltration_v10Scenario."
        out.append(r)
    md = db["metadata"]
    md["version"] = "11.0"; md["last_updated"] = "2026-11-03"
    md["units"]["registry.sserGrossUnitsPerKm"] = ("illustrative ONCRA net tonnes per km over 50 years = gross x 0.64 (default 20% GHG deduction and 20% buffer; "
                                                   "0.52 if rated Category 3). Hedges only; 0 where carbon is an unsubstantiated scenario. Field name kept for compatibility; SSER is not an ONCRA unit.")
    md["units"]["carbonSequestration"] = "tCO2e per km, gross, removal in each 5-year interval (difference in stock)"
    md["sources"]["carbon.hedges"] = ("hedge_carbon_model.py v2 (3 Nov 2026): Biffi et al. 2023 Sci Total Environ 892:164482 (AGB, Table 3); Black et al. 2023 Sci Total Environ "
                                      "871:162073 via Biffi 2023 s4.3 (root:shoot 0.49); Biffi et al. 2022 J Environ Manage 307:114484 (SOC, Tables 3-4); Biffi et al. 2025 "
                                      "Agric Ecosyst Environ 382:109471; Drexler & Don 2024 Geoderma 445:116878. Replaces HedgeCarbon.xlsx (unit and derivation errors).")
    md["sources"]["carbon.other"] = "Unsubstantiated v9 scenarios (Apr 2026); excluded from carbon value and net units"
    md["sources"]["waterValues"] = ("3 Nov 2026 (v11): totals use the low case (sediment GBP0.054/kg, Defra IA Defra1819 Table 22); high case (CREW GBP0.55/kg) in *High fields. "
                                    "Flood-storage and air values not counted. Loads, retention and delivery are JUDGEMENT.")
    md["notes"] = md.get("notes", []) + [
        "v11 (3 Nov 2026): corrections following the independent audit of 3 Nov 2026; see docs/audit-tracker-2026-11-03.csv.",
        "Pollination, pest regulation, thermal, windbreak and avoided-cost values are unvalidated scenarios and are excluded from totals in calc.js.",
    ]
    db["interventions"] = out
    OUT.write_text(json.dumps(db, indent=2, ensure_ascii=False))
    print("wrote", OUT, len(out))

if __name__ == "__main__":
    main()
