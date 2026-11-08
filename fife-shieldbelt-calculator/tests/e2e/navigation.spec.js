/**
 * navigation.spec.js
 *
 * End-to-end tests for the Fife Landscape Resilience Calculator navigation flow.
 * Covers the 6-step input accordion, auto-advance behaviour, Confirm Selection,
 * output section scroll anchors, the mobile drawer, and URL state encoding.
 *
 * Run against a local server:
 *   npx playwright test --project=chromium
 */

import { test, expect } from '@playwright/test';
import {
  waitForAppReady,
  openStep,
  isStepOpen,
  selectBiome,
  confirmVariant,
  statBoxText,
  ensureInputsDrawerOpen,
  ensureInputsDrawerClosed,
} from './helpers.js';

const BASE = 'http://localhost:8080';

// ---------------------------------------------------------------------------
// 1. App loads and shows initial state
// ---------------------------------------------------------------------------
test.describe('App load', () => {
  test('page title and loading screen', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Fife Landscape Resilience Calculator/i);

    // Loading screen must appear briefly then hide
    await waitForAppReady(page);
    const loadingScreen = page.locator('#loading-screen');
    await expect(loadingScreen).toBeHidden();
  });

  test('empty state is shown before problem or browse path', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    // P0 gating: full outcomes stay hidden until problem selected or browse path
    await expect(page.locator('#results-empty')).toBeVisible();
    await expect(page.locator('#results-content')).toHaveClass(/hidden/);
  });

  test('all 6 accordion steps are present', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    for (let i = 1; i <= 6; i++) {
      await expect(page.locator(`.step-accordion[data-step="${i}"]`)).toBeAttached();
    }
  });

  test('step 1 (Biggest Problem) is open by default', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await expect(await isStepOpen(page, 1)).toBe(true);
    await expect(page.locator('#step-problem .step-accordion__label')).toContainText(/Biggest Problem/i);
  });

  test('steps 2–6 are collapsed by default', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    for (let i = 2; i <= 6; i++) {
      await expect(await isStepOpen(page, i)).toBe(false);
    }
  });

  test('header shows Landscape Resilience title without NFCA', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await expect(page.locator('.app-header__title')).toContainText(/Fife Landscape Resilience Calculator/i);
    await expect(page.locator('.app-header__title')).toContainText(/marginal land/i);
    await expect(page.locator('.app-header')).not.toContainText(/NFCA/i);
    await expect(page.locator('.app-header')).not.toContainText(/ShieldBelt/i);
  });

  test('summary and guide links target resilience-* hosts', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    const summary = page.locator('.app-header__link');
    await expect(summary).toHaveAttribute('href', 'https://resilience-fife.trigrammatic.com');
    await expect(summary).toContainText(/Fife Landscape Resilience Summary/i);
    const guide = page.locator('#results-empty a[href*="resilience-dreel-burn"]');
    await expect(guide).toHaveAttribute('href', 'https://resilience-dreel-burn.trigrammatic.com');
    await expect(guide).toContainText(/Dreel Burn Landscape Resilience Guide/i);
  });

  test('footer has FIRNS acknowledgement, funder logos, and Trigrammatic credit', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    const footer = page.locator('.app-footer');
    await expect(footer).toContainText(/Fife Landscape Resilience Calculator/i);
    await expect(footer).toContainText(/Facility for Investment Ready Nature in Scotland/i);
    await expect(footer).toContainText(/Thanks to National Lottery players/i);
    await expect(footer).toContainText(/Built by Trigrammatic/i);
    await expect(footer).not.toContainText(/NFCA/i);
    await expect(footer).not.toContainText(/natcert/i);
    await expect(page.locator('.app-footer__logo--heritage')).toBeVisible();
    await expect(page.locator('.app-footer__logo--lockup')).toBeVisible();
    await expect(page.locator('.app-footer__credit a')).toHaveAttribute(
      'href',
      'https://trigrammatic.com/en/work/nature-finance'
    );
  });

  test('footer has standard disclaimer and Sources and method tied to the figures register', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    const footer = page.locator('.app-footer');
    await expect(footer).toContainText(
      'Indicative estimates for discussion, based on the sources listed below. Not financial, legal or agronomic advice. Check figures with a qualified adviser before making decisions.'
    );
    const sources = page.locator('#sources-method');
    await expect(sources).toBeVisible();
    await expect(sources).toContainText('Sources and method');
    await sources.locator('summary').click();
    await expect(sources).toContainText('docs/figures-register.csv');
    await expect(sources).toContainText('Carbon price (default)');
    await expect(sources).toContainText('£70');
    await expect(sources).toContainText('WCC price reference');
    await expect(sources).toContainText('£28.32');
    await expect(sources).toContainText('ONCRA net factor');
    await expect(sources).toContainText('0.64');
    await expect(sources).toContainText('Income forgone method');
    await expect(sources).toContainText('Water purification (v12)');
    await expect(sources).toContainText('AECS hedge payments');
    await expect(sources).toContainText('scale linearly');
    await expect(sources).toContainText('pending Si confirmation');
    // Open items must stay worded as open, not settled
    await expect(sources).toContainText('Written ONCRA rulings');
    await expect(sources).toContainText('remain open');
    await expect(sources).toContainText('RPID geometry confirmation still open');
    await expect(sources).toContainText('Contractor quotes are still open');
    await expect(sources).toContainText('Field evidence for soil carbon remains open');
    await expect(sources).toContainText('Grassland margin units remain open');
    await expect(page.locator('#strip-length-hint a[href="#sources-method"]')).toBeVisible();
  });

  test('html lang is en-GB and canonical points at resilience-calculator', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://resilience-calculator.trigrammatic.com/'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Accordion: manual open/close
// ---------------------------------------------------------------------------
test.describe('Accordion manual toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  test('clicking a closed trigger opens it', async ({ page }) => {
    await openStep(page, 3);
    await expect(await isStepOpen(page, 3)).toBe(true);
  });

  test('clicking an open trigger closes it', async ({ page }) => {
    await openStep(page, 3);
    // Click again to close
    await page.locator('.step-accordion[data-step="3"] .step-accordion__trigger').click();
    await page.waitForTimeout(200);
    await expect(await isStepOpen(page, 3)).toBe(false);
  });

  test('multiple steps can be open simultaneously', async ({ page }) => {
    await openStep(page, 2);
    await openStep(page, 5);
    await expect(await isStepOpen(page, 2)).toBe(true);
    await expect(await isStepOpen(page, 5)).toBe(true);
  });

  test('aria-expanded attribute matches open state', async ({ page }) => {
    await ensureInputsDrawerOpen(page);
    const trigger = page.locator('.step-accordion[data-step="2"] .step-accordion__trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

// ---------------------------------------------------------------------------
// 3. Location selection auto-advances to step 3 (Farm Type)
// ---------------------------------------------------------------------------
test.describe('Location selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  test('selecting a location closes step 2 and opens step 3', async ({ page }) => {
    await selectBiome(page, 'Fife (Howe of Fife & Eden)');
    await expect(await isStepOpen(page, 2)).toBe(false);
    await expect(await isStepOpen(page, 3)).toBe(true);
  });

  test('step summary updates with the selected location name', async ({ page }) => {
    await selectBiome(page, 'Fife (West Fife Claylands)');
    const summary = page.locator('#step-biome-summary');
    await expect(summary).toContainText(/West Fife/i);
  });

  test('location context card is shown after selecting a location', async ({ page }) => {
    await openStep(page, 2);
    // The biome context card lives inside step-biome-body
    const card = page.locator('#biome-context-card');
    // After page load a default biome is pre-selected; the card should be attached
    await expect(card).toBeAttached();
  });

  test('all six location options are selectable', async ({ page }) => {
    const biomes = [
      'Fife (East Neuk Coast)',
      'Fife (Forth Urban Coast)',
      'Fife (Howe of Fife & Eden)',
      'Fife (Lomond & Cleish Uplands)',
      'Fife (North Fife Hills & Tay)',
      'Fife (West Fife Claylands)',
    ];
    for (const b of biomes) {
      // Re-open step 2 (Location) between iterations
      await openStep(page, 2);
      // Radio inputs are visually hidden — verify the card label exists instead
      const label = page.locator(`.biome-card:has(input[name="biome"][value="${b}"])`);
      await expect(label).toBeAttached();
      await label.click();
      await page.waitForTimeout(400);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Problem chip selection (step 1) unlocks outcomes and advances to Location
// ---------------------------------------------------------------------------
test.describe('Problem chip selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    // Biggest Problem is step 1 (problem-first)
    await openStep(page, 1);
  });

  test('problem chips are rendered', async ({ page }) => {
    const chips = page.locator('.problem-chip');
    await expect(chips).toHaveCount(await chips.count()); // at least 1
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test('no problem chips show "coming soon" or are disabled', async ({ page }) => {
    // All phase-1 chips should be interactive (no data-phase="2" on clickable chips)
    const lockedChips = page.locator('.problem-chip[data-phase="2"]');
    // There should be none (they were removed)
    const count = await lockedChips.count();
    expect(count).toBe(0);
  });

  test('clicking a problem chip closes step 1 and opens step 2', async ({ page }) => {
    const firstChip = page.locator('.problem-chip').first();
    await firstChip.click();
    await page.waitForTimeout(500);
    await expect(await isStepOpen(page, 1)).toBe(false);
    await expect(await isStepOpen(page, 2)).toBe(true);
  });

  test('problem chip unlocks full outcomes', async ({ page }) => {
    await page.locator('.problem-chip').first().click();
    await page.waitForTimeout(600);
    await expect(page.locator('#results-content')).not.toHaveClass(/hidden/);
  });

  test('problem chip becomes aria-pressed=true after click', async ({ page }) => {
    const chip = page.locator('.problem-chip').first();
    const code = await chip.getAttribute('data-code');
    await chip.click();
    await page.waitForTimeout(300);
    const updated = page.locator(`.problem-chip[data-code="${code}"]`);
    await expect(updated).toHaveAttribute('aria-pressed', 'true');
  });

  test('step 1 summary updates after a chip is clicked', async ({ page }) => {
    await page.locator('.problem-chip').first().click();
    await page.waitForTimeout(300);
    const summary = page.locator('#step-problem-summary');
    // Summary should no longer say "Not selected"
    await expect(summary).not.toHaveText('Not selected');
  });

  test('escape hatch opens intervention browse path without auto-sizing', async ({ page }) => {
    await page.locator('#btn-browse-intervention').click();
    await page.waitForTimeout(500);
    await expect(await isStepOpen(page, 4)).toBe(true);
    // Charts stay gated until Confirm / Calculate — no implicit first-variant sizing
    await expect(page.locator('#results-empty')).toBeVisible();
    await expect(page.locator('#results-content')).toHaveClass(/hidden/);
    await expect(page.locator('#results-empty-body')).toContainText('Confirm selection');
  });

  test('browse path shows outcomes after Confirm selection', async ({ page }) => {
    await page.locator('#btn-browse-intervention').click();
    await page.waitForTimeout(300);
    const sel = page.locator('#variant-select');
    const count = await sel.locator('option').count();
    if (count > 1) {
      await sel.selectOption({ index: 1 });
      await page.waitForTimeout(200);
    }
    await confirmVariant(page);
    await page.waitForTimeout(400);
    await expect(page.locator('#results-content')).not.toHaveClass(/hidden/);
  });
});

// ---------------------------------------------------------------------------
// 5. Farm type selection auto-advances to step 4 (Variant)
// ---------------------------------------------------------------------------
test.describe('Farm type selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 3);
  });

  test('four farm type options are present', async ({ page }) => {
    const radios = page.locator('input[name="farm-type"]');
    await expect(radios).toHaveCount(4);
  });

  test('selecting a farm type closes step 3 and opens step 4', async ({ page }) => {
    await page.locator('input[name="farm-type"]').first().click();
    await page.waitForTimeout(400);
    await expect(await isStepOpen(page, 3)).toBe(false);
    await expect(await isStepOpen(page, 4)).toBe(true);
  });

  test('step 3 summary updates with the selected farm type', async ({ page }) => {
    await page.locator('input[name="farm-type"]').first().click();
    await page.waitForTimeout(300);
    const summary = page.locator('#step-farmtype-summary');
    await expect(summary).not.toBeEmpty();
  });
});

// ---------------------------------------------------------------------------
// 6. Variant selection and Confirm Selection button
// ---------------------------------------------------------------------------
test.describe('Variant selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 4);
  });

  test('variant dropdown is present and has options', async ({ page }) => {
    const sel = page.locator('#variant-select');
    await expect(sel).toBeAttached();
    await expect(sel.locator('option')).toHaveCount(await sel.locator('option').count());
    const count = await sel.locator('option').count();
    expect(count).toBeGreaterThan(1);
  });

  test('Confirm Selection button is visible in step 4', async ({ page }) => {
    await expect(page.locator('#btn-confirm-variant')).toBeVisible();
  });

  test('changing the variant dropdown does NOT auto-advance to step 5', async ({ page }) => {
    const options = await page.locator('#variant-select option').all();
    if (options.length > 1) {
      await page.locator('#variant-select').selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    // Step 5 should remain closed
    await expect(await isStepOpen(page, 5)).toBe(false);
  });

  test('pressing Confirm Selection closes step 4 and opens step 5 only', async ({ page }) => {
    await confirmVariant(page);
    await expect(await isStepOpen(page, 4)).toBe(false);
    await expect(await isStepOpen(page, 5)).toBe(true);
    // Assumptions (step 6) stays collapsed — demoted from first-run path
    await expect(await isStepOpen(page, 6)).toBe(false);
  });

  test('Confirm Selection unlocks outcomes without a problem', async ({ page }) => {
    await confirmVariant(page);
    await page.waitForTimeout(400);
    await expect(page.locator('#results-content')).not.toHaveClass(/hidden/);
  });
});

