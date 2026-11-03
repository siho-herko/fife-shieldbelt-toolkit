#!/usr/bin/env python3
"""
Build data/fife_interventions_db_v10.json from v9 (reproducible; re-run after edits).

Changes v9 -> v10 (Si's decisions, 3 Nov 2026; see figures register):
  1. Net income forgone re-sourced: strip area (ha/km = width m / 10)
     x SAC Farm Management Handbook gross margin (Feb 2026 chapter updates)
     x 0.7 headland/edge-yield factor (JUDGEMENT), rounded to GBP 10 per km per year.
     grossIncomeForegone = area x full gross margin (no edge factor), rounded to GBP 10.
  2. Carbon: hedge variants take set 3 per-km profiles (PENDING source file);
     other variants keep v9, labelled indicative.
  3. Top-level metadata block; records under "interventions".
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

def r10(x):
    return float(int(round(x / 10.0)) * 10)

def width_m(w):
    return float(str(w).rstrip("m"))

def main():
    recs = json.loads(SRC.read_text())
    recs = recs if isinstance(recs, list) else recs["interventions"]
    for r in recs:
        ha_per_km = width_m(r["width"]) / 10.0
        for ft, v in r["farmImpacts"].items():
            gm = GM[ft]
            v["grossIncomeForegone"] = r10(ha_per_km * gm)
            v["netIncomeForegone"]   = r10(ha_per_km * gm * EDGE_FACTOR)
    out = {
        "metadata": {
            "version": "10.0",
            "last_updated": datetime.date.today().isoformat(),
            "units": {
                "carbonSequestration": "tCO2e per km, gross, per 5-year period",
                "seq50yrTotal": "tCO2e per km, gross, 50 years",
                "farmImpacts.*IncomeForegone": "GBP per km per year",
            },
            "sources": {
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
