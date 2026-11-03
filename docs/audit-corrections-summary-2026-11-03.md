# ShieldBelt audit corrections: summary, before/after and verification (3 Nov 2026)

This responds to `shieldbelt-independent-audit-2026-11-03.md` (50 findings) and the deep-research passes 1–2 and addendum.

- **Status:** all work is on the `data-refresh-2026-11` branches. Nothing has been pushed, deployed or sent.
- **Tracker:** `shieldbelt-action-tracker-2026-11-03-updated.csv`. Each finding records owner, status, resolution, files, evidence, verification and the decision still open.
- **ONCRA correction:** drafted for Si's review in the Claude Doc "ONCRA correction: Fife ShieldBelt methodology (draft for Si)" (https://claude.ai/artifact/JKc5SbjDMLSmzyxoaf1yUj). It is not sent.

## Commits (not pushed)

| Repo | Commit | Scope |
|---|---|---|
| fife-shieldbelt-toolkit | 297a4c8 | Hedge carbon model v2, v11 data, calculator labels and value split, tests |
| trigrammatic-microsites | b879b38, 0b77c74 | Fife, East Neuk and Dreel pages: carbon, water, scenarios, land take, links, copy |
| paws-pwa | f25fd2f | Grants made conditional; fencing, shelter, rhododendron and timber units; optional revenue |

## Status of the 50 findings

| Status | Count |
|---|---|
| Fixed | 27 |
| Partly fixed | 3 |
| Drafted for the ONCRA correction | 12 |
| Accepted | 2 |
| Open | 2 |
| Other | 4 |

The 4 "Other" findings are:

