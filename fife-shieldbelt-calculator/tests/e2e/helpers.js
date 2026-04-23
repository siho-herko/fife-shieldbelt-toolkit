/**
 * Shared helpers for the Fife ShieldBelt Calculator E2E tests.
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

/** Open the accordion step with the given data-step number if it is closed. */
export async function openStep(page, stepNumber) {
  const trigger = page.locator(`.step-accordion[data-step="${stepNumber}"] .step-accordion__trigger`);
  const expanded = await trigger.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await trigger.click();
    await page.waitForTimeout(200);
  }
}

/** Close the accordion step with the given data-step number if it is open. */
export async function closeStep(page, stepNumber) {
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

/** Select a biome by its radio value and wait for variants to load. */
export async function selectBiome(page, biomeValue) {
  await openStep(page, 1);
  // The radio input itself is visually hidden (custom styled card) — click the wrapping label
  const label = page.locator(`.biome-card:has(input[name="biome"][value="${biomeValue}"])`);
  await label.waitFor({ state: 'visible', timeout: 5_000 });
  await label.click();
  // Biome change is async (loads data) and auto-advances — give it extra time
  await page.waitForTimeout(1200);
}

/** Click a problem chip by problem code. */
export async function clickProblemChip(page, problemCode) {
  await openStep(page, 3);
  await page.locator(`.problem-chip[data-code="${problemCode}"]`).click();
  await page.waitForTimeout(400);
}

/** Press the Confirm Selection button in the variant step. */
export async function confirmVariant(page) {
  await page.locator('#btn-confirm-variant').click();
  await page.waitForTimeout(300);
}

/** Read the text of a stat box by its value element id. */
export async function statBoxText(page, id) {
  return page.locator(`#${id}`).innerText();
}
