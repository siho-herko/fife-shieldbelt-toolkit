/**
 * Shared helpers for the Fife Landscape Resilience Calculator E2E tests.
 *
 * Problem-first step map (P0):
 *   1 Biggest Problem · 2 Location · 3 Farm Type · 4 Variant · 5 Length · 6 Assumptions
 *
 * On Pixel-5 / ≤767px the left accordion lives in `.panel-left`, which is
 * translated off-canvas until `#btn-mobile-drawer` opens it. Helpers that
 * interact with accordion controls must open that drawer first.
 */

/** Wait for the loading screen to disappear and the app to be interactive. */
export async function waitForAppReady(page) {
  // 1. Wait for init() to hide the loading screen (dynamically created by showLoadingScreen())
  await page.waitForFunction(
    () => {
      const el = document.getElementById('loading-screen');
      // Not yet created means we're early; created and either hidden attr or display:none = done
      if (!el) return false; // created but not yet finished
      return el.hidden === true || el.style.display === 'none';
    },
    { timeout: 20_000, polling: 200 }
  );
  // 2. Confirm the results panel area has rendered
  await page.waitForSelector(
    '#results-empty, #results-content',
    { state: 'attached', timeout: 10_000 }
  );
}

/**
 * Open the mobile inputs drawer when mobile drawer chrome is present.
 * No-op on desktop. Idempotent — will not click if the drawer is already open
 * (the floating FAB toggles to "Go to Outputs" when open).
 *
 * Prefer the in-results Adjust Inputs buttons (open-only). On short viewports
 * such as Pixel 5, `#btn-adjust-inputs-bottom` sits above the FAB and
 * intercepts its taps (see `.mobile-results-nav--bottom` z-index 210).
 */
export async function ensureInputsDrawerOpen(page) {
  const fab = page.locator('#btn-mobile-drawer');
  // Desktop layout has no floating drawer trigger.
  if (!(await fab.isVisible())) return;

  const panel = page.locator('.panel-left');
  const alreadyOpen = await panel.evaluate((el) => el.classList.contains('drawer-open'));
  if (alreadyOpen) return;

  const bottom = page.locator('#btn-adjust-inputs-bottom');
  const top = page.locator('#btn-adjust-inputs-top');
  if (await bottom.isVisible()) {
    await bottom.scrollIntoViewIfNeeded();
    await bottom.click();
  } else if (await top.isVisible()) {
    await top.scrollIntoViewIfNeeded();
    await top.click();
  } else {
    await fab.click();
  }

  await page.waitForSelector('.panel-left.drawer-open', { timeout: 5_000 });
  await page.waitForTimeout(200);
}

/**
 * Close the mobile inputs drawer so results-panel controls are actionable.
 * No-op on desktop or when the drawer is already closed.
 */
export async function ensureInputsDrawerClosed(page) {
  const btn = page.locator('#btn-mobile-drawer');
  if (!(await btn.isVisible())) return;

  const panel = page.locator('.panel-left');
  const isOpen = await panel.evaluate((el) => el.classList.contains('drawer-open'));
  if (!isOpen) return;

  // Prefer the explicit close control; fall back to the floating "Go to Outputs" toggle.
  const closeBtn = page.locator('#btn-close-drawer');
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  } else {
    await btn.click();
  }
  await page.waitForFunction(
    () => !document.querySelector('.panel-left')?.classList.contains('drawer-open'),
    { timeout: 5_000 }
  );
  await page.waitForTimeout(200);
}

/** Open the accordion step with the given data-step number if it is closed. */
export async function openStep(page, stepNumber) {
  await ensureInputsDrawerOpen(page);
  const trigger = page.locator(`.step-accordion[data-step="${stepNumber}"] .step-accordion__trigger`);
  const expanded = await trigger.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await trigger.click();
    await page.waitForTimeout(200);
  }
}

/** Close the accordion step with the given data-step number if it is open. */
export async function closeStep(page, stepNumber) {
  await ensureInputsDrawerOpen(page);
  const trigger = page.locator(`.step-accordion[data-step="${stepNumber}"] .step-accordion__trigger`);
  const expanded = await trigger.getAttribute('aria-expanded');
  if (expanded === 'true') {
    await trigger.click();
    await page.waitForTimeout(200);
  }
}

/** Return whether an accordion step body is visible. */
export async function isStepOpen(page, stepNumber) {
  const body = page.locator(`.step-accordion[data-step="${stepNumber}"] .step-accordion__body`);
  return body.isVisible();
}

/** Select a biome by its radio value and wait for variants to load. Location is step 2. */
export async function selectBiome(page, biomeValue) {
  await openStep(page, 2);
  // The radio input itself is visually hidden (custom styled card) — click the wrapping label
  const label = page.locator(`.biome-card:has(input[name="biome"][value="${biomeValue}"])`);
  await label.waitFor({ state: 'visible', timeout: 5_000 });
  await label.click();
  // Biome change is async (loads data) and auto-advances — give it extra time
  await page.waitForTimeout(1200);
}

/** Click a problem chip by problem code. Biggest Problem is step 1. */
export async function clickProblemChip(page, problemCode) {
  await openStep(page, 1);
  await page.locator(`.problem-chip[data-code="${problemCode}"]`).click();
  await page.waitForTimeout(400);
}

/** Press the Confirm Selection button in the variant step. */
export async function confirmVariant(page) {
  await ensureInputsDrawerOpen(page);
  await page.locator('#btn-confirm-variant').click();
  await page.waitForTimeout(300);
}

/** Read the text of a stat box by its value element id. */
export async function statBoxText(page, id) {
  return page.locator(`#${id}`).innerText();
}
