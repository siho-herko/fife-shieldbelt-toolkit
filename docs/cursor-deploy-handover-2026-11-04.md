# Deployment handover for Cursor: ShieldBelt data refresh (v12.3), 4 Nov 2026

**From:** Si, with Claude. **For:** the Cursor project that manages deployment to trigrammatic.com.
**Status:** everything is committed locally on branch `data-refresh-2026-11` in three repos. Nothing is pushed, merged or deployed. Si has approved deployment once the checks below pass.

## 0. Read first: two things that change how to deploy

1. **The live calculator is serving the pre-audit v9 dataset.** `origin/main` still loads `/data/fife_interventions_db_v9.json` (db.js line 52), and sw.js precaches it. That dataset holds figures and claims withdrawn after the independent audit of 3 Nov 2026. So deploying the refresh is a correction, not just an update; please don't sit on it.
2. **The toolkit refresh branch and `origin/main` have diverged.** Cursor's PRs #2–#8 landed on `origin/main` (problem-first journey, P1/P2, Dreel lens removal, URL snapshot, retitle, `wrangler.jsonc`). The refresh branch was cut from the older local `main` (a22a126). A trial merge (4 Nov, not kept) gives conflicts in 6 files:

| File | Conflict | Resolve as |
|---|---|---|
| `fife-shieldbelt-calculator/app.js` | 7 hunks | Keep **main's** journey, UX and URL-snapshot features. Keep the **refresh branch's** data, wording and calculation features: hedge configurator, funding stack, scenario controls, carbon route, grants toggle, test-phase framing |
| `fife-shieldbelt-calculator/index.html` | 5 hunks | Same rule. Keep every refresh-branch control id (`hedge-config`, `section-stack`, `scenario-*`, `data-carbon-route`, `data-grants`) and the "Planting costs" panel |
| `fife-shieldbelt-calculator/data/problems_v2.json` | 3 hunks | Combine: keep main's mapping of the former Dreel problems to all biomes, and the refresh branch's variant names (HV presets) and corrected copy |
| `fife-shieldbelt-calculator/sw.js` | 1 hunk (precache list) | Use the union of assets: refresh (`scenario.js`, `hedge-config.js`, `/data/fife_interventions_db_v12.json`) plus main (`url-snapshot.js`, `/images/funders/*`). **Drop** `/data/fife_interventions_db_v9.json` |
| `fife-shieldbelt-calculator/package.json` | 1 hunk | Keep main's description and `test:url`. Keep the refresh branch's `test` script, which runs calc, content, hedge and scenario tests; then add `node tests/url-snapshot.test.js` to it |
| `fife-shieldbelt-calculator/fife-shieldbelt-topics.html` | modify/delete | **Delete.** It is an orphaned page with superseded v9-era figures; it was removed on the refresh branch in 587c29d. It is also listed in `.assetsignore` as a backstop |

Auto-merged files to check by eye: `db.js` must fetch `/data/fife_interventions_db_v12.json`. `calc.js`, `styles/main.css`, `_headers`, `tests/*`. `wrangler.toml` is deleted on main, so keep main's `wrangler.jsonc`.

**Cache version:** both branches say `1.8.0`, so returning visitors would keep stale cached files. The refresh branch now sets `version.js` to `1.9.0`. If that conflicts, take `1.9.0` or higher.

The microsites (`trigrammatic-microsites`) and the woodland app (`paws-pwa`) merge as **fast-forwards**: `origin/main` = local `main`, and each is an ancestor of the refresh branch.

## 1. What is in this release

### fife-shieldbelt-toolkit (`data-refresh-2026-11`, 16 commits ahead of local main)

- **v11 (3 Nov):** audit corrections. Rebuilt hedge carbon model, unsupported claims withdrawn, water values rebuilt.
- **v12 / v12.1 / v12.2 (4 Nov):**
  - hedge presets HV1–HV8 and a hedge configurator (form, species, trees, strip width, position);
  - SSE biodiversity units;
  - AECS stack and funding/additionality panel, aligned to ONCRA Guidelines §4.2.1, §8.2.1 and §8.2.2;
  - 168-record dataset `fife_interventions_db_v12.json`.
- **Independent review corrections (ChatGPT, d9f3874) and follow-up (fd6da36):**
  - `scenario.js` with NPV/IRR, scenario controls and the test-phase framing;
  - price slider £0–150;
  - "no IRR" wording.
- **This handover commit (v12.3):**
  - **Planting cost is now a range plus user input:** low / central (default) / high, or a custom £/m; stock fence £/m is adjustable. See `docs/planting-cost-sweep-2026-11-04.md`. Default funding gaps rise by about £5k/km.
  - **Deploy fix:** `.assetsignore` and `_headers`.
  - **Cache version:** bumped to 1.9.0.

### trigrammatic-microsites (`data-refresh-2026-11`, 11 commits ahead)

- **All three pages** (Fife-wide, East Neuk, Dreel Burn): v12 content, the "Hedgerow options" table, chart/data fixes, test-phase notice, and planting-cost wording and gaps regenerated from the calculator.
- **Change logs:** `docs/v12-microsite-changes-2026-11-04.csv`, `docs/review-fixes-2026-11-04.md`.

### paws-pwa (`data-refresh-2026-11`, 6 commits ahead)

- **Audit fixes from 3 Nov:** grants made conditional, verified FGS rates, timber priced in m³ overbark.
- No changes since then.

## 2. Deployment config fix: do not skip

