# Provenance: farm-type gross margins and margin soil carbon (4 Nov 2026)

Both items were traced back through the build scripts and the 3 Nov evidence review, then re-checked today against the primary documents. The source tables were opened on fas.scot and thuenen.de on 4 Nov 2026.

## 1. Gross margins used for income forgone

**Source:**

- **Publisher:** SAC Consulting / FAS, *The Farm Management Handbook*.
- **Chapters:** the February 2026 updated chapters, listed under "Updated chapters (February 2026)" at https://www.fas.scot/the-farm-management-handbook/

| Chapter (Feb 2026 update) | Link |
|---|---|
| Arable | https://www.fas.scot/downloads/fmh-february-2026-update-arable/ |
| Dairying | https://www.fas.scot/downloads/fmh-february-2026-update-dairy/ |
| Beef | https://www.fas.scot/downloads/fmh-february-2026-update-beef/ |
| Sheep | https://www.fas.scot/downloads/fmh-february-2026-update-sheep/ |

### Table values (VERIFIED, 4 Nov 2026)

| Enterprise (table, page) | Yield / system | Price | Gross margin |
|---|---|---|---|
| Wheat – Winter, feed (Arable p.7) | average 8.5 t/ha (low 7.0, high 10.0) | £160/t | **£1,140/ha** (low £800, high £1,489) |
| Barley – Spring, feed (Arable p.13) | average 5.5 t/ha (4.0 / 7.5) | £145/t | **£713/ha** (£407 / £1,123) |
| Barley – Winter, feed (Arable p.11) | average 7.5 t/ha (6.0 / 9.0) | £145/t | **£1,007/ha** (£694 / £1,318) |
| Oilseed Rape – Winter (Arable p.21) | average 4.0 t/ha (3.0 / 5.0) | £410/t base + oil bonus | **£1,094/ha** (£684 / £1,504) |
| Dairy Cow – Moderate Input (Dairying p.12) | 7,000 L | — | £1,490/cow; **£3,633/forage ha** |
| Hill Suckler Cows, spring calving (Beef pp.8–9) | 0.28 ha silage/aftermath + >0.6 ha rough grazing (>0.88 ha/cow) | — | **£467/cow** (no £/ha given) |
| Hill Suckler Cows, autumn calving (Beef pp.8–9) | 0.375 ha + >0.5 ha (>0.875 ha/cow) | — | **£624/cow** (no £/ha given) |
| Improved Hill ewes, 120% lambing (Sheep p.11) | — | — | £7,306 per 100 ewes; **£812/forage ha** |

### Calculation (from `scripts/build_v10.py`; carried into `hedge-config.js` GROSS_MARGIN)

| Farm type | Formula | Result (£/ha) | Label |
|---|---|---|---|
| Cereals | (1,140 + 713 + 1,007) ÷ 3 | **953.33** | VERIFIED inputs; unweighted mean = JUDGEMENT |
| General Cropping | (1,140 + 713 + 1,007 + 1,094) ÷ 4 | **988.50** | VERIFIED inputs; JUDGEMENT. Excludes potatoes and vegetables (the Feb 2026 update has no potato table), so probably understated for East Neuk and Howe cropping |
| Dairy | Moderate Input 7,000 L, per forage ha | **3,633** | VERIFIED; choice of system = JUDGEMENT. The other dairy tables give £2,895 (spring block), £2,536 (moderate/high) and £6,124 (high output) |
| LFA Grazing | (467 ÷ 0.88 + 624 ÷ 0.875 + 812) ÷ 3 = 685.2748918 (no intermediate rounding) | **685.27** | DERIVED; weak composite |

**Caveats on the LFA figure:**

- The two beef per-hectare figures are upper bounds: the handbook gives the areas as minima (">").
- The handbook's own area rows are inconsistent.
- It averages beef and sheep systems with different land denominators. Sheep p.10 note 4 states that supporting hill grazing is not costed; £812/forage ha is not a whole-land-area margin. Dairy is also per forage hectare.
- The beef gross margins include support income; losing a small strip does not necessarily reduce the payment or herd. Use marginal stocking/forage effects for a real decision.
- The former £685.30 used intermediate rounding. £685.27 is the unrounded-formula result to two decimals; this does not resolve the denominator weakness.

