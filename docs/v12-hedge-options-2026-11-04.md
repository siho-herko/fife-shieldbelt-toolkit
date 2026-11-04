> Historical v12–v12.2 implementation note. The funding-pass, contribution pricing and grant-geometry descriptions are superseded by review-fixes-2026-11-04.md.

# v12: hedgerow options and configurator (4 Nov 2026)

Status: committed on `data-refresh-2026-11`; not pushed or deployed. v12.1 changes (below) follow Si's review on 4 Nov 2026.

## What changed

| Area | v11 (3 Nov) | v12 (4 Nov) |
|---|---|---|
| Hedge options | Dense Wildlife Hedge and Heritage Species Hedge, both "3m" | Presets HV1–HV8, all species-rich; HV2 is the default |
| How a hedge is specified | One width | Hedge width (as managed) and strip width (out of production) |
| Calculator | Fixed records | "Customise this hedge" toggles: form, species, trees, strip width, position |
| Hedge income forgone | Flat 0.3 ha/km | Strip width × gross margin × 0.7 (0.3–1.2 ha/km) |
| Water values (all records) | v11 retention table, including nitrate | Stutter et al. 2021 width fits for sediment and total P; nitrate not valued |
| Biodiversity | Not shown | SSE Toolkit v1.0 screening units: hedgerow and margin |
| Grants | Text only | AECS hedge and strip payments shown and counted (v12.1; Grants toggle) |
| Records | 132 (22 per area) | 168 (28 per area) |

## Presets (East Neuk; per km)

| Code | Option | Hedge / strip (m) | Income forgone, cereals (£/yr) | Carbon counted, 50 yr (tCO2e) | Water, cross-slope (£/yr) | SSE HLU (Mod–Good) | AECS strip (£/yr) |
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

- Native (hawthorn-led, three native flowering species) is a calculator option only. It shows its trade-offs: about half the SSE hedgerow units and lower habitat value; it only just meets the AECS minimum of three native flowering species (corrected in v12.2).
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

## v12.1: ONCRA + AECS stack and additionality test (Si, 4 Nov 2026)

Si's direction: the app exists to show the stack between ONCRA and AECS, to inform how the Scottish Government and ONCRA should treat it. Carbon should keep a value even where it is not an ONCRA credit. The focus is on what an additionality test would look like.

- **AECS counted in totals (Grants toggle, default on):**
  - Creation of Hedgerows £1.20/m/yr and Grass Strips or Water Margins £495.62/ha/yr are added to the annual combined value while the 5-year agreement runs.
  - Capital is £5.40/m for hedge planting, plus £5.50/m per side for stock fencing.
  - None applies to the native mix's hedge options or to HV8.
  - With "No grants" selected, AECS is excluded.
- **Carbon value route (toggle):**
  - ONCRA units: gross × 0.64.
  - Value-chain contribution: gross, not a credit.
  - **VERIFIED limit (GHG Protocol LSR Standard v1.1, Box 1.1, Box 5.1, Req 7):** field-edge hedges cannot currently be counted as removals in a scope 3 inventory. A buyer can report them as an intervention (Ch 16), separately from the inventory and its targets. The app says so.
- **Funding stack and additionality test (new results card, hedges only):**
  - Present value over 30 years at 3.5%: establishment cost, income forgone, AECS capital and 5-year annual payments, the funding gap without carbon, carbon, and the gap after carbon. Water value is shown but is not cash.
  - Establishment cost per metre comes from the programme's planting build-up (21 Oct 2026): £10.95 double row, £14.27 triple row, £14.52 productive, plus £0.25 for standard trees.
  - Livestock farm types add stock fencing at £9.15/m per side: one side on a boundary, two elsewhere.
- **Test flags:**
  - financial additionality: grants cover the costs / carbon covers part of the gap / carbon closes the gap;
  - government-grant clause (Guidelines §8.2.2, quoted), triggered whenever grants are used;
  - regulatory additionality (the GBR 2 m strip beside water is baseline);
  - claims (no double counting between ONCRA units and value-chain reporting).
- **Not yet included:** trimming, margin cutting, MRV and registry costs.
- **Example, HV2 on general cropping, 1 km, £70/t, ONCRA, AECS on:**

  | Item | £ (present value) |
  |---|---|
  | Costs | 18,675 |
  | AECS | 11,491 |
  | Gap without carbon | 7,184 |
  | Carbon | 1,559 (22% of the gap; 8% of cost) |

  Without grants, the gap is £18,675 and carbon covers 8%.

**Microsite corrections in the same pass:**

- **West Fife dairy charts:** now use HV1.
- **Pre-existing chart and data mismatches fixed:**
  - East Neuk menu rows, c1b, c1r, c4b and c4r;
  - Howe c1r;
  - East Neuk scenario chart c3b;
  - Forth c6r.
- **Rebuilt with a stated mapping:** the c5r radar, because the old axes could not be traced to the data.
- **Old wording:** remaining "3m hedge" wording updated.
- **HV table:** now shows AECS that could apply, the 30-year funding gap and carbon's share.
- **"Beaver Buffer Wood 20m" (Howe):** relabelled "Willow Bank Buffer 20m", which is the database record its values match.
- **Change log:** trigrammatic-microsites `docs/v12-microsite-changes-2026-11-04.csv`.

**Tests:**

- calc 312, content 200, hedge 112;
- e2e desktop 86 passed, 1 skipped (the pre-existing skip).

## v12.2: aligned to the ONCRA and AECS text (verified 4 Nov 2026)

- **Financial test.** It now follows ONCRA Guidelines §8.2.1 Option B (p.40), which applies when there is revenue other than carbon:
  - compute the IRR without carbon income, and show it is zero, negative or below the cost of capital;
  - run a ±20% sensitivity.

  The app reads a positive 30-year gap without carbon at 3.5% as IRR below 3.5%, and adds the ±20% check. The 3.5% cost of capital is JUDGEMENT.
- **Grants test.** It now quotes §4.2.1 (p.26): projects must not "have the opportunity to make use of government subsidies or grants specifically aimed at the mitigation activity". It also quotes §8.2.2. The "opportunity" point is flagged even when grants are off, and for HV8.
- **AECS hedge planting.** The requirements (VERIFIED, option page and guidance, 15 Dec 2025) are double-staggered rows, 6 plants/m, and at least three native flowering species. 60–80% hawthorn is only a "typical mix".
  - The earlier "native mix is not AECS-compliant" statement was wrong. A three-species native mix meets the minimum, so AECS now applies to it.
  - Whether a triple row qualifies is now flagged for RPID.
- **Tests:** hedge 113. The e2e hedge spec was updated.
- **Source links:** in the review pack (`01_source-links-2026-11-04.md`).
