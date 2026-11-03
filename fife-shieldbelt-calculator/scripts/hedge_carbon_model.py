#!/usr/bin/env python3
"""
Hedge carbon model v2 (3 Nov 2026) — replaces the undocumented HedgeCarbon.xlsx derivation.

Pool-by-pool STOCK model. Interval removals are obtained by differencing stocks; nothing is
integrated from mean-since-planting rates. Carbon is carried in t C throughout and converted to
tCO2e once, at output (x 44/12).

Every input below is either VERIFIED from a primary source (page/table given) or a labelled
JUDGEMENT / DESIGN choice. Run:  python3 hedge_carbon_model.py  -> writes hedge-carbon-ledger.csv
and hedge-carbon-profiles.json next to this file.

Not a validated forecast. For screening and for the ONCRA correction note only; site soil
measurements replace the soil term.
"""
import csv, json, os

C_TO_CO2 = 44.0 / 12.0  # single conversion point

# ---------------------------------------------------------------------------
# 1. Above-ground biomass (AGB) stock per ha of hedge ground area
#    VERIFIED: Biffi et al. 2023, Sci Total Environ 892:164482, Table 3 (p.6):
#      3-6 yr 8.34; 12 yr 21.92; 39 yr 33.41; old 40.42 Mg C/ha (95% CI 19.31-47.51 at 39 yr).
#    Ages used by the authors for the classes: 4, 12, 39 yr (Eq. 6, §2.4).
#    Per-ha values = C density (kg C/m3) x measured height (Eq. 4-5), i.e. per ha of hedge
#    footprint at the sampled hedges' own width (mature ~1.9-1.95 m wide x 2.1 m tall, Table 1).
#    Management of sampled hedges: trimmed every 1-2 yr; the 39-yr class laid once at ~20 yr (§2.1).
#    JUDGEMENT: piecewise-linear interpolation between class means; held flat after 39 yr
#    (no extrapolation to the wide-CI 'old' class).
# ---------------------------------------------------------------------------
AGB_POINTS = [(0, 0.0), (4, 8.34), (12, 21.92), (39, 33.41)]

def agb_per_ha(t):
    for (t0, s0), (t1, s1) in zip(AGB_POINTS, AGB_POINTS[1:]):
        if t <= t1:
            return s0 + (s1 - s0) * (t - t0) / (t1 - t0)
    return AGB_POINTS[-1][1]

# ---------------------------------------------------------------------------
# 2. Below-ground biomass (BGB)
#    CITED via Biffi 2023 §4.3 (p.10): Black et al. 2023 BGB:AGB 0.49 for managed hedges
#    (0.28 for less intensively managed); Axe et al. 2017 'close to 1'.
#    JUDGEMENT: 0.49 = lower end for managed hedges (ONCRA LSC v2 §2.1.1(iii) lower end).
# ---------------------------------------------------------------------------
ROOT_SHOOT = 0.49

# ---------------------------------------------------------------------------
# 3. Soil organic carbon (SOC) surplus under the hedge, 0-50 cm ESM, per ha
#    VERIFIED: Biffi et al. 2022, J Environ Manage 307:114484, Table 3 (p.7):
#      field 124.9; 10 yr 142.8; 37 yr 181.3 Mg C/ha  -> surplus 17.9 at 10 yr, 56.4 at 37 yr
#      (approx. 1.5-1.8 t C/ha/yr, near-linear; 2-4 yr class excluded: planting disturbance bias, §2.4.1).
#    VERIFIED (abstracts / pass-1 review): Biffi et al. 2025 AGEE 382:109471: +40.5 (30.6-50.4)
#      t C/ha at 0-50 cm vs grassland, plateau ~20-40 yr; Drexler & Don 2024 Geoderma 445:116878:
#      cropland->hedge +29 +/- 22 Mg C/ha (0-100 cm).
#    JUDGEMENT (lower end): accrue at 1.48 t C/ha/yr (Biffi 2022 Table 4, 37-yr mean rate, which is
#      the lowest of the multi-decade rates and avoids front-loading) and cap at a plateau of
#      29 t C/ha (lowest central estimate across the three primary studies; cropland baseline).
#      Plateau reached at ~19.6 yr, consistent with Biffi 2025's 20-40 yr plateau.
# ---------------------------------------------------------------------------
SOC_RATE = 1.48
SOC_PLATEAU = 29.0

def soc_per_ha(t):
    return min(SOC_PLATEAU, SOC_RATE * t)