**Then:**

- **Income forgone** = incremental cropped area (ha/km) × gross margin × selected marginal-productivity factor (default 0.7). The app now subtracts existing uncropped width; a minimum 2 m statutory water margin is baseline for riparian hedges.
  - The 0.7 edge factor is JUDGEMENT, adopted by Si on 3 Nov 2026.
  - Results are rounded to £10. Gross income forgone (before the 0.7 factor) is also stored.
- **Weaknesses to flag:**
  - Unweighted means rather than a Fife rotation.
  - Average-yield (not low-yield) margins for field edges.
  - The 0.7 factor is unsourced.
  - A dairy margin applied per forage hectare.
- **Better alternatives for the review to consider:**
  - a rotation-weighted margin from Fife June Census crop shares;
  - low-yield margins for headland strips;
  - the FMH land-rent figure that CREW recommends for natural capital accounting.

## 2. Margin soil carbon (28–50 tCO2e/ha over 50 years)

**This is not a sourced derivation.** The code's "CITED Poeplau et al. 2011" label overstated it. The trace:

1. **The 28 tCO2e/ha/50 yr low end** is the grass-strip soil carbon value in the April 2026 v9 intervention dataset ("Grass strip SOC 28 tCO2e/ha / 50 yr"). That dataset was AI-assisted, and no source was recorded for this value.
2. **The 50 tCO2e/ha central value** comes from evidence review pass 2 (3 Nov 2026), table row B6: "~50 (28–70) tCO2e/ha … Cropland→grassland … Poeplau et al. 2011 GCB 17:2415–2427 … CITED (abstract)".
   - That review reasoned: "28 tCO2e/ha over 50 years equal about 7.6 t C/ha. This is below a Poeplau-type +25–30% gain on a typical arable topsoil stock, so it is conservative."
   - It never stated the arable stock assumed.
   - It took Poeplau's "+28% (128 ± 23%) after 100 years" from a search snippet; the paper was not opened.
   - Today I could not confirm that figure: the DOI page failed, and the EGU 2011 abstract gives no cropland-to-grassland number.
3. **`hedge-config.js` combined them** as "lower to central".

### What the primary evidence in the pack says (VERIFIED, 4 Nov 2026)

- **Drexler & Don 2024**, *Geoderma* 445:116878 (open access; 23 German sites).
  - The grassy hedgerow edge held "22 ± 22 Mg C ha−1 (28 ± 30 %)" more SOC than the reference cropland, at 0–100 cm. The hedges' mean age was 60 years (median 35, range 15 to over 200).
  - Converted: 22 × 44/12 ≈ **81 tCO2e/ha** mean cross-sectional stock contrast. The ±22 is **standard deviation**, not a confidence bound. Multiplying by 50/60 gives ≈67 arithmetically, but mean hedge age is not an accumulation curve and this is not a validated 50-year forecast.
  - The paper gives no 0–30 cm edge value. For the hedge itself it gives 0.42 ± 0.32 Mg C/ha/yr at 0–30 cm.
- **Van Vooren et al. 2017** (in the pack; abstract VERIFIED): grass strips held **+37% SOC in the top 30 cm** relative to arable land. Strip ages varied, and no stock is given, so a site baseline is needed to convert this to t/ha.

### Conclusion and recommendation (JUDGEMENT)

- 28–50 tCO2e/ha over 50 years is an excluded placeholder. It is below the study’s mean stock contrast, but the evidence does **not** establish that it is conservative or validate its time trajectory.
- It stays **not counted**, as now. The app label is corrected to "JUDGEMENT placeholder" with the Drexler & Don cross-check (review correction applied).
- **Before any figure is counted:**
  - establish a compatible baseline, depth, time model, uncertainty treatment and site transferability. Selecting a lower number from Drexler & Don or obtaining Poeplau does not by itself establish additional removals;
  - in any case, measure it: a margin soil stratum in the ONCRA design, with a baseline before planting, bulk density, and equivalent soil mass.
