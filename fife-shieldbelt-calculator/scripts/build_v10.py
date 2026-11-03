#!/usr/bin/env python3
"""
Build data/fife_interventions_db_v10.json from v9 (reproducible; re-run after edits).

Changes v9 -> v10 (Si's decisions, 3 Nov 2026; see figures register):
  1. Net income forgone re-sourced: strip area (ha/km = width m / 10)
     x SAC Farm Management Handbook gross margin (Feb 2026 chapter updates)
     x 0.7 headland/edge-yield factor (JUDGEMENT), rounded to GBP 10 per km per year.
     grossIncomeForegone = area x full gross margin (no edge factor), rounded to GBP 10.
  2. Carbon: the two 3 m hedge variants take the set 3/4 hedge model
     (HedgeCarbon.xlsx / Hedgerow Carbon Sequestration.xlsx, ShieldBelt folder, Mar-Apr 2026):
     per-ha annual rates x 0.3 ha/km x 5 years per band (gross, biomass + soil).
     Other variants keep v9 values, labelled indicative.
  3. registry.sserGrossUnitsPerKm is redefined as estimated ONCRA net units per km
     over 50 years = seq50yrTotal x 0.64 ("SSER" is not an ONCRA unit).
  4. Legacy carbon-standard wording (WCS baseline, HCC baseline, 15% buffer) replaced.
  5. Top-level metadata block; records under "interventions".
"""
import json, pathlib, datetime

HERE = pathlib.Path(__file__).resolve().parent.parent
SRC  = HERE / "data" / "fife_interventions_db_v9.json"
DST  = HERE / "data" / "fife_interventions_db_v10.json"

EDGE_FACTOR = 0.7  # JUDGEMENT (Si confirmed method 3 Nov 2026)

# GBP per ha per year, mid-yield gross margins. CITED: SAC Consulting / FAS,
# The Farm Management Handbook, February 2026 chapter updates (fas.scot).
GM = {
    # Arable update: winter wheat 1,140; spring barley 713; winter barley 1,007 (feed prices)
    "Cereals": (1140 + 713 + 1007) / 3,
    # Combinable rotation incl. winter oilseed rape 1,094. Potatoes/vegetables NOT included
    # (no 2026 potato margin published in the updates) -> likely understated for general cropping.
    "General Cropping": (1140 + 713 + 1007 + 1094) / 4,
    # Dairy update: moderate input 7,000 L herd, GBP 3,633 per forage ha
    "Dairy": 3633,
    # Beef + sheep updates: hill suckler spring ~531 and autumn ~713 per forage ha
    # (derived from GM/cow / forage area, upper bounds); Improved Hill ewes 120% GBP 812
    "LFA Grazing": (531 + 713 + 812) / 3,
}

ONCRA_NET_FACTOR = 0.64  # LSC Protocol v2 s2.1.6; Guidelines (Mar 2026) s5.6

# Set 3/4 hedge model, "Total Carbon" rows, tCO2e per ha per YEAR for bands
# 1-5, 6-10, 11-15, 16-20, 21-25, 26-30, 31-40, 41-50 (HedgeCarbon.xlsx rows 20 and 23).
# Si's decision 3 Nov 2026: per-ha rate x 3 m strip footprint (0.3 ha/km).
HEDGE_PROFILES = {
    # Triennial trimming, 2.8 m high x 2 m wide, layering at year 15 (178.0 tCO2e/ha over 50 yr)
    "Dense Wildlife Hedge": [6.345217391304347, 5.539565217391304, 2.990173913043478,
                             5.083217391304347, 5.297565217391304, 2.264173913043478,
                             2.022173913043478, 2.022173913043478],
    # Triennial trimming, 3.6 m high x 3.6 m wide (triple row), layering at year 15 (197.6 tCO2e/ha);
    # height matches the record's "Managed height ~3.6m" (HedgeCarbon.xlsx row 23)
    "Heritage Species Hedge": [7.071646309493756, 6.325081655242052, 3.1396305804221605,
                               5.809646309493756, 6.083081655242053, 2.4136305804221605,
                               2.1716305804221605, 2.1716305804221605],
}
BANDS = ["yr_1_5", "yr_6_10", "yr_11_15", "yr_16_20", "yr_21_25",
         "yr_26_30", "yr_31_35", "yr_36_40", "yr_41_45", "yr_46_50"]

HEDGE_CARBON_TEXT = (
    "Carbon profile: hedge model (set 3/4, Mar-Apr 2026) for triennial trimming with layering at year 15; "
    "biomass plus soil carbon, gross, per-hectare rate applied to the 3 m strip (0.3 ha/km). "
    "Cross-checked against Drexler et al. (2021) and Axe et al. (2017); sources still to be documented. "
    "Indicative, not validated by ONCRA; ONCRA deductions (20% GHG default, 20% buffer) are applied in the calculator."
)