- one partly accepted with a challenge (#39);
- one preserved (#44);
- one fixed in the apps but only drafted for ONCRA (#23);
- one needing no change (#48).

**Challenge, #39.** The AECS option *Planting or Replanting of Hedges* (page dated 15 Dec 2025, checked 3 Nov 2026) does require a double row with at least 6 plants/m. So 6/m is a verified scheme rule for AECS-funded hedges. It is not, however, a blanket rule for every hedge.

**Agreed with the audit.** I agree with every other finding. On #1, our rebuild lands at 52.5 tCO2e/km against the old 53.4. That closeness is a coincidence of offsetting errors, not a validation.

**New point beyond the audit.** CREW's £0.55/kg sediment value is about 10× Defra's £0.054/kg (IA Defra1819, Table 22). Both are now shown, and the totals use the low case.

## Before and after

### Hedge carbon (tCO2e per km over 50 years)

| Hedge | Gross before | Gross after | Illustrative net (×0.64) before | Net after | £/km/yr at £70, before | £/km/yr at £70, after |
|---|---|---|---|---|---|---|
| Dense Wildlife Hedge | 53.4 | 52.5 | 34.2 | 33.6 | 47.85 | 47.04 |
| Heritage Species Hedge | 59.3 | 70.7 | 37.9 | 45.2 | 53.13 | 63.35 |

**Heritage geometry.** The Heritage figure assumes a 3 m crown, the workbook's 3.6 m capped at the strip width. With a 2 m crown it would equal Dense (52.5).

**Productive Hedge (4.2 m, scenario):** 84.5 → 92.6 tCO2e/km.

**Pools at 50 years, Dense hedge (tCO2e/km):**

| Pool | tCO2e/km |
|---|---|
| Above-ground biomass | 24.5 |
| Roots | 12.0 |
| Soil | 15.9 |

**Dense profile by 5-year band, after:** 15.0, 13.3, 9.2, 6.1, 2.3, 2.3, 2.3, 1.9, 0, 0.

**Sensitivity, Dense hedge (tCO2e/km):**

| Case | tCO2e/km |
|---|---|
| Lower 95% CI for above-ground biomass | 37.0 |
| Root:shoot 0.28 | 47.3 |
| Root:shoot 1.0 | 65.0 |
| Soil plateau 40.5 | 58.8 |
| Soil width 2 m | 57.8 |
| Crown 1.5 m | 43.3 |

### Non-hedge carbon

Profiles are unchanged, but they are now labelled unsubstantiated and are not valued. For example, Coastal Erosion Wood (280 tCO2e/km) previously showed about £250/km/yr of carbon value at £70. It now shows "Not estimated".

### Water value (£/km/yr)

| Strip | Before (v10, incl. flood and air) | After: low case | After: high case |
|---|---|---|---|
| 3 m riparian | 704 | 120 | 620 |
| 6 m riparian | 850–1,030 | 200 | 850 |
| 12 m riparian | 1,060–1,420 | 310 | 1,060 |
| 20 m riparian | 1,830 | 390 | 1,240 |
| 3 m cross-slope | 334 | 60 | 310 |

Flood storage and air quality are no longer valued.

### Calculator headline (1 km, General Cropping, cross-slope, £60/t)

| Variant | annualNetBenefit before | After |
|---|---|---|
| Grass Silt Buffer 3 m | £3,119 | −£150 |
| Dense Wildlife Hedge 3 m | £4,848 | −£110 |
| Coastal Erosion Wood 20 m | £4,808 | −£1,180 |

**Why the headline fell:** the old totals were mostly unvalidated windbreak, avoided-cost and pollination values. These are now reported separately as scenarios and are not counted.

### Calculator biome cards and taglines

- The unsourced "£820,000+ /yr potential" figures (and the equivalents for other areas) have been removed.
- The taglines "Pollination premium drives the economics" and "Carbon at near-zero net cost" have been replaced.

### PAWS (4 ha Sitka example)

| Item | Before | After |
|---|---|---|
| Default grants | £13,536 | £0 (conditional toggle: £5,120) |
| Timber, difficulty 1 | £35,000 (at £/t) | £49,238 (£35.17/m³ overbark) |
| Year-15 income | £3,720 | £2,600 (optional scenarios only) |

### Dreel Burn guide links

| | Count |
|---|---|
| Unique external links, before | 74 |
| Returned 404 | 33 |
| Replaced | 28 |
| Removed | 5 |
| Unique external links, after | 63 |

The footer no longer says "all links verified".

## Verification

**fife-shieldbelt-toolkit**

- Unit tests: calc 271/271 and content 200/200.
- New tests cover:
  - per-km vs installed carbon at 0 m, 100 m, 1,000 m and 2,000 m;
  - unsubstantiated-carbon suppression;
  - removal of the claims in all 132 records.
- Playwright desktop e2e: 77 passed, 1 skipped.
- Rendered check:
  - Dense hedge: 25-yr value £2,058 = 45.93 × 0.64 × £70; water £120–620; net 33.6 t.
  - Coastal Erosion Wood: "Not estimated".
  - No JS errors.

**trigrammatic-microsites**

- All three pages render with no JS errors at 1200 px.
- Fife and East Neuk have no horizontal scroll at 390 px. The Dreel page is still 429 px wide at 390 px; this pre-existing issue is still open.
- `wrangler deploy --dry-run` passes for all three.
- A search for the withdrawn phrases finds none left.

**paws-pwa**

- 398/398 tests pass.
- The returning user gets the reseed notice; legacy alias fields stop a cached old app from producing NaN.

**Model**

- `hedge_carbon_model.py` reproduces 52.5, 70.7 and 92.6 on both the cloud workspace and the Mac.
- The ledger is in `docs/hedge-carbon-ledger.csv`.

## Decisions for Si

1. Should the ONCRA correction go now, with the grants question alongside? I recommend yes: it withdraws fabricated material.
2. Heritage hedge crown: 3.0 m (70.7), 2.0 m (52.5), or a 4 m strip?
3. Re-run hedge income forgone at about 4 m (GAEC 7 footprint)? That would make it about a third higher.
4. Sediment value: keep the low case in totals until CREW and Defra are reconciled?
5. Before release: specialist review of the hedge model, ONCRA's ruling on grants, a recheck of the SEPA links (domain move), and your go-ahead to deploy.