- **The problem:** the calculator Worker publishes its folder with `assets.directory = "./"` (main's `wrangler.jsonc`, Worker `resilience-calculator`, custom domain `resilience-calculator.trigrammatic.com`). That publishes everything in the folder:
  - `tests/`, `scripts/`, `server.tmp.cjs`, `BUILD_LOG.txt`, `package.json`;
  - the superseded datasets `fife_interventions_db_v9.json`, `v10` and `v11`.
- **The fix, on the refresh branch:** `fife-shieldbelt-calculator/.assetsignore` excludes all of those. Workers Static Assets reads `.assetsignore` from the assets directory, so it works with main's `wrangler.jsonc` unchanged.
- **Tested:** with `wrangler dev` (wrangler 4.157.0) on 4 Nov:
  - app files return 200;
  - `/tests/…`, `/scripts/…`, `/server.tmp.cjs`, `/package.json`, `/BUILD_LOG.txt`, the v9–v11 datasets, `/_headers`, `/.assetsignore` and the wrangler config all return 404.
- **`_headers`:** it now uses `! Cache-Control` detach lines and lists the service-worker rule last. As a result:
  - `/sw.js` and `/version.js` → `no-store, no-cache, must-revalidate`;
  - JS → `no-cache`;
  - data → 1 day;
  - CSP, X-Frame-Options and nosniff are applied.

  The old legacy `[site]` config (Workers Sites) ignored `_headers`.
- **`url-snapshot.js` and `images/funders/` (main):** not excluded; keep them served.
- **paws-pwa:** deployed via Cloudflare Pages from the repo root, which also publishes `docs/` (internal registers) and `tests/` (`fixtures/paws_constants_v1.json`, superseded rates). Please set a Pages build output directory, or add a small build step that copies only the app files. This is not a blocker if Si accepts it, but it is the same class of issue.
- **Microsites:** each Worker serves `./public` only, so no change is needed.

## 3. Steps

1. **Gate (Si, not Cursor):** Si sends the ONCRA correction note, or at least a heads-up, before or at go-live. The public pages quote ONCRA §4.2.1 and §8.2.2 and flag an "eligibility risk".
2. **toolkit:**
   - Merge `origin/main` into `data-refresh-2026-11` (or the reverse via a PR) and resolve as in §0.
   - Then, in `fife-shieldbelt-calculator/`:
     - `npm test`: expect calc 312, content 200, hedge 116, scenario 29, and main's url-snapshot test, all passing.
     - `npx playwright test --project=chromium`: before the merge, 92 passed and 1 skipped on desktop. After the merge, update tests where main's journey changed selectors. The 30 mobile-chrome failures pre-date this work and are a known issue.
     - `node scripts/build_v12.mjs`: it must reproduce `data/fife_interventions_db_v12.json` byte for byte.
     - `npx wrangler deploy --dry-run`: check that the asset list contains no `tests/`, `scripts/` or v9–v11 data.
   - Merge to `main`, push, deploy.
3. **microsites:**
   - Fast-forward `main` to `data-refresh-2026-11`, push.
   - `npx wrangler deploy` in each of `resilience-fife`, `resilience-east-neuk` and `resilience-dreel-burn`.
   - Do not hand-edit the HV tables: regenerate with `node fife-shieldbelt-calculator/scripts/update-review-microsites.mjs` from the toolkit. It expects the two repos side by side and is idempotent.
4. **paws-pwa:** fast-forward `main`, push, and deploy via Pages (see §2).
5. **Smoke tests after deploy:**
   - **Calculator:**
     - Loads HV2 by default.
     - The "Customise this hedge" panel and the "Funding Stack and Additionality Test" card render.
     - The "Planting costs" panel shows low £11 / central £16 / high £23 for HV2.
     - No console errors.
     - `/data/fife_interventions_db_v9.json` and `/tests/calc.test.js` return 404.
     - `sw.js` has `Cache-Control: no-store`.
     - A returning browser picks up cache `fife-shieldbelt-1.9.0`.
   - **Microsites:** the test-phase notice shows at the top. The HV table shows HV2's funding gap at £11,870 and carbon covering 13%. No console errors. No horizontal scroll at 390 px on Fife and East Neuk (Dreel's 429 px is pre-existing).
   - **Phone:** check the calculator on a real phone, including the inputs drawer and the configurator buttons.
6. **Rollback:** redeploy the previous `origin/main` commits:
   - toolkit `1c44015`;
   - microsites `6a1ec00`;
   - paws `3597460`.

## 4. Do not

- Don't change figures, sources or wording in the data or the pages. Every number traces to `docs/figures-register.csv`. Raise any change with Si.
- Don't merge `origin/cloudflare/workers-autoconfig`. It creates a different root-level Worker (`fife-shieldbelt-toolkit`).
- Don't commit the untracked root files (`client-apps-handover-2026-11-03.md`, two PNGs). They aren't part of this release; main already has the funder images under `images/funders/`.

## 5. Open items that do not block deployment (shown on the site as open)

- **ONCRA:** rulings on the grant-opportunity and same-outcome clauses (§4.2.1, §8.2.2), and the NDC treatment.
- **RPID:** triple-row hedge payments, hedges inside water margins, and Grass Strips geometry.
- **Field evidence:** measured soil baselines, an ecologist's habitat assessment, contractor quotes (which will replace the planting cost range) and buyer testing.

## 6. Provenance

- **Audit and review:** `docs/audit-tracker-2026-11-03.csv`, `docs/audit-corrections-summary-2026-11-03.md`, `docs/review-fixes-2026-11-04.md`.
- **Hedge options:** `docs/v12-hedge-options-2026-11-04.md`.
- **Source traces:** `docs/provenance-gross-margins-and-margin-soc-2026-11-04.md`, `docs/planting-cost-sweep-2026-11-04.md`.
- **Figures:** `docs/figures-register.csv`, the single register of every public figure.
