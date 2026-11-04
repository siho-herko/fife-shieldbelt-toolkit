# v12: hedgerow options and configurator (4 Nov 2026)

Status: committed on `data-refresh-2026-11`; not pushed or deployed.

## What changed

| Area | v11 (3 Nov) | v12 (4 Nov) |
|---|---|---|
| Hedge options | Dense Wildlife Hedge and Heritage Species Hedge, both "3m" | Presets HV1–HV8, all species-rich; HV2 is the default |
| How a hedge is specified | One width | Hedge width (as managed) and strip width (out of production) |
| Calculator | Fixed records | "Customise this hedge" toggles: form, species, trees, strip width, position |
| Hedge income forgone | Flat 0.3 ha/km | Strip width × gross margin × 0.7 (0.3–1.2 ha/km) |
| Water values (all records) | v11 retention table, including nitrate | Stutter et al. 2021 width fits for sediment and total P; nitrate not valued |
| Biodiversity | Not shown | SSE Toolkit v1.0 screening units: hedgerow and margin |
| Grants | Text only | Possible AECS strip payment shown per km, never counted |
| Records | 132 (22 per area) | 168 (28 per area) |

## Presets (East Neuk; per km)

| Code | Option | Hedge / strip (m) | Income forgone, cereals (£/yr) | Carbon counted, 50 yr (tCO2e) | Water, cross-slope (£/yr) | SSE HLU (Mod–Good) | AECS strip (£/yr, not counted) |
|---|---|---|---|---|---|---|---|
| HV1 | Fence-line hedge | 2 / 3 | 200 | 52.5 | 130–510 | 6.70–7.82 | 0 |
| HV2 | Hedge and margin (default) | 2 / 6 | 400 | 52.5 | 150–550 | 6.70–7.82 | 149 |
| HV3 | Wide wildlife hedge | 3 / 6 | 400 | 70.7 | 150–550 | 6.70–7.82 | 0 |
| HV4 | Hedge with trees | 2 / 6 | 400 | 52.5 | 150–550 | 9.24–9.70 | 149 |
| HV5 | Hedge and wide margin | 2 / 10 | 670 | 52.5 | 170–580 | 6.70–7.82 | 347 |
| HV6 | Contour hedge (triple row) | 3 / 8 | 530 | 70.7 | 160–570 | 6.70–7.82 | 198 |
| HV7 | Riparian hedge and water margin | 2 / 12 | 800 | 52.5 | 340–1,170 (riparian) | 6.70–7.82 | 396 |
| HV8 | Productive hedge | 4.2 / 8 | 530 | 41.2 (soil and roots; 92.6 gross) | 160–570 | 6.70–7.82 | not used |

## Rules in the configurator

- Native (hawthorn-led, three or fewer species) is a calculator option only. It shows its trade-offs: not AECS-compliant, about half the SSE hedgerow units, lower habitat value.
- Beside a watercourse the hedge is double row only (Cole et al. 2020).
- The productive hedge has its own species list and no standard trees; its land carbon claim is soil and roots only.
- Strips narrower than the hedge plus the GAEC 7 2 m line are disabled.
- Choosing "Beside a watercourse" sets placement to riparian; "In-field contour" sets cross-slope.
- Matching a preset's settings returns that preset (for example HV2 plus trees is HV4). Other settings give a "Custom hedge" with a shareable `hedge=` link.
- Old links `variant=2` and `variant=3` open HV2 and HV3.

## Files

- `fife-shieldbelt-calculator/hedge-config.js`: the engine, used by both the build and the live toggles.
- `scripts/build_v12.mjs`: builds `data/fife_interventions_db_v12.json`.
- `scripts/v12-water-changes-east-neuk.json`: v11 against v12 water values.
- UI: `app.js`, `index.html`, `styles/main.css`.
- Results: `calc.js` (`hedgeSummary`).
- Data loading: `db.js` (v12, 168 records, `getHedgeTemplate`).
- `data/problems_v2.json`: hedge references are now HV2/HV3, and three overclaiming sentences were softened.
- Tests: `tests/hedge.test.js` (new, 100) and `tests/e2e/hedge-config.spec.js` (new, 8).

## Verification

- Unit tests: calc 307/307, content 200/200, hedge 100/100.
- The JS carbon port reproduces the Python ledger (52.5, 70.7, 92.6; claim 41.2).
- Every stored preset equals the live configurator's output in all six areas.
- Playwright desktop e2e: 85 passed, 1 skipped (the pre-existing skip).
- Page renders with no JS errors, and there is no horizontal scroll at 390 px.

## Still open

- **RPID:**
  - Grass Strips geometry and target areas;
  - Water Margins payable width with a hedge in the margin;
  - EFA hedge width.
- **SPEN:** which units the December pilot needs (HLU, BU or both), and which SSE Toolkit version.
- **Ecologist:** whether managed margins can be classed as neutral grassland.
- **ONCRA:** the grants ruling, and a measured margin soil stratum.
- **Specialist review:** the hedge carbon model.
- **Si's go-ahead before deployment.**