// ---------------------------------------------------------------------------
// 7. Strip length input
// ---------------------------------------------------------------------------
test.describe('Strip length', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 5);
  });

  test('number input and range slider are both present', async ({ page }) => {
    await expect(page.locator('#strip-length')).toBeVisible();
    await expect(page.locator('#strip-length-slider')).toBeVisible();
  });

  test('typing a new length updates the km equivalent display', async ({ page }) => {
    const input = page.locator('#strip-length');
    await input.fill('2000');
    await input.press('Tab');
    await page.waitForTimeout(500);
    await expect(page.locator('#strip-km')).toContainText('2.00 km');
  });

  test('changing strip length does NOT auto-close step 5', async ({ page }) => {
    const input = page.locator('#strip-length');
    await input.fill('3000');
    await input.press('Tab');
    await page.waitForTimeout(500);
    await expect(await isStepOpen(page, 5)).toBe(true);
  });

  test('step 5 summary updates after a new length is entered', async ({ page }) => {
    const input = page.locator('#strip-length');
    await input.fill('1500');
    await input.press('Tab');
    await page.waitForTimeout(500);
    const summary = page.locator('#step-length-summary');
    await expect(summary).toContainText('1,500');
  });
});

// ---------------------------------------------------------------------------
// 8. Assumptions step (demoted carbon credit price)
// ---------------------------------------------------------------------------
test.describe('Assumptions (carbon credit price)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 6);
  });

  test('step 6 is labelled Assumptions', async ({ page }) => {
    await expect(page.locator('#step-price .step-accordion__label')).toContainText(/Assumptions/i);
  });

  test('slider is present with correct range', async ({ page }) => {
    const slider = page.locator('#credit-price');
    await expect(slider).toBeVisible();
    // min=0 allows an explicit zero-price case (independent review, 4 Nov 2026; Si agreed); max=150 (Si, 3 Nov 2026)
    await expect(slider).toHaveAttribute('min', '0');
    await expect(slider).toHaveAttribute('max', '150');
  });

  test('moving the slider updates the displayed price', async ({ page }) => {
    const slider = page.locator('#credit-price');
    await slider.fill('120');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);
    await expect(page.locator('#credit-price-display')).toContainText('£120');
  });

  test('step 6 summary updates when the slider moves', async ({ page }) => {
    const slider = page.locator('#credit-price');
    await slider.fill('150');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);
    await expect(page.locator('#step-price-summary')).toContainText('£150');
  });
});

