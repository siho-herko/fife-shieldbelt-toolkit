# Review corrections — 4 November 2026

The calculator and three microsites now frame ShieldBelt as a test-phase demonstration, with no current farmer offer or confirmed buyer demand. The £70/full-sales case remains available as an explicit hypothesis. AECS remains included by default as a conditional scenario, as requested.

Implemented changes:

- Replaced the automatic ONCRA Option B pass with NPV, cash flows and an IRR analysis that reports unique, multiple, missing or unresolved rates. Financial, regulatory, common-practice and environmental evidence remain separate; no eligibility decision is inferred.
- Added zero-sales and zero-price cases, sales fees, payment delays and a first-12-vintage forward-sale scenario. Receipts are not presented as contracted income.
- Replaced gross-carbon contribution pricing with an independently entered sponsorship amount in £/km/year. This does not sell verified tonnes or establish scope 3 inventory eligibility.
- Added baseline uncropped width, a marginal productivity factor and baseline habitat. Riparian income forgone excludes at least the statutory 2 m margin. Margin biodiversity gains are withheld where the baseline is unknown or existing habitat needs assessment.
- Added parcel eligibility, targeting, waterbody, triple-row funding, EFA adjustment, actual fence sides, shared boundary and fence-grant assumptions. Triple-row hedge capital and annual payments can be excluded together. The managed-strip minimum is separate from payable area: HV3 now models 2.5 m potentially payable, subject to RPID.
- Added maintenance, project monitoring/verification, initial costs, private benefits and other funding; year-by-year receipts and costs; individual-driver and combined ±20% sensitivity. Zero lifecycle costs remain explicitly uncosted.
- Retained 3.5% as a selectable financial assumption, removed the incorrect current Green Book attribution, and documented Treasury's 3% real first-30-year public-appraisal rate. Appraisal period and storage commitment are distinct.
- Synchronised contour/riparian placement on preset selection, reset and shared-link restoration; incompatible placement buttons are disabled. Boundary flow placement remains selectable.
- Corrected AECS management wording, species-richness caveats, LFA denominators and rounding, and margin-SOC provenance. The 28–50 placeholder stays excluded and is not called demonstrably conservative.
- Regenerated the microsite preset funding tables. In the default cereals example, HV3's gap is about £10,250/km (formerly £10,810); HV7's is about £10,670/km (formerly £13,060). Other assumptions are stated beside the table.
- Completed the Willow Bank Buffer relabelling and removed implied automatic leaky-dam/drought performance. Public pages carry a prominent project-status notice.
- Updated the figures registers and cache version, and added the scenario module to offline assets.

Policy and evidence still open:

ONCRA must decide the grant-opportunity and same-outcome clauses, NDC treatment, and project scope. RPID must confirm relevant parcel layouts and combined payments, particularly triple rows and hedges inside water margins. The project still needs measured baselines, an ecologist's habitat/condition assessment, a coppice/root and lifecycle carbon ledger, costs/quotes and buyer testing. These are research outputs; the app does not fabricate them or mark them approved. Sponsorship reporting needs its own net-impact evidence. The supplied SPBM consultation tool is not interchangeable with SSE HLU/BU.

Scope limits:

Existing water loads, delivery factors and provisional hedge stock assumptions remain labelled scenarios. This patch is not carbon-model validation, regulatory approval, an investment offer or deployment. The unrelated woodland app and previously logged infrastructure issues were not changed.

Reproducibility:

Run `npm test` in the calculator directory. `scripts/build_v12.mjs` rebuilds the 168 records. `scripts/update-review-microsites.mjs` updates the eight preset rows in all three adjacent microsite projects from the current calculator. The browser regression cases cover both prior hedge behaviour and new scenario/placement behaviour. See the implementation handover for recorded verification results.

Verification recorded in this pass: 312 calculation, 200 content, 113 hedge and 28 new scenario checks passed (653 total). Browser regression: 13 desktop cases passed; 3 mobile cases passed, with one desktop-only preset-switch case skipped on mobile. An additional browser smoke check covered mobile control sizing and no script errors. The three microsite tables were checked against regenerated preset values.

## Follow-up after the review (Claude, 4 Nov 2026)

- **Checked:** the reviewer's changes were committed unchanged (d9f3874). Unit tests pass: 312 + 200 + 113 + 28.
- **Discount rate verified:** HM Treasury's Green Book discounting guidance (October 2026) gives a 3.00% standard rate for years 1–30.
- **IRR wording:** when no IRR exists, the stack now says which case applies. Either the cash flows lose money at every discount rate, which is the situation ONCRA's "zero or negative IRR" wording describes, or they are positive at every rate. Before, it only said "no real IRR".
- **Price slider:** Si agreed to keep the reviewer's £0–150 range for an explicit zero-price case. The navigation e2e test was updated to match.
- **Full desktop e2e:** 91 passed, 1 skipped.
  - The reviewer had run only the new specs, so the slider test failure wasn't caught.
  - On mobile, the 30 failures that pre-date this work remain.
- **Sensitivity (no change):** the combined ±20% case and the fixed statutory grant rates are as the reviewer designed them. AECS uncertainty is handled by the eligibility controls, not by ±20%.
