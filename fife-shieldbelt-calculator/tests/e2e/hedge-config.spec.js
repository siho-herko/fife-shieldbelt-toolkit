// @ts-check
/**
 * v12 hedge configurator (4 Nov 2026): presets HV1–HV8 plus toggles for form, species, trees, strip and position.
 */
import { test, expect } from '@playwright/test';
import { waitForAppReady, openStep } from './helpers.js';

const BASE = 'http://localhost:8080';
const title = page => page.locator('#results-title');
const btn = (page, key, value) => page.locator(`#hedge-config [data-hc="${key}"][data-value="${value}"]`);

test.describe('Hedge configurator (v12)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop layout');

  test('HV2 Hedge and margin is the default option', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await expect(title(page)).toHaveText('HV2. Hedge and margin');
    await expect(page.locator('#hedge-config')).not.toHaveClass(/hidden/);
    await expect(page).toHaveURL(/variant=HV2/);
  });

  test('adding trees to HV2 switches to the HV4 preset', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 4);
    await btn(page, 'trees', 'standards').click();
    await expect(title(page)).toHaveText('HV4. Hedge with trees');
    await expect(page.locator('#variant-select')).toHaveValue(/hv4_hedge_with_trees/);
  });

  test('native mix gives a custom hedge with its trade-offs and a shareable link', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 4);
    await btn(page, 'species', 'native').click();
    await expect(title(page)).toContainText('Custom hedge');
    await expect(page.locator('#hedge-config-notes')).toContainText('three native flowering species');
    await expect(page).toHaveURL(/hedge=double-native-none-6-boundary/);
    const url = page.url();
    await page.goto(url);
    await waitForAppReady(page);
    await expect(title(page)).toContainText('Custom hedge');
    await expect(page.locator('#hedge-config-origin')).toHaveText('Customised from HV2');
  });

  test('beside a watercourse: double row only, placement set to riparian', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppReady(page);
    await openStep(page, 4);
    await btn(page, 'position', 'watercourse').click();
    await expect(btn(page, 'form', 'triple')).toBeDisabled();
    await expect(btn(page, 'form', 'productive')).toBeDisabled();
    await expect(page).toHaveURL(/placement=riparian/);
  });

  test('strip width changes income forgone; too-narrow strips are disabled', async ({ page }) => {
    await page.goto(`${BASE}/?variant=HV2&farm=general_cropping&length=1000`);
    await waitForAppReady(page);
    await openStep(page, 4);
    await expect(page.locator('#stat-agro-benefit')).toHaveText('−£420/yr');
    await btn(page, 'stripM', '10').click();
    await expect(title(page)).toHaveText('HV5. Hedge and wide margin');
    await expect(page.locator('#stat-agro-benefit')).toHaveText('−£690/yr');
    await btn(page, 'form', 'triple').click();
    await expect(btn(page, 'stripM', '3')).toBeDisabled();
  });

  test('legacy links to the v11 hedges open HV2 and HV3', async ({ page }) => {
    await page.goto(`${BASE}/?variant=3`);
    await waitForAppReady(page);
    await expect(title(page)).toHaveText('HV3. Wide wildlife hedge');
  });

  test('non-hedge options hide the configurator', async ({ page }) => {
    await page.goto(`${BASE}/?variant=14`);
    await waitForAppReady(page);
    await expect(page.locator('#hedge-config')).toHaveClass(/hidden/);
  });

  test('funding stack: shown for hedges, responds to grants and carbon route, encoded in the URL', async ({ page }) => {
    await page.goto(`${BASE}/?variant=HV2`);
    await waitForAppReady(page);
    const stack = page.locator('#section-stack');
    await expect(stack).not.toHaveClass(/hidden/);
    await expect(page.locator('#stack-table')).toContainText('AECS annual payments');
    await expect(page.locator('#stack-tests')).toContainText('not an Option B pass');
    await expect(page.locator('#stack-tests')).toContainText('§4.2.1');
    await openStep(page, 6);
    await page.locator('[data-grants="none"]').click();
    await expect(page.locator('#stack-table')).toContainText('AECS capital (conditional)');
    await expect(page.locator('#stack-tests')).toContainText('Switching grants off does not settle either clause');
    await page.locator('[data-carbon-route="contribution"]').click();
    await expect(page.locator('#stack-tests')).toContainText('inventory limitation');
    await expect(page).toHaveURL(/grants=none/);
    await expect(page).toHaveURL(/carbon=contribution/);
    await page.goto(`${BASE}/?variant=14`);
    await waitForAppReady(page);
    await expect(stack).toHaveClass(/hidden/);
  });

  test('changing location keeps the hedge customisation', async ({ page }) => {
    await page.goto(`${BASE}/?variant=HV2&hedge=triple-speciesRich-standards-8-contour`);
    await waitForAppReady(page);
    await openStep(page, 1);
    await page.locator('.biome-card:has(input[name="biome"][value="Fife (Howe of Fife & Eden)"])').click();
    await expect(page.locator('#results-meta')).toContainText('Howe of Fife');
    await expect(title(page)).toContainText('Custom hedge (triple row, species-rich, with trees, in-field contour)');
  });
});