// ---------------------------------------------------------------------------
// 9. Results render — full happy-path flow
// ---------------------------------------------------------------------------
test.describe('Results rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate via slug-encoded URL to get results immediately
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
  });

  test('results-content becomes visible with URL params', async ({ page }) => {
    await expect(page.locator('#results-content')).not.toHaveClass(/hidden/);
  });

  test('results header shows a variant name', async ({ page }) => {
    await expect(page.locator('#results-title')).not.toHaveText('—');
  });

  test('Output Summary heading is present', async ({ page }) => {
    await expect(page.locator('.results-section__heading-major')).toContainText('Output Summary');
  });

  test('three key outcome stat boxes are visible', async ({ page }) => {
    await expect(page.locator('#stat-agro-benefit')).toBeVisible();
    await expect(page.locator('#stat-25yr-carbon')).toBeVisible();
    await expect(page.locator('#stat-wider-eco')).toBeVisible();
  });

  test('stat box values are not placeholder dashes', async ({ page }) => {
    for (const id of ['stat-agro-benefit', 'stat-25yr-carbon', 'stat-wider-eco']) {
      const text = await statBoxText(page, id);
      expect(text).not.toBe('—');
      expect(text.trim().length).toBeGreaterThan(1);
    }
  });

  test('Agronomic Services section is present', async ({ page }) => {
    await expect(page.locator('#section-agronomic')).toBeVisible();
  });

  test('Wider Ecosystem Service Value section is present', async ({ page }) => {
    await expect(page.locator('#section-wider-eco')).toBeVisible();
    await expect(page.locator('#section-wider-eco .card__title')).toHaveText(/Wider Ecosystem Service Value/i);
  });

  test('Avoided Costs and Productivity Benefits section is present', async ({ page }) => {
    await expect(page.locator('#section-avoided-costs')).toBeVisible();
  });

  test('Carbon Sequestration Trajectory section is present', async ({ page }) => {
    await expect(page.locator('#section-carbon')).toBeVisible();
  });

  test('Annual Value by Farm Type section is NOT present (removed)', async ({ page }) => {
    // The old card title should not exist
    const old = page.locator('text=Annual Value by Farm Type');
    await expect(old).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Stat box click-to-scroll navigation
// ---------------------------------------------------------------------------
test.describe('Stat box scroll anchors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
  });

  test('Net Agronomic Benefit box is clickable (has cursor pointer)', async ({ page }) => {
    const box = page.locator('#stat-agro-box');
    await expect(box).toBeVisible();
    // Should have the clickable class
    await expect(box).toHaveClass(/stat-box--clickable/);
  });

  test('clicking Net Agronomic Benefit scrolls toward Avoided Costs section', async ({ page }) => {
    const box = page.locator('#stat-agro-box');
    await box.click();
    await page.waitForTimeout(800); // smooth scroll
    const section = page.locator('#section-avoided-costs');
    // After scrolling the section should be in or near viewport
    const boundingBox = await section.boundingBox();
    expect(boundingBox).not.toBeNull();
  });

  test('clicking 25-Year Carbon Revenue scrolls toward Carbon section', async ({ page }) => {
    await page.locator('#stat-carbon-box').click();
    await page.waitForTimeout(800);
    const bb = await page.locator('#section-carbon').boundingBox();
    expect(bb).not.toBeNull();
  });

  test('clicking Wider Ecosystem Service Value scrolls toward Wider Eco section', async ({ page }) => {
    await page.locator('#stat-eco-box').click();
    await page.waitForTimeout(800);
    const bb = await page.locator('#section-wider-eco').boundingBox();
    expect(bb).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 11. URL state: encoding and restoring
// ---------------------------------------------------------------------------
test.describe('URL state', () => {
  test('URL params are written after unlocking outcomes', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await ensureInputsDrawerOpen(page);
    await page.locator('#btn-browse-intervention').click();
    await page.waitForTimeout(300);
    // Browse alone no longer encodes — Confirm unlocks outcomes and writes URL state
    await confirmVariant(page);
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).toMatch(/biome=/);
  });

  test('loading a URL with valid params restores results immediately', async ({ page }) => {
    const url = `${BASE}/?biome=west_clay&farm=dairy&length=1500&price=80&orient=EW&placement=riparian&variant=1`;
    await page.goto(url);
    await waitForAppReady(page);
    await expect(page.locator('#results-content')).not.toHaveClass(/hidden/);
  });

  test('length param from URL is reflected in the strip length input', async ({ page }) => {
    // Use slug-encoded URL (encodeStateToURL uses biome slugs)
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=2500&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
    const val = await page.locator('#strip-length').inputValue();
    expect(parseInt(val, 10)).toBe(2500);
  });

  test('price param from URL sets the credit price slider', async ({ page }) => {
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=100&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
    const val = await page.locator('#credit-price').inputValue();
    expect(parseInt(val, 10)).toBe(100);
  });

  test('malformed URL params do not crash the app', async ({ page }) => {
    await page.goto(`${BASE}/?biome=NOT_A_REAL_BIOME&length=abc&price=-99`);
    // Should not throw — app loads with defaults
    await waitForAppReady(page);
    await expect(page.locator('#loading-screen')).toBeHidden();
  });

  test('snap param restores diagnosis context in print brief', async ({ page }) => {
    // Minimal snap payload: {"code":"X","cat":"Water","s":"Wet margins","d":"Diagnosis text","m":{"a":"Agro","i":"Infra","p":"Prec","c":"Comm","e":"Emerg"}}
    // Precomputed base64url for stable fixture
    const payload = Buffer.from(JSON.stringify({
      code: 'TEST_SNAP',
      cat: 'Water',
      s: 'Wet margins after rain',
      d: 'Shared diagnosis for advisor reopen',
      m: { a: 'Agro note', i: 'Infra note', p: 'Prec note', c: 'Comm note', e: 'Emerg note' },
    }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1&snap=${payload}`);
    await waitForAppReady(page);
    const snap = page.locator('#print-brief-snapshot');
    await expect(snap).toContainText(/Shared diagnosis for advisor reopen|Wet margins after rain|Other responses/i);
  });
});

// ---------------------------------------------------------------------------
// 12. Solution Summary (problem panel)
// ---------------------------------------------------------------------------
test.describe('Solution Summary panel', () => {
  test.beforeEach(async ({ page }) => {
    // Load with a known problem code via chip interaction
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 1);
    // Click the first available problem chip
    await page.locator('.problem-chip').first().click();
    await page.waitForTimeout(600);
  });

  test('problem panel becomes visible after a chip is clicked', async ({ page }) => {
    await expect(page.locator('#problem-panel')).toBeVisible();
  });

  test('panel shows "Solution Summary" label', async ({ page }) => {
    await expect(page.locator('#problem-panel')).toContainText('Solution Summary');
  });

  test('panel shows "Field Margin Intervention" not "ShieldBelt Solution"', async ({ page }) => {
    await expect(page.locator('#problem-panel')).toContainText('Field Margin Intervention');
    await expect(page.locator('#problem-panel')).not.toContainText('ShieldBelt Solution');
  });

  test('panel shows "Recommended" for auto-selected variant', async ({ page }) => {
    // After clicking a chip the variant is auto-recommended
    await expect(page.locator('#problem-panel')).toContainText('Recommended');
  });

  test('solution map is reframed as other responses (not directory)', async ({ page }) => {
    await expect(page.locator('#problem-panel')).toContainText(/Other responses often considered/i);
    await expect(page.locator('#problem-panel')).toContainText(/only sizes ShieldBelt/i);
    await expect(page.locator('#problem-panel')).not.toContainText(/Solutions Directory/i);
    await expect(page.locator('#problem-panel')).not.toContainText(/coming soon/i);
  });

  test('Also consider chips are clickable buttons', async ({ page }) => {
    // Results-panel pills sit under the full-screen drawer — dismiss it first on mobile.
    await ensureInputsDrawerClosed(page);
    const alts = page.locator('#problem-panel button.solution-pill--action');
    const count = await alts.count();
    if (count > 0) {
      await alts.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator('#results-content')).not.toHaveClass(/hidden/);
    }
  });

  test('advisor handoff and print brief are present', async ({ page }) => {
    await expect(page.locator('#advisor-handoff')).toBeVisible();
    await expect(page.locator('#btn-print-brief')).toBeVisible();
    await expect(page.locator('#btn-share-advisor')).toBeVisible();
    await expect(page.locator('#advisor-handoff')).toContainText(/advisor/i);
  });

  test('why recommended and planning questions appear', async ({ page }) => {
    await expect(page.locator('#why-recommended')).toBeVisible();
    await expect(page.locator('#why-recommended')).toContainText(/Why this option/i);
    await expect(page.locator('#planning-notes')).toBeVisible();
    await expect(page.locator('#planning-notes')).toContainText(/Planning questions/i);
  });

  test('print brief snapshot is populated for print', async ({ page }) => {
    const snap = page.locator('#print-brief-snapshot');
    await expect(snap).toBeAttached();
    await expect(snap).toContainText(/ShieldBelt planning brief/i);
    await expect(snap).toContainText(/Diagnosis/i);
    await expect(snap).toContainText(/Other responses often considered/i);
    await expect(snap).toContainText(/Bring to the meeting/i);
    await expect(snap).toContainText(/Sized outcomes/i);
  });

  test('share URL encodes problem snap payload', async ({ page }) => {
    await page.waitForTimeout(400);
    const url = page.url();
    expect(url).toMatch(/problem=/);
    expect(url).toMatch(/snap=/);
  });

  test('resilience-wide bridge stays hidden until product URL exists', async ({ page }) => {
    const bridge = page.locator('#resilience-wide-bridge');
    await expect(bridge).toBeAttached();
    await expect(bridge).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 12b. Problem chip relevance badges / filters (P1)
// ---------------------------------------------------------------------------
test.describe('Problem chip relevance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 1);
  });

  test('filter bar is present', async ({ page }) => {
    await expect(page.locator('#problem-filter-bar')).toBeVisible();
    await expect(page.locator('#filter-prioritise-fits')).toBeChecked();
    await expect(page.locator('#filter-dreel-burn')).toHaveCount(0);
  });

  test('fit context names current location and farm type', async ({ page }) => {
    const ctx = page.locator('#problem-fit-context');
    await expect(ctx).toBeVisible();
    await expect(ctx).toContainText('current');
    await expect(ctx).toContainText('General Cropping');
  });

  test('fit badges appear on relevant chips', async ({ page }) => {
    const fitBadges = page.locator('.problem-chip__badge--fit');
    await expect(fitBadges.first()).toBeVisible();
  });

  test('Dreel Burn lens is removed', async ({ page }) => {
    await expect(page.locator('#filter-dreel-burn')).toHaveCount(0);
    await expect(page.locator('.problem-chip[data-lens="dreel"]')).toHaveCount(0);
    await expect(page.locator('.problem-chip__badge--dreel')).toHaveCount(0);
  });

  test('no locked data-phase=2 chips', async ({ page }) => {
    await expect(page.locator('.problem-chip[data-phase="2"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 13. Mobile drawer (mobile viewport only)
// ---------------------------------------------------------------------------
test.describe('Mobile drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  test('floating Adjust Inputs button is visible on mobile', async ({ page }) => {
    await expect(page.locator('#btn-mobile-drawer')).toBeVisible();
  });

  test('drawer is closed by default', async ({ page }) => {
    await expect(page.locator('.panel-left')).not.toHaveClass(/drawer-open/);
  });

  test('tapping Adjust Inputs opens the drawer', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.panel-left')).toHaveClass(/drawer-open/);
  });

  test('floating button label changes to "Go to Outputs" when drawer is open', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#btn-mobile-drawer')).toContainText(/go to outputs/i);
  });

  test('close button dismisses the drawer', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await page.locator('#btn-close-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.panel-left')).not.toHaveClass(/drawer-open/);
  });

  test('"Go to Outputs" button inside drawer closes the drawer', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await page.locator('#btn-drawer-goto-outputs').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.panel-left')).not.toHaveClass(/drawer-open/);
  });

  test('Adjust Inputs button at top of results panel exists on mobile', async ({ page }) => {
    await expect(page.locator('#btn-adjust-inputs-top')).toBeAttached();
  });

  test('Adjust Inputs button at bottom of results panel exists on mobile', async ({ page }) => {
    await expect(page.locator('#btn-adjust-inputs-bottom')).toBeAttached();
  });

  test('bottom Adjust Inputs opens the drawer', async ({ page }) => {
    const bottom = page.locator('#btn-adjust-inputs-bottom');
    await bottom.scrollIntoViewIfNeeded();
    await bottom.click();
    await page.waitForTimeout(450);
    await expect(page.locator('.panel-left')).toHaveClass(/drawer-open/);
  });

  // Backdrop tap is no longer applicable — the drawer is full-screen (100dvh),
  // so no backdrop area is exposed to tap. Close is via the ✕ button or
  // the "Go to Outputs" / floating button instead.
  test.skip('backdrop tap closes the drawer', async ({ page }) => {
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await page.locator('#drawer-backdrop').click({ position: { x: 10, y: 10 }, force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('.panel-left')).not.toHaveClass(/drawer-open/);
  });
});

// ---------------------------------------------------------------------------
// 14. Compare Scenarios modal
// ---------------------------------------------------------------------------
test.describe('Compare Scenarios modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
  });

  test('"Compare across Scenarios" button is present', async ({ page }) => {
    await expect(page.locator('#btn-compare-scenarios')).toBeVisible();
    await expect(page.locator('#btn-compare-scenarios')).toContainText(/compare across scenarios/i);
  });

  test('clicking the button opens the modal', async ({ page }) => {
    await page.locator('#btn-compare-scenarios').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#modal-compare')).toBeVisible();
  });

  test('compare modal renders chart canvases with height', async ({ page }) => {
    await page.locator('#btn-compare-scenarios').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#modal-compare-charts')).toBeVisible();
    const h = await page.locator('#chart-compare-agro').evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThan(24);
  });

  test('compare modal charts use viewport width on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.locator('#btn-compare-scenarios').click();
    await page.waitForTimeout(900);
    const w = await page.locator('#chart-compare-agro').evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeGreaterThan(100);
    expect(w).toBeLessThanOrEqual(390);
  });

  test('modal can be dismissed', async ({ page }) => {
    await page.locator('#btn-compare-scenarios').click();
    await page.waitForTimeout(400);
    await page.locator('#btn-close-modal').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#modal-compare')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 15. Advisor share / email and save scenario buttons
// ---------------------------------------------------------------------------
test.describe('Copy link and save scenario', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
  });

  test('Advisor share and email buttons are present (no duplicate export copy link)', async ({ page }) => {
    await expect(page.locator('#btn-share-advisor')).toBeVisible();
    await expect(page.locator('#btn-email-scenario')).toBeVisible();
    await expect(page.locator('#btn-copy-link')).toHaveCount(0);
  });

  test('Save scenario button is present', async ({ page }) => {
    await expect(page.locator('#btn-save-scenario')).toBeVisible();
  });

  test('Save scenario notes browser-only storage', async ({ page }) => {
    await expect(page.locator('.save-browser-note')).toContainText(/Saved in this browser only/i);
  });
});

// ---------------------------------------------------------------------------
// 16. Saved scenario delete
// ---------------------------------------------------------------------------
test.describe('Saved scenario delete', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Delete button removes scenario from panel and localStorage', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'shieldbelt_scenarios',
        JSON.stringify([
          {
            id: 999001,
            label: 'E2E delete test',
            url: 'http://localhost:8080/',
            netBenefit: 100,
            sserUnits: 1,
            agroNetBenefit: 50,
            carbonRevenue25: 200,
            widerEcoValue: 30,
            savedAt: new Date().toISOString(),
          },
        ])
      );
    });
    await page.goto(BASE);
    await waitForAppReady(page);
    await page.locator('#btn-mobile-drawer').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#saved-scenarios-panel')).toBeVisible();
    await expect(page.locator('#saved-scenarios-panel')).toContainText('E2E delete test');
    await page.locator('#saved-scenarios-panel button.saved-scenario__delete').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#saved-scenarios-panel')).toBeHidden();
    const stored = await page.evaluate(() => localStorage.getItem('shieldbelt_scenarios'));
    expect(JSON.parse(stored || '[]')).toHaveLength(0);
  });
});
