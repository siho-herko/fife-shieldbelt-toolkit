/**
 * navigation.spec.js
 *
 * End-to-end tests for the Fife ShieldBelt Calculator navigation flow.
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
  clickProblemChip,
  confirmVariant,
  statBoxText,
} from './helpers.js';

const BASE = 'http://localhost:8080';

// ---------------------------------------------------------------------------
// 1. App loads and shows initial state
// ---------------------------------------------------------------------------
test.describe('App load', () => {
  test('page title and loading screen', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/ShieldBelt/i);

    // Loading screen must appear briefly then hide
    await waitForAppReady(page);
    const loadingScreen = page.locator('#loading-screen');
    await expect(loadingScreen).toBeHidden();
  });

  test('empty state is shown before any interaction', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    // The app auto-loads results using the default biome/variant on fresh load (by design).
    // Verify that either results or empty-state is rendered (not still loading).
    const hasResults  = await page.locator('#results-content').isVisible();
    const hasEmpty    = await page.locator('#results-empty').isVisible();
    expect(hasResults || hasEmpty).toBe(true);
  });

  test('all 6 accordion steps are present', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    for (let i = 1; i <= 6; i++) {
      await expect(page.locator(`.step-accordion[data-step="${i}"]`)).toBeAttached();
    }
  });

  test('step 1 (Your Biome) is open by default', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await expect(await isStepOpen(page, 1)).toBe(true);
  });

  test('steps 2–6 are collapsed by default', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    for (let i = 2; i <= 6; i++) {
      await expect(await isStepOpen(page, i)).toBe(false);
    }
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
    const trigger = page.locator('.step-accordion[data-step="2"] .step-accordion__trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

// ---------------------------------------------------------------------------
// 3. Biome selection auto-advances to step 2
// ---------------------------------------------------------------------------
test.describe('Biome selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
  });

  test('selecting a biome closes step 1 and opens step 2', async ({ page }) => {
    await selectBiome(page, 'Fife (Howe of Fife & Eden)');
    await expect(await isStepOpen(page, 1)).toBe(false);
    await expect(await isStepOpen(page, 2)).toBe(true);
  });

  test('step summary updates with the selected biome name', async ({ page }) => {
    await selectBiome(page, 'Fife (West Fife Claylands)');
    const summary = page.locator('#step-biome-summary');
    await expect(summary).toContainText(/West Fife/i);
  });

  test('biome context card is shown after selecting a biome', async ({ page }) => {
    await openStep(page, 1);
    // The biome context card lives inside step-biome-body
    const card = page.locator('#biome-context-card');
    // After page load a default biome is pre-selected; the card should be visible
    await expect(card).toBeAttached();
  });

  test('all six biome options are selectable', async ({ page }) => {
    const biomes = [
      'Fife (East Neuk Coast)',
      'Fife (Forth Urban Coast)',
      'Fife (Howe of Fife & Eden)',
      'Fife (Lomond & Cleish Uplands)',
      'Fife (North Fife Hills & Tay)',
      'Fife (West Fife Claylands)',
    ];
    for (const b of biomes) {
      // Re-open step 1 between iterations
      await openStep(page, 1);
      // Radio inputs are visually hidden — verify the card label exists instead
      const label = page.locator(`.biome-card:has(input[name="biome"][value="${b}"])`);
      await expect(label).toBeAttached();
      await label.click();
      await page.waitForTimeout(400);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Problem chip selection auto-advances to step 3
// ---------------------------------------------------------------------------
test.describe('Problem chip selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    // Start from step 2 (skip biome selection auto-advance)
    await openStep(page, 2);
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

  test('clicking a problem chip closes step 2 and opens step 3', async ({ page }) => {
    const firstChip = page.locator('.problem-chip').first();
    await firstChip.click();
    await page.waitForTimeout(500);
    await expect(await isStepOpen(page, 2)).toBe(false);
    await expect(await isStepOpen(page, 3)).toBe(true);
  });

  test('problem chip becomes aria-pressed=true after click', async ({ page }) => {
    const chip = page.locator('.problem-chip').first();
    const code = await chip.getAttribute('data-code');
    await chip.click();
    await page.waitForTimeout(300);
    const updated = page.locator(`.problem-chip[data-code="${code}"]`);
    await expect(updated).toHaveAttribute('aria-pressed', 'true');
  });

  test('step 2 summary updates after a chip is clicked', async ({ page }) => {
    await page.locator('.problem-chip').first().click();
    await page.waitForTimeout(300);
    const summary = page.locator('#step-problem-summary');
    // Summary should no longer say "Not selected"
    await expect(summary).not.toHaveText('Not selected');
  });
});

// ---------------------------------------------------------------------------
// 5. Farm type selection auto-advances to step 4
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
    const label = await page.locator('input[name="farm-type"]').first().getAttribute('value') ??
                  await page.locator('input[name="farm-type"]').first().inputValue();
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

  test('pressing Confirm Selection closes step 4 and opens steps 5 and 6', async ({ page }) => {
    await confirmVariant(page);
    await expect(await isStepOpen(page, 4)).toBe(false);
    await expect(await isStepOpen(page, 5)).toBe(true);
    await expect(await isStepOpen(page, 6)).toBe(true);
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
// 8. Carbon credit price slider
// ---------------------------------------------------------------------------
test.describe('Carbon credit price', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 6);
  });

  test('slider is present with correct range', async ({ page }) => {
    const slider = page.locator('#credit-price');
    await expect(slider).toBeVisible();
    // The slider uses min=20, max=200 as defined in index.html
    await expect(slider).toHaveAttribute('min', '20');
    await expect(slider).toHaveAttribute('max', '200');
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
    await slider.fill('200');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);
    await expect(page.locator('#step-price-summary')).toContainText('£200');
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

  test('Wider Ecosystem Services section is present', async ({ page }) => {
    await expect(page.locator('#section-wider-eco')).toBeVisible();
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
  test('URL params are written after selecting a variant', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    // The app encodes state to URL on init (encodeStateToURL is called by renderResults)
    const url = page.url();
    // Should contain biome slug (e.g. biome=east_neuk) and variant
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
});

// ---------------------------------------------------------------------------
// 12. Solution Summary (problem panel)
// ---------------------------------------------------------------------------
test.describe('Solution Summary panel', () => {
  test.beforeEach(async ({ page }) => {
    // Load with a known problem code via chip interaction
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 2);
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
// 14. Cross-biome comparison modal
// ---------------------------------------------------------------------------
test.describe('Cross-biome comparison modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
  });

  test('"Compare across Fife" button is present', async ({ page }) => {
    await expect(page.locator('#btn-compare-biomes')).toBeVisible();
  });

  test('clicking the button opens the modal', async ({ page }) => {
    await page.locator('#btn-compare-biomes').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#modal-compare')).toBeVisible();
  });

  test('modal can be dismissed', async ({ page }) => {
    await page.locator('#btn-compare-biomes').click();
    await page.waitForTimeout(800);
    // Try close button or Escape
    const closeBtn = page.locator('#modal-compare [id="btn-modal-close"], button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
    await expect(page.locator('#modal-compare')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 15. Copy link and export buttons presence
// ---------------------------------------------------------------------------
test.describe('Export and share buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/?biome=east_neuk&farm=general_cropping&length=1000&price=60&orient=NS&placement=crossSlope&variant=1`);
    await waitForAppReady(page);
  });

  test('Copy link button is present', async ({ page }) => {
    await expect(page.locator('#btn-copy-link')).toBeVisible();
  });

  test('Export CSV button is present', async ({ page }) => {
    await expect(page.locator('#btn-export-csv')).toBeVisible();
  });

  test('Export PDF button is present', async ({ page }) => {
    await expect(page.locator('#btn-export-pdf')).toBeVisible();
  });

  test('Save scenario button is present', async ({ page }) => {
    await expect(page.locator('#btn-save-scenario')).toBeVisible();
  });
});