# ---------------------------------------------------------------------------
# 4. Geometry (areas per km). DESIGN inputs, kept separate from evidence.
#    crown_m: hedge footprint width that carries the AGB/BGB per-ha stock.
#    soc_m:   width of soil credited with the SOC surplus. JUDGEMENT: 1.5 m, the width both
#             Biffi papers use to convert per ha to per km (2022 §2.3; 2023 §2.3); the edge
#             (grassy margin) gain is excluded at the lower end (Drexler & Don 2024: +22 +/- 22).
#    footprint_m: total land take, for income forgone only (GAEC 7 keeps cultivation, fertiliser
#             and pesticide 2 m from the centre line -> ~4 m).
# ---------------------------------------------------------------------------
HEDGES = {
    "Dense Wildlife Hedge":   {"crown_m": 2.0, "soc_m": 1.5, "footprint_m": 4.0,
                               "note": "2 m crown as in the source workbook (row 20); close to Biffi's mature hedges (1.9-1.95 m)."},
    "Heritage Species Hedge": {"crown_m": 3.0, "soc_m": 1.5, "footprint_m": 4.0,
                               "note": "Workbook profile was 3.6 m; capped at the 3 m strip width. DECISION for Si: 3.6 m needs a >=4 m strip."},
    "Productive Hedge (4.2 m, scenario)": {"crown_m": 4.2, "soc_m": 1.5, "footprint_m": 6.0,
                               "note": "Kettle/Orkie productive-hedge scenario; not a public calculator variant."},
}
YEARS = list(range(0, 51, 5))

def stocks(h, t):
    """t C per km by pool at age t (no harvest)."""
    agb = agb_per_ha(t) * h["crown_m"] / 10.0
    bgb = ROOT_SHOOT * agb
    soc = soc_per_ha(t) * h["soc_m"] / 10.0
    return {"AGB": agb, "BGB": bgb, "SOC": soc}

def run(outdir):
    rows, profiles = [], {}
    for name, h in HEDGES.items():
        bands, prev = [], None
        for t in YEARS:
            s = stocks(h, t)
            tot = sum(s.values())
            row = {"hedge": name, "age_yr": t, **{f"{k}_tC_km": round(v, 4) for k, v in s.items()},
                   "total_tC_km": round(tot, 4), "total_tCO2e_km": round(tot * C_TO_CO2, 3)}
            if prev is not None:
                row["band_removal_tCO2e_km"] = round((tot - prev) * C_TO_CO2, 3)
                bands.append((tot - prev) * C_TO_CO2)
            else:
                row["band_removal_tCO2e_km"] = ""
            # Feedstock-harvest scenario: AGB goes to biochar; LSC claim = SOC + BGB (+0 min standing AGB)
            row["lsc_claim_if_feedstock_tCO2e_km"] = round((s["SOC"] + s["BGB"]) * C_TO_CO2, 3)
            rows.append(row); prev = tot
        s50 = stocks(h, 50)
        profiles[name] = {
            "bands_tCO2e_per_km": [round(b, 2) for b in bands],
            "gross_50yr_tCO2e_per_km": round(sum(bands), 1),
            "pools_50yr_tCO2e_per_km": {k: round(v * C_TO_CO2, 1) for k, v in s50.items()},
            "feedstock_scenario_50yr_tCO2e_per_km": round((s50["SOC"] + s50["BGB"]) * C_TO_CO2, 1),
            "net_illustrative_x0.64": round(sum(bands) * 0.64, 1),
            "net_illustrative_x0.52_cat3": round(sum(bands) * 0.52, 1),
            "geometry": h,
        }
    # Sensitivities for the Dense hedge (50 yr gross, tCO2e/km)
    base = HEDGES["Dense Wildlife Hedge"]
    def total50(agb39=33.41, rs=ROOT_SHOOT, plateau=SOC_PLATEAU, crown=base["crown_m"], socw=base["soc_m"]):
        agb = agb39 * crown / 10; return round((agb * (1 + rs) + plateau * socw / 10) * C_TO_CO2, 1)
    sens = {
        "base": total50(),
        "AGB at 95% CI lower (19.31 t C/ha)": total50(agb39=19.31),
        "root:shoot 0.28 (less intensively managed)": total50(rs=0.28),
        "root:shoot ~1.0 (Axe 2017)": total50(rs=1.0),
        "SOC plateau 40.5 (Biffi 2025 central)": total50(plateau=40.5),
        "SOC width 2.0 m (= crown)": total50(socw=2.0),
        "crown 1.5 m (Biffi per-km convention)": total50(crown=1.5),
    }
    profiles["_sensitivity_dense_50yr_gross_tCO2e_per_km"] = sens
    profiles["_meta"] = {"model": "hedge_carbon_model.py v2", "date": "2026-11-03",
                         "units": "tCO2e per km of hedge; gross = change in stock vs pre-planting baseline (baseline SOC change assumed zero)",
                         "status": "Provisional lower-end literature estimate; not validated; specialist review and site SOC measurement pending"}
    with open(os.path.join(outdir, "hedge-carbon-ledger.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    with open(os.path.join(outdir, "hedge-carbon-profiles.json"), "w") as f:
        json.dump(profiles, f, indent=2)
    return profiles

if __name__ == "__main__":
    p = run(os.path.dirname(os.path.abspath(__file__)))
    for k, v in p.items():
        if not k.startswith("_"):
            print(f"{k}: gross {v['gross_50yr_tCO2e_per_km']} | pools {v['pools_50yr_tCO2e_per_km']} | bands {v['bands_tCO2e_per_km']} | net0.64 {v['net_illustrative_x0.64']} | feedstock {v['feedstock_scenario_50yr_tCO2e_per_km']}")
    print(p["_sensitivity_dense_50yr_gross_tCO2e_per_km"])