TEXT_SUBS = [
    ("Mandatory 15% WCC/WCS permanence buffer deducted.",
     "This indicative profile already includes a 15% deduction from an earlier method; the calculator's ONCRA deductions (20% GHG default, 20% buffer) come on top, so figures are conservative."),
    ("Mandatory 15% permanence buffer deducted.",
     "This indicative profile already includes a 15% deduction from an earlier method; the calculator's ONCRA deductions (20% GHG default, 20% buffer) come on top, so figures are conservative."),
    ("Wilder Carbon Standard (WCS) soil baseline.", "Indicative soil carbon profile, not yet validated by ONCRA."),
    ("uses WCS SOC accumulation profile", "uses an indicative soil carbon accumulation profile"),
    ("uses WCS SOC accumulation at", "uses an indicative soil carbon accumulation rate of"),
    ("Hedgerow Carbon Code baseline.", ""),
]

def hedge_key(variant):
    for k in HEDGE_PROFILES:
        if variant.endswith(k):
            return k
    return None

def r10(x):
    return float(int(round(x / 10.0)) * 10)

def width_m(w):
    return float(str(w).rstrip("m"))

def main():
    recs = json.loads(SRC.read_text())
    recs = recs if isinstance(recs, list) else recs["interventions"]
    for r in recs:
        ha_per_km = width_m(r["width"]) / 10.0
        # --- carbon ---
        hk = hedge_key(r["variant"])
        reg = r["registry"]
        text = reg.get("carbonAgronomicAssumptions", "")
        for old, new in TEXT_SUBS:
            text = text.replace(old, new)
        if hk:
            rates = HEDGE_PROFILES[hk]
            per_band = rates[:6] + [rates[6], rates[6], rates[7], rates[7]]
            r["carbonSequestration"] = {b: round(v * ha_per_km * 5, 2) for b, v in zip(BANDS, per_band)}
            r["seq50yrTotal"] = round(sum(r["carbonSequestration"].values()), 1)
            r["carbonSource"] = "set3-hedge-model"
            # drop the legacy carbon sentences and lead with the new basis
            kept = [t.strip().rstrip(".") for t in text.split(". ")
                    if t.strip() and not any(w in t for w in ("Rapid", "Step-wave", "15%", "deduction", "carbon"))]
            text = HEDGE_CARBON_TEXT + (" " + ". ".join(kept) + "." if kept else "")
        else:
            r["carbonSource"] = "v9-indicative"
        reg["carbonAgronomicAssumptions"] = " ".join(text.split())
        reg["sserGrossUnitsPerKm"] = round(r["seq50yrTotal"] * ONCRA_NET_FACTOR, 2)
        # --- income forgone ---
        for ft, v in r["farmImpacts"].items():
            gm = GM[ft]
            v["grossIncomeForegone"] = r10(ha_per_km * gm)
            v["netIncomeForegone"]   = r10(ha_per_km * gm * EDGE_FACTOR)
    out = {
        "metadata": {
            "version": "10.0",
            "last_updated": datetime.date.today().isoformat(),
            "units": {
                "registry.sserGrossUnitsPerKm": "estimated ONCRA net units per km over 50 years = seq50yrTotal x 0.64 (field name kept for compatibility)",
                "carbonSequestration": "tCO2e per km, gross, per 5-year period",
                "seq50yrTotal": "tCO2e per km, gross, 50 years",
                "farmImpacts.*IncomeForegone": "GBP per km per year",
            },
            "sources": {
                "carbon.hedges": "Hedge model set 3/4 (HedgeCarbon.xlsx, Hedgerow Carbon Sequestration.xlsx, Mar-Apr 2026), per-ha x 0.3 ha/km; cross-checked with Drexler, Gensior & Don (2021) Reg Environ Change 21:74 and Axe, Grange & Conway (2017) Agric Ecosyst Environ doi:10.1016/j.agee.2017.08.008",
                "carbon.other": "v9 indicative profiles (Apr 2026); not validated by ONCRA",
                "incomeForegone": "SAC Consulting / FAS, The Farm Management Handbook, Feb 2026 updates (arable, dairy, beef, sheep); x0.7 edge factor (judgement)",
                "carbonNetFactor": "ONCRA LSC Protocol v2 s2.1.6; Guidelines (Mar 2026) s5.6: 0.8 x 0.8 = 0.64 (applied in calc.js)",
            },
            "notes": [
                "Indicative screening estimates; not financial, legal or agronomic advice.",
                "General Cropping margin excludes potatoes and vegetables, so income forgone is likely understated.",
            ],
        },
        "interventions": recs,
    }
    DST.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {DST.name}: {len(recs)} records")

if __name__ == "__main__":
    main()
